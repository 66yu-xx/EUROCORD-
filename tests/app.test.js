import test from 'node:test';

test('V3 Decision Center P0 展示排序、筛选与订单追溯', async () => {
const NativeDate = globalThis.Date;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : ['2026-06-21T12:00:00+02:00'])); }
  static now() { return new NativeDate('2026-06-21T12:00:00+02:00').getTime(); }
};
let storedValue = null;
let mode = 'analysis';
let pageElements = [];
let filterElements = [];
let deliveryInputs = [];
let editMaterialHandler;
let resetHandler;
let reloadCount = 0;

globalThis.localStorage = {
  getItem() { return storedValue; },
  setItem(_key, value) { storedValue = value; },
  removeItem() { storedValue = null; },
};
globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.location = { hash: '#analysis' };
globalThis.history = { replaceState() {} };
globalThis.window = {
  confirm() { return true; },
  scrollTo() {},
  location: { reload() { reloadCount += 1; } },
};

const root = { innerHTML: '' };
const toast = { textContent: '', classList: { add() {}, remove() {} } };
const form = { onsubmit: null, values: {} };
const modalControl = { onclick: null };
const modalRoot = {
  innerHTML: '',
  querySelector(selector) { return selector === 'form' ? form : modalControl; },
};
const editMaterialButton = {
  dataset: { action: 'edit-material', id: 'm6' },
  addEventListener(type, handler) { if (type === 'click') editMaterialHandler = handler; },
};
const resetButton = {
  dataset: { action: 'reset-data' },
  addEventListener(type, handler) { if (type === 'click') resetHandler = handler; },
};

globalThis.FormData = class {
  constructor(target) { this.target = target; }
  [Symbol.iterator]() { return Object.entries(this.target.values)[Symbol.iterator](); }
};

function eventElements(pattern, mapper) {
  return [...root.innerHTML.matchAll(pattern)].map(mapper);
}

globalThis.document = {
  querySelector(selector) {
    if (selector === '#app') return root;
    if (selector === '#modal-root') return modalRoot;
    if (selector === '#toast') return toast;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === '[data-page]') {
      pageElements = eventElements(/<button[^>]*data-page="([^"]+)"([^>]*)>/g, (match) => ({
        dataset: {
          page: match[1],
          riskFilter: /data-risk-filter="([^"]+)"/.exec(match[2])?.[1],
        },
        addEventListener(type, handler) { if (type === 'click') this.click = handler; },
      }));
      return pageElements;
    }
    if (selector === '[data-analysis-filter]') {
      filterElements = eventElements(/<button[^>]*data-analysis-filter="([^"]+)"/g, (match) => ({
        dataset: { analysisFilter: match[1] },
        addEventListener(type, handler) { if (type === 'click') this.click = handler; },
      }));
      return filterElements;
    }
    if (selector === '[data-delivery-date]' && mode === 'orders') {
      deliveryInputs = eventElements(/value="([^"]+)" data-delivery-date="([^"]+)"/g, (match) => ({
        value: match[1],
        dataset: { deliveryDate: match[2] },
        addEventListener(type, handler) { if (type === 'change') this.change = handler; },
      }));
      return deliveryInputs;
    }
    if (selector === '[data-action]' && mode === 'materials') return [editMaterialButton];
    if (selector === '[data-action]' && mode === 'dashboard') return [resetButton];
    return [];
  },
};

async function load(page, suffix) {
  mode = page;
  location.hash = `#${page}`;
  root.innerHTML = '';
  await import(`../src/app.js?${suffix}`);
  return root.innerHTML;
}

