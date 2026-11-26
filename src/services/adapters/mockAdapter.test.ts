import test from 'node:test';
import assert from 'node:assert/strict';
import { MockApiAdapter } from './mockAdapter';

test('Test 1: Exhibitor creation auto-generates unique password, primary contact slot-01, 7-field auth, and enforces quota', async () => {
  const api = new MockApiAdapter();
  const session = await api.auth.getCurrentSession();
  assert.ok(session);
  const admin = session.user;

  const { exhibitor, primaryMember } = await api.exhibitors.create(
    {
      activityId: 'act-gz-2027',
      boothNumber: 'E09',
      boothName: '青空模型馆',
      primaryContactName: '方舟',
      primaryIdType: 'cn_id',
      primaryIdNumber: '440106199101010011',
      countryCode: '+86',
      phone: '13800138909',
      quota: 2,
      entryModeOverride: 'A_INDEPENDENT',
    },
    admin,
  );

  assert.equal(primaryMember.memberCode, 'E09-01');
  assert.equal(primaryMember.isPrimaryContact, true);
  assert.ok(exhibitor.businessPassword.startsWith('YH-2027-'));

  // 7-field verification succeeds
  const verified = await api.exhibitors.verifySevenFields({
    activityId: 'act-gz-2027',
    boothNumber: 'E09',
    boothName: '青空模型馆',
    primaryContactName: '方舟',
    primaryIdType: 'cn_id',
    primaryIdNumber: '440106199101010011',
    countryCode: '+86',
    phone: '13800138909',
    businessPassword: exhibitor.businessPassword,
    independentToken: exhibitor.independentToken,
  });
  assert.equal(verified.exhibitor.id, exhibitor.id);
  assert.equal(verified.isMockDemo, true);

  // Add second member -> E09-02
  const m2 = await api.members.addMember(
    {
      activityId: 'act-gz-2027',
      exhibitorId: exhibitor.id,
      name: '林川',
      idType: 'cn_id',
      idNumber: '440106199302020022',
      countryCode: '+86',
      phone: '13800138910',
    },
    { id: 'ext', name: '方舟', role: '外部展商' },
  );
  assert.equal(m2.memberCode, 'E09-02');

  // Third member exceeds quota of 2
  await assert.rejects(
    api.members.addMember(
      {
        activityId: 'act-gz-2027',
        exhibitorId: exhibitor.id,
        name: '超额人员',
        idType: 'cn_id',
        idNumber: '440106199303030033',
        countryCode: '+86',
        phone: '13800138911',
      },
      { id: 'ext', name: '方舟', role: '外部展商' },
    ),
    /申请名额上限/,
  );
});

test('Test 2 & 3: Avatar upload generates credential, onsite extra badge increments code and single-use token expires', async () => {
  const api = new MockApiAdapter();
  const session = await api.auth.getCurrentSession();
  const admin = session!.user;

  // A01-03 has no avatar yet -> cannot claim physical badge
  await assert.rejects(
    api.certificates.claimIndividual('act-gz-2027', 'mem-gz-a01-03', admin),
    /尚未完成头像/,
  );

  // Upload avatar -> status becomes credential_generated
  const updated = await api.members.uploadAvatar(
    'act-gz-2027',
    'mem-gz-a01-03',
    '/src/assets/images/avatar_portrait_1_1795683961159.jpg',
    { id: 'ext', name: '陈明轩', role: '外部展商' },
  );
  assert.equal(updated.status, 'credential_generated');

  // Issue onsite extra token for A01
  const tokenObj = await api.certificates.createOnsiteExtraToken(
    {
      activityId: 'act-gz-2027',
      exhibitorId: 'ex-gz-a01',
      verifyInput: {
        activityId: 'act-gz-2027',
        boothNumber: 'A01',
        boothName: '星火次元文化',
        primaryContactName: '陈明轩',
        primaryIdType: 'cn_id',
        primaryIdNumber: '440106199205180019',
        countryCode: '+86',
        phone: '13800138001',
        businessPassword: 'YH-2027-8842',
      },
      extraCount: 1,
      reason: '现场追加特邀画师名额',
    },
    admin,
  );

  const extraRes = await api.certificates.submitOnsiteExtraMember(tokenObj.token, {
    name: '高远',
    idType: 'cn_id',
    idNumber: '440106199409090099',
    countryCode: '+86',
    phone: '13900139999',
    avatarUrl: '/src/assets/images/avatar_portrait_2_1795683963278.jpg',
  });
  assert.equal(extraRes.member.memberCode, 'A01-04');
  assert.equal(extraRes.member.isOnsiteExtra, true);
  assert.equal(extraRes.tokenState.used, true);

  // Reusing one-time token fails
  await assert.rejects(
    api.certificates.submitOnsiteExtraMember(tokenObj.token, {
      name: '重复提交',
      idType: 'cn_id',
      idNumber: '440106199409090088',
      countryCode: '+86',
      phone: '13900139998',
    }),
    /已使用失效/,
  );
});

