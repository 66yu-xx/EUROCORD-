import { initialData } from './data.js';
import { calculateMaterialRequirements, getInventoryStatusCounts, getSummary } from './mrp.js';
import { formatProcurementLeadTimeDays, resolveProcurementLeadTimeDays } from './planning/procurementLeadTime.js';
import { buildProcurementRecommendation } from './planning/procurementRecommendation.js';
import { calculateProcurementRisk } from './planning/procurementRisk.js';
import { createAuditService } from './services/auditService.js';
import { createInventoryService } from './services/inventoryService.js';
import { createMaterialService } from './services/materialService.js';
import { createProductService } from './services/productService.js';
import { createStorageAdapter, saveData } from './storage.js';
import { createSnapshotRepository } from './storage/snapshotRepository.js';

const storageAdapter = createStorageAdapter();
const repository = createSnapshotRepository({ adapter: storageAdapter, fallbackData: initialData });
const materialService = createMaterialService({ repository });
const productService = createProductService({ repository });
const inventoryService = createInventoryService({ repository });
const auditService = createAuditService({ repository });
let data = repository.getSnapshot();
let currentPage = 'dashboard';
let toastTimer;
const deliveryRiskInputState = {
  selectedProductId: '',
  plannedQty: '',
  requiredDate: '',
  asOfDate: '',
};
let deliveryRiskPreview = null;
const DELIVERY_RISK_LABELS = { ok: '可满足', warning: '交期紧张', critical: '交期高风险', unknown: '无法判断' };
const DELIVERY_RISK_REASONS = {
  ok: '采购周期可满足期望交期',
  warning: '采购周期接近期望交期，存在延期风险',
  critical: '采购周期预计无法满足期望交期',
  unknown: '采购周期未维护，无法判断交期风险',
};

const pages = [
  ['dashboard', '首页', 'grid'], ['delivery-risk', '交期风险分析', 'chart'], ['warehouse-alerts', '库存预警反馈', 'warehouse'],
  ['materials', '物料资料', 'layers'], ['product-bom', '产品 / BOM', 'git'], ['inventory', '库存台账', 'warehouse'],
  ['audit', '待审核流水', 'chart'], ['inbound', '入库占位', 'box'], ['outbound', '领料占位', 'cart'], ['supplier-return', '退货占位', 'warehouse'],
];

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  box: '<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 8 9 5v9l9-5V8"/><path d="m12 13 9-5"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  git: '<circle cx="6" cy="4" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="20" r="2"/><path d="M6 6v12M8 6h5a5 5 0 0 1 5 5v-3"/>',
  warehouse: '<path d="M3 21V9l9-6 9 6v12"/><path d="M7 21v-8h10v8M7 17h10"/>',
  cart: '<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.4 11h10.8l2-7H6"/>',
  chart: '<path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
};
const icon = (name, size = 19) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
const materialName = (id) => data.materials.find((m) => m.id === id)?.name || '未知物料';
const productName = (id) => data.products.find((p) => p.id === id)?.code || '未知产品';
const format = (num) => Number(num).toLocaleString('zh-CN');
const STATUS_TONES = { '缺料': 'danger', '库存低': 'warning', '充足': 'success' };
const badge = (status) => `<span class="badge badge-${STATUS_TONES[status]}"><i></i>${status}</span>`;
const tableScrollHint = () => '<p class="muted" style="margin:0;padding:0 22px 12px;font-size:11px">提示：表格可左右滑动查看更多字段</p>';

function appShell(content) {
  const active = pages.find((p) => p[0] === currentPage);
  return `<div class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">L</div><div><strong>LUFUTA LITE</strong><small>物料管理系统</small></div></div>
      <nav><p>演示导览</p>${pages.map(([id, label, ico]) => `<button class="nav-item ${currentPage === id ? 'active' : ''}" data-page="${id}">${icon(ico)}<span>${label}</span></button>`).join('')}</nav>
      <div class="sidebar-footer"><div class="demo-dot"></div><div><strong>只读演示</strong><small>当前使用浏览器存储</small></div><button class="reset-button" data-action="reset-data" title="重置演示数据"><b>↺</b><span>重置演示数据</span></button></div>
    </aside>
    <main><header><div><small>LUFUTA 物料管理系统 LITE / ${active[1]}</small><h1>${active[1]}</h1></div><div class="header-actions"><span class="date">${new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</span><button class="avatar">L</button></div></header><section class="content">${content}</section></main>
    <div id="modal-root"></div><div id="toast" class="toast"></div>
  </div>`;
}

function statCard(label, value, hint, tone, ico) {
  return `<article class="stat-card"><div class="stat-icon ${tone}">${icon(ico, 22)}</div><div><span>${label}</span><strong>${value}</strong><small>${hint}</small></div></article>`;
}

function dashboard() {
  const materials = materialService.listMaterials();
  const products = productService.listProducts();
  const balances = inventoryService.listBalances();
  const lowStockCount = balances.filter((row) => Number(row.stockQty) < Number(row.safetyStock)).length;
  return `<div class="hero"><div><span class="eyebrow">PHASE 4 DEMO WALKTHROUGH</span><h2>Lufuta 物料管理系统 Lite</h2><p>订单驱动的物料风险分析 Demo，用于演示老板、计划、采购、仓库如何阅读缺料、交期与库存反馈；不是完整 ERP、WMS 或财务系统。</p></div><span class="phase-chip">只读演示 · 不执行业务</span></div>
    <div class="stats-grid">${statCard('核心演示', 2, '交期分析 / 仓库反馈', 'blue', 'chart')}${statCard('物料资料', materials.length, '演示主数据', 'violet', 'layers')}${statCard('产品 / BOM', products.length, '演示结构数据', 'blue', 'box')}${statCard('库存风险', lowStockCount, '只读预警参考', 'amber', 'warehouse')}</div>
    <div class="dashboard-grid"><article class="panel"><div class="panel-head"><div><span class="kicker">DEMO WALKTHROUGH</span><h3>推荐演示顺序</h3></div></div><div class="flow-strip"><span>首页</span><b>→</b><span>交期风险分析</span><b>→</b><span>库存预警与仓库反馈</span><b>→</b><span>基础资料 / 执行占位</span></div><div class="entry-grid"><button class="entry-card" data-page="delivery-risk">${icon('chart', 22)}<span><strong>交期风险分析</strong><small>老板 / 计划 / 采购看订单风险与采购优先级</small></span></button><button class="entry-card" data-page="warehouse-alerts">${icon('warehouse', 22)}<span><strong>库存预警与仓库反馈</strong><small>仓库 / 计划 / 采购看预警、复查提示与反馈</small></span></button><button class="entry-card" data-page="inventory">${icon('layers', 22)}<span><strong>基础资料与占位</strong><small>库存台账等只读骨架，不代表真实执行已完成</small></span></button></div></article>
    <article class="panel"><div class="panel-head"><div><span class="kicker">PLACEHOLDER SCOPE</span><h3>基础资料与后续执行占位</h3></div><button class="text-button" data-page="audit">查看只读审核池 →</button></div><div class="flow-strip"><span>物料 / BOM</span><b>+</b><span>库存台账</span><b>+</b><span>待审核流水</span><b>+</b><span>入库 / 领料 / 退货占位</span></div><div class="placeholder-copy"><strong>当前只做演示阅读</strong><p>库存台账、待审核流水、入库、领料、供应商退货用于说明基础资料或后续执行方向；不会保存订单、扣减库存、生成采购单或生产单。</p></div></article></div>`;
}

