param(
  [string]$Pm2TaskName = "BHash-PM2-Resurrect",
  [string]$CaddyTaskName = "BHash-Caddy-Start"
)

$ErrorActionPreference = "Stop"

$removePm2 = Join-Path $PSScriptRoot "remove-startup-task.ps1"
$removeCaddy = Join-Path $PSScriptRoot "remove-caddy-startup-task.ps1"

& $removePm2 -TaskName $Pm2TaskName
& $removeCaddy -TaskName $CaddyTaskName
