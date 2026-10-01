# Global Toothgems — Database

Schema, rules and operations of the Supabase backend (iterations 1–17: commerce, checkout, reviews, shipments, refunds, gift cards, member account, back-office roles, promotions, customer service, statistics, recommendations, back-office product management, gem options and colours, custom variants, Studio 3D workspace and share links, category families, wishlist). How to change it: `global-toothgems-llm-guidelines/09-supabase-workflow.md`.

Supabase project **Global Toothgems** (`abvuyvryerpzlvibttxp`, region `eu-west-3` Paris, Postgres 17).
Supabase Auth is the only authentication system; all application data lives in `public`,
helpers in `private` (not exposed through the API).

Iteration 1 laid the commerce + administration foundation. Iteration 2 added what
checkout and the admin need next: content translations, shipping/VAT configuration,
stock reservations with a ledger, server-side order functions, Stripe webhook
idempotency, an admin audit log and private avatars. Iteration 3 added product
reviews with moderation, shipments with tracking, and refunds. Iteration 4 added gift cards.
Iteration 5 completed the data of an authenticated member against the member-area
prototype: registration answers, consents, data export requests, loyalty club, CRM
tags/notes, review requests, and a seeded demo member.
Iteration 6 replaced the single `admin` gate with back-office roles and permissions
(read only / manager / administrator, as in the Users prototype) and added promotions:
automatic and code promotions, unique codes, campaigns, collections, customer segments,
discounts computed in `create_order()`, and redemption of the loyalty reward.
Iteration 7 covers the public pages and customer service: contact form tickets, newsletter for
visitors (double opt-in), e-mail templates and content pages with their translations, maintenance mode.
Iteration 8 feeds the back-office Statistics screen: `analytics_snapshot()` returns the screen's
`AnalyticsSnapshot` computed from the orders.
Iteration 9 adds product recommendations: the team's links between products and
`recommended_products()`, which feeds the product page, cart and home suggestion blocks.
Iteration 10 connects the back office's product management: `admin_save_product()`,
`admin_delete_product()` and `admin_save_product_recommendations()` save a product with its
translation, stock and images, or a product's recommendation lists, in one transaction.
Iteration 13 makes the storefront's gem colour filter data: `gem_colors` (+ translations), managed
from the back-office Catégories page through `admin_save_gem_color()`, `admin_delete_gem_color()` and
`admin_reorder_gem_colors()`.
Iteration 15 lets the back office edit every other kind of variant (colours, boxes, sizes in mm):
`admin_save_product()` takes the complete list of a product's variants and the variant each photo shows.
Training (the Academy), community and notifications are not built yet and get their own
migrations; the Academy is launch-blocking.

## Layout

```
supabase/
  migrations/   versioned SQL, applied in filename order (versions match the remote project)
  seed.sql      fictional catalogue for development (no customers, no personal data)
  seed_demo_member.sql  one fictional member (Camille Bernard) built through the real checkout functions
  tests/mvp_validation.sql          iteration 1 RLS / integrity suite (always rolls back)
  tests/iteration2_validation.sql   iteration 2 checkout / stock / audit / i18n suite (always rolls back)
  tests/iteration3_validation.sql   iteration 3 reviews / shipments / refunds suite (always rolls back)
  tests/iteration4_validation.sql   iteration 4 gift card suite (always rolls back)
  tests/iteration5_validation.sql   iteration 5 member account suite (always rolls back)
  tests/iteration6_validation.sql   iteration 6 roles/permissions + promotions suite (always rolls back)
  tests/iteration7_validation.sql   iteration 7 contact / newsletter / e-mails / content / maintenance suite (always rolls back)
  tests/iteration8_validation.sql   iteration 8 statistics suite (always rolls back)
  tests/iteration9_validation.sql   iteration 9 product recommendations suite (always rolls back)
  tests/iteration10_validation.sql  iteration 10 back-office product management suite (always rolls back)
  tests/iteration11_validation.sql  iteration 11 gem pack × stone-size options suite (always rolls back)
  tests/iteration12_validation.sql  iteration 12 member sign-up (Supabase Auth metadata → profile + consents) suite (always rolls back)
  tests/iteration13_validation.sql  iteration 13 gem colours suite (always rolls back)
  tests/iteration15_validation.sql  iteration 15 product variants of any kind (colours, boxes…) + their photos suite (always rolls back)
  tests/iteration17_validation.sql  iteration 17 member wishlist (favourites) suite (always rolls back)
  tests/iteration18_validation.sql  iteration 18 "My orders" isolation + staff order notes suite (always rolls back)
  tests/iteration19_validation.sql  iteration 19 Stripe Checkout wiring (expiry job, webhook idempotency, return page) suite (always rolls back)
  tests/iteration20_validation.sql  iteration 20 Academy authoring suite (always rolls back)
  tests/iteration21_validation.sql  iteration 21 Academy public pages (what visitors and customers read) suite (always rolls back)
  tests/admin_orders_validation.sql back-office order book: what staff read, viewer/customer/visitor refusals (always rolls back)
  config.toml   CLI settings this repo relies on (verify_jwt of the two Edge Functions)
  functions/    Edge Functions (Deno): create-checkout-session, stripe-webhook, _shared/ (pure modules + clients),
                *_test.ts (deno test), .env.example (secret names)
  templates/confirm-signup.html     French "Confirm signup" email, to paste into the Auth settings
```

## Migrations

