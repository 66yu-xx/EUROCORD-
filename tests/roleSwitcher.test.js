import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getRolePolicy, getSupportedRoles, isSupportedRole } from '../src/roleAccess.js';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('demo role state defaults to Sales for every fresh application load', () => {
  assert.match(appSource, /const DEFAULT_DEMO_ROLE_ID = 'sales';/);
  assert.match(appSource, /let currentDemoRoleId = DEFAULT_DEMO_ROLE_ID;/);
});

test('role switcher uses all five shared role definitions', () => {
  assert.deepEqual(getSupportedRoles().map((role) => role.id), [
    'management',
    'sales',
    'purchasing',
    'warehouse',
    'production',
  ]);
  assert.match(appSource, /getSupportedRoles\(\)\.map\(\(role\) =>/);
  assert.match(appSource, /data-demo-role-switcher/);
});

test('unknown roles cannot replace the current demo role', () => {
  assert.equal(isSupportedRole('unknown'), false);
  assert.match(appSource, /if \(!isSupportedRole\(event\.target\.value\)\) \{/);
  assert.match(appSource, /event\.target\.value = currentDemoRoleId;/);
});

test('role switching does not mutate the frozen access policies', () => {
  const policiesBefore = getSupportedRoles().map((role) => getRolePolicy(role.id));

  for (const policy of policiesBefore) {
    assert.equal(Object.isFrozen(policy), true);
    assert.equal(Object.isFrozen(policy.views), true);
    assert.equal(Object.isFrozen(policy.actions), true);
  }

  assert.doesNotMatch(appSource, /getRolePolicy\([^)]*\)\.(?:views|actions)\.(?:push|splice|pop|shift|unshift)/);
});

test('demo role state is memory-only and resets on refresh', () => {
  assert.doesNotMatch(appSource, /(?:localStorage|sessionStorage)\.(?:getItem|setItem)\([^)]*(?:demoRole|currentRole|roleId)/i);
  assert.doesNotMatch(appSource, /URLSearchParams|data-demo-role-switcher[^\n]*(?:localStorage|sessionStorage)/);
});

test('role switcher adds no login backend or role filtering', () => {
  assert.match(appSource, /演示视图 · 非登录身份/);
  assert.doesNotMatch(appSource, /import \{[^}]*canRole(?:View|Perform)[^}]*\} from '\.\/roleAccess\.js'/);
  assert.doesNotMatch(appSource, /data-demo-role-switcher[^\n]*(?:fetch\(|XMLHttpRequest|WebSocket)/);
});
