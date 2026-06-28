# AGENTS.md

## Project

This repository is the Lufuta Material Management System Lite project.

The project is a lightweight material, BOM, inventory, and delivery-risk system for early-stage factory order evaluation.

The project is being developed carefully in small phases. The long-term direction is to grow from read-only analysis and trial calculation into real business workflows. However, real business actions must be introduced step by step with clear state, responsibility, rollback, and audit boundaries.

The current business goal is not to build a fake demo forever. The goal is to build a real business system safely.

## Current Working Style

Work in small, controlled steps.

Do not expand scope beyond the current requested phase or step.

Do not enter the next phase or next step unless the user explicitly asks.

When the user asks to discuss boundaries, do not write code.

When the user asks to implement, make the smallest safe change that satisfies the current step.

Prefer preserving existing working behavior over broad refactoring.

If a task is UI-only, copy-only, explanation-only, or boundary-only, prefer changing only the UI layer.

If a task requires business logic changes, state that clearly before modifying core logic.

## AGENTS.md Maintenance Rule

Do not modify `AGENTS.md` unless the user explicitly asks to update project agent instructions.

This file is a long-term project working rule file, not a daily progress log.

Do not automatically update this file after every phase or step.

If a new long-term project rule is discovered, update this file only as a separate task or separate commit when the user asks.

## Current Branch

The active project branch is:

- `lufuta-material-system-lite`

Before starting any task, verify:

- current branch
- latest commit
- `git status`
- whether the working tree is clean
- whether the local branch is ahead or behind remote

Do not assume the repository state. Verify it.

## Phase Discipline

Each phase and step is intentional.

Do not automatically move to the next step.

Do not combine unrelated steps in one commit.

If a small safety fix is needed before a main step, make it explicit as a guard fix or pre-step.

Do not silently bundle guard fixes, UI improvements, data changes, and business feature changes into one commit.

If the user says "do not enter the next step", then do not enter it.

## Business Direction

The system is moving toward real business use.

Current and future business domains include:

- material master data
- product and BOM management
- inventory ledger
- order feasibility evaluation
- delivery risk analysis
- procurement risk analysis
- warehouse confirmation
- future order evaluation records
- future formal orders
- future purchase demands
- future purchase orders
- future cost and finance expansion

However, real business workflows must be introduced in the correct order.

Do not jump directly from trial calculation to formal execution.

Recommended long-term order:

1. one-time trial calculation
2. decision summary and role explanation
3. temporary input trial calculation
4. improved temporary input experience
5. order evaluation record
6. formal order state
7. inventory reservation / occupation
8. purchase demand
9. purchase order
10. warehouse operations
11. cost and finance expansion

## Important Business Boundaries

Unless the current task explicitly says otherwise, do not add or change features that:

- save formal customer orders
- save order evaluation records
- save trial calculation results
- import BOM data
- import inventory data
- import price data
- occupy inventory
- reserve inventory
- lock inventory
- deduct inventory
- modify inventory
- generate purchase orders
- generate purchase demands
- calculate amounts
- enter finance workflows
- enter cost accounting
- add approval workflows
- add supplier comparison workflows

Trial calculation features may show suggestions, warnings, summaries, and role-specific explanations, but they must not imply that the system has executed a real business action.

Allowed wording includes:

- suggest confirming
- suggest paying attention
- need to confirm procurement lead time
- need warehouse confirmation
- may affect delivery
- for trial calculation reference only

Avoid wording such as:

- purchase demand has been generated
- purchase order has been created
- inventory has been occupied
- inventory has been reserved
- inventory has been locked
- inventory has been deducted
- entered procurement workflow
- saved as formal order
- saved as formal master data

## Current Trial Calculation Boundaries

The real data trial calculation page currently supports two modes:

1. using existing system product / BOM / inventory / procurement lead-time data
2. manually entering temporary trial data

Temporary trial input data is for one-time testing only.

Temporary input data must not be saved as:

- formal product
- formal material
- formal BOM
- formal inventory
- formal order
- order evaluation record
- purchase demand
- purchase order
- finance record
- cost record

Temporary and sample data may fill current page inputs only. They must not become formal system data.

## Current Phase 8 Baseline

Phase 8 has built the real data trial calculation path step by step:

- boundary documentation for real data trial calculation
- real data trial calculation page entry
- future trial result structure
- trial conditions and data source skeleton
- temporary trial data versus formal base data boundary
- one-time calculation using existing product / BOM / inventory / procurement lead time
- decision summary for trial results
- guard for trial date inputs
- manual temporary trial input mode
- improved temporary trial input experience
- cleanup markers for future production cleanup

The latest known pushed baseline before this file is:

