# Codebase Adaptation Audit

## 1. Current Codebase Overview

### 1.1 审计结论摘要

当前代码是一个无框架、无构建步骤的前端 MRP Demo。它可以作为轻量网页系统的技术地基，但其产品名称、导航、数据结构、Dashboard、核心计算和测试都围绕旧的“订单 → BOM → 缺料分析”路线设计，不能直接作为 `Lufuta 物料管理系统 Lite` 的业务骨架。

当前实际数据流：

```text
src/data.js 初始演示数据
→ src/storage.js 从 LocalStorage 加载完整数据快照
→ src/app.js 持有并直接修改全局 data
→ 每次 render() 调用 src/mrp.js 计算订单/BOM/缺料
→ 页面表单直接修改 products/materials/bom/inventory/orders
→ src/app.js 调用 saveData() 保存整个快照
```

目标数据流应逐步调整为：

```text
UI 页面
→ service / business logic
→ storage adapter
→ 当前简化存储 / 未来后台 API
```

### 1.2 当前文件结构

| 文件/目录 | 当前职责 | 初步适配判断 |
| --- | --- | --- |
| `index.html` | 静态入口，加载 CSS 和 `src/app.js` | 入口方式可复用；标题、描述需重命名 |
| `package.json` | 启动与 Node 测试脚本 | 脚本可复用；包名仍为 `mrp-lite-v1` |
| `README.md` | 旧 MRP Demo 说明 | 必须重写，当前描述会误导后续开发 |
| `src/app.js` | 页面、导航、渲染、表单、状态、持久化 | UI 技术模式可复用；业务耦合需拆分和替换 |
| `src/data.js` | 产品、物料、BOM、库存、订单演示数据 | 仅可参考 ID 关联形式；字段和样例业务需替换 |
| `src/mrp.js` | 订单驱动 BOM 需求与缺料计算 | 纯函数可保留为后期候选能力；必须退出系统中心 |
| `src/storage.js` | LocalStorage 完整快照读写 | 适配器模式可复用；key、schema、接口边界需替换 |
| `src/styles.css` | 完整响应式 UI 样式 | 大部分视觉技术地基可复用 |
| `tests/mrp.test.js` | MRP、缺料和库存状态测试 | 技术测试模式可复用；业务优先级不属于 Phase 1 |
| `tests/storage.test.js` | storage 注入、回退和重置测试 | 内存 storage 测试模式值得复用；旧五类数据 schema 需替换 |

### 1.3 入口与运行方式

- 页面入口：`index.html`。
- JavaScript 入口：`src/app.js`。
- 样式入口：`src/styles.css`。
- 路由方式：URL hash + `currentPage` + `renderers` 映射。
- 运行方式：静态 HTTP Server，无运行时第三方依赖。
- 测试方式：Node 内置 `node:test`。

这种轻量静态结构适合 Phase 1 原型，但随着页面、service 和数据对象增加，不能继续让所有职责集中在 `app.js`。

## 2. Reusable Technical Foundation

### 2.1 可直接保留或小幅适配

| 技术能力 | 来源 | 复用建议 |
| --- | --- | --- |
| 单一网页入口 | `index.html` | 保留统一入口，符合蓝图转网页目标 |
| 原生 ES Modules | 全项目 | 保留，Phase 1 暂无必要引入大型框架或构建系统 |
| Hash 导航机制 | `app.js` | 保留技术方式，替换路由名称和页面集合 |
| 页面壳与侧边栏 | `appShell()` + CSS | 保留布局能力，重命名品牌和业务导航 |
| 表格基础组件 | `tablePage()` | 可用于物料、BOM、库存台账和审核池列表 |
| Modal / Toast | `showModal()`、`toast()` | 可作为原型交互基础，但需避免业务逻辑直接写在回调中 |
| 响应式样式 | `styles.css` | 侧栏、表格、卡片、弹窗和移动端规则可复用 |
| 纯函数组织方式 | `mrp.js` | 纯业务函数与 UI 分离的方式值得保留 |
| 可注入 storage 参数 | `loadData()` / `saveData()` | 有利于测试和未来替换，适配后可继续使用 |
| 无效存储回退 | `storage.js` | 错误回退理念可复用，但需要显式 schema/version 策略 |
| Node 内置测试 | `tests/*.test.js` | 轻量、无依赖，适合继续建立 domain/service 测试 |
| 内存 storage 测试替身 | `createMemoryStorage()` | 可扩展为新 repository/storage 接口测试 |

