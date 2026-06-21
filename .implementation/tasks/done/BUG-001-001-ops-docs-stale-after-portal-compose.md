---
brief: BRIEF-001
status: closed
severity: blocking (SDET rejection criterion per CLAUDE.md § DevOps)
task: TASK-004
raised_by: sdet
raised_at: 2026-06-15
---





# BUG-001-001: Operations docs stale after TASK-004 portal compose service addition

---

## What failed

TASK-004 modified `docker-compose.yml` to add the `portal` app service but did NOT update
`.implementation/operations/inventory.md` or `.implementation/operations/runbook.md`.
This violates the project rule in CLAUDE.md § DevOps:

> "When a task changes Dockerfile content, docker-compose service topology, secrets,
> environment variables, ingress wiring, or the admin/app DB principal split, **must update
> `.implementation/operations/inventory.md` and `.implementation/operations/runbook.md`**."

CLAUDE.md § SDET confirms: "For infrastructure tasks, **must verify** inventory.md and
runbook.md are consistent with any environment, secret, or configuration changes — **reject
if stale**."

---

## Stale fields (specific)

### inventory.md

1. **Services table** — `portal` row still shows `Status in TASK-002: Deferred to TASK-004`.
   After TASK-004 delivered the portal service, this should read `Active`.

2. **Ports table** — The `portal` row says `Notes: Next.js app — added in TASK-004` (still
   forward-looking). Should confirm active. The `PORTAL_PORT` env-var override introduced in
   `docker-compose.yml` (line: `"${PORTAL_PORT:-3000}:3000"`) is not documented in the
   inventory's port table (only `SQLSERVER_PORT`, `AZURITE_PORT`, `MAILHOG_*` overrides are
   listed).

3. **Environment variables** — No entry for `DATABASE_URL_ADMIN` under the portal service's
   runtime requirements (it's set in the compose file but not documented in the inventory's
   "App services" env-var section for the portal specifically).

### runbook.md

1. **Bring-up § Verify health — expected `docker compose ps` output** (lines 48–53) still
   shows only the three data-plane services (sqlserver, azurite, mailhog). After TASK-004, the
   running stack includes `tax-portal-portal`; the expected output should include it.

2. **Note on anonymous write** (line ~197): says "TASK-005" as the producer of the front-door
   path ("public engagement-request form (front door — TASK-005)"). The correct task is
   TASK-004 (the Server Action and form live in `apps/portal`; TASK-005 only adds e2e specs).

---

## Reproduction steps

1. Read `docker-compose.yml` — confirm `portal` service is present with
   `PORTAL_PORT` override and `DATABASE_URL_ADMIN` env var.
2. Read `.implementation/operations/inventory.md` — observe:
   - Line 20: `portal` row still reads `Deferred to TASK-004`.
   - Ports table (line 42): no `PORTAL_PORT` env override column entry.
3. Read `.implementation/operations/runbook.md` — observe:
   - Lines 48–53: `docker compose ps` example shows only 3 services.

---

## Expected vs. actual

**Expected:** inventory.md and runbook.md reflect the delivered `portal` compose service,
`PORTAL_PORT` override, and updated bring-up example output.

**Actual:** Both files reflect the TASK-002 state only; the TASK-004 compose addition is
undocumented.

---

## Fix guidance (TASK-004 rework)

Update `.implementation/operations/inventory.md`:
- Change `portal` row status from `Deferred to TASK-004` to `Active`.
- Add `PORTAL_PORT` env-var override to the ports table row for the portal service.
- Add a note in the env-var section confirming `DATABASE_URL_ADMIN` is the runtime env var
  the portal container uses (as set in docker-compose.yml).

Update `.implementation/operations/runbook.md`:
- Update the `docker compose ps` expected output to include `tax-portal-portal`.
- Fix the "Note on anonymous write" reference from `TASK-005` to `TASK-004`.

These are docs-only changes — no code changes required. The developer should update both
files and re-submit TASK-004.

---

## Resolution

**2026-06-15 [webapp-developer]** Fixed in TASK-004 rework: updated `inventory.md` (portal row status → Active, PORTAL_PORT env-override added to ports table, DATABASE_URL_ADMIN added to App services env table, Last updated header updated to TASK-004) and `runbook.md` (docker compose ps example now includes tax-portal-portal, anonymous write note corrected from TASK-005 to TASK-004).

## Root cause note for IO

The task spec's Files table listed `docker-compose.yml | Modify` but had no corresponding
`inventory.md | Modify` or `runbook.md | Modify` row. The IO should add the ops-doc update
requirement to the TASK-004 rework spec (it is always required by CLAUDE.md § DevOps when
compose topology changes — it need not be re-specified, but including it in the Files table
prevents the omission).