| Version | Name | Responsibility |
|---|---|---|
| 20260923194835 | `foundation_profiles_roles` | `private` schema, `updated_at` / audit triggers, `roles` lookup, `profiles` (1:1 `auth.users`), sign-up trigger, email sync, `private.is_admin()`, profile guard |
| 20260923194944 | `catalog` | `categories`, `products`, `product_variants`, `product_media`, `inventory_items`, `consume_inventory()` |
| 20260923195042 | `customer_addresses` | address book, single default per type |
| 20260923195151 | `orders` | `orders`, `order_items`, `payments`, order number sequence, total / subtotal integrity, order immutability guard |
| 20260923195224 | `rls_policies` | grants/revokes + every RLS policy |
| 20260923195229 | `storage_product_media` | `product-media` bucket + admin-only write policies |
| 20260924051120 | `content_translations` | `languages`, `category_translations`, `product_translations` (localized slug + SEO meta), `product_variant_translations`, `product_media_translations`; draft/published review status |
| 20260924051149 | `shipping_and_tax` | `shipping_zones`, `shipping_zone_countries`, `shipping_rates`, `tax_rates` (basis points); product `weight_grams` / `tax_category`; `shipping_zone_for_country()`, `vat_rate_bp()`, `vat_included()` |
| 20260924052143 | `checkout_foundation` | order locale / shipping snapshot / VAT per line / `stock_state` / expiry; `inventory_movements` ledger; `stripe_webhook_events`; `create_order()`, `mark_order_paid()`, `cancel_order()`, `expire_stale_orders()`; stock-transition trigger |
| 20260924052207 | `audit_log` | `audit_logs` + triggers on accounts, orders, catalogue, money configuration |
| 20260924052213 | `storage_avatars` | private `avatars` bucket, per-user folders |
| 20260924053850 | `fix_consume_inventory_found` | fixes a regression from 009 (oversell attempt returned NULL instead of raising) — caught by the iteration 1 suite |
| 20260924061309 | `reviews` | `reviews`, `review_photos`, `review_reports`, `review_helpful_votes`, `review_notes`; verification from orders; moderation rules; `product_review_stats` view; private `review-photos` bucket |
| 20260924061542 | `shipments` | `shipments`, `shipment_items` (partial shipping); order fulfilment/status recomputed from parcels |
| 20260924061824 | `refunds` | `refunds`, `refund_items`; `request_refund()`, `mark_refund_succeeded()`, `mark_refund_failed()`; payment/order refund states; restock via `return` movements |
| 20260924065402 | `gift_cards` | `gift_card_settings`, `gift_cards`, `gift_card_transactions` (ledger), `gift_card_overview`; gift card product type and payment provider; `orders.gift_card_amount` / `amount_due`; `create_order()` sells and redeems cards; staff functions |
| 20260924070057 | `gift_card_code_grant` | fix: service role may call the code generator (caught by the iteration 4 suite) |
| 20260924070342 | `fix_gift_card_amount_rounding` | fix: sub-cent gift card amounts were rounded instead of rejected (caught by the iteration 4 suite) |
| 20260924135022 | `member_account` | profile columns (country, locale, persona, interest, birth date, marketing cache, password date); richer sign-up trigger; `consent_records` + `member_consents`; `data_export_requests` + private `data-exports` bucket; `loyalty_settings`, `loyalty_cards`, `loyalty_stamps`, `loyalty_overview`, stamp trigger on orders; `customer_tags`, `customer_notes`; `review_requests` view |
| 20260924135345 | `fix_consent_records_ordering` | fix: consent records stamped with `clock_timestamp()` so the latest decision is unambiguous (caught by the iteration 5 suite) |
| 20260924202324 | `staff_roles_permissions` | roles `viewer` / `manager` (+ `rank`), `permissions`, `role_permissions`; `private.is_staff()`, `private.has_permission()`; **every policy that used `is_admin()` rewritten** (reads: active staff; writes: the table's permission); rank rules on role/status changes; `staff_profiles`, `staff_directory()`, `my_permissions()`; audit trigger keyed for composite rows |
| 20260924203521 | `promotions` | `collections`, `customer_segments`, `campaigns`, `promotions` (+ translations, product/category/collection/segment links), `promotion_codes`, `order_discounts`, `order_items.discount_amount`; discount engine; `create_order()` gains `p_promotion_codes` and `p_use_loyalty_reward`; `generate_promotion_codes()`; `promotion_overview`, `campaign_overview`, `customer_segment_overview` |
| 20260924210824 | `public_pages_customer_service` | permission `manage_content`; `store_settings` (maintenance); `contact_requests` (+ notes, private `contact-attachments` bucket, `submit_contact_request()`); `newsletter_subscriptions` (double opt-in, `newsletter_subscribe/confirm/unsubscribe()`, synced with member consents); `email_templates`, `content_pages` (+ translations), `translation_status`, `email_template_for()`; `private.hit_rate_limit()` |
| 20260924213047 | `admin_statistics` | `categories.report_group` (revenue bucket, audited); index on `orders.paid_at`; `private.analytics_sale_lines()`, `private.analytics_kpi()`; `analytics_snapshot(from, to, filters, currency, timezone)` |
| 20260925191945 | `product_recommendations` | `product_recommendations` (manual links per product and kind, audited); `recommended_products(product_ids, kind, limit)` |
| 20260926113816 | `admin_product_management` | `admin_save_product(jsonb)`, `admin_delete_product(uuid)`, `admin_save_product_recommendations(uuid, uuid[], uuid[])` — SECURITY INVOKER (RLS applies), `manage_products` checked, one transaction per call |
| 20260926115257 | `admin_save_product_variant_stock` | `admin_save_product()` leaves stock alone for products with variants (stock is per variant) and digital products |
| 20260926151552 | `gem_pack_stone_size_options` | `admin_save_product()` gains an optional `variants` list: gem options pack (20/50/100) × stone size (SS), one variant each (`attributes` `{"pack": 50, "ss": 6}`), names/SKUs derived server-side, matched by combination, unticked options deleted (deactivated when ordered); products with other kinds of variants refused; product stock applies again once no variant is active |
| 20260928174400 | `gem_colors` | `gem_colors` (immutable `slug` = `products.metadata.color` value, French `name`, one exact `hex`, single `is_multicolor` entry without hex, `is_active`, `position`) + `gem_color_translations`; seed of the ten former front-end colours + « Multicolore »; trigger rejecting an unknown `metadata.color`; `admin_save_gem_color()`, `admin_delete_gem_color()` (refused while a product uses the colour, never for the multicolour entry), `admin_reorder_gem_colors()`; audited |
| 20260928201905 | `gem_free_pack_sizes` | `admin_save_product()` accepts gem packs of any whole number of stones from 1 to 10 000 (was 20 / 50 / 100 only), set per product; nothing else changes and existing variants stay valid |
| 20260928222836 | `studio_workspace` | 3D Studio workspace: `creations` (scene_data jsonb v1, generated `element_count`, indicative `estimated_price_minor` + `currency`, private thumbnail path), `gem_groups`, `studio_feedback` (insert-only, staff read), private `studio-thumbnails` bucket; owner-only RLS, `user_id` defaults to `auth.uid()` and is not writable; `updated_at` moves on content edits only. Used by the webapp through `lib/studioWorkspace/supabaseRepository.ts` |
| 20260928223009 | `product_custom_variants` | `admin_save_product()` gains an optional `custom_variants` list (every variant that is not a pack/SS option: browser-generated id, fr + en name, optional `attributes.swatch` `#rrggbb` merged into the other attributes, optional price, stock) and an optional `media[].variant_id`; SKU derived once from the product SKU + French name, unique; names can be swapped in one save; a variant left out is deleted, or deactivated when ordered; refused alongside `variants` or on a product selling pack/SS options; returns `custom_variants` |
| 20260929120000 | `category_families` | second level of the shop taxonomy: `category_families` (under one category, `slug` unique across categories = `famille` URL value, `is_active`, `position`, audited) + `category_family_translations`; optional `products.family_id` with a composite FK `(category_id, family_id)` and a trigger clearing a family the new category does not have; categories reorganised into `gems` (Toothgems), `materiel` (former `outils`), `kits`, `lip-gloss`, `entretien` / `accessoires` emptied into `materiel` and hidden; hosted products classified by slug; `admin_save_product()` gains an optional `family_id` (absent = unchanged) and returns it |
| 20260930090111 | `wishlist` | `wishlist_items` (member × product, composite key, `user_id` defaults to `auth.uid()`, both CASCADE); members read, add and remove only their own rows; adding needs an active account and an active product; only `product_id` is insertable, nothing is updatable; no visitor or staff access |
| 20260930210000 | `order_staff_notes` | Applied (recorded 2026-10-01; iteration 18 suite passed on the project). `order_notes` (one per order, staff read, `manage_orders` writes, audited); trigger `orders_zz_move_admin_note` appends anything written to `orders.admin_note` (staff edits, the checkout's automatic notes) to `order_notes` and empties the column; check `orders_admin_note_moved` (column always NULL); existing notes moved. Reason: RLS filters rows, not columns, so members could read the internal notes of their own orders |
| 20261001062943 | `academy_authoring` | Academy authoring (phase A): `training_media` (+ translations, private `training-media` bucket), `courses` (price, lifecycle draft → published ⇄ unpublished, `published_at`), `course_modules`, `course_steps`, `course_blocks` (text / image / video), `course_quizzes`, `quiz_questions`, `quiz_answers` (one correct per question), a translation table per level, `course_promotions` + `course_current_prices` view, `course_publication_problems()`, lifecycle guard, `admin_save_course(jsonb)`; audited |
| 20261001063310 | `course_promotion_guard_permission` | fix: the promotion guard refuses callers without `manage_training` before answering "overlap" (caught by the iteration 20 suite) |
| 20261001063421 | `academy_merge_read_policies` | one SELECT policy per role on `courses`, `course_translations`, `course_promotions` (performance advisor) |
| 20261001071006 | `academy_published_integrity` | a price cut below an active amount promotion is refused (the course would become free); a deferred constraint trigger re-checks `course_publication_problems()` when a published course is saved, so it cannot become unpublishable while online |
| 20261001121248 | `academy_public_pages` | Academy phase B: visitors and customers read the outline of a published course (modules, steps, knowledge checks' titles and pass marks, published translations — never blocks, questions or answers), its cover (`training_media` row + translations + the file in the private bucket) and its current price; `course_promotions` staff-only (the price view reads the running promotion through `private.course_running_promotion()`, SECURITY DEFINER); column grants hide `courses.created_by`/`updated_by` and the media's internal columns from `anon`; policies widened in place (ALTER POLICY) |

RLS is **enabled in the same migration that creates each table** (deny by default);
policies are granted back in `rls_policies`.

## Data model

```
auth.users 1─1 profiles ─* customer_addresses
                  │ role → roles.key
                  └─* orders ─* order_items ─→ products / product_variants (RESTRICT)
                              └─* payments

categories 1─* category_families
     1─* products 1─* product_variants        products.(category_id, family_id) ─→ category_families (optional)
                  │   └─* product_media (variant_id optional)
                  └── inventory_items (one per product WITHOUT variants, or one per variant)
                          └─* inventory_movements (ledger, order_id optional)

languages 1─* {category,category_family,product,product_variant,product_media,gem_color}_translations
gem_colors ←─ products.metadata.color (slug; checked by trigger, delete refused while used)
shipping_zones 1─* shipping_zone_countries (a country is in at most one zone)
               1─* shipping_rates ←─ orders.shipping_rate_id (+ name snapshot)
tax_rates (country × tax_category, basis points)
stripe_webhook_events ─→ orders        audit_logs (trigger-written)

profiles 1─* consent_records   (append-only) → member_consents (latest per purpose)
         1─* data_export_requests ─→ storage data-exports/<user_id>/…
         1─* loyalty_cards 1─* loyalty_stamps ─→ orders (one stamp per order)
         1─* customer_tags, customer_notes   (staff only)
         1─* wishlist_items ─→ products   (favourites; own rows only)
loyalty_settings (single row)      review_requests (view: shipped, not yet reviewed)

roles 1─* role_permissions *─1 permissions        profiles 1─1 staff_profiles (team members)
promotions ─* promotion_{products,categories,collections,segments}, promotion_codes, promotion_translations
           └─ campaign_id → campaigns ─* campaign_products, campaign_translations
collections ─* collection_products     customer_segments ─* customer_segment_members
orders 1─* order_discounts ─→ promotions / promotion_codes / loyalty_cards   (what the order received)

contact_requests ─* contact_request_notes   (─→ profiles, orders when it is the requester's own)
newsletter_subscriptions ─→ profiles (members)   ⇄ consent_records (marketing_email)
email_templates 1─* email_template_translations   content_pages 1─* content_page_translations
store_settings (single row)
```

Conventions: plural snake_case tables, `uuid` keys, `timestamptz created_at/updated_at`,
statuses as `text` + `CHECK` (easy to extend, no enum migrations), money as
`numeric(12,2)` + ISO-4217 `currency` (never floating point).

### Tables

| Table | Purpose / key rules |
|---|---|
| `roles` | `customer`, `admin`. New roles = one `INSERT` (`is_staff` flag ready for support/content roles). |
| `profiles` | first/last/display name, `avatar_path`, `phone`, `role`, `status` (`active`/`suspended`/`deactivated`), `email` mirror of `auth.users`. Created automatically on sign-up; sign-up metadata can **never** set the role. |
| `categories` | top level of the shop taxonomy: `slug` (unique, the `categorie` URL value), `name`, `description`, `image_path`, `is_active`, `position`. Today `gems` (Toothgems), `materiel`, `kits`, `lip-gloss`. |
| `category_families` | second level: one category each, `slug` unique across categories (the `famille` URL value), `name`, `image_path`, `is_active`, `position`. A product sits in at most one family of its own category (`products.family_id`, composite FK). |
| `products` | `slug`/`sku` unique, `price`, `compare_at_price` (> price), `currency`, `status` `draft`/`active`/`archived` (archived = soft delete), `is_featured`, `product_type` `physical`/`digital`, `metadata` (presentation only). |
| `product_variants` | optional per product; `attributes` JSONB object (`{"colour":"saphir"}`, `{"size":"3mm"}`, gems: `{"pack":50,"ss":6}` — integers) so new option types need no columns; `price` null = inherit product price. |
| `product_media` | Storage object path + `media_type`, `alt_text`, `position`, `is_primary` (max one per product), optional `variant_id`. No binaries in Postgres. |
| `inventory_items` | exactly one of `product_id`/`variant_id`; `quantity_on_hand`, `quantity_reserved` (≤ on hand), `low_stock_threshold`, `track_inventory`, manual `availability`; generated `stock_status` (`in_stock`/`low_stock`/`out_of_stock`/`preorder`). |
| `customer_addresses` | many per user, `address_type` shipping/billing, one default per type (setting a new default clears the old one), ISO `country_code`, nullable `postal_code`/`region`. |
| `orders` | `order_number` `GT-100001…`, `user_id` (SET NULL on account deletion — accounting records survive), `customer_email` + `billing_address`/`shipping_address` **JSONB snapshots**, subtotal/discount/shipping/tax/total, `prices_include_tax` (EU VAT-inclusive default), `status`, `payment_status`, `fulfillment_status`, `customer_note`, `admin_note` (deprecated, always NULL since `order_staff_notes`: notes live in `order_notes`, staff only). |
| `order_items` | frozen `product_name`, `variant_name`, `sku`, `unit_price`, `quantity`, generated `subtotal_amount`. |
| `languages` | `fr` (default = language of base columns), `en`, `de` enabled; `it`, `es`, `pt`, `nl` disabled. |
| `*_translations` | one row per (entity, non-default locale); product translations carry a localized `slug` (unique per locale) and `meta_title`/`meta_description`; `status` draft/published — only published rows are public. A translation for the default locale is rejected. |
| `shipping_zones` / `shipping_zone_countries` / `shipping_rates` | zones of ISO countries + optional single "rest of world" zone; rates `standard`/`express`/`free`/`pickup` with delivery days, price, `free_over_amount`, basket-amount and weight bounds. |
| `tax_rates` | VAT per country and `tax_category` (`standard`, `books`, `training`, `hygiene`, `digital`) in **basis points** (2000 = 20 %). Reduced rate → else standard → else 0. |
| `inventory_movements` | append-only ledger: `initial`, `adjustment` (admin edit, with actor), `reservation`, `release`, `sale`, `return`, with deltas and resulting quantities. Written only by trigger. |
| `stripe_webhook_events` | one row per Stripe event id (`evt_…`), status, attempts, error — dedup/idempotency. No payload stored (personal data). |
| `audit_logs` | append-only, trigger-written: who (`actor_id`, `actor_role`), what (`table_name`, `record_id`, `action`), and the changed columns old → new. |
| `payments` | Stripe-ready: `provider_checkout_id` (cs_…), `provider_payment_id` (pi_…) unique, status, amount/refunded, `card_brand` + `card_last4` for display only. **No card numbers, CVV or credentials — ever.** |

### Order states (three independent axes, matching the admin prototype)

- `status`: `pending → confirmed → processing → shipped → delivered`, or `cancelled` / `refunded`
- `payment_status`: `pending`, `paid`, `failed`, `refunded`, `partially_refunded` (Stripe webhooks are the source of truth)
- `fulfillment_status`: `unfulfilled`, `preparing`, `partially_fulfilled`, `fulfilled`

### Checkout flow (iteration 2)

```
server  create_order(user, email, items[{product_id, variant_id, quantity}], billing, shipping, rate, currency, locale)
          → prices from products/variants, shipping from shipping_rates (zone, bounds, free-over),
            VAT per line at the destination rate (prices include VAT, rounded per line; shipping at standard rate),
            snapshots, stock RESERVED, expires_at = now + 60 min            → order 'pending'
server  create Stripe Checkout Session for order.amount_due / currency
webhook checkout.session.completed → record stripe_webhook_events → mark_order_paid(order, amount, currency, cs_…, pi_…)
          → amount/currency must match; payment row upserted; reserved stock becomes a SALE → order 'confirmed'
webhook checkout.session.expired   → cancel_order(order, 'expired')   → reservation RELEASED
cron    expire_stale_orders() every 5 minutes (pg_cron job, iteration 19) → same, for abandoned orders
```

Since iteration 19 the two server steps exist as Edge Functions — see *Edge Functions (iteration 19)*.

Stock transitions live in a trigger on `orders`, so they apply whatever the path
(webhook, admin marking a bank transfer paid, admin cancelling, expiry job).
A payment arriving after the reservation expired re-takes the stock if still
available; otherwise the order is left `pending` + paid with an `[auto]` admin
note (restock or refund) — it never oversells.

### Edge Functions (iteration 19)

```
browser  POST functions/v1/create-checkout-session  {items[{product_id, variant_id, quantity}], email, address,
                                                      shipping_rate_id, locale, promotion_codes?, gift_card_codes?}
           → strict validation (_shared/checkoutInput.ts): no amount, total or currency is accepted
           → user = auth.getUser(Bearer token) when a user token is sent, else guest
           → create_order(…, reservation 70 min) with the service role
           → amount_due = 0 (gift cards) → {status: 'paid'}; otherwise Stripe Checkout Session:
               one line "Commande GT-…" for orders.amount_due in minor units, metadata.order_id,
               idempotency key checkout-session:<order id>, expires_at = now + 60 min,
               success/cancel URLs on SITE_URL or an allowed origin (ALLOWED_RETURN_ORIGINS)
           → payments row 'pending' with the cs_… id → {status: 'redirect', url}
           → Stripe unreachable: cancel_order(order, 'checkout_failed') → reservation released
Stripe   POST functions/v1/stripe-webhook (verify_jwt = false; the Stripe signature is the authentication)
           → constructEventAsync + SubtleCrypto provider; bad signature → 400, nothing recorded
           → record_stripe_webhook_event(): processed / ignored → 200 without doing anything
           → completed (payment_status 'paid') / async_payment_succeeded → mark_order_paid(Stripe's amount_total)
           → expired / async_payment_failed → pending payment row closed; cancel_order() only while the order is unpaid
           → stored as processed / ignored / failed; permanent SQL errors (amount mismatch, unknown order…) are
             acknowledged (200, `failed` for the team), anything else answers 500 so Stripe retries
browser  /fr/panier/confirmation?session_id=cs_… → checkout_session_status(cs_…) → order number + state
           (pending / paid / cancelled / failed); polls ~1 min. Grants nothing.
```

- The whole order is one Stripe line because only `amount_due` is guaranteed to equal what Postgres computed
  (per-line discounts, shipping discounts and gift card payments cannot be expressed as Stripe lines without
  rounding or negative amounts). The order's lines stay in the database and the member area.
- The reservation (70 min) outlives the Stripe session (60 min, Stripe's minimum is 30), so a card payment made
  at the last minute still finds its stock. Delayed methods (bank debits) can confirm days later: the order has
  expired by then and the documented late-payment path applies (stock re-taken if still there, otherwise flagged).
- Error codes returned to the browser: `invalid_request`, `unavailable`, `out_of_stock`, `shipping_unavailable`,
  `promotion_code_invalid`, `gift_card_invalid`, `payment_unavailable`, `maintenance`, `session_expired`, `server_error`
  (`_shared/orderErrors.ts`). SQL messages are logged, never returned.

**Deploy (test mode, after the user's go-ahead for the target project):**

```sh
supabase link --project-ref <project ref>
supabase db push                                  # applies 20260930200000_stripe_checkout.sql (pg_cron job + functions)
supabase secrets set --env-file supabase/functions/.env   # names in functions/.env.example
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook          # verify_jwt = false comes from config.toml
```

Secrets (Edge Function environment only, never `NEXT_PUBLIC_*`): `STRIPE_SECRET_KEY` (sk_test_…),
`STRIPE_WEBHOOK_SECRET` (whsec_…), `SITE_URL` (production origin), `ALLOWED_RETURN_ORIGINS` (comma-separated
exact origins, e.g. `http://localhost:5173`). `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase.

**Stripe webhook (test mode):** Dashboard → Developers → Webhooks → Add endpoint
`https://<project ref>.supabase.co/functions/v1/stripe-webhook`, events `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`;
copy its signing secret into `STRIPE_WEBHOOK_SECRET`. Payment methods offered are those enabled in the Stripe
dashboard (the session does not force a list).

**Locally:** `supabase start`, then `supabase functions serve --env-file supabase/functions/.env` and
`stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook` (it prints the `whsec_…` to put
in `.env`); `stripe trigger checkout.session.completed` sends test events (they carry no `order_id` and are
recorded as `ignored`: pay a real test session with card 4242 4242 4242 4242 for the full path).
Unit tests: `cd supabase/functions && deno test` (validation, return URLs, error mapping, signatures made and
checked by the Stripe SDK, replays, retries).

### Reviews (iteration 3)

Mirrors the review prototype (`webapp/src/data/reviewSystem.ts`, `lib/reviews.tsx`).

- **Verified only.** A customer can review a product only if one of *their* orders containing it
  is `shipped` or `delivered`; the database finds that order and stores it (`order_id`,
  `is_verified`). One review per customer and product.
- **Lifecycle** `pending → published | needs_changes (message to the customer) | rejected (reason) | hidden`.
  Anything the client sends for status, counters, author name or verification is overwritten on insert.
- **The text is the customer's.** Staff moderate, reply (`response_body`, stamped with author/time),
  flag and keep internal notes (`review_notes`) — they cannot edit rating, title, body or tags.
  Any customer edit (text, rating, tags or photos) sends the review back to `pending`.
- **Reports never delete anything.** One report per customer and review, not on your own review;
  resolving as `hidden` hides the review, `removed` rejects it.
- **Helpful votes**: one per customer, not on your own review; `helpful_count` maintained by trigger.
- **Photos**: at most 4, stored in the author's folder of the **private** `review-photos` bucket;
  readable by visitors only once the review is published.
- **Privacy**: visitors get a privacy name (`"Sarah M."`) and a verified flag — the columns
  `user_id` / `order_id` / moderation internals are not granted to `anon` (select explicit columns).
- `product_review_stats` (view, RLS-aware): count, average, star buckets, verified, with photos.
- Courses are not modelled yet: reviews target products; courses will add a `course_id` and widen
  `reviews_one_subject` (course tags are already in the allowed list).

### What a member reads of an order ("My orders", iteration 18)

The member area (`webapp/src/lib/orders.tsx`, `CUSTOMER_ORDER_SELECT`) reads, through RLS, only its own
orders whose `payment_status` is paid / partially refunded / refunded, with `order_items`, `order_discounts`,
`shipments` + `shipment_items`, `refunds` + `refund_items`. Amounts are shown **as recorded** (subtotal,
discount, shipping, VAT, total, gift cards, amount due, succeeded refunds), never recomputed in the browser.
RLS is row-level: a member can technically also read, on their **own** rows, `orders.cancellation_reason`,
`orders.updated_by`, `refunds.failure_reason` / `requested_by` / `provider_refund_id`, `shipments.created_by`
/ `updated_by`, `payments` references. The app does not select them; staff free text there should stay
customer-safe (decision 38). The internal notes are the exception that had to move (`order_notes`).
`supabase/tests/iteration18_validation.sql` checks own-rows-only for every table above and that notes stay
staff-only.

### What the back office reads of an order (`/admin/commandes`)

No schema of its own: `webapp/src/lib/adminOrders.tsx` (`ADMIN_ORDER_SELECT`) reads, as staff, every order
with `order_items` (incl. `tax_rate_bp`, `tax_amount`), `order_discounts` (with `source`), `payments` (card and
gift-card rows, `gift_cards.code_last4` embedded — the code column is granted to no API role), `shipments` +
`shipment_items`, `refunds` + `refund_items`, `orders.paid_at` / `cancelled_at`, and `order_notes`. Amounts are
shown as recorded; the timeline is dated by these columns, never by `orders.updated_at`; `orders.admin_note`
(always NULL) is not read. Writes: `orders.status`
/ `fulfillment_status`, `cancel_order()`, notes through `orders.admin_note` — all under `manage_orders`.
`supabase/tests/admin_orders_validation.sql` proves a `viewer` reads all of it and changes nothing (no update,
no note, no cancellation), a manager can, a customer reads only their own orders and no note or gift card, a
visitor nothing, and nobody reads a gift-card code. Revenue rule of the order book: decision 49.

### Shipments and tracking (iteration 3)

- A shipment (`carrier`, `service`, `tracking_number`, `tracking_url`, `estimated_delivery`) lists
  the order lines and quantities it contains (`shipment_items`) — partial shipping supported.
- Only paid, non-cancelled orders can ship; a line can never be allocated beyond its quantity;
  digital products are refused; a shipped/delivered parcel cannot be deleted; carrier + tracking
  number required once shipped.
- `shipped_at` / `delivered_at` are stamped automatically, and **`orders.fulfillment_status` and
  `orders.status` are recomputed from the parcels**: preparing → processing; some units shipped →
  `partially_fulfilled`; all shipped → `fulfilled` + `shipped`; all delivered → `delivered`.
- Customers read their own parcels (tracking page); staff create and update them.

### Refunds (iteration 3)

```
staff/backend  request_refund(order, amount, reason, items[{order_item_id, quantity}], restock)
                 → 'pending'; amount ≤ paid − refunded − pending (payment row locked)
backend        Stripe Refunds API
webhook        mark_refund_succeeded(refund, re_…)  |  mark_refund_failed(refund, reason)
                 → payment amount_refunded/status, order payment_status partially_refunded|refunded,
                   order status 'refunded' when fully refunded, returned lines restocked ('return')
```

Staff can cancel a pending refund; only the backend can confirm or fail one; confirmed, failed and
cancelled refunds are final. Line quantities can never be refunded twice. Customers see refunds on
their own orders.

### Gift cards (iteration 4)

Mirrors the Promotions & Gift Cards workspace (`webapp/src/data/adminPromotions.ts`).

```
purchase   create_order(items: [{product_id: <carte-cadeau>, quantity: 1, amount, gift_card: {recipient_*, sender_name, message, design, deliver_at}}])
             → card 'pending' (no VAT on the card line: taxed when spent — confirm with the accountant)
payment    mark_order_paid → card 'active', 'purchase' ledger line, expiry = now + settings.expiry_months
redeem     create_order(…, p_gift_card_codes => ['GT-XXXX-XXXX-XXXX'])
             → 'redemption' debit + 'gift_card' payment row; orders.gift_card_amount; Stripe collects orders.amount_due
             → fully covered: order paid immediately
cancel     unpaid order cancelled/expired → 'reversal' credit back, purchased cards 'void'
refund     request_refund = card (Stripe) payments only; refund_to_gift_cards() credits the cards back
```

- **Balance = sum of an append-only ledger** (`gift_card_transactions`); `gift_cards.balance` is a trigger-kept
  cache that can never go negative. Kinds: purchase, issue, redemption, reversal, refund, adjustment,
  extension, cancellation, resend.
- **Gift cards are a payment, not a discount**: order totals and VAT are unchanged when a card is used.
- Cards cannot pay for gift cards; must be active, delivered (not future-scheduled), unexpired, same currency;
  max 5 per order; one generic "not usable" error for unknown/empty/expired codes.
- **Codes are bearer credentials** (`GT-XXXX-XXXX-XXXX`, 60 random bits, no 0/O/1/I): never granted to any API
  role — staff see `code_last4`. `gift_card_balance(code)` and `gift_card_code_for_delivery(id)` are
  service-role only (the app must rate-limit the public balance form).
- Staff: `issue_gift_card`, `adjust_gift_card` (note required), `extend_gift_card` (later only),
  `cancel_gift_card` (note required), `refund_to_gift_cards`. Backend: `record_gift_card_delivery`
  (sent / delivered / opened / bounced, resend logged). `gift_card_overview` gives the derived display status
  (active, partially_redeemed, redeemed, scheduled, expired, cancelled, pending_payment, void).
- `gift_card_settings` (single row) mirrors the storefront configuration: preset amounts, custom amount bounds,
  expiry months, field modes, message length, designs, published flag. Public read when published.

### Member account (iteration 5)

Checked against the member area prototype (`webapp/src/screens/account/*`, `lib/auth.tsx`,
`lib/registration.ts`, `lib/securityState.tsx`, `lib/cookieConsent.tsx`, `data/loyalty.ts`,
`data/orders.ts`, `data/adminCustomers.ts`). Training (courses, lessons, certificates) and the
community it unlocks are deliberately left for the training iteration.

| Screen / data in the prototype | Where it lives |
|---|---|
| Profile: first/last name, phone | `profiles` |
| Profile: email (read-only, changed from Security) | `auth.users.email` (mirror in `profiles.email`) |
| Profile: delivery address | `customer_addresses` (default `shipping`, + default `billing`) |
| Profile: newsletter checkbox | `consent_records` purpose `marketing_email` → cache `profiles.marketing_opt_in` |
| Registration: country, persona, interest, UI language | `profiles.country_code`, `persona`, `interest`, `preferred_locale` (copied from sign-up metadata, validated) |
| Registration: terms (required), marketing (opt-in) | `consent_records` (`terms`, `privacy`, `marketing_email`) with `policy_version`, source `registration` |
| Cookie banner choices (signed in) | `consent_records` `cookies_preferences` / `cookies_analytics` / `cookies_marketing` |
| Security: email verified, pending email change, password, Google sign-in | Supabase Auth (`auth.users`, `auth.identities`) — never duplicated |
| Security: "password last changed" | `profiles.password_changed_at` (set by the backend after an Auth password change) |
| Security: personal-data export (none/processing/ready/expired) | `data_export_requests` + private bucket `data-exports/<user_id>/` |
| Security: delete account | backend `auth.admin.deleteUser` → profile and personal data cascade; orders kept (user_id SET NULL, snapshots) |
| Orders, tracking | `orders`, `order_items`, `shipments` (iterations 1–3) |
| My reviews, "what you could review" | `reviews` (iteration 3), view `review_requests` |
| Loyalty card (start, collecting, one away, unlocked, renewed) | `loyalty_overview`: `current_stamps`, `rewards_available`, `cards_redeemed` |
| Back office: customer status, tags, notes, birth date, marketing opt-in | `profiles.status`, `customer_tags`, `customer_notes`, `profiles.birth_date`, `profiles.marketing_opt_in` |
| Dashboard figures (orders count, member since, lifetime spend) | derived from `orders` / `profiles.created_at` — not stored |

Rules enforced in the database:

- **Sign-up metadata is untrusted**: every field is validated and dropped when invalid (never blocks the
  sign-up); role is never taken from it; consents are recorded only when the form sends a `policy_version`.
  Metadata keys: `first_name`, `last_name`, `phone`, `country`, `locale`, `persona`, `interest`,
  `terms_accepted`, `marketing`, `policy_version`.
- **Consents are append-only** proof: customers can only add their own decision, with a server timestamp,
  from `account` / `cookie_banner` / `checkout`; terms and privacy can only be granted. The latest record
  per purpose wins (`member_consents`).
- **Exports**: customers create a request (forced `pending`, one in flight); only the backend job moves it to
  `processing` → `ready` (archive path in the member's folder, `expires_at`) → `expired`.
- **Loyalty** (rules in `loyalty_settings`, public): one stamp per order when it becomes `paid` and its goods
  (gift cards excluded, discount deducted, shipping excluded) reach `qualifying_amount` in the programme
  currency; never two stamps for one order; a full card becomes `completed` (reward available) and the next
  qualifying order starts a new card; the stamp is voided if the order is cancelled or **fully** refunded
  while its card is still being collected. Customers only read their cards and stamps.
- **CRM tags/notes** are staff-only and never visible to the member; tag changes are audited.

### Back-office roles and permissions (iteration 6)

Mirrors the Users workspace (`webapp/src/data/adminUsers.ts`, `lib/adminUserFilters.ts`).

| Role (prototype) | `roles.key` | rank | Permissions |
|---|---|---|---|
| Customer | `customer` | 0 | none |
| Read only | `viewer` | 10 | `view_dashboard`, `view_users`, `view_statistics` |
| Manager | `manager` | 20 | the above + `manage_users`, `manage_products`, `manage_training`, `manage_orders`, `manage_customers`, `manage_promotions`, `moderate_reviews` |
| Administrator | `admin` | 30 | everything, incl. `manage_settings` |

- **Reads**: every *active* team member reads the back office (orders, customers, drafts, reviews, gift cards,
  promotions and codes) — that is what "read only" means. The audit log and the webhook log need `manage_settings`.
- **Writes**: each table's write policies check one permission — catalogue & catalogue translations & product media
  → `manage_products`; shipping, VAT, languages → `manage_settings`; orders, shipments, refunds, cancellations →
  `manage_orders`; CRM tags/notes, avatars moderation, customer status → `manage_customers`; reviews, reports,
  review notes/photos → `moderate_reviews`; promotions, codes, campaigns, collections, segments, gift cards,
  loyalty rules → `manage_promotions`; team members → `manage_users`.
- **Role/status changes** (`private.guard_profile_update()`): nobody changes their own role or status; changing a team
  member (or making someone one) needs `manage_users` and only on accounts whose rank ≤ the caller's, towards a role
  whose rank ≤ the caller's — a manager can invite managers but never touch or create an administrator. A customer's
  status alone needs `manage_customers`. All audited.
- A suspended team member loses every access at once (status is checked on each call).
- `permissions` / `role_permissions` are changed by migration only (audited); staff can read the matrix.
- `staff_profiles`: job title (internal, single language), team, who invited whom (stamped).
  `staff_directory()` (needs `view_users`) returns the Users table: status `invited` until the first sign-in,
  `suspended`/`deactivated` from the profile, last sign-in and two-factor from Supabase Auth.
- `my_permissions()` gives the signed-in user's permissions (navigation only — the database checks every call).
- `private.is_admin()` is kept for compatibility but no policy or function uses it any more.

**Inviting a team member** (server code with the service role): `auth.admin.inviteUserByEmail()` → set
`profiles.role` → insert `staff_profiles`. Check first, with the caller's JWT, that `my_permissions()` contains
`manage_users` — the database then enforces the rank rules on the role change.

### Promotions (iteration 6)

Mirrors the Promotions workspace (`webapp/src/data/adminPromotions.ts`, `lib/promotionRules.ts`).

- **Types**: `percentage` (optional cap), `fixed_amount`, `buy_x_get_y` (every group of X+Y eligible units, the Y
  cheapest are `reward_percent` off), `free_shipping`, `bundle` (complete sets × (cheapest unit of each product −
  bundle price)), `gift` (a free line added — or one unit of it made free — when an eligible *other* product is bought,
  only if it is in stock).
- **Scope**: all products, products, categories or collections; excluded products; `exclude_discounted_products`
  (lines with a `compare_at_price` are not discounted). **Gift card lines are never discounted.**
- **Customers**: all, new (no paid order yet, by account or email), existing, segments (manual list, CRM tag, newsletter).
- **Limits**: minimum goods amount, minimum eligible quantity, total uses, uses per customer (account or email);
  usage = `order_discounts` of orders that are not cancelled (a cancelled/expired order gives its use back);
  rows are locked while counting.
- **Activation**: automatic, or code — `shared` (one code for everyone) or `unique` (`generate_promotion_codes()`,
  single use). Codes are stored upper case, matched case-insensitively, unique across all promotions, never readable
  by visitors or customers, and cannot be rewritten (deactivate and add another).
- **Lifecycle** `draft → live → paused → archived`; the displayed status (active, scheduled, expired, …) is derived
  in `promotion_overview` like `promotionStatus()`. A promotion can only go live when complete (targets, segments,
  two bundle products, an active code). Promotions with orders cannot be deleted (archive them).

```
server  create_order(..., p_promotion_codes => ['WELCOME15'], p_use_loyalty_reward => false)
          lines priced → shipping (thresholds on goods before discounts) →
          codes typed: each must exist, be active, have uses left and apply — otherwise the order is REFUSED
          candidates = those codes + automatic promotions that apply now
          best of: each non-combinable promotion alone | all combinable ones in sequence
                   (bundle, buy X get Y, gift, fixed, percentage, free shipping); tie → the option with a typed code
          discount split over the eligible lines to the cent (never above a line) → order_items.discount_amount
          VAT per line on (line total − line discount); shipping VAT on the shipping actually charged
          order_discounts rows (label/code/type snapshots) = what the customer received and the usage ledger
```

- **Loyalty reward** (closes decision 14): used only when `p_use_loyalty_reward` is true, on the oldest completed card:
  `reward_percent` off the goods (gift cards excluded), **alone** (no promotion, a code is refused), reserved at order
  creation (`loyalty_cards.status = 'redeemed'`, `redeemed_order_id`) and given back if the unpaid order is cancelled
  or expires.
- Integrity (deferred, at commit): `orders.discount_amount` = Σ `order_items.discount_amount` = Σ `order_discounts.goods_amount`.
- Visitors read running automatic promotions (customer-facing columns only), running campaigns, active collections and
  published translations; customers read the discounts of their own orders; staff read everything; `manage_promotions`
  writes.

### Public pages and customer service (iteration 7)

**Contact form → tickets** (`webapp/src/screens/legal/Contact.tsx`)
- Only path in: `submit_contact_request(name, email, category, subject, message, order_reference?, locale?, attachment_path?)`
  → returns the ticket number (`SUP-100001…`). Members call it with their JWT; **visitors go through the server
  route** (captcha, IP limit) which calls it with the service role — `anon` cannot call it.
- Validated in the database: 9 categories, subject, message 20–5000 characters, e-mail; `privacy` requests are
  `high` priority. Throttled: 3 per 10 minutes per account or e-mail (`PT429` → HTTP 429 through PostgREST).
- The typed order number is linked to the order **only** when it is the requester's own (account, or same e-mail
  for a guest); the answer never says whether it matched.
- Attachments: private bucket `contact-attachments` (10 MB, jpeg/png/pdf); members upload into `<user_id>/`, the
  server writes guests' files under `guest/`; the function checks the file exists in the caller's folder.
- Triage (`manage_customers`): status `new → open → waiting_customer → resolved/closed` (or `spam`), priority,
  assignee (active team member); `first_response_at` / `resolved_at` stamped; the customer's words never change;
  audited. Internal notes in `contact_request_notes`. Customers see their own tickets; all staff read them.
- The server route sends the `contact_acknowledgement` e-mail (template below).

**Newsletter for visitors** (storefront forms)
```
server  newsletter_subscribe(email, locale, source, policy_version)   service role only, 3/hour per e-mail
          → {"status":"pending","confirm_token":…}  → e-mail `newsletter_confirmation` with the link
          → {"status":"subscribed"|"bounced"|"complained"} → no e-mail; answer the visitor the same way
public  newsletter_confirm(token)       48 h, single use (only its sha256 is stored) → subscribed
public  newsletter_unsubscribe(token)   one-click link in every marketing e-mail → unsubscribed
```
- Members: `consent_records` stay the source of truth. Any member decision (registration, account, checkout…)
  moves their list entry; confirming or unsubscribing a member's address records a consent (`source = 'newsletter'`);
  a visitor who confirmed and later signs up with the same e-mail is linked and the consent recorded.
  Bounced/complaining addresses are never re-activated. Tokens are never readable through the API.

**E-mail templates and content pages** (Translations workspace, types `email` and `content`)
- `email_templates` (key used by the sending code, subject, preheader, body, allowed `{{variables}}`, translation
  priority) and `content_pages` (slug, kind page/guide/help/legal, title, summary, body, SEO, `policy_version` for
  legal pages, draft/published/archived) — base columns in the default language, `*_translations` for the others.
- Placeholders are checked on both sides (a translation cannot use a variable the code does not send).
- `translation_status`: per item and enabled language — `missing`, `draft`, `outdated` (source changed since the
  translation was written/published), `published`; with the priority.
- `email_template_for(key, locale)` (service role): published translation, else the default language; says
  whether it is outdated. Five templates seeded (fr + en): order confirmation, shipping notification, course
  enrolment, newsletter confirmation, contact acknowledgement.
- Content pages are public once published (with their published translations); editing needs the new
  `manage_content` permission (managers, administrators).

**Maintenance** (`screens/Maintenance.tsx`): `store_settings.maintenance_enabled` (+ start time stamped, optional
expected end, staff bypass), public read, `manage_settings` to switch, audited. The storefront and the server
routes (checkout included) must check it — the database does not block orders by itself.

### Statistics (iteration 8)

`webapp/src/screens/admin/Statistics.tsx` reads one `AnalyticsSnapshot` (`webapp/src/data/adminAnalytics.ts`).
`analytics_snapshot(p_from date, p_to date, p_filters jsonb = '{}', p_currency = 'EUR', p_timezone = 'Europe/Paris')`
returns that object (camelCase JSON). Nothing is stored: every call recomputes from the orders, so figures cannot
drift from them.

- **Access**: `view_statistics` (all three back-office roles) or the service role; `SECURITY INVOKER`, so RLS still
  applies. Customers and visitors get `42501`.
- **Validation** (`22023`): period of 1–400 days, ISO currency, known time zone, filter keys and values.
- **Granularity**: 1 day → hours, ≤ 31 days → days, ≤ 120 days → weeks, longer → months. The previous period has the
  same length, immediately before; its series is aligned bucket by bucket.
- **Definitions**
  - *Sale*: an order whose payment went through (`paid`, `partially_refunded`, `refunded`), dated by `paid_at`, in the
    shop's time zone.
  - *Revenue*: order lines after discounts, VAT included; gift card lines, shipping and refunds are excluded and
    reported apart in `extras` (`giftCardsSold`, `shippingRevenue`, `discounts`, `refunds`). The category breakdown
    therefore sums to revenue.
  - *Customer*: the account, or the lower-cased e-mail of a guest. *New* = first sale ever in the period; a
    *returning* order is not the customer's first sale.
  - *Orders section*: orders **placed** in the period (`created_at`), grouped completed / pending / cancelled /
    refunded, with refund and cancellation rates and the average paid → first shipment delay (`processingHours`).
- **Output**: `kpis` (revenue, orders, AOV, units, new and returning customers; value, previous, change %, trend,
  12-point sparkline), `series`, `breakdown` (jewelry, aftercare, kits, training, other — fixed order), `products`
  (top 10 with stock, thumbnail and change), `customers` (base, repeat rate, lifetime value and orders, growth),
  `orders`, `geo` (delivery country, else billing), `cross` (share of jewellery orders that also carry aftercare),
  `extras`. `training` is `null` and `insights` is `[]` (see decisions).
- **Filters** (`p_filters`): `category`, `product`, `customerType` (`new`/`returning`), `country` narrow the sales;
  `country` and `orderStatus` narrow the orders section; the customer base is always the whole base.
- **Reporting group**: `categories.report_group` maps catalogue categories onto the screen's buckets
  (gems → jewelry, materiel/kits → kits, lip-gloss → other; since `…_category_families` nothing maps to aftercare).
  New categories default to `other`;
  changes are audited.

### Product recommendations (iteration 9)

Feeds the storefront's suggestion blocks, which today read mock data (`webapp/src/data/products.ts`):

| Screen | Call |
|---|---|
| Product page, "Va avec — Compléter la trousse" (`ProductDetail.tsx`) | `recommended_products(array[<product id>])` |
| Cart suggestions (`Cart.tsx`) | `recommended_products(<cart product ids>)`; empty cart → `recommended_products('{}')` |
| Home best-sellers (`Home.tsx`) | `recommended_products('{}')` (or a `collections` row when merchandised by hand) |
| Back office, `/admin/produits/:id/recommandations` (`AdminProductRecommendations.tsx`) | edits `product_recommendations` through `admin_save_product_recommendations()` when Supabase is configured (`lib/adminCatalogSupabase.tsx`); the prototype store otherwise |

- **`product_recommendations`**: one row per (product, kind, recommended product), ordered by `position`.
  Kinds: `complementary` (goes with it: cross-sell) and `similar` (an alternative to it). No self link, one link per
  pair and kind, cascade-deleted with either product. Visitors read a link only when **both** products are `active`;
  staff read all; `manage_products` writes; every insert/update/delete goes to `audit_logs`.
- **`recommended_products(p_product_ids uuid[] = '{}', p_kind = 'complementary', p_limit = 4)`** returns
  `(product_id, source, rank)` — ids only; the page reads products, prices and translations through the usual
  RLS-protected tables. Priority: `manual` links (best position, then shared by the most input products) →
  `bought_together` (complementary: paid in the same orders, at least **2** distinct orders) or `same_category`
  (similar) → `popular` (featured first, then most paid orders). The list is always filled up to the limit when the
  catalogue allows it.
- **Never returned**: the input products, anything not `active`, gift cards, products with no sellable stock
  (every active stock row `out_of_stock`; products without stock rows count as sellable).
- **Access**: callable by visitors (`SECURITY DEFINER`, so the Supabase advisor flags it — intended): the co-purchase
  signal reads order lines across customers, but only aggregated ids of active products leave the function, and the
  two-order floor keeps one customer's basket from being inferred.
- **Validation** (`22023`): unknown kind, limit outside 1–24, more than 50 input products.
- **Seed**: complementary and similar links for every active seed product (gems → gel, capsules, tools; kit →
  capsules, gems, pliers; …).

### Gem colours (iteration 13)

The colour filter of the storefront (`/couleurs`, shop chips, header carousels) and the product form's colour
select read `gem_colors`; the team manages it in the back office, section « Couleurs des gemmes » of the
Catégories page (`GemColorsSection.tsx`).

- **One exact shade per colour** (`hex` `#rrggbb`, lowercase). No two-tone colours: gems with special reflections
  or several colours go into the single **multicolour** entry (`is_multicolor`, no hex, iridescent swatch drawn by
  the front end). It is a colour like any other for products and URLs (`couleur=multicolor`); it can be renamed and
  hidden, never deleted.
- **`slug`** is the value of `products.metadata.color` and of the `couleur` URL parameter: set once at creation
  (from the French name, made unique with a suffix), never changed afterwards (trigger), so renaming a colour breaks
  no link and no product.
- **Names**: French in `name`, English in `gem_color_translations` (published). `admin_save_gem_color()` requires
  both, so a colour never reaches the English storefront untranslated.
- **Products**: `metadata.color` stays a slug (presentation data), but a trigger rejects a slug that is not a
  colour (`23503`), and `admin_delete_gem_color()` refuses a colour that any product uses (`23503`) — hide it
  (`is_active = false`) to take it out of the storefront while its products keep it.
- **Access**: visitors read active colours and published translations; staff read all; `manage_products` writes
  (the three functions are `SECURITY INVOKER`, RLS applies). Name, shade, visibility changes and deletions go to
  `audit_logs`.

### Wishlist (iteration 17)

The hearts of the storefront (shop cards, home rail, product page) and the shop's « Mes favoris » view
(`/boutique?favoris=1`, behind the header's heart) read and write `wishlist_items` (`webapp/src/lib/favorites.tsx`).

- **One row per member and product** (primary key): adding twice fails with `23505`, which the app treats as done.
  The list is naturally bounded by the catalogue, so there is no separate cap.
- **The owner comes from the session**: `user_id` defaults to `auth.uid()` and only `product_id` is granted for insert.
  No update grant — a favourite is added or removed.
- **Only shop products**: the insert policy requires an `active` product and an `active` account. A product later
  archived keeps its rows but is no longer readable by customers, so it drops out of the view and comes back if
  republished; a product really deleted takes its rows with it (CASCADE).
- **Private**: members see only their own favourites; visitors have no access; staff have no read access either
  (no screen needs it). Per-product counts, if wanted later, belong in a function that returns aggregates only.
- **Personal data**: deleted with the account (CASCADE). To include in the personal-data export when that job is built.
- Not audited: a customer preference, neither money nor security.

### Academy authoring (iteration 20)

What the back-office course builder (`/admin/formations`) and the training media library
(`/admin/formations/medias`) read and write. Learner access, progress and quiz attempts come next (phase C);
the public Academy pages read the published courses since iteration 21 (phase B, below).

```
training_media (image | video, storage media/<id>/<file> in the private training-media bucket)
courses ─* course_modules ─* course_steps ─* course_blocks (text | image | video)
                 └─ course_quizzes (0..1 per module) ─* quiz_questions ─* quiz_answers
courses ─* course_promotions            every level ─* <level>_translations (English; French in the base columns)
media references: courses.cover_media_id, course_modules.cover_media_id, course_blocks.media_id / poster_media_id,
                  quiz_questions.image_media_id — ON DELETE RESTRICT
```

- **A course is not a product** (owner, 2026-10-01): it never shows in the shop. Price `numeric(12,2)` + `currency`
  on `courses`, edited with `manage_training` only. Phase D (selling courses) needs a course line in
  `create_order()` and the Stripe Checkout functions, with the `training` VAT category.
- **One save per course**: `admin_save_course(jsonb)` (SECURITY INVOKER, `manage_training`) writes the course, its
  English translation and the whole tree in one transaction. Ids come from the browser; nodes are upserted by id
  and only the ids missing from the payload are deleted, so step / quiz / answer ids survive every save (phase C's
  progress rows will point at them). An id already stored under another course is refused. Money arrives as a
  decimal string. Each media slot is checked for kind (image slot ← image, video block ← video). An English field
  left empty removes that node's English row (the French text is shown).
- **Lifecycle** (trigger `courses_guard`): created as `draft`; `published` only when
  `course_publication_problems()` is empty (at least one module, no empty module, every image/video block has its
  file, every quiz has questions, every question ≥ 2 answers and one correct); `published_at` set once, by the
  trigger; `published ⇄ unpublished`; never back to `draft`; the slug of a course that was ever published is
  frozen; only never-published courses can be deleted (RLS). A published course stays publishable: every save
  is re-checked at commit (deferred trigger `courses_published_ready`). Saving a published course changes what
  its buyers read at once — there is no separate draft of a published course. Status, price, slug, creation and
  deletion audited.
- **Unpublished course** (owner, 2026-10-01): its buyers still see it in their space, greyed out with a "back soon"
  message, and cannot open it (phase C enforces it in RLS). Visitors no longer see it.
- **Course promotions**: `percentage` (< 100) or `amount` (< the course price) off one course between `starts_at`
  and `ends_at` (open-ended allowed); at most one active promotion per course at any instant (guard locks the
  course row, then checks overlaps); `course_current_prices` gives the price now, rounded half away from zero to
  the cent. Lowering the course price below an active amount promotion is refused. No codes, no customer
  segments. Audited.
- **Quiz answer keys**: `quiz_answers.is_correct` / `explanation` are readable by staff only. Phase C serves
  corrections through a function, after an answer is submitted.
- **Access**: staff (`is_staff`) read everything; `manage_training` writes; visitors and customers read what
  iteration 21 opens (below) — none of the content or answers.
- Suite: `tests/iteration20_validation.sql`.

### Academy public pages (iteration 21)

What the public Academy pages read (webapp `lib/academy/`: catalogue `/fr/academy`, sales pages
`/fr/academy/formation/<slug>` ↔ `/en/academy/course/<English slug>`, the home band, the header and footer entries),
as an anonymous visitor (server, publishable key) or any signed-in account:

- **Published courses** and their published translations (as before), the **outline** — `course_modules`,
  `course_steps`, `course_quizzes` (title, pass mark, settings) and their published translations, for published
  courses only — and the **current price** (`course_current_prices`). Never `course_blocks`, `quiz_questions`,
  `quiz_answers`: the lesson content and the answer keys wait for phase C's entitlements.
- **Cover image**: the `training_media` row and published translations of a published course's cover, and its
  file in the private `training-media` bucket (storage policy `private.is_public_course_cover_path()`). No other
  media of the library, nor a draft's or a withdrawn course's cover. The webapp serves it at
  `/media/formations/<media id>` (Route Handler reading with the publishable key, CDN-cached an hour, `?v=` changes
  when the file is replaced).
- **Promotions are staff-only** now: visitors and customers see the discounted price and its end date through the
  view, which reads the running promotion with the SECURITY DEFINER helper `private.course_running_promotion()`;
  the internal `label` and `created_by` never leave the back office.
- **Column grants for `anon`**: `courses` without `created_by`/`updated_by`; `training_media` only `id`, `kind`,
  `storage_path`, `mime_type`, `alt_text`, `width`, `height`, `updated_at`. `authenticated` keeps table-wide
  SELECT (staff use `select=*`), so a signed-in customer could still read those columns on the rows RLS shows
  them (published courses, public covers) — see deliberate decision 49.
- The outline policies use `private.is_published_course(course_id)` (SECURITY DEFINER, stable).
- Suite: `tests/iteration21_validation.sql` (visitor, customer, staff viewer, withdrawal). Suite 20's customer
  check now expects the published course's cover to be readable.

### Integrity guarantees

- `orders_total_matches`: `total = subtotal − discount + shipping (+ tax when prices exclude tax)`; discount ≤ subtotal; all amounts ≥ 0.
- Deferred constraint triggers: `orders.subtotal_amount` must equal the sum of its items **at commit** (write the order and its items in one transaction).
- `orders_guard_update`: outside trusted backends, amounts, snapshots, customer, currency and `customer_note` are immutable — admins can only change states and `admin_note`.
- Ordered products/variants cannot be hard-deleted (`ON DELETE RESTRICT`); archive them. Order items never read live catalogue data.
- Payments `RESTRICT` order deletion.
- `consume_inventory(item, qty)` decrements stock with one conditional `UPDATE` (row lock + re-check) → no negative stock, no double-selling the last unit. Service role only.
- Unique: product/category slugs, product/variant SKUs, order numbers, provider payment ids, one primary media, one inventory row per product/variant, one default address per type.

### Indexes

`products(category_id)`, `products(status)`, partial featured index; `product_variants(product_id, position)`;
`product_media(product_id, position)`, `(variant_id)`; `customer_addresses(user_id)`;
`orders(user_id, created_at desc)`, `orders(created_at desc)`, `orders(status)`, `(payment_status)`, `(fulfillment_status)`;
`order_items(order_id)`, `(product_id)`, `(variant_id)`; `payments(order_id)`; `profiles(role)`, `profiles(lower(email))`.
Unique constraints already index slugs, SKUs and order numbers.
Audit FKs (`created_by`/`updated_by`) are intentionally not indexed (only scanned when a staff profile is deleted).

## Security

| Who | Can |
|---|---|
| **anon** (visitor) | read active categories, active products, their active variants, media and stock. Nothing else (no access at all to profiles, addresses, orders, items, payments). |
| **customer** (authenticated) | the public catalogue + read/update **own** profile (not role/status/email), full CRUD on **own** addresses, read **own** orders, order items and payments. Cannot create/modify orders, catalogue, inventory or roles. |
| **admin** (`role = 'admin'` and `status = 'active'`) | full CRUD on categories, products, variants, media, inventory; read all profiles, addresses, orders, items, payments; update order states + `admin_note`; change other users' role/status. Cannot rewrite order amounts/snapshots, cannot change their own role/status (lock-out protection). A suspended admin instantly loses access. |
| **service_role** (server only) | bypasses RLS: `create_order`, `mark_order_paid`, `expire_stale_orders`, `consume_inventory`, webhook event log. Never shipped to browsers. |

Iteration 2 additions:
- **Visitors** also read enabled languages, *published* translations of active content, active shipping zones/rates and active VAT rates (all public by nature).
- **Customers** read the VAT lines of their own orders; cannot call `create_order`, `mark_order_paid`, `cancel_order`, or read the ledger, webhook log or audit log.
- **Admins** manage translations, shipping and VAT configuration, can `cancel_order()` unpaid orders (reservation released), mark bank transfers paid (stock committed), read the stock ledger, webhook log and audit log. They cannot cancel a paid order (refund first), edit lifecycle columns (`stock_state`, `paid_at`, `expires_at`…), or modify/delete audit entries.

Iteration 5 additions:
- **Visitors** read the loyalty rules only; no consent, export, loyalty card or CRM data.
- **Customers** read their own consents, export requests, loyalty cards/stamps/overview and review requests; add their
  own consent records and export requests; edit persona / interest / language / country / birth date. They cannot
  write `marketing_opt_in`, `password_changed_at`, stamps, cards or loyalty rules, nor see CRM tags/notes.
- **Admins** read everything above, manage CRM tags/notes (notes: own edits only) and the loyalty rules (audited).

Iteration 17: **customers** read, add and remove their own favourites (`wishlist_items`); visitors and staff have no access.

Iteration 6: "admin" in the lines above now reads "a team member holding the matching permission"
(see *Back-office roles and permissions*); policy names say "staff".

- Authorization is enforced in Postgres (`private.is_admin()` + RLS + triggers), never by frontend checks.
- `TRUNCATE`, `REFERENCES`, `TRIGGER` revoked from `anon`/`authenticated` (TRUNCATE bypasses RLS).
- Order/item/payment inserts are revoked from `authenticated`: prices and totals can only come from server code.
- All functions use `set search_path = ''`; security-definer helpers live in the non-exposed `private` schema.

### Storage

| Bucket | Access |
|---|---|
| `product-media` (public, 10 MB, jpeg/png/webp/avif/mp4/webm) | anyone can fetch a file by its public URL (catalogue imagery is public by design); no public listing; upload/replace/delete **admins only**. |
| `avatars` (private, 2 MB, jpeg/png/webp) | owner reads/uploads/replaces/deletes inside `<user_id>/`; admins read and delete (moderation); served with signed URLs. `profiles.avatar_path` must start with the owner's id. |
| `data-exports` (private, 100 MB, zip/json) | owners read their own `<user_id>/` folder through signed URLs; only the backend (service role) writes and deletes. |
| `review-photos` (private, 8 MB, jpeg/png/webp) | authors upload into `<user_id>/`; authors and admins read and delete; **anyone** can read a photo once its review is published. |
| `training-media` (private, no bucket limit: the project's global upload limit applies — 50 MB on the free plan; jpeg/png/webp/avif/mp4/webm/quicktime) | staff read; `manage_training` uploads, replaces and deletes under `media/`; the back office shows files through signed URLs. Learners get signed URLs after the entitlement check in phase C. Large videos are sent with resumable (TUS) uploads. |

Path convention: `products/<product-slug>/<file>`, `categories/<category-slug>/<file>`, `<user_id>/<file>` for avatars and review photos.
Never put private customer or paid training files in this bucket.

## Operations

**Bootstrap the first admin** (SQL editor or service role only — there is no UI path by design):

```sql
update public.profiles set role = 'admin' where email = '<admin email>';
```

**Order creation:** always through `create_order()` (service role) — see *Checkout flow* above.

**Expiry job:** pg_cron job `expire-stale-orders` runs `select public.expire_stale_orders();` every 5 minutes
(migration `20260930200000_stripe_checkout`). Check it with `select * from cron.job_run_details order by start_time desc limit 5;`.

**Webhook handler pattern** (implemented in `functions/stripe-webhook`): `record_stripe_webhook_event()` inserts the
event or counts the retry and returns its status → skip when `processed` / `ignored`; otherwise call the function,
then set `status = 'processed'` (or `failed` + `error`). Events in `failed` need a look from the team
(`select * from stripe_webhook_events where status = 'failed'`).

**Validation:** run `tests/mvp_validation.sql`, `tests/iteration2_validation.sql` and
`tests/iteration3_validation.sql`, `tests/iteration4_validation.sql`, `tests/iteration5_validation.sql` and
`tests/iteration6_validation.sql`, `tests/iteration7_validation.sql`, `tests/iteration8_validation.sql`,
`tests/iteration9_validation.sql`, `tests/iteration10_validation.sql`, `tests/iteration11_validation.sql`,
`tests/iteration12_validation.sql`, `tests/iteration13_validation.sql`, `tests/iteration15_validation.sql`,
`tests/iteration17_validation.sql`, `tests/iteration18_validation.sql`, `tests/iteration19_validation.sql`. Each ends with
`ALL … PASSED (...)` raised as an exception, which rolls everything back.
(The order-number sequence still advances — sequences are not transactional.)

**Member sign-up (Auth settings, not SQL):** the webapp creates accounts with `supabase.auth.signUp`;
`handle_new_auth_user` turns the metadata into the profile and the consent records. In the dashboard:
- Authentication → Sign In / Providers → Email: *Confirm email* **on**; minimum password length 8 with
  lower case, upper case, digits and symbols required (the rules the form shows).
- Every Auth e-mail link lands on the webapp's `/auth/confirm` route (Next.js, since phase 2 of
  `docs/migration-nextjs.md`), which opens the session in cookies server-side and forwards to the page
  showing the outcome (`/confirmation-compte`, `/reinitialiser-mot-de-passe`, `/verifier-email?type=changement`).
  The webapp passes `…/auth/confirm?next=…` as the redirect of every sign-up, resend, reset and e-mail change.
- Authentication → URL Configuration: Site URL = the production URL; redirect allow-list:
  `http://localhost:5173/**`, `https://<production domain>/auth/confirm**` and, for Vercel previews,
  `https://*-<vercel team>.vercel.app/auth/confirm**` (a redirect not in the list is replaced by the Site URL).
  The former `/confirmation-compte` and `/reinitialiser-mot-de-passe` entries are no longer used.
- Authentication → Emails, the link of each template, so it works on whichever device opens it
  (`verifyOtp` with the token hash rather than the PKCE code, which only the requesting browser can exchange):
  - *Confirm signup*: subject *Confirmez votre compte Global Toothgems*, body from `templates/confirm-signup.html`
    (link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`);
  - *Reset password*: link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`;
  - *Change email address*: link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email_change`.
  With Supabase's default `{{ .ConfirmationURL }}` links still work, but only in the browser that asked for them.
  An e-mail sent from the dashboard rather than by the app carries the Site URL as `.RedirectTo`: send
  confirmations and resets from the app.
- Authentication → Emails → SMTP: the built-in sender is rate-limited to a few emails per hour and meant
  for testing; production needs custom SMTP (Resend, per the project stack).

**Demo member:** run `seed_demo_member.sql` after `seed.sql` (idempotent; the remote project already has it).
It creates `camille.bernard@example.com` (id `c4a11e00-0000-4000-a000-000000000001`) through the real
sign-up trigger and checkout functions: 4 orders (delivered, cancelled, delivered, shipped), 3 parcels,
3 reviews (published, needs changes, rejected), 2 review requests, 3/5 loyalty stamps, consents, an expired
export, a CRM tag and note. To sign in with it on a development project, set a password from the SQL editor:
`update auth.users set encrypted_password = extensions.crypt('<password>', extensions.gen_salt('bf')) where id = 'c4a11e00-0000-4000-a000-000000000001';`
Remove it before going live (`delete from auth.users where id = …` — orders stay, anonymised).

**Data export job (to build):** pick `pending` requests, set `processing`, write
`data-exports/<user_id>/<file>.zip` with the service role, set `ready` + `ready_at` + `expires_at` (7 days),
later `expired` and delete the object.

**Seed:** `seed.sql` is idempotent: catalogue (fr), English translations (published), weights,
VAT rates, shipping zones/rates mirroring the Settings prototype. Media rows reference
`products/<slug>/*.jpg` paths; the image files still have to be uploaded to the bucket.

## Deliberate decisions to review

1. **Money as `numeric(12,2)`** — **decided (Sept 2026), keep it.** Postgres stores exact decimals + ISO-4217
   currency; TypeScript and Stripe use integer minor units; conversion only at boundaries
   (`amount * 100` for 2-decimal currencies, `webapp/src/lib/catalog/money.ts`). 3-decimal currencies
   (KWD, BHD…) would need a wider scale.
2. **Default content language = French.** Base columns hold French (matches the storefront
   `fallbackLng: "fr"`), but the Settings prototype declares `SOURCE_LANGUAGE = "en"`. The repo is
   inconsistent; switching the default later means moving base text into an `fr` translation and
   `en` into the base columns (a data migration, not a schema change).
3. **Stock of active products is public** (enables "only 3 left" / out-of-stock badges). Restrict to
   `stock_status` only via a view if quantities become sensitive.
4. **Admins may set `payment_status`** manually (e.g. bank transfer). Stripe webhooks remain the
   authoritative source for card payments. Marking paid commits the reserved stock automatically.
5. **VAT model** follows the Settings prototype: prices include VAT, tax country = shipping
   country (billing for digital-only), per-line rounding, shipping taxed at the standard rate,
   destinations without a configured rate → 0 % (exports). **Rates are illustrative — have the
   accountant confirm them.** OSS thresholds, B2B reverse charge and VAT-number validation are not
   modelled yet. Stripe Tax could replace `vat_rate_bp()` later.
6. **Reservation window** defaults to 60 minutes (`p_reservation_minutes`, 5–1440). Stripe Checkout
   sessions can live longer; set the session `expires_at` to match.
7. **Reviews are deleted with the customer's account** (their text is personal data), and customers
   can delete their own review. Signed-in users can technically read the `user_id` of *published*
   reviews (visitors cannot); switch to column grants for `authenticated` too if that matters.
8. **Report resolutions:** `hidden` → review hidden; `removed` → review rejected (reason
   `guidelines`). Nothing is ever deleted by a report.
9. **Refunds never cancel shipments** and a partial refund leaves the order status unchanged; a full
   refund sets it to `refunded`. Restocking happens only when `restock = true` and the sale had
   taken the stock.
10. **Gift cards carry no VAT at sale** (multi-purpose voucher: VAT applies when the card is spent). Confirm
    with the accountant; a single-purpose voucher would be taxed at sale instead.
11. **Security advisor warning, accepted**: the five staff gift card functions are `SECURITY DEFINER` and callable by
    signed-in users; each one authorizes the caller itself (active admin or service role) — they are the only
    write path to cards and the ledger. Tested (G13).
12. **Expired card balances** stay in the ledger (no automatic breakage entry); accounting treatment of expired
    balances is a finance decision.
13. **Loyalty stamp basis** (not specified by the prototype): goods value after discount, excluding shipping
    and gift cards, at payment. A partial refund keeps the stamp; a full refund or cancellation voids it only
    while the card is still being collected (a completed card is never taken back). Confirm with the business.
14. **Loyalty reward redemption** — implemented in iteration 6 (see decisions 21–22).
15. **Consent history is deleted with the account** (cascade). If proof of consent must outlive the account
    (e.g. to answer a marketing complaint), switch to `on delete set null` + keep the email hash — legal decision.
16. **Order numbers** stay `GT-100001…`; the member prototype shows `GT-2026-0151`. Changing the format is a
    one-line change in the sequence default if wanted.
17. **The demo member has no password** (no secret in Git). See *Operations*.
18. **Four permissions added to the prototype's seven** (`manage_orders`, `manage_customers`, `manage_promotions`,
    `moderate_reviews`): the prototype has none for orders, customers, promotions or reviews although its managers
    run them. Managers get them; read-only users do not. Changing the matrix = a migration on `role_permissions`.
19. **Read-only staff read all customer data** (orders, addresses, profiles, CRM notes) — needed by customer care
    and accounting in the prototype. Restrict with a `view_customers` permission if some read-only users should not.
20. **Managers can invite and suspend other managers** (seed: managers invited managers). Only administrators touch
    administrators. `staff_directory()` is `SECURITY DEFINER` (reads `auth.users`) and checks `view_users` itself —
    accepted advisor warning, like the gift card staff functions.
21. **Loyalty reward vs promotions**: the reward is used only on request and never stacks with a promotion or code
    (the safest reading of "define stacking rules"). It is not taken back after a paid order is refunded.
    Confirm with the business.
22. **Discount rules to confirm**: gift card lines are never discounted (the prototype's "exclude gift cards" option
    is forced on); a typed code that does not apply refuses the order instead of being silently dropped; an applicable
    code can lose to a better automatic promotion (the order records which one applied); shipping thresholds
    (`free_over_amount`, rate bounds) still use the goods amount **before** discounts; a free gift's weight is not
    counted in the shipping rate bounds; at most 3 codes per order.
23. **Codes are case-insensitive** and unique across all promotions, archived ones included (the prototype's
    "case sensitive" option is not modelled).
24. **Internal promotion/campaign names** are hidden from visitors (column grants) but readable by signed-in customers
    for *running automatic* promotions (same trade-off as decision 7). Do not put confidential text in them.
25. **Contact form for visitors goes through a server route** (captcha, IP limit, service role); the database only
    throttles per e-mail/account. `submit_contact_request`, `newsletter_confirm`, `newsletter_unsubscribe` are
    `SECURITY DEFINER` and reachable from the API on purpose (accepted advisor warnings): each validates its input
    and only acts on the caller's own data or on a bearer token.
26. **Retention of tickets, attachments and unsubscribed addresses** is not automated: how long to keep them is a
    legal/business decision (e.g. tickets 3 years after closing). The list keeps unsubscribed addresses so they are
    never mailed again.
27. **Member e-mail change**: the list entry keeps the old address until the member's next marketing decision.
28. **Double opt-in for visitors, not for members**: a member's opt-in is recorded from their account (Supabase Auth
    confirms the account e-mail); confirm this is enough for the countries served (e.g. Germany).
29. **Legal documents and FAQ stay in the frontend** (`data/legal/*`) until their placeholders are validated;
    `content_pages` is ready to receive them (kind `legal` requires a `policy_version`).
30. **`store_settings` holds only the maintenance switch**: the store-settings iteration adds the rest of the
    Settings workspace to the same row.
31. **Revenue = merchandise charged, VAT included**, net of discounts; shipping, gift cards (money held until spent)
    and refunds are reported apart, not deducted. If finance wants revenue excluding VAT or net of refunds, it is a
    change in `private.analytics_sale_lines()` only.
32. **Sales are dated by payment (`paid_at`)** in the shop's time zone (default `Europe/Paris`); the orders section
    uses the placement date. A customer is an account, or a guest's e-mail (a guest who later signs up counts twice
    until guest orders are linked).
33. **Training figures are `null`** until the training iteration; **product-page conversion** is not available (it
    needs web analytics, not stored here); **insights** (written advice) are left to the frontend: the rules in
    `webapp/src/data/adminAnalytics.ts` derive them from the figures (its fixed "bundle 38 %" becomes `cross`).
34. **No pre-aggregated tables**: each call recomputes from the orders (index on `paid_at`). Fine for the expected
    volume; add a materialised daily summary if the screen becomes slow.
35. **Amounts in currency units** (`numeric`, like the rest of the schema), one currency per call — no conversion
    between currencies.
36. **Category → reporting bucket mapping** (tools and accessories folded into kits) is a guess from the prototype;
    adjust `categories.report_group` from the admin if needed.
37. **Product addresses use the slugs (decided by the owner, Sept 2026).** `/fr/boutique/<products.slug>` and
    `/en/shop/<published product_translations.slug>` (the French slug when there is none); any other known key
    (another language's slug, the row id) is moved there with a 308, an unknown slug is a 404
    (`webapp/src/lib/catalog/productSlugs.ts`, `docs/migration-nextjs.md` phase 3.2). So editing a published slug
    moves the product page: old slugs are not kept, and an old link to a renamed product becomes a 404. A slug
    history table would be the fix if renames become common. `meta_title` / `meta_description` are not used yet
    (empty, not editable in the back office).
38. **Internal order notes moved to `order_notes` (applied, Oct 2026).** The
    column stays (always NULL, a check forbids a value) because the checkout's stock trigger still writes
    `new.admin_note`; dropping it means rewriting those functions — a follow-up once the Stripe work settles.
    Other staff-written fields remain readable by the owner of the order (`cancellation_reason`,
    `refunds.failure_reason`): keep them customer-safe, or move them the same way if they need to be internal.
39. **No invoices yet.** The member area offers a printable *order summary*, labelled as not being an invoice.
    Legal invoices (sequential numbering, seller details, VAT breakdown per rate, credit notes) remain a
    future iteration ("Next iterations", item on invoices / credit notes).
40. **Guest orders are not attached to an account.** An order placed without an account (`user_id` NULL) never
    appears in "My orders", even if the e-mail later signs up. Attaching them (by verified e-mail, at sign-up or
    on demand) is an open business decision — not implemented.
41. **Checkout return page readable by the session id holder** (`checkout_session_status`, SECURITY DEFINER, anon):
    order number + coarse state only. The cs_… id is a bearer value (Stripe redirect, browser history); nothing
    personal or payable is behind it. Accepted advisor warning.
42. **Checkout identity**: a signed-in customer's order carries the account (`user_id` from the token verified by the
    Edge Function); the e-mail typed in the cart is the order's contact e-mail, even if it differs from the account's.
    Guest orders: decision 40.
43. **Delivery rate chosen by the customer** among the zone's rates whose order bounds fit the basket (cheapest
    pre-selected); create_order() re-checks zone, bounds and weight. Rate names are French-only in the database, so
    the storefront labels them by kind (standard / express / free / pickup). Confirm the offer with the business.
44. **Split payment ("payer en 4 fois") removed from the cart** until a provider is decided (Klarna through Stripe
    would be a dashboard setting, not code). The methods offered are those enabled in the Stripe dashboard.
45. **Courses are not products** (owner, 2026-10-01): price on `courses`, `manage_training` only; selling them
    (phase D) needs a course line in checkout. **Course promotions** are a separate, simpler mechanism (dated
    percentage or amount off one course, one at a time, no codes) — proposed by the agent, to confirm.
46. **No "review" status for courses** (owner, 2026-10-01): a single trainer authors them; draft is the not-ready
    state. A course that was ever published is withdrawn (`unpublished`), never deleted nor turned back into a draft.
47. **English course content without a review step**: every Academy `*_translations` row is written `published`
    on save (the course lifecycle decides visibility), like the product form does.
48. **Training media bucket without its own size limit**: the project's global upload limit applies (50 MB on the
    free plan); raise it in the dashboard when moving to Pro. Objects uploaded but never recorded (upload succeeded,
    row insert failed) stay in the bucket until a clean-up job exists.
49. **Staff columns of public Academy rows readable by signed-in customers**: column grants hide
    `courses.created_by`/`updated_by` and the media's internal columns from `anon` only, because staff read those
    tables with `select=*` as `authenticated` too. A customer calling the REST API with their own token could read
    the staff uuid that created a published course or its cover, nothing else. Close it by moving the back office to
    explicit column lists (or an RPC) and granting the same columns to `authenticated`.
50. **Course sales pages before courses can be bought**: until phase D, a published course's page shows its price
    and "enrolment opens soon" instead of a start button, its structured data has no `offers`, and it has no
    sticky purchase bar. The learner pages stay on the prototype's seeded courses until phase C.

49. **"Collected" figure of the order book** (agent, 2026-10-01, to confirm): per currency, never added across
    currencies; for orders whose payment was received (`paid`, `partially_refunded`, `refunded`) and that are not
    cancelled, `amount_due` (total less gift cards) less succeeded refunds. Gift cards therefore count once, when
    sold, not again when spent; unpaid, failed and cancelled orders count for nothing. The statistics screen
    (`analytics_snapshot`) measures goods sold instead (gift-card products excluded), so the two figures differ
    by design. A buyer's "spent" on the order page is the member area's rule (recorded totals of paid orders that
    stand, less refunds).

## Done

- Iteration 2: translations, shipping zones/rates, VAT rates, stock reservations + ledger,
  server-side order functions, Stripe webhook idempotency, admin audit log, private avatars.
- Iteration 3: reviews with moderation, reports, votes and photos; shipments and tracking with
  order status sync; refunds with payment/order states and restocking.
- Iteration 4: gift cards — purchase through checkout, ledger balances, redemption as payment,
  reversal on cancellation, refunds onto cards, staff operations, scheduled delivery.
- Iteration 5: member account — registration answers, consent records, data export requests, loyalty club
  (stamps from paid orders), CRM tags/notes, review requests, seeded demo member.
- Iteration 6: back-office roles and permissions (read only / manager / administrator, rank rules, staff directory);
  promotions (six types, scope, customer segments, limits, automatic/shared/unique codes), campaigns, collections,
  discounts and per-line VAT in `create_order()`, loyalty reward redemption.
  The iteration 2 suite now reads the premium kit stock at start (the demo member seed had sold one).
- Iteration 7: contact tickets (validated, throttled, own-order linking, private attachments, triage, notes),
  visitor newsletter with double opt-in synced with member consents, e-mail templates and content pages with
  translation status, maintenance switch.
- Iteration 8: back-office statistics — `analytics_snapshot()` (KPIs vs previous period, series, category breakdown,
  best sellers, customer base, orders, geography, cross-selling, extras), filters, category reporting groups.
- Iteration 9: product recommendations — manual links per product (complementary / similar), `recommended_products()`
  with bought-together, same-category and popular fallbacks, seed links.
- Iteration 10: back-office product management — `admin_save_product()` (product + published English translation +
  stock + ordered media, money as validated decimal strings, unique slugs, orphaned storage paths returned),
  `admin_delete_product()` (order history protected by FK), `admin_save_product_recommendations()`.
- Iteration 11: gem options — packs of 20 / 50 / 100 stones × stone sizes (SS) as variants with their own price
  and stock, edited from the product form and picked on the product page; seed product `strass-cristal`.
- Iteration 13: gem colours managed from the back office — `gem_colors` + translations, one exact shade per colour,
  a single multicolour entry for gems with reflections / several colours, create / edit / hide / reorder / delete
  (refused while used), product colour checked against the list.
- Iteration 14: gem packs set per product — the administrator types any number of stones (1 to 10 000) instead of
  choosing among 20 / 50 / 100; the storefront picker already reads the packs from the variants.
- Iteration 15: variants of any kind edited from the product form — a list of named variants (colour, box, size…)
  with an optional colour dot, price, stock and the photos that show them; the product page shows colour dots
  and moves the gallery to the picked variant's photo.
- Iteration 19: Stripe Checkout wiring — Edge Functions `create-checkout-session` and `stripe-webhook`, pg_cron job
  `expire-stale-orders`, `record_stripe_webhook_event()`, `checkout_session_status()` for the payment return page.
- Iteration 16: product families — categories › families taxonomy, composite FK, family cleared on a category
  change, `admin_save_product()` family input, visitor RLS on families and their translations.
- Iteration 18 ("My orders"): internal order notes out of the customer's reach
  (`order_notes`), isolation suite for everything the member area reads of an order.
- Iteration 20: Academy authoring — courses, modules, steps, content blocks, quizzes, training media library
  (private bucket), course price and course promotions, publication rules, `admin_save_course()`.
- Iteration 21: Academy public pages (phase B) — outline, cover and current price of published courses readable by
  visitors, promotions staff-only, column grants for visitors.

## Next iterations (not implemented)

1. Checkout follow-ups: order confirmation e-mail (Resend, Edge Function), promotion code and gift card fields
   in the cart (the function already accepts them), Stripe refunds from the back office, `charge.refunded` /
   `charge.dispute.created` webhooks.
2. Academy, after the authoring schema (iteration 20):
   (**B**, public pages, done in iteration 21); **C** `course_entitlements` (manual grant, audited), content and signed URLs gated on
   entitlement, quiz answers checked by a function, server-side progress and attempts, certificates, unpublished
   courses greyed for their buyers; **D** selling courses: a course line in `create_order()` and the Stripe
   Checkout functions (VAT category `training`, course promotions applied server-side). Kit QR links; course
   reviews (`course_id` on `reviews`). Invoices / credit notes (sequential numbering), carrier tracking events.
3. Store settings table (legal identity, order number format, tax display options), VAT numbers /
   B2B reverse charge, multi-currency price lists.
4. Guest checkout linking (attach guest orders to an account by verified email).
5. Structured product attributes (gem shape/colour), multiple signed order notes.
6. Community (unlocked by a training purchase), 3D Studio subscription — each as its own migration set referencing `profiles` and `products`.
