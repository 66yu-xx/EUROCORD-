# Phase 1 Scope

## Phase 1 Objective

Phase 1 的目标是建立朋友物料管理蓝图的网页版基础骨架，不是建设完整 ERP，也不是延续旧 MRP Lite 业务路线。

本阶段要建立：

- `Lufuta 物料管理系统 Lite` 的统一网页入口和清晰导航。
- 物料资料的基础数据对象与页面骨架。
- 产品 / BOM 的基础数据对象与页面骨架。
- 库存台账的数据对象与页面骨架。
- 待审核流水 / 审核池的概念、状态模型与页面骨架。
- 基础 Dashboard 风险入口，用于承载库存、待审核和资料完整性等摘要占位。

Phase 1 只建立业务结构、页面入口和架构边界，不实现完整业务闭环。所有实现必须保持 UI、service/business logic、storage/data access 分层，并为未来后台 API 和服务器数据库保留替换空间。

## Confirmed Blueprint Logic

根据 `BLUEPRINT_RELATIONSHIP_AUDIT.md`，以下蓝图逻辑已经确认：

- 主控按钮多数只是打开模板或调用二级入口，不直接执行完整业务。
- 真正的生成、查询、保存和导出逻辑主要位于各模板的 VBA 宏中。
- 单据保存时先写入待审核流水，并生成待审核状态的业务记录。
- 审核通过后才允许产生库存影响；保存单据本身不直接改变库存。
- 入库审核通过后增加库存，并更新移动加权平均成本。
- 领料审核通过后减少库存。
- 供应商退货审核通过后减少库存；这里不是生产余料退回仓库。
- 采购计划来源是已审核生产订单评审 + BOM + 库存 + 物料主表 + 默认供应商。
- 请购到采购计划、采购合同到入库没有形成已确认的自动闭环。
- 盘点、库存调整、借料 / 还料、IQC、库存查询等仍为空模板或占位功能，不能视为已确认业务能力。

Phase 1 采用这些已确认的业务语义，但不复制 Excel/VBA 的文件结构和按钮组织方式。

## Phase 1 In Scope

Phase 1 只允许包含以下范围：

- 将项目名称、系统标题和导航语义调整为 `Lufuta 物料管理系统 Lite`。
- 建立基础 Dashboard 骨架。
- 建立物料资料页面骨架。
- 建立产品 / BOM 页面骨架。
- 建立库存台账页面骨架。
- 建立待审核流水 / 审核池页面骨架。
- 建立入库、领料、供应商退货的单据入口占位，但不实现完整表单和过账流程。
- 预留物料、产品、BOM、库存台账、库存流水和审核状态的数据结构。
- 建立或整理 service / storage 分层接口，禁止页面直接绑定具体 storage。
- 当前可继续使用简化 storage 作为原型适配器。
- 保留未来迁移到后台 API + 服务器数据库的能力。

“页面骨架”仅包括导航入口、结构布局、必要列表/摘要占位和清晰的未实现状态，不代表业务功能已经完成。

## Phase 1 Out of Scope

Phase 1 不做：

- 完整采购计划生成。
- 采购合同。
- 请购自动转采购计划。
- 复杂审批权限。
- 多用户登录。
- 财务功能。
- PDF 归档。
- Excel 导入 / 导出。
- 盘点自动调整库存。
- 借料 / 还料。
- IQC。
- 复杂报表。
- 服务器部署。
- 后台 API。
- 数据库实现。

此外，本阶段不实现完整入库、领料、供应商退货表单，不执行真实审核过账，也不开发 MRP 计算。

## Key Data Concepts

以下字段仅为 Phase 1 数据对象草案，用于统一页面、service 和 storage 的接口语言，不代表最终数据库表结构。

### 1. Material

| 字段 | 含义 |
| --- | --- |
| `id` | 系统内部唯一标识 |
| `materialCode` | 物料编码，业务唯一 |
| `materialName` | 物料名称 |
| `model` | 型号 |
| `specification` | 规格 |
| `description` | 描述 |
| `unit` | 基本单位 |
| `categoryCode` | 物料大类编码 |
| `subCategoryCode` | 中/小分类编码草案 |
| `isPhysical` | 是否实物 |
| `isCoreMaterial` | 是否核心物料 |
| `defaultLocation` | 默认仓位/库位 |
| `minStock` | 最低库存 |
| `maxStock` | 最高库存 |
| `status` | 启用/停用状态 |
| `notes` | 备注 |
| `createdAt` / `updatedAt` | 创建和更新时间 |

### 2. Product

| 字段 | 含义 |
| --- | --- |
| `id` | 系统内部唯一标识 |
| `productCode` | 产品编码，可关联成品物料编码 |
| `productName` | 产品名称 |
| `model` | 产品型号 |
| `specification` | 产品规格 |
| `unit` | 产品单位 |
| `defaultBomVersion` | 默认 BOM 版本 |
| `status` | 启用/停用状态 |
| `notes` | 备注 |
| `createdAt` / `updatedAt` | 创建和更新时间 |

### 3. BOMItem

