param(
  [string]$TaskName = "BHash-Caddy-Start"
)

$ErrorActionPreference = "Stop"

try {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
  Write-Host "Tarefa '$TaskName' removida."
} catch {
  Write-Host "Tarefa '$TaskName' não encontrada."
}
