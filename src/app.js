import { initialData } from './data.js';
import { calculateMaterialRequirements, getInventoryStatusCounts, getSummary } from './mrp.js';
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

const pages = [
  ['dashboard', '首页', 'grid'], ['materials', '物料资料', 'layers'], ['product-bom', '产品 / BOM', 'git'],
  ['inventory', '库存台账', 'warehouse'], ['audit', '待审核流水', 'chart'], ['inbound', '入库', 'box'],
  ['outbound', '领料', 'cart'], ['supplier-return', '供应商退货', 'warehouse'],
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

function appShell(content) {
  const active = pages.find((p) => p[0] === currentPage);
  return `<div class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">L</div><div><strong>LUFUTA LITE</strong><small>物料管理系统</small></div></div>
      <nav><p>Phase 1 工作台</p>${pages.map(([id, label, ico]) => `<button class="nav-item ${currentPage === id ? 'active' : ''}" data-page="${id}">${icon(ico)}<span>${label}</span></button>`).join('')}</nav>
      <div class="sidebar-footer"><div class="demo-dot"></div><div><strong>Phase 1 原型</strong><small>当前使用浏览器存储</small></div><button class="reset-button" data-action="reset-data" title="重置原型数据"><b>↺</b><span>重置原型数据</span></button></div>
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
  const pendingDocuments = auditService.listPendingDocuments();
  const lowStockCount = balances.filter((row) => Number(row.stockQty) < Number(row.safetyStock)).length;
  return `<div class="hero"><div><span class="eyebrow">PHASE 1 FOUNDATION</span><h2>Lufuta 物料管理系统 Lite</h2><p>当前汇总演示数据，用于快速查看产品、物料、BOM、库存与业务入口概况；不代表真实库存账、正式生产计划或采购计划。</p></div><span class="phase-chip">Lite 演示 · 浏览器数据</span></div>
    <div class="stats-grid">${statCard('物料资料', materials.length, '当前演示资料', 'violet', 'layers')}${statCard('产品 / BOM', products.length, '当前演示产品', 'blue', 'box')}${statCard('库存风险', lowStockCount, '按演示库存汇总', 'amber', 'warehouse')}${statCard('待审核流水', pendingDocuments.length, '当前只读记录', 'red', 'chart')}</div>
    <div class="dashboard-grid"><article class="panel"><div class="panel-head"><div><span class="kicker">MASTER DATA</span><h3>基础资料入口</h3></div></div><div class="entry-grid"><button class="entry-card" data-page="materials">${icon('layers', 22)}<span><strong>物料资料</strong><small>编码、名称、分类与单位</small></span></button><button class="entry-card" data-page="product-bom">${icon('git', 22)}<span><strong>产品 / BOM</strong><small>产品与物料组成关系</small></span></button><button class="entry-card" data-page="inventory">${icon('warehouse', 22)}<span><strong>库存台账</strong><small>只读查看当前库存骨架</small></span></button></div></article>
    <article class="panel"><div class="panel-head"><div><span class="kicker">CONTROL POOL</span><h3>待审核与日常入口</h3></div><button class="text-button" data-page="audit">查看只读审核池 →</button></div><div class="flow-strip"><span>规划：单据保存</span><b>→</b><span>待审核流水</span><b>→</b><span>审核后影响库存</span></div><div class="placeholder-copy"><strong>Phase 1 仅展示规划链路</strong><p>本阶段未实现单据保存、真实审核、库存过账、API 或数据库。</p></div></article></div>`;
}

function tablePage({ title, description, action, columns, rows }) {
  return `<div class="page-intro"><div><p>${description}</p></div>${action || ''}</div><article class="panel table-panel"><div class="table-meta"><span>共 <strong>${rows.length}</strong> 条记录</span><div class="search">⌕ <input placeholder="在当前列表中筛选…" data-table-search /></div></div><div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div></article>`;
}

function productsPage() {
  return `${skeletonNotice('产品资料', '用于维护 Lite 阶段的产品编码、名称与规格，供 BOM 和缺料计算验证使用。当前不包含产品审批、版本冻结、生命周期管理或客户订单绑定。')}${tablePage({ description: '当前记录保存在浏览器中，仅用于业务演示与结构验证。', action: `<button class="primary" data-action="add-product">${icon('plus', 17)} 新增产品</button>`, columns: ['产品编码', '产品名称', '规格型号', 'BOM 物料数', '操作'], rows: data.products.map((p) => `<tr><td><strong class="code">${p.code}</strong></td><td>${p.name}</td><td><span class="soft-tag">${p.model}</span></td><td>${new Set(data.bom.filter((b) => b.productId === p.id).map((b) => b.materialId)).size} 项</td><td><button class="icon-btn" title="编辑" data-action="edit-product" data-id="${p.id}">${icon('edit', 16)}</button></td></tr>`) })}`;
}

function materialsPage() {
  const materials = materialService.listMaterials();
  const bomItems = productService.listBOMItems();
  return tablePage({ description: '只读查看当前 Lite 物料资料及其 BOM 引用关系。', columns: ['物料编码', '物料名称', '分类', '单位', '引用 BOM', '当前阶段'], rows: materials.map((m) => `<tr><td><strong class="code">${m.code}</strong></td><td>${m.name}</td><td><span class="soft-tag">${m.category}</span></td><td>${m.unit}</td><td>${bomItems.filter((b) => b.materialId === m.id).length} 个产品</td><td><span class="muted">只读</span></td></tr>`) });
}

function bomPage() {
  const selected = sessionStorage.getItem('selectedProduct') || data.products[0]?.id;
  const items = data.bom.filter((b) => b.productId === selected);
  return `${skeletonNotice('BOM 用量关系', '用于维护产品与物料之间的单台用量，订单模拟会据此展开物料需求。当前不包含 BOM 审核、工程变更、版本发布或历史版本追踪。')}<div class="page-intro"><p>当前 BOM 保存在浏览器中，仅用于 Lite 计算验证。</p><button class="primary" data-action="add-bom">${icon('plus', 17)} 添加物料</button></div><div class="product-tabs">${data.products.map((p) => `<button class="product-tab ${p.id === selected ? 'active' : ''}" data-product-tab="${p.id}"><small>${p.model}</small><strong>${p.code}</strong><span>${data.bom.filter((b) => b.productId === p.id).length} 项物料</span></button>`).join('')}</div><article class="panel table-panel"><div class="panel-head bom-title"><div><span class="kicker">BILL OF MATERIALS</span><h3>${productName(selected)} 物料清单</h3></div><span class="version">Lite 演示数据</span></div><div class="table-wrap"><table><thead><tr><th>序号</th><th>物料编码</th><th>物料名称</th><th>分类</th><th>单台用量</th><th>单位</th><th>操作</th></tr></thead><tbody>${items.map((b, i) => { const m = data.materials.find((x) => x.id === b.materialId); return `<tr><td class="muted">${String(i + 1).padStart(2, '0')}</td><td><strong class="code">${m.code}</strong></td><td>${m.name}</td><td><span class="soft-tag">${m.category}</span></td><td><strong>${b.qtyPerProduct}</strong></td><td>${m.unit}</td><td><button class="icon-btn" data-action="edit-bom" data-product="${selected}" data-material="${m.id}">${icon('edit', 16)}</button></td></tr>` }).join('')}</tbody></table></div></article>`;
}

function inventoryPage() {
  const materials = materialService.listMaterials();
  const balances = inventoryService.listBalances();
  return `${skeletonNotice('库存台账', '当前只读展示 Lite 阶段的演示库存，用于安全库存与缺料风险判断。这里不是真实库存账，本阶段不提供入库、出库、冻结、盘点、过账、批次或库位管理。')}${tablePage({ description: '库存数量来自浏览器中的演示数据，不会生成库存单据。', columns: ['物料', '当前库存', '安全库存', '风险状态', '仓位 / 库位', '最后更新'], rows: materials.map((m) => { const inv = balances.find((i) => i.materialId === m.id) || { stockQty: 0, safetyStock: 0 }; const low = Number(inv.stockQty) < Number(inv.safetyStock); return `<tr><td><div class="cell-main"><div class="material-avatar small">${m.name[0]}</div><div><strong>${m.name}</strong><small>${m.code}</small></div></div></td><td><strong>${format(inv.stockQty)}</strong> ${m.unit}</td><td>${format(inv.safetyStock)} ${m.unit}</td><td><span class="stock-level ${low ? 'bad' : ''}"><i></i>${low ? '低于安全线' : '正常'}</span></td><td><span class="muted">未启用</span></td><td><span class="muted">演示数据</span></td></tr>` }) })}`;
}

function productBomPage() {
  const products = productService.listProducts();
  const materials = materialService.listMaterials();
  const selected = sessionStorage.getItem('selectedProduct') || products[0]?.id;
  const items = productService.listBOMItems(selected);
  const selectedProduct = products.find((product) => product.id === selected);
  return `${skeletonNotice('产品 / BOM', '当前只读展示 Lite 产品基础资料及其物料用量关系，供结构验证和后续缺料计算使用。产品侧不含审批、版本冻结、生命周期或客户订单绑定；BOM 侧不含审核、工程变更、版本发布或历史追踪。')}<div class="product-tabs">${products.map((p) => `<button class="product-tab ${p.id === selected ? 'active' : ''}" data-product-tab="${p.id}"><small>${p.model}</small><strong>${p.code}</strong><span>${productService.listBOMItems(p.id).length} 项物料</span></button>`).join('')}</div><article class="panel table-panel"><div class="panel-head bom-title"><div><span class="kicker">PRODUCT / BOM SKELETON</span><h3>${selectedProduct?.code || '未知产品'} 物料组成</h3></div><span class="version">Phase 1 · 只读演示</span></div><div class="table-wrap"><table><thead><tr><th>序号</th><th>物料编码</th><th>物料名称</th><th>分类</th><th>单台用量</th><th>单位</th><th>BOM 版本</th></tr></thead><tbody>${items.map((row, index) => { const material = materials.find((m) => m.id === row.materialId); if (!material) return ''; return `<tr><td class="muted">${String(index + 1).padStart(2, '0')}</td><td><strong class="code">${material.code}</strong></td><td>${material.name}</td><td><span class="soft-tag">${material.category}</span></td><td><strong>${row.qtyPerProduct}</strong></td><td>${material.unit}</td><td><span class="muted">未启用</span></td></tr>`; }).join('')}</tbody></table></div></article>`;
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
  return `${skeletonNotice('待审核流水 / 审核池', '当前只读展示朋友蓝图中的待审核记录结构，用于验证未来业务链路。本阶段不执行单据保存、真实审批、权限判断或库存过账。')}<article class="panel table-panel"><div class="panel-head"><div><span class="kicker">PENDING DOCUMENTS</span><h3>待审核业务记录</h3></div><span class="version">${pendingDocuments.length} 条 · 只读演示</span></div><div class="table-wrap"><table><thead><tr><th>单据编号</th><th>单据类型</th><th>申请人</th><th>提交时间</th><th>库存影响</th><th>风险标记</th><th>审核状态</th></tr></thead><tbody>${body}</tbody></table></div></article>`;
}

function documentPlaceholder(type, direction, description) {
  return `${skeletonNotice(type, `当前仅展示${type}业务入口及未来库存方向，不提供单据填写、保存、提交或审核。这里不会修改库存，也不会连接 API 或数据库。`)}<div class="document-shell"><article class="panel"><div class="panel-head"><div><span class="kicker">DOCUMENT ENTRY</span><h3>${type}单据骨架</h3></div><span class="version">仅作流程说明</span></div><div class="placeholder-form"><div><span>业务类型</span><strong>${type}</strong></div><div><span>未来库存方向</span><strong>${direction}</strong></div><div><span>当前说明</span><strong>${description}</strong></div></div></article><article class="panel workflow-panel"><span class="kicker">PLANNED BUSINESS FLOW</span><h3>规划中的业务链路</h3><div class="workflow-steps"><span>填写单据</span><b>→</b><span>保存待审核</span><b>→</b><span>审核通过</span><b>→</b><span>${direction}</span></div><p>以上仅为蓝图流程说明，Phase 1 不执行这些动作。</p></article></div>`;
}

function skeletonNotice(title, message) {
  return `<div class="skeleton-notice"><div><span class="eyebrow">LUFUTA LITE / PHASE 1</span><strong>${title}</strong><p>${message}</p></div><span class="phase-chip">演示与验证</span></div>`;
}

function ordersPage() {
  const total = data.orders.reduce((s, o) => s + Number(o.orderQty || 0), 0);
  return `${skeletonNotice('订单模拟 / 缺料分析', '输入产品数量后，系统按“订单数量 → BOM 用量 → 库存扣减 → 状态判断”模拟物料需求。结果仅供 Lite 阶段辅助判断，不等同于正式生产计划、采购建议或交期承诺，也不会生成采购单、生产单、销售订单或库存单据。')}<div class="split-layout"><div><div class="page-intro"><p>输入本次模拟数量，系统将展开产品 BOM 并汇总物料需求。</p></div><article class="panel order-form"><div class="panel-head"><div><span class="kicker">ORDER SIMULATION</span><h3>本次模拟订单</h3></div><span class="draft">演示数据</span></div><div class="order-lines">${data.products.map((p) => { const order = data.orders.find((o) => o.productId === p.id); return `<label class="order-line"><div class="product-badge">${p.code.slice(-1)}</div><div class="grow"><strong>${p.code}</strong><small>${p.name} · ${p.model}</small></div><div class="qty-control"><button type="button" data-step="-10" data-id="${p.id}">−</button><input type="number" min="0" step="1" value="${order?.orderQty || 0}" data-order="${p.id}"/><button type="button" data-step="10" data-id="${p.id}">＋</button></div><span>台</span></label>` }).join('')}</div><div class="order-footer"><div><span>模拟数量合计</span><strong id="order-total">${format(total)} 台</strong></div><button class="primary large" data-action="analyze">查看缺料分析 ${icon('chart', 18)}</button></div></article></div><aside class="logic-card"><span class="kicker">CALCULATION LOGIC</span><h3>系统如何计算？</h3><div class="logic-step"><b>01</b><div><strong>读取模拟数量</strong><p>汇总各产品计划生产台数</p></div></div><div class="logic-step"><b>02</b><div><strong>展开 BOM</strong><p>模拟数量 × 每台物料用量</p></div></div><div class="logic-step"><b>03</b><div><strong>合并物料需求</strong><p>同一物料跨产品自动加总</p></div></div><div class="logic-step"><b>04</b><div><strong>库存与安全线判断</strong><p>生成充足、库存低、缺料状态</p></div></div><div class="formula">总需求 = Σ (模拟数量 × 单台用量)</div></aside></div>`;
}

function analysisPage(results) {
  const { shortageCount: shortage, lowStockCount: low } = getInventoryStatusCounts(results);
  return `${skeletonNotice('缺料分析结果', '结果来自当前模拟数量、BOM 与演示库存，仅用于风险判断。它不是正式生产计划、采购建议单或交期承诺，不会触发采购、生产或库存业务。')}<div class="analysis-banner"><div><span class="eyebrow">ANALYSIS COMPLETE</span><h2>缺料分析已完成</h2><p>基于 ${data.orders.filter((o) => o.orderQty > 0).length} 个产品、${format(data.orders.reduce((s,o) => s + Number(o.orderQty), 0))} 台模拟数量的即时结果</p></div><div class="banner-metrics"><div><strong>${shortage}</strong><span>项缺料</span></div><div><strong>${low}</strong><span>项库存低</span></div></div></div><article class="panel table-panel"><div class="panel-head"><div><span class="kicker">MATERIAL REQUIREMENTS</span><h3>物料需求明细</h3></div><button class="secondary" data-page="orders">← 修改模拟数量</button></div>${results.length ? `<div class="table-wrap"><table class="analysis-table"><thead><tr><th>物料</th><th>需求数量</th><th>当前库存</th><th>安全库存</th><th>预计剩余</th><th>缺口</th><th>状态</th></tr></thead><tbody>${results.map((r) => `<tr class="status-row-${r.status}"><td><div class="cell-main"><div class="material-avatar small">${r.name[0]}</div><div><strong>${r.name}</strong><small>${r.code}</small></div></div></td><td><strong>${format(r.requiredQty)}</strong> ${r.unit}</td><td>${format(r.stockQty)} ${r.unit}</td><td>${format(r.safetyStock)} ${r.unit}</td><td class="${r.status === '缺料' ? 'danger-text' : r.status === '库存低' ? 'warning-text' : ''}">${format(r.remainingQty)} ${r.unit}</td><td><strong class="${r.shortageQty ? 'danger-text' : 'muted'}">${format(r.shortageQty)}</strong></td><td>${badge(r.status)}</td></tr>`).join('')}</tbody></table></div>` : empty('暂无需求结果', '请先在订单模拟中输入产品数量。')}</article><div class="rule-note"><strong>状态判断规则</strong><span><i class="dot red"></i>库存 &lt; 需求：缺料</span><span><i class="dot yellow"></i>库存 ≥ 需求，但剩余 &lt; 安全库存：库存低</span><span><i class="dot green"></i>其余：充足</span></div>`;
}

function empty(title, desc) { return `<div class="empty"><div>✓</div><strong>${title}</strong><p>${desc}</p></div>`; }

function render() {
  const renderers = {
    dashboard,
    materials: () => `${skeletonNotice('物料资料', '当前只读展示 Lite 阶段的物料编码、名称、分类与单位，供 BOM 关系和后续计算验证使用。本阶段不提供维护表单，也不代表供应商报价、采购合同、财务成本或 ERP 正式主数据。')}${materialsPage()}`,
    'product-bom': productBomPage,
    inventory: inventoryPage,
    audit: auditPage,
    inbound: () => documentPlaceholder('入库', '审核通过后库存增加', '后续将承载供应商到货入库。'),
    outbound: () => documentPlaceholder('领料', '审核通过后库存减少', '后续可从产品 BOM 带入领料需求。'),
    'supplier-return': () => documentPlaceholder('供应商退货', '审核通过后库存减少', '这里指退回供应商，不是生产退料。'),
  };
  document.querySelector('#app').innerHTML = appShell(renderers[currentPage]());
  bindEvents();
}

function navigate(page) { currentPage = page; history.replaceState(null, '', `#${page}`); render(); window.scrollTo(0, 0); }

function bindEvents() {
  document.querySelectorAll('[data-page]').forEach((el) => el.addEventListener('click', () => navigate(el.dataset.page)));
  document.querySelectorAll('[data-product-tab]').forEach((el) => el.addEventListener('click', () => { sessionStorage.setItem('selectedProduct', el.dataset.productTab); render(); }));
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
