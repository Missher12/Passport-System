import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Bell,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  HelpCircle,
  KeyRound,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
  Sparkles,
  Ticket,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import type { ActivityStatus, AdminNavSection, PermissionModule } from '../../types/domain';
import { GlassButton, StatusIndicator } from '../glass/GlassPrimitives';
import { GlassDialog } from '../glass/GlassOverlay';
import { formatDateDisplay } from '../../utils/stateMachines';
import { getApiClient } from '../../services/api';

const PRIMARY_NAV: Array<{
  id: AdminNavSection | 'manage_menu';
  label: string;
  module?: PermissionModule;
}> = [
  { id: 'dashboard', label: '工作台', module: 'dashboard' },
  { id: 'activities', label: '活动', module: 'activities' },
  { id: 'exhibitors', label: '展商', module: 'exhibitors' },
  { id: 'certificates', label: '证件', module: 'certificates' },
  { id: 'gifts', label: '赠票', module: 'gifts' },
  { id: 'redemption', label: '核销', module: 'redemption' },
  { id: 'manage_menu', label: '设置' },
];

const MANAGE_ITEMS: Array<{
  id: AdminNavSection;
  label: string;
  module: PermissionModule;
  icon: React.ReactNode;
}> = [
  { id: 'admin_users', label: '用户账号', module: 'users', icon: <Users className="w-4 h-4" /> },
  { id: 'admin_roles', label: '角色权限', module: 'roles', icon: <Shield className="w-4 h-4" /> },
  { id: 'admin_departments', label: '部门管理', module: 'departments', icon: <Building2 className="w-4 h-4" /> },
  { id: 'admin_audit', label: '操作日志', module: 'audit_logs', icon: <FileText className="w-4 h-4" /> },
  { id: 'admin_settings', label: '系统设置', module: 'settings', icon: <Settings className="w-4 h-4" /> },
];

const ACTIVITY_STATUS_TEXT: Record<ActivityStatus, { label: string; tone: 'success' | 'warning' | 'neutral' | 'info' }> = {
  active: { label: '进行中', tone: 'success' },
  draft: { label: '即将开始', tone: 'info' },
  paused: { label: '已暂停', tone: 'warning' },
  archived: { label: '已归档', tone: 'neutral' },
};

