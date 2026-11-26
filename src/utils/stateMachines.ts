import type {
  ActivityTimeWindows,
  BatchImportRowPreview,
  CertificateStatus,
  Exhibitor,
  ExhibitorVerifyInput,
  GiftTicketStatus,
  IdType,
} from '../types/domain';

export const ID_TYPE_LABELS: Record<IdType, string> = {
  cn_id: '居民身份证',
  passport: '护照',
  hk_mo_pass: '港澳居民来往内地通行证',
  tw_pass: '台湾居民来往大陆通行证',
  foreign_pr: '外国人永久居留身份证',
};

export const COUNTRY_CODES = [
  { code: '+86', label: '中国大陆 (+86)' },
  { code: '+852', label: '中国香港 (+852)' },
  { code: '+853', label: '中国澳门 (+853)' },
  { code: '+886', label: '中国台湾 (+886)' },
  { code: '+81', label: '日本 (+81)' },
  { code: '+82', label: '韩国 (+82)' },
  { code: '+65', label: '新加坡 (+65)' },
  { code: '+1', label: '美国/加拿大 (+1)' },
  { code: '+44', label: '英国 (+44)' },
];

export const CERTIFICATE_STATUS_LABELS: Record<CertificateStatus, string> = {
  waiting_registration: '等待资料登记',
  submitted: '资料已提交',
  waiting_avatar: '等待头像补充',
  avatar_completed: '头像已完成',
  credential_generated: '电子凭证已生成',
  badge_claimed: '实体证件已领取',
  frozen: '已冻结',
  voided: '已作废',
  pending: '待处理',
};

export const GIFT_STATUS_LABELS: Record<GiftTicketStatus, string> = {
  waiting_fill: '等待填写',
  submitted: '资料已提交',
  generated: '凭证已生成',
  valid: '凭证有效',
  redeemed: '已核销',
  voided: '已作废',
  expired: '已过期',
  frozen: '已冻结',
};

const CERTIFICATE_TRANSITIONS: Record<CertificateStatus, CertificateStatus[]> = {
  waiting_registration: ['submitted', 'pending', 'frozen', 'voided'],
  submitted: ['waiting_avatar', 'avatar_completed', 'credential_generated', 'pending', 'frozen', 'voided'],
  waiting_avatar: ['avatar_completed', 'credential_generated', 'pending', 'frozen', 'voided'],
  avatar_completed: ['credential_generated', 'badge_claimed', 'frozen', 'voided'],
  credential_generated: ['badge_claimed', 'frozen', 'voided'],
  badge_claimed: ['frozen', 'voided'],
  pending: ['waiting_registration', 'submitted', 'waiting_avatar', 'avatar_completed', 'credential_generated', 'frozen', 'voided'],
  frozen: ['waiting_avatar', 'credential_generated', 'badge_claimed', 'voided'],
  voided: [],
};

const GIFT_TRANSITIONS: Record<GiftTicketStatus, GiftTicketStatus[]> = {
  waiting_fill: ['submitted', 'generated', 'valid', 'voided', 'expired', 'frozen'],
  submitted: ['generated', 'valid', 'voided', 'expired', 'frozen'],
  generated: ['valid', 'redeemed', 'voided', 'expired', 'frozen'],
  valid: ['redeemed', 'voided', 'expired', 'frozen'],
  redeemed: [],
  voided: [],
  expired: [],
  frozen: ['valid', 'voided', 'expired'],
};

