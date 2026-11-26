import React, { useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Plus,
  QrCode,
  RefreshCw,
  Upload,
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
import { GlassDialog, GlassDrawer } from '../../components/glass/GlassOverlay';
import { GlassTable, type GlassTableColumn } from '../../components/glass/GlassTable';
import { ElectronicCredentialCard, formatValidDateRange } from '../../components/qr/GlassQRCode';
import { getApiClient } from '../../services/api';
import {
  CERTIFICATE_STATUS_LABELS,
  COUNTRY_CODES,
  ID_TYPE_LABELS,
  buildCsvDownloadContent,
  maskIdNumber,
  maskPhone,
  normalizeIdentityKey,
  parseMemberImportCsv,
} from '../../utils/stateMachines';
import type {
  BatchImportRowPreview,
  CertificateCategory,
  CertificateStatus,
  EntryLinkMode,
  Exhibitor,
  ExhibitorMember,
  IdType,
} from '../../types/domain';

function memberTone(status: CertificateStatus) {
  switch (status) {
    case 'badge_claimed':
    case 'credential_generated':
    case 'avatar_completed':
      return 'success' as const;
    case 'waiting_avatar':
    case 'submitted':
    case 'pending':
      return 'warning' as const;
    case 'frozen':
    case 'voided':
      return 'danger' as const;
    default:
      return 'info' as const;
  }
}

export function ExhibitorsPage() {
  const {
    user,
    role,
    activeActivity,
    activities,
    realtimeVersion,
    canAccessModule,
    switchPortal,
    pushToast,
  } = useApp();

  const currentAct = activeActivity ?? activities[0] ?? null;
  const [subTab, setSubTab] = useState<'exhibitors' | 'members' | 'avatars'>('exhibitors');
  const [loading, setLoading] = useState(true);
  const [exhibitors, setExhibitors] = useState<Exhibitor[]>([]);
  const [members, setMembers] = useState<ExhibitorMember[]>([]);
  const [categories, setCategories] = useState<CertificateCategory[]>([]);
  const [search, setSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CertificateStatus | 'all'>('all');
  const [revealSensitive, setRevealSensitive] = useState(false);

  // Modals & Drawers
  const [createOpen, setCreateOpen] = useState(false);
  const [detailExhibitor, setDetailExhibitor] = useState<Exhibitor | null>(null);
  const [quotaModal, setQuotaModal] = useState<{ exhibitor: Exhibitor; quota: string; reason: string } | null>(null);
  const [previewMember, setPreviewMember] = useState<ExhibitorMember | null>(null);
  const [importModalExhibitor, setImportModalExhibitor] = useState<Exhibitor | null>(null);
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<BatchImportRowPreview[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Create Exhibitor Form
  const [newEx, setNewEx] = useState({
    boothNumber: '',
    boothName: '',
    primaryContactName: '',
    primaryIdType: 'cn_id' as IdType,
    primaryIdNumber: '',
    countryCode: '+86',
    phone: '',
    quota: '6',
    entryModeOverride: '' as '' | EntryLinkMode,
  });

  // Add Member inside Detail Drawer
  const [newMember, setNewMember] = useState({
    name: '',
    idType: 'cn_id' as IdType,
    idNumber: '',
    countryCode: '+86',
    phone: '',
    roleNote: '',
  });

  const loadData = async () => {
    if (!currentAct) return;
    setLoading(true);
    try {
      const api = getApiClient();
      const [ex, mem, cats] = await Promise.all([
        api.exhibitors.list(currentAct.id),
        api.members.list(currentAct.id),
        api.certificates.listCategories(currentAct.id),
      ]);
      setExhibitors(ex);
      setMembers(mem);
      setCategories(cats);
      if (detailExhibitor) {
        const refreshed = ex.find((e) => e.id === detailExhibitor.id) ?? null;
        setDetailExhibitor(refreshed);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentAct?.id, realtimeVersion]);

  const filteredExhibitors = useMemo(() => {
    if (!search.trim()) return exhibitors;
    const q = search.trim().toLowerCase();
    return exhibitors.filter(
      (e) =>
        e.boothNumber.toLowerCase().includes(q) ||
        e.boothName.toLowerCase().includes(q) ||
        e.primaryContactName.toLowerCase().includes(q) ||
        e.phone.includes(q),
    );
  }, [exhibitors, search]);

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (memberSearch.trim()) {
        const q = memberSearch.trim().toLowerCase();
        return (
          m.memberCode.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.boothNumber.toLowerCase().includes(q) ||
          m.phone.includes(q)
        );
      }
      return true;
    });
  }, [members, statusFilter, memberSearch]);

  if (!canAccessModule('exhibitors')) {
    return (
      <PageContainer>
        <PermissionDeniedState moduleLabel="展商管理" />
      </PageContainer>
    );
  }

  if (!currentAct) return null;

  const toggleSensitive = async () => {
    if (!revealSensitive) {
      if (!role?.canViewUnmaskedSensitive) {
        pushToast({ tone: 'warning', title: '当前角色仅支持脱敏查看证件号与手机号' });
        return;
      }
      if (user) {
        await getApiClient().auditLogs.recordSensitiveView(
          currentAct.id,
          `${currentAct.name} 展商及人员敏感资料`,
          user,
        );
      }
    }
    setRevealSensitive((v) => !v);
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    pushToast({ tone: 'success', title: `已复制${label}`, detail: text });
  };

  const handleCreateExhibitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const res = await getApiClient().exhibitors.create(
        {
          activityId: currentAct.id,
          boothNumber: newEx.boothNumber,
          boothName: newEx.boothName,
          primaryContactName: newEx.primaryContactName,
          primaryIdType: newEx.primaryIdType,
          primaryIdNumber: newEx.primaryIdNumber,
          countryCode: newEx.countryCode,
          phone: newEx.phone,
          quota: Number.parseInt(newEx.quota, 10) || 1,
          entryModeOverride: newEx.entryModeOverride || null,
        },
        user,
      );
      setCreateOpen(false);
      setNewEx({
        boothNumber: '',
        boothName: '',
        primaryContactName: '',
        primaryIdType: 'cn_id',
        primaryIdNumber: '',
        countryCode: '+86',
        phone: '',
        quota: '6',
        entryModeOverride: '',
      });
      pushToast({
        tone: 'success',
        title: `展商 ${res.exhibitor.boothNumber} 创建成功`,
        detail: `唯一商务密码：${res.exhibitor.businessPassword}，已自动建档主联系人 ${res.primaryMember.memberCode}（演示结果）`,
      });
      await loadData();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: '创建展商失败',
        detail: err instanceof Error ? err.message : '请检查填写信息',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailExhibitor || !user) return;
    setSubmitting(true);
    try {
      const created = await getApiClient().members.addMember(
        {
          activityId: currentAct.id,
          exhibitorId: detailExhibitor.id,
          name: newMember.name,
          idType: newMember.idType,
          idNumber: newMember.idNumber,
          countryCode: newMember.countryCode,
          phone: newMember.phone,
          customFields: newMember.roleNote ? { 展位岗位: newMember.roleNote } : {},
        },
        { id: user.id, name: user.displayName, role: role?.name ?? '管理员' },
      );
      setNewMember({
        name: '',
        idType: 'cn_id',
        idNumber: '',
        countryCode: '+86',
        phone: '',
        roleNote: '',
      });
      pushToast({
        tone: 'success',
        title: `已新增人员 ${created.memberCode} ${created.name}`,
      });
      await loadData();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: '新增人员失败',
        detail: err instanceof Error ? err.message : '校验未通过',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadCsv = async (filename: string, headers: string[], rows: string[][]) => {
    const content = buildCsvDownloadContent(headers, rows);
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    if (user) {
      await getApiClient().auditLogs.recordDataExport(currentAct.id, filename, user);
    }
    pushToast({ tone: 'info', title: `已导出 ${filename}` });
  };

  const openBatchImport = (ex: Exhibitor) => {
    setImportModalExhibitor(ex);
    const sample = [
      '姓名,证件类型,证件号码,国际区号,联系电话,岗位说明',
      '周嘉宁,居民身份证,440106199506150028,+86,13900139011,展台运营',
      '陈泽楷,护照,E88221109,+852,92341234,海外翻译',
    ].join('\n');
    setImportText(sample);
    const exMembers = members.filter((m) => m.exhibitorId === ex.id && m.status !== 'voided');
    const existingKeys = new Set(exMembers.map((m) => normalizeIdentityKey(m.idType, m.idNumber)));
    const remaining = Math.max(0, ex.quota - exMembers.filter((m) => !m.isOnsiteExtra).length);
    setImportPreview(parseMemberImportCsv(sample, existingKeys, remaining));
  };

  const reparseImport = (text: string) => {
    setImportText(text);
    if (!importModalExhibitor) return;
    const exMembers = members.filter(
      (m) => m.exhibitorId === importModalExhibitor.id && m.status !== 'voided',
    );
    const existingKeys = new Set(exMembers.map((m) => normalizeIdentityKey(m.idType, m.idNumber)));
    const remaining = Math.max(
      0,
      importModalExhibitor.quota - exMembers.filter((m) => !m.isOnsiteExtra).length,
    );
    setImportPreview(parseMemberImportCsv(text, existingKeys, remaining));
  };

  const executeBatchImport = async () => {
    if (!importModalExhibitor || !user) return;
    setSubmitting(true);
    try {
      const res = await getApiClient().members.batchImport(
        currentAct.id,
        importModalExhibitor.id,
        importPreview,
        { id: user.id, name: user.displayName, role: role?.name ?? '管理员' },
      );
      pushToast({
        tone: 'success',
        title: `批量导入完成：成功 ${res.imported.length} 人`,
        detail:
          res.skippedCount > 0
            ? `已自动跳过 ${res.skippedCount} 行异常数据，有效数据已安全入库（演示结果）`
            : '所有有效行均已自动分配递增人员编号（演示结果）',
      });
      setImportModalExhibitor(null);
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const exhibitorColumns: GlassTableColumn<Exhibitor>[] = [
    {
      key: 'booth',
      header: '摊位与展位名称',
      sortable: true,
      sortValue: (e) => e.boothNumber,
      render: (e) => (
        <div>
          <span className="font-semibold text-[#0071e3] numeric-text mr-2">{e.boothNumber}</span>
          <span className="font-medium text-slate-900">{e.boothName}</span>
        </div>
      ),
    },
    {
      key: 'contact',
      header: '主要联系人',
      render: (e) => (
        <div className="text-xs space-y-0.5">
          <div className="font-medium text-slate-900">{e.primaryContactName}</div>
          <div className="text-slate-500 phone-number">
            {maskPhone(e.countryCode, e.phone, revealSensitive)} ·{' '}
            {maskIdNumber(e.primaryIdNumber, revealSensitive)}
          </div>
        </div>
      ),
    },
    {
      key: 'password',
      header: '唯一商务密码',
      render: (e) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="numeric-text font-medium text-slate-900">{e.businessPassword}</span>
          {!e.passwordActive && <StatusIndicator tone="danger" label="已停用" />}
          <button
            type="button"
            aria-label={`复制 ${e.boothNumber} 商务密码`}
            onClick={() => copyText(e.businessPassword, '商务密码')}
            className="text-slate-400 hover:text-[#0071e3] cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
    {
      key: 'mode',
      header: '链接入口模式',
      render: (e) => {
        const effective = e.entryModeOverride ?? currentAct.defaultEntryMode;
        return (
          <div className="text-xs">
            <div className="font-medium text-slate-800">
              {effective === 'A_INDEPENDENT' ? '模式 A · 独立链接' : '模式 B · 活动统一链接'}
            </div>
            <div className="text-slate-400">
              {e.entryModeOverride ? '展商单独覆盖' : '继承活动默认'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'quota',
      header: '登记进度 / 现场加证',
      align: 'right',
      render: (e) => {
        const exMembers = members.filter((m) => m.exhibitorId === e.id && m.status !== 'voided');
        const normalCount = exMembers.filter((m) => !m.isOnsiteExtra).length;
        return (
          <div className="table-number text-xs">
            <span className="font-semibold text-slate-900">
              {normalCount} / {e.quota}
            </span>
            {e.onsiteExtraCount > 0 && (
              <span className="text-[#0071e3] ml-1.5">+{e.onsiteExtraCount} 现场</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (e) => (
        <div className="flex items-center justify-end gap-1.5">
          <GlassButton size="sm" variant="secondary" onClick={() => setDetailExhibitor(e)}>
            详情与名单
          </GlassButton>
          <GlassButton
            size="sm"
            variant="ghost"
            onClick={() =>
              switchPortal('exhibitor', {
                exhibitorToken:
                  (e.entryModeOverride ?? currentAct.defaultEntryMode) === 'A_INDEPENDENT'
                    ? e.independentToken
                    : undefined,
                exhibitorPrefillBooth: e.boothNumber,
              })
            }
          >
            <ExternalLink className="w-3.5 h-3.5" />
            外部入口
          </GlassButton>
        </div>
      ),
    },
  ];

  const memberColumns: GlassTableColumn<ExhibitorMember>[] = [
    {
      key: 'code',
      header: '人员编号',
      sortable: true,
      sortValue: (m) => m.memberCode,
      render: (m) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#0071e3] order-number">{m.memberCode}</span>
          {m.isPrimaryContact && <span className="text-[11px] text-slate-500">主联系人</span>}
          {m.isOnsiteExtra && <span className="text-[11px] text-amber-700">现场加证</span>}
        </div>
      ),
    },
    {
      key: 'name',
      header: '姓名与头像',
      render: (m) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-200 shrink-0 flex items-center justify-center text-[11px] text-slate-500">
            {m.avatarUrl ? (
              <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" />
            ) : (
              '待拍'
            )}
          </div>
          <div>
            <div className="font-medium text-slate-900">{m.name}</div>
            <div className="text-xs text-slate-500">{m.boothNumber} 展位</div>
          </div>
        </div>
      ),
    },
    {
      key: 'id',
      header: '证件与电话',
      render: (m) => (
        <div className="text-xs space-y-0.5">
          <div className="text-slate-700 numeric-text">
            {ID_TYPE_LABELS[m.idType]} · {maskIdNumber(m.idNumber, revealSensitive)}
          </div>
          <div className="text-slate-500 phone-number">
            {maskPhone(m.countryCode, m.phone, revealSensitive)}
          </div>
        </div>
      ),
    },
    {
      key: 'cat',
      header: '证件类别',
      render: (m) => {
        const cat = categories.find((c) => c.id === m.certificateCategoryId);
        return <GlassBadge label={cat?.name ?? '展商证'} color={cat?.color} />;
      },
    },
    {
      key: 'status',
      header: '业务状态',
      render: (m) => (
        <StatusIndicator tone={memberTone(m.status)} label={CERTIFICATE_STATUS_LABELS[m.status]} />
      ),
    },
    {
      key: 'actions',
      header: '电子凭证',
      align: 'right',
      render: (m) => (
        <GlassButton size="sm" variant="secondary" onClick={() => setPreviewMember(m)}>
          <QrCode className="w-3.5 h-3.5" />
          查看凭证
        </GlassButton>
      ),
    },
  ];

  const detailMembers = detailExhibitor
    ? members.filter((m) => m.exhibitorId === detailExhibitor.id)
    : [];

  return (
    <PageContainer className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <GlassTabs
          value={subTab}
          onChange={setSubTab}
          tabs={[
            { id: 'exhibitors', label: '展商列表', count: exhibitors.length },
            { id: 'members', label: '全部人员', count: members.length },
            {
              id: 'avatars',
              label: '头像进度',
              count: members.filter((m) => !m.avatarUrl && m.status !== 'voided').length,
            },
          ]}
        />
        <div className="flex items-center gap-2">
          <GlassButton variant="secondary" onClick={toggleSensitive}>
            {revealSensitive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {revealSensitive ? '恢复脱敏' : '明文查看'}
          </GlassButton>
          <GlassButton variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            新建展商档案
          </GlassButton>
        </div>
      </div>

      {subTab === 'exhibitors' && (
        <GlassTable
          rows={filteredExhibitors}
          columns={exhibitorColumns}
          loading={loading}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜索摊位号、展位名称、联系人或手机号..."
          onExportCsv={() =>
            handleDownloadCsv(
              `exhibitors-${currentAct.code}.csv`,
              ['摊位号', '展位名称', '主要联系人', '证件类型', '证件号码', '电话', '申请名额', '现场加证'],
              filteredExhibitors.map((e) => [
                e.boothNumber,
                e.boothName,
                e.primaryContactName,
                ID_TYPE_LABELS[e.primaryIdType],
                maskIdNumber(e.primaryIdNumber, revealSensitive),
                maskPhone(e.countryCode, e.phone, revealSensitive),
                String(e.quota),
                String(e.onsiteExtraCount),
              ]),
            )
          }
          emptyTitle="暂无展商"
          emptyDescription="点击「新建展商档案」添加展商。"
        />
      )}

      {subTab === 'members' && (
        <GlassTable
          rows={filteredMembers}
          columns={memberColumns}
          loading={loading}
          searchValue={memberSearch}
          onSearchChange={setMemberSearch}
          searchPlaceholder="搜索人员编号（如 A01-01）、姓名、摊位号..."
          filterSlot={
            <select
              aria-label="按状态筛选人员"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as CertificateStatus | 'all')}
              className="glass-input h-[36px] px-3 text-xs"
            >
              <option value="all">全部证件状态</option>
              {Object.entries(CERTIFICATE_STATUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          }
          onExportCsv={() =>
            handleDownloadCsv(
              `members-${currentAct.code}.csv`,
              ['人员编号', '摊位号', '姓名', '证件类型', '证件号码', '电话', '状态', '现场加证'],
              filteredMembers.map((m) => [
                m.memberCode,
                m.boothNumber,
                m.name,
                ID_TYPE_LABELS[m.idType],
                maskIdNumber(m.idNumber, revealSensitive),
                maskPhone(m.countryCode, m.phone, revealSensitive),
                CERTIFICATE_STATUS_LABELS[m.status],
                m.isOnsiteExtra ? '是' : '否',
              ]),
            )
          }
        />
      )}

      {subTab === 'avatars' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {exhibitors.map((ex) => {
            const exMembers = members.filter((m) => m.exhibitorId === ex.id && m.status !== 'voided');
            const done = exMembers.filter((m) => Boolean(m.avatarUrl)).length;
            const pct = exMembers.length > 0 ? Math.round((done / exMembers.length) * 100) : 0;
            return (
              <GlassCard key={ex.id} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-[#0071e3] numeric-text mr-2">
                      {ex.boothNumber}
                    </span>
                    <span className="font-semibold text-slate-900">{ex.boothName}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900 stat-number">
                    {done} / {exMembers.length} ({pct}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-900/[0.07] overflow-hidden">
                  <div
                    className="h-full bg-[#0071e3] transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {exMembers.map((m) => (
                    <span
                      key={m.id}
                      className="text-slate-600 numeric-text"
                    >
                      {m.memberCode} {m.name}（{m.avatarUrl ? '已上传' : '待补拍'}）
                    </span>
                  ))}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <GlassDialog
        open={createOpen}
        title="新建展商档案"
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={handleCreateExhibitor} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GlassInput
              label="1. 摊位号"
              required
              numeric
              value={newEx.boothNumber}
              onChange={(e) => setNewEx({ ...newEx, boothNumber: e.target.value })}
              placeholder="例如：A05"
            />
            <GlassInput
              label="2. 展位名称"
              required
              value={newEx.boothName}
              onChange={(e) => setNewEx({ ...newEx, boothName: e.target.value })}
              placeholder="例如：云端幻想社"
            />
            <GlassInput
              label="3. 主要联系人姓名"
              required
              value={newEx.primaryContactName}
              onChange={(e) => setNewEx({ ...newEx, primaryContactName: e.target.value })}
              placeholder="主要联系人自动占 1 名额"
            />
            <GlassSelect
              label="4. 主要联系人证件类型"
              value={newEx.primaryIdType}
              onChange={(e) => setNewEx({ ...newEx, primaryIdType: e.target.value as IdType })}
              options={Object.entries(ID_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <GlassInput
              label="5. 主要联系人证件号码"
              required
              numeric
              value={newEx.primaryIdNumber}
              onChange={(e) => setNewEx({ ...newEx, primaryIdNumber: e.target.value })}
              placeholder="居民身份证 18 位或护照号"
            />
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-2">
                <GlassSelect
                  label="6. 国际区号"
                  value={newEx.countryCode}
                  onChange={(e) => setNewEx({ ...newEx, countryCode: e.target.value })}
                  options={COUNTRY_CODES.map((c) => ({ value: c.code, label: c.code }))}
                />
              </div>
              <div className="col-span-3">
                <GlassInput
                  label="联系电话"
                  required
                  numeric
                  value={newEx.phone}
                  onChange={(e) => setNewEx({ ...newEx, phone: e.target.value })}
                  placeholder="输入手机号"
                />
              </div>
            </div>
            <GlassInput
              label="申请人数名额"
              type="number"
              min={1}
              max={200}
              required
              numeric
              value={newEx.quota}
              onChange={(e) => setNewEx({ ...newEx, quota: e.target.value })}
              hint="主要联系人自动占 1 人，其余人员由展商补全"
            />
            <GlassSelect
              label="展商链接模式覆盖"
              value={newEx.entryModeOverride}
              onChange={(e) =>
                setNewEx({ ...newEx, entryModeOverride: e.target.value as '' | EntryLinkMode })
              }
              options={[
                { value: '', label: '继承活动默认模式' },
                { value: 'A_INDEPENDENT', label: '模式 A：独立专属链接 + 商务密码' },
                { value: 'B_UNIFIED', label: '模式 B：活动统一链接 + 商务密码' },
              ]}
            />
          </div>
          <div className="flex justify-end gap-2">
            <GlassButton variant="secondary" onClick={() => setCreateOpen(false)}>
              取消
            </GlassButton>
            <GlassButton type="submit" variant="primary" loading={submitting}>
              创建展商
            </GlassButton>
          </div>
        </form>
      </GlassDialog>

      <GlassDrawer
        open={Boolean(detailExhibitor)}
        title={detailExhibitor ? `${detailExhibitor.boothNumber} · ${detailExhibitor.boothName}` : ''}
        onClose={() => setDetailExhibitor(null)}
        widthClass="max-w-2xl"
      >
        {detailExhibitor && (
          <div className="space-y-6">
            <GlassCard subtle className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-500">唯一商务密码</p>
                  <p className="text-lg font-semibold text-slate-900 numeric-text">
                    {detailExhibitor.businessPassword}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <GlassButton
                    size="sm"
                    variant="secondary"
                    onClick={() => copyText(detailExhibitor.businessPassword, '商务密码')}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    复制
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (!user) return;
                      const updated = await getApiClient().exhibitors.resetBusinessPassword(
                        currentAct.id,
                        detailExhibitor.id,
                        user,
                      );
                      pushToast({
                        tone: 'success',
                        title: '已重置唯一商务密码',
                        detail: `新密码：${updated.businessPassword}`,
                      });
                      await loadData();
                    }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    重置密码
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    variant={detailExhibitor.passwordActive ? 'ghost' : 'primary'}
                    onClick={async () => {
                      if (!user) return;
                      await getApiClient().exhibitors.togglePasswordActive(
                        currentAct.id,
                        detailExhibitor.id,
                        !detailExhibitor.passwordActive,
                        user,
                      );
                      pushToast({
                        tone: 'info',
                        title: detailExhibitor.passwordActive ? '已停用该商务密码' : '已重新启用商务密码',
                      });
                      await loadData();
                    }}
                  >
                    {detailExhibitor.passwordActive ? '停用' : '启用'}
                  </GlassButton>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-900/[0.06] text-xs">
                <div>
                  <span className="text-slate-500 block">主要联系人</span>
                  <span className="font-medium text-slate-900 mt-0.5 block">
                    {detailExhibitor.primaryContactName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">申请名额 / 现场加证</span>
                  <span className="font-medium text-slate-900 numeric-text mt-0.5 block">
                    {detailExhibitor.quota} 人 / +{detailExhibitor.onsiteExtraCount} 人
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">专属链接 Token</span>
                  <span className="font-medium text-[#0071e3] numeric-text mt-0.5 block">
                    {detailExhibitor.independentToken}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <GlassButton
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setQuotaModal({
                      exhibitor: detailExhibitor,
                      quota: String(detailExhibitor.quota),
                      reason: '',
                    })
                  }
                >
                  调整申请名额
                </GlassButton>
                <GlassButton
                  size="sm"
                  variant="secondary"
                  onClick={() => openBatchImport(detailExhibitor)}
                >
                  <Upload className="w-3.5 h-3.5" />
                  批量导入人员
                </GlassButton>
                <GlassButton
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    switchPortal('exhibitor', {
                      exhibitorToken:
                        (detailExhibitor.entryModeOverride ?? currentAct.defaultEntryMode) ===
                        'A_INDEPENDENT'
                          ? detailExhibitor.independentToken
                          : undefined,
                      exhibitorPrefillBooth: detailExhibitor.boothNumber,
                    })
                  }
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  模拟展商进入空间
                </GlassButton>
              </div>
            </GlassCard>

            {/* Quick Add Member Form */}
            <form onSubmit={handleAddMember} className="glass-surface-subtle p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-[#0071e3]" />
                  新增展位人员（自动递增编号）
                </h3>
                <span className="text-xs text-slate-500 numeric-text">
                  已用常规名额：{detailMembers.filter((m) => !m.isOnsiteExtra && m.status !== 'voided').length} /{' '}
                  {detailExhibitor.quota}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <GlassInput
                  label="人员姓名"
                  required
                  value={newMember.name}
                  onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                />
                <GlassSelect
                  label="证件类型"
                  value={newMember.idType}
                  onChange={(e) => setNewMember({ ...newMember, idType: e.target.value as IdType })}
                  options={Object.entries(ID_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                />
                <GlassInput
                  label="证件号码"
                  required
                  numeric
                  value={newMember.idNumber}
                  onChange={(e) => setNewMember({ ...newMember, idNumber: e.target.value })}
                />
                <div className="grid grid-cols-5 gap-2">
                  <div className="col-span-2">
                    <GlassSelect
                      label="区号"
                      value={newMember.countryCode}
                      onChange={(e) => setNewMember({ ...newMember, countryCode: e.target.value })}
                      options={COUNTRY_CODES.map((c) => ({ value: c.code, label: c.code }))}
                    />
                  </div>
                  <div className="col-span-3">
                    <GlassInput
                      label="手机号"
                      required
                      numeric
                      value={newMember.phone}
                      onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <GlassButton type="submit" size="sm" variant="primary" loading={submitting}>
                  提交人员资料
                </GlassButton>
              </div>
            </form>

            {/* Members List */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">
                已登记人员（<span className="numeric-text">{detailMembers.length}</span> 人）
              </h3>
              <div className="divide-y divide-slate-900/[0.06] glass-surface-subtle px-4">
                {detailMembers.map((m) => (
                  <div key={m.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        <span className="text-[#0071e3] order-number mr-2">{m.memberCode}</span>
                        {m.name}
                        {m.isPrimaryContact && (
                          <span className="ml-2 text-[11px] text-slate-500">主联系人</span>
                        )}
                        {m.isOnsiteExtra && (
                          <span className="ml-2 text-[11px] text-amber-700">现场加证</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 phone-number mt-0.5">
                        {maskPhone(m.countryCode, m.phone, revealSensitive)} ·{' '}
                        {CERTIFICATE_STATUS_LABELS[m.status]}
                      </div>
                    </div>
                    <GlassButton size="sm" variant="secondary" onClick={() => setPreviewMember(m)}>
                      电子证件
                    </GlassButton>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </GlassDrawer>

      {/* Quota Adjust Dialog */}
      <GlassDialog
        open={Boolean(quotaModal)}
        title={`调整名额：${quotaModal?.exhibitor.boothNumber ?? ''} ${quotaModal?.exhibitor.boothName ?? ''}`}
        onClose={() => setQuotaModal(null)}
        maxWidthClass="max-w-md"
      >
        {quotaModal && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!user) return;
              try {
                await getApiClient().exhibitors.updateQuota(
                  currentAct.id,
                  quotaModal.exhibitor.id,
                  Number.parseInt(quotaModal.quota, 10) || 1,
                  quotaModal.reason,
                  user,
                );
                pushToast({ tone: 'success', title: '申请名额已更新并同步至展商空间' });
                setQuotaModal(null);
                await loadData();
              } catch (err) {
                pushToast({
                  tone: 'error',
                  title: err instanceof Error ? err.message : '调整失败',
                });
              }
            }}
            className="space-y-4"
          >
            <GlassInput
              label="新的常规申请名额"
              type="number"
              numeric
              min={1}
              required
              value={quotaModal.quota}
              onChange={(e) => setQuotaModal({ ...quotaModal, quota: e.target.value })}
            />
            <GlassInput
              label="调整原因（将写入审计日志）"
              required
              value={quotaModal.reason}
              onChange={(e) => setQuotaModal({ ...quotaModal, reason: e.target.value })}
              placeholder="例如：展位扩大增配名额"
            />
            <div className="flex justify-end gap-2">
              <GlassButton variant="secondary" onClick={() => setQuotaModal(null)}>
                取消
              </GlassButton>
              <GlassButton type="submit" variant="primary">
                确认调整
              </GlassButton>
            </div>
          </form>
        )}
      </GlassDialog>

      <GlassDialog
        open={Boolean(importModalExhibitor)}
        title={`批量导入人员：${importModalExhibitor?.boothNumber ?? ''} ${importModalExhibitor?.boothName ?? ''}`}
        onClose={() => setImportModalExhibitor(null)}
        maxWidthClass="max-w-3xl"
      >
        {importModalExhibitor && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <GlassButton
                size="sm"
                variant="secondary"
                onClick={() =>
                  handleDownloadCsv(
                    'exhibitor-member-template.csv',
                    ['姓名', '证件类型', '证件号码', '国际区号', '联系电话', '岗位说明'],
                    [['示例人员', '居民身份证', '440106199506150028', '+86', '13900139011', '现场运营']],
                  )
                }
              >
                <Download className="w-3.5 h-3.5" />
                下载导入模板
              </GlassButton>
              <label className="text-xs text-[#0071e3] font-medium cursor-pointer hover:underline">
                选择本地 CSV 文件
                <input
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    f.text().then(reparseImport);
                  }}
                />
              </label>
            </div>

            <textarea
              rows={5}
              value={importText}
              onChange={(e) => reparseImport(e.target.value)}
              className="glass-input w-full p-3 text-xs numeric-text"
              placeholder="粘贴 CSV / Excel 表格内容..."
            />

            <div className="space-y-2 max-h-56 overflow-y-auto">
              <p className="text-xs font-semibold text-slate-700 numeric-text">
                导入预览：共 {importPreview.length} 行 · 有效{' '}
                {importPreview.filter((r) => r.valid).length} 行 · 异常{' '}
                {importPreview.filter((r) => !r.valid).length} 行
              </p>
              {importPreview.map((row) => (
                <div
                  key={row.rowNumber}
                  className={`p-2.5 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 ${
                    row.valid
                      ? 'bg-emerald-50/80 text-emerald-950'
                      : 'bg-red-50/80 text-red-900'
                  }`}
                >
                  <span className="numeric-text">
                    第 {row.rowNumber} 行 · {row.name || '（无姓名）'} · {row.idNumber} ·{' '}
                    {row.countryCode} {row.phone}
                  </span>
                  <span>{row.valid ? '校验通过' : row.errors.join('；')}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <GlassButton variant="secondary" onClick={() => setImportModalExhibitor(null)}>
                取消
              </GlassButton>
              <GlassButton
                variant="primary"
                loading={submitting}
                disabled={importPreview.filter((r) => r.valid).length === 0}
                onClick={executeBatchImport}
              >
                确认导入有效数据（{importPreview.filter((r) => r.valid).length} 人）
              </GlassButton>
            </div>
          </div>
        )}
      </GlassDialog>

      <GlassDialog
        open={Boolean(previewMember)}
        title="电子证件"
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
            statusTone={memberTone(previewMember.status)}
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
