import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const useHttps = env.VITE_DEV_HTTPS === "true";
  const proxyTarget = env.VITE_PROXY_TARGET?.trim() || "http://127.0.0.1:3000";

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5174,
      strictPort: true,
      allowedHosts: true,
      https: useHttps ? {} : undefined,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/socket.io": {
          target: proxyTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 4174,
      strictPort: true,
      allowedHosts: true,
      https: useHttps ? {} : undefined,
    },
  };
});
