param(
  [string]$TaskName = "BHash-Caddy-Start",
  [string]$CaddyExe = "C:\caddy\caddy.exe",
  [string]$CaddyConfig = "C:\caddy\Caddyfile"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  throw "Execute este script no PowerShell como Administrador."
}

if (!(Test-Path $CaddyExe)) {
  throw "Caddy não encontrado em '$CaddyExe'."
}

if (!(Test-Path $CaddyConfig)) {
  throw "Caddyfile não encontrado em '$CaddyConfig'."
}

$caddyWorkdir = Split-Path -Path $CaddyExe -Parent
$caddyArgs = "start --config `"$CaddyConfig`" --adapter caddyfile"
$action = New-ScheduledTaskAction -Execute $CaddyExe -Argument $caddyArgs -WorkingDirectory $caddyWorkdir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "Tarefa '$TaskName' criada em modo SYSTEM (startup da máquina)."
Write-Host "Caddy: $CaddyExe"
Write-Host "Config: $CaddyConfig"
