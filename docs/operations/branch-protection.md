# Branch Protection Runbook

**Owner:** devops  
**Last updated:** 2026-04-27  
**Applies to:** `main` branch of `jasgr-software/tax-portal`

---

## 1. Purpose

This runbook records the decision to enable branch protection on `main` and provides the exact operator commands for applying, updating, and disabling it. Branch protection is **GitHub repository configuration** — it cannot live in the repo itself, so this document is the durable operational record.

Branch protection is predicate (b) of the three-part graduation requirement for promoting PR-merge to autonomous. See `.claude/agent-stack.md` § Autonomy Ceiling item 3:

> "branch protection is configured on `main` with the CI jobs marked as required status checks (verifiable via `gh api repos/<owner>/<repo>/branches/main/protection/required_status_checks`)"

The CI workflow that exposes the check-run names is defined in TASK-LOE-001 (`.github/workflows/ci.yml`). The independent gate-completion backstop is `scripts/validate-gates.sh` (TASK-LOE-003).

> **Do not apply branch protection by running these commands in a PR or as part of this task.** This file is documentation. The user applies Stage 1 after the `chore/lights-out-enablement` branch merges to `main`.

---

## 2. Decision Summary

Decision reference: decision #1A from `docs/tasks/PROGRESS.md` `## Current initiative` planning entry.

| Setting | Value | Rationale |
|---|---|---|
| `required_status_checks.strict` | `true` | Branch must be up to date before merge — prevents a green PR from going stale |
| `required_status_checks.contexts` | Stage-dependent (see §§ 3–4) | Which CI jobs are required to be green |
| `enforce_admins` | `true` | No admin bypass — the accountant/owner account is bound by the same rules |
| `required_pull_request_reviews` | `null` | Solo developer cannot approve their own PR (GitHub mechanically blocks self-approval). Required CI is the substantive gate; quad review via workflow rules covers second-pair-of-eyes for `agents/*.md` and `.claude/agent-stack.md` PRs |
| `required_conversation_resolution` | `true` | All review threads must be resolved before merge |
| `allow_force_pushes` | `false` | No force-push to `main` under any circumstances |
| `allow_deletions` | `false` | The `main` branch cannot be deleted |
| `required_linear_history` | `false` | Squash merge produces linear history naturally; hard-enforcing this would block merge commits needed for hotfix mini-epics per `.claude/agent-phases.md` § Post-Close Protocol |
| `block_creations` | `false` | New branches must remain creatable from `main` |

---

## 3. Stage 1 — Apply Now (after `chore/lights-out-enablement` merges)

**Required checks:** `lint-and-typecheck` and `security-scan` only.

These are the two jobs in `ci.yml` that are required day-one per TASK-LOE-001. The `test-portal` and `test-admin` jobs have `continue-on-error: true` and are advisory until Epic 001 scaffolds `apps/portal` and `apps/admin` with real tests.

Run this command after the branch merges:

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
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "block_creations": false
}
JSON
```

After applying, verify with the command in § 6.

---

## 4. Stage 2 — Promote After Epic 001 Close-Prep

**Required checks:** all four jobs — `lint-and-typecheck`, `test-portal`, `test-admin`, and `security-scan`.

**Trigger condition:** `apps/portal` and `apps/admin` exist with real tests passing in CI, **and** Epic 001's close-prep task removes `continue-on-error: true` from the `test-portal` and `test-admin` jobs in `ci.yml`. Until both conditions hold, `test-portal` and `test-admin` must not be added to the required contexts — adding them while they have `continue-on-error: true` would not enforce them.

Run this command after Epic 001 close-prep promotes the test jobs to required:

```bash
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/jasgr-software/tax-portal/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint-and-typecheck", "test-portal", "test-admin", "security-scan"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "block_creations": false
}
JSON
```

After applying, verify with the command in § 6.

---

## 5. Disable / Rollback

### When to use

Use the disable command only when branch protection is blocking a legitimate hotfix flow before the item-3 PR-merge promotion (`.claude/agent-stack.md` § Autonomy Ceiling item 3) lands. This is rare — the normal path is to open a PR from a hotfix branch and let CI gate it. Disable only when CI itself is broken and the fix cannot land any other way.

**Required before disabling:** document the reason in `docs/tasks/PROGRESS.md` (append a session entry with the specific blocker). Re-enable branch protection immediately after the hotfix merges.

```bash
gh api \
  --method DELETE \
  -H "Accept: application/vnd.github+json" \
  /repos/jasgr-software/tax-portal/branches/main/protection
```

A successful DELETE returns HTTP 204 with no body. Verify protection is removed:

```bash
gh api /repos/jasgr-software/tax-portal/branches/main/protection 2>&1
# Expected: 404 Branch not protected
```

Re-enable by re-running the Stage 1 or Stage 2 snippet (whichever was active before disable).

---

## 6. Verification

After applying Stage 1 or Stage 2, confirm the rules took effect:

```bash
gh api repos/jasgr-software/tax-portal/branches/main/protection
```

In the JSON response, confirm:

- `required_status_checks.strict` is `true`
- `required_status_checks.contexts` contains exactly the expected check names (Stage 1: two entries; Stage 2: four entries)
- `enforce_admins.enabled` is `true`
- `required_pull_request_reviews` is `null` or absent
- `allow_force_pushes.enabled` is `false`
- `allow_deletions.enabled` is `false`

To confirm force-push prevention (without executing a force-push): per GitHub documentation, `allow_force_pushes: false` means any push that would rewrite history on the protected branch is rejected with `remote: error: GH006: Protected branch update failed`. A force-push attempt (`git push --force origin main`) would return this error from GitHub's pre-receive hook.

---

## 7. Cross-References

- `.claude/agent-stack.md` § Autonomy Ceiling item 3 — the graduation predicate that cites branch protection as predicate (b); includes the full three-predicate list for PR-merge auto-on-green promotion
- `docs/tasks/done/TASK-LOE-001-ci-workflow.md` — the task that landed `.github/workflows/ci.yml` with the job names this runbook references
- `docs/tasks/done/TASK-LOE-003-validate-gates-script.md` — the task that landed `scripts/validate-gates.sh`, the independent programmatic backstop (predicate (c) in item 3)
- `docs/tasks/PROGRESS.md` § Current initiative — the planning entry containing decision #1A that this runbook implements
