# Planning Intake

> The ingestion surface for **raw planning intent** and **ad-hoc requirements**. Read-only to the
> Planning Agent: new intent is *added here*, the agent reads it and folds it into the roadmap — never
> the other way around. This is distinct from `sources.md`, which only declares *where* the requirement
> and architecture sources live. Use this file for planning-level direction the sources don't carry:
> what to ship first, priority calls, and one-off requirements injected outside the requirements source.

## Planning intent

- **Goal:** decompose the requirements (`.requirements/`) and architecture (`.architecture/`) sources
  into a phased roadmap of **vertically-sliced epics**, MVP-first, that drives toward **full acceptance**
  of every requirement's acceptance criteria.
- **MVP shape:** the thinnest end-to-end product that demonstrates the portal's reason to exist — a
  prospective client can walk up to the public front door, see the services offered, and submit an
  engagement request; the accountant can act on it. Earlier phases prove the spine; later phases fill in
  onboarding, the engagement lifecycle, file exchange, messaging, and the dashboard.
- **Slicing principle:** each epic is a thin thread through the whole stack that delivers user-visible
  value on its own — never a horizontal layer ("all the routes", "the schema"). Prefer the smallest
  slice that a real user could exercise end-to-end.
- **Acceptance principle:** an acceptance criterion is "done" only when an automated test tagged with its
  id passes in CI. The roadmap is complete when every in-scope `AC-*` is signed off.

## Ad-hoc requirements

> Inject one-off requirements here that aren't (yet) in the requirements source. The Planning Agent
> places each into the roadmap and flags in its run summary any that imply a requirement the
> requirements source should formally own.

_None yet._

## Priority direction

> Sequencing guidance and priority calls that aren't derivable from the requirements/architecture
> sources alone. The agent treats these as inputs to phase ordering, not as binding commitments —
> release-timing or business commitments are an escalation carve-out and must be confirmed with the user.

- Front-door request capture before accountant-side tooling: a prospective client must be able to reach
  the door and submit a request before the accountant-facing intake/dashboard is built out.
