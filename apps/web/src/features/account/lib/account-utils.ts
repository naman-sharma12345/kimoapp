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
