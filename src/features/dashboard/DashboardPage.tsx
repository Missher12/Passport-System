import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ExternalLink,
  IdCard,
  Plus,
  QrCode,
  Store,
  Ticket,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import { PageContainer } from '../../components/layout/PageContainer';
import {
  GlassButton,
  GlassCard,
  LoadingState,
} from '../../components/glass/GlassPrimitives';
import { getApiClient } from '../../services/api';
import {
  evaluateBusinessWindow,
  formatDateDisplay,
  formatDateTimeDisplay,
} from '../../utils/stateMachines';
import type {
  AuditLogEntry,
  Exhibitor,
  ExhibitorMember,
  GiftBatch,
  GiftTicket,
  RedemptionRecord,
} from '../../types/domain';

function RadialRing({
  percent,
  color,
  size = 52,
}: {
  percent: number;
  color: string;
  size?: number;
}) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(15, 23, 42, 0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute text-[11px] font-semibold text-slate-700 stat-number">
        {clamped}%
      </span>
    </div>
  );
}

function MultiDonutChart({
  segments,
  total,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  total: number;
}) {
  const size = 164;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const sum = Math.max(
    1,
    segments.reduce((acc, s) => acc + s.value, 0),
  );

  let cumulative = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(15, 23, 42, 0.06)"
            strokeWidth={stroke}
          />
          {segments
            .filter((s) => s.value > 0)
            .map((seg) => {
              const frac = seg.value / sum;
              const dashLen = Math.max(4, frac * circumference - 3);
              const dashOffset = -cumulative * circumference;
              cumulative += frac;
              return (
                <circle
                  key={seg.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${dashLen} ${circumference}`}
                  strokeDashoffset={dashOffset}
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-semibold text-slate-900 stat-number leading-none">
            {total}
          </span>
          <span className="text-[11px] text-slate-500 mt-1">票证总量</span>
        </div>
      </div>

      <div className="flex-1 w-full grid grid-cols-2 gap-2.5">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className="px-3 py-2 rounded-xl bg-white/60 border border-slate-900/[0.05] flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2 text-xs text-slate-700 min-w-0 truncate">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              <span className="truncate">{seg.label}</span>
            </span>
            <span className="text-sm font-semibold text-slate-900 stat-number shrink-0">
              {seg.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const {
    activeActivity,
    activities,
    realtimeVersion,
    navigateAdmin,
    switchPortal,
    selectActivity,
  } = useApp();

  const currentAct = activeActivity ?? activities[0] ?? null;
  const [loading, setLoading] = useState(true);
  const [exhibitors, setExhibitors] = useState<Exhibitor[]>([]);
  const [members, setMembers] = useState<ExhibitorMember[]>([]);
  const [giftBatches, setGiftBatches] = useState<GiftBatch[]>([]);
  const [giftTickets, setGiftTickets] = useState<GiftTicket[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    if (!currentAct) return;
    let mounted = true;
    setLoading(true);
    const api = getApiClient();
    Promise.all([
      api.exhibitors.list(currentAct.id),
      api.members.list(currentAct.id),
      api.gifts.listBatches(currentAct.id),
      api.tickets.listTickets(currentAct.id),
      api.redemption.listRecords(currentAct.id),
      api.auditLogs.list({ activityId: currentAct.id }),
    ])
      .then(([ex, mem, gb, gt, red, audit]) => {
        if (!mounted) return;
        setExhibitors(ex);
        setMembers(mem);
        setGiftBatches(gb);
        setGiftTickets(gt);
        setRedemptions(red);
        setLogs(audit.slice(0, 4));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [currentAct?.id, realtimeVersion]);

  const boothBars = useMemo(() => {
    return exhibitors.slice(0, 6).map((ex) => {
      const exMembers = members.filter((m) => m.exhibitorId === ex.id && m.status !== 'voided');
      const registered = exMembers.length;
      const avatarDone = exMembers.filter((m) => Boolean(m.avatarUrl)).length;
      const maxVal = Math.max(ex.quota, registered, 1);
      return {
        id: ex.id,
        booth: ex.boothNumber,
        name: ex.boothName,
        quota: ex.quota,
        registered,
        avatarDone,
        regPct: Math.min(100, Math.round((registered / maxVal) * 100)),
        avatarPct: Math.min(100, Math.round((avatarDone / maxVal) * 100)),
      };
    });
  }, [exhibitors, members]);

  if (!currentAct) {
    return (
      <PageContainer>
        <LoadingState rows={4} />
      </PageContainer>
    );
  }

  const nowMs = getApiClient().realtime.getNowMs();
  const totalQuota = exhibitors.reduce((sum, e) => sum + e.quota, 0);
  const avatarCompleted = members.filter((m) => Boolean(m.avatarUrl)).length;
  const avatarPending = Math.max(0, members.length - avatarCompleted);
  const claimedBadges = members.filter((m) => m.status === 'badge_claimed').length;
  const redeemedGifts = giftTickets.filter((t) => t.status === 'redeemed').length;
  const validGifts = giftTickets.filter(
    (t) => t.status === 'valid' || t.status === 'generated',
  ).length;
  const totalGiftQuota = giftBatches.reduce((sum, b) => sum + b.totalQuota, 0);
  const successfulScans = redemptions.filter((r) => r.outcome === 'success').length;

  const quotaPct = totalQuota > 0 ? (members.length / totalQuota) * 100 : 0;
  const avatarPct = members.length > 0 ? (avatarCompleted / members.length) * 100 : 0;
  const giftPct = totalGiftQuota > 0 ? (giftTickets.length / totalGiftQuota) * 100 : 0;
  const scanRate = redemptions.length > 0 ? (successfulScans / redemptions.length) * 100 : 100;

  const windowDots = [
    {
      label: '登记',
      phase: evaluateBusinessWindow(
        currentAct.timeWindows.exhibitorRegisterStart,
        currentAct.timeWindows.exhibitorRegisterEnd,
        nowMs,
      ),
    },
    {
      label: '头像',
      phase: evaluateBusinessWindow(
        currentAct.timeWindows.avatarUploadStart,
        currentAct.timeWindows.avatarUploadEnd,
        nowMs,
      ),
    },
    {
      label: '领证',
      phase: evaluateBusinessWindow(
        currentAct.timeWindows.badgeClaimStart,
        currentAct.timeWindows.badgeClaimEnd,
        nowMs,
      ),
    },
    {
      label: '赠票',
      phase: evaluateBusinessWindow(
        currentAct.timeWindows.giftSelfClaimStart,
        currentAct.timeWindows.giftSelfClaimEnd,
        nowMs,
      ),
    },
    {
      label: '核销',
      phase: evaluateBusinessWindow(
        currentAct.timeWindows.redemptionValidStart,
        currentAct.timeWindows.redemptionValidEnd,
        nowMs,
      ),
    },
  ];

  const donutSegments = [
    { label: '已领证', value: claimedBadges, color: '#0071e3' },
    { label: '待领证', value: Math.max(0, avatarCompleted - claimedBadges), color: '#38bdf8' },
    { label: '待补拍', value: avatarPending, color: '#f59e0b' },
    { label: '有效赠票', value: validGifts, color: '#8b5cf6' },
    { label: '已核销', value: redeemedGifts, color: '#10b981' },
  ];

  return (
    <PageContainer className="space-y-5">
      {/* Compact Visual Activity Banner + Quick Portal Bar */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 relative min-h-[172px] overflow-hidden bg-slate-200">
            <img
              src={currentAct.coverUrl}
              alt={currentAct.name}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/75 via-slate-900/40 to-transparent" />
            <div className="relative z-10 h-full p-5 flex flex-col justify-between gap-8 text-white">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md numeric-text">
                  {currentAct.code}
                </span>
                <div className="flex items-center gap-1.5">
                  {activities
                    .filter((a) => a.id !== currentAct.id)
                    .slice(0, 2)
                    .map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => selectActivity(a.id)}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-slate-950/45 hover:bg-slate-950/70 backdrop-blur-md text-white/90 transition-colors cursor-pointer truncate max-w-[140px]"
                      >
                        {a.name}
                      </button>
                    ))}
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{currentAct.name}</h2>
                <p className="text-xs text-white/85 mt-1 date-number">
                  {formatDateDisplay(currentAct.startAt)} ~ {formatDateDisplay(currentAct.endAt)} ·{' '}
                  {currentAct.location}
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between gap-4">
            {/* Compact 5-Stage Visual Timeline Bar */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">通道状态</span>
                <button
                  type="button"
                  onClick={() => navigateAdmin('activities')}
                  className="text-xs text-[#0071e3] hover:text-[#005bb8] font-medium cursor-pointer"
                >
                  排期 →
                </button>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {windowDots.map((w) => {
                  const barColor =
                    w.phase === 'active'
                      ? 'bg-[#10b981]'
                      : w.phase === 'not_started'
                        ? 'bg-[#0071e3]'
                        : 'bg-slate-300';
                  return (
                    <div
                      key={w.label}
                      className="p-2 rounded-xl bg-white/65 border border-slate-900/[0.05] text-center space-y-1.5"
                    >
                      <div className={`h-1.5 w-full rounded-full ${barColor}`} />
                      <div className="text-xs font-medium text-slate-800">{w.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Compact Portal & Scanner Triggers */}
            <div className="flex items-center gap-2">
              <GlassButton
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => switchPortal('exhibitor')}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                展商端
              </GlassButton>
              <GlassButton
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => switchPortal('gift')}
              >
                <Ticket className="w-3.5 h-3.5" />
                赠票端
              </GlassButton>
              <GlassButton
                size="sm"
                variant="primary"
                className="flex-1"
                onClick={() => navigateAdmin('redemption')}
              >
                <QrCode className="w-3.5 h-3.5" />
                核销
              </GlassButton>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* 4 Visual KPI Ring Cards */}
      {loading ? (
        <LoadingState rows={2} />
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => navigateAdmin('exhibitors')}
            className="glass-surface glass-interactive p-4 text-left w-full cursor-pointer flex items-center justify-between gap-3 min-w-0"
          >
            <div className="min-w-0">
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-[#0071e3]" />
                展商 / 名额
              </span>
              <div className="text-2xl font-semibold text-slate-900 stat-number mt-1.5">
                {members.length}
                <span className="text-sm font-normal text-slate-400">/{totalQuota}</span>
              </div>
              <div className="text-[11px] text-slate-500 stat-number mt-0.5">
                {exhibitors.length} 家展商
              </div>
            </div>
            <RadialRing percent={quotaPct} color="#0071e3" />
          </button>

          <button
            type="button"
            onClick={() => navigateAdmin('certificates')}
            className="glass-surface glass-interactive p-4 text-left w-full cursor-pointer flex items-center justify-between gap-3 min-w-0"
          >
            <div className="min-w-0">
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <IdCard className="w-3.5 h-3.5 text-[#0f766e]" />
                头像 / 领证
              </span>
              <div className="text-2xl font-semibold text-slate-900 stat-number mt-1.5">
                {avatarCompleted}
                <span className="text-sm font-normal text-slate-400">/{members.length}</span>
              </div>
              <div className="text-[11px] text-slate-500 stat-number mt-0.5">
                已领 {claimedBadges} 张
              </div>
            </div>
            <RadialRing percent={avatarPct} color="#0f766e" />
          </button>

          <button
            type="button"
            onClick={() => navigateAdmin('gifts')}
            className="glass-surface glass-interactive p-4 text-left w-full cursor-pointer flex items-center justify-between gap-3 min-w-0"
          >
            <div className="min-w-0">
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5 text-[#7c3aed]" />
                赠票发放
              </span>
              <div className="text-2xl font-semibold text-slate-900 stat-number mt-1.5">
                {giftTickets.length}
                <span className="text-sm font-normal text-slate-400">/{totalGiftQuota}</span>
              </div>
              <div className="text-[11px] text-slate-500 stat-number mt-0.5">
                已核销 {redeemedGifts}
              </div>
            </div>
            <RadialRing percent={giftPct} color="#7c3aed" />
          </button>

          <button
            type="button"
            onClick={() => navigateAdmin('redemption')}
            className="glass-surface glass-interactive p-4 text-left w-full cursor-pointer flex items-center justify-between gap-3 min-w-0"
          >
            <div className="min-w-0">
              <span className="text-xs text-slate-500 flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-[#10b981]" />
                现场核销
              </span>
              <div className="text-2xl font-semibold text-slate-900 stat-number mt-1.5">
                {successfulScans}
                <span className="text-sm font-normal text-slate-400">/{redemptions.length}</span>
              </div>
              <div className="text-[11px] text-slate-500 stat-number mt-0.5">放行率</div>
            </div>
            <RadialRing percent={scanRate} color="#10b981" />
          </button>
        </div>
      )}

      {/* Visual Charts Row: Booth Bar Chart + Credential Distribution Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <GlassCard className="lg:col-span-6 min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">展位登记与头像进度</h3>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#93c5fd]" />
                已登记
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#0071e3]" />
                已补拍
              </span>
            </div>
          </div>

          <div className="space-y-3.5 pt-1">
            {boothBars.length === 0 ? (
              <p className="text-xs text-slate-400 py-10 text-center">暂无展位数据</p>
            ) : (
              boothBars.map((bar) => (
                <div key={bar.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 truncate">
                      <span className="text-[#0071e3] font-semibold numeric-text mr-1.5">
                        {bar.booth}
                      </span>
                      {bar.name}
                    </span>
                    <span className="text-slate-500 stat-number shrink-0 ml-2">
                      {bar.avatarDone}/{bar.registered}/{bar.quota}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-900/[0.06] overflow-hidden relative">
                    <div
                      className="h-full rounded-full bg-[#93c5fd] absolute left-0 top-0 transition-all duration-500"
                      style={{ width: `${bar.regPct}%` }}
                    />
                    <div
                      className="h-full rounded-full bg-[#0071e3] absolute left-0 top-0 transition-all duration-500"
                      style={{ width: `${bar.avatarPct}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-6 min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">票证状态分布</h3>
            <button
              type="button"
              onClick={() => navigateAdmin('certificates')}
              className="text-xs text-[#0071e3] hover:text-[#005bb8] font-medium cursor-pointer"
            >
              详情 →
            </button>
          </div>
          <MultiDonutChart
            segments={donutSegments}
            total={members.length + giftTickets.length}
          />
        </GlassCard>
      </div>

      {/* Bottom Compact Row: Icon Tiles + Minimal Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 grid grid-cols-2 gap-3 min-w-0">
          {[
            {
              title: '展商建档',
              icon: <Plus className="w-4 h-4 text-[#0071e3]" />,
              onClick: () => navigateAdmin('exhibitors'),
            },
            {
              title: '发证加证',
              icon: <UserPlus className="w-4 h-4 text-[#0f766e]" />,
              onClick: () => navigateAdmin('certificates'),
            },
            {
              title: '赠票发放',
              icon: <Ticket className="w-4 h-4 text-[#7c3aed]" />,
              onClick: () => navigateAdmin('gifts'),
            },
            {
              title: '扫码核销',
              icon: <QrCode className="w-4 h-4 text-[#0071e3]" />,
              onClick: () => navigateAdmin('redemption'),
            },
          ].map((tile) => (
            <button
              key={tile.title}
              type="button"
              onClick={tile.onClick}
              className="glass-surface glass-interactive p-4 flex flex-col justify-between gap-3 text-left cursor-pointer min-w-0"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-white/80 border border-slate-900/[0.05] flex items-center justify-center">
                  {tile.icon}
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
              </div>
              <span className="text-sm font-semibold text-slate-900">{tile.title}</span>
            </button>
          ))}
        </div>

        <GlassCard className="lg:col-span-7 min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">最近动态</h3>
            <button
              type="button"
              onClick={() => navigateAdmin('admin_audit')}
              className="text-xs font-medium text-[#0071e3] hover:text-[#005bb8] cursor-pointer"
            >
              日志 →
            </button>
          </div>
          {logs.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">暂无记录</p>
          ) : (
            <div className="divide-y divide-slate-900/[0.06]">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        log.result === 'success' ? 'bg-[#10b981]' : 'bg-red-500'
                      }`}
                    />
                    <span className="font-medium text-slate-900 truncate">{log.targetLabel}</span>
                    <span className="text-slate-400 shrink-0 hidden sm:inline">
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
    </PageContainer>
  );
}
