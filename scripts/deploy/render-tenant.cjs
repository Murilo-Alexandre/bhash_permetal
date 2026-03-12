#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const {
  buildTenantConfig,
  copyFileSafe,
  ensureDir,
  makeCaddyfile,
  makeClientPostInstallCmd,
  makeClientReadme,
  makeNginxConfig,
  makeRootEnv,
  makeServerReadme,
  readEnvFile,
  writeTextFile,
} = require("./lib/tenant-config.cjs");

function parseArgs(argv) {
  const out = {
    tenantFile: "deploy/tenant.env",
    outDir: "deploy/out",
    applyRootEnv: false,
    publishTools: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--tenant-file") {
      out.tenantFile = argv[i + 1] || out.tenantFile;
      i++;
      continue;
    }
    if (arg === "--out-dir") {
      out.outDir = argv[i + 1] || out.outDir;
      i++;
      continue;
    }
    if (arg === "--apply-root-env") {
      out.applyRootEnv = true;
      continue;
    }
    if (arg === "--publish-tools") {
      out.publishTools = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/deploy/render-tenant.cjs [options]

Options:
  --tenant-file <path>   Tenant env file (default: deploy/tenant.env)
  --out-dir <path>       Output base dir (default: deploy/out)
  --apply-root-env       Write generated env to .env at project root
  --publish-tools        Copy bootstrap tools to UPDATES_PUBLISH_DIR/tools
  -h, --help             Show help
`);
}

function resolveProjectRoot() {
  return path.resolve(__dirname, "..", "..");
}

function publishBootstrapTools(projectRoot, config, clientCmdText) {
  const toolsDir = path.join(config.updatesPublishDir, "tools");
  ensureDir(toolsDir);

  const fileMap = [
    ["scripts/windows/bootstrap-desktop-new-pc.ps1", "bootstrap-desktop-new-pc.ps1"],
    ["scripts/windows/desktop-machine-updater.ps1", "desktop-machine-updater.ps1"],
    ["scripts/windows/install-desktop-updater-task.ps1", "install-desktop-updater-task.ps1"],
    ["scripts/windows/status-desktop-updater-task.ps1", "status-desktop-updater-task.ps1"],
  ];

  for (const [sourceRel, targetName] of fileMap) {
    const source = path.join(projectRoot, sourceRel);
    if (!fs.existsSync(source)) {
      throw new Error(`Required file not found for publish-tools: ${source}`);
    }
    copyFileSafe(source, path.join(toolsDir, targetName));
  }

  writeTextFile(path.join(toolsDir, "instalar-bhash-pc-novo.cmd"), clientCmdText);
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const projectRoot = resolveProjectRoot();
  const tenantFilePath = path.resolve(projectRoot, args.tenantFile);
  if (!fs.existsSync(tenantFilePath)) {
    throw new Error(`Tenant file not found: ${tenantFilePath}`);
  }

  const raw = readEnvFile(tenantFilePath);
  const config = buildTenantConfig(raw);

  const outBase = path.resolve(projectRoot, args.outDir, config.tenantSlug);
  const serverOut = path.join(outBase, "server");
  const clientOut = path.join(outBase, "client", "windows");

  const rootEnvText = makeRootEnv(config);
  const caddyText = makeCaddyfile(config);
  const nginxText = makeNginxConfig(config);
  const clientCmdText = makeClientPostInstallCmd(config);
  const clientReadme = makeClientReadme(config);
  const serverReadme = makeServerReadme(config);

  writeTextFile(path.join(serverOut, ".env"), rootEnvText);
  writeTextFile(path.join(serverOut, "Caddyfile.windows"), caddyText);
  writeTextFile(path.join(serverOut, "nginx.internal.conf"), nginxText);
  writeTextFile(path.join(serverOut, "README.md"), serverReadme);

  writeTextFile(path.join(clientOut, "instalar-bhash-pc-novo.cmd"), clientCmdText);
  writeTextFile(path.join(clientOut, "README.md"), clientReadme);

  if (args.applyRootEnv) {
    writeTextFile(path.join(projectRoot, ".env"), rootEnvText);
  }

  if (args.publishTools) {
    publishBootstrapTools(projectRoot, config, clientCmdText);
  }

  console.log(`[deploy:render] tenant=${config.tenantSlug}`);
  console.log(`[deploy:render] output=${outBase}`);
  console.log(`[deploy:render] updateUrl=${config.updatesBaseUrl}`);
  console.log(`[deploy:render] publishDir=${config.updatesPublishDir}`);
  if (args.applyRootEnv) {
    console.log(`[deploy:render] root env updated: ${path.join(projectRoot, ".env")}`);
  }
  if (args.publishTools) {
    console.log(`[deploy:render] bootstrap tools published to ${path.join(config.updatesPublishDir, "tools")}`);
  }
}

try {
  run();
} catch (error) {
  console.error(`[deploy:render] ERROR: ${error.message}`);
  process.exit(1);
}