function tablePage({ title, description, action, columns, rows }) {
  return `<div class="page-intro"><div><p>${description}</p></div>${action || ''}</div><article class="panel table-panel"><div class="table-meta"><span>共 <strong>${rows.length}</strong> 条记录</span><div class="search">⌕ <input placeholder="在当前列表中筛选…" data-table-search /></div></div>${tableScrollHint()}<div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div></article>`;
}

// Legacy page renderers retained for later scope review. They are intentionally absent from
// the Phase 1 navigation and renderer map; do not reconnect them during Phase 1E.
function productsPage() {
  return `${skeletonNotice('产品资料', '用于维护 Lite 阶段的产品编码、名称与规格，供 BOM 和缺料计算验证使用。当前不包含产品审批、版本冻结、生命周期管理或客户订单绑定。')}${tablePage({ description: '当前记录保存在浏览器中，仅用于业务演示与结构验证。', action: `<button class="primary" data-action="add-product">${icon('plus', 17)} 新增产品</button>`, columns: ['产品编码', '产品名称', '规格型号', 'BOM 物料数', '操作'], rows: data.products.map((p) => `<tr><td><strong class="code">${p.code}</strong></td><td>${p.name}</td><td><span class="soft-tag">${p.model}</span></td><td>${new Set(data.bom.filter((b) => b.productId === p.id).map((b) => b.materialId)).size} 项</td><td><button class="icon-btn" title="编辑" data-action="edit-product" data-id="${p.id}">${icon('edit', 16)}</button></td></tr>`) })}`;
}

function materialsPage() {
  const materials = materialService.listMaterials();
  const bomItems = productService.listBOMItems();
  return tablePage({ description: '只读查看当前 Lite 物料资料及其 BOM 引用关系。', columns: ['物料编码', '物料名称', '分类', '单位', '采购周期', '引用 BOM', '当前阶段'], rows: materials.map((m) => `<tr><td><strong class="code">${m.code}</strong></td><td>${m.name}</td><td><span class="soft-tag">${m.category}</span></td><td>${m.unit}</td><td>${formatProcurementLeadTimeDays(m.procurementLeadTimeDays)}</td><td>${bomItems.filter((b) => b.materialId === m.id).length} 个产品</td><td><span class="muted">只读</span></td></tr>`) });
}

function bomPage() {
  const selected = sessionStorage.getItem('selectedProduct') || data.products[0]?.id;
  const items = data.bom.filter((b) => b.productId === selected);
  return `${skeletonNotice('BOM 用量关系', '用于维护产品与物料之间的单台用量，订单模拟会据此展开物料需求。当前不包含 BOM 审核、工程变更、版本发布或历史版本追踪。')}<div class="page-intro"><p>当前 BOM 保存在浏览器中，仅用于 Lite 计算验证。</p><button class="primary" data-action="add-bom">${icon('plus', 17)} 添加物料</button></div><div class="product-tabs">${data.products.map((p) => `<button class="product-tab ${p.id === selected ? 'active' : ''}" data-product-tab="${p.id}"><small>${p.model}</small><strong>${p.code}</strong><span>${data.bom.filter((b) => b.productId === p.id).length} 项物料</span></button>`).join('')}</div><article class="panel table-panel"><div class="panel-head bom-title"><div><span class="kicker">BILL OF MATERIALS</span><h3>${productName(selected)} 物料清单</h3></div><span class="version">Lite 演示数据</span></div>${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>序号</th><th>物料编码</th><th>物料名称</th><th>分类</th><th>单台用量</th><th>单位</th><th>操作</th></tr></thead><tbody>${items.map((b, i) => { const m = data.materials.find((x) => x.id === b.materialId); return `<tr><td class="muted">${String(i + 1).padStart(2, '0')}</td><td><strong class="code">${m.code}</strong></td><td>${m.name}</td><td><span class="soft-tag">${m.category}</span></td><td><strong>${b.qtyPerProduct}</strong></td><td>${m.unit}</td><td><button class="icon-btn" data-action="edit-bom" data-product="${selected}" data-material="${m.id}">${icon('edit', 16)}</button></td></tr>` }).join('')}</tbody></table></div></article>`;
}

function inventoryPage() {
  const materials = materialService.listMaterials();
  const balances = inventoryService.listBalances();
  return `${skeletonNotice('库存台账', '当前只读展示 Lite 阶段的演示库存，用于安全库存与缺料风险判断。采购周期来自物料主数据，旧演示库存字段仅作兼容回退。这里不是真实库存账，本阶段不提供入库、出库、冻结、盘点、过账、批次或库位管理。')}${tablePage({ description: '库存数量来自浏览器中的演示数据，不会生成库存单据。', columns: ['物料', '当前库存', '安全库存', '采购周期', '风险状态', '仓位 / 库位', '最后更新'], rows: materials.map((m) => { const inv = balances.find((i) => i.materialId === m.id) || { stockQty: 0, safetyStock: 0 }; const low = Number(inv.stockQty) < Number(inv.safetyStock); const leadTimeDays = resolveProcurementLeadTimeDays(m, inv); return `<tr><td><div class="cell-main"><div class="material-avatar small">${m.name[0]}</div><div><strong>${m.name}</strong><small>${m.code}</small></div></div></td><td><strong>${format(inv.stockQty)}</strong> ${m.unit}</td><td>${format(inv.safetyStock)} ${m.unit}</td><td>${formatProcurementLeadTimeDays(leadTimeDays)}</td><td><span class="stock-level ${low ? 'bad' : ''}"><i></i>${low ? '低于安全线' : '正常'}</span></td><td><span class="muted">未启用</span></td><td><span class="muted">演示数据</span></td></tr>` }) })}`;
}

