# TASK-LOE-002: Branch protection runbook

**Epic**: chore/lights-out-enablement
**Status**: done
**Assigned to**: devops
**Updated-by**: devops
**Depends on**: TASK-LOE-001 (the runbook lists job names that must exist in `ci.yml` first)
**E2e-required**: no
**Started-at**: 2026-04-27T10:18:23Z
**Completed-at**: 2026-04-27T12:00:00Z
**Complexity-estimate**: 2
**Complexity-actual**: 2
**Affected flows:** none (justification: chore touches operations docs, not user-facing behavior)
**Affected requirements:** none (justification: chore touches operations docs, not SRS requirements)
**Introduces-gate:** no
**Relevant ADRs:** none

---

## Quality Gates

- [x] **Work Log complete** — every status change has breadcrumbs (what done · what next · blockers)
- [N/A] **Submission gate** — N/A (docs-only task; markdown formatting only)
- [N/A] **Targeted e2e** — N/A (docs-only)
- [x] **Security review** — `--method PUT` confirmed; `enforce_admins: true` (boolean, not string); `allow_force_pushes: false`; `allow_deletions: false`; `required_conversation_resolution: true`; no secrets in the runbook
- [x] **SDET Review** — approved

## SDET Review focus areas

- The runbook must mirror decision #1A from PROGRESS.md `## Current initiative` planning entry exactly: `enforce_admins=true`, `required_pull_request_reviews=null`, `required_conversation_resolution=true`, `allow_force_pushes=false`, `allow_deletions=false`, `required_status_checks.strict=true`.
- The runbook must clearly state the **two-stage rollout**:
  - **Stage 1 (now, after this chore merges):** branch protection enabled with required checks = `lint-and-typecheck`, `security-scan` only (the two jobs from TASK-LOE-001 that are required day-one).
  - **Stage 2 (after Epic 001 close-prep promotes `test-portal` + `test-admin` from advisory to required):** required checks list expands to all 4.
- The runbook must include both **enable** and **disable/rollback** procedures (in case branch protection blocks a legitimate hotfix flow before item-3 PR-merge promotion lands).
- The runbook must cross-link to `.claude/agent-stack.md` § Autonomy Ceiling item 3 (graduation predicate) so the relationship between branch protection and the promotion path is explicit.

## Context

`.claude/agent-stack.md` § Autonomy Ceiling item 3 lists branch protection on `main` as predicate (b) for promoting PR-merge auto-on-green. Branch protection is **GitHub repository configuration that cannot live in the repo**, but the procedure to apply it can. Per decision #1A from PROGRESS.md `## Current initiative` planning entry, the user wants required CI status checks (no required PR approvals — solo dev) with `enforce_admins=true` (no admin bypass).

This runbook is the operational record of that decision so it survives session ends and re-applications.

## Files to Create or Modify

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `docs/operations/branch-protection.md` | Create | devops |

## Tests to Write First

There are no automated tests for a runbook. Verification is via:

- [ ] After landing this PR (and TASK-LOE-001), follow the runbook end-to-end against the actual repo to enable Stage 1 branch protection. Capture `gh api repos/jasgr-software/tax-portal/branches/main/protection` output **after** enable; paste the abridged JSON in the Work Log to prove the rules took effect.
- [ ] Verify a force-push to main fails: `git push --force origin main` (do not actually do this — describe the expected failure mode in the runbook from `gh` documentation; live verification of force-push prevention is risky and not required for runbook acceptance).
- [ ] Verify the disable/rollback snippet round-trips (apply, disable, re-apply — capture `gh api` output for each).

## Implementation Notes

### Runbook structure

The file should have these sections:

1. **Purpose** — one paragraph linking to `.claude/agent-stack.md` § Autonomy Ceiling item 3 and decision #1A from the planning PROGRESS.md entry.
2. **Decision summary** — the locked configuration: required checks, no required PR approvals, `enforce_admins=true`, etc.
3. **Stage 1 — apply now** (after this chore merges). The `gh api ... --method PUT` snippet with required checks = `["lint-and-typecheck", "security-scan"]` only.
4. **Stage 2 — promote after Epic 001 close-prep**. The same snippet with required checks = `["lint-and-typecheck", "test-portal", "test-admin", "security-scan"]`. Trigger condition: `apps/portal` and `apps/admin` exist with real tests, and Epic 001's close-prep removes `continue-on-error` from the two test jobs.
5. **Disable / rollback** — `gh api ... --method DELETE` snippet, with notes on when to use it (legitimate hotfix flow before item-3 PR-merge promotion lands; rare, document the reason in PROGRESS.md before disabling).
6. **Verification** — `gh api repos/<owner>/<repo>/branches/main/protection` and what to look for in the JSON.
7. **Cross-references** — `.claude/agent-stack.md` § Autonomy Ceiling item 3, TASK-LOE-001 (the workflow that exposes the job names), TASK-LOE-003 (the validate-gates.sh backstop).

