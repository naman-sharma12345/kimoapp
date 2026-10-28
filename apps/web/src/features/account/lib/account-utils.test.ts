import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  computeUsageMeter,
  formatResetCountdown,
  formatStorageGigabytes,
  computeStorageBarRatio,
  getUserInitials,
  isDeleteConfirmationValid,
} from './account-utils';

test('computeUsageMeter calculates normal and limit-reached states accurately', () => {
  const normal = computeUsageMeter(3, 10);
  assert.equal(normal.clampedUsed, 3);
  assert.equal(normal.percentage, 30);
  assert.equal(normal.isLimitReached, false);

  const renderNormal = computeUsageMeter(11.4, 30);
  assert.equal(renderNormal.percentage, 38);
  assert.equal(renderNormal.isLimitReached, false);

  const full = computeUsageMeter(10, 10);
  assert.equal(full.percentage, 100);
  assert.equal(full.isLimitReached, true);

  const over = computeUsageMeter(15, 10);
  assert.equal(over.clampedUsed, 10);
  assert.equal(over.isLimitReached, true);
});

test('formatResetCountdown formats hours and minutes cleanly', () => {
  const baseNow = new Date('2026-10-28T18:48:00.000Z').getTime();
  const resetsAt = new Date('2026-10-29T00:00:00.000Z').toISOString();
  assert.equal(formatResetCountdown(resetsAt, baseNow), 'resets in 5h 12m');

  const pastReset = new Date('2026-10-28T10:00:00.000Z').toISOString();
  assert.equal(formatResetCountdown(pastReset, baseNow), 'resets in 0h 0m');
});

test('formatStorageGigabytes formats bytes to 1.2 GB', () => {
  assert.equal(formatStorageGigabytes(1_200_000_000), '1.2 GB');
  assert.equal(formatStorageGigabytes(0), '0.0 GB');
});

test('computeStorageBarRatio returns clamped ratio', () => {
  assert.equal(computeStorageBarRatio(1_200_000_000, 5_000_000_000), 0.24);
  assert.equal(computeStorageBarRatio(9_000_000_000, 5_000_000_000), 1);
});

test('getUserInitials returns two lowercase characters', () => {
  assert.equal(getUserInitials('mira chen', 'mira@getkimo.tech'), 'mc');
  assert.equal(getUserInitials('mira', 'mira@getkimo.tech'), 'mi');
  assert.equal(getUserInitials('', 'mira@getkimo.tech'), 'mi');
});

test('isDeleteConfirmationValid requires exact lowercase "delete"', () => {
  assert.equal(isDeleteConfirmationValid('delete'), true);
  assert.equal(isDeleteConfirmationValid('DELETE'), false);
  assert.equal(isDeleteConfirmationValid('del'), false);
  assert.equal(isDeleteConfirmationValid('delete '), false);
});
