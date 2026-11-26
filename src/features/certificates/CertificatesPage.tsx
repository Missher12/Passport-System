import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Plus,
  QrCode,
  ShieldAlert,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import { PageContainer } from '../../components/layout/PageContainer';
import {
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassInput,
  GlassSelect,
  GlassTabs,
  PermissionDeniedState,
  StatusIndicator,
} from '../../components/glass/GlassPrimitives';
import { GlassDialog, GlassUpload } from '../../components/glass/GlassOverlay';
import { GlassTable, type GlassTableColumn } from '../../components/glass/GlassTable';
import { ElectronicCredentialCard, GlassQRCode, formatValidDateRange } from '../../components/qr/GlassQRCode';
import { getApiClient } from '../../services/api';
import {
  CERTIFICATE_STATUS_LABELS,
  COUNTRY_CODES,
  ID_TYPE_LABELS,
  formatDateTimeDisplay,
} from '../../utils/stateMachines';
import type {
  CertificateCategory,
  CertificateStatus,
  Exhibitor,
  ExhibitorMember,
  IdType,
  OnsiteExtraToken,
} from '../../types/domain';

function certTone(status: CertificateStatus) {
  if (status === 'badge_claimed' || status === 'credential_generated' || status === 'avatar_completed') {
    return 'success' as const;
  }
  if (status === 'frozen' || status === 'voided') return 'danger' as const;
  return 'warning' as const;
}

