function normalizeQuantity(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function normalizeRemainingQty(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function hasValidProcurementLeadTime(value) {
  if (value === null || value === undefined || value === '') return false;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0;
}

export function buildProcurementRecommendation(row = {}) {
  const shortageQty = normalizeQuantity(row.shortageQty);
  const safetyStock = normalizeQuantity(row.safetyStock);
  const remainingQty = normalizeRemainingQty(row.remainingQty);

  let recommendation;

  if (shortageQty > 0) {
    recommendation = {
      action: '建议采购',
      recommendedQty: shortageQty,
      reason: '当前库存不足以覆盖计划需求',
      priority: '高',
    };
  } else if (remainingQty < safetyStock) {
    recommendation = {
      action: '建议补充安全库存',
      recommendedQty: safetyStock - remainingQty,
      reason: '生产后预计剩余库存低于安全库存',
      priority: '中',
    };
  } else {
    recommendation = {
      action: '无需采购',
      recommendedQty: 0,
      reason: '库存可覆盖计划需求，且生产后不低于安全库存',
      priority: '无',
    };
  }

  if (recommendation.recommendedQty > 0 && !hasValidProcurementLeadTime(row.procurementLeadTimeDays)) {
    recommendation = {
      ...recommendation,
      reason: `${recommendation.reason}；采购周期未维护或无效，需要确认采购周期`,
      priority: '待确认',
    };
  }

  if (row.riskLevel === 'critical' || row.mustOrderNow === true) {
    recommendation = { ...recommendation, priority: '高' };
  }

  return recommendation;
}
