# Changelog

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
