export const AUDIT_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

export const INVENTORY_DIRECTION = Object.freeze({
  IN: 'in',
  OUT: 'out',
  NONE: 'none',
});

const createRecord = (defaults, values = {}) => ({ ...defaults, ...values });

export function createMaterial(values = {}) {
  return createRecord({
    id: '',
    materialCode: '',
    materialName: '',
    model: '',
    specification: '',
    description: '',
    unit: '',
    categoryCode: '',
    subCategoryCode: '',
    isPhysical: true,
    isCoreMaterial: false,
    defaultLocation: '',
    minStock: 0,
    maxStock: 0,
    procurementLeadTimeDays: null,
    status: 'active',
    notes: '',
    createdAt: null,
    updatedAt: null,
  }, values);
}

export function createProduct(values = {}) {
  return createRecord({
    id: '',
    productCode: '',
    productName: '',
    model: '',
    specification: '',
    unit: '',
    defaultBomVersion: '',
    status: 'active',
    notes: '',
    createdAt: null,
    updatedAt: null,
  }, values);
}

export function createBOMItem(values = {}) {
  return createRecord({
    id: '',
    productId: '',
    parentMaterialId: '',
    componentMaterialId: '',
    quantityPer: 0,
    lossRate: 0,
    unit: '',
    version: '',
    effectiveDate: null,
    expiryDate: null,
    notes: '',
  }, values);
}

export function createInventoryBalance(values = {}) {
  return createRecord({
    id: '',
    materialId: '',
    warehouseId: '',
    locationId: '',
    quantityOnHand: 0,
    averageCost: 0,
    initialQuantity: 0,
    initialDate: null,
    lastMovementAt: null,
    updatedAt: null,
  }, values);
}

export function createInventoryFlow(values = {}) {
  return createRecord({
    id: '',
    flowNo: '',
    documentType: '',
    documentId: '',
    documentNo: '',
    materialId: '',
    direction: INVENTORY_DIRECTION.NONE,
    quantity: 0,
    unitCost: null,
    amount: null,
    balanceAfter: null,
    flowStatus: AUDIT_STATUS.DRAFT,
    operatorName: '',
    occurredAt: null,
    notes: '',
  }, values);
}

export function createPendingDocument(values = {}) {
  return createRecord({
    id: '',
    documentType: '',
    documentNo: '',
    applicantName: '',
    submittedAt: null,
    auditStatus: AUDIT_STATUS.DRAFT,
    inventoryEffect: INVENTORY_DIRECTION.NONE,
    lineCount: 0,
    riskFlags: [],
  }, { ...values, riskFlags: [...(values.riskFlags || [])] });
}

export function createAuditItem(values = {}) {
  return createRecord({
    id: '',
    documentId: '',
    documentNo: '',
    documentType: '',
    auditStatus: AUDIT_STATUS.PENDING,
    inventoryEffect: INVENTORY_DIRECTION.NONE,
    reviewerName: '',
    reviewedAt: null,
    rejectionReason: '',
    riskFlags: [],
  }, { ...values, riskFlags: [...(values.riskFlags || [])] });
}
