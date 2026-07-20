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

test('Step 3A rollout is limited to Sales and Management', () => {
  assert.match(appSource, /const TRIAL_ACCESS_POLICY_ROLE_IDS = Object\.freeze\(\['sales', 'management'\]\);/);
  assert.match(appSource, /isTrialAccessPolicyActive\(\) \? canRoleView\(currentDemoRoleId, area\) : isSupportedRole\(currentDemoRoleId\)/);
  assert.match(appSource, /isTrialAccessPolicyActive\(\) \? canRolePerform\(currentDemoRoleId, action\) : isSupportedRole\(currentDemoRoleId\)/);
});

test('Management receives explicit read-only guidance with and without results', () => {
  assert.match(appSource, /data-trial-role-access-notice/);
  assert.match(appSource, /当前角色为 Management · 只读查看/);
  assert.match(appSource, /请先由可操作角色完成试算后，再查看结果/);
  assert.match(appSource, /当前试算输入和结果已保留/);
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
