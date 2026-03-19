import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth";
import { ThemeProvider } from "./theme";
import "./index.css";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);

const isDesktopApp = typeof window !== "undefined" && !!window.bhashDesktop?.isDesktop;
const shouldRegisterServiceWorker =
  !isDesktopApp &&
  "serviceWorker" in navigator &&
  (import.meta.env.PROD || import.meta.env.VITE_ENABLE_SW_DEV === "true");

async function disableDesktopServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
  } catch {
    // no-op
  }

  if (!("caches" in window)) return;

  try {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key).catch(() => false)));
  } catch {
    // no-op
  }
}

window.addEventListener("load", () => {
  if (isDesktopApp) {
    void disableDesktopServiceWorker();
    return;
  }

  if (shouldRegisterServiceWorker) {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }
});
