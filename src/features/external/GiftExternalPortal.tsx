import React, { useEffect, useState } from 'react';
import { CheckCircle2, ShieldAlert, Ticket } from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import {
  GlassButton,
  GlassCard,
  GlassInput,
  GlassSelect,
  GlassTabs,
  PageHeader,
} from '../../components/glass/GlassPrimitives';
import { GlassUpload, SmartCaptchaModal } from '../../components/glass/GlassOverlay';
import { ElectronicCredentialCard } from '../../components/qr/GlassQRCode';
import { getApiClient } from '../../services/api';
import { COUNTRY_CODES, GIFT_STATUS_LABELS, ID_TYPE_LABELS } from '../../utils/stateMachines';
import type { CaptchaChallenge, GiftBatch, GiftTicket, IdType } from '../../types/domain';

export function GiftExternalPortal() {
  const { activeActivity, activities, externalContext, pushToast } = useApp();
  const currentAct = activeActivity ?? activities[0] ?? null;

  const [modeTab, setModeTab] = useState<'self' | 'invited'>(
    externalContext.invitedGiftToken ? 'invited' : 'self',
  );
  const [batches, setBatches] = useState<GiftBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState(externalContext.giftBatchId || '');
  const [issuedTicket, setIssuedTicket] = useState<GiftTicket | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [captchaChallenge, setCaptchaChallenge] = useState<CaptchaChallenge | null>(null);

  const [form, setForm] = useState({
    name: '',
    idType: 'cn_id' as IdType,
    idNumber: '',
    countryCode: '+86',
    phone: '',
    useDate: '',
    avatarUrl: '',
    customOrg: '',
  });

  // Invited ticket completion state
  const [inviteToken, setInviteToken] = useState(externalContext.invitedGiftToken || 'INV-GZ-0004');
  const [invitePhone, setInvitePhone] = useState('13600136004');
  const [inviteCode, setInviteCode] = useState('+86');
  const [inviteDate, setInviteDate] = useState('2026-11-26');
  const [inviteAvatar, setInviteAvatar] = useState('');

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
          // Chapter 13.3: Automatically select date when only 1 open date exists
          setForm((prev) => ({
            ...prev,
            useDate: initial.availableDates[0] || '',
          }));
        }
      });
  }, [currentAct?.id, externalContext.giftBatchId]);

  if (!currentAct) return null;

  const currentBatch = batches.find((b) => b.id === selectedBatchId) ?? batches[0] ?? null;

  const handleSelectBatch = (batchId: string) => {
    setSelectedBatchId(batchId);
    const b = batches.find((x) => x.id === batchId);
    setForm((prev) => ({ ...prev, useDate: b?.availableDates[0] || '' }));
    setErrorMsg(null);
  };

  const submitSelfClaim = async (captchaToken?: string) => {
    if (!currentBatch) return;
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
          customFields: form.customOrg ? { '所属媒体 / 单位': form.customOrg } : {},
        },
        captchaToken,
      );
      setIssuedTicket(res.ticket);
      pushToast({
        tone: 'success',
        title: `赠票领取成功：${res.ticket.ticketCode}`,
        detail: res.isMockDemo ? '已为您生成独立电子赠票（演示结果）' : '已生成电子赠票',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '领票失败';
      setErrorMsg(msg);
      pushToast({ tone: 'error', title: '领取未通过', detail: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteInvited = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const ticket = await getApiClient().tickets.completeInvitedTicket(inviteToken, {
        countryCode: inviteCode,
        phone: invitePhone,
        useDate: inviteDate,
        avatarUrl: inviteAvatar,
      });
      setIssuedTicket(ticket);
      pushToast({
        tone: 'success',
        title: `专属赠票激活成功：${ticket.ticketCode}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '补充资料失败';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container max-w-2xl space-y-6">
      <PageHeader
        title="活动电子赠票领取"
        subtitle={`${currentAct.name} · 同一活动内每个身份仅限自助领取 1 张赠票，一票一码实名核验`}
      />

      {issuedTicket ? (
        <div className="space-y-5">
          <GlassCard elevated className="text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-[#15803d] mx-auto" />
            <h2 className="text-lg font-semibold text-slate-900">电子赠票已签发</h2>
            <p className="text-xs text-slate-600">
              请在限定使用日期（<span className="date-number font-semibold">{issuedTicket.useDate}</span>
              ）携本人出示下方实时动态二维码核销入场。
            </p>
          </GlassCard>

          <ElectronicCredentialCard
            credentialKind="gift"
            credentialId={issuedTicket.id}
            activityId={currentAct.id}
            activityName={currentAct.name}
            holderName={issuedTicket.name}
            code={issuedTicket.ticketCode}
            subtitle={issuedTicket.batchName}
            validDateLabel={issuedTicket.useDate}
            statusLabel={GIFT_STATUS_LABELS[issuedTicket.status]}
            statusTone="success"
            avatarUrl={issuedTicket.avatarUrl}
            activeForQR={issuedTicket.status === 'valid' || issuedTicket.status === 'generated'}
          />

          <div className="flex justify-center">
            <GlassButton
              variant="secondary"
              onClick={() => {
                setIssuedTicket(null);
                setErrorMsg(null);
              }}
            >
              返回领票表单（可测试同身份重复拦截）
            </GlassButton>
          </div>
        </div>
      ) : (
        <>
          <GlassTabs
            value={modeTab}
            onChange={(t) => {
              setModeTab(t);
              setErrorMsg(null);
            }}
            tabs={[
              { id: 'self', label: 'A. 公开自助领票' },
              { id: 'invited', label: 'B. 后台专属邀请链接补全' },
            ]}
          />

          {modeTab === 'self' ? (
            <GlassCard elevated padding="lg" className="space-y-5">
              {!currentBatch ? (
                <div className="text-center py-8 space-y-2">
                  <Ticket className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-medium text-slate-800">当前活动暂无开放中的自助赠票批次</p>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitSelfClaim();
                  }}
                  className="space-y-4"
                >
                  <GlassSelect
                    label="选择自助赠票批次"
                    value={currentBatch.id}
                    onChange={(e) => handleSelectBatch(e.target.value)}
                    options={batches.map((b) => ({
                      value: b.id,
                      label: `${b.name}（剩余 ${Math.max(0, b.totalQuota - b.claimedCount)} 张）`,
                    }))}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <GlassInput
                      label="真实姓名"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="请输入持票人姓名"
                    />
                    <GlassSelect
                      label="证件类型"
                      value={form.idType}
                      onChange={(e) => setForm({ ...form, idType: e.target.value as IdType })}
                      options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                    />
                    <GlassInput
                      label="证件号码"
                      required
                      numeric
                      value={form.idNumber}
                      onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                      placeholder="用于活动内实名排重与核验"
                    />
                    <div className="grid grid-cols-5 gap-2">
                      <div className="col-span-2">
                        <GlassSelect
                          label="区号"
                          value={form.countryCode}
                          onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                          options={COUNTRY_CODES.map((c) => ({ value: c.code, label: c.code }))}
                        />
                      </div>
                      <div className="col-span-3">
                        <GlassInput
                          label="联系电话"
                          required
                          numeric
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Chapter 13.3: Strictly constrained selectable open dates */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-700 block">
                      选择使用日期
                      <span className="text-red-600 ml-0.5">*</span>
                      {currentBatch.availableDates.length === 1 && (
                        <span className="text-slate-400 font-normal ml-2">
                          （本批次仅开放单日，已自动锁定）
                        </span>
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

                  {currentBatch.customFields.length > 0 && (
                    <GlassInput
                      label={currentBatch.customFields[0].label}
                      value={form.customOrg}
                      onChange={(e) => setForm({ ...form, customOrg: e.target.value })}
                      placeholder={currentBatch.customFields[0].placeholder}
                    />
                  )}

                  <GlassUpload
                    label="持票人本人自拍照（必填）"
                    value={form.avatarUrl}
                    onChange={(url) => setForm({ ...form, avatarUrl: url })}
                  />

                  {errorMsg && (
                    <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800">
                      <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">无法领取赠票</p>
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
                    提交实名资料并生成电子赠票
                  </GlassButton>
                </form>
              )}
            </GlassCard>
          ) : (
            <GlassCard elevated padding="lg" className="space-y-4">
              <p className="text-xs text-slate-600">
                适用于后台批量导入名单生成的专属登记链接（如演示邀请码 <strong className="numeric-text">INV-GZ-0004</strong>），补充手机号与自拍照后即可激活电子赠票。
              </p>
              <form onSubmit={handleCompleteInvited} className="space-y-4">
                <GlassInput
                  label="专属邀请链接码"
                  required
                  numeric
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value)}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="grid grid-cols-5 gap-2">
                    <div className="col-span-2">
                      <GlassSelect
                        label="区号"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value)}
                        options={COUNTRY_CODES.map((c) => ({ value: c.code, label: c.code }))}
                      />
                    </div>
                    <div className="col-span-3">
                      <GlassInput
                        label="联系电话"
                        required
                        numeric
                        value={invitePhone}
                        onChange={(e) => setInvitePhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <GlassInput
                    label="确认使用日期"
                    type="date"
                    numeric
                    required
                    value={inviteDate}
                    onChange={(e) => setInviteDate(e.target.value)}
                  />
                </div>
                <GlassUpload
                  label="补充本人自拍照"
                  value={inviteAvatar}
                  onChange={setInviteAvatar}
                />
                {errorMsg && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                    {errorMsg}
                  </div>
                )}
                <GlassButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={submitting}
                  className="w-full"
                >
                  激活我的电子赠票
                </GlassButton>
              </form>
            </GlassCard>
          )}
        </>
      )}

      <SmartCaptchaModal
        open={Boolean(captchaChallenge)}
        challenge={captchaChallenge}
        onClose={() => setCaptchaChallenge(null)}
        onVerified={(token) => {
          setCaptchaChallenge(null);
          submitSelfClaim(token);
        }}
      />
    </div>
  );
}
