param(
  [string]$TaskName = "BHash-Desktop-Machine-Updater",
  [string]$InstallRoot = "C:\ProgramData\BHashChat\Updater"
)

$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "Tarefa '$TaskName' nao encontrada."
  exit 1
}

$info = Get-ScheduledTaskInfo -TaskName $TaskName

Write-Host "TaskName: $TaskName"
Write-Host "State: $($info.State)"
Write-Host "LastRunTime: $($info.LastRunTime)"
Write-Host "LastTaskResult: $($info.LastTaskResult)"
Write-Host "NextRunTime: $($info.NextRunTime)"

$stateFile = Join-Path $InstallRoot "state.json"
$logFile = Join-Path $InstallRoot "updater.log"

if (Test-Path $stateFile) {
  Write-Host ""
  Write-Host "state.json:"
  Get-Content $stateFile
}

if (Test-Path $logFile) {
  Write-Host ""
  Write-Host "updater.log (ultimas 30 linhas):"
  Get-Content $logFile | Select-Object -Last 30
}
