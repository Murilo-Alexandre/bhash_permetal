import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { unzipSync } from "fflate";
import readXlsxFile from "read-excel-file/browser";
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
  isGroupAdmin?: boolean;
  company?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
};

type OrgMini = {
  id: string;
  name: string;
};

type AutomaticRuleItem = {
  id: string;
  companyId?: string | null;
  departmentId?: string | null;
  company?: OrgMini | null;
  department?: OrgMini | null;
};

type BroadcastSource = {
  id: string;
  title: string;
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
  contentType?: "TEXT" | "IMAGE" | "FILE" | "AUDIO";
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
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
  contentType?: "TEXT" | "IMAGE" | "FILE" | "AUDIO";
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  replyToId?: string | null;
  deletedAt?: string | null;
  broadcastSource?: BroadcastSource | null;
  sender: UserMini;
  replyTo?: ReplyToMessage | null;
  reactions?: ReactionRaw[];
  isFavorited?: boolean;
};

type ConversationKind = "DIRECT" | "GROUP" | "BROADCAST";
type GroupDepartureReason = "LEFT" | "REMOVED" | "GROUP_DELETED";

type ConversationListItem = {
  id: string;
  kind?: ConversationKind;
  title?: string | null;
  rawTitle?: string | null;
  avatarUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
  sortAt?: string;
  createdById?: string | null;
  createdBy?: UserMini | null;
  otherUser?: UserMini | null;
  participants?: UserMini[];
  groupAdmins?: UserMini[];
  automaticRules?: AutomaticRuleItem[];
  participantCount?: number;
  broadcastTargets?: UserMini[];
  targetCount?: number;
  broadcastIncludeAllUsers?: boolean;
  broadcastTargetCompanies?: OrgMini[];
  broadcastTargetDepartments?: OrgMini[];
  broadcastExcludedUsers?: UserMini[];
  effectiveBroadcastTargets?: UserMini[];
  availableBroadcastUsers?: UserMini[];
  lastMessage?: Message | null;
  unreadCount?: number;
  pinned?: boolean;
  isCurrentParticipant?: boolean;
  isGroupAdmin?: boolean;
  leftAt?: string | null;
  leftReason?: GroupDepartureReason | null;
};

type SearchHit = Message;

type MediaItem = Message;

type GroupedMessageRow =
  | { kind: "sep"; label: string }
  | { kind: "unread" }
  | { kind: "msg"; value: Message; startsSenderBlock: boolean };

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

type ConversationMutationResponse = {
  ok: true;
  conversation: ConversationListItem;
  participantIds?: string[];
  addedUserIds?: string[];
  removedUserId?: string;
};

type CreatePickerMode = "direct" | "group" | "broadcast" | "group-members";
type PickerGuideTone = "info" | "success" | "warning" | "danger";

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

type MediaRetentionPolicyResponse = {
  ok: true;
  visible: boolean;
  enabled?: boolean;
  interval?: string;
  intervalLabel?: string;
  nextRunAt?: string | null;
};

type FavoriteDeletePrompt = {
  ids: string[];
  favoriteIds: string[];
  totalCount: number;
  favoriteCount: number;
};

type PendingMessageDeleteBatch = {
  token: number;
  ids: string[];
  messages: Message[];
  searchHits: SearchHit[];
  profileMediaItems: MediaItem[];
  imageViewerItems: MediaItem[];
  conversationId: string | null;
  expiresAt: number;
};

type ConversationClearSummaryResponse = {
  ok: true;
  conversationId: string;
  totalCount: number;
  favoriteCount: number;
};

type ConversationClearPrompt = {
  conversationId: string;
  conversationName: string;
  totalCount: number;
  favoriteCount: number;
  messageIds: string[];
  favoriteIds: string[];
};

type ConversationUiSnapshot = {
  conversations: ConversationListItem[];
  activeConv: ConversationListItem | null;
  messages: Message[];
  searchHits: SearchHit[];
  profileMediaItems: MediaItem[];
  imageViewerItems: MediaItem[];
  newMsgsCount: number;
  showJumpNew: boolean;
  unreadAnchorMessageId: string | null;
  showJumpUnread: boolean;
  profileOpen: boolean;
  searchOpen: boolean;
};

type PendingConversationHideBatch = {
  token: number;
  ids: string[];
  snapshot: ConversationUiSnapshot;
  expiresAt: number;
};

type PendingConversationClearBatch = {
  token: number;
  conversationId: string;
  conversationName: string;
  keepFavorites: boolean;
  totalCount: number;
  favoriteCount: number;
  messageIds: string[];
  favoriteIds: string[];
  snapshot: ConversationUiSnapshot;
  expiresAt: number;
};

type PendingBroadcastDeleteBatch = {
  token: number;
  conversationId: string;
  expiresAt: number;
};

type ToastTone = "default" | "success";

type ToastState = {
  message: string;
  tone?: ToastTone;
};

type ProfileResponse = {
  ok: true;
  user: UserProfile;
};

