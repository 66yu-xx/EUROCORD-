# Changelog

## V1 — Core Logic

建立产品、物料、BOM、库存和订单模拟数据模型，完成 BOM 展开、通用件汇总与缺料分析核心逻辑。

## P1 — Inventory Render Bug Fix

修复库存管理页将表格行提前拼接为字符串、导致页面无法渲染的问题，并增加 MRP 边界测试。

## V1.1 — LocalStorage

增加浏览器本地持久化与 Demo 数据重置能力，刷新后保留产品、物料、BOM、库存和订单数据。

## V2 — Safety Stock Validation

验证安全库存正式参与缺料、库存低和充足状态判断，并覆盖关键边界条件。

## V2.1 — Inventory Status Engine

提取 `getInventoryStatus()`，统一返回 `shortage`、`low` 和 `ok` 内部状态。

## V2.2 — Inventory Warning Display

统一 Dashboard、导航和缺料分析对 MRP 状态结果的复用，并优化库存预警信息展示。

## V2.3 — Documentation Baseline

建立项目规则、状态、路线图、架构和变更记录五份项目基线文档。

## V2.3.1 — Product Philosophy Baseline

引入订单驱动、Lead Time、老板决策模型、战略库存与客户保留库存理念。
