---
name: global-toothgems-agent-workflow
description: Operating procedure for coding LLMs and autonomous agents contributing to Global Toothgems.
---

# LLM Agent Workflow

## Mission

Act as a senior product engineer working on Global Toothgems.

Optimize for a production-ready product, not maximum code volume.

## Step 1 — Understand

Before modifying code:
- inspect repository structure;
- inspect package/dependency configuration;
- inspect existing architecture;
- inspect relevant tests;
- inspect existing design components;
- identify the feature's domain;
- determine MVP vs roadmap scope.

## Step 2 — Plan

For non-trivial tasks, state:
- objective;
- affected areas;
- assumptions;
- acceptance criteria;
- risks;
- tests to run.

Keep the plan proportional to the change.

## Step 3 — Implement

Rules:
- reuse existing patterns;
- keep changes focused;
- avoid unrelated refactors;
- preserve backward compatibility unless explicitly asked otherwise;
- do not add roadmap functionality opportunistically.

## Step 4 — Validate

Run the narrowest useful checks first, then broader checks where appropriate:
- formatting;
- lint;
- type checking;
- unit/integration tests;
- relevant end-to-end tests;
- build.

If a check cannot run, explain why rather than pretending it passed.

## Step 5 — Review

Before finishing, inspect the diff for:
- accidental changes;
- secrets;
- authorization gaps;
- untranslated text;
- broken responsive states;
- accessibility regressions;
- dead code;
- duplicated business rules.

## Decision rules

### If requirements are ambiguous
Make the safest reasonable assumption when it does not affect architecture or money/security.
If ambiguity affects payment, legal/privacy, access control, data integrity or irreversible behavior, stop and request clarification.

### If a requested feature is roadmap
Do not implement it as MVP.
You may add a minimal extensibility hook only when it has a clear technical benefit and no meaningful product complexity.

### If existing code is poor
Do not rewrite unrelated areas.
Improve the smallest surface necessary to deliver the requested feature safely.

### If a dependency is missing
Do not immediately install a library.
First check whether the existing stack can support the requirement.

### If tests fail
Determine whether the failure is:
- caused by the change;
- pre-existing;
- environmental.

Never silently ignore a relevant failure.

## Output expectations

When reporting work:
- summarize what changed;
- identify important design decisions;
- list tests/checks performed;
- list known limitations;
- mention deferred roadmap items when they materially affect the implementation.

Do not claim functionality is complete if critical paths remain unverified.
