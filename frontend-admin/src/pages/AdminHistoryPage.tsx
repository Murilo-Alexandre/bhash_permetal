// C:\dev\bhash\frontend-admin\src\pages\AdminHistoryPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { useAdminAuth } from "../adminAuth";
import { createAdminSocket } from "../socket";

/** ============================
 *  Types
 *  ============================ */
type Contact = {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  extension?: string | null;
  isActive?: boolean;
  company?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
};

type ConversationItem = {
  id: string;
  updatedAt: string;
  otherUser: { id: string; username: string; name: string };
  lastMessage:
    | {
        id: string;
        createdAt: string;
        bodyPreview: string;
        senderId: string;
      }
    | null;
};

type Message = {
  id: string;
  createdAt: string;
  conversationId: string;
  senderId: string;
  body: string;
  sender: { id: string; username: string; name: string };
};

type PagedContacts = {
  ok: boolean;
  page: number;
  pageSize: number;
  total: number;
  items: Contact[];
};

type PagedMessages = {
  ok: boolean;
  items: Message[];
  nextCursor: string | null;
};

type GlobalHit = {
  id: string;
  createdAt: string;
  bodyPreview: string;
  conversationId: string;
  sender: { id: string; username: string; name: string };
  conversation: {
    id: string;
    userA: { id: string; username: string; name: string };
    userB: { id: string; username: string; name: string };
  };
};

type ViewMode = "contacts" | "userConversations" | "conversation";

/** ============================
 *  Utils
 *  ============================ */
function fmt(d: string) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateLabel(iso: string) {
  const dt = new Date(iso);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (sameDay(dt, now)) return "Hoje";
  if (sameDay(dt, yesterday)) return "Ontem";
  return dt.toLocaleDateString();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightText({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string;
}) {
  const q = query.trim();
  if (!q) return <span className={className}>{text}</span>;

  const re = new RegExp(escapeRegExp(q), "gi");
  const parts: React.ReactNode[] = [];
  let last = 0;

  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push(text.slice(last, idx));
    parts.push(
      <mark key={`${idx}-${m[0]}`} className="bhash-hl">
        {text.slice(idx, idx + m[0].length)}
      </mark>
    );
    last = idx + m[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));

  return <span className={className}>{parts}</span>;
}

/** ============================
 *  Page
 *  ============================ */
