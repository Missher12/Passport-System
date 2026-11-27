import type {
  Activity,
  Exhibitor,
  ExhibitorMember,
  GiftBatch,
  GiftTicket,
  RedemptionRecord,
} from '../types/domain';

export interface TrendPoint {
  date: string;
  label: string;
  members: number;
  gifts: number;
  redemptions: number;
}

export interface StatusSlice {
  name: string;
  value: number;
  color: string;
}

export interface BoothBarPoint {
  name: string;
  fullName: string;
  quota: number;
  registered: number;
  claimed: number;
}

export interface FunnelBarPoint {
  label: string;
  current: number;
  total: number;
  pct: number;
  color: string;
}

export interface DashboardSummary {
  totalQuota: number;
  validMembersCount: number;
  normalValidMembers: number;
  extraValidMembers: number;
  avatarCompleted: number;
  avatarPending: number;
  claimedBadges: number;
  pendingClaimBadges: number;
  registrationPct: number;
  totalGiftQuota: number;
  validGifts: number;
  redeemedGifts: number;
  nonVoidedGifts: number;
  waitingFillGifts: number;
  todayRedemptions: number;
  totalSuccessfulRedemptions: number;
  abnormalMembers: number;
  abnormalGifts: number;
  abnormalTotal: number;
}

export function calcSafePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

export function computeDashboardSummary(
  exhibitors: Exhibitor[],
  members: ExhibitorMember[],
  giftBatches: GiftBatch[],
  giftTickets: GiftTicket[],
  redemptions: RedemptionRecord[],
  todayStr: string,
): DashboardSummary {
  const totalQuota = exhibitors.reduce((sum, e) => sum + e.quota, 0);
  const validMembers = members.filter((m) => m.status !== 'voided');
  const normalValidMembers = validMembers.filter((m) => !m.isOnsiteExtra).length;
  const extraValidMembers = validMembers.filter((m) => m.isOnsiteExtra).length;
  const avatarCompleted = validMembers.filter((m) => Boolean(m.avatarUrl)).length;
  const avatarPending = Math.max(0, validMembers.length - avatarCompleted);
  const claimedBadges = validMembers.filter((m) => m.status === 'badge_claimed').length;
  const pendingClaimBadges = validMembers.filter(
    (m) => m.status !== 'badge_claimed' && m.status !== 'frozen',
  ).length;

  const totalGiftQuota = giftBatches.reduce((sum, b) => sum + b.totalQuota, 0);
  const validGifts = giftTickets.filter(
    (t) => t.status === 'valid' || t.status === 'generated',
  ).length;
  const redeemedGifts = giftTickets.filter((t) => t.status === 'redeemed').length;
  const nonVoidedGifts = giftTickets.filter((t) => t.status !== 'voided').length;
  const waitingFillGifts = giftTickets.filter((t) => t.status === 'waiting_fill').length;

  const successfulRedemptions = redemptions.filter((r) => r.outcome === 'success');
  const todayRedemptions = successfulRedemptions.filter(
    (r) => r.createdAt.slice(0, 10) === todayStr,
  ).length;

  const abnormalMembers = members.filter(
    (m) => m.status === 'frozen' || m.status === 'voided',
  ).length;
  const abnormalGifts = giftTickets.filter(
    (t) => t.status === 'frozen' || t.status === 'voided' || t.status === 'expired',
  ).length;

  return {
    totalQuota,
    validMembersCount: validMembers.length,
    normalValidMembers,
    extraValidMembers,
    avatarCompleted,
    avatarPending,
    claimedBadges,
    pendingClaimBadges,
    registrationPct: calcSafePercent(validMembers.length, totalQuota),
    totalGiftQuota,
    validGifts,
    redeemedGifts,
    nonVoidedGifts,
    waitingFillGifts,
    todayRedemptions,
    totalSuccessfulRedemptions: successfulRedemptions.length,
    abnormalMembers,
    abnormalGifts,
    abnormalTotal: abnormalMembers + abnormalGifts,
  };
}

export function buildDailyTrendSeries(
  members: ExhibitorMember[],
  giftTickets: GiftTicket[],
  redemptions: RedemptionRecord[],
  todayStr: string,
): TrendPoint[] {
  const dateSet = new Set<string>();
  const memberByDate = new Map<string, number>();
  const giftByDate = new Map<string, number>();
  const redemptionByDate = new Map<string, number>();

  for (const m of members) {
    if (m.status === 'voided') continue;
    const d = (m.createdAt || '').slice(0, 10);
    if (!d) continue;
    dateSet.add(d);
    memberByDate.set(d, (memberByDate.get(d) ?? 0) + 1);
  }

  for (const t of giftTickets) {
    if (t.status === 'voided') continue;
    const d = (t.createdAt || '').slice(0, 10);
    if (!d) continue;
    dateSet.add(d);
    giftByDate.set(d, (giftByDate.get(d) ?? 0) + 1);
  }

  for (const r of redemptions) {
    if (r.outcome !== 'success') continue;
    const d = (r.createdAt || '').slice(0, 10);
    if (!d) continue;
    dateSet.add(d);
    redemptionByDate.set(d, (redemptionByDate.get(d) ?? 0) + 1);
  }

  if (todayStr) {
    dateSet.add(todayStr);
  }

  const sorted = Array.from(dateSet).sort().slice(-8);
  return sorted.map((date) => ({
    date,
    label: date.slice(5),
    members: memberByDate.get(date) ?? 0,
    gifts: giftByDate.get(date) ?? 0,
    redemptions: redemptionByDate.get(date) ?? 0,
  }));
}