export function CertificatesPage() {
  const { user, activeActivity, activities, realtimeVersion, canAccessModule, switchPortal, pushToast } =
    useApp();

  const currentAct = activeActivity ?? activities[0] ?? null;
  const [tab, setTab] = useState<'booth_claim' | 'individual' | 'onsite_extra' | 'categories'>('booth_claim');
  const [exhibitors, setExhibitors] = useState<Exhibitor[]>([]);
  const [members, setMembers] = useState<ExhibitorMember[]>([]);
  const [categories, setCategories] = useState<CertificateCategory[]>([]);
  const [extraTokens, setExtraTokens] = useState<OnsiteExtraToken[]>([]);
  const [loading, setLoading] = useState(true);

  // Booth batch claim state
  const [selectedBoothId, setSelectedBoothId] = useState<string>('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberFilter, setMemberFilter] = useState<'all' | 'unclaimed' | 'claimed'>('all');
  const [previewMember, setPreviewMember] = useState<ExhibitorMember | null>(null);

  // Individual claim state
  const [scanCode, setScanCode] = useState('A01-02');
  const [foundMember, setFoundMember] = useState<ExhibitorMember | null>(null);

  // Onsite extra badge state (Chapter 12)
  const [extraExId, setExtraExId] = useState('');
  const [extraVerify, setExtraVerify] = useState({
    boothNumber: '',
    boothName: '',
    primaryContactName: '',
    primaryIdType: 'cn_id' as IdType,
    primaryIdNumber: '',
    countryCode: '+86',
    phone: '',
    businessPassword: '',
  });
  const [extraCount, setExtraCount] = useState('1');
  const [extraReason, setExtraReason] = useState('');
  const [issuedToken, setIssuedToken] = useState<OnsiteExtraToken | null>(null);
  const [simulateScanToken, setSimulateScanToken] = useState<OnsiteExtraToken | null>(null);
  const [extraMemberForm, setExtraMemberForm] = useState({
    name: '',
    idType: 'cn_id' as IdType,
    idNumber: '',
    countryCode: '+86',
    phone: '',
    avatarUrl: '',
  });

  // Category modal state
  const [catDialog, setCatDialog] = useState<{
    id?: string;
    name: string;
    color: string;
    enabled: boolean;
  } | null>(null);

  const loadData = async () => {
    if (!currentAct) return;
    setLoading(true);
    try {
      const api = getApiClient();
      const [ex, mem, cats, tks] = await Promise.all([
        api.exhibitors.list(currentAct.id),
        api.members.list(currentAct.id),
        api.certificates.listCategories(currentAct.id),
        api.certificates.listOnsiteExtraTokens(currentAct.id),
      ]);
      setExhibitors(ex);
      setMembers(mem);
      setCategories(cats);
      setExtraTokens(tks);
      if (!selectedBoothId && ex[0]) setSelectedBoothId(ex[0].id);
      if (!extraExId && ex[0]) {
        setExtraExId(ex[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentAct?.id, realtimeVersion]);

  const boothStatsRows = useMemo(() => {
    return exhibitors.map((ex) => {
      const exMembers = members.filter((m) => m.exhibitorId === ex.id && m.status !== 'voided');
      const claimed = exMembers.filter((m) => m.status === 'badge_claimed').length;
      const unclaimed = exMembers.length - claimed;
      return {
        id: ex.id,
        exhibitor: ex,
        originalQuota: ex.quota,
        registeredCount: exMembers.length,
        onsiteExtra: ex.onsiteExtraCount,
        claimedCount: claimed,
        unclaimedCount: unclaimed,
      };
    });
  }, [exhibitors, members]);

  const activeBoothMembers = useMemo(() => {
    return members.filter((m) => {
      if (m.exhibitorId !== selectedBoothId) return false;
      if (memberFilter === 'claimed') return m.status === 'badge_claimed';
      if (memberFilter === 'unclaimed') return m.status !== 'badge_claimed';
      return true;
    });
  }, [members, selectedBoothId, memberFilter]);

  if (!canAccessModule('certificates')) {
    return (
      <PageContainer>
        <PermissionDeniedState moduleLabel="证件管理" />
      </PageContainer>
    );
  }

  if (!currentAct) return null;

  const handleBatchClaim = async () => {
    if (!user || !selectedBoothId || selectedMemberIds.length === 0) return;
    try {
      const claimed = await getApiClient().certificates.claimBatch(
        currentAct.id,
        selectedBoothId,
        selectedMemberIds,
        user,
      );
      setSelectedMemberIds([]);
      pushToast({
        tone: 'success',
        title: `展位批量领取成功（${claimed.length} 张实体证件）`,
        detail: `已记录具体人员编号、领取时间及操作人 ${user.displayName}（演示结果）`,
      });
      await loadData();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: '批量领取未通过',
        detail: err instanceof Error ? err.message : '请确认所选人员已完成头像补充',
      });
    }
  };

  const handleLookupIndividual = () => {
    const cleaned = scanCode.trim().toUpperCase();
    const match = members.find((m) => m.memberCode.toUpperCase() === cleaned) ?? null;
    setFoundMember(match);
    if (!match) {
      pushToast({ tone: 'warning', title: `未找到编号「${cleaned}」对应的展商人员` });
    }
  };

  const handleIndividualClaim = async () => {
    if (!user || !foundMember) return;
    try {
      const updated = await getApiClient().certificates.claimIndividual(
        currentAct.id,
        foundMember.id,
        user,
      );
      setFoundMember(updated);
      pushToast({
        tone: 'success',
        title: `${updated.memberCode} ${updated.name} 实体证件领取已确认`,
      });
      await loadData();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: '无法确认领证',
        detail: err instanceof Error ? err.message : '状态不允许',
      });
    }
  };

  const prefillExtraVerify = (exhibitorId: string) => {
    setExtraExId(exhibitorId);
    const ex = exhibitors.find((e) => e.id === exhibitorId);
    if (!ex) return;
    setExtraVerify({
      boothNumber: ex.boothNumber,
      boothName: ex.boothName,
      primaryContactName: ex.primaryContactName,
      primaryIdType: ex.primaryIdType,
      primaryIdNumber: ex.primaryIdNumber,
      countryCode: ex.countryCode,
      phone: ex.phone,
      businessPassword: ex.businessPassword,
    });
  };

  const handleIssueOnsiteToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !extraExId) return;
    try {
      const tk = await getApiClient().certificates.createOnsiteExtraToken(
        {
          activityId: currentAct.id,
          exhibitorId: extraExId,
          verifyInput: {
            activityId: currentAct.id,
            ...extraVerify,
          },
          extraCount: Number.parseInt(extraCount, 10) || 1,
          reason: extraReason,
        },
        user,
      );
      setIssuedToken(tk);
      setExtraReason('');
      pushToast({
        tone: 'success',
        title: `已签发一次性现场加证二维码（${tk.token}）`,
        detail: '展商扫码填报提交后自动递增编号并失效（演示结果）',
      });
      await loadData();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: '现场加证签发失败',
        detail: err instanceof Error ? err.message : '请核对展商 7 项信息与原因',
      });
    }
  };

  const handleSubmitSimulatedExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulateScanToken) return;
    try {
      const res = await getApiClient().certificates.submitOnsiteExtraMember(
        simulateScanToken.token,
        extraMemberForm,
      );
      pushToast({
        tone: 'success',
        title: `现场加证登记完成：${res.member.memberCode} ${res.member.name}`,
        detail: res.tokenState.used
          ? '该一次性加证二维码已使用失效，审计日志已记录（演示结果）'
          : `剩余可用次数：${res.tokenState.extraCount - res.tokenState.usedCount}`,
      });
      setExtraMemberForm({
        name: '',
        idType: 'cn_id',
        idNumber: '',
        countryCode: '+86',
        phone: '',
        avatarUrl: '',
      });
      setSimulateScanToken(null);
      setIssuedToken(res.tokenState);
      await loadData();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: '加证提交失败',
        detail: err instanceof Error ? err.message : '请检查表单内容',
      });
    }
  };

  const statsColumns: GlassTableColumn<(typeof boothStatsRows)[number]>[] = [
    {
      key: 'booth',
      header: '展商摊位',
      render: (r) => (
        <button
          type="button"
          onClick={() => {
            setSelectedBoothId(r.exhibitor.id);
            setSelectedMemberIds([]);
          }}
          className="text-left cursor-pointer hover:text-[#0071e3]"
        >
          <span className="font-semibold text-[#0071e3] numeric-text mr-2">
            {r.exhibitor.boothNumber}
          </span>
          <span className="font-medium text-slate-900">{r.exhibitor.boothName}</span>
        </button>
      ),
    },
    {
      key: 'orig',
      header: '原申请人数',
      align: 'right',
      render: (r) => <span className="table-number">{r.originalQuota}</span>,
    },
    {
      key: 'reg',
      header: '实际登记人数',
      align: 'right',
      render: (r) => <span className="table-number font-medium">{r.registeredCount}</span>,
    },
    {
      key: 'extra',
      header: '现场新增人数',
      align: 'right',
      render: (r) => <span className="table-number text-[#0071e3]">{r.onsiteExtra}</span>,
    },
    {
      key: 'claimed',
      header: '已领取人数',
      align: 'right',
      render: (r) => <span className="table-number text-[#15803d] font-medium">{r.claimedCount}</span>,
    },
    {
      key: 'unclaimed',
      header: '未领取人数',
      align: 'right',
      render: (r) => <span className="table-number text-[#b45309]">{r.unclaimedCount}</span>,
    },
  ];

  const memberClaimColumns: GlassTableColumn<ExhibitorMember>[] = [
    {
      key: 'code',
      header: '人员编号',
      render: (m) => <span className="order-number font-semibold text-[#0071e3]">{m.memberCode}</span>,
    },
    {
      key: 'name',
      header: '姓名',
      render: (m) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{m.name}</span>
          {m.isOnsiteExtra && <span className="text-[11px] text-amber-700">现场新增</span>}
        </div>
      ),
    },
    {
      key: 'status',
      header: '当前状态',
      render: (m) => (
        <StatusIndicator tone={certTone(m.status)} label={CERTIFICATE_STATUS_LABELS[m.status]} />
      ),
    },
    {
      key: 'claimInfo',
      header: '领取记录',
      render: (m) =>
        m.claimRecord ? (
          <div className="text-xs text-slate-600 date-number">
            {formatDateTimeDisplay(m.claimRecord.claimedAt)} · {m.claimRecord.operatorName}
          </div>
        ) : (
          <span className="text-xs text-slate-400">未领取</span>
        ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (m) => (
        <div className="flex items-center justify-end gap-1.5">
          <GlassButton size="sm" variant="secondary" onClick={() => setPreviewMember(m)}>
            凭证
          </GlassButton>
          {m.status !== 'frozen' && m.status !== 'voided' && (
            <GlassButton
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!user) return;
                await getApiClient().members.setStatus(
                  currentAct.id,
                  m.id,
                  'frozen',
                  '证件管理员人工冻结',
                  user,
                );
                pushToast({ tone: 'warning', title: `${m.memberCode} 已冻结` });
                await loadData();
              }}
            >
              冻结
            </GlassButton>
          )}
          {m.status === 'frozen' && (
            <GlassButton
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!user) return;
                await getApiClient().members.setStatus(
                  currentAct.id,
                  m.id,
                  m.avatarUrl ? 'credential_generated' : 'waiting_avatar',
                  '解除冻结恢复正常状态',
                  user,
                );
                pushToast({ tone: 'success', title: `${m.memberCode} 已解冻` });
                await loadData();
              }}
            >
              解冻
            </GlassButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageContainer className="space-y-5">
      <GlassTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'booth_claim', label: '展位发证', count: exhibitors.length },
          { id: 'individual', label: '个人扫码领证' },
          { id: 'onsite_extra', label: '现场加证', count: extraTokens.length },
          { id: 'categories', label: '证件类别', count: categories.length },
        ]}
      />

      {tab === 'booth_claim' && (
        <div className="space-y-6">
          <GlassTable
            rows={boothStatsRows}
            columns={statsColumns}
            loading={loading}
            searchable={false}
          />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-slate-900">展位具体人员领取明细</h2>
                <select
                  aria-label="选择展商"
                  value={selectedBoothId}
                  onChange={(e) => {
                    setSelectedBoothId(e.target.value);
                    setSelectedMemberIds([]);
                  }}
                  className="glass-input h-[36px] px-3 text-sm"
                >
                  {exhibitors.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.boothNumber} · {ex.boothName}
                    </option>
                  ))}
                </select>
              </div>
              <GlassTabs
                value={memberFilter}
                onChange={setMemberFilter}
                tabs={[
                  { id: 'all', label: '全部人员' },
                  { id: 'unclaimed', label: '未领取' },
                  { id: 'claimed', label: '已领取' },
                ]}
              />
            </div>

            <GlassTable
              rows={activeBoothMembers}
              columns={memberClaimColumns}
              searchable={false}
              selectable
              selectedIds={selectedMemberIds}
              onSelectionChange={setSelectedMemberIds}
              batchActions={
                <GlassButton size="sm" variant="primary" onClick={handleBatchClaim}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  批量确认领取实体证件
                </GlassButton>
              }
            />
          </div>
        </div>
      )}

      {tab === 'individual' && (
        <div className="max-w-2xl space-y-5">
          <GlassCard className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900">个人扫码领证</h2>
            <div className="flex gap-2">
              <div className="flex-1">
                <GlassInput
                  numeric
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  placeholder="输入人员编号（如 A01-02）"
                />
              </div>
              <GlassButton variant="primary" onClick={handleLookupIndividual}>
                <QrCode className="w-4 h-4" />
                查询人员
              </GlassButton>
            </div>

            {foundMember && (
              <div className="glass-surface-subtle p-4 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-200 shrink-0">
                  {foundMember.avatarUrl ? (
                    <img
                      src={foundMember.avatarUrl}
                      alt={foundMember.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                      无头像
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1 text-center sm:text-left">
                  <div className="text-base font-semibold text-slate-900">
                    <span className="text-[#0071e3] order-number mr-2">{foundMember.memberCode}</span>
                    {foundMember.name}
                  </div>
                  <p className="text-xs text-slate-600">
                    {foundMember.boothNumber} 展位 · {CERTIFICATE_STATUS_LABELS[foundMember.status]}
                  </p>
                  {foundMember.claimRecord && (
                    <p className="text-xs text-emerald-700 date-number">
                      已于 {formatDateTimeDisplay(foundMember.claimRecord.claimedAt)} 由{' '}
                      {foundMember.claimRecord.operatorName} 发放
                    </p>
                  )}
                </div>
                <GlassButton
                  variant="primary"
                  disabled={foundMember.status === 'badge_claimed'}
                  onClick={handleIndividualClaim}
                >
                  {foundMember.status === 'badge_claimed' ? '已完成领取' : '确认领取实体证'}
                </GlassButton>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {tab === 'onsite_extra' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <GlassCard className="lg:col-span-7 min-w-0 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#0071e3]" />
              现场加证
            </h2>

            <form onSubmit={handleIssueOnsiteToken} className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[200px]">
                  <GlassSelect
                    label="1. 选择对应展商"
                    value={extraExId}
                    onChange={(e) => setExtraExId(e.target.value)}
                    options={exhibitors.map((ex) => ({
                      value: ex.id,
                      label: `${ex.boothNumber} · ${ex.boothName}（原名额 ${ex.quota} / 已加证 ${ex.onsiteExtraCount}）`,
                    }))}
                  />
                </div>
                <GlassButton
                  size="md"
                  variant="secondary"
                  onClick={() => prefillExtraVerify(extraExId)}
                >
                  回填该展商 7 项档案供核对
                </GlassButton>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <GlassInput
                  label="摊位号"
                  required
                  numeric
                  value={extraVerify.boothNumber}
                  onChange={(e) => setExtraVerify({ ...extraVerify, boothNumber: e.target.value })}
                />
                <GlassInput
                  label="展位名称"
                  required
                  value={extraVerify.boothName}
                  onChange={(e) => setExtraVerify({ ...extraVerify, boothName: e.target.value })}
                />
                <GlassInput
                  label="主要联系人姓名"
                  required
                  value={extraVerify.primaryContactName}
                  onChange={(e) =>
                    setExtraVerify({ ...extraVerify, primaryContactName: e.target.value })
                  }
                />
                <GlassSelect
                  label="证件类型"
                  value={extraVerify.primaryIdType}
                  onChange={(e) =>
                    setExtraVerify({ ...extraVerify, primaryIdType: e.target.value as IdType })
                  }
                  options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                />
                <GlassInput
                  label="证件号码"
                  required
                  numeric
                  value={extraVerify.primaryIdNumber}
                  onChange={(e) =>
                    setExtraVerify({ ...extraVerify, primaryIdNumber: e.target.value })
                  }
                />
                <GlassInput
                  label="联系电话"
                  required
                  numeric
                  value={extraVerify.phone}
                  onChange={(e) => setExtraVerify({ ...extraVerify, phone: e.target.value })}
                />
                <GlassInput
                  label="唯一商务密码"
                  required
                  numeric
                  value={extraVerify.businessPassword}
                  onChange={(e) =>
                    setExtraVerify({ ...extraVerify, businessPassword: e.target.value })
                  }
                />
                <GlassInput
                  label="本次新增人数"
                  type="number"
                  min={1}
                  max={20}
                  required
                  numeric
                  value={extraCount}
                  onChange={(e) => setExtraCount(e.target.value)}
                />
              </div>

              <GlassInput
                label="新增原因（必填，永久写入审计日志）"
                required
                value={extraReason}
                onChange={(e) => setExtraReason(e.target.value)}
                placeholder="例如：展台客流激增临时增派两名签售引导员"
              />

              <div className="flex justify-end">
                <GlassButton type="submit" variant="primary">
                  核验并生成一次性加证二维码
                </GlassButton>
              </div>
            </form>
          </GlassCard>

          <div className="lg:col-span-5 space-y-4">
            {issuedToken ? (
              <GlassCard elevated className="text-center space-y-3">
                <h3 className="text-base font-semibold text-slate-900">
                  {issuedToken.boothNumber} 一次性现场加证二维码
                </h3>
                <p className="text-xs text-slate-500">
                  原因：{issuedToken.reason} · 已用{' '}
                  <span className="numeric-text">
                    {issuedToken.usedCount}/{issuedToken.extraCount}
                  </span>
                </p>
                <div className="flex justify-center">
                  <GlassQRCode value={issuedToken.token} size={172} label="一次性现场加证二维码" />
                </div>
                <p className="text-xs font-medium text-[#0071e3] numeric-text">
                  加证码：{issuedToken.token}
                </p>
                <StatusIndicator
                  tone={issuedToken.used ? 'danger' : 'success'}
                  label={issuedToken.used ? '已使用失效' : '等待展商扫码填报'}
                />
                {!issuedToken.used && (
                  <div className="flex flex-wrap justify-center gap-2 pt-2">
                    <GlassButton
                      size="sm"
                      variant="primary"
                      onClick={() => setSimulateScanToken(issuedToken)}
                    >
                      模拟展商扫码登记资料
                    </GlassButton>
                    <GlassButton
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        switchPortal('exhibitor', { onsiteExtraToken: issuedToken.token })
                      }
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      外部端打开
                    </GlassButton>
                  </div>
                )}
              </GlassCard>
            ) : (
              <GlassCard className="text-center py-10 space-y-2">
                <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-medium text-slate-800">尚未生成一次性加证码</p>
              </GlassCard>
            )}

            <GlassCard className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">近期现场加证记录</h3>
              <div className="divide-y divide-slate-900/[0.06] text-xs">
                {extraTokens.map((t) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-slate-900 numeric-text">
                        {t.boothNumber} · {t.token}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {t.reason} · 操作人 {t.operatorName}
                      </div>
                    </div>
                    <StatusIndicator
                      tone={t.used ? 'neutral' : 'success'}
                      label={t.used ? '已失效' : `余 ${t.extraCount - t.usedCount}`}
                    />
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <GlassButton
              variant="primary"
              onClick={() => setCatDialog({ name: '', color: '#0071e3', enabled: true })}
            >
              <Plus className="w-4 h-4" />
              新增证件类别
            </GlassButton>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => (
              <GlassCard key={cat.id} className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <GlassBadge label={cat.name} color={cat.color} />
                  <div>
                    <StatusIndicator
                      tone={cat.enabled ? 'success' : 'neutral'}
                      label={cat.enabled ? '已启用' : '已停用'}
                    />
                  </div>
                </div>
                <GlassButton
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setCatDialog({
                      id: cat.id,
                      name: cat.name,
                      color: cat.color,
                      enabled: cat.enabled,
                    })
                  }
                >
                  编辑
                </GlassButton>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      <GlassDialog
        open={Boolean(simulateScanToken)}
        title={`现场加证登记：${simulateScanToken?.boothNumber ?? ''} ${simulateScanToken?.boothName ?? ''}`}
        onClose={() => setSimulateScanToken(null)}
      >
        <form onSubmit={handleSubmitSimulatedExtra} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <GlassInput
              label="人员姓名"
              required
              value={extraMemberForm.name}
              onChange={(e) => setExtraMemberForm({ ...extraMemberForm, name: e.target.value })}
            />
            <GlassSelect
              label="证件类型"
              value={extraMemberForm.idType}
              onChange={(e) =>
                setExtraMemberForm({ ...extraMemberForm, idType: e.target.value as IdType })
              }
              options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            />
            <GlassInput
              label="证件号码"
              required
              numeric
              value={extraMemberForm.idNumber}
              onChange={(e) =>
                setExtraMemberForm({ ...extraMemberForm, idNumber: e.target.value })
              }
            />
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-2">
                <GlassSelect
                  label="区号"
                  value={extraMemberForm.countryCode}
                  onChange={(e) =>
                    setExtraMemberForm({ ...extraMemberForm, countryCode: e.target.value })
                  }
                  options={COUNTRY_CODES.map((c) => ({ value: c.code, label: c.code }))}
                />
              </div>
              <div className="col-span-3">
                <GlassInput
                  label="联系电话"
                  required
                  numeric
                  value={extraMemberForm.phone}
                  onChange={(e) => setExtraMemberForm({ ...extraMemberForm, phone: e.target.value })}
                />
              </div>
            </div>
          </div>
          <GlassUpload
            label="现场补拍自拍照（如已到头像阶段可直接上传生成电子证）"
            value={extraMemberForm.avatarUrl}
            onChange={(url) => setExtraMemberForm({ ...extraMemberForm, avatarUrl: url })}
          />
          <div className="flex justify-end gap-2">
            <GlassButton variant="secondary" onClick={() => setSimulateScanToken(null)}>
              取消
            </GlassButton>
            <GlassButton type="submit" variant="primary">
              提交加证资料并生成编号
            </GlassButton>
          </div>
        </form>
      </GlassDialog>

      {/* Category Edit Dialog */}
      <GlassDialog
        open={Boolean(catDialog)}
        title={catDialog?.id ? '编辑证件类别' : '新增自定义证件类别'}
        onClose={() => setCatDialog(null)}
        maxWidthClass="max-w-md"
      >
        {catDialog && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!user) return;
              try {
                await getApiClient().certificates.saveCategory(currentAct.id, catDialog, user);
                pushToast({ tone: 'success', title: `证件类别「${catDialog.name}」已保存` });
                setCatDialog(null);
                await loadData();
              } catch (err) {
                pushToast({
                  tone: 'error',
                  title: err instanceof Error ? err.message : '保存失败',
                });
              }
            }}
            className="space-y-4"
          >
            <GlassInput
              label="类别名称"
              required
              value={catDialog.name}
              onChange={(e) => setCatDialog({ ...catDialog, name: e.target.value })}
              placeholder="如：摄影特约证"
            />
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-slate-700">标识颜色</label>
              <input
                type="color"
                value={catDialog.color}
                onChange={(e) => setCatDialog({ ...catDialog, color: e.target.value })}
                className="w-10 h-8 rounded cursor-pointer border border-slate-200"
              />
              <span className="text-xs text-slate-500 numeric-text">{catDialog.color}</span>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={catDialog.enabled}
                onChange={(e) => setCatDialog({ ...catDialog, enabled: e.target.checked })}
                className="w-4 h-4 accent-[#0071e3]"
              />
              启用该证件类别
            </label>
            <div className="flex justify-end gap-2">
              <GlassButton variant="secondary" onClick={() => setCatDialog(null)}>
                取消
              </GlassButton>
              <GlassButton type="submit" variant="primary">
                保存类别
              </GlassButton>
            </div>
          </form>
        )}
      </GlassDialog>

      {/* Member Credential Preview */}
      <GlassDialog
        open={Boolean(previewMember)}
        title="电子工作证件预览"
        onClose={() => setPreviewMember(null)}
        maxWidthClass="max-w-md"
      >
        {previewMember && (
          <ElectronicCredentialCard
            credentialKind="certificate"
            credentialId={previewMember.id}
            activityId={currentAct.id}
            activityName={currentAct.name}
            holderName={previewMember.name}
            code={previewMember.memberCode}
            subtitle={`${categories.find((c) => c.id === previewMember.certificateCategoryId)?.name ?? '展商证'} · ${previewMember.boothNumber} 展位`}
            validDateLabel={formatValidDateRange(previewMember.validDates)}
            statusLabel={CERTIFICATE_STATUS_LABELS[previewMember.status]}
            statusTone={certTone(previewMember.status)}
            avatarUrl={previewMember.avatarUrl}
            activeForQR={
              Boolean(previewMember.avatarUrl) &&
              (previewMember.status === 'credential_generated' ||
                previewMember.status === 'badge_claimed')
            }
          />
        )}
      </GlassDialog>
    </PageContainer>
  );
}
