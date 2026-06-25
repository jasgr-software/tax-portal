# HANDOFF-017 — BRIEF-017 Per-engagement & general messaging threads (EPIC-017, Phase 4 — the conversation surface that replaces email)

**Slice:** Stand up the **messaging conversation surface** across **both** surfaces — a **per-engagement thread** (exactly one per engagement) and an **accountant-initiated general thread** with a client, carrying **plain-text** messages and **one-or-more scanned file attachments** retrieved via short-lived **participant-scoped signed URLs**, a **per-viewer unread indicator** that clears on view, **indefinite retention + archive-on-close** (archive is a state, never a delete), and a **new-message notification** emitted onto the **EPIC-016** feed spine. Built on EPIC-016 (notification spine), EPIC-013 (`EngagementParticipant` participant-isolation + the storage/scan/signed-URL document path the attachment seam reuses), EPIC-007 (`FileStorage`/`FileScanner`), and EPIC-010 (the Complete transition that triggers archive-on-close). **Phase 4 continues; this slice does NOT close it** (EPIC-018..023 remain planned; EPIC-023 is the closer) — **no** phase-walkthrough video rides this PR.
**Branch:** `brief-017-per-engagement-general-messaging`
**Status at handoff:** Close-prep complete; PR ready to raise; slice enters PR limbo (awaiting the reviewed-lane gates + merge).
**Date:** 2026-06-25

---

## What was delivered

The thread/message/attachment model + RLS policies, the plain-text treatment, the per-viewer unread indicator, the archive-on-close wiring, and the new-message emit onto the EPIC-016 spine — across `apps/portal` (CLIENT) and `apps/admin` (ACCOUNTANT). Twelve tasks + two bugs:

| Task | Delivered |
| ---- | --------- |
| TASK-017-001 | **DB foundation.** Net-new Prisma Track-A entities `Thread` / `Message` / `MessageAttachment` / `ThreadReadState` (migration `20260625130107_brief017_thread_message_attachment_readstate`). Raw-SQL Track-B policies `db/policies/0014-thread` / `0015-message` / `0016-message-attachment` / `0017-thread-read-state` + `db/migrations/0007-messaging-policies.sql`: four `sec.fn_*_access` inline-TVF predicates (admin/accountant-first, fail-closed) + four security policies FILTER+BLOCK, STATE=ON, SCHEMABINDING=ON. CHECK constraints `Thread_kind_chk` / `Thread_status_chk` / `Thread_engagement_or_client_chk` (XOR) / `MessageAttachment_status_chk`; `@@unique([engagementId])` (one-thread-per-engagement). HARD tier-3 both-ways RLS suites: thread 13/13, message 6/6, attachment 6/6, read-state isolation — incl. ≥2-participant + null-SESSION_CONTEXT-ZERO. DECISION-017-A anchors. |
| TASK-017-002 | Thread/message repository seam (`packages/db/src/repositories/thread.ts` / `message.ts`): `getOrCreateEngagementThread` (idempotent catch-and-re-read on the unique race), `createGeneralThread`, `getThreadById` / `getThreadForEngagement` / `getGeneralThreadsForClient` / `listThreadMessages` — reads via the request pool with RLS as the **sole** enforcement boundary (DECISION-017-002-A: no WHERE on top of RLS that would mask a policy regression). |
| TASK-017-003 | Send-message + mark-read actions + **new-message notification** (`appendMessage` post-write emit). Body stored byte-verbatim (AC-MSG-003). Recipient resolution is server-authoritative (admin-pool participation lookup); **sender never self-notified**; recipient-only entitlement (AC-MSG-013-02 / -014-01). |
| TASK-017-004 | Attachment **scan-before-available** + participant-scoped **signed URL** (`message-attachment.ts`): `storeAndScanAttachment` (admin pool — store → validate → scan → promote only on `clean`+`pass`; `infected` terminal; `indeterminate` stays pending, fail-closed) reusing the EPIC-007 `FileScanner` + EPIC-013 `validateUploadedBytes`/`MAX_FILE_SIZE_BYTES`; `authorizeThenSignAttachment` (request pool — resolve under RLS → assert `active` → sign the **server-resolved** key; IDOR cross-resource key-substitution negative). |
| TASK-017-005 | Per-viewer unread read-model (`thread-read.ts`): last-read watermark per `(thread, viewer)`; unread derived per viewer; clears for one viewer without affecting another (+ IDOR negative). |
| TASK-017-006 | Messaging UI on **both** surfaces — `ThreadList` / `ThreadView` / `MessageComposer` / `AttachmentList` / `UnreadIndicator`; shared `packages/ui/MessageBody.tsx` (React text nodes only — **no `dangerouslySetInnerHTML`**, the plain-text/XSS-safety proof). |
| TASK-017-007 | **Archive-on-close wiring** — `archiveEngagementThread` (idempotent status flip `active`→`archived` + `archivedAt`, touches no Message rows) wired **additively** into `transitionEngagementStatus` Complete branch alongside the byte-preserved `setEngagementCompleted` + `emitAndPublishNotification` (CS-GEN-002). Archive integration test 5/5 at review. |
| TASK-017-008 | Tier-6 e2e send/receive/attach/archive + unread journeys on **both** surfaces (gherkin-bound). Portal 12/12 + admin 11/11 vs the live Docker stack. |
| TASK-017-009 | `@demo` AC-tagged gallery into `docs/demos/EPIC-017/` (jane-accountant + sarah-returning-client along `flow-message-exchange`, both surfaces) — **non-gating** per `.orchestration/DEMO-POLICY.md`. |
| TASK-017-010 | `apps/admin` client-list general-thread selector (`StartGeneralThread` — accountant-only affordance). |
| TASK-017-011 | General-thread view route `/messages/[threadId]` on **both** surfaces. |
| TASK-017-012 | Admin-feed new-message render + the multi-participant notification test. |
| BUG-017-001 | **(Process win — pre-existing EPIC-016 build break fixed forward.)** The EPIC-016 notification-identity import broke the Next build; caught + fixed forward in-slice (sibling of retro-017-pre01). |
| BUG-017-002 | **(Process win — masked notification-link defect caught.)** The new-message notification *link* was not rendered (`linkedItemType` mismatch). Fix (Option A — row-only renderer): engagement thread → `linkedItemType:'engagement'`/`linkedItemId:engagementId` (reuses the existing engagement-link branch); general thread → `linkedItemType:'thread'`/`linkedItemId:threadId` (new renderer branch → `/messages/<threadId>`). Notification now renders + links in **both** feeds. |

