import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  ChevronRight,
  IdCard,
  QrCode,
  Ticket,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../../app/providers/AppContext';
import { PageContainer } from '../../components/layout/PageContainer';
import {
  GlassCard,
  LoadingState,
  StatusIndicator,
} from '../../components/glass/GlassPrimitives';
import { getApiClient } from '../../services/api';
import { formatDateDisplay, formatDateTimeDisplay } from '../../utils/stateMachines';
import {
  buildBoothComparisonSeries,
  buildCertificateStatusSeries,
  buildDailyTrendSeries,
  buildGiftStatusSeries,
  buildProgressFunnelSeries,
  calcSafePercent,
  computeDashboardSummary,
} from '../../utils/dashboardMetrics';
import type {
  ActivityStatus,
  AuditLogEntry,
  Exhibitor,
  ExhibitorMember,
  GiftBatch,
  GiftTicket,
  RedemptionRecord,
} from '../../types/domain';

const ACTIVITY_STATUS_META: Record<
  ActivityStatus,
  { label: string; tone: 'success' | 'info' | 'warning' | 'neutral' }
> = {
  active: { label: '进行中', tone: 'success' },
  draft: { label: '即将开始', tone: 'info' },
  paused: { label: '已暂停', tone: 'warning' },
  archived: { label: '已归档', tone: 'neutral' },
};

const AXIS_TICK_STYLE = {
  fontSize: 11,
  fill: '#64748b',
  fontFamily: 'var(--font-ui)',
};

