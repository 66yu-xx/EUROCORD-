import { initialData } from './data.js';
import { calculateMaterialRequirements, getInventoryStatusCounts, getSummary } from './mrp.js';
import { getSupportedRoles, isSupportedRole } from './roleAccess.js';
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
const DEFAULT_DEMO_ROLE_ID = 'sales';
let currentDemoRoleId = DEFAULT_DEMO_ROLE_ID;
let toastTimer;
let selectedOrderEvaluationId = data.orderEvaluationRecords?.[0]?.id || null;
const DEMO_DELIVERY_RISK_ORDER = {
  productId: 'p1',
  plannedQty: '300',
  deliveryDaysFromToday: 15,
};
const deliveryRiskInputState = getDemoDeliveryRiskDefaults();
let deliveryRiskPreview = null;
const REAL_DATA_TRIAL_SOURCE_SYSTEM = 'system';
const REAL_DATA_TRIAL_SOURCE_TEMPORARY = 'temporary';
const realDataTrialInputState = { source: REAL_DATA_TRIAL_SOURCE_SYSTEM, selectedProductId: '', plannedQty: '', requiredDate: '', asOfDate: formatDateInputValue(new Date()) };
const temporaryTrialInputState = {
  productName: '',
  plannedQty: '',
  requiredDate: '',
  asOfDate: formatDateInputValue(new Date()),
  materials: [createTemporaryTrialMaterialRow()],
};
let realDataTrialPreview = null;
let realDataTrialError = '';
const DELIVERY_RISK_LABELS = { ok: '可满足', warning: '交期紧张', critical: '交期高风险', unknown: '无法判断' };
const DELIVERY_RISK_REASONS = {
  ok: '采购周期可满足期望交期',
  warning: '采购周期接近期望交期，存在延期风险',
  critical: '采购周期预计无法满足期望交期',
  unknown: '采购周期未维护，无法判断交期风险',
};
const TRIAL_DATE_MIN = '2000-01-01';
const TRIAL_DATE_MAX = '2100-12-31';
const TRIAL_EVALUATION_RECORDS_KEY = 'lufuta.trialEvaluationRecords.v1';
let latestTrialEvaluationRecord = readTrialEvaluationRecords()[0] || null;
let expandedTrialEvaluationRecordId = '';
let pendingClearLocalEvaluationRecords = false;

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateTrialDateInputs({ requiredDate, asOfDate, asOfLabel = '分析日期' }) {
  if (!isValidDateInputValue(requiredDate) || !isValidDateInputValue(asOfDate)) return '请检查日期，当前试算日期年份需要在 2000 到 2100 之间。';
  if (requiredDate < asOfDate) return `期望交期不能早于${asOfLabel}，请检查日期。`;
  return '';
}

function createTemporaryTrialMaterialRow() {
  return { code: '', name: '', qtyPerProduct: '', stockQty: '', safetyStock: '', procurementLeadTimeDays: '' };
}

function resetTemporaryTrialInputState() {
  temporaryTrialInputState.productName = '';
  temporaryTrialInputState.plannedQty = '';
  temporaryTrialInputState.requiredDate = '';
  temporaryTrialInputState.asOfDate = formatDateInputValue(new Date());
  temporaryTrialInputState.materials = [createTemporaryTrialMaterialRow()];
  realDataTrialError = '';
  realDataTrialPreview = null;
}

function fillTemporaryTrialDemoData() {
  // DEMO_ONLY: 示例数据只填充当前页面临时输入框，不写入正式产品、BOM、库存或订单记录。
  temporaryTrialInputState.productName = '临时壁挂取暖器订单';
  temporaryTrialInputState.plannedQty = '80';
  temporaryTrialInputState.asOfDate = formatDateInputValue(new Date());
  temporaryTrialInputState.requiredDate = formatDateInputValue(addDays(new Date(), 14));
  temporaryTrialInputState.materials = [
    { code: 'TMP-PCB-01', name: '临时控制板', qtyPerProduct: '1', stockQty: '35', safetyStock: '10', procurementLeadTimeDays: '16' },
    { code: 'TMP-SHELL-01', name: '临时外壳组件', qtyPerProduct: '1', stockQty: '90', safetyStock: '20', procurementLeadTimeDays: '' },
    { code: 'TMP-SCREW-01', name: '临时螺丝包', qtyPerProduct: '4', stockQty: '360', safetyStock: '80', procurementLeadTimeDays: '3' },
    { code: 'TMP-LABEL-01', name: '临时标签', qtyPerProduct: '1', stockQty: '200', safetyStock: '20', procurementLeadTimeDays: '2' },
  ];
  realDataTrialError = '';
  realDataTrialPreview = null;
}

function toOptionalNonNegativeNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  return Number(value);
}

function validateTemporaryTrialInputs() {
  const productName = temporaryTrialInputState.productName.trim();
  const plannedQty = Number(temporaryTrialInputState.plannedQty);
  if (!productName) return '产品名称不能为空';
  if (!temporaryTrialInputState.plannedQty || !Number.isFinite(plannedQty) || plannedQty <= 0) return '计划数量必须大于 0';
  if (!temporaryTrialInputState.requiredDate) return '期望交期不能为空';
  if (!temporaryTrialInputState.asOfDate) return '分析日期不能为空';
  const dateError = validateTrialDateInputs({ requiredDate: temporaryTrialInputState.requiredDate, asOfDate: temporaryTrialInputState.asOfDate });
  if (dateError) return dateError;
  if (!temporaryTrialInputState.materials.length) return '至少需要一条临时物料行';

  for (let index = 0; index < temporaryTrialInputState.materials.length; index += 1) {
    const row = temporaryTrialInputState.materials[index];
    const rowLabel = `第 ${index + 1} 行物料`;
    const qtyPerProduct = Number(row.qtyPerProduct);
    const stockQty = Number(row.stockQty);
    const safetyStock = toOptionalNonNegativeNumber(row.safetyStock, 0);
    const procurementLeadTimeDays = row.procurementLeadTimeDays === '' ? null : Number(row.procurementLeadTimeDays);
    if (!row.name.trim()) return `${rowLabel}名称不能为空`;
    if (!row.qtyPerProduct || !Number.isFinite(qtyPerProduct) || qtyPerProduct <= 0) return `${rowLabel}单台用量必须大于 0`;
    if (row.stockQty === '' || !Number.isFinite(stockQty) || stockQty < 0) return `${rowLabel}当前库存不能小于 0`;
    if (!Number.isFinite(safetyStock) || safetyStock < 0) return `${rowLabel}安全库存不能小于 0`;
    if (procurementLeadTimeDays !== null && (!Number.isFinite(procurementLeadTimeDays) || procurementLeadTimeDays < 0)) return `${rowLabel}采购周期必须为 0 或正数，或留空表示待确认`;
  }

  return '';
}

