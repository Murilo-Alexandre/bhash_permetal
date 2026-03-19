const http = require("http");
const fs = require("fs");
const path = require("path");
const httpProxy = require("http-proxy");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 5174);
const DIST_DIR = path.join(__dirname, "dist");
const API_TARGET = process.env.ADMIN_PROXY_TARGET || "http://127.0.0.1:3000";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
};

function sendError(res, statusCode, message) {
  if (res.headersSent) return;
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function safePathname(rawUrl) {
  try {
    const url = new URL(rawUrl, "http://localhost");
    return decodeURIComponent(url.pathname);
  } catch {
    return "/";
  }
}

function filePathFromRequest(pathname) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const relativePath = normalized.replace(/^\/+/, "");
  const resolved = path.resolve(DIST_DIR, relativePath);
  if (!resolved.startsWith(DIST_DIR)) return null;
  return resolved;
}

function shouldServeIndex(pathname) {
  return pathname === "/" || !path.posix.basename(pathname).includes(".");
}

const proxy = httpProxy.createProxyServer({
  target: API_TARGET,
  changeOrigin: true,
  ws: true,
  xfwd: true,
});

proxy.on("error", (_err, req, res) => {
  if (res && !res.headersSent) {
    sendError(res, 502, `Proxy error for ${req.url}`);
    return;
  }

  if (res && typeof res.destroy === "function") {
    res.destroy();
  }
});

const server = http.createServer((req, res) => {
  const pathname = safePathname(req.url || "/");
  const originalUrl = new URL(req.url || "/", "http://localhost");

  if (pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, scope: "admin-static-proxy" }));
    return;
  }

  if (pathname.startsWith("/api")) {
    req.url = `${pathname.replace(/^\/api/, "") || "/"}${originalUrl.search}`;
    proxy.web(req, res);
    return;
  }

  if (pathname.startsWith("/socket.io")) {
    req.url = `${pathname}${originalUrl.search}`;
    proxy.web(req, res);
    return;
  }

  const resolvedPath = shouldServeIndex(pathname)
    ? path.join(DIST_DIR, "index.html")
    : filePathFromRequest(pathname);

  if (!resolvedPath) {
    sendError(res, 403, "Forbidden");
    return;
  }

  fs.stat(resolvedPath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      if (shouldServeIndex(pathname)) {
        sendError(res, 404, "Not Found");
        return;
      }

      const fallbackPath = path.join(DIST_DIR, "index.html");
      fs.stat(fallbackPath, (fallbackErr, fallbackStats) => {
        if (fallbackErr || !fallbackStats.isFile()) {
          sendError(res, 404, "Not Found");
          return;
        }
        res.writeHead(200, {
          "Content-Type": CONTENT_TYPES[".html"],
          "Cache-Control": "no-cache",
        });
        fs.createReadStream(fallbackPath).pipe(res);
      });
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    fs.createReadStream(resolvedPath).pipe(res);
  });
});

server.on("upgrade", (req, socket, head) => {
  const pathname = safePathname(req.url || "/");
  const originalUrl = new URL(req.url || "/", "http://localhost");

  if (!pathname.startsWith("/socket.io")) {
    socket.destroy();
    return;
  }

  req.url = `${pathname}${originalUrl.search}`;
  proxy.ws(req, socket, head);
});

server.listen(PORT, HOST, () => {
  console.log(`[bhash-admin] listening on http://${HOST}:${PORT} -> ${API_TARGET}`);
});
