import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type {
  Activity,
  AdminNavSection,
  AppNotification,
  AppPortal,
  PermissionModule,
  RealtimeEvent,
  RoleDefinition,
  SystemSettings,
  SystemUser,
} from '../../types/domain';
import { getApiClient, setApiAdapterMode } from '../../services/api';

export interface ToastItem {
  id: string;
  tone: 'success' | 'error' | 'info' | 'warning';
  title: string;
  detail?: string;
}

export interface ExternalPortalLaunchContext {
  exhibitorToken?: string;
  exhibitorPrefillBooth?: string;
  onsiteExtraToken?: string;
  giftBatchId?: string;
  invitedGiftToken?: string;
}

interface AppContextValue {
  user: SystemUser | null;
  role: RoleDefinition | null;
  portal: AppPortal;
  activeNav: AdminNavSection;
  activities: Activity[];
  activeActivityId: string;
  activeActivity: Activity | null;
  settings: SystemSettings | null;
  notifications: AppNotification[];
  toasts: ToastItem[];
  realtimeVersion: number;
  lastRealtimeEvent: RealtimeEvent | null;
  hasUnsavedChanges: boolean;
  globalSearchOpen: boolean;
  externalContext: ExternalPortalLaunchContext;
  setHasUnsavedChanges: (dirty: boolean) => void;
  setGlobalSearchOpen: (open: boolean) => void;
  navigateAdmin: (section: AdminNavSection) => void;
  switchPortal: (portal: AppPortal, context?: ExternalPortalLaunchContext) => void;
  selectActivity: (activityId: string) => Promise<boolean>;
  refreshCore: () => Promise<void>;
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
  canAccessModule: (mod: PermissionModule) => boolean;
  switchDemoUser: (userId: string) => Promise<void>;
  loginUser: (username: string, password: string, captchaToken?: string) => Promise<void>;
  logoutUser: () => Promise<void>;
  updateSystemSettings: (patch: Partial<SystemSettings>) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  pendingActivitySwitch: string | null;
  confirmPendingActivitySwitch: () => void;
  cancelPendingActivitySwitch: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SystemUser | null>(null);
  const [role, setRole] = useState<RoleDefinition | null>(null);
  const [portal, setPortal] = useState<AppPortal>('admin');
  const [activeNav, setActiveNav] = useState<AdminNavSection>('dashboard');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activeActivityId, setActiveActivityId] = useState<string>('act-gz-2027');
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [realtimeVersion, setRealtimeVersion] = useState(0);
  const [lastRealtimeEvent, setLastRealtimeEvent] = useState<RealtimeEvent | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingActivitySwitch, setPendingActivitySwitch] = useState<string | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [externalContext, setExternalContext] = useState<ExternalPortalLaunchContext>({});

  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [{ ...toast, id }, ...prev].slice(0, 4));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const refreshCore = useCallback(async () => {
    const api = getApiClient();
    const [session, acts, cfg] = await Promise.all([
      api.auth.getCurrentSession(),
      api.activities.list(),
      api.settings.getSettings(),
    ]);
    setUser(session?.user ?? null);
    setRole(session?.role ?? null);
    setActivities(acts);
    setSettings(cfg);
    if (!session) {
      setPortal('login');
    }
    const targetActId =
      activeActivityId === 'ALL'
        ? 'ALL'
        : acts.some((a) => a.id === activeActivityId)
          ? activeActivityId
          : acts[0]?.id || 'act-gz-2027';
    setActiveActivityId(targetActId);
    const notifs = await api.settings.listNotifications(
      targetActId === 'ALL' ? undefined : targetActId,
    );
    setNotifications(notifs);
  }, [activeActivityId]);

  useEffect(() => {
    refreshCore();
  }, [refreshCore]);

  useEffect(() => {
    const api = getApiClient();
    const unsub = api.realtime.subscribe((evt) => {
      setLastRealtimeEvent(evt);
      setRealtimeVersion((v) => v + 1);
    });
    return unsub;
  }, [settings?.adapterMode]);

  const activeActivity = useMemo(() => {
    if (activeActivityId === 'ALL') return null;
    return activities.find((a) => a.id === activeActivityId) ?? activities[0] ?? null;
  }, [activities, activeActivityId]);

  const canAccessModule = useCallback(
    (mod: PermissionModule) => {
      if (!role) return false;
      return role.modules.includes(mod);
    },
    [role],
  );

  const navigateAdmin = useCallback((section: AdminNavSection) => {
    setPortal('admin');
    setActiveNav(section);
  }, []);

  const switchPortal = useCallback(
    (nextPortal: AppPortal, context?: ExternalPortalLaunchContext) => {
      setPortal(nextPortal);
      if (context) {
        setExternalContext(context);
      } else if (nextPortal === 'admin') {
        setExternalContext({});
      }
    },
    [],
  );

  const applyActivitySwitch = useCallback(
    async (activityId: string) => {
      setActiveActivityId(activityId);
      setHasUnsavedChanges(false);
      setPendingActivitySwitch(null);
      const api = getApiClient();
      const notifs = await api.settings.listNotifications(
        activityId === 'ALL' ? undefined : activityId,
      );
      setNotifications(notifs);
      const target = activities.find((a) => a.id === activityId);
      pushToast({
        tone: 'info',
        title: activityId === 'ALL' ? '已切换至全部活动视图' : `已切换活动：${target?.name ?? ''}`,
        detail: '所有业务数据上下文已隔离并自动刷新',
      });
    },
    [activities, pushToast],
  );

  const selectActivity = useCallback(
    async (activityId: string) => {
      if (activityId === activeActivityId) return true;
      if (hasUnsavedChanges) {
        setPendingActivitySwitch(activityId);
        return false;
      }
      await applyActivitySwitch(activityId);
      return true;
    },
    [activeActivityId, hasUnsavedChanges, applyActivitySwitch],
  );

  const confirmPendingActivitySwitch = useCallback(() => {
    if (pendingActivitySwitch) {
      applyActivitySwitch(pendingActivitySwitch);
    }
  }, [pendingActivitySwitch, applyActivitySwitch]);

  const cancelPendingActivitySwitch = useCallback(() => {
    setPendingActivitySwitch(null);
  }, []);

  const switchDemoUser = useCallback(
    async (userId: string) => {
      const api = getApiClient();
      const res = await api.auth.switchDemoUser(userId);
      setUser(res.user);
      setRole(res.role);
      setPortal('admin');
      setActiveNav('dashboard');
      pushToast({
        tone: 'success',
        title: `已切换演示账号：${res.user.displayName}`,
        detail: `当前角色：${res.role.name}（权限已即时生效）`,
      });
    },
    [pushToast],
  );

  const loginUser = useCallback(
    async (username: string, password: string, captchaToken?: string) => {
      const api = getApiClient();
      const res = await api.auth.login(username, password, captchaToken);
      setUser(res.user);
      setRole(res.role);
      setPortal('admin');
      setActiveNav('dashboard');
      await refreshCore();
      pushToast({
        tone: 'success',
        title: `欢迎回来，${res.user.displayName}`,
        detail: res.isMockDemo ? '当前以演示模式登录（Mock Adapter）' : '服务端认证成功',
      });
    },
    [pushToast, refreshCore],
  );

  const logoutUser = useCallback(async () => {
    const api = getApiClient();
    await api.auth.logout();
    setUser(null);
    setRole(null);
    setPortal('login');
    pushToast({ tone: 'info', title: '已安全退出登录' });
  }, [pushToast]);

  const updateSystemSettings = useCallback(
    async (patch: Partial<SystemSettings>) => {
      if (!user) return;
      if (patch.adapterMode && patch.adapterMode !== settings?.adapterMode) {
        setApiAdapterMode(patch.adapterMode, patch.apiBaseUrl ?? settings?.apiBaseUrl);
      }
      const api = getApiClient();
      const updated = await api.settings.updateSettings(patch, user);
      setSettings(updated);
      setRealtimeVersion((v) => v + 1);
      pushToast({
        tone: 'success',
        title: '系统设置已保存',
        detail: updated.adapterMode === 'mock' ? '演示模式实时生效' : '已切换至生产 API 适配模式',
      });
    },
    [user, settings, pushToast],
  );

  const markAllNotificationsRead = useCallback(async () => {
    const api = getApiClient();
    await api.settings.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const value: AppContextValue = {
    user,
    role,
    portal,
    activeNav,
    activities,
    activeActivityId,
    activeActivity,
    settings,
    notifications,
    toasts,
    realtimeVersion,
    lastRealtimeEvent,
    hasUnsavedChanges,
    globalSearchOpen,
    externalContext,
    setHasUnsavedChanges,
    setGlobalSearchOpen,
    navigateAdmin,
    switchPortal,
    selectActivity,
    refreshCore,
    pushToast,
    dismissToast,
    canAccessModule,
    switchDemoUser,
    loginUser,
    logoutUser,
    updateSystemSettings,
    markAllNotificationsRead,
    pendingActivitySwitch,
    confirmPendingActivitySwitch,
    cancelPendingActivitySwitch,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
