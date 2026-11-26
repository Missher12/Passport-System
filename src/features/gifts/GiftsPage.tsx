import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Plus, QrCode, Upload } from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import {
  GlassButton,
  GlassCard,
  GlassDatePicker,
  GlassInput,
  GlassSelect,
  GlassTabs,
  PageHeader,
  PermissionDeniedState,
  StatusIndicator,
} from '../../components/glass/GlassPrimitives';
import { GlassDialog, GlassUpload } from '../../components/glass/GlassOverlay';
import { GlassTable, type GlassTableColumn } from '../../components/glass/GlassTable';
import { ElectronicCredentialCard } from '../../components/qr/GlassQRCode';
import { getApiClient } from '../../services/api';
import {
  COUNTRY_CODES,
  GIFT_STATUS_LABELS,
  ID_TYPE_LABELS,
  buildCsvDownloadContent,
  formatDateTimeDisplay,
  maskIdNumber,
  maskPhone,
  parseIdTypeInput,
} from '../../utils/stateMachines';
import type { GiftBatch, GiftTicket, GiftTicketStatus, IdType } from '../../types/domain';

function giftTone(status: GiftTicketStatus) {
  if (status === 'valid' || status === 'generated' || status === 'redeemed') return 'success' as const;
  if (status === 'voided' || status === 'expired' || status === 'frozen') return 'danger' as const;
  return 'warning' as const;
}

