# IMPLEMENTATION_STATUS.md — 阶段实施与验收状态

| 阶段 | 范围 | 状态 | 核心实现文件 |
| :--- | :--- | :--- | :--- |
| 第一阶段 | 项目架构、Apple Liquid Glass Design Tokens、圆零数字字体规范、统一单层顶部导航与活动切换器 | 已完成 | `src/index.css`, `src/components/glass/*`, `src/components/navigation/GlassHeader.tsx` |
| 第二阶段 | 多活动管理、12 项独立业务时间窗口配置、运营工作台 | 已完成 | `src/features/activities/ActivitiesPage.tsx`, `src/features/dashboard/DashboardPage.tsx` |
| 第三阶段 | 展商主档案预建、全局唯一商务密码、A/B 链接入口模式、7 项信息严格验证 | 已完成 | `src/features/exhibitors/ExhibitorsPage.tsx`, `src/features/external/ExhibitorExternalPortal.tsx` |
| 第四阶段 | 人员资料一次性登记、主联系人自动建档 01 号、Excel/CSV 批量导入预览与单行隔离、递增编号 | 已完成 | `src/utils/stateMachines.ts`, `src/services/adapters/mockAdapter.ts` |
| 第五阶段 | 头像开放期自动切换、摄像头/相册上传自拍、手机名片式电子证件与 30 秒动态流光二维码 | 已完成 | `src/components/qr/GlassQRCode.tsx`, `src/components/glass/GlassOverlay.tsx` |
| 第六阶段 | 自定义证件类别、个人扫码领证、展位按人批量领证与统计、现场超额加证一次性二维码 | 已完成 | `src/features/certificates/CertificatesPage.tsx` |
| 第七阶段 | 独立赠票库、自助领票批次、跨批次同身份原子排重、可选日期限制、后台直发与批量导入 | 已完成 | `src/features/gifts/GiftsPage.tsx`, `src/features/external/GiftExternalPortal.tsx` |
| 第八阶段 | 30 秒动态令牌、统一扫码工作台（普通模式/快速模式）、多设备并发防重、断网保护 | 已完成 | `src/features/redemption/RedemptionPage.tsx` |
| 第九阶段 | 五类预设角色与自定义权限、用户/部门管理、Smart CAPTCHA 适配器、全量只读审计日志、系统设置 | 已完成 | `src/features/admin/AdminManagePages.tsx`, `src/features/auth/LoginPage.tsx` |
| 第十阶段 | 单元测试（13 项核心业务规则）、TypeScript 编译检查与真实浏览器桌面/移动响应式验收 | 已完成 | `src/utils/stateMachines.test.ts`, `src/services/adapters/mockAdapter.test.ts` |

## 演示模式边界说明

当前默认启用 `MockApiAdapter` 以便无后端依赖完整演示和验收全部业务流程；所有动态二维码令牌、Smart CAPTCHA 校验、实时同步事件与核销确认均已显式标明为演示模式。通过「管理 → 系统设置」或 `VITE_API_BASE_URL` 即可切换至 `ProductionApiAdapter` 对接真实服务端。
