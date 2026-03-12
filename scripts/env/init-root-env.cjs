const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..", "..");
const rootEnvPath = path.join(projectRoot, ".env");
const rootExamplePath = path.join(projectRoot, ".env.example");

if (fs.existsSync(rootEnvPath)) {
  console.log(`[env:init] .env já existe: ${rootEnvPath}`);
  process.exit(0);
}

if (fs.existsSync(rootExamplePath)) {
  fs.copyFileSync(rootExamplePath, rootEnvPath);
  console.log(`[env:init] .env criado a partir de .env.example`);
  process.exit(0);
}

console.error("[env:init] Nenhuma origem encontrada (.env.example).");
process.exit(1);
