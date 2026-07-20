# Phase 10 Freeze

中文：Phase 10 角色访问最小原型冻结记录

## 1. 冻结状态

- 阶段：`Phase 10 - Role Access Minimum Prototype`
- 状态：已完成并冻结
- 分支：`lufuta-material-system-lite`
- 已验证实现基线：`0626200 apply remaining trial role views`
- 测试基线：`node --test tests/*.test.js`，81/81 pass
- 远端状态：0 ahead / 0 behind

Phase 10 验证的核心命题是：同一份业务结果可以面向不同角色呈现不同的信息视图和操作边界，同时不改变业务计算结果。

## 2. 完成记录

- Step 1：`10eb64e add role access policy foundation`
- Step 2：`59bb6f3 add demo role switcher state`
- Step 3A：`76bfb05 apply sales and management trial access`
- Step 3B：`0626200 apply remaining trial role views`

已完成五个固定 Demo 角色、前端 `Demo Role Switcher`、默认 Sales 角色和真实数据试算页面的角色视图接入。当前角色只保存在前端内存中，浏览器刷新后恢复默认 Sales；没有登录、账号、用户数据库或后端权限。

## 3. 五角色冻结边界

### Sales

- 可切换数据来源、编辑试算输入、运行试算。
- 可保存本地接单评估记录并查看已保存摘要。
- 不可清空全部本地测试评估记录。
- 不确认接单，不转正式订单，不执行库存、采购、生产或财务动作。

### Management

- 只读查看试算结论、关键风险、角色关注点、必要结果明细和必要评估摘要。
- 不编辑输入，不运行试算，不保存或清空评估记录。
- 更广的信息视图不等于拥有全部字段或全部修改权限。

### Purchasing

- 只读查看需求、缺料、采购周期、风险、采购建议、最晚下单、预计到料及当前策略允许的仓库确认点。
- 不查看客户询单、客户 PO、邮件附件或 Sales 来源说明。
- 不生成采购需求，不创建采购单，不执行采购动作。

### Warehouse

- 只读查看库存、需求、缺料、安全库存 / 库存状态、风险和仓库确认点。
- 不显示采购建议。
- 不修改、预留、锁定或扣减库存，不执行收货、发料或其他正式仓库动作。

### Production / Workshop

- 只读查看产品、数量、期望交期、分析日期、物料需求、缺料和准备相关风险。
- 不显示采购建议和仓库确认点。
- 不创建正式生产计划、工单或生产任务。

## 4. 架构与回归原则

- 角色策略集中在 `src/roleAccess.js`。
- UI 通过 `canRoleView` 和 `canRolePerform` 消费角色策略。
- Demo 角色状态只影响看什么、哪些区域或字段显示、哪些现有动作允许执行。
- 未知角色安全失败，不自动获得 Sales 或 Management 权限。
- 角色权限不进入、不修改、不分叉 MRP、风险、缺料或采购建议计算。
- 相同业务输入在不同角色下必须得到完全一致的 MRP、风险、缺料和采购建议计算结果。

## 5. Final Validation

Phase 10 Final Validation 已通过：

- 五个角色均按冻结边界工作。
- Sales → Management → Purchasing → Warehouse → Production / Workshop → Sales 连续切换后，输入、结果和本地评估摘要保持一致。
- 未发现角色间信息泄漏或权限绕过。
- 未发现 Phase 8 回归；系统数据和临时数据试算路径继续正常。
- Management、Purchasing、Warehouse、Production / Workshop 无当前试算结果时均显示清楚的只读提示，不自动切换角色、运行试算或伪造结果。
- 375px 和 390px 下无页面级横向溢出，五个角色选项完整可用。
- 浏览器控制台无错误。
- 自动测试：81/81 pass。
- 验证时 Git 工作区 clean，本地与远端为 0 ahead / 0 behind。

## 6. 明确非目标

Phase 10 没有实现，冻结后也不得被解释为已经具备：

- 正式登录、用户账号数据库或后端权限。
- 动态角色编辑器、复杂 RBAC、完整审批或完整审计系统。
- 正式订单。
- 正式供应商模块、采购需求、采购单或采购执行。
- 库存预留、锁定、扣减、收货、发料或其他库存执行。
- 正式生产计划、工单或生产任务。
- CRM 或正式客户 / 销售数据模块。
- 销售价格、采购价格、成本、毛利或财务功能。

## 7. 下一步

Phase 10 完成后，下一步不是直接开始 Phase 11，而是单独执行：

`Phase 11 Pre-Bridge Validation`

该验证只确认：

1. 当前角色边界是否足够支撑未来正式订单。
2. “试算 / 接单评估 → 正式订单”的转换点是否清楚。
3. 正式订单最小数据结构是否明确。
4. Phase 8 原有试算路径是否继续保持独立。
5. Phase 11 是否可以在不破坏 Phase 8 和 Phase 10 的情况下开始。

只有 Pre-Bridge Validation 通过，并由 Product Owner 单独确认 Phase 11 范围后，才可开始 `Phase 11 - Formal Order Minimum Loop`。本冻结文档不包含 Phase 11 实现设计。
