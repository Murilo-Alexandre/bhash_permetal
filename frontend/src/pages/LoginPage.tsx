import React, { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { useTheme } from "../theme";
import { TopNav } from "../components/TopNav";

export function LoginPage() {
  const { login, rememberLogin, setRememberLogin, saveRememberedCredentials, savedCredentials, autoLoginLoading } =
    useAuth();
  const { theme, toggleTheme, resolvedLogoUrl } = useTheme();

  const [username, setUsername] = useState(() => savedCredentials?.username ?? "");
  const [password, setPassword] = useState(() => savedCredentials?.password ?? "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockSavedCredentials = rememberLogin && !!savedCredentials;
  const formBusy = loading || autoLoginLoading;

  useEffect(() => {
    if (rememberLogin && savedCredentials) {
      setUsername(savedCredentials.username);
      setPassword(savedCredentials.password);
    }
  }, [rememberLogin, savedCredentials]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } }; message?: string };
      const msg = apiErr.response?.data?.message ?? apiErr.message ?? "Falha no login";
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }

  function onToggleRememberLogin(enabled: boolean) {
    if (enabled) {
      const user = username.trim();
      if (user && password) {
        saveRememberedCredentials(user, password);
      }
    }
    setRememberLogin(enabled);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopNav
        title="BHASH • Chat"
        subtitle=""
        theme={theme}
        onToggleTheme={toggleTheme}
        logoSrc={resolvedLogoUrl}
      />

      <div
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: "36px 16px 56px",
        }}
      >
        <div
          style={{
            width: "min(520px, 100%)",
            padding: 22,
            borderRadius: 18,
            border: "1px solid var(--border)",
            background: "var(--card-bg)",
            boxShadow: "var(--shadow)",
            backdropFilter: "blur(10px)",
          }}
        >
          <h1 style={{ margin: 0, marginBottom: 14, textAlign: "center", letterSpacing: 0.2 }}>
            BHASH - Chat
          </h1>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="usuário"
              autoComplete="username"
              disabled={formBusy || lockSavedCredentials}
              style={{
                padding: "12px 12px",
                borderRadius: 12,
                border: lockSavedCredentials ? "1px dashed var(--border)" : "1px solid var(--input-border)",
                background: lockSavedCredentials ? "rgba(127, 127, 127, 0.14)" : "var(--input-bg)",
                color: lockSavedCredentials ? "var(--muted)" : "var(--input-fg)",
                outline: "none",
                cursor: lockSavedCredentials ? "not-allowed" : "text",
                opacity: lockSavedCredentials ? 0.78 : 1,
                transition: "all .2s ease",
              }}
            />

            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="senha"
              type="password"
              autoComplete="current-password"
              disabled={formBusy || lockSavedCredentials}
              style={{
                padding: "12px 12px",
                borderRadius: 12,
                border: lockSavedCredentials ? "1px dashed var(--border)" : "1px solid var(--input-border)",
                background: lockSavedCredentials ? "rgba(127, 127, 127, 0.14)" : "var(--input-bg)",
                color: lockSavedCredentials ? "var(--muted)" : "var(--input-fg)",
                outline: "none",
                cursor: lockSavedCredentials ? "not-allowed" : "text",
                opacity: lockSavedCredentials ? 0.78 : 1,
                transition: "all .2s ease",
              }}
            />

            <label
              style={{
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 13,
                color: rememberLogin ? "var(--fg)" : "var(--muted)",
                userSelect: "none",
                width: "fit-content",
                cursor: formBusy ? "not-allowed" : "pointer",
                transition: "color .2s ease",
              }}
            >
              <span
                style={{
                  position: "relative",
                  width: 42,
                  height: 24,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberLogin}
                  onChange={(e) => onToggleRememberLogin(e.target.checked)}
                  disabled={formBusy}
                  style={{
                    position: "absolute",
                    inset: 0,
                    margin: 0,
                    opacity: 0,
                    width: "100%",
                    height: "100%",
                    cursor: formBusy ? "not-allowed" : "pointer",
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: 999,
                    border: "1px solid var(--border)",
                    background: rememberLogin ? "var(--btn-bg)" : "var(--input-bg)",
                    boxShadow: rememberLogin ? "0 0 0 3px rgba(255,255,255,0.06) inset" : "none",
                    opacity: formBusy ? 0.75 : 1,
                    transition: "all .2s ease",
                  }}
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 3,
                    left: rememberLogin ? 21 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "var(--btn-fg)",
                    boxShadow: "0 1px 3px rgba(0,0,0,.35)",
                    transition: "left .2s ease",
                  }}
                />
              </span>
              Login automático
            </label>

            <button
              type="submit"
              disabled={formBusy || !username.trim() || !password}
              style={{
                marginTop: 6,
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                cursor: formBusy ? "not-allowed" : "pointer",
                fontWeight: 800,
                background: "var(--btn-bg)",
                color: "var(--btn-fg)",
                opacity: formBusy ? 0.85 : 1,
              }}
            >
              {autoLoginLoading ? "Entrando automaticamente..." : loading ? "Entrando..." : "Entrar"}
            </button>

            {error && <div style={{ marginTop: 6, fontSize: 13, color: "#ff8a8a" }}>{error}</div>}

            <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
              Use as credenciais fornecidas pelo administrador.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