export function GlassHeader() {
  const {
    user,
    role,
    portal,
    activeNav,
    activities,
    activeActivityId,
    activeActivity,
    notifications,
    navigateAdmin,
    switchPortal,
    selectActivity,
    canAccessModule,
    setGlobalSearchOpen,
    markAllNotificationsRead,
    switchDemoUser,
    logoutUser,
  } = useApp();

  const [activityMenuOpen, setActivityMenuOpen] = useState(false);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'active' | 'draft' | 'archived'>('all');
  const [manageMenuOpen, setManageMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [demoUsers, setDemoUsers] = useState<Array<{ id: string; displayName: string; roleId: string }>>([]);

  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    getApiClient()
      .users.listUsers()
      .then((list) =>
        setDemoUsers(list.map((u) => ({ id: u.id, displayName: u.displayName, roleId: u.roleId }))),
      )
      .catch(() => {});
  }, [portal]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setActivityMenuOpen(false);
        setManageMenuOpen(false);
        setNotifOpen(false);
        setAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const filteredActivities = useMemo(() => {
    return activities.filter((a) => {
      if (activityFilter !== 'all' && a.status !== activityFilter) return false;
      if (activitySearch.trim()) {
        const q = activitySearch.trim().toLowerCase();
        return (
          a.name.toLowerCase().includes(q) ||
          a.location.toLowerCase().includes(q) ||
          a.code.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activities, activityFilter, activitySearch]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const isManageActive = activeNav.startsWith('admin_');

  const closeAllDropdowns = () => {
    setActivityMenuOpen(false);
    setManageMenuOpen(false);
    setNotifOpen(false);
    setAccountOpen(false);
  };

  // === External Portal Header (Chapter 4.5: Same Liquid Glass Brand Header, Internal Entries Hidden) ===
  if (portal === 'exhibitor' || portal === 'gift') {
    return (
      <header ref={headerRef} className="app-header">
        <div className="glass-nav-bar w-full px-4 sm:px-5 h-[58px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-[11px] bg-gradient-to-br from-[#0071e3] to-[#38bdf8] text-white flex items-center justify-center shadow-sm shrink-0">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="font-semibold text-[15px] tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              萤火通行
            </span>
            <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>
            <span className="text-sm text-slate-700 font-medium truncate hidden sm:inline">
              {activeActivity?.name ?? '活动服务入口'}
            </span>
            <span className="text-slate-300 hidden md:inline" aria-hidden="true">·</span>
            <span className="text-xs text-slate-500 whitespace-nowrap hidden md:inline">
              {portal === 'exhibitor' ? '外部展商服务空间' : '活动赠票领取入口'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <GlassButton size="sm" variant="ghost" onClick={() => setHelpOpen(true)}>
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">使用帮助</span>
            </GlassButton>
            {user && (
              <GlassButton size="sm" variant="secondary" onClick={() => switchPortal('admin')}>
                返回管理后台
              </GlassButton>
            )}
          </div>
        </div>

        <GlassDialog
          open={helpOpen}
          title={portal === 'exhibitor' ? '外部展商登记与头像补充说明' : '活动赠票领取与电子票使用说明'}
          onClose={() => setHelpOpen(false)}
          maxWidthClass="max-w-lg"
        >
          <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
            {portal === 'exhibitor' ? (
              <>
                <p>1. 展商主档案由活动方预先创建，请使用管理员提供的 7 项档案信息与唯一商务密码完成身份核验。</p>
                <p>2. 主要联系人已自动计入第 01 号名额，其余人员支持单条录入或下载模板批量导入。</p>
                <p>3. 到达头像补充开放日期后，原链接将自动切换至头像上传阶段，完成上传后即可查看个人电子证件。</p>
              </>
            ) : (
              <>
                <p>1. 同一活动内每个实名身份仅限自助领取 1 张赠票，跨不同批次系统将自动去重校验。</p>
                <p>2. 使用日期仅可从管理员开放的日期列表中选择，确认提交并上传清晰自拍后即时生成电子赠票。</p>
                <p>3. 入场核验时请出示实时刷新的动态二维码，截图无效。</p>
              </>
            )}
          </div>
        </GlassDialog>
      </header>
    );
  }

  // === Internal Admin Unified Single-Layer Top Navigation ===
  return (
    <header ref={headerRef} className="app-header">
      <div className="glass-nav-bar w-full px-4 sm:px-5 h-[58px] flex items-center justify-between gap-2 lg:gap-3">
        {/* LEFT ZONE: Brand (flex-1 basis-0 on lg+ keeps brand pinned to left pill edge and nav centered) */}
        <div className="flex items-center justify-start gap-2 shrink-0 lg:flex-1 lg:basis-0 min-w-0">
            <button
              type="button"
              aria-label="萤火通行工作台"
              onClick={() => {
                closeAllDropdowns();
                navigateAdmin('dashboard');
              }}
              className="flex items-center gap-2 cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#0071e3] rounded-xl"
            >
              <div className="w-8 h-8 rounded-[11px] bg-gradient-to-br from-[#0071e3] to-[#38bdf8] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(0,113,227,0.28)] shrink-0">
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              </div>
              <span className="hidden sm:inline font-semibold text-[15px] tracking-tight text-slate-900 whitespace-nowrap">
                萤火通行
              </span>
            </button>
          </div>

          {/* CENTER ZONE: Single-Layer Global Main Navigation */}
          <nav
            aria-label="主导航"
            className="hidden lg:flex items-center justify-center gap-0.5 xl:gap-1 relative shrink-0"
          >
            {PRIMARY_NAV.map((item) => {
              if (item.id === 'manage_menu') {
                const hasAnyManage = MANAGE_ITEMS.some((m) => canAccessModule(m.module));
                return (
                  <div key="manage_menu" className="relative">
                    <button
                      type="button"
                      aria-expanded={manageMenuOpen}
                      onClick={() => {
                        const next = !manageMenuOpen;
                        closeAllDropdowns();
                        setManageMenuOpen(next);
                      }}
                      className={`relative px-2.5 xl:px-3 2xl:px-3.5 py-1.5 rounded-full text-[13px] xl:text-sm font-medium whitespace-nowrap shrink-0 inline-flex items-center gap-1 cursor-pointer transition-colors ${
                        isManageActive
                          ? 'text-slate-900'
                          : hasAnyManage
                            ? 'text-slate-600 hover:text-slate-900'
                            : 'text-slate-400'
                      }`}
                    >
                      {isManageActive && (
                        <motion.span
                          layoutId="nav-active-pill"
                          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          className="absolute inset-0 rounded-full bg-white/92 border border-white shadow-[0_2px_10px_rgba(15,23,42,0.08)] -z-10"
                        />
                      )}
                      <span>设置</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${manageMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {manageMenuOpen && (
                      <div className="absolute right-0 top-[calc(100%+12px)] w-52 glass-surface-elevated !bg-white/94 p-2 z-[120] space-y-0.5">
                        {MANAGE_ITEMS.map((sub) => {
                          const allowed = canAccessModule(sub.module);
                          const active = activeNav === sub.id;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => {
                                setManageMenuOpen(false);
                                navigateAdmin(sub.id);
                              }}
                              className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-colors cursor-pointer ${
                                active
                                  ? 'bg-[#0071e3]/10 text-[#0071e3]'
                                  : allowed
                                    ? 'hover:bg-slate-900/[0.04] text-slate-800'
                                    : 'opacity-55 hover:bg-slate-900/[0.03] text-slate-500'
                              }`}
                            >
                              <span className="shrink-0">{sub.icon}</span>
                              <span className="text-sm font-medium">{sub.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              const navId = item.id as AdminNavSection;
              const active = activeNav === navId;
              const allowed = !item.module || canAccessModule(item.module);

              return (
                <button
                  key={navId}
                  type="button"
                  onClick={() => {
                    closeAllDropdowns();
                    navigateAdmin(navId);
                  }}
                  className={`relative px-2.5 xl:px-3 2xl:px-3.5 py-1.5 rounded-full text-[13px] xl:text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors active:scale-[0.97] ${
                    active
                      ? 'text-slate-900'
                      : allowed
                        ? 'text-slate-600 hover:text-slate-900'
                        : 'text-slate-400'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-full bg-white/95 border border-slate-900/[0.06] shadow-[0_2px_10px_rgba(15,23,42,0.08)] -z-10"
                    />
                  )}
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* RIGHT ZONE: Embedded Activity Switcher + Global Search + Notifications + Account Menu + Mobile Menu */}
          <div className="flex items-center justify-end gap-1 sm:gap-1.5 xl:gap-2 flex-1 lg:basis-0 min-w-0">
            {/* Embedded Liquid Glass Activity Switcher */}
            <div className="relative flex-1 sm:flex-initial min-w-0 flex justify-start sm:justify-end">
              <button
                type="button"
                aria-expanded={activityMenuOpen}
                aria-label="切换当前活动"
                onClick={() => {
                  const next = !activityMenuOpen;
                  closeAllDropdowns();
                  setActivityMenuOpen(next);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-[11px] hover:bg-slate-900/[0.04] border border-transparent hover:border-slate-900/[0.08] transition-all cursor-pointer max-w-full sm:max-w-[156px] xl:max-w-[176px] 2xl:max-w-[220px] min-w-0"
              >
                <div className="text-left min-w-0 flex-1">
                  <div className="text-xs xl:text-[13px] font-semibold text-slate-900 truncate leading-tight">
                    {activeActivityId === 'ALL'
                      ? '全部活动视图'
                      : activeActivity?.name ?? '选择活动'}
                  </div>
                  <div className="text-[10.5px] xl:text-[11px] text-slate-500 truncate leading-tight mt-0.5 hidden sm:flex items-center gap-1 date-number">
                    {activeActivity ? (
                      <>
                        <span>{formatDateDisplay(activeActivity.startAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{ACTIVITY_STATUS_TEXT[activeActivity.status].label}</span>
                      </>
                    ) : (
                      <span>跨活动总览模式</span>
                    )}
                  </div>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${activityMenuOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

            {activityMenuOpen && (
              <div className="absolute left-[-38px] sm:left-auto sm:right-0 top-[calc(100%+10px)] w-[300px] sm:w-[356px] glass-surface-elevated !bg-white/94 p-3.5 z-[120] space-y-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    placeholder="搜索活动名称、地点或编码..."
                    aria-label="搜索活动"
                    className="glass-input h-[34px] pl-8 pr-3 text-xs w-full"
                  />
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {(
                    [
                      ['all', '全部'],
                      ['active', '进行中'],
                      ['draft', '即将开始'],
                      ['archived', '已归档'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActivityFilter(id)}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                        activityFilter === id
                          ? 'bg-[#0071e3] text-white font-medium'
                          : 'text-slate-600 hover:bg-slate-900/[0.05]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1">
                  {filteredActivities.map((act) => {
                    const selected = act.id === activeActivityId;
                    const st = ACTIVITY_STATUS_TEXT[act.status];
                    return (
                      <button
                        key={act.id}
                        type="button"
                        onClick={async () => {
                          await selectActivity(act.id);
                          setActivityMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-start justify-between gap-2 cursor-pointer ${
                          selected ? 'bg-[#0071e3]/10' : 'hover:bg-slate-900/[0.04]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {act.name}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 date-number">
                            <span className="whitespace-nowrap shrink-0">{formatDateDisplay(act.startAt)}</span>
                            <span aria-hidden="true" className="shrink-0">·</span>
                            <span className="truncate">{act.location}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                          <StatusIndicator tone={st.tone} label={st.label} />
                          {selected && <Check className="w-4 h-4 text-[#0071e3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-900/[0.07] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await selectActivity('ALL');
                      setActivityMenuOpen(false);
                      navigateAdmin('activities');
                    }}
                    className="text-xs font-medium text-[#0071e3] hover:text-[#005bb8] cursor-pointer flex items-center gap-1"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    全部活动视图
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActivityMenuOpen(false);
                      navigateAdmin('activities');
                    }}
                    className="text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    管理活动 →
                  </button>
                </div>
              </div>
            )}
          </div>

          <span className="hidden sm:block w-px h-4 bg-slate-900/10 shrink-0 mx-0.5" aria-hidden="true" />

          <button
            type="button"
            aria-label="全局搜索"
            onClick={() => {
              closeAllDropdowns();
              setGlobalSearchOpen(true);
            }}
            className="hidden sm:flex w-8 h-8 rounded-full hover:bg-white/75 items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
          >
            <Search className="w-[17px] h-[17px]" />
          </button>

          {/* Notification Center */}
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="通知中心"
              aria-expanded={notifOpen}
              onClick={() => {
                const next = !notifOpen;
                closeAllDropdowns();
                setNotifOpen(next);
              }}
              className="relative w-8 h-8 rounded-full hover:bg-white/75 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              <Bell className="w-[17px] h-[17px]" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-[#0071e3] text-white text-[10px] font-semibold flex items-center justify-center numeric-text">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-[calc(100%+12px)] w-[300px] sm:w-[340px] glass-surface-elevated !bg-white/94 p-4 z-[120] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">通知中心</span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllNotificationsRead}
                      className="text-xs text-[#0071e3] hover:text-[#005bb8] cursor-pointer"
                    >
                      全部标为已读
                    </button>
                  )}
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">当前活动暂无新通知</p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-3 rounded-xl border ${
                          n.read
                            ? 'bg-white/40 border-slate-900/[0.05]'
                            : 'bg-white/85 border-[#0071e3]/20'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900">{n.title}</span>
                          <span className="text-[11px] text-slate-400 date-number">
                            {n.createdAt.slice(5, 16).replace('T', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{n.detail}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Account Menu */}
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="用户账户菜单"
              aria-expanded={accountOpen}
              onClick={() => {
                const next = !accountOpen;
                closeAllDropdowns();
                setAccountOpen(next);
              }}
              className="flex items-center gap-1.5 pl-0.5 pr-1 xl:pr-2 py-0.5 rounded-full hover:bg-white/75 transition-colors cursor-pointer"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden bg-slate-200 border border-white shrink-0">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-slate-700">
                    {user?.displayName.slice(0, 1) ?? '管'}
                  </div>
                )}
              </div>
              <div className="hidden xl:block text-left leading-tight">
                <div className="text-xs font-semibold text-slate-900 whitespace-nowrap">{user?.displayName ?? '未登录'}</div>
                <div className="text-[11px] text-slate-500 whitespace-nowrap">{role?.name ?? '访客'}</div>
              </div>
            </button>

            {accountOpen && (
              <div className="absolute right-0 top-[calc(100%+12px)] w-72 glass-surface-elevated !bg-white/94 p-3 z-[120] space-y-3">
                <div className="px-2 py-1.5 border-b border-slate-900/[0.07]">
                  <p className="text-sm font-semibold text-slate-900">{user?.displayName}</p>
                  <p className="text-xs text-slate-500">
                    {role?.name} · 核销默认{user?.redemptionMode === 'fast' ? '快速模式' : '普通模式'}
                  </p>
                </div>

                {/* External Portal Quick Launch */}
                <div className="space-y-1">
                  <p className="px-2 text-[11px] font-semibold text-slate-500">外部用户端入口预览</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      switchPortal('exhibitor');
                    }}
                    className="w-full px-2.5 py-2 rounded-xl hover:bg-slate-900/[0.04] flex items-center justify-between text-xs font-medium text-slate-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <KeyRound className="w-3.5 h-3.5 text-[#0071e3]" />
                      进入外部展商端（7 项验证）
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      switchPortal('gift');
                    }}
                    className="w-full px-2.5 py-2 rounded-xl hover:bg-slate-900/[0.04] flex items-center justify-between text-xs font-medium text-slate-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Ticket className="w-3.5 h-3.5 text-[#0071e3]" />
                      进入外部赠票自助端
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>

                {/* Quick Role Switcher for RBAC Testing */}
                <div className="space-y-1 pt-2 border-t border-slate-900/[0.07]">
                  <p className="px-2 text-[11px] font-semibold text-slate-500">切换演示内部角色（Mock）</p>
                  <div className="grid grid-cols-1 gap-0.5">
                    {demoUsers.map((du) => (
                      <button
                        key={du.id}
                        type="button"
                        onClick={async () => {
                          await switchDemoUser(du.id);
                          setAccountOpen(false);
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center justify-between cursor-pointer ${
                          du.id === user?.id
                            ? 'bg-[#0071e3]/10 text-[#0071e3] font-medium'
                            : 'text-slate-700 hover:bg-slate-900/[0.04]'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <UserCheck className="w-3.5 h-3.5" />
                          {du.displayName}
                        </span>
                        {du.id === user?.id && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-900/[0.07]">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      logoutUser();
                    }}
                    className="w-full px-2.5 py-2 rounded-xl text-xs font-medium text-red-700 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    退出登录（返回登录页）
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Single-Level Navigation Trigger */}
          <button
            type="button"
            aria-label="打开导航菜单"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="lg:hidden w-8 h-8 rounded-full hover:bg-white/75 flex items-center justify-center text-slate-700 cursor-pointer shrink-0"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Floating Glass Panel (Single-Level Business Entries, Never a Left Fixed Sidebar) */}
      {mobileMenuOpen && (
        <div className="lg:hidden mt-2 glass-surface-elevated p-4 space-y-3 max-h-[calc(100dvh-84px)] overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PRIMARY_NAV.filter((n) => n.id !== 'manage_menu').map((item) => {
              const active = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    navigateAdmin(item.id as AdminNavSection);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium text-left cursor-pointer ${
                    active
                      ? 'bg-[#0071e3] text-white'
                      : 'bg-white/60 text-slate-800 hover:bg-white/90'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="pt-2 border-t border-slate-900/[0.07]">
            <p className="text-xs font-semibold text-slate-500 mb-2">设置</p>
            <div className="grid grid-cols-2 gap-2">
              {MANAGE_ITEMS.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => {
                    navigateAdmin(sub.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-medium text-left flex items-center gap-2 cursor-pointer ${
                    activeNav === sub.id
                      ? 'bg-[#0071e3]/12 text-[#0071e3]'
                      : 'bg-white/55 text-slate-700'
                  }`}
                >
                  {sub.icon}
                  {sub.label}
                </button>
              ))}
            </div>
          </div>
          <div className="pt-2 border-t border-slate-900/[0.07] flex flex-wrap gap-2">
            <GlassButton
              size="sm"
              variant="secondary"
              onClick={() => {
                setMobileMenuOpen(false);
                setGlobalSearchOpen(true);
              }}
            >
              <Search className="w-3.5 h-3.5" />
              全局搜索
            </GlassButton>
            <GlassButton
              size="sm"
              variant="secondary"
              onClick={() => {
                setMobileMenuOpen(false);
                switchPortal('exhibitor');
              }}
            >
              外部展商端
            </GlassButton>
            <GlassButton
              size="sm"
              variant="secondary"
              onClick={() => {
                setMobileMenuOpen(false);
                switchPortal('gift');
              }}
            >
              外部赠票端
            </GlassButton>
          </div>
        </div>
      )}
    </header>
  );
}
