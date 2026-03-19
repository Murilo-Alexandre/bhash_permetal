param(
  [string]$ProjectRoot = "",
  [string]$Pm2TaskName = "BHash-PM2-Resurrect",
  [string]$CaddyTaskName = "BHash-Caddy-Start",
  [string]$Pm2Home = "$env:USERPROFILE\.pm2",
  [string]$CaddyExe = "C:\caddy\caddy.exe",
  [string]$CaddyConfig = "C:\caddy\Caddyfile"
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

if (-not $ProjectRoot) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  throw "Execute este script no PowerShell como Administrador."
}

$pm2Installer = Join-Path $PSScriptRoot "install-startup-task.ps1"
$caddyInstaller = Join-Path $PSScriptRoot "install-caddy-startup-task.ps1"

& $pm2Installer -ProjectRoot $ProjectRoot -TaskName $Pm2TaskName -Pm2Home $Pm2Home -ForceSystemStartup
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao instalar a tarefa de startup do PM2."
}

& $caddyInstaller -TaskName $CaddyTaskName -CaddyExe $CaddyExe -CaddyConfig $CaddyConfig
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao instalar a tarefa de startup do Caddy."
}

Write-Host "Startup do servidor configurado com sucesso."
Write-Host "- PM2: SYSTEM / AtStartup"
Write-Host "- Caddy: SYSTEM / AtStartup"
