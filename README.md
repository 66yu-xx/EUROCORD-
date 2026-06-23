# Lufuta 物料管理系统 Lite

基于朋友提供的 `Y-Lufuta_Material_Management_System` 业务蓝图重新实现的轻量网页物料管理系统。

当前处于 Phase 1E 页面结构验收与封版整理：统一网页入口、物料资料、产品 / BOM、库存台账、待审核流水和日常单据入口骨架已经建立，页面业务边界说明已完成。现阶段仍是使用浏览器存储的前端演示与验证层，最终目标是在工厂内网服务器部署，并通过后台 API 与服务器数据库集中保存数据。

## 继续项目前请先阅读

- [PROJECT_RULES.md](./PROJECT_RULES.md)
- [PROJECT_STATUS.md](./PROJECT_STATUS.md)
- [ROADMAP.md](./ROADMAP.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [BLUEPRINT_RELATIONSHIP_AUDIT.md](./BLUEPRINT_RELATIONSHIP_AUDIT.md)
- [PHASE_1_SCOPE.md](./PHASE_1_SCOPE.md)
- [CODEBASE_ADAPTATION_AUDIT.md](./CODEBASE_ADAPTATION_AUDIT.md)

## 启动

项目没有第三方运行依赖。在项目目录启动静态 HTTP Server：

```powershell
python -m http.server 8080
```

然后访问 <http://localhost:8080>。

运行逻辑测试：

```powershell
npm test
```

## 当前代码结构

- `src/app.js`：统一入口、Hash 导航和 Phase 1 页面骨架
- `src/domain/models.js`：Phase 1 领域对象工厂与状态常量
- `src/services/`：物料、产品/BOM、库存和审核池的 service 边界
- `src/data.js`：当前前端原型数据，后续将迁移为新的领域数据对象
- `src/storage.js`：当前简化存储适配器
- `src/storage/snapshotRepository.js`：兼容当前完整快照的 repository 过渡层
- `src/mrp.js`：从旧 Demo 保留的后期候选计算能力，不再主导当前 UI
- `src/styles.css`：响应式页面样式
- `tests/`：现有计算与 storage 回归测试

## 当前边界

Phase 1A—1D 已完成，Phase 1E 只进行页面结构验收、历史代码标注和文档收口，不开发新业务能力。当前测试基线为 17/17 通过，最新已提交基线为 `bff0f40 clarify phase 1 page business boundaries`。

当前导航包含首页、物料资料、产品 / BOM、库存台账、待审核流水、入库、领料和供应商退货。旧的独立产品、BOM、订单模拟和缺料分析 renderer 仍保留在代码中，但未接入 Phase 1 导航；是否恢复必须由后续 Lufuta 阶段范围决定。

采购计划、真实审核、库存过账、单据保存、登录权限、Excel/PDF、后台 API 和数据库均未实现，也不属于 Phase 1E。
