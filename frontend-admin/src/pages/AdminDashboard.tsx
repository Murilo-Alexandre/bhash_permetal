import { useEffect, useState } from "react";
import { useAdminAuth } from "../adminAuth";

type Ping = { ok: boolean; scope: string };
type AppConfig = { primaryColor: string; primaryTextColor: string; logoUrl?: string | null };

export function AdminDashboard() {
  const { api, logout } = useAdminAuth();
  const [ping, setPing] = useState<Ping | null>(null);
  const [cfg, setCfg] = useState<AppConfig | null>(null);

  useEffect(() => {
    (async () => {
      const [p, c] = await Promise.all([
        api.get<Ping>("/admin/ping"),
        api.get<AppConfig>("/app-config"),
      ]);
      setPing(p.data);
      setCfg(c.data);
    })().catch(() => logout());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="admin-page">
      <h1 style={{ margin: 0, marginBottom: 12 }}>Dashboard</h1>

      <div className="admin-grid12">
        <Card title="Backend /admin/ping" colSpan={6}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <StatusDot ok={!!ping?.ok} />
            <div>
              <div style={{ fontWeight: 900 }}>
                {ping ? (ping.ok ? "Online" : "Offline") : "..."}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                scope: {ping?.scope ?? "-"}
              </div>
            </div>
          </div>
        </Card>

        <Card title="AppConfig atual" colSpan={6}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: cfg?.primaryColor ?? "#001F3F" }} />
              <div>
                <div style={{ fontWeight: 900 }}>{cfg?.primaryColor ?? "..."}</div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>primaryColor</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 4,
                  background: cfg?.primaryTextColor ?? "#F0F0F0",
                  border: "1px solid var(--border)",
                }}
              />
              <div>
                <div style={{ fontWeight: 900 }}>{cfg?.primaryTextColor ?? "#F0F0F0"}</div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>primaryTextColor</div>
              </div>
            </div>

            <div style={{ color: "var(--muted)", fontSize: 13, wordBreak: "break-all" }}>
              logoUrl: {cfg?.logoUrl ?? "(vazio — usando /logo_bhash.png no front)"}
            </div>
          </div>
        </Card>

        <Card title="Próximos passos" colSpan={12}>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)" }}>
            <li>Config do App (alterar cor + upload de logo)</li>
            <li>CRUD de usuários do chat (listar/criar/desativar/reset senha)</li>
            <li>Auditoria (quem mudou o quê / quando)</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, colSpan, children }: { title: string; colSpan: number; children: any }) {
  return (
    <div
      className="admin-card"
      style={{
        gridColumn: `span ${colSpan}`,
        padding: 16,
        borderRadius: 18,
        border: "1px solid var(--border)",
        background: "var(--card-bg)",
        boxShadow: "var(--shadow)",
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <div
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        background: ok ? "#22c55e" : "#ef4444",
        boxShadow: ok ? "0 0 0 6px rgba(34,197,94,0.12)" : "0 0 0 6px rgba(239,68,68,0.12)",
      }}
    />
  );
}
