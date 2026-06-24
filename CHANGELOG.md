# Changelog

## 2026-06-24 — V3 / Phase 2A Freeze

- V3 / Phase 2A-Step 13 已完成并提交，基线 commit 为 `e91e33c polish delivery risk analysis results`。
- 交期风险分析页面已形成只读闭环：产品选择 → 计划数量 → `requiredDate` → `asOfDate` → BOM 需求 → 库存缺口 → 采购周期 → 交期风险等级 → 分析摘要与说明。
- 已完成根据产品 BOM 计算计划需求、根据库存判断缺口、根据物料采购周期判断交期风险，以及风险等级、分析条件摘要和风险等级说明的展示。
- 原有表格字段和风险结果保持不变。
- 页面不保存正式订单、不生成采购单、不修改或过账库存、不连接 API / 数据库，也不做 Dashboard 汇总。
- Phase 2A 的功能、提交、远端同步和测试基线均已稳定；冻结测试基线为 40/40 通过。
- 本步骤只更新项目文档，不修改业务代码或测试，不进入 Phase 2B。

## 2026-06-23 — Phase 1E Page Structure Acceptance

- Phase 1D 页面业务边界说明已完成、提交并 push，基线 commit 为 `bff0f40 clarify phase 1 page business boundaries`。
- Phase 1E 进入页面结构验收与封版整理，核对导航、页面定位、历史页面函数和项目文档状态。
- 当前导航保持首页、物料资料、产品 / BOM、库存台账、待审核流水、入库、领料和供应商退货，不恢复旧业务路线。
- `productsPage`、`bomPage`、`ordersPage`、`analysisPage` 等历史 renderer 保留为后续范围评估参考，Phase 1E 不接入导航。
- 本阶段不开发新业务能力，不实现真实审核、库存过账、单据保存、采购计划、API 或数据库。
- 当前测试基线保持 17/17 通过。

## 2026-06-22 — Phase 1 Scope Definition

- 新增 `PHASE_1_SCOPE.md`，根据蓝图关系审计定义 Phase 1 的目标、范围和实施顺序。
- 明确 Phase 1 只建立统一入口、基础 Dashboard、物料、产品/BOM、库存台账、待审核流水及单据入口骨架。
- 建立 Material、Product、BOMItem、InventoryBalance、InventoryFlow、PendingDocument / AuditItem 数据对象草案。
- 明确完整采购计划、采购合同、复杂审批、Excel 导入导出、后台 API 和数据库等不属于 Phase 1。
- 将项目当前阶段更新为 `Phase 1 Scope Definition`。
- 本次仅修改项目文档，没有功能代码、UI 或系统页面改动。

## 2026-06-22 — Project Direction Initialization

- 从 `main` 创建新分支 `lufuta-material-system-lite`。
- 明确本项目方向独立于旧 ERP Lite / MRP Lite 业务路线。
- 将业务主线调整为朋友提供的 `Y-Lufuta_Material_Management_System.rar` 中的物料管理蓝图。
- 明确 Excel/VBA 系统只作为业务蓝图参考，不复制其多文件、多模板、多按钮结构。
- 项目名称确定为 `Lufuta Material Management System Lite`（Lufuta 物料管理系统 Lite）。
- 最终目标明确为部署在工厂内网服务器，各部门通过浏览器访问，数据集中保存在服务器数据库。
- 当前阶段只完成项目方向和文档初始化，没有功能代码改动。
- 本次未提交 commit，等待 Product Owner 确认。
