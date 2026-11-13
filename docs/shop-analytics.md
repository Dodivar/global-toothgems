# Shop analytics (PostHog)

The shop's checkout funnel and its failures, sent from the browser by `webapp/src/lib/shopAnalytics.ts` (since 2026-11-12). The 3D Studio has its own events: `docs/studio-trial-analytics.md`.

Rules (same as the Studio's):

- **Consent only.** PostHog stays opted out until the visitor accepts the analytics category (`lib/posthogSession.tsx`); `trackShop` sends and stores nothing before.
- **Nothing personal or secret.** No name, e-mail or address; **never a gift card code** (a bearer credential: only counts). Promotion codes are marketing words and are sent as typed, upper case.
- **Indicative amounts.** Amounts are what the browser shows, in minor units (cents). The money of record is the database's (`/admin/statistiques`) and Stripe's: use PostHog for conversion and friction, not for accounting.
- Every event also carries `app_environment` and `is_staff` (registered by `PostHogSession`).

## Events

| Event | When | Properties |
| --- | --- | --- |
| `product_added_to_cart` | "Add to cart" on a product page | `product_id`, `variant_id`, `quantity`, `unit_price`, `currency` |
| `checkout_started` | "Pay" pressed with a valid form | `item_count`, `cart_subtotal`, `shipping_amount`, `total_amount`, `currency`, `contains_course`, `checkout_mode` (`stripe` / `mock`), `promo_code_count`, `gift_card_count`, `loyalty_reward` |
| `checkout_failed` | The checkout could not open a payment step | `reason` — the cart's `CheckoutError` (`out_of_stock`, `basket_changed`, `payment_unavailable`, `network`, `server_error`, …) |
| `payment_step_opened` | The order is reserved and the card form shows | `amount_due`, `currency` |
| `payment_submitted` | "Pay" pressed in the card form | `amount_due`, `currency` |
| `payment_failed` | The payment did not go through | `stage`: `confirm` (Stripe refused: `error_code`, issuer's `decline_code` such as `insufficient_funds`), `load` (the form did not load), `expired` (the step timed out), `return` (back on the confirmation page, the order is `cancelled` / `failed`: `order_state`); `amount_due`, `currency` where known |
| `order_completed` | The order is **paid on the database's word**: the confirmation page read `paid` (verified Stripe webhook), or gift cards covered everything | `paid_with` (`card` / `gift_card`), `item_count`, `contains_course`; gift-card orders also `promo_code_count`, `gift_card_count`, `loyalty_reward`. Once per order and tab (`gt-shop-evt:order:<number>` in session storage) |
| `payment_confirmation_slow` | The confirmation page gave up waiting for the webhook | `polls` |
| `promo_code_applied` | The basket quote accepted a newly typed code | `code` |
| `promo_code_rejected` | The quote refused a code | `reason` (`invalid`, `dropped` — the basket changed under a code —, `too_many_attempts`) |
| `gift_card_code_applied` | The gift card quote accepted one more code | `gift_card_count` |
| `gift_card_code_rejected` | The gift card quote refused codes, or throttled | `reason` (`refused`, `too_many_attempts`), `refused_count` |
| `review_submitted` | A review was saved | `subject_kind`, `is_edit`, `rating`, `photo_count`, `tag_count` |

## Reading it in PostHog

- **Funnel** (Product analytics › New insight › Funnel): `product_added_to_cart` → `checkout_started` → `payment_step_opened` → `payment_submitted` → `order_completed`, filtered on `app_environment = production`, internal users excluded. The biggest drop is the step to look at first, with its session replays (open "Watch recordings" from the funnel step).
- **Card declines**: Trends on `payment_failed` where `stage = confirm`, broken down by `decline_code`. A spike of `generic_decline` or `authentication_required` on one day points at Stripe or 3-D Secure, not at the shop.
- **Checkout errors**: Trends on `checkout_failed` broken down by `reason`. `out_of_stock` and `basket_changed` are expected; `server_error`, `payment_unavailable` or `network` rising are incidents.
- **Promotion codes**: Trends on `promo_code_applied` broken down by `code`; compare with `promo_code_rejected` broken down by `reason`.
- **Alerts** worth setting (Insight › Alerts): `order_completed` = 0 over 24 h in production; `payment_failed` (`stage` = `load`) above a few per hour; `payment_confirmation_slow` above zero (the webhook may be failing).
