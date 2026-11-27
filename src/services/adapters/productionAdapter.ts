import type {
  Activity,
  ActivityStatus,
  AppNotification,
  AuditLogEntry,
  BatchImportRowPreview,
  CaptchaChallenge,
  CaptchaVerificationResult,
  CertificateCategory,
  CertificateStatus,
  CredentialKind,
  Department,
  DynamicQRToken,
  EntryLinkMode,
  Exhibitor,
  ExhibitorMember,
  ExhibitorVerifyInput,
  GiftBatch,
  GiftTicket,
  GiftTicketStatus,
  IdType,
  InvitedTicketMeta,
  OnsiteExtraToken,
  RealtimeEvent,
  RedemptionMode,
  RedemptionPreview,
  RedemptionRecord,
  RoleDefinition,
  SystemSettings,
  SystemUser,
} from '../../types/domain';
import type { ApiClient } from '../api/contracts';

/**
 * ProductionApiAdapter
 *
 * Pre-wired REST + SSE client skeleton reserved for backend integration.
 * Never embeds server secrets, database credentials, or QR signing keys on the client.
 * All dynamic QR tokens, Smart CAPTCHA verification, identity deduplication, and
 * atomic redemption locks are enforced authoritatively by the backend API.
 */
export class ProductionApiAdapter implements ApiClient {
  public readonly mode = 'production' as const;
  private baseUrl: string;
  private authTokenProvider: () => string | null;

