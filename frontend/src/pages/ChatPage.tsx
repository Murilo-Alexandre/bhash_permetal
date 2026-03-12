import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  pinned?: boolean;
};

type SearchHit = Message;

type MediaItem = Message;

type GroupedMessageRow =
  | { kind: "sep"; label: string }
  | { kind: "unread" }
  | { kind: "msg"; value: Message };

type DesktopNotificationTarget = {
  conversationId: string;
  messageId?: string | null;
  at?: number;
};

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
  "😃",
  "😄",
  "😅",
  "😆",
  "😉",
  "😊",
  "🙂",
  "🙃",
  "😍",
  "🥰",
  "😘",
  "😗",
  "😙",
  "😚",
  "😋",
  "😛",
  "😝",
  "😜",
  "🤪",
  "🤨",
  "🧐",
  "🤓",
  "😎",
  "🥸",
  "🤩",
  "🥳",
  "😏",
  "😒",
  "🙄",
  "😬",
  "🤥",
  "🤭",
  "🤫",
  "🤔",
  "🫡",
  "😶",
  "🫥",
  "😐",
  "😑",
  "😴",
  "😪",
  "😵",
  "🤯",
  "😱",
  "😨",
  "😰",
  "😥",
  "😢",
  "😭",
  "😤",
  "😠",
  "😡",
  "🤬",
  "🥺",
  "😮",
  "😯",
  "😲",
  "🥱",
  "😇",
  "👍",
  "👎",
  "👏",
  "🙌",
  "🙏",
  "🤝",
  "👊",
  "✊",
  "🤞",
  "👌",
  "🤌",
  "🤏",
  "✌️",
  "🤟",
  "🤘",
  "👋",
  "🫶",
  "💪",
  "🧠",
  "🔥",
  "❤️",
  "🧡",
  "💜",
  "🖤",
  "🤍",
  "🤎",
  "💙",
  "💚",
  "💛",
  "💔",
  "❣️",
  "💕",
  "💞",
  "💓",
  "💗",
  "💖",
  "💘",
  "💝",
  "⭐",
  "🌟",
  "✨",
  "⚡",
  "💥",
  "💫",
  "🎉",
  "🎊",
  "🎯",
  "🏆",
  "🥇",
  "🚀",
  "🛠️",
  "💼",
  "📌",
  "📎",
  "💡",
  "☕",
  "🍕",
  "🍔",
  "🌮",
  "🍟",
  "🍿",
  "🍰",
  "🍩",
  "🍪",
  "🍎",
  "🍓",
  "🍉",
  "🍺",
  "🍷",
  "🥤",
  "⚽",
  "🏀",
  "🏐",
  "🎮",
  "🎵",
  "🎧",
  "📷",
  "📱",
  "💻",
  "✅",
  "❌",
  "⚠️",
  "❓",
  "❗",
  "✔️",
  "➕",
  "➖",
  "➡️",
  "⬅️",
  "⬆️",
  "⬇️",
  "😺",
  "😸",
  "😹",
  "😻",
  "😼",
  "🙈",
  "🙉",
  "🙊",
];

const QUICK_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const PT_BR_COLLATOR = new Intl.Collator("pt-BR", {
  sensitivity: "base",
  numeric: true,
});

function compareAlpha(a?: string | null, b?: string | null) {
  return PT_BR_COLLATOR.compare((a ?? "").trim(), (b ?? "").trim());
}

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

