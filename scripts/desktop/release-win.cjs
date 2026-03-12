#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function fail(message, code = 1) {
  console.error(`[desktop:release] ERROR: ${message}`);
  process.exit(code);
}

function run(command, args, cwd) {
  console.log(`[desktop:release] > ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    fail(`Command failed: ${command} ${args.join(" ")}`, result.status ?? 1);
  }
}

function parseArgs(argv) {
  const out = {
    bump: null,
    version: null,
    publishDir: process.env.DESKTOP_UPDATE_PUBLISH_DIR || "",
    skipBuild: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--skip-build") {
      out.skipBuild = true;
      continue;
    }
    if (arg === "--bump") {
      out.bump = (argv[i + 1] || "").trim();
      i++;
      continue;
    }
    if (arg === "--version") {
      out.version = (argv[i + 1] || "").trim();
      i++;
      continue;
    }
    if (arg === "--publish-dir") {
      out.publishDir = (argv[i + 1] || "").trim();
      i++;
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }

  return out;
}

function parseVersion(v) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpVersion(current, bumpType) {
  const parsed = parseVersion(current);
  if (!parsed) fail(`Invalid current version: ${current}`);

  if (bumpType === "patch") parsed.patch += 1;
  else if (bumpType === "minor") {
    parsed.minor += 1;
    parsed.patch = 0;
  } else if (bumpType === "major") {
    parsed.major += 1;
    parsed.minor = 0;
    parsed.patch = 0;
  } else {
    fail(`Invalid --bump value: ${bumpType}. Use patch, minor or major.`);
  }

  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function printHelp() {
  console.log(`
Usage:
  node scripts/desktop/release-win.cjs [options]

Options:
  --bump patch|minor|major   Incrementa versao em desktop-electron/package.json
  --version X.Y.Z            Define versao exata (sobrescreve --bump)
  --publish-dir <path>       Copia latest.yml + exe + blockmap para este diretorio
  --skip-build               Nao roda build (usa artefatos existentes em dist)
  -h, --help                 Mostra esta ajuda

Examples:
  npm run desktop:release:win
  npm run desktop:release:win -- --version 0.1.1
  npm run desktop:release:win -- --publish-dir "\\\\srv-arquivos\\updates\\bhash\\desktop\\win"
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const projectRoot = path.resolve(__dirname, "..", "..");
  const desktopPkgPath = path.join(projectRoot, "desktop-electron", "package.json");
  const desktopDistPath = path.join(projectRoot, "desktop-electron", "dist");

  if (!fs.existsSync(desktopPkgPath)) fail(`File not found: ${desktopPkgPath}`);
  const pkg = JSON.parse(fs.readFileSync(desktopPkgPath, "utf-8"));
  const currentVersion = String(pkg.version || "").trim();
  if (!parseVersion(currentVersion)) fail(`Invalid desktop-electron version: ${currentVersion}`);

  let nextVersion = currentVersion;
  if (args.version) {
    if (!parseVersion(args.version)) fail(`Invalid --version value: ${args.version}`);
    nextVersion = args.version;
  } else if (args.bump) {
    nextVersion = bumpVersion(currentVersion, args.bump);
  }

  if (nextVersion !== currentVersion) {
    pkg.version = nextVersion;
    fs.writeFileSync(desktopPkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
    console.log(`[desktop:release] version: ${currentVersion} -> ${nextVersion}`);
  } else {
    console.log(`[desktop:release] version unchanged: ${currentVersion}`);
  }

  if (!args.skipBuild) {
    if (fs.existsSync(desktopDistPath)) {
      fs.rmSync(desktopDistPath, { recursive: true, force: true });
    }
    ensureDir(desktopDistPath);
    run("npm", ["run", "desktop:dist:win"], projectRoot);
  }

  const files = fs.existsSync(desktopDistPath) ? fs.readdirSync(desktopDistPath) : [];
  const exeFile = files.find((name) => name.toLowerCase().endsWith(".exe") && name.includes(nextVersion));
  const latestYmlFile = files.find((name) => name.toLowerCase() === "latest.yml");
  const blockmapFile = files.find((name) => name.toLowerCase().endsWith(".exe.blockmap") && name.includes(nextVersion));

  if (!exeFile) fail(`Installer not found in ${desktopDistPath} for version ${nextVersion}`);
  if (!latestYmlFile) fail(`latest.yml not found in ${desktopDistPath}`);
  if (!blockmapFile) fail(`Blockmap not found in ${desktopDistPath} for version ${nextVersion}`);

  const exePath = path.join(desktopDistPath, exeFile);
  const latestPath = path.join(desktopDistPath, latestYmlFile);
  const blockmapPath = path.join(desktopDistPath, blockmapFile);

  console.log(`[desktop:release] artifacts ready:`);
  console.log(`  - ${exePath}`);
  console.log(`  - ${latestPath}`);
  console.log(`  - ${blockmapPath}`);

  const publishDir = args.publishDir.trim();
  if (publishDir) {
    ensureDir(publishDir);
    copyFile(exePath, path.join(publishDir, path.basename(exePath)));
    copyFile(latestPath, path.join(publishDir, path.basename(latestPath)));
    copyFile(blockmapPath, path.join(publishDir, path.basename(blockmapPath)));
    console.log(`[desktop:release] published to: ${publishDir}`);
  } else {
    console.log(
      "[desktop:release] DESKTOP_UPDATE_PUBLISH_DIR not set. Artifacts were built locally only."
    );
  }
}

main();
