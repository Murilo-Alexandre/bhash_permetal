import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from "react";
import type { Socket } from "socket.io-client";
import { useAuth } from "../auth";
import { useTheme } from "../theme";
import { createSocket } from "../socket";
import { TopNav } from "../components/TopNav";
import { API_BASE } from "../api";

type SearchMode = "normal" | "exact";

type UserMini = {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  extension?: string | null;
  avatarUrl?: string | null;
  company?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
};

type ReactionRaw = {
  id: string;
  emoji: string;
  userId: string;
  user?: {
    id: string;
    username: string;
    name: string;
  };
};

type ReactionItem = {
  emoji: string;
  count: number;
  reactedByMe?: boolean;
};

type ReplyToMessage = {
  id: string;
  body?: string | null;
  contentType?: "TEXT" | "IMAGE" | "FILE";
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  sender?: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string | null;
  };
};

type Message = {
  id: string;
  createdAt: string;
  conversationId: string;
  senderId: string;
  body?: string | null;
  contentType?: "TEXT" | "IMAGE" | "FILE";
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  replyToId?: string | null;
  deletedAt?: string | null;
  sender: UserMini;
  replyTo?: ReplyToMessage | null;
  reactions?: ReactionRaw[];
  isFavorited?: boolean;
};

type ConversationListItem = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  otherUser: UserMini;
  lastMessage?: Message | null;
  unreadCount?: number;
};

type SearchHit = Message;

type MediaItem = Message;

type UserProfile = {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  extension?: string | null;
  avatarUrl?: string | null;
  company?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
};

type Me = {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  extension?: string | null;
  avatarUrl?: string | null;
  isActive?: boolean;
  mustChangePassword?: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
  company?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
};

type ConversationsResponse = {
  ok: true;
  items: ConversationListItem[];
};

type UsersResponse = {
  ok: true;
  items: UserMini[];
};

type DirectConversationResponse = {
  ok: true;
  conversation: {
    id: string;
    createdAt?: string;
    updatedAt?: string;
    userA: UserMini;
    userB: UserMini;
  };
};

type MessagesResponse = {
  ok: true;
  items: Message[];
  nextCursor?: string | null;
};

type SearchResponse = {
  ok: true;
  items: Message[];
  total?: number;
};

type MediaResponse = {
  ok: true;
  items: MediaItem[];
};

type ProfileResponse = {
  ok: true;
  user: UserProfile;
};

type FavoriteResponse = {
  ok: true;
  message: Message;
};

type ReactionResponse = {
  ok: true;
  message: Message;
};

const EMOJIS = [
  "😀",
  "😁",
  "😂",
  "🤣",
  "😊",
  "😍",
  "😘",
  "😎",
  "🤔",
  "😢",
  "😭",
  "😡",
  "👍",
  "👎",
  "👏",
  "🙌",
  "🙏",
  "🔥",
  "❤️",
  "💙",
  "💚",
  "💛",
  "🎉",
  "🚀",
];

function normalizeText(v: string) {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fmtDateTime(v?: string | null) {
  if (!v) return "";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return v;
  }
}

