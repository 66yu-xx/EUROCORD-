import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProcurementRecommendation } from '../src/planning/procurementRecommendation.js';

test('缺料时建议采购，数量等于 shortageQty', () => {
  const result = buildProcurementRecommendation({
    shortageQty: 20,
    safetyStock: 10,
    remainingQty: -20,
    procurementLeadTimeDays: 7,
  });

  assert.deepEqual(result, {
    action: '建议采购',
    recommendedQty: 20,
    reason: '当前库存不足以覆盖计划需求',
    priority: '高',
  });
});

test('库存覆盖需求但低于安全库存时建议补充安全库存', () => {
  const result = buildProcurementRecommendation({
    shortageQty: 0,
    safetyStock: 30,
    remainingQty: 20,
    procurementLeadTimeDays: 5,
  });

  assert.deepEqual(result, {
    action: '建议补充安全库存',
    recommendedQty: 10,
    reason: '生产后预计剩余库存低于安全库存',
    priority: '中',
  });
});

test('库存正常时无需采购', () => {
  const result = buildProcurementRecommendation({
    shortageQty: 0,
    safetyStock: 20,
    remainingQty: 20,
    procurementLeadTimeDays: 5,
  });

  assert.deepEqual(result, {
    action: '无需采购',
    recommendedQty: 0,
    reason: '库存可覆盖计划需求，且生产后不低于安全库存',
    priority: '无',
  });
});

test('需要采购但采购周期缺失时数量不变且优先级待确认', () => {
  const result = buildProcurementRecommendation({
    shortageQty: 0,
    safetyStock: 30,
    remainingQty: 20,
    procurementLeadTimeDays: null,
  });

  assert.equal(result.action, '建议补充安全库存');
  assert.equal(result.recommendedQty, 10);
  assert.equal(result.priority, '待确认');
  assert.match(result.reason, /采购周期.*需要确认采购周期/);
});

test('critical 风险将优先级提升为高', () => {
  const result = buildProcurementRecommendation({
    shortageQty: 0,
    safetyStock: 0,
    remainingQty: 10,
    procurementLeadTimeDays: 5,
    riskLevel: 'critical',
  });

  assert.equal(result.action, '无需采购');
  assert.equal(result.priority, '高');
});

test('mustOrderNow 将优先级提升为高', () => {
  const result = buildProcurementRecommendation({
    shortageQty: 0,
    safetyStock: 30,
    remainingQty: 20,
    procurementLeadTimeDays: null,
    mustOrderNow: true,
  });

  assert.equal(result.recommendedQty, 10);
  assert.equal(result.priority, '高');
  assert.match(result.reason, /采购周期.*需要确认采购周期/);
});

test('计算过程不修改传入 row 对象', () => {
  const row = {
    requiredQty: 100,
    stockQty: 80,
    shortageQty: 20,
    safetyStock: 10,
    remainingQty: -20,
    procurementLeadTimeDays: 7,
    riskLevel: 'warning',
    mustOrderNow: false,
    deliveryRiskLabel: '交期紧张',
  };
  const snapshot = structuredClone(row);

  buildProcurementRecommendation(row);

  assert.deepEqual(row, snapshot);
});
