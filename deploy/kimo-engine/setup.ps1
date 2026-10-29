# kimo engine setup for Windows: runs the real kimo v6 engine on this PC and connects it
# to app.getkimo.tech through the free Cloudflare Tunnel "kimo-engine" (engine.getkimo.tech).
# Works only while this PC is on and the engine is running. No admin rights needed.
#
#   $env:KIMO_TUNNEL_TOKEN='...'; $env:KIMO_ENGINE_TOKEN='...'; irm https://raw.githubusercontent.com/naman-sharma12345/kimoapp/main/deploy/kimo-engine/setup.ps1 | iex
#
# Docker Desktop running -> engine in a container (prebuilt kimo release). Otherwise the
# native kimo Windows release + Node + FFmpeg + whisper. cloudflared runs natively.
# Re-run any time; afterwards start it again with: %LOCALAPPDATA%\kimo-engine\start.ps1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Tunnel = $env:KIMO_TUNNEL_TOKEN; $Token = $env:KIMO_ENGINE_TOKEN
if (-not $Tunnel -or -not $Token -or $Token.Length -lt 32) { throw 'Set KIMO_TUNNEL_TOKEN and KIMO_ENGINE_TOKEN first (see the README).' }
$Raw = 'https://raw.githubusercontent.com/naman-sharma12345/kimoapp/main/deploy/kimo-engine'
$Kimo = '6.0.0'; $Whisper = 'b5454'
$Dir = Join-Path $env:LOCALAPPDATA 'kimo-engine'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
Set-Location $Dir
function Get-File($url, $out) { if (-not (Test-Path $out)) { Write-Host "downloading $(Split-Path $out -Leaf)"; Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing } }

# Secrets stay on this PC only (user-only file).
"KIMO_TUNNEL_TOKEN=$Tunnel`nKIMO_ENGINE_TOKEN=$Token" | Set-Content -Path (Join-Path $Dir 'engine.env') -Encoding ascii
icacls (Join-Path $Dir 'engine.env') /inheritance:r /grant:r "$($env:USERNAME):F" | Out-Null

# cloudflared (native, both modes)
Get-File 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' (Join-Path $Dir 'cloudflared.exe')

$useDocker = $false
if (Get-Command docker -ErrorAction SilentlyContinue) { docker info *> $null; if ($LASTEXITCODE -eq 0) { $useDocker = $true } }

