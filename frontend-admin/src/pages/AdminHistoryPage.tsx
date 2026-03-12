import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { useAdminAuth } from "../adminAuth";
import { API_BASE } from "../api";
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
  avatarUrl?: string | null;
  createdAt?: string;
  lastLoginAt?: string | null;
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
  body: string | null;
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

type SearchMode = "normal" | "exact";
type OrgFilterItem = { id: string; name: string };
type PresenceSnapshotPayload = {
  onlineUserIds?: string[];
  lastLoginByUserId?: Record<string, string>;
};
type PresenceUserPayload = {
  userId?: string;
  online?: boolean;
  lastLoginAt?: string | null;
};

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

function normalizeText(s: string) {
  // remove acento + lowercase
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchText(text: string, qRaw: string, mode: SearchMode) {
  const q = normalizeText(qRaw.trim());
  if (!q) return true;

  const t = normalizeText(text);

  if (mode === "normal") {
    // substring
    return t.includes(q);
  }

  // exact: palavra inteira (token match), ignorando acento/caixa
  // Ex: q="sala" => casa com "sala" mas NÃO com "salario" nem "salada"
  const tokens = t.split(/[^\p{L}\p{N}_]+/gu).filter(Boolean);
  return tokens.includes(q);
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

function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M10.5 3a7.5 7.5 0 105.09 13.02l3.2 3.2a1 1 0 001.42-1.42l-3.2-3.2A7.5 7.5 0 0010.5 3zm0 2a5.5 5.5 0 110 11 5.5 5.5 0 010-11z"
        fill="currentColor"
      />
    </svg>
  );
}

function compareAlpha(a?: string | null, b?: string | null) {
  return (a ?? "").localeCompare(b ?? "", "pt-BR", { sensitivity: "base", numeric: true });
}

