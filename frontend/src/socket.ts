import { io } from "socket.io-client";
import { API_BASE } from "./api";

const ABSOLUTE_HTTP_RE = /^https?:\/\//i;

function resolveSocketUrl() {
  const envWsBase = import.meta.env.VITE_WS_BASE?.trim();
  if (envWsBase) return envWsBase;

  if (typeof window === "undefined") return "http://localhost:3000";

  if (ABSOLUTE_HTTP_RE.test(API_BASE)) {
    try {
      return new URL(API_BASE).origin;
    } catch {
      return API_BASE;
    }
  }

  return window.location.origin;
}

function resolveSocketPath() {
  return import.meta.env.VITE_WS_PATH?.trim() || "/socket.io";
}

const SOCKET_URL = resolveSocketUrl();
const SOCKET_PATH = resolveSocketPath();

export function createSocket(token: string) {
  return io(SOCKET_URL, {
    path: SOCKET_PATH,
    auth: { token },
  });
}
