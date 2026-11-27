import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBoothComparisonSeries,
  buildCertificateStatusSeries,
  buildDailyTrendSeries,
  buildGiftStatusSeries,
  buildProgressFunnelSeries,
  calcSafePercent,
  computeDashboardSummary,
} from './dashboardMetrics';
import { createInitialSeedDatabase } from '../services/adapters/seedData';

test('dashboardMetrics handles zero denominators safely without NaN', () => {
  assert.equal(calcSafePercent(0, 0), 0);
  assert.equal(calcSafePercent(5, 0), 0);
  assert.equal(calcSafePercent(12, 10), 100);

  const summary = computeDashboardSummary([], [], [], [], [], '2026-11-26');
  assert.equal(summary.registrationPct, 0);
  const funnel = buildProgressFunnelSeries(summary, 0);
  assert.ok(funnel.every((item) => item.pct === 0 && Number.isFinite(item.pct)));
});

test('dashboardMetrics builds accurate single-activity and ALL-activity chart series', () => {
  const db = createInitialSeedDatabase();
  const gzEx = db.exhibitors.filter((e) => e.activityId === 'act-gz-2027');
  const gzMem = db.members.filter((m) => m.activityId === 'act-gz-2027');
  const gzBatches = db.giftBatches.filter((b) => b.activityId === 'act-gz-2027');
  const gzTickets = db.giftTickets.filter((t) => t.activityId === 'act-gz-2027');
  const gzRed = db.redemptionRecords.filter((r) => r.activityId === 'act-gz-2027');

  const summary = computeDashboardSummary(gzEx, gzMem, gzBatches, gzTickets, gzRed, '2026-11-26');
  assert.equal(summary.totalQuota, 20);
  assert.equal(summary.validMembersCount, 6);
  assert.equal(summary.claimedBadges, 1);
  assert.equal(summary.todayRedemptions, 1);

  const trend = buildDailyTrendSeries(gzMem, gzTickets, gzRed, '2026-11-26');
  assert.ok(trend.length >= 2);
  assert.ok(trend.some((p) => p.date === '2026-11-26' && p.redemptions === 1));

  const certSlices = buildCertificateStatusSeries(gzMem);
  assert.equal(
    certSlices.reduce((s, x) => s + x.value, 0),
    gzMem.length,
  );

  const giftSlices = buildGiftStatusSeries(gzTickets);
  assert.equal(
    giftSlices.reduce((s, x) => s + x.value, 0),
    gzTickets.length,
  );

  const boothBars = buildBoothComparisonSeries(gzEx, gzMem, false, db.activities);
  assert.equal(boothBars.length, gzEx.length);
  assert.equal(boothBars[0].name, 'A01');

  const allActivityBars = buildBoothComparisonSeries(db.exhibitors, db.members, true, db.activities);
  assert.equal(allActivityBars.length, db.activities.length);
});
