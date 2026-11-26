import React, { useEffect, useState } from 'react';
import { Building2, Clock, Plus, Shield, Users, WifiOff } from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import {
  GlassButton,
  GlassCard,
  GlassInput,
  GlassSelect,
  PermissionDeniedState,
  StatusIndicator,
} from '../../components/glass/GlassPrimitives';
import { GlassDialog } from '../../components/glass/GlassOverlay';
import { GlassTable, type GlassTableColumn } from '../../components/glass/GlassTable';
import { PageContainer } from '../../components/layout/PageContainer';
import { getApiClient } from '../../services/api';
import { buildCsvDownloadContent, formatDateTimeDisplay } from '../../utils/stateMachines';
import type {
  AdapterMode,
  AuditActionType,
  AuditLogEntry,
  Department,
  PermissionModule,
  RedemptionMode,
  RoleDefinition,
  SystemUser,
} from '../../types/domain';

const ALL_MODULES: Array<{ id: PermissionModule; label: string }> = [
  { id: 'dashboard', label: '工作台' },
  { id: 'activities', label: '活动管理' },
  { id: 'exhibitors', label: '展商管理' },
  { id: 'certificates', label: '证件管理' },
  { id: 'gifts', label: '赠票管理' },
  { id: 'redemption', label: '现场核销' },
  { id: 'users', label: '用户账号' },
  { id: 'roles', label: '角色权限' },
  { id: 'departments', label: '部门管理' },
  { id: 'audit_logs', label: '操作日志' },
  { id: 'settings', label: '系统设置' },
];

const AUDIT_ACTION_LABELS: Record<AuditActionType, string> = {
  create_activity: '创建活动',
  update_activity: '更新活动/配置',
  create_exhibitor: '创建展商',
  reset_business_password: '商务密码变更',
  member_add: '人员新增',
  member_update: '人员/名额修改',
  onsite_extra_badge: '现场加证',
  avatar_upload: '头像上传',
  badge_claim: '证件领取',
  gift_issue: '赠票发放',
  gift_void: '赠票作废',
  redemption: '扫码核销',
  duplicate_redemption: '重复核销拦截',
  view_sensitive: '查看敏感资料',
  data_export: '数据导出',
  permission_change: '权限/系统配置修改',
};

