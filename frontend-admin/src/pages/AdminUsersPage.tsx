import { useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "../adminAuth";

type UserRow = {
  id: string;
  username: string;
  name: string; // Nome Completo
  department?: { id: string; name: string } | string | null;
  company?: { id: string; name: string } | string | null;

  // (opcional mas recomendado) se o backend já manda os IDs:
  companyId?: string | null;
  departmentId?: string | null;
  email?: string | null;
  extension?: string | null;

  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
};

type Paged<T> = {
  ok: boolean;
  page: number;
  pageSize: number;
  total: number;
  items: T[];
};

type ActiveFilter = "all" | "active" | "inactive";

type CompanyItem = { id: string; name: string };
type DepartmentItem = { id: string; name: string };

export function AdminUsersPage() {
  const { api } = useAdminAuth();

  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

  // ✅ filtros novos (empresa / setor)
  const [companyId, setCompanyId] = useState<string>("");     // "" = todas
  const [departmentId, setDepartmentId] = useState<string>(""); // "" = todos

  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [data, setData] = useState<Paged<UserRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  async function loadOrgs() {
    try {
      const [cRes, dRes] = await Promise.all([
        api.get<{ ok: boolean; items: CompanyItem[] }>("/admin/org/companies"),
        api.get<{ ok: boolean; items: DepartmentItem[] }>("/admin/org/departments"),
      ]);

      setCompanies(cRes.data.items ?? []);
      setDepartments(dRes.data.items ?? []);
    } catch (e) {
      setCompanies([]);
      setDepartments([]);
      setMsg("Falha ao carregar empresas/setores (verifique endpoints do backend).");
    }
  }

  async function load() {
    setLoading(true);
    setMsg(null);
    try {
      const params: any = { page, pageSize };

      const qs = q.trim();
      if (qs) params.q = qs;

      if (activeFilter === "active") params.active = "true";
      if (activeFilter === "inactive") params.active = "false";

      // ✅ filtros empresa/setor combinados
      if (companyId) params.companyId = companyId;
      if (departmentId) params.departmentId = departmentId;

      const res = await api.get<Paged<UserRow>>("/admin/users", { params });
      setData(res.data);
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? "Falha ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, activeFilter, companyId, departmentId]);

  useEffect(() => {
    // carrega combos (empresa/setor) ao entrar e quando muda empresa
    loadOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    // quando digita busca, volta pra pagina 1 e recarrega com debounce leve
    const t = setTimeout(() => {
      setPage(1);
      load();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const items = data?.items ?? [];

  const headerRight = useMemo(() => {
    if (loading) return "Carregando…";
    return `${total} usuário${total === 1 ? "" : "s"}`;
  }, [loading, total]);

  return (
    <div style={{ width: "min(1100px, 100%)", margin: "0 auto", padding: "18px 16px 56px" }}>
      <h1 style={{ margin: 0, marginBottom: 12 }}>Usuários</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
        <Card title="Filtros" colSpan={12} right={headerRight}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder='🔍Buscar'
              style={{
                flex: 1,
                minWidth: 260,
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid var(--input-border)",
                background: "var(--input-bg)",
                color: "var(--input-fg)",
                outline: "none",
              }}
            />

            <select
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setDepartmentId(""); // reseta setor ao trocar empresa
                setPage(1);
              }}
              style={{
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid var(--input-border)",
                background: "var(--input-bg)",
                color: "var(--input-fg)",
                outline: "none",
                minWidth: 180,
              }}
            >
              <option value="">Todas as empresas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setPage(1);
              }}
              style={{
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid var(--input-border)",
                background: "var(--input-bg)",
                color: "var(--input-fg)",
                outline: "none",
                minWidth: 180,
              }}
            >
              <option value="">Todos os setores</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>

            <select
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value as ActiveFilter);
                setPage(1);
              }}
              style={{
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid var(--input-border)",
                background: "var(--input-bg)",
                color: "var(--input-fg)",
                outline: "none",
                minWidth: 120,
              }}
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>

            <button
              onClick={() => setCreateOpen(true)}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--btn-bg)",
                color: "var(--btn-fg)",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              + Criar usuário
            </button>
          </div>

          {msg ? <div style={{ marginTop: 10, color: "#ff8a8a", fontSize: 13 }}>{msg}</div> : null}
        </Card>

        <Card title="Lista" colSpan={12}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <Th>Status</Th>
                  <Th>Username</Th>
                  <Th>Nome</Th>
                  <Th>Setor</Th>
                  <Th>Empresa</Th>
                  <Th>Email</Th>
                  <Th>Ramal</Th>
                  <Th>Criado</Th>
                  <Th>Último login</Th>
                  <Th style={{ textAlign: "right" }}>Ações</Th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <Td colSpan={10} style={{ color: "var(--muted)", padding: 14 }}>
                      Carregando…
                    </Td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <Td colSpan={10} style={{ color: "var(--muted)", padding: 14 }}>
                      Nenhum usuário encontrado.
                    </Td>
                  </tr>
                ) : (
                  items.map((u) => (
                    <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <Td>
                        <StatusPill active={u.isActive} />
                      </Td>
                      <Td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                        {u.username}
                      </Td>
                      <Td style={{ fontWeight: 800 }}>{u.name}</Td>
                      <Td style={{ color: "var(--muted)" }}>{getLabel((u as any).department ?? (u as any).sector)}</Td>
                      <Td style={{ color: "var(--muted)" }}>{getLabel(u.company)}</Td>
                      <Td style={{ color: "var(--muted)" }}>{u.email ?? "—"}</Td>
                      <Td style={{ color: "var(--muted)" }}>{u.extension ?? "—"}</Td>
                      <Td style={{ color: "var(--muted)" }}>{fmt(u.createdAt)}</Td>
                      <Td style={{ color: "var(--muted)" }}>{u.lastLoginAt ? fmt(u.lastLoginAt) : "—"}</Td>

                      <Td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 10 }}>
                          <IconButton title="Editar" onClick={() => setEditUser(u)}>
                            <IconPencil />
                          </IconButton>

                          <IconButton
                            title={u.isActive ? "Desativar" : "Ativar"}
                            onClick={async () => {
                              await api.patch(`/admin/users/${u.id}`, { isActive: !u.isActive });
                              await load();
                            }}
                          >
                            <IconPower />
                          </IconButton>

                          <IconButton
                            title="Excluir"
                            danger
                            onClick={async () => {
                              const ok = confirm(`Excluir o usuário "${u.username}"? Essa ação não pode ser desfeita.`);
                              if (!ok) return;
                              await api.delete(`/admin/users/${u.id}`);
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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <div style={{ color: "var(--muted)" }}>
              Página {page} / {totalPages}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={pagerBtn(page <= 1)}>
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={pagerBtn(page >= totalPages)}
              >
                Próxima
              </button>
            </div>
          </div>
        </Card>
      </div>

      {createOpen && (
        <UserModal
          title="Criar usuário"
          confirmText="Criar"
          mode="create"
          companies={companies}
          departments={departments}
          onClose={() => setCreateOpen(false)}
          onConfirm={async (payload) => {
            await api.post("/admin/users", payload);
            setCreateOpen(false);
            setPage(1);
            await load();
          }}
        />
      )}

      {editUser && (
        <UserModal
          title="Editar usuário"
          confirmText="Salvar"
          mode="edit"
          companies={companies}
          departments={departments}
          initial={{
            id: editUser.id,
            username: editUser.username,
            name: editUser.name,
            email: editUser.email ?? "",
            extension: editUser.extension ?? "",
            companyId: editUser.companyId ?? "",
            departmentId: editUser.departmentId ?? "",
            mustChangePassword: editUser.mustChangePassword,
            isActive: editUser.isActive,
          }}
          onClose={() => setEditUser(null)}
          onConfirm={async (payload) => {
            await api.patch(`/admin/users/${editUser.id}`, {
              username: payload.username,
              name: payload.name,
              email: payload.email || null,
              extension: payload.extension || null,
              companyId: payload.companyId || null,
              departmentId: payload.departmentId || null,
              isActive: payload.isActive,
            });

            if (payload.changePassword) {
              await api.put(`/admin/users/${editUser.id}/password`, {
                password: payload.newPassword,
                mustChangePassword: payload.mustChangePassword,
              });
            }

            setEditUser(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Card({ title, colSpan, right, children }: { title: string; colSpan: number; right?: React.ReactNode; children: any }) {
  return (
    <div
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
        {right ? <div style={{ color: "var(--muted)" }}>{right}</div> : null}
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
        color: "#fff",
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
        verticalAlign: "top",
        ...props.style,
      }}
    />
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        fontWeight: 900,
        fontSize: 12,
        border: "1px solid var(--border)",
        background: active ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        color: active ? "#d1fae5" : "#fee2e2",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: active ? "#22c55e" : "#ef4444",
          boxShadow: active ? "0 0 0 6px rgba(34,197,94,0.12)" : "0 0 0 6px rgba(239,68,68,0.12)",
        }}
      />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--fg)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontWeight: 800,
  };
}

function getLabel(v: any): string {
  if (!v) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "object" && "name" in v) return String(v.name || "—");
  return "—";
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
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 42,
        height: 42,
        display: "grid",
        placeItems: "center",
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "transparent",
        color: danger ? "#ffb4b4" : "var(--fg)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

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
          width: "min(720px, 100%)",
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

type ModalPayload = {
  id?: string;
  username: string;
  name: string;
  email: string;
  extension: string;

  companyId: string;
  departmentId: string;

  // create:
  password: string;
  password2: string;
  mustChangePassword: boolean;

  // edit:
  isActive: boolean;
  changePassword: boolean;
  newPassword: string;
  newPassword2: string;
};

function UserModal({
  title,
  confirmText,
  onClose,
  onConfirm,
  initial,
  mode = "create",
  companies,
  departments,
}: {
  title: string;
  confirmText: string;
  onClose: () => void;
  onConfirm: (payload: any) => Promise<void>;
  initial?: Partial<ModalPayload>;
  mode?: "create" | "edit";
  companies: { id: string; name: string }[];
  departments: { id: string; name: string; companyId?: string | null }[];
}) {
  const [username, setUsername] = useState(initial?.username ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [extension, setExtension] = useState(initial?.extension ?? "");

  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  const [departmentId, setDepartmentId] = useState(initial?.departmentId ?? "");

  // create
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  // edit
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);

  // trocar senha (só aparece quando clicar)
  const [changePassword, setChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");

  // checkbox “forçar alteração” só em create ou quando changePassword=true
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(initial?.mustChangePassword ?? true);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const deptOptions = departments; // se quiser, depois filtramos por companyId no backend e aqui também

  async function submit() {
    setErr(null);

    const u = username.trim();
    const n = name.trim();

    if (u.length < 3) return setErr("Username deve ter pelo menos 3 caracteres.");
    if (n.length < 2) return setErr("Nome Completo é obrigatório.");

    if (mode === "create") {
      if (password.length < 4) return setErr("Senha deve ter pelo menos 4 caracteres.");
      if (password !== password2) return setErr("As senhas não conferem.");
    }

    if (mode === "edit" && changePassword) {
      if (newPassword.length < 4) return setErr("Nova senha deve ter pelo menos 4 caracteres.");
      if (newPassword !== newPassword2) return setErr("As senhas não conferem.");
    }

    setSaving(true);
    try {
      if (mode === "create") {
        await onConfirm({
          username: u,
          name: n,
          email: email.trim(),
          extension: extension.trim(),
          companyId: companyId || null,
          departmentId: departmentId || null,
          password,
          mustChangePassword,
        });
      } else {
        await onConfirm({
          username: u,
          name: n,
          email: email.trim(),
          extension: extension.trim(),
          companyId: companyId || null,
          departmentId: departmentId || null,
          isActive,
          changePassword,
          newPassword,
          mustChangePassword,
        });
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
        <Field colSpan={6} label="Username">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Exemplo: usuario.exemplo" style={inputStyle()} />
        </Field>

        <Field colSpan={6} label="Nome Completo">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Exemplo: Usuário Exemplo da Silva" style={inputStyle()} />
        </Field>

        <Field colSpan={6} label="Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Exemplo: usuario.exemplo@empresa.com.br" style={inputStyle()} />
        </Field>

        <Field colSpan={6} label="Ramal">
          <input value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="Exemplo: 214" style={inputStyle()} />
        </Field>

        <Field colSpan={6} label="Empresa">
          <select
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setDepartmentId("");
            }}
            style={inputStyle()}
          >
            <option value="">— Selecione —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field colSpan={6} label="Setor">
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={inputStyle()}>
            <option value="">— Selecione —</option>
            {deptOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>

        {mode === "create" ? (
          <>
            <Field colSpan={6} label="Senha">
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" style={inputStyle()} />
            </Field>
            <Field colSpan={6} label="Confirmar senha">
              <input value={password2} onChange={(e) => setPassword2(e.target.value)} type="password" style={inputStyle()} />
            </Field>

            <Field colSpan={12} label="">
              <label style={checkRow()}>
                <input type="checkbox" checked={mustChangePassword} onChange={(e) => setMustChangePassword(e.target.checked)} />
                <span style={{ fontWeight: 800 }}>Forçar a alteração no próximo login</span>
              </label>
            </Field>
          </>
        ) : (
          <>
            <Field colSpan={12} label="Status">
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <ToggleSwitch checked={isActive} onChange={setIsActive} />
                <div style={{ fontWeight: 900, color: isActive ? "#d1fae5" : "#fee2e2" }}>
                  {isActive ? "Usuário ativo" : "Usuário inativo"}
                </div>

                <div style={{ marginLeft: "auto" }}>
                  {!changePassword ? (
                    <button
                      onClick={() => setChangePassword(true)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--fg)",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                    >
                      Alterar senha
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setChangePassword(false);
                        setNewPassword("");
                        setNewPassword2("");
                        setMustChangePassword(true);
                      }}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--fg)",
                        cursor: "pointer",
                        fontWeight: 900,
                        opacity: 0.9,
                      }}
                    >
                      Cancelar alteração de senha
                    </button>
                  )}
                </div>
              </div>
            </Field>

            {changePassword ? (
              <>
                <Field colSpan={6} label="Nova senha">
                  <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" style={inputStyle()} />
                </Field>
                <Field colSpan={6} label="Confirmar nova senha">
                  <input value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} type="password" style={inputStyle()} />
                </Field>

                <Field colSpan={12} label="">
                  <label style={checkRow()}>
                    <input type="checkbox" checked={mustChangePassword} onChange={(e) => setMustChangePassword(e.target.checked)} />
                    <span style={{ fontWeight: 800 }}>Forçar a alteração no próximo login</span>
                  </label>
                </Field>
              </>
            ) : null}
          </>
        )}

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

function Field({ colSpan, label, children }: { colSpan: number; label: string; children: any }) {
  return (
    <div style={{ gridColumn: `span ${colSpan}` }}>
      {label ? <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>{label}</div> : null}
      {children}
    </div>
  );
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid var(--input-border)",
    background: "var(--input-bg)",
    color: "var(--input-fg)",
    outline: "none",
    ...extra,
  };
}

function checkRow(): React.CSSProperties {
  return {
    display: "inline-flex",
    gap: 10,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "rgba(0,0,0,0.10)",
    cursor: "pointer",
    userSelect: "none",
  };
}

/** ✅ Toggle bonito (switch) */
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: 56,
        height: 34,
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: checked ? "rgba(34,197,94,0.22)" : "rgba(239,68,68,0.18)",
        position: "relative",
        cursor: "pointer",
        padding: 0,
        outline: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 4,
          left: checked ? 26 : 4,
          width: 26,
          height: 26,
          borderRadius: 999,
          background: checked ? "#22c55e" : "#ef4444",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          transition: "left 160ms ease",
        }}
      />
    </button>
  );
}

/** ===== ÍCONES (SVG) — sem emoji ===== */
function IconPencil() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M7 6l1 16h8l1-16" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IconPower() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M6.1 4.7a10 10 0 1 0 11.8 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}