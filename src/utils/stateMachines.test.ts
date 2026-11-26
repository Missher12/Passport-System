import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canGenerateCertificateCredential,
  canTransitionCertificateStatus,
  canTransitionGiftStatus,
  computeNextMemberCode,
  evaluateBusinessWindow,
  maskIdNumber,
  maskPhone,
  matchExhibitorSevenFields,
  normalizeIdentityKey,
  parseMemberImportCsv,
  resolveExhibitorPortalPhase,
  validateIdNumber,
  validatePhone,
} from './stateMachines';
import type { ActivityTimeWindows, Exhibitor } from '../types/domain';

test('certificate state machine enforces valid progression and terminal states', () => {
  assert.equal(canTransitionCertificateStatus('waiting_registration', 'submitted'), true);
  assert.equal(canTransitionCertificateStatus('submitted', 'waiting_avatar'), true);
  assert.equal(canTransitionCertificateStatus('waiting_avatar', 'avatar_completed'), true);
  assert.equal(canTransitionCertificateStatus('avatar_completed', 'credential_generated'), true);
  assert.equal(canTransitionCertificateStatus('credential_generated', 'badge_claimed'), true);
  assert.equal(canTransitionCertificateStatus('voided', 'credential_generated'), false);
  assert.equal(canTransitionCertificateStatus('waiting_registration', 'badge_claimed'), false);
});

test('gift ticket state machine prevents re-opening redeemed or voided tickets', () => {
  assert.equal(canTransitionGiftStatus('waiting_fill', 'submitted'), true);
  assert.equal(canTransitionGiftStatus('valid', 'redeemed'), true);
  assert.equal(canTransitionGiftStatus('redeemed', 'valid'), false);
  assert.equal(canTransitionGiftStatus('voided', 'valid'), false);
  assert.equal(canTransitionGiftStatus('frozen', 'valid'), true);
});

test('electronic certificate generation requires completed avatar and active status', () => {
  assert.equal(
    canGenerateCertificateCredential({
      name: '林思远',
      idNumber: '440106199408120011',
      phone: '13800138000',
      avatarUrl: undefined,
      status: 'waiting_avatar',
    }),
    false,
  );
  assert.equal(
    canGenerateCertificateCredential({
      name: '林思远',
      idNumber: '440106199408120011',
      phone: '13800138000',
      avatarUrl: '/avatar.jpg',
      status: 'avatar_completed',
    }),
    true,
  );
  assert.equal(
    canGenerateCertificateCredential({
      name: '林思远',
      idNumber: '440106199408120011',
      phone: '13800138000',
      avatarUrl: '/avatar.jpg',
      status: 'frozen',
    }),
    false,
  );
});

test('auto-numbering increments sequentially and never reuses voided gaps', () => {
  assert.equal(computeNextMemberCode('A01', []), 'A01-01');
  assert.equal(computeNextMemberCode('A01', ['A01-01', 'A01-02', 'A01-05']), 'A01-06');
  assert.equal(computeNextMemberCode('b12', ['B12-10']), 'B12-11');
});

test('identity normalization collapses whitespace, dashes, and case', () => {
  assert.equal(
    normalizeIdentityKey('passport', ' e 1234-5678 '),
    normalizeIdentityKey('passport', 'E12345678'),
  );
});

test('7-field exhibitor verification requires exact match across all fields', () => {
  const exhibitor: Exhibitor = {
    id: 'ex-1',
    activityId: 'act-1',
    boothNumber: 'A01',
    boothName: '星火动漫工作室',
    primaryContactName: '陈明轩',
    primaryIdType: 'cn_id',
    primaryIdNumber: '440106199205180019',
    countryCode: '+86',
    phone: '13800138001',
    businessPassword: 'YH-2027-8842',
    passwordActive: true,
    quota: 10,
    onsiteExtraCount: 0,
    entryModeOverride: null,
    independentToken: 'tok-a01',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };

  assert.equal(
    matchExhibitorSevenFields(exhibitor, {
      activityId: 'act-1',
      boothNumber: 'a01',
      boothName: '星火动漫工作室',
      primaryContactName: '陈明轩',
      primaryIdType: 'cn_id',
      primaryIdNumber: '440106199205180019',
      countryCode: '+86',
      phone: '13800138001',
      businessPassword: 'YH-2027-8842',
    }),
    true,
  );

  // Wrong password fails
  assert.equal(
    matchExhibitorSevenFields(exhibitor, {
      activityId: 'act-1',
      boothNumber: 'A01',
      boothName: '星火动漫工作室',
      primaryContactName: '陈明轩',
      primaryIdType: 'cn_id',
      primaryIdNumber: '440106199205180019',
      countryCode: '+86',
      phone: '13800138001',
      businessPassword: 'WRONG',
    }),
    false,
  );
});

test('CSV batch import isolates bad rows and enforces remaining quota', () => {
  const csv = [
    '姓名,证件类型,证件号码,国际区号,联系电话,岗位说明',
    '周嘉宁,居民身份证,440106199506150028,+86,13900139001,展台运营',
    '错误行,居民身份证,12345,+86,13900139002,测试',
    '重复行,居民身份证,440106199506150028,+86,13900139003,重复',
    '超额行,护照,E88776655,+852,91234567,海外代表',
  ].join('\n');

  const rows = parseMemberImportCsv(csv, new Set<string>(), 1);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].valid, true);
  assert.equal(rows[1].valid, false);
  assert.equal(rows[2].valid, false);
  assert.equal(rows[3].valid, false);
  assert.match(rows[3].errors[0], /超出剩余可用名额/);
});

test('activity business window and portal phase resolution switch automatically on avatar date', () => {
  const windows: ActivityTimeWindows = {
    exhibitorRegisterStart: '2026-11-01T00:00:00Z',
    exhibitorRegisterEnd: '2026-11-20T23:59:59Z',
    avatarUploadStart: '2026-11-21T00:00:00Z',
    avatarUploadEnd: '2026-12-05T23:59:59Z',
    badgeClaimStart: '2026-12-06T00:00:00Z',
    badgeClaimEnd: '2026-12-10T23:59:59Z',
    giftSelfClaimStart: '2026-11-15T00:00:00Z',
    giftSelfClaimEnd: '2026-12-08T23:59:59Z',
    giftBackendIssueEnd: '2026-12-09T23:59:59Z',
    onsiteExtraStart: '2026-12-06T00:00:00Z',
    redemptionValidStart: '2026-12-06T00:00:00Z',
    redemptionValidEnd: '2026-12-10T23:59:59Z',
  };

  assert.equal(resolveExhibitorPortalPhase(windows, Date.parse('2026-11-10T12:00:00Z')), 'registration');
  assert.equal(resolveExhibitorPortalPhase(windows, Date.parse('2026-11-25T12:00:00Z')), 'avatar');
  assert.equal(
    evaluateBusinessWindow(windows.badgeClaimStart, windows.badgeClaimEnd, Date.parse('2026-12-07T10:00:00Z')),
    'active',
  );
});

test('masking and validators handle international formats', () => {
  assert.equal(validateIdNumber('cn_id', '44010619920518001X'), null);
  assert.equal(validatePhone('+852', '91234567'), null);
  assert.notEqual(validatePhone('+86', '12345'), null);
  assert.equal(maskIdNumber('440106199205180019'), '4401********0019');
  assert.equal(maskPhone('+86', '13800138000'), '+86 138****8000');
});
