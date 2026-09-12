# Global Toothgems — AI Agent Instructions

This file is the root operating contract for AI coding agents working in this repository.

## 1. Mission

Global Toothgems is a premium but approachable e-commerce and online-training platform focused on tooth gems and professional education.

The application must be built as production software: secure, maintainable, accessible, performant and internationally ready without over-engineering the MVP.

## 2. Instruction hierarchy

When working on the repository, use this order of authority:

1. Explicit instructions from the user for the current task.
2. This `AGENTS.md` file.
3. The detailed documents in `global-toothgems-llm-guidelines/`.
4. Existing project architecture and established repository conventions.
5. General framework/library best practices.

If two project documents conflict, do not silently choose one. Identify the conflict, prefer the more specific/latest documented decision, and flag the ambiguity to the user when it materially affects implementation.

## 3. Required context before coding

For every non-trivial change:

1. Inspect the relevant existing files and architecture.
2. Read the applicable guideline documents before modifying code.
3. Determine whether the requested feature is MVP scope, a planned evolution, or speculative.
4. Reuse existing abstractions and conventions.
5. Define the expected behavior and acceptance criteria.
6. Make the smallest coherent implementation.
7. Validate with appropriate tests, type checks, linting and/or build checks.

Never invent a parallel architecture when an existing project pattern already solves the problem.

## 4. Source of truth documents

Read these documents according to the task:

- `global-toothgems-llm-guidelines/00-project-context.md` — product, brand, scope and UX context.
- `global-toothgems-llm-guidelines/01-product-requirements.md` — product requirements and boundaries.
- `global-toothgems-llm-guidelines/02-architecture-and-engineering.md` — engineering principles.
- `global-toothgems-llm-guidelines/03-security-and-data.md` — security and data rules.
- `global-toothgems-llm-guidelines/04-ai-development-workflow.md` — AI collaboration workflow.
- `global-toothgems-llm-guidelines/05-ui-ux-and-design-system.md` — interface and design requirements.
- `global-toothgems-llm-guidelines/06-ecommerce-requirements.md` — commerce behavior.
- `global-toothgems-llm-guidelines/07-learning-platform-requirements.md` — training/LMS behavior.
- `global-toothgems-llm-guidelines/08-internationalization-and-localization.md` — localization requirements.
- `global-toothgems-llm-guidelines/09-technical-stack.md` — technology decisions.
- `global-toothgems-llm-guidelines/10-project-structure.md` — repository/application structure.
- `global-toothgems-llm-guidelines/11-technical-stack-and-architecture.md` — detailed technical architecture.
- `global-toothgems-llm-guidelines/12-database-and-data-model.md` — database and domain model requirements.
- `global-toothgems-llm-guidelines/13-security-and-access-control.md` — authorization and security architecture.
- `global-toothgems-llm-guidelines/14-stripe-and-commerce-architecture.md` — payments, orders and fulfillment.
- `global-toothgems-llm-guidelines/15-learning-platform-architecture.md` — LMS architecture.
- `global-toothgems-llm-guidelines/16-internationalization-and-seo.md` — international SEO and localization.

If a referenced document does not exist, do not fabricate its contents. Inspect the available guidelines and continue using the applicable sources.

## 5. Technology baseline

Unless an explicit project decision changes it, the target architecture is:

- Next.js + React + TypeScript for the application.
- Tailwind CSS + shadcn/ui for the UI layer where appropriate.
- Supabase/PostgreSQL for application data.
- Supabase Auth for identity.
- PostgreSQL Row Level Security for database authorization.
- Supabase Storage for application files where appropriate.
- Stripe for payments, Checkout and payment-related workflows.
- Stripe webhooks as the authoritative trigger for payment fulfillment.
- A proper i18n solution such as `next-intl` for application translations.
- Resend/React Email or the documented project email solution for transactional messaging.
- Sentry or the documented monitoring solution for production error monitoring.
- Vitest and Playwright, or the established project test stack, for automated testing.

Do not introduce Shopify, WooCommerce, Firebase, MongoDB, a second backend framework, microservices or another major infrastructure component merely because it is familiar. A new major dependency requires a concrete architectural justification.

Optional technologies such as Mux, Cloudflare, PostHog or Algolia/Typesense must be treated as deliberate additions, not defaults.

## 6. Architecture principles

Keep the following domains logically separated:

- catalog/products;
- customers/accounts;
- cart/checkout;
- orders/fulfillment;
- payments;
- reviews;
- marketing/consent;
- courses;
- lessons;
- quizzes;
- learning progress;
- certificates;
- administration.

A single Next.js application may contain these domains, but domain boundaries must remain explicit in code and data.

The customer identity should be shared across commerce and learning, while commerce and learning remain separate functional domains.

