# Global Toothgems — LLM Project Guidelines

Detailed, normative rules for coding agents, read on demand. The root `AGENTS.md` is the contract loaded in every session and routes here (its §3). The READMEs of `webapp/` and `supabase/` describe what is implemented; these files say how things must be done.

| File | Read it when the task touches |
| --- | --- |
| `00-project-context.md` | product, brand, audience, tone |
| `01-scope-and-launch.md` | whether something should be built now, launch blockers, roadmap |
| `02-architecture-and-engineering.md` | runtime boundaries (browser / Postgres / Edge Functions / Stripe), mock → live, environments, dependencies |
| `03-ui-ux-design-system.md` | visual identity, components, accessibility, motion |
| `04-ecommerce-rules.md` | catalogue, cart, checkout, Stripe, orders, promotions, gift cards, loyalty, reviews |
| `05-learning-platform-rules.md` | Academy: courses, lessons, quizzes, progress, access, certificates |
| `06-security-privacy.md` | auth, roles and permissions, RLS, storage, uploads, personal data, audit |
| `07-testing-and-quality.md` | which checks to run, test levels, critical journeys |
| `08-content-and-localization.md` | i18n, translations, copy, SEO |
| `09-supabase-workflow.md` | migrations, MCP tools, SQL suites, generated types, Edge Functions, environments |
| `10-agent-workflow.md` | how to plan, implement, validate, report and keep the context current |

Conflict rule: the more specific file wins inside its domain; `01` decides scope; `AGENTS.md` wins over all of them. If you find a real contradiction, follow the most recent explicit decision and tell the user.

History: files `11`–`15` (stack, security, Stripe, learning architecture, i18n/SEO) were merged into `02`, `06`, `04`, `05` and `08`; `01-mvp-requirements` and `09-future-roadmap` became `01-scope-and-launch`. Older code comments citing "guideline 12" refer to what is now `06`.