export function canTransitionCertificateStatus(
  from: CertificateStatus,
  to: CertificateStatus,
): boolean {
  if (from === to) return true;
  return CERTIFICATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionGiftStatus(
  from: GiftTicketStatus,
  to: GiftTicketStatus,
): boolean {
  if (from === to) return true;
  return GIFT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canGenerateCertificateCredential(member: {
  name: string;
  idNumber: string;
  phone: string;
  avatarUrl?: string;
  status: CertificateStatus;
}): boolean {
  if (member.status === 'frozen' || member.status === 'voided') return false;
  return Boolean(
    member.name.trim() &&
      member.idNumber.trim() &&
      member.phone.trim() &&
      member.avatarUrl &&
      member.avatarUrl.trim(),
  );
}

export type WindowPhase = 'not_started' | 'active' | 'ended';

export function evaluateBusinessWindow(
  startIso: string,
  endIso: string,
  nowMs: number,
): WindowPhase {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 'active';
  if (nowMs < startMs) return 'not_started';
  if (nowMs > endMs) return 'ended';
  return 'active';
}

export function resolveExhibitorPortalPhase(
  windows: ActivityTimeWindows,
  nowMs: number,
): 'before_open' | 'registration' | 'avatar' | 'closed' {
  const avatarWindow = evaluateBusinessWindow(
    windows.avatarUploadStart,
    windows.avatarUploadEnd,
    nowMs,
  );
  if (avatarWindow === 'active') return 'avatar';

  const regWindow = evaluateBusinessWindow(
    windows.exhibitorRegisterStart,
    windows.exhibitorRegisterEnd,
    nowMs,
  );
  if (regWindow === 'active') return 'registration';
  if (regWindow === 'not_started' && avatarWindow === 'not_started') {
    return 'before_open';
  }
  return 'closed';
}

/**
 * Normalizes identity fields so cross-batch duplicate gift ticket detection
 * cannot be bypassed via whitespace, case differences, or hyphens.
 */
export function normalizeIdentityKey(idType: IdType, idNumber: string): string {
  const cleaned = idNumber.trim().toUpperCase().replace(/[\s-]+/g, '');
  return `${idType}:${cleaned}`;
}

export function normalizePhone(countryCode: string, phone: string): string {
  const cleanCode = countryCode.trim().startsWith('+')
    ? countryCode.trim()
    : `+${countryCode.trim()}`;
  const cleanPhone = phone.replace(/[\s-()]+/g, '');
  return `${cleanCode}${cleanPhone}`;
}

export function validateIdNumber(idType: IdType, idNumber: string): string | null {
  const val = idNumber.trim().toUpperCase();
  if (!val) return '请输入证件号码';
  switch (idType) {
    case 'cn_id':
      if (!/^\d{17}[\dX]$/.test(val)) {
        return '居民身份证须为 18 位数字（末位可为 X）';
      }
      return null;
    case 'passport':
      if (!/^[A-Z0-9]{6,14}$/.test(val)) {
        return '护照号码须为 6-14 位字母或数字';
      }
      return null;
    case 'hk_mo_pass':
      if (!/^[HM]\d{8,10}$/.test(val)) {
        return '港澳通行证须以 H 或 M 开头加 8-10 位数字';
      }
      return null;
    case 'tw_pass':
      if (!/^\d{8,10}$/.test(val)) {
        return '台胞证须为 8-10 位数字';
      }
      return null;
    case 'foreign_pr':
      if (!/^[A-Z0-9]{15,18}$/.test(val)) {
        return '外国人永久居留证须为 15-18 位字符';
      }
      return null;
    default:
      return null;
  }
}

export function validatePhone(countryCode: string, phone: string): string | null {
  const digits = phone.replace(/[\s-()]+/g, '');
  if (!digits) return '请输入联系电话';
  if (!/^\d{6,15}$/.test(digits)) {
    return '联系电话须为 6-15 位数字';
  }
  if (countryCode === '+86' && !/^1\d{10}$/.test(digits)) {
    return '中国大陆手机号须为 11 位且以 1 开头';
  }
  return null;
}

export function maskIdNumber(idNumber: string, reveal = false): string {
  if (reveal || idNumber.length <= 6) return idNumber;
  return `${idNumber.slice(0, 4)}********${idNumber.slice(-4)}`;
}

export function maskPhone(countryCode: string, phone: string, reveal = false): string {
  const digits = phone.replace(/\s+/g, '');
  if (reveal || digits.length <= 6) return `${countryCode} ${digits}`;
  return `${countryCode} ${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

/**
 * Strict 7-field exhibitor identity check.
 * Returns a boolean without leaking which single field failed.
 */
export function matchExhibitorSevenFields(
  exhibitor: Exhibitor,
  input: ExhibitorVerifyInput,
): boolean {
  if (!exhibitor.passwordActive) return false;
  if (exhibitor.activityId !== input.activityId) return false;
  if (input.independentToken && exhibitor.independentToken !== input.independentToken) {
    return false;
  }
  return (
    exhibitor.boothNumber.trim().toUpperCase() === input.boothNumber.trim().toUpperCase() &&
    exhibitor.boothName.trim() === input.boothName.trim() &&
    exhibitor.primaryContactName.trim() === input.primaryContactName.trim() &&
    exhibitor.primaryIdType === input.primaryIdType &&
    normalizeIdentityKey(exhibitor.primaryIdType, exhibitor.primaryIdNumber) ===
      normalizeIdentityKey(input.primaryIdType, input.primaryIdNumber) &&
    normalizePhone(exhibitor.countryCode, exhibitor.phone) ===
      normalizePhone(input.countryCode, input.phone) &&
    exhibitor.businessPassword.trim() === input.businessPassword.trim()
  );
}

/**
 * Computes next sequential member code (e.g. A01-01 -> A01-02).
 * Voided numbers are never reused because max sequence is derived from all historical codes.
 */
export function computeNextMemberCode(boothNumber: string, existingCodes: string[]): string {
  const prefix = `${boothNumber.trim().toUpperCase()}-`;
  let maxSeq = 0;
  for (const code of existingCodes) {
    if (code.toUpperCase().startsWith(prefix)) {
      const seq = Number.parseInt(code.slice(prefix.length), 10);
      if (!Number.isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
}

export function parseIdTypeInput(raw: string): IdType {
  const v = raw.trim().toLowerCase();
  if (v === 'passport' || v.includes('护照')) return 'passport';
  if (v === 'hk_mo_pass' || v.includes('港澳')) return 'hk_mo_pass';
  if (v === 'tw_pass' || v.includes('台湾') || v.includes('台胞')) return 'tw_pass';
  if (v === 'foreign_pr' || v.includes('永居') || v.includes('外国')) return 'foreign_pr';
  return 'cn_id';
}

export function parseMemberImportCsv(
  text: string,
  existingIdentityKeys: Set<string>,
  remainingQuota: number,
): BatchImportRowPreview[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const firstLower = lines[0].toLowerCase();
  const hasHeader =
    firstLower.includes('姓名') ||
    firstLower.includes('name') ||
    firstLower.includes('证件');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const seenInBatch = new Set<string>();
  let validCount = 0;

  return dataLines.map((line, index) => {
    const cols = line.split(/[,\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    const name = cols[0] ?? '';
    const idType = parseIdTypeInput(cols[1] ?? 'cn_id');
    const idNumber = cols[2] ?? '';
    const countryCode = cols[3] ? (cols[3].startsWith('+') ? cols[3] : `+${cols[3]}`) : '+86';
    const phone = cols[4] ?? '';
    const roleNote = cols[5] ?? '';

    const errors: string[] = [];
    if (!name) errors.push('姓名不能为空');
    const idErr = validateIdNumber(idType, idNumber);
    if (idErr) errors.push(idErr);
    const phoneErr = validatePhone(countryCode, phone);
    if (phoneErr) errors.push(phoneErr);

    const key = idNumber ? normalizeIdentityKey(idType, idNumber) : '';
    if (key) {
      if (existingIdentityKeys.has(key)) {
        errors.push('该证件号已在当前展商名单中');
      } else if (seenInBatch.has(key)) {
        errors.push('导入文件内存在重复证件号');
      }
    }

    if (errors.length === 0) {
      if (validCount >= remainingQuota) {
        errors.push(`超出剩余可用名额（剩余 ${remainingQuota} 人）`);
      } else {
        validCount += 1;
        if (key) seenInBatch.add(key);
      }
    }

    const extraFields: Record<string, string> = roleNote ? { 岗位说明: roleNote } : {};
    return {
      rowNumber: index + (hasHeader ? 2 : 1),
      name,
      idType,
      idNumber,
      countryCode,
      phone,
      extraFields,
      valid: errors.length === 0,
      errors,
    };
  });
}

export function buildCsvDownloadContent(headers: string[], rows: string[][]): string {
  const escapeCell = (value: string) => {
    const s = String(value ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
}

export function formatDateTimeDisplay(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export function formatDateDisplay(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