function GlassChartTooltip({
  active,
  payload,
  label,
  titleFormatter,
  valueSuffix = '',
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: Record<string, unknown> }>;
  label?: string;
  titleFormatter?: (label: string | undefined, item?: Record<string, unknown>) => string;
  valueSuffix?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const heading = titleFormatter
    ? titleFormatter(label, payload[0]?.payload)
    : (label ?? payload[0]?.name ?? '');

  return (
    <div className="rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-900/[0.08] shadow-lg px-3.5 py-2.5 text-xs space-y-1.5 min-w-[128px]">
      {heading && <div className="font-semibold text-slate-900 numeric-text">{heading}</div>}
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div key={`${entry.name}-${idx}`} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color || '#0071e3' }}
              />
              {entry.name}
            </span>
            <span className="font-semibold text-slate-900 stat-number">
              {entry.value ?? 0}
              {valueSuffix}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const {
    activeActivityId,
    activeActivity,
    activities,
    realtimeVersion,
    navigateAdmin,
  } = useApp();

  const isAllScope = activeActivityId === 'ALL';
  const currentAct = isAllScope ? null : (activeActivity ?? activities[0] ?? null);
  const scopeActivityId = isAllScope ? 'ALL' : (currentAct?.id ?? '');

  const [loading, setLoading] = useState(true);
  const [distributionTab, setDistributionTab] = useState<'cert' | 'gift'>('cert');
  const [exhibitors, setExhibitors] = useState<Exhibitor[]>([]);
  const [members, setMembers] = useState<ExhibitorMember[]>([]);
  const [giftBatches, setGiftBatches] = useState<GiftBatch[]>([]);
  const [giftTickets, setGiftTickets] = useState<GiftTicket[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    if (!scopeActivityId) return;
    let mounted = true;
    setLoading(true);
    const api = getApiClient();
    Promise.all([
      api.exhibitors.list(scopeActivityId),
      api.members.list(scopeActivityId),
      api.gifts.listBatches(scopeActivityId),
      api.tickets.listTickets(scopeActivityId),
      api.redemption.listRecords(scopeActivityId),
      api.auditLogs.list({ activityId: isAllScope ? 'all' : scopeActivityId }),
    ])
      .then(([ex, mem, gb, gt, red, audit]) => {
        if (!mounted) return;
        setExhibitors(ex);
        setMembers(mem);
        setGiftBatches(gb);
        setGiftTickets(gt);
        setRedemptions(red);
        setLogs(audit.slice(0, 5));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [scopeActivityId, isAllScope, realtimeVersion]);

  const nowMs = getApiClient().realtime.getNowMs();
  const todayStr = new Date(nowMs).toISOString().slice(0, 10);

  const summary = useMemo(
    () =>
      computeDashboardSummary(
        exhibitors,
        members,
        giftBatches,
        giftTickets,
        redemptions,
        todayStr,
      ),
    [exhibitors, members, giftBatches, giftTickets, redemptions, todayStr],
  );

  const trendSeries = useMemo(
    () => buildDailyTrendSeries(members, giftTickets, redemptions, todayStr),
    [members, giftTickets, redemptions, todayStr],
  );

  const certStatusSeries = useMemo(() => buildCertificateStatusSeries(members), [members]);
  const giftStatusSeries = useMemo(() => buildGiftStatusSeries(giftTickets), [giftTickets]);
  const activeDistribution = distributionTab === 'cert' ? certStatusSeries : giftStatusSeries;
  const distributionTotal = activeDistribution.reduce((s, d) => s + d.value, 0);
  const nonZeroDistribution = activeDistribution.filter((d) => d.value > 0);

  const boothBarSeries = useMemo(
    () => buildBoothComparisonSeries(exhibitors, members, isAllScope, activities),
    [exhibitors, members, isAllScope, activities],
  );

  const funnelSeries = useMemo(
    () => buildProgressFunnelSeries(summary, giftTickets.length),
    [summary, giftTickets.length],
  );

  if (!isAllScope && !currentAct) {
    return (
      <PageContainer>
        <LoadingState rows={4} />
      </PageContainer>
    );
  }

  const activeActivitiesCount = activities.filter((a) => a.status === 'active').length;
  const claimPct = calcSafePercent(summary.claimedBadges, summary.validMembersCount);
  const redeemPct = calcSafePercent(summary.redeemedGifts, summary.nonVoidedGifts);

  const pendingTasks = [
    {
      label: '待补充头像',
      count: summary.avatarPending,
      icon: <Camera className="w-4 h-4 text-amber-600" />,
      onClick: () => navigateAdmin('exhibitors'),
    },
    {
      label: '待领取证件',
      count: summary.pendingClaimBadges,
      icon: <IdCard className="w-4 h-4 text-[#0071e3]" />,
      onClick: () => navigateAdmin('certificates'),
    },
    {
      label: '待填写赠票',
      count: summary.waitingFillGifts,
      icon: <Ticket className="w-4 h-4 text-[#7c3aed]" />,
      onClick: () => navigateAdmin('gifts'),
    },
    {
      label: '现场加证',
      count: summary.extraValidMembers,
      icon: <UserPlus className="w-4 h-4 text-[#0f766e]" />,
      onClick: () => navigateAdmin('certificates'),
    },
    {
      label: '异常凭证',
      count: summary.abnormalTotal,
      icon: <AlertTriangle className="w-4 h-4 text-red-600" />,
      onClick: () =>
        navigateAdmin(summary.abnormalGifts >= summary.abnormalMembers ? 'gifts' : 'certificates'),
    },
  ];

  return (
    <PageContainer className="space-y-4">
      {loading ? (
        <LoadingState rows={4} />
      ) : (
        <>
          {/* 1. Unified 4-Card Core Liquid Glass Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Activity Overview */}
            <button
              type="button"
              onClick={() => navigateAdmin('activities')}
              className="glass-surface glass-interactive p-4 min-h-[124px] h-full text-left flex flex-col justify-between gap-2.5 cursor-pointer min-w-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">活动概览</span>
                {isAllScope ? (
                  <StatusIndicator tone="info" label={`进行中 ${activeActivitiesCount}`} />
                ) : currentAct ? (
                  <StatusIndicator
                    tone={ACTIVITY_STATUS_META[currentAct.status].tone}
                    label={ACTIVITY_STATUS_META[currentAct.status].label}
                  />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 truncate">
                  {isAllScope ? `全部活动 · ${activities.length} 场` : currentAct?.name}
                </div>
                <div className="text-xs text-slate-500 truncate date-number mt-0.5">
                  {isAllScope
                    ? `${exhibitors.length} 家展商 · ${summary.totalQuota} 名额`
                    : currentAct
                      ? `${formatDateDisplay(currentAct.startAt).slice(5)} ~ ${formatDateDisplay(currentAct.endAt).slice(5)}`
                      : ''}
                </div>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between gap-2 stat-number">
                <span className="truncate">
                  {isAllScope
                    ? `赠票配额 ${summary.totalGiftQuota}`
                    : `${exhibitors.length} 展商 · ${summary.totalQuota} 名额`}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>
            </button>

            {/* Card 2: Registration Progress */}
            <button
              type="button"
              onClick={() => navigateAdmin('exhibitors')}
              className="glass-surface glass-interactive p-4 min-h-[124px] h-full text-left flex flex-col justify-between gap-2.5 cursor-pointer min-w-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">登记进度</span>
                <UserCheck className="w-4 h-4 text-[#0071e3] shrink-0" />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xl font-semibold text-slate-900 stat-number leading-none">
                  {summary.registrationPct}%
                </span>
                <span className="text-xs text-slate-500 stat-number">
                  {summary.validMembersCount} / {summary.totalQuota}
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="h-1.5 rounded-full bg-slate-900/[0.07] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#0071e3] transition-all duration-500"
                    style={{ width: `${summary.registrationPct}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 stat-number truncate">
                  常规 {summary.normalValidMembers} · 加证 {summary.extraValidMembers}
                </div>
              </div>
            </button>

            {/* Card 3: Claimed Certificates */}
            <button
              type="button"
              onClick={() => navigateAdmin('certificates')}
              className="glass-surface glass-interactive p-4 min-h-[124px] h-full text-left flex flex-col justify-between gap-2.5 cursor-pointer min-w-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">已领取证件</span>
                <IdCard className="w-4 h-4 text-[#0f766e] shrink-0" />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xl font-semibold text-slate-900 stat-number leading-none">
                  {summary.claimedBadges}
                </span>
                <span className="text-xs text-slate-500 stat-number">{claimPct}%</span>
              </div>
              <div className="space-y-1.5">
                <div className="h-1.5 rounded-full bg-slate-900/[0.07] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#0f766e] transition-all duration-500"
                    style={{ width: `${claimPct}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 stat-number truncate">
                  待领取 {summary.pendingClaimBadges} · 头像 {summary.avatarCompleted}/{summary.validMembersCount}
                </div>
              </div>
            </button>

            {/* Card 4: Today's Redemptions */}
            <button
              type="button"
              onClick={() => navigateAdmin('redemption')}
              className="glass-surface glass-interactive p-4 min-h-[124px] h-full text-left flex flex-col justify-between gap-2.5 cursor-pointer min-w-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">今日核销</span>
                <QrCode className="w-4 h-4 text-[#10b981] shrink-0" />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xl font-semibold text-slate-900 stat-number leading-none">
                  {summary.todayRedemptions}
                </span>
                <span className="text-xs text-slate-500 stat-number">核销率 {redeemPct}%</span>
              </div>
              <div className="space-y-1.5">
                <div className="h-1.5 rounded-full bg-slate-900/[0.07] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#10b981] transition-all duration-500"
                    style={{ width: `${redeemPct}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 stat-number truncate">
                  累计 {summary.totalSuccessfulRedemptions} · 有效赠票 {summary.validGifts}
                </div>
              </div>
            </button>
          </div>

          {/* 2. Primary Interactive Charts Row: Trend Area + Status Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left 7 cols: Area Chart */}
            <GlassCard className="lg:col-span-7 min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">登记与核销趋势</h2>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#0071e3]" />
                    人员登记
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#7c3aed]" />
                    赠票发放
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                    核销完成
                  </span>
                </div>
              </div>
              <div className="w-full h-[230px] numeric-text">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendSeries} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashMembersFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0071e3" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#0071e3" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="dashGiftsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.24} />
                        <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="dashRedeemFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(15,23,42,0.06)" />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={AXIS_TICK_STYLE}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={AXIS_TICK_STYLE}
                    />
                    <Tooltip
                      content={
                        <GlassChartTooltip
                          titleFormatter={(_lbl, item) => String(item?.date ?? '')}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="members"
                      name="人员登记"
                      stroke="#0071e3"
                      strokeWidth={2}
                      fill="url(#dashMembersFill)"
                      activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="gifts"
                      name="赠票发放"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      fill="url(#dashGiftsFill)"
                      activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="redemptions"
                      name="核销完成"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#dashRedeemFill)"
                      activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            {/* Right 5 cols: Donut Distribution Chart */}
            <GlassCard className="lg:col-span-5 min-w-0 flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">状态分布</h2>
                <div className="inline-flex p-0.5 rounded-full bg-slate-900/[0.05]">
                  <button
                    type="button"
                    onClick={() => setDistributionTab('cert')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                      distributionTab === 'cert'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    证件
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistributionTab('gift')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                      distributionTab === 'gift'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    赠票
                  </button>
                </div>
              </div>

              <div className="relative w-full h-[176px] numeric-text">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={
                        nonZeroDistribution.length > 0
                          ? nonZeroDistribution
                          : [{ name: '暂无数据', value: 1, color: '#e2e8f0' }]
                      }
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={78}
                      paddingAngle={nonZeroDistribution.length > 1 ? 3 : 0}
                      cornerRadius={6}
                      stroke="none"
                    >
                      {(nonZeroDistribution.length > 0
                        ? nonZeroDistribution
                        : [{ name: '暂无数据', value: 1, color: '#e2e8f0' }]
                      ).map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    {nonZeroDistribution.length > 0 && <Tooltip content={<GlassChartTooltip />} />}
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-semibold text-slate-900 stat-number leading-none">
                    {distributionTotal}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    {distributionTab === 'cert' ? '证件总数' : '赠票总数'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1 border-t border-slate-900/[0.05]">
                {activeDistribution.map((slice) => (
                  <div
                    key={slice.name}
                    className="flex items-center justify-between text-xs gap-2"
                  >
                    <span className="inline-flex items-center gap-1.5 text-slate-600 truncate">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: slice.color }}
                      />
                      {slice.name}
                    </span>
                    <span className="font-semibold text-slate-900 stat-number shrink-0">
                      {slice.value}
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* 3. Secondary Charts Row: Booth/Activity Bar Chart + 5-Stage Completion Horizontal Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left 7 cols: Grouped Bar Chart */}
            <GlassCard className="lg:col-span-7 min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  {isAllScope ? '各活动名额与领证' : '展位名额与领证'}
                </h2>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                    分配名额
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#0071e3]" />
                    已登记
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                    已领证
                  </span>
                </div>
              </div>
              <div className="w-full h-[220px] numeric-text">
                {boothBarSeries.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    暂无数据
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={boothBarSeries}
                      barGap={4}
                      margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(15,23,42,0.06)" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={AXIS_TICK_STYLE}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        tick={AXIS_TICK_STYLE}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(15,23,42,0.03)', radius: 8 }}
                        content={
                          <GlassChartTooltip
                            titleFormatter={(_lbl, item) => String(item?.fullName ?? '')}
                          />
                        }
                      />
                      <Bar dataKey="quota" name="分配名额" fill="#cbd5e1" radius={[6, 6, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="registered" name="已登记" fill="#0071e3" radius={[6, 6, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="claimed" name="已领证" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </GlassCard>

            {/* Right 5 cols: Completion Rate Horizontal Bar Chart */}
            <GlassCard className="lg:col-span-5 min-w-0 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">业务完成率</h2>
                <span className="text-[11px] text-slate-400">百分比</span>
              </div>
              <div className="w-full h-[220px] numeric-text">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={funnelSeries}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(15,23,42,0.06)" />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                      tick={AXIS_TICK_STYLE}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={58}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#334155', fontFamily: 'var(--font-ui)' }}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(15,23,42,0.03)', radius: 8 }}
                      content={
                        <GlassChartTooltip
                          valueSuffix="%"
                          titleFormatter={(_lbl, item) =>
                            `${String(item?.label ?? '')} (${String(item?.current ?? 0)} / ${String(item?.total ?? 0)})`
                          }
                        />
                      }
                    />
                    <Bar
                      dataKey="pct"
                      name="完成率"
                      radius={[0, 8, 8, 0]}
                      barSize={16}
                      background={{ fill: 'rgba(15,23,42,0.05)', radius: 8 }}
                    >
                      {funnelSeries.map((entry) => (
                        <Cell key={entry.label} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </div>

          {/* 4. Bottom Action Row: Pending Tasks + Recent Operations */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left 5 cols: Pending Tasks */}
            <GlassCard className="lg:col-span-5 min-w-0 space-y-2">
              <h2 className="text-sm font-semibold text-slate-900">待处理事项</h2>
              <div className="divide-y divide-slate-900/[0.06]">
                {pendingTasks.map((task) => (
                  <button
                    key={task.label}
                    type="button"
                    onClick={task.onClick}
                    className="w-full min-h-[44px] py-2 flex items-center justify-between gap-3 text-left hover:bg-slate-900/[0.025] -mx-2 px-2 rounded-xl transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-slate-900/[0.04] flex items-center justify-center shrink-0">
                        {task.icon}
                      </span>
                      <span className="text-xs font-medium text-slate-700 truncate">
                        {task.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold text-slate-900 stat-number">
                        {task.count}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>
            </GlassCard>

            {/* Right 7 cols: Recent Operations */}
            <GlassCard className="lg:col-span-7 min-w-0 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">最近操作</h2>
                <button
                  type="button"
                  onClick={() => navigateAdmin('admin_audit')}
                  className="text-xs font-medium text-[#0071e3] hover:text-[#005bb8] cursor-pointer"
                >
                  全部日志 →
                </button>
              </div>
              {logs.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">暂无记录</p>
              ) : (
                <div className="divide-y divide-slate-900/[0.06]">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="min-h-[44px] py-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            log.result === 'success' ? 'bg-[#10b981]' : 'bg-red-500'
                          }`}
                        />
                        <span className="font-medium text-slate-700 shrink-0">
                          {log.actorName}
                        </span>
                        <span className="text-slate-900 truncate">{log.targetLabel}</span>
                        <span className="text-slate-400 shrink-0 hidden sm:inline truncate max-w-[180px]">
                          {log.afterState}
                        </span>
                      </div>
                      <span className="text-slate-400 date-number shrink-0">
                        {formatDateTimeDisplay(log.timestamp).slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        </>
      )}
    </PageContainer>
  );
}
