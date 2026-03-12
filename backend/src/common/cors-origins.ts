const LAN_ORIGIN_PATTERN =
  /^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|[a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::\d{1,5})?$/i;

const DEFAULT_CORS_ORIGINS = 'http://localhost:5173,http://localhost:5174,LAN';

export function parseCorsOrigins(value?: string): Array<string | RegExp> {
  return (value ?? DEFAULT_CORS_ORIGINS)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const normalized = entry.toUpperCase();
      if (normalized === 'LAN') return LAN_ORIGIN_PATTERN;
      if (entry === '*') return /.*/;
      return entry;
    });
}
