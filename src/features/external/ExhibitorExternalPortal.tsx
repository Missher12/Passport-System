import React, { useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Download,
  KeyRound,
  LogOut,
  QrCode,
  ShieldCheck,
  Upload,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import {
  GlassButton,
  GlassCard,
  GlassInput,
  GlassSelect,
  GlassTabs,
  PageHeader,
  StatusIndicator,
} from '../../components/glass/GlassPrimitives';
import { GlassDialog, GlassUpload, SmartCaptchaModal } from '../../components/glass/GlassOverlay';
import { PageContainer } from '../../components/layout/PageContainer';
import { ElectronicCredentialCard, formatValidDateRange } from '../../components/qr/GlassQRCode';
import { getApiClient } from '../../services/api';
import {
  CERTIFICATE_STATUS_LABELS,
  COUNTRY_CODES,
  ID_TYPE_LABELS,
  buildCsvDownloadContent,
  normalizeIdentityKey,
  parseMemberImportCsv,
  resolveExhibitorPortalPhase,
} from '../../utils/stateMachines';
import type {
  BatchImportRowPreview,
  CaptchaChallenge,
  CertificateCategory,
  Exhibitor,
  ExhibitorMember,
  IdType,
} from '../../types/domain';

const COUNTRY_CODE_OPTIONS = COUNTRY_CODES.map((c) => ({
  value: c.code,
  label: `${c.code} ${c.label}`,
  shortLabel: c.code,
}));

export function ExhibitorExternalPortal() {
  const { activeActivity, activities, externalContext, realtimeVersion, pushToast } = useApp();
  const currentAct = activeActivity ?? activities[0] ?? null;

  const [entryMode, setEntryMode] = useState<'verify' | 'onsite_extra'>(
    externalContext.onsiteExtraToken ? 'onsite_extra' : 'verify',
  );
  const [verifiedExhibitor, setVerifiedExhibitor] = useState<Exhibitor | null>(null);
  const [members, setMembers] = useState<ExhibitorMember[]>([]);
  const [categories, setCategories] = useState<CertificateCategory[]>([]);
  const [spaceTab, setSpaceTab] = useState<'register' | 'avatar' | 'batch'>('register');

  const [verifyForm, setVerifyForm] = useState({
    boothNumber: externalContext.exhibitorPrefillBooth || '',
    boothName: '',
    primaryContactName: '',
    primaryIdType: 'cn_id' as IdType,
    primaryIdNumber: '',
    countryCode: '+86',
    phone: '',
    businessPassword: '',
    independentToken: externalContext.exhibitorToken || '',
  });
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [captchaChallenge, setCaptchaChallenge] = useState<CaptchaChallenge | null>(null);

  const [memberForm, setMemberForm] = useState({
    name: '',
    idType: 'cn_id' as IdType,
    idNumber: '',
    countryCode: '+86',
    phone: '',
    roleNote: '',
  });
  const [submittingMember, setSubmittingMember] = useState(false);

  const [csvText, setCsvText] = useState('姓名,证件类型,证件号码,国际区号,联系电话,岗位说明\n');
  const [csvPreview, setCsvPreview] = useState<BatchImportRowPreview[]>([]);

  const [avatarTarget, setAvatarTarget] = useState<ExhibitorMember | null>(null);
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState('');
  const [badgeMember, setBadgeMember] = useState<ExhibitorMember | null>(null);

  const [extraTokenInput, setExtraTokenInput] = useState(externalContext.onsiteExtraToken || '');
  const [extraForm, setExtraForm] = useState({
    name: '',
    idType: 'cn_id' as IdType,
    idNumber: '',
    countryCode: '+86',
    phone: '',
    avatarUrl: '',
  });
  const [extraCreatedMember, setExtraCreatedMember] = useState<ExhibitorMember | null>(null);

  // Auto-sync entry mode & prefill when externalContext changes (URL params or admin link)
  useEffect(() => {
    if (externalContext.onsiteExtraToken) {
      setEntryMode('onsite_extra');
      setExtraTokenInput(externalContext.onsiteExtraToken);
    } else {
      setEntryMode('verify');
      setVerifyForm((prev) => ({
        ...prev,
        boothNumber: externalContext.exhibitorPrefillBooth ?? prev.boothNumber,
        independentToken: externalContext.exhibitorToken ?? '',
      }));
    }
  }, [
    externalContext.onsiteExtraToken,
    externalContext.exhibitorPrefillBooth,
    externalContext.exhibitorToken,
  ]);

  const portalPhase = currentAct
    ? resolveExhibitorPortalPhase(currentAct.timeWindows, getApiClient().realtime.getNowMs())
    : 'registration';

  useEffect(() => {
    if (portalPhase === 'avatar') {
      setSpaceTab('avatar');
    } else {
      setSpaceTab('register');
    }
  }, [portalPhase, verifiedExhibitor?.id]);

  const loadExhibitorMembers = async (ex: Exhibitor) => {
    if (!currentAct) return;
    const api = getApiClient();
    const [mem, cats] = await Promise.all([
      api.members.list(currentAct.id, { exhibitorId: ex.id }),
      api.certificates.listCategories(currentAct.id),
    ]);
    setMembers(mem);
    setCategories(cats);
    const existingKeys = new Set(
      mem.filter((m) => m.status !== 'voided').map((m) => normalizeIdentityKey(m.idType, m.idNumber)),
    );
    const remaining = Math.max(
      0,
      ex.quota - mem.filter((m) => !m.isOnsiteExtra && m.status !== 'voided').length,
    );
    setCsvPreview(parseMemberImportCsv(csvText, existingKeys, remaining));
  };

  useEffect(() => {
    if (verifiedExhibitor) {
      loadExhibitorMembers(verifiedExhibitor);
    }
  }, [verifiedExhibitor?.id, realtimeVersion]);

  if (!currentAct) return null;

  const runVerify = async (captchaToken?: string) => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await getApiClient().exhibitors.verifySevenFields(
        {
          activityId: currentAct.id,
          boothNumber: verifyForm.boothNumber,
          boothName: verifyForm.boothName,
          primaryContactName: verifyForm.primaryContactName,
          primaryIdType: verifyForm.primaryIdType,
          primaryIdNumber: verifyForm.primaryIdNumber,
          countryCode: verifyForm.countryCode,
          phone: verifyForm.phone,
          businessPassword: verifyForm.businessPassword,
          independentToken: verifyForm.independentToken || undefined,
        },
        captchaToken,
      );
      setVerifiedExhibitor(res.exhibitor);
      await loadExhibitorMembers(res.exhibitor);
      pushToast({
        tone: 'success',
        title: `已进入 ${res.exhibitor.boothNumber} ${res.exhibitor.boothName}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '验证失败';
      if (msg === 'CAPTCHA_REQUIRED') {
        const challenge = await getApiClient().captcha.assessRisk(
          'high_risk_demo',
          `verify:${currentAct.id}:${verifyForm.boothNumber}`,
        );
        setCaptchaChallenge(challenge);
      } else {
        setVerifyError(msg);
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifiedExhibitor) return;
    setSubmittingMember(true);
    try {
      const created = await getApiClient().members.addMember(
        {
          activityId: currentAct.id,
          exhibitorId: verifiedExhibitor.id,
          name: memberForm.name,
          idType: memberForm.idType,
          idNumber: memberForm.idNumber,
          countryCode: memberForm.countryCode,
          phone: memberForm.phone,
          customFields: memberForm.roleNote ? { 展位岗位: memberForm.roleNote } : {},
        },
        {
          id: `ext-${verifiedExhibitor.id}`,
          name: verifiedExhibitor.primaryContactName,
          role: '外部展商',
        },
      );
      setMemberForm({
        name: '',
        idType: 'cn_id',
        idNumber: '',
        countryCode: '+86',
        phone: '',
        roleNote: '',
      });
      pushToast({
        tone: 'success',
        title: `人员已登记：${created.memberCode} ${created.name}`,
      });
      await loadExhibitorMembers(verifiedExhibitor);
    } catch (err) {
      pushToast({
        tone: 'error',
        title: '无法新增人员',
        detail: err instanceof Error ? err.message : '请检查名额与填写格式',
      });
    } finally {
      setSubmittingMember(false);
    }
  };

  const handleUploadAvatarConfirm = async () => {
    if (!verifiedExhibitor || !avatarTarget || !pendingAvatarUrl) return;
    try {
      const updated = await getApiClient().members.uploadAvatar(
        currentAct.id,
        avatarTarget.id,
        pendingAvatarUrl,
        {
          id: `ext-${verifiedExhibitor.id}`,
          name: verifiedExhibitor.primaryContactName,
          role: '外部展商',
        },
      );
      setAvatarTarget(null);
      setPendingAvatarUrl('');
      pushToast({
        tone: 'success',
        title: `${updated.memberCode} ${updated.name} 头像已上传`,
      });
      await loadExhibitorMembers(verifiedExhibitor);
    } catch (err) {
      pushToast({ tone: 'error', title: err instanceof Error ? err.message : '上传失败' });
    }
  };

  const handleOnsiteExtraSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await getApiClient().certificates.submitOnsiteExtraMember(
        extraTokenInput,
        extraForm,
      );
      setExtraCreatedMember(res.member);
      pushToast({
        tone: 'success',
        title: `加证登记成功：${res.member.memberCode}`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: '提交失败',
        detail: err instanceof Error ? err.message : '请确认现场加证码有效',
      });
    }
  };

  if (!verifiedExhibitor) {
    return (
      <PageContainer className="space-y-6">
        <PageHeader
          title={entryMode === 'onsite_extra' ? '现场加证登记' : '展商登记'}
        />

        {entryMode === 'verify' ? (
          <GlassCard elevated padding="lg" className="space-y-5">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-900/[0.07]">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#0071e3]" />
                展商身份验证
              </h2>
              <button
                type="button"
                onClick={() => setEntryMode('onsite_extra')}
                className="text-xs font-medium text-[#0071e3] hover:text-[#005bb8] cursor-pointer"
              >
                现场加证码入口 →
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                runVerify();
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <GlassInput
                  label="摊位号"
                  required
                  numeric
                  value={verifyForm.boothNumber}
                  onChange={(e) => setVerifyForm({ ...verifyForm, boothNumber: e.target.value })}
                  placeholder="输入摊位号"
                />
                <GlassInput
                  label="展位名称"
                  required
                  value={verifyForm.boothName}
                  onChange={(e) => setVerifyForm({ ...verifyForm, boothName: e.target.value })}
                  placeholder="输入完整展位名称"
                />
                <GlassInput
                  label="主要联系人姓名"
                  required
                  value={verifyForm.primaryContactName}
                  onChange={(e) =>
                    setVerifyForm({ ...verifyForm, primaryContactName: e.target.value })
                  }
                />
                <GlassSelect
                  label="证件类型"
                  value={verifyForm.primaryIdType}
                  onValueChange={(val) =>
                    setVerifyForm({ ...verifyForm, primaryIdType: val as IdType })
                  }
                  options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                />
                <GlassInput
                  label="证件号码"
                  required
                  numeric
                  value={verifyForm.primaryIdNumber}
                  onChange={(e) =>
                    setVerifyForm({ ...verifyForm, primaryIdNumber: e.target.value })
                  }
                />
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <GlassSelect
                    label="区号"
                    searchable
                    value={verifyForm.countryCode}
                    onValueChange={(val) => setVerifyForm({ ...verifyForm, countryCode: val })}
                    options={COUNTRY_CODE_OPTIONS}
                  />
                  <GlassInput
                    label="联系电话"
                    required
                    numeric
                    value={verifyForm.phone}
                    onChange={(e) => setVerifyForm({ ...verifyForm, phone: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <GlassInput
                    label="商务密码"
                    required
                    numeric
                    value={verifyForm.businessPassword}
                    onChange={(e) =>
                      setVerifyForm({ ...verifyForm, businessPassword: e.target.value })
                    }
                    placeholder="输入管理员发放的商务密码"
                  />
                </div>
              </div>

              {verifyError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  {verifyError}
                </div>
              )}

              <GlassButton
                type="submit"
                variant="primary"
                size="lg"
                loading={verifying}
                className="w-full"
              >
                <ShieldCheck className="w-4 h-4" />
                验证并进入展商空间
              </GlassButton>
            </form>
          </GlassCard>
        ) : (
          <GlassCard elevated padding="lg" className="space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-900/[0.07]">
              <h2 className="text-base font-semibold text-slate-900">填写新增人员信息</h2>
              {!externalContext.onsiteExtraToken && (
                <button
                  type="button"
                  onClick={() => setEntryMode('verify')}
                  className="text-xs font-medium text-[#0071e3] hover:text-[#005bb8] cursor-pointer"
                >
                  ← 返回展商验证
                </button>
              )}
            </div>

            {extraCreatedMember ? (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="w-10 h-10 text-[#15803d] mx-auto" />
                <p className="text-base font-semibold text-slate-900">
                  登记成功：
                  <span className="text-[#0071e3] order-number ml-1.5">
                    {extraCreatedMember.memberCode}
                  </span>{' '}
                  {extraCreatedMember.name}
                </p>
                <ElectronicCredentialCard
                  credentialKind="certificate"
                  credentialId={extraCreatedMember.id}
                  activityId={currentAct.id}
                  activityName={currentAct.name}
                  holderName={extraCreatedMember.name}
                  code={extraCreatedMember.memberCode}
                  subtitle={`${extraCreatedMember.boothNumber} 展位 · 现场新增`}
                  validDateLabel={formatValidDateRange(extraCreatedMember.validDates)}
                  statusLabel={CERTIFICATE_STATUS_LABELS[extraCreatedMember.status]}
                  statusTone={extraCreatedMember.avatarUrl ? 'success' : 'warning'}
                  avatarUrl={extraCreatedMember.avatarUrl}
                  activeForQR={Boolean(extraCreatedMember.avatarUrl)}
                />
              </div>
            ) : (
              <form onSubmit={handleOnsiteExtraSubmit} className="space-y-4">
                <GlassInput
                  label="现场加证码"
                  required
                  numeric
                  value={extraTokenInput}
                  onChange={(e) => setExtraTokenInput(e.target.value)}
                  placeholder="输入工作人员签发的加证码"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <GlassInput
                    label="姓名"
                    required
                    value={extraForm.name}
                    onChange={(e) => setExtraForm({ ...extraForm, name: e.target.value })}
                  />
                  <GlassSelect
                    label="证件类型"
                    value={extraForm.idType}
                    onValueChange={(val) =>
                      setExtraForm({ ...extraForm, idType: val as IdType })
                    }
                    options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({
                      value: v,
                      label: l,
                    }))}
                  />
                  <GlassInput
                    label="证件号码"
                    required
                    numeric
                    value={extraForm.idNumber}
                    onChange={(e) => setExtraForm({ ...extraForm, idNumber: e.target.value })}
                  />
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <GlassSelect
                      label="区号"
                      searchable
                      value={extraForm.countryCode}
                      onValueChange={(val) => setExtraForm({ ...extraForm, countryCode: val })}
                      options={COUNTRY_CODE_OPTIONS}
                    />
                    <GlassInput
                      label="联系电话"
                      required
                      numeric
                      value={extraForm.phone}
                      onChange={(e) => setExtraForm({ ...extraForm, phone: e.target.value })}
                    />
                  </div>
                </div>
                <GlassUpload
                  label="正面自拍"
                  value={extraForm.avatarUrl}
                  onChange={(url) => setExtraForm({ ...extraForm, avatarUrl: url })}
                />
                <GlassButton type="submit" variant="primary" size="lg" className="w-full">
                  提交登记
                </GlassButton>
              </form>
            )}
          </GlassCard>
        )}

        <SmartCaptchaModal
          open={Boolean(captchaChallenge)}
          challenge={captchaChallenge}
          onClose={() => setCaptchaChallenge(null)}
          onVerified={(token) => {
            setCaptchaChallenge(null);
            runVerify(token);
          }}
        />
      </PageContainer>
    );
  }

  const normalUsed = members.filter((m) => !m.isOnsiteExtra && m.status !== 'voided').length;
  const remainingQuota = Math.max(0, verifiedExhibitor.quota - normalUsed);
  const avatarDoneCount = members.filter((m) => Boolean(m.avatarUrl)).length;

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title={`${verifiedExhibitor.boothNumber} · ${verifiedExhibitor.boothName}`}
        subtitle={`主联系人：${verifiedExhibitor.primaryContactName}`}
        actions={
          <GlassButton variant="secondary" onClick={() => setVerifiedExhibitor(null)}>
            <LogOut className="w-4 h-4" />
            退出
          </GlassButton>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassCard className="min-w-0">
          <p className="text-xs text-slate-500">当前阶段</p>
          <p className="text-base font-semibold text-slate-900 mt-1">
            {portalPhase === 'avatar' ? '头像补充' : '人员登记'}
          </p>
        </GlassCard>
        <GlassCard className="min-w-0">
          <p className="text-xs text-slate-500">申请名额</p>
          <p className="text-2xl font-semibold text-slate-900 stat-number mt-1">
            {normalUsed} / {verifiedExhibitor.quota}
          </p>
          <p className="text-xs text-slate-500 mt-1 numeric-text">
            剩余 {remainingQuota} 人 · 加证 {verifiedExhibitor.onsiteExtraCount} 人
          </p>
        </GlassCard>
        <GlassCard className="min-w-0">
          <p className="text-xs text-slate-500">已上传头像</p>
          <p className="text-2xl font-semibold text-slate-900 stat-number mt-1">
            {avatarDoneCount} / {members.length}
          </p>
        </GlassCard>
      </div>

      <GlassTabs
        value={spaceTab}
        onChange={setSpaceTab}
        tabs={[
          { id: 'register', label: '人员登记' },
          { id: 'avatar', label: '头像与电子证件' },
          { id: 'batch', label: '批量导入' },
        ]}
      />

      {spaceTab === 'register' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <GlassCard className="lg:col-span-5 space-y-4 min-w-0">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#0071e3]" />
              新增人员
            </h2>
            {remainingQuota === 0 ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                常规名额已满（{verifiedExhibitor.quota} 人），如需增员请联系现场工作人员。
              </div>
            ) : (
              <form onSubmit={handleAddMember} className="space-y-3.5">
                <GlassInput
                  label="人员姓名"
                  required
                  value={memberForm.name}
                  onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                />
                <GlassSelect
                  label="证件类型"
                  value={memberForm.idType}
                  onValueChange={(val) => setMemberForm({ ...memberForm, idType: val as IdType })}
                  options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                />
                <GlassInput
                  label="证件号码"
                  required
                  numeric
                  value={memberForm.idNumber}
                  onChange={(e) => setMemberForm({ ...memberForm, idNumber: e.target.value })}
                />
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <GlassSelect
                    label="区号"
                    searchable
                    value={memberForm.countryCode}
                    onValueChange={(val) => setMemberForm({ ...memberForm, countryCode: val })}
                    options={COUNTRY_CODE_OPTIONS}
                  />
                  <GlassInput
                    label="联系电话"
                    required
                    numeric
                    value={memberForm.phone}
                    onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                  />
                </div>
                <GlassInput
                  label="展位岗位（选填）"
                  value={memberForm.roleNote}
                  onChange={(e) => setMemberForm({ ...memberForm, roleNote: e.target.value })}
                />
                <GlassButton
                  type="submit"
                  variant="primary"
                  loading={submittingMember}
                  className="w-full"
                >
                  提交人员资料
                </GlassButton>
              </form>
            )}
          </GlassCard>

          <GlassCard className="lg:col-span-7 space-y-3 min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              已登记名单（<span className="numeric-text">{members.length}</span> 人）
            </h2>
            <div className="divide-y divide-slate-900/[0.06]">
              {members.map((m) => (
                <div key={m.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      <span className="text-[#0071e3] order-number mr-2">{m.memberCode}</span>
                      {m.name}
                      {m.isPrimaryContact && (
                        <span className="ml-2 text-[11px] text-slate-500">主联系人</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 phone-number mt-0.5">
                      {ID_TYPE_LABELS[m.idType]} · {m.countryCode} {m.phone}
                    </div>
                  </div>
                  <StatusIndicator
                    tone={m.avatarUrl ? 'success' : 'warning'}
                    label={CERTIFICATE_STATUS_LABELS[m.status]}
                  />
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {spaceTab === 'avatar' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {members.map((m) => (
            <GlassCard key={m.id} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-200 border border-white shrink-0 flex items-center justify-center text-xs text-slate-400">
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" />
                  ) : (
                    '待补拍'
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    <span className="text-[#0071e3] order-number mr-1.5">{m.memberCode}</span>
                    {m.name}
                  </div>
                  <StatusIndicator
                    tone={m.avatarUrl ? 'success' : 'warning'}
                    label={CERTIFICATE_STATUS_LABELS[m.status]}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <GlassButton
                  size="sm"
                  variant={m.avatarUrl ? 'secondary' : 'primary'}
                  onClick={() => {
                    setAvatarTarget(m);
                    setPendingAvatarUrl(m.avatarUrl || '');
                  }}
                >
                  <Camera className="w-3.5 h-3.5" />
                  {m.avatarUrl ? '替换照片' : '上传头像'}
                </GlassButton>
                <GlassButton size="sm" variant="ghost" onClick={() => setBadgeMember(m)}>
                  <QrCode className="w-3.5 h-3.5" />
                  电子证件
                </GlassButton>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {spaceTab === 'batch' && (
        <GlassCard className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#0071e3]" />
              批量导入（剩余 <span className="numeric-text">{remainingQuota}</span> 人）
            </h2>
            <GlassButton
              size="sm"
              variant="secondary"
              onClick={() => {
                const content = buildCsvDownloadContent(
                  ['姓名', '证件类型', '证件号码', '国际区号', '联系电话', '岗位说明'],
                  [['示例成员', '居民身份证', '440106199708120044', '+86', '13800138111', '展台接待']],
                );
                const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${verifiedExhibitor.boothNumber}-member-template.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="w-3.5 h-3.5" />
              下载模板
            </GlassButton>
          </div>

          <textarea
            rows={5}
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              const existingKeys = new Set(
                members
                  .filter((m) => m.status !== 'voided')
                  .map((m) => normalizeIdentityKey(m.idType, m.idNumber)),
              );
              setCsvPreview(parseMemberImportCsv(e.target.value, existingKeys, remainingQuota));
            }}
            className="glass-input w-full p-3 text-xs numeric-text"
            placeholder="粘贴 CSV 内容..."
          />

          {csvPreview.length > 0 && (
            <div className="space-y-1.5">
              {csvPreview.map((r) => (
                <div
                  key={r.rowNumber}
                  className={`p-2.5 rounded-xl text-xs flex flex-wrap justify-between gap-2 ${
                    r.valid ? 'bg-emerald-50/80 text-emerald-950' : 'bg-red-50/80 text-red-900'
                  }`}
                >
                  <span className="numeric-text">
                    第 {r.rowNumber} 行 · {r.name} · {r.idNumber} · {r.countryCode} {r.phone}
                  </span>
                  <span>{r.valid ? '校验通过' : r.errors.join('；')}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <GlassButton
              variant="primary"
              disabled={csvPreview.filter((r) => r.valid).length === 0}
              onClick={async () => {
                const res = await getApiClient().members.batchImport(
                  currentAct.id,
                  verifiedExhibitor.id,
                  csvPreview,
                  {
                    id: `ext-${verifiedExhibitor.id}`,
                    name: verifiedExhibitor.primaryContactName,
                    role: '外部展商',
                  },
                );
                pushToast({
                  tone: 'success',
                  title: `已导入 ${res.imported.length} 人`,
                  detail: res.skippedCount > 0 ? `已跳过 ${res.skippedCount} 行异常数据` : undefined,
                });
                await loadExhibitorMembers(verifiedExhibitor);
              }}
            >
              确认导入（{csvPreview.filter((r) => r.valid).length} 人）
            </GlassButton>
          </div>
        </GlassCard>
      )}

      <GlassDialog
        open={Boolean(avatarTarget)}
        title={`上传头像：${avatarTarget?.memberCode ?? ''} ${avatarTarget?.name ?? ''}`}
        onClose={() => setAvatarTarget(null)}
        maxWidthClass="max-w-lg"
      >
        <div className="space-y-4">
          <GlassUpload value={pendingAvatarUrl} onChange={setPendingAvatarUrl} />
          <div className="flex justify-end gap-2">
            <GlassButton variant="secondary" onClick={() => setAvatarTarget(null)}>
              取消
            </GlassButton>
            <GlassButton
              variant="primary"
              disabled={!pendingAvatarUrl}
              onClick={handleUploadAvatarConfirm}
            >
              保存并生成电子证件
            </GlassButton>
          </div>
        </div>
      </GlassDialog>

      <GlassDialog
        open={Boolean(badgeMember)}
        title="电子工作证件"
        onClose={() => setBadgeMember(null)}
        maxWidthClass="max-w-md"
      >
        {badgeMember && (
          <ElectronicCredentialCard
            credentialKind="certificate"
            credentialId={badgeMember.id}
            activityId={currentAct.id}
            activityName={currentAct.name}
            holderName={badgeMember.name}
            code={badgeMember.memberCode}
            subtitle={`${categories.find((c) => c.id === badgeMember.certificateCategoryId)?.name ?? '展商证'} · ${badgeMember.boothNumber} 展位`}
            validDateLabel={formatValidDateRange(badgeMember.validDates)}
            statusLabel={CERTIFICATE_STATUS_LABELS[badgeMember.status]}
            statusTone={badgeMember.avatarUrl ? 'success' : 'warning'}
            avatarUrl={badgeMember.avatarUrl}
            activeForQR={
              Boolean(badgeMember.avatarUrl) &&
              (badgeMember.status === 'credential_generated' ||
                badgeMember.status === 'badge_claimed')
            }
          />
        )}
      </GlassDialog>
    </PageContainer>
  );
}
