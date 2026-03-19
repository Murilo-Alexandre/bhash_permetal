param(
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

if (-not $ProjectRoot) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
Set-Location $ProjectRoot

Write-Host ">> Deploy inicial (instala, builda, sobe serviços e salva estado PM2)..."
npm run server:deploy
if ($LASTEXITCODE -ne 0) {
  throw "Falha no deploy inicial (npm run server:deploy)."
}

Write-Host ">> Criando tarefa de startup para restaurar serviços no boot..."
powershell -ExecutionPolicy Bypass -File ".\scripts\windows\install-server-startup-tasks.ps1" -ProjectRoot $ProjectRoot
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao criar tarefa de startup."
}

Write-Host "Deploy inicial concluído."
Write-Host "Use 'npm run services:status' para verificar os processos."
