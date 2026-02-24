export function AdminAuditPage() {
  return (
    <div style={{ width: "min(1100px, 100%)", margin: "0 auto", padding: "18px 16px 56px" }}>
      <h1 style={{ margin: 0, marginBottom: 12 }}>Auditoria</h1>

      <div
        style={{
          padding: 16,
          borderRadius: 18,
          border: "1px solid var(--border)",
          background: "var(--card-bg)",
          boxShadow: "var(--shadow)",
          color: "var(--muted)",
        }}
      >
        Em breve: histórico de alterações (quem mudou o quê / quando).
      </div>
    </div>
  );
}