test('Test 4: Gift self-claim enforces cross-batch identity uniqueness within the same activity', async () => {
  const api = new MockApiAdapter();

  const claimed = await api.tickets.selfClaim({
    activityId: 'act-gz-2027',
    batchId: 'gb-gz-partner',
    name: '何景明',
    idType: 'cn_id',
    idNumber: '440106199601010077',
    countryCode: '+86',
    phone: '13700137777',
    useDate: '2026-11-26',
    avatarUrl: '/src/assets/images/avatar_portrait_2_1795683963278.jpg',
  });
  assert.equal(claimed.ticket.status, 'valid');
  assert.ok(claimed.ticket.ticketCode.startsWith('GT'));

  // Attempt to self-claim again in a DIFFERENT batch of the SAME activity with different phone -> must reject!
  await assert.rejects(
    api.tickets.selfClaim({
      activityId: 'act-gz-2027',
      batchId: 'gb-gz-vipday1',
      name: '何景明',
      idType: 'cn_id',
      idNumber: '440106199601010077',
      countryCode: '+86',
      phone: '13999999999',
      useDate: '2026-11-26',
      avatarUrl: '/src/assets/images/avatar_portrait_2_1795683963278.jpg',
    }),
    /每个身份仅允许自助领取一次赠票/,
  );

  // Same person CAN claim in a DIFFERENT activity (activity isolation!)
  const otherAct = await api.tickets.selfClaim({
    activityId: 'act-sh-2027',
    batchId: 'gb-sh-early',
    name: '何景明',
    idType: 'cn_id',
    idNumber: '440106199601010077',
    countryCode: '+86',
    phone: '13700137777',
    useDate: '2027-05-01',
    avatarUrl: '/src/assets/images/avatar_portrait_2_1795683963278.jpg',
  });
  assert.equal(otherAct.ticket.activityId, 'act-sh-2027');
});

test('Test 5: Dynamic QR redemption handles normal/fast, duplicate, frozen, date mismatch, and offline guards', async () => {
  const api = new MockApiAdapter();
  const session = await api.auth.getCurrentSession();
  const admin = session!.user;

  // Dynamic QR token for valid gift ticket GT2027010001 (useDate 2026-11-26)
  const dyn = await api.qr.issueDynamicToken('gift', 'gt-gz-0001', 'act-gz-2027');
  assert.equal(dyn.isMockDemo, true);

  // Preview succeeds
  const preview = await api.redemption.verifyAndPreview(dyn.token, 'act-gz-2027', '2026-11-26');
  assert.equal(preview.valid, true);
  assert.equal(preview.outcome, 'success');

  // Confirm redemption succeeds
  const res1 = await api.redemption.confirmRedemption(dyn.token, 'act-gz-2027', 'normal', admin, '测试端', '2026-11-26');
  assert.equal(res1.record.outcome, 'success');

  // Second scan rejected as duplicate
  const res2 = await api.redemption.confirmRedemption(dyn.token, 'act-gz-2027', 'fast', admin, '测试端', '2026-11-26');
  assert.equal(res2.record.outcome, 'duplicate');

  // Date mismatch check on GT2027010002 (useDate 2026-11-27 scanned on 2026-11-26)
  const mismatch = await api.redemption.verifyAndPreview('GT2027010002', 'act-gz-2027', '2026-11-26');
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.outcome, 'date_mismatch');

  // Frozen certificate check on C15-01
  const frozen = await api.redemption.verifyAndPreview('C15-01', 'act-gz-2027', '2026-11-26');
  assert.equal(frozen.valid, false);
  assert.equal(frozen.outcome, 'frozen');

  // Offline simulation blocks redemption
  await api.settings.updateSettings({ simulateOffline: true }, admin);
  const offline = await api.redemption.verifyAndPreview('A01-01', 'act-gz-2027', '2026-11-26');
  assert.equal(offline.valid, false);
  assert.equal(offline.outcome, 'offline');
});
