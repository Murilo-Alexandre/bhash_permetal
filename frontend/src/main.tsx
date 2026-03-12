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

const shouldRegisterServiceWorker =
  "serviceWorker" in navigator && (import.meta.env.PROD || import.meta.env.VITE_ENABLE_SW_DEV === "true");

if (shouldRegisterServiceWorker) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
