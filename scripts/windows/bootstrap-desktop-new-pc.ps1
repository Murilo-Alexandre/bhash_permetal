param(
  [string]$ServerIp = "192.168.1.10",
  [string]$ChatHost = "chat.empresa.local",
  [string]$UpdatesHost = "updates.empresa.local",
  [string]$UpdateUrl = "https://updates.empresa.local/desktop/win",
  [switch]$SkipHosts,
  [switch]$SkipDesktopInstall,
  [switch]$AllowInsecureTls
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-WarnLine {
  param([string]$Message)
  Write-Host "[AVISO] $Message" -ForegroundColor Yellow
}

function Write-ErrLine {
  param([string]$Message)
  Write-Host "[ERRO] $Message" -ForegroundColor Red
}

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Convert-ContentToText {
  param([object]$Content)
  if ($null -eq $Content) { return "" }
  if ($Content -is [string]) { return $Content }
  if ($Content -is [byte[]]) { return [System.Text.Encoding]::UTF8.GetString($Content) }
  return [string]$Content
}

function Ensure-HostMapping {
  param(
    [string]$HostsFilePath,
    [string]$Ip,
    [string]$HostName
  )

  $escapedHost = [regex]::Escape($HostName)
  $existing = Select-String -Path $HostsFilePath -Pattern "^\s*\d{1,3}(\.\d{1,3}){3}\s+$escapedHost(\s|$)" -ErrorAction SilentlyContinue
  if ($existing) {
    $currentLine = $existing.Line.Trim()
    if ($currentLine -eq "$Ip $HostName") {
      Write-Ok "Hosts ja configurado: $HostName -> $Ip"
      return
    }
  }

  $allLines = Get-Content $HostsFilePath -ErrorAction Stop
  $filtered = $allLines | Where-Object { $_ -notmatch "^\s*\d{1,3}(\.\d{1,3}){3}\s+$escapedHost(\s|$)" }
  $filtered += "$Ip $HostName"
  Set-Content -Path $HostsFilePath -Value $filtered -Encoding ASCII
  Write-Ok "Hosts atualizado: $HostName -> $Ip"
}

function Ensure-Directory {
  param([string]$PathValue)
  New-Item -ItemType Directory -Path $PathValue -Force | Out-Null
}

try {
  Write-Step "Validando privilegios"
  if (-not (Test-IsAdmin)) {
    throw "Execute este script no PowerShell como Administrador."
  }
  Write-Ok "PowerShell em modo Administrador"

  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
  } catch {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  }

  if ($AllowInsecureTls) {
    Write-WarnLine "AllowInsecureTls ligado: validacao de certificado sera ignorada."
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
  }

  if (-not $SkipHosts) {
    Write-Step "Configurando hosts locais"
    $hostsPath = Join-Path $env:WINDIR "System32\drivers\etc\hosts"
    Ensure-HostMapping -HostsFilePath $hostsPath -Ip $ServerIp -HostName $ChatHost
    Ensure-HostMapping -HostsFilePath $hostsPath -Ip $ServerIp -HostName $UpdatesHost
  } else {
    Write-WarnLine "SkipHosts ativo: nenhuma alteracao no arquivo hosts."
  }

  $bootstrapDir = Join-Path $env:ProgramData "BHashChat\Bootstrap"
  Ensure-Directory -PathValue $bootstrapDir

  if (-not $SkipDesktopInstall) {
    Write-Step "Lendo canal de update ($UpdateUrl/latest.yml)"
    $latestResponse = Invoke-WebRequest -Uri ($UpdateUrl.TrimEnd("/") + "/latest.yml") -UseBasicParsing -TimeoutSec 30
    $latestText = Convert-ContentToText -Content $latestResponse.Content

    $installerName = [regex]::Match($latestText, "(?m)^path:\s*(.+?)\s*$").Groups[1].Value.Trim().Trim("'`"")
    if (-not $installerName) {
      $installerName = [regex]::Match($latestText, "(?m)^\s*-\s*url:\s*(.+?)\s*$").Groups[1].Value.Trim().Trim("'`"")
    }
    $latestVersion = [regex]::Match($latestText, "(?m)^version:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*$").Groups[1].Value.Trim()

    if (-not $installerName) {
      throw "Nao foi possivel identificar o instalador no latest.yml."
    }
    Write-Ok "Versao disponivel: $latestVersion"
    Write-Ok "Instalador identificado: $installerName"

    Write-Step "Baixando instalador desktop"
    $installerUrl = $UpdateUrl.TrimEnd("/") + "/" + $installerName
    $installerPath = Join-Path $bootstrapDir $installerName
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing -TimeoutSec 900
    Write-Ok "Instalador salvo em: $installerPath"

    Write-Step "Instalando BHash Chat (all-users, silencioso)"
    $setupProcess = Start-Process -FilePath $installerPath -ArgumentList "/S /allusers /norestart" -Wait -PassThru
    if ($setupProcess.ExitCode -ne 0) {
      throw "Instalador retornou codigo $($setupProcess.ExitCode)."
    }
    Write-Ok "Aplicativo instalado/atualizado com sucesso"
  } else {
    Write-WarnLine "SkipDesktopInstall ativo: pulando instalacao do app desktop."
  }

  Write-Step "Baixando scripts de updater de maquina"
  $runnerLocal = Join-Path $bootstrapDir "desktop-machine-updater.ps1"
  $installTaskLocal = Join-Path $bootstrapDir "install-desktop-updater-task.ps1"
  $statusTaskLocal = Join-Path $bootstrapDir "status-desktop-updater-task.ps1"

  Invoke-WebRequest -Uri ($UpdateUrl.TrimEnd("/") + "/tools/desktop-machine-updater.ps1") -OutFile $runnerLocal -UseBasicParsing -TimeoutSec 30
  Invoke-WebRequest -Uri ($UpdateUrl.TrimEnd("/") + "/tools/install-desktop-updater-task.ps1") -OutFile $installTaskLocal -UseBasicParsing -TimeoutSec 30
  Invoke-WebRequest -Uri ($UpdateUrl.TrimEnd("/") + "/tools/status-desktop-updater-task.ps1") -OutFile $statusTaskLocal -UseBasicParsing -TimeoutSec 30
  Write-Ok "Scripts baixados para: $bootstrapDir"

  Write-Step "Instalando tarefa SYSTEM de auto-update sem senha"
  $taskArgs = @("-ExecutionPolicy", "Bypass", "-File", $installTaskLocal, "-UpdateFeedUrl", $UpdateUrl)
  if ($AllowInsecureTls) {
    $taskArgs += "-AllowInsecureTls"
  }
  $installTaskProc = Start-Process -FilePath "powershell.exe" -ArgumentList $taskArgs -Wait -PassThru
  if ($installTaskProc.ExitCode -ne 0) {
    throw "Falha ao instalar tarefa de updater (codigo $($installTaskProc.ExitCode))."
  }
  Write-Ok "Tarefa de updater instalada"

  Write-Step "Validando status do updater"
  $statusProc = Start-Process -FilePath "powershell.exe" -ArgumentList @("-ExecutionPolicy", "Bypass", "-File", $statusTaskLocal) -Wait -PassThru
  if ($statusProc.ExitCode -ne 0) {
    Write-WarnLine "Nao foi possivel validar status automaticamente. Rode: powershell -ExecutionPolicy Bypass -File `"$statusTaskLocal`""
  } else {
    Write-Ok "Status consultado com sucesso"
  }

  Write-Step "Concluido"
  if ($SkipDesktopInstall) {
    Write-Ok "PC preparado: updater SYSTEM ativo (sem reinstalar o app)."
  } else {
    Write-Ok "PC preparado: BHash instalado + updater SYSTEM ativo."
  }
  Write-Ok "Proximas versoes serao aplicadas sem pedir senha de usuario."
} catch {
  Write-ErrLine $_.Exception.Message
  Write-ErrLine "Instalacao interrompida. Corrija o erro acima e rode novamente."
  exit 1
}
