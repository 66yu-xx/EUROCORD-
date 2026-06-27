# Phase 6 Demo Freeze

## 1. Freeze Point

- Branch: lufuta-material-system-lite
- Freeze commit: 1f928e4 focus homepage on delivery risk demo
- Tests: 47/47 pass
- Remote: ahead / behind 0 / 0
- Working tree: clean

这是 Phase 6 演示版冻结点，用于后续进入真实业务功能前的稳定基线。

## 2. Current Demo Mainline

首页：
客户订单来了，先看交期风险。

交期风险分析：
默认演示场景为 HE-110S 小型款 / 300 台 / 当前日期 + 15 天交付。

风险明细：
查看本单关键风险、库存可覆盖、周期待确认。

采购建议：
查看需采购确认和采购优先级。

仓库反馈提示：
查看需仓库确认和现场复核点。

DEMO_SCRIPT.md：
记录现场 3 分钟演示讲解方式。

## 3. Completed Phase 6 Items

- 默认演示订单已接入交期风险分析页面
- 用户仍可手动修改产品、数量、期望交期、分析日期
- 默认演示订单不代表真实订单保存
- 点击分析后无前端报错
- 仓库反馈 undefined 展示 bug 已修复
- 本单标注已完成
- 标签包括：本单关键风险、需采购确认、需仓库确认、库存可覆盖、周期待确认
- 首页已收敛为交期风险分析演示入口
- DEMO_SCRIPT.md 已新增，用于记录演示讲解脚本

## 4. Current Boundaries

当前版本仍然是演示版，只读为主。

明确：

- 不保存真实订单
- 不生成采购单
- 不修改库存
- 不做权限
- 不做财务金额
- 不做真实审批
- 不替代人工决策
- 不修改核心 MRP / 风险计算逻辑

## 5. Future Real-World Directions

以下是后续可能方向，但不属于当前冻结范围：

- 正式订单保存模块
- 库存流水
- 入库 / 领料 / 退货真实操作
- 采购申请 / 采购单
- 仓库盘点反馈
- 成本参考
- 财务 / 成本扩展
- 权限和审核

这些方向需要在后续阶段单独设计数据模型、操作流水、权限边界和测试，不应直接混入当前演示版。

## 6. Rollback Note

如果后续真实功能开发出现方向错误、功能混乱或演示链路被破坏，可以回到当前冻结点：

1f928e4 focus homepage on delivery risk demo

这是进入实战功能前的稳定演示基线。

## 7. Next Stage Principle

进入真实业务功能前，必须先明确：

- 是否需要真实数据模型
- 是否需要保存行为
- 是否需要库存流水
- 是否需要权限和审核
- 是否涉及金额和财务口径
- 是否影响现有 MRP / 风险计算逻辑
