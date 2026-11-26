# DATA_MODEL.md — 核心数据模型与业务状态机

所有前端 TypeScript 实体定义位于 `src/types/domain.ts`，纯状态机与校验规则位于 `src/utils/stateMachines.ts`。

## 1. 数据隔离原则

1. **多活动严格隔离**：`Exhibitor`、`ExhibitorMember`、`CertificateCategory`、`OnsiteExtraToken`、`GiftBatch`、`GiftTicket`、`RedemptionRecord` 均强制绑定 `activityId`。
2. **证件库与赠票库物理独立**：`ExhibitorMember`（展商/工作证件）与 `GiftTicket`（活动赠票）为完全独立实体表，不自动合并身份档案，核销记录通过 `credentialKind: 'certificate' | 'gift'` 区分但互不污染状态。

## 2. 核心实体概览

- **Activity**：基础信息、封面、时区、默认入口模式（`A_INDEPENDENT` / `B_UNIFIED`）以及 12 个独立业务时间窗口字段（`ActivityTimeWindows`）。
- **Exhibitor**：7 项核验字段（`boothNumber`, `boothName`, `primaryContactName`, `primaryIdType`, `primaryIdNumber`, `countryCode`, `phone`, `businessPassword`）、`quota`、`onsiteExtraCount`、`entryModeOverride`、`independentToken`。
- **ExhibitorMember**：`memberCode`（按摊位递增如 `A01-01`，作废编号绝不复用）、`isPrimaryContact`、`isOnsiteExtra`、`certificateCategoryId`、`status`、`avatarUrl`、`claimRecord`。
- **OnsiteExtraToken**：一次性现场加证令牌，`originalQuota`、`extraCount`、`usedCount`、`reason`、`operatorId`、`used`。
- **GiftBatch**：`totalQuota`、`claimedCount`、`openAt`、`closeAt`、`availableDates[]`、`customFields[]`、`enabled`。
- **GiftTicket**：`ticketCode`（一票一码）、`mode`（`self_claim` / `backend_import` / `backend_direct`）、`identityKey`（规范化证件标识，用于活动内跨批次排重）、`useDate`、`claimLinkToken`、`status`、`redeemedAt`。
- **DynamicQRToken**：30 秒动态令牌，仅绑定 `credentialKind` + `credentialId` + `activityId` + `expiresAt`，不暴露证件号码。
- **RedemptionRecord**：统一扫码核销流水，记录 `mode`（`normal` / `fast`）、`outcome`（`success` / `duplicate` / `expired` / `frozen` / `voided` / `date_mismatch` / `invalid` / `offline`）、操作人及设备标识。
- **Department / RoleDefinition / SystemUser / AuditLogEntry**：组织权限与不可删除的全量审计日志模型。

## 3. 业务状态机

### 3.1 证件主流程状态机 (`CertificateStatus`)

```text
waiting_registration (等待资料登记)
  -> submitted (资料已提交)
  -> waiting_avatar (等待头像补充)
  -> avatar_completed (头像已完成)
  -> credential_generated (电子凭证已生成)
  -> badge_claimed (实体证件已领取)
```

异常状态：`frozen`（已冻结，可解冻恢复）、`voided`（已作废，终态不可恢复且编号永不复用）、`pending`（待处理）。未完成头像上传时禁止生成有效电子凭证。

### 3.2 赠票主流程状态机 (`GiftTicketStatus`)

```text
waiting_fill (等待填写)
  -> submitted (资料已提交)
  -> generated (凭证已生成)
  -> valid (凭证有效)
  -> redeemed (已核销，终态)
```

异常状态：`voided`（已作废，终态）、`expired`（已过期，终态）、`frozen`（已冻结，可解冻恢复有效）。
