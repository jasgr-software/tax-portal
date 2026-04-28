# Model Behavior Notes

> **Status: seeded (2026-04-28).** Initial four entries seeded from the chore PR #8 quad review via the Lens B mechanism (`.claude/agent-stack.md` § Main Session Rules). Each entry reflects a failure mode originally observed in the source project (journey-for-jasmine) for which a mitigation rule now ships in this project's `.claude/agent-stack.md` (introduced via PR #5 / PR #8, 2026-04-26 / 2026-04-27). The chore is not a feature epic; none of the four mitigations has yet been stress-tested in this project's feature work. Entries are expected to be revised, retired, or expanded as Epic 001 and subsequent feature epics either confirm recurrence or demonstrate the mitigation has retired the failure mode.

## Purpose

This file is the reference for **Lens B of quad review** — the model-behavior lens. Quad reviewers (SA, RA, SDET, Overwatch) consult this file when evaluating workflow-file changes to decide whether any rule being modified is load-bearing against a known failure mode of the primary model (currently Claude Opus / Sonnet as configured per-role in `CLAUDE.md`'s Agent Team table).

A rule is **load-bearing** against a model-behavior failure mode when: removing or weakening the rule would allow the model to re-commit a failure that the rule was originally introduced to prevent, and there is no replacement mitigation in the same change.

## What to record here

Each entry describes one observed failure mode, with enough detail that a future reviewer can recognize it and cite it. Recommended shape:

### `<short-slug>` — <one-line failure mode>

- **Observed when:** the context in which the failure was seen (which agent role, which phase, which tool).
- **Symptom:** what the model did that was wrong.
- **Root cause (hypothesis):** why the model behaved that way — prompt structure, tool schema, context loading, pattern-matching from training, etc.
- **Mitigation currently in place:** the specific rule (file + section) that prevents recurrence, or `none yet`.
- **Counterfactual:** what would regress if the mitigation were removed.
- **First observed:** date.
- **Last cited:** date (updated by reviewers who cite this entry in Lens B).

## Maintenance

- **Adding entries.** Any agent may propose an entry by editing this file in a workflow-file PR (subject to the quad review rule). Entries should come from observed failures, not speculation.
- **Retiring entries.** If a model upgrade or prompt change demonstrably eliminates a failure mode, the entry is moved to the `## Retired` section at the bottom with the date and reason. Retirement does not require re-running the original failure — credible argument from the model upgrade's release notes or from absence of the failure across N consecutive epics is sufficient.
- **Cross-reference with rule edits.** When a workflow rule is added, removed, or materially changed, the PR description should cite the entry here that the rule is (or was) load-bearing against — or note "no known entry" to explicitly surface the absence.

## Current entries

### `stuck-loop-context-burn` — model re-attempts a rejected approach indefinitely; context burns silently

- **Observed when:** Developer agents during Dispatch phase, SDET during Validate, any agent running a gate that fails. Pattern: 3+ consecutive attempts at the same gate with the same failure mode, no learning between attempts.
- **Symptom:** Model retries the same approach to a failing gate (test, lint, build, type-check) without changing strategy. Each retry consumes context. Model exhibits no awareness it is stuck — no "I should ask for help" signal.
- **Root cause (hypothesis):** Strong prior toward "try again" / "fix and rerun." The model's planning structure assumes incremental progress between retries, but when the failure is structural (wrong assumption, missing dependency, ambiguous spec), retries don't make progress. Context window pressure compounds because each retry adds tool output without removing prior failed attempts.
- **Mitigation currently in place:** `.claude/agent-stack.md` § Stuck-Loop Killswitch — 3 consecutive identical-failure-mode attempts → halt, create BUG file, set task status `needs-user-direction`, fire `PushNotification`.
- **Counterfactual:** Without the killswitch, agents burn through context on a stuck task until they hit the context limit or are manually interrupted. The user would need to manually monitor every agent invocation to catch loops — defeating lights-out operation.
- **First observed:** Source project (journey-for-jasmine), pre-port. Mitigation rule introduced in this project via PR #8 (2026-04-27); not yet stress-tested in feature work on this project.
- **Last cited:** 2026-04-28 (chore PR #8 quad review — flagged load-bearing by Overwatch and SDET).

### `silent-stuck-no-notification` — model halts internally with no out-of-band signal; halt invisible until manual inspection

- **Observed when:** When the killswitch (above) fires, when § Docker Pre-Flight escalates, or when a credential-pattern hit is detected on `git add` — and the user is away from the terminal. Without an out-of-band signal, the user discovers the halt only when they return and read the transcript.
- **Symptom:** Agent ends invocation cleanly (status set, BUG file created, refusal recorded) but the user has no signal that work has stopped. The user assumes progress is continuing.
- **Root cause (hypothesis):** Default tool surface lacks a "user attention required" channel — every signal goes through the transcript, which is only read when the user returns. Agents don't naturally distinguish "structural event requiring attention" from "routine status."
- **Mitigation currently in place:** `.claude/agent-stack.md` § Tool Hygiene / PushNotification — three-event allowlist (Docker pre-flight escalation, credential-pattern hit on `git add`, Stuck-Loop Killswitch firing) with explicit prohibitions on routine-status fires and a spam-loop guard against re-fires for the same condition.
- **Counterfactual:** Without `PushNotification`, the user must manually poll the terminal to detect halts. Lights-out operation is impossible — the whole point of pre-authorization is that the user can step away and trust the system to fire when attention is needed.
- **First observed:** Source project (journey-for-jasmine), pre-port. Mitigation rule introduced in this project via PR #8 (2026-04-27); the three-event allowlist was specifically designed against alert fatigue from over-eager notification use observed in the source project. Not yet stress-tested in feature work on this project.
- **Known gap (added 2026-04-28, surfaced by independent quad review of PR #13):** the auto-merge rule's condition (b) refusal (zero required checks reported) explicitly does NOT fire `PushNotification`, on the reasoning "the user is in-session when the SA reaches the auto-merge step; the transcript surface is sufficient." This reasoning holds for synchronous interactive sessions but breaks down for the unattended-lights-out case (the pipeline's stated goal), where the user may be away from the terminal when auto-merge precondition checks fail. In unattended operation, a fail-closed refuse-to-merge becomes invisible until the user returns and reads the transcript — exactly the failure mode this entry was introduced to prevent. The non-fire is an intentional tradeoff documented here rather than fixed in PR #13, because the three-event PushNotification allowlist is deliberately restrictive to prevent alert fatigue. Reviewing whether to extend the allowlist with a fourth event ("auto-merge precondition failure", spam-loop-guarded so it fires once per PR) is a candidate follow-up the next time an unattended lights-out epic surfaces this failure mode in practice. Until then, condition (b) refusals are silent in the unattended case — operators planning unattended runs should note this limitation.
- **Last cited:** 2026-04-28 (independent quad review of PR #13 — RA + SDET + Overwatch all flagged the unattended-lights-out gap, which is what added the "Known gap" subsection above).

### `spec-shaped-green` — gate fixture shaped to pass the gate it introduces; green run doesn't exercise real production path

- **Observed when:** When a task introduces a new required quality gate (CI status check, blocking DoD checkbox, pre-push hook, new SDET reject-on-fail bullet, blocking agent-spec startup step). The model authoring the gate also authors the test/fixture that proves the gate "works" — and the test exercises only the path the gate covers, not the production code path the gate is meant to protect.
- **Symptom:** Gate goes green. SDET reviews. CI passes. But the gate's failure mode in production is never exercised because the fixture is a strawman. The gate ships green and silently fails to protect against the real failure mode it claimed to prevent.
- **Root cause (hypothesis):** Model optimizes for the local feedback loop (gate is green → task complete). When the model authors both gate and test, the test is shaped by the model's mental model of the gate, not by the production code path. Without an external counterfactual, the gate-test pair is internally consistent but externally inert.
- **Mitigation currently in place:** `.claude/agent-stack.md` § Gate Authoring Rules — Work Log evidence triad (run URL + named job/step, named code path the gate exercises, counterfactual: "with the gate disabled the failure reproduces"). Tasks declare `Introduces-gate: yes` to surface the requirement explicitly. SDET rejects at review if any item is missing.
- **Counterfactual:** Without the evidence triad, gates that are spec-shaped pass review and ship; the codebase accumulates green-on-paper guards that don't fire on real regressions. The trust signal of "gates green" decays.
- **First observed:** Source project (journey-for-jasmine), pre-port. Mitigation rule introduced in this project via PR #5 (2026-04-26, j4j hardening round 2). Not yet stress-tested in feature work on this project — Epic 001's first gate-introducing task will be the first opportunity to observe the triad in practice.
- **Last cited:** 2026-04-28 (chore PR #8 quad review).

### `clarif-deflection` — model deflects requirements ambiguity to user instead of making bounded RA decision

- **Observed when:** RA agent during requirements work; SA mid-Plan or mid-Dispatch when a CLARIF surfaces. Pattern: model identifies an ambiguity, packages it as a question for the user, pauses for user input — even when the ambiguity is routine UX/copy/wording that the RA has authority to resolve in the SRS.
- **Symptom:** Agent halts on every CLARIF and surfaces it to the user. Workflows that should run autonomously stall on routine decisions. User receives a steady stream of "should this button say X or Y?" type questions that the RA could resolve by picking the most-consistent option and documenting the reasoning.
- **Root cause (hypothesis):** Strong prior toward "ask before deciding" — appropriate for high-stakes decisions, miscalibrated for low-stakes ones. The model lacks a default rubric for "is this within my authority to resolve?" and conservatively escalates everything.
- **Mitigation currently in place:** `.claude/agent-stack.md` § Autonomy Ceiling item 6 (Requirements *resolution* — RA-authored, no user pause). RA actively resolves CLARIFs by writing a decision with reasoning into the SRS. SA's mid-Plan / mid-Dispatch RA dispatch is the pre-authorized path. Resolution is binding; SA does not pause for user confirmation. Carve-out (`agents/ra.md` § Carve-out — escalate to user) names the only classes that escalate (legal / compliance / security).
- **Counterfactual:** Without the explicit "RA resolves, doesn't punt" rule, every CLARIF becomes a user-pause point. Lights-out epic execution is impossible — the user becomes the bottleneck on routine decisions.
- **First observed:** Source project (journey-for-jasmine), pre-port. Mitigation rule introduced in this project via PR #8 (2026-04-27). Not yet stress-tested in feature work on this project — Epic 001's first ambiguity-surfacing task will be the first opportunity to observe whether the RA actually resolves vs. defers.
- **Last cited:** 2026-04-28 (chore PR #8 quad review).

## Retired

_None._