function warehouseAlertsPage() {
  const materials = materialService.listMaterials();
  const balances = inventoryService.listBalances();
  const inventoryRows = materials.map((material) => {
    const balance = balances.find((item) => item.materialId === material.id) || {};
    return { material, stockQty: Number(balance.stockQty ?? 0), safetyStock: Number(balance.safetyStock ?? 0) };
  });
  const zeroStockCount = inventoryRows.filter((row) => row.stockQty <= 0).length;
  const lowStockCount = inventoryRows.filter((row) => row.stockQty > 0 && row.stockQty < row.safetyStock).length;
  const normalStockCount = inventoryRows.filter((row) => row.stockQty >= row.safetyStock).length;
  const alertRows = inventoryRows.filter((row) => row.stockQty <= 0 || (row.stockQty > 0 && row.stockQty < row.safetyStock));
  const alertTable = alertRows.length ? `${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>物料编码</th><th>物料名称</th><th>当前库存</th><th>安全库存</th><th>预警类型</th><th>只读提示</th></tr></thead><tbody>${alertRows.map((row) => { const isZero = row.stockQty <= 0; return `<tr><td><strong class="code">${row.material.code}</strong></td><td>${row.material.name}</td><td><strong>${format(row.stockQty)}</strong> ${row.material.unit}</td><td>${format(row.safetyStock)} ${row.material.unit}</td><td><span class="soft-tag">${isZero ? '库存为 0' : '低于安全库存'}</span></td><td>${isZero ? '当前库存小于等于 0，仅提示账面数字待人工复核。' : '当前库存低于安全库存，仅提示计划 / 采购后续关注。'}</td></tr>`; }).join('')}</tbody></table></div>` : empty('暂无库存预警', '当前没有库存为 0 或低于安全库存的物料；本页不会生成库存或采购动作。');
  const recheckRows = inventoryRows.filter((row) => row.stockQty <= 0 || (row.stockQty > 0 && row.stockQty < row.safetyStock) || row.safetyStock <= 0);
  const recheckTable = recheckRows.length ? `${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>物料编码</th><th>物料名称</th><th>当前库存</th><th>安全库存</th><th>复查提示</th><th>只读原因</th></tr></thead><tbody>${recheckRows.map((row) => { const type = row.stockQty <= 0 ? '待核对：无可用库存' : row.safetyStock <= 0 ? '待补充：安全库存基准' : '待核对：可用数量'; const reason = row.stockQty <= 0 ? '当前库存小于等于 0，仅提示后续人工核对账面与现场可用数量。' : row.safetyStock <= 0 ? '安全库存未维护或为 0，仅提示后续补充预警基准。' : '当前库存低于安全库存，仅提示后续核对账面数量和现场可用数量。'; return `<tr><td><strong class="code">${row.material.code}</strong></td><td>${row.material.name}</td><td><strong>${format(row.stockQty)}</strong> ${row.material.unit}</td><td>${format(row.safetyStock)} ${row.material.unit}</td><td><span class="soft-tag">${type}</span></td><td>${reason}</td></tr>`; }).join('')}</tbody></table></div>` : empty('暂无复查建议', '当前没有需要列为复查提示的库存项目；本页不会保存复查结果。');
  const feedbackMessages = alertRows.length || recheckRows.length ? [alertRows.length ? '存在库存预警物料，计划在排产前可优先确认库存可用性，采购可提前关注供应风险。' : '', recheckRows.length ? '存在待人工核对的库存项目，相关库存数字在订单判断前可进一步确认。' : ''].filter(Boolean) : ['当前没有明显库存预警或仓库复查提示，库存数据仅作为当前只读参考。'];
  const boundaryCards = [
    ['仓库反馈库存状态风险', '查看库存预警、反馈实物状态和提示库存风险；反馈不是采购申请。', 'warehouse'],
    ['计划判断排产风险', '仓库反馈提醒计划在排产前确认库存可用性，避免把账面风险带入订单判断。', 'chart'],
    ['采购判断供应准备', '采购只接收关注提示，提前识别供应风险；仓库不能决定采购数量或下单。', 'cart'],
    ['老板查看交付风险汇总', '老板看到的是跨角色汇总后的订单交付风险，不是单条仓库操作记录。', 'grid'],
  ];
  const warehouseFeedbackRows = inventoryRows.map((row, index) => {
    if (row.stockQty <= 0) return { ...row, systemStatus: '库存为 0', feedback: '账面库存可能不可靠', target: '计划 / 采购', note: '计划排产前需确认可用数量，采购可提前关注供应风险；这不是采购申请。' };
    if (row.stockQty < row.safetyStock) return { ...row, systemStatus: '低于安全库存', feedback: '生产前需确认可用数量', target: '计划 / 采购', note: '库存低于安全库存，提醒计划复核排产风险，并同步采购关注供应准备。' };
    if (row.safetyStock <= 0) return { ...row, systemStatus: '安全库存未维护', feedback: '实物数量需复查', target: '计划', note: '安全库存基准缺失，提醒计划在订单判断前确认库存可用性。' };
    if (index % 5 === 0) return { ...row, systemStatus: '库存正常', feedback: '物料位置需确认', target: '计划', note: '库存数量未触发预警，仅演示仓库可提示排产前确认物料位置。' };
    if (index % 5 === 1) return { ...row, systemStatus: '库存正常', feedback: '包装 / 状态待确认', target: '计划', note: '库存数量未触发预警，仅演示仓库可提示实物包装或状态待确认。' };
    return { ...row, systemStatus: '库存正常', feedback: '暂无异常', target: '无', note: '当前库存状态未触发仓库风险反馈。' };
  });
  const warehouseFeedbackTable = `${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>物料</th><th>系统库存状态</th><th>仓库状态反馈</th><th>影响对象</th><th>说明</th></tr></thead><tbody>${warehouseFeedbackRows.map((row) => `<tr><td><div class="cell-main"><div class="material-avatar small">${row.material.name[0]}</div><div><strong>${row.material.name}</strong><small>${row.material.code} · ${format(row.stockQty)} ${row.material.unit}</small></div></div></td><td><span class="soft-tag">${row.systemStatus}</span></td><td>${row.feedback}</td><td>${row.target}</td><td>${row.note}</td></tr>`).join('')}</tbody></table></div>`;

  return `${skeletonNotice('库存预警与仓库反馈（只读）', '仓库库存状态反馈与跨角色预警：仓库只反馈库存状态风险，提醒计划确认排产风险，同步采购关注供应准备，最终汇总给老板查看交付风险。')}
    <div class="page-intro"><div><span class="kicker">WAREHOUSE FEEDBACK BOUNDARY</span><h3 style="margin:4px 0 6px;font-size:16px">仓库库存状态反馈与跨角色预警</h3><p>仓库侧用于查看库存预警、反馈实物状态和提示库存风险；仓库反馈不是采购申请，不能直接决定采购数量或下单。当前阶段仅为只读演示，不保存反馈、不修改库存、不生成库存流水。</p></div></div>
    <article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">ROLE BOUNDARY</span><h3>仓库反馈型角色边界</h3></div><span class="version">Phase 5-Step 1 · 只读</span></div><div class="entry-grid">${boundaryCards.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div><div class="placeholder-copy"><strong>仓库反馈不是采购申请</strong><p>本阶段不会修改库存、不会保存记录、不会生成库存流水、不会生成采购单。</p></div></article>
    <article class="panel table-panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">WAREHOUSE STATUS FEEDBACK</span><h3>仓库库存状态反馈列表</h3></div><span class="version">${warehouseFeedbackRows.length} 项 · 只读演示</span></div><div class="placeholder-copy"><p>以下内容为只读演示反馈，不会保存记录，不会修改库存，不会生成采购单。</p></div>${warehouseFeedbackTable}</article>
    <div class="page-intro"><div><span class="kicker">WAREHOUSE OVERVIEW</span><h3 style="margin:4px 0 6px;font-size:16px">仓库库存概览</h3><p>以下数字基于当前演示库存只读汇总，仅用于仓库预警参考；安全库存缺失或为 0 时不纳入低库存判断，也不会自动触发任何业务单据。</p></div></div>
    <div class="stats-grid">${statCard('物料总数', materials.length, '来自现有物料资料', 'violet', 'layers')}${statCard('库存为 0', zeroStockCount, '当前库存小于等于 0', 'red', 'warehouse')}${statCard('低于安全库存', lowStockCount, '库存大于 0 且低于安全库存', 'amber', 'chart')}${statCard('库存正常', normalStockCount, '当前库存大于等于安全库存', 'blue', 'box')}</div>
    <article class="panel table-panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">WAREHOUSE ALERTS</span><h3>库存预警列表</h3></div><span class="version">${alertRows.length} 项 · 只读</span></div><div class="placeholder-copy"><p>未维护安全库存或安全库存为 0 的物料暂不纳入低库存预警；本列表只显示库存为 0 和低于安全库存的只读提示。</p></div>${alertTable}</article>
    <div class="document-shell"><article class="panel table-panel"><div class="panel-head"><div><span class="kicker">RECHECK NOTES</span><h3>仓库复查提示</h3></div><span class="version">${recheckRows.length} 项 · 不保存结果</span></div><div class="placeholder-copy"><p>以下内容只是复查提示，不会保存复查结果、修改库存数据、扣减库存或生成采购单。</p></div>${recheckTable}</article>
    <article class="panel workflow-panel"><span class="kicker">FEEDBACK ONLY</span><h3>对计划 / 采购 / 老板的反馈提示</h3><div class="workflow-steps">${feedbackMessages.map((message) => `<span>${message}</span>`).join('')}</div><p>以上提示只是仓库视角反馈：提醒计划排产前确认库存可用性，提醒采购提前关注供应风险，老板看到的是汇总后的订单交付风险；不会修改 Phase 2C 的采购建议，不会生成采购单，也不会保存任何反馈结果。</p></article></div>`;
}