export function UsersManagePage() {
  const { user, canAccessModule, realtimeVersion, pushToast } = useApp();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const [editing, setEditing] = useState<SystemUser | null>(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    username: '',
    displayName: '',
    email: '',
    countryCode: '+86',
    phone: '',
    departmentId: 'dept-ops',
    roleId: 'role-badge',
    redemptionMode: 'normal' as RedemptionMode,
    active: true,
  });

  const load = async () => {
    const api = getApiClient();
    const [u, r, d] = await Promise.all([
      api.users.listUsers(),
      api.permissions.listRoles(),
      api.permissions.listDepartments(),
    ]);
    setUsers(u);
    setRoles(r);
    setDepts(d);
  };

  useEffect(() => {
    load();
  }, [realtimeVersion]);

  if (!canAccessModule('users')) {
    return (
      <PageContainer>
        <PermissionDeniedState moduleLabel="用户账号" />
      </PageContainer>
    );
  }

  const openModal = (target?: SystemUser) => {
    if (target) {
      setEditing(target);
      setForm({
        username: target.username,
        displayName: target.displayName,
        email: target.email,
        countryCode: target.countryCode,
        phone: target.phone,
        departmentId: target.departmentId,
        roleId: target.roleId,
        redemptionMode: target.redemptionMode,
        active: target.active,
      });
    } else {
      setEditing(null);
      setForm({
        username: '',
        displayName: '',
        email: '',
        countryCode: '+86',
        phone: '',
        departmentId: depts[0]?.id ?? 'dept-ops',
        roleId: roles[2]?.id ?? 'role-badge',
        redemptionMode: 'normal',
        active: true,
      });
    }
    setCreating(true);
  };

  const columns: GlassTableColumn<SystemUser>[] = [
    {
      key: 'user',
      header: '员工姓名 / 账号',
      render: (u) => (
        <div>
          <div className="font-medium text-slate-900">{u.displayName}</div>
          <div className="text-xs text-slate-500">{u.username} · {u.email}</div>
        </div>
      ),
    },
    {
      key: 'dept',
      header: '所属部门',
      render: (u) => depts.find((d) => d.id === u.departmentId)?.name ?? '—',
    },
    {
      key: 'role',
      header: '角色',
      render: (u) => roles.find((r) => r.id === u.roleId)?.name ?? '—',
    },
    {
      key: 'mode',
      header: '核销默认模式',
      render: (u) => (
        <span className="text-xs text-slate-700">
          {u.redemptionMode === 'fast' ? '快速自动核销' : '普通人工确认'}
        </span>
      ),
    },
    {
      key: 'status',
      header: '状态',
      render: (u) => (
        <StatusIndicator tone={u.active ? 'success' : 'danger'} label={u.active ? '正常' : '停用'} />
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (u) => (
        <GlassButton size="sm" variant="secondary" onClick={() => openModal(u)}>
          编辑权限
        </GlassButton>
      ),
    },
  ];

  return (
    <PageContainer className="space-y-5">
      <div className="flex items-center justify-end">
        <GlassButton variant="primary" onClick={() => openModal()}>
          <Plus className="w-4 h-4" />
          新增账号
        </GlassButton>
      </div>
      <GlassTable rows={users} columns={columns} searchable={false} />

      <GlassDialog
        open={creating}
        title={editing ? `编辑用户：${editing.displayName}` : '新增内部员工账号'}
        onClose={() => setCreating(false)}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!user) return;
            await getApiClient().users.saveUser(
              {
                id: editing?.id,
                ...form,
                authorizedActivityIds: 'ALL',
              },
              user,
            );
            pushToast({ tone: 'success', title: `用户「${form.displayName}」已保存` });
            setCreating(false);
            await load();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <GlassInput
              label="登录账号"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <GlassInput
              label="员工姓名"
              required
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            />
            <GlassInput
              label="工作邮箱"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <GlassInput
              label="联系电话"
              numeric
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <GlassSelect
              label="所属部门"
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              options={depts.map((d) => ({ value: d.id, label: d.name }))}
            />
            <GlassSelect
              label="分配角色"
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
            />
            <GlassSelect
              label="核销默认模式"
              value={form.redemptionMode}
              onChange={(e) => setForm({ ...form, redemptionMode: e.target.value as RedemptionMode })}
              options={[
                { value: 'normal', label: '普通模式（扫码预览后人工确认）' },
                { value: 'fast', label: '快速模式（扫码自动验证并核销）' },
              ]}
            />
          </div>
          <div className="flex justify-end gap-2">
            <GlassButton variant="secondary" onClick={() => setCreating(false)}>
              取消
            </GlassButton>
            <GlassButton type="submit" variant="primary">
              保存用户
            </GlassButton>
          </div>
        </form>
      </GlassDialog>
    </PageContainer>
  );
}

