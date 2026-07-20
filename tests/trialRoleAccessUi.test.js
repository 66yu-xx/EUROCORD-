import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ROLE_ACTIONS, ROLE_VIEW_AREAS, canRolePerform, canRoleView } from '../src/roleAccess.js';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('Sales retains the Phase 8 trial loop except clearing all saved evaluations', () => {
  for (const action of [
    ROLE_ACTIONS.CHANGE_DATA_SOURCE,
    ROLE_ACTIONS.EDIT_TRIAL_INPUT,
    ROLE_ACTIONS.RUN_TRIAL,
    ROLE_ACTIONS.SAVE_EVALUATION,
    ROLE_ACTIONS.VIEW_SAVED_EVALUATION,
  ]) {
    assert.equal(canRolePerform('sales', action), true);
  }
  assert.equal(canRolePerform('sales', ROLE_ACTIONS.CLEAR_SAVED_EVALUATIONS), false);
});

test('Management can view core results but cannot mutate the trial flow', () => {
  for (const area of [
    ROLE_VIEW_AREAS.TRIAL_RESULTS,
    ROLE_VIEW_AREAS.RISK_SUMMARY,
    ROLE_VIEW_AREAS.ROLE_FOCUS,
    ROLE_VIEW_AREAS.EVALUATION_SUMMARY,
  ]) {
    assert.equal(canRoleView('management', area), true);
  }
  for (const action of [
    ROLE_ACTIONS.CHANGE_DATA_SOURCE,
    ROLE_ACTIONS.EDIT_TRIAL_INPUT,
    ROLE_ACTIONS.RUN_TRIAL,
    ROLE_ACTIONS.SAVE_EVALUATION,
    ROLE_ACTIONS.CLEAR_SAVED_EVALUATIONS,
  ]) {
    assert.equal(canRolePerform('management', action), false);
  }
});

