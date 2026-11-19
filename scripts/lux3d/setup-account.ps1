Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envPath = Join-Path $projectRoot '.env'
$statusPath = Join-Path $projectRoot 'data\lux3d-account-status.json'

$form = New-Object System.Windows.Forms.Form
$form.Text = 'DREAMHOME · Aholo 账户接入'
$form.Size = New-Object System.Drawing.Size(560, 330)
$form.StartPosition = 'CenterScreen'
$form.Topmost = $true
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false

$title = New-Object System.Windows.Forms.Label
$title.Text = '输入 Aholo API Key（中国区）'
$title.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 14, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(24, 20)
$title.Size = New-Object System.Drawing.Size(500, 32)
$form.Controls.Add($title)

$description = New-Object System.Windows.Forms.Label
$description.Text = "密钥仅保存到本机服务端 .env，不会显示或上传给 Qoder。`n保存后只读取任务历史验证接入，不创建生成任务、不扣费。"
$description.Location = New-Object System.Drawing.Point(26, 62)
$description.Size = New-Object System.Drawing.Size(500, 52)
$form.Controls.Add($description)

$keyLabel = New-Object System.Windows.Forms.Label
$keyLabel.Text = 'API Key'
$keyLabel.Location = New-Object System.Drawing.Point(26, 132)
$keyLabel.Size = New-Object System.Drawing.Size(80, 24)
$form.Controls.Add($keyLabel)

$keyInput = New-Object System.Windows.Forms.TextBox
$keyInput.Location = New-Object System.Drawing.Point(108, 128)
$keyInput.Size = New-Object System.Drawing.Size(408, 28)
$keyInput.UseSystemPasswordChar = $true
$form.Controls.Add($keyInput)

$regionLabel = New-Object System.Windows.Forms.Label
$regionLabel.Text = '区域：cn（https://api.aholo.cn）'
$regionLabel.Location = New-Object System.Drawing.Point(26, 172)
$regionLabel.Size = New-Object System.Drawing.Size(480, 24)
$form.Controls.Add($regionLabel)

$saveButton = New-Object System.Windows.Forms.Button
$saveButton.Text = '保存并只读验证'
$saveButton.Location = New-Object System.Drawing.Point(108, 220)
$saveButton.Size = New-Object System.Drawing.Size(180, 38)
$form.Controls.Add($saveButton)

$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Text = '取消'
$cancelButton.Location = New-Object System.Drawing.Point(306, 220)
$cancelButton.Size = New-Object System.Drawing.Size(100, 38)
$cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancelButton)
$form.CancelButton = $cancelButton

$saveButton.Add_Click({
    $apiKey = $keyInput.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        [System.Windows.Forms.MessageBox]::Show('请输入 API Key。', '缺少 Key') | Out-Null
        return
    }

    try {
        $existing = @()
        if (Test-Path $envPath) {
            $existing = Get-Content $envPath | Where-Object {
                $_ -notmatch '^\s*AHOLO_API_KEY\s*=' -and
                $_ -notmatch '^\s*AHOLO_REGION\s*=' -and
                $_ -notmatch '^\s*LUX3D_ALLOW_PAID_GENERATION\s*='
            }
        }
        $lines = @($existing)
        $lines += "AHOLO_API_KEY=$apiKey"
        $lines += 'AHOLO_REGION=cn'
        $lines += 'LUX3D_ALLOW_PAID_GENERATION=false'
        [System.IO.File]::WriteAllLines($envPath, $lines, [System.Text.UTF8Encoding]::new($false))

        $safeOutput = ''
        $exitCode = 1
        Push-Location $projectRoot
        try {
            $rawOutput = & node scripts/lux3d/check-account.mjs 2>&1 | Out-String
            $exitCode = $LASTEXITCODE
            $safeOutput = $rawOutput.Replace($apiKey, '[已隐藏]').Trim()
        } finally {
            Pop-Location
        }
        $apiKey = $null
        $keyInput.Clear()

        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $statusPath) | Out-Null
        $authenticated = $exitCode -eq 0
        $message = $safeOutput
        if ($authenticated) { $message = '只读鉴权成功' }
        $status = @{
            authenticated = $authenticated
            region = 'cn'
            checkedAt = (Get-Date).ToString('o')
            taskCreated = $false
            message = $message
        }
        [System.IO.File]::WriteAllText($statusPath, ($status | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))

        if ($authenticated) {
            [System.Windows.Forms.MessageBox]::Show('只读鉴权成功！未创建生成任务、未产生费用。', 'Aholo 接入成功') | Out-Null
            $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
            $form.Close()
        } else {
            [System.Windows.Forms.MessageBox]::Show("配置已保存，但只读鉴权失败：`n$safeOutput", '请检查 Key 或网络') | Out-Null
        }
    } catch {
        $message = $_.Exception.Message
        if ($apiKey) { $message = $message.Replace($apiKey, '[已隐藏]') }
        [System.Windows.Forms.MessageBox]::Show("保存或验证失败：`n$message", '接入失败') | Out-Null
    }
})

$form.Add_Shown({ $keyInput.Focus() })
[void]$form.ShowDialog()
