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
let selectedOrderEvaluationId = data.orderEvaluationRecords?.[0]?.id || null;
const DEMO_DELIVERY_RISK_ORDER = {
  productId: 'p1',
  plannedQty: '300',
  deliveryDaysFromToday: 15,
};
const deliveryRiskInputState = getDemoDeliveryRiskDefaults();
let deliveryRiskPreview = null;
const DELIVERY_RISK_LABELS = { ok: '可满足', warning: '交期紧张', critical: '交期高风险', unknown: '无法判断' };
const DELIVERY_RISK_REASONS = {
  ok: '采购周期可满足期望交期',
  warning: '采购周期接近期望交期，存在延期风险',
  critical: '采购周期预计无法满足期望交期',
  unknown: '采购周期未维护，无法判断交期风险',
};

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getDemoDeliveryRiskDefaults(baseDate = new Date()) {
  return {
    selectedProductId: DEMO_DELIVERY_RISK_ORDER.productId,
    plannedQty: DEMO_DELIVERY_RISK_ORDER.plannedQty,
    requiredDate: formatDateInputValue(addDays(baseDate, DEMO_DELIVERY_RISK_ORDER.deliveryDaysFromToday)),
    asOfDate: formatDateInputValue(baseDate),
  };
}

function isValidDateInputValue(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const pages = [
  ['dashboard', '首页', 'grid'], ['delivery-risk', '交期风险分析', 'chart'], ['warehouse-alerts', '库存预警反馈', 'warehouse'],
  ['order-evaluations', '订单评估记录', 'chart'],
  ['real-data-trial', '真实数据试算', 'layers'],
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
  const active = pages.find((p) => p[0] === currentPage) || ['order-evaluation-detail', '订单评估记录详情', 'chart'];
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


function demoReadingPathPanel() {
  const demoPathCards = [
    ['01 首页', '先理解系统目标、四角色信息流和只读演示边界。', 'grid'],
    ['02 交期风险分析', '输入产品、计划数量、期望交期和分析日期，查看订单交付风险、风险来源、计划判断和采购关注点。', 'chart'],
    ['03 库存预警反馈', '查看仓库侧库存状态反馈，理解账面库存之外的实物可用性风险。', 'warehouse'],
    ['04 物料资料 / 产品 BOM / 库存台账', '查看风险判断所依赖的基础数据来源。', 'layers'],
    ['05 待审核流水', '查看库存动作未来需要审核的方向，但当前仍为演示。', 'chart'],
    ['06 入库 / 领料 / 退货', '当前为占位页面，不执行真实库存操作。', 'box'],
  ];
  return `<article class="panel" style="margin-bottom:20px"><div class="panel-head"><div><span class="kicker">DEMO READING PATH</span><h3>推荐演示路径</h3></div><span class="version">只读演示</span></div><div class="placeholder-copy"><p>建议按以下顺序查看当前 Lite 演示版，先理解角色关系，再查看订单风险和物料风险来源。</p></div><div class="entry-grid">${demoPathCards.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div><div class="placeholder-copy"><strong>当前版本用于演示订单到物料风险的阅读路径</strong><p>不保存操作、不修改库存、不生成采购单，也不代表正式权限系统。</p></div></article>`;
}

function roleDemoGuidePanel() {
  const roleGuideCards = [
    ['老板', '重点查看订单交付风险、风险来源说明，以及是否可能因为物料等待影响交期。推荐页面：首页、交期风险分析。', 'grid'],
    ['计划', '重点查看交期是否可行、排产前是否需要确认库存可用性。推荐页面：交期风险分析、仓库反馈提示。', 'chart'],
    ['采购', '重点查看采购优先级、采购周期、供应关注点和需要提前确认的物料。推荐页面：交期风险分析、采购优先级分组。', 'cart'],
    ['仓库', '重点查看库存预警反馈、仓库库存状态反馈和实物可用性风险。推荐页面：库存预警反馈、库存台账。仓库反馈不是采购申请，不修改库存。', 'warehouse'],
  ];
  return `<article class="panel" style="margin-bottom:20px"><div class="panel-head"><div><span class="kicker">ROLE DEMO GUIDE</span><h3>按角色演示怎么看</h3></div><span class="version">只读演示</span></div><div class="placeholder-copy"><p>演示时可以按角色切换关注点，同一份订单物料风险结果，会被不同角色从不同角度阅读。</p></div><div class="entry-grid">${roleGuideCards.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div><div class="placeholder-copy"><strong>角色演示说明仅用于帮助阅读当前 Lite 演示版，不代表正式权限系统</strong><p>本阶段不会保存操作、修改库存或生成采购单。</p></div></article>`;
}

function demoOrderStoryPanel() {
  const orderFacts = [
    ['客户订单', 'HE-110S 小型款 300 台', 'box'],
    ['期望交期', '15 天后交付', 'chart'],
    ['当前判断', '交期紧张', 'grid'],
    ['下一步', '采购和仓库当天确认', 'warehouse'],
  ];
  const systemFindings = [
    ['缺料风险', '多项关键物料缺料，需要采购立即确认。', 'cart'],
    ['库存低风险', '1 个关键物料订单扣减后低于安全库存，会影响排产余量。', 'chart'],
    ['现场确认', '部分库存需要仓库现场确认，避免账面库存误导交期判断。', 'warehouse'],
    ['交付判断', '采购周期会影响 15 天交付是否可承诺。', 'grid'],
  ];
  const roleScenarioCards = [
    ['老板', '看当前订单能否按期交付，以及风险是否需要今天处理。', 'grid'],
    ['计划', '看交期是否可行，哪些物料会影响排产。', 'chart'],
    ['采购', '看哪些物料需要立即确认采购或供应周期。', 'cart'],
    ['仓库', '看哪些库存数据需要现场确认，避免账面库存误导判断。', 'warehouse'],
  ];
  return `<article class="panel" style="margin-bottom:20px"><div class="panel-head"><div><span class="kicker">CURRENT DEMO ORDER</span><h3>当前演示订单：客户急单，HE-110S 小型款 300 台</h3></div><span class="version">Phase 6-Step 2 · 订单决策链路</span></div><div class="placeholder-copy"><p>这张演示订单指的是 HE-110S 小型款 300 台，不是三个型号合计，也不是每个型号 300 台。客户要求 15 天后交付，系统以该型号 BOM 展开物料需求，并对比库存、安全库存、采购周期与仓库反馈：系统发现 3 类关键风险，交期紧张，不能直接乐观承诺，需要采购和仓库当天确认。</p></div><div class="entry-grid">${orderFacts.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div><div class="placeholder-copy"><strong>系统发现的问题：3 类关键风险</strong><p>本故事是演示数据下的只读实操场景，不保存订单、不生成采购单、不修改库存，也不代表真实订单已创建。</p></div><div class="entry-grid">${systemFindings.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div><div class="placeholder-copy"><strong>四角色怎么看这张急单</strong><p>同一张客户急单，老板、计划、采购、仓库分别从交付、排产、供应和现场库存可信度来读。</p></div><div class="entry-grid">${roleScenarioCards.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div></article>`;
}

function demoOrderDecisionPanel() {
  const decisionCards = [
    ['当前判断', '交期紧张', '本单关键风险', 'chart'],
    ['决策建议', '有条件推进', '不建议直接乐观承诺', 'grid'],
    ['采购动作', '当天确认关键物料到货时间', '建议当天确认', 'cart'],
    ['仓库动作', '当天确认关键库存真实性', '待仓库确认', 'warehouse'],
  ];
  return `<article class="panel" style="margin-bottom:20px"><div class="panel-head"><div><span class="kicker">ORDER DECISION</span><h3>本单决策建议</h3></div><span class="version">当前演示数据下</span></div><div class="placeholder-copy"><p>HE-110S 小型款 300 台急单不是直接通过，也不是直接拒绝。当前建议是有条件推进：可以继续推进内部确认，但不建议直接承诺 15 天交付；需要采购确认关键物料到货时间，仓库确认关键库存真实性后，再确认最终交期。</p></div><div class="entry-grid">${decisionCards.map(([title, copy, tag, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small><small>${tag}</small></span></div>`).join('')}</div><div class="placeholder-copy"><strong>只读边界</strong><p>本单决策建议只用于演示“订单来了 → 识别问题 → 给出建议 → 角色协同”的阅读链路，不保存真实订单、不生成采购单、不修改库存。</p></div></article>`;
}

function dashboard() {
  const materials = materialService.listMaterials();
  const products = productService.listProducts();
  const balances = inventoryService.listBalances();
  const lowStockCount = balances.filter((row) => Number(row.stockQty) < Number(row.safetyStock)).length;
  const demoEntryCards = [
    ['默认演示场景', 'HE-110S 小型款 / 300 台 / 当前日期 + 15 天交付', 'box'],
    ['订单场景分析', '在交期风险分析页输入场景，不是正式订单保存入口。', 'chart'],
    ['只读演示边界', '不保存真实订单、不生成采购单、不修改库存、不做权限、不做财务金额。', 'warehouse'],
  ];
  const roleFlowCards = [
    ['老板', '看这张单能不能承诺交付，风险是否需要当天拍板。', 'grid'],
    ['计划', '看库存和采购周期能不能支撑排产与 15 天交付。', 'chart'],
    ['采购', '看今天要确认哪些关键物料、供应周期和可采购数量。', 'cart'],
    ['仓库', '看哪些账面库存需要现场复核，避免误判可用数量。', 'warehouse'],
  ];
  return `<div class="hero"><div><span class="eyebrow">LUFUTA LITE / DEMO ENTRY</span><h2>客户订单来了，先看交期风险</h2><p>用一个订单场景，联动 BOM、库存、采购周期和仓库反馈，提前判断交付风险。当前 Lite 版本主线是交期风险分析，不是完整 ERP 或正式订单系统。</p><button class="primary large" data-page="delivery-risk" style="margin-top:18px">${icon('chart', 18)} 进入交期风险分析</button></div><span class="phase-chip">当前为只读演示</span></div>
    <div class="stats-grid">${statCard('核心入口', '交期风险分析', '查看演示订单风险', 'blue', 'chart')}${statCard('物料资料', materials.length, '演示主数据', 'violet', 'layers')}${statCard('产品 / BOM', products.length, '演示结构数据', 'blue', 'box')}${statCard('库存风险', lowStockCount, '只读预警参考', 'amber', 'warehouse')}</div>
    <article class="panel" style="margin-bottom:20px"><div class="panel-head"><div><span class="kicker">DEMO ENTRY</span><h3>当前演示主线</h3></div><button class="primary" data-page="delivery-risk">${icon('chart', 17)} 进入交期风险分析</button></div><div class="placeholder-copy"><p>客户提出订单需求后，先进入交期风险分析，看物料和交付风险。当前默认场景只是用于演示阅读链路，不代表真实订单已保存。</p></div><div class="entry-grid">${demoEntryCards.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div></article>
    ${demoOrderStoryPanel()}
    ${demoOrderDecisionPanel()}
    <article class="panel" style="margin-bottom:20px"><div class="panel-head"><div><span class="kicker">ROLE INFORMATION FLOW</span><h3>四角色信息流</h3></div><span class="version">只读演示</span></div><div class="placeholder-copy"><p>系统围绕同一份订单物料风险结果，让老板、计划、采购、仓库从不同角度协同判断，但本阶段仍保持只读演示边界。</p></div><div class="entry-grid">${roleFlowCards.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div><div class="placeholder-copy"><strong>四角色信息流仅用于演示阅读顺序，不代表权限系统</strong><p>本阶段不会保存操作、修改库存或生成采购单。</p></div></article>
    ${roleDemoGuidePanel()}
    ${demoReadingPathPanel()}
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
  return `${skeletonNotice('库存台账', '当前只读展示 Lite 阶段的演示库存，是 HE-110S 小型款 300 台急单判断的库存依据页面。这里对比系统库存、安全库存和采购周期，但不是真实库存账，本阶段不提供入库、出库、冻结、盘点、过账、批次或库位管理。')}${tablePage({ description: '库存数量来自浏览器中的演示数据，用于支撑本单缺料、低于安全库存和仓库现场确认判断；不会生成库存单据。', columns: ['物料', '当前库存', '安全库存', '采购周期', '风险状态', '仓位 / 库位', '最后更新'], rows: materials.map((m) => { const inv = balances.find((i) => i.materialId === m.id) || { stockQty: 0, safetyStock: 0 }; const low = Number(inv.stockQty) < Number(inv.safetyStock); const leadTimeDays = resolveProcurementLeadTimeDays(m, inv); return `<tr><td><div class="cell-main"><div class="material-avatar small">${m.name[0]}</div><div><strong>${m.name}</strong><small>${m.code}</small></div></div></td><td><strong>${format(inv.stockQty)}</strong> ${m.unit}</td><td>${format(inv.safetyStock)} ${m.unit}</td><td>${formatProcurementLeadTimeDays(leadTimeDays)}</td><td><span class="stock-level ${low ? 'bad' : ''}"><i></i>${low ? '低于安全线' : '正常'}</span></td><td><span class="muted">未启用</span></td><td><span class="muted">演示数据</span></td></tr>` }) })}`;
}

function orderEvaluationProductLabel(productId) {
  const product = data.products.find((item) => item.id === productId);
  return product ? `${product.code} · ${product.model}` : '未知产品';
}

function orderEvaluationRiskLabel(riskLevel) {
  return DELIVERY_RISK_LABELS[riskLevel] || '待确认';
}

function orderEvaluationStatusLabel(status) {
  if (status === 'analyzed') return '已分析';
  return '待确认';
}

function orderEvaluationRecordById(id) {
  const records = data.orderEvaluationRecords || [];
  return records.find((record) => record.id === id) || records[0];
}

function orderEvaluationsPage() {
  const records = data.orderEvaluationRecords || [];
  const rows = records.map((record) => `<tr><td><strong class="code">${record.id || '待编号'}</strong></td><td>${orderEvaluationProductLabel(record.input?.productId)}</td><td><strong>${format(record.input?.plannedQty || 0)}</strong> 台</td><td>${record.input?.requiredDate || '待确认'}</td><td>${record.input?.asOfDate || '待确认'}</td><td><span class="soft-tag">${orderEvaluationRiskLabel(record.summary?.riskLevel)}</span></td><td>${format(record.summary?.keyRiskMaterialCount || 0)}</td><td>${format(record.summary?.procurementConfirmCount || 0)}</td><td>${format(record.summary?.warehouseConfirmCount || 0)}</td><td><span class="soft-tag">${orderEvaluationStatusLabel(record.status)}</span></td><td><button class="secondary" type="button" data-action="view-order-evaluation" data-id="${record.id}">查看评估记录</button></td></tr>`);
  const body = rows.length ? rows.join('') : '<tr><td colspan="11"><div class="empty-table"><strong>暂无评估记录</strong><p>当前没有静态订单评估记录；本页仍然只读，不提供新增、编辑或删除。</p></div></td></tr>';
  return `${skeletonNotice('订单评估记录', '当前页面展示的是订单评估记录原型数据，用于回看一次交期风险分析。它不是正式销售订单，不占用库存，不生成采购单，也不进入财务。')}<article class="panel table-panel" data-order-evaluations-page><div class="panel-head"><div><span class="kicker">ORDER EVALUATION RECORDS</span><h3>订单评估记录</h3></div><span class="version">${records.length} 条 · 演示记录</span></div><div class="placeholder-copy"><p>当前记录为内置演示评估记录，用于展示未来订单评估归档效果。重置数据不会删除这些演示记录。</p><p>这些记录来自静态演示数据，只用于说明“订单场景评估”如何被回看；页面不提供新增、编辑、删除、重新分析或真实业务操作，也不会改变库存、采购、财务或审批状态。</p></div>${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>评估编号</th><th>产品</th><th>数量</th><th>期望交期</th><th>分析日期</th><th>风险等级</th><th>关键风险物料</th><th>需采购确认</th><th>需仓库确认</th><th>状态</th><th>只读回看</th></tr></thead><tbody>${body}</tbody></table></div></article>`;
}

function snapshotEmptyText(items, label) {
  return Array.isArray(items) && items.length ? `${items.length} 项` : `暂无${label}快照`;
}

function orderEvaluationDetailPage() {
  const record = orderEvaluationRecordById(selectedOrderEvaluationId);
  if (!record) {
    return `${skeletonNotice('订单评估记录详情', '当前没有可回看的订单评估记录。')}<article class="panel"><div class="empty-table"><strong>未找到评估记录</strong><p>请返回订单评估记录列表查看当前静态演示数据。</p><button class="secondary" data-action="back-order-evaluations">返回订单评估记录列表</button></div></article>`;
  }

  const productLabel = orderEvaluationProductLabel(record.input?.productId);
  const snapshot = record.analysisSnapshot || {};
  const boundaryCards = [
    ['不是正式销售订单', record.businessBoundary?.isOfficialSalesOrder === false ? '是' : '待确认'],
    ['不占用库存', record.businessBoundary?.affectsInventory === false ? '是' : '待确认'],
    ['不锁定库存', record.businessBoundary?.reservesInventory === false ? '是' : '待确认'],
    ['不生成采购单', record.businessBoundary?.createsPurchaseOrder === false ? '是' : '待确认'],
    ['不进入财务', record.businessBoundary?.entersFinance === false ? '是' : '待确认'],
    ['不包含成本核算', record.businessBoundary?.hasCostAccounting === false ? '是' : '待确认'],
  ];
  const backToListButton = '<div data-order-evaluation-backline style="margin-bottom:14px"><button class="secondary" type="button" data-action="back-order-evaluations">← 返回订单评估记录列表</button></div>';

  return `${backToListButton}${skeletonNotice('订单评估记录详情', '当前页面用于回看一次订单评估记录，不代表正式接单。该记录不会占用库存，不会生成采购单，不会进入财务核算。')}<article class="panel" data-order-evaluation-detail style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">ORDER EVALUATION DETAIL</span><h3>${record.id || '待编号'}</h3></div><button class="secondary" data-action="back-order-evaluations">返回订单评估记录列表</button></div><div class="placeholder-form"><div><span>评估编号</span><strong>${record.id || '待编号'}</strong></div><div><span>状态</span><strong>${orderEvaluationStatusLabel(record.status)}</strong></div><div><span>产品</span><strong>${productLabel}</strong></div><div><span>数量</span><strong>${format(record.input?.plannedQty || 0)} 台</strong></div><div><span>期望交期</span><strong>${record.input?.requiredDate || '待确认'}</strong></div><div><span>分析日期</span><strong>${record.input?.asOfDate || '待确认'}</strong></div><div><span>创建时间</span><strong>${record.createdAt || '待确认'}</strong></div><div><span>更新时间</span><strong>${record.updatedAt || '待确认'}</strong></div><div><span>备注</span><strong>${record.input?.note || '暂无备注'}</strong></div></div></article><article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">SUMMARY</span><h3>分析摘要</h3></div><span class="version">只读快照</span></div><div class="placeholder-form"><div><span>风险等级</span><strong>${orderEvaluationRiskLabel(record.summary?.riskLevel)}</strong></div><div><span>是否可满足交期</span><strong>${record.summary?.canMeetRequiredDate ? '可以满足' : '暂不建议直接承诺'}</strong></div><div><span>关键风险物料数量</span><strong>${format(record.summary?.keyRiskMaterialCount || 0)}</strong></div><div><span>需采购确认数量</span><strong>${format(record.summary?.procurementConfirmCount || 0)}</strong></div><div><span>需仓库确认数量</span><strong>${format(record.summary?.warehouseConfirmCount || 0)}</strong></div></div></article><article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">ANALYSIS SNAPSHOT</span><h3>分析快照</h3></div><span class="version">${snapshot.source || '未知来源'}</span></div><div class="placeholder-form"><div><span>快照生成时间</span><strong>${snapshot.generatedAt || '待确认'}</strong></div><div><span>来源</span><strong>${snapshot.source || '待确认'}</strong></div><div><span>物料风险明细</span><strong>${snapshotEmptyText(snapshot.materialRisks, '物料风险明细')}</strong></div><div><span>采购建议快照</span><strong>${snapshotEmptyText(snapshot.procurementRecommendations, '采购建议')}</strong></div><div><span>仓库反馈提示</span><strong>${snapshotEmptyText(snapshot.warehouseFeedbackHints, '仓库反馈提示')}</strong></div></div></article><article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">BUSINESS BOUNDARY</span><h3>业务边界</h3></div><span class="version">演示记录 · 不触发业务联动</span></div><div class="entry-grid">${boundaryCards.map(([title, value]) => `<div class="entry-card">${icon('grid', 22)}<span><strong>${title}</strong><small>${value}</small></span></div>`).join('')}</div><div class="placeholder-copy"><p>本记录为演示评估记录，不是用户真实保存的订单评估。</p><p>本详情页只用于回看静态评估记录，不提供保存、编辑、删除、重新分析或真实业务操作。</p></div></article>`;
}

function realDataTrialPage() {
  const futureInputs = [
    ['订单条件', '产品、试算数量、期望交期和试算日期。', 'chart'],
    ['BOM', '产品对应物料清单和单位用量。', 'git'],
    ['库存', '当前库存、安全库存和可用性确认。', 'warehouse'],
    ['采购周期', '物料补货周期和到料时间判断。', 'cart'],
    ['参考价格', '仅用于采购金额参考和成本影响参考。', 'layers'],
  ];
  const futureOutputs = [
    ['缺料结果', '识别总需求、当前库存和缺口数量。', 'layers'],
    ['交期风险', '判断采购周期和期望交期是否紧张。', 'chart'],
    ['采购建议', '提示立即确认采购、建议关注或暂不采购。', 'cart'],
    ['采购金额参考', '基于参考单价和建议采购数量估算资金压力。', 'grid'],
    ['成本参考', '只做成本影响参考，不进入正式成本核算。', 'box'],
    ['仓库确认点', '提示缺料、低安全库存和需现场盘点项目。', 'warehouse'],
  ];
  const boundaryItems = [
    ['不保存正式订单', '当前不会创建、保存或编辑真实客户订单。', 'grid'],
    ['不影响库存', '当前不会占用、扣减、锁定或修改任何库存。', 'warehouse'],
    ['不生成采购单', '当前不会生成采购申请、采购单或付款申请。', 'cart'],
    ['不进入财务', '当前不会进入应付账款、财务凭证或正式财务模块。', 'chart'],
    ['不做正式成本核算', '当前不会形成正式成本结果，也不会计算利润或毛利。', 'box'],
    ['不接入真实输入', '当前不提供订单、BOM、库存或价格导入和保存。', 'layers'],
  ];
  const resultPreviewSections = [
    ['试算条件摘要', ['产品', '试算数量', '期望交期', '试算日期', '数据来源'], 'grid'],
    ['缺料结果', ['物料', '单位用量', '总需求', '当前库存', '缺口数量', '安全库存状态'], 'layers'],
    ['交期风险', ['库存是否可覆盖', '采购周期是否足够', '预计到料时间', '期望交期是否紧张', '风险等级', '风险原因'], 'chart'],
    ['采购建议', ['立即确认采购', '建议关注', '暂不采购', '采购周期缺失，需人工确认', '建议采购数量'], 'cart'],
    ['金额与成本参考', ['参考单价：待维护', '建议采购数量：待试算', '采购金额参考：待试算', '成本影响参考：待确认', '价格状态：未维护 / 待确认'], 'box'],
    ['仓库确认点', ['缺料物料', '库存低于安全库存的物料', '库存刚好覆盖但余量不足的物料', '需要现场盘点的物料', '物料状态待确认的项目'], 'warehouse'],
  ];
  const resultPreview = `<article class="panel" data-real-data-trial-result-preview style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">RESULT PREVIEW</span><h3>未来试算结果结构</h3></div><span class="version">静态骨架 · 暂不计算</span></div><div class="placeholder-copy"><p>以下只展示未来一次性试算结果会包含哪些判断区域。当前没有接入真实输入、价格数据或计算逻辑，不会生成任何业务单据。</p></div><div class="entry-grid">${resultPreviewSections.map(([title, items, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong>${items.map((item) => `<small>${item}</small>`).join('')}</span></div>`).join('')}</div><div class="placeholder-copy"><p>金额与成本参考区当前只展示占位状态：没有接入价格数据，不计算采购金额，不形成正式成本，不进入财务。</p></div></article>`;

  return `${skeletonNotice('真实数据试算', '这里将用于未来输入或导入真实业务数据，进行一次性试算，帮助判断缺料、交期、采购、金额和仓库确认点。当前仅开放入口和边界说明，不接入真实输入、导入、保存或计算。')}<div data-real-data-trial-page><article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">PHASE 8-STEP 3</span><h3>真实数据试算入口</h3></div><span class="version">入口说明 · 暂不计算</span></div><div class="placeholder-copy"><p>本页面用于承接 Phase 8 的真实数据试算方向：未来可输入或导入订单、BOM、库存、采购周期、参考价格等数据，生成一次性试算结果。</p><p>当前阶段只说明入口、边界和未来结果结构，不提供输入表单、导入、保存、重新分析或真实业务联动。</p></div></article><article class="panel workflow-panel" style="margin-bottom:18px"><span class="kicker">TRIAL FLOW</span><h3>未来试算链路</h3><div class="workflow-steps"><span>订单条件</span><b>+</b><span>BOM</span><b>+</b><span>库存</span><b>+</b><span>采购周期</span><b>+</b><span>参考价格</span><b>→</b><span>缺料结果</span><b>+</b><span>交期风险</span><b>+</b><span>采购建议</span><b>+</b><span>采购金额参考</span><b>+</b><span>成本参考</span><b>+</b><span>仓库确认点</span></div><p>链路仅用于说明未来能力，不代表当前已经接入真实试算计算。</p></article><article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">FUTURE INPUTS</span><h3>未来输入 / 导入数据</h3></div><span class="version">${futureInputs.length} 类数据</span></div><div class="entry-grid">${futureInputs.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div></article><article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">BOUNDARY</span><h3>当前阶段边界</h3></div><span class="version">不保存 · 不占用 · 不生成 · 不进财务</span></div><div class="placeholder-copy"><p>当前仅为 Phase 8-Step 3 页面静态骨架，不保存正式订单，不占用库存，不扣减库存，不生成采购单，不生成付款申请，不进入应付账款，不进入正式财务，不做正式成本核算，不计算正式利润或正式毛利，也不生成财务凭证。</p></div><div class="entry-grid">${boundaryItems.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div></article>${resultPreview}<article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">FUTURE OUTPUTS</span><h3>未来输出预告</h3></div><span class="version">${futureOutputs.length} 类结果</span></div><div class="entry-grid">${futureOutputs.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div><div class="placeholder-copy"><p>以上输出仅为未来方向说明。当前页面不会运行 MRP、交期风险、采购建议、金额参考或成本参考计算。</p></div></article></div>`;
}

function warehouseFeedbackForRow(row, index) {
  const stockQty = Number(row.stockQty ?? 0);
  const safetyStock = Number(row.safetyStock ?? 0);
  if (stockQty <= 0) return { ...row, inventoryStatus: '缺料', feedbackStatus: '现场异常', audienceHint: '提醒老板当前物料存在交付风险，计划排产前需复核现场可用数量，采购可提前关注供应准备。' };
  if (stockQty < safetyStock) return { ...row, inventoryStatus: '库存低', feedbackStatus: '待盘点', audienceHint: '提醒计划排产前复核安全库存缺口，采购关注后续补充节奏，老板看到的是需要人工复核的库存风险。' };
  if (safetyStock <= 0) return { ...row, inventoryStatus: '待确认', feedbackStatus: '未确认', audienceHint: '提醒计划和老板当前缺少安全库存基准，仓库反馈仅提示需要人工确认现场可信度。' };
  if (index % 5 === 0) return { ...row, inventoryStatus: '正常', feedbackStatus: '待盘点', audienceHint: '系统库存正常，但演示提示仓库可在排产前复核物料位置，供计划参考。' };
  if (index % 5 === 1) return { ...row, inventoryStatus: '正常', feedbackStatus: '未确认', audienceHint: '系统库存正常，但实物包装或状态尚未确认，提醒计划按需复核。' };
  return { ...row, inventoryStatus: '正常', feedbackStatus: '已确认', audienceHint: '当前未提示额外库存可信度风险，老板、计划、采购仅作为只读参考。' };
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
  const feedbackMessages = alertRows.length || recheckRows.length ? [alertRows.length ? '存在库存预警物料，仓库反馈仅提醒计划在排产前复核现场可用性，采购提前关注供应风险。' : '', recheckRows.length ? '存在待人工核对的库存项目，相关库存数字在订单判断前可进一步确认；反馈不改变系统库存。' : ''].filter(Boolean) : ['当前没有明显库存预警或仓库复查提示，系统库存仍作为分析基础，仓库反馈仅作为现场确认信号。'];
  const boundaryCards = [
    ['系统库存是分析基础', 'MRP 与交期分析仍读取系统库存、BOM 和采购周期；仓库反馈不改计算口径。', 'layers'],
    ['仓库反馈现场可信度', '仓库侧只反馈现场库存是否需要复核、实物状态是否可信，不直接修改系统库存。', 'warehouse'],
    ['不生成采购单', '仓库反馈不是采购申请，不生成采购单，也不能决定采购数量或下单。', 'cart'],
    ['不确认采购建议', '采购建议仍由系统只读展示并由人工判断；仓库不确认、不驳回、不锁定采购建议。', 'chart'],
    ['不影响 MRP 结果', '反馈状态只作为提醒信号，不影响缺料、安全库存、交期风险等 MRP 核心计算结果。', 'grid'],
    ['提醒人工复核', '反馈用于提醒老板、计划、采购哪些库存需要结合现场情况人工复核。', 'warehouse'],
  ];
  const feedbackStatusCards = [
    ['未确认', '仓库尚未对现场库存进行确认。', '老板、计划、采购不能把该库存视为完全可靠；如涉及交期或缺料风险，需要人工复核。', '需要人工复核'],
    ['已确认', '仓库已确认现场库存与系统库存基本一致。', '老板、计划、采购可以把该库存作为当前分析依据；但仍不代表系统执行了任何库存变更。', '通常无需额外复核'],
    ['现场异常', '仓库发现实物、库位、包装、待检状态或可用性存在异常。', '老板、计划、采购需要谨慎使用当前库存判断；系统不会自动改变库存，只提示需要人工确认。', '需要人工复核'],
    ['待盘点', '当前库存状态需要进一步盘点确认。', '计划和采购不能完全依赖当前库存数量；系统不自动调账，不改变系统库存。', '需要人工复核'],
  ];
  const roleSignalCards = [
    ['老板', '关注哪些库存虽然系统显示可用，但仍需要人工复核；关注哪些库存不确定可能影响交期风险判断。', '老板看到的是现场可信度提醒，不是新的 MRP 结果，也不是交期风险重新计算。', 'grid'],
    ['计划', '关注哪些物料不能完全依赖系统库存数量；哪些物料需要先等仓库确认后再安排生产节奏。', '计划只把反馈作为排产前复核提示，不改变系统库存、交期风险或生产节奏计算。', 'chart'],
    ['采购', '关注哪些采购建议需要结合仓库现场确认；哪些物料虽然系统提示库存不足或库存低，但现场状态仍待确认。', '采购只把反馈作为人工判断补充，不改变采购建议，不生成采购单，也不确认采购建议。', 'cart'],
    ['仓库', '关注哪些物料需要优先确认现场库存可信度；哪些物料需要盘点、查库位、检查包装或待检状态。', '仓库只提供现场可信度信号，不保存、不提交、不写入 localStorage，也不直接修改库存。', 'warehouse'],
  ];
  const warehouseFeedbackRows = inventoryRows.map(warehouseFeedbackForRow);
  const warehouseFeedbackTable = `${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>物料编码</th><th>物料名称</th><th>单位</th><th>系统库存</th><th>安全库存</th><th>库存状态</th><th>仓库反馈状态</th><th>给老板 / 计划 / 采购的提示说明</th></tr></thead><tbody>${warehouseFeedbackRows.map((row) => `<tr><td><strong class="code">${row.material.code}</strong></td><td>${row.material.name}</td><td>${row.material.unit}</td><td><strong>${format(row.stockQty)}</strong></td><td>${format(row.safetyStock)}</td><td><span class="soft-tag">${row.inventoryStatus}</span></td><td><span class="soft-tag">${row.feedbackStatus}</span></td><td>${row.audienceHint}</td></tr>`).join('')}</tbody></table></div>`;
  const feedbackStatusLegend = `<article class="panel table-panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">FEEDBACK STATUS GUIDE</span><h3>仓库反馈状态说明</h3></div><span class="version">只读解释层</span></div><div class="placeholder-copy"><p>以下状态只解释仓库现场确认信号，帮助老板、计划、采购、仓库理解库存可信度；状态不保存、不提交、不写入 localStorage、不改变库存、不影响 MRP 核心计算、不生成采购单，也不确认采购建议。</p></div>${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>反馈状态</th><th>仓库侧含义</th><th>对老板 / 计划 / 采购的提醒意义</th><th>人工复核</th></tr></thead><tbody>${feedbackStatusCards.map(([status, warehouseMeaning, audienceMeaning, recheck]) => `<tr><td><span class="soft-tag">${status}</span></td><td>${warehouseMeaning}</td><td>${audienceMeaning}</td><td>${recheck}</td></tr>`).join('')}</tbody></table></div></article>`;
  const roleSignalFlow = `<article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">ROLE INFORMATION FLOW</span><h3>四角色如何理解仓库反馈</h3></div><span class="version">只读说明层</span></div><div class="placeholder-copy"><p>仓库反馈只是现场可信度信号，用来补充系统库存阅读：不影响 MRP 核心计算结果，不改变交期风险计算，不改变采购建议，不保存、不提交、不写入 localStorage、不改变库存、不生成采购单，也不确认采购建议。</p></div><div class="entry-grid">${roleSignalCards.map(([role, focus, boundary, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${role}</strong><small>${focus}</small><small>${boundary}</small></span></div>`).join('')}</div></article>`;

  return `${skeletonNotice('库存预警与仓库反馈（只读）', '本页用于判断 HE-110S 小型款 300 台急单中，哪些库存需要仓库现场确认。系统库存是分析基础，仓库反馈是现场可信度信号，不直接改变库存、采购或 MRP 结果。')}
    <div class="page-intro"><div><span class="kicker">WAREHOUSE FEEDBACK BOUNDARY</span><h3 style="margin:4px 0 6px;font-size:16px">仓库库存状态反馈与跨角色预警</h3><p>仓库侧用于反馈本单关键库存可信度，帮助识别账面库存之外的实物可用性风险；仓库不直接修改系统库存，不生成采购单，不确认采购建议，也不影响 MRP 核心计算结果。当前阶段仍为只读演示，所有反馈状态暂不保存、不提交、不改变库存。</p></div></div>
    <article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">ROLE BOUNDARY</span><h3>仓库反馈型角色边界</h3></div><span class="version">Phase 5-Step 1 · 只读</span></div><div class="entry-grid">${boundaryCards.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div><div class="placeholder-copy"><strong>仓库反馈只是一条现场确认信号</strong><p>本阶段不会保存反馈状态、不会提交反馈、不会修改库存、不会生成库存流水、不会生成采购单，也不会改变采购建议或 MRP 核心计算结果。</p></div></article>
    ${feedbackStatusLegend}
    ${roleSignalFlow}
    <article class="panel table-panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">WAREHOUSE STATUS FEEDBACK</span><h3>仓库关注物料与库存可信度反馈</h3></div><span class="version">${warehouseFeedbackRows.length} 项 · 只读演示</span></div><div class="placeholder-copy"><p>以下表格按物料展示仓库需要关注的系统库存、安全库存、库存状态和演示反馈状态。反馈状态仅用于说明现场可信度：默认可视为未确认，也可按现有库存状态演示为待盘点、现场异常或已确认；这些状态暂不保存、不提交、不写入 localStorage、不修改库存、不确认采购建议、不生成采购单，也不影响 MRP 核心计算。</p></div>${warehouseFeedbackTable}</article>
    <div class="page-intro"><div><span class="kicker">WAREHOUSE OVERVIEW</span><h3 style="margin:4px 0 6px;font-size:16px">仓库库存概览</h3><p>以下数字基于当前演示库存只读汇总，仅用于仓库预警参考；安全库存缺失或为 0 时不纳入低库存判断，也不会自动触发任何业务单据。</p></div></div>
    <div class="stats-grid">${statCard('物料总数', materials.length, '来自现有物料资料', 'violet', 'layers')}${statCard('库存为 0', zeroStockCount, '当前库存小于等于 0', 'red', 'warehouse')}${statCard('低于安全库存', lowStockCount, '库存大于 0 且低于安全库存', 'amber', 'chart')}${statCard('库存正常', normalStockCount, '当前库存大于等于安全库存', 'blue', 'box')}</div>
    <article class="panel table-panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">WAREHOUSE ALERTS</span><h3>库存预警列表</h3></div><span class="version">${alertRows.length} 项 · 只读</span></div><div class="placeholder-copy"><p>未维护安全库存或安全库存为 0 的物料暂不纳入低库存预警；本列表只显示库存为 0 和低于安全库存的只读提示。</p></div>${alertTable}</article>
    <div class="document-shell"><article class="panel table-panel"><div class="panel-head"><div><span class="kicker">RECHECK NOTES</span><h3>仓库复查提示</h3></div><span class="version">${recheckRows.length} 项 · 不保存结果</span></div><div class="placeholder-copy"><p>以下内容只是复查提示，不会保存复查结果、修改库存数据、扣减库存或生成采购单。</p></div>${recheckTable}</article>
    <article class="panel workflow-panel"><span class="kicker">FEEDBACK ONLY</span><h3>对计划 / 采购 / 老板的反馈提示</h3><div class="workflow-steps">${feedbackMessages.map((message) => `<span>${message}</span>`).join('')}</div><p>以上提示只是仓库视角反馈：提醒计划排产前确认库存可用性，提醒采购提前关注供应风险，提醒老板哪些库存需要人工复核；不会修改 Phase 2C 的采购建议，不会生成采购单，不会保存或提交任何反馈结果，也不会影响 MRP 核心计算结果。</p></article></div>`;
}

function deliveryRiskPage() {
  const products = productService.listProducts();
  const productOptions = products.map((product) => `<option value="${product.id}" ${product.id === deliveryRiskInputState.selectedProductId ? 'selected' : ''}>${product.code} · ${product.name}</option>`).join('');
  return `<div class="skeleton-notice"><div><span class="eyebrow">LUFUTA LITE / PHASE 6 DEMO</span><strong>下单前交期与采购分析</strong><p>本页用于判断 HE-110S 小型款 300 台急单能否按 15 天交付。系统按该型号 BOM 展开需求，结合库存、安全库存、采购周期和仓库反馈，给出只读判断：本单可以有条件推进，但不建议直接乐观承诺。</p></div><span class="phase-chip">只读分析</span></div><form class="panel"><div class="panel-head"><div><span class="kicker">分析输入</span><h3>分析条件</h3></div><span class="version">仅用于本次判断</span></div><div class="modal-body"><label class="field"><span>产品</span><select name="selectedProductId" data-delivery-risk-input><option value="">请选择产品</option>${productOptions}</select></label><label class="field"><span>计划数量</span><input name="plannedQty" type="number" min="0" step="1" placeholder="例如 300" value="${deliveryRiskInputState.plannedQty}" data-delivery-risk-input /></label><label class="field"><span>期望交期</span><input name="requiredDate" type="date" value="${deliveryRiskInputState.requiredDate}" data-delivery-risk-input /></label><label class="field"><span>分析日期</span><input name="asOfDate" type="date" value="${deliveryRiskInputState.asOfDate}" data-delivery-risk-input /></label></div><div class="placeholder-copy"><p>当前已默认带入演示订单，可手动修改条件重新分析；默认值不代表真实订单已保存。</p></div><div class="modal-actions"><button class="primary" type="button" data-action="delivery-risk-placeholder">分析交期风险</button></div></form>${orderDecisionSummaryPanel()}${riskSourceSummaryPanel()}${deliveryFeasibilityPanel()}${procurementPriorityGroupsPanel()}${warehouseFeedbackReferencePanel()}${deliveryRiskPreviewPanel()}<article class="panel workflow-panel"><span class="kicker">分析口径</span><h3>本单分析依据与边界</h3><div class="workflow-steps"><span>HE-110S 需求</span><b>+</b><span>BOM</span><b>+</b><span>库存</span><b>+</b><span>采购周期</span><b>+</b><span>仓库反馈</span><b>→</b><span>交期风险</span></div><p>结果仅供下单前判断，不代表已排产、已承诺交期或已创建采购任务；系统不保存订单、不修改库存。</p></article>`;
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

function riskSourceSummaryPanel() {
  const rows = deliveryRiskPreview?.rows;
  const sources = [
    ['缺料风险', '等待分析', '生成结果后查看是否存在物料缺口。'],
    ['采购周期', '等待分析', '生成结果后查看是否存在采购周期风险。'],
    ['安全库存', '等待分析', '生成结果后查看安全库存是否可能影响后续订单。'],
    ['仓库反馈', '等待分析', '生成结果后查看库存状态不确定性提示。'],
  ];

  if (rows) {
    const hasShortage = rows.some((row) => row.shortageQty > 0);
    const hasProcurementRisk = rows.some((row) => row.riskLevel === 'critical' || row.riskLevel === 'warning' || (row.recommendation.recommendedQty > 0 && row.procurementLeadTimeDays === null));
    const hasSafetyStockRisk = rows.some((row) => row.quantityRisk === 'low' || row.recommendation.action === '建议补充安全库存');
    const hasWarehouseFeedback = rows.map((row, index) => warehouseFeedbackForRow(row, index)).some((feedback) => feedback.feedback !== '暂无异常');
    sources[0] = ['缺料风险', hasShortage ? '存在物料缺口，可能影响订单交付' : '暂无明显缺料风险', hasShortage ? '老板需要知道当前订单可能先卡在可用库存上。' : '当前库存对本单的直接缺料压力较低。'];
    sources[1] = ['采购周期', hasProcurementRisk ? '部分物料需要采购提前确认' : '暂无明显采购周期风险', hasProcurementRisk ? '老板需要知道交期是否依赖采购及时确认。' : '当前采购周期暂未形成主要交付风险。'];
    sources[2] = ['安全库存', hasSafetyStockRisk ? '下批订单可能继续受影响' : '安全库存状态相对稳定', hasSafetyStockRisk ? '老板需要知道本单后续可能压低安全库存。' : '当前安全库存暂未形成明显连续订单风险。'];
    sources[3] = ['仓库反馈', hasWarehouseFeedback ? '生产前需要复查实物可用性' : '暂无明显仓库库存异常提示', hasWarehouseFeedback ? '老板需要知道账面库存仍需结合仓库实物反馈确认。' : '当前仓库反馈未提示额外库存不确定性。'];
  }

  return `<article class="panel table-panel" data-risk-source-summary style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">老板视角 · 风险来源</span><h3>风险来源说明</h3></div><span class="version">只读说明</span></div><div class="placeholder-copy"><p>风险来源说明仅用于老板阅读，不会改变系统计算结果、采购建议或库存数量。</p></div><div class="table-wrap"><table><thead><tr><th>风险来源</th><th>当前判断</th><th>老板需要知道</th></tr></thead><tbody>${sources.map(([source, judgment, note]) => `<tr><td><strong>${source}</strong></td><td>${judgment}</td><td>${note}</td></tr>`).join('')}</tbody></table></div></article>`;
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
  if (!rows) return `<article class="panel" data-procurement-priority-groups style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">采购视角 · 本单物料关注顺序</span><h3>采购优先级分组</h3></div><span class="version">只读分组</span></div><div class="empty-table"><strong>等待分析</strong><p>本区用于判断 HE-110S 小型款 300 台急单中，哪些物料需要采购当天确认采购或供应周期。请先完成分析条件并生成结果。</p></div></article>`;
  if (!rows.length) return `<article class="panel" data-procurement-priority-groups style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">采购视角 · 本单物料关注顺序</span><h3>采购优先级分组</h3></div><span class="version">只读分组</span></div><div class="empty-table"><strong>暂无法分组</strong><p>当前产品尚未维护 BOM，缺少可用于采购判断的物料需求。</p></div></article>`;

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
    { key: 'immediate', title: '立即确认', description: '本单关键风险：建议当天确认以下物料的采购安排和供应周期，降低对 15 天交付的影响。', emptyText: '暂无需要立即确认的物料', rows: immediate },
    { key: 'attention', title: '建议关注', description: '以下物料当前可能不影响本单直接缺口，但订单扣减后低于安全库存或需要持续关注。', emptyText: '暂无需要重点关注的物料', rows: attention },
    { key: 'no-purchase', title: '暂不采购', description: '以下物料当前库存可覆盖本单，暂不建议立即采购。', emptyText: '暂无可归入暂不采购的物料', rows: noPurchase },
  ];

  return `<article class="panel" data-procurement-priority-groups style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">采购视角 · 本单物料关注顺序</span><h3>采购优先级分组</h3></div><span class="version">${rows.length} 项物料</span></div><div class="placeholder-copy"><p>本区用于判断 HE-110S 小型款 300 台急单中，哪些物料需要采购优先确认；不会创建采购任务或采购单。</p></div><div class="entry-grid">${groups.map(procurementPriorityGroup).join('')}</div><div class="placeholder-copy"><p>本分组仅供采购判断，实际采购仍需人工确认。</p></div></article>`;
}

function warehouseFeedbackPlanHint(feedback) {
  if (feedback.feedback === '暂无异常') return '暂无仓库异常提示';
  if (feedback.feedback === '物料位置需确认') return '生产前需确认物料位置';
  if (feedback.feedback === '包装 / 状态待确认') return '包装 / 状态待确认';
  if (feedback.feedback === '账面库存可能不可靠') return '账面库存可能不可靠，生产前需确认可用数量';
  if (feedback.feedback === '实物数量需复查') return '实物数量需复查';
  return '生产前需确认可用数量';
}

function warehouseFeedbackPurchaseHint(row, feedback) {
  if (feedback.feedback === '账面库存可能不可靠') return '建议采购关注，但不是采购申请';
  if (feedback.feedback === '生产前需确认可用数量') return '安全库存偏低，建议提前关注供应风险';
  if (Number(row.procurementLeadTimeDays) >= 14) return '采购周期较长，建议提前确认供应可能性';
  const target = typeof feedback.target === 'string' ? feedback.target : '';
  return target.includes('采购') ? '建议采购关注供应风险，但不是采购申请' : '暂无采购关注提示';
}

function safeDisplayText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function readonlyTagList(labels) {
  const cleanLabels = labels.filter((label) => typeof label === 'string' && label.trim());
  return cleanLabels.length
    ? cleanLabels.map((label) => `<span class="soft-tag" style="display:inline-block;margin:2px 4px 2px 0">${label}</span>`).join('')
    : `<span class="soft-tag">本单暂不影响交付</span>`;
}

function needsWarehouseConfirmation(feedback) {
  const feedbackText = safeDisplayText(feedback.feedback, safeDisplayText(feedback.feedbackStatus, '暂无仓库反馈'));
  return ['现场异常', '待盘点', '未确认', '账面库存可能不可靠', '实物数量需复查', '物料位置需确认', '包装 / 状态待确认'].includes(feedbackText);
}

function deliveryRiskRowTags(row, feedback) {
  const labels = [];
  const recommendedQty = Number(row.recommendation?.recommendedQty ?? 0);
  const hasShortage = Number(row.shortageQty) > 0;
  const needsPurchase = hasShortage || row.recommendation?.action === '建议采购' || recommendedQty > 0;

  if (hasShortage && row.riskLevel !== 'ok') labels.push('本单关键风险');
  if (needsPurchase || row.mustOrderNow) labels.push('需采购确认');
  if (row.procurementLeadTimeDays === null && needsPurchase) labels.push('周期待确认');
  if (needsWarehouseConfirmation(feedback)) labels.push('需仓库确认');
  if (!hasShortage) labels.push('库存可覆盖');

  return readonlyTagList(labels);
}

function warehouseFeedbackReferencePanel() {
  const rows = deliveryRiskPreview?.rows;
  if (!rows) return '';
  if (!rows.length) return `<article class="panel" data-warehouse-feedback-reference style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">仓库反馈 · 计划 / 采购参考</span><h3>仓库反馈提示</h3></div><span class="version">只读参考</span></div><div class="empty-table"><strong>暂无物料反馈</strong><p>当前产品尚未维护 BOM，无法同步仓库反馈提示。</p></div></article>`;
  const feedbackRows = rows.map((row, index) => ({ row, feedback: warehouseFeedbackForRow(row, index) }));
  return `<article class="panel table-panel" data-warehouse-feedback-reference style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">仓库反馈 · 本单库存可信度参考</span><h3>仓库反馈提示</h3></div><span class="version">${feedbackRows.length} 项 · 只读参考</span></div><div class="placeholder-copy"><p>本区用于判断 HE-110S 小型款 300 台急单中，哪些库存数据需要仓库现场确认。仓库反馈仅作为计划和采购的只读参考，不会修改库存，不会改变采购建议，不会生成采购单。</p></div>${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>物料</th><th>仓库反馈</th><th>本单标注</th><th>计划参考</th><th>采购参考</th><th>说明</th></tr></thead><tbody>${feedbackRows.map(({ row, feedback }) => { const feedbackText = safeDisplayText(feedback.feedback, safeDisplayText(feedback.feedbackStatus, '暂无仓库反馈')); const noteText = safeDisplayText(feedback.note, safeDisplayText(feedback.audienceHint, '暂无补充说明')); return `<tr><td><div class="cell-main"><div class="material-avatar small">${row.material.name[0]}</div><div><strong>${row.material.name}</strong><small>${row.material.code} · 库存 ${format(row.stockQty)} ${row.material.unit}</small></div></div></td><td><span class="soft-tag">${feedbackText}</span></td><td>${deliveryRiskRowTags(row, feedback)}</td><td>${warehouseFeedbackPlanHint(feedback)}</td><td>${warehouseFeedbackPurchaseHint(row, feedback)}</td><td>${noteText}</td></tr>`; }).join('')}</tbody></table></div></article>`;
}

function deliveryRiskPreviewPanel() {
  if (!deliveryRiskPreview) return '';
  const { product, plannedQty, requiredDate, asOfDate, rows } = deliveryRiskPreview;
  const summary = `<div class="flow-strip" data-delivery-risk-summary><span>产品：${product.code} · ${product.name}</span><span>计划数量：${format(plannedQty)}</span><span>期望交期：${requiredDate}</span><span>分析日期：${asOfDate}</span></div>`;
  const legend = `<article class="panel workflow-panel" data-delivery-risk-legend style="margin-top:18px"><span class="kicker">判断口径</span><h3>风险等级说明</h3><div class="workflow-steps"><span>可满足：当前库存可覆盖本次需求</span><span>交期紧张：存在缺料，按当前采购周期仍可能满足期望交期</span><span>交期高风险：缺料物料预计无法在期望交期前到料</span><span>无法判断：采购周期未维护，暂无法判断交期风险</span></div></article>`;
  if (!rows.length) return `<article class="panel table-panel" data-delivery-risk-preview><div class="panel-head"><div><span class="kicker">物料明细 · 交期风险</span><h3>物料交期风险明细</h3></div><span class="version">${product.code} · 只读预览</span></div>${summary}<div class="empty-table"><strong>当前产品尚未维护 BOM，无法生成需求预览</strong><p>请先确认该产品的 BOM 资料，再进行交期判断。</p></div></article>${legend}`;
  const feedbackRows = rows.map((row, index) => ({ row, feedback: warehouseFeedbackForRow(row, index) }));
  const recommendationView = `<article class="panel table-panel" data-procurement-recommendation-view style="margin-top:18px"><div class="panel-head"><div><span class="kicker">物料明细 · 采购建议</span><h3>采购建议明细（只读）</h3></div><span class="version">${rows.length} 项建议</span></div><div class="placeholder-copy"><p>建议数量根据当前计划数量、BOM、库存、安全库存和采购周期自动计算，仅供采购判断。页面不会生成采购单、保存建议或修改、占用库存；实际采购需人工确认。</p></div>${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>物料</th><th>建议动作</th><th>建议采购数量</th><th>本单标注</th><th>原因</th><th>优先级</th><th>采购周期</th><th>风险等级</th></tr></thead><tbody>${feedbackRows.map(({ row, feedback }) => `<tr><td><div class="cell-main"><div class="material-avatar small">${row.material.name[0]}</div><div><strong>${row.material.name}</strong><small>${row.material.code} · ${row.material.unit}</small></div></div></td><td>${row.recommendation.action}</td><td><strong>${format(row.recommendation.recommendedQty)}</strong> ${row.material.unit}</td><td>${deliveryRiskRowTags(row, feedback)}</td><td>${row.recommendation.reason}</td><td><span class="soft-tag">${row.recommendation.priority}</span></td><td>${formatProcurementLeadTimeDays(row.procurementLeadTimeDays)}</td><td><span class="soft-tag">${row.deliveryRiskLabel}</span></td></tr>`).join('')}</tbody></table></div></article>`;
  return `<article class="panel table-panel" data-delivery-risk-preview><div class="panel-head"><div><span class="kicker">物料明细 · 交期风险</span><h3>物料交期风险明细</h3></div><span class="version">${product.code} · ${rows.length} 项物料</span></div>${summary}${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>物料编码</th><th>物料名称</th><th>本单标注</th><th>单位用量</th><th>计划数量</th><th>总需求</th><th>当前库存</th><th>缺口数量</th><th>库存判断</th><th>采购周期</th><th>交期风险</th><th>风险说明</th></tr></thead><tbody>${feedbackRows.map(({ row, feedback }) => `<tr><td><strong class="code">${row.material.code}</strong></td><td>${row.material.name}</td><td>${deliveryRiskRowTags(row, feedback)}</td><td>${format(row.qtyPerProduct)} ${row.material.unit}</td><td>${format(plannedQty)}</td><td><strong>${format(row.requiredQty)}</strong> ${row.material.unit}</td><td>${format(row.stockQty)} ${row.material.unit}</td><td><strong class="${row.shortageQty > 0 ? 'danger-text' : 'muted'}">${format(row.shortageQty)}</strong> ${row.material.unit}</td><td><span class="stock-level ${row.shortageQty > 0 ? 'bad' : ''}"><i></i>${row.shortageQty > 0 ? '库存不足' : '库存可覆盖'}</span></td><td>${formatProcurementLeadTimeDays(row.procurementLeadTimeDays)}</td><td><span class="soft-tag">${row.deliveryRiskLabel}</span></td><td>${row.deliveryRiskReason}</td></tr>`).join('')}</tbody></table></div></article>${recommendationView}${legend}`;
}

function productBomPage() {
  const products = productService.listProducts();
  const materials = materialService.listMaterials();
  const selected = sessionStorage.getItem('selectedProduct') || products[0]?.id;
  const items = productService.listBOMItems(selected);
  const selectedProduct = products.find((product) => product.id === selected);
  return `${skeletonNotice('产品 / BOM', '当前只读展示 Lite 产品基础资料及其物料用量关系，是 HE-110S 小型款 300 台急单展开物料需求的依据页面。产品侧不含审批、版本冻结、生命周期或客户订单绑定；BOM 侧不含审核、工程变更、版本发布或历史追踪。')}<div class="product-tabs">${products.map((p) => `<button class="product-tab ${p.id === selected ? 'active' : ''}" data-product-tab="${p.id}"><small>${p.model}</small><strong>${p.code}</strong><span>${productService.listBOMItems(p.id).length} 项物料</span></button>`).join('')}</div><article class="panel table-panel"><div class="panel-head bom-title"><div><span class="kicker">PRODUCT / BOM SKELETON</span><h3>${selectedProduct?.code || '未知产品'} 物料组成</h3></div><span class="version">${selectedProduct?.code === 'HE-110S' ? '本单判断依据' : '只读演示'}</span></div><div class="placeholder-copy"><p>当前演示急单使用 HE-110S 小型款 BOM 展开 300 台物料需求；本表仅展示结构依据，不保存订单或修改 BOM。</p></div>${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>序号</th><th>物料编码</th><th>物料名称</th><th>分类</th><th>单台用量</th><th>单位</th><th>BOM 版本</th></tr></thead><tbody>${items.map((row, index) => { const material = materials.find((m) => m.id === row.materialId); if (!material) return ''; return `<tr><td class="muted">${String(index + 1).padStart(2, '0')}</td><td><strong class="code">${material.code}</strong></td><td>${material.name}</td><td><span class="soft-tag">${material.category}</span></td><td><strong>${row.qtyPerProduct}</strong></td><td>${material.unit}</td><td><span class="muted">${selectedProduct?.code === 'HE-110S' ? '本单依据' : '未启用'}</span></td></tr>`; }).join('')}</tbody></table></div></article>`;
}


function operationBoundaryPanel(title, points) {
  return `<article class="panel" style="margin-bottom:20px"><div class="panel-head"><div><span class="kicker">READ ONLY BOUNDARY</span><h3>${title}</h3></div><span class="version">占位演示</span></div><div class="placeholder-copy"><strong>当前页面仅用于演示未来库存操作方向</strong><p>不执行真实业务、不保存记录、不修改库存。</p></div><div class="entry-grid">${points.map(([label, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${label}</strong><small>${copy}</small></span></div>`).join('')}</div></article>`;
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
  return `${skeletonNotice('待审核流水 / 审核池', '当前只读展示朋友蓝图中的待审核记录结构，用于验证未来业务链路。当前演示不执行单据保存、真实审批、权限判断或库存过账。')}${operationBoundaryPanel('待审核流水只读边界', [['未来审核方向', '当前用于演示未来库存动作可能进入审核流程。', 'chart'], ['不审批真实记录', '当前不会审批任何真实记录，也不会保存审核结果。', 'grid'], ['不改变库存', '当前不会修改库存数量，也不会生成库存流水。', 'warehouse']])}<article class="panel table-panel"><div class="panel-head"><div><span class="kicker">PENDING DOCUMENTS</span><h3>待审核业务记录</h3></div><span class="version">${pendingDocuments.length} 条 · 只读演示</span></div>${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>单据编号</th><th>单据类型</th><th>申请人</th><th>提交时间</th><th>库存影响</th><th>风险标记</th><th>审核状态</th></tr></thead><tbody>${body}</tbody></table></div></article>`;
}

function documentPlaceholder(type, direction, description) {
  return `${skeletonNotice(type, `当前仅展示${type}模块的后续方向，不提供单据填写、保存、提交或审核。这里不会修改库存、不会过账，也不会连接 API 或数据库。`)}${operationBoundaryPanel(`${type}只读边界`, [['占位演示', description, 'box'], ['不生成单据', `当前不会生成${type.replace('占位', '单')}，也不会保存业务记录。`, 'chart'], ['不修改库存', '当前不会增加、扣减或改变任何库存数量。', 'warehouse']])}<div class="document-shell"><article class="panel"><div class="panel-head"><div><span class="kicker">PLACEHOLDER MODULE</span><h3>${type}模块占位</h3></div><span class="version">仅展示方向</span></div><div class="placeholder-form"><div><span>占位模块</span><strong>${type}</strong></div><div><span>后续方向</span><strong>${direction}</strong></div><div><span>当前说明</span><strong>${description}</strong></div></div></article><article class="panel workflow-panel"><span class="kicker">FUTURE DIRECTION</span><h3>后续执行方向</h3><div class="workflow-steps"><span>单据记录</span><b>→</b><span>审核确认</span><b>→</b><span>库存影响</span></div><p>以上仅为后续方向说明；当前演示不填写、不保存、不提交、不审核，也不修改库存。</p></article></div>`;
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
    'order-evaluations': orderEvaluationsPage,
    'order-evaluation-detail': orderEvaluationDetailPage,
    'real-data-trial': realDataTrialPage,
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
    const riskSourceSummary = document.querySelector('[data-risk-source-summary]');
    if (riskSourceSummary) riskSourceSummary.outerHTML = riskSourceSummaryPanel();
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
  if (action === 'view-order-evaluation') {
    selectedOrderEvaluationId = dataset.id;
    return navigate('order-evaluation-detail');
  }
  if (action === 'back-order-evaluations') return navigate('order-evaluations');
  if (action === 'delivery-risk-placeholder') {
    const product = productService.listProducts().find((item) => item.id === deliveryRiskInputState.selectedProductId);
    if (!product) return toast('请选择产品');
    if (!deliveryRiskInputState.plannedQty || Number(deliveryRiskInputState.plannedQty) <= 0) return toast('请输入有效计划数量');
    if (!deliveryRiskInputState.requiredDate) return toast('请选择期望交期');
    if (!deliveryRiskInputState.asOfDate) return toast('请选择分析日期');
    if (!isValidDateInputValue(deliveryRiskInputState.requiredDate)) return toast('请选择有效期望交期');
    if (!isValidDateInputValue(deliveryRiskInputState.asOfDate)) return toast('请选择有效分析日期');
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

const hashPage = location.hash.slice(1); if (pages.some(([id]) => id === hashPage) || hashPage === 'order-evaluation-detail') currentPage = hashPage;
render();