  constructor(baseUrl = '/api/v1', authTokenProvider: () => string | null = () => null) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.authTokenProvider = authTokenProvider;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.authTokenProvider();
    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody?.message || `服务端接口请求失败（HTTP ${res.status}）`);
    }
    return (await res.json()) as T;
  }

  public readonly realtime = {
    subscribe: (listener: (event: RealtimeEvent) => void) => {
      if (typeof EventSource === 'undefined') return () => {};
      const source = new EventSource(`${this.baseUrl}/realtime/stream`, { withCredentials: true });
      source.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data) as RealtimeEvent;
          listener({ ...parsed, isMockDemo: false });
        } catch {
          // Ignore malformed keepalive frames
        }
      };
      return () => source.close();
    },
    getNowMs: () => Date.now(),
  };

  public readonly auth = {
    login: (username: string, password: string, captchaToken?: string) =>
      this.request<{ user: SystemUser; role: RoleDefinition; isMockDemo: boolean }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, captchaToken }),
      }),
    getCurrentSession: () =>
      this.request<{ user: SystemUser; role: RoleDefinition } | null>('/auth/session'),
    switchDemoUser: async () => {
      throw new Error('生产模式不支持演示角色切换');
    },
    updateProfile: (patch: Partial<Pick<SystemUser, 'displayName' | 'email' | 'countryCode' | 'phone' | 'avatarUrl'>>) =>
      this.request<SystemUser>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    changePassword: (currentPassword: string, newPassword: string) =>
      this.request<void>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    logout: () => this.request<void>('/auth/logout', { method: 'POST' }),
  };

  public readonly activities = {
    list: (filters?: { search?: string; status?: ActivityStatus | 'all' }) => {
      const qs = new URLSearchParams();
      if (filters?.search) qs.set('search', filters.search);
      if (filters?.status && filters.status !== 'all') qs.set('status', filters.status);
      return this.request<Activity[]>(`/activities?${qs.toString()}`);
    },
    getById: (id: string) => this.request<Activity | null>(`/activities/${id}`),
    create: (input: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>) =>
      this.request<Activity>('/activities', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, patch: Partial<Activity>) =>
      this.request<Activity>(`/activities/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    setStatus: (id: string, status: ActivityStatus, _actor: SystemUser, reason?: string) =>
      this.request<Activity>(`/activities/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      }),
  };

  public readonly exhibitors = {
    list: (activityId: string, search?: string) =>
      this.request<Exhibitor[]>(`/activities/${activityId}/exhibitors?search=${encodeURIComponent(search ?? '')}`),
    getById: (activityId: string, exhibitorId: string) =>
      this.request<Exhibitor | null>(`/activities/${activityId}/exhibitors/${exhibitorId}`),
    create: (input: {
      activityId: string;
      boothNumber: string;
      boothName: string;
      primaryContactName: string;
      primaryIdType: IdType;
      primaryIdNumber: string;
      countryCode: string;
      phone: string;
      quota: number;
      entryModeOverride: EntryLinkMode | null;
      certificateCategoryId?: string;
    }) =>
      this.request<{ exhibitor: Exhibitor; primaryMember: ExhibitorMember }>(
        `/activities/${input.activityId}/exhibitors`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    updateQuota: (activityId: string, exhibitorId: string, newQuota: number, reason: string) =>
      this.request<Exhibitor>(`/activities/${activityId}/exhibitors/${exhibitorId}/quota`, {
        method: 'PATCH',
        body: JSON.stringify({ newQuota, reason }),
      }),
    updateEntryMode: (activityId: string, exhibitorId: string, mode: EntryLinkMode | null) =>
      this.request<Exhibitor>(`/activities/${activityId}/exhibitors/${exhibitorId}/entry-mode`, {
        method: 'PATCH',
        body: JSON.stringify({ entryModeOverride: mode }),
      }),
    resetBusinessPassword: (activityId: string, exhibitorId: string) =>
      this.request<Exhibitor>(`/activities/${activityId}/exhibitors/${exhibitorId}/reset-password`, {
        method: 'POST',
      }),
    togglePasswordActive: (activityId: string, exhibitorId: string, active: boolean) =>
      this.request<Exhibitor>(`/activities/${activityId}/exhibitors/${exhibitorId}/password-state`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      }),
    verifySevenFields: (input: ExhibitorVerifyInput, captchaToken?: string) =>
      this.request<{ exhibitor: Exhibitor; isMockDemo: boolean }>('/public/exhibitor/verify', {
        method: 'POST',
        body: JSON.stringify({ ...input, captchaToken }),
      }),
  };

  public readonly members = {
    list: (activityId: string, filters?: { exhibitorId?: string; status?: CertificateStatus | 'all'; search?: string }) => {
      const qs = new URLSearchParams();
      if (filters?.exhibitorId) qs.set('exhibitorId', filters.exhibitorId);
      if (filters?.status && filters.status !== 'all') qs.set('status', filters.status);
      if (filters?.search) qs.set('search', filters.search);
      return this.request<ExhibitorMember[]>(`/activities/${activityId}/members?${qs.toString()}`);
    },
    addMember: (input: {
      activityId: string;
      exhibitorId: string;
      name: string;
      idType: IdType;
      idNumber: string;
      countryCode: string;
      phone: string;
      customFields?: Record<string, string>;
      certificateCategoryId?: string;
    }) =>
      this.request<ExhibitorMember>(`/activities/${input.activityId}/exhibitors/${input.exhibitorId}/members`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    batchImport: (activityId: string, exhibitorId: string, rows: BatchImportRowPreview[]) =>
      this.request<{ imported: ExhibitorMember[]; skippedCount: number }>(
        `/activities/${activityId}/exhibitors/${exhibitorId}/members/batch-import`,
        { method: 'POST', body: JSON.stringify({ rows }) },
      ),
    updateMember: (activityId: string, memberId: string, patch: Partial<ExhibitorMember>) =>
      this.request<ExhibitorMember>(`/activities/${activityId}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    uploadAvatar: (activityId: string, memberId: string, avatarUrl: string) =>
      this.request<ExhibitorMember>(`/activities/${activityId}/members/${memberId}/avatar`, {
        method: 'POST',
        body: JSON.stringify({ avatarUrl }),
      }),
    setStatus: (activityId: string, memberId: string, status: CertificateStatus, reason: string) =>
      this.request<ExhibitorMember>(`/activities/${activityId}/members/${memberId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      }),
  };

  public readonly certificates = {
    listCategories: (activityId: string) =>
      this.request<CertificateCategory[]>(`/activities/${activityId}/certificate-categories`),
    saveCategory: (activityId: string, category: Omit<CertificateCategory, 'id' | 'activityId'> & { id?: string }) =>
      this.request<CertificateCategory>(`/activities/${activityId}/certificate-categories`, {
        method: category.id ? 'PATCH' : 'POST',
        body: JSON.stringify(category),
      }),
    claimIndividual: (activityId: string, memberId: string) =>
      this.request<ExhibitorMember>(`/activities/${activityId}/certificates/${memberId}/claim`, {
        method: 'POST',
      }),
    claimBatch: (activityId: string, exhibitorId: string, memberIds: string[]) =>
      this.request<ExhibitorMember[]>(`/activities/${activityId}/exhibitors/${exhibitorId}/claim-batch`, {
        method: 'POST',
        body: JSON.stringify({ memberIds }),
      }),
    createOnsiteExtraToken: (input: {
      activityId: string;
      exhibitorId: string;
      verifyInput: ExhibitorVerifyInput;
      extraCount: number;
      reason: string;
    }) =>
      this.request<OnsiteExtraToken>(`/activities/${input.activityId}/onsite-extra-tokens`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    listOnsiteExtraTokens: (activityId: string) =>
      this.request<OnsiteExtraToken[]>(`/activities/${activityId}/onsite-extra-tokens`),
    submitOnsiteExtraMember: (
      token: string,
      memberInput: { name: string; idType: IdType; idNumber: string; countryCode: string; phone: string; avatarUrl?: string },
    ) =>
      this.request<{ member: ExhibitorMember; tokenState: OnsiteExtraToken; isMockDemo: boolean }>(
        `/public/onsite-extra/${encodeURIComponent(token)}`,
        { method: 'POST', body: JSON.stringify(memberInput) },
      ),
  };

  public readonly gifts = {
    listBatches: (activityId: string) =>
      this.request<GiftBatch[]>(`/activities/${activityId}/gift-batches`),
    createBatch: (input: Omit<GiftBatch, 'id' | 'claimedCount' | 'shareCode' | 'createdAt'>) =>
      this.request<GiftBatch>(`/activities/${input.activityId}/gift-batches`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    updateBatch: (activityId: string, batchId: string, patch: Partial<GiftBatch>) =>
      this.request<GiftBatch>(`/activities/${activityId}/gift-batches/${batchId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
  };

  public readonly tickets = {
    listTickets: (activityId: string, filters?: { batchId?: string; status?: GiftTicketStatus | 'all'; search?: string }) => {
      const qs = new URLSearchParams();
      if (filters?.batchId) qs.set('batchId', filters.batchId);
      if (filters?.status && filters.status !== 'all') qs.set('status', filters.status);
      if (filters?.search) qs.set('search', filters.search);
      return this.request<GiftTicket[]>(`/activities/${activityId}/gift-tickets?${qs.toString()}`);
    },
    selfClaim: (input: {
      activityId: string;
      batchId: string;
      name: string;
      idType: IdType;
      idNumber: string;
      countryCode: string;
      phone: string;
      useDate: string;
      avatarUrl: string;
      customFields?: Record<string, string>;
    }, captchaToken?: string) =>
      this.request<{ ticket: GiftTicket; isMockDemo: boolean }>('/public/gift-tickets/self-claim', {
        method: 'POST',
        body: JSON.stringify({ ...input, captchaToken }),
      }),
    backendDirectIssue: (input: {
      activityId: string;
      batchName: string;
      name: string;
      idType: IdType;
      idNumber: string;
      countryCode: string;
      phone: string;
      useDate: string;
      avatarUrl: string;
      allowDuplicateOverride?: boolean;
    }) =>
      this.request<{ ticket: GiftTicket; duplicateDetected: boolean }>(
        `/activities/${input.activityId}/gift-tickets/direct`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    backendBatchImport: (
      activityId: string,
      batchName: string,
      useDate: string,
      rows: Array<{ name: string; idType: IdType; idNumber: string; countryCode: string; phone: string }>,
    ) =>
      this.request<{ created: GiftTicket[]; duplicates: string[] }>(
        `/activities/${activityId}/gift-tickets/batch-import`,
        { method: 'POST', body: JSON.stringify({ batchName, useDate, rows }) },
      ),
    getInvitedTicketMeta: (claimLinkToken: string) =>
      this.request<InvitedTicketMeta>(`/public/gift-tickets/invited/${encodeURIComponent(claimLinkToken)}/meta`),
    completeInvitedTicket: (
      claimLinkToken: string,
      input: {
        name: string;
        idType: IdType;
        idNumber: string;
        countryCode: string;
        phone: string;
        useDate: string;
        avatarUrl: string;
        customFields?: Record<string, string>;
      },
    ) =>
      this.request<GiftTicket>(`/public/gift-tickets/invited/${encodeURIComponent(claimLinkToken)}`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    retrieveByIdentity: (
      input: {
        activityId: string;
        name: string;
        idType: IdType;
        idNumber: string;
        countryCode: string;
        phone: string;
      },
      captchaToken?: string,
    ) =>
      this.request<{ tickets: GiftTicket[]; isMockDemo: boolean }>('/public/gift-tickets/retrieve', {
        method: 'POST',
        body: JSON.stringify({ ...input, captchaToken }),
      }),
    setTicketStatus: (activityId: string, ticketId: string, status: GiftTicketStatus, reason: string) =>
      this.request<GiftTicket>(`/activities/${activityId}/gift-tickets/${ticketId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      }),
  };

  public readonly qr = {
    issueDynamicToken: (credentialKind: CredentialKind, credentialId: string, activityId: string) =>
      this.request<DynamicQRToken>('/qr/issue', {
        method: 'POST',
        body: JSON.stringify({ credentialKind, credentialId, activityId }),
      }),
    inspectToken: (rawInput: string, activityId: string) =>
      this.request<RedemptionPreview>('/redemption/preview', {
        method: 'POST',
        body: JSON.stringify({ code: rawInput, activityId }),
      }),
  };

  public readonly redemption = {
    verifyAndPreview: (rawCodeOrToken: string, activityId: string) =>
      this.request<RedemptionPreview>('/redemption/preview', {
        method: 'POST',
        body: JSON.stringify({ code: rawCodeOrToken, activityId }),
      }),
    confirmRedemption: (
      rawCodeOrToken: string,
      activityId: string,
      mode: RedemptionMode,
      _actor: SystemUser,
      deviceLabel?: string,
    ) =>
      this.request<{ record: RedemptionRecord; preview: RedemptionPreview; isMockDemo: boolean }>(
        '/redemption/confirm',
        {
          method: 'POST',
          body: JSON.stringify({ code: rawCodeOrToken, activityId, mode, deviceLabel }),
        },
      ),
    listRecords: (activityId: string, search?: string) =>
      this.request<RedemptionRecord[]>(
        `/activities/${activityId}/redemption-records?search=${encodeURIComponent(search ?? '')}`,
      ),
  };

  public readonly users = {
    listUsers: () => this.request<SystemUser[]>('/admin/users'),
    saveUser: (user: Omit<SystemUser, 'id' | 'lastLoginAt'> & { id?: string }) =>
      this.request<SystemUser>('/admin/users', {
        method: user.id ? 'PATCH' : 'POST',
        body: JSON.stringify(user),
      }),
    setUserRedemptionMode: (userId: string, mode: RedemptionMode) =>
      this.request<SystemUser>(`/admin/users/${userId}/redemption-mode`, {
        method: 'PATCH',
        body: JSON.stringify({ mode }),
      }),
  };

  public readonly permissions = {
    listRoles: () => this.request<RoleDefinition[]>('/admin/roles'),
    saveRole: (role: Omit<RoleDefinition, 'id' | 'isPreset'> & { id?: string }) =>
      this.request<RoleDefinition>('/admin/roles', {
        method: role.id ? 'PATCH' : 'POST',
        body: JSON.stringify(role),
      }),
    deleteRole: (roleId: string) =>
      this.request<void>(`/admin/roles/${roleId}`, { method: 'DELETE' }),
    listDepartments: () => this.request<Department[]>('/admin/departments'),
    saveDepartment: (dept: Omit<Department, 'id' | 'memberCount' | 'createdAt'> & { id?: string }) =>
      this.request<Department>('/admin/departments', {
        method: dept.id ? 'PATCH' : 'POST',
        body: JSON.stringify(dept),
      }),
  };

  public readonly captcha = {
    assessRisk: (action: string, subjectKey: string) =>
      this.request<CaptchaChallenge>('/captcha/assess', {
        method: 'POST',
        body: JSON.stringify({ action, subjectKey }),
      }),
    verifyChallenge: (challengeId: string, answer: string) =>
      this.request<CaptchaVerificationResult>('/captcha/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeId, answer }),
      }),
  };

  public readonly files = {
    uploadImage: async (file: File | Blob, category: 'avatar' | 'cover') => {
      const form = new FormData();
      form.append('file', file);
      form.append('category', category);
      return this.request<{ url: string; isMockDemo: boolean }>('/files/upload', {
        method: 'POST',
        body: form,
      });
    },
  };

  public readonly auditLogs = {
    list: (filters?: { activityId?: string | 'all'; action?: string | 'all'; search?: string }) => {
      const qs = new URLSearchParams();
      if (filters?.activityId && filters.activityId !== 'all') qs.set('activityId', filters.activityId);
      if (filters?.action && filters.action !== 'all') qs.set('action', filters.action);
      if (filters?.search) qs.set('search', filters.search);
      return this.request<AuditLogEntry[]>(`/admin/audit-logs?${qs.toString()}`);
    },
    recordSensitiveView: (activityId: string, targetLabel: string, _actor: SystemUser, fieldName?: string) =>
      this.request<void>('/admin/audit-logs/sensitive-view', {
        method: 'POST',
        body: JSON.stringify({ activityId, targetLabel, fieldName }),
      }),
    recordDataExport: (activityId: string, targetLabel: string) =>
      this.request<void>('/admin/audit-logs/data-export', {
        method: 'POST',
        body: JSON.stringify({ activityId, targetLabel }),
      }),
  };

  public readonly settings = {
    getSettings: () => this.request<SystemSettings>('/admin/settings'),
    updateSettings: (patch: Partial<SystemSettings>) =>
      this.request<SystemSettings>('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    listNotifications: (activityId?: string) =>
      this.request<AppNotification[]>(`/notifications?activityId=${encodeURIComponent(activityId ?? '')}`),
    markAllNotificationsRead: () =>
      this.request<void>('/notifications/read-all', { method: 'POST' }),
  };
}
