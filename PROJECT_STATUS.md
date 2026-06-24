# Project Status

## 当前状态

- 项目：`Lufuta Material Management System Lite`
- 当前阶段：V3 / Phase 2B-Step 6 — 文档更新与阶段冻结
- 当前分支：`lufuta-material-system-lite`
- Phase 2B 最新已提交基线：`3555dbf clarify read-only procurement recommendation boundaries`
- 当前测试基线：47/47 通过
- 远端同步状态：0 ahead / 0 behind
- 当前目标：记录并冻结 Phase 2B 已完成的只读采购建议能力，不新增业务功能。

## Phase 2A 已完成能力（已冻结）

交期风险分析页面已形成完整的只读分析闭环：

```text
产品选择
    → 计划数量
    → requiredDate
    → asOfDate
    → BOM 需求
    → 库存缺口
    → 采购周期
    → 交期风险等级
    → 分析摘要与说明
```

- 根据产品 BOM 计算计划需求。
- 根据库存判断物料缺口。
- 根据物料采购周期判断交期风险。
- 展示交期风险等级。
- 展示分析条件摘要和风险等级说明。
- 保持原有表格字段和风险结果不变。

## Phase 2B 已完成能力

Phase 2B 已形成只读采购建议闭环：

```text
交期风险分析
    → 物料风险判断
    → 采购建议生成
    → 采购建议展示
    → 明确只读边界
```

- 完成采购建议规则与数据结构审查。
- 新增只读采购建议纯计算规则。
- 将 `recommendation` 接入 `deliveryRiskPreview.rows` 运行期结果。
- 在交期风险分析结果下方展示“采购建议视图（只读）”。
- 建议基于当前计划数量、BOM、库存、安全库存和采购周期自动生成。
- 展示建议动作、建议采购数量、原因、优先级、采购周期和风险等级。

## 当前业务边界

交期风险分析与采购建议页面仅用于只读判断参考：

- 不保存正式订单。
- 不生成采购单。
- 不保存采购建议。
- 不修改或占用库存，也不进入库存过账。
- 不连接 API 或数据库。
- 不做 Dashboard 汇总。
- 不恢复旧 `ordersPage` / `analysisPage` 业务路线。
- 不实现登录、权限或多公司能力。
- 实际采购仍需人工确认。

## Phase 2A 冻结点

- V3 / Phase 2A-Step 13 已完成并提交：`e91e33c polish delivery risk analysis results`。
- 功能范围稳定：只读分析闭环已完成，业务边界明确。
- 提交状态稳定：Step 13 已提交，工作树在 Step 14 开始前保持干净。
- 远端状态稳定：本地与 `origin/lufuta-material-system-lite` 同步，0 ahead / 0 behind。
- 测试基线稳定：40/40 通过。

## Phase 2B 冻结点

- V3 / Phase 2B-Step 5 已完成并提交：`3555dbf clarify read-only procurement recommendation boundaries`。
- 功能范围稳定：只读采购建议的计算、运行期接入、展示和边界说明均已完成。
- 数据边界稳定：建议只存在于页面运行期，不保存订单或建议，不生成采购单，不修改或占用库存。
- 远端状态稳定：本地与 `origin/lufuta-material-system-lite` 同步，0 ahead / 0 behind。
- 测试基线稳定：47/47 通过。

## 下一步

Phase 2B 在 Step 6 完成文档更新后冻结。未经 Product Owner 明确确认，不进入 Phase 2C 或下一阶段，也不扩展采购执行、正式订单、采购建议保存、库存占用或过账、API、数据库或 Dashboard 能力。