| 字段 | 含义 |
| --- | --- |
| `id` | BOM 行唯一标识 |
| `productId` | 父项产品标识 |
| `parentMaterialId` | 父项物料标识 |
| `componentMaterialId` | 子项物料标识 |
| `quantityPer` | 单位产品用量 |
| `lossRate` | 损耗率 |
| `unit` | 用量单位 |
| `version` | BOM 版本 |
| `effectiveDate` | 生效日期 |
| `expiryDate` | 失效日期，可为空 |
| `notes` | 备注 |

### 4. InventoryBalance

| 字段 | 含义 |
| --- | --- |
| `id` | 台账记录唯一标识 |
| `materialId` | 物料标识 |
| `warehouseId` | 仓库标识；Phase 1 可使用默认仓库 |
| `locationId` | 库位标识，可为空 |
| `quantityOnHand` | 当前库存数量 |
| `averageCost` | 加权平均成本草案 |
| `initialQuantity` | 初始库存数量，可选 |
| `initialDate` | 初始库存日期，可选 |
| `lastMovementAt` | 最后库存动作时间 |
| `updatedAt` | 台账更新时间 |

库存余额只能由受控业务逻辑维护；页面不得直接任意覆盖 `quantityOnHand`。

### 5. InventoryFlow

| 字段 | 含义 |
| --- | --- |
| `id` | 流水唯一标识 |
| `flowNo` | 业务流水号 |
| `documentType` | 入库、领料、供应商退货等类型 |
| `documentId` / `documentNo` | 来源单据引用 |
| `materialId` | 物料标识 |
| `direction` | `IN`、`OUT` 或 `NONE` |
| `quantity` | 流水数量 |
| `unitCost` | 单位成本，可为空 |
| `amount` | 金额，可为空 |
| `balanceAfter` | 过账后库存数量，可为空 |
| `flowStatus` | 待审核、已过账、已拒绝等状态草案 |
| `operatorName` | 操作人显示值草案 |
| `occurredAt` | 业务发生时间 |
| `notes` | 备注 |

### 6. PendingDocument / AuditItem

| 字段 | 含义 |
| --- | --- |
| `id` | 审核项唯一标识 |
| `documentType` | 单据类型 |
| `documentId` / `documentNo` | 单据引用和业务编号 |
| `applicantName` | 申请人显示值草案 |
| `submittedAt` | 提交时间 |
| `auditStatus` | 草稿、待审核、已审核、已拒绝 |
| `inventoryEffect` | `IN`、`OUT` 或 `NONE` |
| `lineCount` | 单据行数量，用于避免按物料行重复展示审核项 |
| `reviewerName` | 审核人显示值草案 |
| `reviewedAt` | 审核时间 |
| `rejectionReason` | 拒绝原因 |
| `riskFlags` | 库存不足、资料缺失等风险标记草案 |

Phase 1 只展示审核池概念和状态数据，不实现真实审批权限与库存过账。

## First Implementation Order

后续功能开发建议严格按以下顺序推进：

1. 清理导航和系统标题。
2. 建立数据对象草案。
3. 建立 storage / service 分层接口。
4. 建立物料资料页面骨架。
5. 建立产品 / BOM 页面骨架。
6. 建立库存台账页面骨架。
7. 建立待审核流水页面骨架。
8. 建立入库 / 领料 / 供应商退货入口占位。
9. 建立 Dashboard 风险摘要占位。

每一步完成后都应验证没有将 UI 深度绑定到 `LocalStorage`，也没有提前实现 Out of Scope 功能。

## Risks

- 同步物料名称按钮调用 `SyncMaterialNames`，源码过程名为 `SyncMaterialNamesToAllTables`，存在名称不匹配。
- 审核流程缺乏事务性，可能在库存更新失败前已经把流水标为已审核。
- 待审核列表按流水行生成，未按单据去重，多物料单据可能重复出现。
- 采购计划源码、实际样例文件和归档目录之间存在路径及文件名不一致。
- 请购、采购计划、采购合同、入库之间没有完整且已确认的自动闭环。
- 盘点、库存调整、借料 / 还料、IQC、库存查询及多个报表只是空模板或占位，不能当作已确认功能。
- 原蓝图以单个流水表承担单据行、库存流水、审核状态和合同状态等多种职责；网页数据模型必须拆分职责。
- Excel 文件写入方式不具备可靠的多用户并发和事务保证，未来数据库实现必须重新设计过账规则。

## Decision

Phase 1 采用朋友蓝图中的审核池 / 待审核流水思想，但不照搬 Excel/VBA 的多文件、多模板、多按钮结构。

网页版系统应当：

- 把模板入口转为统一网页入口下的网页表单或功能入口。
- 把物料、BOM、库存台账和库存流水转为未来服务器数据库中的结构化数据表。
- 把待审核、已审核、已拒绝等审核状态转为系统状态字段。
- 通过 service/business logic 保证“审核通过后才影响库存”的规则，并在未来 API + 数据库阶段使用事务实现原子过账。

Phase 1 当前只建立这些概念的前端骨架和分层接口；完整单据、审批、过账和数据库实现留待后续阶段确认。