## Acceptance criteria — all 24 satisfied (AC → tier → status)

| AC | Behavior | Tier | Status |
| -- | -------- | ---- | ------ |
| AC-MSG-001-01 | Exactly one thread per engagement (`@@unique[engagementId]`) | tier-6 | ✅ |
| AC-MSG-001-02 | Message recorded + visible to participants (HARD RLS both-ways) | tier-3 | ✅ |
| AC-MSG-001-03 | Full ordered history persists across sessions | tier-6 | ✅ |
| AC-MSG-001-04 | Both parties read + contribute (HARD RLS) | tier-3 + tier-6 | ✅ |
| AC-MSG-002-01 | Accountant starts a general thread | tier-6 | ✅ |
| AC-MSG-002-02 | General thread associated with client; visible to accountant + that client (HARD RLS) | tier-3 | ✅ |
| AC-MSG-002-03 | General-thread messages = ordered persistent history | tier-6 | ✅ |
| AC-MSG-003-01 | Body is plain text, no rich-text styling | tier-3 | ✅ |
| AC-MSG-003-02 | Markup shown VERBATIM (no `dangerouslySetInnerHTML`) | tier-3 | ✅ |
| AC-MSG-003-03 | No inline image embedded in the body | tier-3 | ✅ |
| AC-MSG-004-01 | Sender attaches one+ files | tier-6 | ✅ |
| AC-MSG-004-02 | Attachments visible alongside the message | tier-6 | ✅ |
| AC-MSG-004-03 | Participant retrieves via short-lived participant-scoped signed URL (IDOR-gated) | tier-6 | ✅ |
| AC-MSG-004-04 | Attachment available while the message is retained | tier-6 | ✅ |
| AC-MSG-004-05 | Same type/size rules + scan-before-available (HARD) | tier-3 | ✅ |
| AC-MSG-005-01 | Unread indicator on a thread with new messages | tier-6 | ✅ |
| AC-MSG-005-02 | Indicator on both engagement + general threads | tier-6 | ✅ |
| AC-MSG-005-03 | Unread is per-viewer (HARD) | tier-3 | ✅ |
| AC-MSG-005-04 | Indicator clears once seen | tier-6 | ✅ |
| AC-MSG-006-01 | Threads retained indefinitely; close deletes nothing (HARD) | tier-3 | ✅ (5/5 at TASK-017-007 review; see env caveat) |
| AC-MSG-006-02 | Archived, not deleted, on close (HARD) | tier-3 | ✅ (5/5 at review; corroborated by -006-03 e2e) |
| AC-MSG-006-03 | Archived thread stays fully readable | tier-6 | ✅ |
| AC-MSG-013-02 | Accountant notified of a new message (recipient-only) | tier-6 | ✅ |
| AC-MSG-014-01 | Client notified of a new message (recipient-only) | tier-6 | ✅ |

