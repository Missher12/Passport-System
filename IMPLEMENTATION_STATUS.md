# IMPLEMENTATION_STATUS.md — v5.0 实施与边界状态清单

## 1. 功能实现状态总览

| 模块 / 整改项 | 状态 | 说明与代码位置 |
| :--- | :--- | :--- |
| 全局 Apple Liquid Glass 体系与 70%/90%/100% 统一 `PageContainer` | 已完成 | `src/index.css`, `src/components/layout/PageContainer.tsx` |
| `scrollbar-gutter: stable` 防左右抖动 + 保留原生可见滚动条 | 已完成 | `src/index.css`（已移除全局隐藏滚动条规则） |
| 圆零数字字体规范（无斜杠零、非等宽用户可见数字） | 已完成 | `src/index.css`（`--font-ui` + `"zero" 0` + `tabular-nums`） |
| 单层顶部导航优化（左：品牌+活动切换器含「全部活动」；中：7主入口；右：搜索/通知/账号） | 已完成 | `src/components/navigation/GlassHeader.tsx` |
| 统一 Portal Liquid Glass 下拉菜单（`GlassSelect`，含可搜索国际区号） | 已完成 | `src/components/glass/GlassPrimitives.tsx`（全站 0 原生 `<select>`） |
| 设置中心重做（iOS/macOS 分组首页 + 个人资料/密码/通用/核销/安全/账号/角色/部门/日志子页） | 已完成 | `src/features/admin/AdminManagePages.tsx`, `src/App.tsx` |
| 工作台重做（5 区块、KPI、5 进度条严格 0% 分母、5 待办、最近操作、支持 `ALL` 汇总） | 已完成 | `src/features/dashboard/DashboardPage.tsx` |
| 列表逐行逐字段敏感明文眼睛按钮（权限控制 + 单字段审计 + 离开/切换自动清空） | 已完成 | `SensitiveFieldCell` (`ExhibitorsPage.tsx`, `GiftsPage.tsx`) |
| 展商管理、证件管理、活动管理 `ALL` 只读保护与文案精简 | 已完成 | `ActivitiesPage.tsx`, `ExhibitorsPage.tsx`, `CertificatesPage.tsx` |
| 外部展商端去技术化文案 + URL/上下文自动路由模式与阶段 | 已完成 | `src/features/external/ExhibitorExternalPortal.tsx`, `AppContext.tsx` |
| 受邀赠票 5 项实名核验 + 严禁覆写/重激活已核销/冻结/作废/过期票据 | 已完成 | `mockAdapter.ts`, `productionAdapter.ts`, `GiftExternalPortal.tsx` |
| 电子赠票找回（5 项实名 + Smart CAPTCHA，只读返回原状态且不重复发票） | 已完成 | `GiftExternalPortal.tsx`, `tickets.retrieveByIdentity` |
| 赠票批次 7 类自定义字段配置器与外部端完整渲染校验 | 已完成 | `GiftsPage.tsx`, `GiftExternalPortal.tsx` |
| 现场核销真实摄像头扫码（`@zxing/browser`）+ 快速模式权限锁 + 证件/赠票区分 | 已完成 | `GlassScanner.tsx`, `RedemptionPage.tsx` |
| 单元测试覆盖（状态机 + 展商/证件/赠票/受邀核验/找回/ALL隔离/权限锁） | 已完成 | `src/utils/stateMachines.test.ts`, `src/services/adapters/mockAdapter.test.ts` |

## 2. Mock 演示与需真实后端接入边界

| 能力 | 当前状态 | 生产上线所需 |
| :--- | :--- | :--- |
| 数据持久化、多用户并发读写 | Mock 演示（浏览器内存） | 接入真实后端数据库（PostgreSQL/MySQL） |
| 商务密码哈希、频率限制、账号锁定 | Mock 演示 | 服务端 Argon2id/bcrypt + Redis 限流 |
| 30 秒动态二维码签名与吊销 | Mock 演示 | 服务端密钥签发短期 Token + Redis TTL |
| Smart CAPTCHA 人机验证 | Mock 演示（本地滑块挑战） | 接入 Turnstile / reCAPTCHA / 极验服务端验签 |
| 多端实时同步与并发核销原子锁 | Mock 演示（前端事件总线） | SSE/WebSocket 房间广播 + Redis/DB 乐观锁 |
| 自拍照片上传与私有加密存储 | Mock 演示（本地 DataURL/压缩） | 对象存储私有桶直传签名 + 敏感字段落库加密 |
| 真实服务端 API 适配层 | 需真实后端接入（前端适配已就绪） | 配置 `VITE_API_BASE_URL` 并部署对应 REST 接口 |
