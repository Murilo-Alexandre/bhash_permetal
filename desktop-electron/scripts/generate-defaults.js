const fs = require("fs");
const path = require("path");

const DEFAULT_SERVER_URL = "http://localhost:5173";
const DEFAULT_UPDATE_URL = "https://updates.bhash.com/desktop/win";

function parseEnvContent(content) {
  const out = {};
  const lines = content.split(/\r?\n/);

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
  try {
    return parseEnvContent(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

function pickEnvValue(fileEnv, keys) {
  for (const key of keys) {
    const processValue = process.env[key];
    if (typeof processValue === "string" && processValue.trim()) return processValue.trim();
  }
  for (const key of keys) {
    const fileValue = fileEnv[key];
    if (typeof fileValue === "string" && fileValue.trim()) return fileValue.trim();
  }
  return "";
}

function run() {
  const desktopRoot = path.resolve(__dirname, "..");
  const projectRoot = path.resolve(desktopRoot, "..");

  const envCandidates = [
    path.join(projectRoot, ".env"),
    path.join(projectRoot, "backend", ".env"),
    path.join(desktopRoot, ".env"),
  ];

  const fileEnv = {};
  for (const candidate of envCandidates) {
    Object.assign(fileEnv, readEnvFile(candidate));
  }

  const serverUrl =
    pickEnvValue(fileEnv, ["BHASH_DESKTOP_SERVER_URL", "CHAT_WEB_URL", "APP_CHAT_URL"]) ||
    DEFAULT_SERVER_URL;
  const updateUrl =
    pickEnvValue(fileEnv, ["BHASH_DESKTOP_UPDATE_URL", "DESKTOP_UPDATE_URL"]) ||
    DEFAULT_UPDATE_URL;

  const payload = {
    serverUrl,
    updateUrl,
  };

  const outputPath = path.join(desktopRoot, "src", "defaults.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

  console.log(`[desktop-defaults] ${outputPath}`);
  console.log(`[desktop-defaults] serverUrl=${serverUrl}`);
  console.log(`[desktop-defaults] updateUrl=${updateUrl}`);
}

run();
