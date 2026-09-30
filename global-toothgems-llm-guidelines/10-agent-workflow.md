---
name: global-toothgems-agent-workflow
description: Operating procedure for coding agents — understand, plan, implement, validate, review, report, and keep the shared context current.
---

# Agent Workflow

Act as a senior product engineer industrialising Global Toothgems for production. Optimize for a reliable product, not for code volume.

## 1. Understand (proportional to the task)

- Read `AGENTS.md` §4 (domain status) and the guideline(s) routed by §3 — not every file.
- Open the READMEs by section (`grep -n '^##' webapp/README.md supabase/README.md`), then the code: the domain's store in `webapp/src/lib/`, its mapping module and tests, the screen, the related migrations.
- For database work, check the live schema (Supabase MCP, read-only) rather than assuming.
- Classify the request: launch blocker, live-domain improvement, post-launch, or new (`01-scope-and-launch.md`).

## 2. Plan

For non-trivial tasks, state briefly: objective, affected layers (browser / Postgres / Edge Function / Stripe), assumptions, acceptance criteria, risks (money, access, data), checks to run. Keep it proportional; do not ask for confirmation of a plan unless a decision belongs to the user (money rules, legal/consent, permissions, retention, irreversible data changes, new infrastructure).

## 3. Implement

- Real backend first: schema/function → types → store → UI. Follow the mock → live pattern (`02`).
- Reuse existing patterns and components; keep changes focused; no unrelated refactors.
- Remove the mock path you replaced; do not leave two ways of doing the same thing.
- No roadmap features opportunistically; no minimal "placeholder" UI for things that do not work.

## 4. Validate

Narrowest useful checks first, then broader (`07-testing-and-quality.md`): lint, unit tests, SQL suite, build. If a check cannot run, say why. When a failure appears, determine whether your change caused it, it pre-existed, or it is environmental — never ignore it silently.

## 5. Review your diff

Accidental changes, secrets, authorization gaps (RLS, function checks), untranslated strings, missing `en`/`fr` keys, broken responsive states, accessibility regressions, dead mock code, duplicated business rules, migration/type/README drift.

## 6. Commit, push, report

- Commit and push per `AGENTS.md` §14 with a clear English message you wrote.
- Report to the user in their language, concisely:
  - what changed and where it now runs (live vs still mock);
  - checks run and their real results;
  - **decisions to confirm** (anything you assumed about money, legal, access, retention);
  - known limitations and the natural next step.

## 7. Keep the context current

The next agent starts from `AGENTS.md`, these guidelines and the READMEs. In the same commit as your change:

- update the domain status table in `AGENTS.md` §4 when a domain changes state;
- update the relevant README section (remove statements that became false, especially "mock"/"not connected" lines);
- update a guideline only when a rule or decision changed — they hold rules, not changelogs;
- keep documents short: replace outdated text rather than appending history.

## Decision rules

- **Ambiguous but safe:** make the safest reasonable assumption, state it, continue.
- **Ambiguous and touching payment, legal/privacy, access control, data integrity or irreversible behaviour:** ask before implementing, or implement the most restrictive reversible option and flag it.
- **Existing code is poor:** improve only the surface needed to deliver safely.
- **Missing dependency:** first check whether the stack can do it.
- **The user asks for a mockup explicitly:** build it, label it clearly as non-functional in the UI and the README, and keep it out of the production path.
