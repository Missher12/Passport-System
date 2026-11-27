# 萤火通行 · 企业级活动证件与赠票管理系统 (v5.0)

一套服务于内部运营/发证/赠票/现场核销团队以及外部展商与赠票领取者的多活动企业级管理系统。全站统一采用 **Apple Liquid Glass 视觉体系**、**单层悬浮顶部导航**与 **70% / 90% / 100% 响应式内容容器**。

## 核心架构与特性

- **统一页面容器与滚动稳定性**：所有页面共享 `PageContainer`（桌面端 `70%`、平板 `90%`、移动端 `100%`），配合 `scrollbar-gutter: stable` 彻底消除滚动条切换导致的页面抖动。
- **单层顶部导航**：左侧为品牌与活动切换器（支持直接选择「全部活动」只读汇总视图）；中间为 7 个一级主入口（`工作台 活动 展商 证件 赠票 核销 设置`），点击「设置」直接进入 iOS/macOS 分组设置首页；右侧为全局搜索、通知与账号菜单。
- **统一 Portal Liquid Glass 下拉与圆零数字规范**：全局替换原生 `<select>` 为 Portal 渲染的液态玻璃下拉菜单（支持自动翻转、键盘导航与国际区号搜索）；所有用户可见数字统一采用 `--font-ui` + `font-feature-settings: "zero" 0; font-variant-numeric: lining-nums tabular-nums;`。
- **精细化敏感字段保护**：证件号与手机号默认脱敏，列表采用逐行逐字段眼睛按钮（`SensitiveFieldCell`）按权限按需查看，单字段写审计日志，离开页面或切换活动/账号自动恢复脱敏。
- **完整业务闭环**：多活动隔离、展商 7 项验证与商务密码、现场加证一次性码、受邀赠票 5 项实名核验与防状态覆盖、电子赠票实名找回、7 类自定义字段配置器与渲染器、`@zxing/browser` 真实摄像头扫码核销（含快速模式权限锁）。
- **双适配器分层**：默认运行 `MockApiAdapter` 便于无后端演示与本地验证；同时提供与契约 100% 同步的 `ProductionApiAdapter`（通过环境变量 `VITE_API_BASE_URL` 对接真实后端）。

## 本地运行与测试

```bash
npm install
npm run dev      # 启动开发服务器（端口 3000）
npm run lint     # TypeScript 类型检查
npm run build    # 生产构建

# 运行状态机与业务规则单元测试
npx --yes tsx --test src/utils/stateMachines.test.ts src/services/adapters/mockAdapter.test.ts
```

## 相关文档

- `API_CONTRACT.md`：服务端接口契约（含 v5.0 新增接口）与后端接入清单
- `DATA_MODEL.md`：核心数据实体、自定义字段模型与业务状态机
- `IMPLEMENTATION_STATUS.md`：v5.0 功能完成度与 Mock / 真实后端边界清单
