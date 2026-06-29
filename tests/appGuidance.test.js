import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('real data trial result includes light next-step guidance before save action', () => {
  assert.match(appSource, /data-real-data-trial-next-step-guide/);
  assert.match(appSource, /试算完成后的下一步建议/);
  assert.match(appSource, /先看下方“试算结论摘要”，再看“关键风险物料”，随后查看“角色关注点”和“结果明细”/);
  assert.match(appSource, /如需留档，可在明细之后手动保存为接单评估记录/);

  const resultOrder = '${summary}${nextStepGuide}${decisionLayer}${shortageTable}${riskTable}${recommendationTable}${warehousePoints}${savePanel}';
  assert.ok(appSource.includes(resultOrder));
});

test('real data trial guidance preserves evaluation record business boundaries', () => {
  assert.match(appSource, /保存后可在“已保存评估记录”列表复查/);
  assert.match(appSource, /接单评估记录仍不等于正式订单/);
  assert.match(appSource, /不确认接单/);
  assert.match(appSource, /不影响库存/);
  assert.match(appSource, /不创建采购需求或采购单/);
  assert.match(appSource, /不进入财务或成本/);
  assert.match(appSource, /可到“已保存评估记录”列表复查/);
});

test('real data trial scrolls to generated results after a successful run', () => {
  assert.match(appSource, /function scrollToRealDataTrialResults\(\)/);
  assert.match(appSource, /document\.querySelector\('\[data-real-data-trial-results\]'\)\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(appSource, /试算已完成，结果已生成。建议先看下方“下一步建议”和“试算结论摘要”/);

  const scrollCalls = appSource.match(/if \(realDataTrialPreview\) scrollToRealDataTrialResults\(\);/g) || [];
  assert.equal(scrollCalls.length, 2);
});
