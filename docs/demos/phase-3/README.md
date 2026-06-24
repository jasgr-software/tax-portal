# Phase 3 — end-of-phase video walkthrough

A single, continuous screen recording demonstrating the **entire Phase-3 engagement workspace** end to
end, across both surfaces (Client Portal `:3000` + Tax Portal admin `:13001`). Intended for human review /
phase sign-off.

**Phase 3 (engagement lifecycle & secure file exchange) — COMPLETE:** EPIC-009 (dev sign-in lane) ·
EPIC-010 (lifecycle pipeline New→In Progress→Review→Complete + visibility/labels) · EPIC-011 (engagement
attributes — due date, accountant-only note, priority) · EPIC-012 (creation paths & multi-participant) ·
EPIC-013 (secure file exchange — upload, folders, version history, both-party download) · EPIC-014 (file
deletion, soft-delete & the 7-year retention floor) · EPIC-015 (post-retention purge & legal hold).
**98/98 Phase-3 AC verified.**

The accountant signs in, drives an engagement through its full lifecycle, sets its attributes, exchanges
documents securely (with folders and version history), soft-deletes and recovers a file under the
retention floor, and finally — for an engagement whose 7-year window has elapsed — places and lifts a
**legal hold** and runs an **accountant-confirmed, never-automatic purge** whose **audit record survives**.

## The video

- **`phase-3-walkthrough.mp4`** — H.264/MP4, ~1:24, plays anywhere (recommended for review).
- **`phase-3-walkthrough.webm`** — the native Playwright recording (plays in any modern browser).

On-screen caption banners narrate each scene; the run is paced with `slowMo` so it is watchable rather
than a fast robotic test.

## Chapters (the one continuous take)

| # | Scene | Surface | Epic / what it proves |
|---|-------|---------|-----------------------|
| 0 | Title card | — | Phase 3 overview |
| 1 | The **dev sign-in lane** — sign in as the accountant via the mock provider; land on the Tax Portal | Admin `:13001` | **EPIC-009** — sign-in/sign-out + role-appropriate landing (AC-AUTH-013, AC-AUTH-010) |
| 2 | An engagement walks the **lifecycle pipeline** New → In Progress → Review → Complete (two-confirmation completion gate; accountant-only reopen); client-facing labels hide the internal Review stage | Admin `:13001` | **EPIC-010** — manual transitions, completion gate, visibility/labels (AC-LIFE-001..006, AC-AUTH-002/003/008) |
| 3 | The accountant sets a **due date**, records an **accountant-only internal note** (never client-visible), and flags **priority** | Admin `:13001` | **EPIC-011** — engagement attributes (AC-LIFE-007/008/009) |
| 4 | **Creation paths & multi-participant** — accountant-initiated engagement + the multi-participant surface (seeded + narrated) | Admin `:13001` | **EPIC-012** — DOOR-009/010, duplicate guard, multi-participant (AC-LIFE-010/011/012, AC-AUTH-007) |
| 5 | **Secure file exchange** — the folder tree, create-folder, document upload, **version replace** (newest current, prior versions retained), both-party download | Admin `:13001` | **EPIC-013** — upload/folders/versioning/download (AC-FILE-001/009/010/011) |
| 6 | **Soft-delete & retention** — the accountant deletes a file (it leaves the working view), the **Archive** shows it, **recover** restores it; the 7-year retention floor holds | Admin `:13001` | **EPIC-014** — accountant-only soft-delete + recover + retention floor (AC-FILE-004/005/006, AC-NFR-006) |
| 7 | **Legal hold & purge** — place a **legal hold** (the engagement shows **blocked-by-hold**, not purge-eligible); **lift** the hold; for an expired engagement, the **confirm-before-purge** flow (submit disabled until the engagement id is typed) runs an accountant-confirmed purge — and the **audit record survives** the purge | Admin `:13001` | **EPIC-015** — purge + legal hold + precedence + audit-survives-purge (AC-FILE-013/014/015, AC-NFR-010-07) |
| 8 | Closing card | — | Phase 3 complete |

> **Note (BUG-008-001):** where a real Azurite byte round-trip would block from the host Playwright
> browser (document upload), the scene is demonstrated as the UI affordance with the post-state seeded and
> narrated — the same workaround the per-epic demos use. This reflects the pre-existing Azurite SAS infra
> defect, not a regression; the affected behaviors are proven at the tier-3 integration layer. This host's
> stack does not run a reachable Mailhog; the spec's `clearMailhog()` is best-effort and Phase 3 has no
> email scenes, so the recording is unaffected.

## Regenerate

The walkthrough is the `@video`-tagged spec `apps/admin/e2e/demo/phase-3-walkthrough.demo.spec.ts`
(non-gating — excluded from the e2e gate and from the screenshot `e2e:demo` run; runs only under
`e2e:video`).

```bash
# 1. Stack up + healthy (sqlserver :14330, portal :3000, admin :13001). Then stage realistic data:
pnpm demo:stage          # guard-railed: refuses any non-local DB; scoped clean (no volume wipe) + demo seed

# 2. Record — phase-3 file ONLY so the phase-1/phase-2 walkthroughs are not also run:
DEMO_SLOWMO=200 pnpm --filter admin exec playwright test --grep @video e2e/demo/phase-3-walkthrough.demo.spec.ts

# 3. Package → docs/demos/phase-3/phase-3-walkthrough.{webm,mp4}:
node scripts/make-phase-video.mjs 3
```

> Codified as a phase-closeout step — see `.orchestration/DEMO-POLICY.md` § Part B (per-phase walkthrough video).

- `DEMO_SLOWMO=<ms>` overrides the per-action pace (`0` for a fast correctness pass).
- The `.mp4` conversion uses the `ffmpeg-static` dev dependency (no system ffmpeg required). If it is not
  installed, the `.webm` is still produced.
- **Scope the run to the phase-3 spec file** (as above) — the bare `pnpm --filter admin e2e:video` grep
  matches all three phase walkthroughs (`@video`), and the pre-existing phase-1 spec may fail on this
  host's port remaps.
