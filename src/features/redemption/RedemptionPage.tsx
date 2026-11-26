import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  QrCode,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import { PageContainer } from '../../components/layout/PageContainer';
import {
  GlassButton,
  GlassCard,
  GlassInput,
  GlassTabs,
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
    activeActivity,
    activities,
    settings,
    realtimeVersion,
    canAccessModule,
    pushToast,
    refreshCore,
  } = useApp();

  const currentAct = activeActivity ?? activities[0] ?? null;
  const [tab, setTab] = useState<'scanner' | 'records'>('scanner');
  const [mode, setMode] = useState<RedemptionMode>(user?.redemptionMode ?? 'normal');
  const [scanInput, setScanInput] = useState('');
  const [verifyDate, setVerifyDate] = useState('2026-11-26');
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

  const loadRecords = useCallback(async () => {
    if (!currentAct) return;
    try {
      const list = await getApiClient().redemption.listRecords(currentAct.id, recordSearch);
      setRecords(list);
    } catch {
      setNetworkError('网络异常，核销记录加载失败。');
    }
  }, [currentAct, recordSearch]);

  useEffect(() => {
    if (user?.redemptionMode) setMode(user.redemptionMode);
  }, [user?.redemptionMode]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords, realtimeVersion]);

  const handleModeSwitch = async (nextMode: RedemptionMode) => {
    setMode(nextMode);
    setPreview(null);
    if (user) {
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
      if (!code || !user || !currentAct) return;

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
        if (mode === 'fast') {
          const res = await api.redemption.confirmRedemption(
            code,
            currentAct.id,
            'fast',
            user,
            '快速扫码工作台',
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
        const msg = err instanceof Error ? err.message : '网络请求失败，请检查网络连接后重试';
        setNetworkError(msg);
        pushToast({ tone: 'error', title: '核验请求失败', detail: msg });
      } finally {
        setBusy(false);
      }
    },
    [scanInput, user, currentAct, isOffline, mode, verifyDate, loadRecords, pushToast],
  );

  const handleConfirmNormal = async () => {
    if (!user || !currentAct || !scanInput.trim()) return;
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
        '普通扫码工作台',
        verifyDate,
      );
      setPreview(null);
      setLastResult(res.preview);
      await loadRecords();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '核销提交失败，请重试';
      setNetworkError(msg);
      pushToast({ tone: 'error', title: '核销失败', detail: msg });
    } finally {
      setBusy(false);
    }
  };

  const handleConcurrentDemo = async () => {
    if (!user || !currentAct) return;
    if (isOffline) {
      setNetworkError('网络已断开，无法执行核验。');
      return;
    }
    const code = scanInput.trim() || 'A01-01';
    setBusy(true);
    setNetworkError(null);
    try {
      const api = getApiClient();
      const [r1, r2] = await Promise.all([
        api.redemption.confirmRedemption(code, currentAct.id, 'fast', user, '并发终端 A', verifyDate),
        api.redemption.confirmRedemption(code, currentAct.id, 'fast', user, '并发终端 B', verifyDate),
      ]);
      const successes = [r1, r2].filter((r) => r.record.outcome === 'success').length;
      const blocked = [r1, r2].filter((r) => r.record.outcome !== 'success').length;
      setLastResult(r2.preview);
      pushToast({
        tone: 'info',
        title: `并发防重验证：成功 ${successes} 次，拦截 ${blocked} 次`,
      });
      await loadRecords();
    } catch (err) {
      setNetworkError(err instanceof Error ? err.message : '并发验证请求失败');
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

  if (!currentAct) return null;

  const recordColumns: GlassTableColumn<RedemptionRecord>[] = [
    {
      key: 'time',
      header: '核销时间',
      sortable: true,
      sortValue: (r) => r.createdAt,
      render: (r) => <span className="date-number text-xs">{formatDateTimeDisplay(r.createdAt)}</span>,
    },
    {
      key: 'code',
      header: '凭证编号',
      render: (r) => (
        <div>
          <span className="order-number font-semibold text-[#0071e3] mr-2">{r.displayCode}</span>
          <span className="text-xs text-slate-500">
            {r.credentialKind === 'certificate' ? '证件' : '赠票'}
          </span>
        </div>
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
      header: '核销模式',
      render: (r) => (
        <span className="text-xs text-slate-700">
          {r.mode === 'fast' ? '快速模式' : '普通模式'} · {r.operatorName}
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

  return (
    <PageContainer className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <GlassTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'scanner', label: '扫码工作台' },
            { id: 'records', label: '核销记录', count: records.length },
          ]}
        />
        <GlassTabs
          value={mode}
          onChange={handleModeSwitch}
          tabs={[
            { id: 'normal', label: '普通模式' },
            { id: 'fast', label: '快速模式' },
          ]}
        />
      </div>

      {tab === 'scanner' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Real Camera QR Scanner + Manual Fallback */}
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
              {settings?.adapterMode === 'mock' && (
                <StatusIndicator tone="warning" label="演示模式" />
              )}
            </div>

            <GlassScanner
              offline={isOffline}
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

            {/* Manual Input Fallback */}
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
                    placeholder="输入 A01-01 / GT2027010001 / DYN-..."
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

              <div className="flex flex-wrap gap-2">
                <GlassButton
                  type="submit"
                  variant="primary"
                  loading={busy}
                  disabled={isOffline}
                  className="flex-1"
                >
                  {mode === 'fast' ? '核验并核销' : '查询凭证'}
                </GlassButton>
                <GlassButton
                  variant="secondary"
                  loading={busy}
                  disabled={isOffline}
                  onClick={handleConcurrentDemo}
                >
                  并发防重验证
                </GlassButton>
              </div>
            </form>

            {settings?.adapterMode === 'mock' && (
              <div className="pt-3 border-t border-slate-900/[0.07] space-y-2">
                <p className="text-xs font-medium text-slate-500">演示快捷编号</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { code: 'GT2027010001', label: '有效赠票 GT2027010001' },
                    { code: 'A01-02', label: '有效证件 A01-02' },
                    { code: 'GT2027010003', label: '重复票 GT2027010003' },
                    { code: 'C15-01', label: '冻结证件 C15-01' },
                    { code: 'GT2027010002', label: '日期不符 GT2027010002' },
                    { code: 'DYN-GIFT.EXPIRED.0000', label: '过期码' },
                  ].map((sample) => (
                    <button
                      key={sample.code}
                      type="button"
                      disabled={isOffline}
                      onClick={() => handleScanOrInspect(sample.code)}
                      className="px-2.5 py-1.5 rounded-xl text-xs bg-white/65 hover:bg-white border border-slate-900/[0.08] text-slate-700 cursor-pointer numeric-text transition-colors disabled:opacity-50"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>

          {/* Right: Live Verification Preview & Outcome */}
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
                  <span className="text-xs font-semibold text-[#0071e3]">待确认放行</span>
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
                    确认核销
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
                  ) : lastResult.outcome === 'date_mismatch' || lastResult.outcome === 'expired' ? (
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
                      <div className="text-slate-600 truncate">{lastResult.categoryOrBatch}</div>
                      <div className="text-slate-500 date-number">
                        有效日期：{lastResult.validDateLabel}
                      </div>
                    </div>
                  </div>
                )}

                {lastResult.isMockDemo && (
                  <p className="text-[11px] text-amber-700">演示结果（Mock 模式）</p>
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