function fmtTime(v?: string | null) {
  if (!v) return "";
  try {
    return new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function fmtDayLabel(v?: string | null) {
  if (!v) return "";
  try {
    const dt = new Date(v);
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    const sameDay =
      dt.getFullYear() === now.getFullYear() &&
      dt.getMonth() === now.getMonth() &&
      dt.getDate() === now.getDate();

    const sameYesterday =
      dt.getFullYear() === yesterday.getFullYear() &&
      dt.getMonth() === yesterday.getMonth() &&
      dt.getDate() === yesterday.getDate();

    if (sameDay) return "Hoje";
    if (sameYesterday) return "Ontem";
    return dt.toLocaleDateString();
  } catch {
    return "";
  }
}

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function toAbsoluteUrl(url?: string | null) {
  if (!url) return null;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
}

function escapeRegExp(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aggregateReactions(raw?: ReactionRaw[], myId?: string | null): ReactionItem[] {
  if (!raw?.length) return [];
  const map = new Map<string, ReactionItem>();

  for (const item of raw) {
    const current = map.get(item.emoji);
    if (current) {
      current.count += 1;
      if (item.userId === myId) current.reactedByMe = true;
    } else {
      map.set(item.emoji, {
        emoji: item.emoji,
        count: 1,
        reactedByMe: item.userId === myId,
      });
    }
  }

  return Array.from(map.values());
}

function replyPreviewText(msg?: ReplyToMessage | null) {
  if (!msg) return "Mensagem";
  if (msg.body?.trim()) return msg.body.trim();
  if (msg.contentType === "IMAGE") return "Imagem";
  if (msg.contentType === "FILE") return msg.attachmentName || "Arquivo";
  return "Mensagem";
}

function messageSearchableText(msg: Partial<Message>) {
  return [msg.body ?? "", msg.attachmentName ?? ""].join(" ").trim();
}

function HighlightText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const q = query.trim();
  if (!q) return <>{text}</>;

  const safe = escapeRegExp(q);
  const re = new RegExp(`(${safe})`, "gi");
  const parts = text.split(re);

  return (
    <>
      {parts.map((part, idx) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={`${part}-${idx}`} className="chat-hl">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${idx}`}>{part}</span>
        )
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function SmileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M8 14c1 1.4 2.3 2 4 2s3-.6 4-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M8 12.5l6.9-6.9a3.2 3.2 0 1 1 4.5 4.5l-9.2 9.2a5 5 0 1 1-7.1-7.1l9.6-9.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18" cy="12" r="1.7" />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
      <path d="M10 8H5V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 8l6-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 20c2-5 6-8 13-8h0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill={filled ? "currentColor" : "none"}>
      <path
        d="m12 3 2.7 5.47 6.03.88-4.36 4.24 1.03 5.99L12 16.76 6.6 19.58l1.03-5.99L3.27 9.35l6.03-.88L12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M8 10v7M12 10v7M16 10v7M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="4" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function ChatPage() {
  const { logout, api, token } = useAuth();
  const { theme, toggleTheme, resolvedLogoUrl } = useTheme();

  const [me, setMe] = useState<Me | null>(null);

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);

  const [activeConv, setActiveConv] = useState<ConversationListItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesNextCursor, setMessagesNextCursor] = useState<string | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);

  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserMini[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userCompanyFilter, setUserCompanyFilter] = useState("");
  const [userDepartmentFilter, setUserDepartmentFilter] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("normal");
  const [searchQ, setSearchQ] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [highlightTerm, setHighlightTerm] = useState("");

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentMode, setAttachmentMode] = useState<"image" | "file" | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);

  const [actionMenuMsgId, setActionMenuMsgId] = useState<string | null>(null);

  const [multiDeleteMode, setMultiDeleteMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [newMsgsCount, setNewMsgsCount] = useState(0);
  const [showJumpNew, setShowJumpNew] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [profileMediaTab, setProfileMediaTab] = useState<"image" | "file">("image");
  const [profileMediaItems, setProfileMediaItems] = useState<MediaItem[]>([]);
  const [profileMediaLoading, setProfileMediaLoading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const msgListRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const activeConvIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeConvIdRef.current = activeConv?.id ?? null;
  }, [activeConv?.id]);

  useEffect(() => {
    return () => {
      if (attachmentPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(attachmentPreviewUrl);
      }
    };
  }, [attachmentPreviewUrl]);

  useEffect(() => {
    function closeMenus() {
      setActionMenuMsgId(null);
      setEmojiOpen(false);
    }
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, []);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = msgListRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  function clearComposerAttachment() {
    if (attachmentPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(attachmentPreviewUrl);
    }
    setAttachmentFile(null);
    setAttachmentMode(null);
    setAttachmentPreviewUrl(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openActionMenu(e: ReactMouseEvent, messageId: string) {
    e.stopPropagation();
    setActionMenuMsgId((prev) => (prev === messageId ? null : messageId));
  }

  function copyText(v: string) {
    void navigator.clipboard.writeText(v);
  }

  function mergeMessageIntoList(message: Message) {
    setMessages((prev) => {
      const next = prev.some((m) => m.id === message.id)
        ? prev.map((m) => (m.id === message.id ? message : m))
        : [...prev, message];

      return next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
  }


  async function loadMe() {
    const res = await api.get<Me>("/auth/me");
    setMe(res.data);
  }

  async function loadConversations(selectConversationId?: string) {
    setLoadingConvs(true);
    try {
      const res = await api.get<ConversationsResponse>("/conversations");
      const items = res.data.items ?? [];
      setConversations(items);

      if (selectConversationId) {
        const found = items.find((item) => item.id === selectConversationId);
        if (found) setActiveConv(found);
      }
    } finally {
      setLoadingConvs(false);
    }
  }

  async function loadMessages(conversationId: string, cursor?: string | null, appendTop = false) {
    if (!conversationId) return;

    setLoadingMsgs(true);
    try {
      const res = await api.get<MessagesResponse>(`/conversations/${conversationId}/messages`, {
        params: {
          ...(cursor ? { cursor } : {}),
          take: 60,
        },
      });

      const items = res.data.items ?? [];

      setMessages((prev) => {
        if (!appendTop) return items;

        const merged = [...items, ...prev];
        const map = new Map<string, Message>();

        for (const msg of merged) map.set(msg.id, msg);

        return Array.from(map.values()).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });

      setMessagesNextCursor(res.data.nextCursor ?? null);

      if (!appendTop) scrollToBottom();
    } finally {
      setLoadingMsgs(false);
    }
  }

  async function openConversation(conv: ConversationListItem) {
    setActiveConv(conv);
    setSearchOpen(false);
    setSearchQ("");
    setSearchHits([]);
    setSearchErr(null);
    setHighlightTerm("");
    setReplyTo(null);
    setActionMenuMsgId(null);
    clearComposerAttachment();

    socketRef.current?.emit("conversation:join", { conversationId: conv.id });

    await loadMessages(conv.id);
    await markConversationRead(conv.id);
    setNewMsgsCount(0);
    setShowJumpNew(false);
  }

  async function loadUsers() {
    setLoadingUsers(true);
    setPickerError(null);
    try {
      const res = await api.get<UsersResponse>("/users");
      const list = res.data.items ?? [];
      const filtered = me?.id ? list.filter((u) => u.id !== me.id) : list;
      setUsers(filtered);
    } catch (e: any) {
      setPickerError(e?.response?.data?.message ?? e?.message ?? "Falha ao carregar colaboradores");
    } finally {
      setLoadingUsers(false);
    }
  }

  async function startDirect(otherUserId: string) {
    const res = await api.post<DirectConversationResponse>("/conversations/direct", { otherUserId });
    const created = res.data.conversation;

    setPickerOpen(false);
    await loadConversations(created.id);

    const currentMeId = me?.id;
    const otherUser =
      currentMeId && created.userA.id === currentMeId ? created.userB : created.userA;

    await openConversation({
      id: created.id,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      otherUser,
      lastMessage: null,
    });
  }

  async function runSearch(query: string) {
    if (!activeConv?.id) return;
    const q = query.trim();

    if (!q) {
      setSearchHits([]);
      setSearchErr(null);
      setHighlightTerm("");
      return;
    }

    setSearchLoading(true);
    setSearchErr(null);

    try {
      const res = await api.get<SearchResponse>(`/conversations/${activeConv.id}/search`, {
        params: {
          q,
          take: 120,
        },
      });

      let items = res.data.items ?? [];

      if (searchMode === "exact") {
        const nq = normalizeText(q);
        items = items.filter((item) => normalizeText(messageSearchableText(item)) === nq);
      }

      setSearchHits(items);
      setHighlightTerm(q);
    } catch (e: any) {
      setSearchErr(e?.response?.data?.message ?? "Falha ao buscar na conversa");
      setSearchHits([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function jumpToHit(hit: SearchHit) {
    if (!activeConv?.id) return;

    try {
      const res = await api.get<MessagesResponse & { anchorId?: string }>(
        `/conversations/${activeConv.id}/messages/around`,
        {
          params: {
            messageId: hit.id,
            take: 80,
          },
        }
      );

      const items = res.data.items ?? [];
      setMessages(items);
      setMessagesNextCursor(null);
      setHighlightTerm(searchQ.trim());

      requestAnimationFrame(() => {
        const container = msgListRef.current;
        if (!container) return;

        const row = container.querySelector(`[data-mid="${hit.id}"]`) as HTMLElement | null;
        if (row) {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
          row.classList.add("chat-msg-flash");
          window.setTimeout(() => row.classList.remove("chat-msg-flash"), 1200);
        }
      });
    } catch (e: any) {
      setSearchErr(e?.response?.data?.message ?? "Falha ao abrir ocorrência");
    }
  }

  async function loadProfileDrawer() {
    const other = activeConv?.otherUser;
    if (!other?.id || !activeConv?.id) return;

    setProfileOpen(true);
    setProfileLoading(true);

    try {
      const res = await api.get<ProfileResponse>(`/users/${other.id}/profile`);
      setProfileData(res.data.user);
    } catch {
      setProfileData({
        id: other.id,
        username: other.username,
        name: other.name,
        email: other.email ?? null,
        extension: other.extension ?? null,
        avatarUrl: other.avatarUrl ?? null,
        company: other.company ?? null,
        department: other.department ?? null,
      });
    } finally {
      setProfileLoading(false);
    }
  }

  async function loadProfileMedia(kind: "image" | "file") {
    if (!activeConv?.id) return;

    setProfileMediaLoading(true);
    try {
      const res = await api.get<MediaResponse>(`/conversations/${activeConv.id}/media`, {
        params: { kind },
      });
      setProfileMediaItems(res.data.items ?? []);
    } catch {
      setProfileMediaItems([]);
    } finally {
      setProfileMediaLoading(false);
    }
  }

  useEffect(() => {
    if (!profileOpen || !activeConv?.id) return;
    void loadProfileMedia(profileMediaTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileOpen, profileMediaTab, activeConv?.id]);

  useEffect(() => {
    if (!searchOpen) return;

    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = window.setTimeout(() => {
      void runSearch(searchQ);
    }, 260);

    return () => {
      if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ, searchMode, searchOpen, activeConv?.id]);

  function handleImagePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    clearComposerAttachment();
    const previewUrl = URL.createObjectURL(file);
    setAttachmentFile(file);
    setAttachmentMode("image");
    setAttachmentPreviewUrl(previewUrl);
  }

  function handleFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    clearComposerAttachment();
    setAttachmentFile(file);
    setAttachmentMode("file");
    setAttachmentPreviewUrl(null);
  }

  async function sendMessage() {
    if (!activeConv) return;

    const trimmed = text.trim();
    const hasText = !!trimmed;
    const hasAttachment = !!attachmentFile;

    if (!hasText && !hasAttachment) return;
    if (sending) return;

    setSending(true);
    try {
      if (hasAttachment) {
        const form = new FormData();
        if (trimmed) form.append("body", trimmed);
        form.append("file", attachmentFile as File);
        form.append("uploadMode", attachmentMode === "file" ? "file" : "image");
        if (replyTo?.id) form.append("replyToId", replyTo.id);

        const res = await api.post<{ ok: true; message: Message }>(
          `/conversations/${activeConv.id}/messages`,
          form,
          {
            headers: { "Content-Type": "multipart/form-data" },
          }
        );

        mergeMessageIntoList(res.data.message);
        scrollToBottom();
      } else {
        socketRef.current?.emit("message:send", {
          conversationId: activeConv.id,
          body: trimmed,
          replyToId: replyTo?.id ?? null,
        });
      }

      setText("");
      setReplyTo(null);
      clearComposerAttachment();
      setEmojiOpen(false);
      await loadConversations(activeConv.id);
    } finally {
      setSending(false);
    }
  }

  async function toggleFavorite(message: Message) {
    try {
      const res = await api.patch<FavoriteResponse>(`/messages/${message.id}/favorite`, {
        value: !message.isFavorited,
      });

      mergeMessageIntoList(res.data.message);
    } catch {}
  }

  async function reactToMessage(message: Message, emoji: string) {
    try {
      const reactedByMe = aggregateReactions(message.reactions, me?.id).some(
        (item) => item.emoji === emoji && item.reactedByMe
      );

      const res = await api.post<ReactionResponse>(`/messages/${message.id}/reaction`, {
        emoji: reactedByMe ? null : emoji,
      });

      mergeMessageIntoList(res.data.message);
    } catch {}
  }

  async function deleteSelectedMessages() {
    if (!selectedMessageIds.length) return;
    try {
      await api.post('/messages/hide-many', { messageIds: selectedMessageIds });
      setMessages((prev) => prev.filter((m) => !selectedMessageIds.includes(m.id)));
      setSelectedMessageIds([]);
      setMultiDeleteMode(false);
    } catch {}
  }

  async function clearConversation() {
    if (!activeConv?.id) return;
    try {
      await api.post(`/conversations/${activeConv.id}/clear`);
      setMessages([]);
      await loadConversations(activeConv.id);
    } catch {}
  }

  async function removeConversationFromList() {
    if (!activeConv?.id) return;
    try {
      await api.delete(`/conversations/${activeConv.id}`);
      setConversations((prev) => prev.filter((c) => c.id !== activeConv.id));
      setActiveConv(null);
      setMessages([]);
    } catch {}
  }

  async function markConversationRead(conversationId: string) {
    try {
      await api.patch(`/conversations/${conversationId}/read`);
    } catch {}
  }
  async function uploadMyAvatar(file: File) {
    const form = new FormData();
    form.append("file", file);
    setAvatarUploading(true);
    try {
      await api.post('/me/avatar', form, { headers: { "Content-Type": "multipart/form-data" } });
      await loadMe();
      await loadConversations(activeConvIdRef.current ?? undefined);
    } finally {
      setAvatarUploading(false);
    }
  }


  function groupedMessages(items: Message[]) {
    const out: Array<{ kind: "sep"; label: string } | { kind: "msg"; value: Message }> = [];
    let last = "";

    for (const msg of items) {
      const label = fmtDayLabel(msg.createdAt);
      if (label !== last) {
        out.push({ kind: "sep", label });
        last = label;
      }
      out.push({ kind: "msg", value: msg });
    }

    return out;
  }

  const grouped = useMemo(() => groupedMessages(messages), [messages]);

  const usersFiltered = useMemo(() => {
    const nq = normalizeText(userSearch);

    return users.filter((u) => {
      const companyOk = !userCompanyFilter || u.company?.name === userCompanyFilter;
      const departmentOk = !userDepartmentFilter || u.department?.name === userDepartmentFilter;

      if (!companyOk || !departmentOk) return false;
      if (!nq) return true;

      const values = [
        u.name,
        u.username,
        u.email ?? "",
        u.extension ?? "",
        u.company?.name ?? "",
        u.department?.name ?? "",
      ].map(normalizeText);

      return values.some((value) => value.includes(nq));
    });
  }, [users, userSearch, userCompanyFilter, userDepartmentFilter]);

  const groupedUsers = useMemo(() => {
    const companyMap = new Map<string, Map<string, UserMini[]>>();

    for (const user of usersFiltered) {
      const company = user.company?.name ?? "Sem empresa";
      const department = user.department?.name ?? "Sem setor";
      const byDept = companyMap.get(company) ?? new Map<string, UserMini[]>();
      const list = byDept.get(department) ?? [];
      list.push(user);
      byDept.set(department, list);
      companyMap.set(company, byDept);
    }

    return Array.from(companyMap.entries())
      .map(([company, depts]) => ({
        company,
        departments: Array.from(depts.entries())
          .map(([department, deptUsers]) => ({
            department,
            users: deptUsers.sort((a, b) => a.name.localeCompare(b.name)),
          }))
          .sort((a, b) => a.department.localeCompare(b.department)),
      }))
      .sort((a, b) => a.company.localeCompare(b.company));
  }, [usersFiltered]);

  const companyOptions = useMemo(() => {
    return Array.from(new Set(users.map((u) => u.company?.name).filter(Boolean) as string[])).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [users]);

  const departmentOptions = useMemo(() => {
    return Array.from(new Set(users.map((u) => u.department?.name).filter(Boolean) as string[])).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [users]);

  const favoriteMessages = useMemo(() => {
    return messages.filter((m) => m.isFavorited);
  }, [messages]);

  useEffect(() => {
    if (!token) return;

    const s = createSocket(token);
    socketRef.current = s;

    s.on("message:new", (msg: Message) => {
      const currentConvId = activeConvIdRef.current;
      const isActive = !!currentConvId && msg.conversationId === currentConvId;

      if (isActive) {
        mergeMessageIntoList(msg);

        requestAnimationFrame(() => {
          const el = msgListRef.current;
          if (!el) return;
          const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
          if (distanceFromBottom < 140) {
            el.scrollTop = el.scrollHeight;
            setShowJumpNew(false);
            setNewMsgsCount(0);
          } else {
            setShowJumpNew(true);
            setNewMsgsCount((prev) => prev + 1);
          }
        });
        void markConversationRead(msg.conversationId);
      }

      void loadConversations(currentConvId ?? undefined);
    });

    s.on("message:updated", (msg: Message) => {
      const currentConvId = activeConvIdRef.current;
      if (!currentConvId || msg.conversationId !== currentConvId) return;
      mergeMessageIntoList(msg);
    });

    s.on("message:hidden", (payload: { messageId: string; conversationId: string }) => {
      if (payload.conversationId === activeConvIdRef.current) {
        setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
      }
    });

    s.on("messages:hidden", (payload: { messageIds: string[]; conversationId: string }) => {
      if (payload.conversationId === activeConvIdRef.current) {
        setMessages((prev) => prev.filter((m) => !payload.messageIds.includes(m.id)));
      }
    });

    s.on("conversation:cleared", (payload: { conversationId: string }) => {
      if (payload.conversationId === activeConvIdRef.current) setMessages([]);
    });

    s.on("conversations:sync", () => {
      void loadConversations(activeConvIdRef.current ?? undefined);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    void (async () => {
      await loadMe();
      await loadConversations();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen]);

  return (
    <div className="chat-shell">
      <TopNav
        title="BHASH • Chat"
        subtitle={me ? `${me.username}` : ""}
        theme={theme}
        onToggleTheme={toggleTheme}
        logoSrc={resolvedLogoUrl}
        rightSlot={
          <button className="chat-dangerBtn" onClick={logout}>
            Sair
          </button>
        }
      />

      <div className="chat-layout">
        <aside className="chat-sidebar">
          <div className="chat-sidebar__header">
            <div className="chat-sidebar__title">Conversas</div>
            <div style={{ display: "flex", gap: 8 }}>
              <label className="chat-iconBtn" title="Enviar foto de perfil">
                {avatarUploading ? "..." : "📷"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadMyAvatar(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <button className="chat-primaryIconBtn" onClick={() => setPickerOpen(true)} title="Nova conversa">
                <PlusIcon />
                <span>Nova</span>
              </button>
            </div>
          </div>

          <div className="chat-sidebar__list">
            {loadingConvs ? (
              <div className="chat-empty">Carregando conversas…</div>
            ) : conversations.length === 0 ? (
              <div className="chat-empty">Nenhuma conversa ainda.</div>
            ) : (
              conversations.map((conv) => {
                const other = conv.otherUser;
                const active = activeConv?.id === conv.id;
                const avatar = toAbsoluteUrl(other.avatarUrl);

                return (
                  <button
                    key={conv.id}
                    className={`chat-convCard ${active ? "is-active" : ""}`}
                    onClick={() => void openConversation(conv)}
                  >
                    <div className="chat-avatar chat-avatar--md">
                      {avatar ? <img src={avatar} alt={other.name} /> : <span>{other.name.slice(0, 1).toUpperCase()}</span>}
                    </div>

                    <div className="chat-convCard__main">
                      <div className="chat-convCard__name">{other.name}</div>
                      <div className="chat-convCard__meta">
                        {conv.lastMessage?.body?.trim() ||
                          (conv.lastMessage?.contentType === "IMAGE"
                            ? "Imagem"
                            : conv.lastMessage?.contentType === "FILE"
                            ? conv.lastMessage?.attachmentName || "Arquivo"
                            : `${other.department?.name ?? "Sem setor"}${other.company?.name ? ` • ${other.company.name}` : ""}`)}
                      </div>
                    </div>
                    {conv.unreadCount ? <span className="chat-unreadBadge">{conv.unreadCount}</span> : null}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="chat-main">
          <div className="chat-mainHeader">
            {activeConv ? (
              <button className="chat-contactBtn" onClick={() => void loadProfileDrawer()}>
                <div className="chat-avatar chat-avatar--lg">
                  {(() => {
                    const other = activeConv.otherUser;
                    const avatar = toAbsoluteUrl(other.avatarUrl);
                    return avatar ? <img src={avatar} alt={other.name} /> : <span>{other.name.slice(0, 1).toUpperCase()}</span>;
                  })()}
                </div>

                <div className="chat-mainHeader__text">
                  <div className="chat-mainHeader__name">{activeConv.otherUser.name}</div>
                  <div className="chat-mainHeader__sub">
                    {activeConv.otherUser.department?.name ?? "Sem setor"}
                    {activeConv.otherUser.company?.name ? ` • ${activeConv.otherUser.company.name}` : ""}
                  </div>
                </div>
              </button>
            ) : (
              <div className="chat-mainHeader__placeholder">Selecione uma conversa</div>
            )}

            {activeConv ? (
              <div className="chat-mainHeader__actions">
                <button
                  className={`chat-iconBtn ${searchOpen ? "is-active" : ""}`}
                  onClick={() => {
                    setSearchOpen((prev) => !prev);
                    setSearchErr(null);
                    if (searchOpen) {
                      setSearchQ("");
                      setSearchHits([]);
                      setHighlightTerm("");
                    }
                  }}
                  title="Buscar na conversa"
                >
                  <SearchIcon />
                </button>
              </div>
            ) : null}
          </div>

          <div className={searchOpen ? "chat-content chat-content--withSearch" : "chat-content"}>
            <div
              ref={msgListRef}
              className="chat-messageList"
              onScroll={() => {
                const el = msgListRef.current;
                if (!el) return;
                const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
                if (distanceFromBottom < 120) {
                  setShowJumpNew(false);
                  setNewMsgsCount(0);
                }
                if (!activeConv?.id || !messagesNextCursor || loadingMsgs) return;
                if (el.scrollTop < 120) {
                  void loadMessages(activeConv.id, messagesNextCursor, true);
                }
              }}
            >
              {!activeConv ? (
                <div className="chat-empty">Abra uma conversa para ver as mensagens.</div>
              ) : loadingMsgs && messages.length === 0 ? (
                <div className="chat-empty">Carregando mensagens…</div>
              ) : (
                <>
                  {messagesNextCursor ? <div className="chat-topHint">Role para cima para carregar mais</div> : null}

                  <div className="chat-messageStack">
                    {grouped.map((row, idx) => {
                      if (row.kind === "sep") {
                        return (
                          <div key={`sep-${row.label}-${idx}`} className="chat-daySep">
                            {row.label}
                          </div>
                        );
                      }

                      const msg = row.value;
                      const isMine = me?.id === msg.senderId;
                      const imageUrl = toAbsoluteUrl(msg.attachmentUrl);
                      const replyPreview = replyPreviewText(msg.replyTo);
                      const reactions = aggregateReactions(msg.reactions, me?.id ?? null);

                      return (
                        <div
                          key={msg.id}
                          data-mid={msg.id}
                          className={`chat-msgRow ${isMine ? "is-mine" : "is-other"}`}
                        >
                          {multiDeleteMode ? (
                            <input
                              type="checkbox"
                              checked={selectedMessageIds.includes(msg.id)}
                              onChange={() =>
                                setSelectedMessageIds((prev) =>
                                  prev.includes(msg.id) ? prev.filter((id) => id !== msg.id) : [...prev, msg.id]
                                )
                              }
                            />
                          ) : null}
                          <div className={`chat-bubble ${isMine ? "is-mine" : "is-other"}`}>
                            {!msg.deletedAt ? (
                              <button
                                className="chat-msgMenuBtn"
                                onClick={(e) => openActionMenu(e, msg.id)}
                                title="Ações"
                              >
                                <DotsIcon />
                              </button>
                            ) : null}

                            {actionMenuMsgId === msg.id && !msg.deletedAt ? (
                              <div className="chat-msgMenu" onClick={(e) => e.stopPropagation()}>
                                <button
                                  className="chat-msgMenu__item"
                                  onClick={() => {
                                    setReplyTo(msg);
                                    setActionMenuMsgId(null);
                                  }}
                                >
                                  <ReplyIcon />
                                  <span>Responder</span>
                                </button>

                                <button
                                  className="chat-msgMenu__item"
                                  onClick={() => {
                                    const content =
                                      msg.body?.trim() ||
                                      msg.attachmentUrl ||
                                      msg.attachmentName ||
                                      "";
                                    if (content) copyText(content);
                                    setActionMenuMsgId(null);
                                  }}
                                >
                                  <CopyIcon />
                                  <span>Copiar</span>
                                </button>

                                <button
                                  className="chat-msgMenu__item"
                                  onClick={() => {
                                    void toggleFavorite(msg);
                                    setActionMenuMsgId(null);
                                  }}
                                >
                                  <StarIcon filled={!!msg.isFavorited} />
                                  <span>{msg.isFavorited ? "Desfavoritar" : "Favoritar"}</span>
                                </button>

                                <div className="chat-msgMenu__reactions">
                                  {EMOJIS.slice(0, 8).map((emoji) => (
                                    <button
                                      key={`${msg.id}-${emoji}`}
                                      className="chat-reactionQuickBtn"
                                      onClick={() => {
                                        void reactToMessage(msg, emoji);
                                        setActionMenuMsgId(null);
                                      }}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>

                                <button
                                  className="chat-msgMenu__item chat-msgMenu__item--danger"
                                  onClick={() => {
                                    setMultiDeleteMode(true);
                                    setSelectedMessageIds([msg.id]);
                                    setActionMenuMsgId(null);
                                  }}
                                >
                                  <TrashIcon />
                                  <span>Apagar mensagens</span>
                                </button>
                              </div>
                            ) : null}

                            {!isMine ? <div className="chat-bubble__sender">{msg.sender.name}</div> : null}

                            {msg.replyTo ? (
                              <div className="chat-replyBlock">
                                <div className="chat-replyBlock__name">{msg.replyTo.sender?.name ?? "Mensagem"}</div>
                                <div className="chat-replyBlock__body">{replyPreview}</div>
                              </div>
                            ) : null}

                            {msg.contentType === "IMAGE" && imageUrl ? (
                              <a
                                href={imageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="chat-imageLink"
                              >
                                <img src={imageUrl} alt={msg.attachmentName ?? "imagem"} className="chat-imagePreview" />
                              </a>
                            ) : null}

                            {msg.contentType === "FILE" && imageUrl ? (
                              <a
                                href={imageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="chat-fileCard"
                              >
                                <div className="chat-fileCard__icon">
                                  <FileIcon />
                                </div>
                                <div className="chat-fileCard__text">
                                  <div className="chat-fileCard__name">{msg.attachmentName ?? "Arquivo"}</div>
                                  <div className="chat-fileCard__meta">
                                    {msg.attachmentMime ?? "Arquivo"}
                                    {msg.attachmentSize ? ` • ${formatBytes(msg.attachmentSize)}` : ""}
                                  </div>
                                </div>
                              </a>
                            ) : null}

                            {msg.body?.trim() ? (
                              <div className="chat-bubble__body">
                                {highlightTerm.trim() ? (
                                  <HighlightText text={msg.body} query={highlightTerm} />
                                ) : (
                                  msg.body
                                )}
                              </div>
                            ) : null}

                            {reactions.length ? (
                              <div className="chat-reactions">
                                {reactions.map((reaction) => (
                                  <button
                                    key={`${msg.id}-${reaction.emoji}`}
                                    className={`chat-reactionChip ${reaction.reactedByMe ? "is-active" : ""}`}
                                    onClick={() => void reactToMessage(msg, reaction.emoji)}
                                  >
                                    <span>{reaction.emoji}</span>
                                    <span>{reaction.count}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}

                            <div className="chat-bubble__meta">
                              {msg.isFavorited ? <span title="Favorita">★</span> : null}
                              <span>{fmtTime(msg.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {searchOpen ? (
              <aside className="chat-searchPanel">
                <div className="chat-searchPanel__header">
                  <div className="chat-searchPanel__title">Pesquisar mensagens</div>

                  <button
                    className="chat-iconBtn"
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQ("");
                      setSearchHits([]);
                      setHighlightTerm("");
                    }}
                    title="Fechar"
                  >
                    <CloseIcon />
                  </button>
                </div>

                <div className="chat-searchPanel__controls">
                  <input
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="Buscar..."
                    className="chat-input"
                  />

                  <div className="chat-modeToggle">
                    <button
                      className={`chat-modeToggle__btn ${searchMode === "normal" ? "is-active" : ""}`}
                      onClick={() => setSearchMode("normal")}
                    >
                      Normal
                    </button>
                    <button
                      className={`chat-modeToggle__btn ${searchMode === "exact" ? "is-active" : ""}`}
                      onClick={() => setSearchMode("exact")}
                    >
                      Exata
                    </button>
                  </div>

                  {searchErr ? <div className="chat-error">{searchErr}</div> : null}

                  <div className="chat-searchPanel__count">
                    {!searchQ.trim()
                      ? "Digite para buscar em tempo real."
                      : searchLoading
                      ? "Buscando..."
                      : `${searchHits.length} resultado(s)`}
                  </div>
                </div>

                <div className="chat-searchPanel__list">
                  {!searchQ.trim() ? null : searchHits.length === 0 && !searchLoading ? (
                    <div className="chat-empty">Nenhuma ocorrência.</div>
                  ) : (
                    searchHits.map((hit) => (
                      <button
                        key={hit.id}
                        className="chat-searchHit"
                        onClick={() => void jumpToHit(hit)}
                      >
                        <div className="chat-searchHit__top">
                          <span>{fmtTime(hit.createdAt)}</span>
                          <span>{fmtDayLabel(hit.createdAt)}</span>
                        </div>
                        <div className="chat-searchHit__body">
                          <HighlightText
                            text={
                              hit.body?.trim() ||
                              (hit.contentType === "IMAGE"
                                ? "Imagem"
                                : hit.contentType === "FILE"
                                ? hit.attachmentName || "Arquivo"
                                : "")
                            }
                            query={searchQ.trim()}
                          />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </aside>
            ) : null}
          </div>

            {showJumpNew ? (
              <button
                className="chat-jumpNewBtn"
                onClick={() => {
                  scrollToBottom();
                  setShowJumpNew(false);
                  setNewMsgsCount(0);
                }}
              >
                ↓ {newMsgsCount} nova(s)
              </button>
            ) : null}

            {multiDeleteMode ? (
              <div className="chat-multiDeleteBar">
                <span>{selectedMessageIds.length} selecionada(s)</span>
                <button className="chat-iconBtn chat-iconBtn--sm" onClick={() => setMultiDeleteMode(false)}>
                  <CloseIcon />
                </button>
                <button className="chat-primaryBtn" onClick={() => void deleteSelectedMessages()}>
                  Confirmar exclusão
                </button>
              </div>
            ) : null}

          <div className="chat-composerWrap">
            {replyTo ? (
              <div className="chat-replyComposer">
                <div className="chat-replyComposer__text">
                  <strong>Respondendo:</strong> {replyPreviewText(replyTo)}
                </div>
                <button className="chat-iconBtn chat-iconBtn--sm" onClick={() => setReplyTo(null)}>
                  <CloseIcon />
                </button>
              </div>
            ) : null}

            {attachmentFile ? (
              <div className="chat-attachmentPreview">
                {attachmentMode === "image" && attachmentPreviewUrl ? (
                  <img src={attachmentPreviewUrl} alt="preview" className="chat-attachmentPreview__image" />
                ) : (
                  <div className="chat-attachmentPreview__file">
                    <FileIcon />
                    <div>
                      <div className="chat-attachmentPreview__fileName">{attachmentFile.name}</div>
                      <div className="chat-attachmentPreview__fileMeta">{formatBytes(attachmentFile.size)}</div>
                    </div>
                  </div>
                )}

                <button className="chat-iconBtn chat-iconBtn--sm" onClick={clearComposerAttachment}>
                  <CloseIcon />
                </button>
              </div>
            ) : null}

            <div className="chat-composer">
              <div className="chat-composer__actions">
                <button
                  className={`chat-iconBtn ${emojiOpen ? "is-active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEmojiOpen((prev) => !prev);
                  }}
                  title="Emojis"
                  disabled={!activeConv}
                >
                  <SmileIcon />
                </button>

                <button
                  className="chat-iconBtn"
                  onClick={() => imageInputRef.current?.click()}
                  title="Enviar imagem"
                  disabled={!activeConv}
                >
                  <ImageIcon />
                </button>

                <button
                  className="chat-iconBtn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Enviar arquivo"
                  disabled={!activeConv}
                >
                  <PaperclipIcon />
                </button>

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleImagePicked}
                />

                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={handleFilePicked}
                />
              </div>

              <div className="chat-composer__inputWrap">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={activeConv ? "Digite sua mensagem..." : "Selecione uma conversa..."}
                  className="chat-input chat-input--composer"
                  disabled={!activeConv || sending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />

                {emojiOpen ? (
                  <div className="chat-emojiPicker" onClick={(e) => e.stopPropagation()}>
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        className="chat-emojiBtn"
                        onClick={() => setText((prev) => prev + emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                className="chat-sendBtn"
                onClick={() => void sendMessage()}
                disabled={!activeConv || sending || (!text.trim() && !attachmentFile)}
              >
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </main>
      </div>

      {pickerOpen ? (
        <div className="chat-modalBackdrop" onClick={() => setPickerOpen(false)}>
          <div className="chat-modal chat-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal__header">
              <div className="chat-modal__title">Nova conversa</div>
              <button className="chat-iconBtn" onClick={() => setPickerOpen(false)}>
                <CloseIcon />
              </button>
            </div>

            <div className="chat-modal__controls">
              <input
                className="chat-input"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar nome, email, ramal, empresa ou setor"
              />

              <select
                className="chat-select"
                value={userCompanyFilter}
                onChange={(e) => setUserCompanyFilter(e.target.value)}
              >
                <option value="">Todas as empresas</option>
                {companyOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <select
                className="chat-select"
                value={userDepartmentFilter}
                onChange={(e) => setUserDepartmentFilter(e.target.value)}
              >
                <option value="">Todos os setores</option>
                {departmentOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="chat-modal__body">
              {loadingUsers ? (
                <div className="chat-empty">Carregando colaboradores…</div>
              ) : pickerError ? (
                <div className="chat-error">{pickerError}</div>
              ) : groupedUsers.length === 0 ? (
                <div className="chat-empty">Nenhum colaborador encontrado.</div>
              ) : (
                groupedUsers.map((group) => (
                  <div key={group.company} className="chat-userGroup">
                    <div className="chat-userGroup__header">
                      <div className="chat-userGroup__company">{group.company}</div>
                    </div>

                    {group.departments.map((dept) => (
                      <div key={`${group.company}-${dept.department}`}>
                        <div className="chat-userGroup__department">{dept.department}</div>
                        <div className="chat-userGroup__list">
                      {dept.users.map((user) => (
                        <div key={user.id} className="chat-userRow">
                          <div className="chat-userRow__main">
                            <div className="chat-userRow__name">{user.name}</div>
                            <div className="chat-userRow__meta">
                              <span>{user.email || "Sem e-mail"}</span>
                              <span>{user.extension ? `Ramal: ${user.extension}` : "Sem ramal"}</span>
                            </div>
                          </div>

                          <div className="chat-userRow__actions">
                            {user.email ? (
                              <button
                                className="chat-iconBtn chat-iconBtn--sm"
                                onClick={() => copyText(user.email ?? "")}
                                title="Copiar e-mail"
                              >
                                <CopyIcon />
                              </button>
                            ) : null}

                            <button className="chat-primaryBtn" onClick={() => void startDirect(user.id)}>
                              Abrir chat
                            </button>
                          </div>
                        </div>
                      ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {profileOpen ? (
        <div className="chat-modalBackdrop" onClick={() => setProfileOpen(false)}>
          <div className="chat-profileDrawer" onClick={(e) => e.stopPropagation()}>
            <div className="chat-profileDrawer__header">
              <div className="chat-profileDrawer__title">Dados do contato</div>
              <button className="chat-iconBtn" onClick={() => setProfileOpen(false)}>
                <CloseIcon />
              </button>
            </div>

            {profileLoading ? (
              <div className="chat-profileDrawer__body">
                <div className="chat-empty">Carregando dados do contato…</div>
              </div>
            ) : profileData ? (
              <div className="chat-profileDrawer__body">
                <div className="chat-contactCard">
                  <div className="chat-avatar chat-avatar--xl">
                    {toAbsoluteUrl(profileData.avatarUrl) ? (
                      <img src={toAbsoluteUrl(profileData.avatarUrl) ?? ""} alt={profileData.name} />
                    ) : (
                      <span>{profileData.name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="chat-contactCard__name">{profileData.name}</div>
                  <div className="chat-contactCard__sub">@{profileData.username}</div>

                  <div className="chat-contactCard__info">
                    <div>{profileData.email || "Sem e-mail"}</div>
                    <div>{profileData.extension ? `Ramal: ${profileData.extension}` : "Sem ramal"}</div>
                    <div>{profileData.company?.name ?? "Sem empresa"}</div>
                    <div>{profileData.department?.name ?? "Sem setor"}</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <button className="chat-primaryBtn" onClick={() => void clearConversation()}>
                    Limpar conversa
                  </button>
                  <button className="chat-dangerBtn" onClick={() => void removeConversationFromList()}>
                    Remover conversa da lista
                  </button>
                </div>

                <div className="chat-sectionTitle">Mensagens favoritadas nesta conversa</div>
                <div className="chat-favoritesList">
                  {!favoriteMessages.length ? (
                    <div className="chat-empty">Nenhuma favorita.</div>
                  ) : (
                    favoriteMessages.map((msg) => (
                      <div key={msg.id} className="chat-favoriteCard">
                        <div className="chat-favoriteCard__top">
                          <span>{msg.sender?.name ?? "Mensagem"}</span>
                          <span>{fmtDateTime(msg.createdAt)}</span>
                        </div>
                        <div className="chat-favoriteCard__body">
                          {msg.body?.trim() ||
                            (msg.contentType === "IMAGE"
                              ? "Imagem"
                              : msg.contentType === "FILE"
                              ? msg.attachmentName || "Arquivo"
                              : "Mensagem")}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="chat-sectionTitle">Mídia e documentos</div>

                <div className="chat-modeToggle chat-modeToggle--block">
                  <button
                    className={`chat-modeToggle__btn ${profileMediaTab === "image" ? "is-active" : ""}`}
                    onClick={() => setProfileMediaTab("image")}
                  >
                    Mídia
                  </button>
                  <button
                    className={`chat-modeToggle__btn ${profileMediaTab === "file" ? "is-active" : ""}`}
                    onClick={() => setProfileMediaTab("file")}
                  >
                    Documentos
                  </button>
                </div>

                <div className="chat-mediaGrid">
                  {profileMediaLoading ? (
                    <div className="chat-empty">Carregando…</div>
                  ) : profileMediaItems.length === 0 ? (
                    <div className="chat-empty">Nada encontrado.</div>
                  ) : profileMediaTab === "image" ? (
                    profileMediaItems.map((item) => (
                      <a
                        key={item.id}
                        href={toAbsoluteUrl(item.attachmentUrl) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="chat-mediaThumb"
                      >
                        <img src={toAbsoluteUrl(item.attachmentUrl) ?? ""} alt={item.attachmentName ?? "imagem"} />
                      </a>
                    ))
                  ) : (
                    profileMediaItems.map((item) => (
                      <a
                        key={item.id}
                        href={toAbsoluteUrl(item.attachmentUrl) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="chat-fileCard"
                      >
                        <div className="chat-fileCard__icon">
                          <FileIcon />
                        </div>
                        <div className="chat-fileCard__text">
                          <div className="chat-fileCard__name">{item.attachmentName ?? "Arquivo"}</div>
                          <div className="chat-fileCard__meta">{fmtDateTime(item.createdAt)}</div>
                        </div>
                      </a>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="chat-profileDrawer__body">
                <div className="chat-empty">Não foi possível carregar os dados.</div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