**Hard extra_gates all PASS:** participant-isolation RLS proven BOTH ways across `pol_Thread`/`pol_Message`/`pol_MessageAttachment`/`pol_ThreadReadState` (non-participant reads ZERO, null SESSION_CONTEXT reads ZERO, participant reads, accountant reads; ≥2-participant every-participant-reads + cross-engagement-zero); plain-text treatment (markup verbatim, no inline image, no `dangerouslySetInnerHTML`); scan-before-available (reusing the EPIC-007 seam; infected/indeterminate never signable) + the IDOR cross-resource key-substitution negative; per-viewer unread (clears for one viewer only); indefinite retention + archive-on-close (distinct from EPIC-016's ≥90-day floor — not conflated); send/receive/attach/archive e2e on **both** surfaces; recipient-only new-message notification onto the EPIC-016 spine (no cross-participant leak).

## Quality gates (the 9-gate scorecard)

| Gate | Result |
| ---- | ------ |
| 1. Submission gates | 14/14 ✅ (12 tasks + 2 bugs) |
| 2. SDET Review | 14/14 approved ✅ |
| 3. Overwatch Audit | recorded; Finding 3 (pre-existing `document.upload-pipeline.rls.test.ts` pair) isolation-proven pre-existing; no blocking ✅ |
| 4. IO Design scan | clean — read the integrated diff (RLS policies, signed-URL/scan path, plain-text body, archive wiring, notification emit, schema); honors ADR-003/-005/-006/-008/-009/-012/-018/-021 + CS-TS/CS-SQL; both surfaces at parity; zero scope creep ✅ |
| 5. Container Smoke | PASS — clean Docker stack; 17/17 net-new DB objects in-container (4 tables, 4 policies STATE=ON, 4 TVFs, 4 CHECKs, unique index); both apps boot; `/messages` 307 auth-gated; BUG-017-001 did not recur ✅ (retro-012-002 bootstrap caveat noted) |
| 6. SDET Acceptance-validation | PASS — 24/24 AC bound to AC-id-tagged passing tests at their ADR-012 tiers; both surfaces ✅ |
| 7. SDET CI gate | PASS-with-known-pre-existing — lint/type-check/build PASS; portal 321/321 + admin 581/581 unit, zero BRIEF-017 regressions; 2 `ci:local` script failures are non-regressions (BUG-013-002 YAML-oracle timeout; `check_gated_path_accountability` commit-time guard) ✅ |
| 8. Post-merge CI | pending (Close-finalize) |
| 9. Post-merge staging smoke | N/A (`brief_deploys: no`) |

## Net-new platform capabilities (for the upstream producer / `.planning/` COVERAGE write-back)

- The **conversation contract** the rest of Phase 4 references: EPIC-018 will email-digest the new-message notification this slice emits; EPIC-020 will surface recent-message activity on the dashboard.
- A reusable **participant-isolation RLS chain** (`fn_thread_access` and the Message/Attachment derivations reaching participation through the parent Thread) that reuses the EPIC-013 `fn_engagement_access` participant branch rather than re-deriving it.
- A reusable **scan-before-available attachment seam** for inline-attach flows (admin-pool store+scan, request-pool authorize-then-sign-server-resolved-key) layered on the EPIC-007/-013 storage path.
- The **archive-as-state** retention precedent (ADR-018) wired additively into the EPIC-010 lifecycle — archive is a status flip, never a delete; archived rows stay readable.

## Carry-forward items (see RETRO-017 for full classification)

- **retro-012-002** (carried infra) — clean-volume `db:migrate` Prisma `;port=`/P3019/`!`-password fragility; SDET's ~2-line fix recommendation (`process.loadEnvFile('.env.local')` in `db-migrate.ts` + switch `.env.local` `DATABASE_URL_ADMIN` to the `:port` form Prisma 5.22.0 parses). Gated-path → future slice/BUG, should-fix before BRIEF-018's clean-slate smoke.
- **General-thread new-message link e2e coverage** (advisory) — the general-thread link is covered by unit tests on both surfaces; the engagement-thread link path is covered by e2e. Add general-thread e2e link coverage (follow-up; do NOT re-open this slice).
- **BUG-013-002** (carried) — pre-existing YAML-oracle 5s-timeout on the growing task corpus; passes in isolation.
- **reopen-doesn't-unarchive** (observation) — `reopenEngagement` (Complete → In Progress) does not un-archive the thread; consistent with ADR-018 (archive is a retention state; brief mandates archive-on-close, not un-archive-on-reopen) and AC-MSG-006-03 (archived stays readable). No action.
- **retro-017-pre01** (acknowledged) — the 2 `document.upload-pipeline.rls.test.ts` mock-scanner-env failures; pre-existing, behind the advisory `pnpm -r test` path; not a BRIEF-017 reject.