export function RolesManagePage() {
  const { user, canAccessModule, realtimeVersion, pushToast } = useApp();
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [editing, setEditing] = useState<{
    id?: string;
    code: string;
    name: string;
    description: string;
    modules: PermissionModule[];
    defaultRedemptionMode: RedemptionMode;
    canViewUnmaskedSensitive: boolean;
    canOverrideDuplicateGift: boolean;
  } | null>(null);

  const load = async () => {
    setRoles(await getApiClient().permissions.listRoles());
  };

  useEffect(() => {
    load();
  }, [realtimeVersion]);

  if (!canAccessModule('roles')) {
    return (
      <PageContainer>
        <PermissionDeniedState moduleLabel="角色权限" />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-5">
      <div className="flex items-center justify-end">
        <GlassButton
          variant="primary"
          onClick={() =>
            setEditing({
              code: '',
              name: '',
              description: '',
              modules: ['dashboard', 'redemption'],
              defaultRedemptionMode: 'normal',
              canViewUnmaskedSensitive: false,
              canOverrideDuplicateGift: false,
            })
          }
        >
          <Plus className="w-4 h-4" />
          新增角色
        </GlassButton>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((r) => (
          <GlassCard key={r.id} className="space-y-3 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#0071e3]" />
                  {r.name}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
              </div>
              <GlassButton size="sm" variant="secondary" onClick={() => setEditing({ ...r })}>
                配置模块
              </GlassButton>
            </div>
            <div className="text-xs text-slate-600 leading-relaxed">
              已授权模块：
              {r.modules
                .map((m) => ALL_MODULES.find((x) => x.id === m)?.label ?? m)
                .join(' · ')}
            </div>
            <div className="text-xs text-slate-500 pt-2 border-t border-slate-900/[0.06] flex flex-wrap gap-3">
              <span>敏感明文查看：{r.canViewUnmaskedSensitive ? '允许（审计记录）' : '默认脱敏'}</span>
              <span>重复赠票授权增发：{r.canOverrideDuplicateGift ? '允许' : '禁止'}</span>
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassDialog
        open={Boolean(editing)}
        title={editing?.id ? `编辑角色权限：${editing.name}` : '新增自定义角色'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!user) return;
              await getApiClient().permissions.saveRole(editing, user);
              pushToast({ tone: 'success', title: `角色「${editing.name}」权限已更新` });
              setEditing(null);
              await load();
            }}
            className="space-y-4"
          >
            <GlassInput
              label="角色名称"
              required
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <GlassInput
              label="角色说明"
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">可访问业务模块</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_MODULES.map((mod) => {
                  const checked = editing.modules.includes(mod.id);
                  return (
                    <label
                      key={mod.id}
                      className="flex items-center gap-2 text-xs text-slate-800 p-2 rounded-xl bg-white/60 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setEditing({
                            ...editing,
                            modules: checked
                              ? editing.modules.filter((m) => m !== mod.id)
                              : [...editing.modules, mod.id],
                          })
                        }
                        className="w-4 h-4 accent-[#0071e3]"
                      />
                      {mod.label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t border-slate-900/[0.06]">
              <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.canViewUnmaskedSensitive}
                  onChange={(e) =>
                    setEditing({ ...editing, canViewUnmaskedSensitive: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#0071e3]"
                />
                允许明文查看脱敏证件号与手机号（自动记录审计日志）
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.canOverrideDuplicateGift}
                  onChange={(e) =>
                    setEditing({ ...editing, canOverrideDuplicateGift: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#0071e3]"
                />
                允许后台授权为同一身份增发独立票码赠票
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <GlassButton variant="secondary" onClick={() => setEditing(null)}>
                取消
              </GlassButton>
              <GlassButton type="submit" variant="primary">
                保存角色配置
              </GlassButton>
            </div>
          </form>
        )}
      </GlassDialog>
    </PageContainer>
  );
}

export function DepartmentsManagePage() {
  const { user, canAccessModule, realtimeVersion, pushToast } = useApp();
  const [depts, setDepts] = useState<Department[]>([]);
  const [editing, setEditing] = useState<{ id?: string; name: string; description: string } | null>(
    null,
  );

  const load = async () => setDepts(await getApiClient().permissions.listDepartments());
  useEffect(() => {
    load();
  }, [realtimeVersion]);

  if (!canAccessModule('departments')) {
    return (
      <PageContainer>
        <PermissionDeniedState moduleLabel="部门管理" />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-5">
      <div className="flex items-center justify-end">
        <GlassButton variant="primary" onClick={() => setEditing({ name: '', description: '' })}>
          <Plus className="w-4 h-4" />
          新增部门
        </GlassButton>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {depts.map((d) => (
          <GlassCard key={d.id} className="space-y-3 min-w-0">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#0071e3]" />
                {d.name}
              </h2>
              <span className="text-xs text-slate-500 numeric-text flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> {d.memberCount} 人
              </span>
            </div>
            <p className="text-xs text-slate-600">{d.description}</p>
            <div className="flex justify-end">
              <GlassButton
                size="sm"
                variant="secondary"
                onClick={() => setEditing({ id: d.id, name: d.name, description: d.description })}
              >
                编辑部门
              </GlassButton>
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassDialog
        open={Boolean(editing)}
        title={editing?.id ? '编辑部门' : '新增部门'}
        onClose={() => setEditing(null)}
        maxWidthClass="max-w-md"
      >
        {editing && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!user) return;
              await getApiClient().permissions.saveDepartment(editing, user);
              pushToast({ tone: 'success', title: `部门「${editing.name}」已保存` });
              setEditing(null);
              await load();
            }}
            className="space-y-4"
          >
            <GlassInput
              label="部门名称"
              required
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <GlassInput
              label="职责说明"
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <GlassButton variant="secondary" onClick={() => setEditing(null)}>
                取消
              </GlassButton>
              <GlassButton type="submit" variant="primary">
                保存
              </GlassButton>
            </div>
          </form>
        )}
      </GlassDialog>
    </PageContainer>
  );
}

export function AuditLogsPage() {
  const { activeActivityId, canAccessModule, realtimeVersion } = useApp();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    getApiClient()
      .auditLogs.list({
        activityId: activeActivityId === 'ALL' ? 'all' : activeActivityId,
        action: actionFilter,
        search,
      })
      .then(setLogs);
  }, [activeActivityId, actionFilter, search, realtimeVersion]);

  if (!canAccessModule('audit_logs')) {
    return (
      <PageContainer>
        <PermissionDeniedState moduleLabel="操作日志" />
      </PageContainer>
    );
  }

  const columns: GlassTableColumn<AuditLogEntry>[] = [
    {
      key: 'time',
      header: '时间',
      sortable: true,
      sortValue: (l) => l.timestamp,
      render: (l) => <span className="date-number text-xs">{formatDateTimeDisplay(l.timestamp)}</span>,
    },
    {
      key: 'actor',
      header: '操作人',
      render: (l) => (
        <div className="text-xs">
          <div className="font-medium text-slate-900">{l.actorName}</div>
          <div className="text-slate-400">{l.actorRole}</div>
        </div>
      ),
    },
    {
      key: 'act',
      header: '活动 / 操作类型',
      render: (l) => (
        <div className="text-xs">
          <div className="font-medium text-slate-800">{AUDIT_ACTION_LABELS[l.action] ?? l.action}</div>
          <div className="text-slate-400">{l.activityName}</div>
        </div>
      ),
    },
    {
      key: 'target',
      header: '业务对象与状态变更',
      render: (l) => (
        <div className="text-xs space-y-0.5">
          <div className="font-medium text-slate-900">{l.targetLabel}</div>
          <div className="text-slate-500">
            {l.beforeState} → {l.afterState}
          </div>
        </div>
      ),
    },
    {
      key: 'reason',
      header: '原因',
      render: (l) => <span className="text-xs text-slate-600">{l.reason}</span>,
    },
    {
      key: 'res',
      header: '结果',
      render: (l) => (
        <StatusIndicator
          tone={l.result === 'success' ? 'success' : 'danger'}
          label={l.result === 'success' ? '成功' : '已拦截'}
        />
      ),
    },
  ];

  return (
    <PageContainer className="space-y-5">
      <GlassTable
        rows={logs}
        columns={columns}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="搜索操作人、对象编号或原因..."
        filterSlot={
          <select
            aria-label="筛选操作类型"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="glass-input h-[36px] px-3 text-xs"
          >
            <option value="all">全部操作类型</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        }
        onExportCsv={() => {
          const csv = buildCsvDownloadContent(
            ['时间', '操作人', '活动', '类型', '对象', '变更前', '变更后', '原因', '结果'],
            logs.map((l) => [
              formatDateTimeDisplay(l.timestamp),
              l.actorName,
              l.activityName,
              AUDIT_ACTION_LABELS[l.action] ?? l.action,
              l.targetLabel,
              l.beforeState,
              l.afterState,
              l.reason,
              l.result,
            ]),
          );
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'audit-logs.csv';
          a.click();
          URL.revokeObjectURL(url);
        }}
      />
    </PageContainer>
  );
}

