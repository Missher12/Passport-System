# DATA_MODEL.md — 核心数据模型与业务状态机 (v5.0)

前端 TypeScript 实体定义位于 `src/types/domain.ts`，纯状态机与校验规则位于 `src/utils/stateMachines.ts`。

## 1. 数据隔离与汇总原则

1. **多活动严格隔离**：`Exhibitor`、`ExhibitorMember`、`CertificateCategory`、`OnsiteExtraToken`、`GiftBatch`、`GiftTicket`、`RedemptionRecord` 均强制绑定 `activityId`。
2. **`ALL` 视图只读汇总**：读操作支持 `activityId === 'ALL'` 跨活动聚合（受当前用户 `authorizedActivityIds` 限制）；所有写操作强制拒绝 `'ALL'`。
3. **证件库与赠票库物理独立**：`ExhibitorMember` 与 `GiftTicket` 相互独立，不自动合并档案；核销流水通过 `credentialKind: 'certificate' | 'gift'` 区分工作证件核验与赠票入场核销。

## 2. 核心实体概览

- **Activity**：基础信息、封面、时区、默认入口模式（`A_INDEPENDENT` / `B_UNIFIED`）以及 12 项独立时间窗口（`ActivityTimeWindows`）。
- **Exhibitor**：7 项核验字段、`quota`、`onsiteExtraCount`、`entryModeOverride`、`independentToken`。
- **ExhibitorMember**：`memberCode`（按摊位递增且作废号不复用）、`isPrimaryContact`、`isOnsiteExtra`、`certificateCategoryId`、`status`、`avatarUrl`、`claimRecord`。
- **OnsiteExtraToken**：一次性现场加证码，`originalQuota`、`extraCount`、`usedCount`、`reason`、`operatorId`、`used`。
- **CustomFieldDefinition**：自定义表单字段模型，支持 7 种类型 `CustomFieldType = 'text' | 'textarea' | 'radio' | 'checkbox' | 'select' | 'date' | 'number'`，包含 `id`、`label`、`type`、`required`、`placeholder`、`options[]`。
- **GiftBatch**：`totalQuota`、`claimedCount`、`openAt`、`closeAt`、`availableDates[]`、`customFields: CustomFieldDefinition[]`、`enabled`。
- **GiftTicket**：`ticketCode`（一票一码）、`mode`（`self_claim` / `backend_import` / `backend_direct`）、`identityKey`、`useDate`、`availableDates[]`、`claimLinkToken`、`status`、`redeemedAt`。
- **InvitedTicketMeta**：受邀链接非敏感元数据视图（`activityName`、`batchName`、`status`、`availableDates`、`customFields`、`alreadyCompleted`），不向未核验客户端暴露任何个人敏感信息。
- **DynamicQRToken**：30 秒动态令牌，仅绑定 `credentialKind` + `credentialId` + `activityId` + `expiresAt`。
- **RedemptionRecord**：统一核销流水，记录 `credentialKind`、`mode`（`normal` / `fast`）、`outcome`、操作人、设备与 `createdAt`。
- **Department / RoleDefinition / SystemUser / AuditLogEntry**：支持 `active` 启停状态、内置/自定义角色删除保护与单字段敏感查看审计记录。

## 3. 业务状态机

### 3.1 证件主流程状态机 (`CertificateStatus`)

```text
waiting_registration -> submitted -> waiting_avatar -> avatar_completed -> credential_generated -> badge_claimed
```

异常状态：`frozen`（冻结，可解冻）、`voided`（作废，终态且编号不复用）、`pending`（待处理）。未完成头像上传禁止生成有效电子凭证或领取实体证。

### 3.2 赠票主流程状态机 (`GiftTicketStatus`)

```text
waiting_fill -> submitted -> generated -> valid -> redeemed (终态)
```

异常状态：`voided`（终态）、`expired`（终态）、`frozen`（可解冻）。
受邀链接补全接口严禁覆写或重新激活已处于 `valid`、`generated`、`redeemed`、`frozen`、`voided`、`expired` 状态的票据；电子赠票找回接口保持严格只读，不复制票据、不篡改任何原始状态。
