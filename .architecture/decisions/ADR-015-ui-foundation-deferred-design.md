---
id: ADR-015
title: UI foundation locked, visual design deferred (Tailwind + shadcn/ui in packages/ui, tokens as canonical theme)
status: Accepted
date: 2026-06-14
deciders: [Architecture Agent, user]
related: [ADR-006, ADR-007, ADR-013, ADR-014, TENET-008]
source:
  - seed/tech-stack.md#decided-stack   # UI row "Tailwind CSS + shadcn/ui", governing ADR "—"
  - decisions/ADR-006-monorepo-layout.md   # packages/ui — shadcn primitives, styling contract, theming
  - decisions/ADR-007-container-packaging-deploy-agnostic.md   # mirrors the defer-but-constrain posture
  - decisions/ADR-014-application-framework-nextjs-typescript.md   # React/App Router host for the UI layer
  - https://support.claude.com/en/articles/14604416-get-started-with-claude-design   # forward-constraint rationale for the deferred-UX path
open_decisions: []   # OD-002 (token-contract formalization timing) carries a proposed default — it does not block this decision
---

# ADR-015: UI foundation locked, visual design deferred

**Status:** Accepted
**Date:** 2026-06-14
**Deciders:** Architecture Agent (with user direction)
**Related:** ADR-006 (`packages/ui`), ADR-007 (defer-but-constrain posture — the shape this ADR mirrors), ADR-013 (cloud portability), ADR-014 (Next.js/React host); TENET-008 (no proprietary lock-in)

## Context

`seed/tech-stack.md` lists "UI — Tailwind CSS + shadcn/ui" with `—` in the Governing ADR column. ADR-006 already establishes a shared `packages/ui` holding shadcn/ui primitives with a Tailwind styling contract — but no ADR *decides* the UI layer or its constraints, and the gap invites bespoke styling to creep in component-by-component.

At the same time, **the user has explicitly deferred UX and visual-design work.** Deciding a full design system, component inventory, or visual language now would be premature — that work starts later. This is the same situation ADR-007 faced with the deployment platform: a real decision is not yet ripe, but leaving *everything* open lets the option space erode by accident before the real decision is made.

So this ADR mirrors ADR-007's **defer-but-constrain** posture exactly: **lock the minimal enabling foundation now, defer the design itself, and write down the forward constraints that keep later UX work cheap and the option space intact.**

