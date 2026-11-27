import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Edit3,
  ExternalLink,
  Plus,
  QrCode,
  Trash2,
  Upload,
} from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import {
  AllActivityReadonlyNotice,
  GlassActionMenu,
  GlassButton,
  GlassCard,
  GlassDatePicker,
  GlassInput,
  GlassSelect,
  GlassTabs,
  GlassToolbar,
  PermissionDeniedState,
  SensitiveFieldCell,
  StatusIndicator,
} from '../../components/glass/GlassPrimitives';
import { GlassDialog, GlassUpload } from '../../components/glass/GlassOverlay';
import { GlassTable, type GlassTableColumn } from '../../components/glass/GlassTable';
import { PageContainer } from '../../components/layout/PageContainer';
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
import type {
  CustomFieldDefinition,
  CustomFieldType,
  GiftBatch,
  GiftTicket,
  GiftTicketStatus,
  IdType,
} from '../../types/domain';

const COUNTRY_CODE_OPTIONS = COUNTRY_CODES.map((c) => ({
  value: c.code,
  label: `${c.code} ${c.label}`,
  shortLabel: c.code,
}));

const CUSTOM_FIELD_TYPE_OPTIONS: Array<{ value: CustomFieldType; label: string }> = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'radio', label: '单选' },
  { value: 'checkbox', label: '多选' },
  { value: 'select', label: '下拉选择' },
  { value: 'date', label: '日期' },
  { value: 'number', label: '数字' },
];

interface EditableCustomField {
  id: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  placeholder: string;
  optionsText: string;
}

function toEditableFields(fields: CustomFieldDefinition[]): EditableCustomField[] {
  return fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type ?? 'text',
    required: Boolean(f.required),
    placeholder: f.placeholder ?? '',
    optionsText: (f.options ?? []).join(', '),
  }));
}

function fromEditableFields(fields: EditableCustomField[]): CustomFieldDefinition[] {
  return fields
    .filter((f) => f.label.trim().length > 0)
    .map((f) => {
      const needsOptions = f.type === 'radio' || f.type === 'checkbox' || f.type === 'select';
      const options = needsOptions
        ? f.optionsText
            .split(/[,，\n]/)
            .map((o) => o.trim())
            .filter(Boolean)
        : undefined;
      return {
        id: f.id,
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        placeholder: f.placeholder.trim() || undefined,
        options,
      };
    });
}

function giftTone(status: GiftTicketStatus) {
  if (status === 'valid' || status === 'generated' || status === 'redeemed') {
    return 'success' as const;
  }
  if (status === 'voided' || status === 'expired' || status === 'frozen') {
    return 'danger' as const;
  }
  return 'warning' as const;
}