type ConversationDetailsResponse = {
  ok: true;
  conversation: ConversationListItem;
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
const INITIAL_MESSAGES_PAGE_SIZE = 40;
const OLDER_MESSAGES_PAGE_SIZE = 30;
const MESSAGE_LIST_TOP_LOAD_THRESHOLD = 140;
const MESSAGE_LIST_AUTOLOAD_THRESHOLD = 48;

const PT_BR_COLLATOR = new Intl.Collator("pt-BR", {
  sensitivity: "base",
  numeric: true,
});

function compareAlpha(a?: string | null, b?: string | null) {
  return PT_BR_COLLATOR.compare((a ?? "").trim(), (b ?? "").trim());
}

function randomId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

const ATTACHMENT_MOJIBAKE_MARKERS = /[ÃÂ�]/u;
const IMAGE_FILE_RE = /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif|avif)([?#]|$)/i;
const VIDEO_FILE_RE = /\.(mp4|webm|ogg|ogv|mov|m4v|avi|mkv|3gp|mpeg?|mpg|wmv)([?#]|$)/i;
const AUDIO_FILE_RE = /\.(mp3|m4a|aac|wav|flac|oga|ogg|opus|weba|amr|mpga)([?#]|$)/i;
const SPREADSHEET_FILE_RE = /\.(xlsx|xlsm|xls|csv|ods|fods)([?#]|$)/i;
const SPREADSHEET_MIME_RE =
  /(application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel\.sheet\.macroenabled\.12|application\/vnd\.ms-excel|application\/msexcel|application\/x-msexcel|application\/vnd\.oasis\.opendocument\.spreadsheet|application\/vnd\.oasis\.opendocument\.spreadsheet-flat-xml|text\/csv|application\/csv)/i;
const LEGACY_XLS_FILE_RE = /\.xls([?#]|$)/i;
const TEXT_DOCUMENT_FILE_RE = /\.(docx|docm|dotx|dotm|doc|odt|fodt|rtf|txt)([?#]|$)/i;
const TEXT_DOCUMENT_MIME_RE =
  /(application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.ms-word\.document\.macroenabled\.12|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.template|application\/vnd\.ms-word\.template\.macroenabled\.12|application\/vnd\.oasis\.opendocument\.text|application\/vnd\.oasis\.opendocument\.text-flat-xml|application\/msword|application\/rtf|text\/rtf|text\/plain)/i;
const PRESENTATION_FILE_RE = /\.(pptx|pptm|ppsx|ppsm|potx|potm|ppt|odp|fodp)([?#]|$)/i;
const PRESENTATION_MIME_RE =
  /(application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation|application\/vnd\.ms-powerpoint\.presentation\.macroenabled\.12|application\/vnd\.openxmlformats-officedocument\.presentationml\.slideshow|application\/vnd\.ms-powerpoint\.slideshow\.macroenabled\.12|application\/vnd\.openxmlformats-officedocument\.presentationml\.template|application\/vnd\.ms-powerpoint\.template\.macroenabled\.12|application\/vnd\.oasis\.opendocument\.presentation|application\/vnd\.oasis\.opendocument\.presentation-flat-xml|application\/vnd\.ms-powerpoint)/i;
const MAX_CHAT_ATTACHMENT_BYTES = 250 * 1024 * 1024;
const SPREADSHEET_PREVIEW_MAX_ROWS = 5;
const SPREADSHEET_PREVIEW_MAX_COLS = 5;
const TEXT_DOCUMENT_PREVIEW_MAX_PARAGRAPHS = 7;
const PRESENTATION_PREVIEW_MAX_POINTS = 5;
const AUDIO_PLAYBACK_RATES = [1, 1.5, 2] as const;
const AUDIO_PLAYBACK_RATE_STORAGE_KEY = "bhash:audio-playback-rate";
const AUDIO_PLAYBACK_RATE_EVENT = "bhash:audio-playback-rate-change";
const CONVERSATION_READ_MARKERS_STORAGE_KEY = "bhash:conversation-read-markers";
type MediaPreviewLayout = "landscape" | "square" | "portrait";

type SpreadsheetCellValue = string | number | boolean | Date | null;

type SpreadsheetPreviewData = {
  label: string;
  rows: string[][];
  columnCount: number;
  fallback?: boolean;
};

const spreadsheetPreviewCache = new Map<string, SpreadsheetPreviewData>();
const spreadsheetPreviewPending = new Map<string, Promise<SpreadsheetPreviewData>>();
let legacySpreadsheetReaderPromise: Promise<typeof import("@e965/xlsx")> | null = null;
const optimisticAudioMessageIds = new Set<string>();

type TextDocumentPreviewData = {
  label: string;
  paragraphs: string[];
  fallback?: boolean;
};

const textDocumentPreviewCache = new Map<string, TextDocumentPreviewData>();
const textDocumentPreviewPending = new Map<string, Promise<TextDocumentPreviewData>>();

type PresentationPreviewData = {
  label: string;
  title: string;
  bullets: string[];
  slideCount: number;
  fallback?: boolean;
};

const presentationPreviewCache = new Map<string, PresentationPreviewData>();
const presentationPreviewPending = new Map<string, Promise<PresentationPreviewData>>();
const mediaPreviewLayoutCache = new Map<string, MediaPreviewLayout>();
const mediaPreviewLayoutPending = new Map<string, Promise<MediaPreviewLayout>>();

function classifyMediaPreviewLayout(width?: number, height?: number): MediaPreviewLayout {
  if (!width || !height) return "square";
  const ratio = width / height;
  if (!Number.isFinite(ratio) || ratio <= 0) return "square";
  if (ratio >= 1.2) return "landscape";
  if (ratio <= 0.85) return "portrait";
  return "square";
}

function loadImagePreviewLayout(url: string) {
  return new Promise<MediaPreviewLayout>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(classifyMediaPreviewLayout(img.naturalWidth, img.naturalHeight));
    img.onerror = () => resolve("square");
    img.src = url;
  });
}

function loadVideoPreviewLayout(url: string) {
  return new Promise<MediaPreviewLayout>((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => resolve(classifyMediaPreviewLayout(video.videoWidth, video.videoHeight));
    video.onerror = () => resolve("landscape");
    video.src = url;
  });
}

async function loadMediaPreviewLayout(url: string, isVideo: boolean): Promise<MediaPreviewLayout> {
  const cached = mediaPreviewLayoutCache.get(url);
  if (cached) return cached;
  const pending = mediaPreviewLayoutPending.get(url);
  if (pending) return pending;

  const loader = (isVideo ? loadVideoPreviewLayout(url) : loadImagePreviewLayout(url))
    .then((layout) => {
      mediaPreviewLayoutCache.set(url, layout);
      mediaPreviewLayoutPending.delete(url);
      return layout;
    })
    .catch(() => {
      mediaPreviewLayoutPending.delete(url);
      const fallback = isVideo ? "landscape" : "square";
      mediaPreviewLayoutCache.set(url, fallback);
      return fallback;
    });

  mediaPreviewLayoutPending.set(url, loader);
  return loader;
}

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

function isSpreadsheetAttachment(message: Partial<Message>) {
  if (message.contentType !== "FILE") return false;
  const mime = String(message.attachmentMime ?? "").toLowerCase();
  const name = normalizeAttachmentDisplayName(message.attachmentName).toLowerCase();
  const url = String(message.attachmentUrl ?? "").toLowerCase();
  return SPREADSHEET_MIME_RE.test(mime) || SPREADSHEET_FILE_RE.test(name) || SPREADSHEET_FILE_RE.test(url);
}

function isTextDocumentAttachment(message: Partial<Message>) {
  if (message.contentType !== "FILE") return false;
  if (isPdfAttachment(message) || isSpreadsheetAttachment(message)) return false;
  const mime = String(message.attachmentMime ?? "").toLowerCase();
  const name = normalizeAttachmentDisplayName(message.attachmentName).toLowerCase();
  const url = String(message.attachmentUrl ?? "").toLowerCase();
  return TEXT_DOCUMENT_MIME_RE.test(mime) || TEXT_DOCUMENT_FILE_RE.test(name) || TEXT_DOCUMENT_FILE_RE.test(url);
}

function isPresentationAttachment(message: Partial<Message>) {
  if (message.contentType !== "FILE") return false;
  if (isPdfAttachment(message) || isSpreadsheetAttachment(message) || isTextDocumentAttachment(message)) {
    return false;
  }
  const mime = String(message.attachmentMime ?? "").toLowerCase();
  const name = normalizeAttachmentDisplayName(message.attachmentName).toLowerCase();
  const url = String(message.attachmentUrl ?? "").toLowerCase();
  return PRESENTATION_MIME_RE.test(mime) || PRESENTATION_FILE_RE.test(name) || PRESENTATION_FILE_RE.test(url);
}

function attachmentStorageKind(message: Partial<Message>) {
  const url = String(message.attachmentUrl ?? "").toLowerCase();
  if (url.includes("/chat-files/")) return "file";
  if (url.includes("/chat-media/")) return "media";
  return null;
}

function hasImageFileSignature(message: Partial<Message>) {
  const mime = String(message.attachmentMime ?? "").toLowerCase();
  const name = normalizeAttachmentDisplayName(message.attachmentName).toLowerCase();
  const url = String(message.attachmentUrl ?? "").toLowerCase();
  return mime.startsWith("image/") || IMAGE_FILE_RE.test(name) || IMAGE_FILE_RE.test(url);
}

function hasVideoFileSignature(message: Partial<Message>) {
  const mime = String(message.attachmentMime ?? "").toLowerCase();
  const name = normalizeAttachmentDisplayName(message.attachmentName).toLowerCase();
  const url = String(message.attachmentUrl ?? "").toLowerCase();
  return mime.startsWith("video/") || VIDEO_FILE_RE.test(name) || VIDEO_FILE_RE.test(url);
}

function hasAudioFileSignature(message: Partial<Message>) {
  const mime = String(message.attachmentMime ?? "").toLowerCase();
  const name = normalizeAttachmentDisplayName(message.attachmentName).toLowerCase();
  const url = String(message.attachmentUrl ?? "").toLowerCase();
  return mime.startsWith("audio/") || AUDIO_FILE_RE.test(name) || AUDIO_FILE_RE.test(url);
}

function isImageAttachment(message: Partial<Message>) {
  const storageKind = attachmentStorageKind(message);
  if (storageKind === "file") return false;
  if (message.contentType === "IMAGE") return true;
  if (message.contentType === "FILE" || message.contentType === "AUDIO") return false;
  return hasImageFileSignature(message);
}

function isVideoAttachment(message: Partial<Message>) {
  const storageKind = attachmentStorageKind(message);
  if (storageKind === "file") return false;
  if (message.contentType === "FILE" || message.contentType === "AUDIO") return false;
  return hasVideoFileSignature(message);
}

function isMediaAttachment(message: Partial<Message>) {
  return isVideoAttachment(message) || isImageAttachment(message);
}

function isAudioMessageAttachment(message: Partial<Message>) {
  if (message.contentType === "AUDIO") return true;
  if (message.id && optimisticAudioMessageIds.has(message.id) && hasAudioFileSignature(message)) return true;
  const url = String(message.attachmentUrl ?? "").toLowerCase();
  return url.includes("/chat-audio/") && hasAudioFileSignature(message);
}

function isAudioDocumentAttachment(message: Partial<Message>) {
  return message.contentType === "FILE" && hasAudioFileSignature(message) && !isAudioMessageAttachment(message);
}

function isImageDocumentPreview(message: Partial<Message>) {
  return message.contentType === "FILE" && hasImageFileSignature(message);
}

function isVideoDocumentPreview(message: Partial<Message>) {
  return message.contentType === "FILE" && hasVideoFileSignature(message);
}

function isVideoFileLike(file?: File | null) {
  if (!file) return false;
  const type = String(file.type ?? "").toLowerCase();
  const name = String(file.name ?? "").toLowerCase();
  return type.startsWith("video/") || VIDEO_FILE_RE.test(name);
}

function isImageFileLike(file?: File | null) {
  if (!file) return false;
  const type = String(file.type ?? "").toLowerCase();
  const name = String(file.name ?? "").toLowerCase();
  return type.startsWith("image/") || IMAGE_FILE_RE.test(name);
}

function isMediaFileLike(file?: File | null) {
  return isVideoFileLike(file) || isImageFileLike(file);
}

function isAudioFileLike(file?: File | null) {
  if (!file) return false;
  const type = String(file.type ?? "").toLowerCase();
  const name = String(file.name ?? "").toLowerCase();
  return type.startsWith("audio/") || AUDIO_FILE_RE.test(name);
}

function buildPdfPreviewUrl(raw?: string | null) {
  const absolute = toAbsoluteUrl(raw);
  if (!absolute) return null;
  const [base] = absolute.split("#");
  return `${base}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH`;
}

function buildSpreadsheetPreviewLabel(value?: string | null) {
  const normalized = normalizeAttachmentDisplayName(value);
  const label = normalized ? normalized.replace(/\.[^.]+$/, "").trim() : "";
  return label || "Planilha";
}

function buildTextDocumentPreviewLabel(value?: string | null) {
  const normalized = normalizeAttachmentDisplayName(value);
  const label = normalized ? normalized.replace(/\.[^.]+$/, "").trim() : "";
  return label || "Documento";
}

function buildPresentationPreviewLabel(value?: string | null) {
  const normalized = normalizeAttachmentDisplayName(value);
  const label = normalized ? normalized.replace(/\.[^.]+$/, "").trim() : "";
  return label || "Apresentacao";
}

function formatSpreadsheetCellValue(value: SpreadsheetCellValue) {
  if (value == null) return "";
  if (value instanceof Date) return value.toLocaleDateString("pt-BR");
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > 36 ? `${normalized.slice(0, 33)}...` : normalized;
}

function buildSpreadsheetFallbackPreview(
  attachmentName?: string | null,
  message = "Previa indisponivel"
): SpreadsheetPreviewData {
  return {
    label: buildSpreadsheetPreviewLabel(attachmentName),
    columnCount: 4,
    rows: [
      [message, "", "", ""],
      ["", "", "", ""],
      ["", "", "", ""],
      ["", "", "", ""],
    ],
    fallback: true,
  };
}

function buildSpreadsheetPreviewFromRows(
  sourceRows: SpreadsheetCellValue[][],
  attachmentName?: string | null
): SpreadsheetPreviewData {
  const previewRows = sourceRows
    .map((row) => row.map((cell) => formatSpreadsheetCellValue(cell)))
    .filter((row) => row.some((cell) => cell.length > 0))
    .slice(0, SPREADSHEET_PREVIEW_MAX_ROWS);

  if (!previewRows.length) {
    return buildSpreadsheetFallbackPreview(attachmentName, "Planilha vazia");
  }

  const widestRow = previewRows.reduce((max, row) => Math.max(max, row.length), 0);
  const columnCount = Math.max(4, Math.min(SPREADSHEET_PREVIEW_MAX_COLS, widestRow || 1));

  return {
    label: buildSpreadsheetPreviewLabel(attachmentName),
    columnCount,
    rows: previewRows.map((row) =>
      Array.from({ length: columnCount }, (_, index) => row[index] ?? "")
    ),
  };
}

async function getLegacySpreadsheetReader() {
  if (!legacySpreadsheetReaderPromise) {
    legacySpreadsheetReaderPromise = Promise.all([
      import("@e965/xlsx"),
      import("@e965/xlsx/dist/cpexcel"),
    ]).then(([xlsx, cptable]) => {
      xlsx.set_cptable(cptable);
      return xlsx;
    });
  }

  return legacySpreadsheetReaderPromise;
}

async function parseLegacyXlsPreviewRows(buffer: ArrayBuffer) {
  const xlsx = await getLegacySpreadsheetReader();
  const workbook = xlsx.read(buffer, {
    type: "array",
    dense: true,
    cellText: true,
    cellDates: true,
    sheetRows: SPREADSHEET_PREVIEW_MAX_ROWS,
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [] as SpreadsheetCellValue[][];
  const firstSheet = workbook.Sheets[firstSheetName];
  if (!firstSheet) return [] as SpreadsheetCellValue[][];

  const rows = xlsx.utils.sheet_to_json<SpreadsheetCellValue[]>(firstSheet, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: "",
  });

  return rows
    .slice(0, SPREADSHEET_PREVIEW_MAX_ROWS)
    .map((row) => row.slice(0, SPREADSHEET_PREVIEW_MAX_COLS));
}

function detectCsvDelimiter(line: string) {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestScore = -1;
  for (const delimiter of candidates) {
    const score = line.split(delimiter).length;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

function parseCsvPreviewRows(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\n|\r/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, SPREADSHEET_PREVIEW_MAX_ROWS);

  if (!lines.length) return [] as SpreadsheetCellValue[][];

  const delimiter = detectCsvDelimiter(lines[0] ?? ",");
  return lines.map((line) =>
    line
      .split(delimiter)
      .slice(0, SPREADSHEET_PREVIEW_MAX_COLS)
      .map((cell) => cell.trim())
  );
}

function getXmlAttrByLocalName(element: Element, localName: string) {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.localName === localName) return attribute.value;
  }
  return null;
}

function normalizeSpreadsheetText(value?: string | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extractOdsCellValue(cell: Element): SpreadsheetCellValue {
  if (cell.localName === "covered-table-cell") return "";

  const paragraphs = Array.from(cell.children)
    .filter((child): child is Element => child.nodeType === 1 && child.localName === "p")
    .map((paragraph) => normalizeSpreadsheetText(paragraph.textContent))
    .filter(Boolean);

  const valueType = getXmlAttrByLocalName(cell, "value-type") ?? "";
  if (valueType === "float" || valueType === "currency" || valueType === "percentage") {
    return getXmlAttrByLocalName(cell, "value") ?? paragraphs.join(" ");
  }
  if (valueType === "boolean") {
    return getXmlAttrByLocalName(cell, "boolean-value") ?? paragraphs.join(" ");
  }
  if (valueType === "date") {
    return getXmlAttrByLocalName(cell, "date-value") ?? paragraphs.join(" ");
  }
  if (valueType === "time") {
    return getXmlAttrByLocalName(cell, "time-value") ?? paragraphs.join(" ");
  }
  if (valueType === "string") {
    return paragraphs.join(" ");
  }

  const stringValue = getXmlAttrByLocalName(cell, "string-value");
  if (stringValue) return stringValue;
  if (paragraphs.length) return paragraphs.join(" ");
  return normalizeSpreadsheetText(cell.textContent);
}

function parseOdsPreviewRowsFromXml(xmlText: string) {
  if (typeof DOMParser === "undefined") return [] as SpreadsheetCellValue[][];

  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) return [] as SpreadsheetCellValue[][];

  const firstSheet = Array.from(xml.getElementsByTagName("*")).find((node) => node.localName === "table");
  if (!firstSheet) return [] as SpreadsheetCellValue[][];

  const rows: SpreadsheetCellValue[][] = [];
  const rowElements = Array.from(firstSheet.children).filter(
    (child): child is Element => child.nodeType === 1 && child.localName === "table-row"
  );

  for (const rowElement of rowElements) {
    const rowRepeatRaw = Number.parseInt(getXmlAttrByLocalName(rowElement, "number-rows-repeated") ?? "1", 10);
    const rowRepeat = Number.isFinite(rowRepeatRaw) && rowRepeatRaw > 0 ? rowRepeatRaw : 1;
    const values: SpreadsheetCellValue[] = [];

    const cellElements = Array.from(rowElement.children).filter(
      (child): child is Element =>
        child.nodeType === 1 && (child.localName === "table-cell" || child.localName === "covered-table-cell")
    );

    for (const cell of cellElements) {
      const columnRepeatRaw = Number.parseInt(getXmlAttrByLocalName(cell, "number-columns-repeated") ?? "1", 10);
      const columnRepeat = Number.isFinite(columnRepeatRaw) && columnRepeatRaw > 0 ? columnRepeatRaw : 1;
      const value = extractOdsCellValue(cell);

      for (let index = 0; index < columnRepeat && values.length < SPREADSHEET_PREVIEW_MAX_COLS; index += 1) {
        values.push(value);
      }

      if (values.length >= SPREADSHEET_PREVIEW_MAX_COLS) break;
    }

    for (let index = 0; index < rowRepeat && rows.length < SPREADSHEET_PREVIEW_MAX_ROWS; index += 1) {
      rows.push([...values]);
    }

    if (rows.length >= SPREADSHEET_PREVIEW_MAX_ROWS) break;
  }

  return rows;
}

function parseOdsPreviewRowsFromArchive(buffer: ArrayBuffer) {
  try {
    const archive = unzipSync(new Uint8Array(buffer));
    const contentXml = archive["content.xml"];
    if (!contentXml) return [] as SpreadsheetCellValue[][];
    const xmlText = new TextDecoder("utf-8").decode(contentXml);
    return parseOdsPreviewRowsFromXml(xmlText);
  } catch {
    return [] as SpreadsheetCellValue[][];
  }
}

async function loadSpreadsheetPreview(
  rawUrl?: string | null,
  attachmentName?: string | null,
  attachmentMime?: string | null
) {
  const absolute = toAbsoluteUrl(rawUrl);
  if (!absolute) return buildSpreadsheetFallbackPreview(attachmentName);
  const cached = spreadsheetPreviewCache.get(absolute);
  if (cached) return cached;

  const pending = spreadsheetPreviewPending.get(absolute);
  if (pending) return pending;

  const promise = (async () => {
    const lowerMime = String(attachmentMime ?? "").toLowerCase();
    const lowerName = normalizeAttachmentDisplayName(attachmentName).toLowerCase();
    const lowerUrl = absolute.toLowerCase();
    const isCsv = lowerMime.includes("csv") || lowerName.endsWith(".csv") || lowerUrl.includes(".csv");
    const isLegacyXls =
      (lowerMime.includes("vnd.ms-excel") ||
        lowerMime.includes("application/msexcel") ||
        lowerMime.includes("application/x-msexcel") ||
        LEGACY_XLS_FILE_RE.test(lowerName) ||
        LEGACY_XLS_FILE_RE.test(lowerUrl)) &&
      !lowerName.endsWith(".xlsx") &&
      !lowerName.endsWith(".xlsm") &&
      !lowerUrl.includes(".xlsx") &&
      !lowerUrl.includes(".xlsm");
    const isFlatOds =
      lowerMime.includes("spreadsheet-flat-xml") ||
      lowerName.endsWith(".fods") ||
      lowerUrl.includes(".fods");
    const isOds =
      lowerMime.includes("vnd.oasis.opendocument.spreadsheet") ||
      lowerName.endsWith(".ods") ||
      lowerUrl.includes(".ods");

    try {
      const response = await fetch(absolute, { credentials: "include" });
      if (!response.ok) {
        return buildSpreadsheetFallbackPreview(attachmentName);
      }

      if (isCsv) {
        const text = await response.text();
        return buildSpreadsheetPreviewFromRows(parseCsvPreviewRows(text), attachmentName);
      }

      if (isFlatOds) {
        const xmlText = await response.text();
        return buildSpreadsheetPreviewFromRows(parseOdsPreviewRowsFromXml(xmlText), attachmentName);
      }

      if (isOds) {
        const buffer = await response.arrayBuffer();
        return buildSpreadsheetPreviewFromRows(parseOdsPreviewRowsFromArchive(buffer), attachmentName);
      }

      if (isLegacyXls) {
        const buffer = await response.arrayBuffer();
        return buildSpreadsheetPreviewFromRows(await parseLegacyXlsPreviewRows(buffer), attachmentName);
      }

      const blob = await response.blob();
      const rows = (await readXlsxFile(blob)) as SpreadsheetCellValue[][];
      return buildSpreadsheetPreviewFromRows(rows, attachmentName);
    } catch {
      return buildSpreadsheetFallbackPreview(attachmentName);
    }
  })();

  spreadsheetPreviewPending.set(absolute, promise);

  try {
    const resolved = await promise;
    spreadsheetPreviewCache.set(absolute, resolved);
    return resolved;
  } finally {
    spreadsheetPreviewPending.delete(absolute);
  }
}

function spreadsheetColumnLabel(index: number) {
  let label = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }
  return label;
}

function normalizeDocumentParagraphText(value?: string | null) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
}

function buildTextDocumentFallbackPreview(
  attachmentName?: string | null,
  message = "Previa indisponivel"
): TextDocumentPreviewData {
  return {
    label: buildTextDocumentPreviewLabel(attachmentName),
    paragraphs: [message],
    fallback: true,
  };
}

function buildTextDocumentPreviewFromParagraphs(
  paragraphs: string[],
  attachmentName?: string | null
): TextDocumentPreviewData {
  const normalized = paragraphs
    .map((paragraph) => normalizeDocumentParagraphText(paragraph))
    .filter(Boolean)
    .slice(0, TEXT_DOCUMENT_PREVIEW_MAX_PARAGRAPHS);

  if (!normalized.length) {
    return buildTextDocumentFallbackPreview(attachmentName, "Documento vazio");
  }

  return {
    label: buildTextDocumentPreviewLabel(attachmentName),
    paragraphs: normalized,
  };
}

type PresentationSlidePreview = {
  title: string;
  bullets: string[];
};

function buildPresentationFallbackPreview(
  attachmentName?: string | null,
  message = "Previa indisponivel"
): PresentationPreviewData {
  return {
    label: buildPresentationPreviewLabel(attachmentName),
    title: "Apresentacao",
    bullets: [message],
    slideCount: 1,
    fallback: true,
  };
}

function buildPresentationPreviewFromSlides(
  slides: PresentationSlidePreview[],
  attachmentName?: string | null
): PresentationPreviewData {
  const usableSlides = slides.filter((slide) => slide.title || slide.bullets.length);
  if (!usableSlides.length) {
    return buildPresentationFallbackPreview(attachmentName, "Apresentacao vazia");
  }

  const firstSlide = usableSlides[0];
  const bullets = firstSlide.bullets.filter(Boolean).slice(0, PRESENTATION_PREVIEW_MAX_POINTS);

  return {
    label: buildPresentationPreviewLabel(attachmentName),
    title: firstSlide.title || "Apresentacao",
    bullets,
    slideCount: usableSlides.length,
  };
}

function extractWordParagraphText(paragraph: Element): string {
  let result = "";
  const stack = Array.from(paragraph.childNodes).reverse();

  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    if (element.localName === "t") {
      result += element.textContent ?? "";
      continue;
    }
    if (element.localName === "tab") {
      result += "    ";
      continue;
    }
    if (element.localName === "br" || element.localName === "cr") {
      result += " ";
      continue;
    }
    stack.push(...Array.from(element.childNodes).reverse());
  }

  return normalizeDocumentParagraphText(result);
}

function parseDocxPreviewParagraphsFromXml(xmlText: string) {
  if (typeof DOMParser === "undefined") return [] as string[];

  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) return [] as string[];

  return Array.from(xml.getElementsByTagName("*"))
    .filter((node) => node.localName === "p")
    .map((paragraph) => extractWordParagraphText(paragraph))
    .filter(Boolean)
    .slice(0, TEXT_DOCUMENT_PREVIEW_MAX_PARAGRAPHS);
}

function extractOpenTextParagraphsFromXml(xmlText: string) {
  if (typeof DOMParser === "undefined") return [] as string[];

  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) return [] as string[];

  return Array.from(xml.getElementsByTagName("*"))
    .filter((node) => node.localName === "p" || node.localName === "h")
    .map((node) => normalizeDocumentParagraphText(node.textContent))
    .filter(Boolean)
    .slice(0, TEXT_DOCUMENT_PREVIEW_MAX_PARAGRAPHS);
}

function extractPresentationParagraphText(paragraph: Element) {
  let result = "";
  const stack = Array.from(paragraph.childNodes).reverse();

  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    if (element.localName === "t") {
      result += element.textContent ?? "";
      continue;
    }
    if (element.localName === "tab") {
      result += "    ";
      continue;
    }
    if (element.localName === "br") {
      result += " ";
      continue;
    }
    stack.push(...Array.from(element.childNodes).reverse());
  }

  return normalizeDocumentParagraphText(result);
}

function buildPresentationSlideFromParagraphs(paragraphs: string[]): PresentationSlidePreview {
  const normalized = paragraphs.map((paragraph) => normalizeDocumentParagraphText(paragraph)).filter(Boolean);
  return {
    title: normalized[0] ?? "",
    bullets: normalized.slice(1, 1 + PRESENTATION_PREVIEW_MAX_POINTS),
  };
}

function parsePptSlideFromXml(xmlText: string): PresentationSlidePreview | null {
  if (typeof DOMParser === "undefined") return null;

  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) return null;

  const paragraphs = Array.from(xml.getElementsByTagName("*"))
    .filter((node) => node.localName === "p")
    .map((paragraph) => extractPresentationParagraphText(paragraph))
    .filter(Boolean);

  if (!paragraphs.length) return null;
  return buildPresentationSlideFromParagraphs(paragraphs);
}

function parsePptxSlidesFromArchive(buffer: ArrayBuffer) {
  try {
    const archive = unzipSync(new Uint8Array(buffer));
    const slideEntries = Object.keys(archive)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
      .sort((a, b) => {
        const aIndex = Number.parseInt(a.match(/slide(\d+)\.xml/i)?.[1] ?? "0", 10);
        const bIndex = Number.parseInt(b.match(/slide(\d+)\.xml/i)?.[1] ?? "0", 10);
        return aIndex - bIndex;
      });

    return slideEntries
      .map((entry) => {
        const xmlText = new TextDecoder("utf-8").decode(archive[entry]);
        return parsePptSlideFromXml(xmlText);
      })
      .filter((slide): slide is PresentationSlidePreview => !!slide);
  } catch {
    return [] as PresentationSlidePreview[];
  }
}

function parseOpenPresentationSlidesFromXml(xmlText: string) {
  if (typeof DOMParser === "undefined") return [] as PresentationSlidePreview[];

  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) return [] as PresentationSlidePreview[];

  return Array.from(xml.getElementsByTagName("*"))
    .filter((node) => node.localName === "page")
    .map((page) => {
      const paragraphs = Array.from(page.getElementsByTagName("*"))
        .filter((node) => node.localName === "p" || node.localName === "h")
        .map((node) => normalizeDocumentParagraphText(node.textContent))
        .filter(Boolean);

      return paragraphs.length ? buildPresentationSlideFromParagraphs(paragraphs) : null;
    })
    .filter((slide): slide is PresentationSlidePreview => !!slide);
}

function parseOdpSlidesFromArchive(buffer: ArrayBuffer) {
  try {
    const archive = unzipSync(new Uint8Array(buffer));
    const contentXml = archive["content.xml"];
    if (!contentXml) return [] as PresentationSlidePreview[];
    const xmlText = new TextDecoder("utf-8").decode(contentXml);
    return parseOpenPresentationSlidesFromXml(xmlText);
  } catch {
    return [] as PresentationSlidePreview[];
  }
}

function parseRtfPreviewParagraphs(text: string) {
  const decodedHex = text.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );
  const normalized = decodedHex
    .replace(/\\par[d]?/gi, "\n")
    .replace(/\\line/gi, "\n")
    .replace(/\\tab/gi, "    ")
    .replace(/\\u-?\d+\??/g, " ")
    .replace(/\\[a-z]+\d* ?/gi, " ")
    .replace(/[{}]/g, " ")
    .replace(/\\\\/g, "\\");

  return normalized
    .split(/\r\n|\n|\r/g)
    .map((line) => normalizeDocumentParagraphText(line))
    .filter(Boolean)
    .slice(0, TEXT_DOCUMENT_PREVIEW_MAX_PARAGRAPHS);
}

function parsePlainTextPreviewParagraphs(text: string) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\n|\r/g)
    .map((line) => normalizeDocumentParagraphText(line))
    .filter(Boolean)
    .slice(0, TEXT_DOCUMENT_PREVIEW_MAX_PARAGRAPHS);
}

function parseDocxPreviewFromArchive(buffer: ArrayBuffer) {
  try {
    const archive = unzipSync(new Uint8Array(buffer));
    const documentXml = archive["word/document.xml"];
    if (!documentXml) return [] as string[];
    const xmlText = new TextDecoder("utf-8").decode(documentXml);
    return parseDocxPreviewParagraphsFromXml(xmlText);
  } catch {
    return [] as string[];
  }
}

function parseOdtPreviewFromArchive(buffer: ArrayBuffer) {
  try {
    const archive = unzipSync(new Uint8Array(buffer));
    const contentXml = archive["content.xml"];
    if (!contentXml) return [] as string[];
    const xmlText = new TextDecoder("utf-8").decode(contentXml);
    return extractOpenTextParagraphsFromXml(xmlText);
  } catch {
    return [] as string[];
  }
}

async function loadTextDocumentPreview(
  rawUrl?: string | null,
  attachmentName?: string | null,
  attachmentMime?: string | null
) {
  const absolute = toAbsoluteUrl(rawUrl);
  if (!absolute) return buildTextDocumentFallbackPreview(attachmentName);
  const cached = textDocumentPreviewCache.get(absolute);
  if (cached) return cached;

  const pending = textDocumentPreviewPending.get(absolute);
  if (pending) return pending;

  const promise = (async () => {
    const lowerMime = String(attachmentMime ?? "").toLowerCase();
    const lowerName = normalizeAttachmentDisplayName(attachmentName).toLowerCase();
    const lowerUrl = absolute.toLowerCase();
    const isPlainText = lowerMime.includes("text/plain") || lowerName.endsWith(".txt") || lowerUrl.includes(".txt");
    const isRtf =
      lowerMime.includes("rtf") || lowerName.endsWith(".rtf") || lowerUrl.includes(".rtf");
    const isFlatOdt =
      lowerMime.includes("text-flat-xml") || lowerName.endsWith(".fodt") || lowerUrl.includes(".fodt");
    const isOdt =
      lowerMime.includes("vnd.oasis.opendocument.text") || lowerName.endsWith(".odt") || lowerUrl.includes(".odt");
    const isDocxFamily =
      lowerMime.includes("wordprocessingml") ||
      lowerMime.includes("ms-word.document.macroenabled.12") ||
      lowerName.endsWith(".docx") ||
      lowerName.endsWith(".docm") ||
      lowerName.endsWith(".dotx") ||
      lowerName.endsWith(".dotm") ||
      lowerUrl.includes(".docx") ||
      lowerUrl.includes(".docm") ||
      lowerUrl.includes(".dotx") ||
      lowerUrl.includes(".dotm");
    const isLegacyDoc =
      lowerMime.includes("application/msword") || lowerName.endsWith(".doc") || lowerUrl.includes(".doc");

    try {
      const response = await fetch(absolute, { credentials: "include" });
      if (!response.ok) {
        return buildTextDocumentFallbackPreview(attachmentName);
      }

      if (isPlainText) {
        const text = await response.text();
        return buildTextDocumentPreviewFromParagraphs(parsePlainTextPreviewParagraphs(text), attachmentName);
      }

      if (isRtf) {
        const text = await response.text();
        return buildTextDocumentPreviewFromParagraphs(parseRtfPreviewParagraphs(text), attachmentName);
      }

      if (isFlatOdt) {
        const xmlText = await response.text();
        return buildTextDocumentPreviewFromParagraphs(extractOpenTextParagraphsFromXml(xmlText), attachmentName);
      }

      if (isOdt) {
        const buffer = await response.arrayBuffer();
        return buildTextDocumentPreviewFromParagraphs(parseOdtPreviewFromArchive(buffer), attachmentName);
      }

      if (isDocxFamily) {
        const buffer = await response.arrayBuffer();
        return buildTextDocumentPreviewFromParagraphs(parseDocxPreviewFromArchive(buffer), attachmentName);
      }

      if (isLegacyDoc) {
        return buildTextDocumentFallbackPreview(attachmentName, "Previa parcial para DOC indisponivel");
      }

      return buildTextDocumentFallbackPreview(attachmentName);
    } catch {
      return buildTextDocumentFallbackPreview(attachmentName);
    }
  })();

  textDocumentPreviewPending.set(absolute, promise);

  try {
    const resolved = await promise;
    textDocumentPreviewCache.set(absolute, resolved);
    return resolved;
  } finally {
    textDocumentPreviewPending.delete(absolute);
  }
}

async function loadPresentationPreview(
  rawUrl?: string | null,
  attachmentName?: string | null,
  attachmentMime?: string | null
) {
  const absolute = toAbsoluteUrl(rawUrl);
  if (!absolute) return buildPresentationFallbackPreview(attachmentName);
  const cached = presentationPreviewCache.get(absolute);
  if (cached) return cached;

  const pending = presentationPreviewPending.get(absolute);
  if (pending) return pending;

  const promise = (async () => {
    const lowerMime = String(attachmentMime ?? "").toLowerCase();
    const lowerName = normalizeAttachmentDisplayName(attachmentName).toLowerCase();
    const lowerUrl = absolute.toLowerCase();
    const isFlatOdp =
      lowerMime.includes("presentation-flat-xml") || lowerName.endsWith(".fodp") || lowerUrl.includes(".fodp");
    const isOdp =
      lowerMime.includes("vnd.oasis.opendocument.presentation") ||
      lowerName.endsWith(".odp") ||
      lowerUrl.includes(".odp");
    const isPptxFamily =
      lowerMime.includes("presentationml") ||
      lowerMime.includes("ms-powerpoint.presentation.macroenabled.12") ||
      lowerMime.includes("ms-powerpoint.slideshow.macroenabled.12") ||
      lowerName.endsWith(".pptx") ||
      lowerName.endsWith(".pptm") ||
      lowerName.endsWith(".ppsx") ||
      lowerName.endsWith(".ppsm") ||
      lowerName.endsWith(".potx") ||
      lowerName.endsWith(".potm") ||
      lowerUrl.includes(".pptx") ||
      lowerUrl.includes(".pptm") ||
      lowerUrl.includes(".ppsx") ||
      lowerUrl.includes(".ppsm") ||
      lowerUrl.includes(".potx") ||
      lowerUrl.includes(".potm");
    const isLegacyPpt =
      lowerMime.includes("vnd.ms-powerpoint") || lowerName.endsWith(".ppt") || lowerUrl.includes(".ppt");

    try {
      const response = await fetch(absolute, { credentials: "include" });
      if (!response.ok) {
        return buildPresentationFallbackPreview(attachmentName);
      }

      if (isFlatOdp) {
        const xmlText = await response.text();
        return buildPresentationPreviewFromSlides(parseOpenPresentationSlidesFromXml(xmlText), attachmentName);
      }

      if (isOdp) {
        const buffer = await response.arrayBuffer();
        return buildPresentationPreviewFromSlides(parseOdpSlidesFromArchive(buffer), attachmentName);
      }

      if (isPptxFamily) {
        const buffer = await response.arrayBuffer();
        return buildPresentationPreviewFromSlides(parsePptxSlidesFromArchive(buffer), attachmentName);
      }

      if (isLegacyPpt) {
        return buildPresentationFallbackPreview(attachmentName, "Previa parcial para PPT indisponivel");
      }

      return buildPresentationFallbackPreview(attachmentName);
    } catch {
      return buildPresentationFallbackPreview(attachmentName);
    }
  })();

  presentationPreviewPending.set(absolute, promise);

  try {
    const resolved = await promise;
    presentationPreviewCache.set(absolute, resolved);
    return resolved;
  } finally {
    presentationPreviewPending.delete(absolute);
  }
}

function SpreadsheetPreview({
  attachmentUrl,
  attachmentName,
  attachmentMime,
}: {
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
}) {
  const fallbackPreview = useMemo(
    () => buildSpreadsheetFallbackPreview(attachmentName, ""),
    [attachmentName]
  );
  const [preview, setPreview] = useState<SpreadsheetPreviewData>(fallbackPreview);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const nextFallback = buildSpreadsheetFallbackPreview(attachmentName, "");
    setPreview(nextFallback);
    setLoading(true);

    void loadSpreadsheetPreview(attachmentUrl, attachmentName, attachmentMime).then((data) => {
      if (cancelled) return;
      setPreview(data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [attachmentMime, attachmentName, attachmentUrl]);

  return (
    <div
      className={`chat-sheetPreview ${loading ? "is-loading" : ""} ${preview.fallback ? "is-fallback" : ""}`}
    >
      <div
        className="chat-sheetPreview__table"
        style={{ gridTemplateColumns: `34px repeat(${preview.columnCount}, minmax(0, 1fr))` }}
      >
        <div className="chat-sheetPreview__corner" aria-hidden="true" />
        {Array.from({ length: preview.columnCount }, (_, index) => (
          <div key={`sheet-col-${preview.label}-${index}`} className="chat-sheetPreview__colHeader">
            {spreadsheetColumnLabel(index)}
          </div>
        ))}
        {preview.rows.map((row, rowIndex) => (
          <Fragment key={`sheet-row-${preview.label}-${rowIndex}`}>
            <div className="chat-sheetPreview__rowHeader">{rowIndex + 1}</div>
            {Array.from({ length: preview.columnCount }, (_, colIndex) => {
              const cellValue = row[colIndex] ?? "";
              return (
                <div
                  key={`sheet-cell-${preview.label}-${rowIndex}-${colIndex}`}
                  className={`chat-sheetPreview__cell ${
                    rowIndex === 0 ? "chat-sheetPreview__cell--headerRow" : ""
                  } ${!cellValue ? "is-empty" : ""} ${
                    preview.fallback && rowIndex === 0 && colIndex === 0 ? "chat-sheetPreview__cell--note" : ""
                  }`}
                >
                  {cellValue}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function TextDocumentPreview({
  attachmentUrl,
  attachmentName,
  attachmentMime,
}: {
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
}) {
  const fallbackPreview = useMemo(
    () => buildTextDocumentFallbackPreview(attachmentName, ""),
    [attachmentName]
  );
  const [preview, setPreview] = useState<TextDocumentPreviewData>(fallbackPreview);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const nextFallback = buildTextDocumentFallbackPreview(attachmentName, "");
    setPreview(nextFallback);
    setLoading(true);

    void loadTextDocumentPreview(attachmentUrl, attachmentName, attachmentMime).then((data) => {
      if (cancelled) return;
      setPreview(data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [attachmentMime, attachmentName, attachmentUrl]);

  return (
    <div
      className={`chat-textDocPreview ${loading ? "is-loading" : ""} ${preview.fallback ? "is-fallback" : ""}`}
    >
      <div className="chat-textDocPreview__page">
        <div className="chat-textDocPreview__body">
          {preview.paragraphs.map((paragraph, index) => (
            <div
              key={`text-doc-${preview.label}-${index}`}
              className={`chat-textDocPreview__line ${index === 0 ? "chat-textDocPreview__line--lead" : ""}`}
            >
              {paragraph}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PresentationPreview({
  attachmentUrl,
  attachmentName,
  attachmentMime,
}: {
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
}) {
  const fallbackPreview = useMemo(
    () => buildPresentationFallbackPreview(attachmentName, ""),
    [attachmentName]
  );
  const [preview, setPreview] = useState<PresentationPreviewData>(fallbackPreview);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const nextFallback = buildPresentationFallbackPreview(attachmentName, "");
    setPreview(nextFallback);
    setLoading(true);

    void loadPresentationPreview(attachmentUrl, attachmentName, attachmentMime).then((data) => {
      if (cancelled) return;
      setPreview(data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [attachmentMime, attachmentName, attachmentUrl]);

  return (
    <div
      className={`chat-presentationPreview ${loading ? "is-loading" : ""} ${preview.fallback ? "is-fallback" : ""}`}
    >
      <div className="chat-presentationPreview__slide">
        <div className="chat-presentationPreview__accent" aria-hidden="true" />
        <div className="chat-presentationPreview__title">{preview.title}</div>
        <div className="chat-presentationPreview__body">
          {preview.bullets.map((bullet, index) => (
            <div key={`presentation-${preview.label}-${index}`} className="chat-presentationPreview__bullet">
              {bullet}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatAudioClock(seconds?: number | null) {
  const safe = Math.max(0, Number(seconds ?? 0));
  if (!Number.isFinite(safe)) return "0:00";
  const rounded = Math.floor(safe);
  const minutes = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function normalizeAudioPlaybackRate(value?: number | string | null) {
  const numeric = Number(value ?? 1);
  return AUDIO_PLAYBACK_RATES.find((rate) => Math.abs(rate - numeric) < 0.001) ?? 1;
}

function safeTimestamp(value?: string | number | Date | null) {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function readStoredConversationReadMarkers() {
  if (typeof window === "undefined") return {} as Record<string, string>;
  try {
    const raw = window.localStorage.getItem(CONVERSATION_READ_MARKERS_STORAGE_KEY);
    if (!raw) return {} as Record<string, string>;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {} as Record<string, string>;
    const next: Record<string, string> = {};
    for (const [conversationId, value] of Object.entries(parsed)) {
      if (typeof value !== "string") continue;
      if (!safeTimestamp(value)) continue;
      next[conversationId] = value;
    }
    return next;
  } catch {
    return {} as Record<string, string>;
  }
}

function persistConversationReadMarkers(markers: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONVERSATION_READ_MARKERS_STORAGE_KEY, JSON.stringify(markers));
  } catch {}
}

function conversationLatestActivityTimestamp(
  conversation?: ConversationListItem | null,
  items?: Message[] | null
) {
  const messageTimestamp = items?.length ? safeTimestamp(items[items.length - 1]?.createdAt) : 0;
  return Math.max(
    messageTimestamp,
    safeTimestamp(conversation?.lastMessage?.createdAt),
    safeTimestamp(conversation?.updatedAt),
    safeTimestamp(conversation?.createdAt)
  );
}

function applyLocalReadMarkersToConversations(
  items: ConversationListItem[],
  markers: Record<string, string>
) {
  return items.map((item) => {
    const unreadCount = Math.max(0, Number(item.unreadCount ?? 0));
    if (!unreadCount) return item;
    const localReadAt = safeTimestamp(markers[item.id]);
    if (!localReadAt) return item;
    const latestActivityAt = conversationLatestActivityTimestamp(item);
    if (!latestActivityAt || localReadAt < latestActivityAt) return item;
    return { ...item, unreadCount: 0 };
  });
}

function formatAudioPlaybackRate(rate: (typeof AUDIO_PLAYBACK_RATES)[number]) {
  return `${rate.toFixed(1)}x`;
}

function readStoredAudioPlaybackRate() {
  if (typeof window === "undefined") return 1 as (typeof AUDIO_PLAYBACK_RATES)[number];
  try {
    return normalizeAudioPlaybackRate(window.localStorage.getItem(AUDIO_PLAYBACK_RATE_STORAGE_KEY));
  } catch {
    return 1 as (typeof AUDIO_PLAYBACK_RATES)[number];
  }
}

function persistAudioPlaybackRate(rate: (typeof AUDIO_PLAYBACK_RATES)[number]) {
  const normalized = normalizeAudioPlaybackRate(rate);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(AUDIO_PLAYBACK_RATE_STORAGE_KEY, String(normalized));
    } catch {}
    window.dispatchEvent(
      new CustomEvent(AUDIO_PLAYBACK_RATE_EVENT, {
        detail: normalized,
      })
    );
  }
  return normalized;
}

function rememberOptimisticAudioMessageId(messageId?: string | null) {
  const normalized = String(messageId ?? "").trim();
  if (!normalized) return;
  optimisticAudioMessageIds.add(normalized);
  if (optimisticAudioMessageIds.size <= 200) return;
  const oldest = optimisticAudioMessageIds.values().next().value;
  if (oldest) optimisticAudioMessageIds.delete(oldest);
}

function AudioMessagePlayer({
  attachmentUrl,
  attachmentName,
  createdAt,
  showMeta = true,
}: {
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  createdAt?: string | null;
  showMeta?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<(typeof AUDIO_PLAYBACK_RATES)[number]>(() =>
    readStoredAudioPlaybackRate()
  );
  const [hasStartedPlayback, setHasStartedPlayback] = useState(playbackRate !== 1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncState = () => {
      setCurrentTime(audio.currentTime || 0);
      setDuration(audio.duration || 0);
      if ((audio.currentTime || 0) > 0) setHasStartedPlayback(true);
    };
    const handlePlay = () => {
      setIsPlaying(true);
      setHasStartedPlayback(true);
    };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
    };

    audio.addEventListener("loadedmetadata", syncState);
    audio.addEventListener("durationchange", syncState);
    audio.addEventListener("timeupdate", syncState);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    syncState();

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", syncState);
      audio.removeEventListener("durationchange", syncState);
      audio.removeEventListener("timeupdate", syncState);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [attachmentUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncStoredRate = (event?: Event) => {
      const nextRate =
        event && "detail" in event
          ? normalizeAudioPlaybackRate((event as CustomEvent<number>).detail)
          : readStoredAudioPlaybackRate();
      setPlaybackRate(nextRate);
    };

    window.addEventListener(AUDIO_PLAYBACK_RATE_EVENT, syncStoredRate as EventListener);
    window.addEventListener("storage", syncStoredRate);
    return () => {
      window.removeEventListener(AUDIO_PLAYBACK_RATE_EVENT, syncStoredRate as EventListener);
      window.removeEventListener("storage", syncStoredRate);
    };
  }, []);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const displayName = normalizeAttachmentDisplayName(attachmentName) || "Áudio";
  const displayedTime =
    currentTime > 0 && (!duration || currentTime < duration) ? currentTime : duration || currentTime;
  const showRateTag = hasStartedPlayback || playbackRate !== 1;
  const thumbLeft =
    progress <= 0 ? "0px" : progress >= 100 ? "calc(100% - 14px)" : `calc(${progress}% - 7px)`;

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      setHasStartedPlayback(true);
      try {
        await audio.play();
      } catch {}
      return;
    }

    audio.pause();
  }

  function seekAudio(event: ReactMouseEvent<HTMLButtonElement>) {
    const audio = audioRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!audio || !rect.width || !duration) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  }

  function cyclePlaybackRate() {
    setPlaybackRate((current) => {
      const currentIndex = AUDIO_PLAYBACK_RATES.indexOf(current);
      const nextRate = AUDIO_PLAYBACK_RATES[(currentIndex + 1) % AUDIO_PLAYBACK_RATES.length] ?? 1;
      if (audioRef.current) audioRef.current.playbackRate = nextRate;
      return persistAudioPlaybackRate(nextRate);
    });
  }

  return (
    <div className="chat-audioCard" title={displayName}>
      <audio ref={audioRef} src={toAbsoluteUrl(attachmentUrl) ?? ""} preload="metadata" />
      {showRateTag ? (
        <button
          type="button"
          className="chat-audioCard__rate"
          onClick={cyclePlaybackRate}
          aria-label={`Velocidade atual ${formatAudioPlaybackRate(playbackRate)}`}
          title="Alterar velocidade"
        >
          {formatAudioPlaybackRate(playbackRate)}
        </button>
      ) : (
        <span className="chat-audioCard__marker" aria-hidden="true">
          <HeadphonesIcon />
        </span>
      )}

      <button
        type="button"
        className="chat-audioCard__play"
        onClick={() => void togglePlayback()}
        aria-label={isPlaying ? "Pausar áudio" : "Reproduzir áudio"}
        title={isPlaying ? "Pausar áudio" : "Reproduzir áudio"}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="chat-audioCard__main">
        <button
          type="button"
          className="chat-audioCard__track"
          onClick={seekAudio}
          title="Ir para este ponto"
          aria-label="Linha do tempo do áudio"
        >
          <span className="chat-audioCard__trackBase" aria-hidden="true" />
          <span className="chat-audioCard__trackFill" style={{ width: `${progress}%` }} aria-hidden="true" />
          <span className="chat-audioCard__trackThumb" style={{ left: thumbLeft }} aria-hidden="true" />
        </button>

        <div className="chat-audioCard__footer">
          <span className="chat-audioCard__duration">{formatAudioClock(displayedTime)}</span>
          {showMeta && createdAt ? <span className="chat-audioCard__time">{fmtTime(createdAt)}</span> : null}
        </div>
      </div>
    </div>
  );
}

function mediaLabel(message: Partial<Message>) {
  if (isAudioMessageAttachment(message)) return "Áudio";
  if (isVideoAttachment(message)) return "Vídeo";
  if (isImageAttachment(message)) return "Imagem";
  if (message.contentType === "FILE") return normalizeAttachmentDisplayName(message.attachmentName) || "Arquivo";
  return "Mensagem";
}

function AttachmentKindIcon({ message }: { message: Partial<Message> }) {
  if (isAudioMessageAttachment(message) || isAudioDocumentAttachment(message)) return <HeadphonesIcon />;
  return <FileIcon />;
}

function attachmentTypeLabel(message: Partial<Message>) {
  const name = normalizeAttachmentDisplayName(message.attachmentName);
  const ext = name.includes(".") ? name.split(".").pop()?.trim().toUpperCase() ?? "" : "";
  if (ext && ext.length <= 6) return ext;

  const mime = String(message.attachmentMime ?? "").toLowerCase().trim();
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return mime.slice("image/".length).toUpperCase();
  if (mime.startsWith("video/")) return mime.slice("video/".length).toUpperCase();

  return "ARQ";
}

const REMOVED_ATTACHMENT_NOTICE_GENERIC =
  "Esta imagem ou documento foi apagado pelo administrador segundo a política de backup de arquivos.";
const REMOVED_ATTACHMENT_NOTICE_IMAGE =
  "Essa imagem foi apagada pelo administrador segundo a política de backup de arquivos.";
const REMOVED_ATTACHMENT_NOTICE_FILE =
  "Esse documento foi apagado pelo administrador segundo a política de backup de arquivos.";

function stripAttachmentRemovalNotice(value?: string | null) {
  let text = String(value ?? "");
  text = text.replace(REMOVED_ATTACHMENT_NOTICE_IMAGE, "");
  text = text.replace(REMOVED_ATTACHMENT_NOTICE_FILE, "");
  text = text.replace(REMOVED_ATTACHMENT_NOTICE_GENERIC, "");
  return text.trim();
}

function isRemovedAttachmentNoticeMessage(message: Partial<Message>) {
  if (!message.deletedAt) return false;
  const text = String(message.body ?? "");
  return (
    text.includes(REMOVED_ATTACHMENT_NOTICE_IMAGE) ||
    text.includes(REMOVED_ATTACHMENT_NOTICE_FILE) ||
    text.includes(REMOVED_ATTACHMENT_NOTICE_GENERIC)
  );
}

function toAbsoluteUrl(url?: string | null) {
  if (!url) return null;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
}

function conversationRankTimestamp(conv: ConversationListItem) {
  const raw = conv.sortAt ?? conv.updatedAt ?? conv.lastMessage?.createdAt ?? conv.createdAt;
  if (!raw) return 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function preservedConversationSortAt(conv?: ConversationListItem | null) {
  return conv?.sortAt ?? conv?.updatedAt ?? conv?.lastMessage?.createdAt ?? conv?.createdAt ?? undefined;
}

function nextConversationSortAt(
  conv: ConversationListItem,
  msg: Message,
  meId?: string | null
) {
  const isMyBroadcastDirectCopy =
    conv.kind === "DIRECT" && !!msg.broadcastSource && !!meId && msg.senderId === meId;
  if (isMyBroadcastDirectCopy) {
    return conv.sortAt ?? conv.updatedAt ?? conv.createdAt;
  }
  return msg.createdAt;
}

function sortConversationItems(items: ConversationListItem[]) {
  return [...items].sort((a, b) => {
    const pinDiff = Number(!!b.pinned) - Number(!!a.pinned);
    if (pinDiff !== 0) return pinDiff;
    return conversationRankTimestamp(b) - conversationRankTimestamp(a);
  });
}

function upsertConversationItem(
  items: ConversationListItem[],
  conversation: ConversationListItem
) {
  const next = items.some((item) => item.id === conversation.id)
    ? items.map((item) => (item.id === conversation.id ? { ...item, ...conversation } : item))
    : [conversation, ...items];
  return sortConversationItems(next);
}

function conversationKind(conv?: ConversationListItem | null): ConversationKind {
  const kind = conv?.kind;
  return kind === "GROUP" || kind === "BROADCAST" ? kind : "DIRECT";
}

function conversationParticipants(conv?: ConversationListItem | null) {
  return Array.isArray(conv?.participants) ? conv?.participants ?? [] : [];
}

function conversationGroupAdmins(conv?: ConversationListItem | null) {
  if (Array.isArray(conv?.groupAdmins) && conv.groupAdmins.length) {
    return conv.groupAdmins;
  }
  return conversationParticipants(conv).filter((user) => !!user.isGroupAdmin);
}

function conversationBroadcastTargets(conv?: ConversationListItem | null) {
  return Array.isArray(conv?.broadcastTargets) ? conv?.broadcastTargets ?? [] : [];
}

function conversationDisplayName(conv?: ConversationListItem | null) {
  if (!conv) return "Conversa";
  if (conversationKind(conv) === "DIRECT") {
    return conv.otherUser?.name ?? conv.title?.trim() ?? "Conversa";
  }
  return conv.title?.trim() || conv.rawTitle?.trim() || "Conversa";
}

function conversationAvatarUrl(conv?: ConversationListItem | null) {
  if (!conv) return null;
  return conversationKind(conv) === "DIRECT" ? conv.otherUser?.avatarUrl ?? null : conv.avatarUrl ?? null;
}

function conversationAvatarFallback(conv?: ConversationListItem | null) {
  const title = conversationDisplayName(conv).trim();
  return title ? title.slice(0, 1).toUpperCase() : "C";
}

function conversationSummaryLine(conv?: ConversationListItem | null) {
  if (!conv) return "";

  if (conversationKind(conv) === "DIRECT") {
    const department = conv.otherUser?.department?.name ?? "Sem setor";
    const company = conv.otherUser?.company?.name;
    return company ? `${department} • ${company}` : department;
  }

  if (conversationKind(conv) === "GROUP") {
    const count = Math.max(
      Number(conv.participantCount ?? 0),
      conversationParticipants(conv).length,
    );
    if (conv.isCurrentParticipant === false) {
      if (conv.leftReason === "GROUP_DELETED") return "Grupo excluído";
      if (count <= 0) {
        if (conv.leftReason === "REMOVED") return "Você foi removido";
        return "Você saiu";
      }
      const countLabel = count === 1 ? "1 participante" : `${count} participantes`;
      if (conv.leftReason === "REMOVED") return `Você foi removido • ${countLabel}`;
      return `Você saiu • ${countLabel}`;
    }
    if (count <= 0) return "Grupo encerrado";
    const countLabel = count === 1 ? "1 participante" : `${count} participantes`;
    return countLabel;
  }

  if (conv.isCurrentParticipant === false) {
    if (conv.leftReason === "GROUP_DELETED") return "Lista excluída";
    return "Lista inativa";
  }

  const count = Math.max(
    Number(conv.targetCount ?? 0),
    conversationBroadcastTargets(conv).length,
  );
  return count === 1 ? "1 contato" : `${count} contatos`;
}

function inactiveGroupNotice(conv?: ConversationListItem | null) {
  if (!conv || conv.isCurrentParticipant !== false) return null;
  if (conversationKind(conv) === "BROADCAST") {
    return "Esta lista foi excluída. O histórico continua visível, mas não é mais possível enviar novas mensagens.";
  }
  if (conversationKind(conv) !== "GROUP") return null;
  if (conv.leftReason === "GROUP_DELETED") {
    return "Este grupo foi excluído. O histórico continua visível, mas novas mensagens não existem mais.";
  }
  if (conv.leftReason === "REMOVED") {
    return "Você foi removido deste grupo. O histórico continua visível, mas você não pode enviar nem receber novas mensagens.";
  }
  return "Você saiu deste grupo. O histórico continua visível, mas você não pode enviar nem receber novas mensagens.";
}

function canManageGroupConversation(conv?: ConversationListItem | null, meId?: string | null) {
  if (!conv || conversationKind(conv) !== "GROUP" || conv.isCurrentParticipant === false || !meId) return false;
  if (typeof conv.isGroupAdmin === "boolean") return conv.isGroupAdmin;
  return conversationGroupAdmins(conv).some((user) => user.id === meId);
}

function canManageConversationAvatar(conv?: ConversationListItem | null, meId?: string | null) {
  if (!conv || conv.isCurrentParticipant === false || !meId) return false;
  if (conversationKind(conv) === "GROUP") {
    return canManageGroupConversation(conv, meId);
  }
  if (conversationKind(conv) === "BROADCAST") {
    return conv.createdById === meId;
  }
  return false;
}

function computeBroadcastEffectiveUsers(
  users: UserMini[],
  ownerId: string | null | undefined,
  explicitTargetIds: string[],
  automaticRules: AutomaticRuleItem[],
  excludedUserIds: string[],
  includeAllUsers: boolean
) {
  const out = new Map<string, UserMini>();
  const owner = String(ownerId ?? "").trim();
  const explicitSet = new Set(explicitTargetIds);
  const excludedSet = new Set(excludedUserIds);

  for (const user of users) {
    if (user.id === owner) continue;
    const matchesRule =
      includeAllUsers ||
      automaticRules.some((rule) => {
        const companyOk = !rule.companyId || user.company?.id === rule.companyId;
        const departmentOk = !rule.departmentId || user.department?.id === rule.departmentId;
        return companyOk && departmentOk;
      });
    if (explicitSet.has(user.id) || matchesRule) {
      out.set(user.id, user);
    }
  }

  for (const excludedId of excludedSet) {
    out.delete(excludedId);
  }

  return Array.from(out.values()).sort((a, b) => compareAlpha(a.name || a.username, b.name || b.username));
}

function automaticRuleKey(companyId?: string | null, departmentId?: string | null) {
  return `${String(companyId ?? "").trim() || "*"}::${String(departmentId ?? "").trim() || "*"}`;
}

function dedupeAutomaticRules(rules: AutomaticRuleItem[]) {
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = automaticRuleKey(rule.companyId ?? null, rule.departmentId ?? null);
    if ((!rule.companyId && !rule.departmentId) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function computeAutomaticRuleUsers(
  users: UserMini[],
  ownerId: string | null | undefined,
  rules: AutomaticRuleItem[],
  includeAllUsers: boolean
) {
  const owner = String(ownerId ?? "").trim();
  return users
    .filter((user) => {
      if (user.id === owner) return false;
      if (includeAllUsers) return true;
      return rules.some((rule) => {
        const companyOk = !rule.companyId || user.company?.id === rule.companyId;
        const departmentOk = !rule.departmentId || user.department?.id === rule.departmentId;
        return companyOk && departmentOk;
      });
    })
    .sort((a, b) => compareAlpha(a.name || a.username, b.name || b.username));
}

function buildConversationDetailsFallback(conversation: ConversationListItem, users: UserMini[]) {
  const participants = conversationParticipants(conversation);
  const base: ConversationListItem = {
    ...conversation,
    participants,
    automaticRules: conversation.automaticRules ?? [],
    participantCount: Math.max(Number(conversation.participantCount ?? 0), participants.length),
  };

  if (conversationKind(conversation) !== "BROADCAST") {
    return base;
  }

  const explicitTargets = conversationBroadcastTargets(conversation);
  const effectiveTargets =
    conversation.effectiveBroadcastTargets && conversation.effectiveBroadcastTargets.length
      ? conversation.effectiveBroadcastTargets
      : computeBroadcastEffectiveUsers(
          users,
          conversation.createdById,
          explicitTargets.map((user) => user.id),
          conversation.automaticRules ?? [],
          (conversation.broadcastExcludedUsers ?? []).map((user) => user.id),
          !!conversation.broadcastIncludeAllUsers
        );
  const effectiveTargetIds = new Set(effectiveTargets.map((user) => user.id));
  const ownerId = conversation.createdById ?? null;
  const availableUsers = users
    .filter((user) => user.id !== ownerId && !effectiveTargetIds.has(user.id))
    .sort((a, b) => compareAlpha(a.name || a.username, b.name || b.username));

  return {
    ...base,
    broadcastTargets: explicitTargets,
    targetCount: Math.max(Number(conversation.targetCount ?? 0), explicitTargets.length),
    broadcastIncludeAllUsers: !!conversation.broadcastIncludeAllUsers,
    broadcastTargetCompanies: conversation.broadcastTargetCompanies ?? [],
    broadcastTargetDepartments: conversation.broadcastTargetDepartments ?? [],
    broadcastExcludedUsers: conversation.broadcastExcludedUsers ?? [],
    effectiveBroadcastTargets: effectiveTargets,
    availableBroadcastUsers: conversation.availableBroadcastUsers ?? availableUsers,
  };
}

function conversationPreviewText(conv: ConversationListItem, meId?: string | null) {
  const lastMessage = conv.lastMessage;
  if (lastMessage?.body?.trim()) {
    const prefix =
      conversationKind(conv) === "GROUP" && lastMessage.senderId !== meId
        ? `${lastMessage.sender?.name ?? "Contato"}: `
        : "";
    return `${prefix}${lastMessage.body.trim()}`;
  }

  if (isAudioMessageAttachment(lastMessage ?? {})) {
    return conversationKind(conv) === "GROUP" && lastMessage?.senderId !== meId
      ? `${lastMessage?.sender?.name ?? "Contato"}: Áudio`
      : "Áudio";
  }

  if (isMediaAttachment(lastMessage ?? {})) {
    const label = mediaLabel(lastMessage ?? {});
    return conversationKind(conv) === "GROUP" && lastMessage?.senderId !== meId
      ? `${lastMessage?.sender?.name ?? "Contato"}: ${label}`
      : label;
  }

  if (lastMessage?.contentType === "FILE" || lastMessage?.contentType === "AUDIO") {
    const label = normalizeAttachmentDisplayName(lastMessage?.attachmentName) || "Arquivo";
    return conversationKind(conv) === "GROUP" && lastMessage?.senderId !== meId
      ? `${lastMessage?.sender?.name ?? "Contato"}: ${label}`
      : label;
  }

  return conversationSummaryLine(conv);
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
  if (isAudioMessageAttachment(msg)) return "Áudio";
  if (isMediaAttachment(msg)) return isVideoAttachment(msg) ? "Vídeo" : "Imagem";
  if (msg.contentType === "FILE") return normalizeAttachmentDisplayName(msg.attachmentName) || "Arquivo";
  return "Mensagem";
}

function messageSearchableText(msg: Partial<Message>) {
  return [
    msg.body ?? "",
    normalizeAttachmentDisplayName(msg.attachmentName),
    isAudioMessageAttachment(msg) ? "audio áudio" : "",
    isVideoAttachment(msg) ? "video" : isImageAttachment(msg) ? "imagem" : "",
  ]
    .join(" ")
    .trim();
}

function messageNotificationPreview(msg: Message) {
  const body = msg.body?.trim();
  if (body) return body.length > 120 ? `${body.slice(0, 117)}...` : body;
  if (isAudioMessageAttachment(msg)) return "Áudio";
  if (isMediaAttachment(msg)) return isVideoAttachment(msg) ? "Vídeo" : "Imagem";
  const attachmentName = normalizeAttachmentDisplayName(msg.attachmentName);
  if (msg.contentType === "FILE") return attachmentName ? `Arquivo: ${attachmentName}` : "Arquivo";
  return "Nova mensagem";
}

function pickerRequestErrorMessage(error: any, fallback: string) {
  const status = Number(error?.response?.status ?? 0);
  const apiMessage = error?.response?.data?.message;

  if (status === 404) {
    return "O backend do chat ainda nao foi atualizado/reiniciado para grupos e listas.";
  }

  if (typeof apiMessage === "string" && apiMessage.trim()) {
    return apiMessage.trim();
  }

  return fallback;
}

function isAuthRequestError(error: any) {
  const status = Number(error?.response?.status ?? 0);
  return status === 401 || status === 403;
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

function UserAddIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M2 21a8 8 0 0 1 13.292-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="8" r="5" stroke="currentColor" strokeWidth="2" />
      <path d="M19 16v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 19h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckSquareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 12.2l2.4 2.4 4.8-5.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function InfoBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 10.2v5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="7.2" r="1.2" fill="currentColor" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M8.2 12.3 10.8 15l5.2-5.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.2" opacity="0.22" />
      <path
        d="M12 4a8 8 0 0 1 8 8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M12 3.8 21 19.2c.45.78-.1 1.8-1 1.8H4c-.9 0-1.45-1.02-1-1.8L12 3.8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 9.2v4.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17.1" r="1.1" fill="currentColor" />
    </svg>
  );
}

function PickerGuideIcon({ tone }: { tone: PickerGuideTone }) {
  if (tone === "success") return <CheckCircleIcon />;
  if (tone === "warning" || tone === "danger") return <WarningIcon />;
  return <InfoBadgeIcon />;
}

function ComposeConversationIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M12 8v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 11h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

function ChatMediaAttachmentButton({
  message,
  attachmentUrl,
  onOpen,
  timeLabel,
}: {
  message: Message;
  attachmentUrl: string;
  onOpen: () => void;
  timeLabel: string;
}) {
  const isVideo = isVideoAttachment(message);
  const [layout, setLayout] = useState<MediaPreviewLayout>(() => mediaPreviewLayoutCache.get(attachmentUrl) ?? "square");

  useEffect(() => {
    let cancelled = false;
    void loadMediaPreviewLayout(attachmentUrl, isVideo).then((nextLayout) => {
      if (!cancelled) setLayout(nextLayout);
    });
    return () => {
      cancelled = true;
    };
  }, [attachmentUrl, isVideo]);

  return (
    <button
      type="button"
      className={`chat-imageLink chat-imageLink--btn chat-imageLink--btn--${layout}`}
      onClick={onOpen}
      title={isVideo ? "Abrir mídia" : "Abrir imagem"}
    >
      <div className={`chat-mediaVisualFrame chat-mediaVisualFrame--${layout}`}>
        {isVideo ? (
          <div className={`chat-videoPreview chat-videoPreview--${layout}`}>
            <video
              src={attachmentUrl}
              className="chat-imagePreview chat-imagePreview--framed"
              preload="metadata"
              muted
              playsInline
            />
            <span className="chat-videoPreview__play" aria-hidden="true">
              <PlayOverlayIcon />
            </span>
          </div>
        ) : (
          <img
            src={attachmentUrl}
            alt={normalizeAttachmentDisplayName(message.attachmentName) || "imagem"}
            className="chat-imagePreview chat-imagePreview--framed"
            loading="lazy"
            decoding="async"
          />
        )}
        <div className="chat-mediaVisualFrame__meta">
          <span>{timeLabel}</span>
        </div>
      </div>
    </button>
  );
}

function HeadphonesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M21 16v2a4 4 0 0 1-4 4h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M8.2 6.7a1 1 0 0 1 1.53-.84l8.18 5.3a1 1 0 0 1 0 1.68l-8.18 5.3A1 1 0 0 1 8.2 17.3V6.7Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <rect x="7" y="6" width="3.5" height="12" rx="1.2" />
      <rect x="13.5" y="6" width="3.5" height="12" rx="1.2" />
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
      <path d="M10 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClearConversationIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="m16 22-1-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m8 22 1-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function EditAvatarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M12 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m14 6 4 4m-9.5 7.5 3.2-.8L20 8.4a1.4 1.4 0 0 0 0-2l-1.4-1.4a1.4 1.4 0 0 0-2 0l-8.3 8.3-.8 3.2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function LogOutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="m16 17 5-5-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M12 4v10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="m8 11 4 4 4-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function PlayOverlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path d="M9 7.5v9l7-4.5-7-4.5Z" fill="currentColor" />
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
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
        <path
          d="M9.4 4.2c0-.66.54-1.2 1.2-1.2h2.8c.66 0 1.2.54 1.2 1.2v3.72c0 .48.19.94.53 1.28l2.04 2.04c.5.5.14 1.36-.57 1.36H13v7.15c0 .55-.45 1-1 1s-1-.45-1-1V12.6H7.43c-.71 0-1.07-.86-.57-1.36l2.04-2.04c.34-.34.53-.8.53-1.28V4.2Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
      <path
        d="M9.5 4.5c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v3.63c0 .53.21 1.04.59 1.41l1.46 1.46H7.95l1.46-1.46A2 2 0 0 0 10 8.13V4.5Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path d="M12 11v8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

type EditableAvatarProps = {
  imageUrl?: string | null;
  fallback: string;
  alt: string;
  className?: string;
  onError?: () => void;
  onEdit?: () => void;
  onRemove?: (() => void) | null;
  busyLabel?: string | null;
};

function EditableAvatar({
  imageUrl,
  fallback,
  alt,
  className,
  onError,
  onEdit,
  onRemove,
  busyLabel,
}: EditableAvatarProps) {
  const editable = !!onEdit;
  const removable = !!imageUrl && !!onRemove;

  return (
    <div
      className={`${className ?? ""} ${editable ? "chat-avatarEditor" : ""} ${busyLabel ? "is-busy" : ""}`.trim()}
      tabIndex={editable ? 0 : undefined}
      role={editable ? "group" : undefined}
      aria-label={editable ? (removable ? "Ações da foto" : imageUrl ? "Alterar foto" : "Enviar foto") : alt}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={alt} onError={onError} />
      ) : (
        <span>{fallback}</span>
      )}

      {editable ? (
        <div className={`chat-avatarEditor__overlay ${removable ? "" : "is-single"}`.trim()}>
          <button
            type="button"
            className="chat-avatarEditor__action chat-avatarEditor__action--edit"
            onClick={(event) => {
              event.stopPropagation();
              onEdit?.();
            }}
            disabled={!!busyLabel}
            aria-label={imageUrl ? "Alterar foto" : "Enviar foto"}
          >
            <EditAvatarIcon />
          </button>
          {removable ? (
            <button
              type="button"
              className="chat-avatarEditor__action chat-avatarEditor__action--remove"
              onClick={(event) => {
                event.stopPropagation();
                onRemove?.();
              }}
              disabled={!!busyLabel}
              aria-label="Remover foto"
            >
              <TrashIcon />
            </button>
          ) : null}
        </div>
      ) : null}

      {busyLabel ? (
        <div className="chat-avatarEditor__busy" aria-live="polite">
          <span>{busyLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

export function ChatPage() {
  const { logoff, logout, api, token } = useAuth();
  const { theme, toggleTheme, resolvedLogoUrl } = useTheme();

  const [me, setMe] = useState<Me | null>(null);

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);

  const [activeConv, setActiveConv] = useState<ConversationListItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesNextCursor, setMessagesNextCursor] = useState<string | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingOlderMsgs, setLoadingOlderMsgs] = useState(false);
  const [messagesErr, setMessagesErr] = useState<string | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [text, setText] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<CreatePickerMode>("direct");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerSubmitting, setPickerSubmitting] = useState(false);
  const [pickerTitle, setPickerTitle] = useState("");
  const [pickerSelectedUserIds, setPickerSelectedUserIds] = useState<string[]>([]);
  const [pickerIncludeAllUsers, setPickerIncludeAllUsers] = useState(false);
  const [pickerAutomaticRules, setPickerAutomaticRules] = useState<AutomaticRuleItem[]>([]);
  const [pickerRuleManagerOpen, setPickerRuleManagerOpen] = useState(false);
  const [pickerConversationId, setPickerConversationId] = useState<string | null>(null);
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
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);

  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentMode, setAttachmentMode] = useState<"image" | "file" | "audio" | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);

  const [actionMenuMsgId, setActionMenuMsgId] = useState<string | null>(null);
  const [actionMenuAlign, setActionMenuAlign] = useState<"left" | "right">("right");
  const [actionMenuPosition, setActionMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [conversationMenuId, setConversationMenuId] = useState<string | null>(null);
  const [conversationMenuPosition, setConversationMenuPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const [groupMemberMenuUserId, setGroupMemberMenuUserId] = useState<string | null>(null);
  const [groupMemberMenuPosition, setGroupMemberMenuPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const [pickerGuideOpen, setPickerGuideOpen] = useState(false);
  const [pickerGuidePosition, setPickerGuidePosition] = useState<{ top: number; left: number } | null>(null);
  const [conversationSelectMode, setConversationSelectMode] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<string[]>([]);
  const [removeChatsPrompt, setRemoveChatsPrompt] = useState<{ ids: string[]; totalCount: number } | null>(null);
  const [conversationClearPrompt, setConversationClearPrompt] = useState<ConversationClearPrompt | null>(null);
  const [pendingConversationHideBatch, setPendingConversationHideBatch] = useState<PendingConversationHideBatch | null>(null);
  const [pendingConversationClearBatch, setPendingConversationClearBatch] = useState<PendingConversationClearBatch | null>(null);
  const [pendingBroadcastDeleteBatch, setPendingBroadcastDeleteBatch] = useState<PendingBroadcastDeleteBatch | null>(null);
  const [pendingConversationCountdownMs, setPendingConversationCountdownMs] = useState(0);
  const [reactionBarMsgId, setReactionBarMsgId] = useState<string | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);

  const [multiDeleteMode, setMultiDeleteMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [favoriteDeletePrompt, setFavoriteDeletePrompt] = useState<FavoriteDeletePrompt | null>(null);
  const [pendingDeleteBatch, setPendingDeleteBatch] = useState<PendingMessageDeleteBatch | null>(null);
  const [pendingDeleteCountdownMs, setPendingDeleteCountdownMs] = useState(0);
  const [newMsgsCount, setNewMsgsCount] = useState(0);
  const [showJumpNew, setShowJumpNew] = useState(false);
  const [unreadAnchorMessageId, setUnreadAnchorMessageId] = useState<string | null>(null);
  const [showJumpUnread, setShowJumpUnread] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarRemoving, setAvatarRemoving] = useState(false);
  const [brokenAvatarUrls, setBrokenAvatarUrls] = useState<Set<string>>(new Set());
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const [removalNoticesLoading, setRemovalNoticesLoading] = useState(false);
  const [removalNoticesProgress, setRemovalNoticesProgress] = useState(0);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [profileMediaTab, setProfileMediaTab] = useState<"image" | "file">("image");
  const [profileMediaItems, setProfileMediaItems] = useState<MediaItem[]>([]);
  const [profileMediaLoading, setProfileMediaLoading] = useState(false);
  const [conversationDetailsOpen, setConversationDetailsOpen] = useState(false);
  const [conversationDetailsLoading, setConversationDetailsLoading] = useState(false);
  const [conversationDetailsError, setConversationDetailsError] = useState<string | null>(null);
  const [conversationDetails, setConversationDetails] = useState<ConversationListItem | null>(null);
  const [conversationDetailsSaving, setConversationDetailsSaving] = useState(false);
  const [conversationDetailsTitle, setConversationDetailsTitle] = useState("");
  const [conversationDetailsSelectedUserIds, setConversationDetailsSelectedUserIds] = useState<string[]>([]);
  const [conversationDetailsAutomaticRules, setConversationDetailsAutomaticRules] = useState<AutomaticRuleItem[]>([]);
  const [conversationDetailsExcludedUserIds, setConversationDetailsExcludedUserIds] = useState<string[]>([]);
  const [conversationDetailsIncludeAllUsers, setConversationDetailsIncludeAllUsers] = useState(false);
  const [conversationDetailsRuleManagerOpen, setConversationDetailsRuleManagerOpen] = useState(false);
  const [broadcastDetailsEditorOpen, setBroadcastDetailsEditorOpen] = useState(false);
  const [conversationDetailsLegacyMode, setConversationDetailsLegacyMode] = useState(false);
  const [conversationAvatarUploading, setConversationAvatarUploading] = useState(false);
  const [conversationAvatarRemoving, setConversationAvatarRemoving] = useState(false);
  const [conversationDetailsRemovingChat, setConversationDetailsRemovingChat] = useState(false);
  const [groupDetailsActionKey, setGroupDetailsActionKey] = useState<string | null>(null);
  const [myInfoOpen, setMyInfoOpen] = useState(false);

  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageViewerItems, setImageViewerItems] = useState<MediaItem[]>([]);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  const [mediaRetentionPolicy, setMediaRetentionPolicy] = useState<MediaRetentionPolicyResponse | null>(null);
  const [imageViewerZoom, setImageViewerZoom] = useState(1);
  const [imageViewerOffset, setImageViewerOffset] = useState({ x: 0, y: 0 });
  const [imageViewerDragging, setImageViewerDragging] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() => window.innerWidth <= 900);

  const socketRef = useRef<Socket | null>(null);
  const conversationsRef = useRef<ConversationListItem[]>([]);
  const conversationReadMarkersRef = useRef<Record<string, string>>(readStoredConversationReadMarkers());
  const convListRef = useRef<HTMLDivElement | null>(null);
  const convPositionsRef = useRef<Map<string, number>>(new Map());
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const msgListRef = useRef<HTMLDivElement | null>(null);
  const isMsgListNearBottomRef = useRef(true);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const myAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const conversationAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  const messagesNextCursorRef = useRef<string | null>(null);
  const loadingOlderMsgsRef = useRef(false);
  const meIdRef = useRef<string | null>(null);
  const handledRealtimeMessageIdsRef = useRef<Set<string>>(new Set());
  const notifiedMessageIdsRef = useRef<Set<string>>(new Set());
  const canConsumeUnreadAnchorRef = useRef(false);
  const hasSeenUnreadMarkerRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);
  const removalNoticesProgressTimerRef = useRef<number | null>(null);
  const removalNoticesFinishTimerRef = useRef<number | null>(null);
  const pendingDeleteFinalizeTimerRef = useRef<number | null>(null);
  const pendingDeleteCountdownTimerRef = useRef<number | null>(null);
  const pendingConversationFinalizeTimerRef = useRef<number | null>(null);
  const pendingConversationCountdownTimerRef = useRef<number | null>(null);
  const pickerGuideHideTimerRef = useRef<number | null>(null);
  const pickerAutoManagedUserIdsRef = useRef<Set<string>>(new Set());
  const imageViewerConvIdRef = useRef<string | null>(null);
  const imageViewerDragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const conversationMenuRef = useRef<HTMLDivElement | null>(null);
  const conversationMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const groupMemberMenuRef = useRef<HTMLDivElement | null>(null);
  const groupMemberMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pickerGuideTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pickerGuideTooltipRef = useRef<HTMLDivElement | null>(null);

  function rememberConversationRead(
    conversationId: string,
    readAt?: string | number | Date | null,
    conversation?: ConversationListItem | null,
    items?: Message[] | null
  ) {
    const normalizedConversationId = String(conversationId ?? "").trim();
    if (!normalizedConversationId) return;
    const candidateTimestamp = Math.max(
      safeTimestamp(readAt),
      conversationLatestActivityTimestamp(conversation, items)
    );
    if (!candidateTimestamp) return;
    const currentTimestamp = safeTimestamp(conversationReadMarkersRef.current[normalizedConversationId]);
    if (currentTimestamp >= candidateTimestamp) return;
    const next = {
      ...conversationReadMarkersRef.current,
      [normalizedConversationId]: new Date(candidateTimestamp).toISOString(),
    };
    conversationReadMarkersRef.current = next;
    persistConversationReadMarkers(next);
  }

  useEffect(() => {
    activeConvIdRef.current = activeConv?.id ?? null;
  }, [activeConv?.id]);

  useEffect(() => {
    setMultiDeleteMode(false);
    setSelectedMessageIds([]);
    setFavoriteDeletePrompt(null);
  }, [activeConv?.id]);

  useEffect(() => {
    messagesNextCursorRef.current = messagesNextCursor;
  }, [messagesNextCursor]);

  useEffect(() => {
    loadingOlderMsgsRef.current = loadingOlderMsgs;
  }, [loadingOlderMsgs]);

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
    if (!createMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (createMenuRef.current?.contains(target)) return;
      setCreateMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setCreateMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [createMenuOpen]);

  useEffect(() => {
    return () => {
      if (attachmentPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(attachmentPreviewUrl);
      }
    };
  }, [attachmentPreviewUrl]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (removalNoticesProgressTimerRef.current) {
        window.clearInterval(removalNoticesProgressTimerRef.current);
      }
      if (removalNoticesFinishTimerRef.current) {
        window.clearTimeout(removalNoticesFinishTimerRef.current);
      }
      if (pendingDeleteFinalizeTimerRef.current) {
        window.clearTimeout(pendingDeleteFinalizeTimerRef.current);
      }
      if (pendingDeleteCountdownTimerRef.current) {
        window.clearInterval(pendingDeleteCountdownTimerRef.current);
      }
      if (pendingConversationFinalizeTimerRef.current) {
        window.clearTimeout(pendingConversationFinalizeTimerRef.current);
      }
      if (pendingConversationCountdownTimerRef.current) {
        window.clearInterval(pendingConversationCountdownTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function closeMenus() {
      setActionMenuMsgId(null);
      setActionMenuPosition(null);
      setEmojiOpen(false);
      setAttachMenuOpen(false);
      setConversationMenuId(null);
      setConversationMenuPosition(null);
      conversationMenuTriggerRef.current = null;
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

  function flashMessageRow(row: HTMLElement) {
    row.classList.remove("chat-msg-flash");
    void row.offsetWidth;
    row.classList.add("chat-msg-flash");
    window.setTimeout(() => row.classList.remove("chat-msg-flash"), 1200);
  }

  function focusRenderedMessage(messageId: string) {
    const container = msgListRef.current;
    if (!container) return false;

    const row = container.querySelector(`[data-mid="${messageId}"]`) as HTMLElement | null;
    if (!row) return false;

    row.scrollIntoView({ behavior: "smooth", block: "center" });
    flashMessageRow(row);
    return true;
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
    const isBelow = anchorRect.top > listRect.bottom - 2;
    const isVisible = !isAbove && !isBelow;

    if (isVisible) {
      hasSeenUnreadMarkerRef.current = true;
      setShowJumpUnread(false);
      return;
    }

    if (isAbove) {
      if (canConsumeUnreadAnchorRef.current && hasSeenUnreadMarkerRef.current) {
        hasSeenUnreadMarkerRef.current = false;
        canConsumeUnreadAnchorRef.current = false;
        setUnreadAnchorMessageId(null);
        setShowJumpUnread(false);
        return;
      }

      setShowJumpUnread(true);
      return;
    }

    setShowJumpUnread(false);
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
    setSendErr(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (audioInputRef.current) audioInputRef.current.value = "";
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

    const conv = conversationsRef.current.find((item) => item.id === msg.conversationId) ?? null;
    const title =
      conversationKind(conv) === "GROUP"
        ? `${msg.sender?.name ?? "Nova mensagem"} • ${conversationDisplayName(conv)}`
        : conversationDisplayName(conv) || msg.sender?.name || "Nova mensagem";
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
          sortAt: nextConversationSortAt(conv, msg, meIdRef.current),
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
      if (!isMine) {
        rememberConversationRead(msg.conversationId, msg.createdAt);
        void markConversationRead(msg.conversationId, msg.createdAt);
      }
    }

    if (!hadConversation) {
        void loadConversations(currentConvId ?? undefined, { silent: true }).catch(() => {});
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

  function normalizeMediaItems(items: MediaItem[]) {
    return [...items]
      .filter((item) => isMediaAttachment(item) && !!item.attachmentUrl)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async function loadConversationImagesForViewer(conversationId: string) {
    if (!conversationId) return [];
    const res = await api.get<MediaResponse>(`/conversations/${conversationId}/media`, {
      params: { kind: "image" },
    });
    return normalizeMediaItems(res.data.items ?? []);
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

    const fromCurrentMessages = normalizeMediaItems(messages);
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

  function openActionMenu(e: ReactMouseEvent, messageId: string, isMine: boolean) {
    e.stopPropagation();
    setConversationMenuId(null);
    setReactionBarMsgId(null);
    setReactionPickerMsgId(null);
    setActionMenuAlign(isMine ? "right" : "left");
    setActionMenuPosition(null);
    setActionMenuMsgId((prev) => {
      const next = prev === messageId ? null : messageId;
      if (!next) {
        setActionMenuPosition(null);
      }
      return next;
    });
  }

  function showToast(message: string, durationMs = 1800, tone: ToastTone = "default") {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastState({ message, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToastState(null);
      toastTimerRef.current = null;
    }, durationMs);
  }

  function showSuccessToast(message: string, durationMs = 1800) {
    showToast(message, durationMs, "success");
  }

  function pendingMessageDeleteLabel(count: number) {
    return count === 1 ? "Apagando mensagem" : "Apagando mensagens";
  }

  function pendingConversationHideLabel(count: number) {
    return count === 1 ? "Removendo chat" : "Removendo chats";
  }

  function successMessageDeleteLabel(count: number) {
    return count === 1 ? "Mensagem apagada" : "Mensagens apagadas";
  }

  function successConversationHideLabel(count: number) {
    return count === 1 ? "Chat removido" : "Chats removidos";
  }

  function clearPendingDeleteTimers() {
    if (pendingDeleteFinalizeTimerRef.current) {
      window.clearTimeout(pendingDeleteFinalizeTimerRef.current);
      pendingDeleteFinalizeTimerRef.current = null;
    }
    if (pendingDeleteCountdownTimerRef.current) {
      window.clearInterval(pendingDeleteCountdownTimerRef.current);
      pendingDeleteCountdownTimerRef.current = null;
    }
  }

  function stopMultiDeleteMode() {
    setMultiDeleteMode(false);
    setSelectedMessageIds([]);
    setFavoriteDeletePrompt(null);
  }

  function toggleMessageSelection(messageId: string) {
    setSelectedMessageIds((prev) =>
      prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId]
    );
  }

  function toggleSelectAllMessages() {
    setSelectedMessageIds((prev) =>
      prev.length === selectableMessageIds.length ? [] : selectableMessageIds
    );
  }

  function mergeCollectionByCreatedAt<T extends { id: string; createdAt?: string | null }>(
    current: T[],
    restored: T[],
    order: "asc" | "desc" = "asc"
  ) {
    const map = new Map<string, T>();
    for (const item of [...current, ...restored]) map.set(item.id, item);
    const direction = order === "asc" ? 1 : -1;
    return Array.from(map.values()).sort((a, b) => {
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return (aTime - bTime) * direction;
    });
  }

  function restorePendingDeleteBatch(batch: PendingMessageDeleteBatch) {
    setMessages((prev) => mergeCollectionByCreatedAt(prev, batch.messages, "asc"));
    setSearchHits((prev) => mergeCollectionByCreatedAt(prev, batch.searchHits, "desc"));
    setProfileMediaItems((prev) => mergeCollectionByCreatedAt(prev, batch.profileMediaItems, "desc"));
    setImageViewerItems((prev) => mergeCollectionByCreatedAt(prev, batch.imageViewerItems, "desc"));
  }

  async function finalizePendingDeleteBatch(batch: PendingMessageDeleteBatch) {
    clearPendingDeleteTimers();
    setPendingDeleteBatch((current) => (current?.token === batch.token ? null : current));
    setPendingDeleteCountdownMs(0);

    try {
      await api.post("/messages/hide-many", { messageIds: batch.ids });
      await loadConversations(batch.conversationId ?? activeConvIdRef.current ?? undefined, { silent: true });
      showSuccessToast(successMessageDeleteLabel(batch.ids.length), 2000);
    } catch {
      restorePendingDeleteBatch(batch);
      await loadConversations(batch.conversationId ?? activeConvIdRef.current ?? undefined, { silent: true }).catch(() => {});
      setSendErr("Não foi possível apagar as mensagens agora.");
    }
  }

  function undoPendingDeleteBatch() {
    const batch = pendingDeleteBatch;
    if (!batch) return;
    clearPendingDeleteTimers();
    setPendingDeleteBatch(null);
    setPendingDeleteCountdownMs(0);
    restorePendingDeleteBatch(batch);
    void loadConversations(batch.conversationId ?? activeConvIdRef.current ?? undefined, { silent: true }).catch(() => {});
  }

  function queuePendingDelete(messageIds: string[]) {
    const ids = Array.from(new Set(messageIds));
    if (!ids.length) return;
    if (pendingDeleteBatch || pendingConversationHideBatch || pendingConversationClearBatch || pendingBroadcastDeleteBatch) {
      showToast("Finalize a exclusão pendente ou desfaça antes de apagar mais mensagens.", 2200);
      return;
    }

    const idSet = new Set(ids);
    const batch: PendingMessageDeleteBatch = {
      token: Date.now(),
      ids,
      messages: messages.filter((item) => idSet.has(item.id)),
      searchHits: searchHits.filter((item) => idSet.has(item.id)),
      profileMediaItems: profileMediaItems.filter((item) => idSet.has(item.id)),
      imageViewerItems: imageViewerItems.filter((item) => idSet.has(item.id)),
      conversationId: activeConvIdRef.current ?? activeConv?.id ?? null,
      expiresAt: Date.now() + 5000,
    };

    removeMessagesFromLocalState(ids);
    stopMultiDeleteMode();
    setFavoriteDeletePrompt(null);
    clearPendingDeleteTimers();
    setPendingDeleteBatch(batch);
    setPendingDeleteCountdownMs(5000);
    pendingDeleteCountdownTimerRef.current = window.setInterval(() => {
      setPendingDeleteCountdownMs(Math.max(0, batch.expiresAt - Date.now()));
    }, 100);
    pendingDeleteFinalizeTimerRef.current = window.setTimeout(() => {
      void finalizePendingDeleteBatch(batch);
    }, 5000);
    void loadConversations(batch.conversationId ?? activeConvIdRef.current ?? undefined);
  }

  function startMultiDeleteFromMessage(message: Message) {
    if (pendingDeleteBatch || pendingConversationHideBatch || pendingConversationClearBatch || pendingBroadcastDeleteBatch) {
      showToast("Finalize a exclusão pendente ou desfaça antes de apagar mais mensagens.", 2200);
      return;
    }
    setActionMenuMsgId(null);
    setActionMenuPosition(null);
    setConversationMenuId(null);
    setReactionBarMsgId(null);
    setReactionPickerMsgId(null);
    setFavoriteDeletePrompt(null);
    setMultiDeleteMode(true);
    setSelectedMessageIds([message.id]);
  }

  function clearPendingConversationTimers() {
    if (pendingConversationFinalizeTimerRef.current) {
      window.clearTimeout(pendingConversationFinalizeTimerRef.current);
      pendingConversationFinalizeTimerRef.current = null;
    }
    if (pendingConversationCountdownTimerRef.current) {
      window.clearInterval(pendingConversationCountdownTimerRef.current);
      pendingConversationCountdownTimerRef.current = null;
    }
  }

  function stopConversationSelectMode() {
    setConversationSelectMode(false);
    setSelectedConversationIds([]);
    setRemoveChatsPrompt(null);
  }

  function toggleConversationSelection(conversationId: string) {
    setSelectedConversationIds((prev) =>
      prev.includes(conversationId) ? prev.filter((id) => id !== conversationId) : [...prev, conversationId]
    );
  }

  function toggleSelectAllConversations() {
    setSelectedConversationIds((prev) => (prev.length === conversations.length ? [] : conversations.map((conv) => conv.id)));
  }

  function captureConversationUiSnapshot(): ConversationUiSnapshot {
    return {
      conversations,
      activeConv,
      messages,
      searchHits,
      profileMediaItems,
      imageViewerItems,
      newMsgsCount,
      showJumpNew,
      unreadAnchorMessageId,
      showJumpUnread,
      profileOpen,
      searchOpen,
    };
  }

  function restoreConversationUiSnapshot(snapshot: ConversationUiSnapshot) {
    setConversations(sortConversationItems(snapshot.conversations));
    activeConvIdRef.current = snapshot.activeConv?.id ?? null;
    setActiveConv(snapshot.activeConv);
    setMessages(snapshot.messages);
    setSearchHits(snapshot.searchHits);
    setProfileMediaItems(snapshot.profileMediaItems);
    setImageViewerItems(snapshot.imageViewerItems);
    setNewMsgsCount(snapshot.newMsgsCount);
    setShowJumpNew(snapshot.showJumpNew);
    setUnreadAnchorMessageId(snapshot.unreadAnchorMessageId);
    setShowJumpUnread(snapshot.showJumpUnread);
    setProfileOpen(snapshot.profileOpen);
    setSearchOpen(snapshot.searchOpen);
    if (snapshot.activeConv?.id) {
      joinConversationRoom(snapshot.activeConv.id);
    }
  }

  function hideActiveConversationLocally() {
    activeConvIdRef.current = null;
    setActiveConv(null);
    setMessages([]);
    setSearchHits([]);
    setNewMsgsCount(0);
    setShowJumpNew(false);
    setUnreadAnchorMessageId(null);
    setShowJumpUnread(false);
    setProfileOpen(false);
    setSearchOpen(false);
  }

  async function finalizePendingConversationHide(batch: PendingConversationHideBatch) {
    clearPendingConversationTimers();
    setPendingConversationHideBatch((current) => (current?.token === batch.token ? null : current));
    setPendingConversationCountdownMs(0);

    try {
      await Promise.all(batch.ids.map((conversationId) => api.delete(`/conversations/${conversationId}`)));
      await loadConversations(activeConvIdRef.current ?? undefined, { silent: true });
      showSuccessToast(successConversationHideLabel(batch.ids.length), 2000);
    } catch {
      restoreConversationUiSnapshot(batch.snapshot);
      await loadConversations(activeConvIdRef.current ?? undefined, { silent: true }).catch(() => {});
      setSendErr("Não foi possível remover os chats agora.");
    }
  }

  function undoPendingConversationHide() {
    const batch = pendingConversationHideBatch;
    if (!batch) return;
    clearPendingConversationTimers();
    setPendingConversationHideBatch(null);
    setPendingConversationCountdownMs(0);
    restoreConversationUiSnapshot(batch.snapshot);
  }

  function queuePendingConversationHide(conversationIds: string[]) {
    const ids = Array.from(new Set(conversationIds));
    if (!ids.length) return;
    if (pendingDeleteBatch || pendingConversationHideBatch || pendingConversationClearBatch || pendingBroadcastDeleteBatch) {
      showToast("Finalize a exclusão pendente ou desfaça antes de apagar mais chats.", 2200);
      return;
    }

    const snapshot = captureConversationUiSnapshot();
    const idSet = new Set(ids);
    const batch: PendingConversationHideBatch = {
      token: Date.now(),
      ids,
      snapshot,
      expiresAt: Date.now() + 5000,
    };

    setConversations((prev) => prev.filter((conv) => !idSet.has(conv.id)));
    if (snapshot.activeConv?.id && idSet.has(snapshot.activeConv.id)) {
      hideActiveConversationLocally();
    }

    setConversationMenuId(null);
    stopConversationSelectMode();
    clearPendingConversationTimers();
    setPendingConversationHideBatch(batch);
    setPendingConversationCountdownMs(5000);
    pendingConversationCountdownTimerRef.current = window.setInterval(() => {
      setPendingConversationCountdownMs(Math.max(0, batch.expiresAt - Date.now()));
    }, 100);
    pendingConversationFinalizeTimerRef.current = window.setTimeout(() => {
      void finalizePendingConversationHide(batch);
    }, 5000);
  }

  function startConversationRemovalSelection(conversationId: string) {
    if (
      multiDeleteMode ||
      pendingDeleteBatch ||
      pendingConversationHideBatch ||
      pendingConversationClearBatch ||
      pendingBroadcastDeleteBatch
    ) {
      showToast("Finalize a exclusão pendente ou desfaça antes de apagar mais chats.", 2200);
      return;
    }
    setActionMenuMsgId(null);
    setActionMenuPosition(null);
    setConversationMenuId(null);
    setConversationSelectMode(true);
    setSelectedConversationIds([conversationId]);
  }

  function requestRemoveSelectedConversations() {
    if (!selectedConversations.length) return;
    setRemoveChatsPrompt({
      ids: selectedConversations.map((conversation) => conversation.id),
      totalCount: selectedConversations.length,
    });
  }

  function confirmRemoveSelectedConversations() {
    const prompt = removeChatsPrompt;
    if (!prompt) return;
    setRemoveChatsPrompt(null);
    queuePendingConversationHide(prompt.ids);
  }

  async function finalizePendingConversationClear(batch: PendingConversationClearBatch) {
    clearPendingConversationTimers();
    setPendingConversationClearBatch((current) => (current?.token === batch.token ? null : current));
    setPendingConversationCountdownMs(0);

    try {
      if (batch.keepFavorites) {
        const favoriteIdSet = new Set(batch.favoriteIds);
        const idsToHide =
          batch.messageIds.length > 0
            ? batch.messageIds.filter((messageId) => !favoriteIdSet.has(messageId))
            : [];

        if (idsToHide.length) {
          await api.post("/messages/hide-many", { messageIds: idsToHide });
        } else {
          await api.post(`/conversations/${batch.conversationId}/clear`, {
            keepFavorites: true,
          });
        }
      } else {
        await api.post(`/conversations/${batch.conversationId}/clear`);
      }
      const preservedSortAt = preservedConversationSortAt(
        batch.snapshot.conversations.find((conv) => conv.id === batch.conversationId) ?? null
      );
      await loadConversations(activeConvIdRef.current ?? undefined, {
        silent: true,
        preserveSort: preservedSortAt
          ? { conversationId: batch.conversationId, sortAt: preservedSortAt }
          : undefined,
      });
      showSuccessToast("Conversa limpa", 2000);
    } catch {
      restoreConversationUiSnapshot(batch.snapshot);
      await loadConversations(activeConvIdRef.current ?? undefined, { silent: true }).catch(() => {});
      setSendErr("Não foi possível limpar a conversa agora.");
    }
  }

  function undoPendingConversationClear() {
    const batch = pendingConversationClearBatch;
    if (!batch) return;
    clearPendingConversationTimers();
    setPendingConversationClearBatch(null);
    setPendingConversationCountdownMs(0);
    restoreConversationUiSnapshot(batch.snapshot);
  }

  async function finalizePendingBroadcastDelete(batch: PendingBroadcastDeleteBatch) {
    clearPendingConversationTimers();
    setPendingBroadcastDeleteBatch((current) => (current?.token === batch.token ? null : current));
    setPendingConversationCountdownMs(0);

    try {
      const res = await api.delete<ConversationDetailsResponse>(`/conversations/${batch.conversationId}/broadcast`);
      const updatedConversation = res.data.conversation;
      populateConversationDetailsForm(updatedConversation);
      applyConversationUpdateLocally(updatedConversation);
      setBroadcastDetailsEditorOpen(false);
      await loadConversations(activeConvIdRef.current ?? undefined, { silent: true }).catch(() => {});
      showSuccessToast("Lista excluída", 2000);
    } catch (e: any) {
      setConversationDetailsError(e?.response?.data?.message ?? "Não foi possível excluir a lista.");
    }
  }

  function undoPendingBroadcastDelete() {
    if (!pendingBroadcastDeleteBatch) return;
    clearPendingConversationTimers();
    setPendingBroadcastDeleteBatch(null);
    setPendingConversationCountdownMs(0);
  }

  function queuePendingBroadcastDelete(conversation: ConversationListItem) {
    if (!conversation?.id) return;
    if (pendingDeleteBatch || pendingConversationHideBatch || pendingConversationClearBatch || pendingBroadcastDeleteBatch) {
      showToast("Finalize a exclusão pendente ou desfaça antes de excluir outra lista.", 2200);
      return;
    }

    const batch: PendingBroadcastDeleteBatch = {
      token: Date.now(),
      conversationId: conversation.id,
      expiresAt: Date.now() + 5000,
    };

    setConversationMenuId(null);
    setConversationDetailsError(null);
    clearPendingConversationTimers();
    setPendingBroadcastDeleteBatch(batch);
    setPendingConversationCountdownMs(5000);
    pendingConversationCountdownTimerRef.current = window.setInterval(() => {
      setPendingConversationCountdownMs(Math.max(0, batch.expiresAt - Date.now()));
    }, 100);
    pendingConversationFinalizeTimerRef.current = window.setTimeout(() => {
      void finalizePendingBroadcastDelete(batch);
    }, 5000);
  }

  function queuePendingConversationClear(
    conversationId: string,
    conversationName: string,
    totalCount: number,
    favoriteCount: number,
    messageIds: string[],
    favoriteIds: string[],
    keepFavorites: boolean
  ) {
    if (pendingDeleteBatch || pendingConversationHideBatch || pendingConversationClearBatch || pendingBroadcastDeleteBatch) {
      showToast("Finalize a exclusão pendente ou desfaça antes de limpar outra conversa.", 2200);
      return;
    }

    const snapshot = captureConversationUiSnapshot();
    const isActiveConversation = snapshot.activeConv?.id === conversationId;
    const remainingMessages =
      isActiveConversation && keepFavorites ? snapshot.messages.filter((message) => message.isFavorited) : [];
    const nextLastMessage = isActiveConversation
      ? remainingMessages[remainingMessages.length - 1] ?? null
      : null;
    const batch: PendingConversationClearBatch = {
      token: Date.now(),
      conversationId,
      conversationName,
      keepFavorites,
      totalCount,
      favoriteCount,
      messageIds,
      favoriteIds,
      snapshot,
      expiresAt: Date.now() + 5000,
    };

    setConversations((prev) =>
      sortConversationItems(
        prev.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                lastMessage: keepFavorites ? nextLastMessage : null,
                unreadCount: 0,
              }
            : conv
        )
      )
    );

    if (isActiveConversation) {
      setMessages(keepFavorites ? remainingMessages : []);
      setSearchHits((prev) => (keepFavorites ? prev.filter((message) => message.isFavorited) : []));
      setProfileMediaItems((prev) =>
        keepFavorites ? prev.filter((message) => message.isFavorited) : []
      );
      setImageViewerItems((prev) =>
        keepFavorites ? prev.filter((message) => message.isFavorited) : []
      );
      setNewMsgsCount(0);
      setShowJumpNew(false);
      setUnreadAnchorMessageId(null);
      setShowJumpUnread(false);
      if (!keepFavorites) {
        setReplyTo(null);
      }
    }

    setConversationMenuId(null);
    setConversationClearPrompt(null);
    clearPendingConversationTimers();
    setPendingConversationClearBatch(batch);
    setPendingConversationCountdownMs(5000);
    pendingConversationCountdownTimerRef.current = window.setInterval(() => {
      setPendingConversationCountdownMs(Math.max(0, batch.expiresAt - Date.now()));
    }, 100);
    pendingConversationFinalizeTimerRef.current = window.setTimeout(() => {
      void finalizePendingConversationClear(batch);
    }, 5000);
  }

  async function requestClearConversation(conversationId: string, conversationName: string) {
    if (
      multiDeleteMode ||
      conversationSelectMode ||
      pendingDeleteBatch ||
      pendingConversationHideBatch ||
      pendingConversationClearBatch ||
      pendingBroadcastDeleteBatch
    ) {
      showToast("Finalize a exclusão pendente ou desfaça antes de limpar outra conversa.", 2200);
      return;
    }

    try {
      let summary: {
        totalCount: number;
        favoriteCount: number;
        messageIds: string[];
        favoriteIds: string[];
      } | null = null;

      try {
        const res = await api.get<ConversationClearSummaryResponse>(`/conversations/${conversationId}/clear-summary`);
        summary = {
          totalCount: res.data.totalCount,
          favoriteCount: res.data.favoriteCount,
          messageIds: [],
          favoriteIds: [],
        };
      } catch (error: any) {
        if (Number(error?.response?.status ?? 0) !== 404) throw error;

        const items: Message[] = [];
        let cursor: string | null = null;
        let hasMore = true;

        while (hasMore) {
          const params: { cursor?: string; take: number } = { take: 100 };
          if (cursor) params.cursor = cursor;
          const pageResponse: { data: MessagesResponse } = await api.get(
            `/conversations/${conversationId}/messages`,
            { params }
          );
          const pageItems = pageResponse.data.items ?? [];
          items.unshift(...pageItems);
          cursor = pageResponse.data.nextCursor ?? null;
          hasMore = !!cursor && pageItems.length > 0;
        }

        summary = {
          totalCount: items.length,
          favoriteCount: items.filter((item) => item.isFavorited).length,
          messageIds: items.map((item) => item.id),
          favoriteIds: items.filter((item) => item.isFavorited).map((item) => item.id),
        };
      }

      if (!summary.totalCount) {
        setConversationMenuId(null);
        showToast("A conversa já está vazia.", 1800);
        return;
      }

      setConversationMenuId(null);
      setConversationClearPrompt({
        conversationId,
        conversationName,
        totalCount: summary.totalCount,
        favoriteCount: summary.favoriteCount,
        messageIds: summary.messageIds,
        favoriteIds: summary.favoriteIds,
      });
    } catch {
      setSendErr("Não foi possível preparar a limpeza da conversa.");
    }
  }

  function confirmClearConversation(keepFavorites: boolean) {
    const prompt = conversationClearPrompt;
    if (!prompt) return;
    queuePendingConversationClear(
      prompt.conversationId,
      prompt.conversationName,
      prompt.totalCount,
      prompt.favoriteCount,
      prompt.messageIds,
      prompt.favoriteIds,
      keepFavorites
    );
  }

  function startRemovedNoticesLoading() {
    if (removalNoticesProgressTimerRef.current) {
      window.clearInterval(removalNoticesProgressTimerRef.current);
      removalNoticesProgressTimerRef.current = null;
    }
    if (removalNoticesFinishTimerRef.current) {
      window.clearTimeout(removalNoticesFinishTimerRef.current);
      removalNoticesFinishTimerRef.current = null;
    }
    setRemovalNoticesProgress(8);
    setRemovalNoticesLoading(true);
    removalNoticesProgressTimerRef.current = window.setInterval(() => {
      setRemovalNoticesProgress((prev) => {
        if (prev >= 92) return prev;
        const next = prev + (prev < 48 ? 11 : prev < 74 ? 7 : 3);
        return Math.min(next, 92);
      });
    }, 120);
  }

  function finishRemovedNoticesLoading() {
    if (removalNoticesProgressTimerRef.current) {
      window.clearInterval(removalNoticesProgressTimerRef.current);
      removalNoticesProgressTimerRef.current = null;
    }
    setRemovalNoticesProgress(100);
    removalNoticesFinishTimerRef.current = window.setTimeout(() => {
      setRemovalNoticesLoading(false);
      setRemovalNoticesProgress(0);
      removalNoticesFinishTimerRef.current = null;
    }, 240);
  }

  async function copyText(v: string, successMessage = "Copiado") {
    try {
      await navigator.clipboard.writeText(v);
      showToast(successMessage);
    } catch {
      setSendErr("Não foi possível copiar agora.");
    }
  }

  function attachmentDownloadName(message: Partial<Message>) {
    const normalized = normalizeAttachmentDisplayName(message.attachmentName);
    if (normalized) return normalized;
    if (isAudioMessageAttachment(message) || isAudioDocumentAttachment(message)) return "audio";
    if (isVideoAttachment(message)) return "video";
    if (isImageAttachment(message)) return "imagem";
    return "arquivo";
  }

  async function triggerBrowserDownload(url: string, filename: string) {
    const desktopApi = window.bhashDesktop;
    if (desktopApi?.isDesktop && typeof desktopApi.downloadFile === "function") {
      const result = await desktopApi.downloadFile({ url, filename });
      if (!result?.ok) {
        throw new Error(result?.error || "Não foi possível baixar o arquivo.");
      }
      showToast("Baixado na pasta Downloads");
      return;
    }

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
      showToast("Download iniciado");
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
    showToast("Download iniciado");
  }

  async function downloadAttachment(message: Partial<Message>) {
    const absoluteUrl = toAbsoluteUrl(message.attachmentUrl);
    if (!absoluteUrl) return;
    try {
      await triggerBrowserDownload(absoluteUrl, attachmentDownloadName(message));
    } catch {
      setSendErr("Não foi possível baixar o arquivo agora.");
    }
  }

  function removeMessagesFromLocalState(messageIds: string[]) {
    if (!messageIds.length) return;
    const ids = new Set(messageIds);
    setMessages((prev) => prev.filter((m) => !ids.has(m.id)));
    setSearchHits((prev) => prev.filter((m) => !ids.has(m.id)));
    setProfileMediaItems((prev) => prev.filter((m) => !ids.has(m.id)));
    setImageViewerItems((prev) => prev.filter((m) => !ids.has(m.id)));
    if (replyTo && ids.has(replyTo.id)) setReplyTo(null);
    if (currentViewerItem && ids.has(currentViewerItem.id)) closeImageViewer();
  }

  async function hideRemovedAttachmentNoticesForMe(conversationId?: string | null) {
    const targetConversationId = conversationId ?? activeConvIdRef.current ?? null;
    if (!targetConversationId) return;
    const ok = window.confirm("Excluir do seu chat os avisos de arquivos apagados desta conversa?");
    if (!ok) return;

    startRemovedNoticesLoading();
    try {
      const res = await api.post<{ ok: true; messageIds?: string[] }>(
        `/conversations/${targetConversationId}/hide-removed-notices`
      );
      const hiddenIds = Array.isArray(res.data?.messageIds)
        ? res.data.messageIds
        : messages.filter((item) => item.conversationId === targetConversationId && isRemovedAttachmentNoticeMessage(item)).map((item) => item.id);
      removeMessagesFromLocalState(hiddenIds);
      setActionMenuMsgId(null);
      setReactionBarMsgId(null);
      setReactionPickerMsgId(null);
      await loadConversations(activeConvIdRef.current ?? undefined);
      finishRemovedNoticesLoading();
    } catch {
      finishRemovedNoticesLoading();
      setSendErr("Não foi possível excluir os avisos agora.");
    }
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
    try {
      const res = await api.get<Me>("/auth/me");
      setMe(res.data);
    } catch (e: any) {
      if (isAuthRequestError(e)) {
        logout();
        return;
      }
      throw e;
    }
  }

  async function loadConversations(
    selectConversationId?: string,
    options?: { silent?: boolean; preserveSort?: { conversationId: string; sortAt?: string } }
  ) {
    const silent = !!options?.silent;
    if (!silent) {
      setLoadingConvs(true);
      setConversationsError(null);
    }
    try {
      const res = await api.get<ConversationsResponse>("/conversations");
      const preserveSort = options?.preserveSort;
      const items = sortConversationItems(
        applyLocalReadMarkersToConversations(
          (res.data.items ?? []).map((item) =>
            preserveSort?.sortAt && item.id === preserveSort.conversationId
              ? { ...item, sortAt: preserveSort.sortAt }
              : item
          ),
          conversationReadMarkersRef.current
        )
      );
      setConversations(items);

      if (selectConversationId) {
        const found = items.find((item) => item.id === selectConversationId);
        if (found) setActiveConv(found);
      }

      return items;
    } catch (e: any) {
      if (isAuthRequestError(e)) {
        logout();
        return conversationsRef.current;
      }

      if (!silent) {
        const apiMessage = e?.response?.data?.message;
        setConversationsError(
          typeof apiMessage === "string" && apiMessage.trim()
            ? apiMessage.trim()
            : "Não foi possível carregar as conversas agora."
        );
      }
      throw e;
    } finally {
      if (!silent) {
        setLoadingConvs(false);
      }
    }
  }

  async function loadMessages(conversationId: string, cursor?: string | null, appendTop = false) {
    if (!conversationId) return [];
    if (appendTop && loadingOlderMsgsRef.current) return [];

    const currentList = msgListRef.current;
    const previousScrollMetrics =
      appendTop && currentList
        ? {
            scrollHeight: currentList.scrollHeight,
            scrollTop: currentList.scrollTop,
          }
        : null;

    if (appendTop) {
      loadingOlderMsgsRef.current = true;
      setLoadingOlderMsgs(true);
    } else {
      setLoadingMsgs(true);
    }
    setMessagesErr(null);
    try {
      const res = await api.get<MessagesResponse>(`/conversations/${conversationId}/messages`, {
        params: {
          ...(cursor ? { cursor } : {}),
          take: cursor ? OLDER_MESSAGES_PAGE_SIZE : INITIAL_MESSAGES_PAGE_SIZE,
        },
      });

      if (activeConvIdRef.current !== conversationId) {
        return [];
      }

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
      messagesNextCursorRef.current = res.data.nextCursor ?? null;

      if (appendTop && previousScrollMetrics) {
        requestAnimationFrame(() => {
          const el = msgListRef.current;
          if (!el) return;
          const delta = el.scrollHeight - previousScrollMetrics.scrollHeight;
          el.scrollTop = previousScrollMetrics.scrollTop + delta;
        });
      } else if (!appendTop) {
        scrollToBottom();
      }
      return items;
    } catch (e: any) {
      if (!appendTop) setMessages([]);
      setMessagesErr(e?.response?.data?.message ?? "Falha ao carregar mensagens");
      return [];
    } finally {
      if (appendTop) {
        loadingOlderMsgsRef.current = false;
        setLoadingOlderMsgs(false);
      } else {
        setLoadingMsgs(false);
      }
    }
  }

  async function loadOlderMessages(conversationId: string) {
    const cursor = messagesNextCursorRef.current;
    if (!conversationId || !cursor || loadingOlderMsgsRef.current || loadingMsgs) return [];
    return loadMessages(conversationId, cursor, true);
  }

  async function openConversation(conv: ConversationListItem, focusMessageId?: string | null) {
    const unreadCountBeforeOpen = Math.max(0, conv.unreadCount ?? 0);
    activeConvIdRef.current = conv.id;
    setActiveConv(conv);
    isMsgListNearBottomRef.current = true;
    setSearchOpen(false);
    setSearchQ("");
    setSearchHits([]);
    setSearchErr(null);
    setHighlightTerm("");
    setMessagesErr(null);
    setSendErr(null);
    setReplyTo(null);
    setAttachMenuOpen(false);
    setActionMenuMsgId(null);
    setConversationMenuId(null);
    setUnreadAnchorMessageId(null);
    setShowJumpUnread(false);
    canConsumeUnreadAnchorRef.current = false;
    hasSeenUnreadMarkerRef.current = false;
    clearComposerAttachment();
    setConversations((prev) =>
      sortConversationItems(
        prev.map((item) =>
          item.id === conv.id ? { ...item, unreadCount: 0 } : item
        )
      )
    );
    rememberConversationRead(conv.id, null, conv);

    joinConversationRoom(conv.id);

    const loadedMessages = (await loadMessages(conv.id)) ?? [];
    rememberConversationRead(conv.id, null, conv, loadedMessages);
    const unreadAnchorId = resolveUnreadAnchorMessageId(loadedMessages, unreadCountBeforeOpen);
    setUnreadAnchorMessageId(unreadAnchorId);
    hasSeenUnreadMarkerRef.current = false;
    await markConversationRead(conv.id, null, conv, loadedMessages);
    if (focusMessageId) {
      const msgExists = loadedMessages.some((msg) => msg.id === focusMessageId);
      if (msgExists) {
        requestAnimationFrame(() => {
          focusRenderedMessage(focusMessageId);
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
      if (isAuthRequestError(e)) {
        logout();
        return;
      }
      setPickerError(e?.response?.data?.message ?? e?.message ?? "Falha ao carregar colaboradores");
    } finally {
      setLoadingUsers(false);
    }
  }

  function closePicker() {
    setPickerOpen(false);
    setPickerMode("direct");
    setPickerError(null);
    setPickerSubmitting(false);
    setPickerTitle("");
    setPickerSelectedUserIds([]);
    setPickerIncludeAllUsers(false);
    setPickerAutomaticRules([]);
    setPickerRuleManagerOpen(false);
    setPickerConversationId(null);
    setUserSearch("");
    setUserCompanyFilter("");
    setUserDepartmentFilter("");
  }

  function openCreatePicker(mode: CreatePickerMode, conversation?: ConversationListItem | null) {
    setCreateMenuOpen(false);
    closeConversationMenu();
    closeGroupMemberMenu();
    setPickerMode(mode);
    setPickerOpen(true);
    setPickerError(null);
    setPickerSubmitting(false);
    setPickerTitle(mode === "group-members" ? conversationDisplayName(conversation) : "");
    setPickerSelectedUserIds([]);
    const conversationAutomaticRules = dedupeAutomaticRules(
      (conversation?.automaticRules ?? []).map((rule) => ({
        id: rule.id || automaticRuleKey(rule.companyId ?? null, rule.departmentId ?? null),
        companyId: rule.companyId ?? rule.company?.id ?? null,
        departmentId: rule.departmentId ?? rule.department?.id ?? null,
        company: rule.company ?? null,
        department: rule.department ?? null,
      }))
    );
    const automaticEnabled =
      mode === "group-members"
        ? !!conversation?.broadcastIncludeAllUsers || conversationAutomaticRules.length > 0
        : false;
    setPickerIncludeAllUsers(automaticEnabled);
    setPickerAutomaticRules(mode === "group-members" ? conversationAutomaticRules : []);
    setPickerRuleManagerOpen(false);
    setPickerConversationId(conversation?.id ?? null);
    setUserSearch("");
    setUserCompanyFilter("");
    setUserDepartmentFilter("");
  }

  function togglePickerUserSelection(userId: string) {
    setPickerSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function toggleSelectAllPickerSearchResults() {
    if (!pickerFilteredUserIds.length) return;

    setPickerSelectedUserIds((prev) => {
      const prevSet = new Set(prev);
      const allSelected = pickerFilteredUserIds.every((userId) => prevSet.has(userId));
      if (allSelected) {
        return prev.filter((userId) => !pickerFilteredUserIds.includes(userId));
      }

      const next = [...prev];
      for (const userId of pickerFilteredUserIds) {
        if (!prevSet.has(userId)) {
          next.push(userId);
        }
      }
      return next;
    });
  }

  function openPickerRuleManager() {
    if (!pickerAutomaticRules.length) {
      setPickerAutomaticRules([
        {
          id: randomId(),
          companyId: null,
          departmentId: null,
          company: null,
          department: null,
        },
      ]);
    }
    setPickerRuleManagerOpen(true);
  }

  function handlePickerAutomaticAudienceToggle(nextValue: boolean) {
    setPickerIncludeAllUsers(nextValue);
    if (nextValue && pickerUsesPairedAutomaticRules) {
      openPickerRuleManager();
    }
  }

  function addEmptyPickerRule() {
    setPickerAutomaticRules((prev) => [
      ...prev,
      { id: randomId(), companyId: null, departmentId: null, company: null, department: null },
    ]);
  }

  function updatePickerAutomaticRule(
    ruleId: string,
    patch: Partial<Pick<AutomaticRuleItem, "companyId" | "departmentId" | "company" | "department">>
  ) {
    setPickerAutomaticRules((prev) => prev.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));
  }

  function removePickerAutomaticRule(ruleId: string) {
    setPickerAutomaticRules((prev) => prev.filter((rule) => rule.id !== ruleId));
  }

  async function applyCreatedConversation(conversation: ConversationListItem) {
    closePicker();
    setConversations((prev) => upsertConversationItem(prev, conversation));
    setConversationsError(null);
    try {
      const items = await loadConversations(conversation.id);
      const resolved = items?.find((item) => item.id === conversation.id) ?? conversation;
      await openConversation(resolved);
    } catch {
      await openConversation(conversation);
      setSendErr("A conversa foi criada, mas a lista ainda não conseguiu atualizar.");
    }
  }

  function applyConversationUpdateLocally(conversation: ConversationListItem) {
    setConversations((prev) => upsertConversationItem(prev, conversation));
    if (activeConvIdRef.current === conversation.id) {
      setActiveConv(conversation);
    }
    setConversationDetails((prev) => (prev?.id === conversation.id ? conversation : prev));
  }

  function populateConversationDetailsForm(nextConversation: ConversationListItem) {
    setConversationDetails(nextConversation);
    setConversationDetailsTitle(nextConversation.rawTitle?.trim() || nextConversation.title?.trim() || "");
    setConversationDetailsSelectedUserIds((nextConversation.broadcastTargets ?? []).map((user) => user.id));
    setConversationDetailsAutomaticRules(
      dedupeAutomaticRules(
        (nextConversation.automaticRules ?? []).map((rule) => ({
          id: rule.id || automaticRuleKey(rule.companyId ?? null, rule.departmentId ?? null),
          companyId: rule.companyId ?? rule.company?.id ?? null,
          departmentId: rule.departmentId ?? rule.department?.id ?? null,
          company: rule.company ?? null,
          department: rule.department ?? null,
        }))
      )
    );
    setConversationDetailsExcludedUserIds((nextConversation.broadcastExcludedUsers ?? []).map((user) => user.id));
    setConversationDetailsIncludeAllUsers(!!nextConversation.broadcastIncludeAllUsers);
  }

  async function loadConversationDetailsDrawer(conversation?: ConversationListItem | null) {
    const target = conversation ?? activeConv;
    if (!target?.id) return;

    const fallbackConversation = buildConversationDetailsFallback(target, users);
    setConversationDetailsOpen(true);
    setConversationDetailsLoading(true);
    setConversationDetailsError(null);
    setConversationDetailsLegacyMode(false);
    setConversationDetailsRemovingChat(false);
    setConversationDetailsRuleManagerOpen(false);
    setBroadcastDetailsEditorOpen(false);
    setGroupDetailsActionKey(null);
    populateConversationDetailsForm(fallbackConversation);
    if (conversationKind(target) === "BROADCAST" && users.length === 0) {
      void loadUsers();
    }

    try {
      const res = await api.get<ConversationDetailsResponse>(`/conversations/${target.id}/details`);
      const nextConversation = res.data.conversation;
      populateConversationDetailsForm(nextConversation);
      applyConversationUpdateLocally(nextConversation);
    } catch (e: any) {
      if (Number(e?.response?.status ?? 0) === 404 && conversationKind(target) !== "DIRECT") {
        setConversationDetailsLegacyMode(true);
        populateConversationDetailsForm(fallbackConversation);
        applyConversationUpdateLocally(fallbackConversation);
      } else {
        setConversationDetailsError(e?.response?.data?.message ?? "Não foi possível carregar os dados da conversa.");
      }
    } finally {
      setConversationDetailsLoading(false);
    }
  }

  function addUserToConversationDetails(userId: string) {
    setConversationDetailsSelectedUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    setConversationDetailsExcludedUserIds((prev) => prev.filter((id) => id !== userId));
  }

  function removeUserFromConversationDetails(userId: string) {
    setConversationDetailsSelectedUserIds((prev) => prev.filter((id) => id !== userId));
    setConversationDetailsExcludedUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
  }

  function openConversationDetailsRuleManager() {
    if (!conversationDetailsAutomaticRules.length) {
      setConversationDetailsAutomaticRules([
        {
          id: randomId(),
          companyId: null,
          departmentId: null,
          company: null,
          department: null,
        },
      ]);
    }
    setConversationDetailsRuleManagerOpen(true);
  }

  function addEmptyConversationDetailsRule() {
    setConversationDetailsAutomaticRules((prev) => [
      ...prev,
      { id: randomId(), companyId: null, departmentId: null, company: null, department: null },
    ]);
  }

  function updateConversationDetailsAutomaticRule(
    ruleId: string,
    patch: Partial<Pick<AutomaticRuleItem, "companyId" | "departmentId" | "company" | "department">>
  ) {
    setConversationDetailsAutomaticRules((prev) =>
      prev.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule))
    );
  }

  function removeConversationDetailsAutomaticRule(ruleId: string) {
    setConversationDetailsAutomaticRules((prev) => prev.filter((rule) => rule.id !== ruleId));
  }

  async function saveBroadcastConversationDetails() {
    const conversation = conversationDetails;
    if (!conversation?.id || conversationKind(conversation) !== "BROADCAST") return;
    if (conversationDetailsLegacyMode) {
      setConversationDetailsError("Atualize o servidor para editar essa lista por aqui.");
      return;
    }

    setConversationDetailsSaving(true);
    setConversationDetailsError(null);
    try {
      const res = await api.patch<ConversationDetailsResponse>(`/conversations/${conversation.id}/broadcast`, {
        title: conversationDetailsTitle,
        targetUserIds: conversationDetailsSelectedUserIds,
        automaticRules: dedupeAutomaticRules(conversationDetailsAutomaticRules).map((rule) => ({
          companyId: rule.companyId ?? null,
          departmentId: rule.departmentId ?? null,
        })),
        excludedUserIds: conversationDetailsExcludedUserIds,
        includeAllUsers: conversationDetailsIncludeAllUsers,
      });
      const updatedConversation = res.data.conversation;
      setConversationDetailsLegacyMode(false);
      populateConversationDetailsForm(updatedConversation);
      applyConversationUpdateLocally(updatedConversation);
    } catch (e: any) {
      setConversationDetailsError(e?.response?.data?.message ?? "Não foi possível salvar a lista agora.");
    } finally {
      setConversationDetailsSaving(false);
    }
  }

  async function deleteBroadcastFromDetails(conversation: ConversationListItem) {
    if (!conversation?.id) return;
    queuePendingBroadcastDelete(conversation);
  }

  async function startDirect(otherUserId: string) {
    if (pickerSubmitting) return;
    setPickerSubmitting(true);
    setPickerError(null);
    try {
      const res = await api.post<ConversationMutationResponse>("/conversations/direct", {
        otherUserId,
      });
      await applyCreatedConversation(res.data.conversation);
    } catch (e: any) {
      setPickerError(pickerRequestErrorMessage(e, "Não foi possível abrir a conversa."));
    } finally {
      setPickerSubmitting(false);
    }
  }

  async function createGroupFromPicker() {
    const title = pickerTitle.trim();
    if (title.length < 2) {
      setPickerError("Informe um nome para o grupo.");
      return;
    }
    if (!pickerUsesPairedAutomaticRules && pickerIncludeAllUsers && pickerAutoAudienceUsesSearchOnly) {
      setPickerError("Para incluir novos usuários automaticamente, use empresa/setor ou limpe a busca.");
      return;
    }
    if (!pickerHasAudience) {
      setPickerError("Selecione pessoas ou ative uma regra automática para o grupo.");
      return;
    }

    setPickerSubmitting(true);
    setPickerError(null);
    try {
      const res = await api.post<ConversationMutationResponse>("/conversations/group", {
        title,
        memberIds: pickerSelectedUserIds,
        automaticRules: pickerAutomaticAudienceConfig.automaticRules,
        companyIds: pickerAutomaticAudienceConfig.companyIds,
        departmentIds: pickerAutomaticAudienceConfig.departmentIds,
        includeAllUsers: pickerAutomaticAudienceConfig.includeAllUsers,
      });
      await applyCreatedConversation(res.data.conversation);
    } catch (e: any) {
      setPickerError(pickerRequestErrorMessage(e, "Não foi possível criar o grupo."));
    } finally {
      setPickerSubmitting(false);
    }
  }

  async function createBroadcastListFromPicker() {
    const title = pickerTitle.trim();
    if (title.length < 2) {
      setPickerError("Informe um nome para a lista de transmissão.");
      return;
    }
    if (!pickerUsesPairedAutomaticRules && pickerIncludeAllUsers && pickerAutoAudienceUsesSearchOnly) {
      setPickerError("Para incluir novos usuários automaticamente, use empresa/setor ou limpe a busca.");
      return;
    }
    if (!pickerHasAudience) {
      setPickerError("Selecione contatos ou ative uma regra automática para a lista.");
      return;
    }

    setPickerSubmitting(true);
    setPickerError(null);
    try {
      const res = await api.post<ConversationMutationResponse>("/conversations/broadcast", {
        title,
        targetUserIds: pickerSelectedUserIds,
        automaticRules: pickerAutomaticAudienceConfig.automaticRules,
        companyIds: pickerAutomaticAudienceConfig.companyIds,
        departmentIds: pickerAutomaticAudienceConfig.departmentIds,
        includeAllUsers: pickerAutomaticAudienceConfig.includeAllUsers,
      });
      await applyCreatedConversation(res.data.conversation);
    } catch (e: any) {
      setPickerError(pickerRequestErrorMessage(e, "Não foi possível criar a lista de transmissão."));
    } finally {
      setPickerSubmitting(false);
    }
  }

  async function addGroupParticipantsFromPicker() {
    const conversationId = pickerConversationId;
    if (!conversationId) return;
    if (!pickerUsesPairedAutomaticRules && pickerIncludeAllUsers && pickerAutoAudienceUsesSearchOnly) {
      setPickerError("Para incluir novos usuários automaticamente, use empresa/setor ou limpe a busca.");
      return;
    }
    if (!pickerSelectedUserIds.length && !pickerAutomaticAudienceActive && !pickerIncludeAllUsers) {
      setPickerError("Selecione pessoas ou ative uma regra automática para o grupo.");
      return;
    }

    setPickerSubmitting(true);
    setPickerError(null);
    try {
      const res = await api.post<ConversationMutationResponse>(`/conversations/${conversationId}/participants`, {
        userIds: pickerSelectedUserIds,
        automaticRules: pickerAutomaticAudienceConfig.automaticRules,
        companyIds: pickerAutomaticAudienceConfig.companyIds,
        departmentIds: pickerAutomaticAudienceConfig.departmentIds,
        includeAllUsers: pickerAutomaticAudienceConfig.includeAllUsers,
      });
      const updatedConversation = res.data.conversation;
      closePicker();
      const items = await loadConversations(conversationId);
      const resolved = items?.find((item) => item.id === conversationId) ?? updatedConversation;
      if (activeConvIdRef.current === conversationId) {
        setActiveConv(resolved);
      }
      if (conversationDetails?.id === conversationId) {
        setConversationDetails(resolved);
      }
    } catch (e: any) {
      setPickerError(pickerRequestErrorMessage(e, "Não foi possível adicionar as pessoas agora."));
    } finally {
      setPickerSubmitting(false);
    }
  }

  async function submitPicker() {
    if (pickerMode === "group") {
      await createGroupFromPicker();
      return;
    }
    if (pickerMode === "broadcast") {
      await createBroadcastListFromPicker();
      return;
    }
    if (pickerMode === "group-members") {
      await addGroupParticipantsFromPicker();
    }
  }

  async function leaveGroup(conversation: ConversationListItem) {
    const conversationId = conversation.id;
    const ok = window.confirm(`Sair de "${conversationDisplayName(conversation)}"?`);
    if (!ok) return;

    try {
      const res = await api.post<ConversationDetailsResponse>(`/conversations/${conversationId}/leave`);
      setConversationMenuId(null);
      const updatedConversation = res.data.conversation;
      if (updatedConversation) {
        applyConversationUpdateLocally(updatedConversation);
        if (activeConvIdRef.current === conversationId) {
          setActiveConv(updatedConversation);
        }
        if (conversationDetails?.id === conversationId) {
          setConversationDetails(updatedConversation);
        }
      } else if (activeConvIdRef.current === conversationId) {
        hideActiveConversationLocally();
      }
      await loadConversations(activeConvIdRef.current ?? undefined);
    } catch (e: any) {
      setSendErr(e?.response?.data?.message ?? e?.message ?? "Não foi possível sair do grupo.");
    }
  }

  function removeConversationFromDetailsDrawer(conversation?: ConversationListItem | null) {
    const target = conversation ?? conversationDetails ?? activeConv;
    if (!target?.id) return;
    if (conversationKind(target) === "GROUP" && target.isCurrentParticipant !== false) {
      setConversationDetailsError("Saia do grupo antes de remover ele dos seus chats.");
      return;
    }
    if (conversationKind(target) === "BROADCAST" && target.isCurrentParticipant !== false) {
      setConversationDetailsError("Exclua a lista antes de remover ela dos seus chats.");
      return;
    }
    if (pendingDeleteBatch || pendingConversationHideBatch || pendingConversationClearBatch || pendingBroadcastDeleteBatch) {
      showToast("Finalize a exclusão pendente ou desfaça antes de apagar mais chats.", 2200);
      return;
    }

    setConversationDetailsRemovingChat(true);
    setConversationDetailsError(null);
    setConversationDetailsOpen(false);
    queuePendingConversationHide([target.id]);
    setConversationDetailsRemovingChat(false);
  }

  async function updateGroupAdmin(conversation: ConversationListItem, targetUser: UserMini, value: boolean) {
    if (!conversation?.id) return;

    setGroupDetailsActionKey(`${targetUser.id}:${value ? "promote" : "demote"}`);
    setConversationDetailsError(null);
    try {
      const res = await api.patch<ConversationMutationResponse>(
        `/conversations/${conversation.id}/participants/${targetUser.id}/admin`,
        { value }
      );
      populateConversationDetailsForm(res.data.conversation);
      applyConversationUpdateLocally(res.data.conversation);
    } catch (e: any) {
      setConversationDetailsError(
        e?.response?.data?.message ?? `Não foi possível ${value ? "promover" : "rebaixar"} esse participante.`
      );
    } finally {
      setGroupDetailsActionKey(null);
    }
  }

  async function removeGroupParticipantFromDetails(conversation: ConversationListItem, targetUser: UserMini) {
    if (!conversation?.id) return;
    const ok = window.confirm(`Remover "${targetUser.name}" do grupo "${conversationDisplayName(conversation)}"?`);
    if (!ok) return;

    setGroupDetailsActionKey(`${targetUser.id}:remove`);
    setConversationDetailsError(null);
    try {
      const res = await api.delete<ConversationMutationResponse>(
        `/conversations/${conversation.id}/participants/${targetUser.id}`
      );
      populateConversationDetailsForm(res.data.conversation);
      applyConversationUpdateLocally(res.data.conversation);
    } catch (e: any) {
      setConversationDetailsError(e?.response?.data?.message ?? "Não foi possível remover esse participante.");
    } finally {
      setGroupDetailsActionKey(null);
    }
  }

  async function deleteGroupFromDetails(conversation: ConversationListItem) {
    if (!conversation?.id) return;
    const ok = window.confirm(`Excluir o grupo "${conversationDisplayName(conversation)}" para todos?`);
    if (!ok) return;

    setGroupDetailsActionKey(`delete:${conversation.id}`);
    setConversationDetailsError(null);
    try {
      const res = await api.delete<ConversationMutationResponse>(`/conversations/${conversation.id}/group`);
      populateConversationDetailsForm(res.data.conversation);
      applyConversationUpdateLocally(res.data.conversation);
      await loadConversations(activeConvIdRef.current ?? undefined, { silent: true }).catch(() => {});
    } catch (e: any) {
      setConversationDetailsError(e?.response?.data?.message ?? "Não foi possível excluir o grupo.");
    } finally {
      setGroupDetailsActionKey(null);
    }
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
      messagesNextCursorRef.current = null;
      setHighlightTerm(termToHighlight);

      requestAnimationFrame(() => {
        focusRenderedMessage(messageId);
      });
    } catch (e: any) {
      setSearchErr(e?.response?.data?.message ?? "Falha ao abrir ocorrência");
    }
  }

  async function jumpToReplyReference(replyMessageId?: string | null) {
    if (!replyMessageId) return;

    setActionMenuMsgId(null);
    setReactionBarMsgId(null);
    setReactionPickerMsgId(null);

    if (focusRenderedMessage(replyMessageId)) return;
    await jumpToMessageById(replyMessageId);
  }

  async function jumpToHit(hit: SearchHit) {
    await jumpToMessageById(hit.id, searchQ.trim());
  }

  async function loadProfileDrawer() {
    if (conversationKind(activeConv) !== "DIRECT") return;
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
    if ((!profileOpen && !conversationDetailsOpen) || !activeConv?.id) return;
    void loadProfileMedia(profileMediaTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileOpen, conversationDetailsOpen, profileMediaTab, activeConv?.id]);

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

  function handleMediaPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isMediaFileLike(file)) {
      setSendErr("Selecione uma imagem ou vídeo válido.");
      e.currentTarget.value = "";
      return;
    }

    if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
      setSendErr(`A mídia excede o limite de ${formatBytes(MAX_CHAT_ATTACHMENT_BYTES)}.`);
      e.currentTarget.value = "";
      return;
    }

    clearComposerAttachment();
    const previewUrl = URL.createObjectURL(file);
    setAttachmentFile(file);
    setAttachmentMode("image");
    setAttachmentPreviewUrl(previewUrl);
    setAttachMenuOpen(false);
  }

  function handleAudioPicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isAudioFileLike(file)) {
      setSendErr("Selecione um arquivo de áudio válido.");
      e.currentTarget.value = "";
      return;
    }

    if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
      setSendErr(`O áudio excede o limite de ${formatBytes(MAX_CHAT_ATTACHMENT_BYTES)}.`);
      e.currentTarget.value = "";
      return;
    }

    clearComposerAttachment();
    setAttachmentFile(file);
    setAttachmentMode("audio");
    setAttachmentPreviewUrl(URL.createObjectURL(file));
    setAttachMenuOpen(false);
  }

  function handleFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
      setSendErr(`O arquivo excede o limite de ${formatBytes(MAX_CHAT_ATTACHMENT_BYTES)}.`);
      e.currentTarget.value = "";
      return;
    }

    clearComposerAttachment();
    setAttachmentFile(file);
    setAttachmentMode("file");
    setAttachmentPreviewUrl(null);
    setAttachMenuOpen(false);
  }

  async function sendMessage() {
    if (!activeConv || !canSendInActiveConversation) return;

    const trimmed = text.trim();
    const hasText = !!trimmed;
    const hasAttachment = !!attachmentFile;
    const conversationId = activeConv.id;

    if (!hasText && !hasAttachment) return;

    setSendErr(null);

    if (hasAttachment) {
      if ((attachmentFile?.size ?? 0) > MAX_CHAT_ATTACHMENT_BYTES) {
        setSendErr(`O anexo excede o limite de ${formatBytes(MAX_CHAT_ATTACHMENT_BYTES)}.`);
        return;
      }

      if (sending) return;
      setSending(true);
      try {
        const form = new FormData();
        if (trimmed) form.append("body", trimmed);
        form.append(
          "uploadMode",
          attachmentMode === "audio" ? "audio" : attachmentMode === "file" ? "file" : "image"
        );
        form.append("file", attachmentFile as File);
        if (replyTo?.id) form.append("replyToId", replyTo.id);

        const res = await api.post<{ ok: true; message: Message }>(
          `/conversations/${conversationId}/messages`,
          form,
          {
            headers: { "Content-Type": "multipart/form-data" },
          }
        );

        if (attachmentMode === "audio") {
          rememberOptimisticAudioMessageId(res.data.message?.id);
        }
        mergeMessageIntoList(res.data.message);
        scrollToBottom();
        setShowJumpNew(false);
        setNewMsgsCount(0);
      } catch (e: any) {
        const apiMessage = e?.response?.data?.message;
        const status = Number(e?.response?.status ?? 0);
        if (status === 413) {
          setSendErr(`O vídeo/arquivo excede o limite de ${formatBytes(MAX_CHAT_ATTACHMENT_BYTES)}.`);
        } else if (typeof apiMessage === "string" && apiMessage.trim()) {
          setSendErr(apiMessage.trim());
        } else {
          setSendErr("Não foi possível enviar o anexo. Tente novamente.");
        }
        return;
      } finally {
        setSending(false);
      }
    } else {
      const socket = socketRef.current;
      if (!socket) {
        setSendErr("Conexão do chat indisponível. Tente novamente.");
        return;
      }

      const ack = await new Promise<{ ok?: boolean; reason?: string } | null>((resolve) => {
        let settled = false;
        const finish = (value: { ok?: boolean; reason?: string } | null) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          resolve(value);
        };
        const timeoutId = window.setTimeout(() => finish(null), 2500);

        socket.emit(
          "message:send",
          {
            conversationId,
            body: trimmed,
            replyToId: replyTo?.id ?? null,
          },
          (response?: { ok?: boolean; reason?: string }) => finish(response ?? null)
        );
      });

      if (ack?.ok === false) {
        setSendErr(ack.reason?.trim() || "Nao foi possivel enviar a mensagem.");
        return;
      }

      scrollToBottom();
      setShowJumpNew(false);
      setNewMsgsCount(0);
    }

    setText("");
    setReplyTo(null);
    clearComposerAttachment();
    setEmojiOpen(false);
    setAttachMenuOpen(false);
    focusComposerInput();
    void loadConversations(conversationId, { silent: true }).catch(() => {});
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

  function requestDeleteSelectedMessages() {
    if (!selectedMessages.length) return;

    const ids = selectedMessages.map((message) => message.id);
    const favoriteIds = selectedMessages.filter((message) => message.isFavorited).map((message) => message.id);

    if (favoriteIds.length) {
      setFavoriteDeletePrompt({
        ids,
        favoriteIds,
        totalCount: ids.length,
        favoriteCount: favoriteIds.length,
      });
      return;
    }

    queuePendingDelete(ids);
  }

  function confirmDeleteSelectedMessages(includeFavorites: boolean) {
    const prompt = favoriteDeletePrompt;
    if (!prompt) return;

    setFavoriteDeletePrompt(null);
    const idsToDelete = includeFavorites
      ? prompt.ids
      : prompt.ids.filter((id) => !prompt.favoriteIds.includes(id));

    if (!idsToDelete.length) {
      stopMultiDeleteMode();
      showToast("Nenhuma mensagem foi apagada.", 2000);
      return;
    }

    queuePendingDelete(idsToDelete);
  }

  async function clearConversation(conversationId?: string, conversationName?: string) {
    const targetId = conversationId ?? activeConv?.id;
    if (!targetId) return;
    const resolvedName =
      conversationName ??
      conversationDisplayName(conversationsRef.current.find((conv) => conv.id === targetId) ?? null) ??
      conversationDisplayName(activeConv) ??
      "Conversa";
    await requestClearConversation(targetId, resolvedName);
  }

  async function removeConversationFromList(conversationId?: string) {
    const targetId = conversationId ?? activeConv?.id;
    if (!targetId) return;
    const conversation = conversationsRef.current.find((conv) => conv.id === targetId) ?? activeConv;
    if (conversationKind(conversation) === "GROUP" && conversation?.isCurrentParticipant !== false) {
      setSendErr("Saia do grupo antes de remover ele dos seus chats.");
      return;
    }
    if (conversationKind(conversation) === "BROADCAST" && conversation?.isCurrentParticipant !== false) {
      setSendErr("Exclua a lista antes de remover ela dos seus chats.");
      return;
    }
    startConversationRemovalSelection(targetId);
  }

  async function markConversationRead(
    conversationId: string,
    readAt?: string | number | Date | null,
    conversation?: ConversationListItem | null,
    items?: Message[] | null
  ) {
    const currentConversation =
      conversation ?? conversationsRef.current.find((conv) => conv.id === conversationId) ?? null;
    rememberConversationRead(conversationId, readAt, currentConversation, items);
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
      setBrokenAvatarUrls(new Set());
      await loadMe();
      await loadConversations(activeConvIdRef.current ?? undefined);
    } finally {
      setAvatarUploading(false);
    }
  }

  async function removeMyAvatar() {
    setAvatarRemoving(true);
    try {
      await api.delete("/me/avatar");
      setBrokenAvatarUrls(new Set());
      await loadMe();
      await loadConversations(activeConvIdRef.current ?? undefined);
    } finally {
      setAvatarRemoving(false);
    }
  }

  async function uploadConversationAvatar(file: File) {
    const conversation = conversationDetails ?? activeConv;
    if (!conversation?.id) return;
    if (conversationDetailsLegacyMode) {
      setConversationDetailsError("Atualize o servidor para trocar a foto desta conversa.");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    setConversationAvatarUploading(true);
    setConversationDetailsError(null);
    try {
      const res = await api.post<ConversationDetailsResponse>(`/conversations/${conversation.id}/avatar`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBrokenAvatarUrls(new Set());
      applyConversationUpdateLocally(res.data.conversation);
      setConversationDetails(res.data.conversation);
    } catch (e: any) {
      setConversationDetailsError(e?.response?.data?.message ?? "Não foi possível atualizar a foto.");
    } finally {
      setConversationAvatarUploading(false);
    }
  }

  async function removeConversationAvatar() {
    const conversation = conversationDetails ?? activeConv;
    if (!conversation?.id) return;
    if (conversationDetailsLegacyMode) {
      setConversationDetailsError("Atualize o servidor para remover a foto desta conversa.");
      return;
    }

    setConversationAvatarRemoving(true);
    setConversationDetailsError(null);
    try {
      const res = await api.delete<ConversationDetailsResponse>(`/conversations/${conversation.id}/avatar`);
      setBrokenAvatarUrls(new Set());
      applyConversationUpdateLocally(res.data.conversation);
      setConversationDetails(res.data.conversation);
    } catch (e: any) {
      setConversationDetailsError(e?.response?.data?.message ?? "Não foi possível remover a foto.");
    } finally {
      setConversationAvatarRemoving(false);
    }
  }

  function resolveAvatarUrl(rawUrl?: string | null) {
    const absolute = toAbsoluteUrl(rawUrl);
    if (!absolute) return null;
    if (brokenAvatarUrls.has(absolute)) return null;
    return absolute;
  }

  function markAvatarBroken(rawUrl?: string | null) {
    const absolute = toAbsoluteUrl(rawUrl);
    if (!absolute) return;
    setBrokenAvatarUrls((prev) => {
      if (prev.has(absolute)) return prev;
      const next = new Set(prev);
      next.add(absolute);
      return next;
    });
  }


  function groupedMessages(items: Message[], unreadMarkerMessageId?: string | null) {
    const out: GroupedMessageRow[] = [];
    let last = "";
    let unreadInserted = false;
    let previousMessage: Message | null = null;

    for (const msg of items) {
      if (!unreadInserted && unreadMarkerMessageId && msg.id === unreadMarkerMessageId) {
        out.push({ kind: "unread" });
        unreadInserted = true;
      }

      const label = fmtDayLabel(msg.createdAt);
      if (label !== last) {
        out.push({ kind: "sep", label });
        last = label;
        previousMessage = null;
      }

      out.push({
        kind: "msg",
        value: msg,
        startsSenderBlock: !previousMessage || previousMessage.senderId !== msg.senderId,
      });
      previousMessage = msg;
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

  const companyOptions = useMemo(() => {
    return Array.from(new Set(users.map((u) => u.company?.name).filter(Boolean) as string[])).sort(compareAlpha);
  }, [users]);

  const departmentOptions = useMemo(() => {
    return Array.from(new Set(users.map((u) => u.department?.name).filter(Boolean) as string[])).sort(compareAlpha);
  }, [users]);

  const companyRuleOptions = useMemo(() => {
    const map = new Map<string, OrgMini>();
    for (const user of users) {
      if (user.company?.id && user.company?.name) {
        map.set(user.company.id, { id: user.company.id, name: user.company.name });
      }
    }
    return Array.from(map.values()).sort((a, b) => compareAlpha(a.name, b.name));
  }, [users]);

  const departmentRuleOptions = useMemo(() => {
    const map = new Map<string, OrgMini>();
    for (const user of users) {
      if (user.department?.id && user.department?.name) {
        map.set(user.department.id, { id: user.department.id, name: user.department.name });
      }
    }
    return Array.from(map.values()).sort((a, b) => compareAlpha(a.name, b.name));
  }, [users]);

  const pickerSelectedUserSet = useMemo(
    () => new Set(pickerSelectedUserIds),
    [pickerSelectedUserIds]
  );
  const pickerFilterCompanyIds = useMemo(() => {
    if (!userCompanyFilter) return [];
    return companyRuleOptions
      .filter((item) => item.name === userCompanyFilter)
      .map((item) => item.id);
  }, [companyRuleOptions, userCompanyFilter]);
  const pickerFilterDepartmentIds = useMemo(() => {
    if (!userDepartmentFilter) return [];
    return departmentRuleOptions
      .filter((item) => item.name === userDepartmentFilter)
      .map((item) => item.id);
  }, [departmentRuleOptions, userDepartmentFilter]);
  const pickerConversation = useMemo(
    () => conversations.find((conv) => conv.id === pickerConversationId) ?? null,
    [conversations, pickerConversationId]
  );
  const pickerAvailableUsers = useMemo(() => {
    if (pickerMode !== "group-members") return usersFiltered;
    const existingIds = new Set(conversationParticipants(pickerConversation).map((user) => user.id));
    return usersFiltered.filter((user) => !existingIds.has(user.id));
  }, [pickerConversation, pickerMode, usersFiltered]);
  const pickerGroupedUsers = useMemo(() => {
    const companyMap = new Map<string, Map<string, UserMini[]>>();

    for (const user of pickerAvailableUsers) {
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
  }, [pickerAvailableUsers]);
  const pickerNeedsSelection = pickerMode === "group" || pickerMode === "broadcast" || pickerMode === "group-members";
  const pickerNeedsTitle = pickerMode === "group" || pickerMode === "broadcast";
  const pickerCanUseAutomaticAudience =
    pickerMode === "group" || pickerMode === "broadcast" || pickerMode === "group-members";
  const pickerUsesPairedAutomaticRules =
    pickerMode === "group" || pickerMode === "broadcast" || pickerMode === "group-members";
  const pickerAutomaticAudienceCandidates = useMemo(() => {
    if (pickerMode !== "group-members") return users;
    const existingIds = new Set(conversationParticipants(pickerConversation).map((user) => user.id));
    return users.filter((user) => !existingIds.has(user.id));
  }, [pickerConversation, pickerMode, users]);
  const pickerResolvedAutomaticRules = useMemo(() => {
    if (!pickerUsesPairedAutomaticRules) return [];
    return dedupeAutomaticRules(pickerAutomaticRules);
  }, [pickerAutomaticRules, pickerUsesPairedAutomaticRules]);
  const pickerAutoAudienceUsesSearchOnly =
    !pickerUsesPairedAutomaticRules &&
    pickerCanUseAutomaticAudience &&
    !!userSearch.trim() &&
    !pickerFilterCompanyIds.length &&
    !pickerFilterDepartmentIds.length;
  const pickerAutomaticAudienceScopeUsers = useMemo(() => {
    if (!pickerCanUseAutomaticAudience || !pickerIncludeAllUsers || pickerAutoAudienceUsesSearchOnly) return [];
    if (pickerUsesPairedAutomaticRules) {
      return computeAutomaticRuleUsers(
        pickerAutomaticAudienceCandidates,
        me?.id ?? null,
        pickerResolvedAutomaticRules,
        !pickerResolvedAutomaticRules.length
      );
    }
    return computeBroadcastEffectiveUsers(
      pickerAutomaticAudienceCandidates,
      me?.id ?? null,
      [],
      dedupeAutomaticRules(
        (pickerFilterCompanyIds.length ? pickerFilterCompanyIds : [null]).flatMap((companyId) =>
          (pickerFilterDepartmentIds.length ? pickerFilterDepartmentIds : [null])
            .filter((departmentId) => !!companyId || !!departmentId)
            .map((departmentId) => ({
              id: automaticRuleKey(companyId, departmentId),
              companyId,
              departmentId,
              company: null,
              department: null,
            }))
        )
      ),
      [],
      !pickerFilterCompanyIds.length && !pickerFilterDepartmentIds.length && !userSearch.trim()
    );
  }, [
    me?.id,
    pickerAutomaticAudienceCandidates,
    pickerCanUseAutomaticAudience,
    pickerFilterCompanyIds,
    pickerFilterDepartmentIds,
    pickerIncludeAllUsers,
    pickerResolvedAutomaticRules,
    pickerUsesPairedAutomaticRules,
    userSearch,
  ]);
  const pickerAutomaticAudienceScopeUserIds = useMemo(
    () => pickerAutomaticAudienceScopeUsers.map((user) => user.id),
    [pickerAutomaticAudienceScopeUsers]
  );
  const pickerAutomaticAudienceScopeUserSet = useMemo(
    () => new Set(pickerAutomaticAudienceScopeUserIds),
    [pickerAutomaticAudienceScopeUserIds]
  );
  const pickerAutomaticAudienceActive =
    pickerCanUseAutomaticAudience &&
    pickerIncludeAllUsers &&
    (pickerUsesPairedAutomaticRules || !pickerAutoAudienceUsesSearchOnly);
  const pickerAutomaticAudienceConfig = useMemo(
    () => ({
      automaticRules:
        pickerUsesPairedAutomaticRules && pickerAutomaticAudienceActive
          ? pickerResolvedAutomaticRules.map((rule) => ({
              companyId: rule.companyId ?? null,
              departmentId: rule.departmentId ?? null,
            }))
          : [],
      companyIds:
        !pickerUsesPairedAutomaticRules && pickerAutomaticAudienceActive ? pickerFilterCompanyIds : [],
      departmentIds:
        !pickerUsesPairedAutomaticRules && pickerAutomaticAudienceActive ? pickerFilterDepartmentIds : [],
      includeAllUsers:
        pickerAutomaticAudienceActive &&
        (pickerUsesPairedAutomaticRules
          ? !pickerResolvedAutomaticRules.length
          : !pickerFilterCompanyIds.length && !pickerFilterDepartmentIds.length && !userSearch.trim()),
    }),
    [
      pickerAutomaticAudienceActive,
      pickerFilterCompanyIds,
      pickerFilterDepartmentIds,
      pickerResolvedAutomaticRules,
      pickerUsesPairedAutomaticRules,
      userSearch,
    ]
  );
  const pickerFilteredUserIds = useMemo(
    () => pickerAvailableUsers.map((user) => user.id),
    [pickerAvailableUsers]
  );
  const pickerAllFilteredSelected =
    pickerFilteredUserIds.length > 0 &&
    pickerFilteredUserIds.every((userId) => pickerSelectedUserSet.has(userId));
  const pickerHasAudience =
    pickerSelectedUserIds.length > 0 ||
    pickerAutomaticAudienceActive;
  const pickerSelectionLockedByAutomaticAudience =
    pickerAutomaticAudienceActive && pickerAutomaticAudienceScopeUserIds.length > 0;
  const pickerAutomaticAudienceGuide = useMemo(() => {
    const searchValue = userSearch.trim();
    const hasCompanyFilter = !!userCompanyFilter;
    const hasDepartmentFilter = !!userDepartmentFilter;
    const targetLabel = pickerMode === "broadcast" ? "nesta lista" : "neste grupo";
    const activeRuleLabels = pickerResolvedAutomaticRules.map((rule) => {
      const companyName = rule.company?.name ?? "todas as empresas";
      const departmentName = rule.department?.name ?? "todos os setores";
      return `${companyName} + ${departmentName}`;
    });

    if (pickerUsesPairedAutomaticRules) {
      if (pickerAutomaticAudienceActive) {
        if (pickerAutomaticAudienceConfig.includeAllUsers) {
          return {
            tone: "warning" as const,
            title: "Inclusão automática ativa para todos os usuários",
            description: `Além das pessoas escolhidas agora, todo usuário novo criado no sistema entrará automaticamente ${targetLabel}.`,
            items: [
              "Sem nenhuma regra salva, o sistema entende que este grupo deve aceitar todo mundo.",
              "Use o botão de configurações para limitar por empresa e setor quando quiser algo mais específico.",
              searchValue
                ? `A busca "${searchValue}" continua servindo só para filtrar a lista visível agora.`
                : "As regras automáticas agora são configuradas somente no botão de configurações.",
            ],
          };
        }

        return {
          tone: "success" as const,
          title:
            activeRuleLabels.length === 1
              ? "Inclusão automática ativa"
              : `${activeRuleLabels.length} regras automáticas ativas`,
          description: `Novos usuários compatíveis com essas regras entrarão automaticamente ${targetLabel}.`,
          items: [
            ...activeRuleLabels.map((label) => `Regra ativa: ${label}.`),
            searchValue
              ? `A busca "${searchValue}" continua filtrando só os resultados da tela; ela não altera as regras salvas.`
              : "Você pode abrir o botão de configurações a qualquer momento para adicionar ou remover regras.",
          ],
        };
      }

      if (pickerAutomaticRules.length) {
        return {
          tone: "info" as const,
          title: "Regras prontas para usar",
          description: "As regras já estão salvas. Ligue “Incluir novos usuários” para começar a aplicá-las.",
          items: activeRuleLabels.map((label) => `Regra configurada: ${label}.`),
        };
      }

      return {
        tone: "info" as const,
        title: "Como funciona a inclusão automática",
        description:
          "A pesquisa acima serve só para encontrar pessoas na lista de agora. Para incluir usuários novos no futuro, use o botão de configurações.",
        items: [
          "O botão de configurações abre a tela onde você monta regras de empresa + setor.",
          "Se você ligar “Incluir novos usuários” sem salvar nenhuma regra, o grupo passa a aceitar todos os usuários novos do sistema.",
          "As regras ficam salvas mesmo desligadas, então você pode preparar tudo antes e ativar só quando quiser.",
        ],
      };
    }

    if (pickerIncludeAllUsers && pickerAutoAudienceUsesSearchOnly) {
      return {
        tone: "danger" as const,
        title: "Assim não dá para ativar",
        description:
          "A busca por nome, e-mail ou ramal serve só para encontrar pessoas agora. Para adicionar novos usuários automaticamente, escolha empresa e/ou setor, ou limpe a busca para valer para todo mundo.",
        items: [
          `Busca atual: "${searchValue}" não cria uma regra automática sozinha.`,
          "Se você quer todo mundo, limpe a busca e deixe empresa e setor em 'Todos'.",
          "Se você quer um grupo específico, escolha empresa e/ou setor antes de ligar essa opção.",
        ],
      };
    }

    if (pickerAutomaticAudienceActive) {
      if (pickerAutomaticAudienceConfig.includeAllUsers) {
        return {
          tone: "warning" as const,
          title: "Regra automática ativa para todos os usuários",
          description: `Além das pessoas escolhidas agora, todo usuário novo criado no sistema entrará automaticamente ${targetLabel}.`,
          items: [
            "Use isso somente quando essa lista ou grupo realmente for geral.",
            "Se quiser limitar quem entra sozinho, escolha empresa e/ou setor antes de ativar.",
            searchValue
              ? `A busca "${searchValue}" vale só para os contatos visíveis agora; os novos usuários entrarão sem depender dessa busca.`
              : "",
          ].filter(Boolean),
        };
      }

      const scopeParts: string[] = [];
      if (hasCompanyFilter) scopeParts.push(`empresa ${userCompanyFilter}`);
      if (hasDepartmentFilter) scopeParts.push(`setor ${userDepartmentFilter}`);
      const scopeLabel = scopeParts.length ? scopeParts.join(" e ") : "todos os usuários";
      return {
        tone: "success" as const,
        title: "Regra automática ativa",
        description: `Além das pessoas escolhidas agora, novos usuários de ${scopeLabel} entrarão automaticamente ${targetLabel}.`,
        items: [
          hasCompanyFilter && hasDepartmentFilter
            ? `Exemplo: se alguém novo for criado em ${userCompanyFilter} / ${userDepartmentFilter}, ele já entra sozinho.`
            : hasCompanyFilter
            ? `Todo usuário novo da empresa ${userCompanyFilter} entrará sozinho.`
            : `Todo usuário novo do setor ${userDepartmentFilter} entrará sozinho.`,
          searchValue
            ? `A busca "${searchValue}" vale só para os contatos desta tela agora. A regra automática segue empresa e setor.`
            : "Os contatos selecionados agora continuam entrando normalmente junto com os novos cadastros dessa regra.",
        ],
      };
    }

    if (searchValue && !hasCompanyFilter && !hasDepartmentFilter) {
      return {
        tone: "warning" as const,
        title: "A busca de texto não cria regra automática",
        description:
          "Buscar por nome, e-mail ou ramal filtra apenas os contatos mostrados agora. Isso não serve para decidir quem vai entrar sozinho no futuro.",
        items: [
          `Com a busca "${searchValue}", use o botão para selecionar as pessoas visíveis agora.`,
          "Para adicionar novos usuários automaticamente no futuro, escolha empresa e/ou setor e depois ligue essa opção.",
          "Se quiser uma regra geral para todo mundo, limpe a busca e ative com empresa e setor em 'Todos'.",
        ],
      };
    }

    if (hasCompanyFilter || hasDepartmentFilter) {
      const scopeParts: string[] = [];
      if (hasCompanyFilter) scopeParts.push(`empresa ${userCompanyFilter}`);
      if (hasDepartmentFilter) scopeParts.push(`setor ${userDepartmentFilter}`);
      const scopeLabel = scopeParts.length ? scopeParts.join(" e ") : "todos os usuários";
      return {
        tone: "info" as const,
        title: "Você já deixou a regra pronta",
        description: `Se ligar essa opção agora, novos usuários de ${scopeLabel} entrarão automaticamente ${targetLabel}.`,
        items: [
          "Deixe desligado se você quer adicionar só os contatos atuais desta pesquisa.",
          "Ligue quando quiser que os próximos cadastros com essa mesma configuração também entrem sozinhos.",
          searchValue
            ? `A busca "${searchValue}" vale só para a seleção de agora. A regra automática usará apenas empresa e setor.`
            : "",
        ].filter(Boolean),
      };
    }

    return {
      tone: "info" as const,
      title: "Como funciona a entrada automática",
      description: `Ative essa opção para colocar novos usuários automaticamente ${targetLabel}, sem precisar editar de novo depois.`,
      items: [
        "Use empresa e/ou setor para limitar quem entra sozinho.",
        "Se você ativar com tudo limpo, a regra passa a valer para todos os usuários novos do sistema.",
        "A busca por nome, e-mail ou ramal serve apenas para encontrar pessoas agora; ela não cria uma regra automática.",
      ],
    };
  }, [
    pickerAutoAudienceUsesSearchOnly,
    pickerAutomaticAudienceActive,
    pickerAutomaticAudienceConfig.includeAllUsers,
    pickerAutomaticRules,
    pickerIncludeAllUsers,
    pickerMode,
    pickerResolvedAutomaticRules,
    pickerUsesPairedAutomaticRules,
    userCompanyFilter,
    userDepartmentFilter,
    userSearch,
  ]);
  const pickerPrimaryLabel =
    pickerMode === "group"
      ? "Criar grupo"
      : pickerMode === "broadcast"
      ? "Criar lista"
      : pickerMode === "group-members"
      ? "Adicionar pessoas"
      : "";
  const pickerTitleSectionLabel =
    pickerMode === "group"
      ? "Nome do grupo"
      : pickerMode === "broadcast"
      ? "Nome da lista de transmissão"
      : "Nome";
  const pickerTitlePlaceholder =
    pickerMode === "group"
      ? "De um nome para o grupo"
      : pickerMode === "broadcast"
      ? "De um nome para a lista"
      : "Digite um nome";
  const pickerAudienceSectionLabel =
    pickerMode === "group" || pickerMode === "group-members"
      ? "Participantes"
      : pickerMode === "broadcast"
      ? "Destinatários"
      : "Contatos";

  const conversationDetailsEffectiveTargets = useMemo(() => {
    if (!conversationDetails || conversationKind(conversationDetails) !== "BROADCAST") return [];
    if (!users.length) return conversationDetails.effectiveBroadcastTargets ?? [];
    return computeBroadcastEffectiveUsers(
      users,
      conversationDetails.createdById,
      conversationDetailsSelectedUserIds,
      dedupeAutomaticRules(conversationDetailsAutomaticRules),
      conversationDetailsExcludedUserIds,
      conversationDetailsIncludeAllUsers
    );
  }, [
    users,
    conversationDetails,
    conversationDetailsSelectedUserIds,
    conversationDetailsAutomaticRules,
    conversationDetailsExcludedUserIds,
    conversationDetailsIncludeAllUsers,
  ]);

  const conversationDetailsAvailableTargets = useMemo(() => {
    if (!conversationDetails || conversationKind(conversationDetails) !== "BROADCAST") return [];
    const effectiveIds = new Set(conversationDetailsEffectiveTargets.map((user) => user.id));
    const ownerId = conversationDetails.createdById ?? null;
    const source = users.length ? users : conversationDetails.availableBroadcastUsers ?? [];
    return source
      .filter((user) => user.id !== ownerId && !effectiveIds.has(user.id))
      .sort((a, b) => compareAlpha(a.name || a.username, b.name || b.username));
  }, [users, conversationDetails, conversationDetailsEffectiveTargets]);
  const conversationDetailsAutomaticRuleLabels = useMemo(
    () =>
      dedupeAutomaticRules(conversationDetailsAutomaticRules).map((rule) => {
        const companyName = rule.company?.name ?? "Todas as empresas";
        const departmentName = rule.department?.name ?? "Todos os setores";
        return `${companyName} + ${departmentName}`;
      }),
    [conversationDetailsAutomaticRules]
  );

  const favoriteMessages = useMemo(() => {
    return messages.filter((m) => m.isFavorited);
  }, [messages]);
  const selectedConversationIdSet = useMemo(() => new Set(selectedConversationIds), [selectedConversationIds]);
  const selectedConversations = useMemo(
    () => conversations.filter((conv) => selectedConversationIdSet.has(conv.id)),
    [conversations, selectedConversationIdSet]
  );
  const allConversationsSelected =
    conversations.length > 0 && selectedConversationIds.length === conversations.length;
  const pendingConversationCountdownSeconds = Math.max(0, Math.ceil(pendingConversationCountdownMs / 1000));
  const selectedMessageIdSet = useMemo(() => new Set(selectedMessageIds), [selectedMessageIds]);
  const selectableMessageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const selectedMessages = useMemo(
    () => messages.filter((m) => selectedMessageIdSet.has(m.id)),
    [messages, selectedMessageIdSet]
  );
  const allMessagesSelected =
    selectableMessageIds.length > 0 && selectedMessageIds.length === selectableMessageIds.length;
  const pendingDeleteCountdownSeconds = Math.max(0, Math.ceil(pendingDeleteCountdownMs / 1000));
  const pendingActionToast = useMemo(() => {
    if (pendingDeleteBatch) {
      return {
        key: `message-delete:${pendingDeleteBatch.token}`,
        label: pendingMessageDeleteLabel(pendingDeleteBatch.ids.length),
        seconds: pendingDeleteCountdownSeconds,
        progress: Math.max(0, Math.min(100, (pendingDeleteCountdownMs / 5000) * 100)),
        onUndo: undoPendingDeleteBatch,
      };
    }
    if (pendingConversationHideBatch) {
      return {
        key: `conversation-hide:${pendingConversationHideBatch.token}`,
        label: pendingConversationHideLabel(pendingConversationHideBatch.ids.length),
        seconds: pendingConversationCountdownSeconds,
        progress: Math.max(0, Math.min(100, (pendingConversationCountdownMs / 5000) * 100)),
        onUndo: undoPendingConversationHide,
      };
    }
    if (pendingConversationClearBatch) {
      return {
        key: `conversation-clear:${pendingConversationClearBatch.token}`,
        label: "Limpando conversa",
        seconds: pendingConversationCountdownSeconds,
        progress: Math.max(0, Math.min(100, (pendingConversationCountdownMs / 5000) * 100)),
        onUndo: undoPendingConversationClear,
      };
    }
    if (pendingBroadcastDeleteBatch) {
      return {
        key: `broadcast-delete:${pendingBroadcastDeleteBatch.token}`,
        label: "Excluindo lista",
        seconds: pendingConversationCountdownSeconds,
        progress: Math.max(0, Math.min(100, (pendingConversationCountdownMs / 5000) * 100)),
        onUndo: undoPendingBroadcastDelete,
      };
    }
    return null;
  }, [
    pendingBroadcastDeleteBatch,
    pendingConversationClearBatch,
    pendingConversationCountdownMs,
    pendingConversationCountdownSeconds,
    pendingConversationHideBatch,
    pendingDeleteBatch,
    pendingDeleteCountdownMs,
    pendingDeleteCountdownSeconds,
  ]);

  const currentViewerItem = imageViewerItems[imageViewerIndex] ?? null;
  const currentViewerUrl = toAbsoluteUrl(currentViewerItem?.attachmentUrl);
  const currentViewerIsVideo = currentViewerItem ? isVideoAttachment(currentViewerItem) : false;
  const canViewPrev = imageViewerIndex > 0;
  const canViewNext = imageViewerIndex < imageViewerItems.length - 1;
  const showMobileSidebar = !isMobileLayout || !activeConv;
  const showMobileMain = !isMobileLayout || !!activeConv;
  const canSendInActiveConversation =
    !!activeConv &&
    !(
      (conversationKind(activeConv) === "GROUP" || conversationKind(activeConv) === "BROADCAST") &&
      activeConv.isCurrentParticipant === false
    );
  const conversationMenuConversation = useMemo(
    () => conversations.find((conv) => conv.id === conversationMenuId) ?? null,
    [conversations, conversationMenuId]
  );
  const conversationDetailsKind = conversationKind(conversationDetails ?? activeConv);
  const conversationDetailsParticipants = conversationParticipants(conversationDetails);
  const groupMemberMenuTarget = useMemo(
    () => conversationDetailsParticipants.find((user) => user.id === groupMemberMenuUserId) ?? null,
    [conversationDetailsParticipants, groupMemberMenuUserId]
  );
  const conversationDetailsCanManageGroup = canManageGroupConversation(conversationDetails, me?.id ?? null);
  const conversationDetailsCanManageAvatar =
    !conversationDetailsLegacyMode && canManageConversationAvatar(conversationDetails, me?.id ?? null);
  const conversationDetailsCanEditBroadcast =
    conversationDetailsKind === "BROADCAST" &&
    conversationDetails?.createdById === me?.id &&
    conversationDetails?.isCurrentParticipant !== false;

  function closeConversationMenu() {
    setConversationMenuId(null);
    setConversationMenuPosition(null);
    conversationMenuTriggerRef.current = null;
  }

  function closeGroupMemberMenu() {
    setGroupMemberMenuUserId(null);
    setGroupMemberMenuPosition(null);
    groupMemberMenuTriggerRef.current = null;
  }

  function clearPickerGuideHideTimer() {
    if (pickerGuideHideTimerRef.current != null) {
      window.clearTimeout(pickerGuideHideTimerRef.current);
      pickerGuideHideTimerRef.current = null;
    }
  }

  function openPickerGuideTooltip() {
    clearPickerGuideHideTimer();
    setPickerGuideOpen(true);
  }

  function closePickerGuideTooltip(delay = 90) {
    clearPickerGuideHideTimer();
    if (delay <= 0) {
      setPickerGuideOpen(false);
      return;
    }
    pickerGuideHideTimerRef.current = window.setTimeout(() => {
      setPickerGuideOpen(false);
      pickerGuideHideTimerRef.current = null;
    }, delay);
  }

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
        removeMessagesFromLocalState([payload.messageId]);
      }
    });

    s.on("messages:hidden", (payload: { messageIds: string[]; conversationId: string }) => {
      if (payload.conversationId === activeConvIdRef.current) {
        removeMessagesFromLocalState(payload.messageIds);
      }
    });

    s.on("conversation:cleared", (payload: { conversationId: string }) => {
      if (payload.conversationId === activeConvIdRef.current) setMessages([]);
    });

    s.on("conversation:hidden", (payload: { conversationId: string }) => {
      setConversations((prev) => prev.filter((conv) => conv.id !== payload.conversationId));
      if (payload.conversationId === activeConvIdRef.current) {
        activeConvIdRef.current = null;
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
        void loadConversations(activeConvIdRef.current ?? undefined, { silent: true }).catch(() => {});
        return;
      }

      const conversationId = payload?.conversationId ?? null;
      if (!conversationId) {
        void loadConversations(activeConvIdRef.current ?? undefined, { silent: true }).catch(() => {});
        return;
      }

      const hasConversation = conversationsRef.current.some((conv) => conv.id === conversationId);
      if (!hasConversation) {
        void loadConversations(activeConvIdRef.current ?? undefined, { silent: true }).catch(() => {});
      }
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    void (async () => {
      try {
        await loadMe();
        await loadConversations();
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!token) return;

    function retryConversationLoad() {
      if (document.hidden) return;
      if (loadingConvs) return;
      if (conversationsRef.current.length > 0 && !conversationsError) return;
      void loadConversations(activeConvIdRef.current ?? undefined).catch(() => {});
    }

    window.addEventListener("focus", retryConversationLoad);
    document.addEventListener("visibilitychange", retryConversationLoad);
    return () => {
      window.removeEventListener("focus", retryConversationLoad);
      document.removeEventListener("visibilitychange", retryConversationLoad);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, loadingConvs, conversationsError]);

  useEffect(() => {
    if (!pickerOpen && !conversationDetailsOpen) return;
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen, conversationDetailsOpen]);

  useEffect(() => {
    if (!groupMemberMenuUserId) return;
    if (!groupMemberMenuTarget) {
      closeGroupMemberMenu();
    }
  }, [groupMemberMenuTarget, groupMemberMenuUserId]);

  useEffect(() => {
    if (!groupMemberMenuUserId) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (groupMemberMenuRef.current?.contains(target)) return;
      if (groupMemberMenuTriggerRef.current?.contains(target)) return;
      closeGroupMemberMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeGroupMemberMenu();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [groupMemberMenuUserId]);

  useEffect(() => {
    if (!pickerAutomaticAudienceActive) {
      pickerAutoManagedUserIdsRef.current = new Set();
      return;
    }

    const previousManaged = pickerAutoManagedUserIdsRef.current;
    const nextManagedSet = new Set(pickerAutomaticAudienceScopeUserIds);

    setPickerSelectedUserIds((prev) => {
      const next = prev.filter((userId) => !previousManaged.has(userId));
      const nextSet = new Set(next);
      for (const userId of pickerAutomaticAudienceScopeUserIds) {
        if (nextSet.has(userId)) continue;
        nextSet.add(userId);
        next.push(userId);
      }
      if (next.length === prev.length && next.every((userId, index) => userId === prev[index])) {
        return prev;
      }
      return next;
    });
    pickerAutoManagedUserIdsRef.current = nextManagedSet;
  }, [pickerAutomaticAudienceActive, pickerAutomaticAudienceScopeUserIds]);

  useEffect(() => {
    if (pickerOpen && pickerCanUseAutomaticAudience) return;
    setPickerGuideOpen(false);
    setPickerGuidePosition(null);
    pickerGuideTriggerRef.current = null;
    clearPickerGuideHideTimer();
  }, [pickerCanUseAutomaticAudience, pickerOpen]);

  useEffect(
    () => () => {
      clearPickerGuideHideTimer();
    },
    []
  );

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
    const conversationId = activeConv?.id;
    if (!conversationId) {
      setMediaRetentionPolicy(null);
      return;
    }

    let canceled = false;
    api
      .get<MediaRetentionPolicyResponse>(`/conversations/${conversationId}/media-retention-policy`)
      .then((res) => {
        if (canceled) return;
        setMediaRetentionPolicy(res.data);
      })
      .catch(() => {
        if (canceled) return;
        setMediaRetentionPolicy(null);
      });

    return () => {
      canceled = true;
    };
  }, [activeConv?.id, api]);

  useEffect(() => {
    syncUnreadJumpButton();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, unreadAnchorMessageId, activeConv?.id]);

  useEffect(() => {
    if (!activeConv?.id || !messages.length || !messagesNextCursor || loadingMsgs || loadingOlderMsgs) return;
    const el = msgListRef.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + MESSAGE_LIST_AUTOLOAD_THRESHOLD) return;
    void loadOlderMessages(activeConv.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConv?.id, messages.length, messagesNextCursor, loadingMsgs, loadingOlderMsgs]);

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

  useEffect(() => {
    if (!actionMenuMsgId) {
      setActionMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = document.querySelector<HTMLElement>(`[data-msg-menu-trigger="${actionMenuMsgId}"]`);
      const menu = actionMenuRef.current;
      if (!trigger || !menu) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 6;

      const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
      const availableAbove = triggerRect.top - viewportPadding;
      const shouldOpenUp = availableBelow < menuRect.height + gap && availableAbove > availableBelow;

      const top = shouldOpenUp
        ? Math.max(viewportPadding, triggerRect.top - menuRect.height - gap)
        : Math.min(window.innerHeight - viewportPadding - menuRect.height, triggerRect.bottom + gap);

      let left =
        actionMenuAlign === "right"
          ? triggerRect.right - menuRect.width
          : triggerRect.left;
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - viewportPadding - menuRect.width));

      setActionMenuPosition((prev) =>
        prev && prev.top === top && prev.left === left ? prev : { top, left }
      );
    };

    const raf = requestAnimationFrame(updatePosition);
    const scrollHost = msgListRef.current;
    scrollHost?.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition);

    return () => {
      cancelAnimationFrame(raf);
      scrollHost?.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [actionMenuAlign, actionMenuMsgId, reactionBarMsgId, reactionPickerMsgId]);

  useLayoutEffect(() => {
    if (!conversationMenuId) {
      setConversationMenuPosition(null);
      conversationMenuTriggerRef.current = null;
      return;
    }

    const updatePosition = () => {
      const trigger =
        (conversationMenuTriggerRef.current?.isConnected ? conversationMenuTriggerRef.current : null) ??
        convListRef.current?.querySelector<HTMLButtonElement>(`[data-conv-menu-trigger="${conversationMenuId}"]`) ??
        null;
      const menu = conversationMenuRef.current;
      if (!trigger || !menu) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 6;

      const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
      const availableAbove = triggerRect.top - viewportPadding;
      const shouldOpenUp = availableBelow < menuRect.height + gap && availableAbove > availableBelow;

      const top = shouldOpenUp
        ? Math.max(viewportPadding, triggerRect.top - menuRect.height - gap)
        : Math.min(window.innerHeight - viewportPadding - menuRect.height, triggerRect.bottom + gap);

      let left = triggerRect.right - menuRect.width;
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - viewportPadding - menuRect.width));

      setConversationMenuPosition((prev) =>
        prev && prev.top === top && prev.left === left ? prev : { top, left }
      );
    };

    const raf = requestAnimationFrame(updatePosition);
    const scrollHost = convListRef.current;
    scrollHost?.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      cancelAnimationFrame(raf);
      scrollHost?.removeEventListener("scroll", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [conversationMenuId]);

  useLayoutEffect(() => {
    if (!groupMemberMenuUserId) {
      setGroupMemberMenuPosition(null);
      groupMemberMenuTriggerRef.current = null;
      return;
    }

    const updatePosition = () => {
      const trigger =
        (groupMemberMenuTriggerRef.current?.isConnected ? groupMemberMenuTriggerRef.current : null) ??
        document.querySelector<HTMLButtonElement>(`[data-group-member-menu-trigger="${groupMemberMenuUserId}"]`) ??
        null;
      const menu = groupMemberMenuRef.current;
      if (!trigger || !menu) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 6;

      const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
      const availableAbove = triggerRect.top - viewportPadding;
      const shouldOpenUp = availableBelow < menuRect.height + gap && availableAbove > availableBelow;

      const top = shouldOpenUp
        ? Math.max(viewportPadding, triggerRect.top - menuRect.height - gap)
        : Math.min(window.innerHeight - viewportPadding - menuRect.height, triggerRect.bottom + gap);

      let left = triggerRect.right - menuRect.width;
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - viewportPadding - menuRect.width));

      setGroupMemberMenuPosition((prev) =>
        prev && prev.top === top && prev.left === left ? prev : { top, left }
      );
    };

    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [groupMemberMenuUserId]);

  useLayoutEffect(() => {
    if (!pickerGuideOpen || !pickerOpen || !pickerCanUseAutomaticAudience) {
      setPickerGuidePosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = pickerGuideTriggerRef.current?.isConnected ? pickerGuideTriggerRef.current : null;
      const tooltip = pickerGuideTooltipRef.current;
      if (!trigger || !tooltip) return;

      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 8;

      const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
      const availableAbove = triggerRect.top - viewportPadding;
      const shouldOpenUp = availableBelow < tooltipRect.height + gap && availableAbove > availableBelow;

      const top = shouldOpenUp
        ? Math.max(viewportPadding, triggerRect.top - tooltipRect.height - gap)
        : Math.min(window.innerHeight - viewportPadding - tooltipRect.height, triggerRect.bottom + gap);

      let left = triggerRect.right - tooltipRect.width;
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - viewportPadding - tooltipRect.width));

      setPickerGuidePosition((prev) =>
        prev && prev.top === top && prev.left === left ? prev : { top, left }
      );
    };

    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [
    pickerAutomaticAudienceGuide.description,
    pickerAutomaticAudienceGuide.items,
    pickerAutomaticAudienceGuide.title,
    pickerAutomaticAudienceGuide.tone,
    pickerCanUseAutomaticAudience,
    pickerGuideOpen,
    pickerOpen,
  ]);

  return (
    <div className="chat-shell">
      <TopNav
        title="BHASH • Chat"
        subtitle={me ? `${me.name}` : ""}
        theme={theme}
        onToggleTheme={toggleTheme}
        logoSrc={resolvedLogoUrl}
        rightSlot={
          <button className="chat-dangerBtn topnav-logoutBtn" onClick={logoff} title="Logoff" aria-label="Logoff">
            <LogOutIcon />
          </button>
        }
      />

      <div className={`chat-layout ${isMobileLayout ? "is-mobile" : ""}`}>
        {showMobileSidebar ? (
        <aside className="chat-sidebar">
          <div className="chat-sidebar__header">
            <div className="chat-sidebar__title">Conversas</div>
            <div className="chat-sidebar__actions" ref={createMenuRef}>
              <button className="chat-iconBtn" onClick={() => setMyInfoOpen(true)} title="Minhas informações">
                <GearIcon />
              </button>
              <button
                className="chat-primaryIconBtn chat-primaryIconBtn--round"
                onClick={() => setCreateMenuOpen((prev) => !prev)}
                title="Criar conversa, grupo ou lista"
                aria-haspopup="menu"
                aria-expanded={createMenuOpen}
              >
                <ComposeConversationIcon />
              </button>
              {createMenuOpen ? (
                <div className="chat-createMenu" role="menu">
                  <button
                    className="chat-createMenu__item"
                    onClick={() => openCreatePicker("broadcast")}
                    role="menuitem"
                  >
                    Nova lista
                  </button>
                  <button
                    className="chat-createMenu__item"
                    onClick={() => openCreatePicker("group")}
                    role="menuitem"
                  >
                    Novo grupo
                  </button>
                  <button
                    className="chat-createMenu__item"
                    onClick={() => openCreatePicker("direct")}
                    role="menuitem"
                  >
                    Nova conversa
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {conversationSelectMode ? (
            <div className="chat-convSelectBar">
              <button className="chat-iconBtn chat-iconBtn--sm" onClick={stopConversationSelectMode} title="Fechar seleção">
                <CloseIcon />
              </button>
              <div className="chat-convSelectBar__count">
                {selectedConversationIds.length}{" "}
                {selectedConversationIds.length === 1 ? "contato selecionado" : "contatos selecionados"}
              </div>
              <button className="chat-convSelectBar__selectAll" onClick={toggleSelectAllConversations}>
                {allConversationsSelected ? "Desmarcar todos" : "Selecionar todos"}
              </button>
              <button
                className="chat-iconBtn chat-iconBtn--sm is-danger"
                onClick={requestRemoveSelectedConversations}
                title="Apagar chats selecionados"
                disabled={!selectedConversationIds.length}
              >
                <TrashIcon />
              </button>
            </div>
          ) : null}

          <div className="chat-sidebar__list" ref={convListRef}>
            {loadingConvs ? (
              <div className="chat-empty">Carregando conversas…</div>
            ) : conversationsError ? (
              <div className="chat-emptyState">
                <div className="chat-error">{conversationsError}</div>
                <button
                  type="button"
                  className="chat-emptyState__action"
                  onClick={() => void loadConversations(activeConvIdRef.current ?? undefined).catch(() => {})}
                >
                  Tentar novamente
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="chat-empty">Nenhuma conversa ainda.</div>
            ) : (
              conversations.map((conv) => {
                const active = activeConv?.id === conv.id;
                const title = conversationDisplayName(conv);
                const avatar = resolveAvatarUrl(conversationAvatarUrl(conv));
                const previewText = conversationPreviewText(conv, me?.id ?? null);
                const conversationTime = fmtTime(
                  conv.lastMessage?.createdAt ?? conv.updatedAt ?? conv.createdAt
                );

                return (
                  <div
                    key={conv.id}
                    className={`chat-convCardWrap ${conversationSelectMode ? "is-selecting" : ""} ${
                      selectedConversationIdSet.has(conv.id) ? "is-selected" : ""
                    }`}
                    data-conv-id={conv.id}
                  >
                    {conversationSelectMode ? (
                      <button
                        type="button"
                        className={`chat-convSelectToggle ${selectedConversationIdSet.has(conv.id) ? "is-selected" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleConversationSelection(conv.id);
                        }}
                        aria-pressed={selectedConversationIdSet.has(conv.id)}
                        title={selectedConversationIdSet.has(conv.id) ? "Desmarcar chat" : "Selecionar chat"}
                      >
                        <span aria-hidden="true">{selectedConversationIdSet.has(conv.id) ? "✓" : ""}</span>
                      </button>
                    ) : null}
                    <button
                      className={`chat-convCard ${active ? "is-active" : ""} ${
                        conv.unreadCount ? "has-unread" : ""
                      } ${conv.pinned ? "has-pin" : ""} ${
                        conversationSelectMode ? "is-selectable" : ""
                      } ${selectedConversationIdSet.has(conv.id) ? "is-selected" : ""}`}
                      onClick={() =>
                        conversationSelectMode
                          ? toggleConversationSelection(conv.id)
                          : void openConversation(conv)
                      }
                    >
                      <div className="chat-avatar chat-avatar--md">
                        {avatar ? (
                          <img
                            src={avatar}
                            alt={title}
                            onError={() => markAvatarBroken(conversationAvatarUrl(conv))}
                          />
                        ) : (
                          <span>{conversationAvatarFallback(conv)}</span>
                        )}
                      </div>

                      <div className="chat-convCard__main">
                        <div className="chat-convCard__nameRow">
                          <span className="chat-convCard__name">{title}</span>
                        </div>
                        <div className="chat-convCard__meta">{previewText}</div>
                      </div>

                      <div className="chat-convCard__side" aria-hidden="true">
                        <span className="chat-convCard__time">{conversationTime}</span>
                        <div className="chat-convCard__status">
                          {conv.pinned ? (
                            <span className="chat-convPinIcon" title="Conversa fixada">
                              <PinIcon />
                            </span>
                          ) : null}
                          {conv.unreadCount ? <span className="chat-unreadBadge">{conv.unreadCount}</span> : null}
                        </div>
                      </div>
                    </button>

                    {!conversationSelectMode ? (
                      <button
                        className={`chat-convMenuBtn ${conversationMenuId === conv.id ? "is-open" : ""}`}
                        data-conv-menu-trigger={conv.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionMenuMsgId(null);
                          setReactionBarMsgId(null);
                          setReactionPickerMsgId(null);
                          setConversationMenuPosition(null);
                          conversationMenuTriggerRef.current = e.currentTarget;
                          setConversationMenuId((prev) => {
                            const next = prev === conv.id ? null : conv.id;
                            if (!next) {
                              conversationMenuTriggerRef.current = null;
                            }
                            return next;
                          });
                        }}
                        title="Ações da conversa"
                      >
                        <DotsIcon />
                      </button>
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
                      activeConvIdRef.current = null;
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

                {conversationKind(activeConv) === "DIRECT" ? (
                  <button className="chat-contactBtn" onClick={() => void loadProfileDrawer()}>
                    <div className="chat-avatar chat-avatar--lg">
                      {(() => {
                        const avatar = resolveAvatarUrl(conversationAvatarUrl(activeConv));
                        return avatar ? (
                          <img
                            src={avatar}
                            alt={conversationDisplayName(activeConv)}
                            onError={() => markAvatarBroken(conversationAvatarUrl(activeConv))}
                          />
                        ) : (
                          <span>{conversationAvatarFallback(activeConv)}</span>
                        );
                      })()}
                    </div>

                    <div className="chat-mainHeader__text">
                      <div className="chat-mainHeader__name">{conversationDisplayName(activeConv)}</div>
                      <div className="chat-mainHeader__sub">{conversationSummaryLine(activeConv)}</div>
                    </div>
                  </button>
                ) : (
                  <button className="chat-contactBtn" onClick={() => void loadConversationDetailsDrawer(activeConv)}>
                    <div className="chat-avatar chat-avatar--lg">
                      {(() => {
                        const avatar = resolveAvatarUrl(conversationAvatarUrl(activeConv));
                        return avatar ? (
                          <img
                            src={avatar}
                            alt={conversationDisplayName(activeConv)}
                            onError={() => markAvatarBroken(conversationAvatarUrl(activeConv))}
                          />
                        ) : (
                          <span>{conversationAvatarFallback(activeConv)}</span>
                        );
                      })()}
                    </div>

                    <div className="chat-mainHeader__text">
                      <div className="chat-mainHeader__name">{conversationDisplayName(activeConv)}</div>
                      <div className="chat-mainHeader__sub">{conversationSummaryLine(activeConv)}</div>
                    </div>
                  </button>
                )}
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
                if (unreadAnchorMessageId && !nearBottom) {
                  canConsumeUnreadAnchorRef.current = true;
                }
                if (nearBottom) {
                  setShowJumpNew(false);
                  setNewMsgsCount(0);
                }
                syncUnreadJumpButton();
                if (!activeConv?.id || !messagesNextCursor || loadingMsgs || loadingOlderMsgs) return;
                if (el.scrollTop < MESSAGE_LIST_TOP_LOAD_THRESHOLD) {
                  void loadOlderMessages(activeConv.id);
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
                  {loadingOlderMsgs ? (
                    <div className="chat-topHint">Carregando mensagens antigas…</div>
                  ) : messagesNextCursor ? (
                    <div className="chat-topHint">Role para cima para carregar mais</div>
                  ) : messages.length ? (
                    <div className="chat-topHint">Início da conversa</div>
                  ) : null}

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
                      const audioPlaybackUrl = isAudioMessageAttachment(msg) ? imageUrl : null;
                      const pdfPreviewUrl = isPdfAttachment(msg) ? buildPdfPreviewUrl(msg.attachmentUrl) : null;
                      const spreadsheetPreviewUrl = isSpreadsheetAttachment(msg) ? imageUrl : null;
                      const textDocumentPreviewUrl = isTextDocumentAttachment(msg) ? imageUrl : null;
                      const presentationPreviewUrl = isPresentationAttachment(msg) ? imageUrl : null;
                      const imageDocumentPreviewUrl =
                        msg.contentType === "FILE" && isImageDocumentPreview(msg) ? imageUrl : null;
                      const videoDocumentPreviewUrl =
                        msg.contentType === "FILE" && isVideoDocumentPreview(msg) ? imageUrl : null;
                      const hasAttachmentMediaPreview = !!(isMediaAttachment(msg) && imageUrl);
                      const hasAudioPlayerPreview = !!audioPlaybackUrl;
                      const hasFilePreviewOverlay = !!(
                        !isAudioMessageAttachment(msg) &&
                        !isMediaAttachment(msg) &&
                        msg.contentType === "FILE" &&
                        imageUrl
                      );
                      const hasOverlayPreview =
                        hasAttachmentMediaPreview || hasFilePreviewOverlay || hasAudioPlayerPreview;
                      const isRemovedImageAttachment = msg.contentType === "IMAGE" && !imageUrl && !!msg.deletedAt;
                      const isRemovedFileAttachment =
                        (msg.contentType === "FILE" || msg.contentType === "AUDIO") && !imageUrl && !!msg.deletedAt;
                      const isRemovedAttachmentNotice = isRemovedImageAttachment || isRemovedFileAttachment;
                      const bodyWithoutRemovedNotice = stripAttachmentRemovalNotice(msg.body);
                      const hasCompactTextMeta = !hasOverlayPreview && !isRemovedAttachmentNotice && !!bodyWithoutRemovedNotice;
                      const messageTime = fmtTime(msg.createdAt);
                      const compactMetaSpacer = `${msg.isFavorited ? "★ " : ""}${messageTime}`;
                      const showSenderName =
                        conversationKind(activeConv) === "GROUP" && !isMine && row.startsSenderBlock;
                      const showBroadcastOriginNotice =
                        conversationKind(activeConv) === "DIRECT" &&
                        !!msg.broadcastSource &&
                        msg.senderId === me?.id;
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
                          } ${
                            multiDeleteMode ? "is-selecting" : ""
                          } ${
                            selectedMessageIdSet.has(msg.id) ? "is-selected" : ""
                          }`}
                        >
                          {multiDeleteMode ? (
                            <button
                              type="button"
                              className={`chat-msgSelectToggle ${selectedMessageIdSet.has(msg.id) ? "is-selected" : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleMessageSelection(msg.id);
                              }}
                              aria-pressed={selectedMessageIdSet.has(msg.id)}
                              title={selectedMessageIdSet.has(msg.id) ? "Desmarcar mensagem" : "Selecionar mensagem"}
                            >
                              <span aria-hidden="true">{selectedMessageIdSet.has(msg.id) ? "✓" : ""}</span>
                            </button>
                          ) : null}
                          <div
                            className={`chat-bubble ${isMine ? "is-mine" : "is-other"} ${
                              msg.replyTo ? "has-reply" : ""
                            } ${hasOverlayPreview ? "has-visualPreview" : ""} ${
                              hasAttachmentMediaPreview ? "has-mediaPreview" : ""
                            } ${isRemovedAttachmentNotice ? "has-removedNotice" : ""} ${
                              hasFilePreviewOverlay ? "has-filePreview" : ""
                            } ${
                              audioPlaybackUrl ? "has-audioPlayer" : ""
                            } ${
                              hasCompactTextMeta ? "has-compactTextMeta" : ""
                            } ${
                              multiDeleteMode ? "is-selectable" : ""
                            } ${
                              selectedMessageIdSet.has(msg.id) ? "is-selected" : ""
                            }`}
                            onClickCapture={
                              multiDeleteMode
                                ? (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleMessageSelection(msg.id);
                                  }
                                : undefined
                            }
                            onKeyDown={
                              multiDeleteMode
                                ? (e) => {
                                    if (e.key !== "Enter" && e.key !== " ") return;
                                    e.preventDefault();
                                    toggleMessageSelection(msg.id);
                                  }
                                : undefined
                            }
                            role={multiDeleteMode ? "button" : undefined}
                            tabIndex={multiDeleteMode ? 0 : undefined}
                          >
                            {!multiDeleteMode && (!msg.deletedAt || isRemovedAttachmentNotice) ? (
                              <button
                                className="chat-msgMenuBtn"
                                data-msg-menu-trigger={msg.id}
                                onClick={(e) => openActionMenu(e, msg.id, isMine)}
                                title="Ações"
                              >
                                <DotsIcon />
                              </button>
                            ) : null}

                            {actionMenuMsgId === msg.id && isRemovedAttachmentNotice ? (
                              <div
                                ref={actionMenuRef}
                                className="chat-msgMenu chat-msgMenu--floating"
                                style={
                                  actionMenuPosition
                                    ? { top: actionMenuPosition.top, left: actionMenuPosition.left }
                                    : { visibility: "hidden" }
                                }
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  className="chat-msgMenu__item chat-msgMenu__item--danger"
                                  onClick={() => {
                                    void hideRemovedAttachmentNoticesForMe(msg.conversationId);
                                  }}
                                >
                                  <TrashIcon />
                                  <span>Excluir avisos</span>
                                </button>
                              </div>
                            ) : actionMenuMsgId === msg.id && !msg.deletedAt ? (
                              <div
                                ref={actionMenuRef}
                                className="chat-msgMenu chat-msgMenu--floating"
                                style={
                                  actionMenuPosition
                                    ? { top: actionMenuPosition.top, left: actionMenuPosition.left }
                                    : { visibility: "hidden" }
                                }
                                onClick={(e) => e.stopPropagation()}
                              >
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
                                      normalizeAttachmentDisplayName(msg.attachmentName) ||
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

                                {msg.attachmentUrl ? (
                                  <button
                                    className="chat-msgMenu__item"
                                    onClick={() => {
                                      void downloadAttachment(msg);
                                      setReactionBarMsgId(null);
                                      setReactionPickerMsgId(null);
                                      setActionMenuMsgId(null);
                                    }}
                                  >
                                    <DownloadIcon />
                                    <span>Baixar</span>
                                  </button>
                                ) : null}

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
                                    startMultiDeleteFromMessage(msg);
                                  }}
                                >
                                  <TrashIcon />
                                  <span>Apagar</span>
                                </button>
                              </div>
                            ) : null}

                            {showSenderName ? (
                              <div className="chat-bubble__sender">{msg.sender?.name ?? "Contato"}</div>
                            ) : null}

                            {showBroadcastOriginNotice ? (
                              <div className="chat-broadcastOrigin">
                                Mensagem enviada pela lista de transmissão: <strong>{msg.broadcastSource?.title ?? "Lista"}</strong>
                              </div>
                            ) : null}

                            {msg.replyTo ? (
                              <button
                                type="button"
                                className="chat-replyBlock chat-replyBlock--button"
                                onClick={() => void jumpToReplyReference(msg.replyTo?.id ?? null)}
                                title="Ir para a mensagem original"
                              >
                                <div className="chat-replyBlock__name">{msg.replyTo.sender?.name ?? "Mensagem"}</div>
                                <div className="chat-replyBlock__body">{replyPreview}</div>
                              </button>
                            ) : null}

                            {isMediaAttachment(msg) && imageUrl ? (
                              <ChatMediaAttachmentButton
                                message={msg}
                                attachmentUrl={imageUrl}
                                onOpen={() => void openImageViewer(msg)}
                                timeLabel={fmtTime(msg.createdAt)}
                              />
                            ) : null}

                            {audioPlaybackUrl ? (
                              <AudioMessagePlayer
                                attachmentUrl={msg.attachmentUrl}
                                attachmentName={msg.attachmentName}
                                createdAt={msg.createdAt}
                              />
                            ) : null}

                            {isRemovedImageAttachment ? (
                              <div className="chat-removedAttachment chat-removedAttachment--image">
                                <div className="chat-removedAttachment__icon" aria-hidden="true">
                                  <ImageIcon />
                                </div>
                                <div className="chat-removedAttachment__title">Essa imagem foi apagada</div>
                                <div className="chat-removedAttachment__desc">
                                  Pelo administrador segundo a política de backup de arquivos.
                                </div>
                              </div>
                            ) : null}

                            {!isAudioMessageAttachment(msg) && !isMediaAttachment(msg) && msg.contentType === "FILE" && imageUrl ? (
                              <div
                                className={`chat-fileCard ${
                                  pdfPreviewUrl
                                    ? "chat-fileCard--pdf"
                                    : spreadsheetPreviewUrl
                                    ? "chat-fileCard--sheet"
                                    : textDocumentPreviewUrl
                                    ? "chat-fileCard--textDoc"
                                    : presentationPreviewUrl
                                    ? "chat-fileCard--presentation"
                                    : imageDocumentPreviewUrl || videoDocumentPreviewUrl
                                    ? "chat-fileCard--imagePreview"
                                    : ""
                                }`}
                              >
                                {pdfPreviewUrl ? (
                                  <a
                                    href={imageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="chat-fileCard__previewLink"
                                  >
                                    <div className="chat-fileCard__preview" aria-hidden="true">
                                      <iframe
                                        src={pdfPreviewUrl}
                                        title={normalizeAttachmentDisplayName(msg.attachmentName) || "Pré-visualização do PDF"}
                                        loading="lazy"
                                        tabIndex={-1}
                                      />
                                      <div className="chat-fileCard__previewMeta">
                                        <span>{fmtTime(msg.createdAt)}</span>
                                      </div>
                                    </div>
                                  </a>
                                ) : spreadsheetPreviewUrl ? (
                                  <a
                                    href={imageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="chat-fileCard__previewLink"
                                  >
                                    <div className="chat-fileCard__preview chat-fileCard__preview--sheet" aria-hidden="true">
                                      <SpreadsheetPreview
                                        attachmentUrl={msg.attachmentUrl}
                                        attachmentName={msg.attachmentName}
                                        attachmentMime={msg.attachmentMime}
                                      />
                                      <div className="chat-fileCard__previewMeta">
                                        <span>{fmtTime(msg.createdAt)}</span>
                                      </div>
                                    </div>
                                  </a>
                                ) : textDocumentPreviewUrl ? (
                                  <a
                                    href={imageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="chat-fileCard__previewLink"
                                  >
                                    <div className="chat-fileCard__preview chat-fileCard__preview--textDoc" aria-hidden="true">
                                      <TextDocumentPreview
                                        attachmentUrl={msg.attachmentUrl}
                                        attachmentName={msg.attachmentName}
                                        attachmentMime={msg.attachmentMime}
                                      />
                                      <div className="chat-fileCard__previewMeta">
                                        <span>{fmtTime(msg.createdAt)}</span>
                                      </div>
                                    </div>
                                  </a>
                                ) : presentationPreviewUrl ? (
                                  <a
                                    href={imageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="chat-fileCard__previewLink"
                                  >
                                    <div
                                      className="chat-fileCard__preview chat-fileCard__preview--presentation"
                                      aria-hidden="true"
                                    >
                                      <PresentationPreview
                                        attachmentUrl={msg.attachmentUrl}
                                        attachmentName={msg.attachmentName}
                                        attachmentMime={msg.attachmentMime}
                                      />
                                      <div className="chat-fileCard__previewMeta">
                                        <span>{fmtTime(msg.createdAt)}</span>
                                      </div>
                                    </div>
                                  </a>
                                ) : imageDocumentPreviewUrl ? (
                                  <a
                                    href={imageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="chat-fileCard__previewLink"
                                  >
                                    <div className="chat-fileCard__preview chat-fileCard__preview--imageDoc" aria-hidden="true">
                                      <img
                                        src={imageDocumentPreviewUrl}
                                        alt={normalizeAttachmentDisplayName(msg.attachmentName) || "Pré-visualização do documento"}
                                        className="chat-fileCard__previewMedia chat-fileCard__previewMedia--contain"
                                        loading="lazy"
                                        decoding="async"
                                      />
                                      <div className="chat-fileCard__previewMeta">
                                        <span>{fmtTime(msg.createdAt)}</span>
                                      </div>
                                    </div>
                                  </a>
                                ) : videoDocumentPreviewUrl ? (
                                  <a
                                    href={imageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="chat-fileCard__previewLink"
                                  >
                                    <div className="chat-fileCard__preview chat-fileCard__preview--imageDoc" aria-hidden="true">
                                      <div className="chat-videoPreview">
                                        <video
                                          src={videoDocumentPreviewUrl}
                                          className="chat-fileCard__previewMedia chat-fileCard__previewMedia--contain"
                                          preload="metadata"
                                          muted
                                          playsInline
                                        />
                                        <span className="chat-videoPreview__play" aria-hidden="true">
                                          <PlayOverlayIcon />
                                        </span>
                                      </div>
                                      <div className="chat-fileCard__previewMeta">
                                        <span>{fmtTime(msg.createdAt)}</span>
                                      </div>
                                    </div>
                                  </a>
                                ) : (
                                  <a
                                    href={imageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="chat-fileCard__previewLink"
                                  >
                                    <div className="chat-fileCard__preview chat-fileCard__preview--fallback" aria-hidden="true">
                                      <div className="chat-fileCard__previewFallback">
                                        <div className="chat-fileCard__previewFallbackIcon">
                                          <AttachmentKindIcon message={msg} />
                                        </div>
                                        <span className="chat-fileCard__previewFallbackText">Previa indisponivel</span>
                                      </div>
                                      <div className="chat-fileCard__previewMeta">
                                        <span>{fmtTime(msg.createdAt)}</span>
                                      </div>
                                    </div>
                                  </a>
                                )}
                                <div className="chat-fileCard__body">
                                  <a
                                    href={imageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="chat-fileCard__mainLink"
                                  >
                                    <div className="chat-fileCard__icon">
                                      <AttachmentKindIcon message={msg} />
                                    </div>
                                    <div className="chat-fileCard__text">
                                      <div className="chat-fileCard__name">
                                        {normalizeAttachmentDisplayName(msg.attachmentName) || "Arquivo"}
                                      </div>
                                      <div className="chat-fileCard__meta">
                                        {attachmentTypeLabel(msg)}
                                        {msg.attachmentSize ? ` • ${formatBytes(msg.attachmentSize)}` : ""}
                                      </div>
                                    </div>
                                  </a>
                                  <button
                                    type="button"
                                    className="chat-fileCard__downloadBtn"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      void downloadAttachment(msg);
                                    }}
                                    title="Baixar arquivo"
                                    aria-label="Baixar arquivo"
                                  >
                                    <DownloadIcon />
                                  </button>
                                </div>
                              </div>
                            ) : null}

                            {isRemovedFileAttachment ? (
                              <div className="chat-removedAttachment chat-removedAttachment--file">
                                <div className="chat-removedAttachment__icon" aria-hidden="true">
                                  <AttachmentKindIcon message={msg} />
                                </div>
                                <div className="chat-removedAttachment__title">Esse documento foi apagado</div>
                                <div className="chat-removedAttachment__desc">
                                  Pelo administrador segundo a política de backup de arquivos.
                                </div>
                              </div>
                            ) : null}

                            {bodyWithoutRemovedNotice ? (
                              <div
                                className={`chat-bubble__body ${hasCompactTextMeta ? "chat-bubble__body--compact" : ""}`}
                                data-meta-spacer={hasCompactTextMeta ? compactMetaSpacer : undefined}
                              >
                                {highlightTerm.trim() ? (
                                  <HighlightText text={bodyWithoutRemovedNotice} query={highlightTerm} />
                                ) : (
                                  bodyWithoutRemovedNotice
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

                            {!hasOverlayPreview ? (
                              <div className={`chat-bubble__meta ${hasCompactTextMeta ? "chat-bubble__meta--floating" : ""}`}>
                                {msg.isFavorited ? <span title="Favorita">★</span> : null}
                                <span>{messageTime}</span>
                              </div>
                            ) : null}
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
                              (isAudioMessageAttachment(hit)
                                ? "Áudio"
                                : isMediaAttachment(hit)
                                ? mediaLabel(hit)
                                : hit.contentType === "FILE" || hit.contentType === "AUDIO"
                                ? normalizeAttachmentDisplayName(hit.attachmentName) || "Arquivo"
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
                aria-label="Ir para a primeira mensagem não lida"
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
                aria-label="Ir para mensagens novas"
              >
                <span className="chat-jumpNewBtn__icon" aria-hidden="true">
                  <ArrowDownIcon />
                </span>
                <span>{newMsgsCount > 99 ? "99+" : newMsgsCount} {newMsgsCount === 1 ? "nova" : "novas"}</span>
              </button>
            ) : null}

            {multiDeleteMode ? (
              <div className="chat-multiDeleteBar">
                <button className="chat-iconBtn chat-iconBtn--sm" onClick={stopMultiDeleteMode} title="Fechar seleção">
                  <CloseIcon />
                </button>
                <div className="chat-multiDeleteBar__count">
                  {selectedMessageIds.length} {selectedMessageIds.length === 1 ? "item selecionado" : "itens selecionados"}
                </div>
                <button className="chat-multiDeleteBar__selectAll" onClick={toggleSelectAllMessages}>
                  {allMessagesSelected ? "Desmarcar todas" : "Selecionar todas"}
                </button>
                <button
                  className="chat-iconBtn chat-iconBtn--sm is-danger"
                  onClick={requestDeleteSelectedMessages}
                  title="Apagar mensagens selecionadas"
                  disabled={!selectedMessageIds.length}
                >
                  <TrashIcon />
                </button>
              </div>
            ) : null}

          <div className="chat-composerWrap" style={multiDeleteMode ? { display: "none" } : undefined}>
            {!canSendInActiveConversation && activeConv ? (
              <div className="chat-composerNotice chat-composerNotice--composer">
                {inactiveGroupNotice(activeConv)}
              </div>
            ) : (
              <>
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
                    {attachmentMode === "audio" && attachmentPreviewUrl ? (
                      <div className="chat-attachmentPreview__audio">
                        <AudioMessagePlayer
                          attachmentUrl={attachmentPreviewUrl}
                          attachmentName={attachmentFile.name}
                          showMeta={false}
                        />
                      </div>
                    ) : attachmentMode === "image" && attachmentPreviewUrl ? (
                      isVideoFileLike(attachmentFile) ? (
                        <video
                          src={attachmentPreviewUrl}
                          className="chat-attachmentPreview__image"
                          preload="metadata"
                          muted
                          playsInline
                        />
                      ) : (
                        <img src={attachmentPreviewUrl} alt="preview" className="chat-attachmentPreview__image" />
                      )
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

                {sendErr ? <div className="chat-error">{sendErr}</div> : null}

                <div className="chat-composer">
                  <div className="chat-composer__actions">
                    <button
                      className={`chat-iconBtn ${emojiOpen ? "is-active" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAttachMenuOpen(false);
                        setEmojiOpen((prev) => !prev);
                      }}
                      title="Emojis"
                      disabled={!activeConv}
                    >
                      <SmileIcon />
                    </button>

                    <button
                      className={`chat-iconBtn ${attachMenuOpen ? "is-active" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEmojiOpen(false);
                        setAttachMenuOpen((prev) => !prev);
                      }}
                      title="Anexos"
                      disabled={!activeConv}
                    >
                      <PlusIcon />
                    </button>

                    {attachMenuOpen ? (
                      <div className="chat-attachMenu" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="chat-attachMenu__item"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <FileIcon />
                          <span>Documento</span>
                        </button>
                        <button
                          type="button"
                          className="chat-attachMenu__item"
                          onClick={() => imageInputRef.current?.click()}
                        >
                          <ImageIcon />
                          <span>Fotos e vídeos</span>
                        </button>
                        <button
                          type="button"
                          className="chat-attachMenu__item"
                          onClick={() => audioInputRef.current?.click()}
                        >
                          <HeadphonesIcon />
                          <span>Áudio</span>
                        </button>
                      </div>
                    ) : null}

                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*,video/*"
                      style={{ display: "none" }}
                      onChange={handleMediaPicked}
                    />

                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/*"
                      style={{ display: "none" }}
                      onChange={handleAudioPicked}
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
              </>
            )}
          </div>
          </div>
        </main>
        ) : null}
      </div>

      {pickerOpen && pickerCanUseAutomaticAudience && pickerGuideOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              id="picker-auto-guide-tooltip"
              ref={pickerGuideTooltipRef}
              className={`chat-pickerRuleTooltip chat-pickerRuleTooltip--${pickerAutomaticAudienceGuide.tone}`}
              style={
                pickerGuidePosition
                  ? { top: pickerGuidePosition.top, left: pickerGuidePosition.left }
                  : { visibility: "hidden" }
              }
              role="tooltip"
              onMouseEnter={openPickerGuideTooltip}
              onMouseLeave={() => closePickerGuideTooltip()}
            >
              <div className="chat-pickerRuleTooltip__head">
                <div className="chat-pickerRuleTooltip__icon" aria-hidden="true">
                  <PickerGuideIcon tone={pickerAutomaticAudienceGuide.tone} />
                </div>
                <div className="chat-pickerRuleTooltip__title">{pickerAutomaticAudienceGuide.title}</div>
              </div>
              <div className="chat-pickerRuleTooltip__text">{pickerAutomaticAudienceGuide.description}</div>
              <div className="chat-pickerRuleTooltip__list">
                {pickerAutomaticAudienceGuide.items.map((item) => (
                  <div key={item} className="chat-pickerRuleTooltip__item">
                    {item}
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}

      {conversationMenuConversation && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={conversationMenuRef}
              className="chat-convMenu chat-convMenu--floating"
              style={
                conversationMenuPosition
                  ? { top: conversationMenuPosition.top, left: conversationMenuPosition.left }
                  : { visibility: "hidden" }
              }
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="chat-msgMenu__item"
                onClick={() => {
                  closeConversationMenu();
                  void setConversationPinned(conversationMenuConversation.id, !conversationMenuConversation.pinned);
                }}
              >
                <PinIcon filled={!!conversationMenuConversation.pinned} />
                <span>{conversationMenuConversation.pinned ? "Desafixar conversa" : "Fixar conversa"}</span>
              </button>
              {conversationKind(conversationMenuConversation) === "GROUP" &&
              canManageGroupConversation(conversationMenuConversation, me?.id ?? null) ? (
                <button
                  className="chat-msgMenu__item"
                  onClick={() => {
                    closeConversationMenu();
                    openCreatePicker("group-members", conversationMenuConversation);
                  }}
                >
                  <PlusIcon />
                  <span>Adicionar pessoas</span>
                </button>
              ) : null}
                <button
                  className="chat-msgMenu__item"
                  onClick={() => {
                    closeConversationMenu();
                    void clearConversation(
                    conversationMenuConversation.id,
                    conversationDisplayName(conversationMenuConversation)
                  );
                }}
              >
                <ClearConversationIcon />
                <span>Limpar conversa</span>
              </button>
              {conversationKind(conversationMenuConversation) === "GROUP" &&
              conversationMenuConversation.isCurrentParticipant !== false ? (
                <button
                  className="chat-msgMenu__item chat-msgMenu__item--danger"
                  onClick={() => {
                    closeConversationMenu();
                    void leaveGroup(conversationMenuConversation);
                  }}
                >
                  <LogOutIcon />
                  <span>Sair do grupo</span>
                </button>
              ) : null}
              {conversationKind(conversationMenuConversation) === "BROADCAST" &&
              conversationMenuConversation.isCurrentParticipant !== false ? (
                <button
                  className="chat-msgMenu__item chat-msgMenu__item--danger"
                  onClick={() => {
                    closeConversationMenu();
                    void deleteBroadcastFromDetails(conversationMenuConversation);
                  }}
                >
                  <TrashIcon />
                  <span>Excluir lista</span>
                </button>
              ) : null}
              {(conversationKind(conversationMenuConversation) === "DIRECT" ||
                conversationMenuConversation.isCurrentParticipant === false) ? (
                <button
                  className="chat-msgMenu__item chat-msgMenu__item--danger"
                  onClick={() => {
                    closeConversationMenu();
                    void removeConversationFromList(conversationMenuConversation.id);
                  }}
                >
                  <CloseIcon />
                  <span>Remover dos chats</span>
                </button>
              ) : null}
            </div>,
            document.body
          )
        : null}

      {conversationDetails &&
      groupMemberMenuTarget &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              ref={groupMemberMenuRef}
              className="chat-msgMenu chat-msgMenu--floating"
              style={
                groupMemberMenuPosition
                  ? { top: groupMemberMenuPosition.top, left: groupMemberMenuPosition.left }
                  : { visibility: "hidden" }
              }
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="chat-msgMenu__item"
                onClick={() => {
                  closeGroupMemberMenu();
                  void updateGroupAdmin(conversationDetails, groupMemberMenuTarget, !groupMemberMenuTarget.isGroupAdmin);
                }}
              >
                <CheckCircleIcon />
                <span>{groupMemberMenuTarget.isGroupAdmin ? "Remover admin" : "Tornar admin"}</span>
              </button>
              <button
                className="chat-msgMenu__item chat-msgMenu__item--danger"
                onClick={() => {
                  closeGroupMemberMenu();
                  void removeGroupParticipantFromDetails(conversationDetails, groupMemberMenuTarget);
                }}
              >
                <TrashIcon />
                <span>Remover do grupo</span>
              </button>
            </div>,
            document.body
          )
        : null}

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
              {(() => {
                const myAvatarUrl = resolveAvatarUrl(me?.avatarUrl);
                const hasMyAvatar = !!myAvatarUrl;
                const avatarBusyLabel = avatarUploading ? "Enviando..." : avatarRemoving ? "Removendo..." : null;

                return (
                  <>
                    <div className="chat-contactCard">
                      <EditableAvatar
                        className="chat-avatar chat-avatar--xl"
                        imageUrl={myAvatarUrl}
                        fallback={(me?.name ?? "U").slice(0, 1).toUpperCase()}
                        alt={me?.name ?? "Meu perfil"}
                        onError={() => markAvatarBroken(me?.avatarUrl)}
                        onEdit={() => myAvatarInputRef.current?.click()}
                        onRemove={hasMyAvatar ? () => void removeMyAvatar() : null}
                        busyLabel={avatarBusyLabel}
                      />

                      <div className="chat-contactCard__name">{me?.name ?? "Usuário"}</div>
                    </div>

                    <div className="chat-sectionTitle">Dados do perfil</div>
                    <div className="chat-contactCard__info chat-contactCard__info--left">
                      <div><strong>Nome:</strong> {me?.name ?? "-"}</div>
                      <div><strong>E-mail:</strong> {me?.email || "Sem e-mail"}</div>
                      <div><strong>Empresa:</strong> {me?.company?.name ?? "Sem empresa"}</div>
                      <div><strong>Setor:</strong> {me?.department?.name ?? "Sem setor"}</div>
                      <div><strong>Ramal:</strong> {me?.extension || "Sem ramal"}</div>
                      <div><strong>Foto de perfil:</strong> {hasMyAvatar ? "Enviada" : "Sem foto"}</div>
                    </div>

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
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}

      {pickerOpen ? (
        <div
          className={`chat-modalBackdrop ${conversationDetailsOpen || profileOpen || myInfoOpen ? "chat-modalBackdrop--front" : ""}`.trim()}
          onClick={closePicker}
        >
          <div className="chat-modal chat-modal--wide chat-modal--picker" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal__header">
              <div className="chat-modal__title">
                {pickerMode === "group"
                  ? "Novo grupo"
                  : pickerMode === "broadcast"
                  ? "Nova lista de transmissão"
                  : pickerMode === "group-members"
                  ? `Adicionar pessoas em ${conversationDisplayName(pickerConversation)}`
                  : "Nova conversa"}
              </div>
              <button className="chat-iconBtn" onClick={closePicker}>
                <CloseIcon />
              </button>
            </div>

            <div className={`chat-modal__controls ${pickerNeedsTitle ? "chat-modal__controls--stacked" : ""}`}>
              {pickerNeedsTitle ? (
                <>
                  <div className="chat-modal__sectionLabel">{pickerTitleSectionLabel}</div>
                  <input
                    className="chat-input chat-modal__controlFull"
                    value={pickerTitle}
                    onChange={(e) => setPickerTitle(e.target.value)}
                    placeholder={pickerTitlePlaceholder}
                    maxLength={80}
                  />
                </>
              ) : null}

              {pickerNeedsSelection ? (
                <div className="chat-modal__sectionLabel">{pickerAudienceSectionLabel}</div>
              ) : null}

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

              {pickerNeedsSelection ? (
                <div
                  className={`chat-pickerQuickActions ${
                    pickerCanUseAutomaticAudience ? "chat-pickerQuickActions--wide" : ""
                  }`}
                >
                  <div className="chat-pickerQuickActions__count">
                    <span>
                      {pickerFilteredUserIds.length
                        ? `${pickerFilteredUserIds.length} resultado(s) nesta pesquisa`
                        : "Nenhum resultado nesta pesquisa"}
                    </span>
                  </div>

                  <div className="chat-pickerQuickActions__count">
                    <span>
                      {pickerSelectedUserIds.length}{" "}
                      {pickerSelectedUserIds.length === 1 ? "contato selecionado" : "contatos selecionados"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="chat-pickerQuickActions__action"
                    onClick={toggleSelectAllPickerSearchResults}
                    disabled={!pickerFilteredUserIds.length || pickerSelectionLockedByAutomaticAudience}
                    title={
                      pickerSelectionLockedByAutomaticAudience
                        ? "A seleção atual já está sendo aplicada automaticamente por essa regra."
                        : undefined
                    }
                  >
                    {pickerAllFilteredSelected
                      ? "Desmarcar todos desta pesquisa"
                      : "Selecionar todos desta pesquisa"}
                  </button>

                  {pickerCanUseAutomaticAudience ? (
                    <label className="chat-pickerAutoRule">
                      <input
                        type="checkbox"
                        checked={pickerIncludeAllUsers}
                        onChange={(e) => handlePickerAutomaticAudienceToggle(e.target.checked)}
                      />
                      <span className={`chat-pickerAutoRule__switch ${pickerIncludeAllUsers ? "is-active" : ""}`}>
                        <span className="chat-pickerAutoRule__thumb" />
                      </span>
                      <span className="chat-pickerAutoRule__label">Incluir novos usuários</span>
                    </label>
                  ) : null}

                  {pickerUsesPairedAutomaticRules ? (
                    <button
                      type="button"
                      className="chat-pickerRuleManagerBtn chat-pickerRuleManagerBtn--inline"
                      onClick={openPickerRuleManager}
                      title="Configurar regras automáticas"
                    >
                      <GearIcon />
                    </button>
                  ) : null}

                  {pickerCanUseAutomaticAudience ? (
                    <button
                      type="button"
                      ref={pickerGuideTriggerRef}
                      className={`chat-pickerRuleHintTrigger chat-pickerRuleHintTrigger--${pickerAutomaticAudienceGuide.tone}`}
                      aria-label={pickerAutomaticAudienceGuide.title}
                      aria-describedby={pickerGuideOpen ? "picker-auto-guide-tooltip" : undefined}
                      title={pickerAutomaticAudienceGuide.title}
                      onMouseEnter={openPickerGuideTooltip}
                      onMouseLeave={() => closePickerGuideTooltip()}
                      onFocus={openPickerGuideTooltip}
                      onBlur={() => closePickerGuideTooltip(0)}
                    >
                      <PickerGuideIcon tone={pickerAutomaticAudienceGuide.tone} />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="chat-modal__body">
              {loadingUsers ? (
                <div className="chat-empty">Carregando colaboradores…</div>
              ) : (
                <>
                  {pickerError ? <div className="chat-error">{pickerError}</div> : null}
                  {pickerGroupedUsers.length === 0 ? (
                    <div className="chat-empty">
                      {pickerMode === "group-members"
                        ? "Não há mais colaboradores disponíveis para adicionar."
                        : "Nenhum colaborador encontrado."}
                    </div>
                  ) : (
                    pickerGroupedUsers.map((group) => (
                      <div key={group.company} className="chat-userGroup">
                        <div className="chat-userGroup__companyBar">{group.company}</div>

                        {group.departments.map((dept) => (
                          <div key={`${group.company}-${dept.department}`} className="chat-userDeptBlock">
                            <div className="chat-userGroup__departmentBar">{dept.department}</div>
                            <div className="chat-userGroup__list">
                              {dept.users.map((user) => {
                                const selected = pickerSelectedUserSet.has(user.id);
                                const lockedByAutomaticAudience =
                                  pickerSelectionLockedByAutomaticAudience &&
                                  pickerAutomaticAudienceScopeUserSet.has(user.id);
                                return (
                                  <div
                                    key={user.id}
                                    className={`chat-userRow ${selected ? "is-selected" : ""} ${
                                      lockedByAutomaticAudience ? "is-locked" : ""
                                    }`}
                                    role="button"
                                    aria-disabled={lockedByAutomaticAudience}
                                    tabIndex={lockedByAutomaticAudience ? -1 : 0}
                                    title={
                                      lockedByAutomaticAudience
                                        ? "Esse usuário está incluído automaticamente pela regra ativa."
                                        : undefined
                                    }
                                    onClick={() => {
                                      if (pickerMode === "direct") {
                                        void startDirect(user.id);
                                        return;
                                      }
                                      if (lockedByAutomaticAudience) return;
                                      togglePickerUserSelection(user.id);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        if (pickerMode === "direct") {
                                          void startDirect(user.id);
                                          return;
                                        }
                                        if (lockedByAutomaticAudience) return;
                                        togglePickerUserSelection(user.id);
                                      }
                                    }}
                                  >
                                    <div className="chat-userCell chat-userCell--name">
                                      {pickerNeedsSelection ? (
                                        <span
                                          className={`chat-userRow__checkbox ${selected ? "is-selected" : ""} ${
                                            lockedByAutomaticAudience ? "is-locked" : ""
                                          }`}
                                          aria-hidden="true"
                                        >
                                          {selected ? <CheckSquareIcon /> : null}
                                        </span>
                                      ) : null}
                                      <div className="chat-avatar chat-avatar--sm">
                                        {resolveAvatarUrl(user.avatarUrl) ? (
                                          <img
                                            src={resolveAvatarUrl(user.avatarUrl) ?? ""}
                                            alt={user.name}
                                            onError={() => markAvatarBroken(user.avatarUrl)}
                                          />
                                        ) : (
                                          <span>{user.name.slice(0, 1).toUpperCase()}</span>
                                        )}
                                      </div>
                                      <div className="chat-userRow__identity">
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
                                            if (user.email) {
                                              void copyText(user.email, "E-mail copiado");
                                            }
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
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </>
              )}
            </div>

            {pickerNeedsSelection ? (
              <div className="chat-modal__footer chat-pickerFooter">
                <button className="chat-confirmModal__btn" onClick={closePicker} disabled={pickerSubmitting}>
                  Cancelar
                </button>
                <button
                  className="chat-primaryBtn"
                  onClick={() => void submitPicker()}
                  disabled={
                    pickerSubmitting ||
                    (pickerMode === "group" || pickerMode === "broadcast" || pickerMode === "group-members"
                      ? !pickerHasAudience
                      : !pickerSelectedUserIds.length)
                  }
                >
                  {pickerSubmitting ? "Salvando..." : pickerPrimaryLabel}
                </button>
              </div>
            ) : null}

            {pickerRuleManagerOpen && pickerUsesPairedAutomaticRules ? (
              <div className="chat-pickerRuleModalBackdrop" onClick={() => setPickerRuleManagerOpen(false)}>
                <div className="chat-pickerRuleModal" onClick={(e) => e.stopPropagation()}>
                  <div className="chat-pickerRuleModal__header">
                    <div className="chat-pickerRuleModal__title">Regras automáticas</div>
                    <button className="chat-iconBtn" onClick={() => setPickerRuleManagerOpen(false)}>
                      <CloseIcon />
                    </button>
                  </div>

                  <div className="chat-pickerRuleModal__body">
                    <div className="chat-pickerRuleModal__intro">
                      Cada regra combina <strong>empresa + setor</strong>. Quem for criado depois com essa combinação
                      entra automaticamente no grupo.
                    </div>

                    <div className="chat-pickerRuleRows">
                      {pickerAutomaticRules.length ? (
                        pickerAutomaticRules.map((rule, index) => (
                          <div key={rule.id} className="chat-pickerRuleRow">
                            <span className="chat-pickerRuleRow__index">{index + 1}</span>
                            <select
                              className="chat-select"
                              value={rule.companyId ?? ""}
                              onChange={(e) => {
                                const nextCompanyId = e.target.value || null;
                                updatePickerAutomaticRule(rule.id, {
                                  companyId: nextCompanyId,
                                  company: nextCompanyId
                                    ? companyRuleOptions.find((item) => item.id === nextCompanyId) ?? null
                                    : null,
                                });
                              }}
                            >
                              <option value="">Todas as empresas</option>
                              {companyRuleOptions.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>

                            <select
                              className="chat-select"
                              value={rule.departmentId ?? ""}
                              onChange={(e) => {
                                const nextDepartmentId = e.target.value || null;
                                updatePickerAutomaticRule(rule.id, {
                                  departmentId: nextDepartmentId,
                                  department: nextDepartmentId
                                    ? departmentRuleOptions.find((item) => item.id === nextDepartmentId) ?? null
                                    : null,
                                });
                              }}
                            >
                              <option value="">Todos os setores</option>
                              {departmentRuleOptions.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              className="chat-pickerRuleRow__remove"
                              onClick={() => removePickerAutomaticRule(rule.id)}
                              title="Remover regra"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="chat-note">
                          Nenhuma regra salva ainda. Use o <strong>+</strong> ao lado do setor ou adicione uma linha
                          agora.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="chat-pickerRuleModal__footer">
                    <button type="button" className="chat-confirmModal__btn" onClick={addEmptyPickerRule}>
                      <PlusIcon />
                      <span>Adicionar regra</span>
                    </button>
                    <button type="button" className="chat-primaryBtn" onClick={() => setPickerRuleManagerOpen(false)}>
                      Concluir
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {imageViewerOpen ? (
        <div className="chat-imageViewer" onClick={closeImageViewer}>
          <div className="chat-imageViewer__topBar" onClick={(e) => e.stopPropagation()}>
            <div className="chat-imageViewer__meta">
              <div className="chat-imageViewer__title">
                {normalizeAttachmentDisplayName(currentViewerItem?.attachmentName) || (currentViewerIsVideo ? "Vídeo" : "Imagem")}
              </div>
              <div className="chat-imageViewer__sub">
                {imageViewerItems.length
                  ? `${imageViewerIndex + 1} de ${imageViewerItems.length}`
                  : "Sem mídias"}
                {currentViewerItem?.createdAt ? ` • ${fmtDateTime(currentViewerItem.createdAt)}` : ""}
              </div>
              {mediaRetentionPolicy?.visible ? (
                <div className="chat-imageViewer__sub" style={{ marginTop: 4, opacity: 0.92 }}>
                  {mediaRetentionPolicy.enabled
                    ? `A política de backup está configurada para ${
                        mediaRetentionPolicy.intervalLabel ?? mediaRetentionPolicy.interval ?? "periodicidade definida pelo administrador"
                      }. Próxima exclusão: ${
                        mediaRetentionPolicy.nextRunAt ? fmtDateTime(mediaRetentionPolicy.nextRunAt) : "a definir"
                      }.`
                    : "A política de backup de arquivos está desativada."}
                </div>
              ) : null}
            </div>

            <div className="chat-imageViewer__actions">
              {currentViewerItem?.attachmentUrl ? (
                <button
                  className="chat-iconBtn"
                  onClick={() => void downloadAttachment(currentViewerItem)}
                  title={currentViewerIsVideo ? "Baixar vídeo" : "Baixar mídia"}
                >
                  <DownloadIcon />
                </button>
              ) : null}
              {currentViewerItem ? (
                <button
                  className="chat-iconBtn is-danger"
                  onClick={() => {
                    startMultiDeleteFromMessage(currentViewerItem);
                    closeImageViewer();
                  }}
                  title="Apagar"
                >
                  <TrashIcon />
                </button>
              ) : null}
              {!currentViewerIsVideo ? (
                <>
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
                </>
              ) : null}
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
              title="Mídia anterior"
            >
              <ChevronLeftIcon />
            </button>

            <div
              className={`chat-imageViewer__stage ${imageViewerZoom > 1 ? "is-zoomed" : ""} ${
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
                if (currentViewerIsVideo) return;
                if (imageViewerZoom > 1) {
                  resetImageViewerTransform();
                } else {
                  setViewerZoom(2);
                }
              }}
            >
              {currentViewerUrl ? (
                currentViewerIsVideo ? (
                  <video
                    key={currentViewerItem?.id ?? currentViewerUrl}
                    src={currentViewerUrl}
                    className="chat-imageViewer__video"
                    controls
                    autoPlay
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    key={currentViewerItem?.id ?? currentViewerUrl}
                    src={currentViewerUrl}
                    alt={normalizeAttachmentDisplayName(currentViewerItem?.attachmentName) || "imagem"}
                    className="chat-imageViewer__image"
                    draggable={false}
                    style={{
                      transform: `translate(${imageViewerOffset.x}px, ${imageViewerOffset.y}px) scale(${imageViewerZoom})`,
                    }}
                  />
                )
              ) : (
                <div className="chat-empty">{currentViewerIsVideo ? "Vídeo indisponível." : "Imagem indisponível."}</div>
              )}
            </div>

            <button
              className="chat-imageViewer__nav chat-imageViewer__nav--right"
              onClick={() => goToImage(1)}
              disabled={!canViewNext}
              title="Próxima mídia"
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
                    {resolveAvatarUrl(profileData.avatarUrl) ? (
                      <img
                        src={resolveAvatarUrl(profileData.avatarUrl) ?? ""}
                        alt={profileData.name}
                        onError={() => markAvatarBroken(profileData.avatarUrl)}
                      />
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
                          if (profileData.email) {
                            void copyText(profileData.email, "E-mail copiado");
                          }
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
                            (isAudioMessageAttachment(msg)
                              ? "Áudio"
                              : null) ||
                            (isMediaAttachment(msg)
                              ? mediaLabel(msg)
                              : msg.contentType === "FILE" || msg.contentType === "AUDIO"
                              ? normalizeAttachmentDisplayName(msg.attachmentName) || "Arquivo"
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
                        {isVideoAttachment(item) ? (
                          <div className="chat-videoPreview">
                            <video
                              src={toAbsoluteUrl(item.attachmentUrl) ?? ""}
                              className="chat-mediaThumb__video"
                              preload="metadata"
                              muted
                              playsInline
                            />
                            <span className="chat-videoPreview__play" aria-hidden="true">
                              <PlayOverlayIcon />
                            </span>
                          </div>
                        ) : (
                          <img
                            src={toAbsoluteUrl(item.attachmentUrl) ?? ""}
                            alt={normalizeAttachmentDisplayName(item.attachmentName) || "imagem"}
                            loading="lazy"
                            decoding="async"
                          />
                        )}
                      </button>
                    ))
                  ) : (
                    profileMediaItems.map((item) => {
                      const pdfPreviewUrl = isPdfAttachment(item) ? buildPdfPreviewUrl(item.attachmentUrl) : null;
                      const attachmentUrl = toAbsoluteUrl(item.attachmentUrl);
                      const spreadsheetPreviewUrl = isSpreadsheetAttachment(item)
                        ? attachmentUrl
                        : null;
                      const textDocumentPreviewUrl = isTextDocumentAttachment(item)
                        ? attachmentUrl
                        : null;
                      const presentationPreviewUrl = isPresentationAttachment(item)
                        ? attachmentUrl
                        : null;
                      const imageDocumentPreviewUrl =
                        item.contentType === "FILE" && isImageDocumentPreview(item) ? attachmentUrl : null;
                      const videoDocumentPreviewUrl =
                        item.contentType === "FILE" && isVideoDocumentPreview(item) ? attachmentUrl : null;

                      return (
                        <button
                          key={item.id}
                          className={`chat-fileCard chat-fileCard--btn ${
                            pdfPreviewUrl
                              ? "chat-fileCard--pdf"
                              : spreadsheetPreviewUrl
                              ? "chat-fileCard--sheet"
                              : textDocumentPreviewUrl
                              ? "chat-fileCard--textDoc"
                              : presentationPreviewUrl
                              ? "chat-fileCard--presentation"
                              : imageDocumentPreviewUrl || videoDocumentPreviewUrl
                              ? "chat-fileCard--imagePreview"
                              : ""
                          }`}
                          onClick={() => {
                            void jumpToMessageById(item.id);
                            setProfileOpen(false);
                          }}
                        >
                          {pdfPreviewUrl ? (
                            <div className="chat-fileCard__preview" aria-hidden="true">
                              <iframe
                                src={pdfPreviewUrl}
                                title={normalizeAttachmentDisplayName(item.attachmentName) || "Pré-visualização do PDF"}
                                loading="lazy"
                                tabIndex={-1}
                              />
                            </div>
                          ) : spreadsheetPreviewUrl ? (
                            <div className="chat-fileCard__preview chat-fileCard__preview--sheet" aria-hidden="true">
                              <SpreadsheetPreview
                                attachmentUrl={item.attachmentUrl}
                                attachmentName={item.attachmentName}
                                attachmentMime={item.attachmentMime}
                              />
                            </div>
                          ) : textDocumentPreviewUrl ? (
                            <div className="chat-fileCard__preview chat-fileCard__preview--textDoc" aria-hidden="true">
                              <TextDocumentPreview
                                attachmentUrl={item.attachmentUrl}
                                attachmentName={item.attachmentName}
                                attachmentMime={item.attachmentMime}
                              />
                            </div>
                          ) : presentationPreviewUrl ? (
                            <div
                              className="chat-fileCard__preview chat-fileCard__preview--presentation"
                              aria-hidden="true"
                            >
                              <PresentationPreview
                                attachmentUrl={item.attachmentUrl}
                                attachmentName={item.attachmentName}
                                attachmentMime={item.attachmentMime}
                              />
                            </div>
                          ) : imageDocumentPreviewUrl ? (
                            <div className="chat-fileCard__preview chat-fileCard__preview--imageDoc" aria-hidden="true">
                              <img
                                src={imageDocumentPreviewUrl}
                                alt={normalizeAttachmentDisplayName(item.attachmentName) || "Previa do documento"}
                                className="chat-fileCard__previewMedia chat-fileCard__previewMedia--contain"
                                loading="lazy"
                                decoding="async"
                              />
                            </div>
                          ) : videoDocumentPreviewUrl ? (
                            <div className="chat-fileCard__preview chat-fileCard__preview--imageDoc" aria-hidden="true">
                              <div className="chat-videoPreview">
                                <video
                                  src={videoDocumentPreviewUrl}
                                  className="chat-fileCard__previewMedia chat-fileCard__previewMedia--contain"
                                  preload="metadata"
                                  muted
                                  playsInline
                                />
                                <span className="chat-videoPreview__play" aria-hidden="true">
                                  <PlayOverlayIcon />
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="chat-fileCard__preview chat-fileCard__preview--fallback" aria-hidden="true">
                              <div className="chat-fileCard__previewFallback">
                                <div className="chat-fileCard__previewFallbackIcon">
                                  <AttachmentKindIcon message={item} />
                                </div>
                                <span className="chat-fileCard__previewFallbackText">Previa indisponivel</span>
                              </div>
                            </div>
                          )}
                          <div className="chat-fileCard__body">
                            <div className="chat-fileCard__icon">
                              <AttachmentKindIcon message={item} />
                            </div>
                            <div className="chat-fileCard__text">
                              <div className="chat-fileCard__name">
                                {normalizeAttachmentDisplayName(item.attachmentName) || "Arquivo"}
                              </div>
                              <div className="chat-fileCard__meta">
                                {attachmentTypeLabel(item)}
                                {item.attachmentSize ? ` • ${formatBytes(item.attachmentSize)}` : ""}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })
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

      {conversationDetailsOpen ? (
        <div className="chat-modalBackdrop" onClick={() => setConversationDetailsOpen(false)}>
          <div className="chat-profileDrawer" onClick={(e) => e.stopPropagation()}>
            <div className="chat-profileDrawer__header">
              <div className="chat-profileDrawer__title">
                {conversationDetailsKind === "BROADCAST" ? "Dados da lista" : "Dados do grupo"}
              </div>
              <button className="chat-iconBtn" onClick={() => setConversationDetailsOpen(false)}>
                <CloseIcon />
              </button>
            </div>

            {conversationDetailsLoading ? (
              <div className="chat-profileDrawer__body">
                <div className="chat-empty">Carregando dados da conversa…</div>
              </div>
            ) : conversationDetails ? (
              <div className="chat-profileDrawer__body">
                {(() => {
                  const detailsAvatarUrl = resolveAvatarUrl(conversationAvatarUrl(conversationDetails));
                  const detailsAvatarBusyLabel = conversationAvatarUploading
                    ? "Enviando..."
                    : conversationAvatarRemoving
                    ? "Removendo..."
                    : null;

                  return (
                <div className="chat-contactCard">
                  <EditableAvatar
                    className="chat-avatar chat-avatar--xl"
                    imageUrl={detailsAvatarUrl}
                    fallback={conversationAvatarFallback(conversationDetails)}
                    alt={conversationDisplayName(conversationDetails)}
                    onError={() => markAvatarBroken(conversationAvatarUrl(conversationDetails))}
                    onEdit={
                      conversationDetailsCanManageAvatar
                        ? () => conversationAvatarInputRef.current?.click()
                        : undefined
                    }
                    onRemove={
                      conversationDetailsCanManageAvatar && detailsAvatarUrl
                        ? () => void removeConversationAvatar()
                        : null
                    }
                    busyLabel={conversationDetailsCanManageAvatar ? detailsAvatarBusyLabel : null}
                  />

                  <div className="chat-contactCard__name">{conversationDisplayName(conversationDetails)}</div>

                  <div className="chat-contactCard__sub">{conversationSummaryLine(conversationDetails)}</div>
                </div>
                  );
                })()}

                {conversationDetailsError ? <div className="chat-error">{conversationDetailsError}</div> : null}
                {conversationDetailsLegacyMode ? (
                  <div className="chat-note">
                    Os dados basicos desta conversa foram carregados em modo de compatibilidade. As opcoes de edicao
                    voltam a aparecer depois que o servidor subir com a versao nova.
                  </div>
                ) : null}

                {conversationDetailsCanManageAvatar ? (
                  <>
                    <input
                      ref={conversationAvatarInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadConversationAvatar(file);
                        e.currentTarget.value = "";
                      }}
                    />
                  </>
                ) : null}

                {conversationDetailsKind === "GROUP" ? (
                  <>
                    {conversationDetails.isCurrentParticipant !== false ? (
                      <div className="chat-groupHeroActions">
                        <button
                          className="chat-groupHeroAction"
                          onClick={() => openCreatePicker("group-members", conversationDetails)}
                          disabled={!conversationDetailsCanManageGroup}
                          title={
                            conversationDetailsCanManageGroup
                              ? "Adicionar pessoas"
                              : "Somente administradores podem adicionar pessoas"
                          }
                        >
                          <span className="chat-groupHeroAction__icon">
                            <UserAddIcon />
                          </span>
                          <span className="chat-groupHeroAction__label">Adicionar</span>
                        </button>
                        <button
                          className="chat-groupHeroAction"
                          onClick={() => void leaveGroup(conversationDetails)}
                        >
                          <span className="chat-groupHeroAction__icon">
                            <LogOutIcon />
                          </span>
                          <span className="chat-groupHeroAction__label">Sair do grupo</span>
                        </button>
                      </div>
                    ) : (
                      <div className="chat-groupInactiveNotice">{inactiveGroupNotice(conversationDetails)}</div>
                    )}

                    <div className="chat-sectionTitle">Participantes</div>
                    <div className="chat-groupParticipantsList">
                      {conversationDetailsParticipants.length ? (
                        conversationDetailsParticipants.map((user) => {
                          const isAdmin = !!user.isGroupAdmin;
                          const isSelf = user.id === me?.id;
                          const promoteKey = `${user.id}:promote`;
                          const demoteKey = `${user.id}:demote`;
                          const removeKey = `${user.id}:remove`;
                          const userAvatarUrl = resolveAvatarUrl(user.avatarUrl);
                          const isBusy =
                            groupDetailsActionKey === promoteKey ||
                            groupDetailsActionKey === demoteKey ||
                            groupDetailsActionKey === removeKey;
                          return (
                            <div key={user.id} className="chat-groupParticipantRow">
                              <div className="chat-avatar chat-avatar--md chat-groupParticipantRow__avatar">
                                {userAvatarUrl ? (
                                  <img
                                    src={userAvatarUrl}
                                    alt={user.name}
                                    onError={() => markAvatarBroken(user.avatarUrl)}
                                  />
                                ) : (
                                  <span>{(user.name || user.username || "U").slice(0, 1).toUpperCase()}</span>
                                )}
                              </div>

                              <div className="chat-groupParticipantRow__main">
                                <div className="chat-groupParticipantRow__name">{isSelf ? "Você" : user.name}</div>
                                <div className="chat-groupParticipantRow__sub">{user.email || user.username}</div>
                              </div>

                              <div className="chat-groupParticipantRow__side">
                                {isAdmin ? <span className="chat-roleBadge chat-roleBadge--tail">Admin</span> : null}
                                {conversationDetailsCanManageGroup && !isSelf ? (
                                  <button
                                    className={`chat-groupParticipantMenuBtn ${groupMemberMenuUserId === user.id ? "is-open" : ""}`}
                                    data-group-member-menu-trigger={user.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      groupMemberMenuTriggerRef.current = e.currentTarget;
                                      setGroupMemberMenuPosition(null);
                                      setGroupMemberMenuUserId((prev) => {
                                        const next = prev === user.id ? null : user.id;
                                        if (!next) groupMemberMenuTriggerRef.current = null;
                                        return next;
                                      });
                                    }}
                                    disabled={isBusy}
                                    title="Ações do participante"
                                  >
                                    <DotsIcon />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="chat-empty">Grupo sem participantes ativos no momento.</div>
                      )}
                    </div>

                    <div className="chat-groupSettingsList">
                      <button
                        className="chat-groupSettingsAction"
                        onClick={() => void clearConversation(conversationDetails.id, conversationDisplayName(conversationDetails))}
                      >
                        <ClearConversationIcon />
                        <span>Limpar conversa</span>
                      </button>
                      {conversationDetailsCanManageGroup && conversationDetails.isCurrentParticipant !== false ? (
                        <button
                          className="chat-groupSettingsAction is-danger"
                          onClick={() => void deleteGroupFromDetails(conversationDetails)}
                          disabled={groupDetailsActionKey === `delete:${conversationDetails.id}`}
                        >
                          <TrashIcon />
                          <span>{groupDetailsActionKey === `delete:${conversationDetails.id}` ? "Excluindo grupo..." : "Excluir grupo"}</span>
                        </button>
                      ) : null}
                      {conversationDetails.isCurrentParticipant === false ? (
                        <button
                          className="chat-groupSettingsAction is-danger"
                          onClick={() => removeConversationFromDetailsDrawer(conversationDetails)}
                          disabled={conversationDetailsRemovingChat}
                        >
                          <CloseIcon />
                          <span>{conversationDetailsRemovingChat ? "Removendo dos chats..." : "Remover dos chats"}</span>
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    {conversationDetails.isCurrentParticipant !== false ? (
                      conversationDetailsCanEditBroadcast ? (
                        <div className="chat-groupHeroActions">
                          <button
                            className="chat-groupHeroAction"
                            onClick={() => setBroadcastDetailsEditorOpen((prev) => !prev)}
                            disabled={conversationDetailsLegacyMode}
                            title={
                              conversationDetailsLegacyMode
                                ? "Atualize o servidor para editar essa lista."
                                : "Adicionar ou ajustar quem recebe essa lista"
                            }
                          >
                            <span className="chat-groupHeroAction__icon">
                              <UserAddIcon />
                            </span>
                            <span className="chat-groupHeroAction__label">
                              {broadcastDetailsEditorOpen ? "Fechar edição" : "Adicionar"}
                            </span>
                          </button>
                        </div>
                      ) : null
                    ) : (
                      <div className="chat-groupInactiveNotice">{inactiveGroupNotice(conversationDetails)}</div>
                    )}

                    <div className="chat-sectionTitle">Destinatários</div>
                    <div className="chat-groupParticipantsList">
                      {conversationDetailsEffectiveTargets.length ? (
                        conversationDetailsEffectiveTargets.map((user) => {
                          const userAvatarUrl = resolveAvatarUrl(user.avatarUrl);
                          const removable =
                            broadcastDetailsEditorOpen &&
                            conversationDetailsCanEditBroadcast &&
                            !conversationDetailsLegacyMode;
                          return (
                            <div key={user.id} className="chat-groupParticipantRow">
                              <div className="chat-avatar chat-avatar--md chat-groupParticipantRow__avatar">
                                {userAvatarUrl ? (
                                  <img
                                    src={userAvatarUrl}
                                    alt={user.name}
                                    onError={() => markAvatarBroken(user.avatarUrl)}
                                  />
                                ) : (
                                  <span>{(user.name || user.username || "U").slice(0, 1).toUpperCase()}</span>
                                )}
                              </div>

                              <div className="chat-groupParticipantRow__main">
                                <div className="chat-groupParticipantRow__name">{user.name}</div>
                                <div className="chat-groupParticipantRow__sub">{user.email || user.username}</div>
                              </div>

                              {removable ? (
                                <div className="chat-groupParticipantRow__side">
                                  <button
                                    className="chat-groupParticipantMenuBtn"
                                    onClick={() => removeUserFromConversationDetails(user.id)}
                                    title="Remover da lista"
                                  >
                                    <CloseIcon />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })
                      ) : (
                        <div className="chat-empty">Ninguém está recebendo essa lista agora.</div>
                      )}
                    </div>

                    {conversationDetailsCanEditBroadcast && conversationDetails.isCurrentParticipant !== false ? (
                      <>
                        <div className="chat-sectionTitle">Inclusão automática</div>
                        <div className="chat-broadcastRules chat-broadcastRules--drawer">
                          <label className="chat-broadcastRules__allToggle">
                            <input
                              type="checkbox"
                              checked={conversationDetailsIncludeAllUsers}
                              onChange={(e) => setConversationDetailsIncludeAllUsers(e.target.checked)}
                            />
                            <span>Incluir novos usuários</span>
                          </label>

                          <div className="chat-note">
                            {conversationDetailsIncludeAllUsers
                              ? "Todo usuário novo criado no sistema entra automaticamente nesta lista."
                              : conversationDetailsAutomaticRuleLabels.length
                              ? `Regras ativas: ${conversationDetailsAutomaticRuleLabels.join(" • ")}.`
                              : "Nenhuma regra automática salva. Se ligar essa opção sem regra, a lista passa a aceitar todos os usuários novos."}
                          </div>

                          {conversationDetailsLegacyMode ? (
                            <div className="chat-note">
                              Atualize o servidor para editar as regras automáticas desta lista.
                            </div>
                          ) : (
                            <div className="chat-detailsActions">
                              <button
                                type="button"
                                className="chat-groupHeroAction"
                                onClick={openConversationDetailsRuleManager}
                              >
                                <span className="chat-groupHeroAction__icon">
                                  <GearIcon />
                                </span>
                                <span className="chat-groupHeroAction__label">Configurar regras</span>
                              </button>
                            </div>
                          )}

                          {conversationDetailsAutomaticRuleLabels.length ? (
                            <div className="chat-broadcastRules__chips">
                              {conversationDetailsAutomaticRuleLabels.map((label) => (
                                <span key={label} className="chat-broadcastChip is-selected">
                                  {label}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        {broadcastDetailsEditorOpen && !conversationDetailsLegacyMode ? (
                          <>
                            <div className="chat-sectionTitle">Adicionar pessoas</div>
                            <div className="chat-groupParticipantsList">
                              {conversationDetailsAvailableTargets.length ? (
                                conversationDetailsAvailableTargets.map((user) => {
                                  const userAvatarUrl = resolveAvatarUrl(user.avatarUrl);
                                  return (
                                    <div key={user.id} className="chat-groupParticipantRow">
                                      <div className="chat-avatar chat-avatar--md chat-groupParticipantRow__avatar">
                                        {userAvatarUrl ? (
                                          <img
                                            src={userAvatarUrl}
                                            alt={user.name}
                                            onError={() => markAvatarBroken(user.avatarUrl)}
                                          />
                                        ) : (
                                          <span>{(user.name || user.username || "U").slice(0, 1).toUpperCase()}</span>
                                        )}
                                      </div>

                                      <div className="chat-groupParticipantRow__main">
                                        <div className="chat-groupParticipantRow__name">{user.name}</div>
                                        <div className="chat-groupParticipantRow__sub">{user.email || user.username}</div>
                                      </div>

                                      <div className="chat-groupParticipantRow__side">
                                        <button
                                          className="chat-groupParticipantMenuBtn"
                                          onClick={() => addUserToConversationDetails(user.id)}
                                          title="Adicionar à lista"
                                        >
                                          <PlusIcon />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="chat-empty">Todos os usuários já estão cobertos por essa lista.</div>
                              )}
                            </div>

                            <div className="chat-detailsActions">
                              <button
                                className="chat-primaryBtn"
                                onClick={() => void saveBroadcastConversationDetails()}
                                disabled={conversationDetailsSaving}
                              >
                                {conversationDetailsSaving ? "Salvando..." : "Salvar lista"}
                              </button>
                            </div>
                          </>
                        ) : null}
                      </>
                    ) : null}

                    <div className="chat-groupSettingsList">
                      <button
                        className="chat-groupSettingsAction"
                        onClick={() => void clearConversation(conversationDetails.id, conversationDisplayName(conversationDetails))}
                      >
                        <ClearConversationIcon />
                        <span>Limpar conversa</span>
                      </button>
                      {conversationDetailsCanEditBroadcast && conversationDetails.isCurrentParticipant !== false ? (
                        <button
                          className="chat-groupSettingsAction is-danger"
                          onClick={() => void deleteBroadcastFromDetails(conversationDetails)}
                          disabled={pendingBroadcastDeleteBatch?.conversationId === conversationDetails.id}
                        >
                          <TrashIcon />
                          <span>
                            {pendingBroadcastDeleteBatch?.conversationId === conversationDetails.id
                              ? "Excluindo lista..."
                              : "Excluir lista"}
                          </span>
                        </button>
                      ) : null}
                      {conversationDetails.isCurrentParticipant === false ? (
                        <button
                          className="chat-groupSettingsAction is-danger"
                          onClick={() => removeConversationFromDetailsDrawer(conversationDetails)}
                          disabled={conversationDetailsRemovingChat}
                        >
                          <CloseIcon />
                          <span>{conversationDetailsRemovingChat ? "Removendo dos chats..." : "Remover dos chats"}</span>
                        </button>
                      ) : null}
                    </div>
                  </>
                )}

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
                  ) : (
                    profileMediaItems.map((item) => (
                      <button
                        key={item.id}
                        className={profileMediaTab === "image" ? "chat-mediaThumb chat-mediaThumb--btn" : "chat-fileCard chat-fileCard--btn"}
                        onClick={() => {
                          void jumpToMessageById(item.id);
                          setConversationDetailsOpen(false);
                        }}
                      >
                        {profileMediaTab === "image" ? (
                          isVideoAttachment(item) ? (
                            <div className="chat-videoPreview">
                              <video
                                src={toAbsoluteUrl(item.attachmentUrl) ?? ""}
                                className="chat-mediaThumb__video"
                                preload="metadata"
                                muted
                                playsInline
                              />
                              <span className="chat-videoPreview__play" aria-hidden="true">
                                <PlayOverlayIcon />
                              </span>
                            </div>
                          ) : (
                            <img
                              src={toAbsoluteUrl(item.attachmentUrl) ?? ""}
                              alt={normalizeAttachmentDisplayName(item.attachmentName) || "imagem"}
                              loading="lazy"
                              decoding="async"
                            />
                          )
                        ) : (
                          <div className="chat-fileCard__body">
                            <div className="chat-fileCard__icon">
                              <AttachmentKindIcon message={item} />
                            </div>
                            <div className="chat-fileCard__text">
                              <div className="chat-fileCard__name">
                                {normalizeAttachmentDisplayName(item.attachmentName) || "Arquivo"}
                              </div>
                              <div className="chat-fileCard__meta">
                                {attachmentTypeLabel(item)}
                                {item.attachmentSize ? ` • ${formatBytes(item.attachmentSize)}` : ""}
                              </div>
                            </div>
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="chat-profileDrawer__body">
                <div className="chat-empty">Não foi possível carregar os dados da conversa.</div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {conversationDetailsRuleManagerOpen &&
      conversationDetailsKind === "BROADCAST" &&
      conversationDetailsCanEditBroadcast ? (
        <div className="chat-pickerRuleModalBackdrop" onClick={() => setConversationDetailsRuleManagerOpen(false)}>
          <div className="chat-pickerRuleModal" onClick={(e) => e.stopPropagation()}>
            <div className="chat-pickerRuleModal__header">
              <div className="chat-pickerRuleModal__title">Regras automáticas da lista</div>
              <button className="chat-iconBtn" onClick={() => setConversationDetailsRuleManagerOpen(false)}>
                <CloseIcon />
              </button>
            </div>

            <div className="chat-pickerRuleModal__body">
              <div className="chat-pickerRuleModal__intro">
                Cada regra combina <strong>empresa + setor</strong>. Quem for criado depois com essa combinação entra
                automaticamente na lista.
              </div>

              <div className="chat-pickerRuleRows">
                {conversationDetailsAutomaticRules.length ? (
                  conversationDetailsAutomaticRules.map((rule, index) => (
                    <div key={rule.id} className="chat-pickerRuleRow">
                      <span className="chat-pickerRuleRow__index">{index + 1}</span>
                      <select
                        className="chat-select"
                        value={rule.companyId ?? ""}
                        onChange={(e) => {
                          const nextCompanyId = e.target.value || null;
                          updateConversationDetailsAutomaticRule(rule.id, {
                            companyId: nextCompanyId,
                            company: nextCompanyId
                              ? companyRuleOptions.find((item) => item.id === nextCompanyId) ?? null
                              : null,
                          });
                        }}
                      >
                        <option value="">Todas as empresas</option>
                        {companyRuleOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>

                      <select
                        className="chat-select"
                        value={rule.departmentId ?? ""}
                        onChange={(e) => {
                          const nextDepartmentId = e.target.value || null;
                          updateConversationDetailsAutomaticRule(rule.id, {
                            departmentId: nextDepartmentId,
                            department: nextDepartmentId
                              ? departmentRuleOptions.find((item) => item.id === nextDepartmentId) ?? null
                              : null,
                          });
                        }}
                      >
                        <option value="">Todos os setores</option>
                        {departmentRuleOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="chat-pickerRuleRow__remove"
                        onClick={() => removeConversationDetailsAutomaticRule(rule.id)}
                      >
                        <TrashIcon />
                        <span>Remover</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="chat-empty">Nenhuma regra criada ainda.</div>
                )}
              </div>
            </div>

            <div className="chat-pickerRuleModal__footer">
              <button className="chat-confirmModal__btn" onClick={addEmptyConversationDetailsRule}>
                <PlusIcon />
                <span>Adicionar regra</span>
              </button>
              <button
                className="chat-primaryBtn"
                onClick={() => setConversationDetailsRuleManagerOpen(false)}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {favoriteDeletePrompt ? (
        <div className="chat-modalBackdrop" onClick={() => setFavoriteDeletePrompt(null)}>
          <div className="chat-modal chat-confirmModal" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal__header">
              <div className="chat-modal__title">Mensagens favoritas</div>
              <button className="chat-iconBtn chat-iconBtn--sm" onClick={() => setFavoriteDeletePrompt(null)}>
                <CloseIcon />
              </button>
            </div>
            <div className="chat-modal__body chat-confirmModal__body">
              {favoriteDeletePrompt.favoriteCount === 1
                ? "Há 1 mensagem favorita na seleção."
                : `Há ${favoriteDeletePrompt.favoriteCount} mensagens favoritas na seleção.`}
              <br />
              Você quer apagar todas mesmo ou manter as favoritas?
            </div>
            <div className="chat-confirmModal__actions">
              <button className="chat-confirmModal__btn" onClick={() => setFavoriteDeletePrompt(null)}>
                Cancelar
              </button>
              <button className="chat-confirmModal__btn" onClick={() => confirmDeleteSelectedMessages(false)}>
                Manter favoritas
              </button>
              <button className="chat-primaryBtn" onClick={() => confirmDeleteSelectedMessages(true)}>
                Apagar todas
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeChatsPrompt ? (
        <div className="chat-modalBackdrop" onClick={() => setRemoveChatsPrompt(null)}>
          <div className="chat-modal chat-confirmModal" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal__header">
              <div className="chat-modal__title">Apagar chats</div>
              <button className="chat-iconBtn chat-iconBtn--sm" onClick={() => setRemoveChatsPrompt(null)}>
                <CloseIcon />
              </button>
            </div>
            <div className="chat-modal__body chat-confirmModal__body">
              {removeChatsPrompt.totalCount === 1
                ? "Deseja apagar o chat selecionado?"
                : `Deseja apagar os ${removeChatsPrompt.totalCount} chats selecionados?`}
            </div>
            <div className="chat-confirmModal__actions">
              <button className="chat-confirmModal__btn" onClick={() => setRemoveChatsPrompt(null)}>
                Cancelar
              </button>
              <button className="chat-primaryBtn" onClick={confirmRemoveSelectedConversations}>
                Apagar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {conversationClearPrompt ? (
        <div className="chat-modalBackdrop" onClick={() => setConversationClearPrompt(null)}>
          <div className="chat-modal chat-confirmModal" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal__header">
              <div className="chat-modal__title">Limpar conversa</div>
              <button className="chat-iconBtn chat-iconBtn--sm" onClick={() => setConversationClearPrompt(null)}>
                <CloseIcon />
              </button>
            </div>
            <div className="chat-modal__body chat-confirmModal__body">
              {conversationClearPrompt.favoriteCount > 0 ? (
                <>
                  {conversationClearPrompt.favoriteCount === 1
                    ? "Há 1 mensagem favorita nesta conversa."
                    : `Há ${conversationClearPrompt.favoriteCount} mensagens favoritas nesta conversa.`}
                  <br />
                  Você quer limpar tudo mesmo ou manter as favoritas?
                </>
              ) : (
                <>
                  {conversationClearPrompt.totalCount === 1
                    ? "Deseja limpar a única mensagem visível desta conversa?"
                    : `Deseja limpar as ${conversationClearPrompt.totalCount} mensagens visíveis desta conversa?`}
                </>
              )}
            </div>
            <div className="chat-confirmModal__actions">
              <button className="chat-confirmModal__btn" onClick={() => setConversationClearPrompt(null)}>
                Cancelar
              </button>
              {conversationClearPrompt.favoriteCount > 0 ? (
                <button className="chat-confirmModal__btn" onClick={() => confirmClearConversation(true)}>
                  Manter favoritas
                </button>
              ) : null}
              <button className="chat-primaryBtn" onClick={() => confirmClearConversation(false)}>
                Limpar conversa
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingActionToast ? (
        <div className="chat-deleteUndoToast" role="status" aria-live="polite">
          <div className="chat-deleteUndoToast__content">
            <div className="chat-deleteUndoToast__status">
              <span
                className="chat-deleteUndoToast__timerSpinner"
                aria-label={`${pendingActionToast.seconds} segundos restantes`}
              >
                <span className="chat-deleteUndoToast__spinner" aria-hidden="true">
                  <SpinnerIcon />
                </span>
                <span className="chat-deleteUndoToast__timerValue">{pendingActionToast.seconds}</span>
              </span>
              <span className="chat-deleteUndoToast__text">{pendingActionToast.label}</span>
            </div>
            <button className="chat-deleteUndoToast__undo" onClick={pendingActionToast.onUndo}>
              Desfazer
            </button>
          </div>
          <div className="chat-deleteUndoToast__bar">
            <div
              className="chat-deleteUndoToast__barFill"
              style={{ width: `${pendingActionToast.progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {removalNoticesLoading ? (
        <div className="chat-taskOverlay" aria-live="polite" aria-busy="true">
          <div className="chat-taskOverlay__card">
            <div className="chat-taskOverlay__title">Excluindo...</div>
            <div className="chat-taskOverlay__subtitle">Removendo os avisos deste chat</div>
            <div className="chat-taskOverlay__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={removalNoticesProgress}>
              <div
                className="chat-taskOverlay__progressFill"
                style={{ width: `${removalNoticesProgress}%` }}
              />
            </div>
            <div className="chat-taskOverlay__percent">{removalNoticesProgress}%</div>
          </div>
        </div>
      ) : null}

      {toastState ? (
        <div className={`chat-toast${toastState.tone === "success" ? " chat-toast--success" : ""}`} role="status" aria-live="polite">
          {toastState.tone === "success" ? (
            <span className="chat-toast__icon" aria-hidden="true">
              <CheckCircleIcon />
            </span>
          ) : null}
          <span className="chat-toast__label">{toastState.message}</span>
        </div>
      ) : null}
    </div>
  );
}
