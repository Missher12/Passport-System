import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Search,
  ShieldAlert,
  Ticket,
} from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import {
  GlassButton,
  GlassCard,
  GlassInput,
  GlassSelect,
  LoadingState,
  StatusIndicator,
} from '../../components/glass/GlassPrimitives';
import { GlassUpload, SmartCaptchaModal } from '../../components/glass/GlassOverlay';
import { PageContainer } from '../../components/layout/PageContainer';
import { ElectronicCredentialCard } from '../../components/qr/GlassQRCode';
import { getApiClient } from '../../services/api';
import {
  COUNTRY_CODES,
  GIFT_STATUS_LABELS,
  ID_TYPE_LABELS,
  formatDateTimeDisplay,
} from '../../utils/stateMachines';
import type {
  CaptchaChallenge,
  CustomFieldDefinition,
  GiftBatch,
  GiftTicket,
  GiftTicketStatus,
  IdType,
  InvitedTicketMeta,
} from '../../types/domain';

const COUNTRY_CODE_OPTIONS = COUNTRY_CODES.map((c) => ({
  value: c.code,
  label: `${c.code} ${c.label}`,
  shortLabel: c.code,
}));

function giftStatusTone(status: GiftTicketStatus) {
  if (status === 'valid' || status === 'generated') return 'success' as const;
  if (status === 'redeemed') return 'info' as const;
  if (status === 'frozen' || status === 'voided' || status === 'expired') {
    return 'danger' as const;
  }
  return 'warning' as const;
}

