export const STORAGE_KEY = 'mrp-lite-v1-data';

const clone = (value) => JSON.parse(JSON.stringify(value));

function hasValidShape(value) {
  return value
    && typeof value === 'object'
    && ['products', 'materials', 'bom', 'inventory', 'orders'].every((key) => Array.isArray(value[key]));
}

export function loadData(fallbackData, storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    if (!stored) return clone(fallbackData);
    const parsed = JSON.parse(stored);
    return hasValidShape(parsed) ? parsed : clone(fallbackData);
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
