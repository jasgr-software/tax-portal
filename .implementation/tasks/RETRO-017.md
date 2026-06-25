# RETRO-017 — BRIEF-017 Per-engagement & general messaging threads (EPIC-017, Phase 4 — the email-replacement conversation surface)

**Date:** 2026-06-25 · **Branch:** `brief-017-per-engagement-general-messaging` · **Outcome:** Close-prep complete; PR ready to raise.

## Scorecard

| Gate | Result |
| ---- | ------ |
| 1. Submission gates | 14/14 ✅ (12 tasks + 2 bugs) |
| 2. SDET Review | 14/14 approved ✅ |
| 3. Overwatch Audit | recorded; Finding 3 isolation-proven pre-existing; no blocking ✅ |
| 4. IO Design scan | clean — RLS policies / signed-URL+scan path / plain-text body / archive wiring / notification emit / schema all honor ADR-003/-005/-006/-008/-009/-012/-018/-021 + CS-TS/CS-SQL; both surfaces at parity; zero scope creep ✅ |
| 5. Container Smoke | PASS (clean Docker stack; 17/17 net-new DB objects; both apps boot; routes 307; BUG-017-001 did not recur) ✅ |
| 6. SDET Acceptance-validation | PASS — 24/24 AC bound to AC-id-tagged passing tests; both surfaces (portal 12/12 + admin 11/11 e2e) ✅ |
| 7. SDET CI gate | PASS-with-known-pre-existing (`lint/type-check/build` PASS; portal 321/321 + admin 581/581 unit; zero BRIEF-017 regressions) ✅ |
| 8. Post-merge CI | pending (Close-finalize) |
| 9. Post-merge staging smoke | N/A (`brief_deploys: no`) |

## What went well

- **The participant-isolation trap was proven bidirectionally and fail-closed — the slice's headline gate.** Per the ADR-005 history (EPIC-013 both-party-download, EPIC-014 no-client-delete, EPIC-015 no-client-purge, EPIC-016 per-viewer-notification), the panel/SDET trap here was the four-table isolation chain. It was proven the hard way: thread 13/13, message 6/6, attachment 6/6, read-state isolation — non-participant reads ZERO, null SESSION_CONTEXT reads ZERO, participant reads, accountant reads; ≥2-participant (martha-and-james) every-participant-reads + cross-engagement-zero. The Message/Attachment predicates reach participation **through the parent Thread** (reusing the EPIC-013 `fn_engagement_access` participant shape per CS-SQL-003 rather than re-deriving it), kept shallow (≤4 JOINs) per ADR-005 §5.
- **Two process wins — both caught and recovered in-slice.** (a) **BUG-017-001** — a *pre-existing* EPIC-016 notification-identity import broke the Next build; caught and fixed forward (sibling of retro-017-pre01). (b) **BUG-017-002** — the new-message notification *link* was silently not rendered (a `linkedItemType` mismatch); caught, and fixed with the row-only renderer (Option A): the notification now renders + links in **both** feeds, zero-lookup, matching the `document_uploaded` precedent. A masked link defect that a less-thorough validation would have shipped.
- **Plain-text is a treatment AND a safety property — proven literally.** `packages/ui/MessageBody.tsx` renders via React text nodes only — there is **no `dangerouslySetInnerHTML` anywhere**; markup/HTML/script-like bodies render verbatim (no XSS surface, no inline image). The body is stored byte-verbatim at the NVarChar(Max) parameter level. The XSS-safety invariant is structural, not incidental.
- **Reuse discipline held.** The attachment seam *consumed* EPIC-007 `FileStorage`/`FileScanner` + EPIC-013 `validateUploadedBytes`/`MAX_FILE_SIZE_BYTES` (not rebuilt); the new-message emit rode the EPIC-016 `Notification` spine additively (`appendMessage` signature unchanged, fire-and-not-blocking `Promise.allSettled`); archive-on-close wired additively into the EPIC-010 Complete transition (byte-preserving the existing `setEngagementCompleted` + notification calls). CS-GEN-002 honored throughout.
- **Both surfaces reached parity** (CLAUDE.md § Platform-frontend scope was load-bearing — genuine two-surface slice): threads/composer/attachments/unread on `apps/portal` AND `apps/admin`, shared `MessageBody` in `packages/ui`, 12/12 portal + 11/11 admin e2e.
- **The independent clean-Docker smoke held the line again.** 17/17 net-new DB objects verified in-container (4 tables, 4 policies STATE=ON, 4 TVFs, 4 CHECKs, unique index) — objects present, policies ON, apps boot, routes registered.

## Headline findings classified (per ENGINE.md § Retro Finding Classification — concrete gate failures only)

