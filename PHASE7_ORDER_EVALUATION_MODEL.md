# Phase 7：订单评估记录数据模型草案

## 1. 模型定位

当前模型用于“订单评估记录”，不是正式销售订单模型。

订单评估记录用于保存一次交期风险分析的输入条件、分析摘要和分析快照，方便后续回看和复盘。

它不代表：

- 正式销售订单
- 客户合同
- 已确认订单
- 生产订单
- 采购申请
- 财务单据
- 库存占用单

核心原则：
保存分析记录，但不触发真实业务联动。

## 2. 当前启用模型草案

建议结构：

```js
{
  id: "EV-2026-0001",
  recordType: "orderEvaluation",
  status: "analyzed",

  input: {
    productId: "HE-110S",
    plannedQty: 300,
    requiredDate: "2026-07-12",
    asOfDate: "2026-06-27",
    note: "客户询问 300 台 15 天交付"
  },

  summary: {
    riskLevel: "critical",
    keyRiskMaterialCount: 3,
    procurementConfirmCount: 2,
    warehouseConfirmCount: 1,
    canMeetRequiredDate: false
  },

  analysisSnapshot: {
    generatedAt: "2026-06-27T10:30:00",
    source: "delivery-risk-analysis",
    materialRisks: [],
    procurementRecommendations: [],
    warehouseFeedbackHints: []
  },

  businessBoundary: {
    isOfficialSalesOrder: false,
    affectsInventory: false,
    reservesInventory: false,
    createsPurchaseOrder: false,
    entersFinance: false,
    hasCostAccounting: false
  },

  futureLinks: {
    salesOrderId: null,
    purchaseRequestIds: [],
    inventoryTransactionIds: [],
    costSnapshotId: null,
    financeReferenceId: null
  },

  createdAt: "2026-06-27T10:30:00",
  updatedAt: "2026-06-27T10:30:00"
}
```

说明：
以上结构是 Phase 7 后续实现的模型草案。本步骤只记录设计，不新增代码、不新增数据模型文件、不写入 localStorage。

## 3. 当前启用字段说明

### 顶层字段

- `id`：评估记录编号，用于列表和详情回看。
- `recordType`：记录类型，固定为 `orderEvaluation`，避免与正式订单混淆。
- `status`：评估记录状态，初期建议只使用 `analyzed`，表示已完成一次分析。
- `createdAt`：评估记录创建时间。
- `updatedAt`：评估记录最后更新时间。

### input

`input` 保存本次评估的输入条件：

- `productId`：选择的产品。
- `plannedQty`：计划数量。
- `requiredDate`：期望交期。
- `asOfDate`：分析日期。
- `note`：人工备注，用于记录客户询问背景或现场说明。

这些字段来自交期风险分析页面的输入条件。

### summary

`summary` 保存本次分析的摘要结果：

- `riskLevel`：整体风险等级。
- `keyRiskMaterialCount`：本单关键风险物料数量。
- `procurementConfirmCount`：需采购确认数量。
- `warehouseConfirmCount`：需仓库确认数量。
- `canMeetRequiredDate`：是否可以满足期望交期的只读判断。

这些字段用于列表页快速阅读，不替代详细分析快照。

### analysisSnapshot

`analysisSnapshot` 保存本次分析生成时的结果快照：

- `generatedAt`：快照生成时间。
- `source`：来源页面或来源流程，初期固定为 `delivery-risk-analysis`。
- `materialRisks`：物料风险明细快照。
- `procurementRecommendations`：采购建议快照。
- `warehouseFeedbackHints`：仓库反馈提示快照。

快照用于回看当时的分析结果。后续账面库存、BOM 或采购周期变化，不应自动改写历史快照。

## 4. 业务边界字段

`businessBoundary` 用来明确这条记录不会触发真实业务动作。

初期建议固定为：

- `isOfficialSalesOrder: false`
- `affectsInventory: false`
- `reservesInventory: false`
- `createsPurchaseOrder: false`
- `entersFinance: false`
- `hasCostAccounting: false`

这些字段的目的不是提供用户操作，而是防止后续开发误把评估记录当成正式订单、库存单据、采购单或财务单据。

## 5. 未来扩展连接点

`futureLinks` 用于预留未来真实业务链路的连接点。

初期建议保留但全部为空：

- `salesOrderId: null`
- `purchaseRequestIds: []`
- `inventoryTransactionIds: []`
- `costSnapshotId: null`
- `financeReferenceId: null`

说明：
这些字段只是未来连接点，不代表当前版本已经支持正式订单、采购申请、库存流水、成本快照或财务引用。

后续如果进入真实业务功能，必须先单独设计对应模块的数据模型、状态流转、权限边界和测试。

## 6. 当前禁止误用的正式订单字段

订单评估记录当前不应包含以下正式订单字段：

- `salesOrderNo`
- `customerId`
- `customerContractNo`
- `orderConfirmedAt`
- `deliveryCommitment`
- `productionOrderId`
- `shipmentPlanId`
- `orderStatus`
- `approvalStatus`
- `signedBy`
- `confirmedBy`

原因：
这些字段会让评估记录看起来像正式销售订单，容易误导用户以为系统已经接单、确认合同或进入生产履约流程。

## 7. 当前禁止误用的库存 / 采购字段

订单评估记录当前不应包含以下库存或采购执行字段：

- `reservedInventoryQty`
- `lockedInventoryQty`
- `inventoryTransactionId`
- `stockMovementId`
- `purchaseOrderId`
- `purchaseRequestId`
- `supplierId`
- `supplierQuotationId`
- `expectedPurchaseAmount`
- `purchaseApprovalStatus`

原因：
当前评估记录不占用库存、不锁定库存、不修改库存、不生成采购申请、不生成采购单，也不确认供应商或采购金额。

## 8. 当前禁止误用的成本 / 财务字段

订单评估记录当前不应包含以下成本或财务字段：

- `unitCost`
- `totalCost`
- `estimatedRevenue`
- `grossMargin`
- `payableAmount`
- `invoiceId`
- `paymentStatus`
- `financeStatus`
- `costAccountingStatus`
- `ledgerEntryId`

原因：
Phase 7 初期不做正式财务核算、不做财务金额、不做应付账款、不做发票、不做付款、不做成本结转、不做财务报表。

任何涉及金额、成本和财务口径的功能，后续必须单独设计。

## 9. 快照原则

订单评估记录保存的是“当时那次分析”的快照。

后续如果物料资料、BOM、库存、安全库存、采购周期或仓库反馈发生变化，历史评估记录不应被自动改写。

如果用户需要基于最新数据重新判断，应创建新的评估记录或通过“重新分析”生成新的分析结果。

这样可以保留历史判断依据，方便复盘当时为什么认为某张订单场景存在风险。

## 10. 当前边界

当前阶段仍然保持：

- 不保存正式订单
- 不生成采购单
- 不修改库存
- 不做权限
- 不做财务金额
- 不触发审批
- 不替代人工决策
- 不修改核心 MRP / 风险计算逻辑

本文件只是 Phase 7 数据模型草案，不代表当前已经实现保存功能。
