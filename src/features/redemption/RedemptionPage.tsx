import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  IdCard,
  QrCode,
  Ticket,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import { PageContainer } from '../../components/layout/PageContainer';
import {
  AllActivityReadonlyNotice,
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassInput,
  GlassTabs,
  GlassToolbar,
  PermissionDeniedState,
  StatusIndicator,
} from '../../components/glass/GlassPrimitives';
import { GlassTable, type GlassTableColumn } from '../../components/glass/GlassTable';
import { GlassScanner } from '../../components/qr/GlassScanner';
import { getApiClient } from '../../services/api';
import { formatDateTimeDisplay } from '../../utils/stateMachines';
import type {
  RedemptionMode,
  RedemptionOutcome,
  RedemptionPreview,
  RedemptionRecord,
} from '../../types/domain';

const OUTCOME_LABELS: Record<
  RedemptionOutcome,
  { label: string; tone: 'success' | 'danger' | 'warning' }
> = {
  success: { label: '核销成功', tone: 'success' },
  duplicate: { label: '重复核销已拦截', tone: 'danger' },
  expired: { label: '凭证或动态码已过期', tone: 'warning' },
  frozen: { label: '凭证已冻结', tone: 'danger' },
  voided: { label: '凭证已作废', tone: 'danger' },
  date_mismatch: { label: '使用日期不匹配', tone: 'warning' },
  invalid: { label: '无效凭证', tone: 'danger' },
  offline: { label: '网络已断开，无法核销', tone: 'danger' },
};

