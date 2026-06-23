export function resolveProcurementLeadTimeDays(material = {}, inventoryBalance = {}) {
  const materialLeadTime = material?.procurementLeadTimeDays;
  if (materialLeadTime !== null && materialLeadTime !== undefined) return materialLeadTime;

  const legacyLeadTime = inventoryBalance?.leadTimeDays;
  if (legacyLeadTime !== null && legacyLeadTime !== undefined) return legacyLeadTime;

  return null;
}
