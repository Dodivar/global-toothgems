---
name: global-toothgems-testing-quality
description: Testing strategy, acceptance criteria and quality gates for Global Toothgems.
---

# Testing & Quality

## Testing pyramid

Use the appropriate level:
- unit tests for business rules;
- integration tests for persistence/API boundaries;
- end-to-end tests for critical user journeys.

Do not replace all testing with end-to-end tests.

## Critical e-commerce journeys

At minimum cover:
1. browse product;
2. product detail;
3. add to cart;
4. update cart;
5. checkout;
6. successful payment state;
7. failed/cancelled payment state;
8. order visible in account.

## Critical training journeys

At minimum cover:
1. customer logs in;
2. purchased course appears;
3. learner opens course;
4. progress is recorded;
5. quiz answer is evaluated;
6. incorrect-answer feedback appears;
7. gated next step remains inaccessible until prerequisite completion;
8. course completion is persisted.

## Authorization tests

Explicitly test that a customer cannot access:
- another customer's order;
- another customer's progress;
- another customer's private data;
- unpublished course content;
- admin functions.

## UI tests

Verify:
- mobile;
- desktop;
- keyboard;
- loading;
- error;
- empty states.

## Regression rule

Every bug fix should include a regression test when practical.

## Definition of done

A feature is not done merely because it renders.

It is done when:
- acceptance criteria pass;
- authorization is correct;
- error states are handled;
- responsive behavior is checked;
- relevant tests pass;
- no obvious regression is introduced;
- customer-facing text is localized where required.
