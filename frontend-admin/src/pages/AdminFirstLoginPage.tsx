import { useEffect, useState } from "react";
import { useAdminAuth } from "../adminAuth";

type Me = {
  id: string;
  username: string;
  name: string;
  isSuperAdmin: boolean;
  mustChangeCredentials: boolean;
};

export function AdminFirstLoginPage() {
  const { api, logout, logoff } = useAdminAuth();

  const [me, setMe] = useState<Me | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await api.get<Me>("/admin/auth/me");
      setMe(res.data);
      setUsername(res.data.username ?? "");
    })().catch(() => logout());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setMsg(null);

    if (!me?.isSuperAdmin) {
      setMsg("Somente o SuperAdmin precisa fazer isso.");
      return;
    }

    const u = username.trim();
    if (u.length < 3) return setMsg("Username precisa ter pelo menos 3 caracteres.");
    if (password.length < 12) return setMsg("Senha precisa ter pelo menos 12 caracteres.");
    if (password !== password2) return setMsg("As senhas não conferem.");

    setSaving(true);
    try {
      await api.put("/admin/me/credentials", { username: u, password });

      setMsg("✅ Credenciais atualizadas. Faça login novamente…");

      // 🔒 mata token antigo (evita inconsistência)
      setTimeout(() => logoff(), 700);
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? "Falha ao atualizar credenciais");
    } finally {
      setSaving(false);
    }
  }

  return (
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
        <h1 style={{ margin: 0, marginBottom: 8 }}>Primeiro acesso</h1>

        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
          Por segurança, você precisa trocar <b>usuário</b> e <b>senha</b> do SuperAdmin para continuar.
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="novo usuário"
            autoComplete="username"
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="nova senha (mín. 12, com maiúsc/minúsc/número/símbolo)"
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

          {msg && <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}
