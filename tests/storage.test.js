import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../src/data.js';
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
