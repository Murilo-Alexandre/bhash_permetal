import { API_BASE } from "./api";

export type AppConfigDto = {
  primaryColor: string;
  primaryTextColor?: string;
  logoUrl?: string | null;
};

export function getApiBase() {
  return API_BASE;
}

export async function fetchAppConfig(): Promise<AppConfigDto> {
  const res = await fetch(`${API_BASE}/app-config`, { method: "GET" });
  if (!res.ok) throw new Error(`Failed to fetch /app-config (${res.status})`);
  return res.json();
}

/**
 * Converte logoUrl do backend (ex: "/static/uploads/logo_123.png")
 * em URL completa pro browser carregar (ex: "http://<backend>:3000/static/uploads/logo_123.png")
 * Mantém "/logo_bhash.png" como está (asset do Vite).
 */
export function resolveLogoUrl(logoUrl: string | null | undefined) {
  if (!logoUrl) return null;

  // URLs absolutas ou data URLs
  if (/^(https?:)?\/\//i.test(logoUrl) || logoUrl.startsWith("data:")) return logoUrl;

  // arquivo do Vite em public/
  if (logoUrl === "/logo_bhash.png") return logoUrl;

  // arquivos servidos pelo backend (ex /static/uploads/...)
  if (logoUrl.startsWith("/static/")) return `${API_BASE}${logoUrl}`;

  // fallback: se vier algo começando com "/" e não for asset do Vite, assume backend
  if (logoUrl.startsWith("/")) return `${API_BASE}${logoUrl}`;

  return logoUrl;
}
