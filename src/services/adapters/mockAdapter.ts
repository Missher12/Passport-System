import type {
  Activity,
  ActivityStatus,
  AuditActionType,
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
import {
  CERTIFICATE_STATUS_LABELS,
  GIFT_STATUS_LABELS,
  canGenerateCertificateCredential,
  canTransitionCertificateStatus,
  canTransitionGiftStatus,
  computeNextMemberCode,
  matchExhibitorSevenFields,
  normalizeIdentityKey,
  resolveExhibitorPortalPhase,
  validateIdNumber,
  validatePhone,
} from '../../utils/stateMachines';
import type { ApiClient } from '../api/contracts';
import { createInitialSeedDatabase, type MockDatabase } from './seedData';

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export class MockApiAdapter implements ApiClient {
  public readonly mode = 'mock' as const;
  private db: MockDatabase;
  private currentUserId = 'usr-admin';
  private listeners = new Set<(event: RealtimeEvent) => void>();
  private qrTokens = new Map<string, DynamicQRToken>();
  private activeRedemptionLocks = new Set<string>();
  private failedVerifyCounters = new Map<string, number>();
  private captchaChallenges = new Map<string, CaptchaChallenge>();
  private verifiedCaptchaTokens = new Set<string>();
  private baseClockMs: number;

  constructor(initialDb?: MockDatabase, baseClockIso = '2026-11-26T10:30:00+08:00') {
    this.db = initialDb ?? createInitialSeedDatabase();
    this.baseClockMs = Date.parse(baseClockIso);
  }

  private getNowMs(): number {
    return this.baseClockMs + this.db.settings.simulatedClockOffsetDays * 24 * 60 * 60 * 1000;
  }

  private getNowIso(): string {
    return new Date(this.getNowMs()).toISOString();
  }

  private getTodayDateStr(): string {
    const d = new Date(this.getNowMs());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private emit(type: RealtimeEvent['type'], summary: string, activityId?: string) {
    const event: RealtimeEvent = {
      type,
      activityId,
      timestamp: Date.now(),
      summary: `${summary}（Mock 演示同步）`,
      isMockDemo: true,
    };
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private getRoleForUser(user: SystemUser): RoleDefinition {
    return this.db.roles.find((r) => r.id === user.roleId) ?? this.db.roles[0];
  }

  private getCurrentUser(): SystemUser | null {
    return this.db.users.find((u) => u.id === this.currentUserId) ?? null;
  }

  private matchesActivityScope(itemActivityId: string, requestedActivityId: string): boolean {
    if (requestedActivityId !== 'ALL') {
      return itemActivityId === requestedActivityId;
    }
    const actor = this.getCurrentUser();
    if (!actor || actor.authorizedActivityIds === 'ALL') return true;
    return actor.authorizedActivityIds.includes(itemActivityId);
  }

  private assertConcreteActivity(activityId: string): void {
    if (!activityId || activityId === 'ALL') {
      throw new Error('请先在顶部选择具体活动后再执行此操作');
    }
  }

  private getActivityName(activityId: string): string {
    if (activityId === 'ALL') return '全部活动';
    return this.db.activities.find((a) => a.id === activityId)?.name ?? '全局系统';
  }

  private pushAudit(params: {
    actorId: string;
    actorName: string;
    actorRole: string;
    activityId: string;
    targetType: string;
    targetId: string;
    targetLabel: string;
    action: AuditActionType;
    beforeState: string;
    afterState: string;
    reason: string;
    result: 'success' | 'rejected' | 'error';
  }) {
    const entry: AuditLogEntry = {
      id: uid('log'),
      timestamp: this.getNowIso(),
      activityName: this.getActivityName(params.activityId),
      ...params,
    };
    this.db.auditLogs.unshift(entry);
    this.emit('audit_logged', `${params.actorName} 执行 ${params.targetLabel}`, params.activityId);
  }

  private generateUniqueBusinessPassword(): string {
    const existing = new Set(this.db.exhibitors.map((e) => e.businessPassword));
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const num = String(Math.floor(1000 + Math.random() * 9000));
      const candidate = `YH-2027-${num}`;
      if (!existing.has(candidate)) return candidate;
    }
    return `YH-2027-${Date.now().toString().slice(-4)}`;
  }

  private generateUniqueTicketCode(activityId: string): string {
    const act = this.db.activities.find((a) => a.id === activityId);
    const prefix = act?.code?.replace(/[^0-9]/g, '').slice(0, 6) || '202701';
    const existing = new Set(this.db.giftTickets.map((t) => t.ticketCode));
    let seq = this.db.giftTickets.filter((t) => t.activityId === activityId).length + 1;
    while (existing.has(`GT${prefix}${String(seq).padStart(4, '0')}`)) {
      seq += 1;
    }
    return `GT${prefix}${String(seq).padStart(4, '0')}`;
  }

  public readonly realtime = {
    subscribe: (listener: (event: RealtimeEvent) => void) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    },
    getNowMs: () => this.getNowMs(),
  };

  public readonly auth = {
    login: async (username: string, password: string, captchaToken?: string) => {
      if (captchaToken && !this.verifiedCaptchaTokens.has(captchaToken)) {
        throw new Error('智能风控人机验证未通过，请重新完成验证');
      }
      const user = this.db.users.find(
        (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.active,
      );
      if (!user || !password.trim()) {
        const count = (this.failedVerifyCounters.get(`login:${username}`) ?? 0) + 1;
        this.failedVerifyCounters.set(`login:${username}`, count);
        throw new Error('账号或密码不正确，请检查后重试');
      }
      this.failedVerifyCounters.delete(`login:${username}`);
      this.currentUserId = user.id;
      user.lastLoginAt = this.getNowIso();
      return { user: { ...user }, role: { ...this.getRoleForUser(user) }, isMockDemo: true };
    },
    getCurrentSession: async () => {
      if (!this.currentUserId) return null;
      const user = this.db.users.find((u) => u.id === this.currentUserId);
      if (!user) return null;
      return { user: { ...user }, role: { ...this.getRoleForUser(user) } };
    },
    switchDemoUser: async (userId: string) => {
      const user = this.db.users.find((u) => u.id === userId);
      if (!user) throw new Error('目标演示账号不存在');
      this.currentUserId = user.id;
      return { user: { ...user }, role: { ...this.getRoleForUser(user) } };
    },
    updateProfile: async (
      patch: Partial<Pick<SystemUser, 'displayName' | 'email' | 'countryCode' | 'phone' | 'avatarUrl'>>,
    ) => {
      const user = this.getCurrentUser();
      if (!user) throw new Error('请先登录');
      if (patch.displayName !== undefined && !patch.displayName.trim()) {
        throw new Error('显示姓名不能为空');
      }
      if (patch.phone !== undefined) {
        const phoneErr = validatePhone(patch.countryCode || user.countryCode, patch.phone);
        if (phoneErr) throw new Error(phoneErr);
      }
      Object.assign(user, patch);
      this.emit('permission_updated', `已更新个人资料：${user.displayName}`);
      return { ...user };
    },
    changePassword: async (currentPassword: string, newPassword: string) => {
      const user = this.getCurrentUser();
      if (!user) throw new Error('请先登录');
      if (!currentPassword.trim()) throw new Error('请输入当前密码');
      if (newPassword.trim().length < 8) throw new Error('新密码长度至少为 8 位');
      this.pushAudit({
        actorId: user.id,
        actorName: user.displayName,
        actorRole: this.getRoleForUser(user).name,
        activityId: 'global',
        targetType: 'user',
        targetId: user.id,
        targetLabel: user.displayName,
        action: 'permission_change',
        beforeState: '原密码',
        afterState: '已修改登录密码',
        reason: '用户自主修改登录密码',
        result: 'success',
      });
    },
    logout: async () => {
      this.currentUserId = '';
    },
  };

  public readonly activities = {
    list: async (filters?: { search?: string; status?: ActivityStatus | 'all' }) => {
      let list = [...this.db.activities];
      if (filters?.status && filters.status !== 'all') {
        list = list.filter((a) => a.status === filters.status);
      }
      if (filters?.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        list = list.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.location.toLowerCase().includes(q) ||
            a.code.toLowerCase().includes(q),
        );
      }
      return list;
    },
    getById: async (id: string) => {
      return this.db.activities.find((a) => a.id === id) ?? null;
    },
    create: async (input: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>, actor: SystemUser) => {
      const now = this.getNowIso();
      const created: Activity = {
        ...input,
        id: uid('act'),
        createdAt: now,
        updatedAt: now,
      };
      this.db.activities.unshift(created);
      // Seed default certificate categories for the new activity
      const defaults = [
        { name: '展商证', color: '#0071e3' },
        { name: '工作人员证', color: '#0f766e' },
        { name: '嘉宾证', color: '#7c3aed' },
        { name: '媒体证', color: '#b45309' },
        { name: 'VIP证', color: '#be123c' },
      ];
      for (const item of defaults) {
        this.db.certificateCategories.push({
          id: uid('cat'),
          activityId: created.id,
          name: item.name,
          color: item.color,
          enabled: true,
        });
      }
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId: created.id,
        targetType: 'activity',
        targetId: created.id,
        targetLabel: created.name,
        action: 'create_activity',
        beforeState: '无',
        afterState: created.status,
        reason: '新建活动并初始化默认证件类别',
        result: 'success',
      });
      this.emit('activity_updated', `已创建活动 ${created.name}`, created.id);
      return created;
    },
    update: async (id: string, patch: Partial<Activity>, actor: SystemUser) => {
      const idx = this.db.activities.findIndex((a) => a.id === id);
      if (idx < 0) throw new Error('活动不存在');
      const prev = this.db.activities[idx];
      const updated: Activity = {
        ...prev,
        ...patch,
        timeWindows: patch.timeWindows
          ? { ...prev.timeWindows, ...patch.timeWindows }
          : prev.timeWindows,
        updatedAt: this.getNowIso(),
      };
      this.db.activities[idx] = updated;
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId: updated.id,
        targetType: 'activity',
        targetId: updated.id,
        targetLabel: updated.name,
        action: 'update_activity',
        beforeState: `${prev.name} (${prev.status})`,
        afterState: `${updated.name} (${updated.status})`,
        reason: '更新活动基础信息或独立业务时间窗口',
        result: 'success',
      });
      this.emit('activity_updated', `已更新活动 ${updated.name}`, updated.id);
      return updated;
    },
    setStatus: async (id: string, status: ActivityStatus, actor: SystemUser, reason = '管理员变更活动状态') => {
      const act = this.db.activities.find((a) => a.id === id);
      if (!act) throw new Error('活动不存在');
      const prevStatus = act.status;
      act.status = status;
      act.updatedAt = this.getNowIso();
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId: act.id,
        targetType: 'activity',
        targetId: act.id,
        targetLabel: act.name,
        action: 'update_activity',
        beforeState: prevStatus,
        afterState: status,
        reason,
        result: 'success',
      });
      this.emit('activity_updated', `活动 ${act.name} 状态变更为 ${status}`, act.id);
      return { ...act };
    },
  };

  public readonly exhibitors = {
    list: async (activityId: string, search?: string) => {
      let list = this.db.exhibitors.filter((e) => this.matchesActivityScope(e.activityId, activityId));
      if (search?.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (e) =>
            e.boothNumber.toLowerCase().includes(q) ||
            e.boothName.toLowerCase().includes(q) ||
            e.primaryContactName.toLowerCase().includes(q) ||
            e.phone.includes(q),
        );
      }
      return list.map((e) => ({ ...e }));
    },
    getById: async (activityId: string, exhibitorId: string) => {
      const ex = this.db.exhibitors.find(
        (e) => this.matchesActivityScope(e.activityId, activityId) && e.id === exhibitorId,
      );
      return ex ? { ...ex } : null;
    },
    create: async (
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
    ) => {
      this.assertConcreteActivity(input.activityId);
      const boothClean = input.boothNumber.trim().toUpperCase();
      if (!boothClean || !input.boothName.trim() || !input.primaryContactName.trim()) {
        throw new Error('请完整填写摊位号、展位名称和主要联系人姓名');
      }
      const idErr = validateIdNumber(input.primaryIdType, input.primaryIdNumber);
      if (idErr) throw new Error(idErr);
      const phoneErr = validatePhone(input.countryCode, input.phone);
      if (phoneErr) throw new Error(phoneErr);
      if (input.quota < 1) throw new Error('申请人数至少为 1 人');

      const dupBooth = this.db.exhibitors.find(
        (e) => e.activityId === input.activityId && e.boothNumber.toUpperCase() === boothClean,
      );
      if (dupBooth) {
        throw new Error(`当前活动已存在摊位号 ${boothClean}`);
      }

      const now = this.getNowIso();
      const businessPassword = this.generateUniqueBusinessPassword();
      const exhibitor: Exhibitor = {
        id: uid('ex'),
        activityId: input.activityId,
        boothNumber: boothClean,
        boothName: input.boothName.trim(),
        primaryContactName: input.primaryContactName.trim(),
        primaryIdType: input.primaryIdType,
        primaryIdNumber: input.primaryIdNumber.trim().toUpperCase(),
        countryCode: input.countryCode,
        phone: input.phone.trim(),
        businessPassword,
        passwordActive: true,
        quota: input.quota,
        onsiteExtraCount: 0,
        entryModeOverride: input.entryModeOverride,
        independentToken: `${boothClean}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        createdAt: now,
        updatedAt: now,
      };
      this.db.exhibitors.unshift(exhibitor);

      const act = this.db.activities.find((a) => a.id === input.activityId);
      const defaultCat =
        input.certificateCategoryId ||
        this.db.certificateCategories.find((c) => c.activityId === input.activityId && c.enabled)?.id ||
        'cat-gz-exhibitor';
      const phase = act
        ? resolveExhibitorPortalPhase(act.timeWindows, this.getNowMs())
        : 'registration';

      // Primary contact automatically takes slot #01 without re-entry (Chapter 9.1)
      const primaryMember: ExhibitorMember = {
        id: uid('mem'),
        activityId: input.activityId,
        exhibitorId: exhibitor.id,
        boothNumber: boothClean,
        memberCode: `${boothClean}-01`,
        name: exhibitor.primaryContactName,
        idType: exhibitor.primaryIdType,
        idNumber: exhibitor.primaryIdNumber,
        countryCode: exhibitor.countryCode,
        phone: exhibitor.phone,
        customFields: { 展位岗位: '主要联系人' },
        isPrimaryContact: true,
        isOnsiteExtra: false,
        certificateCategoryId: defaultCat,
        status: phase === 'avatar' ? 'waiting_avatar' : 'submitted',
        validDates: act ? [act.startAt.slice(0, 10), act.endAt.slice(0, 10)] : [this.getTodayDateStr()],
        createdAt: now,
        updatedAt: now,
      };
      this.db.members.unshift(primaryMember);

      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId: input.activityId,
        targetType: 'exhibitor',
        targetId: exhibitor.id,
        targetLabel: `${exhibitor.boothNumber} ${exhibitor.boothName}`,
        action: 'create_exhibitor',
        beforeState: '无',
        afterState: `名额 ${exhibitor.quota} 人，已自动建档主联系人 ${primaryMember.memberCode}`,
        reason: '管理员预先创建展商主档案并生成唯一商务密码',
        result: 'success',
      });
      this.emit('exhibitor_updated', `新建展商 ${exhibitor.boothNumber} ${exhibitor.boothName}`, input.activityId);
      return { exhibitor: { ...exhibitor }, primaryMember: { ...primaryMember } };
    },
    updateQuota: async (activityId: string, exhibitorId: string, newQuota: number, reason: string, actor: SystemUser) => {
      const ex = this.db.exhibitors.find((e) => e.activityId === activityId && e.id === exhibitorId);
      if (!ex) throw new Error('展商不存在');
      const registeredNormal = this.db.members.filter(
        (m) => m.activityId === activityId && m.exhibitorId === exhibitorId && !m.isOnsiteExtra && m.status !== 'voided',
      ).length;
      if (newQuota < registeredNormal) {
        throw new Error(`名额不可低于已登记人数（当前已登记 ${registeredNormal} 人）`);
      }
      const prev = ex.quota;
      ex.quota = newQuota;
      ex.updatedAt = this.getNowIso();
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId,
        targetType: 'exhibitor',
        targetId: ex.id,
        targetLabel: `${ex.boothNumber} ${ex.boothName}`,
        action: 'member_update',
        beforeState: `申请名额 ${prev}`,
        afterState: `申请名额 ${newQuota}`,
        reason: reason || '管理员调整展商申请名额',
        result: 'success',
      });
      this.emit('exhibitor_updated', `${ex.boothNumber} 名额调整为 ${newQuota}`, activityId);
      return { ...ex };
    },
    updateEntryMode: async (activityId: string, exhibitorId: string, mode: EntryLinkMode | null, actor: SystemUser) => {
      const ex = this.db.exhibitors.find((e) => e.activityId === activityId && e.id === exhibitorId);
      if (!ex) throw new Error('展商不存在');
      const prev = ex.entryModeOverride ?? '继承活动默认';
      ex.entryModeOverride = mode;
      ex.updatedAt = this.getNowIso();
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId,
        targetType: 'exhibitor',
        targetId: ex.id,
        targetLabel: `${ex.boothNumber} ${ex.boothName}`,
        action: 'member_update',
        beforeState: String(prev),
        afterState: mode ?? '继承活动默认',
        reason: '调整展商入口链接模式',
        result: 'success',
      });
      this.emit('exhibitor_updated', `${ex.boothNumber} 入口模式已更新`, activityId);
      return { ...ex };
    },
    resetBusinessPassword: async (activityId: string, exhibitorId: string, actor: SystemUser) => {
      const ex = this.db.exhibitors.find((e) => e.activityId === activityId && e.id === exhibitorId);
      if (!ex) throw new Error('展商不存在');
      ex.businessPassword = this.generateUniqueBusinessPassword();
      ex.passwordActive = true;
      ex.updatedAt = this.getNowIso();
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId,
        targetType: 'exhibitor',
        targetId: ex.id,
        targetLabel: `${ex.boothNumber} ${ex.boothName}`,
        action: 'reset_business_password',
        beforeState: '旧商务密码（已失效）',
        afterState: '新唯一商务密码已生成',
        reason: '管理员重置展商商务密码',
        result: 'success',
      });
      this.emit('exhibitor_updated', `已重置 ${ex.boothNumber} 商务密码`, activityId);
      return { ...ex };
    },
    togglePasswordActive: async (activityId: string, exhibitorId: string, active: boolean, actor: SystemUser) => {
      const ex = this.db.exhibitors.find((e) => e.activityId === activityId && e.id === exhibitorId);
      if (!ex) throw new Error('展商不存在');
      const prev = ex.passwordActive ? '启用' : '停用';
      ex.passwordActive = active;
      ex.updatedAt = this.getNowIso();
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId,
        targetType: 'exhibitor',
        targetId: ex.id,
        targetLabel: `${ex.boothNumber} ${ex.boothName}`,
        action: 'reset_business_password',
        beforeState: prev,
        afterState: active ? '启用' : '停用',
        reason: active ? '重新启用商务密码' : '停用展商商务密码',
        result: 'success',
      });
      this.emit('exhibitor_updated', `${ex.boothNumber} 密码状态已更新`, activityId);
      return { ...ex };
    },
    verifySevenFields: async (input: ExhibitorVerifyInput, captchaToken?: string) => {
      const key = `verify:${input.activityId}:${input.boothNumber.trim().toUpperCase()}`;
      const failures = this.failedVerifyCounters.get(key) ?? 0;
      if (failures >= this.db.settings.maxPasswordFailures) {
        throw new Error('验证错误次数过多，已触发频次保护，请稍后重试或联系活动管理员');
      }
      if (failures >= 2 && (!captchaToken || !this.verifiedCaptchaTokens.has(captchaToken))) {
        throw new Error('CAPTCHA_REQUIRED');
      }

      const candidates = this.db.exhibitors.filter((e) => e.activityId === input.activityId);
      const matched = candidates.find((e) => matchExhibitorSevenFields(e, input));
      if (!matched) {
        this.failedVerifyCounters.set(key, failures + 1);
        // Unified error message to avoid leaking which field failed (Chapter 8.3)
        throw new Error('展商身份信息验证未通过，请核对 7 项登记信息与商务密码后重试');
      }

      this.failedVerifyCounters.delete(key);
      return { exhibitor: { ...matched }, isMockDemo: true };
    },
  };

  public readonly members = {
    list: async (
      activityId: string,
      filters?: { exhibitorId?: string; status?: CertificateStatus | 'all'; search?: string },
    ) => {
      let list = this.db.members.filter((m) => this.matchesActivityScope(m.activityId, activityId));
      if (filters?.exhibitorId) {
        list = list.filter((m) => m.exhibitorId === filters.exhibitorId);
      }
      if (filters?.status && filters.status !== 'all') {
        list = list.filter((m) => m.status === filters.status);
      }
      if (filters?.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        list = list.filter(
          (m) =>
            m.memberCode.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q) ||
            m.boothNumber.toLowerCase().includes(q) ||
            m.phone.includes(q),
        );
      }
      return list.map((m) => ({ ...m }));
    },
    addMember: async (
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
      bypassQuota = false,
    ) => {
      this.assertConcreteActivity(input.activityId);
      const ex = this.db.exhibitors.find(
        (e) => e.activityId === input.activityId && e.id === input.exhibitorId,
      );
      if (!ex) throw new Error('所属展商不存在');
      if (!input.name.trim()) throw new Error('请输入人员姓名');
      const idErr = validateIdNumber(input.idType, input.idNumber);
      if (idErr) throw new Error(idErr);
      const phoneErr = validatePhone(input.countryCode, input.phone);
      if (phoneErr) throw new Error(phoneErr);

      const exhibitorMembers = this.db.members.filter(
        (m) => m.activityId === input.activityId && m.exhibitorId === input.exhibitorId,
      );
      const activeCount = exhibitorMembers.filter((m) => !m.isOnsiteExtra && m.status !== 'voided').length;
      if (!bypassQuota && activeCount >= ex.quota) {
        throw new Error(`已达到申请名额上限（${ex.quota} 人），如需超额新增请联系管理员或现场加证`);
      }

      const idKey = normalizeIdentityKey(input.idType, input.idNumber);
      const dupMember = exhibitorMembers.find(
        (m) => m.status !== 'voided' && normalizeIdentityKey(m.idType, m.idNumber) === idKey,
      );
      if (dupMember) {
        throw new Error(`证件号已登记在人员 ${dupMember.memberCode}（${dupMember.name}）名下`);
      }

      const nextCode = computeNextMemberCode(
        ex.boothNumber,
        exhibitorMembers.map((m) => m.memberCode),
      );
      const act = this.db.activities.find((a) => a.id === input.activityId);
      const phase = act
        ? resolveExhibitorPortalPhase(act.timeWindows, this.getNowMs())
        : 'registration';
      const defaultCat =
        input.certificateCategoryId ||
        this.db.certificateCategories.find((c) => c.activityId === input.activityId && c.enabled)?.id ||
        'cat-gz-exhibitor';

      const now = this.getNowIso();
      const created: ExhibitorMember = {
        id: uid('mem'),
        activityId: input.activityId,
        exhibitorId: ex.id,
        boothNumber: ex.boothNumber,
        memberCode: nextCode,
        name: input.name.trim(),
        idType: input.idType,
        idNumber: input.idNumber.trim().toUpperCase(),
        countryCode: input.countryCode,
        phone: input.phone.trim(),
        customFields: input.customFields ?? {},
        isPrimaryContact: false,
        isOnsiteExtra: false,
        certificateCategoryId: defaultCat,
        status: phase === 'avatar' ? 'waiting_avatar' : 'submitted',
        validDates: act ? [act.startAt.slice(0, 10), act.endAt.slice(0, 10)] : [this.getTodayDateStr()],
        createdAt: now,
        updatedAt: now,
      };
      this.db.members.push(created);

      this.pushAudit({
        actorId: actorLabel.id,
        actorName: actorLabel.name,
        actorRole: actorLabel.role,
        activityId: input.activityId,
        targetType: 'member',
        targetId: created.id,
        targetLabel: `${created.memberCode} ${created.name}`,
        action: 'member_add',
        beforeState: '无',
        afterState: CERTIFICATE_STATUS_LABELS[created.status],
        reason: '新增展商人员资料',
        result: 'success',
      });
      this.emit('member_updated', `新增人员 ${created.memberCode} ${created.name}`, input.activityId);
      return { ...created };
    },
    batchImport: async (
      activityId: string,
      exhibitorId: string,
      rows: BatchImportRowPreview[],
      actorLabel: { id: string; name: string; role: string },
    ) => {
      const validRows = rows.filter((r) => r.valid);
      const imported: ExhibitorMember[] = [];
      let skippedCount = rows.length - validRows.length;

      for (const row of validRows) {
        try {
          const created = await this.members.addMember(
            {
              activityId,
              exhibitorId,
              name: row.name,
              idType: row.idType,
              idNumber: row.idNumber,
              countryCode: row.countryCode,
              phone: row.phone,
              customFields: row.extraFields,
            },
            actorLabel,
          );
          imported.push(created);
        } catch {
          skippedCount += 1;
        }
      }
      return { imported, skippedCount };
    },
    updateMember: async (
      activityId: string,
      memberId: string,
      patch: Partial<Pick<ExhibitorMember, 'name' | 'idType' | 'idNumber' | 'countryCode' | 'phone' | 'certificateCategoryId' | 'customFields'>>,
      actorLabel: { id: string; name: string; role: string },
    ) => {
      const mem = this.db.members.find((m) => m.activityId === activityId && m.id === memberId);
      if (!mem) throw new Error('人员记录不存在');
      const before = `${mem.name} (${mem.memberCode})`;
      Object.assign(mem, patch, { updatedAt: this.getNowIso() });
      this.pushAudit({
        actorId: actorLabel.id,
        actorName: actorLabel.name,
        actorRole: actorLabel.role,
        activityId,
        targetType: 'member',
        targetId: mem.id,
        targetLabel: `${mem.memberCode} ${mem.name}`,
        action: 'member_update',
        beforeState: before,
        afterState: `${mem.name} (${mem.memberCode})`,
        reason: '修改展商人员基础资料',
        result: 'success',
      });
      this.emit('member_updated', `更新人员 ${mem.memberCode}`, activityId);
      return { ...mem };
    },
    uploadAvatar: async (
      activityId: string,
      memberId: string,
      avatarUrl: string,
      actorLabel: { id: string; name: string; role: string },
    ) => {
      const mem = this.db.members.find((m) => m.activityId === activityId && m.id === memberId);
      if (!mem) throw new Error('人员记录不存在');
      if (!avatarUrl.trim()) throw new Error('请上传有效的自拍照片');
      if (mem.status === 'voided' || mem.status === 'frozen') {
        throw new Error('当前证件状态已冻结或作废，无法补充头像');
      }

      const prevLabel = CERTIFICATE_STATUS_LABELS[mem.status];
      mem.avatarUrl = avatarUrl;
      mem.avatarUpdatedAt = this.getNowIso();
      if (mem.status !== 'badge_claimed') {
        mem.status = canGenerateCertificateCredential({ ...mem, status: 'avatar_completed' })
          ? 'credential_generated'
          : 'avatar_completed';
      }
      mem.updatedAt = this.getNowIso();

      this.pushAudit({
        actorId: actorLabel.id,
        actorName: actorLabel.name,
        actorRole: actorLabel.role,
        activityId,
        targetType: 'member',
        targetId: mem.id,
        targetLabel: `${mem.memberCode} ${mem.name}`,
        action: 'avatar_upload',
        beforeState: prevLabel,
        afterState: CERTIFICATE_STATUS_LABELS[mem.status],
        reason: '补充证件自拍头像并更新电子凭证',
        result: 'success',
      });
      this.emit('member_updated', `${mem.memberCode} 已完成头像补充`, activityId);
      return { ...mem };
    },
    setStatus: async (
      activityId: string,
      memberId: string,
      status: CertificateStatus,
      reason: string,
      actor: SystemUser,
    ) => {
      const mem = this.db.members.find((m) => m.activityId === activityId && m.id === memberId);
      if (!mem) throw new Error('人员记录不存在');
      if (!canTransitionCertificateStatus(mem.status, status)) {
        throw new Error(`不允许从「${CERTIFICATE_STATUS_LABELS[mem.status]}」变更为「${CERTIFICATE_STATUS_LABELS[status]}」`);
      }
      if (status === 'credential_generated' && !canGenerateCertificateCredential({ ...mem, status: 'avatar_completed' })) {
        throw new Error('人员未完成头像上传，无法生成有效电子凭证');
      }
      const prev = CERTIFICATE_STATUS_LABELS[mem.status];
      mem.status = status;
      mem.updatedAt = this.getNowIso();
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId,
        targetType: 'member',
        targetId: mem.id,
        targetLabel: `${mem.memberCode} ${mem.name}`,
        action: 'member_update',
        beforeState: prev,
        afterState: CERTIFICATE_STATUS_LABELS[status],
        reason: reason || '管理员调整证件状态',
        result: 'success',
      });
      this.emit('member_updated', `${mem.memberCode} 状态变更为 ${CERTIFICATE_STATUS_LABELS[status]}`, activityId);
      return { ...mem };
    },
  };

  public readonly certificates = {
    listCategories: async (activityId: string) => {
      return this.db.certificateCategories
        .filter((c) => this.matchesActivityScope(c.activityId, activityId))
        .map((c) => ({ ...c }));
    },
    saveCategory: async (
      activityId: string,
      category: Omit<CertificateCategory, 'id' | 'activityId'> & { id?: string },
      actor: SystemUser,
    ) => {
      this.assertConcreteActivity(activityId);
      if (!category.name.trim()) throw new Error('证件类别名称不能为空');
      if (category.id) {
        const existing = this.db.certificateCategories.find(
          (c) => c.id === category.id && c.activityId === activityId,
        );
        if (!existing) throw new Error('证件类别不存在');
        const before = `${existing.name} (${existing.enabled ? '启用' : '停用'})`;
        existing.name = category.name.trim();
        existing.color = category.color;
        existing.enabled = category.enabled;
        this.pushAudit({
          actorId: actor.id,
          actorName: actor.displayName,
          actorRole: this.getRoleForUser(actor).name,
          activityId,
          targetType: 'certificate_category',
          targetId: existing.id,
          targetLabel: existing.name,
          action: 'update_activity',
          beforeState: before,
          afterState: `${existing.name} (${existing.enabled ? '启用' : '停用'})`,
          reason: '更新证件类别配置',
          result: 'success',
        });
        return { ...existing };
      }
      const created: CertificateCategory = {
        id: uid('cat'),
        activityId,
        name: category.name.trim(),
        color: category.color,
        enabled: category.enabled,
      };
      this.db.certificateCategories.push(created);
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId,
        targetType: 'certificate_category',
        targetId: created.id,
        targetLabel: created.name,
        action: 'update_activity',
        beforeState: '无',
        afterState: created.name,
        reason: '新增自定义证件类别',
        result: 'success',
      });
      return { ...created };
    },
    claimIndividual: async (activityId: string, memberId: string, actor: SystemUser) => {
      this.assertConcreteActivity(activityId);
      const mem = this.db.members.find((m) => m.activityId === activityId && m.id === memberId);
      if (!mem) throw new Error('人员不存在');
      if (mem.status === 'badge_claimed') throw new Error(`${mem.memberCode} 已领取过实体证件`);
      if (!canGenerateCertificateCredential(mem)) {
        throw new Error(`${mem.memberCode} 尚未完成头像或处于异常状态，不可发放实体证件`);
      }
      const prev = CERTIFICATE_STATUS_LABELS[mem.status];
      mem.status = 'badge_claimed';
      mem.claimRecord = {
        claimedAt: this.getNowIso(),
        operatorId: actor.id,
        operatorName: actor.displayName,
        method: 'individual_scan',
      };
      mem.updatedAt = this.getNowIso();
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId,
        targetType: 'member',
        targetId: mem.id,
        targetLabel: `${mem.memberCode} ${mem.name}`,
        action: 'badge_claim',
        beforeState: prev,
        afterState: '实体证件已领取',
        reason: '个人扫码确认领取实体证件',
        result: 'success',
      });
      this.emit('badge_claimed', `${mem.memberCode} ${mem.name} 已领取实体证件`, activityId);
      return { ...mem };
    },
    claimBatch: async (activityId: string, exhibitorId: string, memberIds: string[], actor: SystemUser) => {
      this.assertConcreteActivity(activityId);
      if (memberIds.length === 0) throw new Error('请至少选择一名待领取人员');
      const claimed: ExhibitorMember[] = [];
      for (const id of memberIds) {
        const mem = this.db.members.find(
          (m) => m.activityId === activityId && m.exhibitorId === exhibitorId && m.id === id,
        );
        if (!mem || mem.status === 'badge_claimed' || !canGenerateCertificateCredential(mem)) {
          continue;
        }
        const prev = CERTIFICATE_STATUS_LABELS[mem.status];
        mem.status = 'badge_claimed';
        mem.claimRecord = {
          claimedAt: this.getNowIso(),
          operatorId: actor.id,
          operatorName: actor.displayName,
          method: 'booth_batch',
        };
        mem.updatedAt = this.getNowIso();
        claimed.push({ ...mem });
        this.pushAudit({
          actorId: actor.id,
          actorName: actor.displayName,
          actorRole: this.getRoleForUser(actor).name,
          activityId,
          targetType: 'member',
          targetId: mem.id,
          targetLabel: `${mem.memberCode} ${mem.name}`,
          action: 'badge_claim',
          beforeState: prev,
          afterState: '实体证件已领取',
          reason: '展位批量领取确认',
          result: 'success',
        });
      }
      if (claimed.length === 0) {
        throw new Error('所选人员均未满足领证条件（需已完成头像且未领取）');
      }
      this.emit('badge_claimed', `展位批量领取 ${claimed.length} 张实体证件`, activityId);
      return claimed;
    },
    createOnsiteExtraToken: async (
      input: {
        activityId: string;
        exhibitorId: string;
        verifyInput: ExhibitorVerifyInput;
        extraCount: number;
        reason: string;
      },
      actor: SystemUser,
    ) => {
      this.assertConcreteActivity(input.activityId);
      const ex = this.db.exhibitors.find(
        (e) => e.activityId === input.activityId && e.id === input.exhibitorId,
      );
      if (!ex) throw new Error('展商不存在');
      if (!matchExhibitorSevenFields(ex, input.verifyInput)) {
        throw new Error('展商 7 项身份核验未通过，请核对展商档案信息');
      }
      if (!input.reason.trim()) throw new Error('请填写现场加证原因');
      if (input.extraCount < 1 || input.extraCount > 20) throw new Error('单次加证人数须在 1-20 之间');

      const tokenStr = `EXTRA-${ex.boothNumber}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const nowMs = this.getNowMs();
      const record: OnsiteExtraToken = {
        id: uid('oet'),
        token: tokenStr,
        activityId: input.activityId,
        exhibitorId: ex.id,
        boothNumber: ex.boothNumber,
        boothName: ex.boothName,
        originalQuota: ex.quota,
        extraCount: input.extraCount,
        usedCount: 0,
        reason: input.reason.trim(),
        operatorId: actor.id,
        operatorName: actor.displayName,
        createdAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(nowMs + 2 * 60 * 60 * 1000).toISOString(),
        used: false,
      };
      this.db.onsiteExtraTokens.unshift(record);
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId: input.activityId,
        targetType: 'onsite_extra_token',
        targetId: record.id,
        targetLabel: `${ex.boothNumber} 一次性加证码 (${tokenStr})`,
        action: 'onsite_extra_badge',
        beforeState: `原申请人数 ${ex.quota} / 已加证 ${ex.onsiteExtraCount}`,
        afterState: `已签发 ${input.extraCount} 名额一次性加证码`,
        reason: record.reason,
        result: 'success',
      });
      this.emit('exhibitor_updated', `${ex.boothNumber} 已签发一次性现场加证码`, input.activityId);
      return { ...record };
    },
    listOnsiteExtraTokens: async (activityId: string) => {
      return this.db.onsiteExtraTokens
        .filter((t) => this.matchesActivityScope(t.activityId, activityId))
        .map((t) => ({ ...t }));
    },
    submitOnsiteExtraMember: async (
      token: string,
      memberInput: {
        name: string;
        idType: IdType;
        idNumber: string;
        countryCode: string;
        phone: string;
        avatarUrl?: string;
      },
    ) => {
      const tk = this.db.onsiteExtraTokens.find((t) => t.token === token.trim());
      if (!tk) throw new Error('一次性现场加证二维码无效');
      if (tk.used || tk.usedCount >= tk.extraCount) {
        throw new Error('该一次性现场加证二维码已使用失效，请重新向现场工作人员申请');
      }
      const ex = this.db.exhibitors.find((e) => e.id === tk.exhibitorId);
      if (!ex) throw new Error('展商档案不存在');
      if (!memberInput.name.trim()) throw new Error('请填写姓名');
      const idErr = validateIdNumber(memberInput.idType, memberInput.idNumber);
      if (idErr) throw new Error(idErr);
      const phoneErr = validatePhone(memberInput.countryCode, memberInput.phone);
      if (phoneErr) throw new Error(phoneErr);

      const exhibitorMembers = this.db.members.filter(
        (m) => m.activityId === tk.activityId && m.exhibitorId === tk.exhibitorId,
      );
      const nextCode = computeNextMemberCode(
        ex.boothNumber,
        exhibitorMembers.map((m) => m.memberCode),
      );
      const act = this.db.activities.find((a) => a.id === tk.activityId);
      const phase = act ? resolveExhibitorPortalPhase(act.timeWindows, this.getNowMs()) : 'avatar';
      const defaultCat =
        this.db.certificateCategories.find((c) => c.activityId === tk.activityId && c.enabled)?.id ||
        'cat-gz-exhibitor';

      const now = this.getNowIso();
      const hasAvatar = Boolean(memberInput.avatarUrl?.trim());
      const status: CertificateStatus = hasAvatar
        ? 'credential_generated'
        : phase === 'avatar'
          ? 'waiting_avatar'
          : 'submitted';

      const created: ExhibitorMember = {
        id: uid('mem'),
        activityId: tk.activityId,
        exhibitorId: ex.id,
        boothNumber: ex.boothNumber,
        memberCode: nextCode,
        name: memberInput.name.trim(),
        idType: memberInput.idType,
        idNumber: memberInput.idNumber.trim().toUpperCase(),
        countryCode: memberInput.countryCode,
        phone: memberInput.phone.trim(),
        customFields: { 现场加证原因: tk.reason },
        isPrimaryContact: false,
        isOnsiteExtra: true,
        onsiteExtraReason: tk.reason,
        certificateCategoryId: defaultCat,
        status,
        avatarUrl: hasAvatar ? memberInput.avatarUrl : undefined,
        avatarUpdatedAt: hasAvatar ? now : undefined,
        validDates: act ? [act.startAt.slice(0, 10), act.endAt.slice(0, 10)] : [this.getTodayDateStr()],
        createdAt: now,
        updatedAt: now,
      };
      this.db.members.push(created);
      ex.onsiteExtraCount += 1;
      ex.updatedAt = now;
      tk.usedCount += 1;
      if (tk.usedCount >= tk.extraCount) {
        tk.used = true;
      }

      this.pushAudit({
        actorId: tk.operatorId,
        actorName: tk.operatorName,
        actorRole: '现场加证授权',
        activityId: tk.activityId,
        targetType: 'member',
        targetId: created.id,
        targetLabel: `${created.memberCode} ${created.name}（现场新增）`,
        action: 'onsite_extra_badge',
        beforeState: `原申请 ${tk.originalQuota} / 现场新增 ${ex.onsiteExtraCount - 1}`,
        afterState: `原申请 ${tk.originalQuota} / 现场新增 ${ex.onsiteExtraCount}`,
        reason: tk.reason,
        result: 'success',
      });
      this.emit('member_updated', `现场加证完成：${created.memberCode} ${created.name}`, tk.activityId);
      return { member: { ...created }, tokenState: { ...tk }, isMockDemo: true };
    },
  };

  public readonly gifts = {
    listBatches: async (activityId: string) => {
      return this.db.giftBatches
        .filter((b) => this.matchesActivityScope(b.activityId, activityId))
        .map((b) => ({ ...b }));
    },
    createBatch: async (
      input: Omit<GiftBatch, 'id' | 'claimedCount' | 'shareCode' | 'createdAt'>,
      actor: SystemUser,
    ) => {
      this.assertConcreteActivity(input.activityId);
      if (!input.name.trim()) throw new Error('请输入赠票批次名称');
      if (input.totalQuota < 1) throw new Error('总票数至少为 1 张');
      if (input.availableDates.length === 0) throw new Error('请至少配置一个可领取使用日期');
      const created: GiftBatch = {
        ...input,
        id: uid('gb'),
        claimedCount: 0,
        shareCode: `GIFT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        createdAt: this.getNowIso(),
      };
      this.db.giftBatches.unshift(created);
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId: input.activityId,
        targetType: 'gift_batch',
        targetId: created.id,
        targetLabel: created.name,
        action: 'gift_issue',
        beforeState: '无',
        afterState: `总票数 ${created.totalQuota}，开放日期 ${created.availableDates.join('、')}`,
        reason: '创建自助赠票批次',
        result: 'success',
      });
      this.emit('gift_updated', `新建赠票批次 ${created.name}`, input.activityId);
      return { ...created };
    },
    updateBatch: async (
      activityId: string,
      batchId: string,
      patch: Partial<GiftBatch>,
      actor: SystemUser,
    ) => {
      this.assertConcreteActivity(activityId);
      const batch = this.db.giftBatches.find(
        (b) => b.activityId === activityId && b.id === batchId,
      );
      if (!batch) throw new Error('赠票批次不存在');
      const prev = `${batch.name} (${batch.enabled ? '启用' : '停用'})`;
      Object.assign(batch, patch);
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId,
        targetType: 'gift_batch',
        targetId: batch.id,
        targetLabel: batch.name,
        action: 'gift_issue',
        beforeState: prev,
        afterState: `${batch.name} (${batch.enabled ? '启用' : '停用'})`,
        reason: '更新自助赠票批次配置',
        result: 'success',
      });
      this.emit('gift_updated', `更新赠票批次 ${batch.name}`, activityId);
      return { ...batch };
    },
  };

  public readonly tickets = {
    listTickets: async (
      activityId: string,
      filters?: { batchId?: string; status?: GiftTicketStatus | 'all'; search?: string },
    ) => {
      let list = this.db.giftTickets.filter((t) => this.matchesActivityScope(t.activityId, activityId));
      if (filters?.batchId) {
        list = list.filter((t) => t.batchId === filters.batchId);
      }
      if (filters?.status && filters.status !== 'all') {
        list = list.filter((t) => t.status === filters.status);
      }
      if (filters?.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        list = list.filter(
          (t) =>
            t.ticketCode.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.phone.includes(q) ||
            t.batchName.toLowerCase().includes(q),
        );
      }
      return list.map((t) => ({ ...t }));
    },
    selfClaim: async (
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
    ) => {
      if (captchaToken && !this.verifiedCaptchaTokens.has(captchaToken)) {
        throw new Error('请完成智能风险人机验证');
      }
      const batch = this.db.giftBatches.find(
        (b) => b.activityId === input.activityId && b.id === input.batchId,
      );
      if (!batch || !batch.enabled) {
        throw new Error('当前赠票批次未开放或已停用');
      }
      if (batch.claimedCount >= batch.totalQuota) {
        throw new Error('当前批次赠票已全部领完');
      }
      if (!batch.availableDates.includes(input.useDate)) {
        throw new Error('所选使用日期不在当前批次开放日期列表内');
      }
      if (!input.name.trim()) throw new Error('请输入领取人姓名');
      const idErr = validateIdNumber(input.idType, input.idNumber);
      if (idErr) throw new Error(idErr);
      const phoneErr = validatePhone(input.countryCode, input.phone);
      if (phoneErr) throw new Error(phoneErr);
      if (!input.avatarUrl.trim()) throw new Error('请上传自拍照片用于入场核验');

      // Chapter 13.2: Atomic cross-batch identity duplicate check within the same activity
      const identityKey = normalizeIdentityKey(input.idType, input.idNumber);
      const existingSelfClaim = this.db.giftTickets.find(
        (t) =>
          t.activityId === input.activityId &&
          t.mode === 'self_claim' &&
          t.identityKey === identityKey &&
          t.status !== 'voided',
      );
      if (existingSelfClaim) {
        throw new Error(
          `同一活动内每个身份仅允许自助领取一次赠票（检测到已有票号 ${existingSelfClaim.ticketCode}）`,
        );
      }

      const now = this.getNowIso();
      const ticket: GiftTicket = {
        id: uid('gt'),
        activityId: input.activityId,
        batchId: batch.id,
        batchName: batch.name,
        ticketCode: this.generateUniqueTicketCode(input.activityId),
        mode: 'self_claim',
        name: input.name.trim(),
        idType: input.idType,
        idNumber: input.idNumber.trim().toUpperCase(),
        identityKey,
        countryCode: input.countryCode,
        phone: input.phone.trim(),
        useDate: input.useDate,
        avatarUrl: input.avatarUrl,
        customFields: input.customFields ?? {},
        status: 'valid',
        createdAt: now,
        updatedAt: now,
      };
      this.db.giftTickets.unshift(ticket);
      batch.claimedCount += 1;

      this.pushAudit({
        actorId: 'external-guest',
        actorName: ticket.name,
        actorRole: '外部赠票领取者',
        activityId: input.activityId,
        targetType: 'gift_ticket',
        targetId: ticket.id,
        targetLabel: `${ticket.ticketCode} ${ticket.name}`,
        action: 'gift_issue',
        beforeState: '无',
        afterState: `凭证有效 (${ticket.useDate})`,
        reason: `自助领票：${batch.name}`,
        result: 'success',
      });
      this.emit('gift_updated', `新增自助赠票 ${ticket.ticketCode}`, input.activityId);
      return { ticket: { ...ticket }, isMockDemo: true };
    },
    backendDirectIssue: async (
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
    ) => {
      this.assertConcreteActivity(input.activityId);
      if (!input.name.trim()) throw new Error('请填写受邀人姓名');
      const idErr = validateIdNumber(input.idType, input.idNumber);
      if (idErr) throw new Error(idErr);
      const phoneErr = validatePhone(input.countryCode, input.phone);
      if (phoneErr) throw new Error(phoneErr);
      if (!input.useDate) throw new Error('请选择使用日期');

      const identityKey = normalizeIdentityKey(input.idType, input.idNumber);
      const dup = this.db.giftTickets.find(
        (t) =>
          t.activityId === input.activityId &&
          t.identityKey === identityKey &&
          t.status !== 'voided',
      );
      if (dup && !input.allowDuplicateOverride) {
        throw new Error(
          `DUPLICATE_IDENTITY:该身份在本活动已有赠票 ${dup.ticketCode}，需授权确认后才可额外增发独立票码`,
        );
      }
      if (dup && input.allowDuplicateOverride) {
        const role = this.getRoleForUser(actor);
        if (!role.canOverrideDuplicateGift) {
          throw new Error('当前角色无权对重复身份增发赠票，请联系活动管理员或系统管理员');
        }
      }

      const now = this.getNowIso();
      const ticket: GiftTicket = {
        id: uid('gt'),
        activityId: input.activityId,
        batchName: input.batchName.trim() || '后台直接发放',
        ticketCode: this.generateUniqueTicketCode(input.activityId),
        mode: 'backend_direct',
        name: input.name.trim(),
        idType: input.idType,
        idNumber: input.idNumber.trim().toUpperCase(),
        identityKey,
        countryCode: input.countryCode,
        phone: input.phone.trim(),
        useDate: input.useDate,
        avatarUrl: input.avatarUrl || undefined,
        customFields: {},
        status: input.avatarUrl ? 'valid' : 'waiting_fill',
        claimLinkToken: input.avatarUrl ? undefined : `INV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        createdAt: now,
        updatedAt: now,
      };
      this.db.giftTickets.unshift(ticket);
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId: input.activityId,
        targetType: 'gift_ticket',
        targetId: ticket.id,
        targetLabel: `${ticket.ticketCode} ${ticket.name}`,
        action: 'gift_issue',
        beforeState: dup ? `已有票号 ${dup.ticketCode}` : '无',
        afterState: `${GIFT_STATUS_LABELS[ticket.status]}（一票一码）`,
        reason: dup ? '后台授权重复身份增发独立赠票' : '后台直接录入发放赠票',
        result: 'success',
      });
      this.emit('gift_updated', `后台已签发赠票 ${ticket.ticketCode}`, input.activityId);
      return { ticket: { ...ticket }, duplicateDetected: Boolean(dup) };
    },
    backendBatchImport: async (
      activityId: string,
      batchName: string,
      useDate: string,
      rows: Array<{ name: string; idType: IdType; idNumber: string; countryCode: string; phone: string }>,
      actor: SystemUser,
    ) => {
      this.assertConcreteActivity(activityId);
      const created: GiftTicket[] = [];
      const duplicates: string[] = [];
      const now = this.getNowIso();

      for (const row of rows) {
        const identityKey = normalizeIdentityKey(row.idType, row.idNumber);
        const dup = this.db.giftTickets.find(
          (t) => t.activityId === activityId && t.identityKey === identityKey && t.status !== 'voided',
        );
        if (dup) {
          duplicates.push(`${row.name}（已有票号 ${dup.ticketCode}）`);
          continue;
        }
        const ticket: GiftTicket = {
          id: uid('gt'),
          activityId,
          batchName: batchName.trim() || '后台批量导入邀请',
          ticketCode: this.generateUniqueTicketCode(activityId),
          mode: 'backend_import',
          name: row.name.trim(),
          idType: row.idType,
          idNumber: row.idNumber.trim().toUpperCase(),
          identityKey,
          countryCode: row.countryCode || '+86',
          phone: row.phone.trim(),
          useDate,
          availableDates: [useDate],
          customFields: {},
          status: 'waiting_fill',
          claimLinkToken: `INV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
          createdAt: now,
          updatedAt: now,
        };
        this.db.giftTickets.unshift(ticket);
        created.push({ ...ticket });
      }

      if (created.length > 0) {
        this.pushAudit({
          actorId: actor.id,
          actorName: actor.displayName,
          actorRole: this.getRoleForUser(actor).name,
          activityId,
          targetType: 'gift_ticket',
          targetId: created[0].id,
          targetLabel: `${batchName}（批量导入 ${created.length} 张）`,
          action: 'gift_issue',
          beforeState: '批量名单导入',
          afterState: `生成 ${created.length} 个专属补充链接，跳过重复 ${duplicates.length} 条`,
          reason: '后台批量导入赠票名单',
          result: 'success',
        });
        this.emit('gift_updated', `批量生成 ${created.length} 张待补充赠票`, activityId);
      }

      return { created, duplicates };
    },
    getInvitedTicketMeta: async (claimLinkToken: string): Promise<InvitedTicketMeta> => {
      const cleaned = claimLinkToken.trim();
      const ticket = this.db.giftTickets.find((t) => t.claimLinkToken === cleaned);
      if (!ticket) {
        throw new Error('邀请链接无效或已过期，请联系活动主办方确认');
      }
      const linkedBatch = ticket.batchId
        ? this.db.giftBatches.find((b) => b.id === ticket.batchId)
        : undefined;
      const availableDates =
        ticket.availableDates && ticket.availableDates.length > 0
          ? ticket.availableDates
          : linkedBatch && linkedBatch.availableDates.length > 0
            ? linkedBatch.availableDates
            : [ticket.useDate];
      return {
        activityId: ticket.activityId,
        activityName: this.getActivityName(ticket.activityId),
        batchName: ticket.batchName,
        ticketCode: ticket.ticketCode,
        status: ticket.status,
        availableDates,
        useDate: ticket.useDate,
        customFields: linkedBatch?.customFields ?? [],
        alreadyCompleted:
          ticket.status !== 'waiting_fill' && ticket.status !== 'submitted',
      };
    },
    completeInvitedTicket: async (
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
    ) => {
      const cleaned = claimLinkToken.trim();
      const ticket = this.db.giftTickets.find((t) => t.claimLinkToken === cleaned);
      if (!ticket) throw new Error('专属赠票邀请链接无效');

      // Strictly prevent status overwrite or reactivation of terminal/active tickets
      if (ticket.status === 'redeemed') {
        throw new Error('该赠票已核销使用，不可重新激活或重复提交');
      }
      if (ticket.status === 'frozen') {
        throw new Error('该赠票已冻结，无法补充资料');
      }
      if (ticket.status === 'voided' || ticket.status === 'expired') {
        throw new Error('该赠票已作废或已过期，无法补充资料');
      }
      if (ticket.status !== 'waiting_fill' && ticket.status !== 'submitted') {
        throw new Error('该赠票已完成资料补充，请通过电子赠票找回功能查看');
      }

      // Mandatory 5-field identity match against pre-registered recipient
      const inputIdKey = normalizeIdentityKey(input.idType, input.idNumber);
      const identityMatched =
        ticket.name.trim() === input.name.trim() &&
        ticket.identityKey === inputIdKey &&
        ticket.countryCode.trim() === input.countryCode.trim() &&
        ticket.phone.trim() === input.phone.trim();

      if (!identityMatched) {
        throw new Error('身份核验未通过，请核对姓名、证件类型、证件号码、国际区号与手机号与受邀登记信息一致');
      }

      const linkedBatch = ticket.batchId
        ? this.db.giftBatches.find((b) => b.id === ticket.batchId)
        : undefined;
      const allowedDates =
        ticket.availableDates && ticket.availableDates.length > 0
          ? ticket.availableDates
          : linkedBatch && linkedBatch.availableDates.length > 0
            ? linkedBatch.availableDates
            : [ticket.useDate];
      const chosenDate = input.useDate || allowedDates[0];
      if (!allowedDates.includes(chosenDate)) {
        throw new Error('所选使用日期不在允许的开放日期范围内');
      }

      if (linkedBatch?.customFields) {
        for (const field of linkedBatch.customFields) {
          if (field.required && !String(input.customFields?.[field.label] ?? '').trim()) {
            throw new Error(`请填写必填项：${field.label}`);
          }
        }
      }

      if (!input.avatarUrl.trim()) throw new Error('请上传本人清晰正面自拍照片');

      const prevStatus = GIFT_STATUS_LABELS[ticket.status];
      ticket.useDate = chosenDate;
      ticket.avatarUrl = input.avatarUrl;
      ticket.customFields = { ...ticket.customFields, ...(input.customFields ?? {}) };
      ticket.status = 'valid';
      ticket.updatedAt = this.getNowIso();

      this.pushAudit({
        actorId: 'external-invited-guest',
        actorName: ticket.name,
        actorRole: '受邀赠票领取者',
        activityId: ticket.activityId,
        targetType: 'gift_ticket',
        targetId: ticket.id,
        targetLabel: `${ticket.ticketCode} ${ticket.name}`,
        action: 'gift_issue',
        beforeState: prevStatus,
        afterState: `凭证有效 (${ticket.useDate})`,
        reason: '受邀赠票完成 5 项身份核验与自拍补充',
        result: 'success',
      });
      this.emit('gift_updated', `受邀赠票 ${ticket.ticketCode} 已核验生效`, ticket.activityId);
      return { ...ticket };
    },
    retrieveByIdentity: async (
      input: {
        activityId: string;
        name: string;
        idType: IdType;
        idNumber: string;
        countryCode: string;
        phone: string;
      },
      captchaToken?: string,
    ) => {
      if (!captchaToken || !this.verifiedCaptchaTokens.has(captchaToken)) {
        throw new Error('CAPTCHA_REQUIRED');
      }
      if (!input.name.trim()) throw new Error('请输入姓名');
      const idErr = validateIdNumber(input.idType, input.idNumber);
      if (idErr) throw new Error(idErr);
      const phoneErr = validatePhone(input.countryCode, input.phone);
      if (phoneErr) throw new Error(phoneErr);

      const idKey = normalizeIdentityKey(input.idType, input.idNumber);
      const matched = this.db.giftTickets.filter(
        (t) =>
          (input.activityId === 'ALL' || t.activityId === input.activityId) &&
          t.name.trim() === input.name.trim() &&
          t.identityKey === idKey &&
          t.countryCode.trim() === input.countryCode.trim() &&
          t.phone.trim() === input.phone.trim(),
      );
      if (matched.length === 0) {
        throw new Error('未查询到匹配的电子赠票，请核对填写信息是否与领票时一致');
      }
      // Strictly read-only retrieval: never creates duplicates, never modifies status
      return { tickets: matched.map((t) => ({ ...t })), isMockDemo: true };
    },
    setTicketStatus: async (
      activityId: string,
      ticketId: string,
      status: GiftTicketStatus,
      reason: string,
      actor: SystemUser,
    ) => {
      const ticket = this.db.giftTickets.find(
        (t) => t.activityId === activityId && t.id === ticketId,
      );
      if (!ticket) throw new Error('赠票记录不存在');
      if (!canTransitionGiftStatus(ticket.status, status)) {
        throw new Error(`不允许从「${GIFT_STATUS_LABELS[ticket.status]}」变更为「${GIFT_STATUS_LABELS[status]}」`);
      }
      const prev = GIFT_STATUS_LABELS[ticket.status];
      ticket.status = status;
      ticket.updatedAt = this.getNowIso();
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId,
        targetType: 'gift_ticket',
        targetId: ticket.id,
        targetLabel: `${ticket.ticketCode} ${ticket.name}`,
        action: status === 'voided' ? 'gift_void' : 'gift_issue',
        beforeState: prev,
        afterState: GIFT_STATUS_LABELS[status],
        reason: reason || '管理员调整赠票状态',
        result: 'success',
      });
      this.emit('gift_updated', `赠票 ${ticket.ticketCode} 状态变更为 ${GIFT_STATUS_LABELS[status]}`, activityId);
      return { ...ticket };
    },
  };

  public readonly qr = {
    issueDynamicToken: async (
      credentialKind: CredentialKind,
      credentialId: string,
      activityId: string,
    ): Promise<DynamicQRToken> => {
      // Invalidate previous dynamic tokens for the same credential (Chapter 14)
      for (const [key, tk] of this.qrTokens.entries()) {
        if (tk.credentialKind === credentialKind && tk.credentialId === credentialId) {
          this.qrTokens.delete(key);
        }
      }

      let displayCode = '';
      if (credentialKind === 'certificate') {
        const mem = this.db.members.find((m) => m.id === credentialId && m.activityId === activityId);
        if (!mem) throw new Error('证件记录不存在');
        displayCode = mem.memberCode;
      } else {
        const gt = this.db.giftTickets.find((t) => t.id === credentialId && t.activityId === activityId);
        if (!gt) throw new Error('赠票记录不存在');
        displayCode = gt.ticketCode;
      }

      const issuedAt = Date.now();
      const ttlMs = (this.db.settings.qrRefreshSeconds || 30) * 1000;
      const prefix = credentialKind === 'certificate' ? 'DYN-CERT' : 'DYN-GIFT';
      const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
      // Never embed raw ID numbers in QR token!
      const tokenStr = `${prefix}.${displayCode}.${rand}`;
      const record: DynamicQRToken = {
        token: tokenStr,
        credentialKind,
        credentialId,
        activityId,
        displayCode,
        issuedAt,
        expiresAt: issuedAt + ttlMs,
        isMockDemo: true,
      };
      this.qrTokens.set(tokenStr, record);
      return record;
    },
    inspectToken: async (rawInput: string, activityId: string) => {
      return this.redemption.verifyAndPreview(rawInput, activityId);
    },
  };

  private resolveCredentialByCodeOrToken(
    rawInput: string,
    activityId: string,
  ):
    | { errorOutcome: RedemptionPreview }
    | { kind: 'certificate'; member: ExhibitorMember }
    | { kind: 'gift'; ticket: GiftTicket } {
    const cleaned = rawInput.trim();
    if (!cleaned) {
      return {
        errorOutcome: {
          valid: false,
          outcome: 'invalid',
          message: '请输入或扫描有效的动态二维码令牌 / 编号',
          isMockDemo: true,
        },
      };
    }

    // 1. Check dynamic rolling token store
    if (cleaned.startsWith('DYN-CERT.') || cleaned.startsWith('DYN-GIFT.')) {
      const tk = this.qrTokens.get(cleaned);
      if (!tk) {
        return {
          errorOutcome: {
            valid: false,
            outcome: 'expired',
            message: '动态二维码已刷新失效或不存在，请让持证人展示最新动态码',
            isMockDemo: true,
          },
        };
      }
      if (Date.now() > tk.expiresAt) {
        this.qrTokens.delete(cleaned);
        return {
          errorOutcome: {
            valid: false,
            outcome: 'expired',
            message: '动态二维码已超过 30 秒有效期，请刷新后重新扫描',
            isMockDemo: true,
          },
        };
      }
      if (tk.activityId !== activityId) {
        return {
          errorOutcome: {
            valid: false,
            outcome: 'invalid',
            message: '该凭证不属于当前选定活动，已按活动隔离规则拦截',
            isMockDemo: true,
          },
        };
      }
      if (tk.credentialKind === 'certificate') {
        const mem = this.db.members.find((m) => m.id === tk.credentialId);
        if (mem) return { kind: 'certificate', member: mem };
      } else {
        const gt = this.db.giftTickets.find((t) => t.id === tk.credentialId);
        if (gt) return { kind: 'gift', ticket: gt };
      }
    }

    // 2. Fallback manual code lookup (memberCode or ticketCode) strictly within current activity
    const upper = cleaned.toUpperCase();
    const member = this.db.members.find(
      (m) => m.activityId === activityId && m.memberCode.toUpperCase() === upper,
    );
    if (member) return { kind: 'certificate', member };

    const ticket = this.db.giftTickets.find(
      (t) => t.activityId === activityId && t.ticketCode.toUpperCase() === upper,
    );
    if (ticket) return { kind: 'gift', ticket };

    return {
      errorOutcome: {
        valid: false,
        outcome: 'invalid',
        message: `当前活动未查询到编号或令牌「${cleaned}」对应的凭证`,
        isMockDemo: true,
      },
    };
  }

  public readonly redemption = {
    verifyAndPreview: async (
      rawCodeOrToken: string,
      activityId: string,
      currentDateOverride?: string,
    ): Promise<RedemptionPreview> => {
      if (this.db.settings.simulateOffline) {
        return {
          valid: false,
          outcome: 'offline',
          message: '当前处于断网状态，系统禁止离线核销，请恢复网络连接后重试',
          isMockDemo: true,
        };
      }

      const resolved = this.resolveCredentialByCodeOrToken(rawCodeOrToken, activityId);
      if ('errorOutcome' in resolved) return resolved.errorOutcome;

      const todayStr = currentDateOverride || this.getTodayDateStr();

      if (resolved.kind === 'certificate') {
        const mem = resolved.member;
        const catName =
          this.db.certificateCategories.find((c) => c.id === mem.certificateCategoryId)?.name ??
          '展商证';
        const base: Omit<RedemptionPreview, 'valid' | 'outcome' | 'message'> = {
          credentialKind: 'certificate',
          credentialId: mem.id,
          activityId: mem.activityId,
          displayCode: mem.memberCode,
          holderName: mem.name,
          avatarUrl: mem.avatarUrl,
          categoryOrBatch: `${catName} · ${mem.boothNumber} 展位`,
          validDateLabel: mem.validDates.join(' / '),
          statusLabel: CERTIFICATE_STATUS_LABELS[mem.status],
          alreadyRedeemedAt: mem.lastRedeemedAt,
          isMockDemo: true,
        };

        if (mem.status === 'frozen') {
          return { ...base, valid: false, outcome: 'frozen', message: '该证件已被冻结，禁止通行' };
        }
        if (mem.status === 'voided') {
          return { ...base, valid: false, outcome: 'voided', message: '该证件已作废，禁止通行' };
        }
        if (!mem.avatarUrl || (mem.status !== 'credential_generated' && mem.status !== 'badge_claimed')) {
          return { ...base, valid: false, outcome: 'invalid', message: '人员尚未完成头像审核或未生成电子凭证' };
        }
        if (mem.validDates.length > 0 && !mem.validDates.includes(todayStr)) {
          return {
            ...base,
            valid: false,
            outcome: 'date_mismatch',
            message: `当前日期（${todayStr}）不在该证件有效通行日期内`,
          };
        }
        if (mem.lastRedeemedAt) {
          return {
            ...base,
            valid: false,
            outcome: 'duplicate',
            message: `该证件已完成当日核验记录（首次核销时间：${mem.lastRedeemedAt.slice(0, 16).replace('T', ' ')}）`,
          };
        }
        return {
          ...base,
          valid: true,
          outcome: 'success',
          message: '证件状态有效，可确认核销入场（演示校验）',
        };
      }

      // Gift ticket verification (completely separate business entity)
      const ticket = resolved.ticket;
      const base: Omit<RedemptionPreview, 'valid' | 'outcome' | 'message'> = {
        credentialKind: 'gift',
        credentialId: ticket.id,
        activityId: ticket.activityId,
        displayCode: ticket.ticketCode,
        holderName: ticket.name,
        avatarUrl: ticket.avatarUrl,
        categoryOrBatch: `赠票 · ${ticket.batchName}`,
        validDateLabel: ticket.useDate,
        statusLabel: GIFT_STATUS_LABELS[ticket.status],
        alreadyRedeemedAt: ticket.redeemedAt,
        isMockDemo: true,
      };

      if (ticket.status === 'redeemed') {
        return {
          ...base,
          valid: false,
          outcome: 'duplicate',
          message: `该赠票已核销，禁止重复使用（核销人：${ticket.redeemedBy ?? '现场核销员'}）`,
        };
      }
      if (ticket.status === 'frozen') {
        return { ...base, valid: false, outcome: 'frozen', message: '该赠票已冻结，禁止入场' };
      }
      if (ticket.status === 'voided') {
        return { ...base, valid: false, outcome: 'voided', message: '该赠票已作废，禁止入场' };
      }
      if (ticket.status === 'expired') {
        return { ...base, valid: false, outcome: 'expired', message: '该赠票已超过有效使用日期' };
      }
      if (ticket.status !== 'valid' && ticket.status !== 'generated') {
        return { ...base, valid: false, outcome: 'invalid', message: '赠票尚未完成资料与自拍补充，暂不可核销' };
      }
      if (ticket.useDate !== todayStr) {
        return {
          ...base,
          valid: false,
          outcome: 'date_mismatch',
          message: `日期不匹配：该赠票限 ${ticket.useDate} 使用，当前核验日期为 ${todayStr}`,
        };
      }
      return {
        ...base,
        valid: true,
        outcome: 'success',
        message: '赠票凭证有效，可确认核销入场（演示校验）',
      };
    },
    confirmRedemption: async (
      rawCodeOrToken: string,
      activityId: string,
      mode: RedemptionMode,
      actor: SystemUser,
      deviceLabel = '现场统一扫码工作台',
      currentDateOverride?: string,
    ) => {
      this.assertConcreteActivity(activityId);
      const actorRole = this.getRoleForUser(actor);
      const fastAuthorized =
        actor.redemptionMode === 'fast' ||
        actorRole.code === 'sys_admin' ||
        actorRole.code === 'activity_admin';
      if (mode === 'fast' && !fastAuthorized) {
        throw new Error('当前账号未被管理员授权使用快速核销模式');
      }

      const preview = await this.redemption.verifyAndPreview(
        rawCodeOrToken,
        activityId,
        currentDateOverride,
      );

      // Atomic concurrency guard (Chapter 15: simultaneous multi-device scan allows only 1 success)
      const lockKey = preview.credentialId ? `${preview.credentialKind}:${preview.credentialId}` : '';
      if (preview.valid && lockKey) {
        if (this.activeRedemptionLocks.has(lockKey)) {
          const dupRecord: RedemptionRecord = {
            id: uid('red'),
            activityId,
            credentialKind: preview.credentialKind!,
            credentialId: preview.credentialId!,
            displayCode: preview.displayCode || rawCodeOrToken,
            holderName: preview.holderName || '未知',
            categoryOrBatch: preview.categoryOrBatch || '—',
            mode,
            outcome: 'duplicate',
            message: '检测到多设备并发扫码，系统原子锁已拦截重复核销',
            operatorId: actor.id,
            operatorName: actor.displayName,
            deviceLabel,
            createdAt: this.getNowIso(),
          };
          this.db.redemptionRecords.unshift(dupRecord);
          const lockedPreview: RedemptionPreview = {
            ...preview,
            valid: false,
            outcome: 'duplicate',
            message: dupRecord.message,
          };
          return {
            record: dupRecord,
            preview: lockedPreview,
            isMockDemo: true,
          };
        }
        this.activeRedemptionLocks.add(lockKey);
      }

      try {
        let finalPreview = preview;
        const now = this.getNowIso();

        if (preview.valid && preview.credentialId && preview.credentialKind) {
          if (preview.credentialKind === 'certificate') {
            const mem = this.db.members.find((m) => m.id === preview.credentialId);
            if (!mem || mem.lastRedeemedAt) {
              finalPreview = {
                ...preview,
                valid: false,
                outcome: 'duplicate',
                message: '该证件已完成核销，拦截重复入场',
              };
            } else {
              mem.lastRedeemedAt = now;
              mem.updatedAt = now;
              finalPreview = {
                ...preview,
                valid: true,
                outcome: 'success',
                message: '证件核销成功（演示模式模拟服务端原子确认）',
                alreadyRedeemedAt: now,
              };
            }
          } else {
            const gt = this.db.giftTickets.find((t) => t.id === preview.credentialId);
            if (!gt || gt.status === 'redeemed') {
              finalPreview = {
                ...preview,
                valid: false,
                outcome: 'duplicate',
                message: '该赠票已被核销，拦截重复使用',
              };
            } else {
              gt.status = 'redeemed';
              gt.redeemedAt = now;
              gt.redeemedBy = actor.displayName;
              gt.updatedAt = now;
              finalPreview = {
                ...preview,
                valid: true,
                outcome: 'success',
                statusLabel: '已核销',
                alreadyRedeemedAt: now,
                message: '赠票核销成功（演示模式模拟服务端原子确认）',
              };
            }
          }
        }

        const record: RedemptionRecord = {
          id: uid('red'),
          activityId,
          credentialKind: finalPreview.credentialKind ?? 'gift',
          credentialId: finalPreview.credentialId ?? rawCodeOrToken,
          displayCode: finalPreview.displayCode ?? rawCodeOrToken,
          holderName: finalPreview.holderName ?? '未识别持证人',
          categoryOrBatch: finalPreview.categoryOrBatch ?? '—',
          mode,
          outcome: finalPreview.outcome,
          message: finalPreview.message,
          operatorId: actor.id,
          operatorName: actor.displayName,
          deviceLabel,
          createdAt: now,
        };
        this.db.redemptionRecords.unshift(record);

        this.pushAudit({
          actorId: actor.id,
          actorName: actor.displayName,
          actorRole: this.getRoleForUser(actor).name,
          activityId,
          targetType: finalPreview.credentialKind ?? 'credential',
          targetId: record.credentialId,
          targetLabel: `${record.displayCode} ${record.holderName}`,
          action: finalPreview.outcome === 'duplicate' ? 'duplicate_redemption' : 'redemption',
          beforeState: preview.statusLabel ?? '待核验',
          afterState: finalPreview.outcome === 'success' ? '已核销' : finalPreview.outcome,
          reason: `${mode === 'fast' ? '快速模式' : '普通模式'}核销：${finalPreview.message}`,
          result: finalPreview.outcome === 'success' ? 'success' : 'rejected',
        });

        this.emit('redemption_recorded', `核销结果：${record.displayCode} (${finalPreview.outcome})`, activityId);
        return { record, preview: finalPreview, isMockDemo: true };
      } finally {
        if (lockKey) {
          this.activeRedemptionLocks.delete(lockKey);
        }
      }
    },
    listRecords: async (activityId: string, search?: string) => {
      let list = this.db.redemptionRecords.filter((r) => this.matchesActivityScope(r.activityId, activityId));
      if (search?.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (r) =>
            r.displayCode.toLowerCase().includes(q) ||
            r.holderName.toLowerCase().includes(q) ||
            r.operatorName.toLowerCase().includes(q),
        );
      }
      return list.map((r) => ({ ...r }));
    },
  };

  public readonly users = {
    listUsers: async () => this.db.users.map((u) => ({ ...u })),
    saveUser: async (
      input: Omit<SystemUser, 'id' | 'lastLoginAt'> & { id?: string },
      actor: SystemUser,
    ) => {
      if (!input.username.trim() || !input.displayName.trim()) {
        throw new Error('请填写账号名与姓名');
      }
      if (input.id) {
        const existing = this.db.users.find((u) => u.id === input.id);
        if (!existing) throw new Error('用户不存在');
        const prevRole = existing.roleId;
        Object.assign(existing, input);
        this.pushAudit({
          actorId: actor.id,
          actorName: actor.displayName,
          actorRole: this.getRoleForUser(actor).name,
          activityId: 'global',
          targetType: 'user',
          targetId: existing.id,
          targetLabel: `${existing.displayName} (${existing.username})`,
          action: 'permission_change',
          beforeState: `角色 ${prevRole}`,
          afterState: `角色 ${existing.roleId} / 核销模式 ${existing.redemptionMode}`,
          reason: '修改内部用户账号及权限',
          result: 'success',
        });
        this.emit('permission_updated', `已更新用户 ${existing.displayName}`);
        return { ...existing };
      }
      const created: SystemUser = {
        ...input,
        id: uid('usr'),
        lastLoginAt: this.getNowIso(),
      };
      this.db.users.push(created);
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId: 'global',
        targetType: 'user',
        targetId: created.id,
        targetLabel: `${created.displayName} (${created.username})`,
        action: 'permission_change',
        beforeState: '无',
        afterState: `新建账号，角色 ${created.roleId}`,
        reason: '新增内部员工账号',
        result: 'success',
      });
      this.emit('permission_updated', `新增用户 ${created.displayName}`);
      return { ...created };
    },
    setUserRedemptionMode: async (userId: string, mode: RedemptionMode, actor: SystemUser) => {
      const user = this.db.users.find((u) => u.id === userId);
      if (!user) throw new Error('用户不存在');
      const prev = user.redemptionMode;
      user.redemptionMode = mode;
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId: 'global',
        targetType: 'user',
        targetId: user.id,
        targetLabel: user.displayName,
        action: 'permission_change',
        beforeState: `核销模式：${prev}`,
        afterState: `核销模式：${mode}`,
        reason: '更新核销账号工作模式',
        result: 'success',
      });
      return { ...user };
    },
  };

  public readonly permissions = {
    listRoles: async () => this.db.roles.map((r) => ({ ...r, modules: [...r.modules] })),
    saveRole: async (
      input: Omit<RoleDefinition, 'id' | 'isPreset'> & { id?: string },
      actor: SystemUser,
    ) => {
      if (!input.name.trim()) throw new Error('角色名称不能为空');
      if (input.id) {
        const existing = this.db.roles.find((r) => r.id === input.id);
        if (!existing) throw new Error('角色不存在');
        const prev = existing.modules.join(',');
        existing.name = input.name.trim();
        existing.description = input.description;
        existing.modules = [...input.modules];
        existing.defaultRedemptionMode = input.defaultRedemptionMode;
        existing.canViewUnmaskedSensitive = input.canViewUnmaskedSensitive;
        existing.canOverrideDuplicateGift = input.canOverrideDuplicateGift;
        this.pushAudit({
          actorId: actor.id,
          actorName: actor.displayName,
          actorRole: this.getRoleForUser(actor).name,
          activityId: 'global',
          targetType: 'role',
          targetId: existing.id,
          targetLabel: existing.name,
          action: 'permission_change',
          beforeState: prev,
          afterState: existing.modules.join(','),
          reason: '调整角色模块权限',
          result: 'success',
        });
        this.emit('permission_updated', `已更新角色 ${existing.name}`);
        return { ...existing };
      }
      const created: RoleDefinition = {
        ...input,
        id: uid('role'),
        code: input.code || `custom_${Date.now().toString(36)}`,
        isPreset: false,
      };
      this.db.roles.push(created);
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId: 'global',
        targetType: 'role',
        targetId: created.id,
        targetLabel: created.name,
        action: 'permission_change',
        beforeState: '无',
        afterState: created.modules.join(','),
        reason: '新增自定义角色',
        result: 'success',
      });
      this.emit('permission_updated', `新增角色 ${created.name}`);
      return { ...created };
    },
    deleteRole: async (roleId: string, actor: SystemUser) => {
      const idx = this.db.roles.findIndex((r) => r.id === roleId);
      if (idx < 0) throw new Error('角色不存在');
      const role = this.db.roles[idx];
      if (role.isPreset) throw new Error('系统预设角色不可删除');
      const inUse = this.db.users.some((u) => u.roleId === roleId);
      if (inUse) throw new Error('仍有用户关联该角色，请先调整用户角色后再删除');
      this.db.roles.splice(idx, 1);
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId: 'global',
        targetType: 'role',
        targetId: role.id,
        targetLabel: role.name,
        action: 'permission_change',
        beforeState: role.name,
        afterState: '已删除',
        reason: '删除自定义角色',
        result: 'success',
      });
      this.emit('permission_updated', `已删除角色 ${role.name}`);
    },
    listDepartments: async () =>
      this.db.departments.map((d) => ({
        ...d,
        active: d.active ?? true,
        memberCount: this.db.users.filter((u) => u.departmentId === d.id).length,
      })),
    saveDepartment: async (
      input: Omit<Department, 'id' | 'memberCount' | 'createdAt'> & { id?: string },
      actor: SystemUser,
    ) => {
      if (!input.name.trim()) throw new Error('部门名称不能为空');
      if (input.id) {
        const existing = this.db.departments.find((d) => d.id === input.id);
        if (!existing) throw new Error('部门不存在');
        existing.name = input.name.trim();
        existing.description = input.description;
        existing.active = input.active ?? existing.active ?? true;
        this.pushAudit({
          actorId: actor.id,
          actorName: actor.displayName,
          actorRole: this.getRoleForUser(actor).name,
          activityId: 'global',
          targetType: 'department',
          targetId: existing.id,
          targetLabel: existing.name,
          action: 'permission_change',
          beforeState: '部门编辑',
          afterState: `${existing.name} (${existing.active ? '启用' : '停用'})`,
          reason: '更新部门信息',
          result: 'success',
        });
        return { ...existing };
      }
      const created: Department = {
        id: uid('dept'),
        name: input.name.trim(),
        description: input.description,
        active: input.active ?? true,
        memberCount: 0,
        createdAt: this.getNowIso(),
      };
      this.db.departments.push(created);
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId: 'global',
        targetType: 'department',
        targetId: created.id,
        targetLabel: created.name,
        action: 'permission_change',
        beforeState: '无',
        afterState: created.name,
        reason: '新增部门',
        result: 'success',
      });
      return { ...created };
    },
  };

  public readonly captcha = {
    assessRisk: async (action: string, subjectKey: string): Promise<CaptchaChallenge> => {
      const failures = this.failedVerifyCounters.get(subjectKey) ?? 0;
      const riskScore =
        action === 'high_risk_demo' ? 88 : Math.min(100, 18 + failures * 26);
      const required = riskScore >= this.db.settings.captchaRiskThreshold;
      const a = 3 + (Math.floor(Math.random() * 6));
      const b = 2 + (Math.floor(Math.random() * 7));
      const challenge: CaptchaChallenge = {
        challengeId: uid('cap'),
        required,
        riskScore,
        prompt: `安全风控校验：请输入 ${a} + ${b} 的计算结果`,
        expectedAnswer: String(a + b),
        isMockDemo: true,
      };
      this.captchaChallenges.set(challenge.challengeId, challenge);
      return challenge;
    },
    verifyChallenge: async (
      challengeId: string,
      answer: string,
    ): Promise<CaptchaVerificationResult> => {
      const challenge = this.captchaChallenges.get(challengeId);
      if (!challenge) {
        return { passed: false, message: '验证会话已过期，请刷新重试', isMockDemo: true };
      }
      if (answer.trim() !== challenge.expectedAnswer) {
        return { passed: false, message: '验证结果不正确，请重新输入', isMockDemo: true };
      }
      const token = uid('cap-ok');
      this.verifiedCaptchaTokens.add(token);
      this.captchaChallenges.delete(challengeId);
      return {
        passed: true,
        token,
        message: '智能风控校验通过（演示适配器）',
        isMockDemo: true,
      };
    },
  };

  public readonly files = {
    uploadImage: async (file: File | Blob) => {
      return new Promise<{ url: string; isMockDemo: boolean }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({ url: String(reader.result || ''), isMockDemo: true });
        };
        reader.onerror = () => reject(new Error('图片读取失败，请重试'));
        reader.readAsDataURL(file);
      });
    },
  };

  public readonly auditLogs = {
    list: async (filters?: { activityId?: string | 'all'; action?: string | 'all'; search?: string }) => {
      let list = [...this.db.auditLogs];
      if (filters?.activityId && filters.activityId !== 'all') {
        list = list.filter((l) => l.activityId === filters.activityId || l.activityId === 'global');
      }
      if (filters?.action && filters.action !== 'all') {
        list = list.filter((l) => l.action === filters.action);
      }
      if (filters?.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        list = list.filter(
          (l) =>
            l.actorName.toLowerCase().includes(q) ||
            l.targetLabel.toLowerCase().includes(q) ||
            l.reason.toLowerCase().includes(q),
        );
      }
      return list;
    },
    recordSensitiveView: async (
      activityId: string,
      targetLabel: string,
      actor: SystemUser,
      fieldName?: string,
    ) => {
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId,
        targetType: 'sensitive_data',
        targetId: uid('view'),
        targetLabel: fieldName ? `${targetLabel} · ${fieldName}` : targetLabel,
        action: 'view_sensitive',
        beforeState: '默认脱敏显示',
        afterState: fieldName ? `明文查看（${fieldName}）` : '明文查看',
        reason: fieldName
          ? `授权人员单独展开敏感字段：${fieldName}`
          : '授权人员查看完整证件号码或手机号',
        result: 'success',
      });
    },
    recordDataExport: async (activityId: string, targetLabel: string, actor: SystemUser) => {
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId,
        targetType: 'export',
        targetId: uid('exp'),
        targetLabel,
        action: 'data_export',
        beforeState: '页面数据表格',
        afterState: '导出 CSV 文件',
        reason: '内部运营数据导出',
        result: 'success',
      });
    },
  };

  public readonly settings = {
    getSettings: async () => ({ ...this.db.settings }),
    updateSettings: async (patch: Partial<SystemSettings>, actor: SystemUser) => {
      Object.assign(this.db.settings, patch);
      this.pushAudit({
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: this.getRoleForUser(actor).name,
        activityId: 'global',
        targetType: 'system_settings',
        targetId: 'settings',
        targetLabel: '全局系统参数',
        action: 'permission_change',
        beforeState: '更新系统设置',
        afterState: `时钟偏移 ${this.db.settings.simulatedClockOffsetDays} 天 / 断网模拟 ${this.db.settings.simulateOffline ? '开' : '关'}`,
        reason: '调整系统运行参数',
        result: 'success',
      });
      this.emit('settings_updated', '系统设置已更新');
      return { ...this.db.settings };
    },
    listNotifications: async (activityId?: string) => {
      return this.db.notifications
        .filter((n) => !activityId || n.activityId === activityId)
        .map((n) => ({ ...n }));
    },
    markAllNotificationsRead: async () => {
      for (const n of this.db.notifications) {
        n.read = true;
      }
    },
  };
}