### `gh api` snippet shape

Use a HEREDOC (per `.claude/agent-stack.md` § Tool Hygiene — Write tool beats heredoc rule **does not apply** because this lives inside a markdown runbook as a code block, not as a file the runbook itself writes; the heredoc is shown to the human operator running the snippet):

```bash
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/jasgr-software/tax-portal/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint-and-typecheck", "security-scan"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "block_creations": false
}
JSON
```

(Note: `required_linear_history: false` because squash merge produces linear history naturally without enforcing it — leaving the door open for merge commits if a hotfix mini-epic per `.claude/agent-phases.md` § Post-Close Protocol needs one. `block_creations: false` because we still allow new branches.)

### Why no required PR approvals

Per decision #1A: solo dev cannot approve own PR (GitHub mechanically blocks). Required CI is the substantive gate. Quad review by rule (`.claude/agent-stack.md` § Main Session Rules) covers second-pair-of-eyes for workflow-file PRs without GitHub's approval mechanism.

The item-3 promotion PR (separate, future) will revisit this for workflow-file PRs specifically — it may add a `LGTM`-comment requirement before auto-merge fires for `agents/*.md` or `.claude/agent-stack.md` PRs. That's an item-3 PR concern, not this runbook's.

## Definition of Done

- [ ] `docs/operations/branch-protection.md` exists with all 7 sections in § Implementation Notes
- [ ] Stage 1 + Stage 2 `gh api` snippets verified by syntax review (do **not** actually apply branch protection in this task — that is a separate operator action by the user once this PR merges; the runbook is what enables them to do so)
- [ ] Disable / rollback snippet syntax-verified
- [ ] Cross-references to `.claude/agent-stack.md` § Autonomy Ceiling item 3, TASK-LOE-001, and TASK-LOE-003 are present and accurate
- [ ] Runbook explicitly says **do not apply branch protection in this PR** — it is documentation; the user applies Stage 1 after merge

---

## Work Log

<!-- Format: - YYYY-MM-DD [role] What was done | What's next | Blockers -->
- 2026-04-27 [devops] Starting implementation — materializing branch-protection runbook from spec outline; verified CI job names (lint-and-typecheck, security-scan, test-portal, test-admin all confirmed against ci.yml with matching name: fields); confirmed repo path jasgr-software/tax-portal | What's next: write docs/operations/branch-protection.md, then status → review | Blockers: none
- 2026-04-27 [devops] Runbook written at docs/operations/branch-protection.md; gh api payloads syntax-verified (balanced braces, boolean field types, no trailing commas, Stage 1 and Stage 2 snippets identical except contexts array); CI job names confirmed against ci.yml (name: fields match job keys exactly); repo path jasgr-software/tax-portal confirmed via gh repo view; Autonomy Ceiling item 3 predicate (b) wording verified and cited; docs/operations/ was empty so no existing runbook format to match — ADR tone used instead | What's next: SDET review | Blockers: none
- 2026-04-27 [sdet] Review complete — ACCEPT. All focus areas verified: Decision #1A fields exact match (all booleans, null not string); Stage 1/Stage 2 structurally identical except contexts; CI job names match ci.yml name: fields; Autonomy Ceiling item 3 predicate (b) quoted verbatim; enable + disable procedures present; rollback rationale concise; "do not apply" blockquote prominent; JSON syntax clean; security review confirmed. Status → done.

## Attempt Log

**Attempt count**: 0

## SDET Review

**Decision**: approved
**Notes**: Verified all SDET Review focus areas and ancillary checks. Decision #1A fields confirmed in both Stage 1 and Stage 2 payloads: `enforce_admins: true` (bool), `required_pull_request_reviews: null` (JSON null), `required_conversation_resolution: true` (bool), `allow_force_pushes: false` (bool), `allow_deletions: false` (bool), `required_status_checks.strict: true` (bool). Stage 1 and Stage 2 payloads are structurally identical except the `contexts` array (Stage 1: two entries; Stage 2: four entries). CI job names in the runbook match the `name:` fields in ci.yml exactly. Autonomy Ceiling item 3 predicate (b) wording quoted verbatim from agent-stack.md — cross-link accurate. Enable + disable procedures both present; rollback rationale concise and correct. `required_linear_history: false` and `block_creations: false` rationale present as table rows, not walls of text. "Do not apply" blockquote in § 1 is prominent and unambiguous. JSON payload syntax clean: balanced braces, boolean field types, JSON null (not string), no trailing commas, HEREDOC `<<'JSON'` prevents variable expansion. Repo path `jasgr-software/tax-portal` consistent throughout. Security review confirms `--method PUT` correct for the GitHub branch protection PUT endpoint; `--method DELETE` correct for disable. No secrets in the runbook. Operations-doc consistency rule does not apply (no Dockerfile/compose/secrets/env/ingress/DB-principal changes). Cross-surface vacuously satisfied (apps/ not yet scaffolded).
