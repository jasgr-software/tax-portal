# Open Decisions

Open architectural decisions the Architecture Agent could not resolve on its own, plus deviations logged
during design/code review. Each open decision carries a **proposed default** so downstream work is never
blocked — except **escalation carve-out** items (security posture, data retention/deletion, encryption,
the auth/authorization model, the trust boundary, regulatory constraints), which require a user decision
and carry no default.

An ADR blocked by an open decision lists its `OD-NNN` in `open_decisions:` and sits at `status: Proposed`
until the decision is resolved. A deviation finding may be tracked here when it is not resolved within a
single review (e.g. a standard-is-stale item awaiting a superseding ADR).

Status: `open` → `resolved`.

---

<!-- No open decisions yet. The 12 migrated ADRs (ADR-001 … ADR-012) were Accepted under the SA's prior
     ownership and carry no open decisions. New entries use _templates/open-decision.md. -->
