import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDecisionResults, getActionSuggestion, getRemainingDays, getRiskLevel } from '../src/decision.js';

function decisionResult(overrides = {}, materialOverrides = {}, today = '2026-07-10') {
  const mrpResult = {
    id: 'm1',
    code: 'M1',
    name: '测试物料',
    requiredQty: 10,
    stockQty: 5,
    shortageQty: 5,
    status: '缺料',
    earliestDeliveryDate: '2026-07-20',
    breakdown: [{ productCode: 'P1', qty: 10 }],
    ...overrides,
  };
  const material = { id: 'm1', name: '测试物料', leadTimeDays: 5, ...materialOverrides };
  const inputSnapshot = structuredClone(mrpResult);
  return {
    input: mrpResult,
    inputSnapshot,
    output: calculateDecisionResults([mrpResult], { materials: [material], today })[0],
  };
}

test('无缺料时风险为 OK', () => {
  assert.equal(getRiskLevel(0, 30, -5), 'OK');
  assert.equal(getRiskLevel(-1, 30, -5), 'OK');
});

test('Lead Time 小于剩余天数时需要行动', () => {
  assert.equal(getRiskLevel(1, 4, 5), 'Action Required');
});

test('Lead Time 等于剩余天数时需要行动', () => {
  assert.equal(getRiskLevel(1, 5, 5), 'Action Required');
});

test('Lead Time 大于剩余天数时为高风险', () => {
  assert.equal(getRiskLevel(1, 6, 5), 'High Risk');
});

test('交付日为今天时剩余天数为零', () => {
  assert.equal(getRemainingDays('2026-06-21', '2026-06-21'), 0);
});

test('交付日已过时返回负数', () => {
  assert.equal(getRemainingDays('2026-06-19', '2026-06-21'), -2);
});

test('自然日计算跨月稳定', () => {
  assert.equal(getRemainingDays('2026-03-01', '2026-02-28'), 1);
});

test('自然日计算跨年稳定', () => {
  assert.equal(getRemainingDays('2027-01-01', '2026-12-31'), 1);
});

test('自然日计算覆盖闰日边界', () => {
  assert.equal(getRemainingDays('2024-03-01', '2024-02-28'), 2);
  assert.equal(getRemainingDays('2024-02-29', '2024-02-28'), 1);
});

test('时间点不同不会改变相同日历日期的计算结果', () => {
  const earlyToday = new Date(2026, 5, 21, 0, 1);
  const lateToday = new Date(2026, 5, 21, 23, 59);
  const earlyDelivery = new Date(2026, 5, 25, 0, 1);
  const lateDelivery = new Date(2026, 5, 25, 23, 59);
  assert.equal(getRemainingDays(earlyDelivery, earlyToday), 4);
  assert.equal(getRemainingDays(lateDelivery, lateToday), 4);
});

test('自然日计算不受夏令时小时差影响', () => {
  const beforeDstBoundary = new Date(2026, 2, 28, 23, 0);
  const afterDstBoundary = new Date(2026, 2, 30, 1, 0);
  assert.equal(getRemainingDays(afterDstBoundary, beforeDstBoundary), 2);
});

test('行动建议返回稳定内部键', () => {
  assert.equal(getActionSuggestion('OK'), 'no_action_required');
  assert.equal(getActionSuggestion('Action Required'), 'purchase_action_required');
  assert.equal(getActionSuggestion('High Risk'), 'delivery_risk_action_required');
});

test('决策结果在无缺料时始终为 OK', () => {
  const { output } = decisionResult({ shortageQty: 0 }, { leadTimeDays: 30 });
  assert.equal(output.riskLevel, 'OK');
  assert.equal(output.actionSuggestion, 'no_action_required');
});

test('缺料且 Lead Time 在剩余天数内时需要行动', () => {
  const { output } = decisionResult({}, { leadTimeDays: 9 });
  assert.equal(output.remainingDays, 10);
  assert.equal(output.riskLevel, 'Action Required');
  assert.equal(output.actionSuggestion, 'purchase_action_required');
});

test('缺料且 Lead Time 等于剩余天数时需要行动', () => {
  const { output } = decisionResult({}, { leadTimeDays: 10 });
  assert.equal(output.riskLevel, 'Action Required');
});

test('缺料且 Lead Time 超过剩余天数时为高风险', () => {
  const { output } = decisionResult({}, { leadTimeDays: 11 });
  assert.equal(output.riskLevel, 'High Risk');
  assert.equal(output.actionSuggestion, 'delivery_risk_action_required');
});

test('决策结果使用 Material 的规范 Lead Time', () => {
  const { output } = decisionResult({ leadTimeDays: 99 }, { leadTimeDays: 7 });
  assert.equal(output.leadTimeDays, 7);
});

test('决策结果不修改原始 MRP 结果并保留原字段', () => {
  const { input, inputSnapshot, output } = decisionResult();
  assert.deepEqual(input, inputSnapshot);
  assert.notEqual(output, input);
  assert.equal(output.code, input.code);
  assert.equal(output.status, input.status);
  assert.deepEqual(output.breakdown, input.breakdown);
  assert.equal(output.materialId, 'm1');
  assert.equal(output.materialName, '测试物料');
  assert.equal(output.demandQty, 10);
});

test('缺少交付日期时按今天处理且不伪造原始日期', () => {
  const { output } = decisionResult({ earliestDeliveryDate: null }, { leadTimeDays: 1 });
  assert.equal(output.earliestDeliveryDate, null);
  assert.equal(output.remainingDays, 0);
  assert.equal(output.riskLevel, 'High Risk');
});

test('缺少 Material Lead Time 时使用零天安全回退', () => {
  const { output } = decisionResult({}, { leadTimeDays: undefined });
  assert.equal(output.leadTimeDays, 0);
  assert.equal(output.riskLevel, 'Action Required');
});
