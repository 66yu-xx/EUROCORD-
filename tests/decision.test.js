import test from 'node:test';
import assert from 'node:assert/strict';
import { getActionSuggestion, getRemainingDays, getRiskLevel } from '../src/decision.js';

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
