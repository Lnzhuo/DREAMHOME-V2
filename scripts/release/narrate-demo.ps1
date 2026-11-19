param([Parameter(Mandatory=$true)][string]$JsonFile,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$rows=Get-Content -Encoding UTF8 -Raw -LiteralPath $JsonFile | ConvertFrom-Json
$voice=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $mandarin=$voice.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'zh-CN' } | Select-Object -First 1
    if (!$mandarin) { throw 'No installed Mandarin voice.' }
    $voice.SelectVoice($mandarin.VoiceInfo.Name); $voice.Rate=2
    for ($i=0; $i -lt $rows.Count; $i++) {
        $voice.SetOutputToWaveFile((Join-Path $Destination ("audio-{0}.wav" -f $i)))
        $voice.Speak($rows[$i].narration)
        $voice.SetOutputToNull()
    }
} finally { $voice.Dispose() }
