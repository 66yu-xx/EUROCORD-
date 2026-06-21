import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DELIVERY_DATE, DEFAULT_LEAD_TIME_DAYS, initialData } from '../src/data.js';
import { loadData, resetStoredData, saveData, STORAGE_KEY } from '../src/storage.js';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('完整保存并恢复五类 MRP 数据', () => {
  const storage = createMemoryStorage();
  const changed = structuredClone(initialData);
  changed.products[0].name = '持久化产品';
  changed.materials[0].name = '持久化物料';
  changed.bom[0].qtyPerProduct = 9;
  changed.inventory[0].stockQty = 999;
  changed.orders[0].orderQty = 321;

  assert.equal(saveData(changed, storage), true);
  assert.deepEqual(loadData(initialData, storage), changed);
});

test('旧版本地数据从库存迁移 Lead Time 并补充订单交付日期', () => {
  const storage = createMemoryStorage();
  const legacy = structuredClone(initialData);
  legacy.products[0].name = '保留的用户产品名称';
  legacy.materials.forEach((material) => delete material.leadTimeDays);
  legacy.orders.forEach((order) => delete order.deliveryDate);
  saveData(legacy, storage);

  const loaded = loadData(initialData, storage);
  assert.equal(loaded.products[0].name, '保留的用户产品名称');
  assert.deepEqual(loaded.materials.map((material) => material.leadTimeDays), legacy.inventory.map((item) => item.leadTimeDays));
  assert.deepEqual(loaded.orders.map((order) => order.deliveryDate), initialData.orders.map((order) => order.deliveryDate));
});

test('材料已有 Lead Time 时不被旧库存值覆盖', () => {
  const storage = createMemoryStorage();
  const saved = structuredClone(initialData);
  saved.materials[0].leadTimeDays = 99;
  saved.inventory[0].leadTimeDays = 14;
  saveData(saved, storage);

  assert.equal(loadData(initialData, storage).materials[0].leadTimeDays, 99);
});

test('自定义旧数据缺少 V3 字段时使用安全默认值', () => {
  const storage = createMemoryStorage();
  const legacy = structuredClone(initialData);
  legacy.products.push({ id: 'p-custom', code: 'CUSTOM', name: '自定义产品', model: '自定义' });
  legacy.materials.push({ id: 'm-custom', code: 'CUSTOM-M', name: '自定义物料', category: '测试', unit: '件' });
  legacy.inventory.push({ materialId: 'm-custom', stockQty: 0, safetyStock: 0 });
  legacy.orders.push({ productId: 'p-custom', orderQty: 1 });
  saveData(legacy, storage);

  const loaded = loadData(initialData, storage);
  assert.equal(loaded.materials.find((item) => item.id === 'm-custom').leadTimeDays, DEFAULT_LEAD_TIME_DAYS);
  assert.equal(loaded.orders.find((item) => item.productId === 'p-custom').deliveryDate, DEFAULT_DELIVERY_DATE);
});

test('无本地数据时返回独立的初始数据副本', () => {
  const loaded = loadData(initialData, createMemoryStorage());
  loaded.products[0].name = '已修改';
  assert.notEqual(loaded.products[0].name, initialData.products[0].name);
});

test('无效或损坏的本地数据安全回退到演示数据', () => {
  const storage = createMemoryStorage();
  storage.setItem(STORAGE_KEY, '{bad json');
  assert.deepEqual(loadData(initialData, storage), initialData);
  storage.setItem(STORAGE_KEY, JSON.stringify({ products: [] }));
  assert.deepEqual(loadData(initialData, storage), initialData);
});

test('重置会删除已保存数据', () => {
  const storage = createMemoryStorage();
  saveData(initialData, storage);
  assert.equal(resetStoredData(storage), true);
  assert.equal(storage.getItem(STORAGE_KEY), null);
});
