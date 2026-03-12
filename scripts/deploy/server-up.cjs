#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { buildTenantConfig, makeRootEnv, readEnvFile, writeTextFile } = require("./lib/tenant-config.cjs");

function parseArgs(argv) {
  const out = {
    tenantFile: "deploy/tenant.env",
    skipInfra: false,
    skipSave: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--tenant-file") {
      out.tenantFile = argv[i + 1] || out.tenantFile;
      i++;
      continue;
    }
    if (arg === "--skip-infra") {
      out.skipInfra = true;
      continue;
    }
    if (arg === "--skip-save") {
      out.skipSave = true;
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
  node scripts/deploy/server-up.cjs [options]

Options:
  --tenant-file <path>   Tenant env file (default: deploy/tenant.env)
  --skip-infra           Skip docker infra up
  --skip-save            Skip pm2 save
  -h, --help             Show help
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
  const rootEnv = makeRootEnv(config);
  writeTextFile(path.join(projectRoot, ".env"), rootEnv);

  console.log(`[deploy:server] tenant=${config.tenantSlug}`);
  console.log(`[deploy:server] .env applied from ${tenantFile}`);

  if (!args.skipInfra) {
    runCommand("npm", ["run", "infra:up"], projectRoot);
  }

  runCommand("npm", ["run", "setup:server"], projectRoot);
  runCommand("npm", ["run", config.runProxyMode ? "services:start:proxy" : "services:start"], projectRoot);

  if (!args.skipSave) {
    runCommand("npm", ["run", "services:save"], projectRoot);
  }

  console.log("[deploy:server] server up complete.");
}

try {
  run();
} catch (error) {
  console.error(`[deploy:server] ERROR: ${error.message}`);
  process.exit(1);
}
