import React, { useEffect, useState } from "react";
import { useAdminAuth } from "../adminAuth";
import { useTheme } from "../theme";
import { TopNav } from "../components/TopNav";

export function AdminLoginPage() {
  const { login, rememberLogin, setRememberLogin, saveRememberedCredentials, savedCredentials, autoLoginLoading } =
    useAdminAuth();
  const { theme, toggle, logoUrl } = useTheme();

  const [username, setUsername] = useState(() => savedCredentials?.username ?? "");
  const [password, setPassword] = useState(() => savedCredentials?.password ?? "");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockSavedCredentials = rememberLogin && !!savedCredentials;
  const formBusy = loading || autoLoginLoading;
  const showPasswordDisabled = formBusy || lockSavedCredentials;

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
      const apiErr = err as {
        response?: { status?: number; data?: { message?: string } };
        message?: string;
      };

      if (apiErr.response?.status === 401) {
        setError("Usuário ou senha inválidos");
      } else if (!apiErr.response) {
        setError("Falha de conexão com o servidor");
      } else {
        setError(apiErr.response?.data?.message ?? apiErr.message ?? "Falha ao entrar no painel");
      }
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
        title="BHASH • Admin"
        subtitle="Painel administrativo"
        theme={theme}
        onToggleTheme={toggle}
        logoSrc={logoUrl ?? "/logo_bhash.png"}
      />

      <div
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: "40px 16px 60px",
        }}
      >
        <div
          style={{
            width: "min(520px, 100%)",
            padding: 24,
            borderRadius: 18,
            border: "1px solid var(--border)",
            background: "var(--card-bg)",
            boxShadow: "var(--shadow)",
          }}
        >
          <h1 style={{ textAlign: "center", marginBottom: 20 }}>BHASH - Admin</h1>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="usuário"
              autoComplete="username"
              disabled={formBusy || lockSavedCredentials}
              style={{
                padding: 12,
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

            <div style={{ position: "relative" }}>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="senha"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                disabled={formBusy || lockSavedCredentials}
                style={{
                  width: "100%",
                  padding: "12px 44px 12px 12px",
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
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={showPasswordDisabled}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 24,
                  height: 24,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: "var(--muted)",
                  cursor: showPasswordDisabled ? "not-allowed" : "pointer",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {showPassword ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 12C3.9 8.6 7.4 6 12 6C16.6 6 20.1 8.6 22 12C20.1 15.4 16.6 18 12 18C7.4 18 3.9 15.4 2 12Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 12C3.9 8.6 7.4 6 12 6C16.6 6 20.1 8.6 22 12C20.1 15.4 16.6 18 12 18C7.4 18 3.9 15.4 2 12Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M4 4L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </div>

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
                padding: 12,
                borderRadius: 12,
                fontWeight: 800,
                background: "var(--btn-bg)",
                color: "var(--btn-fg)",
                border: "1px solid var(--border)",
                cursor: formBusy ? "not-allowed" : "pointer",
                opacity: formBusy ? 0.85 : 1,
              }}
            >
              {autoLoginLoading ? "Entrando automaticamente..." : loading ? "Entrando..." : "Entrar"}
            </button>

            {error && <div style={{ fontSize: 13, color: "#ff8a8a" }}>{error}</div>}

            <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
              Use as credenciais configuradas na instalação.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
