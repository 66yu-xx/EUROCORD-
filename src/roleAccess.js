const freezeRole = (id, label) => Object.freeze({ id, label });

export const DEMO_ROLES = Object.freeze([
  freezeRole('management', 'Management'),
  freezeRole('sales', 'Sales'),
  freezeRole('purchasing', 'Purchasing'),
  freezeRole('warehouse', 'Warehouse'),
  freezeRole('production', 'Production / Workshop'),
]);

export const ROLE_VIEW_AREAS = Object.freeze({
  TRIAL_INPUT: 'trialInput',
  TRIAL_RESULTS: 'trialResults',
  RISK_SUMMARY: 'riskSummary',
  MATERIAL_REQUIREMENTS: 'materialRequirements',
  PURCHASE_GUIDANCE: 'purchaseGuidance',
  WAREHOUSE_FOCUS: 'warehouseFocus',
  ROLE_FOCUS: 'roleFocus',
  EVALUATION_SUMMARY: 'evaluationSummary',
  CUSTOMER_INQUIRY_NOTE: 'customerInquiryNote',
});

export const ROLE_ACTIONS = Object.freeze({
  CHANGE_DATA_SOURCE: 'changeDataSource',
  EDIT_TRIAL_INPUT: 'editTrialInput',
  RUN_TRIAL: 'runTrial',
  SAVE_EVALUATION: 'saveEvaluation',
  VIEW_SAVED_EVALUATION: 'viewSavedEvaluation',
  CLEAR_SAVED_EVALUATIONS: 'clearSavedEvaluations',
});

function createPolicy(views = [], actions = []) {
  return Object.freeze({
    views: Object.freeze([...views]),
    actions: Object.freeze([...actions]),
  });
}

const ROLE_POLICIES = Object.freeze({
  management: createPolicy([
    ROLE_VIEW_AREAS.TRIAL_INPUT,
    ROLE_VIEW_AREAS.TRIAL_RESULTS,
    ROLE_VIEW_AREAS.RISK_SUMMARY,
    ROLE_VIEW_AREAS.MATERIAL_REQUIREMENTS,
    ROLE_VIEW_AREAS.WAREHOUSE_FOCUS,
    ROLE_VIEW_AREAS.ROLE_FOCUS,
    ROLE_VIEW_AREAS.EVALUATION_SUMMARY,
    ROLE_VIEW_AREAS.CUSTOMER_INQUIRY_NOTE,
  ], [
    ROLE_ACTIONS.VIEW_SAVED_EVALUATION,
  ]),
  sales: createPolicy([
    ROLE_VIEW_AREAS.TRIAL_INPUT,
    ROLE_VIEW_AREAS.TRIAL_RESULTS,
    ROLE_VIEW_AREAS.RISK_SUMMARY,
    ROLE_VIEW_AREAS.MATERIAL_REQUIREMENTS,
    ROLE_VIEW_AREAS.PURCHASE_GUIDANCE,
    ROLE_VIEW_AREAS.WAREHOUSE_FOCUS,
    ROLE_VIEW_AREAS.ROLE_FOCUS,
    ROLE_VIEW_AREAS.EVALUATION_SUMMARY,
    ROLE_VIEW_AREAS.CUSTOMER_INQUIRY_NOTE,
  ], [
    ROLE_ACTIONS.CHANGE_DATA_SOURCE,
    ROLE_ACTIONS.EDIT_TRIAL_INPUT,
    ROLE_ACTIONS.RUN_TRIAL,
    ROLE_ACTIONS.SAVE_EVALUATION,
    ROLE_ACTIONS.VIEW_SAVED_EVALUATION,
  ]),
  purchasing: createPolicy([
    ROLE_VIEW_AREAS.TRIAL_RESULTS,
    ROLE_VIEW_AREAS.RISK_SUMMARY,
    ROLE_VIEW_AREAS.MATERIAL_REQUIREMENTS,
    ROLE_VIEW_AREAS.PURCHASE_GUIDANCE,
    ROLE_VIEW_AREAS.WAREHOUSE_FOCUS,
    ROLE_VIEW_AREAS.EVALUATION_SUMMARY,
  ], [
    ROLE_ACTIONS.VIEW_SAVED_EVALUATION,
  ]),
  warehouse: createPolicy([
    ROLE_VIEW_AREAS.TRIAL_RESULTS,
    ROLE_VIEW_AREAS.MATERIAL_REQUIREMENTS,
    ROLE_VIEW_AREAS.WAREHOUSE_FOCUS,
  ]),
  production: createPolicy([
    ROLE_VIEW_AREAS.TRIAL_RESULTS,
    ROLE_VIEW_AREAS.RISK_SUMMARY,
    ROLE_VIEW_AREAS.MATERIAL_REQUIREMENTS,
  ]),
});

export function getSupportedRoles() {
  return DEMO_ROLES;
}

export function isSupportedRole(roleId) {
  return typeof roleId === 'string' && Object.hasOwn(ROLE_POLICIES, roleId);
}

export function getRolePolicy(roleId) {
  return isSupportedRole(roleId) ? ROLE_POLICIES[roleId] : null;
}

export function canRoleView(roleId, area) {
  return getRolePolicy(roleId)?.views.includes(area) ?? false;
}

export function canRolePerform(roleId, action) {
  return getRolePolicy(roleId)?.actions.includes(action) ?? false;
}