const rowCount = () => (root.innerHTML.match(/<tr class="decision-row/g) || []).length;
const firstMaterial = () => /<tbody><tr[^>]*><td><div class="cell-main">.*?<strong>([^<]+)<\/strong>/.exec(root.innerHTML)?.[1];

let html = await load('analysis', 'p0-default-analysis');
if (firstMaterial() !== '外壳') throw new Error(`默认第一项不是外壳：${firstMaterial()}`);
const controlPosition = html.indexOf('<strong>控制板</strong>');
const boxPosition = html.indexOf('<strong>包装箱</strong>');
const manualPosition = html.indexOf('<strong>说明书</strong>');
if (!(controlPosition < boxPosition && boxPosition < manualPosition)) throw new Error('同级风险未按采购窗口紧迫度排序');

const { initialData } = await import('../src/data.js');
const differentDeliveryData = JSON.parse(JSON.stringify(initialData));
differentDeliveryData.bom = differentDeliveryData.bom.filter((row) => !(row.productId === 'p1' && row.materialId === 'm4'));
differentDeliveryData.inventory.find((row) => row.materialId === 'm4').stockQty = 20;
storedValue = JSON.stringify(differentDeliveryData);
html = await load('analysis', 'p0-different-remaining-days');
const shorterRemainingPosition = html.indexOf('<strong>控制板</strong>');
const sameDayTiePosition = html.indexOf('<strong>说明书</strong>');
const longerRemainingPosition = html.indexOf('<strong>包装箱</strong>');
if (!(shorterRemainingPosition < sameDayTiePosition && sameDayTiePosition < longerRemainingPosition)) throw new Error('同级风险未优先按剩余天数排序');
storedValue = null;
html = await load('analysis', 'p0-restored-baseline');

const shellEnd = html.indexOf('</tr>', html.indexOf('<strong>外壳</strong>'));
const shellRow = html.slice(html.indexOf('<strong>外壳</strong>'), shellEnd);
for (const expected of ['受影响订单', 'HE-110S', '壁挂式取暖器', '100', '2026-07-15', 'HE-110M', 'HE-110L', '不代表具体订单一定延期', '未进行订单级库存分配']) {
  if (!shellRow.includes(expected)) throw new Error(`受影响订单缺少：${expected}`);
}

async function verifyCard(riskFilter, expectedCount, expectedClass) {
  await load('dashboard', `p0-dashboard-${riskFilter.replaceAll(' ', '-')}`);
  const card = pageElements.find((element) => element.dataset.riskFilter === riskFilter);
  if (!card) throw new Error(`Dashboard 缺少筛选卡：${riskFilter}`);
  card.click();
  if (rowCount() !== expectedCount) throw new Error(`${riskFilter} 筛选数量错误：${rowCount()}`);
  if (!root.innerHTML.includes(`data-analysis-filter="${riskFilter}"`) || !root.innerHTML.includes(expectedClass)) throw new Error(`${riskFilter} 筛选未激活`);
  const all = filterElements.find((element) => element.dataset.analysisFilter === 'ALL');
  all.click();
  if (rowCount() !== 10) throw new Error('查看全部未恢复完整列表');
}

await verifyCard('High Risk', 1, 'risk-danger');
await verifyCard('Action Required', 3, 'risk-warning');
await verifyCard('OK', 6, 'risk-success');

await load('orders', 'p0-orders-edit');
const firstDelivery = deliveryInputs.find((input) => input.dataset.deliveryDate === 'p1');
firstDelivery.value = '2026-08-30';
firstDelivery.change();
if (JSON.parse(storedValue).orders.find((order) => order.productId === 'p1').deliveryDate !== '2026-08-30') throw new Error('交付日期未持久化');

await load('materials', 'p0-material-edit');
editMaterialHandler();
form.values = { code: 'CASE-ABS-01', name: '外壳', category: '结构件', unit: '套', leadTimeDays: '40' };
form.onsubmit({ preventDefault() {}, target: form });
const persisted = JSON.parse(storedValue);
if (persisted.materials.find((material) => material.id === 'm6').leadTimeDays !== 40) throw new Error('采购周期未持久化');

await load('dashboard', 'p0-reset');
resetHandler();
if (storedValue !== null || reloadCount !== 1) throw new Error('重置未清除数据并刷新');
html = await load('analysis', 'p0-reset-baseline');
if (firstMaterial() !== '外壳' || rowCount() !== 10 || !html.includes('高风险') || !html.includes('需要行动') || !html.includes('正常')) throw new Error('重置后 V3 Demo 基线不正确');

globalThis.Date = NativeDate;
});
