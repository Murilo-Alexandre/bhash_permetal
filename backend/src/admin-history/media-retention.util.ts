import { MediaRetentionInterval } from '@prisma/client';

export const ATTACHMENT_REMOVAL_NOTICE =
  'Esta imagem ou documento foi apagado pelo administrador segundo a política de backup de arquivos.';
export const IMAGE_REMOVAL_NOTICE =
  'Essa imagem foi apagada pelo administrador segundo a política de backup de arquivos.';
export const FILE_REMOVAL_NOTICE =
  'Esse documento foi apagado pelo administrador segundo a política de backup de arquivos.';

export function attachmentRemovalNoticeByType(contentType: 'IMAGE' | 'FILE') {
  return contentType === 'IMAGE' ? IMAGE_REMOVAL_NOTICE : FILE_REMOVAL_NOTICE;
}

export function isAttachmentRemovalNoticeText(value?: string | null) {
  const text = String(value ?? '').toLowerCase();
  if (!text) return false;
  return (
    text.includes(ATTACHMENT_REMOVAL_NOTICE.toLowerCase()) ||
    text.includes(IMAGE_REMOVAL_NOTICE.toLowerCase()) ||
    text.includes(FILE_REMOVAL_NOTICE.toLowerCase())
  );
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BIWEEKLY_ANCHOR = new Date(1970, 0, 5, 0, 0, 0, 0); // segunda-feira
const DEFAULT_RUN_HOUR = 0;
const DEFAULT_RUN_MINUTE = 0;

export type MediaRetentionRunTime = {
  hour: number;
  minute: number;
};

export type MediaRetentionIntervalUnit = 'DAY' | 'MONTH' | 'YEAR';

export function mediaRetentionUnitFromInterval(interval: MediaRetentionInterval): {
  unit: MediaRetentionIntervalUnit;
  count: number;
} {
  switch (interval) {
    case 'DAILY':
      return { unit: 'DAY', count: 1 };
    case 'WEEKLY':
      return { unit: 'DAY', count: 7 };
    case 'BIWEEKLY':
      return { unit: 'DAY', count: 14 };
    case 'MONTHLY':
      return { unit: 'MONTH', count: 1 };
    case 'QUARTERLY':
      return { unit: 'MONTH', count: 3 };
    case 'SEMIANNUAL':
      return { unit: 'MONTH', count: 6 };
    case 'YEARLY':
      return { unit: 'YEAR', count: 1 };
    default:
      return { unit: 'MONTH', count: 1 };
  }
}

export function mediaRetentionIntervalLabel(
  interval: MediaRetentionInterval,
  intervalCount?: number | null,
): string {
  const legacy = mediaRetentionUnitFromInterval(interval);
  const unit = interval === 'DAILY' || interval === 'MONTHLY' || interval === 'YEARLY' ? legacy.unit : legacy.unit;
  const countRaw =
    interval === 'DAILY' || interval === 'MONTHLY' || interval === 'YEARLY'
      ? Number(intervalCount ?? legacy.count)
      : legacy.count;
  const count = clampInt(countRaw, 1, 999);

  if (unit === 'DAY') {
    return count === 1 ? 'Todo dia' : `A cada ${count} dias`;
  }
  if (unit === 'MONTH') {
    return count === 1 ? 'Todo mês' : `A cada ${count} meses`;
  }
  return count === 1 ? 'Todo ano' : `A cada ${count} anos`;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  const n = Math.trunc(value);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function normalizeMediaRetentionRunTime(
  runTime?: Partial<MediaRetentionRunTime> | null,
): MediaRetentionRunTime {
  const hour = clampInt(Number(runTime?.hour), 0, 23);
  const minute = clampInt(Number(runTime?.minute), 0, 59);
  return {
    hour: Number.isFinite(hour) ? hour : DEFAULT_RUN_HOUR,
    minute: Number.isFinite(minute) ? minute : DEFAULT_RUN_MINUTE,
  };
}

function atRunTime(base: Date, runTime: MediaRetentionRunTime) {
  const candidate = new Date(base);
  candidate.setHours(runTime.hour, runTime.minute, 0, 0);
  return candidate;
}

function nextMondayCandidate(from: Date, runTime: MediaRetentionRunTime) {
  const base = startOfDay(from);
  const day = base.getDay(); // 0=dom, 1=seg
  const daysUntilMonday = (1 - day + 7) % 7;
  const candidate = atRunTime(
    new Date(base.getFullYear(), base.getMonth(), base.getDate() + daysUntilMonday),
    runTime,
  );

  if (candidate <= from) {
    candidate.setDate(candidate.getDate() + 7);
  }

  return candidate;
}

function isBiweeklySlot(date: Date) {
  const dayStart = startOfDay(date).getTime();
  const anchorStart = BIWEEKLY_ANCHOR.getTime();
  const diffWeeks = Math.floor((dayStart - anchorStart) / WEEK_MS);
  return diffWeeks % 2 === 0;
}

export function computeNextMediaRetentionRun(
  interval: MediaRetentionInterval,
  intervalCount = 1,
  from = new Date(),
  runTimeInput?: Partial<MediaRetentionRunTime> | null,
) {
  const now = new Date(from);
  const runTime = normalizeMediaRetentionRunTime(runTimeInput);
  const normalizedCount = clampInt(Number(intervalCount), 1, 999);

  switch (interval) {
    case 'DAILY': {
      const candidate = atRunTime(startOfDay(now), runTime);
      if (candidate <= now) {
        candidate.setDate(candidate.getDate() + normalizedCount);
      }
      return candidate;
    }
    case 'WEEKLY': {
      return nextMondayCandidate(now, runTime);
    }
    case 'BIWEEKLY': {
      let candidate = nextMondayCandidate(now, runTime);
      while (!isBiweeklySlot(candidate)) {
        candidate = new Date(
          candidate.getFullYear(),
          candidate.getMonth(),
          candidate.getDate() + 7,
          runTime.hour,
          runTime.minute,
          0,
          0,
        );
      }
      return candidate;
    }
    case 'MONTHLY': {
      const startMonth = Math.floor(now.getMonth() / normalizedCount) * normalizedCount;
      let candidate = new Date(
        now.getFullYear(),
        startMonth,
        1,
        runTime.hour,
        runTime.minute,
        0,
        0,
      );
      if (candidate <= now) {
        candidate = new Date(
          now.getFullYear(),
          startMonth + normalizedCount,
          1,
          runTime.hour,
          runTime.minute,
          0,
          0,
        );
      }
      return candidate;
    }
    case 'QUARTERLY': {
      const startMonth = Math.floor(now.getMonth() / 3) * 3;
      let candidate = new Date(now.getFullYear(), startMonth, 1, runTime.hour, runTime.minute, 0, 0);
      if (candidate <= now) {
        candidate = new Date(now.getFullYear(), startMonth + 3, 1, runTime.hour, runTime.minute, 0, 0);
      }
      return candidate;
    }
    case 'SEMIANNUAL': {
      const startMonth = now.getMonth() < 6 ? 0 : 6;
      let candidate = new Date(now.getFullYear(), startMonth, 1, runTime.hour, runTime.minute, 0, 0);
      if (candidate <= now) {
        candidate = new Date(now.getFullYear(), startMonth + 6, 1, runTime.hour, runTime.minute, 0, 0);
      }
      return candidate;
    }
    case 'YEARLY':
    default: {
      const startYear = now.getFullYear() - (now.getFullYear() % normalizedCount);
      let candidate = new Date(startYear, 0, 1, runTime.hour, runTime.minute, 0, 0);
      if (candidate <= now) {
        candidate = new Date(startYear + normalizedCount, 0, 1, runTime.hour, runTime.minute, 0, 0);
      }
      return candidate;
    }
  }
}

export function listMediaRetentionIntervals() {
  return [
    'DAILY',
    'WEEKLY',
    'BIWEEKLY',
    'MONTHLY',
    'QUARTERLY',
    'SEMIANNUAL',
    'YEARLY',
  ] as const;
}