function CustomFieldsSection({
  fields,
  values,
  onChange,
}: {
  fields: CustomFieldDefinition[];
  values: Record<string, string>;
  onChange: (label: string, val: string) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="space-y-3.5 pt-2 border-t border-slate-900/[0.06]">
      {fields.map((field) => {
        const type = field.type ?? 'text';
        const val = values[field.label] ?? '';
        const options = field.options ?? [];

        if (type === 'textarea') {
          return (
            <div key={field.id} className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-slate-700">
                {field.label}
                {field.required && <span className="text-red-600 ml-0.5">*</span>}
              </label>
              <textarea
                rows={3}
                required={field.required}
                value={val}
                onChange={(e) => onChange(field.label, e.target.value)}
                placeholder={field.placeholder}
                className="glass-input p-3 text-sm text-slate-900"
              />
            </div>
          );
        }

        if (type === 'select') {
          return (
            <GlassSelect
              key={field.id}
              label={field.label}
              required={field.required}
              value={val}
              onValueChange={(next) => onChange(field.label, next)}
              placeholder="请选择"
              options={options.map((opt) => ({ value: opt, label: opt }))}
            />
          );
        }

        if (type === 'radio') {
          return (
            <div key={field.id} className="space-y-1.5">
              <span className="text-[13px] font-medium text-slate-700 block">
                {field.label}
                {field.required && <span className="text-red-600 ml-0.5">*</span>}
              </span>
              <div className="flex flex-wrap gap-2">
                {options.map((opt) => {
                  const active = val === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => onChange(field.label, opt)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#0071e3] text-white border-[#0071e3]'
                          : 'bg-white/70 text-slate-700 border-slate-900/10 hover:bg-white'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }

        if (type === 'checkbox') {
          const selectedList = val
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          return (
            <div key={field.id} className="space-y-1.5">
              <span className="text-[13px] font-medium text-slate-700 block">
                {field.label}
                {field.required && <span className="text-red-600 ml-0.5">*</span>}
              </span>
              <div className="flex flex-wrap gap-2">
                {options.map((opt) => {
                  const checked = selectedList.includes(opt);
                  return (
                    <label
                      key={opt}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#0071e3]/10 text-[#0071e3] border-[#0071e3]/35'
                          : 'bg-white/70 text-slate-700 border-slate-900/10 hover:bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? selectedList.filter((x) => x !== opt)
                            : [...selectedList, opt];
                          onChange(field.label, next.join(', '));
                        }}
                        className="w-3.5 h-3.5 accent-[#0071e3]"
                      />
                      {opt}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        }

        if (type === 'date') {
          return (
            <GlassInput
              key={field.id}
              label={field.label}
              type="date"
              numeric
              required={field.required}
              value={val}
              onChange={(e) => onChange(field.label, e.target.value)}
            />
          );
        }

        if (type === 'number') {
          return (
            <GlassInput
              key={field.id}
              label={field.label}
              type="number"
              numeric
              required={field.required}
              value={val}
              placeholder={field.placeholder}
              onChange={(e) => onChange(field.label, e.target.value)}
            />
          );
        }

        return (
          <GlassInput
            key={field.id}
            label={field.label}
            required={field.required}
            value={val}
            placeholder={field.placeholder}
            onChange={(e) => onChange(field.label, e.target.value)}
          />
        );
      })}
    </div>
  );
}

export function GiftExternalPortal() {
  const { activeActivity, activities, externalContext, pushToast } = useApp();
  const currentAct = activeActivity ?? activities[0] ?? null;

  const initialMode = externalContext.invitedGiftToken
    ? 'invited'
    : externalContext.giftRetrieveMode
      ? 'retrieve'
      : 'self';

  const [viewMode, setViewMode] = useState<'self' | 'invited' | 'retrieve'>(initialMode);
  const [batches, setBatches] = useState<GiftBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState(externalContext.giftBatchId || '');
  const [issuedTicket, setIssuedTicket] = useState<GiftTicket | null>(null);
  const [retrievedTickets, setRetrievedTickets] = useState<GiftTicket[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // CAPTCHA state
  const [captchaChallenge, setCaptchaChallenge] = useState<CaptchaChallenge | null>(null);
  const [captchaIntent, setCaptchaIntent] = useState<'self' | 'retrieve' | null>(null);

  // Self-claim form state (no hardcoded personal defaults)
  const [form, setForm] = useState({
    name: '',
    idType: 'cn_id' as IdType,
    idNumber: '',
    countryCode: '+86',
    phone: '',
    useDate: '',
    avatarUrl: '',
  });
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  // Invited ticket state (5-field strict identity verification, zero hardcoded defaults)
  const [inviteToken, setInviteToken] = useState(externalContext.invitedGiftToken || '');
  const [inviteMeta, setInviteMeta] = useState<InvitedTicketMeta | null>(null);
  const [loadingInviteMeta, setLoadingInviteMeta] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: '',
    idType: 'cn_id' as IdType,
    idNumber: '',
    countryCode: '+86',
    phone: '',
    useDate: '',
    avatarUrl: '',
  });
  const [inviteCustomValues, setInviteCustomValues] = useState<Record<string, string>>({});

  // Retrieve form state (5-field identity + Smart CAPTCHA)
  const [retrieveForm, setRetrieveForm] = useState({
    name: '',
    idType: 'cn_id' as IdType,
    idNumber: '',
    countryCode: '+86',
    phone: '',
  });

  // Sync mode when externalContext updates
  useEffect(() => {
    setIssuedTicket(null);
    setRetrievedTickets(null);
    setErrorMsg(null);
    if (externalContext.invitedGiftToken) {
      setViewMode('invited');
      setInviteToken(externalContext.invitedGiftToken);
    } else if (externalContext.giftRetrieveMode) {
      setViewMode('retrieve');
    } else {
      setViewMode('self');
    }
  }, [
    externalContext.invitedGiftToken,
    externalContext.giftRetrieveMode,
    externalContext.giftBatchId,
  ]);

  // Load batches for self-claim
  useEffect(() => {
    if (!currentAct) return;
    getApiClient()
      .gifts.listBatches(currentAct.id)
      .then((list) => {
        const activeBatches = list.filter((b) => b.enabled);
        setBatches(activeBatches);
        const initial =
          activeBatches.find((b) => b.id === (externalContext.giftBatchId || selectedBatchId)) ??
          activeBatches[0];
        if (initial) {
          setSelectedBatchId(initial.id);
          setForm((prev) => ({
            ...prev,
            useDate: initial.availableDates[0] || '',
          }));
        }
      });
  }, [currentAct?.id, externalContext.giftBatchId]);

  // Load safe metadata for invited link token
  useEffect(() => {
    if (viewMode !== 'invited' || !inviteToken.trim()) {
      setInviteMeta(null);
      return;
    }
    let mounted = true;
    setLoadingInviteMeta(true);
    getApiClient()
      .tickets.getInvitedTicketMeta(inviteToken.trim())
      .then((meta) => {
        if (!mounted) return;
        setInviteMeta(meta);
        if (meta.availableDates.length > 0) {
          setInviteForm((prev) => ({
            ...prev,
            useDate: meta.availableDates.includes(prev.useDate)
              ? prev.useDate
              : meta.availableDates[0],
          }));
        }
      })
      .catch(() => {
        if (!mounted) return;
        setInviteMeta(null);
      })
      .finally(() => {
        if (mounted) setLoadingInviteMeta(false);
      });
    return () => {
      mounted = false;
    };
  }, [viewMode, inviteToken]);

  if (!currentAct) return null;

  const currentBatch = batches.find((b) => b.id === selectedBatchId) ?? batches[0] ?? null;

  const handleSelectBatch = (batchId: string) => {
    setSelectedBatchId(batchId);
    const b = batches.find((x) => x.id === batchId);
    setForm((prev) => ({ ...prev, useDate: b?.availableDates[0] || '' }));
    setCustomValues({});
    setErrorMsg(null);
  };

  const validateRequiredCustomFields = (
    defs: CustomFieldDefinition[],
    vals: Record<string, string>,
  ): string | null => {
    for (const def of defs) {
      if (def.required && !(vals[def.label] ?? '').trim()) {
        return `请填写必填项：${def.label}`;
      }
    }
    return null;
  };

  const executeSelfClaim = async (captchaToken?: string) => {
    if (!currentBatch) return;
    const cfError = validateRequiredCustomFields(currentBatch.customFields, customValues);
    if (cfError) {
      setErrorMsg(cfError);
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await getApiClient().tickets.selfClaim(
        {
          activityId: currentAct.id,
          batchId: currentBatch.id,
          name: form.name,
          idType: form.idType,
          idNumber: form.idNumber,
          countryCode: form.countryCode,
          phone: form.phone,
          useDate: form.useDate,
          avatarUrl: form.avatarUrl,
          customFields: customValues,
        },
        captchaToken,
      );
      setIssuedTicket(res.ticket);
      pushToast({
        tone: 'success',
        title: `电子赠票已签发：${res.ticket.ticketCode}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '领取失败';
      setErrorMsg(msg);
      pushToast({ tone: 'error', title: '领取未通过', detail: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteInvited = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim()) {
      setErrorMsg('缺少专属邀请码');
      return;
    }
    if (inviteMeta?.customFields?.length) {
      const cfErr = validateRequiredCustomFields(inviteMeta.customFields, inviteCustomValues);
      if (cfErr) {
        setErrorMsg(cfErr);
        return;
      }
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const ticket = await getApiClient().tickets.completeInvitedTicket(inviteToken.trim(), {
        name: inviteForm.name,
        idType: inviteForm.idType,
        idNumber: inviteForm.idNumber,
        countryCode: inviteForm.countryCode,
        phone: inviteForm.phone,
        useDate: inviteForm.useDate,
        avatarUrl: inviteForm.avatarUrl,
        customFields: inviteCustomValues,
      });
      setIssuedTicket(ticket);
      pushToast({
        tone: 'success',
        title: `电子赠票已激活：${ticket.ticketCode}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '核验或激活失败';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const startRetrieveFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setRetrievedTickets(null);
    const challenge = await getApiClient().captcha.assessRisk(
      'high_risk_demo',
      `retrieve:${currentAct.id}:${retrieveForm.phone}`,
    );
    setCaptchaIntent('retrieve');
    setCaptchaChallenge(challenge);
  };

  const executeRetrieveTickets = async (captchaToken: string) => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await getApiClient().tickets.retrieveByIdentity(
        {
          activityId: currentAct.id,
          ...retrieveForm,
        },
        captchaToken,
      );
      setRetrievedTickets(res.tickets);
      pushToast({
        tone: 'success',
        title: `已找回 ${res.tickets.length} 张电子赠票`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '找回失败';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer className="space-y-5">
      {issuedTicket ? (
        <div className="space-y-5">
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[#15803d]">
            <CheckCircle2 className="w-5 h-5" />
            <span>电子赠票已签发 · 有效日期 <span className="date-number">{issuedTicket.useDate}</span></span>
          </div>

          <ElectronicCredentialCard
            credentialKind="gift"
            credentialId={issuedTicket.id}
            activityId={issuedTicket.activityId}
            activityName={currentAct.name}
            holderName={issuedTicket.name}
            code={issuedTicket.ticketCode}
            subtitle={issuedTicket.batchName}
            validDateLabel={issuedTicket.useDate}
            statusLabel={GIFT_STATUS_LABELS[issuedTicket.status]}
            statusTone={giftStatusTone(issuedTicket.status)}
            avatarUrl={issuedTicket.avatarUrl}
            activeForQR={issuedTicket.status === 'valid' || issuedTicket.status === 'generated'}
          />

          <div className="flex justify-center gap-2.5">
            <GlassButton
              variant="secondary"
              onClick={() => {
                setIssuedTicket(null);
                setErrorMsg(null);
                setViewMode('retrieve');
              }}
            >
              找回已领赠票
            </GlassButton>
            <GlassButton
              variant="ghost"
              onClick={() => {
                setIssuedTicket(null);
                setErrorMsg(null);
                setViewMode('self');
              }}
            >
              返回首页
            </GlassButton>
          </div>
        </div>
      ) : viewMode === 'self' ? (
        <GlassCard elevated padding="lg" className="space-y-5">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-900/[0.06]">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-base font-semibold text-slate-900 truncate">
                {currentBatch ? currentBatch.name : '赠票领取'}
              </span>
              {currentBatch && (
                <span className="text-xs text-slate-500 numeric-text shrink-0">
                  余 {Math.max(0, currentBatch.totalQuota - currentBatch.claimedCount)} 张
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setViewMode('retrieve');
                setErrorMsg(null);
                setRetrievedTickets(null);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#0071e3] hover:text-[#005bb8] cursor-pointer shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
              找回已领赠票
            </button>
          </div>

          {!currentBatch ? (
            <div className="text-center py-8 space-y-2">
              <Ticket className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-medium text-slate-800">暂无开放中的赠票批次</p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeSelfClaim();
              }}
              className="space-y-4"
            >
              {!externalContext.giftBatchId && batches.length > 1 && (
                <GlassSelect
                  label="选择赠票批次"
                  value={currentBatch.id}
                  onValueChange={handleSelectBatch}
                  options={batches.map((b) => ({
                    value: b.id,
                    label: `${b.name}（余 ${Math.max(0, b.totalQuota - b.claimedCount)} 张）`,
                  }))}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <GlassInput
                  label="真实姓名"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <GlassSelect
                  label="证件类型"
                  value={form.idType}
                  onValueChange={(val) => setForm({ ...form, idType: val as IdType })}
                  options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                />
                <GlassInput
                  label="证件号码"
                  required
                  numeric
                  value={form.idNumber}
                  onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                />
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <GlassSelect
                    label="区号"
                    searchable
                    value={form.countryCode}
                    onValueChange={(val) => setForm({ ...form, countryCode: val })}
                    options={COUNTRY_CODE_OPTIONS}
                  />
                  <GlassInput
                    label="联系电话"
                    required
                    numeric
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700 block">
                  选择使用日期
                  <span className="text-red-600 ml-0.5">*</span>
                  {currentBatch.availableDates.length === 1 && (
                    <span className="text-slate-400 font-normal ml-2">（已自动选中唯一日期）</span>
                  )}
                </label>
                <div className="flex flex-wrap gap-2">
                  {currentBatch.availableDates.map((d) => {
                    const selected = form.useDate === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setForm({ ...form, useDate: d })}
                        className={`px-3.5 py-2 rounded-xl text-sm font-medium date-number border transition-all cursor-pointer ${
                          selected
                            ? 'bg-[#0071e3] text-white border-[#0071e3] shadow-sm'
                            : 'bg-white/70 text-slate-800 border-slate-900/10 hover:bg-white'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              <CustomFieldsSection
                fields={currentBatch.customFields}
                values={customValues}
                onChange={(label, val) =>
                  setCustomValues((prev) => ({ ...prev, [label]: val }))
                }
              />

              <GlassUpload
                label="本人正面自拍（必填）"
                value={form.avatarUrl}
                onChange={(url) => setForm({ ...form, avatarUrl: url })}
              />

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800">
                  <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">无法领取</p>
                    <p className="mt-0.5">{errorMsg}</p>
                  </div>
                </div>
              )}

              <GlassButton
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
                className="w-full"
              >
                提交并生成电子赠票
              </GlassButton>
            </form>
          )}
        </GlassCard>
      ) : viewMode === 'invited' ? (
        <GlassCard elevated padding="lg" className="space-y-5">
          {loadingInviteMeta ? (
            <LoadingState rows={3} />
          ) : !inviteMeta ? (
            <div className="text-center py-8 space-y-3">
              <ShieldAlert className="w-9 h-9 text-red-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">邀请链接无效或已失效</p>
              <GlassButton variant="secondary" onClick={() => setViewMode('retrieve')}>
                找回已领电子赠票
              </GlassButton>
            </div>
          ) : inviteMeta.alreadyCompleted ? (
            <div className="text-center py-6 space-y-4">
              <StatusIndicator
                tone={inviteMeta.status ? giftStatusTone(inviteMeta.status) : 'info'}
                label={inviteMeta.status ? GIFT_STATUS_LABELS[inviteMeta.status] : '已处理'}
              />
              <h2 className="text-base font-semibold text-slate-900">
                {inviteMeta.status === 'redeemed'
                  ? '该赠票已核销使用，不可重复激活'
                  : inviteMeta.status === 'frozen' ||
                      inviteMeta.status === 'voided' ||
                      inviteMeta.status === 'expired'
                    ? `该赠票当前状态为「${GIFT_STATUS_LABELS[inviteMeta.status]}」，不可重新激活`
                    : '该专属赠票已完成资料登记'}
              </h2>
              <p className="text-xs text-slate-500">
                如需查看当前电子赠票状态或出示动态码，请通过实名信息找回。
              </p>
              <GlassButton
                variant="primary"
                onClick={() => {
                  setViewMode('retrieve');
                  setErrorMsg(null);
                  setRetrievedTickets(null);
                }}
              >
                <Search className="w-4 h-4" />
                凭实名信息查看电子赠票
              </GlassButton>
            </div>
          ) : (
            <form onSubmit={handleCompleteInvited} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-900/[0.06]">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{inviteMeta.batchName}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    请完整输入受邀登记的 5 项实名信息进行身份核验
                  </p>
                </div>
                <StatusIndicator tone="warning" label="待完善资料" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <GlassInput
                  label="真实姓名"
                  required
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                />
                <GlassSelect
                  label="证件类型"
                  value={inviteForm.idType}
                  onValueChange={(val) => setInviteForm({ ...inviteForm, idType: val as IdType })}
                  options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                />
                <GlassInput
                  label="证件号码"
                  required
                  numeric
                  value={inviteForm.idNumber}
                  onChange={(e) => setInviteForm({ ...inviteForm, idNumber: e.target.value })}
                />
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <GlassSelect
                    label="区号"
                    searchable
                    value={inviteForm.countryCode}
                    onValueChange={(val) => setInviteForm({ ...inviteForm, countryCode: val })}
                    options={COUNTRY_CODE_OPTIONS}
                  />
                  <GlassInput
                    label="联系电话"
                    required
                    numeric
                    value={inviteForm.phone}
                    onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                  />
                </div>
              </div>

              {inviteMeta.availableDates.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-700 block">
                    使用日期
                    <span className="text-red-600 ml-0.5">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {inviteMeta.availableDates.map((d) => {
                      const selected = inviteForm.useDate === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setInviteForm({ ...inviteForm, useDate: d })}
                          className={`px-3.5 py-2 rounded-xl text-sm font-medium date-number border transition-all cursor-pointer ${
                            selected
                              ? 'bg-[#0071e3] text-white border-[#0071e3] shadow-sm'
                              : 'bg-white/70 text-slate-800 border-slate-900/10 hover:bg-white'
                          }`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <CustomFieldsSection
                fields={inviteMeta.customFields}
                values={inviteCustomValues}
                onChange={(label, val) =>
                  setInviteCustomValues((prev) => ({ ...prev, [label]: val }))
                }
              />

              <GlassUpload
                label="本人正面自拍（必填）"
                value={inviteForm.avatarUrl}
                onChange={(url) => setInviteForm({ ...inviteForm, avatarUrl: url })}
              />

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-800">
                  <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <GlassButton
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
                className="w-full"
              >
                核验身份并激活电子赠票
              </GlassButton>
            </form>
          )}
        </GlassCard>
      ) : (
        /* Mode B: Electronic Gift Ticket Retrieval (Read-only, 5-field identity + Smart CAPTCHA) */
        <div className="space-y-5">
          <GlassCard elevated padding="lg" className="space-y-4">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-900/[0.06]">
              <h2 className="text-base font-semibold text-slate-900">找回电子赠票</h2>
              <button
                type="button"
                onClick={() => {
                  setViewMode('self');
                  setErrorMsg(null);
                  setRetrievedTickets(null);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0071e3] hover:text-[#005bb8] cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                返回领票
              </button>
            </div>
            <form onSubmit={startRetrieveFlow} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <GlassInput
                  label="真实姓名"
                  required
                  value={retrieveForm.name}
                  onChange={(e) => setRetrieveForm({ ...retrieveForm, name: e.target.value })}
                />
                <GlassSelect
                  label="证件类型"
                  value={retrieveForm.idType}
                  onValueChange={(val) =>
                    setRetrieveForm({ ...retrieveForm, idType: val as IdType })
                  }
                  options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                />
                <GlassInput
                  label="证件号码"
                  required
                  numeric
                  value={retrieveForm.idNumber}
                  onChange={(e) => setRetrieveForm({ ...retrieveForm, idNumber: e.target.value })}
                />
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <GlassSelect
                    label="区号"
                    searchable
                    value={retrieveForm.countryCode}
                    onValueChange={(val) =>
                      setRetrieveForm({ ...retrieveForm, countryCode: val })
                    }
                    options={COUNTRY_CODE_OPTIONS}
                  />
                  <GlassInput
                    label="联系电话"
                    required
                    numeric
                    value={retrieveForm.phone}
                    onChange={(e) => setRetrieveForm({ ...retrieveForm, phone: e.target.value })}
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-800">
                  <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <GlassButton
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
                className="w-full"
              >
                <Search className="w-4 h-4" />
                验证身份并找回电子赠票
              </GlassButton>
            </form>
          </GlassCard>

          {retrievedTickets && retrievedTickets.length > 0 && (
            <div className="space-y-5">
              {retrievedTickets.map((ticket) => (
                <div key={ticket.id} className="space-y-2">
                  <ElectronicCredentialCard
                    credentialKind="gift"
                    credentialId={ticket.id}
                    activityId={ticket.activityId}
                    activityName={currentAct.name}
                    holderName={ticket.name}
                    code={ticket.ticketCode}
                    subtitle={ticket.batchName}
                    validDateLabel={ticket.useDate}
                    statusLabel={GIFT_STATUS_LABELS[ticket.status]}
                    statusTone={giftStatusTone(ticket.status)}
                    avatarUrl={ticket.avatarUrl}
                    activeForQR={ticket.status === 'valid' || ticket.status === 'generated'}
                  />
                  {ticket.redeemedAt && (
                    <p className="text-center text-xs text-slate-500 date-number">
                      核销时间：{formatDateTimeDisplay(ticket.redeemedAt)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <SmartCaptchaModal
        open={Boolean(captchaChallenge)}
        challenge={captchaChallenge}
        onClose={() => {
          setCaptchaChallenge(null);
          setCaptchaIntent(null);
        }}
        onVerified={(token) => {
          const intent = captchaIntent;
          setCaptchaChallenge(null);
          setCaptchaIntent(null);
          if (intent === 'retrieve') {
            executeRetrieveTickets(token);
          } else if (intent === 'self') {
            executeSelfClaim(token);
          }
        }}
      />
    </PageContainer>
  );
}
