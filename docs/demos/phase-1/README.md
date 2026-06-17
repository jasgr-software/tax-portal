# Phase 1 — end-of-phase video walkthrough

A single, continuous, **human-speed** screen recording demonstrating every Phase-1 feature end to
end, across both surfaces (Client Portal `:3000` + Tax Portal admin `:13001`) and the Mailhog
mail-catcher. Intended for human review / phase sign-off.

**Phase 1 (MVP front-door spine) — delivered:** EPIC-001 (public front door) · EPIC-004 (auth &
two-role model) · EPIC-002 (services-catalog management) · EPIC-003 (request inbox). 51/51 AC verified.

## The video

- **`phase-1-walkthrough.mp4`** — H.264/MP4, plays anywhere (recommended for review).
- **`phase-1-walkthrough.webm`** — the native Playwright recording (plays in any modern browser).

On-screen caption banners narrate each scene; the run is paced with `slowMo` so it is watchable rather
than a fast robotic test.

## Chapters (the one continuous take)

| # | Scene | Surface | Epic / what it proves |
|---|-------|---------|-----------------------|
| 0 | Title card | — | Phase 1 overview |
| 1 | A prospect browses the public **services** page and submits **two** engagement requests (Tom → will be accepted, Jane → will be declined) | Portal `:3000` (anonymous) | **EPIC-001** — public front door + anonymous engagement request (AC-DOOR-001/003/004) |
| 2 | With **no session**, the admin app bounces the visitor to the client portal; then the accountant **signs in** and lands on her dashboard | Admin `:13001` | **EPIC-004** — auth & two-role model; role is server-evaluated (AC-AUTH-001/010) |
| 3 | The accountant **adds**, **edits**, and **deactivates** a service; the public catalog reflects the change | Admin `/services` → Portal `/services` | **EPIC-002** — services-catalog management + cross-surface (AC-DOOR-002, AC-DASH-010) |
| 4 | The new-request **notification**, the **inbox** (states), and a request's **submitted details** | Admin `/requests` | **EPIC-003** — notify / view (AC-DOOR-005, AC-DASH-011, AC-DOOR-006-01, AC-MSG-013-01) |
| 5 | **Accept** Tom → status `accepted` → the **invitation email** shown in the Mailhog inbox | Admin → Mailhog | **EPIC-003** — accept → invite (AC-DOOR-006-02, AC-DOOR-007) |
| 6 | **Decline** Jane with a reason → status `declined` + retained reason → the **decline-reason email** shown in Mailhog | Admin → Mailhog | **EPIC-003** — decline → reason email (AC-DOOR-006-03, AC-DOOR-008) |
| 7 | Closing card | — | Phase 1 complete |

## Regenerate

The walkthrough is the `@video`-tagged spec `apps/admin/e2e/demo/phase-1-walkthrough.demo.spec.ts`
(non-gating — excluded from the e2e gate and from the screenshot `e2e:demo` run).

```bash
# 1. Bring up the stack (this host remaps ports — neighbor project occupies 1025/8025/3001/1433):
ADMIN_PORT=13001 MAILHOG_SMTP_PORT=11025 MAILHOG_HTTP_PORT=18025 \
  docker compose --env-file .env.local up -d --no-deps mailhog admin portal
#    (sqlserver + azurite are long-running; --no-deps skips the sqlserver healthcheck gate —
#     a documented carried infra item; the DB is operational via the app principals.)

# 2. Record (≈4–6 min at human speed):
ADMIN_BASE_URL=http://localhost:13001 ADMIN_PORT=13001 \
MAILHOG_HTTP_PORT=18025 PORTAL_BASE_URL=http://localhost:3000 \
  pnpm --filter admin e2e:video

# 3. Package → docs/demos/phase-1/phase-1-walkthrough.{webm,mp4}:
node scripts/make-phase-video.mjs 1
```

> Codified as a phase-closeout step — see `.orchestration/DEMO-POLICY.md` § Part B (per-phase walkthrough video).

- `DEMO_SLOWMO=<ms>` overrides the per-action pace (default `650`; `0` for a fast correctness pass).
- The `.mp4` conversion uses the `ffmpeg-static` dev dependency (no system ffmpeg required). If it is
  not installed, the `.webm` is still produced.
