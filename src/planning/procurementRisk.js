const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeQuantity(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function normalizeLeadTime(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function formatDateOnly(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftCalendarDays(date, days) {
  const shifted = new Date(date.getTime());
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

export function calculateProcurementRisk(input = {}) {
  const requiredQty = normalizeQuantity(input.requiredQty);
  const stockQty = normalizeQuantity(input.stockQty);
  const safetyStock = normalizeQuantity(input.safetyStock);
  const shortageQty = Math.max(requiredQty - stockQty, 0);
  const remainingQty = stockQty - requiredQty;
  const quantityRisk = shortageQty > 0 ? 'shortage' : remainingQty < safetyStock ? 'low' : 'ok';

  const procurementLeadTimeDays = normalizeLeadTime(input.procurementLeadTimeDays);
  const requiredDateValue = parseDateOnly(input.requiredDate);
  const asOfDateValue = parseDateOnly(input.asOfDate);
  const requiredDate = requiredDateValue ? formatDateOnly(requiredDateValue) : null;
  const asOfDate = asOfDateValue ? formatDateOnly(asOfDateValue) : null;

  const baseResult = {
    requiredQty,
    stockQty,
    safetyStock,
    shortageQty,
    remainingQty,
    procurementLeadTimeDays,
    requiredDate,
    asOfDate,
    latestOrderDate: null,
    expectedArrivalDate: null,
    quantityRisk,
    timeRisk: null,
    mustOrderNow: false,
    riskLevel: 'unknown',
    reason: 'planning-data-missing-or-invalid',
  };

  if (procurementLeadTimeDays === null || !requiredDateValue || !asOfDateValue) return baseResult;

  const expectedArrivalDateValue = shiftCalendarDays(asOfDateValue, procurementLeadTimeDays);
  const latestOrderDateValue = shiftCalendarDays(requiredDateValue, -procurementLeadTimeDays);
  const expectedArrivalDate = formatDateOnly(expectedArrivalDateValue);
  const latestOrderDate = formatDateOnly(latestOrderDateValue);
  const timeRisk = shortageQty > 0 && expectedArrivalDateValue.getTime() > requiredDateValue.getTime();
  const mustOrderNow = shortageQty > 0 && latestOrderDateValue.getTime() <= asOfDateValue.getTime();

  if (timeRisk) {
    return { ...baseResult, latestOrderDate, expectedArrivalDate, timeRisk, mustOrderNow, riskLevel: 'critical', reason: 'arrival-after-required-date' };
  }
  if (shortageQty > 0) {
    return { ...baseResult, latestOrderDate, expectedArrivalDate, timeRisk, mustOrderNow, riskLevel: 'warning', reason: 'purchase-required' };
  }
  if (quantityRisk === 'low') {
    return { ...baseResult, latestOrderDate, expectedArrivalDate, timeRisk, mustOrderNow, riskLevel: 'warning', reason: 'below-safety-stock' };
  }
  return { ...baseResult, latestOrderDate, expectedArrivalDate, timeRisk, mustOrderNow, riskLevel: 'ok', reason: 'stock-sufficient' };
}
