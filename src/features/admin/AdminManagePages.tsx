import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  FileText,
  Info,
  KeyRound,
  LogOut,
  Plus,
  QrCode,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCircle2,
  Users,
} from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import {
  GlassButton,
  GlassCard,
  GlassInput,
  GlassSelect,
  PermissionDeniedState,
  StatusIndicator,
} from '../../components/glass/GlassPrimitives';
import { GlassDialog, GlassUpload } from '../../components/glass/GlassOverlay';
import { GlassTable, type GlassTableColumn } from '../../components/glass/GlassTable';
import { PageContainer } from '../../components/layout/PageContainer';
import { getApiClient } from '../../services/api';
import {
  COUNTRY_CODES,
  buildCsvDownloadContent,
  formatDateTimeDisplay,
} from '../../utils/stateMachines';
import type {
  AdminNavSection,
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

const COUNTRY_CODE_OPTIONS = COUNTRY_CODES.map((c) => ({
  value: c.code,
  label: `${c.code} ${c.label}`,
  shortLabel: c.code,
}));

function SettingsSubHeader({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  const { navigateAdmin } = useApp();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={() => navigateAdmin('admin_settings')}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/75 hover:bg-white border border-slate-900/[0.08] text-xs font-medium text-slate-700 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          设置
        </button>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 truncate">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold text-slate-500 px-1.5 tracking-wide">{title}</h2>
      <GlassCard padding="none" className="divide-y divide-slate-900/[0.06] overflow-hidden">
        {children}
      </GlassCard>
    </section>
  );
}

function SettingsRow({
  icon,
  label,
  value,
  danger = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) {
  if (!onClick) {
    return (
      <div className="min-h-[52px] px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-slate-900/[0.05] text-slate-700 flex items-center justify-center shrink-0">
            {icon}
          </span>
          <span className="text-sm font-medium text-slate-900 truncate">{label}</span>
        </div>
        {value && <div className="text-sm text-slate-500 shrink-0">{value}</div>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/65 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            danger
              ? 'bg-red-500/10 text-red-600'
              : 'bg-[#0071e3]/10 text-[#0071e3]'
          }`}
        >
          {icon}
        </span>
        <span
          className={`text-sm font-medium truncate ${
            danger ? 'text-red-600' : 'text-slate-900'
          }`}
        >
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {value && <span className="text-xs text-slate-500">{value}</span>}
        {!danger && <ChevronRight className="w-4 h-4 text-slate-400" />}
      </div>
    </button>
  );
}

export function SettingsHomePage() {
  const { user, role, canAccessModule, navigateAdmin, logoutUser } = useApp();
  const [confirmLogout, setConfirmLogout] = useState(false);

  const go = (target: AdminNavSection) => navigateAdmin(target);
  const hasPermissionLinks =
    canAccessModule('users') || canAccessModule('roles') || canAccessModule('departments');
  const hasSystemLinks = canAccessModule('settings') || canAccessModule('audit_logs');

  return (
    <PageContainer className="space-y-5">
      {/* 账户 */}
      <SettingsGroup title="账户">
        <button
          type="button"
          onClick={() => go('admin_profile')}
          className="w-full px-4 py-4 flex items-center justify-between gap-4 text-left hover:bg-white/65 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName}
                className="w-12 h-12 rounded-full object-cover border border-white shadow-sm shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#0071e3]/12 text-[#0071e3] flex items-center justify-center text-base font-semibold shrink-0">
                {user?.displayName?.slice(0, 1) ?? '员'}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-900 truncate">
                {user?.displayName ?? '未登录'}
              </div>
              <div className="text-xs text-slate-500 truncate mt-0.5">
                {role?.name ?? '—'} · {user?.username}
                {user?.email ? ` · ${user.email}` : ''}
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        <SettingsRow
          icon={<UserCircle2 className="w-4 h-4" />}
          label="个人资料"
          value={user?.phone ? `${user.countryCode} ${user.phone}` : undefined}
          onClick={() => go('admin_profile')}
        />
        <SettingsRow
          icon={<KeyRound className="w-4 h-4" />}
          label="密码设置"
          onClick={() => go('admin_password')}
        />
        <SettingsRow
          icon={<LogOut className="w-4 h-4" />}
          label="退出登录"
          danger
          onClick={() => setConfirmLogout(true)}
        />
      </SettingsGroup>

      {/* 用户与权限 */}
      {hasPermissionLinks && (
        <SettingsGroup title="用户与权限">
          {canAccessModule('users') && (
            <SettingsRow
              icon={<Users className="w-4 h-4" />}
              label="用户账号"
              onClick={() => go('admin_users')}
            />
          )}
          {canAccessModule('roles') && (
            <SettingsRow
              icon={<Shield className="w-4 h-4" />}
              label="角色权限"
              onClick={() => go('admin_roles')}
            />
          )}
          {canAccessModule('departments') && (
            <SettingsRow
              icon={<Building2 className="w-4 h-4" />}
              label="部门管理"
              onClick={() => go('admin_departments')}
            />
          )}
        </SettingsGroup>
      )}

      {/* 系统 */}
      {hasSystemLinks && (
        <SettingsGroup title="系统">
          {canAccessModule('settings') && (
            <>
              <SettingsRow
                icon={<SlidersHorizontal className="w-4 h-4" />}
                label="通用设置"
                onClick={() => go('admin_general')}
              />
              <SettingsRow
                icon={<QrCode className="w-4 h-4" />}
                label="核销设置"
                onClick={() => go('admin_redemption_settings')}
              />
              <SettingsRow
                icon={<ShieldCheck className="w-4 h-4" />}
                label="安全设置"
                onClick={() => go('admin_security')}
              />
            </>
          )}
          {canAccessModule('audit_logs') && (
            <SettingsRow
              icon={<FileText className="w-4 h-4" />}
              label="操作日志"
              onClick={() => go('admin_audit')}
            />
          )}
        </SettingsGroup>
      )}

      {/* 关于 */}
      <SettingsGroup title="关于">
        <SettingsRow icon={<Info className="w-4 h-4" />} label="系统名称" value="萤火通行" />
        <SettingsRow
          icon={<Shield className="w-4 h-4" />}
          label="系统版本"
          value={<span className="numeric-text">v5.1.0</span>}
        />
      </SettingsGroup>

      <GlassDialog
        open={confirmLogout}
        title="确认退出登录"
        onClose={() => setConfirmLogout(false)}
        maxWidthClass="max-w-sm"
      >
        <p className="text-sm text-slate-600 mb-4">退出后需要重新输入账号密码登录系统。</p>
        <div className="flex justify-end gap-2">
          <GlassButton variant="secondary" onClick={() => setConfirmLogout(false)}>
            取消
          </GlassButton>
          <GlassButton
            variant="danger"
            onClick={async () => {
              setConfirmLogout(false);
              await logoutUser();
            }}
          >
            退出登录
          </GlassButton>
        </div>
      </GlassDialog>
    </PageContainer>
  );
}

export function ProfileSettingsPage() {
  const { user, refreshCore, pushToast } = useApp();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [countryCode, setCountryCode] = useState(user?.countryCode ?? '+86');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName);
    setEmail(user.email);
    setCountryCode(user.countryCode);
    setPhone(user.phone);
    setAvatarUrl(user.avatarUrl ?? '');
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      pushToast({ tone: 'error', title: '姓名不能为空' });
      return;
    }
    setSaving(true);
    try {
      await getApiClient().auth.updateProfile({
        displayName: displayName.trim(),
        email: email.trim(),
        countryCode,
        phone: phone.trim(),
        avatarUrl: avatarUrl || undefined,
      });
      await refreshCore();
      pushToast({ tone: 'success', title: '个人资料已更新' });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: err instanceof Error ? err.message : '保存失败',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer className="space-y-5">
      <SettingsSubHeader title="个人资料" />
      <GlassCard>
        <form onSubmit={handleSubmit} className="space-y-5">
          <GlassUpload
            label="头像"
            value={avatarUrl}
            onChange={(url) => setAvatarUrl(url)}
            helperText="支持 JPG / PNG"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GlassInput label="登录账号" value={user?.username ?? ''} disabled />
            <GlassInput
              label="显示姓名"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <GlassInput
              label="工作邮箱"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="grid grid-cols-[136px_1fr] gap-2">
              <GlassSelect
                label="区号"
                searchable
                value={countryCode}
                onValueChange={setCountryCode}
                options={COUNTRY_CODE_OPTIONS}
              />
              <GlassInput
                label="联系电话"
                numeric
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <GlassButton type="submit" variant="primary" loading={saving}>
              保存资料
            </GlassButton>
          </div>
        </form>
      </GlassCard>
    </PageContainer>
  );
}

export function PasswordSettingsPage() {
  const { pushToast } = useApp();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      pushToast({ tone: 'error', title: '新密码至少 6 位' });
      return;
    }
    if (newPassword !== confirmPassword) {
      pushToast({ tone: 'error', title: '两次输入的新密码不一致' });
      return;
    }
    setSaving(true);
    try {
      await getApiClient().auth.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      pushToast({ tone: 'success', title: '密码已更新' });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: err instanceof Error ? err.message : '修改密码失败',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer className="space-y-5">
      <SettingsSubHeader title="密码设置" />
      <GlassCard>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <GlassInput
            label="当前密码"
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <GlassInput
            label="新密码"
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <GlassInput
            label="确认新密码"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <div className="flex justify-end pt-1">
            <GlassButton type="submit" variant="primary" loading={saving}>
              更新密码
            </GlassButton>
          </div>
        </form>
      </GlassCard>
    </PageContainer>
  );
}

export function GeneralSettingsPage() {
  const { settings, canAccessModule, updateSystemSettings } = useApp();
  const [defaultLocale, setDefaultLocale] = useState<'zh-CN' | 'en-US'>(
    settings?.defaultLocale ?? 'zh-CN',
  );
  const [maskSensitive, setMaskSensitive] = useState(
    settings?.maskSensitiveByDefault ?? true,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setDefaultLocale(settings.defaultLocale);
    setMaskSensitive(settings.maskSensitiveByDefault);
  }, [settings]);

  if (!canAccessModule('settings')) {
    return (
      <PageContainer className="space-y-5">
        <SettingsSubHeader title="通用设置" />
        <PermissionDeniedState moduleLabel="通用设置" />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-5">
      <SettingsSubHeader title="通用设置" />
      <GlassCard className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <GlassSelect
            label="界面语言"
            value={defaultLocale}
            onValueChange={(val) => setDefaultLocale(val as 'zh-CN' | 'en-US')}
            options={[
              { value: 'zh-CN', label: '简体中文' },
              { value: 'en-US', label: 'English' },
            ]}
          />
        </div>
        <label className="flex items-center justify-between gap-4 py-2 border-t border-slate-900/[0.06] cursor-pointer">
          <span className="text-sm font-medium text-slate-800">列表默认隐藏敏感证件号与手机号</span>
          <input
            type="checkbox"
            checked={maskSensitive}
            onChange={(e) => setMaskSensitive(e.target.checked)}
            className="w-4 h-4 accent-[#0071e3]"
          />
        </label>
        <div className="flex justify-end">
          <GlassButton
            variant="primary"
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await updateSystemSettings({
                  defaultLocale,
                  maskSensitiveByDefault: maskSensitive,
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            保存设置
          </GlassButton>
        </div>
      </GlassCard>
    </PageContainer>
  );
}

export function RedemptionSettingsPage() {
  const { settings, canAccessModule, updateSystemSettings } = useApp();
  const [qrSeconds, setQrSeconds] = useState(String(settings?.qrRefreshSeconds ?? 30));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setQrSeconds(String(settings.qrRefreshSeconds));
  }, [settings]);

  if (!canAccessModule('settings')) {
    return (
      <PageContainer className="space-y-5">
        <SettingsSubHeader title="核销设置" />
        <PermissionDeniedState moduleLabel="核销设置" />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-5">
      <SettingsSubHeader title="核销设置" />
      <GlassCard className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <GlassSelect
            label="动态二维码刷新周期"
            value={qrSeconds}
            onValueChange={setQrSeconds}
            options={[
              { value: '15', label: '15 秒' },
              { value: '30', label: '30 秒' },
              { value: '60', label: '60 秒' },
            ]}
          />
          <div className="flex flex-col justify-end pb-1">
            <span className="text-[13px] font-medium text-slate-700 mb-1.5">在线核销策略</span>
            <div className="h-[42px] px-3.5 rounded-xl bg-white/55 border border-slate-900/[0.08] flex items-center">
              <StatusIndicator tone="success" label="强制在线校验（断网自动禁用核销）" />
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <GlassButton
            variant="primary"
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await updateSystemSettings({
                  qrRefreshSeconds: Number.parseInt(qrSeconds, 10) || 30,
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            保存设置
          </GlassButton>
        </div>
      </GlassCard>
    </PageContainer>
  );
}

export function SecuritySettingsPage() {
  const { settings, canAccessModule, updateSystemSettings } = useApp();
  const [riskThreshold, setRiskThreshold] = useState(
    String(settings?.captchaRiskThreshold ?? 60),
  );
  const [rateLimit, setRateLimit] = useState(String(settings?.rateLimitPerMinute ?? 60));
  const [maxFailures, setMaxFailures] = useState(String(settings?.maxPasswordFailures ?? 5));
  const [maskSensitive, setMaskSensitive] = useState(
    settings?.maskSensitiveByDefault ?? true,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setRiskThreshold(String(settings.captchaRiskThreshold));
    setRateLimit(String(settings.rateLimitPerMinute));
    setMaxFailures(String(settings.maxPasswordFailures));
    setMaskSensitive(settings.maskSensitiveByDefault);
  }, [settings]);

  if (!canAccessModule('settings')) {
    return (
      <PageContainer className="space-y-5">
        <SettingsSubHeader title="安全设置" />
        <PermissionDeniedState moduleLabel="安全设置" />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-5">
      <SettingsSubHeader title="安全设置" />
      <GlassCard className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <GlassInput
            label="人机校验风险阈值"
            type="number"
            min={10}
            max={100}
            numeric
            value={riskThreshold}
            onChange={(e) => setRiskThreshold(e.target.value)}
          />
          <GlassInput
            label="接口限流（次/分钟）"
            type="number"
            min={10}
            max={600}
            numeric
            value={rateLimit}
            onChange={(e) => setRateLimit(e.target.value)}
          />
          <GlassInput
            label="密码错误锁定次数"
            type="number"
            min={3}
            max={20}
            numeric
            value={maxFailures}
            onChange={(e) => setMaxFailures(e.target.value)}
          />
        </div>
        <label className="flex items-center justify-between gap-4 py-2 border-t border-slate-900/[0.06] cursor-pointer">
          <span className="text-sm font-medium text-slate-800">查看敏感字段自动记录审计日志</span>
          <input
            type="checkbox"
            checked={maskSensitive}
            onChange={(e) => setMaskSensitive(e.target.checked)}
            className="w-4 h-4 accent-[#0071e3]"
          />
        </label>
        <div className="flex justify-end">
          <GlassButton
            variant="primary"
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await updateSystemSettings({
                  captchaRiskThreshold: Number.parseInt(riskThreshold, 10) || 60,
                  rateLimitPerMinute: Number.parseInt(rateLimit, 10) || 60,
                  maxPasswordFailures: Number.parseInt(maxFailures, 10) || 5,
                  maskSensitiveByDefault: maskSensitive,
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            保存安全设置
          </GlassButton>
        </div>
      </GlassCard>
    </PageContainer>
  );
}

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
      <PageContainer className="space-y-5">
        <SettingsSubHeader title="用户账号" />
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
        roleId: roles[2]?.id ?? roles[0]?.id ?? 'role-badge',
        redemptionMode: 'normal',
        active: true,
      });
    }
    setCreating(true);
  };

  const columns: GlassTableColumn<SystemUser>[] = [
    {
      key: 'displayName',
      header: '员工姓名',
      render: (u) => <span className="font-medium text-slate-900">{u.displayName}</span>,
    },
    {
      key: 'username',
      header: '账号',
      render: (u) => (
        <div className="text-xs">
          <div className="text-slate-800">{u.username}</div>
          {u.email && <div className="text-slate-400">{u.email}</div>}
        </div>
      ),
    },
    {
      key: 'dept',
      header: '部门',
      render: (u) => depts.find((d) => d.id === u.departmentId)?.name ?? '—',
    },
    {
      key: 'role',
      header: '角色',
      render: (u) => roles.find((r) => r.id === u.roleId)?.name ?? '—',
    },
    {
      key: 'mode',
      header: '核销模式',
      render: (u) => (
        <span className="text-xs text-slate-700">
          {u.redemptionMode === 'fast' ? '快速模式' : '普通模式'}
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
          编辑
        </GlassButton>
      ),
    },
  ];

  return (
    <PageContainer className="space-y-5">
      <SettingsSubHeader title="用户账号" />
      <GlassTable
        rows={users}
        columns={columns}
        searchable={false}
        headerActions={
          <GlassButton size="sm" variant="primary" onClick={() => openModal()}>
            <Plus className="w-4 h-4" />
            新增账号
          </GlassButton>
        }
      />

      <GlassDialog
        open={creating}
        title={editing ? `编辑账号：${editing.displayName}` : '新增账号'}
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
            pushToast({ tone: 'success', title: `账号「${form.displayName}」已保存` });
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
                numeric
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <GlassSelect
              label="所属部门"
              value={form.departmentId}
              onValueChange={(val) => setForm({ ...form, departmentId: val })}
              options={depts.map((d) => ({ value: d.id, label: d.name }))}
            />
            <GlassSelect
              label="分配角色"
              value={form.roleId}
              onValueChange={(val) => setForm({ ...form, roleId: val })}
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
            />
            <GlassSelect
              label="核销模式"
              value={form.redemptionMode}
              onValueChange={(val) => setForm({ ...form, redemptionMode: val as RedemptionMode })}
              options={[
                { value: 'normal', label: '普通模式' },
                { value: 'fast', label: '快速模式' },
              ]}
            />
            <GlassSelect
              label="账号状态"
              value={form.active ? 'active' : 'disabled'}
              onValueChange={(val) => setForm({ ...form, active: val === 'active' })}
              options={[
                { value: 'active', label: '正常' },
                { value: 'disabled', label: '停用' },
              ]}
            />
          </div>
          <div className="flex justify-end gap-2">
            <GlassButton variant="secondary" onClick={() => setCreating(false)}>
              取消
            </GlassButton>
            <GlassButton type="submit" variant="primary">
              保存
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
  const [deletingRole, setDeletingRole] = useState<RoleDefinition | null>(null);
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
      <PageContainer className="space-y-5">
        <SettingsSubHeader title="角色权限" />
        <PermissionDeniedState moduleLabel="角色权限" />
      </PageContainer>
    );
  }

  const columns: GlassTableColumn<RoleDefinition>[] = [
    {
      key: 'name',
      header: '角色名称',
      render: (r) => <span className="font-medium text-slate-900">{r.name}</span>,
    },
    {
      key: 'type',
      header: '类型',
      render: (r) => (
        <span className="text-xs text-slate-500">{r.isPreset ? '内置' : '自定义'}</span>
      ),
    },
    {
      key: 'modules',
      header: '模块权限',
      render: (r) => (
        <span className="text-xs text-slate-600 line-clamp-2 max-w-[320px]">
          {r.modules
            .map((m) => ALL_MODULES.find((x) => x.id === m)?.label ?? m)
            .join('、')}
        </span>
      ),
    },
    {
      key: 'sensitive',
      header: '敏感明文',
      render: (r) => (
        <StatusIndicator
          tone={r.canViewUnmaskedSensitive ? 'info' : 'neutral'}
          label={r.canViewUnmaskedSensitive ? '允许' : '脱敏'}
        />
      ),
    },
    {
      key: 'override',
      header: '重复增发',
      render: (r) => (
        <StatusIndicator
          tone={r.canOverrideDuplicateGift ? 'success' : 'neutral'}
          label={r.canOverrideDuplicateGift ? '允许' : '禁止'}
        />
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1.5">
          <GlassButton size="sm" variant="secondary" onClick={() => setEditing({ ...r })}>
            编辑
          </GlassButton>
          {!r.isPreset && (
            <GlassButton size="sm" variant="danger" onClick={() => setDeletingRole(r)}>
              <Trash2 className="w-3.5 h-3.5" />
            </GlassButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageContainer className="space-y-5">
      <SettingsSubHeader title="角色权限" />
      <GlassTable
        rows={roles}
        columns={columns}
        searchable={false}
        headerActions={
          <GlassButton
            size="sm"
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
        }
      />

      <GlassDialog
        open={Boolean(editing)}
        title={editing?.id ? `编辑角色：${editing.name}` : '新增角色'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!user) return;
              await getApiClient().permissions.saveRole(editing, user);
              pushToast({ tone: 'success', title: `角色「${editing.name}」已保存` });
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
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">模块权限</p>
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
                允许查看脱敏证件号与手机号
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
                允许为同身份增发赠票
              </label>
            </div>
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

      <GlassDialog
        open={Boolean(deletingRole)}
        title="确认删除角色"
        onClose={() => setDeletingRole(null)}
        maxWidthClass="max-w-sm"
      >
        <p className="text-sm text-slate-600 mb-4">
          确定删除角色「{deletingRole?.name}」？
        </p>
        <div className="flex justify-end gap-2">
          <GlassButton variant="secondary" onClick={() => setDeletingRole(null)}>
            取消
          </GlassButton>
          <GlassButton
            variant="danger"
            onClick={async () => {
              if (!user || !deletingRole) return;
              try {
                await getApiClient().permissions.deleteRole(deletingRole.id, user);
                pushToast({ tone: 'success', title: `角色「${deletingRole.name}」已删除` });
                setDeletingRole(null);
                await load();
              } catch (err) {
                pushToast({
                  tone: 'error',
                  title: err instanceof Error ? err.message : '删除失败',
                });
              }
            }}
          >
            删除
          </GlassButton>
        </div>
      </GlassDialog>
    </PageContainer>
  );
}

export function DepartmentsManagePage() {
  const { user, canAccessModule, realtimeVersion, pushToast } = useApp();
  const [depts, setDepts] = useState<Department[]>([]);
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    description: string;
    active: boolean;
  } | null>(null);

  const load = async () => setDepts(await getApiClient().permissions.listDepartments());
  useEffect(() => {
    load();
  }, [realtimeVersion]);

  if (!canAccessModule('departments')) {
    return (
      <PageContainer className="space-y-5">
        <SettingsSubHeader title="部门管理" />
        <PermissionDeniedState moduleLabel="部门管理" />
      </PageContainer>
    );
  }

  const columns: GlassTableColumn<Department>[] = [
    {
      key: 'name',
      header: '部门名称',
      render: (d) => <span className="font-medium text-slate-900">{d.name}</span>,
    },
    {
      key: 'memberCount',
      header: '部门人数',
      render: (d) => <span className="table-number">{d.memberCount}</span>,
    },
    {
      key: 'status',
      header: '状态',
      render: (d) => (
        <StatusIndicator
          tone={d.active !== false ? 'success' : 'neutral'}
          label={d.active !== false ? '启用' : '停用'}
        />
      ),
    },
    {
      key: 'actions',
      header: '操作',
      align: 'right',
      render: (d) => (
        <GlassButton
          size="sm"
          variant="secondary"
          onClick={() =>
            setEditing({
              id: d.id,
              name: d.name,
              description: d.description,
              active: d.active !== false,
            })
          }
        >
          编辑
        </GlassButton>
      ),
    },
  ];

  return (
    <PageContainer className="space-y-5">
      <SettingsSubHeader title="部门管理" />
      <GlassTable
        rows={depts}
        columns={columns}
        searchable={false}
        headerActions={
          <GlassButton
            size="sm"
            variant="primary"
            onClick={() => setEditing({ name: '', description: '', active: true })}
          >
            <Plus className="w-4 h-4" />
            新增部门
          </GlassButton>
        }
      />

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
            <GlassSelect
              label="状态"
              value={editing.active ? 'active' : 'disabled'}
              onValueChange={(val) => setEditing({ ...editing, active: val === 'active' })}
              options={[
                { value: 'active', label: '启用' },
                { value: 'disabled', label: '停用' },
              ]}
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
  const [detailLog, setDetailLog] = useState<AuditLogEntry | null>(null);

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
      <PageContainer className="space-y-5">
        <SettingsSubHeader title="操作日志" />
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
      render: (l) => (
        <span className="date-number text-xs whitespace-nowrap">
          {formatDateTimeDisplay(l.timestamp)}
        </span>
      ),
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
      header: '操作类型',
      render: (l) => (
        <span className="text-xs font-medium text-slate-800">
          {AUDIT_ACTION_LABELS[l.action] ?? l.action}
        </span>
      ),
    },
    {
      key: 'target',
      header: '变更对象',
      render: (l) => (
        <div className="text-xs min-w-0 max-w-[260px]">
          <div className="font-medium text-slate-900 truncate">{l.targetLabel}</div>
          <div className="text-slate-400 truncate">{l.afterState}</div>
        </div>
      ),
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
    {
      key: 'actions',
      header: '详情',
      align: 'right',
      render: (l) => (
        <GlassButton size="sm" variant="ghost" onClick={() => setDetailLog(l)}>
          详情
        </GlassButton>
      ),
    },
  ];

  return (
    <PageContainer className="space-y-5">
      <SettingsSubHeader title="操作日志" />
      <GlassTable
        rows={logs}
        columns={columns}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="搜索操作人、对象或说明..."
        filterSlot={
          <GlassSelect
            size="sm"
            aria-label="筛选操作类型"
            value={actionFilter}
            onValueChange={setActionFilter}
            className="w-40"
            options={[
              { value: 'all', label: '全部操作类型' },
              ...Object.entries(AUDIT_ACTION_LABELS).map(([k, l]) => ({
                value: k,
                label: l,
              })),
            ]}
          />
        }
        onExportCsv={() => {
          const csv = buildCsvDownloadContent(
            ['时间', '操作人', '活动', '类型', '对象', '变更前', '变更后', '说明', '结果'],
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

      <GlassDialog
        open={Boolean(detailLog)}
        title="操作日志详情"
        onClose={() => setDetailLog(null)}
        maxWidthClass="max-w-md"
      >
        {detailLog && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-900/[0.06]">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {detailLog.targetLabel}
                </div>
                <div className="text-slate-500 mt-0.5">
                  {AUDIT_ACTION_LABELS[detailLog.action] ?? detailLog.action}
                </div>
              </div>
              <StatusIndicator
                tone={detailLog.result === 'success' ? 'success' : 'danger'}
                label={detailLog.result === 'success' ? '成功' : '已拦截'}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-slate-400">操作时间</div>
                <div className="text-slate-800 date-number mt-0.5">
                  {formatDateTimeDisplay(detailLog.timestamp)}
                </div>
              </div>
              <div>
                <div className="text-slate-400">操作人</div>
                <div className="text-slate-800 font-medium mt-0.5">
                  {detailLog.actorName}（{detailLog.actorRole}）
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-slate-400">所属活动</div>
                <div className="text-slate-800 mt-0.5">{detailLog.activityName}</div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-900/[0.06] space-y-2.5">
              <div>
                <div className="text-slate-400">变更前</div>
                <div className="text-slate-700 mt-0.5">{detailLog.beforeState}</div>
              </div>
              <div>
                <div className="text-slate-400">变更后</div>
                <div className="text-slate-900 font-medium mt-0.5">{detailLog.afterState}</div>
              </div>
              {detailLog.reason && (
                <div>
                  <div className="text-slate-400">原因说明</div>
                  <div className="text-slate-700 mt-0.5 leading-relaxed">{detailLog.reason}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </GlassDialog>
    </PageContainer>
  );
}
