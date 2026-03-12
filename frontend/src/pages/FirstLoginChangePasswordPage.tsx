import { useState } from "react";
import { useAuth } from "../auth";
import { useTheme } from "../theme";
import { TopNav } from "../components/TopNav";

export function FirstLoginChangePasswordPage({ onDone }: { onDone: () => void }) {
  const { api, logoff } = useAuth();
  const { theme, toggleTheme, resolvedLogoUrl } = useTheme();

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);

    if (password.length < 8) return setMsg("A senha precisa ter pelo menos 8 caracteres.");
    if (password !== password2) return setMsg("As senhas não conferem.");

    setSaving(true);
    try {
      await api.put("/me/password", { password });
      setMsg("✅ Senha atualizada. Liberando acesso…");
      onDone();
    } catch (e: unknown) {
      const apiErr = e as { response?: { data?: { message?: string } } };
      setMsg(apiErr.response?.data?.message ?? "Falha ao atualizar senha");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopNav title="BHASH • Chat" subtitle="" theme={theme} onToggleTheme={toggleTheme} logoSrc={resolvedLogoUrl} />

      <div style={{ width: "min(520px, 100%)", margin: "40px auto", padding: "0 16px" }}>
        <div
          style={{
            padding: 20,
            borderRadius: 18,
            border: "1px solid var(--border)",
            background: "var(--card-bg)",
            boxShadow: "var(--shadow)",
          }}
        >
          <h1 style={{ margin: 0, marginBottom: 8 }}>Troca de senha obrigatória</h1>

          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
            Por segurança, você precisa definir uma nova senha para continuar.
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="nova senha (mín. 8)"
              type="password"
              autoComplete="new-password"
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid var(--input-border)",
                background: "var(--input-bg)",
                color: "var(--input-fg)",
                outline: "none",
              }}
            />

            <input
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="confirmar senha"
              type="password"
              autoComplete="new-password"
              style={{
                padding: 12,
                borderRadius: 12,
                border: "1px solid var(--input-border)",
                background: "var(--input-bg)",
                color: "var(--input-fg)",
                outline: "none",
              }}
            />

            <button
              onClick={save}
              disabled={saving}
              style={{
                marginTop: 6,
                padding: 12,
                borderRadius: 12,
                fontWeight: 900,
                background: "var(--btn-bg)",
                color: "var(--btn-fg)",
                border: "1px solid var(--border)",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.85 : 1,
              }}
            >
              {saving ? "Salvando..." : "Salvar e continuar"}
            </button>

            <button
              onClick={logoff}
              style={{
                marginTop: 6,
                padding: 12,
                borderRadius: 12,
                fontWeight: 800,
                background: "rgba(255, 0, 0, 0.83)",
                color: "var(--fg)",
                border: "1px solid var(--border)",
                cursor: "pointer",
              }}
            >
              Logoff
            </button>

            {msg && <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>{msg}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
