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

If two project documents conflict, do not silently choose one. Prefer the more specific and latest documented decision, and flag material ambiguity to the user.

## 3. Required context before coding

For every non-trivial change:

1. Inspect the relevant existing files and architecture.
2. Read the applicable guideline documents before modifying code.
3. Determine whether the requested feature is MVP scope, planned evolution, or speculative.
4. Reuse existing abstractions and conventions.
5. Define expected behavior and acceptance criteria.
6. Make the smallest coherent implementation.
7. Validate with appropriate tests, type checks, linting and/or build checks.

Never invent a parallel architecture when an existing project pattern already solves the problem.

## 4. Source of truth

Use the documents in `global-toothgems-llm-guidelines/` as the detailed project specification. At minimum, consult the project context, architecture/engineering, security/data, UI/UX, e-commerce, learning-platform, internationalization, technical-stack and project-structure documents relevant to the task.

The newer detailed architecture documents currently include:

- `11-technical-stack-and-architecture.md`
- `12-security-and-access-control.md`
- `13-stripe-and-commerce-architecture.md`
- `14-learning-platform-architecture.md`
- `15-internationalization-and-seo.md`

If a referenced document does not exist, do not fabricate its contents. Inspect the available guidelines and continue using the applicable sources.

## 5. Technology baseline

Unless an explicit project decision changes it, the target architecture is:

- Next.js + React + TypeScript.
- Tailwind CSS + shadcn/ui where appropriate.
- Supabase/PostgreSQL for application data.
- Supabase Auth for identity.
- PostgreSQL Row Level Security for database authorization.
- Supabase Storage for application files where appropriate.
- Stripe for payments and Checkout.
- Stripe webhooks as the authoritative trigger for payment fulfillment.
- A mature i18n solution such as `next-intl`.
- Resend/React Email or the documented project email solution.
- Sentry or the documented monitoring solution.
- Vitest and Playwright, or the established project test stack.

Do not introduce Shopify, WooCommerce, Firebase, MongoDB, a second backend framework, microservices or another major infrastructure component merely because it is familiar. A new major dependency requires concrete architectural justification.

Optional technologies such as Mux, Cloudflare, PostHog or Algolia/Typesense are deliberate additions, not defaults.

## 6. Architecture principles

Keep these domains logically separated:

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

Customer identity should be shared across commerce and learning, while commerce and learning remain separate functional domains.

## 7. Security rules

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

Treat these as separate dimensions:

- language;
- country;
- currency;
- tax regime;
- shipping zone.

Customer-facing UI text must be localized rather than hard-coded. Multilingual product/course content should use translation-aware data models rather than language-specific columns such as `name_fr` or `name_en`.

Do not assume language, country and currency are interchangeable.

## 10. Database rules

Use explicit relational models for business-critical data.

Prefer foreign keys, unique constraints, useful check constraints, appropriate indexes, explicit status/state fields and auditable timestamps.

Use JSON/JSONB only when the data is genuinely flexible.

All schema changes must be represented by versioned migrations committed to Git. Do not rely on undocumented production-only schema changes.

## 11. Frontend and UX

The interface must be responsive, accessible and mobile-first where user behavior demands it, especially checkout and course consumption.

Always consider keyboard navigation, visible focus states, sufficient contrast, loading/empty/error states, responsive layouts, reduced layout shift and restrained animation.

Do not hide essential information behind hover-only interactions.

Follow the established Global Toothgems visual direction rather than introducing unrelated design language.

## 12. Code quality

Prefer small cohesive modules, explicit names, typed interfaces, domain-oriented functions, reusable components when reuse is real, tests around business invariants and predictable control flow.

Avoid giant components, duplicated business logic, magic numbers, unnecessary global state, speculative abstractions and premature optimization.

Before adding a dependency, check whether the existing stack already solves the problem.

## 13. Testing and validation

For every meaningful change, choose validation appropriate to its risk. Consider type checking, linting, unit tests, integration tests, end-to-end tests and build validation.

Critical flows include authentication, checkout, payment webhook handling, order fulfillment, course enrollment/access, lesson progress and administrative authorization where implemented.

Never claim a test passed unless it was actually run.

## 14. Git workflow

### Branch model

- `main` is the release branch. Nothing is committed or pushed to `main` directly.
- `dev` is the integration branch. All agent work lands here.
- The `dev` -> `main` pull request is the only pull request in the workflow. An agent may open it when the user asks; only the human maintainer reviews and merges it.

### Agent commit and push policy

This section deliberately overrides the default agent behavior of committing and pushing only when explicitly asked.

When the session runs on `dev`:

1. Commit your work at the end of each turn, without waiting to be asked.
2. Push to `origin dev` immediately after committing.
3. Never push to `main`, never force-push, never rewrite pushed history.
4. Open the `dev` -> `main` pull request only when the user asks for it (`gh pr create --base main --head dev`), not as a draft unless asked, and never merge it. If one is already open, push to `dev` and reuse it.

A `Stop` hook in `.claude/settings.json` performs this commit and push automatically. It never commits on `main`. A `SessionStart` hook switches a clean main checkout to `dev`. Treat it as a safety net, not as a reason to leave the working tree in a half-finished state: everything still in the tree when a turn ends is committed and pushed as-is.

If the session runs on a branch other than `dev` (for example a `claude/*` worktree created by the desktop app, where `dev` cannot be checked out), the `Stop` hook commits there, merges `origin/dev` into it and pushes `HEAD` directly to `origin/dev`. Do not push the worktree branch itself and do not open a pull request targeting `dev`. If that merge conflicts, the hook leaves the commit local: resolve the conflict and push `HEAD:dev` yourself.

### Quality bar

Keep changes focused and reviewable. Do not modify unrelated files merely to clean them up. A turn that ends with unrelated files modified ships those files to `dev`.

Use clear commit messages.

Before the `dev` -> `main` pull request is opened, review the accumulated diff for accidental secrets, unrelated modifications, broken imports, incomplete migrations, missing tests and documentation drift.

## 15. AI agent behavior

AI agents must be explicit about uncertainty.

If a requirement is missing, do not silently invent a business rule that could affect money, permissions, legal/compliance behavior, customer access or data retention. Propose the safest reasonable interpretation and flag the decision.

Do not claim to have inspected, tested, deployed or modified something unless the agent actually did so.

When a task is ambiguous but implementation can safely proceed, make a clearly stated assumption and continue rather than blocking unnecessarily.

When an architectural decision has meaningful long-term consequences, document the decision and its rationale.

## 16. Definition of done

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