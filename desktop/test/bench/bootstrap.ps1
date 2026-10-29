$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$desktopRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$vendorRoot = Join-Path $desktopRoot 'vendor'
if ((Test-Path -LiteralPath "$vendorRoot/kimo/bin/kimo-mcp.exe") -and (Test-Path -LiteralPath "$vendorRoot/ffmpeg/ffmpeg.exe") -and (Test-Path -LiteralPath "$vendorRoot/whisper/whisper-cli.exe") -and (Test-Path -LiteralPath "$vendorRoot/models/ggml-small-q5_1.bin")) { exit 0 }
$stageRoot = Join-Path $env:RUNNER_TEMP 'kimo-bench-vendor-download'
New-Item -ItemType Directory -Force $stageRoot, "$vendorRoot/kimo", "$vendorRoot/ffmpeg", "$vendorRoot/whisper", "$vendorRoot/models" | Out-Null
Invoke-WebRequest 'https://github.com/naman-sharma12345/kimo/releases/download/v6.0.0/kimo-6.0.0-windows-x86_64.zip' -OutFile "$stageRoot/kimo.zip"
Expand-Archive -LiteralPath "$stageRoot/kimo.zip" -DestinationPath "$stageRoot/kimo" -Force
$engineBin = Get-ChildItem -LiteralPath "$stageRoot/kimo" -Filter kimo-mcp.exe -Recurse | Select-Object -First 1
if (-not $engineBin) { throw 'Downloaded engine executable missing' }
$engineRoot = Split-Path $engineBin.DirectoryName -Parent
if (-not $engineRoot.StartsWith([System.IO.Path]::GetFullPath($stageRoot))) { throw 'Engine source outside staging directory' }
New-Item -ItemType Directory -Force "$vendorRoot/kimo/bin", "$vendorRoot/kimo/fonts" | Out-Null
Get-ChildItem -LiteralPath $engineBin.DirectoryName | Copy-Item -Destination "$vendorRoot/kimo/bin" -Recurse -Force
if (-not (Test-Path -LiteralPath "$engineRoot/fonts")) { throw 'Bundled engine fonts missing' }
Get-ChildItem -LiteralPath "$engineRoot/fonts" | Copy-Item -Destination "$vendorRoot/kimo/fonts" -Recurse -Force
Invoke-WebRequest 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip' -OutFile "$stageRoot/ffmpeg.zip"
Expand-Archive -LiteralPath "$stageRoot/ffmpeg.zip" -DestinationPath "$stageRoot/ffmpeg" -Force
$ffmpegBin = Get-ChildItem -LiteralPath "$stageRoot/ffmpeg" -Filter ffmpeg.exe -Recurse | Select-Object -First 1
if (-not $ffmpegBin) { throw 'Downloaded FFmpeg executable missing' }
Get-ChildItem -LiteralPath $ffmpegBin.DirectoryName -File | Copy-Item -Destination "$vendorRoot/ffmpeg" -Force
Invoke-WebRequest 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip' -OutFile "$stageRoot/whisper.zip"
Expand-Archive -LiteralPath "$stageRoot/whisper.zip" -DestinationPath "$stageRoot/whisper" -Force
$whisperBin = Get-ChildItem -LiteralPath "$stageRoot/whisper" -Filter whisper-cli.exe -Recurse | Select-Object -First 1
if (-not $whisperBin) { throw 'Downloaded Whisper executable missing' }
Get-ChildItem -LiteralPath $whisperBin.DirectoryName | Copy-Item -Destination "$vendorRoot/whisper" -Recurse -Force
Invoke-WebRequest 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin' -OutFile "$vendorRoot/models/ggml-small-q5_1.bin"
& "$vendorRoot/ffmpeg/ffmpeg.exe" -version | Select-Object -First 1
