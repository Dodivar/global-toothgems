# Global Toothgems — Database (iterations 1–3: e-commerce MVP, checkout, reviews, shipments, refunds)

Supabase project **Global Toothgems** (`abvuyvryerpzlvibttxp`, region `eu-west-3` Paris, Postgres 17).
Supabase Auth is the only authentication system; all application data lives in `public`,
helpers in `private` (not exposed through the API).

Iteration 1 laid the commerce + administration foundation. Iteration 2 added what
checkout and the admin need next: content translations, shipping/VAT configuration,
stock reservations with a ledger, server-side order functions, Stripe webhook
idempotency, an admin audit log and private avatars. Iteration 3 added product
reviews with moderation, shipments with tracking, and refunds.
Training, community, loyalty, promotions, notifications and analytics are
still out of scope and get their own migrations later.

## Layout

```
supabase/
  migrations/   versioned SQL, applied in filename order (versions match the remote project)
  seed.sql      fictional catalogue for development (no customers, no personal data)
  tests/mvp_validation.sql          iteration 1 RLS / integrity suite (always rolls back)
  tests/iteration2_validation.sql   iteration 2 checkout / stock / audit / i18n suite (always rolls back)
  tests/iteration3_validation.sql   iteration 3 reviews / shipments / refunds suite (always rolls back)
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

RLS is **enabled in the same migration that creates each table** (deny by default);
policies are granted back in `rls_policies`.

## Data model

```
auth.users 1─1 profiles ─* customer_addresses
                  │ role → roles.key
                  └─* orders ─* order_items ─→ products / product_variants (RESTRICT)
                              └─* payments

categories 1─* products 1─* product_variants
                  │   └─* product_media (variant_id optional)
                  └── inventory_items (one per product WITHOUT variants, or one per variant)
                          └─* inventory_movements (ledger, order_id optional)

languages 1─* {category,product,product_variant,product_media}_translations
shipping_zones 1─* shipping_zone_countries (a country is in at most one zone)
               1─* shipping_rates ←─ orders.shipping_rate_id (+ name snapshot)
tax_rates (country × tax_category, basis points)
stripe_webhook_events ─→ orders        audit_logs (trigger-written)
```

Conventions: plural snake_case tables, `uuid` keys, `timestamptz created_at/updated_at`,
statuses as `text` + `CHECK` (easy to extend, no enum migrations), money as
`numeric(12,2)` + ISO-4217 `currency` (never floating point).

### Tables

| Table | Purpose / key rules |
|---|---|
| `roles` | `customer`, `admin`. New roles = one `INSERT` (`is_staff` flag ready for support/content roles). |
| `profiles` | first/last/display name, `avatar_path`, `phone`, `role`, `status` (`active`/`suspended`/`deactivated`), `email` mirror of `auth.users`. Created automatically on sign-up; sign-up metadata can **never** set the role. |
| `categories` | flat list: `slug` (unique), `name`, `description`, `image_path`, `is_active`, `position`. |
| `products` | `slug`/`sku` unique, `price`, `compare_at_price` (> price), `currency`, `status` `draft`/`active`/`archived` (archived = soft delete), `is_featured`, `product_type` `physical`/`digital`, `metadata` (presentation only). |
| `product_variants` | optional per product; `attributes` JSONB object (`{"colour":"saphir"}`, `{"size":"3mm"}`) so new option types need no columns; `price` null = inherit product price. |
| `product_media` | Storage object path + `media_type`, `alt_text`, `position`, `is_primary` (max one per product), optional `variant_id`. No binaries in Postgres. |
| `inventory_items` | exactly one of `product_id`/`variant_id`; `quantity_on_hand`, `quantity_reserved` (≤ on hand), `low_stock_threshold`, `track_inventory`, manual `availability`; generated `stock_status` (`in_stock`/`low_stock`/`out_of_stock`/`preorder`). |
| `customer_addresses` | many per user, `address_type` shipping/billing, one default per type (setting a new default clears the old one), ISO `country_code`, nullable `postal_code`/`region`. |
| `orders` | `order_number` `GT-100001…`, `user_id` (SET NULL on account deletion — accounting records survive), `customer_email` + `billing_address`/`shipping_address` **JSONB snapshots**, subtotal/discount/shipping/tax/total, `prices_include_tax` (EU VAT-inclusive default), `status`, `payment_status`, `fulfillment_status`, `customer_note`, `admin_note`. |
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
server  create Stripe Checkout Session for order.total_amount / currency
webhook checkout.session.completed → record stripe_webhook_events → mark_order_paid(order, amount, currency, cs_…, pi_…)
          → amount/currency must match; payment row upserted; reserved stock becomes a SALE → order 'confirmed'
webhook checkout.session.expired   → cancel_order(order, 'expired')   → reservation RELEASED
cron    expire_stale_orders() every few minutes                        → same, for abandoned orders
```

