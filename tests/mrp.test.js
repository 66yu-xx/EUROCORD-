import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../src/data.js';
import { calculateMaterialRequirements, getInventoryStatus, getInventoryStatusCounts, getSummary } from '../src/mrp.js';

function calculateBoundaryResult(stockQty, safetyStock) {
  return calculateMaterialRequirements({
    products: [{ id: 'p1', code: 'P-TEST', name: '测试产品', model: '测试款' }],
    materials: [{ id: 'm1', code: 'M-TEST', name: '测试物料', category: '测试件', unit: '件' }],
    bom: [{ productId: 'p1', materialId: 'm1', qtyPerProduct: 10 }],
    inventory: [{ materialId: 'm1', stockQty, safetyStock, leadTimeDays: 0 }],
    orders: [{ productId: 'p1', orderQty: 1 }],
  })[0];
}

test('库存状态引擎返回稳定的内部状态', () => {
  assert.equal(getInventoryStatus(10, 9, 100), 'shortage');
  assert.equal(getInventoryStatus(10, 10, 1), 'low');
  assert.equal(getInventoryStatus(10, 14, 5), 'low');
  assert.equal(getInventoryStatus(10, 15, 5), 'ok');
});

test('按多个产品订单正确汇总 BOM 需求', () => {
  const results = calculateMaterialRequirements(initialData);
  assert.equal(results.find((x) => x.name === '控制板').requiredQty, 170);
  assert.equal(results.find((x) => x.name === '陶瓷片').requiredQty, 430);
});

test('单一订单的交付日期保留在物料结果和明细中', () => {
  const result = calculateMaterialRequirements({
    products: [{ id: 'p1', code: 'P1' }],
    materials: [{ id: 'm1', code: 'M1', name: '物料一', unit: '件' }],
    bom: [{ productId: 'p1', materialId: 'm1', qtyPerProduct: 2 }],
    inventory: [{ materialId: 'm1', stockQty: 0, safetyStock: 0 }],
    orders: [{ productId: 'p1', orderQty: 3, deliveryDate: '2026-07-20' }],
  })[0];

  assert.equal(result.requiredQty, 6);
  assert.equal(result.earliestDeliveryDate, '2026-07-20');
  assert.equal(result.breakdown[0].deliveryDate, '2026-07-20');
});

test('同一物料跨多个订单使用最早交付日期且忽略零数量订单', () => {
  const result = calculateMaterialRequirements({
    products: [{ id: 'p1', code: 'P1' }, { id: 'p2', code: 'P2' }, { id: 'p3', code: 'P3' }],
    materials: [{ id: 'm1', code: 'M1', name: '通用件', unit: '件' }],
    bom: [
      { productId: 'p1', materialId: 'm1', qtyPerProduct: 1 },
      { productId: 'p2', materialId: 'm1', qtyPerProduct: 1 },
      { productId: 'p3', materialId: 'm1', qtyPerProduct: 1 },
    ],
    inventory: [{ materialId: 'm1', stockQty: 0, safetyStock: 0 }],
    orders: [
      { productId: 'p1', orderQty: 2, deliveryDate: '2026-07-20' },
      { productId: 'p2', orderQty: 3, deliveryDate: '2026-07-10' },
      { productId: 'p3', orderQty: 0, deliveryDate: '2026-07-01' },
    ],
  })[0];

  assert.equal(result.requiredQty, 5);
  assert.equal(result.earliestDeliveryDate, '2026-07-10');
  assert.equal(result.breakdown.length, 2);
});

test('不同物料之间不会串用交付日期', () => {
  const results = calculateMaterialRequirements({
    products: [{ id: 'p1', code: 'P1' }, { id: 'p2', code: 'P2' }],
    materials: [
      { id: 'm1', code: 'M1', name: '物料一', unit: '件' },
      { id: 'm2', code: 'M2', name: '物料二', unit: '件' },
    ],
    bom: [
      { productId: 'p1', materialId: 'm1', qtyPerProduct: 1 },
      { productId: 'p2', materialId: 'm2', qtyPerProduct: 1 },
    ],
    inventory: [
      { materialId: 'm1', stockQty: 0, safetyStock: 0 },
      { materialId: 'm2', stockQty: 0, safetyStock: 0 },
    ],
    orders: [
      { productId: 'p1', orderQty: 1, deliveryDate: '2026-07-20' },
      { productId: 'p2', orderQty: 1, deliveryDate: '2026-07-10' },
    ],
  });

  assert.equal(results.find((item) => item.id === 'm1').earliestDeliveryDate, '2026-07-20');
  assert.equal(results.find((item) => item.id === 'm2').earliestDeliveryDate, '2026-07-10');
});

test('正确应用缺料和库存低规则', () => {
  const results = calculateMaterialRequirements(initialData);
  assert.equal(results.find((x) => x.name === '控制板').status, '缺料');
  assert.equal(results.find((x) => x.name === '电源板').status, '库存低');
  assert.equal(results.find((x) => x.name === '陶瓷片').status, '库存低');
  assert.equal(results.find((x) => x.name === '电源线').status, '充足');
  assert.deepEqual(getInventoryStatusCounts(results), { shortageCount: 4, lowStockCount: 3, okCount: 3 });
  assert.deepEqual(getSummary(initialData), { productCount: 3, materialCount: 10, shortageCount: 4, lowStockCount: 3 });
  assert.deepEqual(getSummary(initialData, results), { productCount: 3, materialCount: 10, shortageCount: 4, lowStockCount: 3 });
});

test('零订单不生成物料需求', () => {
  const empty = { ...initialData, orders: initialData.orders.map((x) => ({ ...x, orderQty: 0 })) };
  assert.deepEqual(calculateMaterialRequirements(empty), []);
});

test('库存等于需求且无安全库存时状态为充足', () => {
  const result = calculateBoundaryResult(10, 0);
  assert.equal(result.remainingQty, 0);
  assert.equal(result.shortageQty, 0);
  assert.equal(result.status, '充足');
});

test('库存等于需求且安全库存大于零时状态为库存低', () => {
  const result = calculateBoundaryResult(10, 1);
  assert.equal(result.remainingQty, 0);
  assert.equal(result.shortageQty, 0);
  assert.equal(result.status, '库存低');
});

test('库存高于需求但剩余库存低于安全库存时状态为库存低', () => {
  const result = calculateBoundaryResult(14, 5);
  assert.equal(result.remainingQty, 4);
  assert.equal(result.shortageQty, 0);
  assert.equal(result.status, '库存低');
});

test('剩余库存等于安全库存时状态为充足', () => {
  const result = calculateBoundaryResult(15, 5);
  assert.equal(result.remainingQty, result.safetyStock);
  assert.equal(result.shortageQty, 0);
  assert.equal(result.status, '充足');
});

test('库存低于需求时 shortageQty 仅计算实际缺口', () => {
  const result = calculateBoundaryResult(9, 5);
  assert.equal(result.remainingQty, -1);
  assert.equal(result.shortageQty, 1);
  assert.equal(result.status, '缺料');
});
