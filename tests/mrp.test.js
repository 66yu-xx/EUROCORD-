import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../src/data.js';
import { calculateMaterialRequirements, getSummary } from '../src/mrp.js';

test('按多个产品订单正确汇总 BOM 需求', () => {
  const results = calculateMaterialRequirements(initialData);
  assert.equal(results.find((x) => x.name === '控制板').requiredQty, 170);
  assert.equal(results.find((x) => x.name === '陶瓷片').requiredQty, 430);
});

test('正确应用缺料和库存低规则', () => {
  const results = calculateMaterialRequirements(initialData);
  assert.equal(results.find((x) => x.name === '控制板').status, '缺料');
  assert.equal(results.find((x) => x.name === '电源板').status, '库存低');
  assert.equal(results.find((x) => x.name === '陶瓷片').status, '库存低');
  assert.equal(results.find((x) => x.name === '电源线').status, '充足');
  assert.deepEqual(getSummary(initialData), { productCount: 3, materialCount: 10, shortageCount: 4, lowStockCount: 3 });
});

test('零订单不生成物料需求', () => {
  const empty = { ...initialData, orders: initialData.orders.map((x) => ({ ...x, orderQty: 0 })) };
  assert.deepEqual(calculateMaterialRequirements(empty), []);
});