test('trial UI consumes the shared role access policy', () => {
  assert.match(appSource, /canRoleView\(currentDemoRoleId, area\)/);
  assert.match(appSource, /canRolePerform\(currentDemoRoleId, action\)/);
  assert.match(appSource, /ROLE_VIEW_AREAS\.PURCHASE_GUIDANCE/);
  assert.match(appSource, /ROLE_ACTIONS\.SAVE_EVALUATION/);
  assert.doesNotMatch(appSource, /currentDemoRoleId\s*===\s*['"](?:sales|management)['"]/);
});

test('all five demo roles use the shared role policy directly', () => {
  assert.doesNotMatch(appSource, /TRIAL_ACCESS_POLICY_ROLE_IDS|isTrialAccessPolicyActive/);
  assert.match(appSource, /return canRoleView\(currentDemoRoleId, area\);/);
  assert.match(appSource, /return canRolePerform\(currentDemoRoleId, action\);/);
});

test('read-only roles receive role-labelled guidance with and without results', () => {
  assert.match(appSource, /data-trial-role-access-notice/);
  assert.match(appSource, /当前角色为 \$\{currentRoleLabel\} · 只读查看/);
  assert.match(appSource, /当前角色为只读角色，请先由可操作角色完成试算后再查看相关结果/);
  assert.match(appSource, /当前试算输入和结果已保留/);
});

test('read-only result guidance is assembled from permitted result areas', () => {
  assert.match(appSource, /const readableResultSections = \[/);
  assert.match(appSource, /canCurrentRoleView\(ROLE_VIEW_AREAS\.RISK_SUMMARY\) \? '试算结论和关键风险'/);
  assert.match(appSource, /canCurrentRoleView\(ROLE_VIEW_AREAS\.PURCHASE_GUIDANCE\) \? '采购建议'/);
  assert.match(appSource, /canCurrentRoleView\(ROLE_VIEW_AREAS\.WAREHOUSE_FOCUS\) \? '仓库确认点'/);
  assert.match(appSource, /readableResultSections \|\| '当前角色可见的结果'/);
});

test('Purchasing receives procurement results without trial mutation actions', () => {
  for (const area of [
    ROLE_VIEW_AREAS.TRIAL_RESULTS,
    ROLE_VIEW_AREAS.RISK_SUMMARY,
    ROLE_VIEW_AREAS.MATERIAL_REQUIREMENTS,
    ROLE_VIEW_AREAS.PURCHASE_GUIDANCE,
    ROLE_VIEW_AREAS.EVALUATION_SUMMARY,
  ]) {
    assert.equal(canRoleView('purchasing', area), true);
  }
  for (const action of [ROLE_ACTIONS.EDIT_TRIAL_INPUT, ROLE_ACTIONS.RUN_TRIAL, ROLE_ACTIONS.SAVE_EVALUATION]) {
    assert.equal(canRolePerform('purchasing', action), false);
  }
});

test('Warehouse receives inventory and shortage results without trial actions', () => {
  assert.equal(canRoleView('warehouse', ROLE_VIEW_AREAS.TRIAL_RESULTS), true);
  assert.equal(canRoleView('warehouse', ROLE_VIEW_AREAS.MATERIAL_REQUIREMENTS), true);
  assert.equal(canRoleView('warehouse', ROLE_VIEW_AREAS.WAREHOUSE_FOCUS), true);
  assert.equal(canRoleView('warehouse', ROLE_VIEW_AREAS.PURCHASE_GUIDANCE), false);
  assert.equal(canRolePerform('warehouse', ROLE_ACTIONS.EDIT_TRIAL_INPUT), false);
  assert.equal(canRolePerform('warehouse', ROLE_ACTIONS.RUN_TRIAL), false);
  assert.equal(canRolePerform('warehouse', ROLE_ACTIONS.SAVE_EVALUATION), false);
});

test('Production receives readiness results without procurement guidance or trial actions', () => {
  assert.equal(canRoleView('production', ROLE_VIEW_AREAS.TRIAL_RESULTS), true);
  assert.equal(canRoleView('production', ROLE_VIEW_AREAS.RISK_SUMMARY), true);
  assert.equal(canRoleView('production', ROLE_VIEW_AREAS.MATERIAL_REQUIREMENTS), true);
  assert.equal(canRoleView('production', ROLE_VIEW_AREAS.PURCHASE_GUIDANCE), false);
  assert.equal(canRolePerform('production', ROLE_ACTIONS.EDIT_TRIAL_INPUT), false);
  assert.equal(canRolePerform('production', ROLE_ACTIONS.RUN_TRIAL), false);
  assert.equal(canRolePerform('production', ROLE_ACTIONS.SAVE_EVALUATION), false);
});

test('Production trial-flow guidance excludes procurement through the shared view policy', () => {
  assert.equal(canRoleView('production', ROLE_VIEW_AREAS.PURCHASE_GUIDANCE), false);
  assert.match(appSource, /\[ROLE_VIEW_AREAS\.PURCHASE_GUIDANCE, '采购建议'\]/);
  assert.match(appSource, /\.filter\(\(\[area\]\) => canCurrentRoleView\(area\)\)/);
});

test('Purchasing evaluation guidance excludes customer inquiry source copy', () => {
  assert.equal(canRoleView('purchasing', ROLE_VIEW_AREAS.CUSTOMER_INQUIRY_NOTE), false);
  assert.match(appSource, /if \(!canCurrentRoleView\(ROLE_VIEW_AREAS\.CUSTOMER_INQUIRY_NOTE\)\) \{/);
  assert.match(appSource, /EVALUATION SUMMARY BOUNDARY/);
  assert.match(appSource, /当前角色只读取已保存评估记录中的产品、数量、日期、风险结论和关键物料摘要/);
});

test('auxiliary trial-flow guidance is synchronized after render using area permissions', () => {
  assert.match(appSource, /function applyRealDataTrialFlowAccess\(\)/);
  assert.match(appSource, /data-real-data-trial-page.*workflow-panel.*workflow-steps/);
  assert.match(appSource, /document\.querySelector\('#app'\)\.innerHTML = appShell\(renderers\[currentPage\]\(\)\);\n  applyRealDataTrialFlowAccess\(\);/);
});

test('role switching only updates role state and rerenders the existing page', () => {
  const handler = appSource.match(/document\.querySelector\('\[data-demo-role-switcher\]'\)\?\.addEventListener\('change',[\s\S]*?\n  \}\);/)?.[0] || '';
  assert.match(handler, /currentDemoRoleId = event\.target\.value;/);
  assert.match(handler, /render\(\);/);
  assert.doesNotMatch(handler, /realDataTrial(?:InputState|Preview)|temporaryTrialInputState|calculate|localStorage|navigate\(/);
});

test('all protected trial actions pass through a centralized permission guard', () => {
  for (const action of [
    'set-real-data-trial-source',
    'add-temp-trial-material',
    'remove-temp-trial-material',
    'fill-temp-trial-demo',
    'clear-temp-trial-data',
    'run-real-data-trial',
    'save-trial-evaluation-record',
    'toggle-saved-evaluation-summary',
    'clear-local-evaluation-records',
    'confirm-clear-local-evaluation-records',
  ]) {
    assert.match(appSource, new RegExp(`'${action}': ROLE_ACTIONS\\.`));
  }
  assert.match(appSource, /const requiredTrialPermission = TRIAL_UI_ACTION_PERMISSIONS\[action\];/);
  assert.match(appSource, /if \(requiredTrialPermission && !canCurrentRolePerform\(requiredTrialPermission\)\)/);
});
