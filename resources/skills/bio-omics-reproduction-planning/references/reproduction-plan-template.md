# Reproduction Plan Template

Use this reference when drafting or validating `planning/reproduction_plan.md`.
The plan is a planning artifact, not evidence that reproduction succeeded.
The validated reported-method parameters live in `planning/method_parameter_contract.json`.
The target graph and scope decisions live in `planning/paper_reproduction_map.json`; read `paper-reproduction-map-schema.md` before drafting this plan.

## Required Header

```markdown
# Omics Reproduction Plan

- Case ID:
- Objective:
- Paper/source:
- Modality:
- Scope type: full article | figure subset | panel subset | method unit | demo case
- Planner:
- Date:
- Artifact namespace:
- PaperReproductionMapReceipt:
- ReproductionScopeReceipt:
```

## 1. Objective and Scope

State the user objective in one paragraph.
List requested figures, tables, panels, claims, or demo outputs.
State what is explicitly out of scope.
Separate full article reproduction from demo reproduction.
Every requested or paper-relevant target must appear in the paper map and have an explicit scope decision. Do not silently omit a panel because its data or method is unavailable.

## 2. Source Summary

Include stable pointers for:

- paper PDF or citation
- supplement files
- methods text
- data availability statement
- code availability statement
- accessions and repository URLs
- local source paths

Use source pointers, hashes, or artifact IDs when available.
Do not treat a source pointer as proof that a result is reproducible.

## 3. Availability Summary

Summarize data, code, and reference resources with statuses:

- `ready`
- `partial_ready`
- `conditional_continue`
- `planned_only`
- `blocked_for_localization`
- `blocked_for_execution`
- `unresolved`

Give one reason per non-ready item.
Point to `planning/source_audit.json` for detailed fields.

## 4. Reproducible Scope

Use a table:

| Target ID | Item      | Cohort IDs | Reproduction mode | Scope status | Downgrade or block reason | Next route |
| --------- | --------- | ---------- | ----------------- | ------------ | ------------------------- | ---------- |
| panel-1a  | Figure 1A | cohort-1   | exact             | conditional  | raw counts unresolved     | bio_source |

Allowed item types:

- claim
- figure
- panel
- table
- method unit
- demo output

Use only `exact`, `analogous`, or `scoped_reimplementation` for reproduction mode. Use `excluded_by_user` only with a recorded `userDecisionId`; missing inputs are blocks, not exclusions.

## 5. Execution Modules

Use one subsection per module.

```markdown
### Module M01: <short name>

- Objective:
- Target IDs:
- Cohort IDs:
- Reproduction mode:
- Status:
- Inputs:
- Output contract:
- EnvironmentRef candidates:
- Skill route:
- MCP route:
- Capability gaps:
- Required approvals:
- Review criteria:
```

Modules should be small enough that a later runner can validate logs, outputs, and warnings independently.

## 6. Expected Outputs

Group outputs by type:

- tables
- figures
- objects
- reports
- logs
- review files

For each output, state whether it is required, optional, or demo-only.
Avoid promising exact visual matches unless the data, code, parameters, and seed are available.

## 7. Environment and Route

List candidate `environmentRef` values and why they are candidates.
Route environment uncertainty to `bio-environment-routing` or `bio_runtime`.
Route missing/custom environment requirements to `bio-environment-manager` or
`bio_environment_manager`.
Route data uncertainty to `bio-data-resolution` or `bio_source`.
Route scRNA-seq module execution to `bio-scrna-reproduction` after this plan.
Route approved script drafting to `bio-analysis-script-authoring` after module
scope, inputs, outputs, and environmentRef candidates are bounded.

## 8. Execution Boundary

State:

- what may enter script or runner implementation now
- what remains plan-only
- what requires user approval
- what requires credentials or controlled-access authorization
- what requires new environment support
- what requires downstream skill implementation

## 9. Warnings and Open Questions

List unresolved issues in priority order.
Each warning should name the affected module or claim.
Do not hide missing source, missing metadata, licensing uncertainty, or unsupported analysis families.
Reconcile this section against every blocked or unresolved map target so no exclusion is implicit.

## 10. Artifact Registration

Record that the plan, source audit, localized files, warnings, and user decisions must be registered through `science_artifact`.
Later execution artifacts must be registered separately.