function conversationRankTimestamp(conv: ConversationListItem) {
  const raw = conv.lastMessage?.createdAt ?? conv.updatedAt ?? conv.createdAt;
  if (!raw) return 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function sortConversationItems(items: ConversationListItem[]) {
  return [...items].sort((a, b) => {
    const pinDiff = Number(!!b.pinned) - Number(!!a.pinned);
    if (pinDiff !== 0) return pinDiff;
    return conversationRankTimestamp(b) - conversationRankTimestamp(a);
  });
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

function messageNotificationPreview(msg: Message) {
  const body = msg.body?.trim();
  if (body) return body.length > 120 ? `${body.slice(0, 117)}...` : body;
  if (msg.contentType === "IMAGE") return "Imagem";
  if (msg.contentType === "FILE") return msg.attachmentName ? `Arquivo: ${msg.attachmentName}` : "Arquivo";
  return "Nova mensagem";
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

function ArrowDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M22 2 11 13"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 2 15 22l-4-9-9-4 20-7Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 15l6-6 6 6"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M15 5 8 12l7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M11 8v6M8 11h6M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11h6M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ResetZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M5 12a7 7 0 1 0 2.05-4.95" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 6v3.8h3.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M12 8.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19.4 13.5a7.9 7.9 0 0 0 .05-3l1.76-1.37-1.9-3.28-2.16.64a8 8 0 0 0-2.6-1.5L14.2 2h-4.4l-.39 2.99a8 8 0 0 0-2.6 1.5l-2.16-.64-1.9 3.28L4.5 10.5a7.9 7.9 0 0 0 0 3l-1.76 1.37 1.9 3.28 2.16-.64a8 8 0 0 0 2.6 1.5L9.8 22h4.4l.39-2.99a8 8 0 0 0 2.6-1.5l2.16.64 1.9-3.28-1.85-1.37Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PinIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path
        d="M15 4v4l3 3v1H6v-1l3-3V4h6Zm-3 8v8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChatPage() {
  const { logoff, api, token } = useAuth();
  const { theme, toggleTheme, resolvedLogoUrl } = useTheme();

  const [me, setMe] = useState<Me | null>(null);

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);

  const [activeConv, setActiveConv] = useState<ConversationListItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesNextCursor, setMessagesNextCursor] = useState<string | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [messagesErr, setMessagesErr] = useState<string | null>(null);
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
  const [conversationMenuId, setConversationMenuId] = useState<string | null>(null);
  const [reactionBarMsgId, setReactionBarMsgId] = useState<string | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);

  const [multiDeleteMode, setMultiDeleteMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [newMsgsCount, setNewMsgsCount] = useState(0);
  const [showJumpNew, setShowJumpNew] = useState(false);
  const [unreadAnchorMessageId, setUnreadAnchorMessageId] = useState<string | null>(null);
  const [showJumpUnread, setShowJumpUnread] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [profileMediaTab, setProfileMediaTab] = useState<"image" | "file">("image");
  const [profileMediaItems, setProfileMediaItems] = useState<MediaItem[]>([]);
  const [profileMediaLoading, setProfileMediaLoading] = useState(false);
  const [myInfoOpen, setMyInfoOpen] = useState(false);

  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageViewerItems, setImageViewerItems] = useState<MediaItem[]>([]);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  const [imageViewerZoom, setImageViewerZoom] = useState(1);
  const [imageViewerOffset, setImageViewerOffset] = useState({ x: 0, y: 0 });
  const [imageViewerDragging, setImageViewerDragging] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() => window.innerWidth <= 900);

  const socketRef = useRef<Socket | null>(null);
  const conversationsRef = useRef<ConversationListItem[]>([]);
  const convListRef = useRef<HTMLDivElement | null>(null);
  const convPositionsRef = useRef<Map<string, number>>(new Map());
  const msgListRef = useRef<HTMLDivElement | null>(null);
  const isMsgListNearBottomRef = useRef(true);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const myAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  const meIdRef = useRef<string | null>(null);
  const handledRealtimeMessageIdsRef = useRef<Set<string>>(new Set());
  const notifiedMessageIdsRef = useRef<Set<string>>(new Set());
  const imageViewerConvIdRef = useRef<string | null>(null);
  const imageViewerDragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    activeConvIdRef.current = activeConv?.id ?? null;
  }, [activeConv?.id]);

  useEffect(() => {
    meIdRef.current = me?.id ?? null;
  }, [me?.id]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    const onResize = () => setIsMobileLayout(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      setConversationMenuId(null);
      setReactionBarMsgId(null);
      setReactionPickerMsgId(null);
    }
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, []);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = msgListRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      isMsgListNearBottomRef.current = true;
    });
  }

  function scrollToUnreadAnchor() {
    requestAnimationFrame(() => {
      const el = msgListRef.current;
      if (!el || !unreadAnchorMessageId) return;
      const unreadAnchor = el.querySelector<HTMLElement>("[data-unread-anchor='true']");
      if (!unreadAnchor) return;
      unreadAnchor.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        const refreshedEl = msgListRef.current;
        if (!refreshedEl) return;
        const refreshedAnchor = refreshedEl.querySelector<HTMLElement>("[data-unread-anchor='true']");
        if (!refreshedAnchor) return;
        const listRect = refreshedEl.getBoundingClientRect();
        const anchorRect = refreshedAnchor.getBoundingClientRect();
        const isAbove = anchorRect.bottom < listRect.top + 2;
        setShowJumpUnread(isAbove);
      }, 280);
    });
  }

  function resolveUnreadAnchorMessageId(items: Message[], unreadCount?: number | null) {
    const count = Math.max(0, Number(unreadCount ?? 0));
    if (!count || items.length === 0) return null;
    const idx = Math.max(0, items.length - count);
    return items[idx]?.id ?? null;
  }

  function syncUnreadJumpButton() {
    const el = msgListRef.current;
    if (!el || !unreadAnchorMessageId) {
      setShowJumpUnread(false);
      return;
    }

    const unreadAnchor = el.querySelector<HTMLElement>("[data-unread-anchor='true']");
    if (!unreadAnchor) {
      setShowJumpUnread(false);
      return;
    }

    const listRect = el.getBoundingClientRect();
    const anchorRect = unreadAnchor.getBoundingClientRect();
    const isAbove = anchorRect.bottom < listRect.top + 2;
    setShowJumpUnread(isAbove);
  }

  function messageListDistanceFromBottom(el: HTMLDivElement) {
    return el.scrollHeight - (el.scrollTop + el.clientHeight);
  }

  function isMessageListNearBottom(el: HTMLDivElement | null, threshold = 140) {
    if (!el) return true;
    return messageListDistanceFromBottom(el) <= threshold;
  }

  function focusComposerInput() {
    requestAnimationFrame(() => {
      composerInputRef.current?.focus({ preventScroll: true });
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

  function rememberNotifiedMessage(messageId: string) {
    const store = notifiedMessageIdsRef.current;
    store.add(messageId);
    if (store.size > 300) {
      const oldest = store.values().next().value;
      if (oldest) store.delete(oldest);
    }
  }

  async function notifyIncomingMessage(msg: Message) {
    const myId = meIdRef.current;
    if (!myId || msg.senderId === myId) return;
    if (notifiedMessageIdsRef.current.has(msg.id)) return;

    const pageVisible = document.visibilityState === "visible" && !document.hidden;
    if (window.bhashDesktop?.isDesktop) {
      try {
        const state = await window.bhashDesktop.getWindowState();
        const desktopVisible = state.isVisible && !state.isMinimized;
        if (desktopVisible) return;
      } catch {
        if (pageVisible) return;
      }
    } else if (pageVisible) {
      return;
    }

    const conv = conversationsRef.current.find((item) => item.id === msg.conversationId);
    const title = msg.sender?.name || conv?.otherUser?.name || "Nova mensagem";
    const body = messageNotificationPreview(msg);
    rememberNotifiedMessage(msg.id);

    if (window.bhashDesktop?.isDesktop) {
      await window.bhashDesktop.notify({
        title,
        body,
        playSound: true,
        conversationId: msg.conversationId,
        messageId: msg.id,
      });
      return;
    }

    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        return;
      }
    }
    if (Notification.permission !== "granted") return;

    const notification = new Notification(title, { body });
    notification.onclick = () => {
      window.focus();
      void openConversationById(msg.conversationId, msg.id);
    };
  }

  function rememberHandledRealtimeMessage(messageId: string) {
    const store = handledRealtimeMessageIdsRef.current;
    store.add(messageId);
    if (store.size > 500) {
      const oldest = store.values().next().value;
      if (oldest) store.delete(oldest);
    }
  }

  function canHandleRealtimeMessage(messageId: string) {
    if (handledRealtimeMessageIdsRef.current.has(messageId)) return false;
    rememberHandledRealtimeMessage(messageId);
    return true;
  }

  function handleRealtimeIncomingMessage(msg: Message) {
    if (!canHandleRealtimeMessage(msg.id)) return;

    const currentConvId = activeConvIdRef.current;
    const isActive = !!currentConvId && msg.conversationId === currentConvId;
    const isMine = !!meIdRef.current && msg.senderId === meIdRef.current;
    const shouldAutoScrollInActive =
      isMine || isMsgListNearBottomRef.current || isMessageListNearBottom(msgListRef.current);
    const hadConversation = conversationsRef.current.some(
      (conv) => conv.id === msg.conversationId
    );

    setConversations((prev) => {
      if (!prev.length) return prev;
      const next = prev.map((conv) => {
        if (conv.id !== msg.conversationId) return conv;
        return {
          ...conv,
          lastMessage: msg,
          updatedAt: msg.createdAt,
          unreadCount: isActive ? 0 : isMine ? conv.unreadCount ?? 0 : (conv.unreadCount ?? 0) + 1,
        };
      });
      return sortConversationItems(next);
    });

    if (isActive) {
      mergeMessageIntoList(msg);

      requestAnimationFrame(() => {
        if (shouldAutoScrollInActive) {
          scrollToBottom();
          setShowJumpNew(false);
          setNewMsgsCount(0);
        } else {
          isMsgListNearBottomRef.current = false;
          if (!isMine) {
            setShowJumpNew(true);
            setNewMsgsCount((prev) => prev + 1);
          }
        }
      });
      if (!isMine) void markConversationRead(msg.conversationId);
    }

    if (!hadConversation) {
      void loadConversations(currentConvId ?? undefined);
    }
  }

  function joinConversationRoom(conversationId: string) {
    if (!conversationId) return;
    socketRef.current?.emit("conversation:join", { conversationId });
  }

  function resetImageViewerTransform() {
    setImageViewerZoom(1);
    setImageViewerOffset({ x: 0, y: 0 });
    setImageViewerDragging(false);
    imageViewerDragRef.current = null;
  }

  function clampZoom(value: number) {
    return Math.max(1, Math.min(5, value));
  }

  function normalizeMediaImageItems(items: MediaItem[]) {
    return [...items]
      .filter((item) => item.contentType === "IMAGE" && !!item.attachmentUrl)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async function loadConversationImagesForViewer(conversationId: string) {
    if (!conversationId) return [];
    const res = await api.get<MediaResponse>(`/conversations/${conversationId}/media`, {
      params: { kind: "image" },
    });
    return normalizeMediaImageItems(res.data.items ?? []);
  }

  function resolveViewerIndex(items: MediaItem[], targetMessageId: string) {
    const exact = items.findIndex((item) => item.id === targetMessageId);
    if (exact >= 0) return exact;
    return 0;
  }

  async function openImageViewer(message: Message) {
    const conversationId = activeConv?.id;
    const imageUrl = toAbsoluteUrl(message.attachmentUrl);
    if (!conversationId || !imageUrl) return;

    const fromCurrentMessages = normalizeMediaImageItems(messages);
    const fallbackItems = fromCurrentMessages.length ? fromCurrentMessages : [message];
    const fallbackIndex = resolveViewerIndex(fallbackItems, message.id);

    setImageViewerItems(fallbackItems);
    setImageViewerIndex(fallbackIndex);
    setImageViewerOpen(true);
    resetImageViewerTransform();

    const shouldReload = imageViewerConvIdRef.current !== conversationId;

    if (!shouldReload) return;

    try {
      const remoteItems = await loadConversationImagesForViewer(conversationId);
      if (!remoteItems.length) return;
      setImageViewerItems(remoteItems);
      setImageViewerIndex(resolveViewerIndex(remoteItems, message.id));
      imageViewerConvIdRef.current = conversationId;
    } catch {
      imageViewerConvIdRef.current = conversationId;
    }
  }

  function closeImageViewer() {
    setImageViewerOpen(false);
    resetImageViewerTransform();
  }

  function goToImage(offset: number) {
    setImageViewerIndex((prev) => {
      const next = prev + offset;
      if (next < 0 || next >= imageViewerItems.length) return prev;
      return next;
    });
  }

  function setViewerZoom(nextZoom: number) {
    setImageViewerZoom(clampZoom(nextZoom));
    if (nextZoom <= 1) {
      setImageViewerOffset({ x: 0, y: 0 });
    }
  }

  function openActionMenu(e: ReactMouseEvent, messageId: string) {
    e.stopPropagation();
    setConversationMenuId(null);
    setReactionBarMsgId(null);
    setReactionPickerMsgId(null);
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
      const items = sortConversationItems(res.data.items ?? []);
      setConversations(items);

      if (selectConversationId) {
        const found = items.find((item) => item.id === selectConversationId);
        if (found) setActiveConv(found);
      }

      return items;
    } finally {
      setLoadingConvs(false);
    }
  }

  async function loadMessages(conversationId: string, cursor?: string | null, appendTop = false) {
    if (!conversationId) return;

    setLoadingMsgs(true);
    setMessagesErr(null);
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
      return items;
    } catch (e: any) {
      if (!appendTop) setMessages([]);
      setMessagesErr(e?.response?.data?.message ?? "Falha ao carregar mensagens");
      return [];
    } finally {
      setLoadingMsgs(false);
    }
  }

  async function openConversation(conv: ConversationListItem, focusMessageId?: string | null) {
    const unreadCountBeforeOpen = Math.max(0, conv.unreadCount ?? 0);
    setActiveConv(conv);
    isMsgListNearBottomRef.current = true;
    setSearchOpen(false);
    setSearchQ("");
    setSearchHits([]);
    setSearchErr(null);
    setHighlightTerm("");
    setMessagesErr(null);
    setReplyTo(null);
    setActionMenuMsgId(null);
    setConversationMenuId(null);
    setUnreadAnchorMessageId(null);
    setShowJumpUnread(false);
    clearComposerAttachment();
    setConversations((prev) =>
      sortConversationItems(
        prev.map((item) =>
          item.id === conv.id ? { ...item, unreadCount: 0 } : item
        )
      )
    );

    joinConversationRoom(conv.id);

    const loadedMessages = (await loadMessages(conv.id)) ?? [];
    const unreadAnchorId = resolveUnreadAnchorMessageId(loadedMessages, unreadCountBeforeOpen);
    setUnreadAnchorMessageId(unreadAnchorId);
    await markConversationRead(conv.id);
    if (focusMessageId) {
      const msgExists = loadedMessages.some((msg) => msg.id === focusMessageId);
      if (msgExists) {
        requestAnimationFrame(() => {
          const container = msgListRef.current;
          if (!container) return;
          const row = container.querySelector(`[data-mid="${focusMessageId}"]`) as HTMLElement | null;
          if (!row) return;
          row.scrollIntoView({ behavior: "smooth", block: "center" });
          row.classList.add("chat-msg-flash");
          window.setTimeout(() => row.classList.remove("chat-msg-flash"), 1200);
        });
      } else {
        await jumpToMessageById(focusMessageId);
      }
    } else {
      scrollToBottom();
      window.setTimeout(scrollToBottom, 70);
    }
    setNewMsgsCount(0);
    setShowJumpNew(false);
  }

  async function openConversationById(conversationId: string, messageId?: string | null) {
    if (!conversationId) return;

    let conv = conversationsRef.current.find((item) => item.id === conversationId);
    if (!conv) {
      const items = await loadConversations(conversationId);
      conv = items?.find((item) => item.id === conversationId);
    }
    if (!conv) return;

    await openConversation(conv, messageId ?? null);
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

  async function jumpToMessageById(messageId: string, termToHighlight = "") {
    if (!activeConv?.id) return;

    try {
      const res = await api.get<MessagesResponse & { anchorId?: string }>(
        `/conversations/${activeConv.id}/messages/around`,
        {
          params: {
            messageId,
            take: 80,
          },
        }
      );

      const items = res.data.items ?? [];
      setMessages(items);
      setMessagesNextCursor(null);
      setHighlightTerm(termToHighlight);

      requestAnimationFrame(() => {
        const container = msgListRef.current;
        if (!container) return;

        const row = container.querySelector(`[data-mid="${messageId}"]`) as HTMLElement | null;
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

  async function jumpToHit(hit: SearchHit) {
    await jumpToMessageById(hit.id, searchQ.trim());
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
    const conversationId = activeConv.id;

    if (!hasText && !hasAttachment) return;

    if (hasAttachment) {
      if (sending) return;
      setSending(true);
      try {
        const form = new FormData();
        if (trimmed) form.append("body", trimmed);
        form.append("file", attachmentFile as File);
        form.append("uploadMode", attachmentMode === "file" ? "file" : "image");
        if (replyTo?.id) form.append("replyToId", replyTo.id);

        const res = await api.post<{ ok: true; message: Message }>(
          `/conversations/${conversationId}/messages`,
          form,
          {
            headers: { "Content-Type": "multipart/form-data" },
          }
        );

        mergeMessageIntoList(res.data.message);
        scrollToBottom();
        setShowJumpNew(false);
        setNewMsgsCount(0);
      } finally {
        setSending(false);
      }
    } else {
      socketRef.current?.emit("message:send", {
        conversationId,
        body: trimmed,
        replyToId: replyTo?.id ?? null,
      });
      scrollToBottom();
      setShowJumpNew(false);
      setNewMsgsCount(0);
    }

    setText("");
    setReplyTo(null);
    clearComposerAttachment();
    setEmojiOpen(false);
    focusComposerInput();
    void loadConversations(conversationId);
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

  async function clearConversation(conversationId?: string) {
    const targetId = conversationId ?? activeConv?.id;
    if (!targetId) return;

    try {
      await api.post(`/conversations/${targetId}/clear`);
      setConversationMenuId(null);
      setConversations((prev) =>
        sortConversationItems(
          prev.map((conv) =>
            conv.id === targetId
              ? { ...conv, lastMessage: null, unreadCount: 0 }
              : conv
          )
        )
      );

      if (activeConvIdRef.current === targetId) {
        setMessages([]);
        setNewMsgsCount(0);
        setShowJumpNew(false);
        setUnreadAnchorMessageId(null);
        setShowJumpUnread(false);
      }

      await loadConversations(activeConvIdRef.current ?? undefined);
    } catch {}
  }

  async function removeConversationFromList(conversationId?: string) {
    const targetId = conversationId ?? activeConv?.id;
    if (!targetId) return;

    try {
      await api.delete(`/conversations/${targetId}`);
      setConversations((prev) => prev.filter((c) => c.id !== targetId));
      setConversationMenuId(null);

      if (activeConvIdRef.current === targetId) {
        setActiveConv(null);
        setMessages([]);
        setNewMsgsCount(0);
        setShowJumpNew(false);
        setUnreadAnchorMessageId(null);
        setShowJumpUnread(false);
      }
    } catch {}
  }

  async function markConversationRead(conversationId: string) {
    try {
      await api.patch(`/conversations/${conversationId}/read`);
      setConversations((prev) =>
        sortConversationItems(
          prev.map((conv) =>
            conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
          )
        )
      );
    } catch {}
  }

  async function setConversationPinned(conversationId: string, value: boolean) {
    try {
      await api.patch(`/conversations/${conversationId}/pin`, { value });
      setConversations((prev) =>
        sortConversationItems(
          prev.map((conv) => (conv.id === conversationId ? { ...conv, pinned: value } : conv))
        )
      );
      if (activeConvIdRef.current === conversationId) {
        setActiveConv((prev) => (prev ? { ...prev, pinned: value } : prev));
      }
      setConversationMenuId(null);
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


  function groupedMessages(items: Message[], unreadMarkerMessageId?: string | null) {
    const out: GroupedMessageRow[] = [];
    let last = "";
    let unreadInserted = false;

    for (const msg of items) {
      if (!unreadInserted && unreadMarkerMessageId && msg.id === unreadMarkerMessageId) {
        out.push({ kind: "unread" });
        unreadInserted = true;
      }

      const label = fmtDayLabel(msg.createdAt);
      if (label !== last) {
        out.push({ kind: "sep", label });
        last = label;
      }
      out.push({ kind: "msg", value: msg });
    }

    return out;
  }

  const grouped = useMemo(
    () => groupedMessages(messages, unreadAnchorMessageId),
    [messages, unreadAnchorMessageId]
  );

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
            users: deptUsers.sort((a, b) => {
              const byName = compareAlpha(a.name || a.username, b.name || b.username);
              if (byName !== 0) return byName;
              return compareAlpha(a.email, b.email);
            }),
          }))
          .sort((a, b) => compareAlpha(a.department, b.department)),
      }))
      .sort((a, b) => compareAlpha(a.company, b.company));
  }, [usersFiltered]);

  const companyOptions = useMemo(() => {
    return Array.from(new Set(users.map((u) => u.company?.name).filter(Boolean) as string[])).sort(compareAlpha);
  }, [users]);

  const departmentOptions = useMemo(() => {
    return Array.from(new Set(users.map((u) => u.department?.name).filter(Boolean) as string[])).sort(compareAlpha);
  }, [users]);

  const favoriteMessages = useMemo(() => {
    return messages.filter((m) => m.isFavorited);
  }, [messages]);

  const currentViewerItem = imageViewerItems[imageViewerIndex] ?? null;
  const currentViewerUrl = toAbsoluteUrl(currentViewerItem?.attachmentUrl);
  const canViewPrev = imageViewerIndex > 0;
  const canViewNext = imageViewerIndex < imageViewerItems.length - 1;
  const showMobileSidebar = !isMobileLayout || !activeConv;
  const showMobileMain = !isMobileLayout || !!activeConv;

  useLayoutEffect(() => {
    const container = convListRef.current;
    if (!container) return;

    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-conv-id]"));
    const nextPositions = new Map<string, number>();

    for (const row of rows) {
      const id = row.dataset.convId;
      if (!id) continue;
      nextPositions.set(id, row.getBoundingClientRect().top);
    }

    for (const row of rows) {
      const id = row.dataset.convId;
      if (!id) continue;

      const prevTop = convPositionsRef.current.get(id);
      const nextTop = nextPositions.get(id);
      if (prevTop == null || nextTop == null) continue;

      const deltaY = prevTop - nextTop;
      if (Math.abs(deltaY) < 1) continue;

      row.animate(
        [{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }],
        { duration: 190, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
      );
    }

    convPositionsRef.current = nextPositions;
  }, [conversations]);

  useEffect(() => {
    if (!token) return;

    const s = createSocket(token);
    socketRef.current = s;

    s.on("connect", () => {
      const currentConvId = activeConvIdRef.current;
      if (currentConvId) joinConversationRoom(currentConvId);
    });

    s.on("message:new", (msg: Message) => {
      handleRealtimeIncomingMessage(msg);
    });

    s.on("user:message:new", (msg: Message) => {
      void notifyIncomingMessage(msg);
      handleRealtimeIncomingMessage(msg);
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

    s.on("conversation:hidden", (payload: { conversationId: string }) => {
      setConversations((prev) => prev.filter((conv) => conv.id !== payload.conversationId));
      if (payload.conversationId === activeConvIdRef.current) {
        setActiveConv(null);
        setMessages([]);
        setNewMsgsCount(0);
        setShowJumpNew(false);
        setUnreadAnchorMessageId(null);
        setShowJumpUnread(false);
      }
    });

    s.on("conversations:sync", (payload?: { conversationId?: string | null; force?: boolean }) => {
      if (payload?.force) {
        void loadConversations(activeConvIdRef.current ?? undefined);
        return;
      }

      const conversationId = payload?.conversationId ?? null;
      if (!conversationId) {
        void loadConversations(activeConvIdRef.current ?? undefined);
        return;
      }

      const hasConversation = conversationsRef.current.some((conv) => conv.id === conversationId);
      if (!hasConversation) {
        void loadConversations(activeConvIdRef.current ?? undefined);
      }
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

  useEffect(() => {
    if (!imageViewerOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeImageViewer();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToImage(-1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goToImage(1);
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setViewerZoom(imageViewerZoom + 0.2);
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        setViewerZoom(imageViewerZoom - 0.2);
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        resetImageViewerTransform();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageViewerOpen, imageViewerZoom, imageViewerItems.length]);

  useEffect(() => {
    if (!imageViewerOpen) return;
    resetImageViewerTransform();
  }, [imageViewerIndex, imageViewerOpen]);

  useEffect(() => {
    closeImageViewer();
    imageViewerConvIdRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConv?.id]);

  useEffect(() => {
    syncUnreadJumpButton();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, unreadAnchorMessageId, activeConv?.id]);

  useEffect(() => {
    const desktopApi = window.bhashDesktop;
    if (!desktopApi?.isDesktop || typeof desktopApi.onNotificationClick !== "function") return;

    function handleNotificationTarget(target?: DesktopNotificationTarget | null) {
      const conversationId = target?.conversationId?.trim();
      if (!conversationId) return;
      void openConversationById(conversationId, target?.messageId ?? null);
    }

    const off = desktopApi.onNotificationClick((payload) => {
      handleNotificationTarget(payload);
    });

    if (typeof desktopApi.consumeNotificationTarget === "function") {
      void desktopApi
        .consumeNotificationTarget()
        .then((pending) => {
          handleNotificationTarget(pending);
        })
        .catch(() => undefined);
    }

    return () => {
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="chat-shell">
      <TopNav
        title="BHASH • Chat"
        subtitle={me ? `${me.name}` : ""}
        theme={theme}
        onToggleTheme={toggleTheme}
        logoSrc={resolvedLogoUrl}
        rightSlot={
          <button className="chat-dangerBtn" onClick={logoff}>
            Logoff
          </button>
        }
      />

      <div className={`chat-layout ${isMobileLayout ? "is-mobile" : ""}`}>
        {showMobileSidebar ? (
        <aside className="chat-sidebar">
          <div className="chat-sidebar__header">
            <div className="chat-sidebar__title">Conversas</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="chat-iconBtn" onClick={() => setMyInfoOpen(true)} title="Minhas informações">
                <GearIcon />
              </button>
              <button className="chat-primaryIconBtn" onClick={() => setPickerOpen(true)} title="Nova conversa">
                <PlusIcon />
                <span>Nova</span>
              </button>
            </div>
          </div>

          <div className="chat-sidebar__list" ref={convListRef}>
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
                  <div key={conv.id} className="chat-convCardWrap" data-conv-id={conv.id}>
                    <button
                      className={`chat-convCard ${active ? "is-active" : ""}`}
                      onClick={() => void openConversation(conv)}
                    >
                      <div className="chat-avatar chat-avatar--md">
                        {avatar ? (
                          <img src={avatar} alt={other.name} />
                        ) : (
                          <span>{other.name.slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>

                      <div className="chat-convCard__main">
                        <div className="chat-convCard__nameRow">
                          <span className="chat-convCard__name">{other.name}</span>
                          {conv.pinned ? <span className="chat-convPinnedTag">Fixada</span> : null}
                        </div>
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

                    <button
                      className={`chat-convMenuBtn ${conversationMenuId === conv.id ? "is-open" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionMenuMsgId(null);
                        setReactionBarMsgId(null);
                        setReactionPickerMsgId(null);
                        setConversationMenuId((prev) => (prev === conv.id ? null : conv.id));
                      }}
                      title="Ações da conversa"
                    >
                      <DotsIcon />
                    </button>

                    {conversationMenuId === conv.id ? (
                      <div className="chat-convMenu" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="chat-msgMenu__item"
                          onClick={() => void setConversationPinned(conv.id, !conv.pinned)}
                        >
                          <PinIcon filled={!!conv.pinned} />
                          <span>{conv.pinned ? "Desafixar conversa" : "Fixar conversa"}</span>
                        </button>
                        <button className="chat-msgMenu__item" onClick={() => void clearConversation(conv.id)}>
                          <TrashIcon />
                          <span>Limpar conversa</span>
                        </button>
                        <button
                          className="chat-msgMenu__item chat-msgMenu__item--danger"
                          onClick={() => void removeConversationFromList(conv.id)}
                        >
                          <CloseIcon />
                          <span>Remover dos chats</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </aside>
        ) : null}

        {showMobileMain ? (
        <main className="chat-main">
          <div className="chat-mainHeader">
            {activeConv ? (
              <div className="chat-mainHeader__left">
                {isMobileLayout ? (
                  <button
                    className="chat-iconBtn chat-mainHeader__backBtn"
                    onClick={() => {
                      setActiveConv(null);
                      setSearchOpen(false);
                      setProfileOpen(false);
                      setMessages([]);
                      setNewMsgsCount(0);
                      setShowJumpNew(false);
                      setUnreadAnchorMessageId(null);
                      setShowJumpUnread(false);
                    }}
                    title="Voltar para conversas"
                  >
                    <ChevronLeftIcon />
                  </button>
                ) : null}

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
              </div>
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

          <div className="chat-thread">
            <div className={searchOpen ? "chat-content chat-content--withSearch" : "chat-content"}>
            <div
              ref={msgListRef}
              className="chat-messageList"
              onScroll={() => {
                const el = msgListRef.current;
                if (!el) return;
                const nearBottom = isMessageListNearBottom(el, 120);
                isMsgListNearBottomRef.current = nearBottom;
                if (nearBottom) {
                  setShowJumpNew(false);
                  setNewMsgsCount(0);
                }
                syncUnreadJumpButton();
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
              ) : messagesErr && messages.length === 0 ? (
                <div className="chat-error">{messagesErr}</div>
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

                      if (row.kind === "unread") {
                        return (
                          <div
                            key={`unread-${activeConv?.id ?? "conv"}-${idx}`}
                            className="chat-unreadMarker"
                            data-unread-anchor="true"
                          >
                            <span className="chat-unreadMarker__icon" aria-hidden="true">
                              <ArrowDownIcon />
                            </span>
                            <span>Não lidas</span>
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
                          className={`chat-msgRow ${isMine ? "is-mine" : "is-other"} ${
                            actionMenuMsgId === msg.id ? "is-menu-open" : ""
                          } ${
                            reactions.length ? "has-reactions" : ""
                          }`}
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
                                    setReactionBarMsgId(null);
                                    setReactionPickerMsgId(null);
                                    setActionMenuMsgId(null);
                                  }}
                                >
                                  <ReplyIcon />
                                  <span>Responder</span>
                                </button>

                                <button
                                  className="chat-msgMenu__item"
                                  onClick={() => {
                                    setReactionBarMsgId((prev) => (prev === msg.id ? null : msg.id));
                                    setReactionPickerMsgId(null);
                                  }}
                                >
                                  <SmileIcon />
                                  <span>Reagir</span>
                                </button>

                                {reactionBarMsgId === msg.id ? (
                                  <div className="chat-msgMenu__reactionBar">
                                    {QUICK_REACTION_EMOJIS.map((emoji) => (
                                      <button
                                        key={`${msg.id}-quick-${emoji}`}
                                        className="chat-msgMenu__reactionPill"
                                        onClick={() => {
                                          void reactToMessage(msg, emoji);
                                          setReactionBarMsgId(null);
                                          setReactionPickerMsgId(null);
                                          setActionMenuMsgId(null);
                                        }}
                                        title={`Reagir com ${emoji}`}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                    <button
                                      className={`chat-msgMenu__reactionMore ${
                                        reactionPickerMsgId === msg.id ? "is-open" : ""
                                      }`}
                                      onClick={() =>
                                        setReactionPickerMsgId((prev) => (prev === msg.id ? null : msg.id))
                                      }
                                      title="Mais reações"
                                    >
                                      <PlusIcon />
                                    </button>
                                  </div>
                                ) : null}

                                {reactionBarMsgId === msg.id && reactionPickerMsgId === msg.id ? (
                                  <div className="chat-msgMenu__emojiGrid">
                                    {EMOJIS.map((emoji) => (
                                      <button
                                        key={`${msg.id}-full-${emoji}`}
                                        className="chat-msgMenu__emojiBtn"
                                        onClick={() => {
                                          void reactToMessage(msg, emoji);
                                          setReactionBarMsgId(null);
                                          setReactionPickerMsgId(null);
                                          setActionMenuMsgId(null);
                                        }}
                                        title={`Reagir com ${emoji}`}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}

                                <button
                                  className="chat-msgMenu__item"
                                  onClick={() => {
                                    const content =
                                      msg.body?.trim() ||
                                      msg.attachmentUrl ||
                                      msg.attachmentName ||
                                      "";
                                    if (content) copyText(content);
                                    setReactionBarMsgId(null);
                                    setReactionPickerMsgId(null);
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
                                    setReactionBarMsgId(null);
                                    setReactionPickerMsgId(null);
                                    setActionMenuMsgId(null);
                                  }}
                                >
                                  <StarIcon filled={!!msg.isFavorited} />
                                  <span>{msg.isFavorited ? "Desfavoritar" : "Favoritar"}</span>
                                </button>

                                <button
                                  className="chat-msgMenu__item chat-msgMenu__item--danger"
                                  onClick={() => {
                                    setMultiDeleteMode(true);
                                    setSelectedMessageIds([msg.id]);
                                    setReactionBarMsgId(null);
                                    setReactionPickerMsgId(null);
                                    setActionMenuMsgId(null);
                                  }}
                                >
                                  <TrashIcon />
                                  <span>Apagar</span>
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
                              <button
                                type="button"
                                className="chat-imageLink chat-imageLink--btn"
                                onClick={() => void openImageViewer(msg)}
                                title="Abrir imagem"
                              >
                                <img src={imageUrl} alt={msg.attachmentName ?? "imagem"} className="chat-imagePreview" />
                              </button>
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

            {showJumpUnread ? (
              <button
                className="chat-jumpUnreadBtn"
                onClick={() => {
                  scrollToUnreadAnchor();
                }}
                title="Ir para a primeira mensagem não lida"
              >
                <span className="chat-jumpUnreadBtn__icon" aria-hidden="true">
                  <ArrowUpIcon />
                </span>
                <span>Não lidas</span>
              </button>
            ) : null}

            {showJumpNew ? (
              <button
                className="chat-jumpNewBtn"
                onClick={() => {
                  scrollToBottom();
                  setShowJumpNew(false);
                  setNewMsgsCount(0);
                }}
                title="Ir para mensagens novas"
              >
                <span className="chat-jumpNewBtn__icon" aria-hidden="true">
                  <ArrowDownIcon />
                </span>
                <span>{newMsgsCount > 99 ? "99+" : newMsgsCount} {newMsgsCount === 1 ? "nova" : "novas"}</span>
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
                  ref={composerInputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={activeConv ? "Digite sua mensagem..." : "..."}
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
                aria-label={sending ? "Enviando mensagem" : "Enviar mensagem"}
                title={sending ? "Enviando..." : "Enviar"}
              >
                <SendIcon />
              </button>
            </div>
          </div>
          </div>
        </main>
        ) : null}
      </div>

      {myInfoOpen ? (
        <div className="chat-modalBackdrop" onClick={() => setMyInfoOpen(false)}>
          <div className="chat-profileDrawer" onClick={(e) => e.stopPropagation()}>
            <div className="chat-profileDrawer__header">
              <div className="chat-profileDrawer__title">Minhas informações</div>
              <button className="chat-iconBtn" onClick={() => setMyInfoOpen(false)}>
                <CloseIcon />
              </button>
            </div>

            <div className="chat-profileDrawer__body">
              <div className="chat-contactCard">
                <div className="chat-avatar chat-avatar--xl">
                  {toAbsoluteUrl(me?.avatarUrl) ? (
                    <img src={toAbsoluteUrl(me?.avatarUrl) ?? ""} alt={me?.name ?? "Meu perfil"} />
                  ) : (
                    <span>{(me?.name ?? "U").slice(0, 1).toUpperCase()}</span>
                  )}
                </div>

                <div className="chat-contactCard__name">{me?.name ?? "Usuário"}</div>
              </div>

              <div className="chat-sectionTitle">Dados do perfil</div>
              <div className="chat-contactCard__info chat-contactCard__info--left">
                <div><strong>Nome:</strong> {me?.name ?? "-"}</div>
                <div><strong>E-mail:</strong> {me?.email || "Sem e-mail"}</div>
                <div><strong>Empresa:</strong> {me?.company?.name ?? "Sem empresa"}</div>
                <div><strong>Setor:</strong> {me?.department?.name ?? "Sem setor"}</div>
                <div><strong>Ramal:</strong> {me?.extension || "Sem ramal"}</div>
                <div><strong>Foto de perfil:</strong> {me?.avatarUrl ? "Enviada" : "Sem foto"}</div>
              </div>

              <div className="chat-myInfoActions">
                <button
                  className="chat-primaryBtn"
                  onClick={() => myAvatarInputRef.current?.click()}
                  disabled={avatarUploading}
                >
                  {avatarUploading
                    ? "Enviando..."
                    : me?.avatarUrl
                    ? "Alterar foto existente"
                    : "Enviar nova foto"}
                </button>
                <input
                  ref={myAvatarInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadMyAvatar(file);
                    e.currentTarget.value = "";
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
                    <div className="chat-userGroup__companyBar">{group.company}</div>

                    {group.departments.map((dept) => (
                      <div key={`${group.company}-${dept.department}`} className="chat-userDeptBlock">
                        <div className="chat-userGroup__departmentBar">{dept.department}</div>
                        <div className="chat-userGroup__list">
                          {dept.users.map((user) => (
                            <div
                              key={user.id}
                              className="chat-userRow"
                              role="button"
                              tabIndex={0}
                              onClick={() => void startDirect(user.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  void startDirect(user.id);
                                }
                              }}
                            >
                              <div className="chat-userCell chat-userCell--name">
                                <div className="chat-avatar chat-avatar--sm">
                                  {toAbsoluteUrl(user.avatarUrl) ? (
                                    <img src={toAbsoluteUrl(user.avatarUrl) ?? ""} alt={user.name} />
                                  ) : (
                                    <span>{user.name.slice(0, 1).toUpperCase()}</span>
                                  )}
                                </div>
                                <div className="chat-userRow__identity">
                                  <span className="chat-userFieldLabel">Nome:</span>
                                  <span className="chat-userRow__name">{user.name}</span>
                                </div>
                              </div>

                              <div className="chat-userCell chat-userCell--email">
                                <span className="chat-userFieldLabel">E-mail:</span>
                                <div className="chat-userEmailWrap">
                                  <span className="chat-userEmailText">{user.email || "Sem e-mail"}</span>
                                  <button
                                    className="chat-iconBtn chat-iconBtn--sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (user.email) copyText(user.email);
                                    }}
                                    title={user.email ? "Copiar e-mail" : "Sem e-mail para copiar"}
                                    disabled={!user.email}
                                  >
                                    <CopyIcon />
                                  </button>
                                </div>
                              </div>

                              <div className="chat-userCell chat-userCell--ext">
                                <span className="chat-userFieldLabel">Ramal:</span>
                                <span className="chat-userExtText">{user.extension || "Sem ramal"}</span>
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

      {imageViewerOpen ? (
        <div className="chat-imageViewer" onClick={closeImageViewer}>
          <div className="chat-imageViewer__topBar" onClick={(e) => e.stopPropagation()}>
            <div className="chat-imageViewer__meta">
              <div className="chat-imageViewer__title">
                {currentViewerItem?.attachmentName || "Imagem"}
              </div>
              <div className="chat-imageViewer__sub">
                {imageViewerItems.length
                  ? `${imageViewerIndex + 1} de ${imageViewerItems.length}`
                  : "Sem imagens"}
                {currentViewerItem?.createdAt ? ` • ${fmtDateTime(currentViewerItem.createdAt)}` : ""}
              </div>
            </div>

            <div className="chat-imageViewer__actions">
              <button
                className="chat-iconBtn"
                onClick={() => setViewerZoom(imageViewerZoom - 0.2)}
                title="Diminuir zoom"
                disabled={imageViewerZoom <= 1}
              >
                <ZoomOutIcon />
              </button>
              <button className="chat-iconBtn" onClick={() => setViewerZoom(imageViewerZoom + 0.2)} title="Aumentar zoom">
                <ZoomInIcon />
              </button>
              <button className="chat-iconBtn" onClick={resetImageViewerTransform} title="Resetar zoom">
                <ResetZoomIcon />
              </button>
              <span className="chat-imageViewer__zoomLabel">{Math.round(imageViewerZoom * 100)}%</span>
              <button className="chat-iconBtn" onClick={closeImageViewer} title="Fechar">
                <CloseIcon />
              </button>
            </div>
          </div>

          <div className="chat-imageViewer__stageWrap" onClick={(e) => e.stopPropagation()}>
            <button
              className="chat-imageViewer__nav chat-imageViewer__nav--left"
              onClick={() => goToImage(-1)}
              disabled={!canViewPrev}
              title="Imagem anterior"
            >
              <ChevronLeftIcon />
            </button>

            <div
              className={`chat-imageViewer__stage ${imageViewerZoom > 1 ? "is-zoomed" : ""} ${
                imageViewerDragging ? "is-dragging" : ""
              }`}
              onWheel={(e) => {
                if (!currentViewerUrl) return;
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.2 : -0.2;
                setViewerZoom(imageViewerZoom + delta);
              }}
              onMouseDown={(e) => {
                if (imageViewerZoom <= 1) return;
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
                const nextX = drag.originX + (e.clientX - drag.startX);
                const nextY = drag.originY + (e.clientY - drag.startY);
                setImageViewerOffset({ x: nextX, y: nextY });
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
                if (imageViewerZoom > 1) {
                  resetImageViewerTransform();
                } else {
                  setViewerZoom(2);
                }
              }}
            >
              {currentViewerUrl ? (
                <img
                  key={currentViewerItem?.id ?? currentViewerUrl}
                  src={currentViewerUrl}
                  alt={currentViewerItem?.attachmentName ?? "imagem"}
                  className="chat-imageViewer__image"
                  draggable={false}
                  style={{
                    transform: `translate(${imageViewerOffset.x}px, ${imageViewerOffset.y}px) scale(${imageViewerZoom})`,
                  }}
                />
              ) : (
                <div className="chat-empty">Imagem indisponível.</div>
              )}
            </div>

            <button
              className="chat-imageViewer__nav chat-imageViewer__nav--right"
              onClick={() => goToImage(1)}
              disabled={!canViewNext}
              title="Próxima imagem"
            >
              <ChevronRightIcon />
            </button>
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

                  <div className="chat-contactCard__info chat-contactCard__info--contact">
                    <div className="chat-contactInfoRow">
                      <span className="chat-contactInfoLabel">Empresa:</span>
                      <span className="chat-contactInfoValue">{profileData.company?.name ?? "Sem empresa"}</span>
                    </div>
                    <div className="chat-contactInfoRow">
                      <span className="chat-contactInfoLabel">Setor:</span>
                      <span className="chat-contactInfoValue">{profileData.department?.name ?? "Sem setor"}</span>
                    </div>
                    <div className="chat-contactInfoRow">
                      <span className="chat-contactInfoLabel">Ramal:</span>
                      <span className="chat-contactInfoValue">{profileData.extension || "Sem ramal"}</span>
                    </div>
                    <div className="chat-contactInfoRow chat-contactInfoRow--email">
                      <span className="chat-contactInfoLabel">Email:</span>
                      <span className="chat-contactInfoValue">{profileData.email || "Sem e-mail"}</span>
                      <button
                        className="chat-iconBtn chat-iconBtn--sm chat-contactInfoCopyBtn"
                        onClick={() => {
                          if (profileData.email) copyText(profileData.email);
                        }}
                        title={profileData.email ? "Copiar e-mail" : "Sem e-mail para copiar"}
                        disabled={!profileData.email}
                      >
                        <CopyIcon />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="chat-sectionTitle">Mensagens favoritadas nesta conversa</div>
                <div className="chat-favoritesList">
                  {!favoriteMessages.length ? (
                    <div className="chat-empty">Nenhuma favorita.</div>
                  ) : (
                    favoriteMessages.map((msg) => (
                      <button
                        key={msg.id}
                        className="chat-favoriteCard chat-favoriteCard--btn"
                        onClick={() => {
                          void jumpToMessageById(msg.id);
                          setProfileOpen(false);
                        }}
                      >
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
                      </button>
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

                <div className={`chat-mediaGrid ${profileMediaTab === "image" ? "chat-mediaGrid--images" : ""}`}>
                  {profileMediaLoading ? (
                    <div className="chat-empty">Carregando…</div>
                  ) : profileMediaItems.length === 0 ? (
                    <div className="chat-empty">Nada encontrado.</div>
                  ) : profileMediaTab === "image" ? (
                    profileMediaItems.map((item) => (
                      <button
                        key={item.id}
                        className="chat-mediaThumb chat-mediaThumb--btn"
                        onClick={() => {
                          void jumpToMessageById(item.id);
                          setProfileOpen(false);
                        }}
                      >
                        <img src={toAbsoluteUrl(item.attachmentUrl) ?? ""} alt={item.attachmentName ?? "imagem"} />
                      </button>
                    ))
                  ) : (
                    profileMediaItems.map((item) => (
                      <button
                        key={item.id}
                        className="chat-fileCard chat-fileCard--btn"
                        onClick={() => {
                          void jumpToMessageById(item.id);
                          setProfileOpen(false);
                        }}
                      >
                        <div className="chat-fileCard__icon">
                          <FileIcon />
                        </div>
                        <div className="chat-fileCard__text">
                          <div className="chat-fileCard__name">{item.attachmentName ?? "Arquivo"}</div>
                          <div className="chat-fileCard__meta">{fmtDateTime(item.createdAt)}</div>
                        </div>
                      </button>
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
