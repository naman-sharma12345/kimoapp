const BYTES_PER_GB = 1_000_000_000;
const DEFAULT_STORAGE_CAP_BYTES = 5 * BYTES_PER_GB;

export interface UsageMeterCalculations {
  clampedUsed: number;
  safeLimit: number;
  ratio: number;
  percentage: number;
  isLimitReached: boolean;
}

/**
 * Computes ratio, percentage, and limit status for usage meters.
 */
export function computeUsageMeter(
  used: number,
  limit: number,
): UsageMeterCalculations {
  const safeLimit = Math.max(1, limit);
  const clampedUsed = Math.max(0, Math.min(used, safeLimit));
  const ratio = clampedUsed / safeLimit;
  const percentage = Math.round(ratio * 100);
  const isLimitReached = clampedUsed >= safeLimit;

  return {
    clampedUsed,
    safeLimit,
    ratio,
    percentage,
    isLimitReached,
  };
}

/**
 * Formats a reset ISO timestamp relative to `nowMs` as "resets in Xh Ym".
 */
export function formatResetCountdown(
  resetsAtIso: string,
  nowMs: number = Date.now(),
): string {
  const targetMs = new Date(resetsAtIso).getTime();
  if (Number.isNaN(targetMs)) {
    return 'resets in 0h 0m';
  }
  const diffMs = Math.max(0, targetMs - nowMs);
  const totalMinutes = Math.max(0, Math.ceil(diffMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `resets in ${hours}h ${minutes}m`;
}

/**
 * Formats byte count to gigabytes with one decimal place (e.g. "1.2 GB").
 */
export function formatStorageGigabytes(bytesUsed: number): string {
  const safeBytes = Math.max(0, bytesUsed);
  const gb = safeBytes / BYTES_PER_GB;
  return `${gb.toFixed(1)} GB`;
}

/**
 * Computes fill ratio [0, 1] for the 64px storage indicator bar.
 */
export function computeStorageBarRatio(
  bytesUsed: number,
  capacityBytes: number = DEFAULT_STORAGE_CAP_BYTES,
): number {
  const safeCap = Math.max(1, capacityBytes);
  const safeUsed = Math.max(0, Math.min(bytesUsed, safeCap));
  return safeUsed / safeCap;
}

/**
 * Extracts lowercase initials from a user's name or email.
 */
export function getUserInitials(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed.length > 0) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toLowerCase();
    }
    return trimmed.slice(0, 2).toLowerCase();
  }
  const emailTrimmed = email.trim();
  if (emailTrimmed.length > 0) {
    return emailTrimmed.slice(0, 2).toLowerCase();
  }
  return 'km';
}

/**
 * Checks whether the delete confirmation input strictly matches "delete".
 */
export function isDeleteConfirmationValid(value: string): boolean {
  return value === 'delete';
}