### [ungated-fix → carried as openRetroItem] retro-012-002 — clean-volume `db:migrate` Prisma-bootstrap fragility blocks clean-slate Smoke

**What happened (recurred at this slice's Smoke).** On a fresh volume, `pnpm db:migrate` fails on this host because `DATABASE_URL_ADMIN` uses Prisma's `;port=14330` form (Prisma 5.22.0 ignores it → connects to the neighbor's 1433); the `:14330` form trips P3019; the `!` in `SA_PASSWORD` trips P1013. The SDET needed a 9-step workaround (Track-B-via-SA + `prisma db push`) to bootstrap a fresh volume for the Smoke. Side effects of *that workaround* (NOT slice defects): `prisma db push --accept-data-loss` dropped the Track-B-owned `dbo.AuditEvent` table (Prisma doesn't own it) and `_prisma_migrations` history is absent (push vs deploy). On the **real deploy path** (`prisma migrate deploy` on an existing volume) neither happens.

**Disposition: `ungated-fix`, carried as an openRetroItem** (already a known carried item — recorded here as a fresh manifestation, not a new class). **Fix (SDET-recommended, ~2 lines):** add `process.loadEnvFile('.env.local')` to `scripts/db-migrate.ts` (mirroring `db-seed.ts`) + switch `.env.local` `DATABASE_URL_ADMIN` to the `:port` form Prisma 5.22.0 parses. This is a **gated-path** change (`scripts/` affects gate behavior) → it rides a future slice/BUG, NOT the BRIEF-017 PR. **Should-fix before BRIEF-018's clean-slate Smoke** so the next slice doesn't need the 9-step workaround.

### [acknowledged] retro-017-pre01 — 2 pre-existing `document.upload-pipeline.rls.test.ts` failures

Mock-scanner `ALLOW_MOCK_SCANNER` env (carried BUG-007-001 family). Independently isolation-proven pre-existing (git-stash reruns + empty `git diff main` for the file + Overwatch Audit Finding 3). Behind the advisory `pnpm -r test` path; latent on `main` because that is not a required CI check. **Not a BRIEF-017 reject.** If a future CI maturation (retro-012-001) graduates `pnpm -r test`, this gets a dedicated BUG. No action this slice.

### [acknowledged] BUG-013-002 — pre-existing YAML-oracle 5s-timeout on the growing task corpus

Surfaced again in `pnpm ci:local`'s script-test step; predates BRIEF-017 by ~2 epics; passes in isolation. Not a behavior regression; not a BRIEF-017 reject. Carried.

## Observations (do not clear the promotion bar — no action items)

- **`reopenEngagement` does not un-archive the thread.** `reopenEngagement` (Complete → In Progress) clears the confirmation timestamps but does not flip `Thread.status` back to `active`. This is **consistent with ADR-018** (archive is a retention state; the brief mandates archive-**on-close**, not un-archive-on-reopen) and **AC-MSG-006-03** (archived threads remain fully readable — the RLS read predicates do not filter on status). Recorded as a known semantic, not a defect. If a future brief wants reopen-unarchive symmetry, it is an upstream behavior decision (`.planning`/`.requirements`), not an implementation fix.
- **General-thread new-message link e2e coverage gap (advisory).** The general-thread notification link (`linkedItemType:'thread'` → `/messages/<threadId>`) is covered by **unit** tests on both surfaces; the **engagement-thread** link path is covered by **e2e**. Add a general-thread e2e link assertion in a follow-up. Non-blocking; do NOT re-open this slice. (Advisory — no gate failure.)
- **`check_gated_path_accountability` is a commit-time guard, not a slice gate.** It fired throughout Validate/Close-prep only because the 13 BRIEF-017 feature files are uncommitted in the working tree; it clears the moment the main session commits at Close-prep. Expected behavior — recorded so it is not mistaken for a slice defect on a future read of the event log.

## Rule Sunset (ENGINE.md § Rule Sunset — Overwatch flags rules not triggered in the last 3 slices)

- **Cross-surface-parity sunset trigger (CLAUDE.md § Platform-frontend scope):** the rule was **load-bearing this slice** (genuine two-surface messaging; both surfaces at parity drove real findings) — the 3-consecutive-zero-finding sunset counter **resets**, do not flag for keep/remove.
- **Autonomy Ceiling item 2 `--no-verify` clause + `PushNotification` spam-loop guard (carried retro-012-009 sunset candidates):** neither triggered this slice either. Continue tracking; surface again at the next Close-prep retro for a keep/remove recommendation per § Rule Sunset.

## Post-Merge Addendum

_(written at Close-finalize, after merge + post-merge CI verification)_
