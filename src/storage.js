import { DEFAULT_DELIVERY_DATE, DEFAULT_LEAD_TIME_DAYS } from './data.js';

export const STORAGE_KEY = 'mrp-lite-v1-data';

const clone = (value) => JSON.parse(JSON.stringify(value));

function hasValidShape(value) {
  return value
    && typeof value === 'object'
    && ['products', 'materials', 'bom', 'inventory', 'orders'].every((key) => Array.isArray(value[key]));
}

function hydrateData(data, fallbackData) {
  const inventoryByMaterial = new Map(data.inventory.map((item) => [item.materialId, item]));
  const fallbackMaterialById = new Map(fallbackData.materials.map((item) => [item.id, item]));
  const fallbackOrderByProduct = new Map(fallbackData.orders.map((item) => [item.productId, item]));

  const materials = data.materials.map((material) => {
    if (material.leadTimeDays !== undefined && material.leadTimeDays !== null) return material;
    const legacyLeadTime = inventoryByMaterial.get(material.id)?.leadTimeDays;
    const fallbackLeadTime = fallbackMaterialById.get(material.id)?.leadTimeDays;
    return {
      ...material,
      leadTimeDays: legacyLeadTime ?? fallbackLeadTime ?? DEFAULT_LEAD_TIME_DAYS,
    };
  });

  const orders = data.orders.map((order) => {
    if (order.deliveryDate) return order;
    return {
      ...order,
      deliveryDate: fallbackOrderByProduct.get(order.productId)?.deliveryDate ?? DEFAULT_DELIVERY_DATE,
    };
  });

  return { ...data, materials, orders };
}

export function loadData(fallbackData, storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    if (!stored) return clone(fallbackData);
    const parsed = JSON.parse(stored);
    return hasValidShape(parsed) ? hydrateData(parsed, fallbackData) : clone(fallbackData);
  } catch {
    return clone(fallbackData);
  }
}

export function saveData(data, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function resetStoredData(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