function deliveryRiskPage() {
  const products = productService.listProducts();
  const productOptions = products.map((product) => `<option value="${product.id}" ${product.id === deliveryRiskInputState.selectedProductId ? 'selected' : ''}>${product.code} · ${product.name}</option>`).join('');
  return `<div class="skeleton-notice"><div><span class="eyebrow">LUFUTA LITE / PHASE 2C</span><strong>下单前交期与采购分析</strong><p>根据计划数量、BOM、库存和采购周期，提供下单判断、交期说明与采购关注重点。页面仅供分析，不保存订单、不生成采购单、不修改库存。</p></div><span class="phase-chip">只读分析</span></div><form class="panel"><div class="panel-head"><div><span class="kicker">分析输入</span><h3>分析条件</h3></div><span class="version">仅用于本次判断</span></div><div class="modal-body"><label class="field"><span>产品</span><select name="selectedProductId" data-delivery-risk-input><option value="">请选择产品</option>${productOptions}</select></label><label class="field"><span>计划数量</span><input name="plannedQty" type="number" min="0" step="1" placeholder="例如 100" value="${deliveryRiskInputState.plannedQty}" data-delivery-risk-input /></label><label class="field"><span>期望交期</span><input name="requiredDate" type="date" value="${deliveryRiskInputState.requiredDate}" data-delivery-risk-input /></label><label class="field"><span>分析日期</span><input name="asOfDate" type="date" value="${deliveryRiskInputState.asOfDate}" data-delivery-risk-input /></label></div><div class="modal-actions"><button class="primary" type="button" data-action="delivery-risk-placeholder">分析交期风险</button></div></form>${orderDecisionSummaryPanel()}${deliveryFeasibilityPanel()}${procurementPriorityGroupsPanel()}${deliveryRiskPreviewPanel()}<article class="panel workflow-panel"><span class="kicker">分析口径</span><h3>分析依据与边界</h3><div class="workflow-steps"><span>计划需求</span><b>+</b><span>BOM</span><b>+</b><span>库存</span><b>+</b><span>采购周期</span><b>→</b><span>交期风险</span></div><p>结果仅供下单前判断，不代表已排产、已承诺交期或已创建采购任务；系统不保存订单、不修改库存。</p></article>`;
}

function orderDecisionSummaryPanel() {
  const rows = deliveryRiskPreview?.rows;
  let decision = {
    judgment: '等待分析',
    riskLevel: '待生成',
    reason: '尚未生成交期风险分析结果',
    action: '请先完成分析条件并生成结果',
  };

  if (rows?.length === 0) {
    decision = {
      judgment: '当前订单暂无法判断',
      riskLevel: '无法判断',
      reason: '当前产品尚未维护 BOM，缺少物料需求依据',
      action: '建议先确认产品 BOM 后再判断交期',
    };
  } else if (rows?.length) {
    const criticalRow = rows.find((row) => row.riskLevel === 'critical');
    const unknownRow = rows.find((row) => row.riskLevel === 'unknown' && row.recommendation.recommendedQty > 0);
    const warningRow = rows.find((row) => row.riskLevel === 'warning');

    if (criticalRow) {
      decision = {
        judgment: '当前订单交期风险较高',
        riskLevel: criticalRow.deliveryRiskLabel,
        reason: '部分缺料物料的采购周期超过剩余交期',
        action: '建议先确认关键缺料物料后再承诺交期',
      };
    } else if (unknownRow) {
      decision = {
        judgment: '当前订单交期风险暂无法判断',
        riskLevel: DELIVERY_RISK_LABELS.unknown,
        reason: '部分需采购物料的采购周期未维护',
        action: '建议先确认采购周期和关键物料后再承诺交期',
      };
    } else if (warningRow) {
      const hasShortage = rows.some((row) => row.shortageQty > 0);
      decision = {
        judgment: '当前订单存在交期风险',
        riskLevel: DELIVERY_RISK_LABELS.warning,
        reason: hasShortage ? '部分物料存在缺料，但采购周期仍可能满足期望交期' : '生产后部分物料库存将低于安全库存',
        action: hasShortage ? '建议尽快确认采购，不宜等待后续订单合并' : '可继续下单，但建议关注安全库存补充',
      };
    } else {
      decision = {
        judgment: '当前订单交期风险较低',
        riskLevel: DELIVERY_RISK_LABELS.ok,
        reason: '当前库存基本可覆盖订单需求',
        action: '可继续下单，但建议关注库存变化',
      };
    }
  }

  return `<article class="panel" data-order-decision-summary style="margin:18px 0"><div class="panel-head"><div><span class="kicker">老板视角 · 下单判断</span><h3>订单决策摘要</h3></div><span class="version">只读判断</span></div><div class="placeholder-form"><div><span>当前判断</span><strong>${decision.judgment}</strong></div><div><span>风险等级</span><strong>${decision.riskLevel}</strong></div><div><span>主要原因</span><strong>${decision.reason}</strong></div><div><span>下单建议</span><strong>${decision.action}</strong></div></div></article>`;
}

function calendarDaysBetween(fromDate, toDate) {
  const fromTime = Date.parse(`${fromDate}T00:00:00Z`);
  const toTime = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return null;
  return Math.round((toTime - fromTime) / 86400000);
}

function deliveryFeasibilityPanel() {
  const preview = deliveryRiskPreview;
  const rows = preview?.rows;
  let expectedDate = preview?.requiredDate || '待输入';
  let analysisDate = preview?.asOfDate || '待输入';
  let remainingDays = '待分析';
  let criticalLeadTime = '待分析';
  let planningDecision = '请先完成分析条件并生成结果';

  if (preview) {
    const dayDifference = calendarDaysBetween(preview.asOfDate, preview.requiredDate);
    remainingDays = dayDifference === null ? '无法计算' : `${dayDifference} 天`;

    if (!rows.length) {
      criticalLeadTime = '无 BOM 数据';
      planningDecision = '当前缺少 BOM 需求依据，暂无法判断交期可行性';
    } else {
      const leadTimeRows = rows.filter((row) => Number.isInteger(row.procurementLeadTimeDays) && row.procurementLeadTimeDays >= 0);
      if (!leadTimeRows.length) {
        criticalLeadTime = '采购周期未维护';
        planningDecision = '当前采购周期数据不足，暂无法判断交期可行性';
      } else {
        const keyRow = leadTimeRows.reduce((longest, row) => row.procurementLeadTimeDays > longest.procurementLeadTimeDays ? row : longest);
        criticalLeadTime = `${formatProcurementLeadTimeDays(keyRow.procurementLeadTimeDays)} · ${keyRow.material.name}`;

        const hasCriticalRisk = rows.some((row) => row.riskLevel === 'critical');
        const hasUnknownPurchaseRisk = rows.some((row) => row.riskLevel === 'unknown' && row.recommendation.recommendedQty > 0);
        const hasWarningRisk = rows.some((row) => row.riskLevel === 'warning');
        if (hasCriticalRisk) planningDecision = '当前交期存在延期风险，建议确认关键物料后再承诺客户交期';
        else if (hasUnknownPurchaseRisk) planningDecision = '当前交期资料不足，建议确认采购周期后再对外沟通';
        else if (hasWarningRisk) planningDecision = '当前交期紧张，建议提前确认采购';
        else planningDecision = '当前交期相对宽松';
      }
    }
  }

  return `<article class="panel" data-delivery-feasibility style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">计划视角 · 交期判断</span><h3>交期可行性说明</h3></div><span class="version">只读说明</span></div><div class="placeholder-form"><div><span>期望交期</span><strong>${expectedDate}</strong></div><div><span>分析日期</span><strong>${analysisDate}</strong></div><div><span>剩余天数</span><strong>${remainingDays}</strong></div><div><span>最长已维护采购周期</span><strong>${criticalLeadTime}</strong></div><div><span>交期判断</span><strong>${planningDecision}</strong></div></div><div class="placeholder-copy"><p>本说明用于下单前沟通，不代表已排产或已承诺交期。具体交期仍需结合采购确认和生产安排。</p></div></article>`;
}

