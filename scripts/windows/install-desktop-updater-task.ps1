param(
  [string]$TaskName = "BHash-Desktop-Machine-Updater",
  [string]$UpdateFeedUrl = "",
  [string]$InstallRoot = "C:\ProgramData\BHashChat\Updater",
  [int]$PollMinutes = 15,
  [string]$AppDisplayName = "BHash Chat",
  [string]$ProcessName = "BHashChat",
  [string]$InstallerSilentArgs = "/S /allusers /norestart",
  [switch]$AllowInsecureTls
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-ProjectRoot {
  return Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
}

function Get-EnvVarFromFile {
  param(
    [string]$FilePath,
    [string]$Name
  )

  if (-not (Test-Path $FilePath)) {
    return $null
  }

  $line = Get-Content $FilePath |
    Where-Object { $_ -match "^\s*$Name=(.*)$" } |
    Select-Object -First 1

  if (-not $line) {
    return $null
  }

  return ($line -replace "^\s*$Name=", "").Trim()
}

if (-not (Test-IsAdmin)) {
  throw "Abra o PowerShell como Administrador para instalar a tarefa de updater da maquina."
}

if ($PollMinutes -lt 5) {
  throw "PollMinutes minimo: 5."
}

if (-not $UpdateFeedUrl) {
  $projectRoot = Get-ProjectRoot
  $envPath = Join-Path $projectRoot ".env"
  $UpdateFeedUrl = Get-EnvVarFromFile -FilePath $envPath -Name "DESKTOP_UPDATE_URL"
}

if (-not $UpdateFeedUrl) {
  $UpdateFeedUrl = "https://updates.bhash.com/desktop/win"
}

$UpdateFeedUrl = $UpdateFeedUrl.Trim().TrimEnd("/")

$sourceScript = Join-Path $PSScriptRoot "desktop-machine-updater.ps1"
if (-not (Test-Path $sourceScript)) {
  throw "Script nao encontrado: '$sourceScript'."
}

New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
$runnerScript = Join-Path $InstallRoot "desktop-machine-updater.ps1"
$stateFile = Join-Path $InstallRoot "state.json"
$logFile = Join-Path $InstallRoot "updater.log"

Copy-Item -Path $sourceScript -Destination $runnerScript -Force

$argParts = @(
  "-NoProfile"
  "-ExecutionPolicy Bypass"
  "-File `"$runnerScript`""
  "-UpdateFeedUrl `"$UpdateFeedUrl`""
  "-AppDisplayName `"$AppDisplayName`""
  "-ProcessName `"$ProcessName`""
  "-InstallerSilentArgs `"$InstallerSilentArgs`""
  "-StateFilePath `"$stateFile`""
  "-LogPath `"$logFile`""
)

if ($AllowInsecureTls) {
  $argParts += "-AllowInsecureTls"
}

$argument = $argParts -join " "
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument -WorkingDirectory $InstallRoot

$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$repeatStart = (Get-Date).AddMinutes(1)
$repeatTrigger = New-ScheduledTaskTrigger `
  -Once `
  -At $repeatStart `
  -RepetitionInterval (New-TimeSpan -Minutes $PollMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 45)

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger @($startupTrigger, $repeatTrigger) `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host "Tarefa '$TaskName' instalada (SYSTEM)."
Write-Host "Feed: $UpdateFeedUrl"
Write-Host "Polling: a cada $PollMinutes minuto(s)"
Write-Host "Runner: $runnerScript"
Write-Host "Log: $logFile"
Write-Host "Estado: $stateFile"