export function buildCertificateStatusSeries(members: ExhibitorMember[]): StatusSlice[] {
  const claimed = members.filter((m) => m.status === 'badge_claimed').length;
  const generated = members.filter(
    (m) => m.status === 'credential_generated' || (m.status !== 'voided' && m.status !== 'frozen' && m.status !== 'badge_claimed' && Boolean(m.avatarUrl)),
  ).length;
  const waitingAvatar = members.filter(
    (m) => m.status !== 'voided' && m.status !== 'frozen' && m.status !== 'badge_claimed' && !m.avatarUrl,
  ).length;
  const abnormal = members.filter((m) => m.status === 'frozen' || m.status === 'voided').length;

  return [
    { name: '已领证', value: claimed, color: '#10b981' },
    { name: '待领证', value: generated, color: '#0071e3' },
    { name: '待补头像', value: waitingAvatar, color: '#f59e0b' },
    { name: '冻结/作废', value: abnormal, color: '#ef4444' },
  ];
}

export function buildGiftStatusSeries(giftTickets: GiftTicket[]): StatusSlice[] {
  const redeemed = giftTickets.filter((t) => t.status === 'redeemed').length;
  const valid = giftTickets.filter((t) => t.status === 'valid' || t.status === 'generated').length;
  const waitingFill = giftTickets.filter((t) => t.status === 'waiting_fill').length;
  const abnormal = giftTickets.filter(
    (t) => t.status === 'frozen' || t.status === 'voided' || t.status === 'expired',
  ).length;

  return [
    { name: '已核销', value: redeemed, color: '#10b981' },
    { name: '有效可用', value: valid, color: '#0071e3' },
    { name: '待填写', value: waitingFill, color: '#7c3aed' },
    { name: '冻结/作废', value: abnormal, color: '#ef4444' },
  ];
}

export function buildBoothComparisonSeries(
  exhibitors: Exhibitor[],
  members: ExhibitorMember[],
  isAllScope: boolean,
  activities: Activity[],
): BoothBarPoint[] {
  if (isAllScope && activities.length > 0) {
    return activities.slice(0, 6).map((act) => {
      const actEx = exhibitors.filter((e) => e.activityId === act.id);
      const actMem = members.filter((m) => m.activityId === act.id && m.status !== 'voided');
      const shortLabel = act.name.replace(/^20\d\d\s*/, '').slice(0, 6);
      return {
        name: shortLabel || act.code,
        fullName: act.name,
        quota: actEx.reduce((s, e) => s + e.quota, 0),
        registered: actMem.length,
        claimed: actMem.filter((m) => m.status === 'badge_claimed').length,
      };
    });
  }

  return [...exhibitors]
    .sort((a, b) => b.quota - a.quota)
    .slice(0, 6)
    .map((ex) => {
      const exMem = members.filter((m) => m.exhibitorId === ex.id && m.status !== 'voided');
      return {
        name: ex.boothNumber,
        fullName: `${ex.boothNumber} · ${ex.boothName}`,
        quota: ex.quota,
        registered: exMem.length,
        claimed: exMem.filter((m) => m.status === 'badge_claimed').length,
      };
    });
}

export function buildProgressFunnelSeries(summary: DashboardSummary, totalGiftsCount: number): FunnelBarPoint[] {
  return [
    {
      label: '人员登记',
      current: summary.validMembersCount,
      total: summary.totalQuota,
      pct: calcSafePercent(summary.validMembersCount, summary.totalQuota),
      color: '#0071e3',
    },
    {
      label: '头像补充',
      current: summary.avatarCompleted,
      total: summary.validMembersCount,
      pct: calcSafePercent(summary.avatarCompleted, summary.validMembersCount),
      color: '#0284c7',
    },
    {
      label: '证件领取',
      current: summary.claimedBadges,
      total: summary.validMembersCount,
      pct: calcSafePercent(summary.claimedBadges, summary.validMembersCount),
      color: '#0f766e',
    },
    {
      label: '赠票发放',
      current: totalGiftsCount,
      total: summary.totalGiftQuota,
      pct: calcSafePercent(totalGiftsCount, summary.totalGiftQuota),
      color: '#7c3aed',
    },
    {
      label: '赠票核销',
      current: summary.redeemedGifts,
      total: summary.nonVoidedGifts,
      pct: calcSafePercent(summary.redeemedGifts, summary.nonVoidedGifts),
      color: '#10b981',
    },
  ];
}