export function RedemptionPage() {
  const {
    user,
    role,
    activeActivityId,
    activeActivity,
    activities,
    settings,
    realtimeVersion,
    canAccessModule,
    pushToast,
    refreshCore,
  } = useApp();

  const isAllScope = activeActivityId === 'ALL';
  const currentAct = isAllScope ? null : (activeActivity ?? activities[0] ?? null);
  const scopeActivityId = isAllScope ? 'ALL' : (currentAct?.id ?? '');

  const canUseFastMode = Boolean(
    user?.redemptionMode === 'fast' ||
      role?.code === 'sys_admin' ||
      role?.code === 'activity_admin',
  );

  const [tab, setTab] = useState<'scanner' | 'records'>('scanner');
  const [mode, setMode] = useState<RedemptionMode>(
    canUseFastMode && user?.redemptionMode === 'fast' ? 'fast' : 'normal',
  );
  const [scanInput, setScanInput] = useState('');
  const [verifyDate, setVerifyDate] = useState(() =>
    new Date(getApiClient().realtime.getNowMs()).toISOString().slice(0, 10),
  );
  const [preview, setPreview] = useState<RedemptionPreview | null>(null);
  const [lastResult, setLastResult] = useState<RedemptionPreview | null>(null);
  const [records, setRecords] = useState<RedemptionRecord[]>([]);
  const [recordSearch, setRecordSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [browserOffline, setBrowserOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  const isOffline = Boolean(settings?.simulateOffline) || browserOffline;

  useEffect(() => {
    const onOffline = () => setBrowserOffline(true);
    const onOnline = () => {
      setBrowserOffline(false);
      setNetworkError(null);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Lock unauthorized users strictly to normal mode
  useEffect(() => {
    if (!canUseFastMode) {
      setMode('normal');
    } else if (user?.redemptionMode) {
      setMode(user.redemptionMode);
    }
  }, [canUseFastMode, user?.redemptionMode]);

  const loadRecords = useCallback(async () => {
    if (!scopeActivityId) return;
    try {
      const list = await getApiClient().redemption.listRecords(scopeActivityId, recordSearch);
      setRecords(list);
    } catch {
      setNetworkError('核销记录加载失败。');
    }
  }, [scopeActivityId, recordSearch]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords, realtimeVersion]);

  const activityById = useMemo(
    () => Object.fromEntries(activities.map((a) => [a.id, a])),
    [activities],
  );

  const handleModeSwitch = async (nextMode: RedemptionMode) => {
    if (nextMode === 'fast' && !canUseFastMode) {
      pushToast({ tone: 'warning', title: '快速模式需管理员授权' });
      return;
    }
    setMode(nextMode);
    setPreview(null);
    if (user && (role?.code === 'sys_admin' || role?.code === 'activity_admin')) {
      await getApiClient().users.setUserRedemptionMode(user.id, nextMode, user);
      await refreshCore();
    }
    pushToast({
      tone: 'info',
      title: nextMode === 'fast' ? '已切换至快速模式' : '已切换至普通模式',
    });
  };

  const handleScanOrInspect = useCallback(
    async (codeValue?: string) => {
      const code = (codeValue ?? scanInput).trim();
      if (!code || !user) return;
      if (isAllScope || !currentAct) {
        pushToast({ tone: 'warning', title: '请先选择具体活动后再执行扫码核销' });
        return;
      }

      if (isOffline) {
        setNetworkError('网络已断开，无法连接服务器校验。');
        return;
      }

      setScanInput(code);
      setBusy(true);
      setNetworkError(null);
      setLastResult(null);
      try {
        const api = getApiClient();
        const effectiveMode: RedemptionMode = canUseFastMode ? mode : 'normal';
        if (effectiveMode === 'fast') {
          const res = await api.redemption.confirmRedemption(
            code,
            currentAct.id,
            'fast',
            user,
            '快速核销端',
            verifyDate,
          );
          setPreview(null);
          setLastResult(res.preview);
          await loadRecords();
        } else {
          const pv = await api.redemption.verifyAndPreview(code, currentAct.id, verifyDate);
          setPreview(pv);
          if (!pv.valid) {
            setLastResult(pv);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '核验请求失败，请重试';
        setNetworkError(msg);
        pushToast({ tone: 'error', title: '核验失败', detail: msg });
      } finally {
        setBusy(false);
      }
    },
    [scanInput, user, isAllScope, currentAct, isOffline, canUseFastMode, mode, verifyDate, loadRecords, pushToast],
  );

  const handleConfirmNormal = async () => {
    if (!user || isAllScope || !currentAct || !scanInput.trim()) return;
    if (isOffline) {
      setNetworkError('网络已断开，无法提交核销。');
      return;
    }
    setBusy(true);
    setNetworkError(null);
    try {
      const res = await getApiClient().redemption.confirmRedemption(
        scanInput.trim(),
        currentAct.id,
        'normal',
        user,
        '普通核销端',
        verifyDate,
      );
      setPreview(null);
      setLastResult(res.preview);
      await loadRecords();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '核销提交失败';
      setNetworkError(msg);
      pushToast({ tone: 'error', title: '核销失败', detail: msg });
    } finally {
      setBusy(false);
    }
  };

  if (!canAccessModule('redemption')) {
    return (
      <PageContainer>
        <PermissionDeniedState moduleLabel="现场核销" />
      </PageContainer>
    );
  }

  if (!isAllScope && !currentAct) return null;

  const recordColumns: GlassTableColumn<RedemptionRecord>[] = [
    ...(isAllScope
      ? [
          {
            key: 'activity',
            header: '所属活动',
            render: (r: RedemptionRecord) => (
              <span className="text-xs text-slate-600">
                {activityById[r.activityId]?.name ?? r.activityId}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'time',
      header: '核销时间',
      sortable: true,
      sortValue: (r) => r.createdAt,
      render: (r) => (
        <span className="date-number text-xs">{formatDateTimeDisplay(r.createdAt)}</span>
      ),
    },
    {
      key: 'kind',
      header: '业务类型',
      render: (r) => (
        <GlassBadge
          label={r.credentialKind === 'certificate' ? '工作证件核验' : '赠票入场核销'}
          color={r.credentialKind === 'certificate' ? '#0071e3' : '#7c3aed'}
        />
      ),
    },
    {
      key: 'code',
      header: '凭证编号',
      render: (r) => (
        <span className="order-number font-semibold text-[#0071e3]">{r.displayCode}</span>
      ),
    },
    {
      key: 'holder',
      header: '持有人 / 类别',
      render: (r) => (
        <div className="text-xs">
          <div className="font-medium text-slate-900">{r.holderName}</div>
          <div className="text-slate-500">{r.categoryOrBatch}</div>
        </div>
      ),
    },
    {
      key: 'mode',
      header: '模式 / 操作员',
      render: (r) => (
        <span className="text-xs text-slate-700">
          {r.mode === 'fast' ? '快速' : '普通'} · {r.operatorName}
        </span>
      ),
    },
    {
      key: 'outcome',
      header: '结果',
      render: (r) => {
        const meta = OUTCOME_LABELS[r.outcome];
        return <StatusIndicator tone={meta.tone} label={meta.label} />;
      },
    },
    {
      key: 'msg',
      header: '说明',
      render: (r) => <span className="text-xs text-slate-600">{r.message}</span>,
    },
  ];

  const isCertificatePreview = preview?.credentialKind === 'certificate';

  return (
    <PageContainer className="space-y-5">
      {isAllScope && <AllActivityReadonlyNotice />}

      <GlassToolbar>
        <GlassTabs
          variant="embedded"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'scanner', label: '扫码' },
            { id: 'records', label: '核销记录' },
          ]}
        />
        {canUseFastMode ? (
          <GlassTabs
            value={mode}
            onChange={handleModeSwitch}
            tabs={[
              { id: 'normal', label: '普通模式' },
              { id: 'fast', label: '快速模式' },
            ]}
          />
        ) : (
          <span className="text-xs font-medium text-slate-600 px-3 py-1.5 rounded-full bg-slate-900/[0.04]">
            普通模式
          </span>
        )}
      </GlassToolbar>

      {tab === 'scanner' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <GlassCard className="lg:col-span-7 min-w-0 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                {mode === 'fast' ? (
                  <Zap className="w-4 h-4 text-[#0071e3]" />
                ) : (
                  <QrCode className="w-4 h-4 text-[#0071e3]" />
                )}
                {mode === 'fast' ? '快速自动核销' : '普通人工确认'}
              </h2>
            </div>

            <GlassScanner
              offline={isOffline}
              lockedReason={isAllScope ? '请先在顶部选择具体活动' : undefined}
              busy={busy}
              onDetected={(code) => handleScanOrInspect(code)}
              onScanError={(msg) => pushToast({ tone: 'warning', title: msg })}
            />

            {networkError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2"
              >
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>{networkError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleScanOrInspect();
              }}
              className="pt-3 border-t border-slate-900/[0.07] space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2 min-w-0">
                  <GlassInput
                    label="手动输入凭证编号"
                    numeric
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="输入证件编号、赠票编号或动态码"
                  />
                </div>
                <GlassInput
                  label="核验日期"
                  type="date"
                  numeric
                  value={verifyDate}
                  onChange={(e) => setVerifyDate(e.target.value)}
                />
              </div>

              <GlassButton
                type="submit"
                variant="primary"
                loading={busy}
                disabled={isOffline || isAllScope}
                className="w-full"
              >
                {mode === 'fast' ? '核验并核销' : '查询凭证'}
              </GlassButton>
            </form>
          </GlassCard>

          <div className="lg:col-span-5 min-w-0 space-y-4">
            {isOffline ? (
              <GlassCard className="border-red-300 bg-red-50/75 text-center py-10 space-y-2.5">
                <WifiOff className="w-9 h-9 text-red-600 mx-auto" />
                <h3 className="text-base font-semibold text-red-900">网络已断开</h3>
                <p className="text-xs text-red-700">禁止离线核销，请恢复网络后重试。</p>
              </GlassCard>
            ) : preview && preview.valid ? (
              <GlassCard elevated className="space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0071e3]">
                    {isCertificatePreview ? (
                      <>
                        <IdCard className="w-3.5 h-3.5" />
                        工作证件核验
                      </>
                    ) : (
                      <>
                        <Ticket className="w-3.5 h-3.5" />
                        赠票入场核销
                      </>
                    )}
                  </span>
                  <StatusIndicator tone="info" label={preview.statusLabel ?? '有效'} />
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-200 border border-white shrink-0">
                    {preview.avatarUrl ? (
                      <img
                        src={preview.avatarUrl}
                        alt={preview.holderName ?? '持证人'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                        无照片
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900 truncate">
                      {preview.holderName}
                    </h3>
                    <p className="text-sm font-semibold text-[#0071e3] order-number">
                      {preview.displayCode}
                    </p>
                    <p className="text-xs text-slate-600 truncate">{preview.categoryOrBatch}</p>
                    <p className="text-xs text-slate-500 date-number">
                      有效日期：{preview.validDateLabel}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 pt-2 border-t border-slate-900/[0.07]">
                  <GlassButton
                    variant="primary"
                    size="lg"
                    loading={busy}
                    onClick={handleConfirmNormal}
                    className="flex-1"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isCertificatePreview ? '确认核验放行' : '确认核销入场'}
                  </GlassButton>
                  <GlassButton variant="secondary" size="lg" onClick={() => setPreview(null)}>
                    取消
                  </GlassButton>
                </div>
              </GlassCard>
            ) : lastResult ? (
              <GlassCard
                elevated
                className={`space-y-4 ${
                  lastResult.outcome === 'success'
                    ? 'border-emerald-300/80'
                    : lastResult.outcome === 'date_mismatch' || lastResult.outcome === 'expired'
                      ? 'border-amber-300/80'
                      : 'border-red-300/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  {lastResult.outcome === 'success' ? (
                    <CheckCircle2 className="w-8 h-8 text-[#15803d] shrink-0" />
                  ) : lastResult.outcome === 'date_mismatch' ||
                    lastResult.outcome === 'expired' ? (
                    <AlertTriangle className="w-8 h-8 text-[#b45309] shrink-0" />
                  ) : (
                    <XCircle className="w-8 h-8 text-[#b91c1c] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900">
                      {OUTCOME_LABELS[lastResult.outcome].label}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">{lastResult.message}</p>
                  </div>
                </div>

                {lastResult.holderName && (
                  <div className="glass-surface-subtle p-3.5 flex items-center gap-3.5">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                      {lastResult.avatarUrl && (
                        <img
                          src={lastResult.avatarUrl}
                          alt={lastResult.holderName}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="text-xs space-y-0.5 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {lastResult.holderName}{' '}
                        <span className="text-[#0071e3] order-number ml-1.5">
                          {lastResult.displayCode}
                        </span>
                      </div>
                      <div className="text-slate-600 truncate">
                        {lastResult.credentialKind === 'certificate' ? '工作证件' : '赠票'} ·{' '}
                        {lastResult.categoryOrBatch}
                      </div>
                      <div className="text-slate-500 date-number">
                        有效日期：{lastResult.validDateLabel}
                      </div>
                    </div>
                  </div>
                )}
              </GlassCard>
            ) : (
              <GlassCard className="text-center py-12 space-y-2">
                <QrCode className="w-9 h-9 text-slate-400 mx-auto" />
                <h3 className="text-sm font-semibold text-slate-900">等待扫码或输入编号</h3>
              </GlassCard>
            )}
          </div>
        </div>
      )}

      {tab === 'records' && (
        <GlassTable
          rows={records}
          columns={recordColumns}
          searchValue={recordSearch}
          onSearchChange={setRecordSearch}
          searchPlaceholder="搜索凭证编号、持有人或操作员..."
        />
      )}
    </PageContainer>
  );
}
