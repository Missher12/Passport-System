import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  IdCard,
  Plus,
  QrCode,
  Store,
  Ticket,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import {
  GlassButton,
  GlassCard,
  LoadingState,
  PageHeader,
  StatusIndicator,
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

export function DashboardPage() {
  const {
    activeActivity,
    activities,
    activeActivityId,
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
        setLogs(audit.slice(0, 6));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [currentAct?.id, realtimeVersion]);

  if (!currentAct) {
    return (
      <div className="page-container">
        <LoadingState rows={4} />
      </div>
    );
  }

  const nowMs = getApiClient().realtime.getNowMs();
  const totalQuota = exhibitors.reduce((sum, e) => sum + e.quota, 0);
  const onsiteExtraTotal = exhibitors.reduce((sum, e) => sum + e.onsiteExtraCount, 0);
  const avatarCompleted = members.filter((m) => Boolean(m.avatarUrl)).length;
  const claimedBadges = members.filter((m) => m.status === 'badge_claimed').length;
  const redeemedGifts = giftTickets.filter((t) => t.status === 'redeemed').length;
  const totalGiftQuota = giftBatches.reduce((sum, b) => sum + b.totalQuota, 0);
  const successfulScans = redemptions.filter((r) => r.outcome === 'success').length;

  const businessPhases = [
    {
      label: '展商资料登记',
      phase: evaluateBusinessWindow(
        currentAct.timeWindows.exhibitorRegisterStart,
        currentAct.timeWindows.exhibitorRegisterEnd,
        nowMs,
      ),
      end: currentAct.timeWindows.exhibitorRegisterEnd,
    },
    {
      label: '证件头像补充',
      phase: evaluateBusinessWindow(
        currentAct.timeWindows.avatarUploadStart,
        currentAct.timeWindows.avatarUploadEnd,
        nowMs,
      ),
      end: currentAct.timeWindows.avatarUploadEnd,
    },
    {
      label: '实体证件领取',
      phase: evaluateBusinessWindow(
        currentAct.timeWindows.badgeClaimStart,
        currentAct.timeWindows.badgeClaimEnd,
        nowMs,
      ),
      end: currentAct.timeWindows.badgeClaimEnd,
    },
    {
      label: '自助赠票通道',
      phase: evaluateBusinessWindow(
        currentAct.timeWindows.giftSelfClaimStart,
        currentAct.timeWindows.giftSelfClaimEnd,
        nowMs,
      ),
      end: currentAct.timeWindows.giftSelfClaimEnd,
    },
    {
      label: '现场扫码核销',
      phase: evaluateBusinessWindow(
        currentAct.timeWindows.redemptionValidStart,
        currentAct.timeWindows.redemptionValidEnd,
        nowMs,
      ),
      end: currentAct.timeWindows.redemptionValidEnd,
    },
  ];

  const phaseMeta = (p: 'not_started' | 'active' | 'ended') =>
    p === 'active'
      ? { tone: 'success' as const, label: '开放中' }
      : p === 'not_started'
        ? { tone: 'info' as const, label: '未开始' }
        : { tone: 'neutral' as const, label: '已截止' };

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="运营工作台"
        subtitle={
          activeActivityId === 'ALL'
            ? `当前展示默认活动「${currentAct.name}」核心概况，可在顶部活动切换器切换任意活动`
            : `当前活动上下文：${currentAct.name} · 数据与其他活动严格隔离`
        }
        actions={
          <>
            <GlassButton variant="secondary" onClick={() => switchPortal('exhibitor')}>
              <ExternalLink className="w-4 h-4" />
              外部展商端
            </GlassButton>
            <GlassButton variant="secondary" onClick={() => switchPortal('gift')}>
              <Ticket className="w-4 h-4" />
              外部赠票端
            </GlassButton>
            <GlassButton variant="primary" onClick={() => navigateAdmin('redemption')}>
              <QrCode className="w-4 h-4" />
              打开扫码核销台
            </GlassButton>
          </>
        }
      />

      {/* Active Activity Hero Surface */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-5 relative min-h-[210px] bg-slate-200">
            <img
              src={currentAct.coverUrl}
              alt={currentAct.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/75 via-slate-900/20 to-transparent" />
            <div className="absolute bottom-4 left-5 right-5 text-white">
              <p className="text-xs text-white/80 numeric-text">
                {currentAct.code} · {currentAct.timezone}
              </p>
              <h2 className="text-xl font-semibold mt-0.5 text-balance">{currentAct.name}</h2>
              <p className="text-xs text-white/90 mt-1 date-number">
                {formatDateDisplay(currentAct.startAt)} 至 {formatDateDisplay(currentAct.endAt)} ·{' '}
                {currentAct.location}
              </p>
            </div>
          </div>

          <div className="lg:col-span-7 p-5 sm:p-6 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">独立业务时间窗口实时状态</h3>
                <button
                  type="button"
                  onClick={() => navigateAdmin('activities')}
                  className="text-xs font-medium text-[#0071e3] hover:text-[#005bb8] cursor-pointer"
                >
                  配置排期 →
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                各项业务截止时间独立生效，互不影响；达到头像开放日后展商原链接自动切换至补拍流程。
              </p>

              <div className="mt-4 divide-y divide-slate-900/[0.06]">
                {businessPhases.map((item) => {
                  const st = phaseMeta(item.phase);
                  return (
                    <div
                      key={item.label}
                      className="py-2 flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-slate-800 font-medium">{item.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 hidden sm:inline date-number">
                          截止 {formatDateTimeDisplay(item.end)}
                        </span>
                        <StatusIndicator tone={st.tone} label={st.label} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {activities.length > 1 && (
              <div className="pt-2.5 border-t border-slate-900/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                <span className="shrink-0">快速切换其他活动：</span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {activities
                    .filter((a) => a.id !== currentAct.id)
                    .map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => selectActivity(a.id)}
                        className="text-[#0071e3] hover:underline text-left cursor-pointer font-medium"
                      >
                        {a.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      {/* 4-Column KPI Row */}
      {loading ? (
        <LoadingState rows={2} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => navigateAdmin('exhibitors')}
            className="glass-surface glass-surface-interactive p-5 text-left w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0071e3] focus-visible:outline-offset-2"
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>已建档展商 / 申请名额</span>
              <Store className="w-4 h-4 text-[#0071e3]" aria-hidden="true" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-slate-900 stat-number">
                {exhibitors.length}
              </span>
              <span className="text-xs text-slate-500 stat-number">
                家展商 · 申请 {totalQuota} 人
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2 stat-number">
              已登记人员 {members.length} 人 · 现场加证 {onsiteExtraTotal} 人
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigateAdmin('certificates')}
            className="glass-surface glass-surface-interactive p-5 text-left w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0071e3] focus-visible:outline-offset-2"
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>头像完成 / 实体领证</span>
              <IdCard className="w-4 h-4 text-[#0f766e]" aria-hidden="true" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-slate-900 stat-number">
                {avatarCompleted}/{members.length}
              </span>
              <span className="text-xs text-slate-500">人已补拍</span>
            </div>
            <p className="text-xs text-slate-500 mt-2 stat-number">
              实体证件已领取 {claimedBadges} 张 · 待领 {Math.max(0, avatarCompleted - claimedBadges)} 张
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigateAdmin('gifts')}
            className="glass-surface glass-surface-interactive p-5 text-left w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0071e3] focus-visible:outline-offset-2"
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>独立赠票库发放 / 核销</span>
              <Ticket className="w-4 h-4 text-[#7c3aed]" aria-hidden="true" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-slate-900 stat-number">
                {giftTickets.length}
              </span>
              <span className="text-xs text-slate-500 stat-number">
                / 自助池 {totalGiftQuota} 张
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2 stat-number">
              已核销 {redeemedGifts} 张 · {giftBatches.length} 个自助批次
            </p>
          </button>

          <button
            type="button"
            onClick={() => navigateAdmin('redemption')}
            className="glass-surface glass-surface-interactive p-5 text-left w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0071e3] focus-visible:outline-offset-2"
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>现场核销成功次数</span>
              <QrCode className="w-4 h-4 text-[#0071e3]" aria-hidden="true" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-slate-900 stat-number">
                {successfulScans}
              </span>
              <span className="text-xs text-slate-500 stat-number">
                / 总扫码 {redemptions.length} 次
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              证件与赠票统一扫码核验，业务状态彼此独立
            </p>
          </button>
        </div>
      )}

      {/* Lower Two-Column Split: Quick Actions + Recent Audit Trail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <GlassCard className="lg:col-span-5 space-y-4">
          <h3 className="text-base font-semibold text-slate-900">高频业务快捷入口</h3>
          <div className="space-y-2">
            {[
              {
                title: '新建展商主档案',
                desc: '自动生成全系统唯一商务密码并建档主联系人',
                icon: <Plus className="w-4 h-4 text-[#0071e3]" />,
                onClick: () => navigateAdmin('exhibitors'),
              },
              {
                title: '展位批量发证 & 现场加证',
                desc: '按展商勾选发放实体证或签发一次性加证二维码',
                icon: <UserPlus className="w-4 h-4 text-[#0f766e]" />,
                onClick: () => navigateAdmin('certificates'),
              },
              {
                title: '自助赠票批次与后台发码',
                desc: '独立赠票库，自动跨批次拦截同身份重复领取',
                icon: <Ticket className="w-4 h-4 text-[#7c3aed]" />,
                onClick: () => navigateAdmin('gifts'),
              },
              {
                title: '进入统一扫码核销工作台',
                desc: '支持普通核验与快速连扫模式，严格联网防重',
                icon: <QrCode className="w-4 h-4 text-[#0071e3]" />,
                onClick: () => navigateAdmin('redemption'),
              },
            ].map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={item.onClick}
                className="w-full p-3.5 rounded-2xl bg-white/55 hover:bg-white/90 border border-slate-900/[0.06] flex items-center justify-between gap-3 text-left transition-all cursor-pointer active:scale-[0.99]"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-900/[0.04] flex items-center justify-center shrink-0">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">近期关键操作审计</h3>
            <button
              type="button"
              onClick={() => navigateAdmin('admin_audit')}
              className="text-xs font-medium text-[#0071e3] hover:text-[#005bb8] cursor-pointer"
            >
              查看完整日志 →
            </button>
          </div>
          {logs.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">当前活动暂无审计记录</p>
          ) : (
            <div className="divide-y divide-slate-900/[0.06]">
              {logs.map((log) => (
                <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {log.targetLabel}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {log.actorName}（{log.actorRole}）· {log.reason}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 shrink-0 sm:text-right date-number">
                    <div>{formatDateTimeDisplay(log.timestamp)}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{log.afterState}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
