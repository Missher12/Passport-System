import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Flashlight,
  QrCode,
  RefreshCw,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import {
  GlassButton,
  GlassCard,
  GlassInput,
  GlassTabs,
  PageHeader,
  PermissionDeniedState,
  StatusIndicator,
} from '../../components/glass/GlassPrimitives';
import { GlassTable, type GlassTableColumn } from '../../components/glass/GlassTable';
import { getApiClient } from '../../services/api';
import { formatDateTimeDisplay } from '../../utils/stateMachines';
import type { RedemptionMode, RedemptionOutcome, RedemptionPreview, RedemptionRecord } from '../../types/domain';

const OUTCOME_LABELS: Record<RedemptionOutcome, { label: string; tone: 'success' | 'danger' | 'warning' }> = {
  success: { label: '核销成功', tone: 'success' },
  duplicate: { label: '重复核销已拦截', tone: 'danger' },
  expired: { label: '凭证/动态码已过期', tone: 'warning' },
  frozen: { label: '凭证已冻结', tone: 'danger' },
  voided: { label: '凭证已作废', tone: 'danger' },
  date_mismatch: { label: '使用日期不匹配', tone: 'warning' },
  invalid: { label: '无效凭证', tone: 'danger' },
  offline: { label: '断网禁止核销', tone: 'danger' },
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

  // Camera controls
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadRecords = async () => {
    if (!currentAct) return;
    const list = await getApiClient().redemption.listRecords(currentAct.id, recordSearch);
    setRecords(list);
  };

  useEffect(() => {
    if (user?.redemptionMode) setMode(user.redemptionMode);
  }, [user?.redemptionMode]);

  useEffect(() => {
    loadRecords();
  }, [currentAct?.id, recordSearch, realtimeVersion]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setTorchOn(false);
  };

  useEffect(() => stopCamera, []);

  if (!canAccessModule('redemption')) {
    return (
      <div className="page-container">
        <PermissionDeniedState moduleLabel="现场核销" />
      </div>
    );
  }

  if (!currentAct) return null;

  const toggleCamera = async (nextFacing?: 'environment' | 'user') => {
    const targetFacing = nextFacing ?? facingMode;
    if (cameraActive && !nextFacing) {
      stopCamera();
      return;
    }
    stopCamera();
    setCameraNotice(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraNotice('当前浏览器无物理摄像头设备，可使用下方快捷模拟扫码或手动输入编号核验。');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetFacing },
      });
      streamRef.current = stream;
      setFacingMode(targetFacing);
      setCameraActive(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setCameraNotice('未授权摄像头或设备未接入摄像头，已保留备用手动编号核验入口。');
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) {
      pushToast({ tone: 'info', title: '手电筒仅在移动设备后置摄像头开启时可用' });
      return;
    }
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      pushToast({ tone: 'info', title: '当前设备摄像头不支持网页控制闪光灯' });
    }
  };

  const handleModeSwitch = async (nextMode: RedemptionMode) => {
    setMode(nextMode);
    setPreview(null);
    if (user) {
      await getApiClient().users.setUserRedemptionMode(user.id, nextMode, user);
      await refreshCore();
    }
    pushToast({
      tone: 'info',
      title: `已切换至${nextMode === 'fast' ? '快速模式（自动核验并核销）' : '普通模式（展示资料人工确认）'}`,
    });
  };

  const handleScanOrInspect = async (codeValue?: string) => {
    const code = (codeValue ?? scanInput).trim();
    if (!code || !user) return;
    setScanInput(code);
    setBusy(true);
    setLastResult(null);
    try {
      const api = getApiClient();
      if (mode === 'fast') {
        const res = await api.redemption.confirmRedemption(
          code,
          currentAct.id,
          'fast',
          user,
          '快速模式扫码工作台',
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
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmNormal = async () => {
    if (!user || !scanInput.trim()) return;
    setBusy(true);
    try {
      const res = await getApiClient().redemption.confirmRedemption(
        scanInput.trim(),
        currentAct.id,
        'normal',
        user,
        '普通模式扫码工作台',
        verifyDate,
      );
      setPreview(null);
      setLastResult(res.preview);
      await loadRecords();
    } finally {
      setBusy(false);
    }
  };

  const handleConcurrentDemo = async () => {
    if (!user) return;
    const code = scanInput.trim() || 'A01-01';
    setBusy(true);
    try {
      const api = getApiClient();
      const [r1, r2] = await Promise.all([
        api.redemption.confirmRedemption(code, currentAct.id, 'fast', user, '并发设备 A', verifyDate),
        api.redemption.confirmRedemption(code, currentAct.id, 'fast', user, '并发设备 B', verifyDate),
      ]);
      const successes = [r1, r2].filter((r) => r.record.outcome === 'success').length;
      const blocked = [r1, r2].filter((r) => r.record.outcome !== 'success').length;
      setLastResult(r2.preview);
      pushToast({
        tone: 'info',
        title: `并发双设备扫码测试完成：成功 ${successes} 次，拦截 ${blocked} 次`,
        detail: '同一凭证同时被两台终端扫描时，服务端原子锁确保最多仅一次核销成功',
      });
      await loadRecords();
    } finally {
      setBusy(false);
    }
  };

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
      header: '反馈说明',
      render: (r) => <span className="text-xs text-slate-600">{r.message}</span>,
    },
  ];

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="统一扫码核销工作台"
        subtitle={`当前活动：${currentAct.name} · 证件与赠票共用扫码工作台，业务状态完全独立，全程联网原子核销`}
        actions={
          <GlassTabs
            value={mode}
            onChange={handleModeSwitch}
            tabs={[
              { id: 'normal', label: '普通模式（人工确认）' },
              { id: 'fast', label: '快速模式（自动核销）' },
            ]}
          />
        }
      />

      <GlassTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'scanner', label: '现场扫码工作台' },
          { id: 'records', label: '核销记录', count: records.length },
        ]}
      />

      {tab === 'scanner' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Scanner + Manual Input + Quick Test Scenarios */}
          <GlassCard className="lg:col-span-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                {mode === 'fast' ? (
                  <Zap className="w-4 h-4 text-[#0071e3]" />
                ) : (
                  <QrCode className="w-4 h-4 text-[#0071e3]" />
                )}
                {mode === 'fast' ? '快速连扫通道' : '标准人工核验通道'}
              </h2>
              <div className="flex items-center gap-1.5">
                <GlassButton size="sm" variant="secondary" onClick={() => toggleCamera()}>
                  <Camera className="w-3.5 h-3.5" />
                  {cameraActive ? '关闭镜头' : '开启摄像头'}
                </GlassButton>
                {cameraActive && (
                  <>
                    <GlassButton
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        toggleCamera(facingMode === 'environment' ? 'user' : 'environment')
                      }
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      切换
                    </GlassButton>
                    <GlassButton size="sm" variant="ghost" onClick={toggleTorch}>
                      <Flashlight className="w-3.5 h-3.5" />
                    </GlassButton>
                  </>
                )}
              </div>
            </div>

            {cameraActive && (
              <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-[4/3]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" />
                </div>
              </div>
            )}
            {cameraNotice && <p className="text-xs text-amber-700">{cameraNotice}</p>}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleScanOrInspect();
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <GlassInput
                    label="动态二维码令牌 / 备用手动编号"
                    numeric
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    placeholder="扫描或输入 A01-01 / GT2027010001 / DYN-..."
                  />
                </div>
                <GlassInput
                  label="现场核验日期"
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
                  disabled={Boolean(settings?.simulateOffline)}
                  className="flex-1"
                >
                  {mode === 'fast' ? '扫码并自动核销' : '扫码核验凭证'}
                </GlassButton>
                <GlassButton
                  variant="secondary"
                  loading={busy}
                  disabled={Boolean(settings?.simulateOffline)}
                  onClick={handleConcurrentDemo}
                >
                  模拟多设备并发扫码
                </GlassButton>
              </div>
            </form>

            {/* Quick Verification Scenarios (Chapter 23 Test 5) */}
            <div className="pt-3 border-t border-slate-900/[0.07] space-y-2">
              <p className="text-xs font-semibold text-slate-600">
                一键模拟扫码用例（覆盖有效、重复、冻结、日期不匹配、过期令牌）
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { code: 'GT2027010001', label: '有效赠票 GT2027010001' },
                  { code: 'A01-02', label: '有效证件 A01-02' },
                  { code: 'GT2027010003', label: '已核销重复票 GT2027010003' },
                  { code: 'C15-01', label: '已冻结证件 C15-01' },
                  { code: 'GT2027010002', label: '次日日期不匹配 GT2027010002' },
                  { code: 'DYN-GIFT.EXPIRED.0000', label: '已过期动态码' },
                ].map((sample) => (
                  <button
                    key={sample.code}
                    type="button"
                    onClick={() => handleScanOrInspect(sample.code)}
                    className="px-2.5 py-1.5 rounded-xl text-xs bg-white/65 hover:bg-white border border-slate-900/[0.08] text-slate-700 cursor-pointer numeric-text transition-colors"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Right: Live Verification Preview & Outcome Feedback Panel */}
          <div className="lg:col-span-6 space-y-4">
            {settings?.simulateOffline ? (
              <GlassCard className="border-red-300 bg-red-50/75 text-center py-10 space-y-3">
                <WifiOff className="w-10 h-10 text-red-600 mx-auto" />
                <h3 className="text-lg font-semibold text-red-900">网络已断开 · 禁止离线核销</h3>
                <p className="text-sm text-red-700 max-w-md mx-auto">
                  系统严禁在断网时假装核销成功。请恢复网络连接后重新拉取数据并扫码。
                </p>
              </GlassCard>
            ) : preview && preview.valid ? (
              <GlassCard elevated className="space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#0071e3]">
                    普通模式 · 待工作人员人工确认
                  </span>
                  <StatusIndicator tone="info" label={preview.statusLabel ?? '有效'} />
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-200 border border-white shrink-0">
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
                    <h3 className="text-xl font-semibold text-slate-900">{preview.holderName}</h3>
                    <p className="text-base font-semibold text-[#0071e3] order-number">
                      {preview.displayCode}
                    </p>
                    <p className="text-xs text-slate-600">{preview.categoryOrBatch}</p>
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
                    确认核销放行
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
                    <CheckCircle2 className="w-9 h-9 text-[#15803d] shrink-0" />
                  ) : lastResult.outcome === 'date_mismatch' || lastResult.outcome === 'expired' ? (
                    <AlertTriangle className="w-9 h-9 text-[#b45309] shrink-0" />
                  ) : (
                    <XCircle className="w-9 h-9 text-[#b91c1c] shrink-0" />
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {OUTCOME_LABELS[lastResult.outcome].label}
                    </h3>
                    <p className="text-sm text-slate-600 mt-0.5">{lastResult.message}</p>
                  </div>
                </div>

                {lastResult.holderName && (
                  <div className="glass-surface-subtle p-4 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-200 shrink-0">
                      {lastResult.avatarUrl && (
                        <img
                          src={lastResult.avatarUrl}
                          alt={lastResult.holderName}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="text-sm font-semibold text-slate-900">
                        {lastResult.holderName}{' '}
                        <span className="text-[#0071e3] order-number ml-1.5">
                          {lastResult.displayCode}
                        </span>
                      </div>
                      <div className="text-slate-600">{lastResult.categoryOrBatch}</div>
                      <div className="text-slate-500 date-number">
                        有效日期：{lastResult.validDateLabel}
                      </div>
                    </div>
                  </div>
                )}

                {lastResult.isMockDemo && (
                  <p className="text-[11px] text-amber-700">
                    演示模式结果：正式环境由后端分布式事务与动态令牌签名完成权威核销校验。
                  </p>
                )}
              </GlassCard>
            ) : (
              <GlassCard className="text-center py-14 space-y-2">
                <QrCode className="w-10 h-10 text-slate-400 mx-auto" />
                <h3 className="text-base font-semibold text-slate-900">等待扫码或输入编号</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  当前处于「{mode === 'fast' ? '快速自动核销' : '普通人工确认'}」模式，扫码后将在此实时显示持证人照片与核验状态。
                </p>
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
    </div>
  );
}
