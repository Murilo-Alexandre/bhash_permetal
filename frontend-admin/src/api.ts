import axios from "axios";

const LOCALHOST_BASE_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|::1|\[::1\])(?::\d{1,5})?$/i;
const LOCALHOST_HOST_RE = /^(?:localhost|127\.0\.0\.1|::1|\[::1\])$/i;

function deriveSiblingChatApiBase() {
  if (typeof window === "undefined") return null;

  const { hostname, protocol } = window.location;
  if (protocol !== "http:") return null;
  if (LOCALHOST_HOST_RE.test(hostname)) return null;

  if (hostname.startsWith("admin-")) {
    return "/api";
  }

  return null;
}

function resolveApiBase() {
  const envBase = import.meta.env.VITE_API_BASE?.trim();
  const runtimeBase = (() => {
    if (typeof window === "undefined") return "http://localhost:3000";
    const isLocalhost = LOCALHOST_HOST_RE.test(window.location.hostname);
    // Em HTTPS fora de localhost, assume reverse proxy interno em /api.
    if (window.location.protocol === "https:" && !isLocalhost) return "/api";
    const siblingChatApiBase = deriveSiblingChatApiBase();
    if (siblingChatApiBase) return siblingChatApiBase;
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  })();

  if (!envBase) return runtimeBase;

  const runningOnLocalhost =
    typeof window === "undefined" || LOCALHOST_HOST_RE.test(window.location.hostname);

  // Evita quebrar acesso via LAN quando .env estiver fixo em localhost.
  if (LOCALHOST_BASE_RE.test(envBase) && !runningOnLocalhost) {
    return runtimeBase;
  }

  return envBase;
}

export const API_BASE = resolveApiBase();

export function createAdminApi(token?: string) {
  return axios.create({
    baseURL: API_BASE,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}
