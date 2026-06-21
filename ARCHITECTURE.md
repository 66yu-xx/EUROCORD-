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

# Product Philosophy

- 系统首先服务老板决策，而非仓库管理。
- 订单驱动优先于库存驱动。
- 决策链：

```text
订单
→
交期
→
Lead Time
→
行动时机
```

- 库存是结果，不是起点。
- 库存既是风险也是机会。
- 库存分类：
  - 安全库存
  - MOQ 库存
  - 战略库存
  - 客户保留库存
- 当前阶段目标：帮助老板识别订单风险和时间风险。
- 长期目标：从订单驱动采购、生产、仓储等执行部门。

# V3 Decision Center

## 核心定位

已接订单保交付，未接订单帮谈判。

Protect confirmed orders. Support sales negotiation before orders are confirmed.

## 核心原则

每一个页面都必须回答一个决策，而不仅仅是展示数据。

Every screen must answer a decision, not just display data.

## 场景 A：Confirmed Orders / 已接订单

目的：Protect delivery / 保障交付。

需要回答：

- Can this confirmed order be delivered on time? / 该已接订单能否按时交付？
- What materials create risk? / 哪些物料形成风险？
- Is there still enough time to purchase? / 是否还有足够时间采购？
- What action is required today? / 今天必须采取什么行动？

## 场景 B：Sales Opportunities / 未接订单

目的：Support negotiation / 支持谈判。

需要回答：

- Can we accept this potential order? / 该潜在订单能否承接？
- What quantity can we confidently promise? / 可以有把握地承诺多少数量？
- What is the earliest realistic delivery date? / 最早可实现的交付日期是什么？
- Which materials limit the order? / 哪些物料限制订单承接？
- Should we negotiate delivery date, price, or quantity? / 应该协商交期、价格还是数量？

## 共享决策链

```text
Product
→ BOM
→ Demand Quantity
→ Inventory
→ Safety Stock
→ Shortage Quantity
→ Lead Time
→ Remaining Days
→ Risk Level
→ Action Suggestion
```

## 最小风险等级

- `OK`
- `Action Required`
- `High Risk`

## 最小数据增量

- `order.deliveryDate`
- `material.leadTimeDays`

## V3 范围边界

V3 将 Lead Time 作为决策输入，而不是独立的采购功能。以下能力属于后续阶段，不在 V3 实现范围内：

- Supplier
- MOQ
- Purchase Suggestions
- Alternate Materials
- Production Planning
