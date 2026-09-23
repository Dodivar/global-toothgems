# Global Toothgems — Database (iteration 1: e-commerce MVP)

Supabase project **Global Toothgems** (`abvuyvryerpzlvibttxp`, region `eu-west-3` Paris, Postgres 17).
Supabase Auth is the only authentication system; all application data lives in `public`,
helpers in `private` (not exposed through the API).

This is deliberately the **first** iteration: commerce + administration only.
Training, community, loyalty, reviews, promotions, notifications and analytics are
out of scope and get their own migrations later.

## Layout

```
supabase/
  migrations/   versioned SQL, applied in filename order (versions match the remote project)
  seed.sql      fictional catalogue for development (no customers, no personal data)
  tests/mvp_validation.sql   end-to-end RLS / integrity suite (always rolls back)
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
| `payments` | Stripe-ready: `provider_checkout_id` (cs_…), `provider_payment_id` (pi_…) unique, status, amount/refunded, `card_brand` + `card_last4` for display only. **No card numbers, CVV or credentials — ever.** |

### Order states (three independent axes, matching the admin prototype)

- `status`: `pending → confirmed → processing → shipped → delivered`, or `cancelled` / `refunded`
- `payment_status`: `pending`, `paid`, `failed`, `refunded`, `partially_refunded` (Stripe webhooks are the source of truth)
- `fulfillment_status`: `unfulfilled`, `preparing`, `partially_fulfilled`, `fulfilled`

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
| **service_role** (server only) | bypasses RLS: checkout order creation, Stripe webhooks, `consume_inventory`. Never shipped to browsers. |

- Authorization is enforced in Postgres (`private.is_admin()` + RLS + triggers), never by frontend checks.
- `TRUNCATE`, `REFERENCES`, `TRIGGER` revoked from `anon`/`authenticated` (TRUNCATE bypasses RLS).
- Order/item/payment inserts are revoked from `authenticated`: prices and totals can only come from server code.
- All functions use `set search_path = ''`; security-definer helpers live in the non-exposed `private` schema.

### Storage

| Bucket | Access |
|---|---|
| `product-media` (public, 10 MB, jpeg/png/webp/avif/mp4/webm) | anyone can fetch a file by its public URL (catalogue imagery is public by design); no public listing; upload/replace/delete **admins only**. |

Path convention: `products/<product-slug>/<file>`, `categories/<category-slug>/<file>`.
Never put private customer or paid training files in this bucket.

## Operations

**Bootstrap the first admin** (SQL editor or service role only — there is no UI path by design):

```sql
update public.profiles set role = 'admin' where email = '<admin email>';
```

**Order creation (future checkout code, service role, one transaction):** recompute prices from
`products`/`product_variants`, insert `orders` with address snapshots, insert `order_items`,
call `consume_inventory()` per line, then let the Stripe webhook set `payment_status`/`payments`.

**Validation:** run `tests/mvp_validation.sql`. It ends with
`ALL MVP VALIDATION TESTS PASSED (...)` raised as an exception, which rolls everything back.
(The order-number sequence still advances — sequences are not transactional.)

**Seed:** `seed.sql` is idempotent. Media rows reference `products/<slug>/*.jpg` paths; the image
files still have to be uploaded to the bucket.

## Deliberate decisions to review

1. **Money as `numeric(12,2)`** (explicit task instruction) whereas `AGENTS.md` §8 asks for integer
   minor units. Both are exact (no floats). Converting to Stripe's minor units is `amount * 100` for
   2-decimal currencies. If minor units are preferred, switch before real orders exist.
   3-decimal currencies (KWD, BHD…) would need a wider scale.
2. **No translation tables yet.** Base text is the default locale (fr). Per `AGENTS.md` §9, add
   `product_translations` / `category_translations (…, locale, name, description)` later —
   additive, no restructuring. No `name_fr`/`name_en` columns were introduced.
3. **Stock of active products is public** (enables "only 3 left" / out-of-stock badges). Restrict to
   `stock_status` only via a view if quantities become sensitive.
4. **Admins may set `payment_status`** manually (e.g. bank transfer). Stripe webhooks remain the
   authoritative source for card payments.

## Next iterations (not implemented)

1. Checkout: server-side order creation function, stock reservations with expiry, Stripe Checkout +
   `stripe_webhook_events` table (event id dedup / idempotency).
2. Translations (`*_translations`), multi-currency price lists, tax rates, shipping zones/methods.
3. Admin audit log (role changes, refunds, order adjustments), inventory movement ledger.
4. Avatars bucket (private, per-user paths), guest checkout linking.
5. Promotions / coupons / gift cards, reviews, marketing consent.
6. Education (courses, modules, lessons, quizzes, attempts, certificates, entitlements), community,
   loyalty, analytics — each as its own migration set referencing `profiles` and `products`.
