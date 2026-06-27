import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../src/data.js';

function hasNestedKey(value, key) {
  if (!value || typeof value !== 'object') return false;
  if (Object.hasOwn(value, key)) return true;
  return Object.values(value).some((child) => hasNestedKey(child, key));
}

test('demo data includes static order evaluation records without business linkage', () => {
  assert.ok(Array.isArray(initialData.orderEvaluationRecords));
  assert.ok(initialData.orderEvaluationRecords.length >= 1);

  const [record] = initialData.orderEvaluationRecords;
  assert.equal(record.recordType, 'orderEvaluation');

  assert.deepEqual(record.businessBoundary, {
    isOfficialSalesOrder: false,
    affectsInventory: false,
    reservesInventory: false,
    createsPurchaseOrder: false,
    entersFinance: false,
    hasCostAccounting: false,
  });

  assert.deepEqual(record.futureLinks, {
    salesOrderId: null,
    purchaseRequestIds: [],
    inventoryTransactionIds: [],
    costSnapshotId: null,
    financeReferenceId: null,
  });

  const forbiddenFinancialFields = ['unitCost', 'totalCost', 'purchaseAmount', 'margin', 'profit'];
  for (const field of forbiddenFinancialFields) {
    assert.equal(hasNestedKey(record, field), false);
  }
});
