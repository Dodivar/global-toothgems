# 3D Studio trial — analytics reference

How the 48-hour free trial of the 3D Studio is measured (decision 93 in `supabase/README.md`). Two sources, each
used for what it can know for sure:

| Source | What it holds | Who sees it |
| --- | --- | --- |
| Database (`studio_trials`, `studio_subscriptions`) | Every trial (start, end, first saved design) and every subscription — complete, no consent needed (it is the service itself) | `/admin/statistiques`, panel "3D Studio free trial" (`lib/adminStudioTrials.ts`) |
| PostHog, events `studio_*` | Offer views, sessions, return visits, designs created / edited, features used, warnings, locked screen, plan clicks | PostHog, **only for visitors who accepted analytics cookies** (`lib/studioAnalytics.ts`) |

Because PostHog only sees consenting visitors, use the database for counts of trials and conversions, and PostHog
for rates *within* the consenting population (both sides of a ratio from PostHog). Never mix a PostHog numerator
with a database denominator.

## Events

Sent by `trackStudio()` / `trackStudioOnce()` (never throw, never block the Studio or checkout). Every event
carries: `access_state`, `trial_started_at`, `trial_expires_at`, `hours_since_trial_start`, `hours_remaining`,
`subscription_plan`, `device_category` (mobile / tablet / desktop), `app_environment`. PostHog adds its own person
id, timestamp and acquisition properties (UTM, referrer). Nothing personal or creative is sent: no e-mail, name or
design content.

| Event | When | Deduplication | Extra properties |
| --- | --- | --- | --- |
| `studio_trial_offer_viewed` | The trial invitation is shown | once per tab | — |
| `studio_trial_started` | `start_studio_trial()` created the trial (`started = true`) | the database: only one call can be true | — |
| `studio_session_started` | The editor opens with access | a reload or remount within 30 min continues the session | `session_id`, `is_first_session` |
| `studio_return_visit` | A session starts more than 30 min after the trial began | with the session | `session_id` |
| `studio_session_ended` | The page is left or the editor closes | once per session | `session_id`, `session_seconds` |
| `studio_design_created` | Gems land on an empty, unsaved scene | per occurrence | `session_id` |
| `studio_first_design_created` | The first such design | once per account and browser | — |
| `studio_feature_used` | First use of a feature in a session: `place_gem`, `gem_group`, `model`, `lighting`, `lasso`, `multi_select`, `client_name`, `undo` | once per feature and session | `feature`, `session_id` |
| `studio_design_saved` | A save succeeded | per save | `piece_count`, `is_new` |
| `studio_design_edited` | A saved design was saved again | per save | `piece_count` |
| `studio_first_design_saved` | The first successful save | once per account and browser | `piece_count`, `is_new` |
| `studio_trial_expiration_warning_shown` | The last-hours reminder appears | once per trial and browser | — |
| `studio_trial_expired` | The state is read as `trial_expired` | once per trial and browser | `observed_in_studio` (ran out while open) |
| `studio_trial_access_blocked` | The locked screen is shown | once per tab and state | `state` |
| `studio_subscription_plans_viewed` | The plans are shown on the locked screen | once per tab | `surface` |
| `studio_subscription_cta_clicked` | A plan's button is pressed by a signed-in member | per click | `plan_id`, `interval`, `price_minor`, `currency`, `surface` (`studio_locked`, `studio_page`, `studio_subscribe_page`), `checkout_available` |
| `studio_checkout_started` | `create-studio-subscription` opened a payment step and the payment form shows on the page | per checkout | `plan_id`, `interval`, `price_minor`, `currency`, `surface` |
| `studio_checkout_failed` | The function refused or could not open the checkout, or could not record the request for immediate access before paying | per failure | same + `reason` (`terms_required`, `already_subscribed`, `plan_unavailable`, `payment_unavailable`, `network`, …) |
| `studio_checkout_canceled` | The member leaves the payment step ("Change plan") | per step left | `plan_id`, `interval`, `surface` |
| `studio_subscription_completed` | Paid on the page (or back from a 3-D Secure redirect), on `?subscription=success`, **and** the database (fed by the verified webhook) reads the account as `subscribed` | once per subscription period and browser | `plan_id`, `interval`, `surface`, `source` = `verified_state` |
| `studio_access_check_failed` | Reading the state or starting the trial failed | per failure | `operation` |
| `studio_access_denied` | The database refused a write (42501) | per refusal | `operation` |
| `studio_access_restored` | Access came back after a locked state (subscription) | per transition | `from_state` |

`studio_subscription_completed` is sent by the browser (so it respects the analytics consent like every other
event), but only once the verified state flips to `subscribed` — never because the return address says
`success`. Renewals cause no return to the site, so the event counts new subscriptions only. The complete count of
new subscriptions and renewals is in the database: `studio_subscription_invoices.billing_reason`
(`subscription_create` = new, `subscription_cycle` = renewal, `subscription_update` = plan change), written by the
webhook (decision 94).

## Metrics

Unique-person denominators, cohort = trials started in the period. "PostHog" metrics are computed on consenting
people only.

| Metric | Definition | Source |
| --- | --- | --- |
| Trial starts | Trials started in the period | Database |
| Active trials | Trials with `now() < trial_expires_at` | Database |
| Trial activation rate | Unique people with `studio_trial_started` / unique people with `studio_trial_offer_viewed` | PostHog |
| First-design save rate | Cohort with `first_creation_at` / cohort | Database |
| Time to first saved design | Median `first_creation_at − trial_started_at` | Database |
| First-design creation rate, time to first design | `studio_first_design_created` people / `studio_trial_started` people; median gap | PostHog |
| Average sessions | `studio_session_started` count / people with `studio_trial_started` | PostHog |
| Return rate | People with `studio_return_visit` / people with `studio_trial_started` | PostHog |
| Feature adoption | People with `studio_feature_used` (feature = X) / people with `studio_trial_started` | PostHog |
| Trial expiration rate | Cohort trials ended without a subscription / cohort trials ended | Database |
| Trial-to-paid conversion | Cohort with a subscription (not `incomplete*`) created between trial start and trial end + 30 days / cohort | Database |
| Subscription page conversion | Subscribers / people with `studio_subscription_plans_viewed` | PostHog + webhook event, once built |
| Checkout completion rate | `studio_subscription_completed` / `studio_checkout_started` | PostHog |
| New subscriptions, renewals | `studio_subscription_invoices` paid, by `billing_reason` | Database |
| Revenue per trial user, day-30 retention | `studio_subscription_invoices` (paid amounts) and `studio_subscriptions` | Database |

Recommended PostHog funnel (ordered, users may skip steps — use "any order" for the middle steps):
offer viewed → trial started → first design created → first design saved → return visit → trial expired → plans
viewed → plan CTA clicked. Break down by `device_category`, by UTM source, and by cohort week of
`trial_started_at`.
