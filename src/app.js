import { DEFAULT_DELIVERY_DATE, DEFAULT_LEAD_TIME_DAYS, initialData } from './data.js';
import { calculateDecisionResults } from './decision.js';
import { calculateMaterialRequirements, getInventoryStatusCounts, getSummary } from './mrp.js';
import { loadData, resetStoredData, saveData } from './storage.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
let data = loadData(initialData);
let currentPage = 'dashboard';
let toastTimer;

const pages = [
  ['dashboard', '概览', 'grid'], ['products', '产品管理', 'box'], ['materials', '物料管理', 'layers'],
  ['bom', 'BOM 管理', 'git'], ['inventory', '库存管理', 'warehouse'], ['orders', '订单模拟', 'cart'], ['analysis', '缺料分析', 'chart'],
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
const RISK_LABELS = { OK: '正常', 'Action Required': '需要行动', 'High Risk': '高风险' };
const RISK_TONES = { OK: 'success', 'Action Required': 'warning', 'High Risk': 'danger' };
const ACTION_LABELS = {
  no_action_required: '当前可按计划推进',
  purchase_action_required: '今天确认采购安排，锁定到料时间',
  delivery_risk_action_required: '采购周期已超交付窗口，立即协调交期或数量',
};
const decisionBadge = (riskLevel) => `<span class="badge badge-${RISK_TONES[riskLevel]}"><i></i>${RISK_LABELS[riskLevel]}</span>`;
const getDecisionRiskCounts = (results) => ({
  high: results.filter((result) => result.riskLevel === 'High Risk').length,
  action: results.filter((result) => result.riskLevel === 'Action Required').length,
  ok: results.filter((result) => result.riskLevel === 'OK').length,
});

function appShell(content, results) {
  const active = pages.find((p) => p[0] === currentPage);
  const statusCounts = getInventoryStatusCounts(results);
  return `<div class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">M</div><div><strong>MRP LITE</strong><small>物料需求计划</small></div></div>
      <nav><p>工作台</p>${pages.map(([id, label, ico]) => `<button class="nav-item ${currentPage === id ? 'active' : ''}" data-page="${id}">${icon(ico)}<span>${label}</span>${id === 'analysis' && statusCounts.shortageCount ? `<b>${statusCounts.shortageCount}</b>` : ''}</button>`).join('')}</nav>
      <div class="sidebar-footer"><div class="demo-dot"></div><div><strong>演示环境</strong><small>数据保存在此浏览器</small></div><button class="reset-button" data-action="reset-data" title="重置演示数据"><b>↺</b><span>重置演示数据</span></button></div>
    </aside>
    <main><header><div><small>MRP LITE V1 / ${active[1]}</small><h1>${active[1]}</h1></div><div class="header-actions"><span class="date">${new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</span><button class="avatar">演</button></div></header><section class="content">${content}</section></main>
    <div id="modal-root"></div><div id="toast" class="toast"></div>
  </div>`;
}

function statCard(label, value, hint, tone, ico) {
  return `<article class="stat-card"><div class="stat-icon ${tone}">${icon(ico, 22)}</div><div><span>${label}</span><strong>${value}</strong><small>${hint}</small></div></article>`;
}

function dashboard(results) {
  const summary = getSummary(data, results);
  const alerts = results.filter((r) => r.status !== '充足');
  const decisionResults = calculateDecisionResults(results, { materials: data.materials, today: new Date() });
  const riskCounts = getDecisionRiskCounts(decisionResults);
  return `<div class="hero"><div><span class="eyebrow">TODAY'S OVERVIEW</span><h2>早上好，生产计划一目了然。</h2><p>根据当前模拟订单与库存，系统已完成 BOM 展开和缺料计算。</p></div><button class="primary" data-page="orders">运行订单模拟 ${icon('chart', 17)}</button></div>
    <div class="stats-grid">${statCard('产品数量', summary.productCount, '已维护成品', 'blue', 'box')}${statCard('物料数量', summary.materialCount, '基础物料主数据', 'violet', 'layers')}${statCard('缺料物料', summary.shortageCount, summary.shortageCount ? '需要立即处理' : '当前无缺料', 'red', 'chart')}${statCard('库存低物料', summary.lowStockCount, '低于安全库存', 'amber', 'warehouse')}</div>
    <div class="dashboard-grid"><article class="panel"><div class="panel-head"><div><span class="kicker">需求风险</span><h3>物料预警</h3></div><button class="text-button" data-page="analysis">查看完整分析 →</button></div>${alerts.length ? `<div class="alert-list">${alerts.slice(0, 5).map((r) => { const isShortage = r.status === '缺料'; return `<div class="alert-row"><div class="material-avatar">${r.name[0]}</div><div class="grow"><strong>${r.name}</strong><small>${r.code} · 剩余 ${format(r.remainingQty)} ${r.unit}</small></div>${badge(r.status)}<div class="number ${isShortage ? 'danger' : 'warning'}"><small>${isShortage ? '缺口' : '剩余 / 安全'}</small><strong>${isShortage ? format(r.shortageQty) : `${format(r.remainingQty)} / ${format(r.safetyStock)}`}</strong></div></div>` }).join('')}</div>` : empty('没有库存预警', '所有需求物料均处于安全库存之上。')}</article>
    <article class="panel"><div class="panel-head"><div><span class="kicker">模拟订单</span><h3>当前生产组合</h3></div></div><div class="order-bars">${data.orders.map((o, i) => { const p = data.products.find((x) => x.id === o.productId); const max = Math.max(...data.orders.map((x) => x.orderQty), 1); return `<div class="bar-item"><div><strong>${p.code}</strong><span>${o.orderQty} 台</span></div><div class="bar-track"><i style="width:${o.orderQty / max * 100}%;--delay:${i * 80}ms"></i></div><small>${p.model}</small></div>` }).join('')}</div><div class="total-line"><span>模拟订单总量</span><strong>${format(data.orders.reduce((s, o) => s + Number(o.orderQty), 0))} <small>台</small></strong></div></article></div>
    <article class="decision-overview panel"><div class="panel-head"><div><span class="kicker">DECISION PRIORITY</span><h3>今天先处理什么？</h3><p>基于缺料、最早交期和采购周期，按交付风险排出处理优先级。</p></div><button class="text-button" data-page="analysis">查看决策明细 →</button></div><div class="risk-summary-grid"><button class="risk-summary-card danger" data-page="analysis"><span>高风险</span><strong>${riskCounts.high}<small> 项</small></strong><p>交付窗口不足，需立即协调交期或数量</p><b>优先处理 →</b></button><button class="risk-summary-card warning" data-page="analysis"><span>需要行动</span><strong>${riskCounts.action}<small> 项</small></strong><p>仍有采购窗口，今天确认采购安排</p><b>确认安排 →</b></button><button class="risk-summary-card success" data-page="analysis"><span>正常</span><strong>${riskCounts.ok}<small> 项</small></strong><p>当前库存可覆盖需求，可按计划推进</p><b>查看明细 →</b></button></div></article>`;
}

function tablePage({ title, description, action, columns, rows }) {
  return `<div class="page-intro"><div><p>${description}</p></div>${action || ''}</div><article class="panel table-panel"><div class="table-meta"><span>共 <strong>${rows.length}</strong> 条记录</span><div class="search">⌕ <input placeholder="在当前列表中筛选…" data-table-search /></div></div><div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div></article>`;
}

function productsPage() {
  return tablePage({ description: '维护可生产的成品资料，新增产品后即可为其配置 BOM。', action: `<button class="primary" data-action="add-product">${icon('plus', 17)} 新增产品</button>`, columns: ['产品编码', '产品名称', '规格型号', 'BOM 物料数', '操作'], rows: data.products.map((p) => `<tr><td><strong class="code">${p.code}</strong></td><td>${p.name}</td><td><span class="soft-tag">${p.model}</span></td><td>${new Set(data.bom.filter((b) => b.productId === p.id).map((b) => b.materialId)).size} 项</td><td><button class="icon-btn" title="编辑" data-action="edit-product" data-id="${p.id}">${icon('edit', 16)}</button></td></tr>`) });
}

function materialsPage() {
  return tablePage({ description: '统一管理 BOM、库存和缺料分析共用的物料主数据。', action: `<button class="primary" data-action="add-material">${icon('plus', 17)} 新增物料</button>`, columns: ['物料编码', '物料名称', '分类', '单位', '采购周期', '引用 BOM', '操作'], rows: data.materials.map((m) => `<tr><td><strong class="code">${m.code}</strong></td><td>${m.name}</td><td><span class="soft-tag">${m.category}</span></td><td>${m.unit}</td><td>${format(m.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS)} 天</td><td>${data.bom.filter((b) => b.materialId === m.id).length} 个产品</td><td><button class="icon-btn" data-action="edit-material" data-id="${m.id}">${icon('edit', 16)}</button></td></tr>`) });
}

function bomPage() {
  const selected = sessionStorage.getItem('selectedProduct') || data.products[0]?.id;
  const items = data.bom.filter((b) => b.productId === selected);
  return `<div class="page-intro"><p>BOM 定义每台产品所需的物料与数量，缺料分析将按订单自动展开。</p><button class="primary" data-action="add-bom">${icon('plus', 17)} 添加物料</button></div><div class="product-tabs">${data.products.map((p) => `<button class="product-tab ${p.id === selected ? 'active' : ''}" data-product-tab="${p.id}"><small>${p.model}</small><strong>${p.code}</strong><span>${data.bom.filter((b) => b.productId === p.id).length} 项物料</span></button>`).join('')}</div><article class="panel table-panel"><div class="panel-head bom-title"><div><span class="kicker">BILL OF MATERIALS</span><h3>${productName(selected)} 物料清单</h3></div><span class="version">V1.0 · 生效中</span></div><div class="table-wrap"><table><thead><tr><th>序号</th><th>物料编码</th><th>物料名称</th><th>分类</th><th>单台用量</th><th>单位</th><th>操作</th></tr></thead><tbody>${items.map((b, i) => { const m = data.materials.find((x) => x.id === b.materialId); return `<tr><td class="muted">${String(i + 1).padStart(2, '0')}</td><td><strong class="code">${m.code}</strong></td><td>${m.name}</td><td><span class="soft-tag">${m.category}</span></td><td><strong>${b.qtyPerProduct}</strong></td><td>${m.unit}</td><td><button class="icon-btn" data-action="edit-bom" data-product="${selected}" data-material="${m.id}">${icon('edit', 16)}</button></td></tr>` }).join('')}</tbody></table></div></article>`;
}

function inventoryPage() {
  return tablePage({ description: '维护现有库存、安全库存和采购提前期；修改后分析结果立即重算。', columns: ['物料', '当前库存', '安全库存', '可用水平', '提前期', '操作'], rows: data.materials.map((m) => { const inv = data.inventory.find((i) => i.materialId === m.id) || { stockQty: 0, safetyStock: 0, leadTimeDays: 0 }; const ratio = inv.safetyStock ? inv.stockQty / inv.safetyStock : 9; const leadTimeDays = m.leadTimeDays ?? inv.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS; return `<tr><td><div class="cell-main"><div class="material-avatar small">${m.name[0]}</div><div><strong>${m.name}</strong><small>${m.code}</small></div></div></td><td><strong>${format(inv.stockQty)}</strong> ${m.unit}</td><td>${format(inv.safetyStock)} ${m.unit}</td><td><span class="stock-level ${ratio < 1 ? 'bad' : ratio < 2 ? 'mid' : ''}"><i></i>${ratio < 1 ? '低于安全线' : ratio < 2 ? '接近安全线' : '正常'}</span></td><td>${leadTimeDays} 天</td><td><button class="icon-btn" data-action="edit-inventory" data-id="${m.id}">${icon('edit', 16)}</button></td></tr>` }) });
}

function ordersPage() {
  const total = data.orders.reduce((s, o) => s + Number(o.orderQty || 0), 0);
  return `<div class="split-layout"><div><div class="page-intro"><p>输入计划生产数量和交付日期，系统将实时展开所有产品 BOM 并汇总物料需求。</p></div><article class="panel order-form"><div class="panel-head"><div><span class="kicker">ORDER SIMULATION</span><h3>本次模拟订单</h3></div><span class="draft">草稿</span></div><div class="order-lines">${data.products.map((p) => { const order = data.orders.find((o) => o.productId === p.id); return `<label class="order-line"><div class="product-badge">${p.code.slice(-1)}</div><div class="grow"><strong>${p.code}</strong><small>${p.name} · ${p.model}</small></div><div class="order-date"><small>交付日期</small><input type="date" value="${order?.deliveryDate || DEFAULT_DELIVERY_DATE}" data-delivery-date="${p.id}" aria-label="${p.code} 交付日期" /></div><div class="qty-control"><button type="button" data-step="-10" data-id="${p.id}">−</button><input type="number" min="0" step="1" value="${order?.orderQty || 0}" data-order="${p.id}"/><button type="button" data-step="10" data-id="${p.id}">＋</button></div><span>台</span></label>` }).join('')}</div><div class="order-footer"><div><span>订单合计</span><strong id="order-total">${format(total)} 台</strong></div><button class="primary large" data-action="analyze">开始缺料分析 ${icon('chart', 18)}</button></div></article></div><aside class="logic-card"><span class="kicker">CALCULATION LOGIC</span><h3>系统如何计算？</h3><div class="logic-step"><b>01</b><div><strong>读取订单数量</strong><p>汇总各产品计划生产台数</p></div></div><div class="logic-step"><b>02</b><div><strong>逐层展开 BOM</strong><p>订单数 × 每台物料用量</p></div></div><div class="logic-step"><b>03</b><div><strong>合并物料需求</strong><p>同一物料跨产品自动加总</p></div></div><div class="logic-step"><b>04</b><div><strong>库存与安全线判断</strong><p>生成充足、库存低、缺料状态</p></div></div><div class="formula">总需求 = Σ (订单数量 × 单台用量)</div></aside></div>`;
}

function analysisPage(results) {
  const { shortageCount: shortage, lowStockCount: low } = getInventoryStatusCounts(results);
  const decisionResults = calculateDecisionResults(results, { materials: data.materials, today: new Date() });
  const riskCounts = getDecisionRiskCounts(decisionResults);
  return `<div class="analysis-banner"><div><span class="eyebrow">DECISION VIEW</span><h2>交付风险决策清单</h2><p>先看风险，再看时间原因和今天需要采取的行动。当前 ${shortage} 项缺料、${low} 项库存低。</p></div><div class="banner-metrics decision-metrics"><div class="danger"><strong>${riskCounts.high}</strong><span>高风险</span></div><div class="warning"><strong>${riskCounts.action}</strong><span>需要行动</span></div><div class="success"><strong>${riskCounts.ok}</strong><span>正常</span></div></div></div><article class="panel table-panel"><div class="panel-head decision-table-head"><div><span class="kicker">DECISION PRIORITY</span><h3>物料决策明细</h3><p>从左到右依次回答：哪个物料有风险、为什么、现在做什么。</p></div><button class="secondary" data-page="orders">← 修改订单</button></div>${decisionResults.length ? `<div class="table-wrap"><table class="analysis-table decision-table"><thead><tr><th>物料</th><th>决策风险</th><th>缺料数量</th><th>时间判断依据</th><th>现在应该做什么</th><th>库存状态</th><th>需求 / 库存</th><th>安全库存</th><th>预计剩余</th></tr></thead><tbody>${decisionResults.map((r) => { const gap = r.leadTimeDays - r.remainingDays; const reason = r.riskLevel === 'High Risk' ? `采购周期超出交付窗口 ${format(gap)} 天` : r.riskLevel === 'Action Required' ? (gap === 0 ? '采购周期刚好覆盖交付窗口，没有时间缓冲' : `采购窗口尚有 ${format(-gap)} 天缓冲`) : '当前无缺料，交付风险可控'; return `<tr class="decision-row risk-${RISK_TONES[r.riskLevel]}"><td><div class="cell-main"><div class="material-avatar small">${r.name[0]}</div><div><strong>${r.name}</strong><small>${r.code}</small></div></div></td><td class="decision-risk-cell">${decisionBadge(r.riskLevel)}</td><td><strong class="shortage-number ${r.shortageQty ? 'danger-text' : 'muted'}">${format(r.shortageQty)}</strong><small>${r.unit}</small></td><td><div class="decision-evidence"><span>最早交期 <strong>${r.earliestDeliveryDate || '—'}</strong></span><span>剩余天数 <strong>${format(r.remainingDays)} 天</strong></span><span>采购周期 <strong>${format(r.leadTimeDays)} 天</strong></span><small>${reason}</small></div></td><td class="action-cell"><strong>${ACTION_LABELS[r.actionSuggestion]}</strong></td><td>${badge(r.status)}</td><td><strong>${format(r.requiredQty)}</strong> / ${format(r.stockQty)} ${r.unit}</td><td>${format(r.safetyStock)} ${r.unit}</td><td class="${r.status === '缺料' ? 'danger-text' : r.status === '库存低' ? 'warning-text' : ''}">${format(r.remainingQty)} ${r.unit}</td></tr>` }).join('')}</tbody></table></div>` : empty('暂无需求结果', '请先在订单模拟中输入产品数量。')}</article><div class="rule-note"><strong>库存状态规则</strong><span><i class="dot red"></i>库存 &lt; 需求：缺料</span><span><i class="dot yellow"></i>库存 ≥ 需求，但剩余 &lt; 安全库存：库存低</span><span><i class="dot green"></i>其余：充足</span></div>`;
}

function empty(title, desc) { return `<div class="empty"><div>✓</div><strong>${title}</strong><p>${desc}</p></div>`; }

function render() {
  const renderers = { dashboard, products: productsPage, materials: materialsPage, bom: bomPage, inventory: inventoryPage, orders: ordersPage, analysis: analysisPage };
  const results = calculateMaterialRequirements(data);
  document.querySelector('#app').innerHTML = appShell(renderers[currentPage](results), results);
  bindEvents();
}

function navigate(page) { currentPage = page; history.replaceState(null, '', `#${page}`); render(); window.scrollTo(0, 0); }

function bindEvents() {
  document.querySelectorAll('[data-page]').forEach((el) => el.addEventListener('click', () => navigate(el.dataset.page)));
  document.querySelectorAll('[data-product-tab]').forEach((el) => el.addEventListener('click', () => { sessionStorage.setItem('selectedProduct', el.dataset.productTab); render(); }));
  document.querySelectorAll('[data-order]').forEach((input) => input.addEventListener('input', () => updateOrder(input.dataset.order, input.value)));
  document.querySelectorAll('[data-delivery-date]').forEach((input) => input.addEventListener('change', () => updateOrderDeliveryDate(input.dataset.deliveryDate, input.value)));
  document.querySelectorAll('[data-step]').forEach((btn) => btn.addEventListener('click', () => { const input = document.querySelector(`[data-order="${btn.dataset.id}"]`); input.value = Math.max(0, Number(input.value) + Number(btn.dataset.step)); updateOrder(btn.dataset.id, input.value); }));
  document.querySelectorAll('[data-action]').forEach((el) => el.addEventListener('click', () => handleAction(el.dataset.action, el.dataset)));
  document.querySelector('[data-table-search]')?.addEventListener('input', (e) => { document.querySelectorAll('tbody tr').forEach((row) => row.hidden = !row.textContent.toLowerCase().includes(e.target.value.toLowerCase())); });
}

function updateOrder(productId, qty) {
  let order = data.orders.find((o) => o.productId === productId);
  if (!order) { order = { productId, orderQty: 0, deliveryDate: DEFAULT_DELIVERY_DATE }; data.orders.push(order); }
  order.orderQty = Math.max(0, Number(qty) || 0);
  saveData(data);
  const total = data.orders.reduce((s, o) => s + Number(o.orderQty), 0);
  const totalEl = document.querySelector('#order-total'); if (totalEl) totalEl.textContent = `${format(total)} 台`;
}

function updateOrderDeliveryDate(productId, deliveryDate) {
  let order = data.orders.find((o) => o.productId === productId);
  if (!order) { order = { productId, orderQty: 0, deliveryDate: DEFAULT_DELIVERY_DATE }; data.orders.push(order); }
  order.deliveryDate = deliveryDate || DEFAULT_DELIVERY_DATE;
  saveData(data);
  render();
}

function handleAction(action, dataset) {
  if (action === 'analyze') return navigate('analysis');
  if (action === 'reset-data') {
    if (!window.confirm('确定要重置所有演示数据吗？此操作将恢复初始产品、物料、BOM、库存和订单。')) return;
    resetStoredData();
    sessionStorage.removeItem('selectedProduct');
    window.location.reload();
    return;
  }
  if (action === 'add-product' || action === 'edit-product') return productModal(dataset.id);
  if (action === 'add-material' || action === 'edit-material') return materialModal(dataset.id);
  if (action === 'add-bom' || action === 'edit-bom') return bomModal(dataset.product, dataset.material);
  if (action === 'edit-inventory') return inventoryModal(dataset.id);
}

function showModal(title, body, onSubmit) {
  const root = document.querySelector('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><form class="modal"><div class="modal-head"><div><span class="kicker">MRP LITE</span><h3>${title}</h3></div><button type="button" class="modal-close">×</button></div><div class="modal-body">${body}</div><div class="modal-actions"><button type="button" class="secondary modal-cancel">取消</button><button class="primary" type="submit">保存</button></div></form></div>`;
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
  const inventoryItem = data.inventory.find((inventory) => inventory.materialId === id);
  const leadTimeDays = item?.leadTimeDays ?? inventoryItem?.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
  showModal(item ? '编辑物料' : '新增物料', `${field('物料编码', 'code', item?.code)}${field('物料名称', 'name', item?.name)}${field('分类', 'category', item?.category)}${field('单位', 'unit', item?.unit)}${field('采购周期（天）', 'leadTimeDays', leadTimeDays, 'number', 'min="0" step="1"')}`, (fd) => {
    const value = Object.fromEntries(fd);
    value.leadTimeDays = Math.max(0, Number(value.leadTimeDays) || 0);
    if (item) {
      Object.assign(item, value);
      if (inventoryItem) inventoryItem.leadTimeDays = value.leadTimeDays;
    } else {
      const newItem = { id: `m${Date.now()}`, ...value };
      data.materials.push(newItem);
      data.inventory.push({ materialId: newItem.id, stockQty: 0, safetyStock: 0, leadTimeDays: value.leadTimeDays });
    }
  });
}
function inventoryModal(id) {
  const m = data.materials.find((x) => x.id === id); let inv = data.inventory.find((x) => x.materialId === id);
  const leadTimeDays = m.leadTimeDays ?? inv?.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS;
  showModal(`更新库存 · ${m.name}`, `${field('当前库存', 'stockQty', inv?.stockQty || 0, 'number', 'min="0" step="0.01"')}${field('安全库存', 'safetyStock', inv?.safetyStock || 0, 'number', 'min="0" step="0.01"')}${field('采购提前期（天）', 'leadTimeDays', leadTimeDays, 'number', 'min="0" step="1"')}`, (fd) => { const value = Object.fromEntries(fd); Object.keys(value).forEach((k) => value[k] = Number(value[k])); m.leadTimeDays = value.leadTimeDays; if (inv) Object.assign(inv, value); else data.inventory.push({ materialId: id, ...value }); });
}
function bomModal(productId, materialId) {
  const selected = productId || sessionStorage.getItem('selectedProduct') || data.products[0].id; const item = data.bom.find((b) => b.productId === selected && b.materialId === materialId);
  const options = data.materials.map((m) => `<option value="${m.id}" ${m.id === materialId ? 'selected' : ''}>${m.code} · ${m.name}</option>`).join('');
  showModal(item ? '编辑 BOM 用量' : `添加 BOM 物料 · ${productName(selected)}`, `<label class="field"><span>物料</span><select name="materialId" ${item ? 'disabled' : ''}>${options}</select></label>${field('单台用量', 'qtyPerProduct', item?.qtyPerProduct || 1, 'number', 'min="0.01" step="0.01"')}`, (fd) => { const value = Object.fromEntries(fd); value.qtyPerProduct = Number(value.qtyPerProduct); if (item) Object.assign(item, value); else { const exists = data.bom.find((b) => b.productId === selected && b.materialId === value.materialId); if (exists) exists.qtyPerProduct = value.qtyPerProduct; else data.bom.push({ productId: selected, ...value }); } });
}

function toast(message) { const el = document.querySelector('#toast'); el.textContent = `✓ ${message}`; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400); }

const hashPage = location.hash.slice(1); if (pages.some(([id]) => id === hashPage)) currentPage = hashPage;
render();