function procurementPriorityReason(row, group) {
  if (group === 'immediate') {
    if (row.procurementLeadTimeDays === null) return '当前缺料，采购周期待确认，建议优先核实。';
    if (row.riskLevel === 'critical') return `当前缺料，采购周期为 ${formatProcurementLeadTimeDays(row.procurementLeadTimeDays)}，可能影响期望交期，建议优先确认。`;
    return `当前缺料，采购周期为 ${formatProcurementLeadTimeDays(row.procurementLeadTimeDays)}，建议提前确认。`;
  }
  if (group === 'attention') return '生产后预计剩余库存低于安全库存，建议持续关注库存和采购周期。';
  return '当前库存可覆盖本单，生产后库存仍处于安全范围。';
}

function procurementPriorityMaterial(row, group) {
  const quantityLabel = group === 'immediate'
    ? `缺口：${format(row.shortageQty)} ${row.material.unit}`
    : `预计剩余：${format(row.remainingQty)} ${row.material.unit}`;
  return `<div class="alert-row"><div class="grow"><strong>${row.material.name}</strong><small>${row.material.code} · 需求：${format(row.requiredQty)} ${row.material.unit} · 库存：${format(row.stockQty)} ${row.material.unit}</small><small>${quantityLabel} · 采购周期：${formatProcurementLeadTimeDays(row.procurementLeadTimeDays)}</small><small>${procurementPriorityReason(row, group)}</small></div></div>`;
}

function procurementPriorityGroup({ key, title, description, emptyText, rows }) {
  const content = rows.length
    ? `<div class="alert-list">${rows.map((row) => procurementPriorityMaterial(row, key)).join('')}</div>`
    : `<div class="empty-table"><p>${emptyText}</p></div>`;
  return `<section class="panel" data-priority-group="${key}"><div class="panel-head"><div><span class="kicker">${key.toUpperCase()}</span><h3>${title}</h3></div><span class="version">${rows.length} 项</span></div><div class="placeholder-copy"><p>${description}</p></div>${content}</section>`;
}

function procurementPriorityGroupsPanel() {
  const rows = deliveryRiskPreview?.rows;
  if (!rows) return `<article class="panel" data-procurement-priority-groups style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">采购视角 · 物料关注顺序</span><h3>采购优先级分组</h3></div><span class="version">只读分组</span></div><div class="empty-table"><strong>等待分析</strong><p>请先完成分析条件并生成结果，再查看采购关注顺序。</p></div></article>`;
  if (!rows.length) return `<article class="panel" data-procurement-priority-groups style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">采购视角 · 物料关注顺序</span><h3>采购优先级分组</h3></div><span class="version">只读分组</span></div><div class="empty-table"><strong>暂无法分组</strong><p>当前产品尚未维护 BOM，缺少可用于采购判断的物料需求。</p></div></article>`;

  const immediate = [];
  const attention = [];
  const noPurchase = [];
  rows.forEach((row) => {
    if (row.recommendation.action === '建议采购' || row.shortageQty > 0) immediate.push(row);
    else if (row.recommendation.action === '建议补充安全库存' || row.quantityRisk === 'low') attention.push(row);
    else if (row.recommendation.action === '无需采购') noPurchase.push(row);
    else attention.push(row);
  });

  const groups = [
    { key: 'immediate', title: '立即确认', description: '建议优先确认以下物料的采购安排，降低对当前订单交期的影响。', emptyText: '暂无需要立即确认的物料', rows: immediate },
    { key: 'attention', title: '建议关注', description: '以下物料当前可能不影响本单，但建议持续关注库存和采购周期。', emptyText: '暂无需要重点关注的物料', rows: attention },
    { key: 'no-purchase', title: '暂不采购', description: '以下物料当前库存可覆盖本单，暂不建议立即采购。', emptyText: '暂无可归入暂不采购的物料', rows: noPurchase },
  ];

  return `<article class="panel" data-procurement-priority-groups style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">采购视角 · 物料关注顺序</span><h3>采购优先级分组</h3></div><span class="version">${rows.length} 项物料</span></div><div class="entry-grid">${groups.map(procurementPriorityGroup).join('')}</div><div class="placeholder-copy"><p>本分组仅供采购判断，不会创建采购任务或采购单；实际采购仍需人工确认。</p></div></article>`;
}