A specific, named forward force shapes the constraints. The user will *likely* use **Claude Design** (Anthropic's conversational design tool, research preview) for the later UX work. Per Anthropic's docs, Claude Design **reads the code repository** (existing components + architecture), **inherits the org's design system**, lets you **reference components by name**, and can **hand off to Claude Code** for implementation in the existing stack. Its exact code-output format is *not* documented (do not assume it emits React/Tailwind directly). Two things follow:

1. A later-UX path is best served *now* by a **single, well-named, discoverable component library and a documented design-token layer** — so whatever tool reads the repo inherits an *accurate* system, references components by their real names, and round-trips cleanly. This is the architectural reason to lock the foundation today even though design is deferred.
2. Claude Design is **"likely" and research-preview** — a *reinforcing* force, not a hard dependency. This ADR couples to the **portable constraints** it implies (named components, tokens, standard styling) — never to the tool itself. The same foundation serves any later design path (manual, Figma, another tool).

Scope is **how, not what** — this locks the structural foundation and constrains future work; it does not decide any product UX.

## Decision

**We will lock a minimal UI foundation now and defer the visual design. The foundation is the smallest set of structural choices that make later UX work cheap and option-preserving; the design itself is deferred to when UX work starts, constrained by the forward-constraint list below.**

### Decide now — the minimal enabling foundation only

1. **Baseline primitive layer: Tailwind CSS + shadcn/ui.** Utility-first Tailwind for styling; shadcn/ui primitives (copy-in, owned-in-repo components, not a versioned black-box dependency) as the baseline component set. This confirms ADR-006's existing posture as a governed standard.
2. **A single shared component home: `packages/ui`.** Per ADR-006, shared presentational primitives and thin layout shells live **only** in `packages/ui` — one discoverable place, app-neutral, no business logic, no data access, no server actions (the ADR-006 boundary: "if it imports from `@tax-portal/db`, it is not in `packages/ui`"). App-specific composed components stay in their app. There is exactly one component library.
3. **Design tokens are the canonical source for theme/visual decisions.** All theme-level visual values (color, spacing, radius, typography scale, etc.) are expressed as **design tokens** in the Tailwind theme / `packages/ui` shared preset — never hard-coded in component bodies. Tokens are the one place a visual decision is recorded; components consume tokens. (ADR-006 already routes both apps through a shared Tailwind preset with CSS-variable theming — this names that the **canonical token layer**.)
4. **No bespoke styling escape hatches.** No CSS-in-JS runtimes (styled-components, Emotion, etc.), no proprietary component DSLs, no one-off styling patterns that bypass Tailwind + tokens. Styling is Tailwind classes against the token theme. This keeps the system uniform, discoverable, and reproducible by any later design path — and aligns with TENET-008's no-proprietary-runtime stance (a CSS-in-JS runtime is the styling-layer analog of the lock-in this project avoids elsewhere).

### Explicitly defer — the design itself

The following are **not decided here** and are owned by the later UX effort:

- The actual **visual design** and brand language (the concrete palette, type choices, spacing rhythm — i.e. the *values* the tokens will hold).
- The **design system's content**: the full component inventory beyond the shadcn baseline, composition patterns, interaction/motion design.
- Overall **UX** — flows, layouts, information architecture as a designed experience.

The two apps may diverge visually (ADR-006 already allows per-app accents via app-level CSS variables); *how far* they diverge is a deferred UX decision, not an architecture one.

### Forward constraints — the "capability contract" analog (what later UX work must satisfy)

Mirroring ADR-007's host-capability list, later UX work — by hand, with a design tool, or via the likely Claude Design path — **must** satisfy:

1. **Components stay in the single `packages/ui` home and remain well-named and discoverable.** No second component library, no shadow duplicate set in an app. A tool (or a person) reading the repo must find one authoritative library with real, stable component names to reference.
2. **All theme/visual decisions land as tokens in the canonical token layer**, never as hard-coded values scattered in components. The token layer is the design system's machine-readable source of truth.
3. **No bespoke styling primitive is introduced.** New design work expresses itself in Tailwind + tokens + shadcn-shaped primitives. Anything a later tool can't reproduce because it's a one-off styling hack is disallowed.
4. **Design-tool-handoff readiness.** Because the likely path is *tool reads repo → inherits design system by component name → hands off to Claude Code → implement in this stack*, the foundation must keep the repo's component library and token layer accurate and named so the inheritance and round-trip are clean. The path couples to **portable** properties (named components, documented tokens, standard styling) — **not** to any specific tool. If the later tool's code output is not native React/Tailwind (its format is undocumented), the handoff still composes because Claude Code implements *into this stack* — which is exactly why the stack, not the tool, is what we constrain.
5. **The framework host is fixed (ADR-014).** UI work targets React Server/Client Components under the App Router; it does not introduce a parallel rendering model.

### Where a commitment would be premature

Whether `packages/ui` should ship a **formal, exported token contract** (e.g. a published `tokens.ts` / CSS-variable manifest as a stable, documented interface) *before* UX work begins — versus letting the token layer firm up *during* UX work — is a real choice with cost either way. Deciding it now would over-specify the deferred design. Raised as **OD-002** with a proposed default (a lightweight token manifest stub now, formalized when UX starts) so no work is blocked.

## Consequences

- **The UI foundation is now a citable standard.** A change that adds a CSS-in-JS runtime, a second component library, a proprietary component DSL, a one-off styling pattern, or hard-coded theme values bypassing tokens is a **deviation finding** against this ADR (and TENET-008 for the proprietary-runtime cases).
- **The visual design stays genuinely open.** Nothing here decides palette, type, or component inventory — the deferral is real, matching ADR-007's deployment deferral. UX work starts unconstrained *in its design choices* but constrained *in its structural expression*.
- **Later UX work is cheaper and tool-ready.** A single named library + canonical tokens is exactly what a repo-reading, component-name-referencing design tool inherits cleanly — and what a human designer or any other tool benefits from equally. The bias is paid for now in discipline (no bespoke styling), not in code.
- **No coupling to Claude Design.** This ADR does not depend on Anthropic's tool, its availability, or its output format. If the user uses a different path, every constraint still holds because they are stack-portable, not tool-specific.
- **One open decision is parked, not blocking.** OD-002 (token-contract formalization timing) carries a proposed default; this ADR is Accepted because the default unblocks any work that starts before UX.
- **Confirms, does not contradict, ADR-006.** ADR-006 created `packages/ui` and its styling contract; this ADR elevates that to a governed standard and adds the no-bespoke-styling + tokens-as-canonical constraints and the forward-constraint list. No ADR-006 edit (ADRs are immutable); this `related:`-links it.

## Alternatives considered

- **Author a full UI-stack ADR now (decide the design system + visual design).** Rejected — directly contradicts the user's explicit deferral of UX work, and would bake in palette/type/component-inventory decisions before any UX research. This is the ADR-007 mistake in reverse: deciding the deferred thing prematurely.
- **Defer the UI layer entirely (decide nothing now).** Rejected — leaving the foundation open lets bespoke styling, a CSS-in-JS runtime, or a duplicate component set creep in before UX work starts, eroding the option space and making any later tool's repo inheritance inaccurate. ADR-007 showed the answer: defer the decision, lock the constraints.
- **Lock the foundation but couple it to Claude Design specifically.** Rejected — Claude Design is "likely" and research-preview, and its code-output format is undocumented. Coupling an Accepted ADR to a preview tool is the kind of dependency TENET-008 warns against. We couple to the portable constraints the tool *implies* (named components, tokens, standard styling), which serve any design path.
- **Allow a CSS-in-JS runtime (styled-components / Emotion) for ergonomic theming.** Rejected — it is a proprietary styling runtime (the styling analog of the runtimes TENET-008 keeps out of app code), it fragments the styling story away from Tailwind + tokens, and it produces components a repo-reading design tool cannot reliably reproduce. Tailwind + CSS-variable tokens cover the theming need without the runtime.
- **Tokens as an afterthought (hard-code visual values, extract tokens later).** Rejected — the canonical-token-layer constraint is the cheapest thing to honor now and the most expensive to retrofit. A design tool inherits a system *by its tokens and component names*; building those in from the start is what makes the deferred-UX path clean. (The remaining question — how *formal* the token contract should be pre-UX — is the narrow, genuinely-premature slice raised as OD-002, not the whole tokens-as-canonical decision.)
