---
id: CS-INFRA-002
title: Package the app as a multi-stage, deploy-agnostic OCI image
language: infra
polarity: do
rating: recommended
status: active
verification: The application Dockerfile is multi-stage (build stage separate from a slim runtime stage) and carries no host-platform coupling (no provider-specific base image or baked-in deploy assumptions), per ADR-007. A reviewer confirms the image builds and runs against the local compose stack and pins no specific production platform.
source:
  - ADR-007
related: [CS-INFRA-001]
rating_history:
  - { rating: recommended, date: 2026-06-20, by: agent, rationale: "born recommended — ADR-007 sets the deploy-agnostic OCI packaging direction; production platform is explicitly deferred, so this is a should, not a hard gate yet" }
open_questions: []
---

# CS-INFRA-002 — Package the app as a multi-stage, deploy-agnostic OCI image

## Rule
Per **ADR-007**, package the application as a **multi-stage** OCI container — a build stage separate from a
slim runtime stage — with **no coupling to a specific production host**. The deploy platform is deferred;
the image must satisfy a generic OCI capability contract rather than any one provider's conventions.

## Rationale
A multi-stage build keeps the runtime image small and free of build toolchain; deploy-agnostic packaging
keeps the eventual production-platform choice open (ADR-007) instead of baking in a host that hasn't been
chosen.

## Verification
Confirm the Dockerfile has distinct build and runtime stages, uses a neutral base image, and runs against
the local docker-compose stack. The evidence hook is ADR-007's capability contract — no provider-specific
assumptions in the image.

## Examples
- do: `FROM node:20 AS build` … `FROM node:20-slim AS runtime` (copy only built artifacts into runtime)
- don't: a single-stage image that ships the full build toolchain, or a provider-specific runtime base

## Links
- Source: ADR-007 (container packaging, deploy-agnostic)
- Related: CS-INFRA-001
- Open questions: none
