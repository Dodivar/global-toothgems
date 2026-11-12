# PostHog project setup (owner checklist)

What has to be switched on or created **in the PostHog app** (EU cloud, `eu.posthog.com`) for the code of 2026-11-12 to give its full value. Nothing here is done by code. Menu names follow the PostHog app as of 2026-11; if one moved, the setting keeps the same name (use the app's search).

Event lists: `docs/shop-analytics.md`, `docs/academy-analytics.md`, `docs/studio-trial-analytics.md`. Code: `webapp/src/lib/posthog*.ts`, `analyticsCore.ts`.

## 1. Project settings (once, ~10 min)

| Where | What | Why |
| --- | --- | --- |
| Settings › Project › Session replay | **Record user sessions: on.** Leave canvas capture off. Leave "Mask all inputs" on (the code forces it anyway). | The code starts recordings only with consent and only on the zones of `replayAllowed()`; without this switch nothing is recorded. |
| Settings › Organization › Billing (or Session replay) | Check the replay **retention**. | The cookie policy says recordings are kept at most 30 days. If the plan keeps them longer, lower it or have the policy changed. |
| Settings › Project › Product analytics › "Filter out internal and test users" | Add two filters: event property `is_staff` **is not** `true`; event property `app_environment` **equals** `production`. Then tick "Filter out internal and test users" by default on new insights. | Removes the team's visits and the preview / local deployments from every chart. |
| Settings › Project › Error tracking (Alerting) | An alert by e-mail on **new issues**. | A new production error reaches you without opening PostHog. |
| Settings › Project › Web analytics | Nothing to change; the built-in dashboard already reads the UTM tags of the ad links. | Ad and social traffic per campaign. |
| People › Persons (optional) | Persons identified before 2026-11-12 still carry `email` / `name`: delete those two properties on the persons that have them, or leave them. | The code no longer sends them; data minimisation. |

## 2. Dashboard "Production health"

Dashboards › New dashboard › "Production health". Add these insights (each: New insight, then "Add to dashboard"), all with internal users filtered out:

1. **Shop funnel** — Funnel, conversion window 1 day: `product_added_to_cart` → `checkout_started` → `payment_step_opened` → `payment_submitted` → `order_completed`.
2. **Orders per day** — Trends, `order_completed`, total count, daily, breakdown `paid_with`.
3. **Payment failures** — Trends, `payment_failed`, breakdown `stage`; a second one filtered on `stage = confirm`, breakdown `decline_code`.
4. **Checkout errors** — Trends, `checkout_failed`, breakdown `reason`.
5. **Sign-in health** — Trends, `auth_sign_in`, breakdown `outcome`.
6. **Errors** — Trends, `$exception`, daily (or pin the Error tracking list).
7. **Learning funnel** — Funnel, window 30 days: `academy_course_started` → `academy_step_completed` → `academy_course_completed`, breakdown `course_id`.
8. **Studio trial funnel** — as in `docs/studio-trial-analytics.md`: `studio_trial_started` → `studio_first_design_saved` → `studio_subscription_plans_viewed` → `studio_subscription_completed`.

## 3. Alerts (on saved Trends insights: the bell icon › New alert, by e-mail)

| Insight | Condition | Means |
| --- | --- | --- |
| `order_completed`, daily | below 1 over the last day (once sales have started) | checkout, Stripe or the webhook may be down |
| `payment_failed` where `stage = load`, hourly | above 3 | the Stripe form does not load |
| `payment_confirmation_slow`, hourly | above 0 | the webhook is late or failing |
| `auth_sign_in` where `outcome = captcha`, hourly | above 5 | Turnstile refuses real people |
| `auth_sign_up` where `outcome = emailSend`, daily | above 0 | the confirmation e-mail does not leave |
| `$exception`, hourly | well above the usual level | a release broke something |

## 4. Habits

- **Replays from a funnel**: in a funnel, click the drop between two steps › "Watch recordings" to see what people did there.
- **Annotations**: Product analytics › Annotations › add one at each production release ("Release 2026-11-20 — new cart"), so a curve change can be tied to it.
- **Surveys** (later): a one-question survey at the end of the Studio trial or after a certificate; the cookie policy would need one more sentence first.
- **Consent sample**: PostHog only sees visitors who accepted analytics. Use it for rates and friction; the money of record is `/admin/statistiques` and Stripe.

## 5. Still pending in code (owner's call)

- **Source maps** (readable stack traces): needs a PostHog personal API key with error-tracking write scope, set on Vercel as a build variable, and the `@posthog/nextjs-config` package (it downloads the PostHog CLI at install). Ask an agent once the key exists.
- **Person deletion on account erasure** (decision 125 (f)): the `delete-account` function could delete the PostHog person with the same kind of key; today it is done by hand on request.
