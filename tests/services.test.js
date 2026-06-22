import test from 'node:test';
import assert from 'node:assert/strict';
import { initialData } from '../src/data.js';
import { createAuditService } from '../src/services/auditService.js';
import { createInventoryService } from '../src/services/inventoryService.js';
import { createMaterialService } from '../src/services/materialService.js';
import { createProductService } from '../src/services/productService.js';
import { createSnapshotRepository } from '../src/storage/snapshotRepository.js';

const clone = (value) => structuredClone(value);

function createMemoryAdapter() {
  let value;
  return {
    load: (fallbackData) => clone(value || fallbackData),
    save: (nextValue) => { value = clone(nextValue); return true; },
  };
}

test('Phase 1 services can read the current demo snapshot without schema migration', () => {
  const repository = createSnapshotRepository({ adapter: createMemoryAdapter(), fallbackData: initialData });
  const materialService = createMaterialService({ repository });
  const productService = createProductService({ repository });
  const inventoryService = createInventoryService({ repository });
  const auditService = createAuditService({ repository });

  assert.equal(materialService.listMaterials().length, initialData.materials.length);
  assert.equal(productService.listProducts().length, initialData.products.length);
  assert.equal(productService.listBOMItems('p1').length, 10);
  assert.equal(inventoryService.listBalances().length, initialData.inventory.length);
  assert.deepEqual(inventoryService.listFlows(), []);
  assert.deepEqual(auditService.listPendingDocuments(), []);
  assert.deepEqual(auditService.listAuditItems(), []);
});

test('service draft methods use the new Lufuta domain shapes', () => {
  const repository = createSnapshotRepository({ adapter: createMemoryAdapter(), fallbackData: initialData });
  const materialDraft = createMaterialService({ repository }).createMaterialDraft({ materialCode: 'LFT-TEST' });
  const flowDraft = createInventoryService({ repository }).createFlowDraft({ documentType: 'inbound' });
  const auditDraft = createAuditService({ repository }).createAuditItemDraft({ documentNo: 'IN-001' });

  assert.equal(materialDraft.materialCode, 'LFT-TEST');
  assert.equal(flowDraft.documentType, 'inbound');
  assert.equal(auditDraft.documentNo, 'IN-001');
});
