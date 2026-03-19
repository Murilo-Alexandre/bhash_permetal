const fs = require("fs");
const path = require("path");

function parseEnvContent(content) {
  const out = {};
  const lines = String(content || "").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) out[key] = value;
  }

  return out;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return parseEnvContent(fs.readFileSync(filePath, "utf-8"));
}

function normalizePrefix(prefix) {
  const value = String(prefix || "/desktop/win").trim();
  if (!value) return "/desktop/win";
  return value.startsWith("/") ? value : `/${value}`;
}

function parseBoolean(value, fallback = false) {
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

function joinCsvUnique(values) {
  const seen = new Set();
  const out = [];
  for (const item of values) {
    const value = String(item || "").trim();
    if (!value) continue;
    if (seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out.join(",");
}

function required(raw, key) {
  const value = String(raw[key] || "").trim();
  if (!value) {
    throw new Error(`Missing required key in tenant file: ${key}`);
  }
  return value;
}

function buildTenantConfig(rawInput) {
  const raw = { ...rawInput };

  const tenantSlug = required(raw, "TENANT_SLUG");
  const companyName = String(raw.COMPANY_NAME || tenantSlug).trim();
  const serverIp = required(raw, "SERVER_IP");
  const chatHost = required(raw, "CHAT_HOST");
  const adminHost = String(raw.ADMIN_HOST || "").trim();
  const adminHttpsEnabled = parseBoolean(raw.ADMIN_HTTPS_ENABLED, !!adminHost);
  if (adminHttpsEnabled && !adminHost) {
    throw new Error("ADMIN_HTTPS_ENABLED=true exige ADMIN_HOST preenchido.");
  }
  const updatesHost = required(raw, "UPDATES_HOST");
  const updatesPathPrefix = normalizePrefix(raw.UPDATES_PATH_PREFIX || "/desktop/win");
  const updatesPublishDir = required(raw, "UPDATES_PUBLISH_DIR");

  const chatUrl = String(raw.CHAT_URL || `https://${chatHost}`).trim();
  const adminUrlDefault = adminHttpsEnabled ? `https://${adminHost}` : `http://${serverIp}:5174`;
  const adminUrl = String(raw.ADMIN_URL || adminUrlDefault).trim();
  const updatesBaseUrl = String(
    raw.DESKTOP_UPDATE_URL || raw.UPDATE_BASE_URL || `https://${updatesHost}${updatesPathPrefix}`
  ).trim();

  const databaseUrl = String(raw.DATABASE_URL || "").trim()
    ? String(raw.DATABASE_URL).trim()
    : `postgresql://${raw.DB_USER || "bhash"}:${required(raw, "DB_PASSWORD")}@${
        raw.DB_HOST || "localhost"
      }:${raw.DB_PORT || "5432"}/${raw.DB_NAME || "bhash"}`;

  const jwtSecret = required(raw, "JWT_SECRET");
  const defaultCorsOrigins = joinCsvUnique([
    chatUrl,
    adminUrl,
    "LAN",
    "http://localhost:5173",
    "http://localhost:5174",
  ]);
  const corsOrigins = String(raw.CORS_ORIGINS || defaultCorsOrigins).trim();
  const appHost = String(raw.APP_HOST || "0.0.0.0").trim();
  const port = String(raw.PORT || "3000").trim();
  const viteApiBase = String(raw.VITE_API_BASE || "/api").trim();
  const viteWsPath = String(raw.VITE_WS_PATH || "/socket.io").trim();
  const desktopPublishDir = updatesPublishDir;

  const runProxyMode = parseBoolean(raw.RUN_PROXY_MODE || "true", true);

  const nginxChatCertPath = String(
    raw.NGINX_CHAT_CERT_PATH || `/etc/ssl/certs/${chatHost}.crt`
  ).trim();
  const nginxChatCertKeyPath = String(
    raw.NGINX_CHAT_CERT_KEY_PATH || `/etc/ssl/private/${chatHost}.key`
  ).trim();
  const nginxAdminCertPath = String(
    raw.NGINX_ADMIN_CERT_PATH ||
      (adminHost ? `/etc/ssl/certs/${adminHost}.crt` : "/etc/ssl/certs/admin.local.crt")
  ).trim();
  const nginxAdminCertKeyPath = String(
    raw.NGINX_ADMIN_CERT_KEY_PATH ||
      (adminHost ? `/etc/ssl/private/${adminHost}.key` : "/etc/ssl/private/admin.local.key")
  ).trim();

  return {
    raw,
    tenantSlug,
    companyName,
    serverIp,
    chatHost,
    adminHost,
    adminHttpsEnabled,
    updatesHost,
    updatesPathPrefix,
    updatesBaseUrl,
    updatesPublishDir,
    chatUrl,
    adminUrl,
    databaseUrl,
    jwtSecret,
    corsOrigins,
    appHost,
    port,
    viteApiBase,
    viteWsPath,
    desktopPublishDir,
    runProxyMode,
    nginxChatCertPath,
    nginxChatCertKeyPath,
    nginxAdminCertPath,
    nginxAdminCertKeyPath,
  };
}

function getValue(config, key, fallback = "") {
  const value = config.raw[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function makeRootEnv(config) {
  const lines = [
    "# ==========================================",
    "# BHASH generated env (tenant based)",
    "# ==========================================",
    `# tenant: ${config.tenantSlug}`,
    `# company: ${config.companyName}`,
    "",
    `DATABASE_URL=${config.databaseUrl}`,
    `JWT_SECRET=${config.jwtSecret}`,
    `CORS_ORIGINS=${config.corsOrigins}`,
    `APP_HOST=${config.appHost}`,
    `PORT=${config.port}`,
    "",
    `VITE_API_BASE=${config.viteApiBase}`,
    `VITE_WS_PATH=${config.viteWsPath}`,
    "",
    `CHAT_WEB_URL=${config.chatUrl}`,
    `DESKTOP_UPDATE_URL=${config.updatesBaseUrl}`,
    `DESKTOP_UPDATE_PUBLISH_DIR=${config.desktopPublishDir}`,
    "",
    `SEED_SUPERADMIN_USERNAME=${getValue(config, "SEED_SUPERADMIN_USERNAME", "superadmin")}`,
    `SEED_SUPERADMIN_PASSWORD=${getValue(config, "SEED_SUPERADMIN_PASSWORD", "ChangeMeNow!123456")}`,
    `SEED_SUPERADMIN_NAME=${getValue(config, "SEED_SUPERADMIN_NAME", "SuperAdmin")}`,
    "",
    `SEED_ADMIN_USERNAME=${getValue(config, "SEED_ADMIN_USERNAME", "adminteste")}`,
    `SEED_ADMIN_PASSWORD=${getValue(config, "SEED_ADMIN_PASSWORD", "admin123")}`,
    `SEED_ADMIN_NAME=${getValue(config, "SEED_ADMIN_NAME", "Administrador Teste")}`,
    "",
    `SEED_USER1_USERNAME=${getValue(config, "SEED_USER1_USERNAME", "userteste1")}`,
    `SEED_USER1_PASSWORD=${getValue(config, "SEED_USER1_PASSWORD", "userteste1")}`,
    `SEED_USER1_NAME=${getValue(config, "SEED_USER1_NAME", "Usuario Teste 1")}`,
    "",
    `SEED_USER2_USERNAME=${getValue(config, "SEED_USER2_USERNAME", "userteste2")}`,
    `SEED_USER2_PASSWORD=${getValue(config, "SEED_USER2_PASSWORD", "userteste2")}`,
    `SEED_USER2_NAME=${getValue(config, "SEED_USER2_NAME", "Usuario Teste 2")}`,
    "",
    `SEED_PRIMARY_COLOR=${getValue(config, "SEED_PRIMARY_COLOR", "#001F3F")}`,
    `SEED_LOGO_URL=${getValue(config, "SEED_LOGO_URL", "")}`,
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function escapeCaddyPath(value) {
  return String(value || "").replace(/\\/g, "\\\\");
}

function makeCaddyfile(config) {
  const prefix = config.updatesPathPrefix;
  const updatesRoot = escapeCaddyPath(config.updatesPublishDir);
  const adminBlock = config.adminHttpsEnabled
    ? `
https://${config.adminHost} {
    encode zstd gzip

    @api path /api/*
    handle @api {
        uri strip_prefix /api
        reverse_proxy 127.0.0.1:3000
    }

    @socket path /socket.io/*
    handle @socket {
        reverse_proxy 127.0.0.1:3000
    }

    handle {
        reverse_proxy 127.0.0.1:5174
    }
}
`
    : `
# Admin HTTPS desabilitado: usar URL interna ${config.adminUrl}
`;

  return `{
    local_certs
    auto_https disable_redirects
}

https://${config.chatHost} {
    encode zstd gzip

    @api path /api/*
    handle @api {
        uri strip_prefix /api
        reverse_proxy 127.0.0.1:3000
    }

    @socket path /socket.io/*
    handle @socket {
        reverse_proxy 127.0.0.1:3000
    }

    handle {
        reverse_proxy 127.0.0.1:5173
    }
}
${adminBlock}

https://${config.updatesHost} {
    encode zstd gzip

    handle_path ${prefix}/* {
        root * ${updatesRoot}
        file_server
    }
}
`;
}

function makeNginxConfig(config) {
  const redirectHosts = [config.chatHost, config.adminHttpsEnabled ? config.adminHost : ""]
    .filter(Boolean)
    .join(" ");
  const adminServer = config.adminHttpsEnabled
    ? `
server {
  listen 443 ssl http2;
  server_name ${config.adminHost};

  ssl_certificate     ${config.nginxAdminCertPath};
  ssl_certificate_key ${config.nginxAdminCertKeyPath};

  client_max_body_size 40m;

  location /socket.io/ {
    proxy_pass http://127.0.0.1:3000/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 600s;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://127.0.0.1:5174/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
`
    : `
# Admin HTTPS desabilitado: usar URL interna ${config.adminUrl}
`;

  return `map $http_upgrade $connection_upgrade {
  default upgrade;
  '' close;
}

server {
  listen 80;
  server_name ${redirectHosts};
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name ${config.chatHost};

  ssl_certificate     ${config.nginxChatCertPath};
  ssl_certificate_key ${config.nginxChatCertKeyPath};

  client_max_body_size 40m;

  location /socket.io/ {
    proxy_pass http://127.0.0.1:3000/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 600s;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://127.0.0.1:5173/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
${adminServer}
`;
}

function makeClientPostInstallCmd(config) {
  return `@echo off
setlocal EnableExtensions

REM =======================================================
REM BHASH - Pos-instalacao cliente (auto-elevado)
REM Fluxo: app desktop ja instalado + certificado ja instalado
REM Faz: hosts + updater SYSTEM (sem senha por update)
REM Tenant: ${config.tenantSlug}
REM =======================================================
set "SERVER_IP=${config.serverIp}"
set "CHAT_HOST=${config.chatHost}"
set "UPDATES_HOST=${config.updatesHost}"
set "UPDATE_BASE=${config.updatesBaseUrl}"
set "SKIP_HOSTS=0"
set "ALLOW_INSECURE_TLS=0"

set "BOOTSTRAP_URL=%UPDATE_BASE%/tools/bootstrap-desktop-new-pc.ps1"
set "BOOTSTRAP_PS=%TEMP%\\bhash-bootstrap-new-pc.ps1"

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
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $hosts = Join-Path $env:WINDIR 'System32\\drivers\\etc\\hosts'; $pairs = @(@('%SERVER_IP%','%CHAT_HOST%'), @('%SERVER_IP%','%UPDATES_HOST%')); $lines = Get-Content $hosts -ErrorAction Stop; foreach ($p in $pairs) { $ip = $p[0]; $h = $p[1]; $esc = [regex]::Escape($h); $lines = $lines | Where-Object { $_ -notmatch ('^\\s*\\d{1,3}(\\.\\d{1,3}){3}\\s+' + $esc + '(\\s|$)') }; $lines += ($ip + ' ' + $h) }; Set-Content -Path $hosts -Value $lines -Encoding ASCII; Write-Host '[OK] Hosts atualizado (chat + updates).'; exit 0 } catch { Write-Host '[ERRO] Falha ao atualizar hosts: ' + $_.Exception.Message; exit 1 }"
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
echo App desktop preparado para update automatico sem senha.
pause
exit /b 0

:fail
echo.
echo [ERRO] Nao foi possivel concluir a configuracao.
echo Verifique as mensagens acima e tente novamente.
pause
exit /b 1
`;
}

function makeClientReadme(config) {
  return `# Cliente Windows - ${config.companyName}

Arquivo principal:
- instalar-bhash-pc-novo.cmd

Fluxo no cliente:
1. Instalar o setup desktop (BHash Chat Setup ...exe).
2. Instalar certificado interno.
3. Executar instalar-bhash-pc-novo.cmd (duplo clique, com UAC).

Resultado esperado:
- task SYSTEM "BHash-Desktop-Machine-Updater" instalada
- updates sem senha por usuario
- feed: ${config.updatesBaseUrl}
`;
}

function makeServerReadme(config) {
  return `# Server Kit - ${config.companyName}

Arquivos gerados:
- .env
- Caddyfile.windows
- nginx.internal.conf

URLs:
- Chat: ${config.chatUrl}
- Admin: ${config.adminUrl}
- Admin HTTPS: ${config.adminHttpsEnabled ? "habilitado" : "desabilitado (admin interno)"}

Passos rapidos no servidor:
1. Copiar .env para raiz do projeto.
2. Usar Caddyfile.windows em C:\\caddy\\Caddyfile (Windows) ou nginx.internal.conf (Linux).
3. Subir app:
   - npm run infra:up
   - npm run setup:server
   - npm run services:start:proxy
   - npm run services:save
4. Garantir pasta de updates:
   - ${config.updatesPublishDir}
`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeTextFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
}

function copyFileSafe(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

module.exports = {
  buildTenantConfig,
  copyFileSafe,
  ensureDir,
  makeCaddyfile,
  makeClientPostInstallCmd,
  makeClientReadme,
  makeNginxConfig,
  makeRootEnv,
  makeServerReadme,
  parseEnvContent,
  readEnvFile,
  writeTextFile,
};
