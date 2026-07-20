# Phase 10 Prototype Scope

中文：Phase 10 最小角色访问原型实施边界

## 1. 文档状态

- 原规划步骤：`Phase 9-Step 3 - Define Phase 10 prototype surface`
- 启动基线：`80e00de define minimum role access boundaries`
- 当前性质：原型实施范围记录；实现已按此边界完成
- Phase 8：继续保持冻结
- Phase 10：已完成并冻结
- 已验证实现基线：`0626200 apply remaining trial role views`
- 冻结记录：`PHASE10_FREEZE.md`

## 2. 第一版核心验证页面

Phase 10 第一版只以“真实数据试算”作为核心验证页面。该页面已经具备数据来源选择、试算输入、运行试算、结果摘要、风险结果、缺料信息、采购周期、采购建议、仓库确认点和本地接单评估记录，足够验证 View、Edit、Action Permission 和 Sensitive Information Boundary。

第一版不扩展到所有页面。其他现有页面只作为未来补充或验证参考，不是 Phase 10 首批必做范围。

## 3. 五个角色的最小映射

| 角色 | 当前可见信息 | 当前允许动作 | 第一版限制 |
| --- | --- | --- | --- |
| Management | 试算结论、关键风险、角色关注点、必要评估摘要 | 主要只读查看 | 不默认拥有输入、运行、保存、清空、全部字段或全部修改权限 |
| Sales | 试算输入、结果和已有本地摘要 | 切换数据来源、编辑现有输入、运行试算、保存本地评估记录、查看本地摘要 | 清空全部本地测试记录不是普通销售权限；不确认接单或转正式订单 |
| Purchasing | 需求数量、缺料、采购周期、风险和采购建议 | 只读查看 | 不生成采购需求，不创建采购单，不新增正式供应商数据 |
| Warehouse | 库存数量、需求数量、缺料、库存状态和仓库确认点 | 只读查看 | 不修改、预留或扣减库存，不执行正式仓库业务动作 |
| Production / Workshop | 产品、试算数量、期望交期、试算 / 分析日期、需求和缺料 / 准备状态 | 只读查看 | 不新增正式生产计划、生产任务或正式生产日期字段 |

## 4. 敏感字段边界

第一版优先完全使用 Phase 8 现有数据和现有演示询单备注验证角色差异，不新增正式销售价格、成本、毛利、供应商资料、客户 CRM 数据、销售沟通数据或生产计划字段。

只有未来用户验收确实要求展示“管理层可以看到金额，而仓库不能看到金额”的强视觉对比时，才可另行考虑纯前端 `DEMO_ONLY` 展示常量。该常量必须同时满足：

- 不进入 `src/data.js`。
- 不进入 LocalStorage。
- 不参与计算。
- 不进入正式数据模型。
- 明确标记为演示用途。

Phase 10 第一版不需要实现该常量。

## 5. Demo Role Switcher 边界

Phase 10 第一版已采用 `Demo Role Switcher`，固定角色为 Management、Sales、Purchasing、Warehouse、Production / Workshop。

角色选择只保存在前端临时状态，刷新后恢复默认角色。不开发正式登录、账号、密码、用户数据库或后端权限同步，也不宣称这是正式安全权限系统。它只用于验证同一业务数据在不同角色下如何呈现和限制操作。

## 6. 最小技术边界

Phase 10 实际实现涉及：

- `src/app.js`
- `src/styles.css`
- `src/roleAccess.js`
- `tests/roleAccess.test.js`
- `tests/roleSwitcher.test.js`
- `tests/trialRoleAccessUi.test.js`

未经未来独立批准，不得修改：

- `src/data.js`
- `src/mrp.js`
- `src/planning/*`

Phase 10 不得改变任何 MRP 输入、MRP 输出、风险计算或采购建议计算结果。

## 7. 核心回归原则

相同业务输入在不同角色下，MRP 结果、风险结果、缺料结果和采购建议计算结果必须完全一致。

角色权限只允许改变：

- 看什么。
- 哪些区域显示。
- 哪些字段显示。
- 哪些现有动作允许执行。

角色权限不得进入、修改或分叉业务计算逻辑。Phase 10 已增加角色访问规则和 UI 边界测试，并保留 Phase 8 现有回归测试。

## 8. Phase 11 Pre-Bridge Validation

进入 Phase 11 前必须确认：

1. 角色边界是否合理。
2. 接单评估到正式订单的转换点是否清楚。
3. 正式订单最小数据结构是否明确。
4. Phase 8 原有试算路径是否继续保持独立和正常。
5. Phase 11 是否可以在不破坏 Phase 8 和 Phase 10 的情况下开始。

只有桥接验证通过并由 Product Owner 单独确认后，才可进入 `Phase 11 - Formal Order Minimum Loop`。

## 9. 当前结论

Phase 9-Step 3 定义的实施范围已经完成。Phase 10 角色访问最小原型已通过 Final Validation 并冻结，Phase 8 继续保持冻结。下一步是独立的 `Phase 11 Pre-Bridge Validation`；Phase 11 尚未开始，本文件不包含 Phase 11 实现设计。
