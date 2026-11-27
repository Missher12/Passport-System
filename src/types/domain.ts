export type AdapterMode = 'mock' | 'production';

export type ActivityStatus = 'draft' | 'active' | 'paused' | 'archived';
export type EntryLinkMode = 'A_INDEPENDENT' | 'B_UNIFIED';

export type IdType =
  | 'cn_id'
  | 'passport'
  | 'hk_mo_pass'
  | 'tw_pass'
  | 'foreign_pr';

export interface ActivityTimeWindows {
  exhibitorRegisterStart: string;
  exhibitorRegisterEnd: string;
  avatarUploadStart: string;
  avatarUploadEnd: string;
  badgeClaimStart: string;
  badgeClaimEnd: string;
  giftSelfClaimStart: string;
  giftSelfClaimEnd: string;
  giftBackendIssueEnd: string;
  onsiteExtraStart: string;
  redemptionValidStart: string;
  redemptionValidEnd: string;
}

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'radio'
  | 'checkbox'
  | 'select'
  | 'date'
  | 'number';

export interface CustomFieldDefinition {
  id: string;
  label: string;
  type?: CustomFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface Activity {
  id: string;
  code: string;
  name: string;
  coverUrl: string;
  location: string;
  startAt: string;
  endAt: string;
  description: string;
  timezone: string;
  status: ActivityStatus;
  defaultEntryMode: EntryLinkMode;
  memberCustomFields: CustomFieldDefinition[];
  timeWindows: ActivityTimeWindows;
  createdAt: string;
  updatedAt: string;
}

export interface Exhibitor {
  id: string;
  activityId: string;
  boothNumber: string;
  boothName: string;
  primaryContactName: string;
  primaryIdType: IdType;
  primaryIdNumber: string;
  countryCode: string;
  phone: string;
  businessPassword: string;
  passwordActive: boolean;
  quota: number;
  onsiteExtraCount: number;
  entryModeOverride: EntryLinkMode | null;
  independentToken: string;
  createdAt: string;
  updatedAt: string;
}

export type CertificateStatus =
  | 'waiting_registration'
  | 'submitted'
  | 'waiting_avatar'
  | 'avatar_completed'
  | 'credential_generated'
  | 'badge_claimed'
  | 'frozen'
  | 'voided'
  | 'pending';

export interface CertificateCategory {
  id: string;
  activityId: string;
  name: string;
  color: string;
  enabled: boolean;
}

export interface BadgeClaimRecord {
  claimedAt: string;
  operatorId: string;
  operatorName: string;
  method: 'individual_scan' | 'booth_batch';
}

export interface ExhibitorMember {
  id: string;
  activityId: string;
  exhibitorId: string;
  boothNumber: string;
  memberCode: string; // e.g., A01-01
  name: string;
  idType: IdType;
  idNumber: string;
  countryCode: string;
  phone: string;
  customFields: Record<string, string>;
  isPrimaryContact: boolean;
  isOnsiteExtra: boolean;
  onsiteExtraReason?: string;
  certificateCategoryId: string;
  status: CertificateStatus;
  avatarUrl?: string;
  avatarUpdatedAt?: string;
  validDates: string[];
  claimRecord?: BadgeClaimRecord;
  lastRedeemedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OnsiteExtraToken {
  id: string;
  token: string;
  activityId: string;
  exhibitorId: string;
  boothNumber: string;
  boothName: string;
  originalQuota: number;
  extraCount: number;
  usedCount: number;
  reason: string;
  operatorId: string;
  operatorName: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

export type GiftTicketStatus =
  | 'waiting_fill'
  | 'submitted'
  | 'generated'
  | 'valid'
  | 'redeemed'
  | 'voided'
  | 'expired'
  | 'frozen';

export type GiftIssueMode = 'self_claim' | 'backend_import' | 'backend_direct';

export interface GiftBatch {
  id: string;
  activityId: string;
  name: string;
  totalQuota: number;
  claimedCount: number;
  openAt: string;
  closeAt: string;
  availableDates: string[];
  customFields: CustomFieldDefinition[];
  enabled: boolean;
  shareCode: string;
  createdAt: string;
}

export interface GiftTicket {
  id: string;
  activityId: string;
  batchId?: string;
  batchName: string;
  ticketCode: string;
  mode: GiftIssueMode;
  name: string;
  idType: IdType;
  idNumber: string;
  identityKey: string;
  countryCode: string;
  phone: string;
  useDate: string;
  availableDates?: string[];
  avatarUrl?: string;
  customFields: Record<string, string>;
  status: GiftTicketStatus;
  claimLinkToken?: string;
  redeemedAt?: string;
  redeemedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvitedTicketMeta {
  activityId: string;
  activityName: string;
  batchName: string;
  ticketCode: string;
  status: GiftTicketStatus;
  availableDates: string[];
  useDate: string;
  customFields: CustomFieldDefinition[];
  alreadyCompleted: boolean;
}

export type CredentialKind = 'certificate' | 'gift';

export interface DynamicQRToken {
  token: string;
  credentialKind: CredentialKind;
  credentialId: string;
  activityId: string;
  displayCode: string;
  issuedAt: number;
  expiresAt: number;
  isMockDemo: boolean;
}

export type RedemptionMode = 'normal' | 'fast';

export type RedemptionOutcome =
  | 'success'
  | 'duplicate'
  | 'expired'
  | 'frozen'
  | 'voided'
  | 'date_mismatch'
  | 'invalid'
  | 'offline';

export interface RedemptionPreview {
  valid: boolean;
  outcome: RedemptionOutcome;
  message: string;
  credentialKind?: CredentialKind;
  credentialId?: string;
  activityId?: string;
  displayCode?: string;
  holderName?: string;
  avatarUrl?: string;
  categoryOrBatch?: string;
  validDateLabel?: string;
  statusLabel?: string;
  alreadyRedeemedAt?: string;
  isMockDemo: boolean;
}

export interface RedemptionRecord {
  id: string;
  activityId: string;
  credentialKind: CredentialKind;
  credentialId: string;
  displayCode: string;
  holderName: string;
  categoryOrBatch: string;
  mode: RedemptionMode;
  outcome: RedemptionOutcome;
  message: string;
  operatorId: string;
  operatorName: string;
  deviceLabel: string;
  createdAt: string;
}

export type PermissionModule =
  | 'dashboard'
  | 'activities'
  | 'exhibitors'
  | 'certificates'
  | 'gifts'
  | 'redemption'
  | 'users'
  | 'roles'
  | 'departments'
  | 'audit_logs'
  | 'settings';

export type PresetRoleCode =
  | 'sys_admin'
  | 'activity_admin'
  | 'badge_issuer'
  | 'gift_admin'
  | 'onsite_scanner';

export interface Department {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  active?: boolean;
  createdAt: string;
}

export interface RoleDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  isPreset: boolean;
  active?: boolean;
  modules: PermissionModule[];
  defaultRedemptionMode: RedemptionMode;
  canViewUnmaskedSensitive: boolean;
  canOverrideDuplicateGift: boolean;
}

export interface SystemUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  countryCode: string;
  phone: string;
  departmentId: string;
  roleId: string;
  authorizedActivityIds: string[] | 'ALL';
  redemptionMode: RedemptionMode;
  active: boolean;
  avatarUrl?: string;
  lastLoginAt: string;
}

export type AuditActionType =
  | 'create_activity'
  | 'update_activity'
  | 'create_exhibitor'
  | 'reset_business_password'
  | 'member_add'
  | 'member_update'
  | 'onsite_extra_badge'
  | 'avatar_upload'
  | 'badge_claim'
  | 'gift_issue'
  | 'gift_void'
  | 'redemption'
  | 'duplicate_redemption'
  | 'view_sensitive'
  | 'data_export'
  | 'permission_change';

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  timestamp: string;
  activityId: string;
  activityName: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  action: AuditActionType;
  beforeState: string;
  afterState: string;
  reason: string;
  result: 'success' | 'rejected' | 'error';
}

export interface CaptchaChallenge {
  challengeId: string;
  required: boolean;
  riskScore: number;
  prompt: string;
  expectedAnswer: string;
  isMockDemo: boolean;
}

export interface CaptchaVerificationResult {
  passed: boolean;
  token?: string;
  message: string;
  isMockDemo: boolean;
}

export interface SystemSettings {
  adapterMode: AdapterMode;
  apiBaseUrl: string;
  defaultLocale: 'zh-CN' | 'en-US';
  qrRefreshSeconds: number;
  captchaRiskThreshold: number;
  maskSensitiveByDefault: boolean;
  rateLimitPerMinute: number;
  maxPasswordFailures: number;
  simulateOffline: boolean;
  simulatedClockOffsetDays: number;
}

export interface AppNotification {
  id: string;
  activityId: string;
  title: string;
  detail: string;
  createdAt: string;
  read: boolean;
  category: 'info' | 'success' | 'warning';
}

export interface RealtimeEvent {
  type:
    | 'activity_updated'
    | 'exhibitor_updated'
    | 'member_updated'
    | 'badge_claimed'
    | 'gift_updated'
    | 'redemption_recorded'
    | 'permission_updated'
    | 'audit_logged'
    | 'settings_updated';
  activityId?: string;
  timestamp: number;
  summary: string;
  isMockDemo: boolean;
}

export type AppPortal = 'admin' | 'exhibitor' | 'gift' | 'login';

export type AdminNavSection =
  | 'dashboard'
  | 'activities'
  | 'exhibitors'
  | 'certificates'
  | 'gifts'
  | 'redemption'
  | 'admin_settings'
  | 'admin_profile'
  | 'admin_password'
  | 'admin_general'
  | 'admin_redemption_settings'
  | 'admin_security'
  | 'admin_users'
  | 'admin_roles'
  | 'admin_departments'
  | 'admin_audit';

export interface ExhibitorVerifyInput {
  activityId: string;
  boothNumber: string;
  boothName: string;
  primaryContactName: string;
  primaryIdType: IdType;
  primaryIdNumber: string;
  countryCode: string;
  phone: string;
  businessPassword: string;
  independentToken?: string;
}

export interface BatchImportRowPreview {
  rowNumber: number;
  name: string;
  idType: IdType;
  idNumber: string;
  countryCode: string;
  phone: string;
  extraFields: Record<string, string>;
  valid: boolean;
  errors: string[];
}