function contactAvatarUrl(raw?: string | null) {
  if (!raw) return null;
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  return raw.startsWith("/") ? `${API_BASE}${raw}` : `${API_BASE}/${raw}`;
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function OnlineBadge() {
  return (
    <span className="admin-liveStatusBadge">
      <span className="admin-liveStatusBadge__dot" aria-hidden="true" />
      Online
    </span>
  );
}

function ModeToggle({
  value,
  onChange,
  small,
}: {
  value: SearchMode;
  onChange: (v: SearchMode) => void;
  small?: boolean;
}) {
  return (
    <div className={`bhash-modeToggle ${small ? "bhash-modeToggle--sm" : ""}`} role="group" aria-label="Modo de busca">
      <button
        type="button"
        className={`bhash-modeToggle__btn ${value === "normal" ? "is-active" : ""}`}
        onClick={() => onChange("normal")}
        title="Busca normal (contém)"
      >
        Normal
      </button>
      <button
        type="button"
        className={`bhash-modeToggle__btn ${value === "exact" ? "is-active" : ""}`}
        onClick={() => onChange("exact")}
        title="Busca exata (palavra inteira)"
      >
        Exata
      </button>
    </div>
  );
}

/** ============================
 *  Page
 *  ============================ */
export function AdminHistoryPage() {
  const { api, token, logout } = useAdminAuth();

  const [mode, setMode] = useState<ViewMode>("contacts");
  const [isMobileLayout, setIsMobileLayout] = useState(() => window.innerWidth <= 900);
  const [contactsFiltersOpen, setContactsFiltersOpen] = useState(() => window.innerWidth > 900);

  // ====== CONTATOS ======
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsQ, setContactsQ] = useState("");
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsMsg, setContactsMsg] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());

  const [companyId, setCompanyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [companyOptions, setCompanyOptions] = useState<OrgFilterItem[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<OrgFilterItem[]>([]);

  // ====== BUSCA GLOBAL ======
  const [globalQ, setGlobalQ] = useState("");
  const [globalMode, setGlobalMode] = useState<SearchMode>("normal");
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
  const [chatSearchMode, setChatSearchMode] = useState<SearchMode>("normal");
  const [chatSearchLoading, setChatSearchLoading] = useState(false);
  const [chatSearchErr, setChatSearchErr] = useState<string | null>(null);
  const [chatSearchHits, setChatSearchHits] = useState<Message[]>([]);
  const [chatSearchNextCursor, setChatSearchNextCursor] = useState<string | null>(null);

  // ====== “scroll pra mensagem” e destaque persistente ======
  const [pendingScrollToId, setPendingScrollToId] = useState<string | null>(null);
  const [highlightTerm, setHighlightTerm] = useState<string>("");

  const listRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const presenceSocketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const onResize = () => {
      const nextMobile = window.innerWidth <= 900;
      setIsMobileLayout(nextMobile);
      if (!nextMobile) setContactsFiltersOpen(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!token) {
      setOnlineUserIds(new Set());
      return;
    }

    const s = createAdminSocket(token);
    presenceSocketRef.current = s;

    s.on("presence:snapshot", (payload: PresenceSnapshotPayload) => {
      const nextOnline = Array.isArray(payload?.onlineUserIds) ? payload.onlineUserIds : [];
      setOnlineUserIds(new Set(nextOnline));

      const lastLoginByUserId = payload?.lastLoginByUserId ?? {};
      setContacts((prev) =>
        prev.map((item) => {
          const next = lastLoginByUserId[item.id];
          if (!next || next === item.lastLoginAt) return item;
          return { ...item, lastLoginAt: next };
        })
      );
    });

    s.on("presence:user", (payload: PresenceUserPayload) => {
      const userId = payload?.userId;
      if (!userId) return;

      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (payload.online) next.add(userId);
        else next.delete(userId);
        return next;
      });

      if (payload.lastLoginAt) {
        setContacts((prev) =>
          prev.map((item) => {
            if (item.id !== userId || item.lastLoginAt === payload.lastLoginAt) return item;
            return { ...item, lastLoginAt: payload.lastLoginAt ?? item.lastLoginAt };
          })
        );
      }
    });

    return () => {
      try {
        s.disconnect();
      } catch {}
      presenceSocketRef.current = null;
    };
  }, [token]);

  // ====== LOAD CONTATOS ======
  async function loadContactFilters() {
    try {
      const [companiesRes, departmentsRes] = await Promise.all([
        api.get<{ ok: boolean; items: OrgFilterItem[] }>("/admin/org/companies"),
        api.get<{ ok: boolean; items: OrgFilterItem[] }>("/admin/org/departments"),
      ]);

      const companies = [...(companiesRes.data.items ?? [])].sort((a, b) => compareAlpha(a.name, b.name));
      const departments = [...(departmentsRes.data.items ?? [])].sort((a, b) => compareAlpha(a.name, b.name));

      setCompanyOptions(companies);
      setDepartmentOptions(departments);
    } catch {
      setCompanyOptions([]);
      setDepartmentOptions([]);
    }
  }

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

  useEffect(() => {
    if (mode !== "contacts") return;
    void loadContactFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const filteredContacts = useMemo(() => {
    const q = normalizeText(contactsQ.trim());

    const out = contacts.filter((c) => {
      const matchesCompany = !companyId || c.company?.id === companyId;
      const matchesDepartment = !departmentId || c.department?.id === departmentId;
      if (!matchesCompany || !matchesDepartment) return false;

      if (!q) return true;

      const haystack = normalizeText(
        [
          c.name ?? "",
          c.username ?? "",
          c.email ?? "",
          c.extension ?? "",
          c.company?.name ?? "",
          c.department?.name ?? "",
        ].join(" ")
      );

      return haystack.includes(q);
    });

    return out.sort((a, b) => compareAlpha(a.name || a.username, b.name || b.username));
  }, [contacts, contactsQ, companyId, departmentId]);

  // ====== BUSCA GLOBAL (API + filtro local por modo/acento/caixa) ======
  async function runGlobalSearch(qRaw: string) {
    const q = qRaw.trim();
    if (!q) {
      setGlobalErr(null);
      setGlobalHits([]);
      setGlobalLoading(false);
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
          },
        }
      );

      const items = res.data.items ?? [];
      // modo "exact" aqui é aplicado no client para garantir a regra
      const filtered = items.filter((h) => matchText(h.bodyPreview ?? "", q, globalMode));
      setGlobalHits(filtered);
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      setGlobalErr(e?.response?.data?.message ?? "Falha na busca global");
      setGlobalHits([]);
    } finally {
      setGlobalLoading(false);
    }
  }

  // ✅ realtime: ao digitar, busca; ao limpar, some
  useEffect(() => {
    if (mode !== "contacts") return;

    const q = globalQ.trim();
    if (!q) {
      setGlobalErr(null);
      setGlobalHits([]);
      setGlobalLoading(false);
      return;
    }

    const t = setTimeout(() => {
      runGlobalSearch(globalQ);
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalQ, globalMode, mode]);

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

  async function loadFirstPage(
    conversationId: string,
    opts?: { scrollToBottom?: boolean }
  ): Promise<{ items: Message[]; nextCursor: string | null }> {
    const scrollToBottom = opts?.scrollToBottom ?? true;

    setChatLoading(true);
    setChatMsg(null);

    try {
      const data = await fetchMessagesPage({ conversationId, take: 60 });
      const items = data.items ?? [];
      const nc = data.nextCursor ?? null;

      setMessages(items);
      setNextCursor(nc);
      setHasMore(!!nc);

      requestAnimationFrame(() => {
        const el = listRef.current;
        if (!el) return;
        if (scrollToBottom) el.scrollTop = el.scrollHeight;
      });

      return { items, nextCursor: nc };
    } catch (e: any) {
      if (e?.response?.status === 401) return logout() as any;
      setChatMsg(e?.response?.data?.message ?? "Falha ao carregar mensagens");
      setMessages([]);
      setNextCursor(null);
      setHasMore(false);
      return { items: [], nextCursor: null };
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
    }
  }

  async function ensureMessageLoaded(
    conversationId: string,
    messageId: string,
    opts?: { initialItems?: Message[]; initialCursor?: string | null }
  ) {
    const already = (opts?.initialItems ?? messages).some((m) => m.id === messageId);
    if (already) {
      requestAnimationFrame(() => scrollToMessageId(messageId));
      return;
    }

    let cursor = opts?.initialCursor ?? nextCursor;
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

        if (newItems.some((m) => m.id === messageId)) {
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

    await loadFirstPage(conv.id, { scrollToBottom: true });
  }

  // ====== Abrir conversa via busca global ======
  async function openFromGlobal(hit: GlobalHit) {
    const a = hit.conversation.userA;
    const b = hit.conversation.userB;

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

    setHighlightTerm(globalQ.trim());
    setPendingScrollToId(hit.id);

    setChatSearchOpen(false);
    setChatSearchQ("");
    setChatSearchHits([]);
    setChatSearchNextCursor(null);
    setChatSearchErr(null);

    const first = await loadFirstPage(conv.id, { scrollToBottom: false });

    await ensureMessageLoaded(conv.id, hit.id, {
      initialItems: first.items,
      initialCursor: first.nextCursor,
    });
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
    if (!q) {
      setChatSearchErr(null);
      setChatSearchHits([]);
      setChatSearchNextCursor(null);
      setChatSearchLoading(false);
      return;
    }

    setChatSearchLoading(true);
    setChatSearchErr(null);

    try {
      const data = await fetchMessagesPage({
        conversationId: selectedConv.id,
        take: 80,
        cursor: firstPage ? null : chatSearchNextCursor,
        q, // backend faz "contains"; a regra exata/acentos/caixa garantimos no client
      });

      const items = data.items ?? [];
      const filtered = items.filter((m) => matchText(m.body ?? "", q, chatSearchMode));

      setChatSearchHits((prev) => (firstPage ? filtered : [...prev, ...filtered]));
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

  // ✅ realtime (já era), agora: limpar quando vazio + respeitar modo
  useEffect(() => {
    if (mode !== "conversation") return;
    if (!chatSearchOpen) return;

    const q = chatSearchQ.trim();
    if (!q) {
      setChatSearchErr(null);
      setChatSearchHits([]);
      setChatSearchNextCursor(null);
      setChatSearchLoading(false);
      return;
    }

    const t = setTimeout(() => {
      runChatSearch(true);
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatSearchQ, chatSearchOpen, mode, selectedConv?.id, chatSearchMode]);

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

  // “scroll pra msg” (garantia extra)
  useEffect(() => {
    if (mode !== "conversation") return;
    if (!pendingScrollToId) return;

    let tries = 0;
    const maxTries = 30;

    const tick = () => {
      tries++;

      const el = listRef.current;
      if (!el) return;

      const row = el.querySelector(`[data-mid="${pendingScrollToId}"]`) as HTMLElement | null;
      if (row) {
        row.scrollIntoView({ block: "center", behavior: "smooth" });
        row.classList.add("bhash-msg-flash");
        window.setTimeout(() => row.classList.remove("bhash-msg-flash"), 1100);

        setPendingScrollToId(null);
        return;
      }

      if (tries < maxTries) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [mode, pendingScrollToId, messages]);

  return (
    <div className="admin-page">
      <h1 style={{ margin: 0, marginBottom: 6 }}>Históricos</h1>
      <div className="admin-historySubtitle">{headerSubtitle}</div>

      {mode === "contacts" ? (
        <div className="admin-grid12">
          <Card title="Busca Global" colSpan={12}>
            <div className="admin-historyControlsRow">
              <input
                value={globalQ}
                onChange={(e) => setGlobalQ(e.target.value)}
                placeholder="Pesquise uma palavra"
                style={inputStyle({ flex: 1, minWidth: 260 })}
              />

              <ModeToggle value={globalMode} onChange={setGlobalMode} />
            </div>

            <div className="admin-historyInfoText">
              {globalMode === "normal" ? (
                <>
                  <strong>Normal:</strong> encontra palavras que contenham o termo.{" "}
                  <strong>| Pesquisa:</strong> Casa <strong>→ Resultado:</strong> Casa, Casamento, Casarão...
                </>
              ) : (
                <>
                  <strong>Exata:</strong> mostra apenas resultados exatamente iguais ao termo.{" "}
                  <strong>| Pesquisa:</strong> Casa <strong>→ Resultado:</strong> Casa
                </>
              )}
            </div>

            {globalErr ? <div style={{ marginTop: 10, color: "#ff8a8a", fontSize: 13 }}>{globalErr}</div> : null}

            {globalHits.length > 0 ? (
              <div className="admin-historyGlobalHits">
                {globalHits.map((h) => {
                  const a = h.conversation.userA;
                  const b = h.conversation.userB;
                  return (
                    <div key={h.id} className="admin-historyGlobalHit">
                      <div className="admin-historyGlobalHit__meta">
                        <span>
                          {a.name} ↔ {b.name}
                        </span>
                        <span>•</span>
                        <span>{fmt(h.createdAt)}</span>
                        <span>•</span>
                        <span>por {h.sender.name}</span>
                      </div>

                      <div className="admin-historyGlobalHit__body">
                        <HighlightText text={h.bodyPreview} query={globalQ.trim()} />
                      </div>

                      <div className="admin-historyGlobalHit__actions">
                        <button
                          onClick={() => openFromGlobal(h)}
                          style={ghostBtn(false)}
                          title="Abrir a conversa completa e ir até esta mensagem"
                        >
                          Ver conversa completa
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : globalQ.trim().length > 0 ? (
              <div className="admin-historyInfoText">{globalLoading ? "Buscando..." : "Nenhum resultado."}</div>
            ) : null}
          </Card>

          <Card
            title="Pesquisa por usuário"
            colSpan={12}
            right={
              <div className={`admin-historyCardRight ${isMobileLayout ? "admin-historyCardRight--mobile" : ""}`}>
                <button onClick={loadContacts} style={ghostBtn(contactsLoading)}>
                  {contactsLoading ? "Atualizando..." : "Atualizar"}
                </button>
                <div style={{ color: "var(--muted)" }}>
                  {contactsLoading ? "Carregando..." : `${filteredContacts.length} contato(s)`}
                </div>
              </div>
            }
          >
            {isMobileLayout ? (
              <button
                className={`admin-filterToggleBtn ${contactsFiltersOpen ? "is-open" : ""}`}
                onClick={() => setContactsFiltersOpen((v) => !v)}
                aria-expanded={contactsFiltersOpen}
              >
                <span className="admin-filterToggleBtn__icon" aria-hidden="true">
                  <FilterIcon />
                </span>
                <span>Filtros</span>
                <span className="admin-filterToggleBtn__state">{contactsFiltersOpen ? "Ocultar" : "Mostrar"}</span>
              </button>
            ) : null}

            {!isMobileLayout || contactsFiltersOpen ? (
              <div className="admin-historyControlsRow admin-historyControlsRow--spaced">
                <div className="admin-searchField" style={{ flex: 1, minWidth: 260 }}>
                  <span className="admin-searchField__icon" aria-hidden="true">
                    <SearchIcon />
                  </span>
                  <input
                    value={contactsQ}
                    onChange={(e) => setContactsQ(e.target.value)}
                    placeholder="Pesquisar usuário, nome, e-mail, empresa ou setor"
                    className="admin-searchField__input"
                  />
                </div>

                <select
                  className="admin-historyFilterSelect"
                  value={companyId}
                  onChange={(e) => {
                    setCompanyId(e.target.value);
                    setDepartmentId("");
                  }}
                  style={inputStyle({ minWidth: 180 })}
                >
                  <option value="">Todas as empresas</option>
                  {companyOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>

                <select
                  className="admin-historyFilterSelect"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  style={inputStyle({ minWidth: 180 })}
                >
                  <option value="">Todos os setores</option>
                  {departmentOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {contactsMsg ? <div style={{ marginBottom: 10, color: "#ff8a8a", fontSize: 13 }}>{contactsMsg}</div> : null}

            <div className="admin-historyContactsList">
              {!isMobileLayout ? (
                <div className="admin-historyContactsHead" aria-hidden="true">
                  <span>Foto</span>
                  <span>Nome / User</span>
                  <span>Empresa / Setor</span>
                  <span>E-mail / Ramal</span>
                  <span>Criado</span>
                  <span>Último login</span>
                </div>
              ) : null}

              {contactsLoading ? (
                <div className="admin-historyEmpty">Carregando…</div>
              ) : filteredContacts.length === 0 ? (
                <div className="admin-historyEmpty">Nenhum contato encontrado.</div>
              ) : (
                filteredContacts.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => openUser(u)}
                    className={`admin-historyContactCard ${isMobileLayout ? "admin-historyContactCard--mobile" : ""}`}
                  >
                    {(() => {
                      const avatar = contactAvatarUrl(u.avatarUrl);
                      const fallback = (u.name || u.username).slice(0, 1).toUpperCase();
                      const company = u.company?.name ?? "Sem empresa";
                      const department = u.department?.name ?? "Sem setor";
                      const email = u.email || "Sem e-mail";
                      const ramal = u.extension || "—";
                      const created = u.createdAt ? fmt(u.createdAt) : "—";
                      const isOnlineNow = onlineUserIds.has(u.id);
                      const lastLogin = u.lastLoginAt ? fmt(u.lastLoginAt) : "—";

                      if (isMobileLayout) {
                        return (
                          <>
                            <div className="admin-historyContactCard__mobileTop">
                              <div className="admin-historyContactCard__mobileLines">
                                <div className="admin-historyContactLine">
                                  <span className="admin-historyContactLine__label">Nome:</span>
                                  <span className="admin-historyContactLine__value">{u.name}</span>
                                </div>
                                <div className="admin-historyContactLine">
                                  <span className="admin-historyContactLine__label">Username:</span>
                                  <span className="admin-historyContactLine__value">@{u.username}</span>
                                </div>
                              </div>
                              <div className="admin-historyContactCard__avatar admin-historyContactCard__avatar--mobile">
                                {avatar ? <img src={avatar} alt={u.name} /> : fallback}
                              </div>
                            </div>
                            <div className="admin-historyContactCard__mobileMeta">
                              {company} • {department}
                            </div>
                            <div className="admin-historyContactLine">
                              <span className="admin-historyContactLine__label">E-mail:</span>
                              <span className="admin-historyContactLine__value">{email}</span>
                            </div>
                            <div className="admin-historyContactLine">
                              <span className="admin-historyContactLine__label">Ramal:</span>
                              <span className="admin-historyContactLine__value">{ramal}</span>
                            </div>
                            <div className="admin-historyContactLine">
                              <span className="admin-historyContactLine__label">Status:</span>
                              <span className="admin-historyContactLine__value">
                                {isOnlineNow ? <OnlineBadge /> : lastLogin}
                              </span>
                            </div>
                          </>
                        );
                      }

                      return (
                        <>
                          <div className="admin-historyContactCard__avatar">{avatar ? <img src={avatar} alt={u.name} /> : fallback}</div>
                          <div className="admin-historyContactCard__identity">
                            <div className="admin-historyContactCard__name">{u.name}</div>
                            <div className="admin-historyContactCard__username">@{u.username}</div>
                          </div>
                          <div className="admin-historyContactCard__col">
                            <div>{company}</div>
                            <div className="admin-historyContactCard__small">{department}</div>
                          </div>
                          <div className="admin-historyContactCard__col">
                            <div className="admin-historyContactCard__email">{email}</div>
                            <div className="admin-historyContactCard__small">Ramal: {ramal}</div>
                          </div>
                          <div className="admin-historyContactCard__col admin-historyContactCard__date">{created}</div>
                          <div className="admin-historyContactCard__col admin-historyContactCard__date">
                            {isOnlineNow ? <OnlineBadge /> : lastLogin}
                          </div>
                        </>
                      );
                    })()}
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : mode === "userConversations" ? (
        <div className="admin-grid12">
          <Card
            title={`Chats de ${selectedUser?.name ?? ""}`}
            colSpan={12}
            right={
              <div className="admin-historyCardRight">
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

            <div className="admin-historyConvsList">
              {userConvsLoading ? (
                <div className="admin-historyEmpty">Carregando…</div>
              ) : userConvs.length === 0 ? (
                <div className="admin-historyEmpty">Nenhuma conversa encontrada.</div>
              ) : (
                userConvs.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openConversation(c)}
                    className="admin-historyConvCard"
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
        <div className="admin-grid12">
          <Card
            title={`${selectedUser?.name ?? "Usuário"} ↔ ${selectedConv?.otherUser?.name ?? "Contato"}`}
            colSpan={12}
            right={
              <div className="admin-historyCardRight">
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
                    if (selectedConv?.id) loadFirstPage(selectedConv.id, { scrollToBottom: true });
                  }}
                  style={ghostBtn(chatLoading)}
                  title="Recarregar"
                >
                  {chatLoading ? "Carregando..." : "Atualizar"}
                </button>

                <button
                  onClick={() => setChatSearchOpen((v) => !v)}
                  className="bhash-iconBtn"
                  title="Pesquisar mensagens"
                >
                  <SearchIcon />
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
                          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35, paddingRight: 54 }}>
                            {highlightTerm.trim() ? (
                              <HighlightText text={m.body ?? ""} query={highlightTerm.trim()} />
                            ) : (
                              m.body ?? ""
                            )}
                          </div>

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

              {/* Painel lateral de busca */}
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
                    <div style={{ fontWeight: 900, color: "var(--fg)" }}>Modo de Pesquisa:</div>

                    <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
                      <ModeToggle value={chatSearchMode} onChange={setChatSearchMode} small />
                      <button
                        onClick={() => setChatSearchOpen(false)}
                        className="bhash-iconBtn"
                        title="Fechar"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: 12, display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        value={chatSearchQ}
                        onChange={(e) => setChatSearchQ(e.target.value)}
                        placeholder="Buscar…"
                        style={inputStyle({ flex: 1 })}
                      />
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
                              <HighlightText text={m.body ?? ""} query={chatSearchQ.trim()} />
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

            <div className="admin-historyInfoText">
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          rowGap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
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
