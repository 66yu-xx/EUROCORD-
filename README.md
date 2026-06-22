# Lufuta 物料管理系统 Lite

基于朋友提供的 `Y-Lufuta_Material_Management_System` 业务蓝图重新实现的轻量网页物料管理系统。

当前处于 Phase 1：先建立统一网页入口、物料资料、产品 / BOM、库存台账、待审核流水和日常单据入口骨架。现阶段仍是前端原型，最终目标是在工厂内网服务器部署，并通过后台 API 与服务器数据库集中保存数据。

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
- `src/data.js`：当前前端原型数据，后续将迁移为新的领域数据对象
- `src/storage.js`：当前简化存储适配器
- `src/mrp.js`：从旧 Demo 保留的后期候选计算能力，不再主导当前 UI
- `src/styles.css`：响应式页面样式
- `tests/`：现有计算与 storage 回归测试

## 当前边界

Phase 1A 只完成产品身份与导航骨架切换。采购计划、完整审核、库存过账、登录权限、Excel/PDF、后台 API 和数据库均未实现。
