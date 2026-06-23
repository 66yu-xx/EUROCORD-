import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../src/data.js';
import { formatProcurementLeadTimeDays, resolveProcurementLeadTimeDays } from '../src/planning/procurementLeadTime.js';

test('material procurement lead time takes precedence over the legacy inventory value', () => {
  assert.equal(resolveProcurementLeadTimeDays(
    { procurementLeadTimeDays: 14 },
    { leadTimeDays: 30 },
  ), 14);
});

test('legacy inventory lead time is used when material lead time is absent', () => {
  assert.equal(resolveProcurementLeadTimeDays({}, { leadTimeDays: 30 }), 30);
  assert.equal(resolveProcurementLeadTimeDays({ procurementLeadTimeDays: null }, { leadTimeDays: 30 }), 30);
});

test('zero material procurement lead time does not fall back to inventory', () => {
  assert.equal(resolveProcurementLeadTimeDays(
    { procurementLeadTimeDays: 0 },
    { leadTimeDays: 30 },
  ), 0);
});

test('missing material and inventory lead times resolve to null', () => {
  assert.equal(resolveProcurementLeadTimeDays({}, {}), null);
  assert.equal(resolveProcurementLeadTimeDays(), null);
});

test('demo data carries the material field while retaining the legacy inventory field', () => {
  for (const material of initialData.materials) {
    const inventoryBalance = initialData.inventory.find((item) => item.materialId === material.id);
    assert.equal(material.procurementLeadTimeDays, inventoryBalance.leadTimeDays);
  }
});

test('missing procurement lead time is formatted as unmaintained', () => {
  assert.equal(formatProcurementLeadTimeDays(null), '未维护');
  assert.equal(formatProcurementLeadTimeDays(undefined), '未维护');
});

test('zero-day procurement lead time remains visible', () => {
  assert.equal(formatProcurementLeadTimeDays(0), '0 天');
});

test('maintained procurement lead time is formatted in days', () => {
  assert.equal(formatProcurementLeadTimeDays(12), '12 天');
});