### 2.2 可复用但必须降级为后期能力

`src/mrp.js` 的需求汇总与库存状态判断是纯函数，代码质量和边界测试都较清晰，但它属于后期采购计划/风险分析能力，不属于 Phase 1 业务中心。

建议：

- Phase 1 从默认 Dashboard、默认 render 流程和主导航中解除对 MRP 计算的依赖。
- 暂不删除 `mrp.js` 及其测试，先隔离为 legacy/optional capability。
- 到 Phase 3 再依据朋友蓝图的“已审核生产订单评审 + BOM + 库存 + 默认供应商”重新命名和扩展。
- `getInventoryStatus()` 可在未来改造成通用库存风险规则，但不能继续以模拟订单结果代表整个系统风险。

## 3. Business Logic to Rename or Replace

### 3.1 必须重命名的产品身份

| 当前名称 | 所在位置 | 目标方向 |
| --- | --- | --- |
| `mrp-lite-v1` | `package.json` | 中性 Lufuta 物料系统包名 |
| `MRP LITE V1` | `index.html`、`app.js`、`README.md` | `Lufuta 物料管理系统 Lite` |
| `物料需求计划` | 侧栏品牌 | 物料管理系统定位 |
| `mrp-lite-v1-data` | `storage.js` | 新系统独立 storage key 和 schema version |
| “订单模拟”“缺料分析” | 主导航 | 移出 Phase 1 主导航；后期作为采购/风险能力评估 |

### 3.2 必须替换或隔离的业务中心

当前 `render()` 每次都运行 `calculateMaterialRequirements(data)`，Dashboard、侧栏徽标和多个页面都消费 MRP 结果。这意味着 MRP 在代码层仍是系统中心，与项目规则冲突。

Phase 1 应把系统中心改为：

```text
物料资料
→ 产品 / BOM
→ 库存台账
→ 待审核流水 / 审核池
→ Dashboard 风险摘要
```

必须调整：

- Dashboard 不再以模拟订单和缺料分析为主叙事。
- `ordersPage()` 和 `analysisPage()` 不作为 Phase 1 主入口。
- `data.orders` 不应继续成为基础数据 schema 的必需字段。
- `getSummary()` 的核心指标需改为资料数量、库存风险、待审核数量和资料完整性等 Phase 1 指标。
- README 中“订单 → BOM → 库存对比 → 缺料分析”的唯一目标描述必须清理。

### 3.3 与蓝图审核池逻辑冲突的实现

`inventoryModal()` 允许用户直接修改 `stockQty`，提交后立即保存并重算。这与蓝图“单据先进入待审核流水，审核通过后才影响库存”相冲突。

Phase 1 建议：

- 库存台账页面先改为只读骨架。
- 禁止从 UI 直接编辑 `quantityOnHand`。
- 入库、领料、供应商退货只建立入口占位，不在 Phase 1 执行真实库存变化。
- 后续库存过账必须由 service 统一处理，并保留来源单据、方向、数量和审核状态。

### 3.4 可保留概念但需扩展的数据

- `products`：可保留产品与内部 ID 概念，需补产品编码、规格、单位、默认 BOM 版本和状态。
- `materials`：可保留 ID 引用，需对齐 `PHASE_1_SCOPE.md` 的物料字段草案。
- `bom`：可保留父子 ID 关系，需补版本、损耗率、生效/失效日期和备注。
- `inventory`：需从安全库存/提前期混合对象改为明确的 `InventoryBalance`，采购策略字段另行归属。
- 必须新增概念：`InventoryFlow`、`PendingDocument / AuditItem` 和审核状态。

## 4. Storage / Service Layer Review

### 4.1 当前 storage 的优点

- LocalStorage 读写集中在 `src/storage.js`，页面没有直接调用 `localStorage.getItem/setItem`。
- storage 参数可以注入，便于单元测试。
- 读取失败、JSON 损坏或 storage 不可用时能安全回退。
- 返回初始数据副本，避免直接污染 `initialData`。

### 4.2 当前 storage 的问题

