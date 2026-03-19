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
  otherUser: { id: string; username: string; name: string; avatarUrl?: string | null };
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
  contentType?: "TEXT" | "IMAGE" | "FILE";
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  deletedAt?: string | null;
  sender: { id: string; username: string; name: string } | null;
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
type RetentionIntervalUnit = "DAY" | "MONTH" | "YEAR";
type RetentionPolicy = {
  enabled: boolean;
  interval: string;
  intervalLabel: string;
  intervalCount: number;
  intervalUnit: RetentionIntervalUnit;
  runHour: number;
  runMinute: number;
  showToUsers: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastMediaCount?: number;
  lastFileCount?: number;
  nextMediaCount?: number;
  nextFileCount?: number;
  lastSummary?: string | null;
};

type RetentionDraft = {
  enabled: boolean;
  intervalUnit: RetentionIntervalUnit;
  intervalCount: string;
  runHour: string;
  runMinute: string;
  showToUsers: boolean;
};
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
  return toAbsoluteUrl(raw);
}

function toAbsoluteUrl(raw?: string | null) {
  if (!raw) return null;
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (/^(https?:)?\/\//i.test(raw)) {
    try {
      const resolved = new URL(raw, typeof window !== "undefined" ? window.location.origin : "http://localhost");
      const isLoopbackHost = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|::1|\[::1\])$/i.test(
        resolved.hostname
      );
      if (!isLoopbackHost) return resolved.toString();

      const apiResolved = new URL(
        API_BASE,
        typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
      );
      return `${apiResolved.origin}${resolved.pathname}${resolved.search}${resolved.hash}`;
    } catch {
      return raw;
    }
  }
  return raw.startsWith("/") ? `${API_BASE}${raw}` : `${API_BASE}/${raw}`;
}

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const precision = idx === 0 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(precision)} ${units[idx]}`;
}

const ATTACHMENT_MOJIBAKE_MARKERS = /[ÃÂ�]/u;

function attachmentMojibakeScore(value: string) {
  let score = 0;
  for (const char of value) {
    if (char === "�") score += 4;
    if (char === "Ã" || char === "Â") score += 2;
  }
  return score;
}

function decodeLatin1AsUtf8(value: string) {
  if (typeof TextDecoder === "undefined") return value;
  const bytes = Uint8Array.from([...value].map((char) => char.charCodeAt(0) & 0xff));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function normalizeAttachmentDisplayName(value?: string | null) {
  const raw = String(value ?? "").replace(/\0/g, "").trim();
  if (!raw) return "";

  const normalized = raw.normalize("NFC");
  if (!ATTACHMENT_MOJIBAKE_MARKERS.test(normalized)) return normalized;

  try {
    const decoded = decodeLatin1AsUtf8(normalized).replace(/\0/g, "").trim().normalize("NFC");
    if (!decoded) return normalized;
    return attachmentMojibakeScore(decoded) < attachmentMojibakeScore(normalized) ? decoded : normalized;
  } catch {
    return normalized;
  }
}

function isPdfAttachment(message: Partial<Message>) {
  const mime = String(message.attachmentMime ?? "").toLowerCase();
  const name = normalizeAttachmentDisplayName(message.attachmentName).toLowerCase();
  const url = String(message.attachmentUrl ?? "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf") || url.includes(".pdf");
}

function isImageAttachment(message: Partial<Message>) {
  const mime = String(message.attachmentMime ?? "").toLowerCase();
  const name = normalizeAttachmentDisplayName(message.attachmentName).toLowerCase();
  const url = String(message.attachmentUrl ?? "").toLowerCase();
  return message.contentType === "IMAGE" || mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif|avif)([?#]|$)/i.test(name) || /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif|avif)([?#]|$)/i.test(url);
}

function isVideoAttachment(message: Partial<Message>) {
  const mime = String(message.attachmentMime ?? "").toLowerCase();
  const name = normalizeAttachmentDisplayName(message.attachmentName).toLowerCase();
  const url = String(message.attachmentUrl ?? "").toLowerCase();
  return mime.startsWith('video/') || /\.(mp4|webm|ogg|ogv|mov|m4v|avi|mkv|3gp|mpeg?|mpg|wmv)([?#]|$)/i.test(name) || /\.(mp4|webm|ogg|ogv|mov|m4v|avi|mkv|3gp|mpeg?|mpg|wmv)([?#]|$)/i.test(url);
}

function isMediaAttachment(message: Partial<Message>) {
  return isVideoAttachment(message) || isImageAttachment(message);
}

function buildPdfPreviewUrl(raw?: string | null) {
  const absolute = toAbsoluteUrl(raw);
  if (!absolute) return null;
  const [base] = absolute.split("#");
  return `${base}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH`;
}

function attachmentDownloadName(message: Partial<Message>) {
  const normalized = normalizeAttachmentDisplayName(message.attachmentName);
  if (normalized) return normalized;
  if (isVideoAttachment(message)) return "video";
  if (isImageAttachment(message)) return "imagem";
  return "arquivo";
}

async function triggerBrowserDownload(url: string, filename: string) {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    return;
  } catch {}

  const fallback = document.createElement("a");
  fallback.href = url;
  fallback.download = filename;
  fallback.target = "_blank";
  fallback.rel = "noreferrer";
  document.body.appendChild(fallback);
  fallback.click();
  fallback.remove();
}

function timeDigitsOnly(value: string) {
  return (value ?? "").replace(/\D/g, "").slice(0, 2);
}

function normalizeHourInput(value: string) {
  const digits = timeDigitsOnly(value);
  if (!digits) return "00";
  const num = Number(digits);
  const safe = Number.isFinite(num) ? Math.min(23, Math.max(0, num)) : 0;
  return String(safe).padStart(2, "0");
}

function normalizeMinuteInput(value: string) {
  const digits = timeDigitsOnly(value);
  if (!digits) return "00";
  const num = Number(digits);
  const safe = Number.isFinite(num) ? Math.min(59, Math.max(0, num)) : 0;
  return String(safe).padStart(2, "0");
}

function twoDigits(value: number | string) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "00";
  return String(Math.max(0, Math.trunc(num))).padStart(2, "0");
}

function intervalCountDigitsOnly(value: string) {
  return (value ?? "").replace(/\D/g, "").slice(0, 3);
}

function normalizeIntervalCountInput(value: string) {
  const digits = intervalCountDigitsOnly(value);
  if (!digits) return "1";
  const num = Number(digits);
  const safe = Number.isFinite(num) ? Math.min(999, Math.max(1, num)) : 1;
  return String(safe);
}

function messageSearchableText(msg: Partial<Message>) {
  const kind =
    isMediaAttachment(msg)
      ? isVideoAttachment(msg)
        ? "video"
        : "imagem"
      : msg.contentType === "FILE"
      ? "arquivo"
      : "";
  return [msg.body ?? "", normalizeAttachmentDisplayName(msg.attachmentName), kind].join(" ").trim();
}

function messagePreviewText(msg: Partial<Message>) {
  const body = (msg.body ?? "").trim();
  if (body) return body;
  if (isMediaAttachment(msg)) return isVideoAttachment(msg) ? "Vídeo" : "Imagem";
  const attachmentName = normalizeAttachmentDisplayName(msg.attachmentName);
  if (msg.contentType === "FILE") return attachmentName ? `Arquivo: ${attachmentName}` : "Arquivo";
  return "";
}

const REMOVED_ATTACHMENT_NOTICE_GENERIC =
  "Esta imagem ou documento foi apagado pelo administrador segundo a política de backup de arquivos.";
const REMOVED_ATTACHMENT_NOTICE_IMAGE =
  "Essa imagem foi apagada pelo administrador segundo a política de backup de arquivos.";
const REMOVED_ATTACHMENT_NOTICE_FILE =
  "Esse documento foi apagado pelo administrador segundo a política de backup de arquivos.";

function stripAttachmentRemovalNotice(value?: string | null) {
  let text = (value ?? "").trim();
  text = text.replace(REMOVED_ATTACHMENT_NOTICE_IMAGE, "");
  text = text.replace(REMOVED_ATTACHMENT_NOTICE_FILE, "");
  text = text.replace(REMOVED_ATTACHMENT_NOTICE_GENERIC, "");
  return text.trim();
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
  const [conversationViewportHeight, setConversationViewportHeight] = useState<number | null>(null);

  // ====== CONTATOS ======
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsQ, setContactsQ] = useState("");
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsMsg, setContactsMsg] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());
  const [brokenAvatarIds, setBrokenAvatarIds] = useState<Set<string>>(() => new Set());

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
  const [mediaItems, setMediaItems] = useState<Message[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaMsg, setMediaMsg] = useState<string | null>(null);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);
  const [mediaTab, setMediaTab] = useState<"image" | "file">("image");
  const [mediaPreviewSlots, setMediaPreviewSlots] = useState(6);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [mediaLibraryTab, setMediaLibraryTab] = useState<"image" | "file">("image");
  const [newMsgsCount, setNewMsgsCount] = useState(0);
  const [showJumpNew, setShowJumpNew] = useState(false);

  const [retentionPolicy, setRetentionPolicy] = useState<RetentionPolicy | null>(null);
  const [retentionDraft, setRetentionDraft] = useState<RetentionDraft | null>(null);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionMsg, setRetentionMsg] = useState<string | null>(null);

  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageViewerItems, setImageViewerItems] = useState<Message[]>([]);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  const [imageViewerZoom, setImageViewerZoom] = useState(1);
  const [imageViewerOffset, setImageViewerOffset] = useState({ x: 0, y: 0 });
  const [imageViewerDragging, setImageViewerDragging] = useState(false);

  // ====== Busca WhatsApp-like dentro do chat ======
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQ, setChatSearchQ] = useState("");
  const [chatSearchMode, setChatSearchMode] = useState<SearchMode>("normal");
  const [chatSearchLoading, setChatSearchLoading] = useState(false);
  const [chatSearchErr, setChatSearchErr] = useState<string | null>(null);
  const [chatSearchHits, setChatSearchHits] = useState<Message[]>([]);
  const [chatSearchNextCursor, setChatSearchNextCursor] = useState<string | null>(null);
  const [chatSearchActiveIndex, setChatSearchActiveIndex] = useState(-1);

  // ====== “scroll pra mensagem” e destaque persistente ======
  const [pendingScrollToId, setPendingScrollToId] = useState<string | null>(null);
  const [highlightTerm, setHighlightTerm] = useState<string>("");

  const listRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const mediaPreviewHostRef = useRef<HTMLDivElement | null>(null);
  const imageViewerDragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
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
    if (mode !== "conversation") {
      setConversationViewportHeight(null);
      return;
    }

    const compute = () => {
      const host = pageRef.current;
      if (!host) return;
      const top = host.getBoundingClientRect().top;
      const available = Math.floor(window.innerHeight - top - 8);
      setConversationViewportHeight(Math.max(420, available));
    };

    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [mode]);

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

  async function loadContacts(opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;
    if (!silent) {
      setContactsLoading(true);
      setContactsMsg(null);
    }
    try {
      const params: any = { page: 1, pageSize: 60 };

      const q = contactsQ.trim();
      if (q) params.q = q;

      if (companyId) params.companyId = companyId;
      if (departmentId) params.departmentId = departmentId;

      const res = await api.get<PagedContacts>("/admin/history/contacts", { params });
      setContacts(res.data.items ?? []);
      setBrokenAvatarIds(new Set());
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      if (!silent) {
        setContactsMsg(e?.response?.data?.message ?? "Falha ao carregar contatos");
        setContacts([]);
        setBrokenAvatarIds(new Set());
      }
    } finally {
      if (!silent) {
        setContactsLoading(false);
      }
    }
  }

  function markAvatarBroken(userId: string) {
    setBrokenAvatarIds((prev) => {
      if (prev.has(userId)) return prev;
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
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
    const timer = window.setInterval(() => {
      if (contactsLoading) return;
      void loadContacts({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, contactsLoading]);

  useEffect(() => {
    if (mode !== "contacts") return;
    void loadContactFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== "contacts") return;
    void loadRetentionPolicy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== "contacts") return;
    const timer = window.setInterval(() => {
      if (retentionSaving) return;
      void loadRetentionPolicy({ silent: true, preserveDraft: true });
    }, 15000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, retentionSaving]);

  useEffect(() => {
    if (mode !== "userConversations") return;
    if (!selectedUser?.id) return;
    const timer = window.setInterval(() => {
      if (userConvsLoading) return;
      void loadUserConversations(selectedUser.id, { silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedUser?.id, userConvsLoading]);

  useEffect(() => {
    if (mode !== "conversation") return;
    if (!selectedConv?.id) return;
    const timer = window.setInterval(() => {
      if (mediaLoading) return;
      void loadConversationMedia(selectedConv.id, { silent: true });
    }, 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedConv?.id, mediaLoading]);

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
  async function loadUserConversations(userId: string, opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;
    if (!silent) {
      setUserConvsLoading(true);
      setUserConvsMsg(null);
    }
    try {
      const res = await api.get<{ ok: boolean; items: ConversationItem[] }>(
        `/admin/history/users/${userId}/conversations`
      );
      setUserConvs(res.data.items ?? []);
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      if (!silent) {
        setUserConvsMsg(e?.response?.data?.message ?? "Falha ao carregar conversas");
        setUserConvs([]);
      }
    } finally {
      if (!silent) {
        setUserConvsLoading(false);
      }
    }
  }

  async function openUser(u: Contact) {
    setSelectedUser(u);
    setMode("userConversations");
    await loadUserConversations(u.id);
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

  async function loadConversationMedia(conversationId: string, opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;
    if (!silent) {
      setMediaLoading(true);
      setMediaMsg(null);
    }
    try {
      const res = await api.get<{ ok: boolean; items: Message[] }>(
        `/admin/history/conversations/${conversationId}/media`,
        { params: { take: 600 } }
      );
      setMediaItems(res.data.items ?? []);
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      if (!silent) {
        setMediaMsg(e?.response?.data?.message ?? "Falha ao carregar anexos da conversa");
        setMediaItems([]);
      }
    } finally {
      if (!silent) {
        setMediaLoading(false);
      }
    }
  }

  async function loadRetentionPolicy(opts?: { silent?: boolean; preserveDraft?: boolean }) {
    const silent = !!opts?.silent;
    const preserveDraft = !!opts?.preserveDraft;

    if (!silent) {
      setRetentionLoading(true);
      setRetentionMsg(null);
    }

    try {
      const res = await api.get<{ ok: boolean; policy: RetentionPolicy }>("/admin/history/retention-policy");
      const p = res.data.policy;
      setRetentionPolicy(p);

      const nextDraft: RetentionDraft = {
        enabled: p.enabled,
        intervalUnit: p.intervalUnit,
        intervalCount: String(p.intervalCount ?? 1),
        runHour: twoDigits(p.runHour),
        runMinute: twoDigits(p.runMinute),
        showToUsers: p.showToUsers,
      };

      if (preserveDraft) {
        setRetentionDraft((prev) => prev ?? nextDraft);
      } else {
        setRetentionDraft(nextDraft);
      }
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      if (!silent) {
        setRetentionMsg(e?.response?.data?.message ?? "Falha ao carregar política de exclusão automática");
        setRetentionPolicy(null);
        setRetentionDraft(null);
      }
    } finally {
      if (!silent) {
        setRetentionLoading(false);
      }
    }
  }

  async function saveRetentionPolicy() {
    if (!retentionDraft) return;
    setRetentionSaving(true);
    setRetentionMsg(null);
    const normalizedIntervalCount = normalizeIntervalCountInput(retentionDraft.intervalCount);
    const normalizedHour = normalizeHourInput(retentionDraft.runHour);
    const normalizedMinute = normalizeMinuteInput(retentionDraft.runMinute);
    const payload = {
      enabled: retentionDraft.enabled,
      interval: retentionDraft.intervalUnit === "DAY" ? "DAILY" : retentionDraft.intervalUnit === "MONTH" ? "MONTHLY" : "YEARLY",
      intervalCount: Number(normalizedIntervalCount),
      runHour: Number(normalizedHour),
      runMinute: Number(normalizedMinute),
      showToUsers: retentionDraft.showToUsers,
    };
    try {
      const res = await api.put<{ ok: boolean; policy: RetentionPolicy }>("/admin/history/retention-policy", payload);
      const p = res.data.policy;
      setRetentionPolicy(p);
      setRetentionDraft({
        enabled: p.enabled,
        intervalUnit: p.intervalUnit,
        intervalCount: String(p.intervalCount ?? 1),
        runHour: twoDigits(p.runHour),
        runMinute: twoDigits(p.runMinute),
        showToUsers: p.showToUsers,
      });
      setRetentionMsg("Política salva com sucesso.");
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      setRetentionMsg(e?.response?.data?.message ?? "Falha ao salvar política de exclusão automática");
    } finally {
      setRetentionSaving(false);
    }
  }

  function updateRetentionDraft(patch: Partial<RetentionDraft>) {
    setRetentionDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function normalizeRetentionDraftTime(field: "runHour" | "runMinute") {
    setRetentionDraft((prev) => {
      if (!prev) return prev;
      if (field === "runHour") {
        return { ...prev, runHour: normalizeHourInput(prev.runHour) };
      }
      return { ...prev, runMinute: normalizeMinuteInput(prev.runMinute) };
    });
  }

  function normalizeRetentionDraftIntervalCount() {
    setRetentionDraft((prev) => (prev ? { ...prev, intervalCount: normalizeIntervalCountInput(prev.intervalCount) } : prev));
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

  function normalizeMediaItems(items: Message[]) {
    return [...items]
      .filter((item) => isMediaAttachment(item) && !!item.attachmentUrl)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  function clampViewerZoom(value: number) {
    return Math.min(4, Math.max(1, Number.isFinite(value) ? value : 1));
  }

  function resetImageViewerTransform() {
    imageViewerDragRef.current = null;
    setImageViewerZoom(1);
    setImageViewerOffset({ x: 0, y: 0 });
    setImageViewerDragging(false);
  }

  function setViewerZoom(nextZoom: number) {
    const safe = clampViewerZoom(nextZoom);
    setImageViewerZoom(safe);
    if (safe <= 1) {
      setImageViewerOffset({ x: 0, y: 0 });
      setImageViewerDragging(false);
    }
  }

  function openImageViewer(message: Message) {
    const items = normalizeMediaItems(mediaItems.length ? mediaItems : messages);
    if (!items.length) return;
    const idx = items.findIndex((item) => item.id === message.id);
    setImageViewerItems(items);
    setImageViewerIndex(idx >= 0 ? idx : 0);
    setImageViewerOpen(true);
    resetImageViewerTransform();
  }

  function closeImageViewer() {
    setImageViewerOpen(false);
    resetImageViewerTransform();
  }

  function goImage(offset: number) {
    setImageViewerIndex((prev) => {
      const next = prev + offset;
      if (next < 0 || next >= imageViewerItems.length) return prev;
      resetImageViewerTransform();
      return next;
    });
  }

  async function jumpToMessage(messageId: string) {
    if (!selectedConv?.id) return;
    setMediaLibraryOpen(false);
    if (imageViewerOpen) {
      closeImageViewer();
    }
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    setPendingScrollToId(messageId);
    await ensureMessageLoaded(selectedConv.id, messageId);
  }

  async function downloadAttachment(message: Partial<Message>) {
    const absoluteUrl = toAbsoluteUrl(message.attachmentUrl);
    if (!absoluteUrl) return;
    await triggerBrowserDownload(absoluteUrl, attachmentDownloadName(message));
  }

  async function removeAttachment(message: Message) {
    if (!selectedConv?.id) return;
    if (!message.attachmentUrl) return;

    const ok = window.confirm("Excluir este arquivo/imagem do servidor e da conversa?");
    if (!ok) return;

    setRemovingAttachmentId(message.id);
    setChatMsg(null);
    try {
      const res = await api.delete<{ ok: boolean; message: Message }>(
        `/admin/history/messages/${message.id}/attachment`
      );
      const updated = res.data.message;

      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setChatSearchHits((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setMediaItems((prev) => prev.filter((m) => m.id !== updated.id));
      setImageViewerItems((prev) => prev.filter((m) => m.id !== updated.id));
      setRetentionMsg(null);
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      setChatMsg(e?.response?.data?.message ?? "Falha ao excluir anexo");
    } finally {
      setRemovingAttachmentId(null);
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
    setChatSearchActiveIndex(-1);

    setHighlightTerm("");
    setPendingScrollToId(null);
    setMediaTab("image");
    setMediaLibraryTab("image");
    setMediaLibraryOpen(false);
    setImageViewerOpen(false);
    setImageViewerItems([]);
    setImageViewerIndex(0);
    setNewMsgsCount(0);
    setShowJumpNew(false);

    await Promise.all([
      loadFirstPage(conv.id, { scrollToBottom: true }),
      loadConversationMedia(conv.id),
    ]);
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
    setMediaTab("image");
    setMediaLibraryTab("image");
    setMediaLibraryOpen(false);
    setNewMsgsCount(0);
    setShowJumpNew(false);

    setChatSearchOpen(false);
    setChatSearchQ("");
    setChatSearchHits([]);
    setChatSearchNextCursor(null);
    setChatSearchErr(null);
    setChatSearchActiveIndex(-1);
    setImageViewerOpen(false);
    setImageViewerItems([]);
    setImageViewerIndex(0);

    const first = await loadFirstPage(conv.id, { scrollToBottom: false });
    await Promise.all([loadConversationMedia(conv.id)]);

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
      const el = listRef.current;
      const distanceFromBottom = el ? el.scrollHeight - (el.scrollTop + el.clientHeight) : 0;
      const nearBottom = !el || distanceFromBottom < 140;

      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      if ((msg.contentType === "IMAGE" || msg.contentType === "FILE") && msg.attachmentUrl && !msg.deletedAt) {
        setMediaItems((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [msg, ...prev];
        });
      }

      requestAnimationFrame(() => {
        const target = listRef.current;
        if (nearBottom) {
          setShowJumpNew(false);
          setNewMsgsCount(0);
          if (target) target.scrollTop = target.scrollHeight;
        } else {
          setShowJumpNew(true);
          setNewMsgsCount((prev) => prev + 1);
        }
      });
    });

    s.on("message:updated", (msg: Message) => {
      if (msg?.conversationId !== selectedConv.id) return;
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      setChatSearchHits((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      setMediaItems((prev) => {
        const hasMedia = (msg.contentType === "IMAGE" || msg.contentType === "FILE") && !!msg.attachmentUrl && !msg.deletedAt;
        if (!hasMedia) return prev.filter((m) => m.id !== msg.id);
        return prev.some((m) => m.id === msg.id) ? prev.map((m) => (m.id === msg.id ? msg : m)) : [msg, ...prev];
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
    const effectiveSearchMode: SearchMode = isMobileLayout ? "normal" : chatSearchMode;
    if (!q) {
      setChatSearchErr(null);
      setChatSearchHits([]);
      setChatSearchNextCursor(null);
      setChatSearchActiveIndex(-1);
      setChatSearchLoading(false);
      return;
    }

    setChatSearchLoading(true);
    setChatSearchErr(null);

    try {
      if (isMobileLayout && firstPage) {
        let cursor: string | null = null;
        let guard = 0;
        const allHits: Message[] = [];

        do {
          const data = await fetchMessagesPage({
            conversationId: selectedConv.id,
            take: 80,
            cursor,
            q,
          });

          const items = data.items ?? [];
          allHits.push(...items.filter((m) => matchText(messageSearchableText(m), q, effectiveSearchMode)));
          cursor = data.nextCursor ?? null;
          guard += 1;
        } while (cursor && guard < 80);

        setChatSearchHits(allHits);
        setChatSearchNextCursor(null);
        setChatSearchActiveIndex(allHits.length ? 0 : -1);
        if (allHits[0]) {
          await jumpToChatHit(allHits[0]);
        }
        return;
      }

      const data = await fetchMessagesPage({
        conversationId: selectedConv.id,
        take: 80,
        cursor: firstPage ? null : chatSearchNextCursor,
        q, // backend faz "contains"; a regra exata/acentos/caixa garantimos no client
      });

      const items = data.items ?? [];
      const filtered = items.filter((m) => matchText(messageSearchableText(m), q, effectiveSearchMode));

      setChatSearchHits((prev) => (firstPage ? filtered : [...prev, ...filtered]));
      setChatSearchNextCursor(data.nextCursor ?? null);
      if (firstPage) {
        setChatSearchActiveIndex(filtered.length ? 0 : -1);
        if (isMobileLayout && filtered[0]) {
          await jumpToChatHit(filtered[0]);
        }
      }
    } catch (e: any) {
      if (e?.response?.status === 401) return logout();
      setChatSearchErr(e?.response?.data?.message ?? "Falha ao buscar na conversa");
      setChatSearchHits([]);
      setChatSearchNextCursor(null);
      setChatSearchActiveIndex(-1);
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
      setChatSearchActiveIndex(-1);
      setChatSearchLoading(false);
      return;
    }

    const t = setTimeout(() => {
      runChatSearch(true);
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatSearchQ, chatSearchOpen, mode, selectedConv?.id, chatSearchMode, isMobileLayout]);

  async function jumpToChatHit(m: Message) {
    if (!selectedConv?.id) return;

    setHighlightTerm(chatSearchQ.trim());
    setPendingScrollToId(m.id);

    await ensureMessageLoaded(selectedConv.id, m.id);
  }

  async function stepChatSearch(direction: -1 | 1) {
    if (!chatSearchHits.length) return;

    const total = chatSearchHits.length;
    let nextIndex = chatSearchActiveIndex;
    if (nextIndex < 0) {
      nextIndex = direction > 0 ? 0 : total - 1;
    } else {
      nextIndex = (nextIndex + direction + total) % total;
    }

    setChatSearchActiveIndex(nextIndex);
    await jumpToChatHit(chatSearchHits[nextIndex]);
  }

  function resetChatSearch(opts?: { clearHighlight?: boolean }) {
    const clearHighlight = opts?.clearHighlight ?? true;
    setChatSearchOpen(false);
    setChatSearchQ("");
    setChatSearchHits([]);
    setChatSearchNextCursor(null);
    setChatSearchErr(null);
    setChatSearchActiveIndex(-1);
    setChatSearchLoading(false);
    if (clearHighlight) {
      setHighlightTerm("");
    }
  }

  function toggleChatSearch() {
    if (chatSearchOpen) {
      resetChatSearch();
      return;
    }
    if (isMobileLayout) {
      setChatSearchMode("normal");
    }
    setChatSearchOpen(true);
  }

  function backToUserConversations() {
    setMode("userConversations");
    setSelectedConv(null);
    setMessages([]);
    setNextCursor(null);
    setHasMore(true);

    resetChatSearch();
    setPendingScrollToId(null);
    setMediaItems([]);
    setMediaMsg(null);
    setMediaTab("image");
    setMediaLibraryTab("image");
    setMediaLibraryOpen(false);
    setNewMsgsCount(0);
    setShowJumpNew(false);
    setRemovingAttachmentId(null);
    setImageViewerOpen(false);
    setImageViewerItems([]);
    setImageViewerIndex(0);
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

  const imageMediaItems = useMemo(
    () =>
      [...mediaItems]
        .filter((item) => isMediaAttachment(item) && !!item.attachmentUrl)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [mediaItems]
  );

  const fileMediaItems = useMemo(
    () =>
      [...mediaItems]
        .filter((item) => !isMediaAttachment(item) && item.contentType === "FILE" && !!item.attachmentUrl)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [mediaItems]
  );

  const imagePreviewData = useMemo(() => {
    const slotCount = Math.max(2, mediaPreviewSlots);
    const hasMore = imageMediaItems.length > slotCount - 1;
    const visibleCount = hasMore ? Math.max(slotCount - 1, 1) : Math.min(imageMediaItems.length, slotCount);
    return {
      hasMore,
      items: imageMediaItems.slice(0, visibleCount),
    };
  }, [imageMediaItems, mediaPreviewSlots]);

  const filePreviewData = useMemo(() => {
    const slotCount = Math.max(2, mediaPreviewSlots);
    const hasMore = fileMediaItems.length > slotCount - 1;
    const visibleCount = hasMore ? Math.max(slotCount - 1, 1) : Math.min(fileMediaItems.length, slotCount);
    return {
      hasMore,
      items: fileMediaItems.slice(0, visibleCount),
    };
  }, [fileMediaItems, mediaPreviewSlots]);
  const mediaPreviewGridColumns = Math.max(2, mediaPreviewSlots);

  const mediaLibraryItems = mediaLibraryTab === "image" ? imageMediaItems : fileMediaItems;

  const hasRetentionChanges = useMemo(() => {
    if (!retentionDraft || !retentionPolicy) return false;
    return (
      retentionDraft.enabled !== retentionPolicy.enabled ||
      retentionDraft.showToUsers !== retentionPolicy.showToUsers ||
      retentionDraft.intervalUnit !== retentionPolicy.intervalUnit ||
      normalizeIntervalCountInput(retentionDraft.intervalCount) !== String(retentionPolicy.intervalCount ?? 1) ||
      normalizeHourInput(retentionDraft.runHour) !== twoDigits(retentionPolicy.runHour) ||
      normalizeMinuteInput(retentionDraft.runMinute) !== twoDigits(retentionPolicy.runMinute)
    );
  }, [retentionDraft, retentionPolicy]);

  const retentionFrequencyText = retentionPolicy?.enabled
    ? `${retentionPolicy.intervalLabel} às ${twoDigits(retentionPolicy.runHour)}:${twoDigits(retentionPolicy.runMinute)}`
    : "Desativada";
  const retentionNextRunText = retentionPolicy?.enabled
    ? retentionPolicy.nextRunAt
      ? fmt(retentionPolicy.nextRunAt)
      : "a definir"
    : "Desativada";
  const retentionLastRunText = retentionPolicy?.lastRunAt ? fmt(retentionPolicy.lastRunAt) : "Nenhuma execução registrada";
  const retentionLastCountsText = retentionPolicy
    ? `${retentionPolicy.lastMediaCount ?? 0} mídia(s) • ${retentionPolicy.lastFileCount ?? 0} arquivo(s)`
    : "0 mídia(s) • 0 arquivo(s)";
  const retentionNextCountsText = retentionPolicy
    ? `${retentionPolicy.nextMediaCount ?? 0} mídia(s) • ${retentionPolicy.nextFileCount ?? 0} arquivo(s)`
    : "0 mídia(s) • 0 arquivo(s)";

  const currentViewerItem = imageViewerItems[imageViewerIndex] ?? null;
  const currentViewerUrl = toAbsoluteUrl(currentViewerItem?.attachmentUrl);
  const currentViewerIsVideo = currentViewerItem ? isVideoAttachment(currentViewerItem) : false;
  const canViewerPrev = imageViewerIndex > 0;
  const canViewerNext = imageViewerIndex < imageViewerItems.length - 1;
  const currentChatSearchPosition =
    chatSearchHits.length > 0 && chatSearchActiveIndex >= 0 ? chatSearchActiveIndex + 1 : 0;

  useEffect(() => {
    if (!imageViewerOpen) return;
    if (imageViewerItems.length === 0) {
      closeImageViewer();
      return;
    }
    if (imageViewerIndex >= imageViewerItems.length) {
      setImageViewerIndex(Math.max(0, imageViewerItems.length - 1));
    }
  }, [imageViewerIndex, imageViewerItems.length, imageViewerOpen]);

  useEffect(() => {
    if (mode !== "conversation") return;
    const host = mediaPreviewHostRef.current;
    if (!host) return;

    const recompute = () => {
      const width = host.clientWidth || 0;
      if (!width) return;
      const minCardWidth = mediaTab === "image" ? 158 : 220;
      const gap = 10;
      const floor = Math.floor((width + gap) / (minCardWidth + gap));
      const minSlots = isMobileLayout ? 2 : 3;
      const slots = Math.min(8, Math.max(minSlots, floor));
      setMediaPreviewSlots(slots);
    };

    recompute();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => recompute());
      ro.observe(host);
    } else {
      window.addEventListener("resize", recompute);
    }

    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", recompute);
    };
  }, [mode, mediaTab, isMobileLayout]);

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
    <div
      ref={pageRef}
      className={`admin-page ${mode === "conversation" ? "admin-page--conversation" : ""}`}
      style={mode === "conversation" && conversationViewportHeight ? { height: conversationViewportHeight } : undefined}
    >
      {mode !== "conversation" ? (
        <>
          <h1 style={{ margin: 0, marginBottom: 6 }}>Históricos</h1>
          <div className="admin-historySubtitle">{headerSubtitle}</div>
        </>
      ) : null}

      {mode === "contacts" ? (
        <div className="admin-grid12">
          <div className="admin-historyRetentionWrap">
            <div className="admin-historyRetentionCard">
              {retentionLoading || !retentionDraft ? (
                <div className="admin-historyInfoText">Carregando política...</div>
              ) : (
                <div className="admin-historyRetentionCard__grid">
                  <div className="admin-historyRetentionCard__topRow">
                    <div className="admin-historyRetentionCard__togglesCol">
                      <div className="admin-historyRetentionCard__toggleItem">
                        <ToggleSwitch
                          checked={retentionDraft.enabled}
                          onChange={(value) => updateRetentionDraft({ enabled: value })}
                        />
                        <div className="admin-historyRetentionCard__toggleText">
                          <div className="admin-historyRetentionCard__toggleTitle">Ativar exclusão automática</div>
                          <div className="admin-historyRetentionCard__toggleHint">
                            Desative para pausar execuções automáticas.
                          </div>
                        </div>
                      </div>

                      <div className={`admin-historyRetentionCard__toggleItem ${!retentionDraft.enabled ? "is-disabled" : ""}`}>
                        <ToggleSwitch
                          checked={retentionDraft.showToUsers}
                          disabled={!retentionDraft.enabled}
                          onChange={(value) => updateRetentionDraft({ showToUsers: value })}
                        />
                        <div className="admin-historyRetentionCard__toggleText">
                          <div className="admin-historyRetentionCard__toggleTitle">Mostrar política para usuários no chat</div>
                          <div className="admin-historyRetentionCard__toggleHint">
                            Exibe a data da próxima exclusão para os usuários.
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`admin-historyRetentionCard__statusBox ${!retentionDraft.enabled ? "is-disabled" : ""}`}>
                      <div className="admin-historyRetentionCard__statusLine">
                        <span className="admin-historyRetentionCard__statusLabel">Próxima execução</span>
                        <strong className="admin-historyRetentionCard__statusValue">{retentionNextRunText}</strong>
                      </div>
                      <div className="admin-historyRetentionCard__statusLine">
                        <span className="admin-historyRetentionCard__statusLabel">Última execução</span>
                        <strong className="admin-historyRetentionCard__statusValue">{retentionLastRunText}</strong>
                      </div>
                      <div className="admin-historyRetentionCard__statusLine">
                        <span className="admin-historyRetentionCard__statusLabel">Próxima limpeza</span>
                        <strong className="admin-historyRetentionCard__statusValue">{retentionNextCountsText}</strong>
                      </div>
                      <div className="admin-historyRetentionCard__statusLine">
                        <span className="admin-historyRetentionCard__statusLabel">Última limpeza</span>
                        <strong className="admin-historyRetentionCard__statusValue">{retentionLastCountsText}</strong>
                      </div>
                    </div>
                  </div>

                  <div className={`admin-historyRetentionCard__settings ${!retentionDraft.enabled ? "is-disabled" : ""}`}>
                    <div className="admin-historyRetentionCard__controlsRow">
                      <div className="admin-historyRetentionCard__group admin-historyRetentionCard__group--interval">
                        <span className="admin-historyRetentionCard__groupLabel">Periodicidade</span>
                        <div className="admin-historyRetentionCard__intervalFields">
                          <input
                            aria-label="Periodicidade"
                            value={retentionDraft.intervalCount}
                            disabled={!retentionDraft.enabled}
                            onChange={(e) => updateRetentionDraft({ intervalCount: intervalCountDigitsOnly(e.target.value) })}
                            onBlur={normalizeRetentionDraftIntervalCount}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                            }}
                            placeholder="1"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={3}
                            style={inputStyle({ width: 88, textAlign: "center", fontWeight: 900 })}
                          />
                          <select
                            aria-label="Unidade da periodicidade"
                            value={retentionDraft.intervalUnit}
                            disabled={!retentionDraft.enabled}
                            onChange={(e) => updateRetentionDraft({ intervalUnit: e.target.value as RetentionIntervalUnit })}
                            style={inputStyle({ minWidth: 132 })}
                          >
                            <option value="DAY">Dia</option>
                            <option value="MONTH">Mês</option>
                            <option value="YEAR">Ano</option>
                          </select>
                        </div>
                      </div>

                      <label className="admin-historyRetentionCard__group admin-historyRetentionCard__group--time">
                        <span className="admin-historyRetentionCard__groupLabel">Horário da execução (24h)</span>
                        <div className="admin-historyRetentionCard__timeField">
                          <input
                            value={retentionDraft.runHour}
                            disabled={!retentionDraft.enabled}
                            onChange={(e) => updateRetentionDraft({ runHour: timeDigitsOnly(e.target.value) })}
                            onBlur={() => normalizeRetentionDraftTime("runHour")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                            }}
                            placeholder="HH"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={2}
                            style={inputStyle({ width: 78, textAlign: "center", fontWeight: 900 })}
                          />
                          <span className="admin-historyRetentionCard__timeSep">:</span>
                          <input
                            value={retentionDraft.runMinute}
                            disabled={!retentionDraft.enabled}
                            onChange={(e) => updateRetentionDraft({ runMinute: timeDigitsOnly(e.target.value) })}
                            onBlur={() => normalizeRetentionDraftTime("runMinute")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                            }}
                            placeholder="MM"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={2}
                            style={inputStyle({ width: 78, textAlign: "center", fontWeight: 900 })}
                          />
                        </div>
                      </label>

                      <div className="admin-historyRetentionCard__summaryBlock">
                        <div className="admin-historyRetentionCard__summaryLine">
                          <span className="admin-historyRetentionCard__summaryLabel">Frequência ativa:</span>
                          <strong className="admin-historyRetentionCard__summaryValue">{retentionFrequencyText}</strong>
                        </div>

                        {retentionMsg ? (
                          <div
                            className={`admin-historyRetentionCard__summaryFeedback ${
                              retentionMsg.includes("sucesso") ? "is-success" : "is-error"
                            }`}
                          >
                            {retentionMsg}
                          </div>
                        ) : null}
                      </div>

                      <div className="admin-historyRetentionCard__saveWrap">
                        <button
                          type="button"
                          onClick={() => void saveRetentionPolicy()}
                          className={`admin-historySaveBtn ${hasRetentionChanges ? "is-active" : "is-idle"}`}
                          disabled={retentionSaving || !hasRetentionChanges}
                          title={hasRetentionChanges ? "Salvar alterações da política" : "Nenhuma alteração pendente"}
                        >
                          {retentionSaving ? "Salvando..." : "Salvar política"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

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
                      const showAvatar = !!avatar && !brokenAvatarIds.has(u.id);
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
                                {showAvatar ? <img src={avatar ?? ""} alt={u.name} onError={() => markAvatarBroken(u.id)} /> : fallback}
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
                          <div className="admin-historyContactCard__avatar">
                            {showAvatar ? <img src={avatar ?? ""} alt={u.name} onError={() => markAvatarBroken(u.id)} /> : fallback}
                          </div>
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
                  (() => {
                    const avatar = contactAvatarUrl(c.otherUser.avatarUrl);
                    const showAvatar = !!avatar && !brokenAvatarIds.has(c.otherUser.id);
                    const fallback = (c.otherUser.name || c.otherUser.username).slice(0, 1).toUpperCase();
                    const previewText = c.lastMessage?.bodyPreview || "Sem mensagens ainda";
                    const previewDate = c.lastMessage?.createdAt ?? c.updatedAt;

                    return (
                      <button
                        key={c.id}
                        onClick={() => openConversation(c)}
                        className="admin-historyConvCard"
                      >
                        <div className="admin-historyConvCard__avatar">
                          {showAvatar ? (
                            <img
                              src={avatar ?? ""}
                              alt={c.otherUser.name}
                              onError={() => markAvatarBroken(c.otherUser.id)}
                            />
                          ) : (
                            fallback
                          )}
                        </div>

                        <div className="admin-historyConvCard__main">
                          <div className="admin-historyConvCard__top">
                            <div className="admin-historyConvCard__identity">
                              <div className="admin-historyConvCard__name">{c.otherUser.name}</div>
                              <div className="admin-historyConvCard__username">@{c.otherUser.username}</div>
                            </div>
                            <div className="admin-historyConvCard__time">{fmt(previewDate)}</div>
                          </div>

                          <div className="admin-historyConvCard__preview">{previewText}</div>
                        </div>
                      </button>
                    );
                  })()
                ))
              )}
            </div>
          </Card>
        </div>
      ) : (
        <div className="admin-grid12">
          <Card title="" colSpan={12} className="admin-historyConversationCard">
            {chatMsg ? <div style={{ marginBottom: 10, color: "#ff8a8a", fontSize: 13 }}>{chatMsg}</div> : null}
            {mediaMsg ? <div style={{ marginBottom: 10, color: "#ff8a8a", fontSize: 13 }}>{mediaMsg}</div> : null}

            <div className="admin-historyConvTools">
              <button
                onClick={toggleChatSearch}
                className="bhash-iconBtn"
                title={chatSearchOpen ? "Fechar busca" : "Abrir busca"}
              >
                <SearchIcon />
              </button>
              <div className="admin-historyConvTools__title">
                {selectedUser?.name ?? "Usuário"} ↔ {selectedConv?.otherUser?.name ?? "Contato"}
              </div>
              <button onClick={backToUserConversations} style={ghostBtn(false)}>
                ← Voltar
              </button>
            </div>

            {isMobileLayout && chatSearchOpen ? (
              <div className="admin-historyMobileFindBar">
                <div className="admin-historyMobileFindBar__row">
                  <input
                    value={chatSearchQ}
                    onChange={(e) => setChatSearchQ(e.target.value)}
                    placeholder="Buscar no chat..."
                    className="admin-historyMobileFindBar__input"
                    autoFocus
                  />
                  <div className="admin-historyMobileFindBar__count">
                    {chatSearchLoading ? "..." : `${currentChatSearchPosition}/${chatSearchHits.length}`}
                  </div>
                </div>

                <div className="admin-historyMobileFindBar__actions">
                  <button
                    type="button"
                    className="admin-historyMobileFindBar__btn"
                    onClick={() => void stepChatSearch(-1)}
                    disabled={chatSearchLoading || chatSearchHits.length === 0}
                    title="Ocorrência anterior"
                  >
                    <ChevronUpIcon />
                  </button>
                  <button
                    type="button"
                    className="admin-historyMobileFindBar__btn"
                    onClick={() => void stepChatSearch(1)}
                    disabled={chatSearchLoading || chatSearchHits.length === 0}
                    title="Próxima ocorrência"
                  >
                    <ChevronDownIcon />
                  </button>
                  <button
                    type="button"
                    className="admin-historyMobileFindBar__btn"
                    onClick={() => resetChatSearch()}
                    title="Fechar busca"
                  >
                    <CloseIcon />
                  </button>
                </div>

                {chatSearchErr ? (
                  <div className="admin-historyMobileFindBar__helper is-error">{chatSearchErr}</div>
                ) : (
                  <div className="admin-historyMobileFindBar__helper">
                    {chatSearchLoading
                      ? "Buscando ocorrências..."
                      : chatSearchQ.trim()
                      ? chatSearchHits.length
                        ? "Use as setas para navegar pelas ocorrências."
                        : "Nenhuma ocorrência encontrada."
                      : "Digite uma palavra para localizar as ocorrências nesta conversa."}
                  </div>
                )}
              </div>
            ) : null}

            <div className={`bhash-chatGrid ${chatSearchOpen && !isMobileLayout ? "bhash-chatGrid--withSearch" : ""}`}>
              <div
                ref={listRef}
                onScroll={() => {
                  const el = listRef.current;
                  if (!el) return;
                  const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
                  if (distanceFromBottom < 140) {
                    setShowJumpNew(false);
                    setNewMsgsCount(0);
                  }
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
                    const mediaUrl = toAbsoluteUrl(m.attachmentUrl);
                    const isRemovedImageAttachment = m.contentType === "IMAGE" && !mediaUrl && !!m.deletedAt;
                    const isRemovedFileAttachment = m.contentType === "FILE" && !mediaUrl && !!m.deletedAt;
                    const bodyWithoutRemovedNotice = stripAttachmentRemovalNotice(m.body);

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
                          {!isMe ? (
                            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.85, marginBottom: 4 }}>
                              {m.sender?.name ?? "Usuário"}
                            </div>
                          ) : null}

                          {isMediaAttachment(m) && mediaUrl ? (
                            <button
                              type="button"
                              className="admin-historyInlineImageBtn"
                              onClick={() => openImageViewer(m)}
                              title={isVideoAttachment(m) ? "Abrir mídia" : "Abrir imagem"}
                            >
                              {isVideoAttachment(m) ? (
                                <div className="admin-historyVideoPreview">
                                  <video
                                    src={mediaUrl}
                                    className="admin-historyInlineImage"
                                    preload="metadata"
                                    muted
                                    playsInline
                                  />
                                  <span className="admin-historyVideoPreview__badge">Vídeo</span>
                                </div>
                              ) : (
                                <img
                                  src={mediaUrl}
                                  alt={normalizeAttachmentDisplayName(m.attachmentName) || "imagem"}
                                  className="admin-historyInlineImage"
                                />
                              )}
                            </button>
                          ) : null}

                          {!isMediaAttachment(m) && m.contentType === "FILE" && mediaUrl ? (
                            <a
                              href={mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={`admin-historyInlineFileCard ${isPdfAttachment(m) ? "admin-historyInlineFileCard--pdf" : ""}`}
                            >
                              {isPdfAttachment(m) ? (
                                <div className="admin-historyInlineFileCard__preview" aria-hidden="true">
                                  <iframe
                                    src={buildPdfPreviewUrl(m.attachmentUrl) ?? ""}
                                    title={normalizeAttachmentDisplayName(m.attachmentName) || "Pré-visualização do PDF"}
                                    loading="lazy"
                                    tabIndex={-1}
                                  />
                                </div>
                              ) : null}
                              <div className="admin-historyInlineFileCard__body">
                                <div className="admin-historyInlineFileCard__name">
                                  {normalizeAttachmentDisplayName(m.attachmentName) || "Arquivo"}
                                </div>
                                <div className="admin-historyInlineFileCard__meta">
                                  {m.attachmentMime ?? "Arquivo"}
                                  {m.attachmentSize ? ` • ${formatBytes(m.attachmentSize)}` : ""}
                                </div>
                              </div>
                            </a>
                          ) : null}

                          {isRemovedImageAttachment ? (
                            <div className="admin-historyRemovedAttachment admin-historyRemovedAttachment--image">
                              <div className="admin-historyRemovedAttachment__icon" aria-hidden="true">
                                <ImageIcon />
                              </div>
                              <div className="admin-historyRemovedAttachment__title">Essa imagem foi apagada</div>
                              <div className="admin-historyRemovedAttachment__text">
                                Pelo administrador segundo a política de backup de arquivos.
                              </div>
                            </div>
                          ) : null}

                          {isRemovedFileAttachment ? (
                            <div className="admin-historyRemovedAttachment admin-historyRemovedAttachment--file">
                              <div className="admin-historyRemovedAttachment__icon" aria-hidden="true">
                                <FileIcon />
                              </div>
                              <div className="admin-historyRemovedAttachment__title">Esse documento foi apagado</div>
                              <div className="admin-historyRemovedAttachment__text">
                                Pelo administrador segundo a política de backup de arquivos.
                              </div>
                            </div>
                          ) : null}

                          {bodyWithoutRemovedNotice ? (
                            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35, paddingRight: 54 }}>
                              {highlightTerm.trim() ? (
                                <HighlightText text={bodyWithoutRemovedNotice} query={highlightTerm.trim()} />
                              ) : (
                                bodyWithoutRemovedNotice
                              )}
                            </div>
                          ) : null}

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

              {chatSearchOpen && !isMobileLayout ? (
                <aside className="bhash-searchPanel">
                  <div className="admin-historySearchPanel__head">
                    <div className="admin-historySearchPanel__title">Modo de Pesquisa</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <ModeToggle value={chatSearchMode} onChange={setChatSearchMode} small />
                      <button onClick={() => resetChatSearch()} className="bhash-iconBtn" title="Fechar busca">
                        ×
                      </button>
                    </div>
                  </div>

                  <div className="admin-historySearchPanel__input">
                    <input
                      value={chatSearchQ}
                      onChange={(e) => setChatSearchQ(e.target.value)}
                      placeholder="Buscar..."
                      style={inputStyle({ width: "100%" })}
                    />
                  </div>

                  <div className="bhash-searchPanel__list">
                    <div className="bhash-searchPanel__listInner">
                      {chatSearchErr ? <div style={{ color: "#ff8a8a", fontSize: 13 }}>{chatSearchErr}</div> : null}

                      <div style={{ color: "var(--muted)", fontSize: 12 }}>
                        {chatSearchQ.trim()
                          ? `${chatSearchHits.length} resultado(s)`
                          : "Digite um termo para ver as ocorrências nesta conversa."}
                      </div>

                      {chatSearchQ.trim() && chatSearchHits.length === 0 && !chatSearchLoading ? (
                        <div style={{ color: "var(--muted)" }}>Nenhuma ocorrência.</div>
                      ) : null}

                      {chatSearchHits.map((m, index) => {
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
                            onClick={() => {
                              setChatSearchActiveIndex(index);
                              void jumpToChatHit(m);
                            }}
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
                              <HighlightText text={messagePreviewText(m)} query={chatSearchQ.trim()} />
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
                </aside>
              ) : null}
            </div>

            {showJumpNew ? (
              <button
                className="admin-historyJumpNewBtn"
                onClick={() => {
                  const el = listRef.current;
                  if (el) el.scrollTop = el.scrollHeight;
                  setShowJumpNew(false);
                  setNewMsgsCount(0);
                }}
                title="Ir para novas mensagens"
              >
                <span>Novas mensagens</span>
                <span className="admin-historyJumpNewBtn__count">{newMsgsCount > 99 ? "99+" : newMsgsCount}</span>
              </button>
            ) : null}

            <div ref={mediaPreviewHostRef} className="admin-historyMediaCard admin-historyMediaCard--bottom">
              <div className="bhash-modeToggle">
                <button
                  type="button"
                  className={`bhash-modeToggle__btn ${mediaTab === "image" ? "is-active" : ""}`}
                  onClick={() => setMediaTab("image")}
                >
                  Mídias ({imageMediaItems.length})
                </button>
                <button
                  type="button"
                  className={`bhash-modeToggle__btn ${mediaTab === "file" ? "is-active" : ""}`}
                  onClick={() => setMediaTab("file")}
                >
                  Documentos ({fileMediaItems.length})
                </button>
              </div>

              {mediaTab === "image" ? (
                <div
                  className="admin-historyMediaPreviewRow"
                  style={{ gridTemplateColumns: `repeat(${mediaPreviewGridColumns}, minmax(0, 1fr))` }}
                >
                  {imagePreviewData.items.length === 0 ? (
                    <div className="admin-historyEmpty">Nenhuma mídia ativa.</div>
                  ) : (
                    imagePreviewData.items.map((item) => {
                      const imageUrl = toAbsoluteUrl(item.attachmentUrl);
                      return (
                        <div key={item.id} className="admin-historyMediaPreviewCard">
                          <button
                            className="admin-historyMediaPreviewThumb"
                            onClick={() => openImageViewer(item)}
                            title={isVideoAttachment(item) ? "Abrir mídia" : "Abrir imagem"}
                          >
                            {isVideoAttachment(item) ? (
                              <div className="admin-historyVideoPreview">
                                <video
                                  src={imageUrl ?? ""}
                                  className="admin-historyMediaThumbVideo"
                                  preload="metadata"
                                  muted
                                  playsInline
                                />
                                <span className="admin-historyVideoPreview__badge">Vídeo</span>
                              </div>
                            ) : (
                              <img src={imageUrl ?? ""} alt={normalizeAttachmentDisplayName(item.attachmentName) || "imagem"} />
                            )}
                          </button>
                          <div className="admin-historyMediaPreviewActions">
                            <button
                              type="button"
                              className="admin-historyMediaPreviewActionBtn"
                              onClick={() => void jumpToMessage(item.id)}
                            >
                              Ver na conversa
                            </button>
                            <button
                              type="button"
                              className="admin-historyMediaPreviewActionBtn admin-historyMediaPreviewActionBtn--icon"
                              onClick={() => void downloadAttachment(item)}
                              title={isVideoAttachment(item) ? "Baixar vídeo" : "Baixar mídia"}
                            >
                              <DownloadIcon />
                            </button>
                            <button
                              type="button"
                              className="admin-historyMediaPreviewActionBtn admin-historyMediaPreviewActionBtn--icon is-danger"
                              onClick={() => void removeAttachment(item)}
                              disabled={removingAttachmentId === item.id}
                              title={removingAttachmentId === item.id ? "Excluindo..." : "Excluir imagem"}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {imagePreviewData.hasMore ? (
                    <button
                      type="button"
                      className="admin-historyMediaMoreBtn"
                      onClick={() => {
                        setMediaLibraryTab("image");
                        setMediaLibraryOpen(true);
                      }}
                    >
                      Ver mais +
                    </button>
                  ) : null}
                </div>
              ) : (
                <div
                  className="admin-historyMediaPreviewRow admin-historyMediaPreviewRow--files"
                  style={{ gridTemplateColumns: `repeat(${mediaPreviewGridColumns}, minmax(0, 1fr))` }}
                >
                  {filePreviewData.items.length === 0 ? (
                    <div className="admin-historyEmpty">Nenhum documento ativo.</div>
                  ) : (
                    filePreviewData.items.map((item) => {
                      const fileUrl = toAbsoluteUrl(item.attachmentUrl);
                      return (
                        <div key={item.id} className="admin-historyMediaPreviewCard admin-historyMediaPreviewCard--file">
                          <a
                            href={fileUrl ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="admin-historyMediaMiniFile"
                            onClick={(e) => {
                              if (!fileUrl) e.preventDefault();
                            }}
                            title={normalizeAttachmentDisplayName(item.attachmentName) || "Arquivo"}
                          >
                            <div className="admin-historyMediaMiniFile__name">
                              {normalizeAttachmentDisplayName(item.attachmentName) || "Arquivo"}
                            </div>
                            <div className="admin-historyMediaMiniFile__meta">
                              {item.attachmentMime ?? "Arquivo"}
                              {item.attachmentSize ? ` • ${formatBytes(item.attachmentSize)}` : ""}
                            </div>
                          </a>
                          <div className="admin-historyMediaPreviewActions">
                            <button
                              type="button"
                              className="admin-historyMediaPreviewActionBtn"
                              onClick={() => void jumpToMessage(item.id)}
                            >
                              Ver na conversa
                            </button>
                            <button
                              type="button"
                              className="admin-historyMediaPreviewActionBtn admin-historyMediaPreviewActionBtn--icon"
                              onClick={() => void downloadAttachment(item)}
                              title="Baixar documento"
                            >
                              <DownloadIcon />
                            </button>
                            <button
                              type="button"
                              className="admin-historyMediaPreviewActionBtn admin-historyMediaPreviewActionBtn--icon is-danger"
                              onClick={() => void removeAttachment(item)}
                              disabled={removingAttachmentId === item.id}
                              title={removingAttachmentId === item.id ? "Excluindo..." : "Excluir documento"}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {filePreviewData.hasMore ? (
                    <button
                      type="button"
                      className="admin-historyMediaMoreBtn"
                      onClick={() => {
                        setMediaLibraryTab("file");
                        setMediaLibraryOpen(true);
                      }}
                    >
                      Ver mais +
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {mediaLibraryOpen ? (
        <div className="admin-historyMediaLibrary" onClick={() => setMediaLibraryOpen(false)}>
          <div className="admin-historyMediaLibrary__panel" onClick={(e) => e.stopPropagation()}>
            <div className="admin-historyMediaLibrary__top">
              <div className="admin-historyMediaLibrary__title">Anexos da conversa</div>
              <button onClick={() => setMediaLibraryOpen(false)} className="bhash-iconBtn" title="Fechar">
                ×
              </button>
            </div>

            <div className="bhash-modeToggle">
              <button
                type="button"
                className={`bhash-modeToggle__btn ${mediaLibraryTab === "image" ? "is-active" : ""}`}
                onClick={() => setMediaLibraryTab("image")}
              >
                Mídias ({imageMediaItems.length})
              </button>
              <button
                type="button"
                className={`bhash-modeToggle__btn ${mediaLibraryTab === "file" ? "is-active" : ""}`}
                onClick={() => setMediaLibraryTab("file")}
              >
                Documentos ({fileMediaItems.length})
              </button>
            </div>

            {mediaLibraryTab === "image" ? (
              <div className="admin-historyMediaStrip">
                {mediaLibraryItems.length === 0 ? (
                  <div className="admin-historyEmpty">Nenhuma mídia ativa.</div>
                ) : (
                  mediaLibraryItems.map((item) => {
                    const imageUrl = toAbsoluteUrl(item.attachmentUrl);
                    return (
                      <div key={item.id} className="admin-historyMediaThumbCard">
                        <button
                          className="admin-historyMediaThumb"
                          onClick={() => openImageViewer(item)}
                          title="Abrir visualizador"
                        >
                          {isVideoAttachment(item) ? (
                            <div className="admin-historyVideoPreview">
                              <video
                                src={imageUrl ?? ""}
                                className="admin-historyMediaThumbVideo"
                                preload="metadata"
                                muted
                                playsInline
                              />
                              <span className="admin-historyVideoPreview__badge">Vídeo</span>
                            </div>
                          ) : (
                            <img src={imageUrl ?? ""} alt={normalizeAttachmentDisplayName(item.attachmentName) || "imagem"} />
                          )}
                        </button>
                        <div className="admin-historyMediaThumbCard__meta">{fmt(item.createdAt)}</div>
                        <div className="admin-historyMediaThumbCard__actions">
                          <button
                            type="button"
                            className="admin-historyMediaLibraryActionBtn"
                            onClick={() => void jumpToMessage(item.id)}
                          >
                            Ver na conversa
                          </button>
                          <button
                            type="button"
                            onClick={() => void downloadAttachment(item)}
                            className="admin-historyMediaLibraryActionBtn admin-historyMediaLibraryActionBtn--icon"
                            title={isVideoAttachment(item) ? "Baixar vídeo" : "Baixar mídia"}
                          >
                            <DownloadIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeAttachment(item)}
                            className="admin-historyMediaLibraryActionBtn admin-historyMediaLibraryActionBtn--icon is-danger"
                            disabled={removingAttachmentId === item.id}
                            title={removingAttachmentId === item.id ? "Excluindo..." : "Excluir imagem"}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="admin-historyMediaFiles">
                {mediaLibraryItems.length === 0 ? (
                  <div className="admin-historyEmpty">Nenhum documento ativo.</div>
                ) : (
                  mediaLibraryItems.map((item) => {
                    return (
                      <div key={item.id} className="admin-historyMediaFileRow">
                        <button
                          type="button"
                          className="admin-historyMediaFileRow__body"
                          onClick={() => void jumpToMessage(item.id)}
                          title="Ir para o documento na conversa"
                          >
                            {isPdfAttachment(item) ? (
                              <div className="admin-historyInlineFileCard__preview admin-historyInlineFileCard__preview--library" aria-hidden="true">
                                <iframe
                                  src={buildPdfPreviewUrl(item.attachmentUrl) ?? ""}
                                  title={normalizeAttachmentDisplayName(item.attachmentName) || "Pré-visualização do PDF"}
                                  loading="lazy"
                                  tabIndex={-1}
                                />
                              </div>
                            ) : null}
                            <div style={{ fontWeight: 800 }}>{normalizeAttachmentDisplayName(item.attachmentName) || "Arquivo"}</div>
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>
                              {item.attachmentMime ?? "Arquivo"}
                            {item.attachmentSize ? ` • ${formatBytes(item.attachmentSize)}` : ""}
                            {` • ${fmt(item.createdAt)}`}
                          </div>
                        </button>
                        <div className="admin-historyMediaFileRow__actions">
                          <button
                            type="button"
                            className="admin-historyMediaLibraryActionBtn"
                            onClick={() => void jumpToMessage(item.id)}
                          >
                            Ver na conversa
                          </button>
                          <button
                            type="button"
                            onClick={() => void downloadAttachment(item)}
                            className="admin-historyMediaLibraryActionBtn admin-historyMediaLibraryActionBtn--icon"
                            title="Baixar documento"
                          >
                            <DownloadIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeAttachment(item)}
                            className="admin-historyMediaLibraryActionBtn admin-historyMediaLibraryActionBtn--icon is-danger"
                            disabled={removingAttachmentId === item.id}
                            title={removingAttachmentId === item.id ? "Excluindo..." : "Excluir documento"}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {imageViewerOpen ? (
        <div className="admin-historyImageViewer" onClick={closeImageViewer}>
          <div className="admin-historyImageViewer__panel" onClick={(e) => e.stopPropagation()}>
            <div className="admin-historyImageViewer__top">
              <div className="admin-historyImageViewer__metaBlock">
                <div className="admin-historyImageViewer__title">
                  {normalizeAttachmentDisplayName(currentViewerItem?.attachmentName) || (currentViewerIsVideo ? "Vídeo" : "Imagem")}
                </div>
                <div className="admin-historyImageViewer__meta">
                  {imageViewerItems.length ? `${imageViewerIndex + 1} de ${imageViewerItems.length}` : "Sem mídias"}
                  {currentViewerItem?.createdAt ? ` • ${fmt(currentViewerItem.createdAt)}` : ""}
                </div>
              </div>
              <div className="admin-historyImageViewer__actions">
                {currentViewerItem ? (
                  <button onClick={() => void jumpToMessage(currentViewerItem.id)} className="admin-historyImageViewer__actionBtn">
                    Ver na conversa
                  </button>
                ) : null}
                {currentViewerItem?.attachmentUrl ? (
                  <button
                    onClick={() => void downloadAttachment(currentViewerItem)}
                    className="admin-historyImageViewer__iconBtn"
                    title={currentViewerIsVideo ? "Baixar vídeo" : "Baixar mídia"}
                  >
                    <DownloadIcon />
                  </button>
                ) : null}
                {currentViewerItem ? (
                  <button
                    onClick={() => void removeAttachment(currentViewerItem)}
                    className="admin-historyImageViewer__actionBtn admin-historyImageViewer__actionBtn--danger"
                    disabled={removingAttachmentId === currentViewerItem.id}
                    title={removingAttachmentId === currentViewerItem.id ? "Excluindo..." : "Excluir imagem"}
                  >
                    <TrashIcon />
                  </button>
                ) : null}
                {!currentViewerIsVideo ? (
                  <>
                    <button
                      type="button"
                      className="admin-historyImageViewer__iconBtn"
                      onClick={() => setViewerZoom(imageViewerZoom - 0.2)}
                      title="Diminuir zoom"
                      disabled={imageViewerZoom <= 1}
                    >
                      <ZoomOutIcon />
                    </button>
                    <button
                      type="button"
                      className="admin-historyImageViewer__iconBtn"
                      onClick={() => setViewerZoom(imageViewerZoom + 0.2)}
                      title="Aumentar zoom"
                    >
                      <ZoomInIcon />
                    </button>
                    <button
                      type="button"
                      className="admin-historyImageViewer__iconBtn"
                      onClick={resetImageViewerTransform}
                      title="Resetar zoom"
                    >
                      <ResetZoomIcon />
                    </button>
                    <span className="admin-historyImageViewer__zoomLabel">{Math.round(imageViewerZoom * 100)}%</span>
                  </>
                ) : null}
                <button onClick={closeImageViewer} className="admin-historyImageViewer__iconBtn" title="Fechar">
                  <CloseIcon />
                </button>
              </div>
            </div>

            <div className="admin-historyImageViewer__stage">
              <button
                className="admin-historyImageViewer__nav"
                onClick={() => goImage(-1)}
                disabled={!canViewerPrev}
                title="Mídia anterior"
              >
                <ChevronLeftIcon />
              </button>

              <div
                className={`admin-historyImageViewer__imageWrap ${imageViewerZoom > 1 ? "is-zoomed" : ""} ${
                  imageViewerDragging ? "is-dragging" : ""
                }`}
                onWheel={(e) => {
                  if (!currentViewerUrl || currentViewerIsVideo) return;
                  e.preventDefault();
                  const delta = e.deltaY < 0 ? 0.2 : -0.2;
                  setViewerZoom(imageViewerZoom + delta);
                }}
                onMouseDown={(e) => {
                  if (imageViewerZoom <= 1 || currentViewerIsVideo) return;
                  e.preventDefault();
                  imageViewerDragRef.current = {
                    active: true,
                    startX: e.clientX,
                    startY: e.clientY,
                    originX: imageViewerOffset.x,
                    originY: imageViewerOffset.y,
                  };
                  setImageViewerDragging(true);
                }}
                onMouseMove={(e) => {
                  const drag = imageViewerDragRef.current;
                  if (!drag?.active) return;
                  setImageViewerOffset({
                    x: drag.originX + (e.clientX - drag.startX),
                    y: drag.originY + (e.clientY - drag.startY),
                  });
                }}
                onMouseUp={() => {
                  if (imageViewerDragRef.current) imageViewerDragRef.current.active = false;
                  setImageViewerDragging(false);
                }}
                onMouseLeave={() => {
                  if (imageViewerDragRef.current) imageViewerDragRef.current.active = false;
                  setImageViewerDragging(false);
                }}
                onDoubleClick={() => {
                  if (currentViewerIsVideo) return;
                  if (imageViewerZoom > 1) resetImageViewerTransform();
                  else setViewerZoom(2);
                }}
              >
                {currentViewerUrl ? (
                  currentViewerIsVideo ? (
                    <video
                      key={currentViewerItem?.id ?? currentViewerUrl}
                      src={currentViewerUrl}
                      className="admin-historyImageViewer__video"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      key={currentViewerItem?.id ?? currentViewerUrl}
                      src={currentViewerUrl}
                      alt={normalizeAttachmentDisplayName(currentViewerItem?.attachmentName) || "imagem"}
                      className="admin-historyImageViewer__image"
                      draggable={false}
                      style={{
                        transform: `translate(${imageViewerOffset.x}px, ${imageViewerOffset.y}px) scale(${imageViewerZoom})`,
                      }}
                    />
                  )
                ) : (
                  <div className="admin-historyEmpty">{currentViewerIsVideo ? "Vídeo indisponível." : "Imagem indisponível."}</div>
                )}
              </div>

              <button
                className="admin-historyImageViewer__nav"
                onClick={() => goImage(1)}
                disabled={!canViewerNext}
                title="Próxima mídia"
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`admin-historySwitch ${checked ? "is-on" : ""} ${disabled ? "is-disabled" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="admin-historySwitch__thumb" />
    </button>
  );
}

/** ===== UI helpers no estilo do seu admin ===== */
function Card({
  title,
  colSpan,
  right,
  className,
  children,
}: {
  title: string;
  colSpan: number;
  right?: React.ReactNode;
  className?: string;
  children: any;
}) {
  const hasHeader = !!title || !!right;
  return (
    <div
      className={`admin-card ${className ?? ""}`}
      style={{
        gridColumn: `span ${colSpan}`,
        padding: 16,
        borderRadius: 18,
        border: "1px solid var(--border)",
        background: "var(--card-bg)",
        boxShadow: "var(--shadow)",
      }}
    >
      {hasHeader ? (
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
          {title ? <div style={{ fontWeight: 900 }}>{title}</div> : <div />}
          {right ? <div>{right}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <path d="M21 16l-5-5-6 6-2-2-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M8 3h6l5 5v13H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" />
      <path d="M14 3v6h6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 4h6a1 1 0 0 1 1 1v2H8V5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M12 4v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m8 11 4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M11 8v6M8 11h6M16.2 16.2l3.3 3.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11h6M16.2 16.2l3.3 3.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ResetZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M5 12a7 7 0 1 0 2-4.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 5v4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="m6 15 6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
