const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const ACTION_SUGGESTIONS = Object.freeze({
  OK: 'no_action_required',
  'Action Required': 'purchase_action_required',
  'High Risk': 'delivery_risk_action_required',
});

function calendarDayUtc(value, fieldName) {
  if (typeof value === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      const [, yearText, monthText, dayText] = dateOnly;
      const year = Number(yearText);
      const month = Number(monthText);
      const day = Number(dayText);
      const date = new Date(0);
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCFullYear(year, month - 1, day);
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new RangeError(`${fieldName} must be a valid calendar date`);
      }
      return date.getTime();
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`${fieldName} must be a valid date`);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function finiteNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${fieldName} must be a finite number`);
  return number;
}

export function getRemainingDays(deliveryDate, today = new Date()) {
  const deliveryDay = calendarDayUtc(deliveryDate, 'deliveryDate');
  const currentDay = calendarDayUtc(today, 'today');
  return (deliveryDay - currentDay) / MILLISECONDS_PER_DAY;
}

export function getRiskLevel(shortageQty, leadTimeDays, remainingDays) {
  const shortage = finiteNumber(shortageQty, 'shortageQty');
  const leadTime = finiteNumber(leadTimeDays, 'leadTimeDays');
  const remaining = finiteNumber(remainingDays, 'remainingDays');

  if (shortage <= 0) return 'OK';
  if (leadTime <= remaining) return 'Action Required';
  return 'High Risk';
}

export function getActionSuggestion(riskLevel) {
  const suggestion = ACTION_SUGGESTIONS[riskLevel];
  if (!suggestion) throw new RangeError(`Unsupported risk level: ${riskLevel}`);
  return suggestion;
}
