@echo off
setlocal EnableExtensions

REM =======================================================
REM BHASH - Pos-instalacao (auto-elevado)
REM Fluxo: app ja instalado + certificado ja instalado
REM Faz: hosts + updater SYSTEM (sem senha por update)
REM =======================================================
set "SERVER_IP=192.168.1.10"
set "CHAT_HOST=chat.empresa.local"
set "UPDATES_HOST=updates.empresa.local"
set "UPDATE_BASE=https://updates.empresa.local/desktop/win"
set "SKIP_HOSTS=0"
set "ALLOW_INSECURE_TLS=0"

set "BOOTSTRAP_URL=%UPDATE_BASE%/tools/bootstrap-desktop-new-pc.ps1"
set "BOOTSTRAP_PS=%TEMP%\bhash-bootstrap-new-pc.ps1"

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Solicitando permissao de administrador...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo [1/4] Configurando hosts necessarios...
if "%SKIP_HOSTS%"=="1" (
  echo [AVISO] SKIP_HOSTS=1, pulando alteracao no arquivo hosts.
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $hosts = Join-Path $env:WINDIR 'System32\drivers\etc\hosts'; $pairs = @(@('%SERVER_IP%','%CHAT_HOST%'), @('%SERVER_IP%','%UPDATES_HOST%')); $lines = Get-Content $hosts -ErrorAction Stop; foreach ($p in $pairs) { $ip = $p[0]; $h = $p[1]; $esc = [regex]::Escape($h); $lines = $lines | Where-Object { $_ -notmatch ('^\s*\d{1,3}(\.\d{1,3}){3}\s+' + $esc + '(\s|$)') }; $lines += ($ip + ' ' + $h) }; Set-Content -Path $hosts -Value $lines -Encoding ASCII; Write-Host '[OK] Hosts atualizado (chat + updates).'; exit 0 } catch { Write-Host '[ERRO] Falha ao atualizar hosts: ' + $_.Exception.Message; exit 1 }"
  if errorlevel 1 (
    echo [AVISO] Nao consegui alterar o hosts.
    echo [AVISO] Vou continuar; se falhar no download, configure DNS/hosts e rode novamente.
  )
)

echo.
echo [2/4] Baixando script de bootstrap...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%BOOTSTRAP_URL%' -OutFile '%BOOTSTRAP_PS%' -UseBasicParsing -TimeoutSec 60; Write-Host '[OK] Script baixado: %BOOTSTRAP_PS%'; exit 0 } catch { Write-Host '[ERRO] Falha ao baixar script: ' + $_.Exception.Message; exit 1 }"
if errorlevel 1 goto :fail

set "EXTRA_ARGS=-SkipDesktopInstall"
if "%ALLOW_INSECURE_TLS%"=="1" set "EXTRA_ARGS=%EXTRA_ARGS% -AllowInsecureTls"

echo.
echo [3/4] Configurando updater sem senha...
powershell -NoProfile -ExecutionPolicy Bypass -File "%BOOTSTRAP_PS%" -ServerIp "%SERVER_IP%" -UpdateUrl "%UPDATE_BASE%" %EXTRA_ARGS%
if errorlevel 1 goto :fail

echo.
echo [4/4] Concluido com sucesso.
echo App ja estava instalado, e agora o update automatico sem senha esta ativo.
pause
exit /b 0

:fail
echo.
echo [ERRO] Nao foi possivel concluir a configuracao.
echo Verifique as mensagens acima e tente novamente.
pause
exit /b 1