Stock transitions live in a trigger on `orders`, so they apply whatever the path
(webhook, admin marking a bank transfer paid, admin cancelling, expiry job).
A payment arriving after the reservation expired re-takes the stock if still
available; otherwise the order is left `pending` + paid with an `[auto]` admin
note (restock or refund) — it never oversells.

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

- Authorization is enforced in Postgres (`private.is_admin()` + RLS + triggers), never by frontend checks.
- `TRUNCATE`, `REFERENCES`, `TRIGGER` revoked from `anon`/`authenticated` (TRUNCATE bypasses RLS).
- Order/item/payment inserts are revoked from `authenticated`: prices and totals can only come from server code.
- All functions use `set search_path = ''`; security-definer helpers live in the non-exposed `private` schema.

### Storage

| Bucket | Access |
|---|---|
| `product-media` (public, 10 MB, jpeg/png/webp/avif/mp4/webm) | anyone can fetch a file by its public URL (catalogue imagery is public by design); no public listing; upload/replace/delete **admins only**. |
| `avatars` (private, 2 MB, jpeg/png/webp) | owner reads/uploads/replaces/deletes inside `<user_id>/`; admins read and delete (moderation); served with signed URLs. `profiles.avatar_path` must start with the owner's id. |
| `review-photos` (private, 8 MB, jpeg/png/webp) | authors upload into `<user_id>/`; authors and admins read and delete; **anyone** can read a photo once its review is published. |

Path convention: `products/<product-slug>/<file>`, `categories/<category-slug>/<file>`, `<user_id>/<file>` for avatars and review photos.
Never put private customer or paid training files in this bucket.

## Operations

**Bootstrap the first admin** (SQL editor or service role only — there is no UI path by design):

```sql
update public.profiles set role = 'admin' where email = '<admin email>';
```

**Order creation:** always through `create_order()` (service role) — see *Checkout flow* above.

**Expiry job:** schedule `select public.expire_stale_orders();` every 5 minutes (pg_cron —
enable the extension in the dashboard — or a scheduled server job with the service role).

**Webhook handler pattern:**
`insert into stripe_webhook_events (id, type, object_id, order_id) values (…) on conflict (id) do update set attempts = stripe_webhook_events.attempts + 1 returning status;`
→ skip when `processed`; otherwise call the function, then set `status = 'processed'` (or `failed` + `error`).

**Validation:** run `tests/mvp_validation.sql`, `tests/iteration2_validation.sql` and
`tests/iteration3_validation.sql`. Each ends with
`ALL … PASSED (...)` raised as an exception, which rolls everything back.
(The order-number sequence still advances — sequences are not transactional.)

**Seed:** `seed.sql` is idempotent: catalogue (fr), English translations (published), weights,
VAT rates, shipping zones/rates mirroring the Settings prototype. Media rows reference
`products/<slug>/*.jpg` paths; the image files still have to be uploaded to the bucket.

## Deliberate decisions to review

1. **Money as `numeric(12,2)`** (explicit task instruction) whereas `AGENTS.md` §8 asks for integer
   minor units. Both are exact (no floats). Converting to Stripe's minor units is `amount * 100` for
   2-decimal currencies. If minor units are preferred, switch before real orders exist.
   3-decimal currencies (KWD, BHD…) would need a wider scale.
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

## Done

- Iteration 2: translations, shipping zones/rates, VAT rates, stock reservations + ledger,
  server-side order functions, Stripe webhook idempotency, admin audit log, private avatars.
- Iteration 3: reviews with moderation, reports, votes and photos; shipments and tracking with
  order status sync; refunds with payment/order states and restocking.

## Next iterations (not implemented)

1. Application code: Stripe Checkout route + verified webhook handler calling these functions;
   pg_cron schedule for `expire_stale_orders()`.
2. Training MVP: courses, modules, lessons, enrollments granted on payment, progress, quizzes,
   private course media, kit QR links; course reviews (`course_id` on `reviews`).
   Invoices / credit notes (sequential numbering), carrier tracking events.
3. Store settings table (legal identity, order number format, tax display options), VAT numbers /
   B2B reverse charge, multi-currency price lists.
4. Guest checkout linking (attach guest orders to an account by verified email).
5. Promotions / coupons / gift cards, newsletter & marketing consent, related products,
   structured product attributes (gem shape/colour), staff permissions, order/customer notes & tags.
6. Education (courses, modules, lessons, quizzes, attempts, certificates, entitlements), community,
   loyalty, analytics — each as its own migration set referencing `profiles` and `products`.
