import { useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "../adminAuth";

type TabKey = "companies" | "departments";

type OrgItem = {
  id: string;
  name: string;
  createdAt: string;
};

const PT_BR_COLLATOR = new Intl.Collator("pt-BR", {
  sensitivity: "base",
  numeric: true,
});

function compareAlpha(a?: string | null, b?: string | null) {
  return PT_BR_COLLATOR.compare((a ?? "").trim(), (b ?? "").trim());
}

export function AdminOrgPage() {
  const { api } = useAdminAuth();

  const [tab, setTab] = useState<TabKey>("companies");
  const [q, setQ] = useState("");

  const [items, setItems] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<OrgItem | null>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(() => window.innerWidth <= 900);
  const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth > 900);

  const basePath = tab === "companies" ? "/admin/org/companies" : "/admin/org/departments";

  useEffect(() => {
    const onResize = () => {
      const nextMobile = window.innerWidth <= 900;
      setIsMobileLayout(nextMobile);
      if (!nextMobile) setFiltersOpen(true);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await api.get<{ ok: boolean; items: OrgItem[] }>(basePath);
      setItems([...(res.data.items ?? [])].sort((a, b) => compareAlpha(a.name, b.name)));
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => it.name.toLowerCase().includes(s));
  }, [items, q]);

  const headerRight = useMemo(() => {
    if (loading) return "Carregando…";
    return `${filtered.length} item${filtered.length === 1 ? "" : "s"}`;
  }, [loading, filtered.length]);

  return (
    <div className="admin-page">
      <h1 style={{ margin: 0, marginBottom: 12 }}>Empresa / Setor</h1>

      <div className="admin-grid12">
        <Card title="Navegação" colSpan={12}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => setTab("companies")} style={segBtn(tab === "companies")}>
              Empresas
            </button>
            <button onClick={() => setTab("departments")} style={segBtn(tab === "departments")}>
              Setores
            </button>
          </div>
        </Card>

        <Card
          title={tab === "companies" ? "Empresas" : "Setores"}
          colSpan={12}
          right={
            <div className="admin-orgCardRight">
              <button
                className="admin-orgCreateBtn"
                onClick={() => setCreateOpen(true)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--btn-bg)",
                  color: "var(--btn-fg)",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                + Adicionar
              </button>
              <div style={{ color: "var(--muted)" }}>{headerRight}</div>
            </div>
          }
        >
          {isMobileLayout ? (
            <button
              className={`admin-filterToggleBtn ${filtersOpen ? "is-open" : ""}`}
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
            >
              <span className="admin-filterToggleBtn__icon" aria-hidden="true">
                <FilterIcon />
              </span>
              <span>Filtros</span>
              <span className="admin-filterToggleBtn__state">{filtersOpen ? "Ocultar" : "Mostrar"}</span>
            </button>
          ) : null}

          {!isMobileLayout || filtersOpen ? (
            <div className="admin-orgFiltersRow">
              <div className="admin-searchField" style={{ flex: 1, minWidth: 260 }}>
                <span className="admin-searchField__icon" aria-hidden="true">
                  <SearchIcon />
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={tab === "companies" ? "Buscar empresa..." : "Buscar setor..."}
                  className="admin-searchField__input"
                />
              </div>
            </div>
          ) : null}

          {msg ? <div style={{ marginBottom: 10, color: "#ff8a8a", fontSize: 13 }}>{msg}</div> : null}

          {!isMobileLayout ? (
            <div className="admin-orgTableWrap">
              <table className="admin-orgTable">
                <colgroup>
                  <col style={{ width: "60%" }} />
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "16%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <Th className="admin-orgTh">Nome</Th>
                    <Th className="admin-orgTh admin-orgTh--center">Criado</Th>
                    <Th className="admin-orgTh admin-orgTh--center">Ações</Th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <Td colSpan={3} className="admin-orgTd admin-orgTd--empty">
                        Carregando…
                      </Td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <Td colSpan={3} className="admin-orgTd admin-orgTd--empty">
                        Nenhum item encontrado.
                      </Td>
                    </tr>
                  ) : (
                    filtered.map((it) => (
                      <tr key={it.id} className="admin-orgRow">
                        <Td className="admin-orgTd admin-orgTd--name">{it.name}</Td>
                        <Td className="admin-orgTd admin-orgTd--center admin-orgTd--muted">
                          {fmt(it.createdAt)}
                        </Td>

                        <Td className="admin-orgTd admin-orgTd--center">
                          <div className="admin-orgActionGroup">
                            <IconButton title="Editar" onClick={() => setEditItem(it)} tone="neutral">
                              <IconPencil />
                            </IconButton>

                            <IconButton
                              title="Excluir"
                              tone="danger"
                              onClick={async () => {
                                const ok = confirm(`Excluir "${it.name}"? Essa ação não pode ser desfeita.`);
                                if (!ok) return;
                                await api.delete(`${basePath}/${it.id}`);
                                await load();
                              }}
                            >
                              <IconTrash />
                            </IconButton>
                          </div>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-orgMobileList">
              {loading ? (
                <div className="admin-orgMobileEmpty">Carregando…</div>
              ) : filtered.length === 0 ? (
                <div className="admin-orgMobileEmpty">Nenhum item encontrado.</div>
              ) : (
                filtered.map((it) => (
                  <article key={it.id} className="admin-orgMobileCard">
                    <div className="admin-orgMobileCard__name">{it.name}</div>
                    <div className="admin-orgMobileCard__meta">Criado em {fmt(it.createdAt)}</div>
                    <div className="admin-orgActionGroup">
                      <IconButton title="Editar" onClick={() => setEditItem(it)} tone="neutral">
                        <IconPencil />
                      </IconButton>

                      <IconButton
                        title="Excluir"
                        tone="danger"
                        onClick={async () => {
                          const ok = confirm(`Excluir "${it.name}"? Essa ação não pode ser desfeita.`);
                          if (!ok) return;
                          await api.delete(`${basePath}/${it.id}`);
                          await load();
                        }}
                      >
                        <IconTrash />
                      </IconButton>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </Card>
      </div>

      {createOpen && (
        <OrgModal
          title={tab === "companies" ? "Adicionar empresa" : "Adicionar setor"}
          confirmText="Salvar"
          onClose={() => setCreateOpen(false)}
          onConfirm={async (payload) => {
            await api.post(basePath, payload);
            setCreateOpen(false);
            await load();
          }}
        />
      )}

      {editItem && (
        <OrgModal
          title={tab === "companies" ? "Editar empresa" : "Editar setor"}
          confirmText="Salvar"
          initial={{ name: editItem.name }}
          onClose={() => setEditItem(null)}
          onConfirm={async (payload) => {
            await api.patch(`${basePath}/${editItem.id}`, payload);
            setEditItem(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

/** ===== UI helpers (mesmo estilo do AdminUsersPage) ===== */
function Card({
  title,
  colSpan,
  right,
  children,
}: {
  title: string;
  colSpan: number;
  right?: React.ReactNode;
  children: any;
}) {
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
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        {right ? <div>{right}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Th(props: any) {
  return (
    <th
      {...props}
      style={{
        padding: "10px 10px",
        color: "var(--fg)",
        fontWeight: 900,
        borderBottom: "1px solid var(--border)",
        ...props.style,
      }}
    />
  );
}

function Td(props: any) {
  return (
    <td
      {...props}
      style={{
        padding: "14px 10px",
        verticalAlign: "middle",
        ...props.style,
      }}
    />
  );
}

function segBtn(active: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: active ? "rgba(255,255,255,0.08)" : "transparent",
    color: "var(--fg)",
    cursor: "pointer",
    fontWeight: 900,
  };
}

function fmt(d: string) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function IconButton({
  title,
  onClick,
  tone = "neutral",
  children,
}: {
  title: string;
  onClick: () => void;
  tone?: "neutral" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`admin-actionBtn ${tone === "neutral" ? "is-neutral" : ""} ${tone === "danger" ? "is-danger" : ""}`}
    >
      {children}
    </button>
  );
}

/** ===== Modal simples de criar/editar ===== */
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: any }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          borderRadius: 18,
          border: "1px solid var(--border)",
          background: "var(--card-bg)",
          boxShadow: "var(--shadow)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 14,
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--fg)",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

function OrgModal({
  title,
  confirmText,
  onClose,
  onConfirm,
  initial,
}: {
  title: string;
  confirmText: string;
  onClose: () => void;
  onConfirm: (payload: any) => Promise<void>;
  initial?: { name?: string };
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    const n = name.trim();
    if (n.length < 2) return setErr("Nome deve ter pelo menos 2 caracteres.");

    setSaving(true);
    try {
      await onConfirm({ name: n });
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
        <div style={{ gridColumn: "span 12" }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>Nome</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Exemplo: Vendas / Expedição / BHASH Interprises"
            style={{
              width: "100%",
              padding: "12px 12px",
              borderRadius: 12,
              border: "1px solid var(--input-border)",
              background: "var(--input-bg)",
              color: "var(--input-fg)",
              outline: "none",
            }}
          />
        </div>

        {err ? (
          <div style={{ gridColumn: "span 12", color: "#ff8a8a", fontSize: 13 }}>
            {err}
          </div>
        ) : null}

        <div style={{ gridColumn: "span 12", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: "12px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--fg)",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            Cancelar
          </button>

          <button
            onClick={submit}
            disabled={saving}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--btn-bg)",
              color: "var(--btn-fg)",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 900,
              opacity: saving ? 0.85 : 1,
            }}
          >
            {saving ? "Salvando..." : confirmText}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/** ===== ÍCONES (SVG) — sem emoji ===== */
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.6-3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4.2l10-10a2 2 0 0 0 0-2.83l-1.37-1.37a2 2 0 0 0-2.83 0L4 15.8V20Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m12.5 7.5 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M9 3h6a1 1 0 0 1 1 1v3H8V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
      <path d="m6 7 1 12a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L18 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