export function AdminHistoryPage() {
  const { api, token, logout } = useAdminAuth();

  const [mode, setMode] = useState<ViewMode>("contacts");

  // ====== CONTATOS ======
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsQ, setContactsQ] = useState("");
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsMsg, setContactsMsg] = useState<string | null>(null);

  // filtros opcionais (se quiser usar depois)
  const [companyId, setCompanyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  // ====== BUSCA GLOBAL ======
  const [globalQ, setGlobalQ] = useState("");
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalErr, setGlobalErr] = useState<string | null>(null);
  const [globalHits, setGlobalHits] = useState<GlobalHit[]>([]);

  // ====== CONVERSAS DO USUÁRIO ======
  const [selectedUser, setSelectedUser] = useState<Contact | null>(null);
  const [userConvs, setUserConvs] = useState<ConversationItem[]>([]);
  const [userConvsLoading, setUserConvsLoading] = useState(false);
  const [userConvsMsg, setUserConvsMsg] = useState<string | null>(null);

  // ====== CHAT ======
  const [selectedConv, setSelectedConv] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMsg, setChatMsg] = useState<string | null>(null);

  // ====== Busca WhatsApp-like dentro do chat ======
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQ, setChatSearchQ] = useState("");
  const [chatSearchLoading, setChatSearchLoading] = useState(false);
  const [chatSearchErr, setChatSearchErr] = useState<string | null>(null);
  const [chatSearchHits, setChatSearchHits] = useState<Message[]>([]);
  const [chatSearchNextCursor, setChatSearchNextCursor] = useState<string | null>(null);

  // ====== “scroll pra mensagem” e destaque persistente ======
  const [pendingScrollToId, setPendingScrollToId] = useState<string | null>(null);
  const [highlightTerm, setHighlightTerm] = useState<string>(""); // termo a realçar dentro do chat

  const listRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // ====== LOAD CONTATOS ======
  async function loadContacts() {
    setContactsLoading(true);
    setContactsMsg(null);
    try {
      const params: any = { page: 1, pageSize: 60 };

      const q = contactsQ.trim();
      if (q) params.q = q;

      if (companyId) params.companyId = companyId;
      if (departmentId) params.departmentId = departmentId;

      const res = await api.get<PagedContacts>("/admin/history/contacts", { params });
      setContacts(res.data.items ?? []);
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      setContactsMsg(e?.response?.data?.message ?? "Falha ao carregar contatos");
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  }

  useEffect(() => {
    if (mode !== "contacts") return;
    const t = setTimeout(() => loadContacts(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactsQ, companyId, departmentId, mode]);

  useEffect(() => {
    if (mode === "contacts") loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const filteredContacts = useMemo(() => {
    const q = contactsQ.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.username ?? "").toLowerCase().includes(q)
    );
  }, [contacts, contactsQ]);

  // ====== BUSCA GLOBAL ======
  async function runGlobalSearch() {
    const q = globalQ.trim();
    if (q.length < 1) {
      setGlobalErr("Digite pelo menos 1 caractere.");
      setGlobalHits([]);
      return;
    }

    setGlobalLoading(true);
    setGlobalErr(null);
    try {
      const res = await api.get<{ ok: boolean; items: GlobalHit[] }>(
        "/admin/history/search",
        {
          params: {
            q,
            page: 1,
            pageSize: 60,
            ...(companyId ? { companyId } : {}),
            ...(departmentId ? { departmentId } : {}),
          },
        }
      );
      setGlobalHits(res.data.items ?? []);
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      setGlobalErr(e?.response?.data?.message ?? "Falha na busca global");
      setGlobalHits([]);
    } finally {
      setGlobalLoading(false);
    }
  }

  // ====== LOAD CONVERSAS DO USER ======
  async function openUser(u: Contact) {
    setSelectedUser(u);
    setMode("userConversations");

    setUserConvsLoading(true);
    setUserConvsMsg(null);
    try {
      const res = await api.get<{ ok: boolean; items: ConversationItem[] }>(
        `/admin/history/users/${u.id}/conversations`
      );
      setUserConvs(res.data.items ?? []);
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      setUserConvsMsg(e?.response?.data?.message ?? "Falha ao carregar conversas");
      setUserConvs([]);
    } finally {
      setUserConvsLoading(false);
    }
  }

  // ====== CHAT (mensagens) ======
  async function fetchMessagesPage(args: {
    conversationId: string;
    take: number;
    cursor?: string | null;
    q?: string;
  }) {
    const { conversationId, take, cursor, q } = args;
    const res = await api.get<PagedMessages>(
      `/admin/history/conversations/${conversationId}/messages`,
      {
        params: {
          take,
          ...(cursor ? { cursor } : {}),
          ...(q?.trim() ? { q: q.trim() } : {}),
        },
      }
    );
    return res.data;
  }

  async function loadFirstPage(conversationId: string) {
    setChatLoading(true);
    setChatMsg(null);
    try {
      const data = await fetchMessagesPage({ conversationId, take: 60 });

      const items = data.items ?? [];
      setMessages(items);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(!!data.nextCursor);

      requestAnimationFrame(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight; // vai pro fim
      });
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      setChatMsg(e?.response?.data?.message ?? "Falha ao carregar mensagens");
      setMessages([]);
      setNextCursor(null);
      setHasMore(false);
    } finally {
      setChatLoading(false);
    }
  }

  async function loadMoreTop(conversationId: string) {
    if (!hasMore || chatLoading) return;
    if (!nextCursor) return;

    const el = listRef.current;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    const prevScrollTop = el?.scrollTop ?? 0;

    setChatLoading(true);
    try {
      const data = await fetchMessagesPage({
        conversationId,
        take: 60,
        cursor: nextCursor,
      });

      const newItems = data.items ?? [];
      setMessages((prev) => [...newItems, ...prev]);

      setNextCursor(data.nextCursor ?? null);
      setHasMore(!!data.nextCursor);

      requestAnimationFrame(() => {
        const el2 = listRef.current;
        if (!el2) return;
        const newScrollHeight = el2.scrollHeight;
        el2.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
      });
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      setHasMore(false);
    } finally {
      setChatLoading(false);
    }
  }

  function scrollToMessageId(messageId: string) {
    const el = listRef.current;
    if (!el) return;

    const row = el.querySelector(`[data-mid="${messageId}"]`) as HTMLElement | null;
    if (row) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      row.classList.add("bhash-msg-flash");
      window.setTimeout(() => row.classList.remove("bhash-msg-flash"), 1100);
      return;
    }
  }

  async function ensureMessageLoaded(conversationId: string, messageId: string) {
    // tenta no que já carregou
    if (messages.some((m) => m.id === messageId)) {
      requestAnimationFrame(() => scrollToMessageId(messageId));
      return;
    }

    // carrega páginas mais antigas até achar (limite de segurança)
    let cursor = nextCursor;
    let guard = 0;

    setChatLoading(true);
    try {
      while (cursor && guard < 40) {
        guard++;

        const data = await fetchMessagesPage({
          conversationId,
          take: 80,
          cursor,
        });

        const newItems = data.items ?? [];
        setMessages((prev) => [...newItems, ...prev]);

        cursor = data.nextCursor ?? null;
        setNextCursor(cursor);
        setHasMore(!!cursor);

        // checa se veio
        if (newItems.some((m) => m.id === messageId)) {
          // espera render
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          scrollToMessageId(messageId);
          return;
        }
      }
    } finally {
      setChatLoading(false);
    }
  }

  async function openConversation(conv: ConversationItem) {
    setSelectedConv(conv);
    setMode("conversation");

    setChatSearchOpen(false);
    setChatSearchQ("");
    setChatSearchHits([]);
    setChatSearchNextCursor(null);
    setChatSearchErr(null);

    setHighlightTerm("");
    setPendingScrollToId(null);

    await loadFirstPage(conv.id);
  }

  // ====== Abrir conversa via busca global ======
  async function openFromGlobal(hit: GlobalHit) {
    const a = hit.conversation.userA;
    const b = hit.conversation.userB;

    // cria um “selectedUser” fake só pra manter o header padrão (não afeta backend)
    const fakeSelectedUser: Contact = { id: a.id, username: a.username, name: a.name };
    setSelectedUser(fakeSelectedUser);

    const conv: ConversationItem = {
      id: hit.conversation.id,
      updatedAt: hit.createdAt,
      otherUser: { id: b.id, username: b.username, name: b.name },
      lastMessage: null,
    };

    setSelectedConv(conv);
    setMode("conversation");

    // abre chat completo, mas com “meta” de rolar pra msg e realçar termo
    setHighlightTerm(globalQ.trim());
    setPendingScrollToId(hit.id);

    setChatSearchOpen(false);
    setChatSearchQ("");
    setChatSearchHits([]);
    setChatSearchNextCursor(null);
    setChatSearchErr(null);

    await loadFirstPage(conv.id);

    // tenta achar a msg — se não tiver, vai carregando páginas antigas até achar
    await ensureMessageLoaded(conv.id, hit.id);
  }

  // ====== SOCKET: realtime no chat aberto ======
  useEffect(() => {
    if (mode !== "conversation") return;
    if (!token) return;
    if (!selectedConv?.id) return;

    const s = createAdminSocket(token);
    socketRef.current = s;

    s.on("connect", () => {
      s.emit("conversation:join", { conversationId: selectedConv.id });
    });

    s.on("message:new", (msg: Message) => {
      if (msg?.conversationId !== selectedConv.id) return;

      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      requestAnimationFrame(() => {
        const el = listRef.current;
        if (!el) return;

        const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
        const nearBottom = distanceFromBottom < 140;
        if (nearBottom) el.scrollTop = el.scrollHeight;
      });
    });

    return () => {
      try {
        s.disconnect();
      } catch {}
      socketRef.current = null;
    };
  }, [mode, token, selectedConv?.id]);

  // ====== Busca WhatsApp-like (painel lateral) ======
  async function runChatSearch(firstPage = true) {
    if (!selectedConv?.id) return;

    const q = chatSearchQ.trim();
    if (q.length < 1) {
      setChatSearchErr("Digite pelo menos 1 caractere.");
      setChatSearchHits([]);
      setChatSearchNextCursor(null);
      return;
    }

    setChatSearchLoading(true);
    setChatSearchErr(null);

    try {
      const data = await fetchMessagesPage({
        conversationId: selectedConv.id,
        take: 80,
        cursor: firstPage ? null : chatSearchNextCursor,
        q,
      });

      const items = data.items ?? [];
      setChatSearchHits((prev) => (firstPage ? items : [...prev, ...items]));
      setChatSearchNextCursor(data.nextCursor ?? null);
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      setChatSearchErr(e?.response?.data?.message ?? "Falha ao buscar na conversa");
      setChatSearchHits([]);
      setChatSearchNextCursor(null);
    } finally {
      setChatSearchLoading(false);
    }
  }

  useEffect(() => {
    if (mode !== "conversation") return;
    if (!chatSearchOpen) return;

    const t = setTimeout(() => {
      runChatSearch(true);
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatSearchQ, chatSearchOpen, mode, selectedConv?.id]);

  async function jumpToChatHit(m: Message) {
    if (!selectedConv?.id) return;

    setHighlightTerm(chatSearchQ.trim());
    setPendingScrollToId(m.id);

    await ensureMessageLoaded(selectedConv.id, m.id);
  }

  // ====== UI ======
  const headerSubtitle = useMemo(() => {
    if (mode === "contacts") return "Históricos • contatos e busca global";
    if (mode === "userConversations")
      return selectedUser ? `Históricos • chats de ${selectedUser.name}` : "Históricos • chats do usuário";
    if (mode === "conversation") {
      const u = selectedConv?.otherUser?.name ? (selectedUser?.name ?? "Usuário") : "Usuário";
      const other = selectedConv?.otherUser?.name ?? "Contato";
      return `Históricos • ${u} ↔ ${other}`;
    }
    return "Históricos";
  }, [mode, selectedUser, selectedConv]);

  const groupedMessages = useMemo(() => {
    // Agrupa com separador de data (WhatsApp-like)
    const out: Array<{ kind: "sep"; label: string } | { kind: "msg"; m: Message }> = [];
    let lastLabel = "";

    for (const m of messages) {
      const lbl = dateLabel(m.createdAt);
      if (lbl !== lastLabel) {
        out.push({ kind: "sep", label: lbl });
        lastLabel = lbl;
      }
      out.push({ kind: "msg", m });
    }
    return out;
  }, [messages]);

  return (
    <div style={{ width: "min(1100px, 100%)", margin: "0 auto", padding: "18px 16px 56px" }}>
      <h1 style={{ margin: 0, marginBottom: 6 }}>Históricos</h1>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>{headerSubtitle}</div>

      {mode === "contacts" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
          <Card title="Buscar em tudo (Global)" colSpan={12}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={globalQ}
                onChange={(e) => setGlobalQ(e.target.value)}
                placeholder='Ex: "impressora"'
                style={inputStyle({ flex: 1, minWidth: 260 })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runGlobalSearch();
                }}
              />

              <button
                onClick={runGlobalSearch}
                disabled={globalLoading || globalQ.trim().length < 1}
                style={primaryBtn(globalLoading || globalQ.trim().length < 1)}
              >
                {globalLoading ? "Buscando..." : "Buscar"}
              </button>
            </div>

            {globalErr ? <div style={{ marginTop: 10, color: "#ff8a8a", fontSize: 13 }}>{globalErr}</div> : null}

            {globalHits.length > 0 ? (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {globalHits.map((h) => {
                  const a = h.conversation.userA;
                  const b = h.conversation.userB;
                  return (
                    <div
                      key={h.id}
                      style={{
                        padding: 12,
                        borderRadius: 16,
                        border: "1px solid var(--border)",
                        background: "rgba(255,255,255,0.02)",
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <span>
                          {a.name} ↔ {b.name}
                        </span>
                        <span>•</span>
                        <span>{fmt(h.createdAt)}</span>
                        <span>•</span>
                        <span>por {h.sender.name}</span>
                      </div>

                      <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.35 }}>
                        <HighlightText text={h.bodyPreview} query={globalQ.trim()} />
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          onClick={() => openFromGlobal(h)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid var(--border)",
                            background: "transparent",
                            color: "var(--fg)",
                            cursor: "pointer",
                            fontWeight: 900,
                          }}
                          title="Abrir a conversa completa e ir até esta mensagem"
                        >
                          Ver conversa completa
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 13 }}>
                {globalLoading ? "Buscando..." : "—"}
              </div>
            )}
          </Card>

          <Card
            title="Contatos"
            colSpan={12}
            right={
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={loadContacts} style={ghostBtn(contactsLoading)}>
                  {contactsLoading ? "Atualizando..." : "Atualizar"}
                </button>
                <div style={{ color: "var(--muted)" }}>
                  {contactsLoading ? "Carregando..." : `${filteredContacts.length} contato(s)`}
                </div>
              </div>
            }
          >
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <input
                value={contactsQ}
                onChange={(e) => setContactsQ(e.target.value)}
                placeholder="Buscar contato (nome / username)"
                style={inputStyle({ flex: 1, minWidth: 260 })}
              />
            </div>

            {contactsMsg ? <div style={{ marginBottom: 10, color: "#ff8a8a", fontSize: 13 }}>{contactsMsg}</div> : null}

            <div style={{ display: "grid", gap: 10 }}>
              {contactsLoading ? (
                <div style={{ color: "var(--muted)" }}>Carregando…</div>
              ) : filteredContacts.length === 0 ? (
                <div style={{ color: "var(--muted)" }}>Nenhum contato encontrado.</div>
              ) : (
                filteredContacts.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => openUser(u)}
                    style={{
                      textAlign: "left",
                      padding: 12,
                      borderRadius: 16,
                      border: "1px solid var(--border)",
                      background: "var(--card-bg)",
                      boxShadow: "var(--shadow)",
                      cursor: "pointer",
                      color: "var(--fg)",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>@{u.username}</div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : mode === "userConversations" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
          <Card
            title={`Chats de ${selectedUser?.name ?? ""}`}
            colSpan={12}
            right={
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={() => {
                    setMode("contacts");
                    setSelectedUser(null);
                    setUserConvs([]);
                  }}
                  style={ghostBtn(false)}
                >
                  ← Voltar
                </button>
                <button
                  onClick={() => {
                    if (selectedUser) openUser(selectedUser);
                  }}
                  style={ghostBtn(userConvsLoading)}
                >
                  {userConvsLoading ? "Atualizando..." : "Atualizar"}
                </button>
              </div>
            }
          >
            {userConvsMsg ? <div style={{ marginBottom: 10, color: "#ff8a8a", fontSize: 13 }}>{userConvsMsg}</div> : null}

            <div style={{ display: "grid", gap: 10 }}>
              {userConvsLoading ? (
                <div style={{ color: "var(--muted)" }}>Carregando…</div>
              ) : userConvs.length === 0 ? (
                <div style={{ color: "var(--muted)" }}>Nenhuma conversa encontrada.</div>
              ) : (
                userConvs.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openConversation(c)}
                    style={{
                      textAlign: "left",
                      padding: 12,
                      borderRadius: 16,
                      border: "1px solid var(--border)",
                      background: "var(--card-bg)",
                      boxShadow: "var(--shadow)",
                      cursor: "pointer",
                      color: "var(--fg)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{c.otherUser.name}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>@{c.otherUser.username}</div>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmt(c.updatedAt)}</div>
                    </div>

                    <div style={{ marginTop: 8, fontSize: 13, color: "var(--muted)" }}>
                      {c.lastMessage ? c.lastMessage.bodyPreview : "Sem mensagens ainda"}
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : (
        // mode === "conversation"
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
          <Card
            title={`${selectedUser?.name ?? "Usuário"} ↔ ${selectedConv?.otherUser?.name ?? "Contato"}`}
            colSpan={12}
            right={
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  onClick={() => {
                    setMode("userConversations");
                    setSelectedConv(null);
                    setMessages([]);
                    setNextCursor(null);
                    setHasMore(true);

                    setChatSearchOpen(false);
                    setChatSearchQ("");
                    setChatSearchHits([]);
                    setChatSearchNextCursor(null);
                    setChatSearchErr(null);

                    setHighlightTerm("");
                    setPendingScrollToId(null);
                  }}
                  style={ghostBtn(false)}
                >
                  ← Voltar
                </button>

                <button
                  onClick={() => {
                    if (selectedConv?.id) loadFirstPage(selectedConv.id);
                  }}
                  style={ghostBtn(chatLoading)}
                  title="Recarregar"
                >
                  {chatLoading ? "Carregando..." : "Atualizar"}
                </button>

                {/* WhatsApp-like: lupa abre painel */}
                <button
                  onClick={() => setChatSearchOpen((v) => !v)}
                  style={ghostBtn(false)}
                  title="Pesquisar mensagens"
                >
                  🔍
                </button>
              </div>
            }
          >
            {chatMsg ? <div style={{ marginBottom: 10, color: "#ff8a8a", fontSize: 13 }}>{chatMsg}</div> : null}

            <div className={chatSearchOpen ? "bhash-chatGrid bhash-chatGrid--withSearch" : "bhash-chatGrid"}>
              {/* Chat */}
              <div
                ref={listRef}
                onScroll={() => {
                  const el = listRef.current;
                  if (!el) return;
                  if (el.scrollTop < 120 && selectedConv?.id) loadMoreTop(selectedConv.id);
                }}
                className="wa-chat"
              >
                {hasMore ? (
                  <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, padding: "6px 0 12px" }}>
                    {chatLoading ? "Carregando…" : "Role pra cima para carregar mais"}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, padding: "6px 0 12px" }}>
                    Início da conversa
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {groupedMessages.map((row, idx) => {
                    if (row.kind === "sep") {
                      return (
                        <div key={`sep-${row.label}-${idx}`} className="bhash-date-sep">
                          {row.label}
                        </div>
                      );
                    }

                    const m = row.m;
                    const isMe = selectedUser?.id ? m.senderId === selectedUser.id : false;

                    const time = (() => {
                      try {
                        const dt = new Date(m.createdAt);
                        return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      } catch {
                        return "";
                      }
                    })();

                    return (
                      <div
                        key={m.id}
                        data-mid={m.id}
                        style={{
                          display: "flex",
                          justifyContent: isMe ? "flex-end" : "flex-start",
                        }}
                      >
                        <div
                          className={`bhash-bubble ${isMe ? "bhash-bubble--me" : "bhash-bubble--other"}`}
                          style={{
                            maxWidth: 520,
                            padding: "8px 10px",
                            borderRadius: 12,
                            border: "1px solid var(--border)",
                            boxShadow: "var(--shadow)",
                            position: "relative",
                          }}
                        >
                          {/* corpo */}
                          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35, paddingRight: 54 }}>
                            {highlightTerm.trim() ? (
                              <HighlightText text={m.body} query={highlightTerm.trim()} />
                            ) : (
                              m.body
                            )}
                          </div>

                          {/* hora no cantinho (sempre separada do texto) */}
                          <div className="bhash-time">{time}</div>
                        </div>
                      </div>
                    );
                  })}

                  {messages.length === 0 && !chatLoading ? (
                    <div style={{ color: "var(--muted)" }}>Nenhuma mensagem encontrada.</div>
                  ) : null}
                </div>
              </div>

              {/* Painel lateral de busca (WhatsApp-like) */}
              {chatSearchOpen ? (
                <div className="bhash-searchPanel">
                  <div
                    style={{
                      padding: 12,
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{ fontWeight: 900, color: "var(--fg)" }}>Pesquisar mensagens</div>
                    <button
                      onClick={() => setChatSearchOpen(false)}
                      style={{
                        marginLeft: "auto",
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--fg)",
                        cursor: "pointer",
                        fontWeight: 900,
                      }}
                      title="Fechar"
                    >
                      ×
                    </button>
                  </div>

                  <div style={{ padding: 12, display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        value={chatSearchQ}
                        onChange={(e) => setChatSearchQ(e.target.value)}
                        placeholder="Buscar…"
                        style={inputStyle({ flex: 1 })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") runChatSearch(true);
                        }}
                      />
                      <button
                        onClick={() => runChatSearch(true)}
                        style={primaryBtn(false)}
                        disabled={chatSearchLoading}
                        title="Buscar"
                      >
                        {chatSearchLoading ? "..." : "Buscar"}
                      </button>
                    </div>

                    {chatSearchErr ? <div style={{ color: "#ff8a8a", fontSize: 13 }}>{chatSearchErr}</div> : null}

                    <div style={{ color: "var(--muted)", fontSize: 12 }}>
                      {chatSearchQ.trim()
                        ? `${chatSearchHits.length} resultado(s)`
                        : "Digite um termo para ver as ocorrências nesta conversa."}
                    </div>
                  </div>

                  <div className="bhash-searchPanel__list">
                    <div className="bhash-searchPanel__listInner">
                      {chatSearchQ.trim() && chatSearchHits.length === 0 && !chatSearchLoading ? (
                        <div style={{ color: "var(--muted)" }}>Nenhuma ocorrência.</div>
                      ) : null}

                      {chatSearchHits.map((m) => {
                        const time = (() => {
                          try {
                            const dt = new Date(m.createdAt);
                            return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                          } catch {
                            return "";
                          }
                        })();

                        return (
                          <button
                            key={m.id}
                            onClick={() => jumpToChatHit(m)}
                            style={{
                              textAlign: "left",
                              padding: 12,
                              borderRadius: 14,
                              border: "1px solid var(--border)",
                              background: "rgba(255,255,255,0.03)",
                              cursor: "pointer",
                              color: "var(--fg)",
                              width: "100%",
                            }}
                            title="Ir para esta mensagem"
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                                alignItems: "center",
                              }}
                            >
                              <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 900 }}>{time}</div>
                              <div style={{ fontSize: 12, color: "var(--muted)" }}>{dateLabel(m.createdAt)}</div>
                            </div>

                            <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.35, whiteSpace: "pre-wrap" }}>
                              <HighlightText text={m.body} query={chatSearchQ.trim()} />
                            </div>
                          </button>
                        );
                      })}

                      {chatSearchNextCursor ? (
                        <button
                          onClick={() => runChatSearch(false)}
                          disabled={chatSearchLoading}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid var(--border)",
                            background: "transparent",
                            color: "var(--fg)",
                            cursor: chatSearchLoading ? "not-allowed" : "pointer",
                            fontWeight: 900,
                            opacity: chatSearchLoading ? 0.7 : 1,
                          }}
                        >
                          {chatSearchLoading ? "Carregando..." : "Carregar mais"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 10, color: "var(--muted)", fontSize: 12 }}>
              Tempo real: {token ? "ativo" : "—"} (mensagens novas aparecem automaticamente quando a conversa está aberta)
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/** ===== UI helpers no estilo do seu admin ===== */
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

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid var(--input-border)",
    background: "var(--input-bg)",
    color: "var(--input-fg)",
    outline: "none",
    ...extra,
  };
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--btn-bg)",
    color: "var(--btn-fg)",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}

function ghostBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--fg)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 900,
    opacity: disabled ? 0.7 : 1,
  };
}