export function SystemSettingsPage() {
  const { settings, canAccessModule, updateSystemSettings } = useApp();
  const [adapterMode, setAdapterMode] = useState<AdapterMode>(settings?.adapterMode ?? 'mock');
  const [apiBaseUrl, setApiBaseUrl] = useState(settings?.apiBaseUrl ?? '/api/v1');
  const [qrSeconds, setQrSeconds] = useState(String(settings?.qrRefreshSeconds ?? 30));
  const [riskThreshold, setRiskThreshold] = useState(String(settings?.captchaRiskThreshold ?? 60));
  const [clockOffset, setClockOffset] = useState(String(settings?.simulatedClockOffsetDays ?? 0));
  const [simulateOffline, setSimulateOffline] = useState(Boolean(settings?.simulateOffline));

  useEffect(() => {
    if (!settings) return;
    setAdapterMode(settings.adapterMode);
    setApiBaseUrl(settings.apiBaseUrl);
    setQrSeconds(String(settings.qrRefreshSeconds));
    setRiskThreshold(String(settings.captchaRiskThreshold));
    setClockOffset(String(settings.simulatedClockOffsetDays));
    setSimulateOffline(settings.simulateOffline);
  }, [settings]);

  if (!canAccessModule('settings')) {
    return (
      <PageContainer>
        <PermissionDeniedState moduleLabel="系统设置" />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-5">
      <GlassCard className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <GlassSelect
            label="数据服务适配器"
            value={adapterMode}
            onChange={(e) => setAdapterMode(e.target.value as AdapterMode)}
            options={[
              { value: 'mock', label: 'Mock Adapter（演示模式）' },
              { value: 'production', label: 'Production API Adapter（正式接口）' },
            ]}
          />
          <GlassInput
            label="API Base URL"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
          />
          <GlassInput
            label="动态二维码刷新周期（秒）"
            type="number"
            min={10}
            max={60}
            numeric
            value={qrSeconds}
            onChange={(e) => setQrSeconds(e.target.value)}
          />
          <GlassInput
            label="Smart CAPTCHA 触发风险阈值（0-100）"
            type="number"
            min={10}
            max={100}
            numeric
            value={riskThreshold}
            onChange={(e) => setRiskThreshold(e.target.value)}
          />
        </div>

        <div className="pt-4 border-t border-slate-900/[0.08] space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">测试辅助（仅 Mock 模式）</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass-surface-subtle p-4 space-y-2 min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <Clock className="w-4 h-4 text-[#0071e3]" />
                活动时钟偏移（天）
              </div>
              <GlassInput
                type="number"
                numeric
                value={clockOffset}
                onChange={(e) => setClockOffset(e.target.value)}
              />
            </div>

            <div className="glass-surface-subtle p-4 space-y-2 min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <WifiOff className="w-4 h-4 text-red-600" />
                断网保护模拟
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-800 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulateOffline}
                  onChange={(e) => setSimulateOffline(e.target.checked)}
                  className="w-4 h-4 accent-[#0071e3]"
                />
                启用断网状态模拟
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <GlassButton
            variant="primary"
            onClick={() =>
              updateSystemSettings({
                adapterMode,
                apiBaseUrl,
                qrRefreshSeconds: Number.parseInt(qrSeconds, 10) || 30,
                captchaRiskThreshold: Number.parseInt(riskThreshold, 10) || 60,
                simulatedClockOffsetDays: Number.parseInt(clockOffset, 10) || 0,
                simulateOffline,
              })
            }
          >
            保存系统设置
          </GlassButton>
        </div>
      </GlassCard>
    </PageContainer>
  );
}
