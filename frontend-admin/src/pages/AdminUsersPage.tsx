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
const USERS_FETCH_BATCH = 200;
const PT_BR_COLLATOR = new Intl.Collator("pt-BR", {
  sensitivity: "base",
  numeric: true,
});

function compareAlpha(a?: string | null, b?: string | null) {
  return PT_BR_COLLATOR.compare((a ?? "").trim(), (b ?? "").trim());
}

function sortByName<T extends { name?: string | null }>(items: T[]) {
  return [...items].sort((a, b) => compareAlpha(a.name, b.name));
}

export function AdminUsersPage() {
  const { api } = useAdminAuth();

  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

  // ✅ filtros novos (empresa / setor)
  const [companyId, setCompanyId] = useState<string>("");     // "" = todas
  const [departmentId, setDepartmentId] = useState<string>(""); // "" = todos

  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);

  const [data, setData] = useState<Paged<UserRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [isMobileFilters, setIsMobileFilters] = useState(() => window.innerWidth <= 900);
  const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth > 900);

  async function loadOrgs() {
    try {
      const [cRes, dRes] = await Promise.all([
        api.get<{ ok: boolean; items: CompanyItem[] }>("/admin/org/companies"),
        api.get<{ ok: boolean; items: DepartmentItem[] }>("/admin/org/departments"),
      ]);

      setCompanies(sortByName(cRes.data.items ?? []));
      setDepartments(sortByName(dRes.data.items ?? []));
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
      const baseParams: any = {};

      const qs = q.trim();
      if (qs) baseParams.q = qs;

      if (activeFilter === "active") baseParams.active = "true";
      if (activeFilter === "inactive") baseParams.active = "false";

      // ✅ filtros empresa/setor combinados
      if (companyId) baseParams.companyId = companyId;
      if (departmentId) baseParams.departmentId = departmentId;

      let currentPage = 1;
      let total = 0;
      const allItems: UserRow[] = [];

      while (currentPage < 500) {
        const res = await api.get<Paged<UserRow>>("/admin/users", {
          params: {
            ...baseParams,
            page: currentPage,
            pageSize: USERS_FETCH_BATCH,
          },
        });

        const batch = res.data.items ?? [];
        total = res.data.total ?? batch.length;
        allItems.push(...batch);

        if (!batch.length || allItems.length >= total || batch.length < USERS_FETCH_BATCH) break;
        currentPage += 1;
      }

      const sortedUsers = [...allItems].sort((a, b) => {
        const byName = compareAlpha(a.name || a.username, b.name || b.username);
        if (byName !== 0) return byName;
        return compareAlpha(a.username, b.username);
      });

      setData({
        ok: true,
        page: 1,
        pageSize: sortedUsers.length,
        total,
        items: sortedUsers,
      });
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? "Falha ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, companyId, departmentId]);

  useEffect(() => {
    // carrega combos (empresa/setor) ao entrar e quando muda empresa
    loadOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    // quando digita busca, recarrega com debounce leve
    const t = setTimeout(() => {
      load();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const onResize = () => {
      const nextMobile = window.innerWidth <= 900;
      setIsMobileFilters(nextMobile);
      if (!nextMobile) setFiltersOpen(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const total = data?.total ?? 0;

  const items = data?.items ?? [];

  const headerRight = useMemo(() => {
    if (loading) return "Carregando…";
    return `${total} usuário${total === 1 ? "" : "s"}`;
  }, [loading, total]);

  async function toggleUserActive(u: UserRow) {
    await api.patch(`/admin/users/${u.id}`, { isActive: !u.isActive });
    await load();
  }

  async function deleteUser(u: UserRow) {
    const ok = confirm(`Excluir o usuário "${u.username}"? Essa ação não pode ser desfeita.`);
    if (!ok) return;
    await api.delete(`/admin/users/${u.id}`);
    await load();
  }

  return (
    <div className="admin-page">
      <h1 style={{ margin: 0, marginBottom: 12 }}>Usuários</h1>

      <div className="admin-grid12">
        <Card title="Filtros" colSpan={12} right={headerRight}>
          {isMobileFilters ? (
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

          {!isMobileFilters || filtersOpen ? (
            <div className="admin-usersFiltersRow">
              <div className="admin-searchField" style={{ flex: 1, minWidth: 260 }}>
                <span className="admin-searchField__icon" aria-hidden="true">
                  <SearchIcon />
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar"
                  className="admin-searchField__input"
                />
              </div>

              <select
                className="admin-usersFilterSelect"
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  setDepartmentId(""); // reseta setor ao trocar empresa
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
                className="admin-usersFilterSelect"
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
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
                className="admin-usersFilterSelect admin-usersFilterSelect--sm"
                value={activeFilter}
                onChange={(e) => {
                  setActiveFilter(e.target.value as ActiveFilter);
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
                className="admin-usersCreateBtn"
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
          ) : null}

          {msg ? <div style={{ marginTop: 10, color: "#ff8a8a", fontSize: 13 }}>{msg}</div> : null}
        </Card>

        <Card title="Lista" colSpan={12}>
          {!isMobileFilters ? (
            <div className="admin-usersTableWrap">
              <table className="admin-usersTable">
                <colgroup>
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "15%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <Th className="admin-usersTh admin-usersTh--center">Status</Th>
                    <Th className="admin-usersTh">Username</Th>
                    <Th className="admin-usersTh">Nome</Th>
                    <Th className="admin-usersTh admin-usersTh--center">Criado</Th>
                    <Th className="admin-usersTh admin-usersTh--center">Último login</Th>
                    <Th className="admin-usersTh admin-usersTh--center">Ações</Th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <Td colSpan={6} className="admin-usersTd admin-usersTd--empty">
                        Carregando…
                      </Td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <Td colSpan={6} className="admin-usersTd admin-usersTd--empty">
                        Nenhum usuário encontrado.
                      </Td>
                    </tr>
                  ) : (
                    items.map((u) => (
                      <tr key={u.id} className="admin-usersRow">
                        <Td className="admin-usersTd admin-usersTd--center">
                          <StatusPill active={u.isActive} />
                        </Td>
                        <Td className="admin-usersTd admin-usersTd--mono" title={u.username}>
                          {u.username}
                        </Td>
                        <Td className="admin-usersTd admin-usersTd--name" title={u.name}>
                          {u.name}
                        </Td>
                        <Td className="admin-usersTd admin-usersTd--center admin-usersTd--muted">
                          {fmt(u.createdAt)}
                        </Td>
                        <Td className="admin-usersTd admin-usersTd--center admin-usersTd--muted">
                          {u.lastLoginAt ? fmt(u.lastLoginAt) : "—"}
                        </Td>

                        <Td className="admin-usersTd admin-usersTd--center">
                          <div className="admin-usersActionGroup">
                            <IconButton title="Editar" onClick={() => setEditUser(u)} tone="neutral">
                              <IconPencil />
                            </IconButton>

                            <IconButton
                              title={u.isActive ? "Desativar" : "Ativar"}
                              tone={u.isActive ? "warning" : "success"}
                              onClick={() => toggleUserActive(u)}
                            >
                              <IconPower />
                            </IconButton>

                            <IconButton title="Excluir" tone="danger" onClick={() => deleteUser(u)}>
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
            <div className="admin-usersMobileList">
              {loading ? (
                <div className="admin-usersMobileEmpty">Carregando…</div>
              ) : items.length === 0 ? (
                <div className="admin-usersMobileEmpty">Nenhum usuário encontrado.</div>
              ) : (
                items.map((u) => (
                  <article key={u.id} className="admin-userMobileCard">
                    <div className="admin-userMobileCard__top">
                      <StatusPill active={u.isActive} />
                      <div className="admin-usersActionGroup">
                        <IconButton title="Editar" onClick={() => setEditUser(u)} tone="neutral">
                          <IconPencil />
                        </IconButton>
                        <IconButton
                          title={u.isActive ? "Desativar" : "Ativar"}
                          tone={u.isActive ? "warning" : "success"}
                          onClick={() => toggleUserActive(u)}
                        >
                          <IconPower />
                        </IconButton>
                        <IconButton title="Excluir" tone="danger" onClick={() => deleteUser(u)}>
                          <IconTrash />
                        </IconButton>
                      </div>
                    </div>

                    <div className="admin-userMobileCard__row">
                      <span className="admin-userMobileCard__label">Nome</span>
                      <strong className="admin-userMobileCard__value">{u.name}</strong>
                    </div>
                    <div className="admin-userMobileCard__row">
                      <span className="admin-userMobileCard__label">Username</span>
                      <span className="admin-userMobileCard__value admin-userMobileCard__value--mono">{u.username}</span>
                    </div>
                    <div className="admin-userMobileCard__row">
                      <span className="admin-userMobileCard__label">Criado</span>
                      <span className="admin-userMobileCard__value admin-userMobileCard__value--muted">{fmt(u.createdAt)}</span>
                    </div>
                    <div className="admin-userMobileCard__row">
                      <span className="admin-userMobileCard__label">Último login</span>
                      <span className="admin-userMobileCard__value admin-userMobileCard__value--muted">
                        {u.lastLoginAt ? fmt(u.lastLoginAt) : "—"}
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
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
        padding: "10px 8px",
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
        padding: "14px 8px",
        verticalAlign: "middle",
        ...props.style,
      }}
    />
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`admin-statusPill ${active ? "is-active" : "is-inactive"}`}>
      <span className="admin-statusPill__dot" />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
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
  tone?: "neutral" | "warning" | "success" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`admin-actionBtn ${tone === "neutral" ? "is-neutral" : ""} ${tone === "danger" ? "is-danger" : ""} ${
        tone === "warning" ? "is-warning" : ""
      } ${tone === "success" ? "is-success" : ""}`}
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

  const companyOptions = useMemo(() => sortByName(companies), [companies]);
  const deptOptions = useMemo(() => sortByName(departments), [departments]); // se quiser, depois filtramos por companyId no backend e aqui também

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
            {companyOptions.map((c) => (
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
                <div
                  style={{
                    fontWeight: 900,
                    color: isActive
                      ? "color-mix(in srgb, #22c55e 78%, var(--fg))"
                      : "color-mix(in srgb, #ef4444 78%, var(--fg))",
                  }}
                >
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
function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.6-3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
function IconPower() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path
        d="M7.4 6.3a8.5 8.5 0 1 0 9.2 0"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