export function GiftsPage() {
  const { user, activeActivity, activities, realtimeVersion, canAccessModule, switchPortal, pushToast } =
    useApp();

  const currentAct = activeActivity ?? activities[0] ?? null;
  const [tab, setTab] = useState<'batches' | 'backend_issue' | 'tickets'>('batches');
  const [batches, setBatches] = useState<GiftBatch[]>([]);
  const [tickets, setTickets] = useState<GiftTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticketSearch, setTicketSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<GiftTicketStatus | 'all'>('all');
  const [previewTicket, setPreviewTicket] = useState<GiftTicket | null>(null);

  // Create Batch modal
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [newBatch, setNewBatch] = useState({
    name: '',
    totalQuota: '100',
    openAt: '2026-11-20T10:00',
    closeAt: '2026-12-01T20:00',
    datesText: '2026-11-26, 2026-11-27, 2026-11-28',
    enabled: true,
  });

  // Backend direct issue form
  const [directForm, setDirectForm] = useState({
    batchName: '后台特邀直发',
    name: '',
    idType: 'cn_id' as IdType,
    idNumber: '',
    countryCode: '+86',
    phone: '',
    useDate: '2026-11-26',
    avatarUrl: '',
    allowDuplicateOverride: false,
  });
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Backend CSV import
  const [importBatchName, setImportBatchName] = useState('后台合作方邀请名单');
  const [importUseDate, setImportUseDate] = useState('2026-11-26');
  const [importCsv, setImportCsv] = useState(
    '姓名,证件类型,证件号码,国际区号,联系电话\n林致远,居民身份证,440106199403180045,+86,13600136099',
  );

  const loadData = async () => {
    if (!currentAct) return;
    setLoading(true);
    try {
      const api = getApiClient();
      const [b, t] = await Promise.all([
        api.gifts.listBatches(currentAct.id),
        api.tickets.listTickets(currentAct.id),
      ]);
      setBatches(b);
      setTickets(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentAct?.id, realtimeVersion]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (ticketSearch.trim()) {
        const q = ticketSearch.trim().toLowerCase();
        return (
          t.ticketCode.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.batchName.toLowerCase().includes(q) ||
          t.phone.includes(q)
        );
      }
      return true;
    });
  }, [tickets, statusFilter, ticketSearch]);

  if (!canAccessModule('gifts')) {
    return (
      <div className="page-container">
        <PermissionDeniedState moduleLabel="赠票管理" />
      </div>
    );
  }

  if (!currentAct) return null;

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const availableDates = newBatch.datesText
        .split(/[,，\n]/)
        .map((d) => d.trim())
        .filter(Boolean);
      const created = await getApiClient().gifts.createBatch(
        {
          activityId: currentAct.id,
          name: newBatch.name,
          totalQuota: Number.parseInt(newBatch.totalQuota, 10) || 10,
          openAt: newBatch.openAt,
          closeAt: newBatch.closeAt,
          availableDates,
          customFields: [],
          enabled: newBatch.enabled,
        },
        user,
      );
      setBatchModalOpen(false);
      setNewBatch({
        name: '',
        totalQuota: '100',
        openAt: '2026-11-20T10:00',
        closeAt: '2026-12-01T20:00',
        datesText: '2026-11-26, 2026-11-27',
        enabled: true,
      });
      pushToast({
        tone: 'success',
        title: `自助赠票批次「${created.name}」已创建`,
        detail: `分享码：${created.shareCode}（演示结果）`,
      });
      await loadData();
    } catch (err) {
      pushToast({ tone: 'error', title: err instanceof Error ? err.message : '创建失败' });
    }
  };

  const handleDirectIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setDuplicateWarning(null);
    try {
      const res = await getApiClient().tickets.backendDirectIssue(
        {
          activityId: currentAct.id,
          ...directForm,
        },
        user,
      );
      pushToast({
        tone: 'success',
        title: `已生成独立赠票 ${res.ticket.ticketCode}`,
        detail: res.duplicateDetected
          ? '已通过授权增发独立一票一码（演示结果）'
          : '赠票凭证已生效，可立即核验或分享（演示结果）',
      });
      setDirectForm({
        ...directForm,
        name: '',
        idNumber: '',
        phone: '',
        allowDuplicateOverride: false,
      });
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '发票失败';
      if (msg.startsWith('DUPLICATE_IDENTITY:')) {
        setDuplicateWarning(msg.replace('DUPLICATE_IDENTITY:', ''));
      } else {
        pushToast({ tone: 'error', title: '发放赠票失败', detail: msg });
      }
    }
  };

  const handleBackendImport = async () => {
    if (!user) return;
    const lines = importCsv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const dataLines = lines[0]?.includes('姓名') ? lines.slice(1) : lines;
    const rows = dataLines
      .map((line) => {
        const cols = line.split(/[,\t]/).map((c) => c.trim());
        return {
          name: cols[0] ?? '',
          idType: parseIdTypeInput(cols[1] ?? 'cn_id'),
          idNumber: cols[2] ?? '',
          countryCode: cols[3] || '+86',
          phone: cols[4] ?? '',
        };
      })
      .filter((r) => r.name && r.idNumber);

    if (rows.length === 0) {
      pushToast({ tone: 'warning', title: '未解析到有效名单行' });
      return;
    }

    const res = await getApiClient().tickets.backendBatchImport(
      currentAct.id,
      importBatchName,
      importUseDate,
      rows,
      user,
    );
    pushToast({
      tone: 'success',
      title: `批量生成 ${res.created.length} 个专属赠票登记链接`,
      detail:
        res.duplicates.length > 0
          ? `自动拦截重复身份 ${res.duplicates.length} 条：${res.duplicates.join('；')}`
          : '受邀人打开专属链接补充自拍后即可生成电子赠票（演示结果）',
    });
    await loadData();
  };

  const ticketColumns: GlassTableColumn<GiftTicket>[] = [
    {
      key: 'code',
      header: '票务编号（一票一码）',
      sortable: true,
      sortValue: (t) => t.ticketCode,
      render: (t) => <span className="order-number font-semibold text-[#0071e3]">{t.ticketCode}</span>,
    },
    {
      key: 'holder',
      header: '持票人与身份',
      render: (t) => (
        <div className="text-xs space-y-0.5">
          <div className="font-medium text-slate-900">{t.name}</div>
          <div className="text-slate-500 numeric-text">
            {ID_TYPE_LABELS[t.idType]} · {maskIdNumber(t.idNumber)} · {maskPhone(t.countryCode, t.phone)}
          </div>
        </div>
      ),
    },
    {
      key: 'batch',
      header: '来源批次 / 模式',
      render: (t) => (
        <div className="text-xs">
          <div className="font-medium text-slate-800">{t.batchName}</div>
          <div className="text-slate-400">
            {t.mode === 'self_claim'
              ? '自助领票'
              : t.mode === 'backend_import'
                ? '后台导入专属链接'
                : '后台直接录入'}
          </div>
        </div>
      ),
    },
    {
      key: 'date',
      header: '限定使用日期',
      sortable: true,
      sortValue: (t) => t.useDate,
      render: (t) => <span className="date-number font-medium text-slate-800">{t.useDate}</span>,
    },
    {
      key: 'status',
      header: '票据状态',
      render: (t) => <StatusIndicator tone={giftTone(t.status)} label={GIFT_STATUS_LABELS[t.status]} />,
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (t) => (
        <div className="flex items-center justify-end gap-1.5">
          {t.status === 'waiting_fill' && t.claimLinkToken && (
            <GlassButton
              size="sm"
              variant="secondary"
              onClick={() => switchPortal('gift', { invitedGiftToken: t.claimLinkToken })}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              去补全资料
            </GlassButton>
          )}
          <GlassButton size="sm" variant="secondary" onClick={() => setPreviewTicket(t)}>
            <QrCode className="w-3.5 h-3.5" />
            电子赠票
          </GlassButton>
          {t.status === 'valid' && (
            <GlassButton
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!user) return;
                await getApiClient().tickets.setTicketStatus(
                  currentAct.id,
                  t.id,
                  'voided',
                  '赠票管理员手动作废',
                  user,
                );
                pushToast({ tone: 'warning', title: `赠票 ${t.ticketCode} 已作废` });
                await loadData();
              }}
            >
              作废
            </GlassButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="page-container--wide space-y-6">
      <PageHeader
        title="赠票管理"
        subtitle={`当前活动：${currentAct.name} · 赠票资料库与证件库完全独立，同一活动跨批次自动拦截重复身份自助领票`}
        actions={
          <>
            <GlassButton variant="secondary" onClick={() => switchPortal('gift')}>
              <ExternalLink className="w-4 h-4" />
              打开外部自助领票端
            </GlassButton>
            <GlassButton variant="primary" onClick={() => setBatchModalOpen(true)}>
              <Plus className="w-4 h-4" />
              新建自助赠票批次
            </GlassButton>
          </>
        }
      />

      <GlassTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'batches', label: '自助领票批次', count: batches.length },
          { id: 'backend_issue', label: '后台赠票发放' },
          { id: 'tickets', label: '赠票名单（一票一码）', count: tickets.length },
        ]}
      />

      {tab === 'batches' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {batches.map((b) => (
            <GlassCard key={b.id} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{b.name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5 numeric-text">
                    分享码：{b.shareCode} · 可选日期：{b.availableDates.join('、')}
                  </p>
                </div>
                <StatusIndicator
                  tone={b.enabled ? 'success' : 'neutral'}
                  label={b.enabled ? '已启用' : '已停用'}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-600 numeric-text">
                  <span>已领取 {b.claimedCount} 张</span>
                  <span>总配额 {b.totalQuota} 张</span>
                </div>
                <div className="h-2 rounded-full bg-slate-900/[0.07] overflow-hidden">
                  <div
                    className="h-full bg-[#0071e3]"
                    style={{
                      width: `${Math.min(100, Math.round((b.claimedCount / Math.max(1, b.totalQuota)) * 100))}%`,
                    }}
                  />
                </div>
              </div>

              <div className="text-xs text-slate-500 date-number">
                开放窗口：{formatDateTimeDisplay(b.openAt)} 至 {formatDateTimeDisplay(b.closeAt)}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-900/[0.06]">
                <GlassButton
                  size="sm"
                  variant="primary"
                  onClick={() => switchPortal('gift', { giftBatchId: b.id })}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  体验此批次自助领票
                </GlassButton>
                <GlassButton
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    if (!user) return;
                    await getApiClient().gifts.updateBatch(
                      currentAct.id,
                      b.id,
                      { enabled: !b.enabled },
                      user,
                    );
                    await loadData();
                  }}
                >
                  {b.enabled ? '停用批次' : '重新启用'}
                </GlassButton>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {tab === 'backend_issue' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Direct Issue */}
          <GlassCard className="lg:col-span-7 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">后台直接录入发放（即时生成一票一码）</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                发现同一活动内重复身份时自动拦截提示，仅授权角色确认后才可额外增发独立票码。
              </p>
            </div>
            <form onSubmit={handleDirectIssue} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <GlassInput
                  label="发放批次 / 渠道备注"
                  required
                  value={directForm.batchName}
                  onChange={(e) => setDirectForm({ ...directForm, batchName: e.target.value })}
                />
                <GlassInput
                  label="持票人姓名"
                  required
                  value={directForm.name}
                  onChange={(e) => setDirectForm({ ...directForm, name: e.target.value })}
                />
                <GlassSelect
                  label="证件类型"
                  value={directForm.idType}
                  onChange={(e) => setDirectForm({ ...directForm, idType: e.target.value as IdType })}
                  options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                />
                <GlassInput
                  label="证件号码"
                  required
                  numeric
                  value={directForm.idNumber}
                  onChange={(e) => setDirectForm({ ...directForm, idNumber: e.target.value })}
                />
                <div className="grid grid-cols-5 gap-2">
                  <div className="col-span-2">
                    <GlassSelect
                      label="区号"
                      value={directForm.countryCode}
                      onChange={(e) => setDirectForm({ ...directForm, countryCode: e.target.value })}
                      options={COUNTRY_CODES.map((c) => ({ value: c.code, label: c.code }))}
                    />
                  </div>
                  <div className="col-span-3">
                    <GlassInput
                      label="联系电话"
                      required
                      numeric
                      value={directForm.phone}
                      onChange={(e) => setDirectForm({ ...directForm, phone: e.target.value })}
                    />
                  </div>
                </div>
                <GlassInput
                  label="限定使用日期"
                  type="date"
                  numeric
                  required
                  value={directForm.useDate}
                  onChange={(e) => setDirectForm({ ...directForm, useDate: e.target.value })}
                />
              </div>

              <GlassUpload
                label="持票人自拍照（留空则生成专属补充链接由本人补拍）"
                value={directForm.avatarUrl}
                onChange={(url) => setDirectForm({ ...directForm, avatarUrl: url })}
              />

              {duplicateWarning && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 space-y-2 text-xs text-amber-950">
                  <p className="font-semibold">{duplicateWarning}</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={directForm.allowDuplicateOverride}
                      onChange={(e) =>
                        setDirectForm({ ...directForm, allowDuplicateOverride: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#0071e3]"
                    />
                    我已确认授权，为该身份额外增发一张独立票码的赠票
                  </label>
                </div>
              )}

              <div className="flex justify-end">
                <GlassButton type="submit" variant="primary">
                  确认签发独立赠票
                </GlassButton>
              </div>
            </form>
          </GlassCard>

          {/* Batch Import */}
          <GlassCard className="lg:col-span-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-[#0071e3]" />
                批量名单导入（生成专属登记链接）
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                导入名单后为每位受邀人生成专属补充链接，由领取者自行上传自拍照并激活电子赠票。
              </p>
            </div>
            <GlassInput
              label="导入批次名称"
              value={importBatchName}
              onChange={(e) => setImportBatchName(e.target.value)}
            />
            <GlassInput
              label="默认限定使用日期"
              type="date"
              numeric
              value={importUseDate}
              onChange={(e) => setImportUseDate(e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-700">CSV / Excel 粘贴数据</label>
              <textarea
                rows={6}
                value={importCsv}
                onChange={(e) => setImportCsv(e.target.value)}
                className="glass-input p-3 text-xs numeric-text"
              />
            </div>
            <GlassButton variant="primary" className="w-full" onClick={handleBackendImport}>
              解析名单并生成专属链接
            </GlassButton>
          </GlassCard>
        </div>
      )}

      {tab === 'tickets' && (
        <GlassTable
          rows={filteredTickets}
          columns={ticketColumns}
          loading={loading}
          searchValue={ticketSearch}
          onSearchChange={setTicketSearch}
          searchPlaceholder="搜索票务编号（如 GT2027010001）、姓名、批次..."
          filterSlot={
            <select
              aria-label="按状态筛选赠票"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as GiftTicketStatus | 'all')}
              className="glass-input h-[36px] px-3 text-xs"
            >
              <option value="all">全部赠票状态</option>
              {Object.entries(GIFT_STATUS_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          }
          onExportCsv={() => {
            const csv = buildCsvDownloadContent(
              ['票务编号', '姓名', '来源批次', '使用日期', '状态', '核销时间'],
              filteredTickets.map((t) => [
                t.ticketCode,
                t.name,
                t.batchName,
                t.useDate,
                GIFT_STATUS_LABELS[t.status],
                t.redeemedAt ? formatDateTimeDisplay(t.redeemedAt) : '—',
              ]),
            );
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gift-tickets-${currentAct.code}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        />
      )}

      {/* Create Batch Dialog */}
      <GlassDialog
        open={batchModalOpen}
        title="新建自助领票批次"
        subtitle="领取者仅可从管理员配置的开放日期中选择，跨批次同身份自动排重"
        onClose={() => setBatchModalOpen(false)}
      >
        <form onSubmit={handleCreateBatch} className="space-y-4">
          <GlassInput
            label="批次名称"
            required
            value={newBatch.name}
            onChange={(e) => setNewBatch({ ...newBatch, name: e.target.value })}
            placeholder="例如：高校动漫社团专享赠票"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <GlassInput
              label="总票数配额"
              type="number"
              min={1}
              required
              numeric
              value={newBatch.totalQuota}
              onChange={(e) => setNewBatch({ ...newBatch, totalQuota: e.target.value })}
            />
            <GlassInput
              label="可领取使用日期（逗号分隔，仅限列表内选择）"
              required
              numeric
              value={newBatch.datesText}
              onChange={(e) => setNewBatch({ ...newBatch, datesText: e.target.value })}
              placeholder="2026-11-26, 2026-11-27"
            />
            <GlassDatePicker
              label="自助领取开放时间"
              value={newBatch.openAt}
              onChange={(v) => setNewBatch({ ...newBatch, openAt: v })}
            />
            <GlassDatePicker
              label="自助领取截止时间"
              value={newBatch.closeAt}
              onChange={(v) => setNewBatch({ ...newBatch, closeAt: v })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <GlassButton variant="secondary" onClick={() => setBatchModalOpen(false)}>
              取消
            </GlassButton>
            <GlassButton type="submit" variant="primary">
              创建自助批次
            </GlassButton>
          </div>
        </form>
      </GlassDialog>

      {/* Electronic Gift Ticket Preview */}
      <GlassDialog
        open={Boolean(previewTicket)}
        title="电子赠票预览（一票一码）"
        onClose={() => setPreviewTicket(null)}
        maxWidthClass="max-w-md"
      >
        {previewTicket && (
          <ElectronicCredentialCard
            credentialKind="gift"
            credentialId={previewTicket.id}
            activityId={currentAct.id}
            activityName={currentAct.name}
            holderName={previewTicket.name}
            code={previewTicket.ticketCode}
            subtitle={previewTicket.batchName}
            validDateLabel={previewTicket.useDate}
            statusLabel={GIFT_STATUS_LABELS[previewTicket.status]}
            statusTone={giftTone(previewTicket.status)}
            avatarUrl={previewTicket.avatarUrl}
            activeForQR={previewTicket.status === 'valid' || previewTicket.status === 'generated'}
          />
        )}
      </GlassDialog>
    </div>
  );
}
