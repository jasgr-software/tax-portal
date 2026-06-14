# Flow — <short title>

> A **targeted, lightweight** end-to-end flow — the per-slice journey one actor takes through the stack,
> not an exhaustive product-wide flow. Author it for the slice that realizes it and grow it incrementally
> as later epics extend the same journey. Planning-altitude: name the steps and the key branches; do not
> specify screens, endpoints, components, or test code. Filed by kebab-case slug.

- **Actor:** <persona this flow belongs to — `personas/<slug>.md`>
- **Trigger:** <what starts the flow — e.g. visitor submits the request form; accountant accepts a request>
- **Outcome:** <the user-visible end state when the happy path completes>
- **Realized by:** <EPIC-… that delivers this flow (may be more than one as it grows)>

## Happy path
<The ordered steps the actor takes through the stack to reach the outcome. Numbered, one line each.>

1. <step>
2. <step>

## Key branches
<The alternate / error paths that matter at planning altitude — what happens when a step can't complete.
Only the ones worth tracking; not an exhaustive decision tree.>

- **<branch / condition>** → <what happens>

## Acceptance scenarios
<The AC ids whose Given/When/Then scenarios (authored in the realizing epic) cover this flow. The flow
points at them; the scenarios themselves live in the epic.>

- <AC-DOMAIN-NNN-NN> — covered in <EPIC-…>

## Links
- Persona: <`personas/<slug>.md`>
- Epics: <EPIC-… that realize or extend this flow>
- Requirements: <REQ-… this flow exercises>
