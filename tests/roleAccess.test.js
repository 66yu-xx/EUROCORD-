import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialData } from '../src/data.js';
import { calculateMaterialRequirements } from '../src/mrp.js';
import {
  DEMO_ROLES,
  ROLE_ACTIONS,
  ROLE_VIEW_AREAS,
  canRolePerform,
  canRoleView,
  getRolePolicy,
  getSupportedRoles,
  isSupportedRole,
} from '../src/roleAccess.js';

const roleAccessSource = readFileSync(new URL('../src/roleAccess.js', import.meta.url), 'utf8');

test('role access policy exposes exactly five fixed demo roles', () => {
  assert.deepEqual(getSupportedRoles(), [
    { id: 'management', label: 'Management' },
    { id: 'sales', label: 'Sales' },
    { id: 'purchasing', label: 'Purchasing' },
    { id: 'warehouse', label: 'Warehouse' },
    { id: 'production', label: 'Production / Workshop' },
  ]);
  assert.deepEqual(getSupportedRoles(), DEMO_ROLES);
});

test('unknown roles receive no policy or access', () => {
  assert.equal(isSupportedRole('systemAdmin'), false);
  assert.equal(isSupportedRole('unknown'), false);
  assert.equal(isSupportedRole(null), false);
  assert.equal(getRolePolicy('unknown'), null);
  assert.equal(canRoleView('unknown', ROLE_VIEW_AREAS.TRIAL_RESULTS), false);
  assert.equal(canRolePerform('unknown', ROLE_ACTIONS.RUN_TRIAL), false);
});

test('sales retains the Phase 8 trial loop without bulk record cleanup', () => {
  assert.equal(canRoleView('sales', ROLE_VIEW_AREAS.TRIAL_INPUT), true);
  assert.equal(canRoleView('sales', ROLE_VIEW_AREAS.TRIAL_RESULTS), true);
  assert.equal(canRolePerform('sales', ROLE_ACTIONS.CHANGE_DATA_SOURCE), true);
  assert.equal(canRolePerform('sales', ROLE_ACTIONS.EDIT_TRIAL_INPUT), true);
  assert.equal(canRolePerform('sales', ROLE_ACTIONS.RUN_TRIAL), true);
  assert.equal(canRolePerform('sales', ROLE_ACTIONS.SAVE_EVALUATION), true);
  assert.equal(canRolePerform('sales', ROLE_ACTIONS.VIEW_SAVED_EVALUATION), true);
  assert.equal(canRolePerform('sales', ROLE_ACTIONS.CLEAR_SAVED_EVALUATIONS), false);
});

test('management can read core results but cannot operate the trial', () => {
  assert.equal(canRoleView('management', ROLE_VIEW_AREAS.RISK_SUMMARY), true);
  assert.equal(canRoleView('management', ROLE_VIEW_AREAS.ROLE_FOCUS), true);
  assert.equal(canRoleView('management', ROLE_VIEW_AREAS.EVALUATION_SUMMARY), true);
  assert.equal(canRolePerform('management', ROLE_ACTIONS.EDIT_TRIAL_INPUT), false);
  assert.equal(canRolePerform('management', ROLE_ACTIONS.RUN_TRIAL), false);
  assert.equal(canRolePerform('management', ROLE_ACTIONS.SAVE_EVALUATION), false);
  assert.equal(canRolePerform('management', ROLE_ACTIONS.CLEAR_SAVED_EVALUATIONS), false);
});

test('purchasing can read procurement information without trial or purchase execution', () => {
  assert.equal(canRoleView('purchasing', ROLE_VIEW_AREAS.MATERIAL_REQUIREMENTS), true);
  assert.equal(canRoleView('purchasing', ROLE_VIEW_AREAS.PURCHASE_GUIDANCE), true);
  assert.equal(canRoleView('purchasing', ROLE_VIEW_AREAS.RISK_SUMMARY), true);
  assert.equal(canRolePerform('purchasing', ROLE_ACTIONS.RUN_TRIAL), false);
  assert.equal(canRolePerform('purchasing', 'createPurchaseRequest'), false);
  assert.equal(canRolePerform('purchasing', 'createPurchaseOrder'), false);
});

test('warehouse can read inventory risk without editing inventory or running trials', () => {
  assert.equal(canRoleView('warehouse', ROLE_VIEW_AREAS.MATERIAL_REQUIREMENTS), true);
  assert.equal(canRoleView('warehouse', ROLE_VIEW_AREAS.WAREHOUSE_FOCUS), true);
  assert.equal(canRoleView('warehouse', ROLE_VIEW_AREAS.PURCHASE_GUIDANCE), false);
  assert.equal(canRolePerform('warehouse', 'editInventory'), false);
  assert.equal(canRolePerform('warehouse', ROLE_ACTIONS.RUN_TRIAL), false);
});

test('production can read readiness information without purchase guidance or trial actions', () => {
  assert.equal(canRoleView('production', ROLE_VIEW_AREAS.TRIAL_RESULTS), true);
  assert.equal(canRoleView('production', ROLE_VIEW_AREAS.RISK_SUMMARY), true);
  assert.equal(canRoleView('production', ROLE_VIEW_AREAS.MATERIAL_REQUIREMENTS), true);
  assert.equal(canRoleView('production', ROLE_VIEW_AREAS.PURCHASE_GUIDANCE), false);
  assert.equal(canRolePerform('production', ROLE_ACTIONS.RUN_TRIAL), false);
  assert.equal(canRolePerform('production', 'createProductionTask'), false);
});

test('fixed policies contain no formal business actions', () => {
  const forbiddenActions = [
    'confirmOrder',
    'convertToOrder',
    'reserveInventory',
    'deductInventory',
    'createPurchaseRequest',
    'createPurchaseOrder',
    'createProductionTask',
    'financeAction',
  ];

  for (const role of DEMO_ROLES) {
    const policy = getRolePolicy(role.id);
    for (const action of forbiddenActions) {
      assert.equal(policy.actions.includes(action), false);
      assert.equal(canRolePerform(role.id, action), false);
    }
  }
});

test('role access policy has no DOM, storage, data, or calculation dependency', () => {
  assert.doesNotMatch(roleAccessSource, /from ['"].*data\.js['"]/);
  assert.doesNotMatch(roleAccessSource, /from ['"].*mrp\.js['"]/);
  assert.doesNotMatch(roleAccessSource, /from ['"].*planning\//);
  assert.doesNotMatch(roleAccessSource, /\b(?:window|document|localStorage)\b/);
});

test('reading every role policy leaves MRP input and output unchanged', () => {
  const input = structuredClone(initialData);
  const inputSnapshot = structuredClone(input);
  const expected = calculateMaterialRequirements(input);

  for (const role of DEMO_ROLES) {
    getRolePolicy(role.id);
    canRoleView(role.id, ROLE_VIEW_AREAS.TRIAL_RESULTS);
    canRolePerform(role.id, ROLE_ACTIONS.RUN_TRIAL);
  }

  assert.deepEqual(input, inputSnapshot);
  assert.deepEqual(calculateMaterialRequirements(input), expected);
});
