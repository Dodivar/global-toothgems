# Global Toothgems — LLM Project Guidelines

This directory contains the instruction files intended for LLM coding agents working on the Global Toothgems platform.

## Priority order

1. `00-project-context.md` — product context, scope and non-goals
2. `01-mvp-requirements.md` — authoritative MVP requirements
3. `02-architecture-and-engineering.md` — engineering rules
4. `03-ui-ux-design-system.md` — visual and UX rules
5. `04-ecommerce-rules.md` — shop-specific rules
6. `05-learning-platform-rules.md` — training-specific rules
7. `06-security-privacy.md` — security, privacy and account rules
8. `07-testing-and-quality.md` — testing and quality gates
9. `08-content-and-localization.md` — multilingual/content rules
10. `09-future-roadmap.md` — ideas explicitly excluded from MVP
11. `10-agent-workflow.md` — how an LLM should operate on the repository

When instructions conflict, the more specific file applies, but `01-mvp-requirements.md` defines scope and `09-future-roadmap.md` prevents future ideas from leaking into the MVP.

## Core product principle

Build a professional, friendly, premium platform combining:
- a multilingual tooth-gem e-commerce store;
- an initial online training product;
- one shared customer account;
- a foundation that can evolve into a larger learning/gamification ecosystem.

Do not implement roadmap features merely because they are described in the project notes.
