import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProcurementRisk } from '../src/planning/procurementRisk.js';

const baseInput = {
  requiredQty: 100,
  stockQty: 120,
  safetyStock: 20,
  procurementLeadTimeDays: 5,
  requiredDate: '2026-06-15',
  asOfDate: '2026-06-01',
};

test('库存充足且剩余不低于安全库存时风险为 ok', () => {
  const result = calculateProcurementRisk(baseInput);

  assert.equal(result.remainingQty, 20);
  assert.equal(result.shortageQty, 0);
  assert.equal(result.quantityRisk, 'ok');
  assert.equal(result.timeRisk, false);
  assert.equal(result.riskLevel, 'ok');
});

test('存在缺料但今天下单仍能按时到料时风险为 warning', () => {
  const result = calculateProcurementRisk({ ...baseInput, stockQty: 80 });

  assert.equal(result.shortageQty, 20);
  assert.equal(result.quantityRisk, 'shortage');
  assert.equal(result.expectedArrivalDate, '2026-06-06');
  assert.equal(result.latestOrderDate, '2026-06-10');
  assert.equal(result.timeRisk, false);
  assert.equal(result.mustOrderNow, false);
  assert.equal(result.riskLevel, 'warning');
});

test('预计到料日等于需求日时不判为 critical', () => {
  const result = calculateProcurementRisk({ ...baseInput, stockQty: 80, requiredDate: '2026-06-06' });

  assert.equal(result.expectedArrivalDate, result.requiredDate);
  assert.equal(result.timeRisk, false);
  assert.equal(result.riskLevel, 'warning');
});

test('预计到料日晚于需求日时风险为 critical', () => {
  const result = calculateProcurementRisk({ ...baseInput, stockQty: 80, requiredDate: '2026-06-05' });

  assert.equal(result.expectedArrivalDate, '2026-06-06');
  assert.equal(result.timeRisk, true);
  assert.equal(result.mustOrderNow, true);
  assert.equal(result.riskLevel, 'critical');
});

test('今天等于最晚下单日且存在缺料时 mustOrderNow 为 true', () => {
  const result = calculateProcurementRisk({ ...baseInput, stockQty: 80, procurementLeadTimeDays: 10, requiredDate: '2026-06-11' });

  assert.equal(result.latestOrderDate, result.asOfDate);
  assert.equal(result.mustOrderNow, true);
  assert.equal(result.riskLevel, 'warning');
});

test('缺少采购周期时风险为 unknown 且不伪装为无时间风险', () => {
  const result = calculateProcurementRisk({ ...baseInput, procurementLeadTimeDays: undefined });

  assert.equal(result.procurementLeadTimeDays, null);
  assert.equal(result.expectedArrivalDate, null);
  assert.equal(result.timeRisk, null);
  assert.equal(result.riskLevel, 'unknown');
});

test('缺少需求日期时风险为 unknown', () => {
  const result = calculateProcurementRisk({ ...baseInput, requiredDate: undefined });

  assert.equal(result.requiredDate, null);
  assert.equal(result.latestOrderDate, null);
  assert.equal(result.riskLevel, 'unknown');
});

test('缺少计算基准日期时风险为 unknown', () => {
  const result = calculateProcurementRisk({ ...baseInput, asOfDate: undefined });

  assert.equal(result.asOfDate, null);
  assert.equal(result.expectedArrivalDate, null);
  assert.equal(result.timeRisk, null);
  assert.equal(result.riskLevel, 'unknown');
});

test('零天采购周期是合法输入并按当天到料计算', () => {
  const result = calculateProcurementRisk({ ...baseInput, stockQty: 80, procurementLeadTimeDays: 0 });

  assert.equal(result.procurementLeadTimeDays, 0);
  assert.equal(result.expectedArrivalDate, result.asOfDate);
  assert.equal(result.latestOrderDate, result.requiredDate);
  assert.equal(result.riskLevel, 'warning');
});

test('库存不缺料但剩余低于安全库存时数量风险为 low', () => {
  const result = calculateProcurementRisk({ ...baseInput, requiredQty: 80, stockQty: 100, safetyStock: 30 });

  assert.equal(result.shortageQty, 0);
  assert.equal(result.remainingQty, 20);
  assert.equal(result.quantityRisk, 'low');
  assert.equal(result.riskLevel, 'warning');
});

test('自然日计算可以正确跨月', () => {
  const result = calculateProcurementRisk({ ...baseInput, stockQty: 80, procurementLeadTimeDays: 5, asOfDate: '2026-01-28', requiredDate: '2026-03-03' });

  assert.equal(result.expectedArrivalDate, '2026-02-02');
  assert.equal(result.latestOrderDate, '2026-02-26');
});

test('自然日计算可以正确跨年', () => {
  const result = calculateProcurementRisk({ ...baseInput, stockQty: 80, procurementLeadTimeDays: 7, asOfDate: '2026-12-28', requiredDate: '2027-01-10' });

  assert.equal(result.expectedArrivalDate, '2027-01-04');
  assert.equal(result.latestOrderDate, '2027-01-03');
});

test('可以接收多产品 BOM 汇总后的 requiredQty', () => {
  const result = calculateProcurementRisk({ ...baseInput, requiredQty: 170, stockQty: 150, requiredDate: '2026-06-20' });

  assert.equal(result.requiredQty, 170);
  assert.equal(result.shortageQty, 20);
  assert.equal(result.quantityRisk, 'shortage');
  assert.equal(result.riskLevel, 'warning');
});
