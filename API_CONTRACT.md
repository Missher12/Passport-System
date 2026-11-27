# API_CONTRACT.md — 活动证件与赠票管理系统服务端契约 (v5.0)

本文档定义 `ProductionApiAdapter` (`src/services/adapters/productionAdapter.ts`) 对接真实后端所需的全部 RESTful 与实时流接口规范。

## 1. 通用约定

- **Base URL**：由 `VITE_API_BASE_URL` 注入，默认 `/api/v1`。
- **认证方式**：内部管理端使用 HttpOnly Cookie 或 `Authorization: Bearer <token>`；外部展商端通过 7 项档案核验签发短期会话令牌。
- **活动隔离与 `ALL` 视图约束**：
  - 读接口支持 `activityId=ALL` 返回当前账号授权范围内的跨活动汇总数据。
  - 所有写接口必须携带具体 `activityId`，严禁在 `ALL` 模式下创建、编辑、发证、发放或核销。
- **安全边界**：所有密码哈希、动态二维码签名、Smart CAPTCHA 校验、受邀赠票 5 项身份核验、跨批次排重及并发核销锁均由服务端权威执行。

## 2. 核心接口清单

| 服务 | 方法与路径 | 说明 |
| :--- | :--- | :--- |
| **AuthService** | `POST /auth/login`、`GET /auth/session`、`POST /auth/logout`、`PATCH /auth/profile`、`POST /auth/password` | 内部员工登录、会话校验、个人资料维护与密码修改 |
| **ActivityService** | `GET /activities`、`POST /activities`、`PATCH /activities/:id`、`PATCH /activities/:id/status` | 活动全生命周期与 12 项独立业务时间窗口管理 |
| **ExhibitorService** | `GET /activities/:activityId/exhibitors`、`POST /activities/:activityId/exhibitors`、`PATCH .../quota`、`POST .../reset-password`、`POST /public/exhibitor/verify` | 展商主档案、商务密码管理与 7 项核验 |
| **MemberService** | `GET /activities/:activityId/members`、`POST .../members`、`POST .../members/batch-import`、`POST .../members/:id/avatar`、`PATCH .../status` | 人员登记（递增编号且作废号永不复用）、批量导入、头像上传与状态管理 |
| **CertificateService** | `GET/POST/PATCH .../certificate-categories`、`POST .../claim`、`POST .../claim-batch`、`POST .../onsite-extra-tokens`、`POST /public/onsite-extra/:token` | 证件类别、个人/展位按人批量领证、一次性现场加证码签发与核销失效 |
| **GiftService** | `GET/POST/PATCH /activities/:activityId/gift-batches` | 自助赠票批次、配额、可选日期与 7 类自定义字段（`text`/`textarea`/`radio`/`checkbox`/`select`/`date`/`number`）配置 |
| **TicketService** | `GET .../gift-tickets`、`POST /public/gift-tickets/self-claim`、`POST .../direct`、`POST .../batch-import`、`GET /public/gift-tickets/invited/:token/meta`、`POST /public/gift-tickets/invited/:token`、`POST /public/gift-tickets/retrieve`、`PATCH .../status` | 跨批次身份排重、受邀链接非敏感元数据查询、受邀赠票 5 项身份核验与防终态覆盖、实名+CAPTCHA 电子赠票只读找回 |
| **QRService** | `POST /qr/issue` | 服务端签发 30 秒短期动态令牌（不含明文证件号） |
| **RedemptionService** | `POST /redemption/preview`、`POST /redemption/confirm`、`GET .../redemption-records` | 证件核验与赠票入场核销区分、普通/快速模式（服务端强制校验快速模式权限）、并发防重 |
| **UserService** | `GET/POST/PATCH /admin/users`、`PATCH /admin/users/:id/redemption-mode` | 内部员工账号与单账号核销模式授权 |
| **PermissionService** | `GET/POST/PATCH/DELETE /admin/roles`、`GET/POST/PATCH /admin/departments` | 内置/自定义角色增改删、部门启停与人数统计 |
| **CaptchaService** | `POST /captcha/assess`、`POST /captcha/verify` | 可替换 Captcha Provider 风险评估与校验 |
| **FileService** | `POST /files/upload` | 头像与封面对象存储直传签名及压缩 |
| **AuditLogService** | `GET /admin/audit-logs`、`POST .../sensitive-view`（含 `fieldName`）、`POST .../data-export` | 只写审计日志（含单字段敏感明文查看记录） |
| **RealtimeService** | `GET /realtime/stream` | SSE / WebSocket 跨端实时事件广播 |

## 3. 需真实后端接入项

以下能力当前在前端 `MockApiAdapter` 中以本地内存/演示逻辑模拟，上线前须接入真实服务端：

1. 真实数据库持久化、事务隔离与 `(activity_id, identity_hash)` 跨批次唯一索引。
2. 服务端 Argon2id/bcrypt 密码哈希与接口级速率限制（Redis）。
3. 服务端密钥签发的 30 秒 HMAC/JWT 动态二维码令牌与旧令牌吊销。
4. 分布式并发核销原子锁与多端 SSE/WebSocket 实时推送。
5. 第三方人机验证 Provider（Turnstile / reCAPTCHA / 极验）服务端验签。
6. 私有对象存储签名上传与敏感字段落库加密（AES-256-GCM）。
