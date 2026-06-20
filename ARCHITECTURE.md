# Architecture

## 项目定位

MRP Lite 是一个用于验证物料需求计划底层逻辑的轻量 Demo。

它不是：

- ERP
- 通用库存系统

## 核心链路

```text
产品
↓
BOM
↓
库存
↓
订单
↓
物料需求计算
↓
缺料分析
```

## 核心模块职责

### `calculateMRP()`

领域职责是根据订单展开 BOM、跨产品汇总物料需求，并结合库存生成缺料分析结果。

当前代码实现函数名为 `calculateMaterialRequirements()`，位于 `src/mrp.js`。在正式重命名前，以当前代码函数名为实现事实。

### `getInventoryStatus()`

根据需求数量、当前库存和安全库存返回内部状态：

- `shortage`
- `low`
- `ok`

状态规则：

- `stockQty < demandQty` → `shortage`
- `stockQty >= demandQty` 且 `stockQty - demandQty < safetyStock` → `low`
- `stockQty - demandQty >= safetyStock` → `ok`

`shortageQty` 仅在状态为 `shortage` 时计算；非缺料状态固定为 `0`。

### LocalStorage

负责在当前浏览器中保存和恢复以下前端演示数据：

- 产品
- 物料
- BOM
- 库存
- 订单模拟

LocalStorage 不替代后端数据库，也不提供用户、权限或多公司隔离能力。

