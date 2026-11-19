param([ValidateRange(1,65535)][int]$Port = 4196, [switch]$NoBrowser, [switch]$NoLocalAI, [ValidateRange(0,128)][int]$GpuLayers=24)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $projectRoot
$node = Join-Path $projectRoot 'runtime/node.exe'
if (!(Test-Path -LiteralPath $node)) { $node = (Get-Command node -ErrorAction Stop).Source }
$url = "http://127.0.0.1:$Port"
try { $previous = Invoke-RestMethod "$url/api/health" -TimeoutSec 2 } catch { $previous = $null }
if ($previous -and $previous.application -eq 'DREAMHOME V2') {
    if (!$NoBrowser) { Start-Process $url }
    Write-Host "DREAMHOME V2 is already running at $url"
    return
}
if (!(Test-Path -LiteralPath 'dist/index.html')) { throw 'Production build missing: run npm ci and npm run build.' }
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
try { $listener.Start() } finally { $listener.Stop() }
$modelRoot = Join-Path $projectRoot 'data/local-ai'
$engine = Join-Path $modelRoot 'runtime/llama-server.exe'
$weights = Join-Path $modelRoot 'Qwen3VL-4B-Instruct-Q4_K_M.gguf'
$projector = Join-Path $modelRoot 'mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf'
$cloudConfigured = $false
if (Test-Path -LiteralPath '.env') {
    $line = Select-String -LiteralPath '.env' -Pattern '^\s*LLM_API_KEY\s*=' | Select-Object -First 1
    if ($line) { $cloudConfigured = ![string]::IsNullOrWhiteSpace(($line.Line -split '=',2)[1].Trim().Trim([char]34,[char]39)) }
}
$inference = $null
try {
    if (!$NoLocalAI -and !$env:LLM_API_KEY -and !$cloudConfigured -and (Test-Path -LiteralPath $engine) -and (Test-Path -LiteralPath $weights) -and (Test-Path -LiteralPath $projector)) {
        $llmSocket = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
        $llmSocket.Start()
        $inferencePort = $llmSocket.LocalEndpoint.Port
        $llmSocket.Stop()
        $random = [byte[]]::new(32)
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($random) } finally { $rng.Dispose() }
        $env:LLAMA_API_KEY = [Convert]::ToBase64String($random)
        $argsLLM = @('-m', ('"' + $weights + '"'), '--mmproj', ('"' + $projector + '"'), '--alias', 'dreamhome-qwen3-vl', '--host', '127.0.0.1', '--port', $inferencePort, '-c', '8192', '-ngl', [string]$GpuLayers, '--no-mmproj-offload', '-t', '6', '--parallel', '1', '--jinja')
        $inference = Start-Process -FilePath $engine -ArgumentList $argsLLM -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $modelRoot ('inference-' + $Port + '.log')) -RedirectStandardOutput (Join-Path $modelRoot ('inference-' + $Port + '.stdout.log'))
        $inferenceReady = $false
        for ($i=0; $i -lt 120 -and !$inference.HasExited; $i++) {
            try { $info = Invoke-RestMethod "http://127.0.0.1:$inferencePort/health" -TimeoutSec 2; if ($info.status -eq 'ok') { $inferenceReady=$true; break } } catch {}
            Start-Sleep -Milliseconds 500
        }
        if ($inferenceReady) {
            $env:LLM_API_KEY = $env:LLAMA_API_KEY
            $env:LLM_BASE_URL = "http://127.0.0.1:$inferencePort/v1"
            $env:LLM_MODEL = 'dreamhome-qwen3-vl'
            Write-Host 'Local Qwen vision-language inference is ready.'
        } else { Write-Warning 'Local inference was unavailable. The editor and API settings remain available.' }
        Remove-Item Env:LLAMA_API_KEY
    }
    $env:PORT = [string]$Port
    Write-Host "DREAMHOME V2  $url"
    if (!$NoBrowser) {
        $job = Start-Job -ArgumentList $url -ScriptBlock { param($address)
            for ($i=0; $i -lt 45; $i++) {
                try { if ((Invoke-RestMethod "$address/api/health" -TimeoutSec 2).application -eq 'DREAMHOME V2') { Start-Process $address; break } } catch {}
                Start-Sleep -Milliseconds 300
            }
        }
    }
    & $node 'server/index.mjs'
    if ($LASTEXITCODE -ne 0) { throw "DREAMHOME exited with code $LASTEXITCODE" }
} finally {
    if ($inference -and !$inference.HasExited) { Stop-Process -Id $inference.Id }
    if ($job) { Remove-Job -Id $job.Id -Force -ErrorAction SilentlyContinue }
}
