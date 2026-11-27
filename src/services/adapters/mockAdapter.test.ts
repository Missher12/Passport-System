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

test('Test 6: Invited gift ticket enforces 5-field identity verification and blocks status overwrite/reactivation', async () => {
  const api = new MockApiAdapter();
  const session = await api.auth.getCurrentSession();
  const admin = session!.user;

  // Create a waiting_fill invited ticket via backendBatchImport
  const { created } = await api.tickets.backendBatchImport(
    'act-gz-2027',
    'VIP邀请批次',
    '2026-11-26',
    [
      {
        name: '苏明月',
        idType: 'cn_id',
        idNumber: '440106199505050088',
        countryCode: '+86',
        phone: '13800138505',
      },
    ],
    admin,
  );
  assert.equal(created.length, 1);
  const token = created[0].claimLinkToken!;
  assert.ok(token);

  // Meta returns safe non-sensitive info
  const meta = await api.tickets.getInvitedTicketMeta(token);
  assert.equal(meta.alreadyCompleted, false);
  assert.equal(meta.status, 'waiting_fill');

  // Wrong name or phone MUST be rejected
  await assert.rejects(
    api.tickets.completeInvitedTicket(token, {
      name: '错误姓名',
      idType: 'cn_id',
      idNumber: '440106199505050088',
      countryCode: '+86',
      phone: '13800138505',
      useDate: '2026-11-26',
      avatarUrl: '/avatar.jpg',
    }),
    /身份核验未通过/,
  );

  await assert.rejects(
    api.tickets.completeInvitedTicket(token, {
      name: '苏明月',
      idType: 'cn_id',
      idNumber: '440106199505050088',
      countryCode: '+86',
      phone: '13899999999',
      useDate: '2026-11-26',
      avatarUrl: '/avatar.jpg',
    }),
    /身份核验未通过/,
  );

  // Exact 5-field match succeeds
  const activated = await api.tickets.completeInvitedTicket(token, {
    name: '苏明月',
    idType: 'cn_id',
    idNumber: '440106199505050088',
    countryCode: '+86',
    phone: '13800138505',
    useDate: '2026-11-26',
    avatarUrl: '/avatar.jpg',
  });
  assert.equal(activated.status, 'valid');

  // Redeem the ticket
  const red = await api.redemption.confirmRedemption(
    activated.ticketCode,
    'act-gz-2027',
    'normal',
    admin,
    '入口1',
    '2026-11-26',
  );
  assert.equal(red.record.outcome, 'success');

  // Attempting to re-complete/reactivate a redeemed ticket MUST be rejected
  await assert.rejects(
    api.tickets.completeInvitedTicket(token, {
      name: '苏明月',
      idType: 'cn_id',
      idNumber: '440106199505050088',
      countryCode: '+86',
      phone: '13800138505',
      useDate: '2026-11-26',
      avatarUrl: '/avatar.jpg',
    }),
    /已核销/,
  );
});

test('Test 7: Electronic gift ticket retrieval requires CAPTCHA, returns existing tickets read-only, and preserves redeemed/voided status', async () => {
  const api = new MockApiAdapter();
  const session = await api.auth.getCurrentSession();
  const admin = session!.user;

  const claimed = await api.tickets.selfClaim({
    activityId: 'act-gz-2027',
    batchId: 'gb-gz-partner',
    name: '沈清川',
    idType: 'cn_id',
    idNumber: '440106199707070066',
    countryCode: '+86',
    phone: '13600136707',
    useDate: '2026-11-26',
    avatarUrl: '/avatar.jpg',
  });

  // Missing CAPTCHA token rejected
  await assert.rejects(
    api.tickets.retrieveByIdentity(
      {
        activityId: 'act-gz-2027',
        name: '沈清川',
        idType: 'cn_id',
        idNumber: '440106199707070066',
        countryCode: '+86',
        phone: '13600136707',
      },
      '',
    ),
    /CAPTCHA_REQUIRED/,
  );

  // Solve CAPTCHA and retrieve
  const challenge1 = await api.captcha.assessRisk('high_risk_demo', 'retrieve');
  const verified1 = await api.captcha.verifyChallenge(
    challenge1.challengeId,
    challenge1.expectedAnswer || '',
  );
  assert.equal(verified1.passed, true);

  const countBefore = (await api.tickets.listTickets('act-gz-2027')).length;
  const found1 = await api.tickets.retrieveByIdentity(
    {
      activityId: 'act-gz-2027',
      name: '沈清川',
      idType: 'cn_id',
      idNumber: '440106199707070066',
      countryCode: '+86',
      phone: '13600136707',
    },
    verified1.token!,
  );
  assert.equal(found1.tickets.length, 1);
  assert.equal(found1.tickets[0].ticketCode, claimed.ticket.ticketCode);
  assert.equal(found1.tickets[0].status, 'valid');
  // Does not create duplicates
  assert.equal((await api.tickets.listTickets('act-gz-2027')).length, countBefore);

  // Void ticket and re-retrieve -> must stay voided
  await api.tickets.setTicketStatus('act-gz-2027', claimed.ticket.id, 'voided', '测试作废', admin);
  const challenge2 = await api.captcha.assessRisk('high_risk_demo', 'retrieve');
  const verified2 = await api.captcha.verifyChallenge(
    challenge2.challengeId,
    challenge2.expectedAnswer || '',
  );
  assert.equal(verified2.passed, true);

  const found2 = await api.tickets.retrieveByIdentity(
    {
      activityId: 'act-gz-2027',
      name: '沈清川',
      idType: 'cn_id',
      idNumber: '440106199707070066',
      countryCode: '+86',
      phone: '13600136707',
    },
    verified2.token!,
  );
  assert.equal(found2.tickets[0].status, 'voided');
});

test('Test 8: ALL activity scope aggregates reads, blocks writes, enforces fast-mode auth, and audits per-field sensitive reveal', async () => {
  const api = new MockApiAdapter();
  const session = await api.auth.getCurrentSession();
  const admin = session!.user;

  // ALL mode read aggregation returns records across multiple activities
  const allExhibitors = await api.exhibitors.list('ALL');
  const gzExhibitors = await api.exhibitors.list('act-gz-2027');
  assert.ok(allExhibitors.length >= gzExhibitors.length);

  // ALL mode write blocked
  await assert.rejects(
    api.exhibitors.create(
      {
        activityId: 'ALL',
        boothNumber: 'Z99',
        boothName: '跨活动非法写入',
        primaryContactName: '测试',
        primaryIdType: 'cn_id',
        primaryIdNumber: '440106199001010011',
        countryCode: '+86',
        phone: '13800138999',
        quota: 2,
        entryModeOverride: null,
      },
      admin,
    ),
    /选择具体活动/,
  );

  // Per-field sensitive reveal logs fieldName
  await api.auditLogs.recordSensitiveView('act-gz-2027', 'A01-01 陈明轩', admin, '证件号码');
  const logs = await api.auditLogs.list({ activityId: 'act-gz-2027', action: 'view_sensitive' });
  assert.ok(logs.some((l) => l.afterState.includes('证件号码')));

  // Normal-mode non-admin user cannot invoke fast redemption mode
  const staffSession = await api.auth.switchDemoUser('usr-badge');
  await assert.rejects(
    api.redemption.confirmRedemption(
      'GT2027010001',
      'act-gz-2027',
      'fast',
      staffSession.user,
      '测试端',
      '2026-11-26',
    ),
    /快速核销模式/,
  );
});

