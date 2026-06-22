import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_STATUS,
  INVENTORY_DIRECTION,
  createAuditItem,
  createBOMItem,
  createInventoryBalance,
  createInventoryFlow,
  createMaterial,
  createPendingDocument,
  createProduct,
} from '../src/domain/models.js';

test('Phase 1 domain factories expose stable draft shapes', () => {
  assert.equal(createMaterial().materialCode, '');
  assert.equal(createProduct().defaultBomVersion, '');
  assert.equal(createBOMItem().lossRate, 0);
  assert.equal(createInventoryBalance().quantityOnHand, 0);
  assert.equal(createInventoryFlow().direction, INVENTORY_DIRECTION.NONE);
  assert.equal(createPendingDocument().auditStatus, AUDIT_STATUS.DRAFT);
  assert.equal(createAuditItem().auditStatus, AUDIT_STATUS.PENDING);
});

test('domain factories apply overrides without sharing array defaults', () => {
  const first = createPendingDocument({ documentNo: 'DOC-001', riskFlags: ['stock-low'] });
  const second = createPendingDocument();

  first.riskFlags.push('missing-material');
  assert.deepEqual(first.riskFlags, ['stock-low', 'missing-material']);
  assert.deepEqual(second.riskFlags, []);
  assert.equal(first.documentNo, 'DOC-001');
});
