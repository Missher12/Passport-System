# API_CONTRACT.md — 活动证件与赠票管理系统服务端契约

本文档定义 `ProductionApiAdapter` (`src/services/adapters/productionAdapter.ts`) 对接真实后端（如 Codex 后续实现的 Node/Go/Java 服务端）所需的全部 RESTful 与 SSE 接口规范。

## 1. 通用约定

- **Base URL**：由 `VITE_API_BASE_URL` 注入，默认 `/api/v1`。
- **认证方式**：内部管理端使用 HttpOnly Cookie 或 `Authorization: Bearer <token>`；外部展商端通过 7 项档案核验签发短期展商会话令牌。
- **活动数据隔离**：所有业务路径显式携带 `:activityId` 或在服务端从令牌解析活动上下文，严禁跨活动读写。
- **安全边界**：前端不存储数据库密钥、商务密码明文哈希盐或二维码签名私钥；所有动态令牌、Smart CAPTCHA 校验、重复身份判重及并发核销锁均由服务端权威执行。

## 2. 核心接口清单（14 大服务）

| 服务 | 方法与路径 | 说明 |
| :--- | :--- | :--- |
| **AuthService** | `POST /auth/login`、`GET /auth/session`、`POST /auth/logout` | 内部员工登录与会话校验，支持 Smart CAPTCHA 令牌 |
| **ActivityService** | `GET /activities`、`POST /activities`、`PATCH /activities/:id`、`PATCH /activities/:id/status` | 活动全生命周期与 12 项独立业务时间窗口管理 |
| **ExhibitorService** | `GET /activities/:activityId/exhibitors`、`POST /activities/:activityId/exhibitors`、`PATCH .../quota`、`POST .../reset-password`、`POST /public/exhibitor/verify` | 预建展商（服务端生成全局唯一商务密码并安全哈希存储）、A/B 链接模式覆盖、7 项信息统一提示校验 |
| **MemberService** | `GET /activities/:activityId/members`、`POST .../members`、`POST .../members/batch-import`、`POST .../members/:id/avatar`、`PATCH .../status` | 人员登记（自动递增 `A01-01` 且作废号不复用）、名额硬限制、有效行独立导入、头像上传触发电子凭证生成 |
| **CertificateService** | `GET/POST/PATCH .../certificate-categories`、`POST .../claim`、`POST .../claim-batch`、`POST .../onsite-extra-tokens`、`POST /public/onsite-extra/:token` | 自定义证件类别、个人/展位按人批量领证、现场超额加证一次性二维码签发与单次核销失效 |
| **GiftService** | `GET/POST/PATCH /activities/:activityId/gift-batches` | 独立赠票库自助领票批次、配额与可选日期列表管理 |
| **TicketService** | `GET .../gift-tickets`、`POST /public/gift-tickets/self-claim`、`POST .../direct`、`POST .../batch-import`、`POST /public/gift-tickets/invited/:token`、`PATCH .../status` | 跨批次原子性身份排重、后台直接录入与重复授权增发、批量导入生成专属补全链接、一票一码 |
| **QRService** | `POST /qr/issue` | 服务端签发 30 秒短期 HMAC/JWT 动态令牌（不含身份证号），签发新令牌同时使旧令牌失效 |
| **RedemptionService** | `POST /redemption/preview`、`POST /redemption/confirm`、`GET .../redemption-records` | 统一扫码核验（证件与赠票状态独立）、普通/快速双模式、分布式原子锁防并发重复核销 |
| **UserService** | `GET/POST/PATCH /admin/users`、`PATCH /admin/users/:id/redemption-mode` | 内部员工账号维护及单账号核销模式独立配置 |
| **PermissionService** | `GET/POST/PATCH /admin/roles`、`GET/POST/PATCH /admin/departments` | 五类预设角色及自定义模块权限、敏感明文/重复增发授权 |
| **CaptchaService** | `POST /captcha/assess`、`POST /captcha/verify` | 可替换 Captcha Provider Adapter（Turnstile / reCAPTCHA / 极验）服务端风险评估与核验 |
| **FileService** | `POST /files/upload` | 头像与封面对象存储直传签名及安全压缩 |
| **AuditLogService** | `GET /admin/audit-logs`、`POST .../sensitive-view`、`POST .../data-export` | 全量关键操作只写审计日志，禁止前端/普通用户删除 |
| **RealtimeService** | `GET /realtime/stream` (SSE / WebSocket) | 推送名额变更、人员登记、头像完成、领证、赠票及现场核销实时事件 |

## 3. 后端待接入功能清单（Codex 移交清单）

以下能力在当前 Mock Adapter 中以**明确标记的演示模式**实现，接入生产后端时需替换为服务端权威逻辑：

1. **商务密码哈希与唯一索引**：PostgreSQL/MySQL 全局唯一约束 + Argon2id/bcrypt 哈希存储，错误尝试频次限流（Redis）。
2. **动态二维码 30 秒服务端签名**：服务端以密钥签发短时 Token 并写入 Redis TTL=30s，刷新时吊销旧 Token，严禁编码敏感证件号。
3. **跨批次自助赠票原子排重**：数据库 `(activity_id, identity_hash)` 唯一索引 + 事务锁，确保高并发下同身份仅能自助领取一次。
4. **多设备并发扫码原子核销锁**：Redis 分布式锁或数据库 `UPDATE ... WHERE status = 'valid'` 乐观锁，确保同一凭证多端并发扫码仅一次成功。
5. **Smart CAPTCHA Provider 接入**：将 `CaptchaService` 接入真实风控服务，并结合 IP/设备会话对现场快速连扫做低摩擦白名单放行。
6. **对象存储与敏感数据加密**：自拍照私有桶签名访问，证件号与手机号落库加密（AES-256-GCM），明文查看强制写审计日志。
7. **SSE / WebSocket 实时事件广播**：按 `activityId` 房间推送变更事件，断线重连后前端自动全量拉取最新快照。