if ($useDocker) {
  Write-Host 'Docker Desktop found: building the kimo engine image (prebuilt kimo release)'
  Get-File "$Raw/Dockerfile.release" (Join-Path $Dir 'Dockerfile')
  Invoke-WebRequest -Uri "$Raw/server.mjs" -OutFile (Join-Path $Dir 'server.mjs') -UseBasicParsing
  docker build -t kimo-engine $Dir
  if ($LASTEXITCODE -ne 0) { throw 'docker build failed' }
  $start = @'
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envs = Get-Content (Join-Path $Dir 'engine.env') | ConvertFrom-StringData
docker rm -f kimo-engine *> $null
docker run -d --name kimo-engine --restart unless-stopped -p 127.0.0.1:7860:7860 -e ENGINE_TOKEN=$($envs.KIMO_ENGINE_TOKEN) kimo-engine | Out-Null
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process -WindowStyle Hidden -FilePath (Join-Path $Dir 'cloudflared.exe') -ArgumentList @('tunnel','--no-autoupdate','run','--token',$envs.KIMO_TUNNEL_TOKEN) -RedirectStandardError (Join-Path $Dir 'tunnel.log')
Write-Host 'kimo engine running (Docker) and connected: https://engine.getkimo.tech/health'
'@
} else {
  Write-Host 'No running Docker: installing the native kimo Windows release'
  Get-File "https://github.com/naman-sharma12345/kimo/releases/download/v$Kimo/kimo-$Kimo-windows-x86_64.zip" (Join-Path $Dir 'kimo.zip')
  if (-not (Test-Path (Join-Path $Dir 'kimo'))) { Expand-Archive (Join-Path $Dir 'kimo.zip') -DestinationPath (Join-Path $Dir 'kimo-unzip') -Force; Move-Item (Get-ChildItem (Join-Path $Dir 'kimo-unzip') -Directory | Select-Object -First 1).FullName (Join-Path $Dir 'kimo') }
  # Node (portable, no admin) unless already installed
  if (-not (Get-Command node -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $Dir 'node\node.exe'))) {
    Get-File 'https://nodejs.org/dist/v22.11.0/node-v22.11.0-win-x64.zip' (Join-Path $Dir 'node.zip')
    Expand-Archive (Join-Path $Dir 'node.zip') -DestinationPath $Dir -Force
    Move-Item (Join-Path $Dir 'node-v22.11.0-win-x64') (Join-Path $Dir 'node')
  }
  # FFmpeg (portable essentials build) unless already on PATH
  if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $Dir 'ffmpeg\bin\ffprobe.exe'))) {
    Get-File 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' (Join-Path $Dir 'ffmpeg.zip')
    Expand-Archive (Join-Path $Dir 'ffmpeg.zip') -DestinationPath (Join-Path $Dir 'ffmpeg-unzip') -Force
    Move-Item (Get-ChildItem (Join-Path $Dir 'ffmpeg-unzip') -Directory | Select-Object -First 1).FullName (Join-Path $Dir 'ffmpeg')
  }
  # whisper (captions): prebuilt whisper-cli + the small multilingual model
  $models = Join-Path $Dir 'models'; New-Item -ItemType Directory -Force -Path (Join-Path $models 'bin') | Out-Null
  if (-not (Test-Path (Join-Path $models 'bin\whisper-cli.exe'))) {
    Get-File "https://github.com/ggml-org/whisper.cpp/releases/download/$Whisper/whisper-bin-x64.zip" (Join-Path $Dir 'whisper.zip')
    Expand-Archive (Join-Path $Dir 'whisper.zip') -DestinationPath (Join-Path $Dir 'whisper-unzip') -Force
    $cli = Get-ChildItem (Join-Path $Dir 'whisper-unzip') -Recurse -Filter 'whisper-cli.exe' | Select-Object -First 1
    Copy-Item (Join-Path $cli.DirectoryName '*') (Join-Path $models 'bin') -Recurse -Force
  }
  Get-File 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin' (Join-Path $models 'ggml-small-q5_1.bin')
  Invoke-WebRequest -Uri "$Raw/server.mjs" -OutFile (Join-Path $Dir 'server.mjs') -UseBasicParsing
  $start = @'
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envs = Get-Content (Join-Path $Dir 'engine.env') | ConvertFrom-StringData
$node = if (Test-Path (Join-Path $Dir 'node\node.exe')) { Join-Path $Dir 'node\node.exe' } else { (Get-Command node).Source }
if (Test-Path (Join-Path $Dir 'ffmpeg\bin')) { $env:PATH = (Join-Path $Dir 'ffmpeg\bin') + ';' + $env:PATH }
$env:ENGINE_TOKEN = $envs.KIMO_ENGINE_TOKEN
$env:KIMO_MCP_BIN = Join-Path $Dir 'kimo\bin\kimo-mcp.exe'
$env:KIMO_FONTS = Join-Path $Dir 'kimo\fonts'
$env:KIMO_MODELS = Join-Path $Dir 'models'
$env:KIMO_WHISPER_BIN = Join-Path $Dir 'models\bin\whisper-cli.exe'
$env:KIMO_WHISPER_MODEL = Join-Path $Dir 'models\ggml-small-q5_1.bin'
$env:KIMO_TOOLS = 'director'; $env:KIMO_SPECTATOR = 'off'; $env:PORT = '7860'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*kimo-engine*server.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process -WindowStyle Hidden -FilePath $node -ArgumentList @((Join-Path $Dir 'server.mjs')) -RedirectStandardOutput (Join-Path $Dir 'engine.log') -RedirectStandardError (Join-Path $Dir 'engine.err.log')
Start-Process -WindowStyle Hidden -FilePath (Join-Path $Dir 'cloudflared.exe') -ArgumentList @('tunnel','--no-autoupdate','run','--token',$envs.KIMO_TUNNEL_TOKEN) -RedirectStandardError (Join-Path $Dir 'tunnel.log')
Write-Host 'kimo engine running (native) and connected: https://engine.getkimo.tech/health'
'@
}
$start | Set-Content -Path (Join-Path $Dir 'start.ps1') -Encoding utf8
"Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force; docker rm -f kimo-engine 2>`$null; Get-CimInstance Win32_Process -Filter `"Name='node.exe'`" | Where-Object { `$_.CommandLine -like '*kimo-engine*server.mjs*' } | ForEach-Object { Stop-Process -Id `$_.ProcessId -Force }; Write-Host 'kimo engine stopped'" | Set-Content -Path (Join-Path $Dir 'stop.ps1') -Encoding utf8
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Dir 'start.ps1')
Start-Sleep -Seconds 8
try { $h = Invoke-RestMethod -Uri 'http://127.0.0.1:7860/health' -TimeoutSec 10; Write-Host "local engine: ok=$($h.ok)" } catch { Write-Warning 'engine did not answer on 127.0.0.1:7860 yet; check engine.err.log' }
Write-Host "done. start again later: powershell -ExecutionPolicy Bypass -File `"$Dir\start.ps1`"   stop: `"$Dir\stop.ps1`""
