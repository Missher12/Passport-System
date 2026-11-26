# 萤火通行 · 企业级活动证件与赠票管理系统

一套服务于内部运营/发证/赠票/现场核销团队以及外部展商与赠票领取者的多活动企业级管理系统，全站统一采用 **Apple Liquid Glass 视觉语言**、**单层悬浮顶部导航**（内嵌活动切换器）与 **Fluid Responsive Layout**。

## 核心架构特点

- **单层顶部导航**：无传统左侧固定导航、无双层固定导航；左侧为品牌与当前活动切换器，中间为 7 个一级主入口（工作台、活动、展商、证件、赠票、核销、管理浮动菜单），右侧为全局搜索、通知中心与账户/角色入口。
- **双适配器分层**：`src/services/api/contracts.ts` 彻底解耦 UI 与数据层；当前阶段默认运行 `MockApiAdapter`（明确标记演示状态），同时内置完整 `ProductionApiAdapter` (`src/services/adapters/productionAdapter.ts`) 供后续直接接入真实后端。
- **字体与圆零数字规范**：全局统一系统无衬线字体 `--font-ui` 与 `font-feature-settings: "zero" 0; font-variant-numeric: lining-nums tabular-nums;`，杜绝用户可见数字出现带斜线零。
- **业务完整性**：覆盖多活动隔离、12 项独立时间窗口、展商 7 项验证与唯一商务密码、A/B 链接模式、人员批量导入与递增编号、头像补拍自动切换阶段、个人/展位按人批量领证、一次性现场加证码、独立赠票库跨批次排重、手机名片式 30 秒动态流光电子凭证、普通/快速双模式扫码核销、Smart CAPTCHA、RBAC 权限与不可删除审计日志。

## 本地运行与测试

```bash
npm install
npm run dev      # 启动开发服务器（端口 3000）
npm run lint     # TypeScript 类型检查
npm run build    # 生产构建

# 运行核心状态机与业务规则单元测试
npx --yes tsx --test src/utils/stateMachines.test.ts src/services/adapters/mockAdapter.test.ts
```

## 相关文档

- `API_CONTRACT.md`：14 大服务端接口契约与后端待接入功能清单
- `DATA_MODEL.md`：核心实体模型与证件/赠票状态机
- `IMPLEMENTATION_STATUS.md`：十阶段研发进度与验收记录
