---
name: global-toothgems-ecommerce
description: Commerce rules and Stripe architecture — catalogue, cart, checkout, orders, payments, refunds, promotions, gift cards, loyalty, reviews, newsletter.
---

# E-commerce & Stripe

The commerce schema is largely built. Before writing commerce code, read the matching section of `supabase/README.md` (Checkout flow, Refunds, Gift cards, Promotions, Member account, Deliberate decisions) and call the existing functions instead of re-deriving their rules.

## Sources of truth

- Stripe: payment state (charges, refunds, subscriptions).
- Supabase: catalogue, customers, orders, stock, discounts, entitlements.
- Stripe webhooks reconcile payment state into Postgres. A browser redirect is never proof of payment.

## Product integrity

The client is never authoritative for price, discount, tax, shipping, stock, payment status or order status. Prices shown in the browser are indicative; `create_order()` recomputes everything.

The catalogue represents physical products, digital products, gift cards and variants (JSONB `attributes`, e.g. gem pack × stone size). Courses are not products (owner, 2026-10-01): they are sold as course lines of the same order (`order_items.course_id`, one seat, account required), and the paid order grants a `course_entitlements` row (`supabase/README.md` → *Academy course sales*). Subscriptions are not modelled yet.

## Cart

- Quantities validated, unavailable/archived products not purchasable, stale carts handled gracefully (re-validate against the database before checkout).
- Cart persistence for signed-in members is a product decision; until decided, keep it client-side and never treat it as an order.

## Checkout (built in iteration 19 — `supabase/README.md`, *Edge Functions*)

```
browser   POST to Edge Function `create-checkout-session` with {items[{product_id, variant_id, quantity}], email, address, rate, locale, codes}
edge fn   verifies the JWT (or guest e-mail), checks maintenance mode,
          calls create_order() with the service role → order 'pending', stock reserved, totals computed in SQL
          creates a Stripe Checkout Session (ui_mode custom) for order.amount_due / currency (metadata: order id), expires_at aligned with the reservation
browser   pays on OUR page: Payment Element mounted from the session's client secret (cart's last step, no redirect to Stripe);
          going back closes the step (session expired, order cancelled); then a confirmation page that READS the order state
webhook   Edge Function `stripe-webhook`: verify signature → insert stripe_webhook_events (dedup) →
          checkout.session.completed → mark_order_paid(order, amount, currency, cs_…, pi_…)
          checkout.session.expired   → cancel_order(order, 'expired')
          charge.refunded / refund events → mark_refund_succeeded | mark_refund_failed   (not built yet)
cron      expire_stale_orders() every 5 minutes (pg_cron job `expire-stale-orders`)
```

Required UI states: cart, customer, delivery, payment, processing, success, failure/cancelled. Mobile-first, minimal friction, clear totals (VAT included, shipping, discounts, gift cards applied).

## Webhooks

- Verify the Stripe signature with the raw body; reject otherwise.
- Idempotent: one row per event id in `stripe_webhook_events`; skip `processed`; record `failed` + error.
- Amount and currency must match the order (`mark_order_paid` enforces it).
- Fulfilment side effects (entitlements, loyalty stamps, gift-card activation, stock sale, e-mails) happen from the webhook path only.

## Orders

Orders keep their historical facts: items, quantities, unit prices, discounts per line, VAT per line, shipping, currency, payment references, addresses (snapshots), fulfilment state. Never rebuild an old order from the current catalogue. Three independent status axes (`status`, `payment_status`, `fulfillment_status`); shipments drive fulfilment; refunds go through Stripe, confirmed by webhook.

## Money

`numeric(12,2)` + ISO currency in Postgres; integer minor units in TypeScript and Stripe (`webapp/src/lib/catalog/money.ts`); conversion only at boundaries. No floats, no `parseFloat` arithmetic, no rounding in the browser that the database does not do the same way.

## International commerce

Language, country, currency, tax jurisdiction and shipping zone are separate dimensions. VAT: prices include VAT, destination-country rates per tax category, per-line rounding (see `supabase/README.md` decision 5). Tax rates are illustrative until the accountant confirms them; Stripe Tax may replace `vat_rate_bp()` later — a deliberate decision, not an incidental change.

## Installment payment

"4x payment" is a requirement direction, not a license to invent provider behaviour: identify the Stripe payment method, verify country/currency eligibility, implement via Stripe's official flow, show the conditions clearly.

## Promotions, gift cards, loyalty

- The discount engine lives in `create_order()`; the UI previews but never decides — the cart shows what `quote_basket()` answers (same engine, nothing reserved), never a discount computed in the browser. Promotions are saved by `admin_save_promotion()` (one transaction: promotion, scope, segments, code, English text), never by writing the tables from the browser. Stacking, eligibility, limits and code validity are server rules (decisions 21–24).
- Gift cards are a payment, not a discount; balances are an append-only ledger; codes are bearer credentials never exposed to API roles (staff see `code_last4`); the public balance check must be rate-limited server-side.
- Loyalty stamps are awarded by the database when an order is paid; the Loyalty Club UI must read `loyalty_overview`, never compute stamps client-side.
- Referral: post-launch; do not add referral tables speculatively.

## Reviews

Verified-purchase only (database finds the shipped/delivered order), moderation lifecycle, customer text never edited or translated by staff, photos in the private `review-photos` bucket, reports never delete. Course reviews need a `course_id` when the Academy schema exists.

## Newsletter and consent

Marketing consent is explicit, append-only (`consent_records`) and never pre-ticked. Visitors: double opt-in through an Edge Function calling `newsletter_subscribe()` and sending the confirmation e-mail; one-click unsubscribe in every marketing e-mail. Creating an account never subscribes anyone.

## Social / Instagram links

Discovery metadata only, never a dependency of the purchase path. Isolate any future social API integration.