function buildTrialRowsFromExistingData({ product, plannedQty, requiredDate, asOfDate }) {
  const materials = materialService.listMaterials();
  const balances = inventoryService.listBalances();
  return productService.listBOMItems(product.id).map((item) => {
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
      requiredDate,
      asOfDate,
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
}

function buildTemporaryTrialRows({ materialRows, plannedQty, requiredDate, asOfDate }) {
  return materialRows.map((input, index) => {
    const material = {
      id: `temp-${index + 1}`,
      code: input.code.trim() || `TEMP-${String(index + 1).padStart(2, '0')}`,
      name: input.name.trim(),
      unit: '件',
    };
    const qtyPerProduct = Number(input.qtyPerProduct);
    const stockQty = Number(input.stockQty);
    const safetyStock = toOptionalNonNegativeNumber(input.safetyStock, 0);
    const procurementLeadTimeDays = input.procurementLeadTimeDays === '' ? null : Number(input.procurementLeadTimeDays);
    return {
      material,
      qtyPerProduct,
      requiredQty: qtyPerProduct * plannedQty,
      stockQty,
      safetyStock,
      procurementLeadTimeDays,
    };
  }).map((row) => {
    const risk = calculateProcurementRisk({
      requiredQty: row.requiredQty,
      stockQty: row.stockQty,
      safetyStock: row.safetyStock,
      procurementLeadTimeDays: row.procurementLeadTimeDays,
      requiredDate,
      asOfDate,
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
}

const pages = [
  ['dashboard', '首页', 'grid'], ['delivery-risk', '交期风险分析', 'chart'], ['warehouse-alerts', '库存预警反馈', 'warehouse'],
  ['order-evaluations', '接单评估记录', 'chart'],
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
const LOCAL_TABLE_SCROLL_STYLE = 'display:block;width:100%;max-width:100%;min-width:0;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain';
const PAGE_OVERFLOW_GUARD_STYLE = `<style id="page-overflow-guard">
  main { min-width:0; max-width:calc(100vw - 230px); overflow-x:hidden; }
  .content { width:100%; min-width:0; overflow-x:hidden; }
  .panel, .table-panel { min-width:0; max-width:100%; }
  .table-wrap { display:block; width:100%; max-width:100%; min-width:0; overflow-x:auto; overflow-y:hidden; overscroll-behavior-x:contain; }
  .dashboard-grid > *, .stats-grid > *, .entry-grid > *, .document-shell > *, .placeholder-form > *, .modal-body > * { min-width:0; }
  .cell-main { min-width:0; }
  [data-warehouse-feedback-reference] .table-wrap,
  [data-delivery-risk-preview] .table-wrap,
  [data-procurement-recommendation-view] .table-wrap { overflow-x:hidden!important; }
  [data-warehouse-feedback-reference] table,
  [data-delivery-risk-preview] table,
  [data-procurement-recommendation-view] table { width:100%!important; min-width:0!important; table-layout:fixed; }
  [data-warehouse-feedback-reference] th,
  [data-warehouse-feedback-reference] td,
  [data-delivery-risk-preview] th,
  [data-delivery-risk-preview] td,
  [data-procurement-recommendation-view] th,
  [data-procurement-recommendation-view] td { height:auto; min-width:0; white-space:normal; overflow-wrap:anywhere; word-break:break-word; line-height:1.45; vertical-align:top; }
  [data-warehouse-feedback-reference] .cell-main,
  [data-delivery-risk-preview] .cell-main,
  [data-procurement-recommendation-view] .cell-main { align-items:flex-start; min-width:0; }
  [data-warehouse-feedback-reference] .cell-main > div:last-child,
  [data-delivery-risk-preview] .cell-main > div:last-child,
  [data-procurement-recommendation-view] .cell-main > div:last-child { min-width:0; }
  [data-warehouse-feedback-reference] .soft-tag,
  [data-delivery-risk-preview] .soft-tag,
  [data-delivery-risk-preview] .stock-level,
  [data-procurement-recommendation-view] .soft-tag { white-space:normal; }
  [data-real-data-trial-source] .entry-card { cursor:pointer; transition:border-color .16s ease, background .16s ease, box-shadow .16s ease, transform .16s ease; }
  [data-real-data-trial-source] .entry-card:hover { border-color:#2563eb; box-shadow:0 10px 24px rgba(37,99,235,.14); transform:translateY(-1px); }
  [data-real-data-trial-source] .entry-card[aria-pressed="true"] { border:2px solid #2563eb; background:#eff6ff; box-shadow:0 0 0 3px rgba(37,99,235,.14); }
  [data-real-data-trial-source] .entry-card[aria-pressed="true"] strong { color:#1d4ed8; }
  [data-real-data-trial-source] .source-mode-badge { display:inline-flex; width:max-content; max-width:100%; margin-bottom:6px; padding:3px 8px; border-radius:6px; background:#dbeafe; color:#1d4ed8; font-size:12px; font-weight:700; line-height:1.3; white-space:normal; }
  [data-real-data-trial-source] .source-mode-note { border-left:3px solid #2563eb; background:#f8fafc; overflow-wrap:anywhere; }
  @media (max-width:720px) { main { max-width:calc(100vw - 70px); } }
</style>`;

function appShell(content) {
  const active = pages.find((p) => p[0] === currentPage) || ['order-evaluation-detail', '接单评估记录详情', 'chart'];
  const currentRole = getSupportedRoles().find((role) => role.id === currentDemoRoleId);
  const roleOptions = getSupportedRoles().map((role) => `<option value="${role.id}" ${role.id === currentDemoRoleId ? 'selected' : ''}>${role.label}</option>`).join('');
  return `${PAGE_OVERFLOW_GUARD_STYLE}<div class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">L</div><div><strong>LUFUTA LITE</strong><small>物料管理系统</small></div></div>
      <nav><p>演示导览</p>${pages.map(([id, label, ico]) => `<button class="nav-item ${currentPage === id ? 'active' : ''}" data-page="${id}">${icon(ico)}<span>${label}</span></button>`).join('')}</nav>
      <div class="sidebar-footer"><div class="demo-dot"></div><div><strong>只读演示</strong><small>当前使用浏览器存储</small></div><button class="reset-button" data-action="reset-data" title="重置演示数据"><b>↺</b><span>重置演示数据</span></button></div>
    </aside>
    <main><header><div class="header-title"><small>LUFUTA 物料管理系统 LITE / ${active[1]}</small><h1>${active[1]}</h1></div><div class="header-actions"><span class="date">${new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</span><label class="demo-role-switcher"><span><small>DEMO ROLE</small><strong>${currentRole?.label || 'Sales'}</strong></span><select data-demo-role-switcher aria-label="切换演示角色">${roleOptions}</select><em>演示视图 · 非登录身份</em></label><button class="avatar">L</button></div></header><section class="content">${content}</section></main>
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
  const body = rows.length ? rows.join('') : '<tr><td colspan="11"><div class="empty-table"><strong>暂无评估记录</strong><p>当前没有静态接单评估记录；本页仍然只读，不提供新增、编辑或删除。</p></div></td></tr>';
  return `${skeletonNotice('接单评估记录', '当前页面展示的是接单评估记录原型数据，用于回看一次交期风险分析。它不是正式订单，不占用库存，不生成采购单，也不进入财务。')}<article class="panel table-panel" data-order-evaluations-page><div class="panel-head"><div><span class="kicker">ORDER EVALUATION RECORDS</span><h3>接单评估记录</h3></div><span class="version">${records.length} 条 · 演示记录</span></div><div class="placeholder-copy"><p>当前记录为内置演示评估记录，用于展示未来接单评估归档效果。重置数据不会删除这些演示记录。</p><p>这些记录来自静态演示数据，只用于说明“接单前评估”如何被回看；页面不提供新增、编辑、删除、重新分析或真实业务操作，也不会改变库存、采购、财务或审批状态。</p></div>${tableScrollHint()}<div class="table-wrap"><table><thead><tr><th>评估编号</th><th>产品</th><th>数量</th><th>期望交期</th><th>分析日期</th><th>风险等级</th><th>关键风险物料</th><th>需采购确认</th><th>需仓库确认</th><th>状态</th><th>只读回看</th></tr></thead><tbody>${body}</tbody></table></div></article>`;
}

function snapshotEmptyText(items, label) {
  return Array.isArray(items) && items.length ? `${items.length} 项` : `暂无${label}快照`;
}

function orderEvaluationDetailPage() {
  const record = orderEvaluationRecordById(selectedOrderEvaluationId);
  if (!record) {
    return `${skeletonNotice('接单评估记录详情', '当前没有可回看的接单评估记录。')}<article class="panel"><div class="empty-table"><strong>未找到评估记录</strong><p>请返回接单评估记录列表查看当前静态演示数据。</p><button class="secondary" data-action="back-order-evaluations">返回接单评估记录列表</button></div></article>`;
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
  const backToListButton = '<div data-order-evaluation-backline style="margin-bottom:14px"><button class="secondary" type="button" data-action="back-order-evaluations">← 返回接单评估记录列表</button></div>';

  return `${backToListButton}${skeletonNotice('接单评估记录详情', '当前页面用于回看一次接单评估记录，不代表正式接单。该记录不会占用库存，不会生成采购单，不会进入财务核算。')}<article class="panel" data-order-evaluation-detail style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">ORDER EVALUATION DETAIL</span><h3>${record.id || '待编号'}</h3></div><button class="secondary" data-action="back-order-evaluations">返回接单评估记录列表</button></div><div class="placeholder-form"><div><span>评估编号</span><strong>${record.id || '待编号'}</strong></div><div><span>状态</span><strong>${orderEvaluationStatusLabel(record.status)}</strong></div><div><span>产品</span><strong>${productLabel}</strong></div><div><span>数量</span><strong>${format(record.input?.plannedQty || 0)} 台</strong></div><div><span>期望交期</span><strong>${record.input?.requiredDate || '待确认'}</strong></div><div><span>分析日期</span><strong>${record.input?.asOfDate || '待确认'}</strong></div><div><span>创建时间</span><strong>${record.createdAt || '待确认'}</strong></div><div><span>更新时间</span><strong>${record.updatedAt || '待确认'}</strong></div><div><span>备注</span><strong>${record.input?.note || '暂无备注'}</strong></div></div></article><article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">SUMMARY</span><h3>分析摘要</h3></div><span class="version">只读快照</span></div><div class="placeholder-form"><div><span>风险等级</span><strong>${orderEvaluationRiskLabel(record.summary?.riskLevel)}</strong></div><div><span>是否可满足交期</span><strong>${record.summary?.canMeetRequiredDate ? '可以满足' : '暂不建议直接承诺'}</strong></div><div><span>关键风险物料数量</span><strong>${format(record.summary?.keyRiskMaterialCount || 0)}</strong></div><div><span>需采购确认数量</span><strong>${format(record.summary?.procurementConfirmCount || 0)}</strong></div><div><span>需仓库确认数量</span><strong>${format(record.summary?.warehouseConfirmCount || 0)}</strong></div></div></article><article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">ANALYSIS SNAPSHOT</span><h3>分析快照</h3></div><span class="version">${snapshot.source || '未知来源'}</span></div><div class="placeholder-form"><div><span>快照生成时间</span><strong>${snapshot.generatedAt || '待确认'}</strong></div><div><span>来源</span><strong>${snapshot.source || '待确认'}</strong></div><div><span>物料风险明细</span><strong>${snapshotEmptyText(snapshot.materialRisks, '物料风险明细')}</strong></div><div><span>采购建议快照</span><strong>${snapshotEmptyText(snapshot.procurementRecommendations, '采购建议')}</strong></div><div><span>仓库反馈提示</span><strong>${snapshotEmptyText(snapshot.warehouseFeedbackHints, '仓库反馈提示')}</strong></div></div></article><article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">BUSINESS BOUNDARY</span><h3>业务边界</h3></div><span class="version">演示记录 · 不触发业务联动</span></div><div class="entry-grid">${boundaryCards.map(([title, value]) => `<div class="entry-card">${icon('grid', 22)}<span><strong>${title}</strong><small>${value}</small></span></div>`).join('')}</div><div class="placeholder-copy"><p>本记录为演示评估记录，不是用户真实保存的接单评估记录。</p><p>本详情页只用于回看静态评估记录，不提供保存、编辑、删除、重新分析或真实业务操作。</p></div></article>`;
}

function realDataTrialSafetyStatus(row) {
  if (row.shortageQty > 0) return '库存不足';
  if (row.quantityRisk === 'low') return '余量低于安全库存';
  return '安全库存可覆盖';
}

function realDataTrialWarehousePoints(rows) {
  const points = [];
  rows.forEach((row) => {
    if (row.shortageQty > 0) points.push(`${row.material.name}：缺料 ${format(row.shortageQty)} ${row.material.unit}`);
    else if (row.quantityRisk === 'low') points.push(`${row.material.name}：库存覆盖但余量不足`);
    if (row.procurementLeadTimeDays === null) points.push(`${row.material.name}：采购周期缺失或数据待确认`);
  });
  return points.length ? points : ['当前试算未发现需要仓库优先确认的物料。'];
}

function realDataTrialRiskReasons(row) {
  const reasons = [];
  if (row.shortageQty > 0) reasons.push(`缺料 ${format(row.shortageQty)} ${row.material.unit}`);
  if (row.quantityRisk === 'low') reasons.push('库存低于安全库存或余量不足');
  if (row.procurementLeadTimeDays === null) reasons.push('采购周期缺失');
  else if (row.shortageQty > 0 && (row.riskLevel === 'critical' || row.riskLevel === 'warning')) reasons.push('采购周期需要确认');
  return reasons;
}

function prioritizedRealDataTrialRiskItems(rows, limit = 5) {
  return rows
    .map((row) => ({ row, reasons: realDataTrialRiskReasons(row) }))
    .filter((item) => item.reasons.length)
    .sort((a, b) => {
      const shortageDelta = Number(b.row.shortageQty > 0) - Number(a.row.shortageQty > 0);
      if (shortageDelta) return shortageDelta;
      const missingLeadTimeDelta = Number(b.row.procurementLeadTimeDays === null) - Number(a.row.procurementLeadTimeDays === null);
      if (missingLeadTimeDelta) return missingLeadTimeDelta;
      return Number(b.row.quantityRisk === 'low') - Number(a.row.quantityRisk === 'low');
    })
    .slice(0, limit);
}

function realDataTrialDecisionSummary(rows) {
  const total = rows.length;
  const covered = rows.filter((row) => row.shortageQty <= 0).length;
  const shortage = rows.filter((row) => row.shortageQty > 0).length;
  const lowStock = rows.filter((row) => row.quantityRisk === 'low').length;
  const missingLeadTime = rows.filter((row) => row.procurementLeadTimeDays === null).length;
  const longLeadTime = rows.filter((row) => row.shortageQty > 0 && row.procurementLeadTimeDays !== null && (row.riskLevel === 'critical' || row.riskLevel === 'warning')).length;
  const hasRisk = shortage > 0 || lowStock > 0 || missingLeadTime > 0 || longLeadTime > 0;
  const riskSources = [
    shortage > 0 ? '缺料物料' : '',
    lowStock > 0 ? '库存低或安全库存不足' : '',
    missingLeadTime > 0 ? '采购周期缺失' : '',
    longLeadTime > 0 ? '采购周期较长或需要交期确认' : '',
  ].filter(Boolean);
  const conclusion = hasRisk
    ? `当前试算订单存在物料 / 交期风险，主要来自${riskSources.join('、')}。建议先确认缺料、库存和采购周期，再作为接单或排期参考。`
    : '当前试算订单从物料角度看风险较低，但仍需仓库确认实际库存，并由计划确认生产排期。';

  return { total, covered, shortage, lowStock, missingLeadTime, longLeadTime, hasRisk, riskSources, conclusion };
}

function readTrialEvaluationRecords() {
  // BOUNDARY_NOTICE: Step 11 uses only browser LocalStorage for the current front-end minimum loop.
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(TRIAL_EVALUATION_RECORDS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeTrialEvaluationRecords(records) {
  // BOUNDARY_NOTICE: These records stay in the current browser and are not formal orders or formal master data.
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(TRIAL_EVALUATION_RECORDS_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

function clearLocalTrialEvaluationRecords() {
  // DEMO_ONLY / BOUNDARY_NOTICE: This clears only local test evaluation records from the current browser.
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.removeItem(TRIAL_EVALUATION_RECORDS_KEY);
    latestTrialEvaluationRecord = null;
    expandedTrialEvaluationRecordId = '';
    pendingClearLocalEvaluationRecords = false;
    return true;
  } catch {
    return false;
  }
}

function trialEvaluationRecordId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `EV-TRIAL-${stamp}-${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function trialEvaluationSourceLabel(source) {
  return source === REAL_DATA_TRIAL_SOURCE_TEMPORARY ? '临时输入' : '系统数据';
}

function formatRecordCreatedAt(value) {
  if (!value) return '待确认';
  return value.replace('T', ' ').slice(0, 19);
}

function displayEvaluationBoundaryNote(note) {
  return (note || '不代表正式订单，不影响库存，不创建采购单。')
    .replaceAll('不生成采购单', '不创建采购单')
    .replaceAll('不占用库存', '不影响库存')
    .replaceAll('转正式订单', '正式业务转换');
}

function evaluationRecordStatusHint(status) {
  if (status === '已作废') return '后续不再作为接单判断参考';
  if (status === '已转订单') return '未来状态说明，当前不提供转订单动作';
  return '仅用于接单前复查';
}

function createTrialEvaluationRecord(preview) {
  const { product, plannedQty, requiredDate, asOfDate, rows, source = REAL_DATA_TRIAL_SOURCE_SYSTEM } = preview;
  const now = new Date();
  const summary = realDataTrialDecisionSummary(rows);
  const keyRiskMaterials = prioritizedRealDataTrialRiskItems(rows, 5).map(({ row, reasons }) => ({
    code: row.material.code,
    name: row.material.name,
    reasons,
  }));

  return {
    id: trialEvaluationRecordId(now),
    recordType: 'trialOrderEvaluation',
    createdAt: now.toISOString(),
    source,
    sourceLabel: trialEvaluationSourceLabel(source),
    productName: product.name,
    productCode: product.code,
    plannedQty,
    requiredDate,
    asOfDate,
    conclusion: summary.conclusion,
    materialTotalCount: summary.total,
    shortageMaterialCount: summary.shortage,
    lowStockMaterialCount: summary.lowStock,
    missingLeadTimeMaterialCount: summary.missingLeadTime,
    keyRiskMaterials,
    status: '待确认',
    note: '不代表正式订单，不影响库存，不创建采购单。',
  };
}

function saveTrialEvaluationRecord() {
  if (!realDataTrialPreview) return null;
  const record = createTrialEvaluationRecord(realDataTrialPreview);
  const records = readTrialEvaluationRecords();
  const nextRecords = [record, ...records].slice(0, 20);
  if (!writeTrialEvaluationRecords(nextRecords)) return null;
  latestTrialEvaluationRecord = record;
  expandedTrialEvaluationRecordId = record.id;
  return record;
}

function savedTrialEvaluationRecordPanel() {
  if (!latestTrialEvaluationRecord) return '';
  const record = latestTrialEvaluationRecord;
  const keyRiskText = record.keyRiskMaterials?.length
    ? record.keyRiskMaterials.map((item) => `${item.code} · ${item.name}：${item.reasons.join('、')}`).join('；')
    : '暂无明显关键风险物料';
  const noteText = displayEvaluationBoundaryNote(record.note);

  return `<article class="panel" data-latest-trial-evaluation-record style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">LATEST EVALUATION RECORD</span><h3>最近保存的评估记录摘要</h3></div><span class="version">${record.id}</span></div><div class="placeholder-form"><div><span>评估编号</span><strong>${record.id}</strong></div><div><span>创建时间</span><strong>${formatRecordCreatedAt(record.createdAt)}</strong></div><div><span>数据来源</span><strong>${record.sourceLabel}</strong></div><div><span>产品名称</span><strong>${record.productName}</strong></div><div><span>计划数量</span><strong>${format(record.plannedQty)} 台</strong></div><div><span>状态</span><strong>${record.status}</strong></div></div><div class="placeholder-copy"><p>${record.conclusion}</p><p>关键风险物料摘要：${keyRiskText}</p><p>${noteText} 当前记录保存在浏览器 LocalStorage 中，用于验证接单评估记录概念。</p></div></article>`;
}

function trialEvaluationSavePanel() {
  // BOUNDARY_NOTICE / TRANSITION_COPY: LocalStorage is only the front-end minimum loop for Step 11; production needs backend, permissions, audit, and collaboration rules.
  return `<article class="panel" data-trial-evaluation-save-panel style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">ORDER EVALUATION SAVE</span><h3>保存为接单评估记录</h3></div><span class="version">本地最小闭环</span></div><div class="placeholder-copy"><p>可将本次试算的输入条件和风险摘要保存为接单评估记录，用于接单前复查和内部沟通。</p><p>当前使用浏览器 LocalStorage 做前端本地最小闭环，用于验证评估记录概念。未来正式版本需要后端数据库、权限、审计和多人协作规则。</p><p>保存评估记录不代表正式订单，不影响库存，不创建采购单，不进入财务或成本。</p></div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="primary" type="button" data-action="save-trial-evaluation-record">${icon('chart', 17)} 保存为评估记录</button></div></article>${savedTrialEvaluationRecordPanel()}`;
}

function savedEvaluationRecordListPanel() {
  // BOUNDARY_NOTICE / TRANSITION_COPY: LocalStorage records are read-only local references, not formal orders or workflow state.
  const records = readTrialEvaluationRecords();
  const emptyState = '<div class="empty-table"><strong>暂无已保存评估记录</strong><p>完成一次试算后，可保存为评估记录用于后续复查。</p></div>';
  const clearAction = pendingClearLocalEvaluationRecords
    ? '<div class="placeholder-copy" data-clear-local-evaluation-confirm><p>这只会清空当前浏览器本地保存的接单评估记录，不影响正式订单、库存或采购数据。是否继续？</p><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="secondary" type="button" data-action="cancel-clear-local-evaluation-records">取消</button><button class="primary" type="button" data-action="confirm-clear-local-evaluation-records">确认清空</button></div></div>'
    : '<div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="secondary" type="button" data-action="clear-local-evaluation-records">清空本地评估记录</button></div>';
  const rows = records.map((record) => {
    const expanded = expandedTrialEvaluationRecordId === record.id;
    const statusText = record.status || '待确认';
    const statusHint = evaluationRecordStatusHint(statusText);
    const keyRiskText = record.keyRiskMaterials?.length
      ? record.keyRiskMaterials.map((item) => `${item.code} · ${item.name}：${(item.reasons || []).join('、')}`).join('；')
      : '暂无明显关键风险物料';
    const detail = expanded
      ? `<div class="placeholder-form" style="margin-top:12px"><div><span>分析日期</span><strong>${record.asOfDate || '待确认'}</strong></div><div><span>物料总数</span><strong>${format(record.materialTotalCount || 0)} 项</strong></div><div><span>缺料物料数量</span><strong>${format(record.shortageMaterialCount || 0)} 项</strong></div><div><span>库存低 / 建议关注数量</span><strong>${format(record.lowStockMaterialCount || 0)} 项</strong></div><div><span>采购周期待确认数量</span><strong>${format(record.missingLeadTimeMaterialCount || 0)} 项</strong></div><div><span>边界说明</span><strong>${displayEvaluationBoundaryNote(record.note)}</strong></div></div><div class="placeholder-copy"><p>关键风险物料摘要：${keyRiskText}</p></div>`
      : '';
    return `<article class="entry-card" data-saved-evaluation-record="${record.id}" style="align-items:flex-start"><span>${icon('chart', 22)}</span><span><strong>${record.id || '待编号'} · ${record.productName || '待确认产品'}</strong><small>创建时间：${formatRecordCreatedAt(record.createdAt)} · 数据来源：${record.sourceLabel || trialEvaluationSourceLabel(record.source)} · 计划数量：${format(record.plannedQty || 0)} 台 · 期望交期：${record.requiredDate || '待确认'} · 状态：${statusText}：${statusHint}</small><small>${record.conclusion || '暂无整体风险结论'}</small><button class="secondary" type="button" data-action="toggle-saved-evaluation-summary" data-id="${record.id}" style="margin-top:10px">${expanded ? '收起摘要' : '查看摘要'}</button>${detail}</span></article>`;
  }).join('');

  return `<article class="panel" data-saved-evaluation-records style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">SAVED EVALUATION RECORDS</span><h3>已保存评估记录</h3></div><span class="version">${records.length} 条 · 只读</span></div><div class="placeholder-copy"><p>以下记录为当前浏览器本地保存的接单评估记录，仅用于接单前复查和内部沟通，不代表正式订单，不影响库存，不创建采购单。</p><p>本区只读取 LocalStorage 中的摘要记录，不提供作废、正式业务转换或修改状态操作。</p><p>仅清空当前浏览器本地保存的评估记录，不影响系统基础资料。</p></div>${clearAction}${records.length ? `<div class="entry-grid">${rows}</div>` : emptyState}</article>`;
}

function evaluationRecordStatusBoundaryPanel() {
  // BOUNDARY_NOTICE / TRANSITION_COPY: These are future status meanings only; Step 13 does not add status actions.
  const statuses = [
    ['待确认', '该评估记录仅代表一次接单前试算结果，仍需要人工确认客户需求、库存实物、采购周期和内部接单意见。'],
    ['已作废', '该评估记录后续不再作为接单判断参考，可能因为客户取消、数量变化、交期变化、BOM 变化或数据已过期。'],
    ['已转订单', '该评估记录未来可能被转为正式订单，但当前阶段不实现转订单动作。'],
  ];

  return `<article class="panel" data-evaluation-record-status-boundary style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">STATUS BOUNDARY</span><h3>评估记录状态说明</h3></div><span class="version">只读说明 · 不修改状态</span></div><div class="placeholder-copy"><p>当前版本只显示接单评估记录状态和状态含义，不提供作废、转订单、确认接单、删除或状态编辑操作。</p><p>状态不代表库存、采购、财务动作已发生；接单评估记录仍然不代表正式订单，不影响库存，不创建采购单。</p></div><div class="entry-grid">${statuses.map(([title, copy]) => `<div class="entry-card">${icon('grid', 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div></article>`;
}

function evaluationWorkflowDemoPathPanel() {
  // BOUNDARY_NOTICE / TRANSITION_COPY: This explains the current demo reading path only; it adds no business execution.
  const steps = [
    ['01 选择数据来源', '选择系统已有产品 / BOM / 库存，或在资料不完整时手动输入临时试算数据。', 'layers'],
    ['02 完成一次试算', '查看物料风险、交期风险、关键风险物料，以及老板、计划、采购各自关注点。', 'chart'],
    ['03 保存为评估记录', '把本次试算的输入条件和风险摘要保存为接单评估记录，用于接单前复查。', 'grid'],
    ['04 复查历史摘要', '在已保存评估记录中查看历史判断、关键物料摘要，并展开或收起明细摘要。', 'warehouse'],
    ['05 人工确认后再决策', '结合客户询单、库存实物、采购周期、计划排期和内部意见，未来再评估是否进入正式订单流程。', 'cart'],
  ];
  const scenarios = [
    ['客户询单', '先快速判断物料和交期风险，再决定是否继续沟通。'],
    ['接单前判断', '把一次性试算结论留作内部复查参考。'],
    ['资料不完整', '新产品或基础资料未维护完整时，可先用临时输入做风险测试。'],
    ['内部协同', '计划、采购、仓库确认前，用同一份摘要对齐风险来源。'],
  ];

  return `<article class="panel" data-evaluation-workflow-demo-path style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">EVALUATION WORKFLOW</span><h3>接单评估流程说明</h3></div><span class="version">演示路径 · 只读说明</span></div><div class="placeholder-copy"><p>当前接单评估闭环用于演示从一次性试算进入评估记录复查的阅读路径：先完成试算，再保存摘要记录，随后在本地记录中复查关键风险和状态含义。</p><p>接单评估记录不等于正式订单，不影响库存，不创建采购需求或采购单，不进入财务或成本；当前阶段仍是接单前评估和复查，不是业务执行。</p></div><div class="entry-grid">${steps.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div><div class="placeholder-copy"><strong>适用场景</strong><p>${scenarios.map(([title, copy]) => `${title}：${copy}`).join('；')}</p></div></article>`;
}

function realDataTrialDecisionSummaryPanel(rows) {
  const summary = realDataTrialDecisionSummary(rows);
  const sourceText = summary.riskSources.length ? summary.riskSources.join('、') : '暂无明显集中风险来源';
  const metrics = [
    ['BOM 物料', `${format(summary.total)} 项`, '本次试算展开的系统现有 BOM 物料数量。'],
    ['库存可覆盖', `${format(summary.covered)} 项`, '账面库存可覆盖本次需求，仍建议仓库确认实际可用数量。'],
    ['存在缺口', `${format(summary.shortage)} 项`, '当前试算显示库存不足，需要优先确认。'],
    ['需要关注', `${format(summary.lowStock)} 项`, '库存低于安全库存或余量不足，排期前建议复核。'],
  ];

  return `<article class="panel" data-real-data-trial-decision-summary style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">DECISION SUMMARY</span><h3>试算结论摘要</h3></div><span class="version">只读解释 · 不保存结果</span></div><div class="placeholder-copy"><p>${summary.conclusion}</p><p>风险来源参考：${sourceText}。本摘要只解释当前页面试算结果，不保存，不影响库存，不创建采购单。</p></div><div class="entry-grid">${metrics.map(([title, value, copy]) => `<div class="entry-card">${icon('chart', 22)}<span><strong>${title}：${value}</strong><small>${copy}</small></span></div>`).join('')}</div></article>`;
}

function realDataTrialKeyRiskPanel(rows) {
  const riskRows = prioritizedRealDataTrialRiskItems(rows, 5);

  const content = riskRows.length
    ? `<div class="entry-grid">${riskRows.map(({ row, reasons }) => `<div class="entry-card">${icon('warehouse', 22)}<span><strong>${row.material.code} · ${row.material.name}</strong><small>风险原因：${reasons.join('、')}。${row.shortageQty > 0 ? '建议优先确认缺口数量和到料时间，可能影响交期。' : row.procurementLeadTimeDays === null ? '需确认采购周期，并由仓库确认实际库存。' : '建议关注安全库存和实际可用数量。'}</small></span></div>`).join('')}</div>`
    : '<div class="empty-table"><strong>暂无明显关键风险物料，仍建议以仓库实际库存为准</strong><p>当前仅代表本次页面试算结果，不等于正式生产计划或采购需求。</p></div>';

  return `<article class="panel" data-real-data-trial-key-risks style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">KEY MATERIAL RISKS</span><h3>关键风险物料摘要</h3></div><span class="version">优先显示前 ${riskRows.length || 0} 项</span></div><div class="placeholder-copy"><p>本区用于提示需要优先关注的物料，优先显示存在缺口的物料，其次显示库存低于安全库存或采购周期需要确认的物料。</p></div>${content}</article>`;
}

function realDataTrialRoleFocusPanel(rows) {
  const summary = realDataTrialDecisionSummary(rows);
  const riskLabel = summary.hasRisk ? '当前订单存在物料 / 交期风险，建议先确认缺料和交期后再作为接单判断参考。' : '当前物料风险较低，可作为接单判断参考之一，但仍需人工确认库存和排期。';
  const roles = [
    ['老板关注', riskLabel],
    ['计划关注', '生产排期前需确认缺口物料、库存低物料和采购周期待确认物料；本结果不等于正式生产计划。'],
    ['采购关注', '建议优先确认缺口物料，其次确认采购周期缺失或库存低于安全库存的物料；本结果不等于采购单或采购需求。'],
  ];

  return `<article class="panel" data-real-data-trial-role-focus style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">ROLE FOCUS</span><h3>角色关注点</h3></div><span class="version">老板 / 计划 / 采购</span></div><div class="entry-grid">${roles.map(([title, copy]) => `<div class="entry-card">${icon('layers', 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div><div class="placeholder-copy"><p>本结果仅为一次性试算，不保存，不影响库存，不创建采购单。</p></div></article>`;
}

function realDataTrialNextStepGuidePanel() {
  // BOUNDARY_NOTICE / TRANSITION_COPY: Light reading guide only; it does not force workflow order or trigger business actions.
  const steps = [
    ['1. 先看试算结论摘要', '确认本次试算的整体判断、风险来源和需要优先关注的数量。'],
    ['2. 再看关键风险物料', '优先确认缺料、采购周期待确认或库存低于安全库存的物料。'],
    ['3. 接着看角色关注点', '老板、计划、采购可按同一份结果分别确认交付、排产和供应风险。'],
    ['4. 最后看结果明细', '需要追溯原因时，再查看缺料结果、交期风险、采购建议和仓库确认点。'],
  ];

  return `<article class="panel" data-real-data-trial-next-step-guide style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">NEXT STEP GUIDE</span><h3>试算完成后的下一步建议</h3></div><span class="version">轻引导 · 不强制顺序</span></div><div class="placeholder-copy"><p>本次试算已经完成。建议先看下方“试算结论摘要”，再看“关键风险物料”，随后查看“角色关注点”和“结果明细”。如需留档，可在明细之后手动保存为接单评估记录。</p><p>保存后可在“已保存评估记录”列表复查；接单评估记录仍不等于正式订单，不确认接单，不影响库存，不创建采购需求或采购单，不进入财务或成本。</p></div><div class="entry-grid">${steps.map(([title, copy]) => `<div class="entry-card">${icon('chart', 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div></article>`;
}

function realDataTrialResultPanel() {
  if (!realDataTrialPreview) return '';

  const { product, plannedQty, requiredDate, asOfDate, rows, source = REAL_DATA_TRIAL_SOURCE_SYSTEM } = realDataTrialPreview;
  const isTemporary = source === REAL_DATA_TRIAL_SOURCE_TEMPORARY;
  const sourceLabel = isTemporary ? '手动输入的临时试算数据' : '系统现有产品 / BOM / 库存 / 采购周期';
  const sourceNote = isTemporary
    ? '当前结果基于手动输入的临时数据生成，仅用于一次性测试。不会保存临时产品、临时物料、临时 BOM 或临时库存；可由用户手动保存摘要级接单评估记录。'
    : '本结果只保存在当前页面状态中，不保存正式订单；可由用户手动保存摘要级接单评估记录，不影响或扣减库存，不创建采购单。';
  const completionNote = '试算已完成，结果已生成。建议先看下方“下一步建议”和“试算结论摘要”。';
  const productLabel = isTemporary ? product.name : `${product.code} · ${product.name} · ${product.model}`;
  const summary = `<article class="panel" data-real-data-trial-result style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">TRIAL RESULT</span><h3>一次性试算结果</h3></div><span class="version">${product.code} · 当前页面结果</span></div><div class="placeholder-form"><div><span>产品</span><strong>${productLabel}</strong></div><div><span>试算数量</span><strong>${format(plannedQty)} 台</strong></div><div><span>期望交期</span><strong>${requiredDate}</strong></div><div><span>试算日期</span><strong>${asOfDate}</strong></div><div><span>数据来源</span><strong>${sourceLabel}</strong></div></div><div class="placeholder-copy"><p><strong>${completionNote}</strong></p><p>${sourceNote}</p></div></article>`;
  const savePanel = trialEvaluationSavePanel();
  const nextStepGuide = realDataTrialNextStepGuidePanel();
  if (!rows.length) return `<div data-real-data-trial-results>${summary}${nextStepGuide}<article class="panel" style="margin-bottom:18px"><div class="empty-table"><strong>当前产品尚未维护 BOM，无法生成试算结果</strong><p>请先确认系统现有产品 BOM 资料。本页面不会导入 BOM，也不会修改正式 BOM。</p></div></article>${savePanel}</div>`;

  const shortageRows = rows.filter((row) => row.shortageQty > 0 || row.quantityRisk === 'low');
  const decisionLayer = `${realDataTrialDecisionSummaryPanel(rows)}${realDataTrialKeyRiskPanel(rows)}${realDataTrialRoleFocusPanel(rows)}`;
  const shortageTable = `<article class="panel table-panel" style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">SHORTAGE RESULT</span><h3>缺料结果</h3></div><span class="version">${rows.length} 项物料</span></div>${tableScrollHint()}<div class="table-wrap" style="${LOCAL_TABLE_SCROLL_STYLE}"><table style="min-width:760px"><thead><tr><th>物料</th><th>单位用量</th><th>总需求</th><th>当前库存</th><th>缺口数量</th><th>安全库存状态</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong class="code">${row.material.code}</strong><br>${row.material.name}</td><td>${format(row.qtyPerProduct)} ${row.material.unit}</td><td><strong>${format(row.requiredQty)}</strong> ${row.material.unit}</td><td>${format(row.stockQty)} ${row.material.unit}</td><td><strong class="${row.shortageQty > 0 ? 'danger-text' : 'muted'}">${format(row.shortageQty)}</strong> ${row.material.unit}</td><td><span class="soft-tag">${realDataTrialSafetyStatus(row)}</span></td></tr>`).join('')}</tbody></table></div></article>`;
  const riskTable = `<article class="panel table-panel" style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">DELIVERY RISK</span><h3>交期风险</h3></div><span class="version">只读判断</span></div>${tableScrollHint()}<div class="table-wrap" style="${LOCAL_TABLE_SCROLL_STYLE}"><table style="min-width:860px"><thead><tr><th>物料</th><th>库存是否可覆盖</th><th>采购周期是否足够</th><th>预计到料时间</th><th>风险等级</th><th>风险原因</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.material.name}</td><td>${row.shortageQty > 0 ? '库存不足' : '库存可覆盖'}</td><td>${row.procurementLeadTimeDays === null ? '采购周期缺失，需人工确认' : row.riskLevel === 'critical' ? '预计不足' : '当前判断可参考'}</td><td>${row.expectedArrivalDate || (row.procurementLeadTimeDays === null ? '待确认' : '无需采购')}</td><td><span class="soft-tag">${row.deliveryRiskLabel}</span></td><td>${row.deliveryRiskReason}</td></tr>`).join('')}</tbody></table></div></article>`;
  const recommendationTable = `<article class="panel table-panel" style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">PROCUREMENT SUGGESTION</span><h3>采购建议</h3></div><span class="version">不创建采购单</span></div><div class="placeholder-copy"><p>采购建议只用于本次试算阅读，不保存建议，不创建采购单，不进入采购流程。</p></div>${tableScrollHint()}<div class="table-wrap" style="${LOCAL_TABLE_SCROLL_STYLE}"><table style="min-width:780px"><thead><tr><th>物料</th><th>建议动作</th><th>建议采购数量</th><th>优先级</th><th>原因</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.material.name}</td><td>${row.recommendation.action}</td><td><strong>${format(row.recommendation.recommendedQty)}</strong> ${row.material.unit}</td><td><span class="soft-tag">${row.recommendation.priority}</span></td><td>${row.recommendation.reason}</td></tr>`).join('')}</tbody></table></div></article>`;
  const warehousePoints = `<article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">WAREHOUSE CHECK</span><h3>仓库确认点</h3></div><span class="version">${shortageRows.length} 项关注</span></div><div class="entry-grid">${realDataTrialWarehousePoints(rows).map((point) => `<div class="entry-card">${icon('warehouse', 22)}<span><strong>${point}</strong><small>仅提示人工确认，不修改库存台账。</small></span></div>`).join('')}</div></article>`;
  return `<div data-real-data-trial-results>${summary}${nextStepGuide}${decisionLayer}${shortageTable}${riskTable}${recommendationTable}${warehousePoints}${savePanel}</div>`;
}

function realDataTrialSourcePanel() {
  // BOUNDARY_NOTICE: 数据来源选择只切换当前页面试算输入，不保存正式资料或触发业务动作。
  const sources = [
    [REAL_DATA_TRIAL_SOURCE_SYSTEM, '系统现有资料试算', '读取已维护的产品、BOM、库存和采购周期，仅用于本次试算。', 'layers'],
    [REAL_DATA_TRIAL_SOURCE_TEMPORARY, '手动输入临时试算数据', '手动输入临时产品和物料，用于资料未维护完整时的一次性风险测试。', 'edit'],
  ];
  const currentModeCopy = realDataTrialInputState.source === REAL_DATA_TRIAL_SOURCE_TEMPORARY
    ? '当前使用手动输入的临时产品和物料数据进行一次性试算，数据不会保存为正式资料。'
    : '当前使用系统已维护的产品、BOM、库存和采购周期进行一次性试算。';
  const nextStepCopy = realDataTrialInputState.source === REAL_DATA_TRIAL_SOURCE_TEMPORARY
    ? '下一步：请在下方填写临时产品和物料，或点击“填入示例数据”，然后运行试算。'
    : '下一步：请在下方选择产品、填写计划数量和期望交期，然后运行试算。';

  return `<article class="panel" data-real-data-trial-source style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">DATA SOURCE MODE</span><h3>试算数据来源</h3></div><span class="version">默认使用系统资料</span></div><div class="entry-grid">${sources.map(([value, title, copy, ico]) => {
    const selected = realDataTrialInputState.source === value;
    return `<button class="entry-card" type="button" data-action="set-real-data-trial-source" data-source="${value}" aria-pressed="${selected}">${icon(ico, 22)}<span>${selected ? '<small class="source-mode-badge">当前模式</small>' : ''}<strong>${title}</strong><small>${copy}</small></span></button>`;
  }).join('')}</div><div class="placeholder-copy source-mode-note"><p>${currentModeCopy}</p><p><strong>${nextStepCopy}</strong></p><p>两种模式都只在当前页面生成一次性试算结果，不跳转 BOM 页面，不保存正式资料、不影响库存、不创建采购单。</p></div></article>`;
}

function realDataTrialSystemForm(productOptions) {
  return `<article class="panel" data-real-data-trial-form style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">REAL DATA TRIAL</span><h3>一次性试算条件</h3></div><span class="version">使用系统现有资料</span></div><div class="modal-body"><label class="field"><span>产品</span><select name="selectedProductId" data-real-data-trial-input><option value="">请选择产品</option>${productOptions}</select></label><label class="field"><span>试算数量</span><input name="plannedQty" type="number" min="1" step="1" placeholder="请输入数量" value="${realDataTrialInputState.plannedQty}" data-real-data-trial-input /></label><label class="field"><span>期望交期</span><input name="requiredDate" type="date" min="${TRIAL_DATE_MIN}" max="${TRIAL_DATE_MAX}" value="${realDataTrialInputState.requiredDate}" data-real-data-trial-input /></label><label class="field"><span>试算日期</span><input name="asOfDate" type="date" min="${TRIAL_DATE_MIN}" max="${TRIAL_DATE_MAX}" value="${realDataTrialInputState.asOfDate}" data-real-data-trial-input /></label></div>${realDataTrialError ? `<div class="placeholder-copy" data-real-data-trial-error><p class="danger-text">${realDataTrialError}</p></div>` : ''}<div class="placeholder-copy"><p>本区只使用系统现有产品、BOM、库存和采购周期做当前页面一次性试算；不支持手动新增产品，不导入 BOM、库存或价格。</p></div><div class="modal-actions"><button class="primary" type="button" data-action="run-real-data-trial">${icon('chart', 17)} 开始试算</button></div></article>`;
}

function temporaryTrialMaterialRowsForm() {
  return temporaryTrialInputState.materials.map((row, index) => `<article class="panel" data-temp-material-row="${index}" style="margin-bottom:12px;max-width:100%"><div class="panel-head"><div><span class="kicker">TEMP MATERIAL ${String(index + 1).padStart(2, '0')}</span><h3>临时物料行</h3></div><button class="secondary" type="button" data-action="remove-temp-trial-material" data-index="${index}">删除</button></div><div class="modal-body"><label class="field"><span>物料编码（可选）</span><input name="code" value="${row.code}" placeholder="例如 TEMP-MAT-01" data-temp-material-input data-index="${index}" /></label><label class="field"><span>物料名称</span><input name="name" value="${row.name}" placeholder="请输入物料名称" data-temp-material-input data-index="${index}" /></label><label class="field"><span>单台用量</span><input name="qtyPerProduct" type="number" min="0.0001" step="0.0001" value="${row.qtyPerProduct}" placeholder="必须大于 0" data-temp-material-input data-index="${index}" /></label><label class="field"><span>当前库存</span><input name="stockQty" type="number" min="0" step="0.0001" value="${row.stockQty}" placeholder="不能小于 0" data-temp-material-input data-index="${index}" /></label><label class="field"><span>安全库存（可选）</span><input name="safetyStock" type="number" min="0" step="0.0001" value="${row.safetyStock}" placeholder="默认 0" data-temp-material-input data-index="${index}" /></label><label class="field"><span>采购周期天数（可选）</span><input name="procurementLeadTimeDays" type="number" min="0" step="1" value="${row.procurementLeadTimeDays}" placeholder="为空表示待确认" data-temp-material-input data-index="${index}" /></label></div></article>`).join('');
}

function realDataTrialTemporaryForm() {
  // BOUNDARY_NOTICE / TRANSITION_COPY: 临时输入边界说明未来正式版可精简或替换。
  return `<article class="panel" data-temp-trial-form style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">TEMPORARY TRIAL</span><h3>临时产品信息</h3></div><span class="version">仅当前页面一次性测试</span></div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="secondary" type="button" data-action="fill-temp-trial-demo">${icon('plus', 16)} 填入示例数据</button><button class="secondary" type="button" data-action="clear-temp-trial-data">清空临时数据</button></div><div class="modal-body"><label class="field"><span>临时产品名称</span><input name="productName" value="${temporaryTrialInputState.productName}" placeholder="请输入临时产品名称" data-temp-trial-input /></label><label class="field"><span>计划数量</span><input name="plannedQty" type="number" min="1" step="1" value="${temporaryTrialInputState.plannedQty}" placeholder="必须大于 0" data-temp-trial-input /></label><label class="field"><span>期望交期</span><input name="requiredDate" type="date" min="${TRIAL_DATE_MIN}" max="${TRIAL_DATE_MAX}" value="${temporaryTrialInputState.requiredDate}" data-temp-trial-input /></label><label class="field"><span>分析日期</span><input name="asOfDate" type="date" min="${TRIAL_DATE_MIN}" max="${TRIAL_DATE_MAX}" value="${temporaryTrialInputState.asOfDate}" data-temp-trial-input /></label></div>${realDataTrialError ? `<div class="placeholder-copy" data-real-data-trial-error><p class="danger-text">${realDataTrialError}</p></div>` : ''}<div class="placeholder-copy"><p>临时输入数据仅用于本次试算，不会保存为正式物料、BOM、库存或订单记录。</p></div></article><article class="panel" data-temp-trial-materials style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">TEMP MATERIALS</span><h3>临时物料行</h3></div><button class="secondary" type="button" data-action="add-temp-trial-material">${icon('plus', 16)} 添加物料行</button></div><div class="placeholder-copy"><p>至少保留一行物料输入。采购周期为空时表示待确认，不会生成采购需求或采购单。</p></div>${temporaryTrialMaterialRowsForm()}<div class="modal-actions" style="flex-wrap:wrap"><button class="primary" type="button" data-action="run-real-data-trial">${icon('chart', 17)} 开始临时试算</button></div></article>`;
}

function orderEvaluationBoundaryNotesPanel() {
  // BOUNDARY_NOTICE / TRANSITION_COPY: 接单评估记录说明区保留阶段边界；Step 11 只允许保存摘要级本地记录，不触发正式业务动作。
  const recordFields = [
    '评估编号',
    '创建时间',
    '数据来源：系统数据 / 临时输入 / 未来导入',
    '产品名称',
    '计划数量',
    '期望交期',
    '分析日期',
    '整体风险结论',
    '物料统计摘要',
    '关键风险物料摘要',
    '记录状态：待确认',
    '备注或来源说明',
  ];
  const sourceCards = [
    ['当前已支持', '系统已有产品 / BOM / 库存，以及手动临时输入。', 'layers'],
    ['未来可扩展', 'Excel、CSV、复制粘贴表格、客户或工厂提供的表格数据。', 'grid'],
    ['全系统原则', '涉及批量录入、历史迁移、客户或工厂资料时，不应默认只能手动逐项输入。', 'box'],
    ['业务文档来源', '客户 PO、邮件附件、工厂 BOM、盘点表、ERP 导出表、供应商报价表、采购周期表、历史订单、历史库存流水、PDF 或其他业务文档。', 'edit'],
  ];

  return `<article class="panel" data-order-evaluation-boundary-notes style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">ORDER EVALUATION BOUNDARY</span><h3>接单评估记录说明</h3></div><span class="version">摘要记录 · 当前本地保存</span></div><div class="placeholder-copy"><p>接单评估记录用于保存某一次接单前试算的输入条件和风险结论，方便客户询单、接单前复查、内部沟通和后续接单判断。</p><p>它不代表正式订单，不影响库存，不创建采购单，不进入财务或成本。当前阶段只允许用户手动保存摘要级接单评估记录，用于验证最小闭环。</p></div><div class="entry-grid"><div class="entry-card">${icon('chart', 22)}<span><strong>可来自本次试算</strong><small>可承接系统数据试算或手动临时输入试算的输入条件与风险结论摘要。</small></span></div><div class="entry-card">${icon('warehouse', 22)}<span><strong>只作为接单判断参考</strong><small>用于复查缺料、库存低、安全库存、采购周期和交期风险，不改变库存台账。</small></span></div><div class="entry-card">${icon('cart', 22)}<span><strong>不触发采购执行</strong><small>当前不创建采购需求或采购单，也不进入审批、供应商比价或付款流程。</small></span></div></div></article><article class="panel" data-order-evaluation-future-sources style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">FUTURE DATA SOURCES</span><h3>未来数据来源说明</h3></div><span class="version">仅预留边界 · 不执行导入</span></div><div class="placeholder-copy"><p>未来接单评估记录的数据来源不应限制为手动逐项输入，也可以来自 Excel、CSV、复制粘贴表格或客户 / 工厂提供的表格。当前阶段仅做边界说明，不提供导入按钮、不上传文件、不解析表格。</p><p>从全系统角度看，凡是涉及批量录入、历史迁移、客户或工厂提供资料的场景，都不应默认只能手动逐项输入，也应预留文件、表格或业务文档来源。本步骤不新增第三方库，不修改数据模型，不保存任何导入数据。</p></div><div class="entry-grid">${sourceCards.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div></article><article class="panel" data-order-evaluation-field-preview style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">FIELD PREVIEW</span><h3>未来记录字段预览</h3></div><span class="version">字段提示 · 非正式数据模型</span></div><div class="placeholder-copy"><p>以下只是未来接单评估记录可能需要的字段预览，便于后续设计保存边界和来源追溯；当前 LocalStorage 记录只保存摘要字段，不新增正式数据模型，也不保存为正式资料。</p></div><div class="entry-grid">${recordFields.map((field) => `<div class="entry-card">${icon('grid', 22)}<span><strong>${field}</strong><small>未来记录字段提示，当前仅用于页面说明。</small></span></div>`).join('')}</div></article>`;
}

function realDataTrialPage() {
  const products = productService.listProducts();
  const productOptions = products.map((product) => `<option value="${product.id}" ${product.id === realDataTrialInputState.selectedProductId ? 'selected' : ''}>${product.code} · ${product.name} · ${product.model}</option>`).join('');
  const futureInputs = [
    ['订单条件', '产品、试算数量、期望交期和试算日期。', 'chart'],
    ['BOM', '产品对应物料清单和单位用量。', 'git'],
    ['库存', '当前库存、安全库存和可用性确认。', 'warehouse'],
    ['采购周期', '物料补货周期和到料时间判断。', 'cart'],
    ['参考价格', '仅用于采购金额参考和成本影响参考。', 'layers'],
  ];
  const boundaryItems = [
    ['不保存正式订单', '当前不会创建、保存或编辑正式订单；仅允许用户手动保存摘要级接单评估记录。', 'grid'],
    ['不保存临时资料', '手动输入的临时产品、物料、BOM 和库存只用于当前页面试算，刷新后不会作为正式资料存在。', 'edit'],
    ['不影响库存', '当前不会占用、扣减、锁定或修改任何库存。', 'warehouse'],
    ['不生成采购需求', '当前不会生成采购需求、采购申请、采购单或付款申请。', 'cart'],
    ['不进入财务', '当前不会进入应付账款、财务凭证或正式财务模块。', 'chart'],
    ['不做正式成本核算', '当前不会形成正式成本结果，也不会计算利润或毛利。', 'box'],
    ['不导入新数据', '当前只读取系统现有产品、BOM、库存和采购周期，不导入 BOM、库存或价格。', 'layers'],
  ];
  const amountCostPlaceholder = `<article class="panel" data-real-data-trial-amount-cost style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">AMOUNT / COST</span><h3>金额与成本参考</h3></div><span class="version">占位状态 · 不进财务</span></div><div class="placeholder-form"><div><span>参考单价</span><strong>待维护</strong></div><div><span>建议采购数量</span><strong>待试算 / 由后续阶段接入</strong></div><div><span>采购金额参考</span><strong>待试算</strong></div><div><span>成本影响参考</span><strong>待确认</strong></div><div><span>价格状态</span><strong>未维护 / 待确认</strong></div></div><div class="placeholder-copy"><p>当前没有接入价格数据，不计算采购金额，不形成正式成本，不进入财务。</p></div></article>`;
  const trialForm = realDataTrialInputState.source === REAL_DATA_TRIAL_SOURCE_TEMPORARY ? realDataTrialTemporaryForm() : realDataTrialSystemForm(productOptions);
  const latestRecordPanel = realDataTrialPreview ? '' : savedTrialEvaluationRecordPanel();
  const savedRecordsPanel = savedEvaluationRecordListPanel();
  const statusBoundaryPanel = evaluationRecordStatusBoundaryPanel();
  const workflowDemoPathPanel = evaluationWorkflowDemoPathPanel();

  return `${skeletonNotice('真实数据试算', '这里用于基于系统现有产品、BOM、库存和采购周期做一次性试算，或手动输入临时产品与物料数据做一次性风险测试。当前不导入新数据，不保存正式订单，不修改库存，不创建采购单，不进入财务。')}<div data-real-data-trial-page><article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">PHASE 8-STEP 14</span><h3>真实数据试算入口</h3></div><span class="version">系统资料 / 临时录入 · 当前页面试算</span></div><div class="placeholder-copy"><p>本页面用于承接 Phase 8 的真实数据试算方向：可读取系统现有 BOM、库存和采购周期，也可在资料未完整维护时手动输入临时试算数据。</p><p>本步骤不是正式订单模块，仅支持把本次试算摘要保存为接单评估记录并只读查看本地记录；不会保存临时产品、临时物料、临时 BOM 或临时库存，不影响或扣减库存，不创建采购单，也不进入财务。</p></div></article>${workflowDemoPathPanel}${realDataTrialSourcePanel()}<article class="panel workflow-panel" style="margin-bottom:18px"><span class="kicker">TRIAL FLOW</span><h3>当前试算链路</h3><div class="workflow-steps"><span>系统现有资料或临时录入</span><b>+</b><span>BOM / 用量</span><b>+</b><span>库存</span><b>+</b><span>采购周期</span><b>→</b><span>缺料结果</span><b>+</b><span>交期风险</span><b>+</b><span>采购建议</span><b>+</b><span>仓库确认点</span></div><p>链路只在当前页面运行，保存评估记录也只保存摘要，不影响、不扣减、不创建采购单、不进入财务。</p></article><article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">BOUNDARY</span><h3>当前阶段边界</h3></div><span class="version">摘要记录 · 只读列表 · 不进财务</span></div><div class="placeholder-copy"><p>当前试算不会保存正式订单，不保存临时资料，不影响库存，不扣减库存，不创建采购单，不创建采购需求，不进入应付账款，不进入正式财务，不做正式成本核算，不计算正式利润或正式毛利，也不生成财务凭证。用户保存后只能在本页只读查看摘要级接单评估记录。</p></div><div class="entry-grid">${boundaryItems.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div></article>${trialForm}${latestRecordPanel}${savedRecordsPanel}${statusBoundaryPanel}${realDataTrialResultPanel()}${orderEvaluationBoundaryNotesPanel()}${amountCostPlaceholder}<article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><span class="kicker">DATA SOURCE</span><h3>试算条件与数据来源</h3></div><span class="version">${futureInputs.length} 类资料</span></div><div class="entry-grid">${futureInputs.map(([title, copy, ico]) => `<div class="entry-card">${icon(ico, 22)}<span><strong>${title}</strong><small>${copy}</small></span></div>`).join('')}</div><div class="placeholder-copy"><p>当前阶段不读取临时导入文件，不写入正式基础资料；手动输入的临时数据只存在于当前页面状态，刷新后不会作为正式资料存在。</p></div></article></div>`;
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
  return `<div class="skeleton-notice"><div><span class="eyebrow">LUFUTA LITE / PHASE 6 DEMO</span><strong>下单前交期与采购分析</strong><p>本页用于判断 HE-110S 小型款 300 台急单能否按 15 天交付。系统按该型号 BOM 展开需求，结合库存、安全库存、采购周期和仓库反馈，给出只读判断：本单可以有条件推进，但不建议直接乐观承诺。</p></div><span class="phase-chip">只读分析</span></div><form class="panel"><div class="panel-head"><div><span class="kicker">分析输入</span><h3>分析条件</h3></div><span class="version">仅用于本次判断</span></div><div class="modal-body"><label class="field"><span>产品</span><select name="selectedProductId" data-delivery-risk-input><option value="">请选择产品</option>${productOptions}</select></label><label class="field"><span>计划数量</span><input name="plannedQty" type="number" min="0" step="1" placeholder="例如 300" value="${deliveryRiskInputState.plannedQty}" data-delivery-risk-input /></label><label class="field"><span>期望交期</span><input name="requiredDate" type="date" min="${TRIAL_DATE_MIN}" max="${TRIAL_DATE_MAX}" value="${deliveryRiskInputState.requiredDate}" data-delivery-risk-input /></label><label class="field"><span>分析日期</span><input name="asOfDate" type="date" min="${TRIAL_DATE_MIN}" max="${TRIAL_DATE_MAX}" value="${deliveryRiskInputState.asOfDate}" data-delivery-risk-input /></label></div><div class="placeholder-copy"><p>当前已默认带入演示订单，可手动修改条件重新分析；默认值不代表真实订单已保存。</p></div><div class="modal-actions"><button class="primary" type="button" data-action="delivery-risk-placeholder">分析交期风险</button></div></form>${orderDecisionSummaryPanel()}${riskSourceSummaryPanel()}${deliveryFeasibilityPanel()}${procurementPriorityGroupsPanel()}${warehouseFeedbackReferencePanel()}${deliveryRiskPreviewPanel()}<article class="panel workflow-panel"><span class="kicker">分析口径</span><h3>本单分析依据与边界</h3><div class="workflow-steps"><span>HE-110S 需求</span><b>+</b><span>BOM</span><b>+</b><span>库存</span><b>+</b><span>采购周期</span><b>+</b><span>仓库反馈</span><b>→</b><span>交期风险</span></div><p>结果仅供下单前判断，不代表已排产、已承诺交期或已创建采购任务；系统不保存订单、不修改库存。</p></article>`;
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
  return `<article class="panel table-panel" data-warehouse-feedback-reference style="margin-bottom:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">仓库反馈 · 本单库存可信度参考</span><h3>仓库反馈提示</h3></div><span class="version">${feedbackRows.length} 项 · 只读参考</span></div><div class="placeholder-copy"><p>本区用于判断 HE-110S 小型款 300 台急单中，哪些库存数据需要仓库现场确认。仓库反馈仅作为计划和采购的只读参考，不会修改库存，不会改变采购建议，不会生成采购单。</p></div>${tableScrollHint()}<div class="table-wrap" style="${LOCAL_TABLE_SCROLL_STYLE}"><table style="min-width:980px"><thead><tr><th>物料</th><th>仓库反馈</th><th>本单标注</th><th>计划参考</th><th>采购参考</th><th>说明</th></tr></thead><tbody>${feedbackRows.map(({ row, feedback }) => { const feedbackText = safeDisplayText(feedback.feedback, safeDisplayText(feedback.feedbackStatus, '暂无仓库反馈')); const noteText = safeDisplayText(feedback.note, safeDisplayText(feedback.audienceHint, '暂无补充说明')); return `<tr><td><div class="cell-main"><div class="material-avatar small">${row.material.name[0]}</div><div><strong>${row.material.name}</strong><small>${row.material.code} · 库存 ${format(row.stockQty)} ${row.material.unit}</small></div></div></td><td><span class="soft-tag">${feedbackText}</span></td><td>${deliveryRiskRowTags(row, feedback)}</td><td>${warehouseFeedbackPlanHint(feedback)}</td><td>${warehouseFeedbackPurchaseHint(row, feedback)}</td><td>${noteText}</td></tr>`; }).join('')}</tbody></table></div></article>`;
}

function deliveryRiskPreviewPanel() {
  if (!deliveryRiskPreview) return '';
  const { product, plannedQty, requiredDate, asOfDate, rows } = deliveryRiskPreview;
  const summary = `<div class="flow-strip" data-delivery-risk-summary><span>产品：${product.code} · ${product.name}</span><span>计划数量：${format(plannedQty)}</span><span>期望交期：${requiredDate}</span><span>分析日期：${asOfDate}</span></div>`;
  const legend = `<article class="panel workflow-panel" data-delivery-risk-legend style="margin-top:18px"><span class="kicker">判断口径</span><h3>风险等级说明</h3><div class="workflow-steps"><span>可满足：当前库存可覆盖本次需求</span><span>交期紧张：存在缺料，按当前采购周期仍可能满足期望交期</span><span>交期高风险：缺料物料预计无法在期望交期前到料</span><span>无法判断：采购周期未维护，暂无法判断交期风险</span></div></article>`;
  if (!rows.length) return `<article class="panel table-panel" data-delivery-risk-preview><div class="panel-head"><div><span class="kicker">物料明细 · 交期风险</span><h3>物料交期风险明细</h3></div><span class="version">${product.code} · 只读预览</span></div>${summary}<div class="empty-table"><strong>当前产品尚未维护 BOM，无法生成需求预览</strong><p>请先确认该产品的 BOM 资料，再进行交期判断。</p></div></article>${legend}`;
  const feedbackRows = rows.map((row, index) => ({ row, feedback: warehouseFeedbackForRow(row, index) }));
  const recommendationView = `<article class="panel table-panel" data-procurement-recommendation-view style="margin-top:18px;max-width:100%"><div class="panel-head"><div><span class="kicker">物料明细 · 采购建议</span><h3>采购建议明细（只读）</h3></div><span class="version">${rows.length} 项建议</span></div><div class="placeholder-copy"><p>建议数量根据当前计划数量、BOM、库存、安全库存和采购周期自动计算，仅供采购判断。页面不会生成采购单、保存建议或修改、占用库存；实际采购需人工确认。</p></div>${tableScrollHint()}<div class="table-wrap" style="${LOCAL_TABLE_SCROLL_STYLE}"><table style="min-width:1120px"><thead><tr><th>物料</th><th>建议动作</th><th>建议采购数量</th><th>本单标注</th><th>原因</th><th>优先级</th><th>采购周期</th><th>风险等级</th></tr></thead><tbody>${feedbackRows.map(({ row, feedback }) => `<tr><td><div class="cell-main"><div class="material-avatar small">${row.material.name[0]}</div><div><strong>${row.material.name}</strong><small>${row.material.code} · ${row.material.unit}</small></div></div></td><td>${row.recommendation.action}</td><td><strong>${format(row.recommendation.recommendedQty)}</strong> ${row.material.unit}</td><td>${deliveryRiskRowTags(row, feedback)}</td><td>${row.recommendation.reason}</td><td><span class="soft-tag">${row.recommendation.priority}</span></td><td>${formatProcurementLeadTimeDays(row.procurementLeadTimeDays)}</td><td><span class="soft-tag">${row.deliveryRiskLabel}</span></td></tr>`).join('')}</tbody></table></div></article>`;
  return `<article class="panel table-panel" data-delivery-risk-preview style="max-width:100%"><div class="panel-head"><div><span class="kicker">物料明细 · 交期风险</span><h3>物料交期风险明细</h3></div><span class="version">${product.code} · ${rows.length} 项物料</span></div>${summary}${tableScrollHint()}<div class="table-wrap" style="${LOCAL_TABLE_SCROLL_STYLE}"><table style="min-width:1320px"><thead><tr><th>物料编码</th><th>物料名称</th><th>本单标注</th><th>单位用量</th><th>计划数量</th><th>总需求</th><th>当前库存</th><th>缺口数量</th><th>库存判断</th><th>采购周期</th><th>交期风险</th><th>风险说明</th></tr></thead><tbody>${feedbackRows.map(({ row, feedback }) => `<tr><td><strong class="code">${row.material.code}</strong></td><td>${row.material.name}</td><td>${deliveryRiskRowTags(row, feedback)}</td><td>${format(row.qtyPerProduct)} ${row.material.unit}</td><td>${format(plannedQty)}</td><td><strong>${format(row.requiredQty)}</strong> ${row.material.unit}</td><td>${format(row.stockQty)} ${row.material.unit}</td><td><strong class="${row.shortageQty > 0 ? 'danger-text' : 'muted'}">${format(row.shortageQty)}</strong> ${row.material.unit}</td><td><span class="stock-level ${row.shortageQty > 0 ? 'bad' : ''}"><i></i>${row.shortageQty > 0 ? '库存不足' : '库存可覆盖'}</span></td><td>${formatProcurementLeadTimeDays(row.procurementLeadTimeDays)}</td><td><span class="soft-tag">${row.deliveryRiskLabel}</span></td><td>${row.deliveryRiskReason}</td></tr>`).join('')}</tbody></table></div></article>${recommendationView}${legend}`;
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

function scrollToRealDataTrialInput(source) {
  const selector = source === REAL_DATA_TRIAL_SOURCE_TEMPORARY ? '[data-temp-trial-form]' : '[data-real-data-trial-form]';
  document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToRealDataTrialResults() {
  document.querySelector('[data-real-data-trial-results]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function navigate(page) { currentPage = page; history.replaceState(null, '', `#${page}`); render(); window.scrollTo(0, 0); }

function bindEvents() {
  document.querySelectorAll('[data-page]').forEach((el) => el.addEventListener('click', () => navigate(el.dataset.page)));
  document.querySelector('[data-demo-role-switcher]')?.addEventListener('change', (event) => {
    if (!isSupportedRole(event.target.value)) {
      event.target.value = currentDemoRoleId;
      return;
    }
    currentDemoRoleId = event.target.value;
    render();
  });
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
  document.querySelectorAll('[data-real-data-trial-input]').forEach((input) => input.addEventListener('input', () => {
    realDataTrialInputState[input.name] = input.value;
    realDataTrialError = '';
    realDataTrialPreview = null;
    document.querySelector('[data-real-data-trial-error]')?.remove();
    document.querySelector('[data-real-data-trial-results]')?.remove();
  }));
  document.querySelectorAll('[data-temp-trial-input]').forEach((input) => input.addEventListener('input', () => {
    temporaryTrialInputState[input.name] = input.value;
    realDataTrialError = '';
    realDataTrialPreview = null;
    document.querySelector('[data-real-data-trial-error]')?.remove();
    document.querySelector('[data-real-data-trial-results]')?.remove();
  }));
  document.querySelectorAll('[data-temp-material-input]').forEach((input) => input.addEventListener('input', () => {
    const row = temporaryTrialInputState.materials[Number(input.dataset.index)];
    if (row) row[input.name] = input.value;
    realDataTrialError = '';
    realDataTrialPreview = null;
    document.querySelector('[data-real-data-trial-error]')?.remove();
    document.querySelector('[data-real-data-trial-results]')?.remove();
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
  if (action === 'set-real-data-trial-source') {
    realDataTrialInputState.source = dataset.source === REAL_DATA_TRIAL_SOURCE_TEMPORARY ? REAL_DATA_TRIAL_SOURCE_TEMPORARY : REAL_DATA_TRIAL_SOURCE_SYSTEM;
    realDataTrialError = '';
    realDataTrialPreview = null;
    render();
    scrollToRealDataTrialInput(realDataTrialInputState.source);
    return;
  }
  if (action === 'add-temp-trial-material') {
    temporaryTrialInputState.materials.push(createTemporaryTrialMaterialRow());
    realDataTrialError = '';
    realDataTrialPreview = null;
    render();
    return;
  }
  if (action === 'fill-temp-trial-demo') {
    fillTemporaryTrialDemoData();
    render();
    return;
  }
  if (action === 'clear-temp-trial-data') {
    // BOUNDARY_NOTICE: 清空只作用于当前临时输入，不删除或修改任何正式资料。
    resetTemporaryTrialInputState();
    render();
    return;
  }
  if (action === 'remove-temp-trial-material') {
    if (temporaryTrialInputState.materials.length <= 1) return toast('至少保留一行物料输入');
    temporaryTrialInputState.materials.splice(Number(dataset.index), 1);
    realDataTrialError = '';
    realDataTrialPreview = null;
    render();
    return;
  }
  if (action === 'delivery-risk-placeholder') {
    const product = productService.listProducts().find((item) => item.id === deliveryRiskInputState.selectedProductId);
    if (!product) return toast('请选择产品');
    if (!deliveryRiskInputState.plannedQty || Number(deliveryRiskInputState.plannedQty) <= 0) return toast('请输入有效计划数量');
    if (!deliveryRiskInputState.requiredDate) return toast('请选择期望交期');
    if (!deliveryRiskInputState.asOfDate) return toast('请选择分析日期');
    const dateError = validateTrialDateInputs({ requiredDate: deliveryRiskInputState.requiredDate, asOfDate: deliveryRiskInputState.asOfDate });
    if (dateError) return toast(dateError);
    const plannedQty = Number(deliveryRiskInputState.plannedQty);
    const rows = buildTrialRowsFromExistingData({ product, plannedQty, requiredDate: deliveryRiskInputState.requiredDate, asOfDate: deliveryRiskInputState.asOfDate });
    deliveryRiskPreview = { product, plannedQty, requiredDate: deliveryRiskInputState.requiredDate, asOfDate: deliveryRiskInputState.asOfDate, rows };
    render();
    return toast(rows.length ? '交期风险等级预览已生成' : '当前产品尚未维护 BOM，无法生成需求预览');
  }
  if (action === 'save-trial-evaluation-record') {
    if (!realDataTrialPreview) return toast('请先完成一次试算');
    if (!saveTrialEvaluationRecord()) return toast('浏览器本地保存不可用，请稍后再试');
    render();
    return toast('已保存为接单评估记录，可到“已保存评估记录”列表复查。该记录不代表正式订单，不影响库存，不创建采购单。');
  }
  if (action === 'toggle-saved-evaluation-summary') {
    expandedTrialEvaluationRecordId = expandedTrialEvaluationRecordId === dataset.id ? '' : dataset.id;
    render();
    return;
  }
  if (action === 'clear-local-evaluation-records') {
    // DEMO_ONLY / BOUNDARY_NOTICE: Test cleanup confirmation only; it does not delete formal orders or business records.
    pendingClearLocalEvaluationRecords = true;
    render();
    return;
  }
  if (action === 'cancel-clear-local-evaluation-records') {
    pendingClearLocalEvaluationRecords = false;
    render();
    return;
  }
  if (action === 'confirm-clear-local-evaluation-records') {
    // DEMO_ONLY / BOUNDARY_NOTICE: Test cleanup only; it does not delete formal orders or business records.
    if (!clearLocalTrialEvaluationRecords()) return toast('浏览器本地评估记录清理不可用，请稍后再试');
    render();
    return toast('已清空当前浏览器本地评估记录，不影响系统基础资料。');
  }
  if (action === 'run-real-data-trial') {
    if (realDataTrialInputState.source === REAL_DATA_TRIAL_SOURCE_TEMPORARY) {
      document.querySelectorAll('[data-temp-trial-input]').forEach((input) => {
        temporaryTrialInputState[input.name] = input.value;
      });
      document.querySelectorAll('[data-temp-material-input]').forEach((input) => {
        const row = temporaryTrialInputState.materials[Number(input.dataset.index)];
        if (row) row[input.name] = input.value;
      });
      const validationError = validateTemporaryTrialInputs();
      if (validationError) {
        realDataTrialError = validationError;
        realDataTrialPreview = null;
      } else {
        const plannedQty = Number(temporaryTrialInputState.plannedQty);
        const rows = buildTemporaryTrialRows({
          materialRows: temporaryTrialInputState.materials,
          plannedQty,
          requiredDate: temporaryTrialInputState.requiredDate,
          asOfDate: temporaryTrialInputState.asOfDate,
        });
        realDataTrialError = '';
        realDataTrialPreview = {
          source: REAL_DATA_TRIAL_SOURCE_TEMPORARY,
          product: { code: 'TEMP', name: temporaryTrialInputState.productName.trim(), model: '手动临时试算' },
          plannedQty,
          requiredDate: temporaryTrialInputState.requiredDate,
          asOfDate: temporaryTrialInputState.asOfDate,
          rows,
        };
      }
      render();
      if (realDataTrialPreview) scrollToRealDataTrialResults();
      return;
    }

    document.querySelectorAll('[data-real-data-trial-input]').forEach((input) => {
      realDataTrialInputState[input.name] = input.value;
    });
    const product = productService.listProducts().find((item) => item.id === realDataTrialInputState.selectedProductId);
    const dateError = validateTrialDateInputs({ requiredDate: realDataTrialInputState.requiredDate, asOfDate: realDataTrialInputState.asOfDate, asOfLabel: '试算日期' });
    if (!product) realDataTrialError = '请选择产品';
    else if (!realDataTrialInputState.plannedQty || Number(realDataTrialInputState.plannedQty) <= 0) realDataTrialError = '请输入有效试算数量';
    else if (!realDataTrialInputState.requiredDate) realDataTrialError = '请选择期望交期';
    else if (!realDataTrialInputState.asOfDate) realDataTrialError = '请选择试算日期';
    else if (dateError) realDataTrialError = dateError;
    else {
      const plannedQty = Number(realDataTrialInputState.plannedQty);
      const rows = buildTrialRowsFromExistingData({ product, plannedQty, requiredDate: realDataTrialInputState.requiredDate, asOfDate: realDataTrialInputState.asOfDate });
      realDataTrialError = '';
      realDataTrialPreview = { source: REAL_DATA_TRIAL_SOURCE_SYSTEM, product, plannedQty, requiredDate: realDataTrialInputState.requiredDate, asOfDate: realDataTrialInputState.asOfDate, rows };
    }
    render();
    if (realDataTrialPreview) scrollToRealDataTrialResults();
    return;
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
