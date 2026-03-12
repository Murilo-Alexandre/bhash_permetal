#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const {
  buildTenantConfig,
  copyFileSafe,
  ensureDir,
  makeClientPostInstallCmd,
  readEnvFile,
  writeTextFile,
} = require("./lib/tenant-config.cjs");

function parseArgs(argv) {
  const out = {
    tenantFile: "deploy/tenant.env",
    bump: "patch",
    version: "",
    skipBuild: false,
    publishToolsOnly: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--tenant-file") {
      out.tenantFile = argv[i + 1] || out.tenantFile;
      i++;
      continue;
    }
    if (arg === "--bump") {
      out.bump = argv[i + 1] || out.bump;
      i++;
      continue;
    }
    if (arg === "--version") {
      out.version = argv[i + 1] || "";
      i++;
      continue;
    }
    if (arg === "--skip-build") {
      out.skipBuild = true;
      continue;
    }
    if (arg === "--publish-tools-only") {
      out.publishToolsOnly = true;
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
  node scripts/deploy/release-desktop-tenant.cjs [options]

Options:
  --tenant-file <path>      Tenant env file (default: deploy/tenant.env)
  --bump patch|minor|major  Version bump (default: patch)
  --version X.Y.Z           Exact version (overrides --bump)
  --skip-build              Skip build (use existing dist artifacts)
  --publish-tools-only      Only publish client tools/cmd, no desktop release
  -h, --help                Show help
`);
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function publishBootstrapTools(projectRoot, config) {
  const toolsDir = path.join(config.updatesPublishDir, "tools");
  ensureDir(toolsDir);

  const files = [
    ["scripts/windows/bootstrap-desktop-new-pc.ps1", "bootstrap-desktop-new-pc.ps1"],
    ["scripts/windows/desktop-machine-updater.ps1", "desktop-machine-updater.ps1"],
    ["scripts/windows/install-desktop-updater-task.ps1", "install-desktop-updater-task.ps1"],
    ["scripts/windows/status-desktop-updater-task.ps1", "status-desktop-updater-task.ps1"],
  ];

  for (const [sourceRel, target] of files) {
    const sourceAbs = path.join(projectRoot, sourceRel);
    if (!fs.existsSync(sourceAbs)) {
      throw new Error(`Missing bootstrap file: ${sourceAbs}`);
    }
    copyFileSafe(sourceAbs, path.join(toolsDir, target));
  }

  const cmdText = makeClientPostInstallCmd(config);
  writeTextFile(path.join(toolsDir, "instalar-bhash-pc-novo.cmd"), cmdText);
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const projectRoot = path.resolve(__dirname, "..", "..");
  const tenantFile = path.resolve(projectRoot, args.tenantFile);
  if (!fs.existsSync(tenantFile)) {
    throw new Error(`Tenant file not found: ${tenantFile}`);
  }

  const config = buildTenantConfig(readEnvFile(tenantFile));
  ensureDir(config.updatesPublishDir);

  if (!args.publishToolsOnly) {
    const releaseScript = path.join(projectRoot, "scripts", "desktop", "release-win.cjs");
    const commandArgs = [releaseScript];

    if (args.version) {
      commandArgs.push("--version", args.version);
    } else {
      commandArgs.push("--bump", args.bump);
    }

    if (args.skipBuild) {
      commandArgs.push("--skip-build");
    }

    commandArgs.push("--publish-dir", config.updatesPublishDir);

    console.log(`[deploy:desktop] tenant=${config.tenantSlug}`);
    console.log(`[deploy:desktop] release publish dir=${config.updatesPublishDir}`);
    runCommand("node", commandArgs, projectRoot);
  }

  publishBootstrapTools(projectRoot, config);
  console.log(`[deploy:desktop] tools published: ${path.join(config.updatesPublishDir, "tools")}`);
  console.log(`[deploy:desktop] client cmd: ${path.join(config.updatesPublishDir, "tools", "instalar-bhash-pc-novo.cmd")}`);
}

try {
  run();
} catch (error) {
  console.error(`[deploy:desktop] ERROR: ${error.message}`);
  process.exit(1);
}