- storage key 为旧 `mrp-lite-v1-data`。
- 整个系统作为一个 JSON 快照保存，schema 固定为 `products/materials/bom/inventory/orders`。
- `hasValidShape()` 只验证五个数组是否存在，不验证对象字段、唯一性和引用完整性。
- 没有 schema version、数据迁移或兼容策略。
- 保存失败只返回 `false`，UI 没有可靠处理错误。
- `resetStoredData()` 直接删除全部演示数据，只适合 Demo。
- 未来 API 需要按资源和业务动作调用；当前“保存整个 data”接口无法平滑映射到真实后端。

### 4.3 当前 service 层缺失

项目没有独立 service/business logic 层。`app.js` 直接：

- 查找和修改产品、物料、BOM、库存、订单数组。
- 生成 `Date.now()` ID。
- 新增物料时同步新增库存行。
- 判断 BOM 是否重复并直接覆盖数量。
- 调用 `saveData(data)` 保存整个快照。

这意味着 UI 虽未直接调用 LocalStorage，却仍深度绑定具体数据形状和完整快照存储方式。

### 4.4 建议的最小分层

Phase 1 不需要过度设计，但至少应形成：

```text
UI render / event handlers
→ materialService / productService / bomService / inventoryService / auditPoolService
→ storage repository interface
→ localStorage adapter（当前）/ API adapter（未来）
```

service 应负责：字段校验、唯一性、引用关系、只读库存约束和状态转换。UI 只传入用户意图并消费结果。

## 5. UI / Navigation Review

### 5.1 当前导航

当前页面：

- 概览
- 产品管理
- 物料管理
- BOM 管理
- 库存管理
- 订单模拟
- 缺料分析

与 Phase 1 对比：

| 当前页面 | 适配判断 |
| --- | --- |
| 概览 | 视觉骨架可复用；内容需改为基础 Dashboard 风险入口 |
| 产品管理 | 页面/表格模式可复用；字段需扩展 |
| 物料管理 | 最接近 Phase 1，可作为首批适配对象 |
| BOM 管理 | 页面结构可复用；需增加版本、损耗率和生效信息 |
| 库存管理 | 列表可复用；“维护当前库存”必须改为只读台账语义 |
| 订单模拟 | Phase 1 主线外，应从主导航隔离 |
| 缺料分析 | Phase 1 主线外，应从主导航隔离 |
| 待审核流水 / 审核池 | 当前不存在，Phase 1 需要页面骨架 |
| 入库/领料/供应商退货入口 | 当前不存在，Phase 1 仅需明确占位入口 |

### 5.2 UI 技术风险

- 所有页面 HTML 和行为集中在约 160 行高度压缩的 `app.js` 中，继续扩展会迅速失控。
- 用户输入通过模板字符串写入 `innerHTML`，没有统一 HTML 转义；即使当前是本地 Demo，也应在适配时处理注入风险。
- 页面渲染直接依赖全局可变 `data`，难以测试页面行为和业务边界。
- `sessionStorage` 只保存当前 BOM 产品选择，属于 UI 状态，风险较低，可保留或转为路由状态。
- Google Fonts 依赖公网；最终工厂内网部署前应改为本地字体或可靠系统字体栈。

## 6. Test Structure Review

### 6.1 当前测试基线

审计期间使用 bundled Node.js 执行现有测试：

- 共 13 项测试。
- 13 项通过，0 项失败。
- `npm` 当前不在系统 PATH，但使用项目环境提供的 Node.js 可正常执行测试。

测试覆盖：

- 多产品订单的 BOM 需求汇总。
- 缺料/库存低/充足边界。
- LocalStorage 保存、加载、损坏回退和重置。

### 6.2 可复用部分

- `node:test` + `assert/strict` 的无依赖测试方式。
- 将业务计算写成纯函数后做边界测试的方法。
- 使用内存 storage 替身测试持久化接口的方法。

### 6.3 需要替换和补充

- `tests/mrp.test.js` 继续验证旧订单驱动逻辑，不能代表 Phase 1 完成度。
- `tests/storage.test.js` 强制要求旧五数组 schema，并使用“完整保存五类 MRP 数据”的旧命名。
- 当前没有 Material/Product/BOM/InventoryBalance 数据校验测试。
- 当前没有 service 层测试。
- 当前没有库存只读约束、审核池去重、状态枚举或“审核前不影响库存”的测试。
- 当前没有 UI 导航或基础渲染测试。