export function GiftsPage() {
  const {
    user,
    role,
    activeActivityId,
    activeActivity,
    activities,
    realtimeVersion,
    canAccessModule,
    navigateAdmin,
    switchPortal,
    pushToast,
  } = useApp();

  const isAllScope = activeActivityId === 'ALL';
  const currentAct = isAllScope ? null : (activeActivity ?? activities[0] ?? null);
  const scopeActivityId = isAllScope ? 'ALL' : (currentAct?.id ?? '');

  const [tab, setTab] = useState<'batches' | 'backend_issue' | 'tickets'>('batches');
  const [issueMode, setIssueMode] = useState<'single' | 'batch'>('single');
  const [batches, setBatches] = useState<GiftBatch[]>([]);
  const [tickets, setTickets] = useState<GiftTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticketSearch, setTicketSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<GiftTicketStatus | 'all'>('all');
  const [previewTicket, setPreviewTicket] = useState<GiftTicket | null>(null);
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({});

  // Create / Edit Batch modal
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [batchForm, setBatchForm] = useState({
    name: '',
    totalQuota: '100',
    openAt: '2026-11-20T10:00',
    closeAt: '2026-12-01T20:00',
    datesText: '2026-11-26, 2026-11-27, 2026-11-28',
    enabled: true,
    customFields: [] as EditableCustomField[],
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
  const [importCsv, setImportCsv] = useState('姓名,证件类型,证件号码,国际区号,联系电话\n');

  useEffect(() => {
    setRevealedFields({});
    return () => setRevealedFields({});
  }, [scopeActivityId, user?.id]);

  const loadData = async () => {
    if (!scopeActivityId) return;
    setLoading(true);
    try {
      const api = getApiClient();
      const [b, t] = await Promise.all([
        api.gifts.listBatches(scopeActivityId),
        api.tickets.listTickets(scopeActivityId),
      ]);
      setBatches(b);
      setTickets(t);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [scopeActivityId, realtimeVersion]);

  const activityById = useMemo(
    () => Object.fromEntries(activities.map((a) => [a.id, a])),
    [activities],
  );

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
      <PageContainer>
        <PermissionDeniedState moduleLabel="赠票管理" />
      </PageContainer>
    );
  }

  if (!isAllScope && !currentAct) return null;

  const canRevealSensitive = Boolean(role?.canViewUnmaskedSensitive);

  const toggleFieldReveal = async (
    fieldKey: string,
    activityId: string,
    targetLabel: string,
    fieldName: string,
  ) => {
    if (revealedFields[fieldKey]) {
      setRevealedFields((prev) => ({ ...prev, [fieldKey]: false }));
      return;
    }
    if (!canRevealSensitive) {
      pushToast({ tone: 'warning', title: '当前角色无明文查看权限' });
      return;
    }
    if (user) {
      await getApiClient().auditLogs.recordSensitiveView(
        activityId,
        targetLabel,
        user,
        fieldName,
      );
    }
    setRevealedFields((prev) => ({ ...prev, [fieldKey]: true }));
  };

  const openCreateBatchModal = () => {
    setEditingBatchId(null);
    setBatchForm({
      name: '',
      totalQuota: '100',
      openAt: '2026-11-20T10:00',
      closeAt: '2026-12-01T20:00',
      datesText: '2026-11-26, 2026-11-27, 2026-11-28',
      enabled: true,
      customFields: [],
    });
    setBatchModalOpen(true);
  };

  const openEditBatchModal = (b: GiftBatch) => {
    setEditingBatchId(b.id);
    setBatchForm({
      name: b.name,
      totalQuota: String(b.totalQuota),
      openAt: b.openAt.slice(0, 16),
      closeAt: b.closeAt.slice(0, 16),
      datesText: b.availableDates.join(', '),
      enabled: b.enabled,
      customFields: toEditableFields(b.customFields),
    });
    setBatchModalOpen(true);
  };

  const addCustomFieldRow = () => {
    setBatchForm((prev) => ({
      ...prev,
      customFields: [
        ...prev.customFields,
        {
          id: `cf_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          label: '',
          type: 'text',
          required: false,
          placeholder: '',
          optionsText: '',
        },
      ],
    }));
  };

  const updateCustomFieldRow = (
    idx: number,
    patch: Partial<EditableCustomField>,
  ) => {
    setBatchForm((prev) => ({
      ...prev,
      customFields: prev.customFields.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    }));
  };

  const moveCustomFieldRow = (idx: number, delta: -1 | 1) => {
    setBatchForm((prev) => {
      const next = [...prev.customFields];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return prev;
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return { ...prev, customFields: next };
    });
  };

  const removeCustomFieldRow = (idx: number) => {
    setBatchForm((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((_, i) => i !== idx),
    }));
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentAct) return;
    try {
      const availableDates = batchForm.datesText
        .split(/[,，\n]/)
        .map((d) => d.trim())
        .filter(Boolean);
      const customFields = fromEditableFields(batchForm.customFields);
      const needsMissingOption = customFields.find(
        (f) =>
          (f.type === 'radio' || f.type === 'checkbox' || f.type === 'select') &&
          (!f.options || f.options.length === 0),
      );
      if (needsMissingOption) {
        pushToast({
          tone: 'error',
          title: `字段「${needsMissingOption.label}」至少需要配置 1 个选项`,
        });
        return;
      }

      if (editingBatchId) {
        await getApiClient().gifts.updateBatch(
          currentAct.id,
          editingBatchId,
          {
            name: batchForm.name,
            totalQuota: Number.parseInt(batchForm.totalQuota, 10) || 10,
            openAt: batchForm.openAt,
            closeAt: batchForm.closeAt,
            availableDates,
            customFields,
            enabled: batchForm.enabled,
          },
          user,
        );
        pushToast({ tone: 'success', title: `批次「${batchForm.name}」已更新` });
      } else {
        const created = await getApiClient().gifts.createBatch(
          {
            activityId: currentAct.id,
            name: batchForm.name,
            totalQuota: Number.parseInt(batchForm.totalQuota, 10) || 10,
            openAt: batchForm.openAt,
            closeAt: batchForm.closeAt,
            availableDates,
            customFields,
            enabled: batchForm.enabled,
          },
          user,
        );
        pushToast({
          tone: 'success',
          title: `批次「${created.name}」已创建`,
          detail: `分享码：${created.shareCode}`,
        });
      }
      setBatchModalOpen(false);
      await loadData();
    } catch (err) {
      pushToast({ tone: 'error', title: err instanceof Error ? err.message : '保存失败' });
    }
  };

  const handleDirectIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentAct) return;
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
        title: `已生成赠票 ${res.ticket.ticketCode}`,
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
      const msg = err instanceof Error ? err.message : '发放失败';
      if (msg.startsWith('DUPLICATE_IDENTITY:')) {
        setDuplicateWarning(msg.replace('DUPLICATE_IDENTITY:', ''));
      } else {
        pushToast({ tone: 'error', title: '发放赠票失败', detail: msg });
      }
    }
  };

  const handleBackendImport = async () => {
    if (!user || !currentAct) return;
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
      title: `已生成 ${res.created.length} 个受邀登记链接`,
      detail:
        res.duplicates.length > 0
          ? `已拦截重复身份 ${res.duplicates.length} 条`
          : undefined,
    });
    await loadData();
  };

  const ticketColumns: GlassTableColumn<GiftTicket>[] = [
    ...(isAllScope
      ? [
          {
            key: 'activity',
            header: '所属活动',
            render: (t: GiftTicket) => (
              <span className="text-xs text-slate-600">
                {activityById[t.activityId]?.name ?? t.activityId}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'code',
      header: '票务编号',
      sortable: true,
      sortValue: (t) => t.ticketCode,
      render: (t) => (
        <span className="order-number font-semibold text-[#0071e3]">{t.ticketCode}</span>
      ),
    },
    {
      key: 'holder',
      header: '持票人',
      render: (t) => <span className="font-medium text-slate-900">{t.name}</span>,
    },
    {
      key: 'idNumber',
      header: '证件号码',
      render: (t) => (
        <div className="text-xs space-y-0.5">
          <div className="text-slate-400">{ID_TYPE_LABELS[t.idType]}</div>
          <SensitiveFieldCell
            maskedValue={maskIdNumber(t.idNumber, false)}
            rawValue={t.idNumber}
            revealed={Boolean(revealedFields[`gt:${t.id}:id`])}
            canReveal={canRevealSensitive}
            fieldLabel={`${t.ticketCode} 证件号码`}
            onToggle={() =>
              toggleFieldReveal(
                `gt:${t.id}:id`,
                t.activityId,
                `${t.ticketCode} ${t.name}`,
                '证件号码',
              )
            }
          />
        </div>
      ),
    },
    {
      key: 'phone',
      header: '联系电话',
      render: (t) => (
        <SensitiveFieldCell
          maskedValue={maskPhone(t.countryCode, t.phone, false)}
          rawValue={`${t.countryCode} ${t.phone}`}
          revealed={Boolean(revealedFields[`gt:${t.id}:phone`])}
          canReveal={canRevealSensitive}
          fieldLabel={`${t.ticketCode} 联系电话`}
          onToggle={() =>
            toggleFieldReveal(
              `gt:${t.id}:phone`,
              t.activityId,
              `${t.ticketCode} ${t.name}`,
              '联系电话',
            )
          }
        />
      ),
    },
    {
      key: 'batch',
      header: '来源批次',
      render: (t) => (
        <div className="text-xs">
          <div className="font-medium text-slate-800">{t.batchName}</div>
          <div className="text-slate-400">
            {t.mode === 'self_claim'
              ? '自助领票'
              : t.mode === 'backend_import'
                ? '受邀链接'
                : '后台发放'}
          </div>
        </div>
      ),
    },
    {
      key: 'date',
      header: '使用日期',
      sortable: true,
      sortValue: (t) => t.useDate,
      render: (t) => <span className="date-number font-medium text-slate-800">{t.useDate}</span>,
    },
    {
      key: 'status',
      header: '状态',
      render: (t) => (
        <StatusIndicator tone={giftTone(t.status)} label={GIFT_STATUS_LABELS[t.status]} />
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (t) => {
        const menuItems = [
          ...(t.status === 'waiting_fill' && t.claimLinkToken
            ? [
                {
                  label: '打开邀请页',
                  icon: <ExternalLink className="w-3.5 h-3.5" />,
                  onClick: () => switchPortal('gift', { invitedGiftToken: t.claimLinkToken }),
                },
              ]
            : []),
          ...(!isAllScope && t.status === 'valid'
            ? [
                {
                  label: '作废赠票',
                  tone: 'danger' as const,
                  onClick: async () => {
                    if (!user || !currentAct) return;
                    await getApiClient().tickets.setTicketStatus(
                      currentAct.id,
                      t.id,
                      'voided',
                      '赠票管理员手动作废',
                      user,
                    );
                    pushToast({ tone: 'warning', title: `赠票 ${t.ticketCode} 已作废` });
                    await loadData();
                  },
                },
              ]
            : []),
        ];

        return (
          <div className="flex items-center justify-end gap-1">
            <GlassButton size="sm" variant="secondary" onClick={() => setPreviewTicket(t)}>
              <QrCode className="w-3.5 h-3.5" />
              凭证
            </GlassButton>
            {menuItems.length > 0 && (
              <GlassActionMenu items={menuItems} label={`更多操作：${t.ticketCode}`} />
            )}
          </div>
        );
      },
    },
  ];

  const batchColumns: GlassTableColumn<GiftBatch>[] = [
    ...(isAllScope
      ? [
          {
            key: 'activity',
            header: '所属活动',
            render: (b: GiftBatch) => (
              <span className="text-xs text-slate-600">
                {activityById[b.activityId]?.name ?? b.activityId}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'name',
      header: '批次名称',
      render: (b) => (
        <div className="min-w-0">
          <div className="font-medium text-slate-900 truncate">{b.name}</div>
          <div className="text-xs text-slate-400 numeric-text mt-0.5">
            {b.shareCode} · 字段 {b.customFields.length} 项
          </div>
        </div>
      ),
    },
    {
      key: 'dates',
      header: '开放日期',
      render: (b) => (
        <span className="text-xs text-slate-700 date-number">
          {b.availableDates.join('、')}
        </span>
      ),
    },
    {
      key: 'quota',
      header: '领取 / 配额',
      render: (b) => {
        const pct =
          b.totalQuota > 0 ? Math.min(100, Math.round((b.claimedCount / b.totalQuota) * 100)) : 0;
        return (
          <div className="min-w-[120px] space-y-1">
            <div className="flex items-center justify-between text-xs stat-number">
              <span className="font-medium text-slate-800">
                {b.claimedCount} / {b.totalQuota}
              </span>
              <span className="text-slate-400">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-900/[0.07] overflow-hidden">
              <div className="h-full rounded-full bg-[#0071e3]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'window',
      header: '开放时间',
      render: (b) => (
        <div className="text-xs text-slate-600 date-number whitespace-nowrap">
          <div>{formatDateTimeDisplay(b.openAt).slice(5)}</div>
          <div className="text-slate-400">~ {formatDateTimeDisplay(b.closeAt).slice(5)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: '状态',
      render: (b) => (
        <StatusIndicator
          tone={b.enabled ? 'success' : 'neutral'}
          label={b.enabled ? '已启用' : '已停用'}
        />
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (b) => {
        const menuItems = [
          {
            label: '打开领票页',
            icon: <ExternalLink className="w-3.5 h-3.5" />,
            onClick: () => switchPortal('gift', { giftBatchId: b.id }),
          },
          {
            label: '复制分享码',
            icon: <Copy className="w-3.5 h-3.5" />,
            onClick: () => {
              navigator.clipboard?.writeText(b.shareCode).catch(() => {});
              pushToast({ tone: 'success', title: `已复制分享码：${b.shareCode}` });
            },
          },
          ...(!isAllScope && currentAct
            ? [
                {
                  label: '配置字段',
                  icon: <Edit3 className="w-3.5 h-3.5" />,
                  onClick: () => openEditBatchModal(b),
                },
                {
                  label: b.enabled ? '停用批次' : '启用批次',
                  tone: b.enabled ? ('danger' as const) : ('default' as const),
                  onClick: async () => {
                    if (!user) return;
                    await getApiClient().gifts.updateBatch(
                      currentAct.id,
                      b.id,
                      { enabled: !b.enabled },
                      user,
                    );
                    await loadData();
                  },
                },
              ]
            : []),
        ];

        return (
          <div className="flex items-center justify-end gap-1">
            <GlassButton
              size="sm"
              variant="secondary"
              onClick={() => switchPortal('gift', { giftBatchId: b.id })}
            >
              领票页
            </GlassButton>
            <GlassActionMenu items={menuItems} label={`更多操作：${b.name}`} />
          </div>
        );
      },
    },
  ];

  return (
    <PageContainer className="space-y-5">
      {isAllScope && (
        <AllActivityReadonlyNotice onSelectActivity={() => navigateAdmin('activities')} />
      )}

      <GlassToolbar>
        <GlassTabs
          variant="embedded"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'batches', label: '自助批次' },
            { id: 'backend_issue', label: '后台发放' },
            { id: 'tickets', label: '赠票名单' },
          ]}
        />
        <div className="flex items-center gap-2">
          <GlassButton size="sm" variant="secondary" onClick={() => switchPortal('gift')}>
            <ExternalLink className="w-3.5 h-3.5" />
            领票页
          </GlassButton>
          <GlassButton
            size="sm"
            variant="primary"
            disabled={isAllScope}
            onClick={openCreateBatchModal}
          >
            <Plus className="w-4 h-4" />
            新建批次
          </GlassButton>
        </div>
      </GlassToolbar>

      {tab === 'batches' && (
        <GlassTable
          rows={batches}
          columns={batchColumns}
          loading={loading}
          emptyTitle="暂无自助赠票批次"
        />
      )}

      {tab === 'backend_issue' && (
        <GlassCard className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-900/[0.06]">
              <h2 className="text-sm font-semibold text-slate-900">后台发放赠票</h2>
              <GlassTabs
                value={issueMode}
                onChange={setIssueMode}
                tabs={[
                  { id: 'single', label: '单张发放' },
                  { id: 'batch', label: '批量导入' },
                ]}
              />
            </div>

            {issueMode === 'single' ? (
              <form onSubmit={handleDirectIssue} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <GlassInput
                    label="批次名称"
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
                    onValueChange={(val) =>
                      setDirectForm({ ...directForm, idType: val as IdType })
                    }
                    options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                  />
                  <GlassInput
                    label="证件号码"
                    required
                    numeric
                    value={directForm.idNumber}
                    onChange={(e) => setDirectForm({ ...directForm, idNumber: e.target.value })}
                  />
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <GlassSelect
                      label="区号"
                      searchable
                      value={directForm.countryCode}
                      onValueChange={(val) => setDirectForm({ ...directForm, countryCode: val })}
                      options={COUNTRY_CODE_OPTIONS}
                    />
                    <GlassInput
                      label="联系电话"
                      required
                      numeric
                      value={directForm.phone}
                      onChange={(e) => setDirectForm({ ...directForm, phone: e.target.value })}
                    />
                  </div>
                  <GlassInput
                    label="使用日期"
                    type="date"
                    numeric
                    required
                    value={directForm.useDate}
                    onChange={(e) => setDirectForm({ ...directForm, useDate: e.target.value })}
                  />
                </div>

                <GlassUpload
                  label="自拍照片（留空则生成专属邀请链接）"
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
                      授权为同一身份额外增发独立票码赠票
                    </label>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <GlassButton type="submit" variant="primary" disabled={isAllScope}>
                    发放赠票
                  </GlassButton>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <GlassInput
                    label="导入批次名称"
                    value={importBatchName}
                    onChange={(e) => setImportBatchName(e.target.value)}
                  />
                  <GlassInput
                    label="默认使用日期"
                    type="date"
                    numeric
                    value={importUseDate}
                    onChange={(e) => setImportUseDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-700">CSV 名单内容</label>
                  <textarea
                    rows={7}
                    value={importCsv}
                    onChange={(e) => setImportCsv(e.target.value)}
                    className="glass-input p-3 text-xs numeric-text"
                    placeholder="姓名,证件类型,证件号码,国际区号,联系电话"
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <GlassButton
                    variant="primary"
                    disabled={isAllScope}
                    onClick={handleBackendImport}
                  >
                    <Upload className="w-4 h-4" />
                    导入并生成邀请链接
                  </GlassButton>
                </div>
              </div>
            )}
        </GlassCard>
      )}

      {tab === 'tickets' && (
        <GlassTable
          rows={filteredTickets}
          columns={ticketColumns}
          loading={loading}
          searchValue={ticketSearch}
          onSearchChange={setTicketSearch}
          searchPlaceholder="搜索票务编号、姓名或批次..."
          filterSlot={
            <GlassSelect
              size="sm"
              aria-label="按状态筛选赠票"
              value={statusFilter}
              onValueChange={(val) => setStatusFilter(val as GiftTicketStatus | 'all')}
              className="w-36"
              options={[
                { value: 'all', label: '全部状态' },
                ...Object.entries(GIFT_STATUS_LABELS).map(([k, l]) => ({
                  value: k,
                  label: l,
                })),
              ]}
            />
          }
          onExportCsv={() => {
            const csv = buildCsvDownloadContent(
              ['票务编号', '姓名', '证件号码', '联系电话', '来源批次', '使用日期', '状态', '核销时间'],
              filteredTickets.map((t) => [
                t.ticketCode,
                t.name,
                maskIdNumber(t.idNumber, false),
                maskPhone(t.countryCode, t.phone, false),
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
            a.download = `gift-tickets-${currentAct?.code ?? 'ALL'}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        />
      )}

      {/* Create / Edit Batch Dialog with 7-Type Custom Field Builder */}
      <GlassDialog
        open={batchModalOpen}
        title={editingBatchId ? '配置自助赠票批次' : '新建自助赠票批次'}
        onClose={() => setBatchModalOpen(false)}
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSaveBatch} className="space-y-5">
          <GlassInput
            label="批次名称"
            required
            value={batchForm.name}
            onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })}
            placeholder="例如：高校社团专享赠票"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <GlassInput
              label="总配额"
              type="number"
              min={1}
              required
              numeric
              value={batchForm.totalQuota}
              onChange={(e) => setBatchForm({ ...batchForm, totalQuota: e.target.value })}
            />
            <GlassInput
              label="可选使用日期（逗号分隔）"
              required
              numeric
              value={batchForm.datesText}
              onChange={(e) => setBatchForm({ ...batchForm, datesText: e.target.value })}
              placeholder="2026-11-26, 2026-11-27"
            />
            <GlassDatePicker
              label="开放时间"
              value={batchForm.openAt}
              onChange={(v) => setBatchForm({ ...batchForm, openAt: v })}
            />
            <GlassDatePicker
              label="截止时间"
              value={batchForm.closeAt}
              onChange={(v) => setBatchForm({ ...batchForm, closeAt: v })}
            />
          </div>

          {/* 7-Type Custom Field Builder */}
          <div className="pt-4 border-t border-slate-900/[0.08] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">自定义登记字段</h3>
              <GlassButton size="sm" variant="secondary" onClick={addCustomFieldRow}>
                <Plus className="w-3.5 h-3.5" />
                添加字段
              </GlassButton>
            </div>

            {batchForm.customFields.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center glass-surface-subtle">
                暂未配置自定义字段
              </p>
            ) : (
              <div className="space-y-3">
                {batchForm.customFields.map((field, idx) => {
                  const hasOptions =
                    field.type === 'radio' ||
                    field.type === 'checkbox' ||
                    field.type === 'select';
                  return (
                    <div
                      key={field.id}
                      className="glass-surface-subtle p-3.5 space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                        <div className="sm:col-span-5">
                          <GlassInput
                            label="字段名称"
                            required
                            value={field.label}
                            onChange={(e) =>
                              updateCustomFieldRow(idx, { label: e.target.value })
                            }
                            placeholder="如 所属媒体 / 到场时段"
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <GlassSelect
                            label="字段类型"
                            value={field.type}
                            onValueChange={(val) =>
                              updateCustomFieldRow(idx, { type: val as CustomFieldType })
                            }
                            options={CUSTOM_FIELD_TYPE_OPTIONS}
                          />
                        </div>
                        <div className="sm:col-span-3 flex items-center justify-end gap-1 pb-1">
                          <button
                            type="button"
                            aria-label="上移字段"
                            disabled={idx === 0}
                            onClick={() => moveCustomFieldRow(idx, -1)}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="下移字段"
                            disabled={idx === batchForm.customFields.length - 1}
                            onClick={() => moveCustomFieldRow(idx, 1)}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-white disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="删除字段"
                            onClick={() => removeCustomFieldRow(idx)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                        {hasOptions ? (
                          <div className="sm:col-span-9">
                            <GlassInput
                              label="选项列表（逗号分隔）"
                              required
                              value={field.optionsText}
                              onChange={(e) =>
                                updateCustomFieldRow(idx, { optionsText: e.target.value })
                              }
                              placeholder="选项一, 选项二, 选项三"
                            />
                          </div>
                        ) : (
                          <div className="sm:col-span-9">
                            <GlassInput
                              label="占位提示（选填）"
                              value={field.placeholder}
                              onChange={(e) =>
                                updateCustomFieldRow(idx, { placeholder: e.target.value })
                              }
                              placeholder="选填"
                            />
                          </div>
                        )}
                        <label className="sm:col-span-3 flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-5">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) =>
                              updateCustomFieldRow(idx, { required: e.target.checked })
                            }
                            className="w-4 h-4 accent-[#0071e3]"
                          />
                          必填字段
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <GlassButton variant="secondary" onClick={() => setBatchModalOpen(false)}>
              取消
            </GlassButton>
            <GlassButton type="submit" variant="primary">
              保存批次
            </GlassButton>
          </div>
        </form>
      </GlassDialog>

      <GlassDialog
        open={Boolean(previewTicket)}
        title="电子赠票"
        onClose={() => setPreviewTicket(null)}
        maxWidthClass="max-w-md"
      >
        {previewTicket && (
          <ElectronicCredentialCard
            credentialKind="gift"
            credentialId={previewTicket.id}
            activityId={previewTicket.activityId}
            activityName={activityById[previewTicket.activityId]?.name ?? currentAct?.name ?? ''}
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
    </PageContainer>
  );
}
