#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const out = {
    tenantFile: "deploy/tenant.env",
    force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--tenant-file") {
      out.tenantFile = argv[i + 1] || out.tenantFile;
      i++;
      continue;
    }
    if (arg === "--force") {
      out.force = true;
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
  node scripts/deploy/init-tenant-env.cjs [options]

Options:
  --tenant-file <path>   Target tenant env path (default: deploy/tenant.env)
  --force                Overwrite existing tenant file
  -h, --help             Show help
`);
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const projectRoot = path.resolve(__dirname, "..", "..");
  const source = path.join(projectRoot, "deploy", "tenant.env.example");
  const target = path.resolve(projectRoot, args.tenantFile);

  if (!fs.existsSync(source)) {
    throw new Error(`Source template not found: ${source}`);
  }

  if (fs.existsSync(target) && !args.force) {
    console.log(`[deploy:init] tenant file already exists: ${target}`);
    console.log("[deploy:init] use --force to overwrite.");
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`[deploy:init] created: ${target}`);
}

try {
  run();
} catch (error) {
  console.error(`[deploy:init] ERROR: ${error.message}`);
  process.exit(1);
}