建议在后续开发中保留现有测试作为 legacy 回归，新增 Phase 1 测试后再决定哪些旧测试迁移到后期采购风险模块。

## 7. Risks Before Phase 1 Implementation

1. **MRP 仍是运行时中心**：每次渲染都计算订单驱动需求，容易让新页面继续围绕缺料分析设计。
2. **库存可被直接覆盖**：当前库存编辑弹窗绕过单据、审核池和库存流水。
3. **缺少 service 层**：UI 直接修改共享数据并保存，业务规则无法集中约束。
4. **storage schema 强绑定旧 MRP**：旧 key 和五数组结构会干扰新数据对象落地。
5. **Dashboard 优先级错误**：模拟生产组合和缺料结果占据主视觉，审核池和台账风险不存在。
6. **旧名称遍布入口和文档**：package、HTML metadata、README、品牌、弹窗均写死 MRP Lite。
7. **单文件 UI 膨胀风险**：新页面继续加入 `app.js` 会让适配与测试越来越困难。
8. **数据模型字段不足**：缺少物料编码规则字段、BOM 版本/损耗率、库存流水和审核状态。
9. **无业务数据迁移策略**：旧 LocalStorage 数据若被新代码误读，可能产生形状不兼容或错误展示。
10. **用户输入未统一转义**：直接插入 `innerHTML` 存在注入风险。
11. **内网依赖风险**：Google Fonts 可能在工厂内网不可用。
12. **范围误解风险**：Phase 1 的审核池是概念与页面骨架，不等于提前实现复杂审批流程。

## 8. Recommended Cleanup Before Coding

建议按小步提交清理，不做一次性重写：

1. **先完成身份与导航切换**：更新 package、HTML metadata、README、品牌文字和 Phase 1 导航，停止把 MRP 描述成系统中心。
2. **隔离旧 MRP 能力**：从默认 `render()`、Dashboard 和主导航解除依赖；暂保留 `mrp.js` 与测试，不立即删除。
3. **定义 Phase 1 初始数据 schema**：依据 `PHASE_1_SCOPE.md` 建立 Material、Product、BOMItem、InventoryBalance、InventoryFlow、AuditItem 草案。
4. **建立 service/storage 边界**：页面不再直接修改数组或调用整包 `saveData(data)`。
5. **更换 storage namespace**：使用 Lufuta 专用 key 和明确 schema version，避免误读旧 MRP Demo 数据。
6. **先将库存页面改为只读台账**：移除“直接更新当前库存”的业务入口；安全库存策略可展示但不与余额混写。
7. **拆分 `app.js`**：至少分离 app shell/router、页面 renderers、services 和 storage adapter。
8. **建立 Phase 1 测试基线**：优先测试数据校验、service 调用、库存不可直接修改、审核池按单据去重和状态模型。
9. **保留视觉地基**：不要为了重命名而重写整份 CSS；只清理与旧订单/MRP 页面专属的样式和文案。

不建议在第一批代码变更中：实现采购计划、删除所有 MRP 代码、导入蓝图 Excel 数据、实现真实审核过账或引入后台框架。

## 9. Proposed First Coding Step

建议第一步代码改动为一个范围严格的 **Phase 1A：产品身份与导航切换**：

1. 将 `package.json`、`index.html`、`README.md` 和 app shell 中的产品名称统一为 `Lufuta 物料管理系统 Lite`。
2. 将主导航调整为 Phase 1 语义：Dashboard、物料资料、产品 / BOM、库存台账、待审核流水，以及入库/领料/供应商退货入口占位。
3. 将“订单模拟”和“缺料分析”从 Phase 1 主导航和 Dashboard 主叙事中隔离，但暂不删除 `mrp.js` 或旧测试。
4. 本步骤不改变数据、storage、库存或审核业务逻辑；只完成系统身份和导航方向切换。
5. 完成后运行现有测试，确认技术地基仍稳定，再进入 Phase 1B 数据对象与 service/storage 分层。

这是最小且方向明确的第一步：先让系统“说对自己是谁”，再开始迁移数据和业务边界。