## 7. Security rules

Security is a first-class requirement.

- Never trust client-calculated prices, permissions, payment states or completion states.
- Validate all untrusted input server-side.
- Enforce authorization server-side and, where applicable, with PostgreSQL RLS.
- Never put secrets in source code or client bundles.
- Never expose private paid training media publicly.
- Use signed/private access mechanisms for protected resources.
- Protect administrative operations with explicit RBAC.
- Record security-sensitive administrative actions in audit logs where required.
- Do not expose stack traces, SQL errors, provider secrets or unnecessary internal identifiers to users.

## 8. Payments and orders

Stripe is the financial/payment source of truth; Supabase is the application/business-data source of truth.

Never grant purchased access solely because a customer returned from Stripe Checkout successfully. Fulfillment must be driven by verified Stripe webhook events and be idempotent.

Historical orders must preserve the actual monetary values used at purchase time, including currency, prices, discounts and applicable tax information.

Money must use integer minor units plus an explicit currency code. Never use floating-point arithmetic for monetary values.

## 9. Internationalization

Design for international commerce from the beginning.

Treat these as separate dimensions:

- language;
- country;
- currency;
- tax regime;
- shipping zone.

Customer-facing UI text must be localized rather than hard-coded. Product/course content that is multilingual should use translation-aware data models rather than language-specific columns such as `name_fr` or `name_en`.

Do not assume that language, country and currency are interchangeable.

## 10. Database rules

Use explicit relational models for business-critical data.

Prefer:

- foreign keys;
- unique constraints;
- check constraints where useful;
- appropriate indexes;
- explicit status/state fields;
- auditable timestamps.

Use JSON/JSONB only when the data is genuinely flexible.

All schema changes must be represented by versioned migrations committed to Git. Do not rely on undocumented production-only schema changes.

## 11. Frontend and UX

The interface must be responsive, accessible and mobile-first where user behavior demands it, especially checkout and course consumption.

Always consider:

- keyboard navigation;
- visible focus states;
- sufficient contrast;
- loading states;
- empty states;
- error states;
- responsive layouts;
- reduced layout shift;
- restrained animation.

Do not hide essential information behind hover-only interactions.

Follow the established Global Toothgems visual direction rather than introducing unrelated design language.

## 12. Code quality

Prefer:

- small cohesive modules;
- explicit names;
- typed interfaces;
- domain-oriented functions;
- reusable components when reuse is real;
- tests around business invariants;
- predictable control flow.

Avoid:

- giant components;
- duplicated business logic;
- magic numbers;
- unnecessary global state;
- speculative abstractions;
- premature optimization.

Before adding a dependency, check whether the existing stack already solves the problem.

## 13. Testing and validation

For every meaningful change, choose validation appropriate to its risk.

At minimum, consider:

- TypeScript/type checking;
- linting;
- unit tests for business logic;
- integration tests for database/payment workflows;
- end-to-end tests for critical customer journeys;
- build validation.

Critical flows include, where implemented:

- authentication;
- checkout;
- payment webhook handling;
- order fulfillment;
- course enrollment/access;
- lesson progress;
- administrative authorization.

Never claim a test passed unless it was actually run.

## 14. Git workflow

Keep changes focused and reviewable.

Do not modify unrelated files merely to clean them up.

Use clear commit messages. Prefer feature/fix/docs branches and pull requests for meaningful changes.

Before opening a PR, review the diff for:

- accidental secrets;
- unrelated modifications;
- broken imports;
- incomplete migrations;
- missing tests;
- documentation drift.

## 15. AI agent behavior

AI agents must be explicit about uncertainty.

If a requirement is missing, do not silently invent a business rule that could affect money, permissions, legal/compliance behavior, customer access or data retention. Propose the safest reasonable interpretation and flag the decision.

Do not claim to have inspected, tested, deployed or modified something unless the agent actually did so.

When a task is ambiguous but implementation can safely proceed, make a clearly stated assumption and continue rather than blocking unnecessarily.

When an architectural decision has meaningful long-term consequences, document the decision and its rationale.

## 16. Definition of done

A change is not considered complete merely because the code compiles.

Before declaring completion, verify as applicable:

- requirements are satisfied;
- architecture remains coherent;
- authorization is enforced;
- validation exists for untrusted input;
- monetary logic is safe;
- i18n has not been bypassed;
- migrations are included when needed;
- tests/checks have been run;
- documentation is updated when behavior or architecture changed;
- no secrets or sensitive data were introduced;
- the final diff contains only intended changes.

## 17. When in doubt

Prefer the solution that is:

**simpler → safer → more explicit → easier to test → easier to maintain → easier to internationalize.**

Do not optimize for cleverness. Optimize for a reliable product that future developers and AI agents can understand.