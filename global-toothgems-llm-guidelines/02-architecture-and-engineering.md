---
name: global-toothgems-architecture-engineering
description: Engineering principles, architecture rules, maintainability and implementation standards for Global Toothgems.
---

# Architecture & Engineering Rules

## General

Build production-quality software, not a prototype disguised as production.

Priorities:
1. correctness;
2. security;
3. maintainability;
4. accessibility;
5. performance;
6. developer experience.

Do not over-engineer MVP features.

## Before coding

For every non-trivial change:
1. inspect the existing repository;
2. identify the relevant domain/module;
3. reuse existing patterns;
4. verify whether the requested behavior is MVP or roadmap;
5. define acceptance criteria;
6. implement the smallest coherent change;
7. test it.

Never create a parallel implementation when an existing abstraction already solves the problem.

## Domain separation

Keep these concerns logically separated:
- catalog/products;
- customers/accounts;
- cart/checkout/orders;
- payments;
- reviews;
- newsletter/marketing consent;
- courses;
- lessons;
- quizzes;
- learning progress;
- administration.

Do not couple unrelated domains through UI state.

## Data model

Prefer explicit domain models over unstructured blobs.

Important invariants:
- money must never rely on floating-point arithmetic;
- order totals must be reproducible;
- purchased training access must remain auditable;
- course progress must be persisted;
- review publication state must be controllable;
- user authorization must be enforced server-side.

## Configuration

No secrets in source code.
No production credentials in client-side bundles.
Use environment/configuration mechanisms appropriate to the deployment platform.

## API/server rules

Validate all untrusted input.
Enforce authorization server-side.
Never trust client-calculated prices, permissions, completion states or payment statuses.

## Frontend rules

- Responsive by default.
- Mobile-first for checkout and training consumption.
- Accessible keyboard navigation.
- Visible focus states.
- Loading/error/empty states.
- Avoid layout shifts.
- Avoid excessive animation.
- Do not hide essential information behind hover-only interactions.

## Performance

Optimize real bottlenecks rather than prematurely optimizing everything.

Pay particular attention to:
- product images;
- course videos;
- public page loading;
- checkout;
- mobile networks.

Use lazy loading where appropriate.
Do not load large admin/training bundles on public storefront pages unnecessarily.

## Error handling

Errors should:
- be understandable to users;
- not expose internals;
- be logged with enough diagnostic context;
- preserve user data when safe.

Never expose stack traces, SQL errors, provider secrets or internal identifiers unnecessarily.

## Dependencies

Before adding a dependency:
- verify that an existing dependency cannot solve the need;
- verify maintenance/activity;
- check security implications;
- keep the dependency scope narrow.

Avoid dependencies solely for trivial helpers.

## Code quality

Prefer:
- small cohesive modules;
- explicit naming;
- predictable control flow;
- typed interfaces where the stack supports typing;
- domain-oriented functions;
- tests around business invariants.

Avoid:
- giant components;
- duplicated business rules;
- magic numbers;
- implicit global state;
- speculative abstractions.
