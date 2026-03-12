param(
  [Parameter(Mandatory = $true)]
  [string]$UpdateFeedUrl,
  [string]$AppDisplayName = "BHash Chat",
  [string]$ProcessName = "BHashChat",
  [string]$InstallerSilentArgs = "/S /allusers /norestart",
  [string]$StateFilePath = "C:\ProgramData\BHashChat\Updater\state.json",
  [string]$LogPath = "C:\ProgramData\BHashChat\Updater\updater.log",
  [int]$TimeoutSec = 60,
  [switch]$AllowInsecureTls
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $true

function Ensure-ParentDir {
  param([string]$PathValue)
  $dir = Split-Path -Parent $PathValue
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
}

function Write-Log {
  param(
    [string]$Message,
    [ValidateSet("INFO", "WARN", "ERROR")]
    [string]$Level = "INFO"
  )

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp][$Level] $Message"
  Ensure-ParentDir -PathValue $LogPath
  Add-Content -Path $LogPath -Value $line
}

function Save-State {
  param([hashtable]$Data)
  Ensure-ParentDir -PathValue $StateFilePath
  $json = $Data | ConvertTo-Json -Depth 8
  Set-Content -Path $StateFilePath -Value $json -Encoding UTF8
}

function Parse-LatestYml {
  param([string]$RawText)

  if ($RawText.Length -gt 0 -and [int][char]$RawText[0] -eq 65279) {
    $RawText = $RawText.Substring(1)
  }

  $versionMatch = [regex]::Match($RawText, "(?m)^version:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*$")
  $pathMatch = [regex]::Match($RawText, "(?m)^path:\s*(.+?)\s*$")
  $urlMatch = [regex]::Match($RawText, "(?m)^\s*-\s*url:\s*(.+?)\s*$")

  $version = if ($versionMatch.Success) { $versionMatch.Groups[1].Value.Trim() } else { "" }
  $path = ""
  if ($pathMatch.Success) {
    $path = $pathMatch.Groups[1].Value.Trim()
  } elseif ($urlMatch.Success) {
    $path = $urlMatch.Groups[1].Value.Trim()
  }

  if ($path) {
    $path = $path.Trim("'`"")
  }

  return @{
    version = $version
    path = $path
  }
}

function Convert-ContentToText {
  param([object]$Content)

  if ($null -eq $Content) {
    return ""
  }

  if ($Content -is [string]) {
    return $Content
  }

  if ($Content -is [byte[]]) {
    return [System.Text.Encoding]::UTF8.GetString($Content)
  }

  return [string]$Content
}

function Get-InstalledVersion {
  param([string]$DisplayName)

  $registryPaths = @(
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )

  foreach ($path in $registryPaths) {
    if (-not (Test-Path $path)) {
      continue
    }

    $entry = Get-ItemProperty $path -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -eq $DisplayName } |
      Select-Object -First 1

    if ($entry -and $entry.DisplayVersion) {
      return [string]$entry.DisplayVersion
    }
  }

  return $null
}

function To-VersionOrNull {
  param([string]$Text)
  try {
    return [version]$Text
  } catch {
    return $null
  }
}

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
} catch {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

if ($AllowInsecureTls) {
  Write-Log -Level "WARN" -Message "AllowInsecureTls habilitado. Certificado HTTPS sera ignorado."
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
}

$baseUrl = $UpdateFeedUrl.Trim().TrimEnd("/")
if (-not $baseUrl) {
  Write-Log -Level "ERROR" -Message "UpdateFeedUrl vazio."
  exit 1
}

$latestUrl = "$baseUrl/latest.yml"
$installedVersion = Get-InstalledVersion -DisplayName $AppDisplayName

$state = @{
  lastRunAt = (Get-Date).ToString("o")
  updateFeedUrl = $baseUrl
  installedVersion = $installedVersion
  latestVersion = $null
  status = "started"
  details = ""
}

try {
  Write-Log -Message "Checando updates em $latestUrl"
  $response = Invoke-WebRequest -Uri $latestUrl -UseBasicParsing -TimeoutSec $TimeoutSec
  $latestRawText = Convert-ContentToText -Content $response.Content
  $meta = Parse-LatestYml -RawText $latestRawText
  $latestVersion = [string]$meta.version
  $installerPath = [string]$meta.path

  if (-not $latestVersion -or -not $installerPath) {
    throw "latest.yml invalido: versao ou path ausente."
  }

  $state.latestVersion = $latestVersion

  $currentVersionObj = To-VersionOrNull -Text $installedVersion
  $latestVersionObj = To-VersionOrNull -Text $latestVersion

  if ($installedVersion -and $currentVersionObj -and $latestVersionObj -and $latestVersionObj -le $currentVersionObj) {
    $state.status = "up-to-date"
    $state.details = "Sem update: instalada=$installedVersion, feed=$latestVersion"
    Write-Log -Message $state.details
    Save-State -Data $state
    exit 0
  }

  if ($installedVersion -and $installedVersion -eq $latestVersion) {
    $state.status = "up-to-date"
    $state.details = "Sem update: instalada=$installedVersion, feed=$latestVersion"
    Write-Log -Message $state.details
    Save-State -Data $state
    exit 0
  }

  $running = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
  if ($running) {
    $state.status = "app-running"
    $state.details = "Processo $ProcessName em execucao. Update adiado."
    Write-Log -Level "WARN" -Message $state.details
    Save-State -Data $state
    exit 0
  }

  $downloadDir = Join-Path $env:ProgramData "BHashChat\Updater\downloads"
  New-Item -ItemType Directory -Path $downloadDir -Force | Out-Null
  $downloadFile = Join-Path $downloadDir ("BHash Chat Setup " + $latestVersion + ".exe")

  $baseUri = [System.Uri]::new("$baseUrl/")
  $installerUri = [System.Uri]::new($baseUri, $installerPath)

  Write-Log -Message "Baixando instalador: $($installerUri.AbsoluteUri)"
  Invoke-WebRequest -Uri $installerUri.AbsoluteUri -OutFile $downloadFile -UseBasicParsing -TimeoutSec 900

  Write-Log -Message "Executando update silencioso: $downloadFile"
  $proc = Start-Process -FilePath $downloadFile -ArgumentList $InstallerSilentArgs -PassThru -Wait
  if ($proc.ExitCode -ne 0) {
    throw "Instalador retornou codigo $($proc.ExitCode)."
  }

  Start-Sleep -Seconds 2
  $newInstalledVersion = Get-InstalledVersion -DisplayName $AppDisplayName
  $state.installedVersion = $newInstalledVersion
  $state.status = "updated"
  $state.details = "Update aplicado: $installedVersion -> $newInstalledVersion (feed=$latestVersion)"
  Write-Log -Message $state.details
  Save-State -Data $state
} catch {
  $errorMessage = $_.Exception.Message
  $state.status = "error"
  $state.details = $errorMessage
  Write-Log -Level "ERROR" -Message $errorMessage
  Save-State -Data $state
  exit 1
}
