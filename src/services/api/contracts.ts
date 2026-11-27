import type {
  Activity,
  ActivityStatus,
  AdapterMode,
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

export interface AuthService {
  login(username: string, password: string, captchaToken?: string): Promise<{ user: SystemUser; role: RoleDefinition; isMockDemo: boolean }>;
  getCurrentSession(): Promise<{ user: SystemUser; role: RoleDefinition } | null>;
  switchDemoUser(userId: string): Promise<{ user: SystemUser; role: RoleDefinition }>;
  updateProfile(patch: Partial<Pick<SystemUser, 'displayName' | 'email' | 'countryCode' | 'phone' | 'avatarUrl'>>): Promise<SystemUser>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  logout(): Promise<void>;
}

export interface ActivityService {
  list(filters?: { search?: string; status?: ActivityStatus | 'all' }): Promise<Activity[]>;
  getById(id: string): Promise<Activity | null>;
  create(input: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>, actor: SystemUser): Promise<Activity>;
  update(id: string, patch: Partial<Activity>, actor: SystemUser): Promise<Activity>;
  setStatus(id: string, status: ActivityStatus, actor: SystemUser, reason?: string): Promise<Activity>;
}

export interface ExhibitorService {
  list(activityId: string, search?: string): Promise<Exhibitor[]>;
  getById(activityId: string, exhibitorId: string): Promise<Exhibitor | null>;
  create(
    input: {
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
    },
    actor: SystemUser,
  ): Promise<{ exhibitor: Exhibitor; primaryMember: ExhibitorMember }>;
  updateQuota(activityId: string, exhibitorId: string, newQuota: number, reason: string, actor: SystemUser): Promise<Exhibitor>;
  updateEntryMode(activityId: string, exhibitorId: string, mode: EntryLinkMode | null, actor: SystemUser): Promise<Exhibitor>;
  resetBusinessPassword(activityId: string, exhibitorId: string, actor: SystemUser): Promise<Exhibitor>;
  togglePasswordActive(activityId: string, exhibitorId: string, active: boolean, actor: SystemUser): Promise<Exhibitor>;
  verifySevenFields(input: ExhibitorVerifyInput, captchaToken?: string): Promise<{ exhibitor: Exhibitor; isMockDemo: boolean }>;
}

export interface MemberService {
  list(activityId: string, filters?: { exhibitorId?: string; status?: CertificateStatus | 'all'; search?: string }): Promise<ExhibitorMember[]>;
  addMember(
    input: {
      activityId: string;
      exhibitorId: string;
      name: string;
      idType: IdType;
      idNumber: string;
      countryCode: string;
      phone: string;
      customFields?: Record<string, string>;
      certificateCategoryId?: string;
    },
    actorLabel: { id: string; name: string; role: string },
    bypassQuota?: boolean,
  ): Promise<ExhibitorMember>;
  batchImport(
    activityId: string,
    exhibitorId: string,
    rows: BatchImportRowPreview[],
    actorLabel: { id: string; name: string; role: string },
  ): Promise<{ imported: ExhibitorMember[]; skippedCount: number }>;
  updateMember(
    activityId: string,
    memberId: string,
    patch: Partial<Pick<ExhibitorMember, 'name' | 'idType' | 'idNumber' | 'countryCode' | 'phone' | 'certificateCategoryId' | 'customFields'>>,
    actorLabel: { id: string; name: string; role: string },
  ): Promise<ExhibitorMember>;
  uploadAvatar(
    activityId: string,
    memberId: string,
    avatarUrl: string,
    actorLabel: { id: string; name: string; role: string },
  ): Promise<ExhibitorMember>;
  setStatus(
    activityId: string,
    memberId: string,
    status: CertificateStatus,
    reason: string,
    actor: SystemUser,
  ): Promise<ExhibitorMember>;
}

export interface CertificateService {
  listCategories(activityId: string): Promise<CertificateCategory[]>;
  saveCategory(activityId: string, category: Omit<CertificateCategory, 'id' | 'activityId'> & { id?: string }, actor: SystemUser): Promise<CertificateCategory>;
  claimIndividual(activityId: string, memberId: string, actor: SystemUser): Promise<ExhibitorMember>;
  claimBatch(activityId: string, exhibitorId: string, memberIds: string[], actor: SystemUser): Promise<ExhibitorMember[]>;
  createOnsiteExtraToken(
    input: {
      activityId: string;
      exhibitorId: string;
      verifyInput: ExhibitorVerifyInput;
      extraCount: number;
      reason: string;
    },
    actor: SystemUser,
  ): Promise<OnsiteExtraToken>;
  listOnsiteExtraTokens(activityId: string): Promise<OnsiteExtraToken[]>;
  submitOnsiteExtraMember(
    token: string,
    memberInput: {
      name: string;
      idType: IdType;
      idNumber: string;
      countryCode: string;
      phone: string;
      avatarUrl?: string;
    },
  ): Promise<{ member: ExhibitorMember; tokenState: OnsiteExtraToken; isMockDemo: boolean }>;
}

export interface GiftService {
  listBatches(activityId: string): Promise<GiftBatch[]>;
  createBatch(input: Omit<GiftBatch, 'id' | 'claimedCount' | 'shareCode' | 'createdAt'>, actor: SystemUser): Promise<GiftBatch>;
  updateBatch(activityId: string, batchId: string, patch: Partial<GiftBatch>, actor: SystemUser): Promise<GiftBatch>;
}

export interface TicketService {
  listTickets(activityId: string, filters?: { batchId?: string; status?: GiftTicketStatus | 'all'; search?: string }): Promise<GiftTicket[]>;
  selfClaim(
    input: {
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
    },
    captchaToken?: string,
  ): Promise<{ ticket: GiftTicket; isMockDemo: boolean }>;
  backendDirectIssue(
    input: {
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
    },
    actor: SystemUser,
  ): Promise<{ ticket: GiftTicket; duplicateDetected: boolean }>;
  backendBatchImport(
    activityId: string,
    batchName: string,
    useDate: string,
    rows: Array<{ name: string; idType: IdType; idNumber: string; countryCode: string; phone: string }>,
    actor: SystemUser,
  ): Promise<{ created: GiftTicket[]; duplicates: string[] }>;
  getInvitedTicketMeta(claimLinkToken: string): Promise<InvitedTicketMeta>;
  completeInvitedTicket(
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
  ): Promise<GiftTicket>;
  retrieveByIdentity(
    input: {
      activityId: string;
      name: string;
      idType: IdType;
      idNumber: string;
      countryCode: string;
      phone: string;
    },
    captchaToken?: string,
  ): Promise<{ tickets: GiftTicket[]; isMockDemo: boolean }>;
  setTicketStatus(activityId: string, ticketId: string, status: GiftTicketStatus, reason: string, actor: SystemUser): Promise<GiftTicket>;
}

export interface QRService {
  issueDynamicToken(credentialKind: CredentialKind, credentialId: string, activityId: string): Promise<DynamicQRToken>;
  inspectToken(rawInput: string, activityId: string): Promise<RedemptionPreview>;
}

export interface RedemptionService {
  verifyAndPreview(rawCodeOrToken: string, activityId: string, currentDateOverride?: string): Promise<RedemptionPreview>;
  confirmRedemption(
    rawCodeOrToken: string,
    activityId: string,
    mode: RedemptionMode,
    actor: SystemUser,
    deviceLabel?: string,
    currentDateOverride?: string,
  ): Promise<{ record: RedemptionRecord; preview: RedemptionPreview; isMockDemo: boolean }>;
  listRecords(activityId: string, search?: string): Promise<RedemptionRecord[]>;
}

export interface UserService {
  listUsers(): Promise<SystemUser[]>;
  saveUser(user: Omit<SystemUser, 'id' | 'lastLoginAt'> & { id?: string }, actor: SystemUser): Promise<SystemUser>;
  setUserRedemptionMode(userId: string, mode: RedemptionMode, actor: SystemUser): Promise<SystemUser>;
}

export interface PermissionService {
  listRoles(): Promise<RoleDefinition[]>;
  saveRole(role: Omit<RoleDefinition, 'id' | 'isPreset'> & { id?: string }, actor: SystemUser): Promise<RoleDefinition>;
  deleteRole(roleId: string, actor: SystemUser): Promise<void>;
  listDepartments(): Promise<Department[]>;
  saveDepartment(dept: Omit<Department, 'id' | 'memberCount' | 'createdAt'> & { id?: string }, actor: SystemUser): Promise<Department>;
}

export interface CaptchaService {
  assessRisk(action: string, subjectKey: string): Promise<CaptchaChallenge>;
  verifyChallenge(challengeId: string, answer: string): Promise<CaptchaVerificationResult>;
}

export interface FileService {
  uploadImage(file: File | Blob, category: 'avatar' | 'cover'): Promise<{ url: string; isMockDemo: boolean }>;
}

export interface AuditLogService {
  list(filters?: { activityId?: string | 'all'; action?: string | 'all'; search?: string }): Promise<AuditLogEntry[]>;
  recordSensitiveView(activityId: string, targetLabel: string, actor: SystemUser, fieldName?: string): Promise<void>;
  recordDataExport(activityId: string, targetLabel: string, actor: SystemUser): Promise<void>;
}

export interface SettingsService {
  getSettings(): Promise<SystemSettings>;
  updateSettings(patch: Partial<SystemSettings>, actor: SystemUser): Promise<SystemSettings>;
  listNotifications(activityId?: string): Promise<AppNotification[]>;
  markAllNotificationsRead(): Promise<void>;
}

export interface RealtimeService {
  subscribe(listener: (event: RealtimeEvent) => void): () => void;
  getNowMs(): number;
}

export interface ApiClient {
  readonly mode: AdapterMode;
  auth: AuthService;
  activities: ActivityService;
  exhibitors: ExhibitorService;
  members: MemberService;
  certificates: CertificateService;
  gifts: GiftService;
  tickets: TicketService;
  qr: QRService;
  redemption: RedemptionService;
  users: UserService;
  permissions: PermissionService;
  captcha: CaptchaService;
  files: FileService;
  auditLogs: AuditLogService;
  settings: SettingsService;
  realtime: RealtimeService;
}
