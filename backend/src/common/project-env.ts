import { existsSync, readFileSync } from 'fs';
import { basename, resolve } from 'path';

function parseEnvContent(raw: string) {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
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

export function resolveProjectRoot(cwd = process.cwd()) {
  const current = resolve(cwd);
  if (existsSync(resolve(current, 'package.json')) && existsSync(resolve(current, 'backend'))) {
    return current;
  }

  if (basename(current).toLowerCase() === 'backend' && existsSync(resolve(current, '..', 'package.json'))) {
    return resolve(current, '..');
  }

  return current;
}

export function resolveProjectEnvPaths(cwd = process.cwd()) {
  const root = resolveProjectRoot(cwd);
  return [resolve(root, '.env')];
}

export function loadProjectEnv(cwd = process.cwd()) {
  const envPaths = resolveProjectEnvPaths(cwd);

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;

    try {
      const parsed = parseEnvContent(readFileSync(envPath, 'utf-8'));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    } catch {
      // no-op: invalidação de arquivo não deve derrubar bootstrap de configuração.
    }
  }
}