function deliveryRiskPreviewPanel() {
  if (!deliveryRiskPreview) return '';
  const { product, plannedQty, requiredDate, asOfDate, rows } = deliveryRiskPreview;
  const summary = `<div class="flow-strip" data-delivery-risk-summary><span>产品：${product.code} · ${product.name}</span><span>计划数量：${format(plannedQty)}</span><span>期望交期：${requiredDate}</span><span>分析日期：${asOfDate}</span></div>`;
  const legend = `<article class="panel workflow-panel" data-delivery-risk-legend style="margin-top:18px"><span class="kicker">判断口径</span><h3>风险等级说明</h3><div class="workflow-steps"><span>可满足：当前库存可覆盖本次需求</span><span>交期紧张：存在缺料，按当前采购周期仍可能满足期望交期</span><span>交期高风险：缺料物料预计无法在期望交期前到料</span><span>无法判断：采购周期未维护，暂无法判断交期风险</span></div></article>`;
  if (!rows.length) return `<article class="panel table-panel" data-delivery-risk-preview><div class="panel-head"><div><span class="kicker">物料明细 · 交期风险</span><h3>物料交期风险明细</h3></div><span class="version">${product.code} · 只读预览</span></div>${summary}<div class="empty-table"><strong>当前产品尚未维护 BOM，无法生成需求预览</strong><p>请先确认该产品的 BOM 资料，再进行交期判断。</p></div></article>${legend}`;
  const recommendationView = `<article class="panel table-panel" data-procurement-recommendation-view style="margin-top:18px"><div class="panel-head"><div><span class="kicker">物料明细 · 采购建议</span><h3>采购建议明细（只读）</h3></div><span class="version">${rows.length} 项建议</span></div><div class="placeholder-copy"><p>建议数量根据当前计划数量、BOM、库存、安全库存和采购周期自动计算，仅供采购判断。页面不会生成采购单、保存建议或修改、占用库存；实际采购需人工确认。</p></div>${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>物料</th><th>建议动作</th><th>建议采购数量</th><th>原因</th><th>优先级</th><th>采购周期</th><th>风险等级</th></tr></thead><tbody>${rows.map((row) => `<tr><td><div class="cell-main"><div class="material-avatar small">${row.material.name[0]}</div><div><strong>${row.material.name}</strong><small>${row.material.code} · ${row.material.unit}</small></div></div></td><td>${row.recommendation.action}</td><td><strong>${format(row.recommendation.recommendedQty)}</strong> ${row.material.unit}</td><td>${row.recommendation.reason}</td><td><span class="soft-tag">${row.recommendation.priority}</span></td><td>${formatProcurementLeadTimeDays(row.procurementLeadTimeDays)}</td><td><span class="soft-tag">${row.deliveryRiskLabel}</span></td></tr>`).join('')}</tbody></table></div></article>`;
  return `<article class="panel table-panel" data-delivery-risk-preview><div class="panel-head"><div><span class="kicker">物料明细 · 交期风险</span><h3>物料交期风险明细</h3></div><span class="version">${product.code} · ${rows.length} 项物料</span></div>${summary}${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>物料编码</th><th>物料名称</th><th>单位用量</th><th>计划数量</th><th>总需求</th><th>当前库存</th><th>缺口数量</th><th>库存判断</th><th>采购周期</th><th>交期风险</th><th>风险说明</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong class="code">${row.material.code}</strong></td><td>${row.material.name}</td><td>${format(row.qtyPerProduct)} ${row.material.unit}</td><td>${format(plannedQty)}</td><td><strong>${format(row.requiredQty)}</strong> ${row.material.unit}</td><td>${format(row.stockQty)} ${row.material.unit}</td><td><strong class="${row.shortageQty > 0 ? 'danger-text' : 'muted'}">${format(row.shortageQty)}</strong> ${row.material.unit}</td><td><span class="stock-level ${row.shortageQty > 0 ? 'bad' : ''}"><i></i>${row.shortageQty > 0 ? '库存不足' : '库存可覆盖'}</span></td><td>${formatProcurementLeadTimeDays(row.procurementLeadTimeDays)}</td><td><span class="soft-tag">${row.deliveryRiskLabel}</span></td><td>${row.deliveryRiskReason}</td></tr>`).join('')}</tbody></table></div></article>${recommendationView}${legend}`;
}

function productBomPage() {
  const products = productService.listProducts();
  const materials = materialService.listMaterials();
  const selected = sessionStorage.getItem('selectedProduct') || products[0]?.id;
  const items = productService.listBOMItems(selected);
  const selectedProduct = products.find((product) => product.id === selected);
  return `${skeletonNotice('产品 / BOM', '当前只读展示 Lite 产品基础资料及其物料用量关系，供结构验证和后续缺料计算使用。产品侧不含审批、版本冻结、生命周期或客户订单绑定；BOM 侧不含审核、工程变更、版本发布或历史追踪。')}<div class="product-tabs">${products.map((p) => `<button class="product-tab ${p.id === selected ? 'active' : ''}" data-product-tab="${p.id}"><small>${p.model}</small><strong>${p.code}</strong><span>${productService.listBOMItems(p.id).length} 项物料</span></button>`).join('')}</div><article class="panel table-panel"><div class="panel-head bom-title"><div><span class="kicker">PRODUCT / BOM SKELETON</span><h3>${selectedProduct?.code || '未知产品'} 物料组成</h3></div><span class="version">只读演示</span></div>${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>序号</th><th>物料编码</th><th>物料名称</th><th>分类</th><th>单台用量</th><th>单位</th><th>BOM 版本</th></tr></thead><tbody>${items.map((row, index) => { const material = materials.find((m) => m.id === row.materialId); if (!material) return ''; return `<tr><td class="muted">${String(index + 1).padStart(2, '0')}</td><td><strong class="code">${material.code}</strong></td><td>${material.name}</td><td><span class="soft-tag">${material.category}</span></td><td><strong>${row.qtyPerProduct}</strong></td><td>${material.unit}</td><td><span class="muted">未启用</span></td></tr>`; }).join('')}</tbody></table></div></article>`;
}

function auditPage() {
  const pendingDocuments = auditService.listPendingDocuments();
  const auditItems = auditService.listAuditItems();
  const rows = pendingDocuments.map((document) => {
    const auditItem = auditItems.find((item) => item.documentId === document.id);
    const status = auditItem?.auditStatus || document.auditStatus || 'pending';
    const riskFlags = document.riskFlags?.length ? document.riskFlags.join('、') : '无';
    const submittedAt = document.submittedAt ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(document.submittedAt)) : '待提交';
    return `<tr><td><strong class="code">${document.documentNo || '待编号'}</strong></td><td>${document.documentType || '未分类'}</td><td>${document.applicantName || '未填写'}</td><td>${submittedAt}</td><td>${document.inventoryEffect || 'none'}</td><td>${riskFlags}</td><td><span class="soft-tag">${status}</span></td></tr>`;
  });
  const body = rows.length ? rows.join('') : '<tr><td colspan="7"><div class="empty-table"><strong>暂无演示记录</strong><p>当前页面只读展示审核池结构，尚不能保存或提交单据。</p></div></td></tr>';
  return `${skeletonNotice('待审核流水 / 审核池', '当前只读展示朋友蓝图中的待审核记录结构，用于验证未来业务链路。当前演示不执行单据保存、真实审批、权限判断或库存过账。')}<article class="panel table-panel"><div class="panel-head"><div><span class="kicker">PENDING DOCUMENTS</span><h3>待审核业务记录</h3></div><span class="version">${pendingDocuments.length} 条 · 只读演示</span></div>${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>单据编号</th><th>单据类型</th><th>申请人</th><th>提交时间</th><th>库存影响</th><th>风险标记</th><th>审核状态</th></tr></thead><tbody>${body}</tbody></table></div></article>`;
}

function documentPlaceholder(type, direction, description) {
  return `${skeletonNotice(type, `当前仅展示${type}模块的后续方向，不提供单据填写、保存、提交或审核。这里不会修改库存、不会过账，也不会连接 API 或数据库。`)}<div class="document-shell"><article class="panel"><div class="panel-head"><div><span class="kicker">PLACEHOLDER MODULE</span><h3>${type}模块占位</h3></div><span class="version">仅展示方向</span></div><div class="placeholder-form"><div><span>占位模块</span><strong>${type}</strong></div><div><span>后续方向</span><strong>${direction}</strong></div><div><span>当前说明</span><strong>${description}</strong></div></div></article><article class="panel workflow-panel"><span class="kicker">FUTURE DIRECTION</span><h3>后续执行方向</h3><div class="workflow-steps"><span>单据记录</span><b>→</b><span>审核确认</span><b>→</b><span>库存影响</span></div><p>以上仅为后续方向说明；当前演示不填写、不保存、不提交、不审核，也不修改库存。</p></article></div>`;
}

function skeletonNotice(title, message) {
  return `<div class="skeleton-notice"><div><span class="eyebrow">LUFUTA LITE / PHASE 4 DEMO</span><strong>${title}</strong><p>${message}</p></div><span class="phase-chip">只读演示</span></div>`;
}

// Legacy MRP Lite simulation pages remain as technical reference only. Their future use must
// be decided by the Lufuta roadmap instead of restoring the old business route by default.
function ordersPage() {
  const total = data.orders.reduce((s, o) => s + Number(o.orderQty || 0), 0);
  return `${skeletonNotice('订单模拟 / 缺料分析', '输入产品数量后，系统按“订单数量 → BOM 用量 → 库存扣减 → 状态判断”模拟物料需求。结果仅供 Lite 阶段辅助判断，不等同于正式生产计划、采购建议或交期承诺，也不会生成采购单、生产单、销售订单或库存单据。')}<div class="split-layout"><div><div class="page-intro"><p>输入本次模拟数量，系统将展开产品 BOM 并汇总物料需求。</p></div><article class="panel order-form"><div class="panel-head"><div><span class="kicker">ORDER SIMULATION</span><h3>本次模拟订单</h3></div><span class="draft">演示数据</span></div><div class="order-lines">${data.products.map((p) => { const order = data.orders.find((o) => o.productId === p.id); return `<label class="order-line"><div class="product-badge">${p.code.slice(-1)}</div><div class="grow"><strong>${p.code}</strong><small>${p.name} · ${p.model}</small></div><div class="qty-control"><button type="button" data-step="-10" data-id="${p.id}">−</button><input type="number" min="0" step="1" value="${order?.orderQty || 0}" data-order="${p.id}"/><button type="button" data-step="10" data-id="${p.id}">＋</button></div><span>台</span></label>` }).join('')}</div><div class="order-footer"><div><span>模拟数量合计</span><strong id="order-total">${format(total)} 台</strong></div><button class="primary large" data-action="analyze">查看缺料分析 ${icon('chart', 18)}</button></div></article></div><aside class="logic-card"><span class="kicker">CALCULATION LOGIC</span><h3>系统如何计算？</h3><div class="logic-step"><b>01</b><div><strong>读取模拟数量</strong><p>汇总各产品计划生产台数</p></div></div><div class="logic-step"><b>02</b><div><strong>展开 BOM</strong><p>模拟数量 × 每台物料用量</p></div></div><div class="logic-step"><b>03</b><div><strong>合并物料需求</strong><p>同一物料跨产品自动加总</p></div></div><div class="logic-step"><b>04</b><div><strong>库存与安全线判断</strong><p>生成充足、库存低、缺料状态</p></div></div><div class="formula">总需求 = Σ (模拟数量 × 单台用量)</div></aside></div>`;
}

function analysisPage(results) {
  const { shortageCount: shortage, lowStockCount: low } = getInventoryStatusCounts(results);
  return `${skeletonNotice('缺料分析结果', '结果来自当前模拟数量、BOM 与演示库存，仅用于风险判断。它不是正式生产计划、采购建议单或交期承诺，不会触发采购、生产或库存业务。')}<div class="analysis-banner"><div><span class="eyebrow">ANALYSIS COMPLETE</span><h2>缺料分析已完成</h2><p>基于 ${data.orders.filter((o) => o.orderQty > 0).length} 个产品、${format(data.orders.reduce((s,o) => s + Number(o.orderQty), 0))} 台模拟数量的即时结果</p></div><div class="banner-metrics"><div><strong>${shortage}</strong><span>项缺料</span></div><div><strong>${low}</strong><span>项库存低</span></div></div></div><article class="panel table-panel"><div class="panel-head"><div><span class="kicker">MATERIAL REQUIREMENTS</span><h3>物料需求明细</h3></div><button class="secondary" data-page="orders">← 修改模拟数量</button></div>${results.length ? `${tableScrollHint()}<div class="table-wrap"><table class="analysis-table"><thead><tr><th>物料</th><th>需求数量</th><th>当前库存</th><th>安全库存</th><th>预计剩余</th><th>缺口</th><th>状态</th></tr></thead><tbody>${results.map((r) => `<tr class="status-row-${r.status}"><td><div class="cell-main"><div class="material-avatar small">${r.name[0]}</div><div><strong>${r.name}</strong><small>${r.code}</small></div></div></td><td><strong>${format(r.requiredQty)}</strong> ${r.unit}</td><td>${format(r.stockQty)} ${r.unit}</td><td>${format(r.safetyStock)} ${r.unit}</td><td class="${r.status === '缺料' ? 'danger-text' : r.status === '库存低' ? 'warning-text' : ''}">${format(r.remainingQty)} ${r.unit}</td><td><strong class="${r.shortageQty ? 'danger-text' : 'muted'}">${format(r.shortageQty)}</strong></td><td>${badge(r.status)}</td></tr>`).join('')}</tbody></table></div>` : empty('暂无需求结果', '请先在订单模拟中输入产品数量。')}</article><div class="rule-note"><strong>状态判断规则</strong><span><i class="dot red"></i>库存 &lt; 需求：缺料</span><span><i class="dot yellow"></i>库存 ≥ 需求，但剩余 &lt; 安全库存：库存低</span><span><i class="dot green"></i>其余：充足</span></div>`;
}

function empty(title, desc) { return `<div class="empty"><div>✓</div><strong>${title}</strong><p>${desc}</p></div>`; }

function render() {
  const renderers = {
    dashboard,
    materials: () => `${skeletonNotice('物料资料', '当前只读展示 Lite 阶段的物料编码、名称、分类、单位与采购周期。采购周期属于物料主数据，用于后续交期风险和采购时点分析。本阶段不提供维护表单，也不代表供应商报价、采购合同、财务成本或 ERP 正式主数据。')}${materialsPage()}`,
    'product-bom': productBomPage,
    inventory: inventoryPage,
    'warehouse-alerts': warehouseAlertsPage,
    'delivery-risk': deliveryRiskPage,
    audit: auditPage,
    inbound: () => documentPlaceholder('入库占位', '后续可记录到货入库方向', '当前不提供入库单填写、保存、审核或库存增加。'),
    outbound: () => documentPlaceholder('领料占位', '后续可记录领料出库方向', '当前不提供领料单填写、保存、审核或库存扣减。'),
    'supplier-return': () => documentPlaceholder('退货占位', '后续可记录退回供应商方向', '当前不提供退货单填写、保存、审核或库存扣减。'),
  };
  document.querySelector('#app').innerHTML = appShell(renderers[currentPage]());
  bindEvents();
}

function navigate(page) { currentPage = page; history.replaceState(null, '', `#${page}`); render(); window.scrollTo(0, 0); }

function bindEvents() {
  document.querySelectorAll('[data-page]').forEach((el) => el.addEventListener('click', () => navigate(el.dataset.page)));
  document.querySelectorAll('[data-product-tab]').forEach((el) => el.addEventListener('click', () => { sessionStorage.setItem('selectedProduct', el.dataset.productTab); render(); }));
  document.querySelectorAll('[data-delivery-risk-input]').forEach((input) => input.addEventListener('input', () => {
    deliveryRiskInputState[input.name] = input.value;
    deliveryRiskPreview = null;
    document.querySelector('[data-delivery-risk-preview]')?.remove();
    document.querySelector('[data-procurement-recommendation-view]')?.remove();
    document.querySelector('[data-delivery-risk-legend]')?.remove();
    const decisionSummary = document.querySelector('[data-order-decision-summary]');
    if (decisionSummary) decisionSummary.outerHTML = orderDecisionSummaryPanel();
    const feasibility = document.querySelector('[data-delivery-feasibility]');
    if (feasibility) feasibility.outerHTML = deliveryFeasibilityPanel();
    const priorityGroups = document.querySelector('[data-procurement-priority-groups]');
    if (priorityGroups) priorityGroups.outerHTML = procurementPriorityGroupsPanel();
  }));
  document.querySelectorAll('[data-order]').forEach((input) => input.addEventListener('input', () => updateOrder(input.dataset.order, input.value)));
  document.querySelectorAll('[data-step]').forEach((btn) => btn.addEventListener('click', () => { const input = document.querySelector(`[data-order="${btn.dataset.id}"]`); input.value = Math.max(0, Number(input.value) + Number(btn.dataset.step)); updateOrder(btn.dataset.id, input.value); }));
  document.querySelectorAll('[data-action]').forEach((el) => el.addEventListener('click', () => handleAction(el.dataset.action, el.dataset)));
  document.querySelector('[data-table-search]')?.addEventListener('input', (e) => { document.querySelectorAll('tbody tr').forEach((row) => row.hidden = !row.textContent.toLowerCase().includes(e.target.value.toLowerCase())); });
}

function updateOrder(productId, qty) {
  let order = data.orders.find((o) => o.productId === productId);
  if (!order) { order = { productId, orderQty: 0 }; data.orders.push(order); }
  order.orderQty = Math.max(0, Number(qty) || 0);
  saveData(data);
  const total = data.orders.reduce((s, o) => s + Number(o.orderQty), 0);
  const totalEl = document.querySelector('#order-total'); if (totalEl) totalEl.textContent = `${format(total)} 台`;
}

function handleAction(action, dataset) {
  if (action === 'delivery-risk-placeholder') {
    const product = productService.listProducts().find((item) => item.id === deliveryRiskInputState.selectedProductId);
    if (!product) return toast('请选择产品');
    if (!deliveryRiskInputState.plannedQty || Number(deliveryRiskInputState.plannedQty) <= 0) return toast('请输入有效计划数量');
    if (!deliveryRiskInputState.requiredDate) return toast('请选择期望交期');
    if (!deliveryRiskInputState.asOfDate) return toast('请选择分析日期');
    const plannedQty = Number(deliveryRiskInputState.plannedQty);
    const materials = materialService.listMaterials();
    const balances = inventoryService.listBalances();
    const rows = productService.listBOMItems(product.id).map((item) => {
      const material = materials.find((candidate) => candidate.id === item.materialId);
      const inventoryBalance = balances.find((balance) => balance.materialId === item.materialId);
      return {
        material,
        qtyPerProduct: Number(item.qtyPerProduct),
        requiredQty: Number(item.qtyPerProduct) * plannedQty,
        stockQty: Number(inventoryBalance?.stockQty ?? 0),
        safetyStock: Number(inventoryBalance?.safetyStock ?? 0),
        procurementLeadTimeDays: resolveProcurementLeadTimeDays(material, inventoryBalance),
      };
    }).filter((row) => row.material).map((row) => {
      const risk = calculateProcurementRisk({
        requiredQty: row.requiredQty,
        stockQty: row.stockQty,
        safetyStock: row.safetyStock,
        procurementLeadTimeDays: row.procurementLeadTimeDays,
        requiredDate: deliveryRiskInputState.requiredDate,
        asOfDate: deliveryRiskInputState.asOfDate,
      });
      const resultRow = {
        ...row,
        shortageQty: risk.shortageQty,
        remainingQty: risk.remainingQty,
        riskLevel: risk.riskLevel,
        quantityRisk: risk.quantityRisk,
        mustOrderNow: risk.mustOrderNow,
        latestOrderDate: risk.latestOrderDate,
        expectedArrivalDate: risk.expectedArrivalDate,
        deliveryRiskLabel: risk.shortageQty === 0 ? '可满足' : DELIVERY_RISK_LABELS[risk.riskLevel],
        deliveryRiskReason: risk.shortageQty === 0 ? '库存可覆盖本次需求' : DELIVERY_RISK_REASONS[risk.riskLevel],
      };
      return { ...resultRow, recommendation: buildProcurementRecommendation(resultRow) };
    });
    deliveryRiskPreview = { product, plannedQty, requiredDate: deliveryRiskInputState.requiredDate, asOfDate: deliveryRiskInputState.asOfDate, rows };
    render();
    return toast(rows.length ? '交期风险等级预览已生成' : '当前产品尚未维护 BOM，无法生成需求预览');
  }
  if (action === 'analyze') return navigate('analysis');
  if (action === 'reset-data') {
    if (!window.confirm('确定要重置当前原型数据吗？')) return;
    storageAdapter.reset();
    repository.reload();
    data = repository.getSnapshot();
    sessionStorage.removeItem('selectedProduct');
    render();
    return toast('原型数据已重置');
  }
  if (action === 'add-product' || action === 'edit-product') return productModal(dataset.id);
  if (action === 'add-material' || action === 'edit-material') return materialModal(dataset.id);
  if (action === 'add-bom' || action === 'edit-bom') return bomModal(dataset.product, dataset.material);
  if (action === 'edit-inventory') return inventoryModal(dataset.id);
}

// These edit-modal helpers belong to the retained legacy pages above. Current Phase 1 pages
// are read-only or placeholders, so the helpers are not part of the accepted navigation flow.
function showModal(title, body, onSubmit) {
  const root = document.querySelector('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><form class="modal"><div class="modal-head"><div><span class="kicker">LUFUTA LITE</span><h3>${title}</h3></div><button type="button" class="modal-close">×</button></div><div class="modal-body">${body}</div><div class="modal-actions"><button type="button" class="secondary modal-cancel">取消</button><button class="primary" type="submit">保存</button></div></form></div>`;
  const close = () => root.innerHTML = '';
  root.querySelector('.modal-close').onclick = close; root.querySelector('.modal-cancel').onclick = close; root.querySelector('.modal-backdrop').onclick = (e) => { if (e.target === e.currentTarget) close(); };
  root.querySelector('form').onsubmit = (e) => { e.preventDefault(); onSubmit(new FormData(e.target)); saveData(data); close(); render(); toast('保存成功，相关数据已更新'); };
}

const field = (label, name, value = '', type = 'text', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${value}" ${extra} required /></label>`;

function productModal(id) {
  const item = data.products.find((p) => p.id === id);
  showModal(item ? '编辑产品' : '新增产品', `${field('产品编码', 'code', item?.code)}${field('产品名称', 'name', item?.name)}${field('规格型号', 'model', item?.model)}`, (fd) => { const value = Object.fromEntries(fd); if (item) Object.assign(item, value); else data.products.push({ id: `p${Date.now()}`, ...value }); });
}
function materialModal(id) {
  const item = data.materials.find((m) => m.id === id);
  showModal(item ? '编辑物料' : '新增物料', `${field('物料编码', 'code', item?.code)}${field('物料名称', 'name', item?.name)}${field('分类', 'category', item?.category)}${field('单位', 'unit', item?.unit)}`, (fd) => { const value = Object.fromEntries(fd); if (item) Object.assign(item, value); else { const newItem = { id: `m${Date.now()}`, ...value }; data.materials.push(newItem); data.inventory.push({ materialId: newItem.id, stockQty: 0, safetyStock: 0, leadTimeDays: 0 }); } });
}
function inventoryModal(id) {
  const m = data.materials.find((x) => x.id === id); let inv = data.inventory.find((x) => x.materialId === id);
  showModal(`更新库存 · ${m.name}`, `${field('当前库存', 'stockQty', inv?.stockQty || 0, 'number', 'min="0" step="0.01"')}${field('安全库存', 'safetyStock', inv?.safetyStock || 0, 'number', 'min="0" step="0.01"')}${field('采购提前期（天）', 'leadTimeDays', inv?.leadTimeDays || 0, 'number', 'min="0" step="1"')}`, (fd) => { const value = Object.fromEntries(fd); Object.keys(value).forEach((k) => value[k] = Number(value[k])); if (inv) Object.assign(inv, value); else data.inventory.push({ materialId: id, ...value }); });
}
function bomModal(productId, materialId) {
  const selected = productId || sessionStorage.getItem('selectedProduct') || data.products[0].id; const item = data.bom.find((b) => b.productId === selected && b.materialId === materialId);
  const options = data.materials.map((m) => `<option value="${m.id}" ${m.id === materialId ? 'selected' : ''}>${m.code} · ${m.name}</option>`).join('');
  showModal(item ? '编辑 BOM 用量' : `添加 BOM 物料 · ${productName(selected)}`, `<label class="field"><span>物料</span><select name="materialId" ${item ? 'disabled' : ''}>${options}</select></label>${field('单台用量', 'qtyPerProduct', item?.qtyPerProduct || 1, 'number', 'min="0.01" step="0.01"')}`, (fd) => { const value = Object.fromEntries(fd); value.qtyPerProduct = Number(value.qtyPerProduct); if (item) Object.assign(item, value); else { const exists = data.bom.find((b) => b.productId === selected && b.materialId === value.materialId); if (exists) exists.qtyPerProduct = value.qtyPerProduct; else data.bom.push({ productId: selected, ...value }); } });
}

function toast(message) { const el = document.querySelector('#toast'); el.textContent = `✓ ${message}`; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400); }

const hashPage = location.hash.slice(1); if (pages.some(([id]) => id === hashPage)) currentPage = hashPage;
render();
