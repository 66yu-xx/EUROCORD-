import { createInventoryBalance, createInventoryFlow } from '../domain/models.js';

export function createInventoryService({ repository }) {
  return Object.freeze({
    listBalances: () => repository.list('inventory'),
    listFlows: () => repository.list('inventoryFlows'),
    createBalanceDraft: (values = {}) => createInventoryBalance(values),
    createFlowDraft: (values = {}) => createInventoryFlow(values),
  });
}
