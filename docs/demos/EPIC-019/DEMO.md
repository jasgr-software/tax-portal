# EPIC-019 — Overdue detection & reminder engine

**Personas:** jane-accountant · sarah-returning-client · martha-and-james-married-couple
**Flows:** flow-notification-feed (reminder branch)
**Policy:** `.orchestration/DEMO-POLICY.md`

## Gallery

### Admin surface (apps/admin — jane-accountant)

| # | Step | AC |
|---|------|-----|
| 01 | `01-AC-DASH-008-01-reminder-settings.png` | AC-DASH-008-01 / AC-MSG-018-03 |
| 02 | `02-AC-DASH-008-01-cadence-saved.png` | AC-DASH-008-01 — global default saved confirmation |
| 03 | `03-AC-DASH-008-02-engagement-override.png` | AC-DASH-008-02 — per-engagement reminder override |
| 04 | `04-AC-DASH-008-02-override-saved.png` | AC-DASH-008-02 — override saved confirmation |
| 05 | `05-AC-FILE-012-02-overdue-badge.png` | AC-FILE-012-02 — overdue request flagged in document-requests view |

### Portal surface (apps/portal — sarah-returning-client)

| # | Step | AC |
|---|------|-----|
| 06 | `06-AC-MSG-014-02-request-created-nudge.png` | AC-MSG-014-02 — document_request_created nudge in portal feed |
| 07 | `07-AC-MSG-014-02-digest-content-free.png` | AC-MSG-014-02 — content-free digest email in Mailhog (no request detail) |

## How to regenerate

```bash
# Bring up the full stack
docker compose --env-file .env.local up -d

# Run admin demo
ADMIN_PORT=13001 pnpm --filter admin e2e:demo -- --grep "overdue-reminders"

# Run portal demo
pnpm --filter portal e2e:demo -- --grep "request-created-nudge"
```

Screenshots land in `docs/demos/EPIC-019/`.
