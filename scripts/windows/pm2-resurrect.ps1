param(
  [string]$ProjectRoot = "",
  [string]$Pm2Home = "$env:USERPROFILE\.pm2"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

if (-not $ProjectRoot) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

if (!(Test-Path $ProjectRoot)) {
  throw "ProjectRoot não encontrado: '$ProjectRoot'"
}

$pm2Cmd = Join-Path $ProjectRoot "node_modules\.bin\pm2.cmd"
if (!(Test-Path $pm2Cmd)) {
  throw "PM2 local não encontrado em '$pm2Cmd'."
}

$env:PM2_HOME = $Pm2Home
Set-Location $ProjectRoot

$bhashApps = @("bhash-backend", "bhash-frontend", "bhash-frontend-admin")

foreach ($appName in $bhashApps) {
  try {
    & $pm2Cmd delete $appName | Out-Null
  } catch {
    # ignora se o app ainda nao existir
  }
}

& $pm2Cmd start "ecosystem.proxy.config.cjs" --update-env | Out-Null
& $pm2Cmd save --force | Out-Null
