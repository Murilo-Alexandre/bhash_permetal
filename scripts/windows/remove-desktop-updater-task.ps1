param(
  [string]$TaskName = "BHash-Desktop-Machine-Updater",
  [string]$InstallRoot = "C:\ProgramData\BHashChat\Updater",
  [switch]$KeepFiles
)

$ErrorActionPreference = "Stop"

try {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
} catch {
  # no-op
}

try {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
  Write-Host "Tarefa '$TaskName' removida."
} catch {
  Write-Host "Tarefa '$TaskName' nao encontrada."
}

if (-not $KeepFiles) {
  if (Test-Path $InstallRoot) {
    Remove-Item -Path $InstallRoot -Recurse -Force
    Write-Host "Arquivos removidos: $InstallRoot"
  } else {
    Write-Host "Pasta nao encontrada: $InstallRoot"
  }
} else {
  Write-Host "Arquivos preservados em: $InstallRoot"
}
