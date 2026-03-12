param(
  [string]$ProjectRoot = "",
  [string]$TaskName = "BHash-PM2-Resurrect",
  [string]$Pm2Home = "$env:USERPROFILE\.pm2",
  [switch]$ForceSystemStartup
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

$pm2Runner = Join-Path $ProjectRoot "scripts\windows\pm2-resurrect.ps1"
if (!(Test-Path $pm2Runner)) {
  throw "Script não encontrado: '$pm2Runner'."
}

$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$pm2Runner`" -ProjectRoot `"$ProjectRoot`" -Pm2Home `"$Pm2Home`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument -WorkingDirectory $ProjectRoot
$isAdmin = Test-IsAdmin

if ($ForceSystemStartup -or $isAdmin) {
  if ($ForceSystemStartup -and -not $isAdmin) {
    Write-Host "Sem privilégio de Administrador para criar tarefa SYSTEM."
    Write-Host "Abra o PowerShell como Administrador e rode novamente com -ForceSystemStartup."
    exit 1
  }

  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
  Write-Host "Tarefa '$TaskName' criada em modo SYSTEM (startup da máquina)."
  Write-Host "No próximo boot, o PM2 vai restaurar os serviços automaticamente."
  exit 0
}

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Write-Host "Tarefa '$TaskName' criada em modo usuário (ao fazer login)."
Write-Host "Para executar em startup da máquina (antes de login), rode este script como Administrador com -ForceSystemStartup."
