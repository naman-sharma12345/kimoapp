param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference = 'Stop'
$repoRoot = (Get-Location).Path
if (Test-Path -LiteralPath "$Source/repo/cache") { Copy-Item -Path "$Source/repo/cache/*" -Destination "$repoRoot/desktop/test/bench/cache" -Recurse -Force }
if (Test-Path -LiteralPath "$Source/data") {
  New-Item -ItemType Directory -Force $env:KIMO_BENCH_DATA | Out-Null
  Copy-Item -Path "$Source/data/*" -Destination $env:KIMO_BENCH_DATA -Recurse -Force
}
