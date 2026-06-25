# Lufuta 物料管理系统 Lite

基于朋友提供的 `Y-Lufuta_Material_Management_System` 业务蓝图重新实现的轻量网页物料管理系统。

当前处于 V3 / Phase 3-Step 1 信息结构设计：Phase 2C 已冻结在下单前交期风险与采购建议只读分析页面，Phase 3 候选方向为仓库视角只读页面“库存预警与仓库反馈”。现阶段仍是使用浏览器存储的前端演示与验证层，最终目标是在工厂内网服务器部署，并通过后台 API 与服务器数据库集中保存数据。

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

Phase 2A 已完成交期风险分析只读闭环，Phase 2B 已完成采购建议视图只读闭环，Phase 2C 已完成订单决策摘要、交期可行性说明、采购优先级分组和页面定位收口。当前稳定基线为 `c76f402 freeze phase 2c analysis documentation baseline`，当前测试基线为 47/47 通过。

当前分析页面面向老板、计划、采购：分析条件摘要说明订单条件，订单决策摘要帮助老板判断风险和动作，交期可行性说明帮助计划理解交期判断，采购优先级分组帮助采购区分立即确认、建议关注和暂不采购，风险结果 / 采购建议表格作为详细数据依据。

当前阶段开始 Phase 3-Step 1 信息结构设计，但只记录页面区块和边界，不开始页面实现。候选页面区块包括仓库库存概览、库存预警列表、仓库复查建议、对计划 / 采购的反馈提示；页面仍为只读，不保存仓库操作结果，不改变库存数据。
