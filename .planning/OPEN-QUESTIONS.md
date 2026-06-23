# Open Questions

Planning ambiguities the Planning Agent could not resolve on its own. Each carries a **proposed default**
so roadmap work is never blocked — except **escalation carve-out** items (go-to-market / release-timing
commitments, regulatory- or compliance-driven sequencing, business-model or scope-of-offering
decisions), which require a user decision and carry no default.

An epic blocked by an open question lists its `PQ-NNN` in `open_questions:` and sits at
`status: clarifying` until the question is resolved.

Status: `open` → `resolved`. IDs are `PQ-NNN`, globally unique across this ledger.

---

## PQ-001 — Durable returning-client contact source (decoupled from engagement history)

- **Status:** open (non-blocking tracked forward item — does **not** block any epic)
- **Affects:** EPIC-012 (delivered), Phase 5 (real-auth / production readiness)
- **Origin:** EPIC-012 DECISION-E, raised upstream as `OQ-012-01` in `.implementation/OPEN-QUESTIONS.md`
- **Question:** EPIC-012's returning-client request path (AC-DOOR-009-03 — "no contact re-entry") resolves the
  client's on-file contact by JOINing through their prior engagement's originating `EngagementRequest`. This is
  sound for the PoC (a "returning" client by definition has prior request history with contact fields), but it
  couples contact resolution to engagement history. Where should a returning client's contact live durably —
  decoupled from any specific prior engagement?
- **Proposed default (non-blocking):** carry to **Phase 5 (real auth)** — model contact as a user-profile
  attribute sourced from the real Clerk profile, decoupling it from `EngagementRequest`. No Phase-3 re-work; the
  JOIN-based resolution is the accepted PoC implementation and **AC-DOOR-009-03 is `verified`**. This is a
  forward product/architecture call, not a planning AC gap — recorded here so it is not lost, not because it
  blocks any current epic. (Not an escalation carve-out: no go-to-market / regulatory / business-model decision.)
- **Resolution:** pending the Phase-5 real-auth decomposition; revisit when the Clerk-profile-attributes epic is authored.
