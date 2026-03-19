const MOJIBAKE_MARKERS = /[ÃÂ�]/u;
const IMAGE_NAME_RE = /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif|avif)([?#]|$)/i;
const VIDEO_NAME_RE = /\.(mp4|webm|ogg|ogv|mov|m4v|avi|mkv|3gp|mpeg?|mpg|wmv)([?#]|$)/i;

function mojibakeScore(value: string) {
  let score = 0;
  for (const char of value) {
    if (char === '�') score += 4;
    if (char === 'Ã' || char === 'Â') score += 2;
  }
  return score;
}

function tryDecodeLatin1AsUtf8(value: string) {
  try {
    return Buffer.from(value, 'latin1').toString('utf8');
  } catch {
    return value;
  }
}

export function normalizeUploadedFileName(input?: string | null) {
  const raw = String(input ?? '').replace(/\0/g, '').trim();
  if (!raw) return '';

  const normalized = raw.normalize('NFC');
  if (!MOJIBAKE_MARKERS.test(normalized)) return normalized;

  const decoded = tryDecodeLatin1AsUtf8(normalized).replace(/\0/g, '').trim().normalize('NFC');
  if (!decoded) return normalized;

  return mojibakeScore(decoded) < mojibakeScore(normalized) ? decoded : normalized;
}

function normalizeFileHint(value?: string | null) {
  return normalizeUploadedFileName(value).toLowerCase();
}

export function isLikelyImageFile(input?: {
  mimetype?: string | null;
  originalname?: string | null;
  filename?: string | null;
  attachmentName?: string | null;
  attachmentUrl?: string | null;
}) {
  const mime = String(input?.mimetype ?? '').toLowerCase();
  if (mime.startsWith('image/')) return true;

  const hints = [
    input?.originalname,
    input?.filename,
    input?.attachmentName,
    input?.attachmentUrl,
  ];

  return hints.some((hint) => IMAGE_NAME_RE.test(normalizeFileHint(hint)));
}

export function isLikelyVideoFile(input?: {
  mimetype?: string | null;
  originalname?: string | null;
  filename?: string | null;
  attachmentName?: string | null;
  attachmentUrl?: string | null;
}) {
  const mime = String(input?.mimetype ?? '').toLowerCase();
  if (mime.startsWith('video/')) return true;

  const hints = [
    input?.originalname,
    input?.filename,
    input?.attachmentName,
    input?.attachmentUrl,
  ];

  return hints.some((hint) => VIDEO_NAME_RE.test(normalizeFileHint(hint)));
}

export function isLikelyMediaFile(input?: {
  mimetype?: string | null;
  originalname?: string | null;
  filename?: string | null;
  attachmentName?: string | null;
  attachmentUrl?: string | null;
}) {
  return isLikelyImageFile(input) || isLikelyVideoFile(input);
}
