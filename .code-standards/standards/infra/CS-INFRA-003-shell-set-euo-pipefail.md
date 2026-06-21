---
id: CS-INFRA-003
title: Every project shell script opens with set -euo pipefail
language: infra
polarity: do
rating: required
status: active
verification: The first non-comment, non-blank line of every *.sh file in scripts/ is `set -euo pipefail`. A reviewer greps `^set -euo pipefail` in each changed shell file and rejects any shell script that omits it.
source:
  - scripts/validate-gates.sh
  - scripts/e2e-cross-app.sh
  - scripts/smoke-test.sh
related: []
rating_history:
  - { rating: experimental, date: 2026-06-21, by: agent, rationale: "discovered in PR #74 audit — all three shell scripts in scripts/ (validate-gates.sh, e2e-cross-app.sh, smoke-test.sh) open with set -euo pipefail; zero exceptions observed; proposed experimental pending human ratification" }
  - { rating: required, date: 2026-06-21, by: user, rationale: "ratified to required — binary, mechanically greppable safety guard with zero exceptions across all 3 shell scripts; a script omitting it is an SDET/standards-review rejection" }
open_questions: []
---

# CS-INFRA-003 — Every project shell script opens with set -euo pipefail

## Rule
Every shell script (`.sh`) under `scripts/` must open with `set -euo pipefail` immediately after the shebang line. No project shell script omits this guard.

## Rationale
`set -euo pipefail` prevents silent failure cascades: `-e` exits on any unhandled error, `-u` treats unset variables as errors, and `-o pipefail` propagates pipeline failures. Omitting it in engine-tooling scripts (which may migrate files, run gates, or drive CI) risks silent corruption or misleading exit codes.

## Verification
Grep each changed `.sh` file for `^set -euo pipefail`. Its absence in any shell script is a finding. All three existing scripts in `scripts/` carry it without exception.

## Examples
- do: `#!/usr/bin/env bash` followed immediately by `set -euo pipefail`
- don't: a shell script that omits `set -euo pipefail` or uses a weaker combination such as `set -e` alone

## Links
- Source: scripts/validate-gates.sh, scripts/e2e-cross-app.sh, scripts/smoke-test.sh (observed convention)
- Open questions: none
