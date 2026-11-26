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

export function ExhibitorExternalPortal() {
  const { activeActivity, activities, externalContext, realtimeVersion, pushToast } = useApp();
  const currentAct = activeActivity ?? activities[0] ?? null;

  // Mode: standard 7-field login OR onsite extra token fill
  const [entryMode, setEntryMode] = useState<'verify' | 'onsite_extra'>(
    externalContext.onsiteExtraToken ? 'onsite_extra' : 'verify',
  );
  const [verifiedExhibitor, setVerifiedExhibitor] = useState<Exhibitor | null>(null);
  const [members, setMembers] = useState<ExhibitorMember[]>([]);
  const [categories, setCategories] = useState<CertificateCategory[]>([]);
  const [spaceTab, setSpaceTab] = useState<'register' | 'avatar' | 'batch'>('register');

  // 7-field verification state
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

  // Add member form (Phase 1: no selfie)
  const [memberForm, setMemberForm] = useState({
    name: '',
    idType: 'cn_id' as IdType,
    idNumber: '',
    countryCode: '+86',
    phone: '',
    roleNote: '',
  });
  const [submittingMember, setSubmittingMember] = useState(false);

  // Batch import
  const [csvText, setCsvText] = useState(
    '姓名,证件类型,证件号码,国际区号,联系电话,岗位说明\n方晓悦,居民身份证,440106199708120044,+86,13800138111,展台接待',
  );
  const [csvPreview, setCsvPreview] = useState<BatchImportRowPreview[]>([]);

  // Avatar upload modal & E-Badge preview
  const [avatarTarget, setAvatarTarget] = useState<ExhibitorMember | null>(null);
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState('');
  const [badgeMember, setBadgeMember] = useState<ExhibitorMember | null>(null);

  // Onsite extra token form
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

  const prefillDemoA01 = () => {
    setVerifyForm({
      boothNumber: 'A01',
      boothName: '星火次元文化',
      primaryContactName: '陈明轩',
      primaryIdType: 'cn_id',
      primaryIdNumber: '440106199205180019',
      countryCode: '+86',
      phone: '13800138001',
      businessPassword: 'YH-2027-8842',
      independentToken: '',
    });
    setVerifyError(null);
  };

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
        title: `身份验证通过：${res.exhibitor.boothNumber} ${res.exhibitor.boothName}`,
        detail: res.isMockDemo ? '已进入展商专属隔离空间（演示验证）' : '已进入展商专属空间',
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
        title: `人员登记成功：${created.memberCode} ${created.name}`,
        detail: '第一阶段无需上传自拍，到达头像开放日后可独立补拍（演示结果）',
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
        title: `${updated.memberCode} ${updated.name} 自拍上传成功`,
        detail: '已自动生成个人电子证件，可立即出示动态二维码（演示结果）',
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
        title: `现场加证登记成功：${res.member.memberCode}`,
        detail: '一次性加证码已自动失效（演示结果）',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: '现场加证提交失败',
        detail: err instanceof Error ? err.message : '请确认一次性加证码有效',
      });
    }
  };

  // === Unauthenticated View: 7-Field Verification OR One-Time Onsite Extra Form ===
  if (!verifiedExhibitor) {
    return (
      <PageContainer className="space-y-6">
        <PageHeader
          title="外部展商证件入口"
          subtitle={`${currentAct.name} · ${
            portalPhase === 'avatar'
              ? '头像补充阶段'
              : portalPhase === 'registration'
                ? '人员登记阶段'
                : '通道未开放'
          }`}
        />

        <GlassTabs
          value={entryMode}
          onChange={setEntryMode}
          tabs={[
            { id: 'verify', label: '展商信息验证' },
            { id: 'onsite_extra', label: '现场加证码' },
          ]}
        />

        {entryMode === 'verify' ? (
          <GlassCard elevated padding="lg" className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-900/[0.07]">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#0071e3]" />
                {verifyForm.independentToken
                  ? `独立链接验证（${verifyForm.independentToken}）`
                  : '展商 7 项信息核验'}
              </h2>
              <GlassButton size="sm" variant="secondary" onClick={prefillDemoA01}>
                填充演示展商 A01
              </GlassButton>
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
                  label="1. 摊位号"
                  required
                  numeric
                  value={verifyForm.boothNumber}
                  onChange={(e) => setVerifyForm({ ...verifyForm, boothNumber: e.target.value })}
                  placeholder="例如：A01"
                />
                <GlassInput
                  label="2. 展位名称"
                  required
                  value={verifyForm.boothName}
                  onChange={(e) => setVerifyForm({ ...verifyForm, boothName: e.target.value })}
                  placeholder="请输入完整展位名称"
                />
                <GlassInput
                  label="3. 主要联系人姓名"
                  required
                  value={verifyForm.primaryContactName}
                  onChange={(e) =>
                    setVerifyForm({ ...verifyForm, primaryContactName: e.target.value })
                  }
                />
                <GlassSelect
                  label="4. 主要联系人证件类型"
                  value={verifyForm.primaryIdType}
                  onChange={(e) =>
                    setVerifyForm({ ...verifyForm, primaryIdType: e.target.value as IdType })
                  }
                  options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                />
                <GlassInput
                  label="5. 主要联系人证件号码"
                  required
                  numeric
                  value={verifyForm.primaryIdNumber}
                  onChange={(e) =>
                    setVerifyForm({ ...verifyForm, primaryIdNumber: e.target.value })
                  }
                />
                <div className="grid grid-cols-5 gap-2">
                  <div className="col-span-2">
                    <GlassSelect
                      label="6. 区号"
                      value={verifyForm.countryCode}
                      onChange={(e) =>
                        setVerifyForm({ ...verifyForm, countryCode: e.target.value })
                      }
                      options={COUNTRY_CODES.map((c) => ({ value: c.code, label: c.code }))}
                    />
                  </div>
                  <div className="col-span-3">
                    <GlassInput
                      label="联系电话"
                      required
                      numeric
                      value={verifyForm.phone}
                      onChange={(e) => setVerifyForm({ ...verifyForm, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <GlassInput
                    label="7. 唯一商务密码"
                    required
                    numeric
                    value={verifyForm.businessPassword}
                    onChange={(e) =>
                      setVerifyForm({ ...verifyForm, businessPassword: e.target.value })
                    }
                    placeholder="管理员发放的唯一商务密码（如 YH-2027-8842）"
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
                核验身份并进入展商空间
              </GlassButton>
            </form>
          </GlassCard>
        ) : (
          <GlassCard elevated padding="lg" className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900">现场超额加证登记（一次性二维码）</h2>
            {extraCreatedMember ? (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="w-10 h-10 text-[#15803d] mx-auto" />
                <p className="text-base font-semibold text-slate-900">
                  已成功登记现场新增人员：<span className="text-[#0071e3] order-number">{extraCreatedMember.memberCode}</span>{' '}
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
                  label="一次性现场加证码"
                  required
                  numeric
                  value={extraTokenInput}
                  onChange={(e) => setExtraTokenInput(e.target.value)}
                  placeholder="扫描或输入现场工作人员签发的 EXTRA-... 编码"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <GlassInput
                    label="本人姓名"
                    required
                    value={extraForm.name}
                    onChange={(e) => setExtraForm({ ...extraForm, name: e.target.value })}
                  />
                  <GlassSelect
                    label="证件类型"
                    value={extraForm.idType}
                    onChange={(e) =>
                      setExtraForm({ ...extraForm, idType: e.target.value as IdType })
                    }
                    options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                  />
                  <GlassInput
                    label="证件号码"
                    required
                    numeric
                    value={extraForm.idNumber}
                    onChange={(e) => setExtraForm({ ...extraForm, idNumber: e.target.value })}
                  />
                  <GlassInput
                    label="联系电话"
                    required
                    numeric
                    value={extraForm.phone}
                    onChange={(e) => setExtraForm({ ...extraForm, phone: e.target.value })}
                  />
                </div>
                <GlassUpload
                  label="本人正面自拍照"
                  value={extraForm.avatarUrl}
                  onChange={(url) => setExtraForm({ ...extraForm, avatarUrl: url })}
                />
                <GlassButton type="submit" variant="primary" size="lg" className="w-full">
                  提交现场加证资料
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

  // === Authenticated Exhibitor Private Workspace ===
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
            退出展商空间
          </GlassButton>
        }
      />

      {/* Phase Status & Quota Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassCard className="min-w-0">
          <p className="text-xs text-slate-500">当前开放阶段</p>
          <p className="text-base font-semibold text-slate-900 mt-1">
            {portalPhase === 'avatar' ? '证件头像补充阶段' : '人员资料登记阶段'}
          </p>
        </GlassCard>
        <GlassCard className="min-w-0">
          <p className="text-xs text-slate-500">申请名额使用情况</p>
          <p className="text-2xl font-semibold text-slate-900 stat-number mt-1">
            {normalUsed} / {verifiedExhibitor.quota}
          </p>
          <p className="text-xs text-slate-500 mt-1 numeric-text">
            剩余 {remainingQuota} 人 · 现场加证 {verifiedExhibitor.onsiteExtraCount} 人
          </p>
        </GlassCard>
        <GlassCard className="min-w-0">
          <p className="text-xs text-slate-500">已完成自拍</p>
          <p className="text-2xl font-semibold text-slate-900 stat-number mt-1">
            {avatarDoneCount} / {members.length}
          </p>
        </GlassCard>
      </div>

      <GlassTabs
        value={spaceTab}
        onChange={setSpaceTab}
        tabs={[
          { id: 'register', label: '人员资料登记与名单', count: members.length },
          {
            id: 'avatar',
            label: '证件头像补充与电子证件',
            count: members.filter((m) => !m.avatarUrl).length,
          },
          { id: 'batch', label: 'Excel / CSV 批量导入' },
        ]}
      />

      {spaceTab === 'register' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <GlassCard className="lg:col-span-5 space-y-4 min-w-0">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#0071e3]" />
              新增展位人员
            </h2>
            {remainingQuota === 0 ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                常规名额已满（{verifiedExhibitor.quota} 人），如需增员请联系管理员。
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
                  onChange={(e) => setMemberForm({ ...memberForm, idType: e.target.value as IdType })}
                  options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                />
                <GlassInput
                  label="证件号码"
                  required
                  numeric
                  value={memberForm.idNumber}
                  onChange={(e) => setMemberForm({ ...memberForm, idNumber: e.target.value })}
                />
                <div className="grid grid-cols-5 gap-2">
                  <div className="col-span-2">
                    <GlassSelect
                      label="国际区号"
                      value={memberForm.countryCode}
                      onChange={(e) => setMemberForm({ ...memberForm, countryCode: e.target.value })}
                      options={COUNTRY_CODES.map((c) => ({ value: c.code, label: c.code }))}
                    />
                  </div>
                  <div className="col-span-3">
                    <GlassInput
                      label="联系电话"
                      required
                      numeric
                      value={memberForm.phone}
                      onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                    />
                  </div>
                </div>
                <GlassInput
                  label="展位岗位说明（选填）"
                  value={memberForm.roleNote}
                  onChange={(e) => setMemberForm({ ...memberForm, roleNote: e.target.value })}
                />
                <GlassButton
                  type="submit"
                  variant="primary"
                  loading={submittingMember}
                  className="w-full"
                >
                  提交资料并自动分配编号
                </GlassButton>
              </form>
            )}
          </GlassCard>

          <GlassCard className="lg:col-span-7 space-y-3 min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              本展位已登记名单（共 <span className="numeric-text">{members.length}</span> 人）
            </h2>
            <div className="divide-y divide-slate-900/[0.06]">
              {members.map((m) => (
                <div key={m.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      <span className="text-[#0071e3] order-number mr-2">{m.memberCode}</span>
                      {m.name}
                      {m.isPrimaryContact && (
                        <span className="ml-2 text-[11px] text-slate-500">主联系人（自动建档）</span>
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
                  {m.avatarUrl ? '替换照片' : '上传自拍'}
                </GlassButton>
                <GlassButton
                  size="sm"
                  variant="ghost"
                  onClick={() => setBadgeMember(m)}
                >
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
              批量导入人员（剩余名额 <span className="numeric-text">{remainingQuota}</span> 人）
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
              下载 Excel / CSV 模板
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
          />

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
                <span>{r.valid ? '有效，可导入' : r.errors.join('；')}</span>
              </div>
            ))}
          </div>

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
                  title: `批量导入成功 ${res.imported.length} 人`,
                  detail: `跳过异常行 ${res.skippedCount} 行（演示结果）`,
                });
                await loadExhibitorMembers(verifiedExhibitor);
              }}
            >
              确认批量导入（{csvPreview.filter((r) => r.valid).length} 人）
            </GlassButton>
          </div>
        </GlassCard>
      )}

      {/* Avatar Upload Modal */}
      <GlassDialog
        open={Boolean(avatarTarget)}
        title={`补充证件自拍：${avatarTarget?.memberCode ?? ''} ${avatarTarget?.name ?? ''}`}
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
              保存自拍并生成电子证件
            </GlassButton>
          </div>
        </div>
      </GlassDialog>

      {/* Electronic Badge Preview */}
      <GlassDialog
        open={Boolean(badgeMember)}
        title="我的电子工作证件"
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