- `0eb6d6a improve temporary trial input experience`

If the repository state differs, report it before continuing.

## Core Files

Be careful with these files:

- `src/mrp.js`: core MRP and risk calculation logic
- `src/data.js`: demo, seed, and base data
- `tests/`: regression tests

Do not modify core MRP or risk calculation logic unless the task explicitly requires it.

For UI-only, copy-only, explanation-only, boundary-only, or trial input experience steps, prefer modifying only:

- `src/app.js`

If modifying more than `src/app.js`, explain why.

## Validation Commands

Before reporting a completed implementation, run:

```bash
node --test tests/*.test.js
git diff --check
git status
```

If the task changes visible UI or mobile layout, also check relevant pages at narrow widths such as:

* 375px
* 390px

There should be no page-level horizontal overflow.

Tables may scroll inside their own containers when necessary.

## Date Input Rules

For current trial calculation inputs:

* use native `input type="date"` when possible
* keep values in `YYYY-MM-DD`
* validate dates again in JavaScript when trial calculation is triggered
* dates must not be empty
* dates must be real calendar dates
* year should be within 2000 to 2100 for current trial input anti-mistake checks
* required delivery date must not be earlier than analysis date

This date range is only an anti-mistake rule for current trial input pages.

Do not reuse this as a global historical query limit.

Future history queries, old orders, inventory ledgers, procurement records, and finance records may need different date rules.

## Mobile UI Rules

Keep mobile usability in mind.

When adding cards, summaries, inputs, tables, buttons, or long text:

* avoid fixed large widths
* allow text wrapping
* allow buttons to wrap
* avoid page-level horizontal overflow
* keep table horizontal scrolling inside the table container
* check 375px and 390px when relevant

## Cleanup Markers for Future Production Version

From Phase 8-Step 9 onward, newly added demo helpers, placeholders, boundary copy, and transition copy should be clearly marked or centralized so they can be cleaned up later.

Use these markers where appropriate:

* `DEMO_ONLY`: sample data, demo helper buttons, training helpers
* `BOUNDARY_NOTICE`: stage boundary notices such as not saving, not affecting inventory, not generating purchase orders
* `PLACEHOLDER_ONLY`: placeholder pages or placeholder functions
* `TRANSITION_COPY`: long explanatory copy that may be shortened in the production version

Do not mix demo-only content directly into core business logic.

Sample data should only fill current page inputs. It must not become formal system data.

Boundary notices may be shortened or removed later when real workflows are implemented.

Placeholder features should later be replaced by real functions or removed.

Transition copy should be easy to find and shorten before production.

## UI and Copy Rules

Keep Chinese UI text clear and business-oriented.

Avoid exaggerated system claims.

Do not make the UI imply that real business actions have happened unless those actions are actually implemented.

For current trial and evaluation features, use cautious language:

* 试算
* 建议确认
* 建议关注
* 需确认
* 仅供参考
* 不影响库存
* 不生成采购单
* 不保存为正式资料

Avoid misleading language:

* 已生成采购单
* 已占用库存
* 已锁定库存
* 已扣减库存
* 已保存为正式订单
* 已进入财务

## Commit and Push Rules

Do not commit unless the user explicitly asks for commit.

Do not push unless the user explicitly asks for push.

Commit and push should usually be separate actions.

Before commit, confirm:

* modified files
* whether only expected files changed
* test results
* `git diff --check`
* `git status`
* whether the change stayed within the requested scope
* whether the next step was not entered

After commit, report:

* commit hash
* latest `git log --oneline -1`
* `git status`
* ahead / behind status
* test result
* confirmation that no push was performed
* confirmation that no next step was entered

After push, report:

* push success
* `git status`
* ahead / behind status
* latest `git log --oneline -1`
* confirmation that no files were modified
* confirmation that no new commit was created
* confirmation that no next step was entered

## Reporting Style

When reporting back to the user, include:

* changed files
* whether only expected files changed
* whether core logic was changed
* whether data model was changed
* whether tests passed
* whether `git diff --check` passed
* whether UI and mobile checks passed when relevant
* whether business boundaries were preserved
* whether commit or push was performed
* whether the next step was entered

Be explicit if something was not checked or could not be verified.

## What Not To Do Automatically

Do not automatically:

* refactor large parts of the app
* rename business concepts
* change data models
* change core calculation functions
* add third-party libraries
* add backend assumptions
* add persistence
* add database behavior
* add import/export behavior
* add Excel or CSV parsing
* add finance or cost features
* add purchase workflows
* add inventory reservation or deduction
* enter the next phase or step
* modify AGENTS.md
* treat AGENTS.md as a daily progress log

If any of these are necessary, stop and report why before proceeding.
