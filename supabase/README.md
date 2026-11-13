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
  tests/promotions_live_validation.sql   promotions & campaigns on live data: save RPCs, quote, throttle (always rolls back)
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
  tests/admin_users_validation.sql  back-office team: viewer read-only, manager rank limits, no self change, customer/suspended/visitor refusals, audit (always rolls back)
  tests/admin_customers_validation.sql back-office customers: customer refused, viewer read-only, manager writes and read-only columns, notes by their author, status history, course progress (always rolls back)
  tests/newsletter_signup_validation.sql  visitor newsletter sign-up: the per-address throttle (service role only, 10 / hour) and subscribe → confirm as the roles that call them (always rolls back)
  tests/newsletter_contact_sync_validation.sql  newsletter → Resend contacts queue: what queues a row, the sweep's view, compare-and-set record and backoff, server only, the scheduled job (always rolls back)
  tests/newsletter_resend_opt_out_validation.sql  Resend opt-outs mirrored onto the list: server only, unsubscribe withdraws a member's consent, bounce/complaint precedence (always rolls back)
  tests/newsletter_direct_signup_validation.sql  newsletter sign-up without e-mail: server only, captcha and member paths, bounces kept out, opt_in_method, throttle (always rolls back)
  tests/email_validation.sql        e-mail delivery events (forward-only, newsletter bounce/complaint) and the pending shipping / refund / enrolment queries, service role only (always rolls back)
  config.toml   CLI settings this repo relies on (verify_jwt of the Edge Functions)
  functions/    Edge Functions (Deno): create-checkout-session, stripe-webhook, create-studio-subscription, studio-manage-subscription, studio-billing-setup, refund-order, deliver-gift-cards, send-email, resend-webhook, send-pending-emails, email-showcase, invite-staff-member, newsletter-subscribe, gift-card-balance, sync-newsletter-contacts, purge-storage-objects, _shared/ (pure modules + clients),
                *_test.ts (deno test), .env.example (secret names)
  templates/confirm-signup.html     French "Confirm signup" email in the shared e-mail layout (generated by functions/_shared/email/authTemplates.ts), to paste into the Auth settings
  templates/invite-staff.html       French "Invite user" email (team invitations), same generator, to paste into the Auth settings
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
| 20261001170703 | `academy_learner_access` | Academy phase C: `course_entitlements` (manual grants by `manage_training`, audited; `purchase` rows from phase D), `lesson_progress`, `quiz_attempts`, `course_completions` (sticky, certificate code); `learner_courses()` serves the held courses' content without answer keys or feedback; `complete_course_step()`, `answer_quiz_question()`, `submit_quiz_answers()` port the path rules of `lib/learning/path.ts` and score server-side; storage policy for the media of held courses; holders see their withdrawn course (row, translations, cover); `admin_grant_course()`, `admin_revoke_course_entitlement()`, `admin_course_entitlements()` |
| 20261001200000 | `gift_card_staff_functions` | **Not applied yet (awaits the user's go-ahead).** `extend_gift_card()` / `cancel_gift_card()` return the card id instead of the whole `gift_cards` row — as SECURITY DEFINER functions they handed the full bearer **code** to any `manage_promotions` caller (confirmed on the project before the fix by `gift_cards_validation.sql`); `issue_gift_card()` / `adjust_gift_card()` refuse sub-cent amounts (they were rounded), amounts above 10 000, a malformed recipient e-mail and a past expiry. Same names, arguments and permission |
| 20261001220721 | `admin_customers` | back-office customers: `admin_customer_status_history(user)` (status changes of one account from `audit_logs` — date, old, new, actor name — for any active staff member; `audit_logs` itself stays `manage_settings`-only) and `admin_customer_courses(user \| null)` (course seats not revoked, with the learner's progress rule: validated steps that still exist + checks passed, over steps + checks; completion, score, certificate code). Both `SECURITY DEFINER`, staff only |
| 20261001223230 | `admin_customer_history_scope` | `admin_customer_status_history()` answers for customer accounts only (a team member's history stays out of reach of read-only staff); orders changes by `occurred_at, id` (two changes in one transaction share a timestamp — first fixed in place, now recorded) |
| 20261002064611 | `settings_workspace` | Settings workspace on the database: `store_settings` gains the business identity, legal mentions (legal form, share capital, registration and VAT numbers, publication director, host), contact details, address, opening hours (`private.valid_opening_hours()` CHECK) and the contact page switches + `store_settings_translations` (support message per non-default locale, audited); `admin_save_store_details()`, `admin_save_shipping()` (whole configuration, atomic), `admin_save_tax_rates()` (whole set), `admin_save_languages()` — SECURITY INVOKER, `manage_settings`; `languages`: API may update `is_enabled`/`position` only, `fr`/`en` cannot be switched off (trigger), switches audited; audit trigger identifies rows by `code`/`locale`; standard VAT rates for AT BG CY CZ DK EE FI GR HR HU LT LU LV MT PL RO SE SI SK + MC, IE switched on |
| 20261002100000 | `course_checkout` | **Applied** (on the project's migration list; a paid course order verified by the owner on 2026-11-10). Academy phase D: `order_items.course_id` (exclusive with product/variant, RESTRICT); `create_order()` accepts `{course_id, quantity: 1}` lines (published course, account required, not already held, current price incl. course promotion, VAT `training`, outside shop discounts and shipping thresholds); trigger `orders_stock_transitions_zc_courses` grants a `purchase` entitlement when the order becomes paid and revokes it on a full refund; course lines refused in parcels and ignored by the fulfilment status |
| 20261005092414 | `email_log` | **Applied 2026-10-05.** E-mail sending, decision 79: `email_log` (one row per business event, unique `event_key`, hashed recipient, backend only), `email_log_claim()` / `email_log_finish()` (service role: atomic claim, a failed or abandoned attempt can be claimed again, a sent one never), templates `gift_card_delivery` and `order_refunded` (fr + en) |
| 20261005092859 | `email_attempt_cap_gift_card_wording` | **Applied 2026-10-05.** `email_log_claim()` gains `p_max_attempts` (default 5: a failing event stops being retried, left `failed` for the team); the `gift_card_delivery` e-mail prints `Date d'expiration : {{expires_on}}` ("aucune" / "none" without expiry) |
| 20261005121753 | `email_log_apply_event` | **Applied 2026-10-05.** `email_log_apply_event(provider_id, status)` (service role): moves an `email_log` row forward to delivered / opened / bounced / complained, never back, so a replayed or out-of-order Resend event changes nothing (`applied` says whether it moved; unknown ids answer `matched = false`); a bounce or complaint of a `newsletter*` e-mail also marks the subscriber, found through the new expression index `newsletter_subscriptions_email_hash_idx` on `sha256(lower(email))` (email_log only holds that hash, so no column was added) |
| 20261005122328 | `email_pending_events` | **Applied 2026-10-05.** What the `send-pending-emails` sweep still has to e-mail, decided in SQL (service role only, last 7 days, minus what `email_log` already holds, `private.email_event_open()`): `pending_shipping_emails()` (parcels `shipped`, paid order, one per parcel), `pending_course_enrolment_emails(order?)` (`purchase` entitlements of a paid order, not revoked, course title in the order's language), `pending_refund_emails()` (`succeeded` rows of `refunds`) |
| 20261005131234 | `email_cron_jobs` | **Applied 2026-10-05.** The two pg_cron jobs `deliver-gift-cards` and `send-pending-emails` (every 5 minutes) through `private.call_email_function(name)`, which reads the Vault secret `email_internal_secret` at each run and does nothing while it is missing; change a schedule with `cron.alter_job` in a new migration |
| 20261006172723 | `release_held_gift_card_orders` | **Applied 2026-10-06.** `unpaid_orders_holding_gift_cards(codes)` (service role): unpaid orders holding those gift cards + their pending Stripe session ids. `create-checkout-session` expires the sessions and cancels the orders (cards credited back) before a new order, so retrying after cancelling on Stripe works |
| 20261002064949 | `settings_shipping_positions` | `admin_save_shipping()` numbers zones and rates from 1 like every existing row, so saving an unchanged configuration writes nothing |
| 20261003131220 | `studio_gem_group_thumbnails` | `gem_groups.thumbnail_path` (null or inside the owner's folder, column grants for insert/update): each new Gem Group keeps a captured render of its pieces alone on the smile at `studio-thumbnails/<user id>/groups/<group id>.jpg` (bucket policies unchanged: they check the first folder). Suite `tests/studio_workspace_validation.sql` |
| 20261007072551 | `quiz_unlimited_attempts` | **Applied 2026-10-07.** Knowledge checks have no attempt limit: `private.open_quiz_attempt()` no longer raises `no_attempts_left` (a passed check still refuses new attempts) |
| 20261007141456 | `studio_shop_gems` | **Applied 2026-10-07.** The 3D Studio's gems are the shop's (decision 81): `studio_gem_appearances` — how a shop gem is drawn in the editor (`shape` on the product row, `material` crystal/metal, `color` `#rrggbb`, `effect` none/iridescent; one row per product plus one per colour variant such as yellow / white gold), seeded from the product photos (84 gems, 12 gold variants); public read for active products, `manage_products` writes, audited, a variant row must belong to its product. Scenes and Gem Groups now require format **2** (piece = product, variant, SS, look snapshot); the format-1 test designs, their share links and groups were deleted first (owner's request, pre-launch). Suite `tests/studio_workspace_validation.sql` (T5–T8) |
| 20261007184926 | `promotions_live` | **Applied 2026-10-07.** Promotions and campaigns on live data (decision 83): `admin_save_promotion(jsonb)` / `admin_save_campaign(jsonb)` (SECURITY INVOKER, `manage_promotions`, one transaction each: the row, its scope / segments / code / English translation or products, the lifecycle last), view `promotion_daily_usage`, table `promotion_code_attempts` (no policies: never readable through the API) and `quote_basket(...)` (SECURITY DEFINER, callable by visitors: what a shop basket would get, same engine as `create_order()`). Suite `tests/promotions_live_validation.sql` (PL1–PL8) |
| 20261007185808 | `promotions_draft_code` | **Applied 2026-10-07.** `admin_save_promotion()`: a draft in "code" mode may be saved before its shared code is typed (empty code = no active code); publishing without one is still refused by `validate_promotion()` (PL8) |
| 20261007191644 | `tmp_request_headers_probe` | **Applied 2026-10-07, dropped by the next one.** Probe used to verify which request headers the platform sets itself |
| 20261007191747 | `promotions_quote_actor` | **Applied 2026-10-07.** `quote_basket()`: guests are throttled per `sb-forwarded-for`/`cf-connecting-ip` (the first `x-forwarded-for` entry is caller-writable); a free "gift with purchase" line no longer counts in `goods_discount` / the gift row's amount (it is not in the basket); drops the probe. Suite PL9–PL10 |
| 20261008174607 | `loyalty_with_promotions` | **Applied 2026-10-08.** Decision 85: `promotions.combinable_with_loyalty` (default false, set by `admin_save_promotion`), `private.loyalty_on_top()`, and `compute_order_discounts()` rewritten: with the reward requested it compares promotions alone, the reward alone and "combinable promotions + reward" and applies the best (tie: promotions, so the reward is kept); a typed code no longer conflicts with the reward. Suite PL11 |
| 20261008182346 | `quote_basket_lines` | **Applied 2026-10-08.** `quote_basket()` also answers `lines` (product, variant, discount amount) so the checkout shows the discount on the lines it reaches |
| 20261008182555 | `promotions_public_lifecycle_column` | **Applied 2026-10-08.** `grant select (lifecycle)` on `promotions` and `campaigns` to `anon`: the policies of their child tables (scope, translations, products) read it, and a visitor only ever sees live rows. Needed by the shop window's offers |
| 20261009152941 | `invoices` | **Applied 2026-10-09.** Legal invoices and credit notes (decision 86): `invoice_sequences` (one counter per series `FA-YYYY` / `AV-YYYY`, backend only), `invoices` (insert-only frozen snapshot: number, issue date, sale date, seller identity from `store_settings`, buyer, lines with VAT rate and excl./incl. amounts, shipping, VAT breakdown, payment; UPDATE/DELETE refused by trigger for every role; owner of the order and active staff read). Triggers `orders_zz_issue_invoice` (order becomes paid → `private.issue_order_invoice`) and `refunds_zz_issue_credit_note` (refund becomes succeeded → `private.issue_refund_credit_note`). Suite `tests/invoices_validation.sql` (I1–I9); `shipping_refunds_validation.sql` checks one credit note per confirmed refund |
| 20261009162740 | `quote_basket_used_up` | **Applied 2026-10-09.** Decision 87: `quote_basket(..., p_email)` knows a guest by the e-mail typed at the checkout (ignored when signed in; 5 new addresses per caller per 10 minutes, table `promotion_email_lookups`, hashed, no policies) and answers `used_up` (automatic promotions the customer has already had as often as allowed, on paid orders). Suite PL12 (and PL11d unlocks the codes PL6 locked) |
| 20261010122507 | `members_lounge` | **Applied 2026-10-10.** Members' Lounge (iteration 25, decision 88): `lounge_channels` (the 4 × 5 rooms, ids `<lounge>-<key>`), `lounge_members` (generated handle, lounges, presence + heartbeat), `lounge_conversations` (one per pair), `lounge_messages` (parts jsonb, mentions, reply, reaction totals), `lounge_message_attachments` + private `lounge-media` bucket, `lounge_reactions`, `lounge_room_states` (read state, mutes), `lounge_notifications`; `private.lounge_can_enter()`; RPC `lounge_access/join/heartbeat/directory/overview/mark_read/set_muted/read_notifications/post_message/toggle_reaction`; Realtime publication of `lounge_messages` and `lounge_notifications`. Suite `tests/lounge_validation.sql` (A1–T1) |
| 20261010145631 | `lounge_handle_initial` | **Applied 2026-10-10.** Decision 88 b: the generated handle is `first.l` (was `first.last`, which showed the full last name in every @mention) and the directory's name no longer falls back to `display_name`. No member existed yet, nothing rewritten |
| 20261011171901 | `quote_gift_cards` | **Applied 2026-10-11.** Decision 89: `quote_gift_cards(p_codes, p_amount, p_currency)` (SECURITY DEFINER, callable by visitors) — the cart's preview of what the gift card codes pay, same rules as `create_order()`, total only (never a balance) and the refused codes; refused codes throttled per caller (10 per 10 minutes, table `gift_card_code_attempts`, no policies). Suite `tests/gift_card_quote_validation.sql` (GQ1–GQ8) |
| 20261014141425 | `back_in_stock_alerts` | **Applied 2026-10-14.** Decision 90: `back_in_stock_requests` (product, optional option, lower-cased address, member, language, throttle hash, `notified_at`; RLS on, no grant to anon/authenticated; one waiting request per address and target), `request_back_in_stock_alert(product, variant, email, locale)` (SECURITY DEFINER, visitors and members: target must be out of stock now, account address for a member, 10 new requests / hour per caller, 30 waiting per address), `pending_back_in_stock_emails()` (service role: waiting requests whose target is sellable again, no time window), trigger `email_log_close_back_in_stock` (stamps `notified_at` once the e-mail is sent), template `back_in_stock` (fr + en). Suite `tests/back_in_stock_validation.sql` (B1–B8) |
| 20261014150008 | `admin_back_in_stock_requests` | **Applied 2026-10-14.** Decision 90: `admin_back_in_stock_requests(p_limit)` (SECURITY DEFINER, `manage_products`, 42501 otherwise) — the back office's read of the requests for `/admin/alertes-stock`: product and option names, product status, the target's stock state, address, member, language, dates and the e-mail's `email_log` status and attempts. Read-only. Suite `tests/back_in_stock_validation.sql` (B9) |
| 20261014175219 | `admin_adjust_stock` | **Applied 2026-10-14.** Decision 91: `admin_adjust_stock(p_product_id, p_variant_id, p_delta, p_expected)` (SECURITY DEFINER, `manage_products`, 42501 otherwise) — the product list's quick restock: adds `p_delta` to `quantity_on_hand` of the product's or one variant's stock row in one UPDATE, so a sale paid meanwhile is kept; with `p_expected` (an exact count typed after a stocktake) refuses with 40001 when the shelf moved since. Refuses an untracked row, a product whose stock is per variant, a variant of another product (P0002), a zero change and a result below the reserved units (22023, hint `reserved`). Recorded as an `adjustment` with the actor by the `inventory_items_ledger` trigger. Suite `tests/stock_adjustment_validation.sql` |
| 20261015152449 | `academy_localized_images` | **Applied 2026-10-15.** Decision 92: an English file per image slot — `course_block_translations.media_id` (image block) / `poster_media_id` (video poster), `quiz_question_translations.image_media_id` (FK `training_media`, ON DELETE RESTRICT, indexed); `quiz_question_translations.text` nullable (an English row may carry only the image). `admin_save_course()` patched (kind-checked; an English row exists when it has text or a file), `private.learner_course_json()` returns the English files and lists them in `media`, `private.can_read_learner_media_path()` lets a holder read them. Suite `tests/academy_localized_images_validation.sql` |
| 20261017103101 | `studio_trial_access` | **Applied 2026-10-17.** Decision 93: the 3D Studio 48-hour free trial and the subscription entitlement. `studio_trials` (one row per account, `trial_expires_at = trial_started_at + 48 h` by CHECK, `first_creation_at` set by a trigger on `creations`), `studio_subscriptions` (Stripe mirror, service role only — written since `20261018102741`), `private.has_studio_access()` (active trial, active subscription or active staff) added to the INSERT/UPDATE policies of `creations`, `gem_groups` and the `studio-thumbnails` bucket (read and delete unchanged), `start_studio_trial()` (idempotent, `started` only for the call that created the trial; none for a current or former subscriber or staff), `studio_access_state()` (state + `server_now`). Both tables readable by their owner and `view_statistics` staff; audited. Suite `tests/studio_trial_validation.sql`; `tests/studio_workspace_validation.sql` gives its members a trial |
| 20261018102741 | `studio_subscription_billing` | **Applied 2026-10-18.** Decision 94: selling the 3D Studio subscription. `stripe_customers` (account → Stripe customer, service role only), `studio_plan_prices` (plan × `month`/`year` → Stripe Price, amount VAT included; one active per plan and interval; public read of active rows; rows set per environment by `studio-billing-setup`, never by a migration; audited), `studio_subscriptions` + `billing_interval`, `stripe_price_id`, `canceled_at`, `studio_subscription_invoices` (paid / failed invoice with Stripe's `billing_reason`: new subscription vs renewal; owner and `view_statistics` read). Writers `apply_studio_subscription()` (account from the stored customer, else the Checkout's `user_id` metadata; plan from the price; never moves a subscription to another account) and `record_studio_invoice()` (a paid invoice stays paid), service role only. `studio_access_json()` / `start_studio_trial()`: a first payment that never completed (`incomplete`, `incomplete_expired`) does not forfeit the trial. Suite `tests/studio_billing_validation.sql` |
| 20261018110209 | `studio_billing_updated_at` | **Applied 2026-10-18.** Fix: `studio_subscriptions` (since `20261017103101`), `studio_plan_prices` and `studio_subscription_invoices` used the designs' `studio_touch_updated_at()` trigger, which reads `name` and failed every UPDATE (`record "new" has no field "name"`, found by the first test subscription); they take `private.set_updated_at()` |
| 20261018155521 | `studio_withdrawal_consent` | **Applied 2026-10-18.** Decision 94 (a): the member's request for immediate access to the Studio (L221-25). `consent_records` purpose `studio_immediate_access` (source `checkout`, `policy_version` = wording version), recorded by `create-studio-subscription` when Pay is pressed in the payment step, before the payment is confirmed (since 2026-10-18; before the Stripe session until then); `pending_studio_subscription_emails()` (service role: new subscriptions whose first invoice is paid, with the request accepted before them) and template `studio_subscription_confirmation` (FR + EN), sent once by `send-pending-emails` (`studio_subscription:<id>`). Suite `tests/studio_withdrawal_consent_validation.sql` |
| 20261018163051 | `studio_withdrawals` | **Applied 2026-10-18.** Decision 95: `studio_withdrawals` (one per subscription, amounts, Stripe steps, refund status; owner and `view_statistics` read, service role writes; audited), `studio_withdrawal_quote()` (member: eligibility, deadline, refund if withdrawn now), `request_studio_withdrawal()`, `record_studio_withdrawal_step()`, `settle_studio_withdrawal_refund()`, `pending_studio_withdrawal_emails()` (service role), template `studio_withdrawal_confirmation`, `studio_subscription_confirmation` now points to the account page. Suite `tests/studio_withdrawals_validation.sql` |
| 20261018163229 | `studio_withdrawals_updated_at` | **Applied 2026-10-18.** Fix: `studio_withdrawals` took the designs' `updated_at` trigger (same mistake as `20261018110209`); generic `private.set_updated_at()` instead |
| 20261018224456 | `studio_collections` | **Applied 2026-10-19.** `studio_collections` (name unique per member ignoring case, optional token colour) and `studio_collection_creations` (many-to-many memberships, insert/delete only); owner-only RLS, writes need `has_studio_access()`, reads and deletes do not; cross-owner links refused (composite FK + RLS on the creation's owner). Decision 96 |
| 20261018224648 | `studio_collections_fk_index` | **Applied 2026-10-19.** Index covering the memberships' composite foreign key (performance advisor) |
| 20261018224657 | `studio_templates` | **Applied 2026-10-19.** Decision 97: the Global Toothgems template library. `creations.template_published_at` (not in the column grants: written only by `studio_set_template(id, published)` — `manage_content` staff publish their own creation, keeping the first date, and unpublish any template; audited, the flag alone), `studio_templates()` (members with Studio access: published rows newest first, no owner, favourite or opening dates, Gem Group references dropped; 42501 otherwise), `studio_use_template(id)` (copies a published template into the caller's creations: owner = caller, unpublished, no render — the browser copies it), storage policy `studio-thumbnails: Studio members read template renders` (`private.is_studio_template_thumbnail()`). The `creations` SELECT policy is unchanged. Suite `tests/studio_templates_validation.sql` |
| 20261019062619 | `studio_preferences` | **Applied 2026-10-19.** `studio_preferences`: one row per member (created on first change, none = defaults), `library_view` grid / explorer; owner-only RLS, not gated by Studio access. Decision 98 |
| 20261019072230 | `studio_glowbook` | **Applied 2026-10-19.** Decision 99: the Glowbook, an artist's public showcase. `studio_showcases` (one per member: handle, display name, bio, Instagram, moderation status) and `studio_showcase_items` (one row per creation, order, moderation status); owners and `moderate_reviews` staff read (RLS), owners delete; every other write through `studio_save_showcase()`, `studio_showcase_add()`, `studio_showcase_reorder()` (Studio access) and `studio_moderate_showcase()` / `studio_moderate_showcase_item()` (`moderate_reviews`, audited); `studio_showcase_queue()` for moderators; `studio_public_showcase(handle)` for anyone (approved page of an author with Studio access, approved items only; no owner id field, though render paths start with it — decision 99 (i)); `private.studio_user_has_access(user)`; storage policies on `studio-thumbnails` (anyone reads public Glowbook renders, moderators read the renders sent). Suite `tests/studio_glowbook_validation.sql` (G1–G8) |
| 20261019134715 | `studio_glowbook_look` | **Applied 2026-10-19.** Decision 100: the Glowbook's own look. `studio_showcases` gains accent / background / layout (fixed lists), location, featured_item_id (live), the approved avatar_path / banner_path / booking_url / website_url / tiktok, and `pending_changes` (+ `changes_submitted_at`, `changes_review_note`) for proposed pictures and links; `studio_save_showcase_look(jsonb)` (Studio access + `private.glowbook_customization_allowed()`, the plan switch: Studio access today), `studio_moderate_showcase_changes()` (`moderate_reviews`, audited); approving a page applies what waits with it; the queue gains `changes` rows and a `details` column (dropped and recreated); `studio_public_showcase()` returns `location` and `look` (null when customisation is not allowed). Private bucket `glowbook-media` (5 MB, JPEG/PNG/WebP): owners upload (Studio access) and read theirs, moderators read all, anyone reads approved pictures of a public Glowbook, owners delete only files no page uses or proposes (no update). Suite G9 |
| 20261019135003 | `studio_glowbook_look_links` | **Applied 2026-10-19.** Postgres caps a regex repetition at 255: the link checks of `20261019134715` rewritten as pattern + length (`private.glowbook_link_valid()`), `studio_save_showcase_look()` replaced accordingly |
| 20261019142032 | `studio_share_branding` | **Applied 2026-10-19.** Decision 101: social exports branded by plan. `private.studio_user_tier(user)` (essential / artist / atelier, highest wins; trial = essential, active staff = atelier, null without access) and `private.studio_share_logo_allowed()`; `studio_share_logos` (one logo per member, owner reads, written only by `studio_set_share_logo(path)`: artist / atelier tier and a file of the caller's folder, `''` removes, always allowed, returns the previous path); `studio_share_branding()` → `{tier, logo_path, has_logo}` (logo_path only while the tier allows it). Private bucket `studio-share-logos` (2 MB, PNG / JPEG / WebP, no SVG): upload and read in one's own folder need the artist / atelier tier, delete never does. Suite `studio_share_branding_validation.sql` (B1–B6) |
| 20261019142220 | `studio_share_logos_updated_at` | **Applied 2026-10-19.** The generic `private.set_updated_at()` on `studio_share_logos` (`private.studio_touch_updated_at()` reads design columns it does not have) |
| 20261021172034 | `studio_share_link_previews` | **Applied 2026-10-21.** Decision 101 addendum: `studio_shared_creation_preview(token)` → `{name, description, thumbnail_path}` of an active share link (anon), and the storage policy "anyone reads renders of shared creations" (`private.is_shared_creation_thumbnail()`): the share viewer page signs the render for its Open Graph / Twitter image. Revoking the link closes both. Suite B7 |
| 20261021190830 | `studio_glowbook_spotlight_sweep` | **Applied 2026-10-21.** Decision 105: the spotlight video is a 5-second front sweep (45° left → 45° right → back); `studio_set_spotlight_video()` takes 5 s only, `private.glowbook_spotlight_video_current()` counts only 5-second videos (the full turns of decision 103 stop being shown and are re-recorded). Suite G13 |
| 20261022090133 | `low_stock_digest` | **Applied 2026-10-22.** Decision 106: `pending_stock_digest()` (SECURITY DEFINER, service role only) — the rows of the daily stock digest for the support inbox: active physical products (and their active options) whose sellable stock (on hand − reserved) is at or under their own `low_stock_threshold` or zero, out of stock first; empty before 08:00 Paris time and once today's e-mail (`email_log` key `stock_digest:<Paris date>`) is sent. Template `stock_digest` (fr + en). Suite `tests/stock_digest_validation.sql` (D1–D4) |
| 20261022111758 | `studio_glowbook_place` | **Applied 2026-10-22.** Decision 108 (the migration's comments say "decision 107": that number went to the gem free sizes, written in parallel): where the artist works, on their Glowbook. `studio_showcases.place_mode` (`exact` = a salon whose address is public / `area` = only an area), `place_label` (2–120), `place_lat` / `place_lng` (numeric, WGS 84); CHECKs: all four or none, an area rounded to 2 decimals. `studio_save_showcase_look()` takes `place` (object or null; live, no moderation; an area rounded to ~1 km before it is stored, a salon to 5 decimals); `studio_public_showcase()` returns it as `look.place` (plan switch). Suite G14 (+ G12: no look without the plan) |
| 20261022112844 | `gem_free_sizes` | **Applied 2026-10-22.** Decision 107: `admin_save_product()` `variants[]` items accept `mm` (1–2 dimensions, 0.5–30 mm to a tenth, stored ascending) beside `pack` / `ss`; names "Pack de 10 · 2,5 × 5 mm" / "Pack of 10 · 2.5 × 5 mm", SKU suffix `-P10-2P5X5MM`; one sizing way (SS or mm) per product; matched by pack + size. Suite `gem_free_sizes_validation.sql` |
| 20261021180329 | `studio_glowbook_spotlight_video_anon` | **Applied 2026-10-21.** Revokes anon's default EXECUTE on `studio_set_spotlight_video()` and `studio_spotlight_video_state()` (decision 103; both already refused a visitor) |
| 20261021174016 | `studio_glowbook_spotlight_video` | **Applied 2026-10-21.** Decision 103: the Glowbook's spotlight as a turning video. `studio_showcases.spotlight_video_*` (path in the owner's folder, item, scene md5, type mp4/webm, 4/6/8 s, recorded at; all-or-nothing CHECK), private bucket `glowbook-videos` (8 MB) with its four policies, `private.glowbook_spotlight_video_current(user)`, `private.is_public_glowbook_video(name)`, `private.glowbook_video_in_use(name)`, `studio_set_spotlight_video(item, path, type, seconds, creation updated_at)` (owner, Studio access + plan switch, current spotlight only, own existing file, creation unchanged — else 40001) and `studio_spotlight_video_state()`; `studio_public_showcase()` gains `look.spotlight_video` while current. Suite `tests/studio_glowbook_validation.sql` G13 (and G12) |
| 20261021173947 | `training_media_folders` | **Applied 2026-10-21.** Decision 104: folders and thumbnails of the training media library. `training_media_folders` (name 1–80 trimmed, unique case-insensitively, `position`; staff read, `manage_training` writes; audited on delete) and `training_media.folder_id` (`on delete set null`: deleting a folder unfiles its files) + `thumb_path` (CHECK: under the file's own `media/<id>/`, never the original); indexes on `folder_id` and `created_at`. Thumbnails sit under the bucket's existing upload policy; learners never read them. Suite `tests/training_media_folders_validation.sql` |
| 20261021180220 | `training_media_thumb_path_comment` | **Applied 2026-10-21.** Comment only: `training_media.thumb_path` names the stored path `media/<id>/_thumb.webp` (the first comment said `thumb.webp`) |
| 20261019142050 | `studio_glowbook_sections_certification` | **Applied 2026-10-19.** Decision 102 (the file says 101: renumbered by `20261019143019`). Glowbook sections: `studio_showcase_sections` (owner, name ≤ 40 unique per Glowbook case-insensitive, position; RLS: owners and `moderate_reviews` read, owners delete), `studio_showcase_items.section_id` (composite FK `(section_id, user_id)` → the author's own section, `on delete set null (section_id)`), `studio_save_showcase_section(id, name)` (create / rename, ≤ 12), `studio_reorder_showcase_sections(ids)`, `studio_set_showcase_item_section(item, section)` — Studio access + `private.glowbook_customization_allowed` + ownership (`private.glowbook_sections_writer()`). Certified badge: `studio_showcases.show_certification` (default true), `private.glowbook_certification(user)` (titles `[{fr, en}]` of the courses completed with a certificate), `studio_my_certification()`, `studio_set_showcase_certification(bool)` (owner, no Studio access needed). `studio_public_showcase()` gains `sections` (those holding an approved creation, plan switch), `section_id` per item and `certification` (titles only); the queue's page rows carry the section names. Suite `tests/studio_glowbook_validation.sql` G10–G12 |
| 20261019143019 | `studio_glowbook_sections_decision_number` | **Applied 2026-10-19.** Comments only: the objects of `20261019142050` say decision 102 (101 went to the social exports the same afternoon) |
| 20261019112411 | `studio_glowbook_creation` | **Applied 2026-10-19.** `studio_public_showcase_creation(handle, item)` (anon): one approved creation of a public Glowbook with its scene (Gem Group ids blanked), for the read-only 3D viewer; null otherwise. Suite G4/G7 |
| 20261019072443 | `studio_glowbook_updated_at` | **Applied 2026-10-19.** The Glowbook tables' `updated_at` triggers use `private.set_updated_at()` (the Studio design trigger reads columns they do not have) |
| 20261008175722 | `contact_attachments_and_support_email` | **Applied 2026-10-08.** Contact form: `contact_requests.attachment_path` → `attachment_paths text[]` (≤ 5, `private.valid_contact_attachment_paths()`), bucket `contact-attachments` 20 MB per object, `submit_contact_request(…, p_attachment_paths text[])` (old signature dropped; ownership per path, no duplicates, ≤ 20 MB in all), guard trigger rebuilt, `contact_ip_allowed(ip_hash)` (service role), template `contact_request_received` (fr + en) for the support inbox. Suite: `iteration7_validation.sql` C3/C4 |
| 20261008175809 | `contact_attachment_paths_check_grant` | **Applied 2026-10-08.** `execute` on the CHECK helper for `authenticated`/`service_role` (staff triage re-evaluates the CHECK) |
| 20261007181011 | `gift_card_design_everywhere` | **Applied 2026-10-07.** The design/names/message chosen at checkout are shown back (WYSIWYG): policy `gift_cards: purchaser reads own` (a buyer reads the cards of their purchases through the existing column grant — never the code) so the member's order pages draw the card in its design; the `gift_card_delivery` template bodies (fr + en) lose their `{{message}}` paragraph because the e-mail now draws the card itself (`giftCardVisual()`, message included). Test: a buyer sees only their own cards (to add to `gift_cards_validation.sql`) |
| 20261007184209 | `shipping_refunds` | **Applied 2026-10-07** (decision 82). Back-office shipping and card refunds: `create_shipment()` (a parcel and its lines in one transaction, `manage_orders`, carrier + tracking to ship) and `set_shipment_status()` (forward-only; same status again only corrects the details); refunded units no longer count as "to ship" (`sync_order_fulfillment`, `guard_shipment_item`, via `private.refunded_units()`) and a confirmed refund recomputes the order's fulfilment (`apply_refund_success`); `pending_refund_emails()` lists card refunds only (gift-card credits are not e-mailed); trigger `refunds_guard_zz_gift_cards` refuses a refund while a gift card bought in the order is active; `record_external_refund()` (backend only) records a refund made in the Stripe dashboard. Suite: `supabase/tests/shipping_refunds_validation.sql` |
| 20261025090755 | `product_specs_faq` | **Applied 2026-10-25** (decision 110). Product characteristics `products.spec_material/center/back/packaging/wear` + the same columns on `product_translations` (1–120 characters, null = not shown; `spec_material` backfilled from `metadata.material`, which stays unread), `admin_save_product()` optional `specs`; FAQ groups `faq_groups`, `faq_items`, `faq_item_translations`, `product_faq_groups`, `category_faq_groups` (RLS: published for visitors, `manage_products` writes, audited), `product_faq(product, locale)`, `admin_save_faq_group()`, seed group for `gems`. Suite: `supabase/tests/product_specs_faq_validation.sql` |
| 20261026170231 | `studio_plan_entitlements` | **Applied 2026-10-26** (decision 113). What each Studio plan includes: `private.studio_plan_limit(tier, kind)` (essential 15 creations / 3 Gem Groups, artist 150 / 30, atelier unlimited) enforced by BEFORE INSERT triggers on `creations` and `gem_groups` (SQLSTATE `GTL01`, per-owner advisory lock; editing and deleting never limited); `private.glowbook_allowed()` = Atelier tier, now required by `studio_save_showcase` / `studio_showcase_add` / `studio_showcase_reorder`, by the look/sections/video switch (`glowbook_customization_allowed`) and by every public read (page, 3D creation, renders, pictures, video); `studio_access_state()` adds `tier`, `glowbook`, `limits`, `usage`. Suite `studio_plan_entitlements_validation.sql` (Glowbook suite moved to Atelier subscriptions) |
| 20261026185024 | `vat_franchise` | **Applied 2026-10-26** (decision 114). VAT franchise ("franchise en base de TVA", art. 293 B du CGI): `store_settings.vat_franchise` (default true, public); `vat_rate_bp()` returns 0 while it is on, so `create_order()` (products, courses, shipping) and the invoices charge no VAT; `private.invoice_seller()` freezes `vat_franchise` in every invoice snapshot; a credit note keeps the regime of the invoice it credits (`issue_refund_credit_note`); `admin_save_store_details()` takes an optional boolean `vat_franchise` (absent = unchanged). Suite `vat_franchise_validation.sql` (F1–F4); the suites that check the standard VAT regime switch the franchise off in their transaction |
| 20261026190347 | `order_vat_regime` | **Applied 2026-10-26** (decision 114). The regime is the order's, not the payment day's: `orders.vat_franchise` (BEFORE INSERT trigger `orders_snapshot_vat_regime` copies `store_settings`, an UPDATE keeps it; existing orders false), `private.configured_vat_rate_bp()` (the configured rate whatever the switch; `vat_rate_bp()` now wraps it), `issue_order_invoice()` takes the seller flag and the shipping rate from the order. Suite `vat_franchise_validation.sql` F5 |
| 20261026211240 | `studio_invoices` | **Applied 2026-10-26** (decision 115). 3D Studio legal invoices and credit notes issued by the database: `studio_subscription_invoices.total` + `.lines` (what the webhook read of the Stripe invoice); `invoices.order_id` nullable, `studio_invoice_id` (→ `studio_subscription_invoices`) and `studio_withdrawal_id` (→ `studio_withdrawals`, unique), `invoices_kind_links` rewritten (exactly one of order / Studio invoice; a Studio credit note credits a withdrawal); RLS: owners of the order or of the Studio invoice, active staff; triggers `studio_subscription_invoices_zz_issue_invoice` (FA- when recorded paid, `private.issue_studio_invoice`) and `studio_withdrawals_zz_issue_credit_note` (AV- when the refund is confirmed, `private.issue_studio_withdrawal_credit_note`); `record_studio_invoice()` gains `p_total`, `p_lines` (old 7-argument signature dropped); `pending_studio_subscription_emails()` returns `stripe_invoice_id`; new `pending_studio_invoice_emails()`, `pending_studio_credit_note_emails()` and templates `studio_invoice`, `studio_credit_note`. Suite `studio_invoices_validation.sql` (S1–S8); `studio_withdrawals_validation.sql` X4 no longer deletes an invoiced row |
| 20261026213754 | `studio_credit_note_email` | **Applied 2026-10-26** (decision 115). `pending_studio_credit_note_emails()` lists every issued withdrawal credit note once the acknowledgement went out: the acknowledgement never carries the credit note (it could race the refund confirmation), `studio_credit_note` always sends it |
| 20261028143732 | `product_content_seo` | **Applied 2026-10-28** (decision 116). Data only: names, descriptions (FR + EN) and search tags (`meta_title` / `meta_description`, FR on `products`, EN on `product_translations`) of the 102 active products, written from the shape / colour of each Swarovski® gem and by hand for the rest; the French slug of CLEO moves to `global-lipgloss-cleo`. What is still unknown is written `[A COMPLÉTER]` in the descriptions. Suite `product_content_validation.sql` (C1–C4) |
| 20261029181304 | `product_bundles` | **Applied 2026-10-29** (decision 117; suite K1–K12 passed on the project in a rolled-back transaction and on a local stack with every migration; types regenerated from the project, unchanged). Advisors: `admin_save_product_bundle` joins the SECURITY DEFINER staff functions (permission checked inside), the audit columns' FKs are unindexed like every other table's. Kits and packs whose stock is their components': `product_bundle_items` (kit → component product or option, units per kit; RLS: public reads active kits, staff all; written only by `admin_save_product_bundle(product, components)`, `manage_products`), `order_item_components` (composition snapshot of a kit line, written by `create_order()`; owner and staff read); a kit's `inventory_items` row is derived (buildable kits, reserved 0) and refreshed by the deferred constraint trigger `inventory_items_refresh_bundles` (`private.refresh_bundle_stock`, advisory lock, fresh snapshot), guarded by `inventory_items_bundle_guard` (22023 hint `bundle`) and left out of the ledger; `create_order()` reserves a kit line's components; `apply_order_stock_transitions()` and `apply_refund_success()` read `private.order_stock_lines()` / `private.refund_stock_lines()` (snapshot, else current composition for a line older than the kit); `product_variants_bundle_guard` (no option on a kit, none on a product held whole by one); `pending_stock_digest()` leaves kits out. Suite `product_bundles_validation.sql` (K1–K12); live test in `e2e-live/live.spec.ts` |
| 20261029181630 | `lounge_direct_messages_closed` | **Applied 2026-10-29** (decision 118, owner's request). Members' Lounge private messages closed for everyone: one-row switch `private.lounge_settings.direct_messages_enabled` (false), read by `private.lounge_direct_messages_enabled()`; insert triggers on `lounge_conversations`, `lounge_messages` (conversation rows) and `lounge_reactions` (on a private message) raise `42501 lounge: private messages closed`; restrictive select policies hide conversations and their messages (attachments, images and Realtime follow). Existing rows kept, logic untouched. Suite `lounge_validation.sql` X1 (opens the switch first so C1 still covers the dormant logic) |
| 20261102173016 | `lounge_guard_direct_messages_fix` | **Applied 2026-11-02** (fix of decision 118). `private.lounge_guard_direct_messages()` tested its three tables in one PL/pgSQL expression; PL/pgSQL resolves every `new.<column>` of an expression first, so on a table without the column it failed with 42703: from 2026-10-29 to 2026-11-02 **no channel message and no reaction could be written on the project**, and a new conversation failed with 42703 instead of 42501. Same rules, one branch per table. Caught by CI (`lounge_validation.sql` X1), verified on the project in a rolled-back block (channel message and reaction accepted, conversation and private message 42501) |
| 20261103184717 | `studio_xilion_rose_appearances` | **Applied 2026-11-03** (decision 122). Data only: one `studio_gem_appearances` row (round, crystal, tint measured on the product photo, iridescent for AB / Shimmer / Vitrail Light) for each of the 17 round `swarovski-2058-*` products added that day; matched by slug, skipped when missing or already set (a no-op in CI) |
| 20261106181613 | `newsletter_ip_throttle` | **Applied 2026-11-06.** `newsletter_ip_allowed(ip_hash)` (service role only): 10 attempts per hour per caller address (hash) for the visitor newsletter form, called by the Edge Function `newsletter-subscribe` before `newsletter_subscribe()`, whose own limit (3 / hour per e-mail) stays on top. Same shape as `contact_ip_allowed()`. Suite `newsletter_signup_validation.sql` (passed on the project, rolled back) |
| 20261106182531 | `newsletter_contact_sync` | **Applied 2026-11-06.** Mirror of the list into Resend contacts (campaigns with Resend Broadcasts). `newsletter_subscriptions.contact_sync_due_at / _synced_at / _attempts / _error`: a row is queued by triggers when what Resend should hold changes (status, locale, e-mail, account; a member's CRM tag added/removed; their first name), only if subscribed or sent before; `pending_newsletter_contacts(limit)` and `record_newsletter_contact_sync(id, due, error)` (service role; compare-and-set on the due time, backoff 10 min × 2ⁿ); the rows subscribed at that date queued once; `private.call_email_function()` also knows `sync-newsletter-contacts`, pg_cron job of that name every 5 minutes. Suite `newsletter_contact_sync_validation.sql` |
| 20261106190001 | `newsletter_resend_opt_out` | **Applied 2026-11-06.** `newsletter_resend_opt_out(email, reason)` (service role): a choice Resend learns comes back to the list — `unsubscribed` (a member's `marketing_email` consent withdrawn, source `newsletter`, as the one-click link does), `bounced` / `complained` (status only, consents untouched, a complaint wins over anything); never re-subscribes; answers `unsubscribed` / `bounced` / `complained` / `unchanged` / `unknown`. Called by `resend-webhook` (`contact.updated` unsubscribed, a broadcast's permanent bounce or complaint) and by `sync-newsletter-contacts` (a contact found unsubscribed in Resend). Suite `newsletter_resend_opt_out_validation.sql` (passed on the project, rolled back) |
| 20261108101636 | `newsletter_direct_signup` | **Applied 2026-11-08** (owner's choice: no confirmation e-mail when another proof exists). `newsletter_subscribe_direct(email, locale, source, policy_version, method)` (service role): subscribes at once for `member_session` (a signed-in member's own address) or `captcha` (a visitor who passed Turnstile); same validation and per-e-mail throttle as `newsletter_subscribe()`, never re-activates a bounce or complaint, a member's address records their `marketing_email` consent (source `newsletter`). New `newsletter_subscriptions.opt_in_method` (`double_opt_in` / `member_session` / `captcha` / `account`, proof of consent), set by the function or by the trigger `private.newsletter_mark_opt_in_method()` (link used → double_opt_in, member's own consent → account); existing confirmed rows backfilled. Suite `newsletter_direct_signup_validation.sql` (passed on the project, rolled back) |
| 20261108170000 | `product_inclusions` | **Applied 2026-11-08** (decision 139; run from the SQL editor by the owner, history row added by the agent; suite P1–P11 passed on the project in a rolled-back transaction). `product_inclusions` (what one unit of a product also opens: a course, or N months of a Studio plan; `admin_save_product_inclusions()`, manage_products), `order_item_inclusions` (copy per order line), `studio_access_grants` (Studio access bought with a product). Triggers on `order_items` (account required — message mapped to `account_required` —, one unit per line, included courses published; snapshot) and `orders_stock_transitions_zd_inclusions` (grants on payment, revoked by a full refund). `private.studio_grant_plan()`; `has_studio_access`, `studio_user_has_access`, `studio_user_tier`, `studio_access_json` (states `granted` / `grant_ended`, `grant_*` fields) and `start_studio_trial` (no trial once a grant exists) re-created. Suite `tests/product_inclusions_validation.sql`. |
| 20261108171000 | `pro_master_pack` | **Applied 2026-11-08** (decision 139; data only, run from the SQL editor by the owner, history row added). GLOBAL™ PRO MASTER PACK as a **draft**: (kit + course) − 10 % = 837.00 EUR, a kit of one `global-pro-studio-kit`, the course `titre-de-la-formation` and Studio Artist 3 months, FR/EN descriptions, the kit's picture. Plain statements found by slug (nothing on a fresh database), idempotent. |
| 20261108205151 | `retention_purge_jobs` | **Applied 2026-11-08** (decision 127). `private.purge_expired_personal_data(p_now)` (table owner only, pg_cron `purge-expired-personal-data` daily 02:15 UTC) deletes what the privacy policy's retention periods have run out on — tickets 3 years after their last exchange, consent proofs 5 years after they were replaced (the one in force is kept), newsletter sign-ups never confirmed, back-in-stock alerts, throttle leftovers — and queues the Storage files of purged tickets and orphan contact uploads in `private.storage_purge_queue`; the Edge Function `purge-storage-objects` (pg_cron 02:45 UTC, shared secret) removes them through the Storage API (`pending_storage_purges` / `record_storage_purges`, service role). `private.audit_changes()` records a purge's deletions as their reason only (it now carries decision 125's erasure branch too); one summary audit row per run. Never touches orders, invoices or Studio billing. Suite `retention_purge_validation.sql` (passed on the project, rolled back) |
| 20261108211113 | `retention_purge_course_waiver` | **Applied 2026-11-08** (decision 127). `private.purge_expired_personal_data()` re-created: `course_immediate_access` (the course withdrawal waiver of `20261108210525`, decision 128) is a per-purchase proof like `studio_immediate_access`, deleted 5 years after it was given. Suite `retention_purge_validation.sql` extended |
| 20261109190153 | `omnibus_price_reference` | **Applied 2026-11-09** (decision 129, Omnibus). `price_history` (list price of every product, variant — its effective price — and course, dated segments) and `price_cut_history` (periods of a unit price cut for everyone: automatic unconditional percentage promotions on chosen products, course promotions), written only by triggers on `products`, `product_variants`, `courses`, `promotions`, `promotion_products`, `course_promotions`; RLS, staff read, no API write. Seeded with the current prices, dated the migration. `private.price_reference()` computes the reference price (lowest price, cuts included, in the 30 days before the running series of cuts, in one currency); read through `storefront_price_references()` (visitors) and `admin_price_references(product)` (`manage_products`). `compare_at_price` retired: the one project value (kit-application-premium 279 over 249) and the seed's two cleared, a CHECK refuses any value. Suite `omnibus_price_reference_validation.sql` (passes in CI; not run on the project, see decision 129); `iteration6_validation.sql`, `iteration10_validation.sql` and `seed.sql` updated. |
| 20261109194750 | `terms_of_sale_version` | **Applied 2026-11-09** (decision 130, terms of sale on a durable medium). `orders.terms_version` (ISO day the terms in force took effect, written once by `create-checkout-session` right after `create_order()`, then frozen by `orders_guard_terms_version`; written only by the trusted backend) and `consent_records.terms_version` (the version in force when a member pays a Studio subscription, on the `studio_immediate_access` row `create-studio-subscription` records; a member's own consent insert cannot claim one). Suite `terms_of_sale_version_validation.sql` passed on the project. Orders placed before keep null |
| 20261109213000 | `order_withdrawals` | **Applied 2026-11-11** (decision 131, run by the owner with the CLI, recorded under its own version; every function checked identical to this file). Edge Functions `order-withdrawal` and `refund-order` deployed (owner's CLI deploy of 2026-11-10, then redeployed from the pinned commit `cb9e91e` on 2026-11-11). Online withdrawal function for shop orders (L221-21). `products.withdrawal_hygiene_seal` (set for the gems and lip-gloss categories); `order_withdrawals` (+ `_items`, status `declared → return_received → refunded | refused`, audit trigger, RLS: the owner and staff read, no API write), `order_withdrawal_links` (guest token stored as SHA-256, 48 h, service role only), `refunds.withdrawal_id` (backend only, guard trigger). `order_withdrawal_options()` (owner/staff), `order_withdrawal_options_by_token()`, `request_order_withdrawal_link()` (3 / hour / order+e-mail), `order_withdrawal_ip_allowed()` (10 / hour), `declare_order_withdrawal()` (service role: period, lines, quantities, sealed products, consumer status), `admin_withdrawal_return_received()`, `admin_refuse_withdrawal()`, `request_withdrawal_refund()` (manage_orders → `request_refund()` with the declared lines), trigger settling the withdrawal on the confirmed refund, `pending_order_withdrawal_emails()` + templates `order_withdrawal_confirmation` / `order_withdrawal_link` (fr/en). Re-creates `my_personal_data()` (each order lists its withdrawals) and `private.purge_expired_personal_data()` (guest links 30 days after expiry). Suite `order_withdrawals_validation.sql` (W1–W16). |
| 20261110124815 | `lounge_moderation` | **Applied 2026-11-11** (decision 132, run by the owner with the CLI after `20261109213000`; the 28 functions checked identical to this file). `send-pending-emails`, `purge-storage-objects`, `submit-contact-request` deployed from the pinned commit `cb9e91e` on 2026-11-11; the sweep answered 200 and sent the first statement of reasons and report outcome (both delivered). Members' Lounge moderation (DSA art. 16, 17, 20; LCEN art. 6). Permission `moderate_community` (manager, admin). `lounge_members.muted_until` / `banned_at` (audited), `lounge_messages.moderation_status` / `hidden_at` / `hidden_decision_id` (audited); `lounge_reports`, `lounge_moderation_decisions` (+ `_snapshots`, the content copy, not audited), `lounge_appeals`, `lounge_blocks`, `lounge_moderation_events` (Realtime, no content, kept a day). Restrictive read policies (hidden → author only; blocked authors; notifications follow their message), write triggers and the `lounge-media` upload policy check mutes and exclusions; `private.lounge_can_enter()` refuses an excluded member. Member RPCs `lounge_report_message`, `lounge_set_blocked`, `lounge_my_moderation`, `lounge_submit_appeal`; moderator RPCs `lounge_moderation_queue`, `_context`, `_history`, `_stats`, `lounge_moderate_message`, `lounge_moderate_member`, `lounge_appeals_queue`, `lounge_answer_appeal`; `pending_lounge_moderation_emails()` + templates `lounge_moderation_decision` / `lounge_report_outcome` / `lounge_appeal_outcome` (fr/en). Re-creates `lounge_overview()` and `lounge_directory()` (hidden and blocked messages not counted) and `my_personal_data()` (from `20261109213000`, plus reports, decisions, complaints, hidden members). Contact category `illegal_content` (high priority by trigger). `private.storage_purge_queue` accepts `lounge-media`. Nightly `private.purge_lounge_moderation_data()` (pg_cron `purge-lounge-moderation`, 02:25 UTC). Suite `lounge_moderation_validation.sql`; `iteration6_validation` counts the new permission. |
| 20261111093306 | `studio_seller_publisher` | **Applied 2026-11-11** (decision 135; the migration's comments said decision 131/133 while numbers were being taken by parallel sessions — the first commit message too). `store_settings.publisher_vat_number`, `publisher_vat_franchise` (default true, public); `invoice_sequences` and `take_invoice_number()` accept the series `FS` / `AS`; `invoices_kind_links` rewritten (orders FA/AV only; a Studio invoice FS — or the legacy FA of test mode —, a Studio credit note AS or AV); `private.studio_invoice_seller()` (the publisher as seller snapshot, `studio_seller: true`); `private.issue_studio_invoice()` issues FS with the publisher's identity and VAT regime; `private.issue_studio_withdrawal_credit_note()` follows the credited invoice (its frozen seller, AS for FS, AV for a legacy FA); `admin_save_store_details()` takes `publisher_vat_number` and `publisher_vat_franchise`. Suite `studio_invoices_validation.sql` (S1–S9, S9 new) passed on the project. |
| 20261111094500 | `staff_mfa_required` | **Not applied yet: awaits the go-ahead once the second-factor screen is deployed where staff work** (decision 134). `private.is_staff()` and `private.has_permission()` also require `auth.jwt() ->> 'aal' = 'aal2'` (Supabase Auth MFA); a missing claim is refused. Suite `staff_mfa_validation.sql` (5/5 on the project inside a rolled-back transaction, 2026-11-11); every other suite's claims now carry `aal2` |
| 20261029190000 | `product_variant_options` | **Not applied yet — validated in a rolled-back transaction pending** (decision 119). Options a product's variants combine (colour × plug…): `product_options`, `product_option_values` (+ colour dot), their `*_translations`, `product_variant_option_values` (one value per variant and option, composite key to the option), `product_media.option_value_id` (a photo shows a value, never with `variant_id`); RLS: visitors read active products' rows and published translations, `manage_products` writes; `admin_save_product()` optional `variant_options` + `custom_variants[].option_values` (names and dot derived from the values) + `media[].option_value_id`. Suite: `supabase/tests/product_variant_options_validation.sql` |
| 20261026190000 | `studio_templates_collections_artist` | **Not applied — awaits the owner's go-ahead** (decision 113 (b)). `private.studio_artist_plan()` (Artist tier or above); `studio_templates()`, `studio_use_template()` and the template-render policy require it; collection read / create / rename / file policies replaced by "owners on the Artist plan" ones (take out and delete stay owner-only, on rows the member can no longer see below the plan). Suites `studio_templates_validation.sql` T10, `studio_collections_validation.sql` C8 (both moved to Artist subscriptions) |
| 20261007072552 | `quiz_unlimited_attempts_cleanup` | **Partly applied 2026-10-07.** `admin_save_course()` and `private.learner_course_json()` rewritten without `allow_retry` / `max_attempts` (applied live through SQL, not recorded in the migration history). `drop column` on `course_quizzes` **not applied yet**: the MCP call timed out three times with no lock or session visible; the columns are unused and keep their defaults, so nothing depends on the drop |
| 20261111181710 | `member_preferences` | **Applied 2026-11-11** (decision 136). `member_preferences` (one row per member, owner-only RLS, written column by column): `welcome_dismissed_at`, when the member closed the dashboard's first-steps card. Suite `member_preferences_validation.sql` (P1–P4, passed on the project, rolled back) |
| 20261112224251 | `cron_call_timeout` | **Applied 2026-11-12** (owner's go-ahead; recorded under the version the MCP gave it). Re-creates `private.call_email_function()` with `timeout_milliseconds := 60000` (pg_net's default is 5 000 ms): on 2026-11-12, 5 cron → sweep calls were logged as timed out in `net._http_response` while the sweep was still working. Same functions, secret and schedules; billing is per invocation, not duration. Validated on the project inside a rolled-back transaction before, and checked on the live function after. Suite `cron_call_timeout_validation.sql` |
| 20261113111051 | `gift_card_balance_check` | **Applied 2026-11-13** (decision 140; recorded under the version the MCP gave it). `check_gift_card_balance(code)` (authenticated only, throttled per account), `check_gift_card_balance_for_visitor(code, ip_hash)` and `gift_card_balance_ip_allowed(ip_hash)` (service role only, for the Edge Function `gift-card-balance`), over `private.gift_card_balance_answer()` and `private.gift_card_held_amount()`. Answer: status, available amount, currency, expiry, last 4; refusals counted in `gift_card_code_attempts` (a member's counter is shared with `quote_gift_cards()`). Suite `tests/gift_card_balance_check_validation.sql` (GB1–GB8, passed on the project, rolled back) |
| 20261113111154 | `course_reviews` | **Applied 2026-11-13** (decision 141; recorded under the version the MCP gave it). `reviews.course_id` (exclusive with `product_id`, `reviews_one_subject` widened), one review per learner and course, course tags only (`reviews_tags_allowed` replaces the unnamed tag check), `is_verified` = an order or a course; `prepare_review_insert()` checks a course review through `private.course_review_refusal()` (published course, active account, active entitlement — `private.active_course_entitlement()` —, ≥ 50 % of the path by `private.course_progress_pct()` or completed — replaced the same day by completion only, next row) and records the entitlement's purchase order; `guard_review_update()` keeps the course read-only; the select policy shows published reviews of published courses; `course_review_stats` (security invoker) and `product_review_stats` limited to product rows. Suite `tests/course_reviews_validation.sql` (R1–R12, passed on the project, rolled back). The migration file's comments say decision 141; the copy applied on the project says 140 (renumbered after the gift card balance check took 140) |
| 20261113111250 | `email_reminders` | **Applied 2026-11-13** (decision 142; recorded under the version the MCP gave it; `pending_review_request_emails()` replaced the same day, before any push, to list the products of delivered parcels and to read the parcels rather than the order's derived status — the file holds the final text). Reminder e-mails: `private.email_reminder_settings` (one row: on/off and delay per kind, **all off**), `email_reminder_preferences` (sha256 of the address, opt-out token, `opted_out_at`; backend only), `email_reminder_token(email)` (service role), `unsubscribe_email_reminders(token)` (anon, the opt-out page), `pending_abandoned_cart_emails()`, `pending_review_request_emails()`, `pending_loyalty_reward_emails()` (service role), templates `abandoned_cart`, `review_request`, `loyalty_reward` (fr + en). Suite `tests/email_reminders_validation.sql` (R1–R8, passed on the project, rolled back) |
| 20261113140000 | `course_reviews_after_completion` | **Applied 2026-11-13** through the Supabase CLI's Management API (`supabase db query --linked`, the MCP connector being unavailable), recorded under this same version; suite passed on the project (rolled back) and in CI (decision 141, owner's rule). A course review needs the course **completed** (`course_completions`), no longer half of the path: `private.course_review_refusal()` answers `not_completed` (refusal `42501` "complete the course before reviewing it"), `prepare_review_insert()` re-created with that message, `private.course_progress_pct()` dropped. Suite `tests/course_reviews_validation.sql` (R1–R13) |
| 20261113160000 | `course_review_request_email` | **Applied 2026-11-13** through the Supabase CLI (`supabase db query --linked`), recorded under this same version (decision 141 addendum). `private.email_reminder_settings.course_review_request_enabled` (**off**) and `course_review_request_delay_days` (3), `pending_course_review_request_emails()` (service role), template `course_review_request` (fr + en). Suite `tests/course_review_request_email_validation.sql` (E1–E9, passed on the project, rolled back) |

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
store_settings (single row) + store_settings_translations (one row per non-default locale)
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
| `products` | `slug`/`sku` unique, `price`, `compare_at_price` (**retired**, always null since decision 129), `currency`, `status` `draft`/`active`/`archived` (archived = soft delete), `is_featured`, `product_type` `physical`/`digital`, `metadata` (presentation only). |
| `product_variants` | optional per product; `attributes` JSONB object (`{"colour":"saphir"}`, `{"size":"3mm"}`, gems: `{"pack":50,"ss":6}` — integers) so new option types need no columns; `price` null = inherit product price. |
| `product_media` | Storage object path + `media_type`, `alt_text`, `position`, `is_primary` (max one per product), optional `variant_id`. No binaries in Postgres. |
| `inventory_items` | exactly one of `product_id`/`variant_id`; `quantity_on_hand`, `quantity_reserved` (≤ on hand), `low_stock_threshold`, `track_inventory`, manual `availability`; generated `stock_status` (`in_stock`/`low_stock`/`out_of_stock`/`preorder`). |
| `customer_addresses` | many per user, `address_type` shipping/billing, one default per type (setting a new default clears the old one), ISO `country_code`, nullable `postal_code`/`region`. |
| `orders` | `order_number` `GT-100001…`, `user_id` (SET NULL on account deletion — accounting records survive), `customer_email` + `billing_address`/`shipping_address` **JSONB snapshots**, subtotal/discount/shipping/tax/total, `prices_include_tax` (EU VAT-inclusive default), `status`, `payment_status`, `fulfillment_status`, `customer_note`, `admin_note` (deprecated, always NULL since `order_staff_notes`: notes live in `order_notes`, staff only). |
| `order_items` | frozen `product_name`, `variant_name`, `sku`, `unit_price`, `quantity`, generated `subtotal_amount`. |
| `invoices` / `invoice_sequences` | legal invoices (`FA-YYYY-NNNNNN`, one per paid order or paid 3D Studio invoice) and credit notes (`AV-YYYY-NNNNNN`, one per confirmed refund of an invoiced order or Studio withdrawal refund, decision 115), issued by triggers, never updated or deleted; counters per series, gapless (see "Invoices and credit notes"). |
| `languages` | `fr` (default = language of base columns), `en`, `de` enabled; `it`, `es`, `pt`, `nl` disabled. The API can only switch `is_enabled` / `position` (through `admin_save_languages()`); `fr` and `en`, the storefront languages, cannot be switched off. |
| `*_translations` | one row per (entity, non-default locale); product translations carry a localized `slug` (unique per locale) and `meta_title`/`meta_description`; `status` draft/published — only published rows are public. A translation for the default locale is rejected. |
| `shipping_zones` / `shipping_zone_countries` / `shipping_rates` | zones of ISO countries + optional single "rest of world" zone; rates `standard`/`express`/`free`/`pickup` with delivery days, price, `free_over_amount`, basket-amount and weight bounds. |
| `tax_rates` | VAT per country and `tax_category` (`standard`, `books`, `training`, `hygiene`, `digital`) in **basis points** (2000 = 20 %). Reduced rate → else standard → else 0. Every EU country an active zone serves (and Monaco) has a standard rate since `settings_workspace`. |
| `store_settings` / `store_settings_translations` | single row: maintenance switch, business identity and legal mentions (published on the legal notice), contact details, registered office, opening hours (`{mon…sun: {open, from, to}}`), what the contact page shows, support message (French; other locales in the translations table). Public read — only public information belongs there. |
| `product_bundle_items` | kit composition (decision 117): `bundle_product_id` → `products` (cascade), `component_product_id` → `products` and optional `component_variant_id` → `product_variants` (both restrict: a component cannot be deleted while a kit holds it), `quantity` 1–1000 per kit, `position`; one row per (kit, product, option). A product with rows is a kit: its `inventory_items` row is derived by the database. |
| `order_item_components` | what a kit line reserved (decision 117): stock row, product, option, names and units per kit, copied by `create_order()`; payment, expiry and refunds move these units, whatever the kit's composition later becomes. |
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
            VAT per line at the destination rate (prices include VAT, rounded per line; shipping at standard rate; 0 under the VAT franchise, decision 114),
            snapshots, stock RESERVED, expires_at = now + 60 min            → order 'pending'
server  create Stripe Checkout Session (ui_mode custom: payment form on our page) for order.amount_due / currency
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
browser  POST functions/v1/create-checkout-session  {items[{product_id, variant_id, quantity} | {course_id, quantity: 1}], email, address,
                                                      shipping_rate_id, locale, promotion_codes?, gift_card_codes?,
                                                      previous_client_secret?}
           → strict validation (_shared/checkoutInput.ts): no amount, total or currency is accepted
           → user = auth.getUser(Bearer token) when a user token is sent, else guest
           → previous_client_secret: that unpaid payment step is closed first (see release below)
           → no STRIPE_PUBLISHABLE_KEY of the secret key's mode → payment_unavailable, nothing reserved
           → create_order(…, reservation 70 min) with the service role
           → amount_due = 0 (gift cards) → {status: 'paid'}; otherwise Stripe Checkout Session, ui_mode 'custom'
               (decision 80: the Payment Element is mounted on our own cart page, no redirect to Stripe):
               one line "Commande GT-…" for orders.amount_due in minor units, metadata.order_id,
               idempotency key checkout-session:<order id>, expires_at = now + 60 min,
               return_url = confirmation page on SITE_URL or an allowed origin (ALLOWED_RETURN_ORIGINS)
           → payments row 'pending' with the cs_… id → {status: 'payment', client_secret, publishable_key,
             order_number, amount_due (minor units), currency, expires_at}
           → Stripe unreachable: cancel_order(order, 'checkout_failed') → reservation released
browser  POST functions/v1/create-checkout-session  {release_client_secret}   (the customer left the payment step)
           → session retrieved; its client_secret must equal the one sent; open → expired on Stripe (a session
             that cannot be expired, i.e. being paid, is left alone); then cancel_order(order, 'payment_step_left')
             while the order is pending and unpaid → stock and gift cards released. Always {status: 'released'}.
browser  Payment Element (Stripe.js, @stripe/stripe-js 7 = "basil", same release as the functions' API version)
           → checkout.confirm({billingAddress, redirect: 'if_required'}): cards and wallets confirm in place
             (3-D Secure in Stripe's modal) then the page goes to the confirmation page; bank redirects come back
             to return_url. Confirming grants nothing: the webhook below does.
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
  `promotion_code_invalid`, `gift_card_invalid`, `gift_card_details_invalid`, `account_required`, `course_owned`, `payment_unavailable`, `maintenance`,
  `session_expired`, `server_error` (`_shared/orderErrors.ts`). SQL messages are logged, never returned. Every refusal
  of a gift card *used as payment* (unknown, expired, cancelled, empty, too many) is `gift_card_invalid`; a gift card
  *being bought* with refused details is `gift_card_details_invalid`.
- Gift card lines (2026-10-01): `items[]` may hold `{product_id, quantity: 1, gift_card: {amount_minor, recipient_email,
  recipient_name?, sender_name?, message?, design?, deliver_at?}}` — the one customer-chosen amount of a checkout, in
  integer minor units, converted to a decimal string for `create_order()` (`orderItems()`), which checks it against
  `gift_card_settings`. Several gift card lines are allowed (one per recipient). `shipping_rate_id` may be `null` when
  nothing is shipped (create_order() ignores the rate then, and requires it otherwise).

**Deploy (test mode, after the user's go-ahead for the target project):**

```sh
supabase link --project-ref <project ref>
supabase db push                                  # applies 20260930200000_stripe_checkout.sql (pg_cron job + functions)
supabase secrets set --env-file supabase/functions/.env   # names in functions/.env.example
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook          # verify_jwt = false comes from config.toml
supabase functions deploy refund-order            # verify_jwt = false comes from config.toml (staff JWT checked inside)
```

**Deploy from an agent session without the CLI (2026-11-01):** the Supabase MCP `deploy_edge_function` uploads
file contents, which is impractical for a function whose module graph weighs ~250–300 KB (the documents and
their font data). Since the repository is public, the function is deployed with a one-line entry point that
imports the repository's own `index.ts` at a **pinned commit**:
`import "https://raw.githubusercontent.com/Dodivar/global-toothgems/<sha>/supabase/functions/<name>/index.ts";`
(`verify_jwt` as in `config.toml`). The bundler fetches the whole graph at deploy time, so the running function
does not depend on GitHub; the deployed code is exactly the repository at `<sha>` (push first). Redeployed that
way on 2026-11-01 at `45a0420`: `send-pending-emails`, `stripe-webhook`, `create-checkout-session`,
`studio-withdraw` (invoice PDFs with the trading name, decision 120), and the new `email-showcase`; each answered
as expected right after (sweep 200, unsigned or anonymous calls 400/401). The CLI (`supabase functions deploy`)
stays the normal way from a machine.

Secrets (Edge Function environment only, never `NEXT_PUBLIC_*`): `STRIPE_SECRET_KEY` (sk_test_…),
`STRIPE_PUBLISHABLE_KEY` (pk_test_…, same account and mode: returned to the browser to mount the payment form),
`STRIPE_WEBHOOK_SECRET` (whsec_…), `SITE_URL` (production origin), `ALLOWED_RETURN_ORIGINS` (comma-separated
exact origins, e.g. `http://localhost:5173`). `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase.

**Stripe webhook (test mode):** Dashboard → Developers → Webhooks → Add endpoint
`https://<project ref>.supabase.co/functions/v1/stripe-webhook`, events `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`,
and, since decision 82, `refund.created`, `refund.updated`, `refund.failed` (**add them to the existing endpoint: dashboard
step**); copy its signing secret into `STRIPE_WEBHOOK_SECRET`. Payment methods offered are those enabled in the Stripe
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
- **Courses** (decision 141, migration `20261113111154_course_reviews`): a review targets a product **or** a course
  (`course_id`). A learner may review a course when the account is active, the course is published, they hold an
  active entitlement (any source: purchase, grant by hand, pack) and have **completed** the course (a
  `course_completions` row; owner's rule, migration `20261113140000_course_reviews_after_completion`) — checked by
  the database on insert (`private.course_review_refusal()`), refused with `42501` (not a holder, not completed) or
  `P0002` (course not published). One review per learner and course; course tags only (`beginner`, `followable`,
  `clear`, `techniques`, `informative`, `highQuality`, `skills`); verified by construction (`is_verified` = an order
  or a course; `order_id` = the entitlement's purchase, null for a grant by hand). Same lifecycle, moderation
  (`moderate_reviews`, `/admin/avis`), reports, votes, notes and photos as products. Losing access later does not
  remove the review (owner, 2026-11-13); the author can still edit (→ pending) or delete it.
- `course_review_stats` (view, RLS-aware): count, average and star buckets of published reviews per course, read with
  the public courses (`fetchPublicCourses`, non-fatal): course page header, Academy cards, Course JSON-LD
  `aggregateRating` (only with at least one published review). `product_review_stats` counts product rows only.
- `review_requests` (view) stays product-only: course review requests are computed in the browser from the
  learner's own progress (`useReviewRequests()`); no course review e-mail yet.

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
- **Back office (decision 82):** `create_shipment(order, items, carrier, service, tracking_number, tracking_url,
  estimated_delivery, status)` writes the parcel and its lines in ONE transaction (status `preparing`, or `shipped`
  with carrier + tracking number), because the e-mail sweep mails any `shipped` parcel. `set_shipment_status(parcel,
  status, details…)` is forward-only: preparing → shipped | cancelled; shipped → delivered | returned | lost;
  delivered → returned; the same status again (preparing / shipped) only corrects carrier, tracking and dates. Both
  are SECURITY INVOKER under `manage_orders` (viewer, customer and visitor are refused). The shipping e-mail is sent
  once per parcel by the `send-pending-emails` sweep (≤ 5 minutes); a guest's parcel without a tracking page is
  not announced, so the parcel form proposes the carrier's page (`webapp/src/lib/carriers.ts`).
- Units refunded (succeeded) are no longer "to ship" and units being refunded (pending included) cannot be put in a
  parcel; a confirmed partial refund recomputes `fulfillment_status` / `status`.

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

**Operated from the back office (decision 82)** — Edge Function `refund-order` (`verify_jwt = false`, the caller's
JWT is checked inside, like `invite-staff-member`):

```
browser  POST functions/v1/refund-order {action: 'request', order_id, amount_minor, reason, items[], restock}
           → my_permissions() with the caller's JWT must hold manage_orders
           → request_refund() WITH THE CALLER'S JWT: permission, paid card payment, amount ≤ refundable balance
             (payment row locked), lines not refunded twice, no active purchased gift card → refund 'pending'
           → Stripe refunds.create({payment_intent, amount, metadata:{refund_id, order_id}}, idempotency 'refund:<id>')
           → provider_refund_id saved on the row; NOT confirmed here
           → a Stripe refusal calls mark_refund_failed (balance freed); a Stripe outage leaves the row pending
browser  POST … {action: 'cancel', refund_id}: only a pending refund WITHOUT a Stripe refund id
Stripe   refund.created / refund.updated / refund.failed → stripe-webhook (verified, deduplicated in stripe_webhook_events)
           succeeded → mark_refund_succeeded (row found by metadata.refund_id, else by provider_refund_id)
                       payment + order states, restock, fulfilment, course access revoked on a FULL refund (trigger)
                       then the refund e-mail sweep runs (and the 5-minute sweep catches what failed)
           failed / canceled → mark_refund_failed;  pending / requires_action → recorded, nothing yet
           no refund row (refund made in the Stripe dashboard) → record_external_refund(payment_intent, re_…)
```

The browser never sets a refund's outcome: the order shows the refund as pending until Stripe's event. The amount
sent to Stripe is the very integer received (`toDecimalString` for Postgres). Error codes: `invalid_request`,
`unauthorized`, `forbidden`, `no_card_payment`, `amount_too_high`, `gift_card_active`, `refund_refused`,
`stripe_refused`, `stripe_unavailable`, `not_found`, `already_sent`, `server_error`. Refunds credited onto gift cards
(`refund_to_gift_cards`) are immediate and not e-mailed. No Stripe secret other than the existing ones.

### Invoices and credit notes (iteration 24)

```
order payment_status → 'paid'  (mark_order_paid, or create_order when gift cards cover it)
   → trigger orders_zz_issue_invoice → private.issue_order_invoice(order)    [same transaction]
        lock invoice_sequences row 'FA-<year Europe/Paris>' → next number → issued_at = clock_timestamp()
        snapshot: seller (store_settings now), buyer (billing address + e-mail + order number),
                  lines (order_items + shipping), VAT breakdown per rate, payment (paid_at, gift cards, card)
refund status → 'succeeded'  (mark_refund_succeeded, record_external_refund, refund_to_gift_cards)
   → trigger refunds_zz_issue_credit_note → private.issue_refund_credit_note(refund)
        only when the order has an invoice; 'AV-<year>' series; credited_invoice_id → the invoice
```

- **Numbering.** One series per kind and calendar year, six digits: `FA-2026-000001`, `AV-2026-000001`. The counter
  row is locked by the issuing transaction, so numbers follow the commit order; a rolled-back payment gives its
  number back (a Postgres sequence would leave a gap). `issued_at` is read after the lock: a later number never has
  an earlier date. Unique `(series, sequence_number)` and `invoice_number`, one invoice per order.
- **Content = what was recorded.** Line `total_incl` = `subtotal_amount − discount_amount`, `vat_amount` = the line's
  stored `tax_amount`, `total_excl` = the difference; `unit_price_excl` = unit price ÷ (1 + rate), rounded to the
  cent (informative; totals come from the stored amounts). Shipping VAT = order VAT − lines' VAT, at today's
  standard rate of the tax country. Gift card lines: rate 0 (multi-purpose vouchers). Totals: sums of the lines,
  equal to the order's total.
- **Credit notes.** Amount = the refund. VAT follows what was refunded: the refund's items at their invoiced value
  and rate (scaled to the amount), any surplus as shipping; a refund without items is spread over the invoice's
  rates pro rata. Cent residue on the largest line. Credit notes repeat the buyer, take the seller as Settings holds
  it at issue time, and name the invoice they credit.
- **Immutable.** `invoices_immutable` refuses UPDATE and DELETE for every role, the table owner included; orders and
  refunds referenced by an invoice cannot be deleted (`RESTRICT`). A mistake is corrected by a credit note.
- **Access.** No API writes; `invoice_sequences` has no grant and no policy (advisor "RLS enabled, no policy" accepted, as for `email_log`). The order's owner reads its invoices (member order
  page, PDF via `webapp/src/lib/documents/invoiceDocument.ts`); active staff read all.
- **E-mailed (owner, 2026-10-09; changed 2026-11-08).** The order confirmation carries **no invoice** any more (owner's
  request: downloadable on request; e-mailing it is mandatory only for B2B buyers, not built; a guest has no member
  page and asks support), and the refund e-mail carries the refund's credit note. **Deployed 2026-11-08** from the pinned commit `66c8915`: `stripe-webhook`, `create-checkout-session`, `email-showcase`. Drawn in
  the Edge Functions (`_shared/email/invoicePdf.ts`) by the same template as the member's download:
  `_shared/documents/` is a generated copy of `webapp/src/lib/documents/` (portable modules + the `documents`
  strings), refreshed by `npm run sync:documents` in `webapp/`; a Vitest test fails while the copy is stale. A PDF
  that cannot be drawn is logged and the e-mail leaves without it (the member still has the download). Refunds
  credited onto gift cards send no e-mail, so their credit note is not mailed (member page and back office only).
- **Not covered.** Orders paid before 2026-10-09 have no invoice (no backfill: development data). B2B details
  (buyer company VAT number, reverse charge) are not collected by checkout.

### Terms of sale on a durable medium (decision 130)

```
checkout   create-checkout-session: create_order() → orders.terms_version = TERMS_OF_SALE_VERSION (once, frozen)
           create-studio-subscription (Pay): consent_records studio_immediate_access + terms_version
e-mails    order confirmation (notifyOrderPaid), course enrolment (hook + sweep), Studio confirmation (sweep)
             → termsOfSaleForEmail(store, locale, reference): PDF from _shared/legal/ (copy of webapp/src/data/legal/)
             → attached, footer "version du …"; PDF failure → the text in the e-mail, footer says so, logged
```

- Source of the text: `webapp/src/data/legal/terms.ts` (+ `policies.ts`, `storeFill.ts`), rendered by the page and by
  `termsDocument.ts`; `npm run sync:documents` refreshes `supabase/functions/_shared/legal/`. Changing the text means a
  new `TERMS_OF_SALE_VERSION` (the fingerprint test says so) and redeploying the checkout and e-mail functions together.
- No migration is needed for a new version: the column holds whatever version the checkout sends.

### Gift cards (iteration 4)

Used by the webapp's gift card domain (`webapp/src/lib/giftCards/`): back office, `/carte-cadeau`, codes in the cart.

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
- **Retry after an abandoned payment** (2026-10-06): a card is debited while its order is unpaid, so `create-checkout-session` first releases unpaid orders holding the submitted codes (Stripe session expired — or proven expired — then `cancel_order`; a session that may be paid is left alone). Whoever presents the code may release it: it is a bearer credential.
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

**Wired to the webapp (2026-10-01).** The back office reads `gift_card_overview` (every active staff member; status
from `display_status`, never recomputed), the ledger and `gift_cards.message`, and calls the four staff functions
under the member's own JWT (`manage_promotions` checked inside each function); settings are updated through RLS
(`manage_promotions`, zero rows = refused). `/carte-cadeau` reads the published settings and sells through the
checkout (`create-checkout-session` accepts gift card lines); the cart sends up to 5 `gift_card_codes`. Migration
`20261001200000_gift_card_staff_functions` (not applied yet) stops `extend_gift_card` / `cancel_gift_card` from
returning the code. Suite: `tests/gift_cards_validation.sql` (GC1–GC7).

**Built (2026-10-05) — delivering the code** (Resend, Edge Functions, decision 79; `_shared/email/giftCards.ts`, function `deliver-gift-cards`). Deployed (2026-10-10). Design:

```
Edge Function deliver-gift-cards (service role, verify_jwt = false, header x-internal-secret = EMAIL_INTERNAL_SECRET, called by pg_cron every 5 min;
  the cards of an order are also delivered right after payment by the webhook / checkout hook)
  select active cards with delivery_status in ('pending','scheduled') and (deliver_at is null or deliver_at <= now())
    (index gift_cards_delivery_due_idx already exists), a few dozen per run, oldest first, row lock skip locked
  per card: code := gift_card_code_for_delivery(id)        -- service role only, never logged
            render the localized e-mail (email_template_for('gift_card_delivery', locale), shared layout) with design, amount, sender, message, expiry
            send through Resend (_shared/email), claimed in email_log as event "gift_card:<id>" (Resend idempotency key <event>:<attempt>,
            5 attempts then left failed); a retry finding the e-mail already sent only records the delivery
            record_gift_card_delivery(id, 'sent')             -- 'delivered' / 'opened' / 'bounced' from provider webhooks
  Not built: the resend below, and the delivery statuses coming back from Resend (resend-webhook).
  resend from the back office: a staff-only Edge Function (manage_promotions) calling the same path, optional corrected
  address through record_gift_card_delivery(id, 'sent', new_email); the code is never returned to the browser.
```

**Built (2026-11-13) — balance check** (decision 140, migration `20261113111051_gift_card_balance_check`, Edge Function
`gift-card-balance`). Whoever holds a code reads what is left on it:

```
member   /compte/fidelite or /carte-cadeau signed in → rpc check_gift_card_balance(code)        actor 'user:<id>'
visitor  /carte-cadeau#solde → POST functions/v1/gift-card-balance {code, captcha?, website?}
           → honeypot (answers found=false) → gift_card_balance_ip_allowed(sha256(ip)): 20 lookups / hour
           → Turnstile when TURNSTILE_SECRET_KEY is set → check_gift_card_balance_for_visitor(code, ip_hash)   actor 'iph:<hash>'
both     private.gift_card_balance_answer(code, actor):
           10 refusals / 10 min per actor (gift_card_code_attempts; members share it with quote_gift_cards()) → too_many_attempts
           unknown, malformed, 'pending', 'void', deliver_at in the future → {ok, found: false}, counted as a refusal
           else {ok, found, card: {status active|used_up|expired|cancelled, balance, currency, expires_at, last4}}
```

"Available" = balance + what unpaid pending orders hold (`private.gift_card_held_amount()`, the rule of
`quote_gift_cards()`); a cancelled card shows 0. Never returned: the code, ids, the order, names, e-mails. The code
stays in the component's memory (never stored, never in an address; the field carries `ph-no-capture`). The staff /
backend `gift_card_balance()` is unchanged. Since 2026-10-11 the cart also shows what the typed codes pay
(`quote_gift_cards()`, decision 89): a total capped at the amount asked.

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
| Cookie banner choices | browser only (`gt-cookie-consent` in localStorage, analytics category only, valid 6 months); the `consent_records` purposes `cookies_preferences` / `cookies_analytics` / `cookies_marketing` exist but nothing writes them |
| Security: email verified, pending email change, password, Google sign-in | Supabase Auth (`auth.users`, `auth.identities`) — never duplicated |
| Security: "password last changed" | `profiles.password_changed_at` (set by the backend after an Auth password change) |
| Security: personal-data export | `my_personal_data()` (the archive, returned at once; one every 5 minutes, logged as `delivered` in `data_export_requests`) — decision 125 |
| Security: delete account | Edge Function `delete-account` → Storage files, then `erase_account()` (one transaction: auth user, profile and what cascades; orders, invoices and Studio billing kept with `user_id` null) — decision 125 |
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
- **Exports** (decision 125): `my_personal_data()` builds the signed-in member's archive and returns it; each
  one is recorded as `delivered`; a second within 5 minutes answers `too_soon`. The former asynchronous
  statuses (`pending` → `ready` → `expired`, bucket `data-exports`) are unused.
- **Erasure** (decision 125): only `erase_account()` (service role, through `delete-account`), refused while
  `private.account_erasure_blockers()` lists a staff account, a running Studio subscription, a withdrawal under
  way or an order whose payment can still complete.
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

**Inviting a team member**: Edge Function `invite-staff-member` (see *Team invitations* below).

### Team invitations (Edge Function `invite-staff-member`)

```
back office  POST functions/v1/invite-staff-member  (caller's JWT; verify_jwt = false, checked inside)
               → auth.getUser(token); my_permissions() READ WITH THE CALLER'S JWT must hold manage_users
                 (otherwise 401/403 before any lookup: nothing is revealed about an address)
               → strict input (invite-staff-member/input.ts): action invite {email, first_name, last_name,
                 role viewer|manager|admin, team, job_title?} | resend {user_id} | cancel {user_id}
  invite       → target role rank > caller rank → rank_forbidden, before any e-mail
               → no account: auth.admin.inviteUserByEmail(email, redirectTo = <allowed origin>/auth/confirm
                 ?next=/reinitialiser-mot-de-passe, data {first_name, last_name}) [service role], then
                 app_metadata.staff_invitation = true [service role]
               → active customer: promoted, no e-mail (keeps their password and their own names)
               → already staff: already_member (the same pending invitation retried answers "invited")
               → UPDATE profiles (role, names) + UPSERT staff_profiles WITH THE CALLER'S JWT → RLS,
                 guard_profile_update() and guard_staff_profile() apply the rank rules and audit;
                 refused → the account this call created is deleted again
  resend       → pending invitation only (never signed in, e-mail unconfirmed), explicit rank check,
                 inviteUserByEmail again (Supabase re-sends to an unconfirmed user)
  cancel       → pending invitation created by this function only (app_metadata.staff_invitation): staff row
                 deleted + role back to customer WITH THE CALLER'S JWT, then auth.admin.deleteUser [service role]
```

Error codes: `invalid_request`, `unauthorized`, `forbidden`, `rank_forbidden`, `already_member`,
`account_unavailable` (suspended customer), `not_pending`, `not_found`, `rate_limited`, `server_error`. Auth and SQL
messages are logged, never returned. Unit tests: `cd supabase/functions && deno test invite-staff-member`.

**Deploy (after the user's go-ahead):** `supabase functions deploy invite-staff-member` (`verify_jwt = false` from
`config.toml`). Secrets: `SITE_URL` and `ALLOWED_RETURN_ORIGINS` (already used by checkout) build the invitation
link; `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase. Auth dashboard
(user's settings): paste `templates/invite-staff.html` into Emails → *Invite user*; `<SITE_URL>/auth/confirm` must be
in the redirect allow-list (already needed by sign-up); SMTP sender limits apply to invitations.

### Promotions (iteration 6)

Mirrors the Promotions workspace (`webapp/src/data/adminPromotions.ts`, `lib/promotionRules.ts`).

- **Types**: `percentage` (optional cap), `fixed_amount`, `buy_x_get_y` (every group of X+Y eligible units, the Y
  cheapest are `reward_percent` off), `free_shipping`, `bundle` (complete sets × (cheapest unit of each product −
  bundle price)), `gift` (a free line added — or one unit of it made free — when an eligible *other* product is bought,
  only if it is in stock).
- **Scope**: all products, products, categories or collections; excluded products; `exclude_discounted_products`
  (lines with a `compare_at_price` are not discounted — since decision 129 no line has one, so the flag excludes
  nothing; see decision 129 (e)). **Gift card lines are never discounted.**
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

**Back office and cart on live data** (migrations `promotions_live`, `promotions_draft_code`)

- `admin_save_promotion(p jsonb) returns uuid` — creates (no `id`) or updates a promotion with everything around it:
  scope (`product_ids`, `excluded_product_ids`, `bundle_product_ids`, `category_ids`, `collection_ids`), `segment_ids`,
  the shared code (`code`) or unique codes (`unique_code_count` → `generate_promotion_codes()` for what is missing,
  `unique_code_prefix`), and the English text (French stays in the base columns, English becomes a *published*
  `promotion_translations` row, deleted when emptied). `starts_at` / `ends_at` are local `YYYY-MM-DDTHH:mm` in the
  promotion's `timezone` and converted in Postgres (summer time honoured). The promotion is written as a draft, its
  children replaced, and the requested lifecycle applied **last**, so `validate_promotion()` sees the finished
  promotion (a live promotion being edited goes through `draft` inside the transaction: nobody sees it half written).
  A changed code switches the old one off; a code of another promotion (archived included) is `23505`; switching to
  automatic, or from shared to unique, switches the old codes off first.
- `admin_save_campaign(p jsonb) returns uuid` — the campaign, its ordered `product_ids` and the English text.
- `promotion_daily_usage` — orders per promotion per day of payment (shop time), last 30 days, for the detail page's chart.
  Promotion figures come from `promotion_overview` (paid orders only).
- `quote_gift_cards(p_codes, p_amount, p_currency) → jsonb` — the cart's gift card preview: `{ok, applied, refused[]}`
  or `{ok:false, error: too_many_attempts | unavailable}`. `p_amount` is what the cards may pay for (the order total
  without the gift cards bought in it, as the cart computes it: display only). Same rules as `create_order()`
  (≤ 5 codes, de-duplicated, active, unexpired, delivered, same currency, money left); an amount held by an unpaid
  order counts as available (the checkout releases those holds first). `applied` = min(Σ available, `p_amount`);
  `refused` = the normalised codes that cannot be used, every refusal alike; 10 refusals per caller per 10 minutes
  (`gift_card_code_attempts`), then `too_many_attempts`.
- `quote_basket(p_items, p_promotion_codes, p_shipping_rate_id, p_use_loyalty_reward, p_currency, p_locale, p_email) → jsonb` —
  the cart's preview: `{ok, goods_discount, shipping_discount, discounts[{label, code, type, goods_amount,
  shipping_amount}], lines[], gift_lines[], used_up[{label, max_uses}]}` or `{ok:false, error: promotion_code_invalid | loyalty_reward_unavailable |
  too_many_attempts | unavailable}`. It builds the shop lines like `create_order()` (price, variant, VAT category; stock
  and gift cards ignored), then calls `private.compute_order_discounts()`. The caller's account (`auth.uid()`) counts
  for "new customer" and per-customer limits; a guest counts by `p_email` once typed in the checkout form (decision
  87; at most 5 new addresses per caller per 10 minutes, logged hashed in `promotion_email_lookups`, else quoted
  without e-mail). `used_up` lists the automatic promotions the basket would get but the customer has already had
  `max_uses_per_customer` times on paid orders: the cart says so instead of a silently missing discount (a use held
  by an unpaid order is not reported). Nothing is reserved or consumed.
  **Throttle:** every refused typed code is logged in `promotion_code_attempts` (actor = the account, else the first
  `x-forwarded-for` address); 10 refusals in 10 minutes → `too_many_attempts` for codes (the codeless quote still
  works); rows older than a day are purged on the next refusal. Codes stay unreadable to visitors and customers.

### Shop withdrawals (decision 131)

The online withdrawal function of article L221-21 C. conso. (directive (EU) 2023/2673, art. 11a of directive
2011/83/EU, applicable since 19 June 2026; ordinance n° 2026-2 and decree n° 2026-3 of 5 January 2026). Migration
`20261109213000_order_withdrawals`, Edge Function `order-withdrawal`, suite `order_withdrawals_validation.sql`.

```
member   /compte/commandes/<ref>  "Se rétracter du contrat ici"  → order_withdrawal_options(order)  (RLS-checked RPC)
guest    /fr/retours-remboursements/retractation (/en/returns/withdrawal): order number + order e-mail
           → order-withdrawal {request_link}: honeypot, 10 / h / IP, Turnstile when configured,
             request_order_withdrawal_link() 3 / h / pair → same answer whatever exists;
             a link valid 48 h e-mailed to the ORDER's address (token in the fragment #t=…, stored hashed)
           → order-withdrawal {options, token}
both     form: name, lines and quantities, seal answer for sealed products, "consumer" box
           → "Confirmer la rétractation" → order-withdrawal {declare} → declare_order_withdrawal() (service role)
           → acknowledgement e-mailed at once (order_withdrawal:<id>, send-pending-emails catches failures)
staff    /admin/commandes/<ref>: return received | refund (refund-order with withdrawal_id →
           request_withdrawal_refund() → Stripe; refund.* webhook → withdrawal 'refunded') | refuse (reason + note)
```

- **Period.** 14 days from receipt of the last parcel (`delivered_at`, else the later of the estimated delivery and
  shipping date + the order's maximum delay in working days, 7 when none), receipt day not counted, ends at
  midnight Paris time, carried to Monday from a Saturday/Sunday. While goods have not all left (or a parcel is lost)
  the period has not started and the function is open. The deadline judged is stored on the declaration.
- **Lines.** Physical products only: course lines, gift cards and digital products are refused (`excluded_line`) and
  keep their own rules. Units withdrawable = bought − refunded or being refunded − in a declaration not refused.
- **Sealed products** (`products.withdrawal_hygiene_seal`): the customer answers whether the seal was opened; opened
  is refused (`unsealed_hygiene`). The team checks the parcel and refuses with `unsealed_hygiene` if it lied.
- **Professionals.** The customer ticks "I placed this order as a consumer"; unticked is refused
  (`professional_buyer`). An order whose billing address carries a `vat_number` is closed (`professional`) — the
  checkout does not collect one today.
- **Refund.** `request_withdrawal_refund()` refunds the declared lines through the existing flow (amount typed by the
  team, suggested = lines' paid value + the order's delivery when every physical unit comes back; restock optional);
  confirmed only by Stripe's `refund.*` event; a refund in flight blocks refusal and a second refund.
- **Data.** Withdrawals are kept like the order (never purged; `user_id` null after an erasure); listed in
  `my_personal_data()` under each order; guest links purged 30 days after expiry. Errors: `order_withdrawal: <code>`
  (23514), `seal_answer_required` (22023), 42501 for a wrong owner / link.

### Omnibus price reference (decision 129)

Directive 98/6/EC art. 6a, Code de la consommation art. L112-1-1: an announced price reduction shows as the previous
price the lowest price applied in the 30 days before the reduction. A struck-out price comes **only** from the database:

```
products / product_variants / courses ──trigger──► price_history      (list price segments [valid_from, valid_to))
promotions / promotion_products / course_promotions ──trigger──► price_cut_history (cut periods)
private.price_reference(product, variant, course, at)
   price now  = list price − best cut running (same rounding as course_current_prices)
   series     = the running cuts + every earlier cut touching or overlapping them (no gap of the list price)
   window     = [series start − 30 days, series start), cut to the first price known in that currency
   reference  = lowest list or cut price over the window
   state      = reduced (price < reference: strike the reference, percentage floor((ref − price) / ref))
              | not_lower | no_history (nothing struck) | no_reduction (no cut; reference = lowest of the last 30 days)
storefront_price_references()  visitors: active products, active variants, published courses with a cut running
admin_price_references(id)     manage_products: one product (any status) and its active options
```

- A cut is recorded only for the shop-window rule the storefront always used to change a unit price: `live`,
  `automatic`, `percentage`, `applies_to = products` (the product `eligible`, not `excluded`), every customer, no
  minimum basket or quantity, no cap; gift card products never. Other promotions (codes, amounts, x + y, bundles,
  gifts, conditional percentages, categories, collections) do not change a displayed unit price and never strike one.
- A promotion change closes, at `now()`, the cut rows that already took effect and deletes those that never did
  (future or opened in the same transaction), then records the current state from `greatest(starts_at, now())`.
  A list price change closes the open segment and opens a new one (a segment opened in the same transaction is
  corrected in place). Variants without a price follow the product.
- The history tables have RLS, a staff read policy and no write grant: only the security-definer triggers write.
  `products.compare_at_price` / `product_variants.compare_at_price` are kept (the discount engine reads them) but a
  CHECK refuses any non-null value, from any role.
- Shop: `webapp/src/lib/storefrontOffers.ts` (`mapPriceReference`, `offerPrice`, `basketLineStruck`), read with the
  offers once hydrated (`storefrontOffersApi.ts`); courses: `lib/academy/api.ts` → `PublicCourse.referencePrice`;
  back office: `lib/adminPriceReference.ts`, `components/admin/PriceReferencePanel.tsx` (read only).

### Public pages and customer service (iteration 7)

**Contact form → tickets** (`webapp/src/screens/legal/Contact.tsx`)
- Only path in: `submit_contact_request(name, email, category, subject, message, order_reference?, locale?, attachment_paths?)`
  → returns the ticket number (`SUP-100001…`). The browser never calls it: it posts one multipart request to the
  Edge Function `submit-contact-request` (`webapp/src/lib/contact/api.ts`), which calls the RPC with the member's
  JWT, or with the service role for a visitor — `anon` cannot call it.
- Validated in the database: 9 categories, subject, message 20–5000 characters, e-mail; `privacy` requests are
  `high` priority. Throttled: 3 per 10 minutes per account or e-mail (`PT429` → HTTP 429 through PostgREST).
- The typed order number is linked to the order **only** when it is the requester's own (account, or same e-mail
  for a guest); the answer never says whether it matched.
- Attachments (2026-10-08): at most **5 files, 20 MB in all** (read as a total, not per file — decision to confirm), JPG/PNG/PDF,
  in the private bucket `contact-attachments` (20 MB per object). The Edge Function checks the type from the file's
  first bytes, names the objects itself (`<user_id>/<uuid>.<ext>` for a member, `guest/<uuid>.<ext>` for a visitor)
  and removes them if the ticket is refused. `contact_requests.attachment_paths text[]` (≤ 5 valid paths); the RPC checks
  each path exists in the caller's folder, no duplicates, and the stored sizes add up to ≤ 20 MB.
- Triage (`manage_customers`): status `new → open → waiting_customer → resolved/closed` (or `spam`), priority,
  assignee (active team member); `first_response_at` / `resolved_at` stamped; the customer's words never change;
  audited. Internal notes in `contact_request_notes`. Customers see their own tickets; all staff read them.
- The Edge Function then sends two e-mails, best effort (the ticket is the record; failures are only logged):
  `contact_acknowledgement` to the customer (event `contact_acknowledgement:<ticket>`) and `contact_request_received`
  to the support inbox — French, `Reply-To` = the customer, the files attached (event `contact_request_received:<ticket>`).
  Support address: `store_settings.support_email` (even when the contact page hides it), else the `EMAIL_REPLY_TO` secret.
  No back-office screen reads the tickets yet, so this e-mail is how the team receives the message.
- Protection until a captcha is chosen: a honeypot field, 10 attempts / 10 min per caller address (`contact_ip_allowed()`,
  service role only, hashed address) and the database's 3 / 10 min per account or e-mail.

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
- **Wired on the storefront (2026-11-06):** the home page band (`components/homeAlt/NewsletterBand.tsx`, through
  `webapp/src/lib/newsletter/api.ts`) posts to the Edge Function `newsletter-subscribe` (`verify_jwt = false`):
  explicit consent box required, honeypot `website`, `newsletter_ip_allowed()` (10 / hour per caller address), then
  `newsletter_subscribe()` as the service role (`policy_version` = the site's `LEGAL_POLICY_VERSION`) and the
  `newsletter_confirmation` e-mail with a "Confirm" button. The visitor is told to check their inbox whatever the
  address's state (no enumeration); a failed e-mail answers an error so they can retry. The link lands on
  `/newsletter/confirmer?token=…` (unprefixed system page, `screens/NewsletterConfirm.tsx`). Clicking the link is
  the confirmation (owner's choice, 2026-11-06, replacing a second "Confirm" button on the page): the page calls
  `newsletter_confirm()` from the browser once loaded, never the server on the request, so a scanner that only
  fetches links does not confirm; one that runs scripts could (accepted trade-off). The token link is built on the form's origin when it is in `ALLOWED_RETURN_ORIGINS`, else `SITE_URL`.
  No unsubscribe page yet: campaigns are to be sent with Resend Broadcasts, whose own unsubscribe will be mirrored
  back (next steps: contacts sync to Resend, unsubscribe events through `resend-webhook`).
- **No confirmation e-mail when another proof exists (2026-11-08, owner's choice, migration `newsletter_direct_signup`):**
  `newsletter-subscribe` subscribes at once (`newsletter_subscribe_direct()`, answer `{status: "subscribed"}`) when a
  signed-in member subscribes their own account's confirmed address (the session's JWT, `auth.getUser`), or when a
  visitor's Cloudflare Turnstile token passes (`TURNSTILE_SECRET_KEY`, server-side siteverify). Once that secret is set,
  a visitor request without a passing token is refused (`captcha_required` / `captcha_failed`); until it is, visitors
  keep the double opt-in above (`{status: "sent"}`). The home band fills in a signed-in member's address, loads the
  Turnstile script only once the visitor starts filling the form (`webapp/src/lib/captcha/turnstile.ts`,
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, "interaction-only": usually invisible) and says "You're subscribed" or "check your
  inbox". How each subscription was obtained is kept in `opt_in_method` (proof of consent). Both Turnstile keys were set
  by the owner on 2026-11-08; checked right after: no token → `captcha_required`, a fake token → `captcha_failed`. Decision to confirm with
  the lawyer: single opt-in with a captcha for visitors (legal in France as far as known; Germany expects a double
  opt-in).
- **Mirrored into Resend contacts (2026-11-06, migration `newsletter_contact_sync`):** campaigns are written and
  sent with Resend Broadcasts, so the Edge Function `sync-newsletter-contacts` (pg_cron every 5 minutes, internal
  secret) applies the queue the database keeps on `newsletter_subscriptions`: a subscribed address becomes a Resend
  contact (e-mail, a member's first name; nothing else) in the segments the code manages, by exact name —
  `Newsletter — français` / `Newsletter — English`, and `Clients — VIP` for members tagged `vip`. Three segments,
  the free Resend plan's limit (owner's choice, 2026-11-06: a campaign goes out once per language anyway, so no
  "all subscribers" segment; the other CRM tags never leave the database — adding one is a line in `TAG_SEGMENTS`
  once the plan allows more). The segments first created on 2026-11-06 for everyone and the other tags are in
  `RETIRED_SEGMENTS`: the sweep deletes them in Resend on sight (their contacts stay). Segments are created in
  Resend on first need; segments the team makes by hand are never touched (renaming a managed one makes the sweep
  create it again). First run on the project the same day, once the owner replaced `RESEND_API_KEY` by a
  full-access key (the sending-only key was refused, as designed).
  Any other status deletes the contact in Resend. A contact who unsubscribed in Resend is never set back to
  subscribed: its choice is recorded with `newsletter_resend_opt_out()` (counted as `unsubscribedInResend`).
- **Opt-outs made in Resend come back (2026-11-06, migration `newsletter_resend_opt_out`):** `resend-webhook` also
  handles `contact.updated` with `unsubscribed: true` (Resend's unsubscribe link in a broadcast) and, for e-mails that
  are not in `email_log` but carry a `broadcast_id`, a permanent `email.bounced` or an `email.complained`; each calls
  `newsletter_resend_opt_out()`, whose status change queues the row so the sync then deletes the contact in Resend.
  A contact set back to subscribed in Resend changes nothing here (subscribing again goes through our double opt-in);
  transient bounces are ignored. The sync is the safety net for a lost webhook. The `contact.updated` event was
  enabled on the Resend webhook endpoint by the owner on 2026-11-06 (Resend dashboard › Webhooks). `RESEND_API_KEY` must be a
  full-access key (contacts); a sending-only key answers 401/403, the run stops and the rows keep the error
  (`contact_sync_error`). Requests paced under 2 per second, a 429 retried once. API paths checked against the
  official `resend` SDK 6.37.0 (resend.com is not reachable from agent sessions).
  **Deployed 2026-11-06** from the pinned commit `5a79c88` (entry point on raw GitHub, see Deploy above); checked right
  after with calls that send nothing (refused consent 400, GET 405, honeypot 200). A real sign-up (e-mail sent, link
  confirmed) is still to be tried by the owner on the live site.

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
  `extras`. `training` is `null` and `insights` is `[]` (see decisions; the screen fills both itself).
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

### Product characteristics and FAQ groups (decision 110)

- **Characteristics**: five optional texts per product — `spec_material`, `spec_center`, `spec_back`, `spec_packaging`, `spec_wear` — French on `products`, English on `product_translations` (1–120 characters; empty = null = not shown). The product page lists them for **gems only** (category slug `gems`), with the selected option's size; `spec_material` is also every product's card subtitle. Written by `admin_save_product()` (`specs` key, absent = unchanged), edited in `/admin/produits` (section "Caractéristiques" for a gem, material alone in "Informations complémentaires" otherwise). `metadata.material` was copied into `spec_material` once and is no longer read.
- **FAQ groups**: `faq_groups` (name for the back office, `draft`/`published`, `position`), `faq_items` (question + answer in French, ordered), `faq_item_translations` (published when both English texts are set), assigned through `product_faq_groups` and `category_faq_groups`. **Rule** (`product_faq(p_product_id, p_locale)`, `SECURITY INVOKER`): a product with at least one published group of its own shows only those; otherwise its category's published groups; neither = no FAQ section. Groups in `position` order, questions in theirs; text in the locale when translated, else French. The product page reads it on the server (`findProductFaq()`, cached like the catalogue).
- **Writes**: `admin_save_faq_group(jsonb)` saves a group, its complete ordered questions and its complete assignments in one transaction (`manage_products`, validated server-side: name ≤ 120, ≤ 50 questions, question ≤ 300, answer ≤ 2000, a published group needs a question, a question never moves between groups, unknown product/category → `22023`). Delete and reorder are plain writes on `faq_groups` (RLS `manage_products`; deleting cascades to questions and assignments). Back office `/admin/faq` (Catalogue).
- **Access**: visitors read published groups, their questions, published translations and assignments (`private.faq_group_published()` in the child policies); staff read everything. Status/name changes and deletions of a group go to `audit_logs`.

### Product options (decision 119)

- **Model**: a product's variants may combine **options** (axes): `product_options` ("Couleur", "Prise"; French name, `position`) with their `product_option_values` ("Argent" + optional colour dot `swatch`, "Prise EU"; `position`), English names in `product_option_translations` / `product_option_value_translations` (published on save; empty = French). `product_variant_option_values` says which value a variant has on each option (primary key `(variant_id, option_id)`; the value's foreign key is `(value_id, option_id)`, so a value of another option cannot be linked). A variant stays what is sold — own SKU, price, stock row, orders, invoices, back-in-stock alerts — so nothing downstream of the catalogue changes.
- **Writes**: only `admin_save_product()`, with `custom_variants` (never with pack/SS options): `variant_options` is the complete ordered list (1–3 options, 1–30 values, names 1–60 characters, unique per list case-insensitively; ids generated by the browser); each variant then carries `option_values` (one value per option, in option order, each combination once) and gets its **name derived** from its values ("Argent · Prise EU", English "Silver · EU plug", an untranslated value falling back to French) and the first value's colour dot. Options or values left out are deleted (their links go with them; a photo linked to a removed value is unlinked). `variant_options: []` removes the options and leaves plain variants under their names. A product with options refuses `custom_variants` without `variant_options` (an older back office would otherwise rename its variants). A photo shows a variant **or** a value (`product_media_one_subject`); `media[].option_value_id` must be a value of the same product.
- **Storefront**: the catalogue query embeds the options, values and links (`lib/catalog/api.ts`); a product offers them only when every active variant has a value of each option (`mapProduct`), else its flat list. The product page shows one row of pills per option (`components/shop/VariantOptionPicker.tsx`, rules in `lib/productOptions.ts`): picking a value keeps the other choices when that combination can be bought, otherwise moves to the combination keeping the most of them (in stock first); a value no combination can be bought with is disabled. A variant's photo is its own, else the first photo of one of its values. Product cards show one dot per colour value (`cardVariants`).
- **Back office** (`/admin/produits`, section Variants): "Combine options" turns the current variants into the values of a first option (ids, SKUs, stock and photo links kept), then a second option is added beside it; every combination is listed with its price, stock and threshold, a combination can be taken out (deleted at save, deactivated if ordered) and offered again (`components/admin/VariantOptionsEditor.tsx`, rules in `lib/variantOptions.ts`).

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
(`/admin/formations/medias`) read and write. The public Academy pages read the published courses since
iteration 21 (phase B), the learners since iteration 22 (phase C, below).

```
training_media (image | video, storage media/<id>/<file> in the private training-media bucket)
courses ─* course_modules ─* course_steps ─* course_blocks (text | image | video)
                 └─ course_quizzes (0..1 per module) ─* quiz_questions ─* quiz_answers
courses ─* course_promotions            every level ─* <level>_translations (English; French in the base columns)
media references: courses.cover_media_id, course_modules.cover_media_id, course_blocks.media_id / poster_media_id,
                  quiz_questions.image_media_id — ON DELETE RESTRICT; English files of image slots in
                  course_block_translations.media_id / poster_media_id, quiz_question_translations.image_media_id
```

- **A course is not a product** (owner, 2026-10-01): it never shows in the shop. Price `numeric(12,2)` + `currency`
  on `courses`, edited with `manage_training` only. Sold through the cart since phase D (*Academy course sales*).
- **One save per course**: `admin_save_course(jsonb)` (SECURITY INVOKER, `manage_training`) writes the course, its
  English translation and the whole tree in one transaction. Ids come from the browser; nodes are upserted by id
  and only the ids missing from the payload are deleted, so step / quiz / answer ids survive every save (phase C's
  progress rows will point at them). An id already stored under another course is refused. Money arrives as a
  decimal string. Each media slot is checked for kind (image slot ← image, video block ← video). An English field
  left empty removes that node's English row (the French text is shown).
- **Images per language** (decision 92, 2026-10-15): an image block, a video poster and a question image may have
  an English file in the node's English row (`en.media_id` / `en.poster_media_id` / `en.image_media_id` in the
  payload), for pictures that carry text; empty = the French file is shown in English too. The English row of a
  block or question is kept when it has text **or** a file, so a question row may have no English text
  (`quiz_question_translations.text` nullable since then). Covers and video files stay single-language.
- **Lifecycle** (trigger `courses_guard`): created as `draft`; `published` only when
  `course_publication_problems()` is empty (at least one module, no empty module, every image/video block has its
  file, every quiz has questions, every question ≥ 2 answers and one correct); `published_at` set once, by the
  trigger; `published ⇄ unpublished`; never back to `draft`; the slug of a course that was ever published is
  frozen; only never-published courses can be deleted (RLS). A published course stays publishable: every save
  is re-checked at commit (deferred trigger `courses_published_ready`). Saving a published course changes what
  its buyers read at once — there is no separate draft of a published course. Status, price, slug, creation and
  deletion audited.
- **Unpublished course** (owner, 2026-10-01): its buyers still see it in their space, greyed out with a "back soon"
  message, and cannot open it (enforced by the learner functions since iteration 22). Visitors no longer see it.
- **Course promotions**: `percentage` (< 100) or `amount` (< the course price) off one course between `starts_at`
  and `ends_at` (open-ended allowed); at most one active promotion per course at any instant (guard locks the
  course row, then checks overlaps); `course_current_prices` gives the price now, rounded half away from zero to
  the cent. Lowering the course price below an active amount promotion is refused. No codes, no customer
  segments. Audited.
- **Quiz answer keys**: `quiz_answers.is_correct` / `explanation` are readable by staff only. Learners get
  corrections from `answer_quiz_question()` / `submit_quiz_answers()`, after an answer is recorded (iteration 22).
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
  media of the library, nor a draft's cover; a withdrawn course's cover only to its holders (iteration 22). The webapp serves it at
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

### Academy learner access (iteration 22)

What a member reads and writes of the courses they hold (webapp `lib/progress.tsx`, `lib/learning/`), and how the
back office gives a course by hand (`/admin/formations/<id>/acces`).

```
course_entitlements (user, course, source purchase | manual_grant | bundle | promotion, order_id, granted_by,
                     note, starts_at, expires_at, revoked_at, revoked_by) — active = not revoked, started, not expired
lesson_progress  (user, course, step_id)            one row per validated step
quiz_attempts    (user, course, module_id, quiz_id, open | submitted, answers snapshot, score, pass mark snapshot)
course_completions (user, course, completed_at, average_score, min_score, certificate_code) — once per course
```

- **Entitlements**: written only by functions — `admin_grant_course(email, course, expires_at, note)` (finds the
  member by exact e-mail, course ever published, refuses an active duplicate, closes an expired one first),
  `admin_revoke_course_entitlement(id)`, both `manage_training`, both audited (`audit_logs`, table
  `course_entitlements`); `admin_course_entitlements(course)` lists holders with name, e-mail, steps done and
  completion. Phase D adds `purchase` rows (with `order_id`) when the order is paid (*Academy course sales*). Members read their own
  rows, staff all of them. Account deletion cascades.
- **Reading a course**: `learner_courses()` (SECURITY DEFINER) returns the courses the caller holds now, newest
  first: the header, the whole tree of a published course with published English translations (answer texts only —
  never `is_correct`, an answer's `explanation` nor a question's feedback), the media it uses (`training_media` id →
  storage path, kind, alt texts) and the caller's progress. A withdrawn (`unpublished`) course comes back as a
  header and cover only. The content tables keep their staff-only RLS for blocks, questions and answers.
- **Withdrawn course visible to its holders**: the `courses` and `course_translations` policies and the cover
  policies (`training_media`, translations, storage) also let a holder read their `unpublished` course
  (`private.holds_course()`, `private.can_see_course()`, `private.is_held_course_cover()`), so the member area
  can show it greyed out ("back soon"). Nothing else of it.
- **Media**: storage policy "learners read their courses' media" (`private.can_read_learner_media_path()`): the cover
  of a held course, and the block media, posters, module covers and question images of a held *published* course,
  English files included (decision 92).
  The browser signs them (`createSignedUrls`, 4 h) and keeps each address until it has less than 1 h left
  (`webapp/src/lib/supabase/signedUrlCache.ts`), so cached files are not downloaded again.
- **Progress writes** — functions only, each re-checking the entitlement and that the course is published (row lock
  on the entitlement serialises one member's writes), then the path rules of `webapp/src/lib/learning/path.ts`
  (`private.learner_path()`: each module's steps by position, then its check; required = `complete_all_steps` /
  `complete_all_quizzes`; a node is open up to the first required node not done, or when done):
  - `complete_course_step(step)` — idempotent; refused (`learning: locked`) when the step is not open.
  - `answer_quiz_question(module, question, answer)` — immediate-feedback checks only: opens an attempt if none
    (unlocked, not passed; no attempt limit since `20261007072551`; pass mark snapshotted),
    records the **first** answer to the question and returns its correction; answering again returns the recorded
    one. No probing every option before submitting.
  - `submit_quiz_answers(module, {question: answer})` — recorded answers stand, the payload fills the others,
    unanswered = wrong; score `round(correct × 100 / questions)`, pass = score ≥ snapshotted pass mark; returns
    every correction and the new progress.
  - A correction names the correct answer only when the check has `show_answers` on, or the learner chose it; it
    carries the chosen answer's explanation, the question's right/wrong feedback and its "go further" note.
- **Completion and certificate**: after each write, `private.refresh_course_completion()` inserts
  `course_completions` once — non-empty path, every required node done, average of the best check scores (checks
  attempted) ≥ `courses.min_score` (null average passes) — with the average and the minimum snapshotted, and a
  certificate code `GTC-XXXX-XXXX-XXXX` when the course issues certificates. Sticky: later course edits or a
  revocation never take it back.
- **Soft references to the authored tree** (decision 51): `lesson_progress.step_id`, `quiz_attempts.module_id` /
  `quiz_id` and the answers snapshot are plain uuids, so an author deleting a step, a check, a question or an
  answer of a published course is never blocked, and members' rows are never erased; keys the course no longer has
  are ignored by the rules.
- Suite: `tests/iteration22_validation.sql` (grants and their audit, another member refused content, answers,
  media, progress and holders list, path locking, end-of-check and immediate-feedback scoring, unlimited attempts until passed,
  completion and certificate, withdrawn course, revocation and re-grant).

### Academy course sales (iteration 23, phase D)

Migration `20261002100000_course_checkout` (applied), suite `tests/iteration23_validation.sql`.

```
course page   "Buy" → cart line {courseId} (one seat, nothing shipped; indicative price only)
cart          course in basket + visitor → sign-in asked first (the basket waits); pay disabled
edge fn       items[{course_id, quantity: 1}] → create_order(user, …)  (guest → account_required)
create_order  course published, currency, one seat, not already held (course_owned), price = course_current_prices,
              order_items.course_id, VAT `training` (billing country when nothing ships), no stock, no shop discount
payment       mark_order_paid (verified webhook) / gift cards covering everything / staff marking paid
                → trigger orders_stock_transitions_zc_courses → course_entitlements (source 'purchase', order_id)
full refund   payment_status or status → refunded → the order's purchase entitlements revoked
```

- Courses are bought in the same basket and the same Stripe session as products and gift cards (one Stripe line
  for `orders.amount_due`, see *Edge Functions*). Gift cards can pay for them.
- Already held at payment time (bought twice in parallel, granted by hand meanwhile): no second entitlement, an
  `[auto]` note in `order_notes` asks the team to refund the line. Paid without an account (cannot happen through
  `create_order()`, only by hand): note, no access.
- An expired, unrevoked entitlement is closed when the course is bought again. Purchase entitlements have no end
  date (decision 72).
- Course lines are invisible to analytics (`analytics_sale_lines` joins products — training figures stay null),
  review requests and loyalty stamps (decision 71). Parcels refuse them; `sync_order_fulfillment()` ignores them,
  so an order of courses only stays `unfulfilled` like an order of gift cards.
- Members read their course lines through the existing order RLS (`course:courses(slug)` for the link).

### Members' Lounge (iteration 25)

The community chat of `/compte/salons` (webapp `lib/communityChat/`: `liveChatStore.tsx` reads and writes through
`loungeApi.ts` only, `loungeMapping.ts` narrows the rows; the fixtures of `data/communityChat.ts` serve the mock mode
only).

```
lounge_channels       (id '<lounge>-<key>', lounge en|fr|de|es, key introductions|general|inspiration|techniques|business)
lounge_members        (user → handle, languages, presence online|away|offline, last_seen_at, is_mentor, joined_at)
lounge_conversations  (user_a < user_b, unique pair, last_message_at)
lounge_messages       (channel_id XOR conversation_id, author, parts jsonb, body_text, mention_ids, reply_to_id, reactions jsonb)
lounge_message_attachments (message, storage_path in lounge-media, alt_text, position 0–3)
lounge_reactions      (surrogate id, message, user, reaction heart|clap|sparkles|laugh|fire|gem, unique triple)
lounge_room_states    (user, channel XOR conversation, last_read_at, muted)
lounge_notifications  (recipient, kind mention|reply|reaction, message, actor, read_at; unique per recipient/message/kind)
```

- **The door** — `private.lounge_can_enter(user)`: an active profile holding an active course entitlement (any course,
  any source) or an active team member. Every policy and every `lounge_*` function checks it for the caller
  (`42501 lounge: forbidden` otherwise); losing it closes the lounge at once (reads, writes, images), the member's
  messages stay and they are flagged `active = false` in the directory. `lounge_access()` answers the question for the
  webapp (locked screen or lounge).
- **Members are never read from `profiles`** — `lounge_directory()` (SECURITY DEFINER) returns, for every member who ever
  entered: id, name shown (first name + initial of the last name; none without a first name — the webapp says
  "Membre"), handle (generated at first entry as `first.l`, accents removed, unique with a number suffix, `member`
  without a first name — migration `lounge_handle_initial`), country, lounges, effective presence
  (`offline` when the chosen presence is "invisible" or no heartbeat for 3 minutes), badge (`team` staff, `mentor`
  `is_mentor`, `new` the first 30 days), number of channel messages, titles of completed courses, `active`. No e-mail,
  phone, last name, address or avatar. `lounge_members` itself: own row only.
- **Reading** — channel messages: any member; a private conversation: its two members only (staff included in "not
  them"). Attachments are read with their message (policy on the messages, through RLS), images in `lounge-media`
  by the uploader and by whoever can read the message they are attached to; served through signed URLs (1 h).
  Reactions: own rows only — others are seen as totals on the message.
- **Writing — functions only** (no insert/update/delete grant on any lounge table):
  - `lounge_join(lounge?)` creates the member on first entry and adds a lounge to theirs; `lounge_heartbeat(presence?)`.
  - `lounge_post_message(channel | recipient, parts, reply_to?, attachments?)`: author = caller; parts = array (≤ 200) of
    `{type:'text', text}` / `{type:'mention', memberId}` with no other key, text ≤ 4 000 characters, not empty; a mention
    names a lounge member; a reply stays in its room; ≤ 4 images, each already uploaded in the caller's folder and not
    attached elsewhere; recipient = another member who can enter; the conversation is created by the first message;
    **20 messages a minute** (`PT429`). Writing marks the room read. Notifications: `mention` for each mentioned member
    who can enter, `reply` to the replied author (not when mentioned) — channels only.
  - `lounge_toggle_reaction(message, reaction)` (message readable by the caller); the totals on the message are kept
    by trigger; a new reaction notifies the author (one `reaction` row per message, renewed).
  - `lounge_mark_read(channels[], conversations[])` (≤ 50 rooms; also reads the mentions/replies waiting there),
    `lounge_set_muted(room, muted)`, `lounge_read_notifications(ids | null = all)`.
- **Unread counts** — `lounge_overview()`: per channel, messages of others after the member's `last_read_at` (else
  their `joined_at`: a new member does not inherit the history as unread) and how many mention them; per private
  conversation, the other member, unread count, mute and last message.
- **Realtime** — `lounge_messages` (INSERT, UPDATE for reaction totals) and `lounge_notifications` are published;
  Postgres Changes apply the same RLS as a read, so a subscriber only receives rooms they can read. DELETE events are
  never relied on (they are not filtered by RLS): nothing in the lounge is deleted through the API.
- **Account deletion** cascades: the member row, their messages (and their replies' links set null), reactions,
  conversations (both sides), read state and notifications.
- Not built (decision 88): editing or deleting one's own message, typing indicator, older messages beyond the latest
  100 per room, server-side search, profile editing (bio, city), back-office screen for mentors. Moderation: see
  *Members' Lounge moderation* below (decision 132).
- **Private messages closed** (decision 118, migration `lounge_direct_messages_closed`): while
  `private.lounge_settings.direct_messages_enabled` is false (the case since 2026-10-29), no conversation, private
  message or reaction to one can be written (`42501 lounge: private messages closed`) and none is readable, staff
  included. `lounge_overview()` (SECURITY DEFINER) still lists the caller's own conversations (other member, unread
  count, last message preview); the webapp ignores them (`LOUNGE_DIRECT_MESSAGES_ENABLED = false` in
  `lib/communityChat/model.ts`: no entry point, `/compte/salons/messages/…` is the 404). The trigger reads only
  the inserted table's own columns (fix `20261102173016`: a shared expression made every channel message fail while
  the switch was off). Reopening = a migration setting
  the switch to true + the flag.
- Suite: `tests/lounge_validation.sql` — the door (no course, suspended, staff), handles and directory without
  personal data, posting rules (no direct writes, reply across rooms, unknown mention, empty, unknown part, extra
  keys, too long, unknown channel), private conversations (third party and staff refused everywhere), reactions and
  their totals and notifications, overview and read state, attachments and storage policies, a revoked course, the
  rate limit, private messages closed by the switch (X1).

### Members' Lounge moderation (decision 132)

Migration `20261110124815_lounge_moderation` (**applied 2026-11-11**), webapp `lib/communityChat/moderation.ts` (pure),
`loungeApi.ts` (member calls), `useMyModeration.ts`, `lib/adminLoungeModeration*.ts`, screens `/compte/moderation`
(`screens/account/LoungeModeration.tsx`) and `/admin/salons` (`screens/admin/AdminLounge.tsx`), e-mails
`_shared/email/loungeModerationEmails.ts` (sweep `send-pending-emails`).

```
lounge_reports              (message → set null, attachment?, reporter → set null, message_author → set null, reason,
                             illegal_category, details, status open|actioned|dismissed, decision, resolved_at)
lounge_moderation_decisions (action dismiss|hide|restore|delete|mute|ban|lift, message?, target_user, reason, category,
                             ground terms|illegal, statement, ends_at, automated = false, report_count, appeal?, decided_by)
lounge_moderation_snapshots (decision → the message's text, image count, room, date as it was)
lounge_appeals              (decision, appellant, role target|reporter, body, status open|upheld|reversed, response, answered_by)
lounge_blocks               (blocker, blocked)
lounge_moderation_events    (message, room, kind hidden|deleted|restored) — Realtime only, purged after a day
```

- **Reporting** — `lounge_report_message(message, reason, category, details, attachment?)`: any member who can enter
  (a muted member too), on a visible message they can read that is not theirs; reason `illegal` (with one of ten
  categories) | `harassment` | `spam` | `personal_data` | `other`, explanation 10–2 000 characters; one report per
  member and message (`23505`), 10 an hour and 30 a day (`PT429`). Returns `{id, created_at}`, shown as the
  acknowledgement. Members read their own reports (RLS, columns without the reporter or author ids); the author of
  a reported message never learns who reported it.
- **Who moderates** — `moderate_community` (new permission, manager and admin; distinct from `moderate_reviews`:
  decisions about members and unlawful content are a separate duty). Every moderator function starts with
  `private.lounge_require_moderator()` (`42501`); moderators also read `lounge-media` (storage policy) to see the images.
- **Decisions** — `lounge_moderate_message(message, action, reason, category, ground, statement)`: `dismiss` (needs
  open reports), `hide` (the row stays, `moderation_status = 'hidden'`, served to its author only), `restore`,
  `delete` (message, attachments, reactions and notifications go; the images are queued for
  `purge-storage-objects`; the snapshot keeps the text). `lounge_moderate_member(member, action, …, until?,
  message?)`: `mute` (5 minutes to 1 year; the webapp offers 1 h / 24 h / 7 d / 30 d), `ban` (until lifted), `lift`.
  Hide, delete, mute and ban need a reason and its ground (`illegal` iff a category); every action needs a statement
  of 10–2 000 characters; `automated` is always false (CHECK). Team members cannot be muted or excluded, nor a
  moderator themself. Open reports of the message are settled (`actioned` / `dismissed`) by the decision.
- **Enforcement** — triggers on `lounge_messages` and `lounge_reactions` inserts refuse a muted (`42501 lounge:
  muted`) or excluded member; the upload policy of `lounge-media` uses `private.lounge_can_write()`; the door
  `private.lounge_can_enter()` refuses an excluded member (reads close too; `lounge_directory()` shows them
  inactive). Courses and the account are untouched.
- **Realtime** — a hidden message's UPDATE no longer passes RLS for other members, so it would not reach them: each
  decision on a message inserts a `lounge_moderation_events` row (published, readable by whoever can read the room);
  the webapp removes the message (hidden, deleted) or reads it again (restored, or the viewer's own hidden message).
- **Statement of reasons and outcome** — `pending_lounge_moderation_emails()` (service role): the decision to the
  member concerned for hide, delete, mute and ban (`lounge_decision:<id>`: decision, content copy, reason, ground,
  not automated, how and until when to contest), the outcome to each reporter (`lounge_report:<id>`, with the
  statement for a dismissal only), the answer to a complaint (`lounge_appeal:<id>`). Window: 7 days after the event.
- **Complaints** — `lounge_submit_appeal(decision, body)`: the member concerned (hide, delete, mute, ban) or a
  member whose report the decision settled; within 6 months; once. `lounge_answer_appeal(appeal, outcome,
  response)`: reversed → a hidden message is restored and a running mute or exclusion lifted (new decisions linked by
  `appeal_id`), a reporter's report goes back to the queue; a deleted message cannot come back.
- **Blocks** — `lounge_set_blocked(member, bool)`; restrictive policies hide the blocked members' messages and their
  notifications from the blocker only; unread counts ignore them.
- **Back office** — `lounge_moderation_queue('open'|'all')` (reported messages grouped, reports with reporter labels,
  author's restrictions and earlier decisions), `lounge_moderation_context(message, radius)`,
  `lounge_moderation_history(limit)` (with who decided and whether the member was e-mailed),
  `lounge_appeals_queue(...)`, `lounge_moderation_stats(from, to)` (reports by reason/category, notices from the
  contact form, decisions by action/ground, automated = 0, median handling times, complaints by outcome, open items).
- **Non-members** report through the contact form, category `illegal_content` (priority `high` by trigger): an
  acknowledgement e-mail, the ticket in the support inbox, counted in the statistics.
- **Audit** — decisions on insert (no content), report and complaint outcomes, hiding/restoring, mutes and
  exclusions (`lounge_members`, watched columns only).
- **Personal data** — `my_personal_data()` adds `community.reports`, `moderation_decisions` (with the content copy),
  `complaints`, `hidden_members` (handles). An erasure unlinks through the foreign keys; triggers then drop the
  content copy of decisions about the erased member, the explanation of their settled reports and the text of
  their complaints (`erase_account()` itself is unchanged). The nightly purge strips the texts 12 months after the
  decision and deletes the rows after 3 years, never while a complaint is open or a report is open.
- Suite: `tests/lounge_moderation_validation.sql` — permission matrix, reports (acknowledgement, duplicates, own
  message, invalid reasons, rate limit, no direct insert), reports read by their author only, members and a viewer
  refused everywhere, queue and context, hiding (not read by others, author's file, event, audit without content,
  e-mails pending), mute and exclusion on every write with courses untouched, team protected, complaints (third
  party, too late, twice, reversed restores, reporter's reopens the report), deletion (images queued, copy kept),
  blocks, the export, an erasure, the contact category, counters, the purge.

### Reminder e-mails (decision 142)

Four automatic e-mails swept by `send-pending-emails` (every 5 minutes) on the same pipeline as the
other business e-mails: `pending_*` decides, the `email_log` claim sends exactly once
(`_shared/email/reminderEmails.ts`).

| E-mail (template, event key) | Who, when | What it shows |
| --- | --- | --- |
| `abandoned_cart`, `abandoned_cart:<order id>` | An order cancelled because its payment was abandoned (`expired`, `payment_step_left`; never `checkout_failed`, `free_order`, `payment_failed` or staff), `abandoned_cart_delay_hours` (3) to 48 h after `cancelled_at`; the customer's **latest** order (no later order of any status for the same address or account); **marketing consent only**: a member with `profiles.marketing_opt_in`, or an address `subscribed` to the newsletter — a guest who only typed an address gets nothing; none in the last 30 days to the address | The products still on sale (name, option, picture, link to the product page; no price — the snapshot may be stale, decision 129; gift cards and courses never shown), a button to the cart page |
| `review_request`, `review_request:<order id>` | A member's paid order (not refunded, even in part), every non-cancelled parcel `delivered`, the last one `review_request_delay_days` (5) to 30 days ago, no withdrawal on it, at least one product **of a delivered parcel** (shipment lines) not reviewed yet; none in the last 30 days to the address | Those products, each linking to its page's reviews (`#avis`), where the verified-buyer rule of *Reviews* applies |
| `course_review_request`, `course_review_request:<course_completions id>` (decision 141 addendum, migration `20261113160000_course_review_request_email`) | A learner who **completed** a course `course_review_request_delay_days` (3) to 30 days ago and may review it (`private.course_review_refusal()` null: course published, account active, entitlement active) without having done so; none in the last **7** days to the address (two courses finished the same week: one e-mail each, a week apart) | The course (cover, title) and a button to its page's reviews (`#avis`, `/fr/academy/formation/<slug>` or `/en/academy/course/<English slug>`), where a learner who finished it writes one once signed in |
| `loyalty_reward`, `loyalty_reward:<card id>` | A member's card `completed` `loyalty_reward_delay_days` (7) to 60 days ago, programme active; one per member (oldest card), none in the last 60 days to the address. A reward held by an unpaid order is `redeemed`, so it does not count | Button to the cart (where the reward is ticked), link to `/compte/fidelite` |

- **Opt-out, one per address for the four kinds:** each e-mail carries
  `/rappels/desinscription?token=…` in the footer (the layout's marketing wording) and a `List-Unsubscribe`
  header (no `List-Unsubscribe-Post`: the target is a page, and the opt-out happens on its button, never on a
  visit — mail scanners open links). `email_reminder_preferences` keeps the sha256 of the address
  (exactly `email_log.recipient_hash`), the token and `opted_out_at`; order e-mails are not affected.
  `unsubscribe_email_reminders` is `SECURITY DEFINER` and callable by visitors on purpose (accepted advisor warning,
  like `newsletter_confirm`): it only acts on the row of a 192-bit bearer token and answers a boolean.
- **Switches** (`private.email_reminder_settings`, no back-office screen): **every kind is off** until the
  opt-out page `/rappels/desinscription` is live in production (Vercel builds production from `main`). To switch on:
  `update private.email_reminder_settings set abandoned_cart_enabled = true, review_request_enabled = true, loyalty_reward_enabled = true, course_review_request_enabled = true;`
  (each one separately if wanted; delays in the same row). On 2026-11-13 nothing on the project qualified
  (delivered parcels older than 30 days, no full card, no recent abandoned payment with consent): switching on
  sends no backlog.
- A parcel's delivery is set by staff (`set_shipment_status`): parcels left `shipped` never trigger a review request.

### Back-in-stock alerts (iteration 26)

```
browser  request_back_in_stock_alert(product, variant?, email?, locale)        visitor or member, product page
           → product active (not a gift card); its option when it sells options (variant_required otherwise)
           → the target's stock row must be out_of_stock NOW (in_stock otherwise: the page may be stale)
           → member: the account's address (the typed one is ignored); visitor: the typed one, checked
           → already waiting for that address and target: {ok: true}, nothing added (no enumeration)
           → throttle: 10 new requests / hour per account or network address, 30 waiting per address
           → back_in_stock_requests row → {ok: true}
pg_cron  send-pending-emails (every 5 minutes) → pending_back_in_stock_emails()
           → waiting requests whose target is sellable again (stock row not out_of_stock, or none),
             product / option still on sale, e-mail still open in email_log; oldest first
           → template back_in_stock, event key back_in_stock:<request id> (exactly once), product card
             (picture from product-media, name in the request's language) + button to the product page
email_log row sent / delivered / opened / bounced / complained
           → trigger email_log_close_back_in_stock → request notified_at: closed, never sent again
```

- One request = one e-mail, ever. A product that comes back and sells out again before the sweep simply waits for
  the next restock. Once notified, the same address may ask again (a new request, e.g. the next time it runs out).
- No time window (the other sweeps look 7 days back): the stock at sweep time decides, however old the request.
- Nobody reads the table through the API. Staff with `manage_products` read it through
  `admin_back_in_stock_requests()` (screen `/admin/alertes-stock`, read-only: no cancel or delete).
- Suite: `tests/back_in_stock_validation.sql` — visitor request and refusals (bad address, in stock, option missing
  or in stock, unknown product), idempotent second request, no read for anon or members, member address enforced,
  nothing pending while out of stock, pending after the restock, closed once sent and never pending again, a new
  request after a notification, the throttle, the staff read (visitor, customer and viewer refused, manager reads).

### Quick stock change (iteration 27)

```
/admin/produits  "Restock" button (row, option row, preview drawer, menu)  → pop-up
                 add the units received (+10/+25/+50/+100)  or  type the exact count on the shelf
browser          admin_adjust_stock(product, variant | null, delta, expected?)   one call per stock row changed
                   → manage_products, else 42501
                   → quantity_on_hand + delta in one UPDATE (relative: a sale paid meanwhile is kept)
                   → expected given and the shelf moved: 40001, nothing written (the pop-up reloads the product)
                   → never below quantity_reserved, never on an untracked row
                   → inventory_movements 'adjustment' with the actor (ledger trigger)
                 then the product is read again; the back-in-stock sweep sees the new stock like any other
```

- The edit form still writes the absolute count through `admin_save_product()`; the pop-up is the safe path for
  day-to-day restocking.
- Suite: `tests/stock_adjustment_validation.sql` — visitor, customer and viewer refused; a manager adds to a product
  and to a variant with a sale in between kept; the ledger row; a stale exact count refused and a fresh one applied;
  never below the reserved units nor zero; product with variants, untracked row, variant of another product,
  unknown product and zero change refused.

### Kits and packs (decision 117)

```
/admin/produits/<id>  "Kit contents" section: switch on, pick products (drafts offered), an option for a
                      product sold per option, units per kit → "Calculated stock: N kits (limited by …)"
browser               admin_save_product() (the kit's count never sent: threshold only)
                      → admin_save_product_bundle(product, [{product_id, variant_id, quantity}])   [] = no longer a kit
                      → kit's inventory_items row = min(⌊(on hand − reserved) ÷ units per kit⌋) over its components
storefront / alerts / recommendations / statistics read that row like any product's stock
checkout              create_order(): a kit line reserves each component (units × kits, conditional update,
                      P0001 "insufficient stock" otherwise) and copies the composition (order_item_components)
any stock change      component rows move → deferred trigger at commit → kits holding them recomputed
paid / expired / refunded with restock → the snapshot's components move (private.order_stock_lines / refund_stock_lines)
```

- A kit's row: `quantity_reserved` 0, tracked when a component is (an untracked component limits nothing unless
  marked out of stock; a component without a stock row makes the kit unavailable). Writing its count, tracking or
  availability is refused (22023, hint `bundle`): the quick restock and "mark out of stock" are not offered for a kit.
- The refresh runs at commit under one advisory lock, reading committed stock in a new statement: a kit sale and a
  component sale in parallel neither deadlock on the kit row nor leave it stale (checked with two sessions on a
  local stack). It is a display value; overselling is prevented by each component's conditional reservation.
- Rules: no option on a kit; no kit in a kit; a product sold per option enters a kit through one option; a product
  held whole by a kit cannot gain options; a component cannot be deleted while a kit holds it (23503); a product whose
  own units are held by unpaid orders cannot become a kit (55006, hint `reserved`).
- Back to an ordinary product: composition removed, its count set to 0 (to restock).
- Suite: `tests/product_bundles_validation.sql` — refusals (visitor, customer, viewer), derived count, a component
  sold alone lowers the kit, the kit's row not writable, reservation of the components with a mixed basket and
  oversell refused, snapshot readable by its owner only, payment after a composition change sells the snapshot,
  refund with restock, cancellation, options, reserved units, back to a product, public reads.

### Packs: included access (decision 139)

Migration `20261108170000_product_inclusions`, suite `tests/product_inclusions_validation.sql` (P1–P11).

```
/admin/produits/<id>  "Included access": a course, and/or a Studio plan for N months (1–24)
                      → admin_save_product_inclusions(product, [{kind, course_id} | {kind, studio_plan, studio_months}])
storefront            product_inclusions read with the catalogue (active products only) → "Included in the pack" block,
                      one per line, cart asks to sign in, and the course waiver when the pack opens a course
edge fn               create-checkout-session: a product granting a course (productsGrantCourse) is treated like a course
                      line — account_required, course_consent_required, waiver recorded before create_order()
create_order          the kit mechanism (decision 117) reserves the articles; order_items triggers refuse a guest (message
                      "a course requires a customer account", mapped to account_required), a quantity ≠ 1, an unpublished
                      included course (P0002), and copy the inclusions into order_item_inclusions
payment               orders_stock_transitions_zd_inclusions (after _zc_courses, before orders_zz_move_admin_note):
                        course → course_entitlements source 'bundle' (nothing when already held: sold anyway, no note)
                        studio → studio_access_grants: plan, from now (or the end of an open grant of the same plan) + N months
full refund           bundle entitlements and grants of the order revoked; a partial refund keeps them
Studio                a running grant is a source of access in every check; the best tier wins over a subscription;
                      state `granted` (no Stripe subscription active), `grant_ended` afterwards; no 48 h trial once a grant exists
```

- The pack is an ordinary product with a kit composition: the GLOBAL™ PRO MASTER PACK holds one GLOBAL™ PRO
  STUDIO KIT, so it sells only while a professional kit does, and selling either lowers the other. While the
  pack holds it, the professional kit cannot become a kit itself (no kit in a kit, decision 117).
- Members read their grants; `view_statistics` staff read all. Nobody writes them but the trigger.
- An erased account loses its grants (CASCADE); the order keeps the sale.

### 3D Studio trial and access (iteration 28)

```
/studio-3d/atelier   signed out            → "sign in to start your free trial"
                     studio_access_state() → not_started  → trial invitation → start_studio_trial()  (explicit, once)
                                           → trial_active / subscribed / staff → the editor (+ time left)
                                           → trial_expired / subscription_ended → locked screen + plans
                                           → subscription_pending → "being set up", check again
writes               creations / gem_groups / studio-thumbnails INSERT·UPDATE → has_studio_access(), else 42501
                     (the editor maps 42501 to the locked screen; the scene stays in the tab and its local draft)
reads, deletes       always the owner's: the work done during the trial is kept
```

- The clock is `now()`: the browser counts down from `server_now` on a monotonic clock, so the device clock,
  storage or a direct URL cannot extend or restart a trial. Status is derived, never stored.
- Subscriptions (decision 94, iteration 29):

```
plan button (locked screen, /studio-3d, /fr/studio-3d/abonnement)   signed out → sign-in, then straight on
  → the checkout page /studio-3d/paiement?plan=…&interval=…&from=<surface> (signed-in members only: gateFor)
  → POST functions/v1/create-studio-subscription {plan, interval, locale}
                                                  (member token; no price id or amount accepted)
      terms accepted? no blocking subscription (active/trialing/past_due/unpaid/paused/incomplete) → else already_subscribed
      price = studio_plan_prices(plan, interval, active) → else plan_unavailable
      customer = stripe_customers, else created once (idempotency key studio-customer:<user>)
      the customer's other open Studio Checkouts are expired
      Stripe Checkout Session, ui_mode custom, mode subscription, expires in 60 min, metadata +
        subscription_data.metadata {kind: studio_subscription, user_id, plan, interval}
      → {status: payment, client_secret, publishable_key, amount, currency, expires_at}
  the page shows the payment step (StudioPaymentStep: the shop's StripePaymentForm, Payment Element)
      beside the form, unticked by default: the request for immediate access; Pay without it → the box is focused
  Pay → POST functions/v1/create-studio-subscription {consent_client_secret}
      the session must be open, kind studio_subscription and this member's (else invalid_request / checkout_closed)
      the request is recorded: consent_records studio_immediate_access, version studio-withdrawal-2026-10,
      its id + version merged into the session's metadata → {status: consented}
      only then the browser confirms the payment with Stripe (checkout.confirm, redirect if_required)
      paid on the page → the editor /studio-3d/atelier?subscription=success; a 3-D Secure redirect comes back to
      the same address (return_url)
  leaving the page unpaid ("Change plan" → back to the plans) → POST {release_client_secret}: the session is expired
  Stripe → stripe-webhook   customer.subscription.created/updated/deleted, invoice.paid/payment_failed,
                            checkout.session.completed (mode subscription)
      verified + deduplicated like every event; subscription READ BACK from Stripe (order-independent, replay-safe)
      metadata kind ≠ studio_subscription → ignored
      apply_studio_subscription(…) → studio_subscriptions; invoices → record_studio_invoice(… billing_reason)
      unknown account / price → stored as failed (acknowledged); Stripe unreachable → 500, retried
  first invoice paid → send-pending-emails (≤ 5 min) e-mails studio_subscription_confirmation: plan, first
      payment and, word for word, the request accepted with its date (the durable confirmation)
  /compte/studio within 14 days of the first payment → studio_withdrawal_quote() → "Withdraw" → POST functions/v1/studio-withdraw {}
      request_studio_withdrawal(user, Stripe period) → cancel at Stripe (no proration) → refund the rest
      (metadata kind studio_withdrawal) → refund.* webhook → settle_studio_withdrawal_refund(); e-mail at once
  back on ?subscription=success → the page re-reads studio_access_state() every 3 s (60 s) until `subscribed`
/compte/studio  plan, billing, renewal / end date, payment to fix, then managed on the page (decision 112)
                → POST functions/v1/studio-manage-subscription {action: overview | preview | change | cancel |
                  resume | card_start | card_saved} (member token; plan + interval only, price from the database)
                  switch prorated like the portal was (interval switch invoiced now, pending_if_incomplete,
                  3-D Secure on the page), card through a setup-mode Checkout Session, Stripe's invoice PDFs,
                  cancel at period end / keep; changes come back through the webhook
```

  Cancelling in the portal keeps `active` with `cancel_at_period_end`: access lasts until `current_period_end`,
  then `customer.subscription.deleted` (status `canceled`) — and even without that event the period end alone
  closes access (`studio_subscription_active()`). `studio-billing-setup` (internal secret, **test mode only**)
  creates the Products, the six Prices (lookup keys `studio_<plan>_<interval>`, VAT inclusive), the portal
  configuration and the `studio_plan_prices` rows; its `smoke_subscribe` / `smoke_cancel` actions run a test-mode
  subscription with Stripe's test card without a browser, and `webhook_events` adds the subscription events to
  the test-mode endpoint. Verified end to end on the project on 2026-10-18 (subscribe → `subscribed`, invoice
  `subscription_create`; cancel at period end → still `subscribed`; cancelled → `subscription_ended`).
- Back office: `/admin/statistiques` aggregates both tables in the browser (`lib/adminStudioTrials.ts`); the
  rest of the funnel is in PostHog (`docs/studio-trial-analytics.md`).

### 3D Studio collections (iteration 30)

```
studio_collections            id, user_id (= auth.uid(), not writable), name (1–40, trimmed, unique per owner
                              ignoring case), color (null | blue | fuchsia | emerald | amber | ink), timestamps
studio_collection_creations   (collection_id, creation_id) primary key, user_id; insert / delete only
  collection side             FK (collection_id, user_id) → studio_collections (id, user_id) ON DELETE CASCADE
  creation side               FK creation_id → creations ON DELETE CASCADE + RLS: the creation is the caller's
writes                        INSERT / UPDATE collections, INSERT memberships → owner + has_studio_access(), else 42501
reads, deletes                the owner's, whatever the access (like the designs)
```

- Many-to-many: a creation sits in any number of collections. Deleting a collection removes its memberships
  only; deleting a creation removes its memberships. `creations` itself is unchanged (no column, no constraint).
- Validated by `supabase/tests/studio_collections_validation.sql` (C1–C7: visitor refused, no access refused,
  owner organises, another member reads and writes nothing and cannot link across owners or forge the owner,
  cascades, after the trial read / take out / delete only, staff organise their own only).
- The webapp reads both tables in one go with the library (`supabaseRepository.ts` `collections`) and keeps the
  memberships beside the creations in the workspace store (`collections.ts`).

### 3D Studio templates (decision 97)

```
staff (manage_content)  CreationDetail "Publish as a template" → studio_set_template(id, true)   own creation only
                        "Remove from templates" (detail, or the template's dialog) → studio_set_template(id, false)  any template
member with Studio access   /studio-3d/atelier/modeles → studio_templates()   (newest first; 42501 without access)
                            renders → storage policy: published templates' thumbnail_path only
                            "Use this template" → studio_use_template(id) → a new creation owned by the caller
                                                → render copied to <caller>/<new id>.jpg (best effort)
```

- Templates are live, like share links: the author's later saves show at once; deleting the creation (or the
  account) removes the template. Members' copies are their own designs and stay.
- Members never read a staff `creations` row: the only way in is `studio_templates()`, which leaves out the
  owner, the favourite flag and the opening dates, and drops Gem Group references (they point at the author's groups).

- Since 2026-10-19 (decision 98, migration `20261019062619`) the member chooses how My Creations is laid out —
  grid with the collection bar, or folders (the explorer) — and the choice is stored in `studio_preferences`
  (one row per member, written by upsert, owner-only, not gated by Studio access). Validated by
  `supabase/tests/studio_preferences_validation.sql` (P1–P5).

### 3D Studio Glowbook (decision 99)

```
member with Studio access   /studio-3d/atelier/glowbook → studio_save_showcase(handle, name, bio, instagram)   new page → pending
                            My Creations → a creation's detail → "Add to my Glowbook" → studio_showcase_add(id)  pending
                            order: studio_showcase_reorder(ids); remove an item / delete the page: DELETE (any time, at once)
moderator (moderate_reviews) /admin/glowbook → studio_showcase_queue() → studio_moderate_showcase[_item](…, approved|rejected, note)
anyone                      /fr/glowbook/<handle>, /en/glowbook/<handle> → studio_public_showcase(handle)  (server, every request)
                            renders: signed with the publishable key through "anyone reads public Glowbook renders"
                            a card → /studio-3d/glowbook/<handle>/<item> → studio_public_showcase_creation(handle, item)
                                     read-only 3D viewer + the design's shop items, added to the cart in one click
look (decision 100)         /studio-3d/atelier/glowbook "Customise my page" → studio_save_showcase_look(jsonb)
                            colour, background, layout, spotlight, city → live
                            picture (glowbook-media/<user>/<kind>-<uuid>.jpg, framed in the browser) / link → pending_changes
                            moderator → studio_moderate_showcase_changes(user, approved|rejected, note) (or approves the page)
sections (decision 102)     /studio-3d/atelier/glowbook "Sections of my page" → studio_save_showcase_section(id|null, name),
                            studio_reorder_showcase_sections(ids), DELETE (any time); each creation's row → studio_set_showcase_item_section
                            public: chips "All" + sections holding an approved creation; creations without a section always shown
badge (decision 102)        private.glowbook_certification(user) ← course_completions with a certificate_code (database only)
                            public page: "certified artist" + course titles; studio_set_showcase_certification(bool) hides it
QR / poster (decision 102)  approved page only: QR of /fr|en/glowbook/<handle> (UI language) → PNG, or A4 PDF poster drawn in the browser
spotlight video (dec. 103)  Studio tab (useSpotlightRecorder) → studio_spotlight_video_state() missing or stale → turntable on a hidden
                            stage → glowbook-videos/<user>/spotlight-<item>-<uuid>.mp4|webm → studio_set_spotlight_video(item, path,
                            type, 4|6|8 s, creation updated_at); public page: look.spotlight_video while current, else the still
```

- Public = page approved **and** item approved **and** the author has Studio access now (trial, subscription or
  staff, `private.studio_user_has_access()`); otherwise the page answers 404 and the renders cannot be signed.
- Moderation happens before the first publication. An approved creation stays live: the author's later saves are
  public at once (the editor and "Edit details" warn before saving, as they do for a published template). Name,
  bio and Instagram edits of an approved page are live too; a new handle (a new address) and anything re-sent
  after a rejection go back to `pending`. A moderator can reject what is already public (take-down), with a note
  the artist reads.
- Deleting a creation removes its item; deleting the page removes its items, never the creations.
- Sections, badge and QR poster (decision 102): validated by G10–G12 of `tests/studio_glowbook_validation.sql` (owner
  writes, refusals for anon / a member without access / another member, the composite key, only sections with an
  approved creation public, the badge as titles only and hidden by its owner, the plan switch closed).

### 3D Studio social exports (decision 101)

```
member with Studio access   My Creations → a creation's detail → "Create a post" (dialog, lazy loaded)
                            studio_share_branding() → {tier, logo_path, has_logo}        (42501 signed out)
                            the design rendered on a hidden offscreen stage (its own store and engine) in the browser:
                              HD still PNG / JPEG, 360° video (MediaRecorder: MP4 when the browser records it, else WebM),
                              Story 1080×1920, square 1080×1080, portrait 1080×1350
                            handed to the system share sheet or downloaded — nothing is uploaded or published
logo (artist, atelier)      re-encoded to PNG ≤ 1024 px in the browser → studio-share-logos/<user>/logo-<uuid>.png
                            → studio_set_share_logo(path) (previous file removed by the page);  removes (always)
```

- What each tier gets: essential (and the trial, and a member without access) — the Global Toothgems watermark,
  always; artist — their logo, the watermark or nothing; atelier — the same plus the layout templates (code:
  `webapp/src/lib/studio3d/socialExport/layouts.ts`, versioned pure functions; no table). Active staff = atelier.
- **What the server guarantees, and what it does not**: the tier and the logo entitlement (upload, record and read
  of a logo need artist / atelier; a member who left the plan keeps the row but can no longer read the file, and
  can always remove it). The watermark and the templates are drawn by the browser: a determined member could take
  the watermark off their own copy. A server-side render would be needed to truly enforce it (not built: decision
  101 (b)).
- Validated by `supabase/tests/studio_share_branding_validation.sql` (B1 visitor, B2 tier resolution incl. past_due,
  highest plan, staff, ended access, B3 essential and trial refused, B4 artist own folder only, B5 another member
  reads and records nothing, B6 after the subscription ends: no logo returned or readable, removal still allowed).
- **No list of networks** (owner's choice 2026-11-06, replacing the per-network buttons of the 2026-10-21
  addendum): the dialog ends on "Share…" (`navigator.share({ files })`, where the browser accepts the file — the
  member picks the app) and "Download"; the member posts from their own app. The editor's Share menu and the share
  dialog offer the render through the share sheet and the read-only link to copy (or to send through the share
  sheet), no network page. Preview cards: `/studio-3d/partage/<token>` and `/studio-3d/glowbook/<handle>/<item>` render `og:image` /
  `twitter:card` on the server (`serverSharePreview.ts`, publishable key; renders signed for 7 days), still
  `noindex`. Suite B7: a visitor reads the preview and the render of a shared creation only, nothing once revoked.

### 3D Studio smile try-on with AI (decision 111)

```
artist (own creation)       creation detail / editor Share menu → "Try on a smile"   source {creation_id}
visitor                     /studio-3d/glowbook/<handle>/<item> or /studio-3d/partage/<token> → "Try it on my smile"
                            (shown only when studio_public_showcase_creation / studio_shared_creation say try_on = true;
                             never for a design carried in a link's fragment)       source {handle,item_id} | {token}
dialog                      photo + consent → POST functions/v1/studio-try-on {"action":"status"} → {available}
                            → "Generate the AI render" (sign-in required; disabled while available = false)
1. analysis                 multipart action=analyse: source, photo (≤ 6 MB)
                            → token → studio_try_on_creation(requester, ref) → scene (≥ 1 gem) + allowed (owner's switch)
                            → daily requests cap (TRY_ON_DAILY_CHECKS, default 30) → row 'pending'
                            → photo check (photoCheck.ts, TRY_ON_CHECK_MODEL; read twice, the strictest reading decides)
                              refused: row 'failed' / 'photo_unsuitable', 422 with the reasons
                            → mouth close-up (crop.ts: the check's teeth_box widened to the lips, at a model proportion)
                            → teeth (teeth.ts, TRY_ON_TEETH_MODEL, default the check model): one box per visible tooth
                              with its FDI number → row 'failed' / 'analysis' (never a render)
                            → 200 {crop, teeth}
2. placement (browser)      tryOnRegistration.ts: the Studio's reference dentition (frontView.ts, real mm) fitted on
                            the teeth (one similarity on the biting-edge centres, outliers set aside), each gem on its
                            own tooth, physical size; unreliable (confidence < 0.6 or < 3 teeth agreeing) → the dialog
                            asks for another photo (placement_uncertain), nothing rendered
                            tryOnGuide.ts + placementGuide.ts: each gem drawn as a flat mark (cut, colour, turn) on the
                            close-up — only gems on teeth found on the photo (the others counted as left out)
3. render                   multipart: source, photo, design (the 3D still, designImage.ts), guide (JPEG), crop, marks
                            → same gates, renders cap (TRY_ON_DAILY_LIMIT, default 10) → row 'pending'
                            → Gemini (Vertex AI via GOOGLE_ADC_JSON, or GEMINI_API_KEY), GEMINI_IMAGE_MODEL,
                              systemInstruction = systemPrompt.ts TRY_ON_SYSTEM_PROMPT ("v4"): IMAGE 1 the guide,
                              IMAGE 2 the same close-up cut by the function, IMAGE 3 the design, then up to 6
                              reference pictures (bucket studio-try-on-references); text: how many marks, then the
                              GEM LIST (gems.ts: what each kind of gem of the STORED design really is — faceted
                              crystal and its cut and coating, or polished gold charm — with its shop name and colour)
                            → row 'generated' / 'failed' → 200 {image, crop}
                            → the browser lines the answer up with the close-up (tryOnAlign.ts) and pastes it back
                              into the photo (tryOnComposite.ts, pasteBack.ts) → before/after, download, share
```

- **The gate is the creation owner's plan**, never the viewer's: `private.studio_try_on_allowed(owner)` — since
  2026-10-26 (decision 111 (a), migration `20261026164042_studio_try_on_atelier_only`) the highest plan only:
  `studio_user_tier(owner) = 'atelier'` (an active Atelier subscription, or active staff); trial, Essential and
  Artist owners no longer offer it (their own editor button gets `not_allowed`). The requester must be signed in.
  The flag reaches the viewers through the two public readers (no owner id); the function checks it again.
- **Daily allowance shown** (2026-10-26, owner's request): the status call (`{"action":"status"}`) also answers
  `daily_limit` and, with a member's token, `quota` — `{limit, remaining}` renders over the last 24 hours (0 once
  either cap, renders or checks, is reached), `{unlimited:true}` for an active administrator, null for a visitor
  or when it cannot be read. The share / Glowbook viewer shows it under "Try it on my smile" and turns the button
  off at 0 (`lib/studio3d/useTryOnStatus.ts`, `components/studio/tryOn/TryOnAllowance.tsx`). Display only: every
  render is counted again.
- **Not connected yet**: without both secrets the function answers `{available:false}` and `not_available` (503)
  before reading anything, and the dialog says the render is coming and sends nothing. Connecting it (owner's
  Google policy, 2026-10-25: no API key, Application Default Credentials only) = `GEMINI_IMAGE_MODEL=<model id>` +
  `GOOGLE_ADC_JSON=<content of a service account key (type `service_account`, since 2026-10-28, the dedicated
  account with the Vertex AI User role; the function signs a JWT and trades it for a token, no
  `x-goog-user-project`) or of the file written by gcloud auth application-default login>` (optional
  `GOOGLE_CLOUD_PROJECT`, default the file's `project_id` / `quota_project_id`; `GOOGLE_CLOUD_LOCATION`, default `global`): the
  function trades the refresh token for a short-lived access token (cached until it expires) and calls Vertex AI
  with `x-goog-user-project`. These are a **person's** credentials (the owner's Google account, scope
  cloud-platform): fine to start, but they stop working if the account's password changes or the token is revoked
  (`invalid_grant` in the logs → log in again and reset the secret), and an organisation's session policy may
  expire them. For production, prefer an identity that is not a person (a service account used from Google Cloud,
  e.g. a small Cloud Run relay, or Workload Identity Federation) — decision 111 (j). A Gemini API key still works
  (`GEMINI_API_KEY`) where allowed. The request format (`supabase/functions/studio-try-on/gemini.ts`) is
  to confirm against the provider with real renders (the key is connected since 2026-11-06).
- **Reference pictures**: uploaded by the owner in the dashboard to the root of the private bucket
  `studio-try-on-references` (JPEG / PNG / WebP, 10 MB; the first 6 by name are sent, 8 MB in all — a picture that would pass it is
  skipped — cached 10 min per instance; Google's inline request limit is to check when connecting). No storage policy: only the service role and the dashboard see them.
- **Prompt** (`supabase/functions/studio-try-on/systemPrompt.ts`, `TRY_ON_SYSTEM_PROMPT`, the "v4" of decision
  111 (k)): the gems are already placed as flat marks; the model turns each mark into a real gem at the same place,
  size and turn, keeps everything else of the photo, takes cut and turn from the 3D design (IMAGE 3) and each gem's
  material from the GEM LIST (2026-11-02: renders came out plastic like the 3D preview — the reference bucket was
  empty, so the model's only material cues were the preview and the flat marks; the prompt now says both look like
  plastic and must never be copied, with sharper crystal and gold cues). Product photos of the gems were sent as
  images for a few hours the same day, then dropped (owner's decision: a design can hold many different gems, too
  many images for the model's input) — the gem list is text only. The former prompts v1 (the owner's original) and v3 (where the model
  placed the gems itself from the design render, a flat map, the gems' seats as text and a scale read from the
  photo), the `TRY_ON_PROMPT_VERSION` and `TRY_ON_MOUTH_CROP` secrets, the close-up gem-spot check and the progress
  stream were removed on 2026-11-01 (owner's decision after the trial: computed placement clearly better); commit
  `7ba69d1` holds them. Output size is the model's default; the render asks for the close-up's proportions
  (`imageConfig.aspectRatio`, asked again without it if the model refuses).
- **Photo check** (2026-10-26, owner's request: no user manipulation, as little friction as possible): before any
  render, a small text model (`TRY_ON_CHECK_MODEL`, `gemini-3.1-flash-lite` by default, same door as the image
  model) reports facts as JSON — teeth visible, covered, the box around the visible teeth, sharpness, light — and
  `photoCheck.ts` `judgePhoto` decides with fixed thresholds, never the model: refused only for a clear reason
  (`too_far`: the teeth span less than `MIN_TEETH_SPAN` = 0.25 of the photo's longer side, a first estimate to tune
  with the logged spans; `not_frontal`: a three-quarter or steep view, or an upper central incisor not facing the
  camera — a slanted smile loses its middle line and the image model puts the gems on the wrong teeth and adds some,
  2026-10-26; only `frontal` passes — `slightly_turned` was let through at first and still gave wrong renders, so
  the owner tightened it the same day; `no_teeth`, `teeth_hidden`, `too_dark`, `too_bright`, `blurry`); a fact the model did not
  give clearly is not held against the photo, and a check that fails (provider, model id) never blocks the render.
  A refused photo answers 422 `photo_unsuitable` with its reasons, is recorded with that error code and does not
  count toward the renders (`TRY_ON_DAILY_LIMIT`), only toward every request (`TRY_ON_DAILY_CHECKS`, default 30). Active administrators (`profiles.role = 'admin'`, owner's decision 2026-10-26, to test freely) have no daily limit; their requests are still recorded.
  The browser asks for a close-up first (photo step), refuses locally only a photo far too dark to see a tooth
  (`tryOnPhoto.ts` `checkPhotoLight`), and lists the reasons with what to change.
- **Computed placement** (decision 111 (k), 2026-11-01, owner's request: the gems' places predictable, the image
  model only making them realistic; `docs/studio-try-on-computed-placement.md`). Built step by step for staff with a
  diagnostic, a comparison and a drift check, evaluated on the owner's photos (`webapp/scripts/try-on-trial/`), then
  made the only try-on the same day (owner's decision): one "Generate" button for everyone the owner's plan allows,
  the staff tools removed. **Gem size is physical** (owner's decision): real millimetres × the fitted scale.
  Since 2026-11-03 (owner's trial, drops drawn on the lower lip) a lower tooth cut by the upper teeth gets its biting
  edge 2 mm above its box (`LOWER_OVERBITE_MM`, a first value), and a gem outside its tooth's visible box is left out
  and counted, never drawn on a lip or a gum (browser only, no function change).
  Since 2026-11-04 (owner's go-ahead; no manual adjustment of the gems, owner's decision): the lower arch gets its own
  vertical offset in the fit (an open mouth no longer sets the lower teeth aside), each arch's tooth numbers are also
  tried one tooth to either side and replaced only when clearly better, the analysis answers the photo check's
  central incisors box (`centrals`, close-up pixels; function change) as the midline the browser checks against,
  only the gems are taken from the AI's answer (the rest of the photo stays the customer's, `tryOnGemBlend.ts`),
  and the browser sends facts-only analytics events (`studio_try_on_*`). Details in
  `docs/studio-try-on-computed-placement.md`.
  Since 2026-11-05 (review of the trial of that day: a quarter of the upper gems on a neighbouring tooth, the teeth's
  boxes moving by up to a tooth between analyses of the same photo): the midline check also runs on the wide central
  incisors boxes the check model draws and a mismatch makes the placement uncertain; `TRY_ON_TEETH_READINGS`
  (function, 1 by default) can merge several readings of the teeth, to measure on a trial.
  A placement the teeth do not support (`RELIABLE_CONFIDENCE` 0.6, at least three teeth agreeing — first values)
  asks for another photo rather than rendering a guess (decision to confirm with the owner). An analysis is counted
  against the daily requests, never the renders (`failed` / `analysis`; rows of the trial carry `diagnostic`). The
  render trusts the browser's guide and crop (validated: a JPEG, a crop inside the photo, 1–200 marks): at worst a
  member edits their own photo within their own render quota. Deployed from a pinned commit (see the change log
  `docs/studio-try-on-changelog.md`); until version 33 (2026-11-02) version 32 still served the former AI placement
  to the site's new requests, which is where some plastic-looking renders came from.
- **Privacy**: the photo and the image only pass through the function's memory (never stored, never logged);
  `studio_try_on_requests` keeps who asked, for which creation, from where, and the outcome — no picture. The
  photo step says the photo is sent to Google only while the AI is connected. Since 2026-11-05 the browser keeps
  each run's photo, analysis and result in its own IndexedDB (24 h at most, the signed-in account's only, erased
  on sign-out; `webapp/src/lib/studio3d/tryOnLocal.ts`) so a closed dialog, a reload or a phone gone to sleep does
  not lose the render; nothing of it reaches the server again.
- Validated by `supabase/tests/studio_try_on_validation.sql` (T1 owner's access decides, T2 flags on the public
  readers without the owner id, T3 the function's door: one reference, own creation only, active token, approved
  Glowbook item, T4 service role only, T5 requests readable by their author only, bucket private without policy)
  and `deno test` in `supabase/functions/studio-try-on/`.

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

### 3D Studio plans: what each one includes (decision 113)

```
                 Essential   Artist   Atelier     enforced by
saved creations  15          150      unlimited   creations_plan_limit trigger (GTL01)
Gem Groups       3           30       unlimited   gem_groups_plan_limit trigger (GTL01)
post signature   watermark   logo     logo        private.studio_user_tier() (decision 101)
post layouts     -           -        yes         browser, tier from the database
posts            -           yes      yes         browser only (decision 133: drawn from the member's own data)
front view,      -           yes      yes         browser only (decision 133)
 placement sheet
share links      -           yes      yes         private.studio_share_links_allowed() (decision 133)
templates        yes         yes      yes         private.studio_templates_allowed() (decision 133; Artist under 113 (b))
folders          -           yes      yes         private.studio_artist_plan() (collection policies)
Glowbook         -           -        yes         private.glowbook_allowed() (RPCs + public reads)
AI smile try-on  -           -        yes         private.studio_try_on_allowed() (decision 111 (a))
```

A trial counts as Essential, active staff as Atelier. Everything else (editor, whole gem library, estimate
sheet, PNG snapshot) is open to every plan. Every rule is read in the browser through
`webapp/src/lib/studioEntitlements.ts`; `studioEntitlements.sql.test.ts` checks it against the latest SQL
definitions in `supabase/migrations/` so neither side drifts alone. The browser shows the same
table from `webapp/src/data/studio.ts` (`STUDIO_PLAN_FEATURES`, keep both in step) on the presentation page,
the plans of the locked editor and `/compte/studio`, which also shows the member's usage from
`studio_access_state()` (`tier`, `glowbook`, `limits`, `usage`). A save over the limit is refused by the
database and said by a toast ("nothing was saved"); below Atelier, "My Glowbook" and a creation's Glowbook
control show the plan instead of the forms.

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

Iteration 25: **members' lounge** — members (course holders and active staff) read the channels, their own private
conversations, the directory and their own read state, reactions and notifications; every write is a `lounge_*`
function; staff have no extra right (they cannot read private conversations); visitors and accounts without a course
have no access (see *Members' Lounge*).

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
| `studio-thumbnails` (private, 512 kB, jpeg/webp/png) | owners read/delete inside `<user_id>/`, and upload/replace there with Studio access; members with Studio access also read the renders of published templates (decision 97). Served through signed URLs. |
| `lounge-media` (private, 5 MB, jpeg/png/webp/gif) | members upload into `<user_id>/` while they can enter the lounge; the uploader reads and deletes their files; anyone who can read the lounge message an image is attached to reads it (so a private conversation's images stay between its two members). Served through signed URLs. |
| `glowbook-videos` (private, 8 MB, mp4/webm) | a member uploads into `<user_id>/` while they have Studio access and the Glowbook look (`private.glowbook_customization_allowed()`); owners and `moderate_reviews` staff read; **anyone** signs exactly the current spotlight video of a public Glowbook (`private.is_public_glowbook_video()`: approved page and spotlight item, author with access, scene unchanged since the recording); owners delete the files no page uses; no update (a new turn is a new file). Decision 103. |
| `studio-share-logos` (private, 2 MB, png/jpeg/webp, no SVG) | a member uploads into and reads `<user_id>/` only while their Studio tier is artist or atelier (`private.studio_share_logo_allowed()`); deleting their own files is always allowed; no update (a new logo is a new file, recorded by `studio_set_share_logo()`). Downloaded by the export dialog, never served publicly (decision 101). |

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
- Authentication → Attack Protection → captcha protection: Cloudflare Turnstile with the site's secret key (decision 137; the webapp sends the token on every protected call).
- Authentication → Emails, the link of each template, so it works on whichever device opens it
  (`verifyOtp` with the token hash rather than the PKCE code, which only the requesting browser can exchange):
  - *Confirm signup*: subject *Confirmez votre compte Global Toothgems*, body from `templates/confirm-signup.html`
    (link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`);
  - *Reset password*: link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`;
  - *Change email address*: link `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email_change`.
  With Supabase's default `{{ .ConfirmationURL }}` links still work, but only in the browser that asked for them.
  An e-mail sent from the dashboard rather than by the app carries the Site URL as `.RedirectTo`: send
  confirmations and resets from the app.
- Google's own button (since 2026-11-08, optional, owner's request: the redirect's consent page names
  `<project ref>.supabase.co`, which does not inspire trust): with `NEXT_PUBLIC_GOOGLE_CLIENT_ID` set (the same OAuth
  client id as the provider above; public by nature, the secret stays here), `/connexion` and the `/inscription`
  dialog show Google's official button (Google Identity Services, `webapp/src/lib/googleIdentity.ts`,
  `components/auth/GoogleIdentityButton.tsx`). Its pop-up names this site; the ID token comes back with a hashed
  nonce and `supabase.auth.signInWithIdToken({ provider: "google", token, nonce })` opens the cookie session
  (`signInWithGoogleToken` in `lib/auth.tsx`, same sign-in-or-sign-up semantics, terms note kept). Unset or Google's
  script unreachable: the redirect below is the fallback. To switch on: in Google Cloud › Credentials › the OAuth
  client, add the site's origins (`https://<production domain>`, the Vercel preview/`http://localhost:3000` if wanted)
  to *Authorised JavaScript origins*; leave Supabase's *Skip nonce check* **off**; set the variable on Vercel.
- Authentication → Sign In / Providers → Google (**Continue with Google**, since 2026-10-04): the webapp calls
  `supabase.auth.signInWithOAuth({ provider: "google", redirectTo: …/auth/confirm?next=… })`; Google returns to
  `https://<project ref>.supabase.co/auth/v1/callback` (to be listed as an *Authorised redirect URI* of the Google
  OAuth client), Supabase then lands on `/auth/confirm?code=…`, which exchanges it for the cookie session. Signing in and
  signing up are the same step. Migration `20261004152751_google_signin_profile_metadata` makes `handle_new_auth_user`
  read Google's `given_name` / `family_name` / `full_name` as a fallback of the form keys (suite
  `tests/google_signin_validation.sql`). A Google sign-up skips the registration form, so the terms are accepted in
  one click instead (no schema change, members may insert their own `terms` + `privacy` records, source `account` /
  `checkout`): on `/inscription` a dialog ("J'accepte et je continue avec Google") precedes the redirect and the
  acceptance is recorded once the new account is open (`webapp/src/lib/googleTerms.ts`, 15-minute note in
  localStorage); on `/connexion` the button cannot ask (it also serves existing members), so any account without a
  granted `terms` record is stopped by `RequireAccount` (member space, learner pages) with a one-click page, and by
  the cart. The authority is the Edge Function `create-checkout-session`, which answers `terms_required` (409)
  before reserving anything for an account without that record (deployed as v8, 2026-10-04). Accounts created
  before this (invited staff, seeded members) are asked once too. Not decided: what happens to a Google account
  that declines (today: sign out, the account stays). Google accounts whose address already exists as an e-mail/password account are linked automatically by Supabase (same
  verified address).
- Authentication → Sign In / Providers → Apple (**Continue with Apple**, coded 2026-11-11, decision 138; **postponed
  by the owner on 2026-11-13** — the Apple Developer Program costs $99 a year, not a priority before launch: the code
  stays, switched off by `APPLE_SIGN_IN_ENABLED = false` in `webapp/src/lib/authProviders.ts`, which hides every Apple
  button and makes `signInWithApple` refuse; Google stays the only provider). When it comes back: set the switch to
  true, restore Apple in the privacy policy (data received, relay address, recipient "Apple Distribution
  International Ltd / Apple Inc.", see commit `4ff79f1d`) and the cookie row's wording, then follow the steps below. The webapp calls `supabase.auth.signInWithOAuth({ provider: "apple", redirectTo:
  …/auth/confirm?next=… })` (`signInWithApple` in `lib/auth.tsx`, same terms dialog on `/inscription`, same terms note,
  same re-authentication before an account deletion for an Apple-only account). The button appears only once the
  project's public Auth settings (`GET /auth/v1/settings`, publishable key) report `external.apple = true`
  (`webapp/src/lib/authProviders.ts`), so nothing to deploy when it is switched on. Owner's setup: Apple Developer
  (paid membership) → an App ID with "Sign in with Apple" → a **Services ID** (the web client ID, e.g.
  `com.globaltoothgems.web`) with domain `<project ref>.supabase.co` and return URL
  `https://<project ref>.supabase.co/auth/v1/callback` → a Sign in with Apple **key** (`AuthKey_<Key ID>.p8`,
  downloadable once) and the 10-character Team ID; in Supabase: Client IDs = the Services ID **first**, Secret Key =
  the JWT generated from the .p8 with the tool on Supabase's Apple page (Chrome/Firefox). **That secret expires after
  at most 6 months** (Apple's rule for the redirect flow): generate a new one from the same .p8 and paste it before
  the date, or Apple sign-in fails for everyone (the email and Google routes keep working). Apple's own JS button
  (`signInWithIdToken`) would need no secret — not built (decision 138 (c)). **Hide My Email:** register the sending
  domain and address of Resend under Apple's "Sign in with Apple for Email Communication" (SPF/DKIM passing), or
  e-mails to `…@privaterelay.appleid.com` are dropped. Apple sends **no name** in this flow: the profile starts
  without one and is completed in the profile form or at checkout.
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

### Review of 2026-11-11 (owner's delegation)

The owner asked an agent to settle the pending "to confirm" points. Outcome:

- **Decided:** every agent's choice or reading marked "to confirm" below is kept as implemented (marked "decided
  2026-11-11"), unless it appears in one of the lists that follow. Nothing was changed in the code by this review.
  Also decided: guest orders earn no loyalty stamp (decision 76, the cart invites signing in); the member's loyalty
  card is shown from the first sign-in, empty at 0 stamps (already the case); no staff deletion screen (suspension
  instead) and no single "owner" role; the contact form's visitors pass Cloudflare Turnstile (built 2026-11-11, below);
  purchased course access has no end date — "lifetime access" on the course pages, "sans limite de durée / with no
  time limit" in the terms of sale (version `2026-11-12`), the terms of use and the FAQ (owner, 2026-11-11, decision
  72); the seller's and publisher's telephone numbers are filled in Settings › Store (owner, 2026-11-11); subscriptions without an immediate-access request on file (decision 94 (a)) exist only in test
  mode, nothing to decide.
- **Left pending by the owner (2026-11-11):** the refund of a purchased gift card (decision 58: not built; a refund
  made in the Stripe dashboard is still recorded) — the public balance check and the check in the member area were
  lifted by the owner on 2026-11-13 and built (decision 140; decision 57's list of "my cards" stays not built);
  the consumer mediator of the seller and of the publisher (decisions 126, 135, "later": a legal launch blocker, still
  shown as "to supply"). Since 2026-11-13: **Sign in with Apple** (decision 138: coded, hidden by
  `APPLE_SIGN_IN_ENABLED = false`; not a priority, the Apple Developer Program costs $99 a year).
- **Open questions to the owner** (business facts only they hold):
  1. Supplier evidence for the "sans plomb" / "hypoallergénique" product claims (decision 116), else remove them.
  2. Final Studio prices before the live Prices are created (decision 94).
  3. Switch the reminder e-mails on (decision 142) once `/rappels/desinscription` is live in production, kind by kind
     (one SQL line in *Reminder e-mails*); all three are off until then.
- **For the accountant** (before launch): VAT franchise eligibility and threshold monitoring for the seller and the
  publisher (114, 135 (a)); EU distance-selling / OSS for goods, courses and Studio subscriptions (5, 68, 115 (d), 126);
  the configured VAT rates, kept for when the franchise ends (5, 68); gift cards as multi-purpose vouchers, no VAT at
  sale (10, 56); invoice and credit note formats `FA-`/`AV-` and `FS-`/`AS-` with the yearly reset, payment mentions,
  credit note VAT split (86, 135); zero/negative Stripe invoices without a document (115 (a)); start of the 10-year
  retention of orders and invoices (127); showing the VAT number under the franchise (120).
- **For the lawyer** (before launch): wording of the terms of sale, Studio terms and the "By clicking Pay…" line (80,
  130 (d), 135); withdrawal: Studio immediate-access request and plan switches (94 (a), 112 (h)), course waiver and
  "started" (128), shop labels vs D221-5, start of the period, delivery refund on a partial withdrawal, hygiene seals
  (131); Omnibus wording, open-ended promotions and personalised offers (129 (h), (i)); data controllers — seller vs
  publisher, shared account (121, 135); consent proofs on account erasure (127 (f)) and other retention periods (125
  (a), 127); moderation statements outliving an erasure (132); the Glowbook map loading OpenFreeMap without a click
  (108 (b)); regulatory status of tooth gems and their application (126); product claims (116 (b)); reminder e-mails
  (142 (a), (b), (d)): cart reminders to guests without consent (soft opt-in / ongoing transaction vs prospection),
  whether review requests and loyalty reminders are prospection, keeping the opt-out hash after an erasure.

1. **Money as `numeric(12,2)`** — **decided (Sept 2026), keep it.** Postgres stores exact decimals + ISO-4217
   currency; TypeScript and Stripe use integer minor units; conversion only at boundaries
   (`amount * 100` for 2-decimal currencies, `webapp/src/lib/catalog/money.ts`). 3-decimal currencies
   (KWD, BHD…) would need a wider scale.
2. **Default content language = French** — decided, and locked since `settings_workspace` (`is_default` is not
   writable from the API; the Settings page shows it as the original language). Switching the default later means
   moving base text into an `fr` translation and `en` into the base columns (a data migration, not a schema change).
3. **Stock of active products is public** (enables "only 3 left" / out-of-stock badges). Restrict to
   `stock_status` only via a view if quantities become sensitive.
4. **Admins may set `payment_status`** manually (e.g. bank transfer). Stripe webhooks remain the
   authoritative source for card payments. Marking paid commits the reserved stock automatically.
5. **VAT model** follows the Settings prototype: prices include VAT, tax country = shipping
   country (billing for digital-only), per-line rounding, shipping taxed at the standard rate,
   destinations without a configured rate → 0 % (exports). **Rates are illustrative — have the
   accountant confirm them.** OSS thresholds, B2B reverse charge and VAT-number validation are not
   modelled yet. Stripe Tax could replace `vat_rate_bp()` later. The Settings page edits the rates only and shows
   these rules read-only (decision 66).
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
25. **Contact form goes through the Edge Function `submit-contact-request`** (service role for visitors; the Next.js server
    must not hold it). Honeypot + IP limit (2026-10-08), Turnstile since 2026-11-11 (below). The database also
    throttles per e-mail/account. `submit_contact_request`, `newsletter_confirm`, `newsletter_unsubscribe` are
    `SECURITY DEFINER` and reachable from the API on purpose (accepted advisor warnings): each validates its input
    and only acts on the caller's own data or on a bearer token.
    Since 2026-11-11 a visitor (no member session) also sends a Cloudflare Turnstile token (`captcha`), checked by
    the function after the IP throttle and before any file is stored (`captcha_required` / `captcha_failed`); a signed-in
    member skips it; without `TURNSTILE_SECRET_KEY` (shared with `newsletter-subscribe` and `order-withdrawal`) nothing
    changes.
26. **Retention of tickets, attachments and unsubscribed addresses** is not automated: how long to keep them is a
    legal/business decision (e.g. tickets 3 years after closing). The list keeps unsubscribed addresses so they are
    never mailed again.
27. **Member e-mail change**: the list entry keeps the old address until the member's next marketing decision.
28. **Double opt-in for visitors, not for members**: a member's opt-in is recorded from their account (Supabase Auth
    confirms the account e-mail); confirm this is enough for the countries served (e.g. Germany).
29. **Legal documents and FAQ stay in the frontend** (`data/legal/*`) until their placeholders are validated;
    `content_pages` is ready to receive them (kind `legal` requires a `policy_version`).
30. **`store_settings` is the store's identity** (`settings_workspace`): maintenance switch, business identity and
    legal mentions, contact details, opening hours, contact page switches — one row, public read.
31. **Revenue = merchandise charged, VAT included**, net of discounts; shipping, gift cards (money held until spent)
    and refunds are reported apart, not deducted. If finance wants revenue excluding VAT or net of refunds, it is a
    change in `private.analytics_sale_lines()` only.
32. **Sales are dated by payment (`paid_at`)** in the shop's time zone (default `Europe/Paris`); the orders section
    uses the placement date. A customer is an account, or a guest's e-mail (a guest who later signs up counts twice
    until guest orders are linked).
33. **Training figures are `null`** in the snapshot: since 2026-10-09 the screen aggregates them in the browser from the
    Academy rows staff read (`webapp/src/lib/adminAnalyticsTraining.ts`, definitions there), the schema being left
    unchanged for statistics (owner's decision); moving them into the function is the next step if volume grows; **product-page conversion** is not available (it
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
    history table would be the fix if renames become common. `meta_title` / `meta_description` are filled for every
    active product and read by the product page since 2026-10-28 (decision 116); they are not editable in the back office yet.
38. **Internal order notes moved to `order_notes` (applied, Oct 2026).** The
    column stays (always NULL, a check forbids a value) because the checkout's stock trigger still writes
    `new.admin_note`; dropping it means rewriting those functions — a follow-up once the Stripe work settles.
    Other staff-written fields remain readable by the owner of the order (`cancellation_reason`,
    `refunds.failure_reason`): keep them customer-safe, or move them the same way if they need to be internal.
39. **Invoices — superseded by decision 86 (2026-10-09).** The printable order summary stays, labelled as not
    being an invoice; the legal invoice and credit notes are issued by the database (migration `invoices`).
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
50. **Course sales pages** (phase D, 2026-10-02): a published course's page offers "Buy this course" (cart), or
    "continue the training" to a signed-in member who holds it. Its structured data still has no `offers`
    (to add if search previews should show the price).

49. **"Collected" figure of the order book** (agent, 2026-10-01; decided 2026-11-11): per currency, never added across
    currencies; for orders whose payment was received (`paid`, `partially_refunded`, `refunded`) and that are not
    cancelled, `amount_due` (total less gift cards) less succeeded refunds. Gift cards therefore count once, when
    sold, not again when spent; unpaid, failed and cancelled orders count for nothing. The statistics screen
    (`analytics_snapshot`) measures goods sold instead (gift-card products excluded), so the two figures differ
    by design. A buyer's "spent" on the order page is the member area's rule (recorded totals of paid orders that
    stand, less refunds).

50. **Team invitations** (agent, 2026-10-01; decided 2026-11-11): an existing active customer invited by address is promoted
    in place without an e-mail (their account, password and names are kept); a suspended customer is refused.
    Cancelling a pending invitation deletes the auth account only when this function created it and it was never
    used (`app_metadata.staff_invitation`, never signed in, unconfirmed). **Not implemented, decisions for the owner:**
    permanent deletion of a staff account that has been used (suspend instead), mandatory two-factor for staff
    (`staff_directory()` only reports it), a single "owner" role above administrators (today administrators can
    demote each other; the screen only keeps the last active administrator in place, the database does not).

51. **Learner rows keep soft references to the course tree** (agent, 2026-10-01, phase C): `lesson_progress.step_id`,
    `quiz_attempts.module_id` / `quiz_id` and the attempts' answer snapshots have no foreign key. CASCADE would erase
    what members did when an author deletes or replaces a node of a published course; RESTRICT would block the
    author's save. With soft references nothing members earned is lost (completions and certificates only reference
    the course); progress on a node the course no longer has simply stops counting. A check is keyed by its
    module, because `admin_save_course()` recreates a module's quiz row when the check is replaced: a member who
    passed the old check keeps the pass. A step moved out of a module that the same save deletes is re-created
    under its id, so its progress rows still match.
52. **Immediate-feedback checks lock the first answer** (agent, 2026-10-01): the first `answer_quiz_question()` call
    opens an attempt (attempts are unlimited until the check is passed, `20261007072551`), and the first answer to each question stands until
    the attempt is submitted (a member who leaves resumes the same attempt). Otherwise a member could probe every
    option before submitting. End-of-check mode is one `submit_quiz_answers()` call.
53. **Manual grants** (agent, 2026-10-01; decided 2026-11-11): only for a course that was ever published; by exact account
    e-mail (no invitation for someone without an account); optional end date (end of that day, the trainer's time
    zone) and internal note; one unrevoked entitlement per member and course (an expired one is closed when access
    is given again). Revoking keeps completions and certificates. Access ends with a revocation or the end date;
    a withdrawn course stays on the account, greyed out.
54. **Certificates** (agent, 2026-10-01): a certificate is the `course_completions` row of a course that issues
    certificates, with a random verification code `GTC-XXXX-XXXX-XXXX` (48 bits). No public verification page
    (decided by the owner, 2026-10-07: members share an image of their certificate, never a link that exposes them;
    the PDF and the image are drawn in the browser from data the member can already read). The completion date and the scores are snapshotted when the rules are first met.
56. **Gift card purchase VAT** (unchanged, to confirm with the accountant): cards are sold without VAT and taxed when
    spent (multi-purpose voucher, decision 10). The storefront and the back office now sell and issue real cards on
    that basis.
57. **No list of gift cards in the member area** (agent, 2026-10-01; decided 2026-11-11; since 2026-11-13 members check a card's balance by its code, decision 140): a buyer sees the card line of their
    order, never the card, its balance or its code; a recipient has no view at all. Showing "my cards" needs a decision
    on who owns a card (buyer, recipient e-mail, or whoever redeems it) and a column grant that still hides `code`.
58. **Refunding a purchased gift card** (to confirm): not built. Today a paid order containing a card can only be
    refunded through Stripe by the team, and nothing voids the card; the safe rule would be "refund only if the card
    was never used, then cancel it with `cancel_gift_card`" — a business and accounting decision.
59. **Manual cards** (agent, 2026-10-01): `issue_gift_card()` accepts at most 10 000 in the shop currency, two decimals,
    a future expiry (else the settings' validity); the back office asks for a reason (≥ 3 characters) recorded in the
    ledger. Adjustments are capped at ±10 000 and need a reason (≥ 5 characters in the screen, non-empty in SQL).
60. **Gift card codes in the cart** are kept in memory only (never in `sessionStorage`), shown masked once added; the
    recipient details of a gift card being bought stay in the tab's cart storage like the rest of the cart.

55. **Lesson media signed for 4 hours** (agent, 2026-10-01; decided 2026-11-11): the member's browser signs the media of the
    courses they hold for 4 h (the same address is reused, also across reloads of the tab, until 1 h is left), so a long lesson video can be watched and sought through without
    expiring mid-way. Consequence: a signed URL keeps working up to 4 h after a revocation, an expiry or a
    withdrawal, and for anyone the member passes it to. Shorten `LEARNER_SIGNED_URL_SECONDS`
    (`webapp/src/lib/learning/learnerApi.ts`) or move to a streaming provider (Mux) if that is not acceptable.
61. **Back-office customers are read whole** (agent, 2026-10-02): `/admin/clients` reads every customer profile,
    default shipping address, tag, note and course seat (1 000 rows per request) and filters in the browser, with
    order counts and spend from the order book — the same deliberate choice as the order book. Plan when the base
    grows: `range()` + filters on `profiles` and an aggregate RPC for the KPI row and the spend per customer.
62. **Staff set customer status to active or suspended only** (agent, 2026-10-02; decided 2026-11-11): `deactivated` is
    treated as a closed account — shown and filtered, never set or reopened from the back office. A suspension is
    enforced by the app's sign-in (non-active profiles get no session) and by `create_order()`; it does not revoke
    a session already open on another device, and the learner functions do not check the profile status. Revoking
    sessions (Auth admin API, Edge Function) and a status check in the learner RPCs are to decide.
63. **The customer owns their e-mail, marketing consent and address book** (agent, 2026-10-02): the back office
    shows them read-only (the profile guard already refuses `email` and `marketing_opt_in`; addresses are
    owner-only under RLS). Export of the base, bulk e-mail and staff-created customer accounts are not offered:
    each needs a server side (audited export job, Resend, Auth admin API) and a decision. A customer's order
    count is every order of the book (as on the order page), including unpaid or failed ones; spend counts paid
    orders only. An edit saves the profile, then the tag difference, in separate requests (not one transaction).

64. **Store texts have no draft/published status** (agent, 2026-10-02): `store_settings_translations` holds one short
    sentence per locale (the contact page's response time), edited beside the French one and live on save.
65. **Storefront languages are locked** (agent, 2026-10-02): `fr` (default) and `en` cannot be switched off — the
    public routes (`webapp/src/lib/localeRoutes.ts`), checkout locales and member preferences rely on them. Enabling
    another language opens content translation in it; it does not add it to the public site.
66. **VAT in Settings = rates only** (user, 2026-10-02: "keep simple settings, revisit later"): standard rate per country,
    reduced rate per category; the calculation rules stay fixed in `create_order()` and are shown read-only. The
    prototype's switches (prices excluding VAT, tax basis, rounding, taxing shipping, B2B VAT numbers / VIES, reverse
    charge, exemptions, a default rate) were removed rather than stored unused; each needs `create_order()` work.
67. **Order numbering is not configurable** (agent's reading of the user's answer, 2026-10-02 — to confirm): numbers stay
    `GT-` + `order_number_seq`, continuous; the prototype's prefix / next number / padding controls were removed.
68. **VAT rates added on 2026-10-02 to confirm with the accountant**: AT 20, BG 20, CY 19, CZ 21, DK 25, EE 24, FI 25.5,
    GR 24, HR 25, HU 27, LT 21, LU 17, LV 21, MT 18, PL 23, RO 21, SE 25, SI 22, SK 23, MC 20 (French VAT territory); IE 23
    switched on. Published standard rates as of 2025; OSS registration or the French rate below the EU distance-selling
    threshold is the accountant's call.
69. **Shipping and VAT are saved as whole sets** (agent, 2026-10-02): a zone, rate or VAT row left out of the save is
    deleted; orders keep their snapshotted method name and VAT (`shipping_rate_id` is set null on a deleted rate).
    Unchanged rows are not rewritten, so the audit log records real changes only.
70. **Public pages show saved store details within 60 s** (agent, 2026-10-02): the legal notice and contact page read
    `store_settings` on the server with the catalogue cache (`CATALOGUE_TTL_SECONDS`); a save made in the browser
    cannot invalidate it.
71. **Courses earn no loyalty stamp and get no shop discount** (agent, 2026-10-02; decided 2026-11-11): the loyalty stamp basis
    joins products, and shop promotions, codes and the loyalty reward are computed on shop lines only (owner's
    decision that shop promotions do not apply to courses). Courses do not count for free-delivery thresholds.
72. **Purchased course access has no end date** (agent, 2026-10-02; **confirmed by the owner 2026-11-11**: lifetime access, the "24 months" mention removed everywhere): the course page's price note says
    "accès 24 mois / 24-month access", but `purchase` entitlements are created without `expires_at` (the more
    generous reading, reversible). Either set `expires_at = now() + 24 months` in
    `private.apply_order_course_transitions()` or change the page's wording.
73. **A course needs an account** (agent, 2026-10-02): access is granted to an account, so `create_order()` refuses a
    course line in a guest order (`account_required`); the cart asks the visitor to sign in first. Guest checkout
    stays the default for everything else.
74. **A full refund revokes the course** (agent, 2026-10-02; decided 2026-11-11): when an order becomes `refunded`, its
    purchase entitlements are revoked (progress and certificates are kept). A partial refund of a course line does
    not revoke it automatically — staff revoke by hand from the course's access screen.
75. **One seat per course per order, for oneself** (agent, 2026-10-02): no buying a course for someone else, no
    multi-seat purchase (studios training several artists) — both would need a gift / seat model.
76. **Loyalty stamps need a signed-in order** (agent, 2026-10-03; decided 2026-11-11): the stamp trigger ignores orders
    without `user_id`, so a guest checkout earns nothing (the cart invites the visitor to sign in; the FAQ says so).
77. **Spending the loyalty reward from the cart** (agent, 2026-10-03): the checkout request carries
    `use_loyalty_reward` (boolean, default false; never an amount). `create_order()` takes the oldest completed card
    and reserves it on the unpaid order (it comes back if the order is cancelled or expires). Refusals (no card, card
    already reserved by an order awaiting payment, guest, other currency, combined with a promotion code) map to
    `loyalty_reward_unavailable`. A visitor who abandons Stripe keeps the card reserved until the order's reservation
    expires; the cart then shows that message. The discount is computed on shop goods only (no gift card, no course).
78. **The order that spends the loyalty reward earns no stamp** (agent, 2026-10-04; decided 2026-11-11): migration
    `20261004200155_loyalty_reward_order_no_stamp` makes `apply_loyalty_on_order()` skip an order carrying a
    `loyalty` row in `order_discounts`, so after spending the reward the member's card is back at 0 instead of 1/5.
79. **E-mail: Resend REST API from Edge Functions, templates in the database, no React Email** (agent, 2026-10-05,
    to confirm). Next.js does not make React Email unusable (it renders in Node), but it does not fit here: the
    store's e-mails are *data* (`email_templates` + translations, edited by staff in the Translations workspace,
    `{{variables}}` checked by the database), whereas React Email templates are code that needs a deploy per
    wording change, and most e-mails (order paid, gift card, shipping) leave from Deno Edge Functions, not Next.js.
    - `supabase/functions/_shared/email/`: `render.ts` (`email_template_for(key, locale)` → substitute variables,
      HTML-escape every value, wrap the body in one shared brand layout with inline CSS and a plain-text twin),
      `resend.ts` (`fetch` to `https://api.resend.com/emails`, `Idempotency-Key`, typed errors, no SDK), unit-tested
      with `deno test` and an injected `fetch`. No new dependency.
    - Edge Functions call the module directly (`stripe-webhook` → `order_confirmation`, `deliver-gift-cards`).
    - The Next.js server routes (contact, newsletter confirmation) call an internal Edge Function `send-email`
      `{template_key, to, locale, variables}`: `verify_jwt = false`, authenticated by the `EMAIL_INTERNAL_SECRET`
      header (constant-time compare), recipient and template allow-listed per caller; one place holds `RESEND_API_KEY`.
    - Secrets: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM` (`Global Tooth Gems <no-reply@globaltoothgems.com>`),
      `EMAIL_REPLY_TO`, `EMAIL_INTERNAL_SECRET`; the Next.js side holds `EMAIL_INTERNAL_SECRET` only.
    - Webhook `resend-webhook` (Svix signature): `email.delivered` / `opened` / `bounced` / `complained` →
      `record_gift_card_delivery` and `newsletter_subscriptions.status`.
    - Auth e-mails (confirmation, recovery, invitation, change) keep going through Supabase Auth, over Resend SMTP
      (`smtp.resend.com`, user `resend`, API key as password); their templates are edited in the Supabase dashboard.
    - A visual preview of the layout is a script rendering the layout to a file, not a React Email dev server:
      `deno run --allow-write=<dir> _shared/email/preview.ts <dir>` (from `supabase/functions`).
    - **Master layout and components (2026-10-07):** every e-mail, database template or not, goes through one
      layout. `tokens.ts` (the site's colours as literals: emerald = the one primary action, fuchsia = promotions
      only, pastel blue on surfaces), `html.ts` (escaping, https-only links and images), `components.ts` (title,
      intro, eyebrow, heading, paragraph, Montserrat-italic accent line, primary/secondary buttons, text link,
      badge, info/success/warning/important notices, divider, image, label/value details, order summary, product
      card, course card, promotion block — each returns HTML and its plain-text twin), `layout.ts` (fluid 600px
      card, logo header, footer with support link, localized help/legal/privacy/terms links, optional social links,
      postal address and unsubscribe, copyright). `renderEmail(template, values, layout, content?)` keeps its
      contract; the optional `content` (eyebrow, title — defaults to the subject —, intro, actions, blocks,
      unsubscribe URL) is built by the calling code, never from substituted values, and passed as
      `SendRequest.content` (an object, or a function of the template's locale so labels match the body). Logo:
      `webapp/public/email/logo-wordmark.png` (540×145, 3× its 180 px display width, exported from `assets/logo/vector/wordmark.svg`, flattened on white so dark-mode clients keep it legible),
      served at `<SITE_URL>/email/logo-wordmark.png` — it shows only once the webapp is deployed with it. Montserrat
      loads where clients allow web fonts, else Helvetica/Arial (Outlook forced to Arial). Brand name in the layout:
      "Global Toothgems", as on the site (the `EMAIL_FROM` display name is a secret, unchanged).
      Order e-mails (2026-10-07, `orderContent.ts`): the confirmation carries an "Order GT-…" eyebrow, a payment
      notice, the order summary (lines, discount, shipping, gift card, total, VAT — the amounts frozen on the
      order, formatted, never recomputed), the delivery address and method, and a "View my order" button
      (`/compte/commandes/<order number>`) for members or "Continue shopping" for guests; the shipping e-mail a
      "Track my parcel" button; the refund e-mail a notice and an order / amount block. Labels fr/en in code,
      in the language of the template found. Gift card and course enrolment e-mails stay body-only. Product images
      are WebP in `product-media`, which Outlook desktop does not show: render a JPEG/PNG through the image
      transformation endpoint before using them in an e-mail. Auth e-mails (Supabase dashboard templates) do not
      use this layout yet.
    - To add when the first e-mail ships: a `email_log` table (template, recipient hash, resend id, status, order or
      card id) with a unique key per business event, so a retried webhook cannot send an order e-mail twice.
    - Missing templates to seed: `gift_card_delivery`, `order_refunded` (and `course_enrolment` already exists).
    - **Built (2026-10-05), deployed:** `_shared/email/` (`render.ts`, `resend.ts`, `send.ts` =
      `sendTemplatedEmail()`, `store.ts`, `mod.ts` = `emailDepsFromEnv()`, `orders.ts`, `giftCards.ts`, `notify.ts`),
      `_shared/internalAuth.ts`, the function `deliver-gift-cards`, and migrations `email_log` and
      `email_attempt_cap_gift_card_wording` (applied). After a payment (`stripe-webhook`, or `create-checkout-session`
      for an order fully paid with gift cards) the `orderPaid` hook calls `notifyOrderPaid()`: order confirmation
      (`order_confirmation:<order id>`), then the gift cards of the order, then the enrolment e-mail of each course it bought. It never throws and does nothing without
      `RESEND_API_KEY`. Limit: a confirmation that fails once is not retried by Stripe (the event is already
      processed); `email_log` keeps it as `failed` — a sweep of paid orders without a sent confirmation is to add.
    - **`send-email` built (2026-10-05), deployed:** `supabase/functions/send-email/` (`verify_jwt = false`,
      `x-internal-secret`). Body `{template_key, to, locale, variables, event_key}`; allow-list of two templates
      (`contact_acknowledgement`: name, subject, ticket_number; `newsletter_confirmation`: confirm_url), exactly the
      template's own variables as non-empty short strings, locale fr/en/de, event key prefixed by the template
      (`contact_acknowledgement:<ticket>`, `newsletter_confirmation:<hash of the token>`), body ≤ 8 KB, and the
      newsletter link must start with `SITE_URL`. Answers `{ok, status: sent|duplicate}` or a generic error; never the
      e-mail content or the provider's text. The webapp no longer calls it: its former Next.js caller
      (`webapp/src/lib/visitorEmail*.ts`) was removed on 2026-11-01, unused — the visitor forms go through
      Edge Functions (the Next.js server holds no e-mail secret).
      **The contact form is wired (2026-10-08) through its own Edge Function `submit-contact-request`, not through `send-email`**
      (see Contact form above). **The newsletter form too (2026-11-06), through its own Edge Function `newsletter-subscribe`**
      (see Newsletter for visitors above): honeypot + IP limit until a captcha provider is chosen.
    - **`resend-webhook` built (2026-10-05), deployed:** `supabase/functions/resend-webhook/`
      (`verify_jwt = false`), Svix signature checked with Web Crypto in `_shared/svix.ts` (`svix-id` / `svix-timestamp` /
      `svix-signature`, HMAC-SHA256 under the base64 part of `RESEND_WEBHOOK_SECRET`, several `v1,` entries accepted for
      rotation, 5 minutes of tolerance, no dependency). `email.delivered|opened|bounced|complained` →
      `email_log_apply_event()` (forward only: that is the idempotence on replays, no separate `svix-id` table);
      a gift card e-mail then sets the card's `delivery_status` to the log's status through `record_gift_card_delivery`
      (delivered / opened / bounced; a complaint has no card status; a card no longer active is skipped), taken from the
      log so a retry after a failed update heals the card instead of regressing it; a newsletter bounce / complaint marks
      the subscriber in the same SQL function (a complaint never goes back to subscribed: `newsletter_subscribe` and the
      consent sync already refuse to re-activate bounced / complained). Other events and e-mails not in the log (Auth
      e-mails also leave through Resend) answer 200 and are ignored; a database error answers 500 so Svix retries. Members'
      consent records are left alone (decision to confirm: a complaint could also revoke `marketing_email`).
      A webhook arriving before `email_log_finish` stored the provider id would not match; it is a window of
      milliseconds against seconds of delivery time.
    - **Shipping, course enrolment and refund e-mails built (2026-10-05), deployed:** one sweep, the function
      `send-pending-emails` (`verify_jwt = false`, `x-internal-secret`, pg_cron every 5 minutes, body `{limit}` optional),
      `_shared/email/events.ts`. Mechanism: no trigger and nothing the browser or the back office must call — the SQL
      functions of migration `email_pending_events` list the source rows (shipment `shipped`, `purchase` entitlement, refund
      `succeeded`) that have no finished `email_log` row, the sweep sends them through the usual once-per-event claim, so a
      failed send is retried by the next run (cap of 5 attempts, then left `failed` for the team) and a crash loses nothing.
      Only the last 7 days are looked at: switching the sweep on never mails old history.
      - **Shipping** — `shipping_notification`, event `shipping:<shipment id>`, **per parcel** (not per order): every parcel has
        its own carrier and tracking number, and `orders.status` is `processing` until the last parcel leaves, so an
        order-level e-mail would either wait for the last parcel or hide the others' tracking links. Only a parcel still
        `shipped` is mailed (one already `delivered` when seen would be told "on its way" too late). The link is the
        parcel's `tracking_url`; without one, a member gets their orders page (`/compte/commandes`); a guest parcel with no
        link is skipped and picked up once staff add the URL (within the 7 days).
      - **Course enrolment** — `course_enrolment`, event `course_enrolment:<entitlement id>`, for `purchase` entitlements
        only (a paid order); manual grants by staff, bundles and promotions send nothing (decision to confirm). Sent at
        once by the payment hook for the order just paid (`notifyOrderPaid`), the sweep catching what failed. A revoked
        entitlement (full refund before the e-mail left) is not mailed.
      - **Refund** — `order_refunded`, event `refund:<refund id>`, for each `succeeded` card refund of the `refunds` table, with
        the refunded amount of that refund (not the order total) formatted in the order's language and currency. A refund
        credited back onto gift cards (`refund_to_gift_cards`) is not in that table and sends nothing: the template speaks
        of the bank; a wording for it is to write if wanted.
      (Cron: scheduled by migration `email_cron_jobs`, no manual step beyond the Vault secret.) Former manual form: `select cron.schedule('send-pending-emails', '*/5 * * * *', $$ select net.http_post(url := 'https://<project-ref>.supabase.co/functions/v1/send-pending-emails', headers := jsonb_build_object('x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_internal_secret')), body := '{}'::jsonb) $$);`
    - **Operational status (2026-10-10):** the Resend domain and all secrets are configured by the user and the e-mail functions are deployed on the project (`deliver-gift-cards`, `send-email`, `resend-webhook`, `send-pending-emails`); no agent has yet verified a real send end to end. Remaining: redeploy `create-checkout-session` so it bundles `_shared/documents/` (`stripe-webhook` was redeployed with them on 2026-10-18). **Still to build:** the back-office resend of a card. Original checklist, kept for reference (deploy the functions (`deliver-gift-cards`, `send-email`, `resend-webhook`, `send-pending-emails`, and redeploy
      `stripe-webhook` and `create-checkout-session` — since 2026-10-09 they also bundle `_shared/documents/` for the
      invoice and credit note attachments), declare the `resend-webhook` endpoint in Resend (events delivered, opened, bounced, complained), and make sure the Vault secret
      `email_internal_secret` holds the same value as `EMAIL_INTERNAL_SECRET` (the crons themselves are in migration `email_cron_jobs`; the manual form below is kept for reference):
      `select cron.schedule('deliver-gift-cards', '*/5 * * * *', $$ select net.http_post(url := 'https://<project-ref>.supabase.co/functions/v1/deliver-gift-cards', headers := jsonb_build_object('x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_internal_secret')), body := '{}'::jsonb) $$);`
      (needs `pg_net` and a vault secret `email_internal_secret`; not part of a migration because of the secret).

80. **The payment form is on our own page** (user request, 2026-10-07): the Checkout Session is created with
    `ui_mode: 'custom'` and Stripe's Payment Element is mounted in the cart's last step (`webapp/src/components/checkout/`),
    instead of redirecting to Stripe's hosted page. Same session, same webhook events, same return page, same
    amount (one line = `orders.amount_due`). Card data stays in Stripe's iframes (PCI SAQ A unchanged).
    - Stripe.js is pinned to the same release as the functions (`@stripe/stripe-js` 7.x = basil,
      `@stripe/react-stripe-js` 4.0.x, API `2025-08-27.basil`, where the mode is called `custom`; newer releases
      rename it `elements`). Upgrade both sides together.
    - The publishable key comes from the function (`STRIPE_PUBLISHABLE_KEY` secret, checked to be in the secret
      key's mode), not from a `NEXT_PUBLIC_*` variable, so test and live keys cannot drift apart.
    - Going back from the payment step (or a basket changed in another tab) closes the step: session expired,
      order cancelled with reason `payment_step_left`. The client secret is the proof of ownership; it lives in the
      page and in the tab's sessionStorage only. A step left by closing the tab expires with its reservation.
    - Billing name and address are the ones typed in the details step, sent with the confirmation (the form does
      not ask twice). Below the pay button: "By clicking Pay you place an order with an obligation to pay and accept
      our terms of sale" (link) — **to confirm** by the owner / legal review (guests never ticked the terms before).
    - Apple Pay / Google Pay appear in the Payment Element once enabled in Stripe, Apple Pay after domain
      verification of the production domain in the Stripe dashboard (user action).
81. **The 3D Studio composes with the shop's gems** (owner, 2026-10-07): the Studio's library is every active product
    of the `gems` category, **whatever its stock**, so a composition is a set of jewellery a customer can buy. No
    built-in pieces, no free colour wheel.
    - Drawing data lives in `studio_gem_appearances` (presentation only, never price, stock or availability). A gem
      without a row still appears, drawn from its shop shape and colour family (`webapp/src/lib/studio3d/gemCatalog.ts`),
      so a gem added in the back office shows up straight away. The rows were set from the product photos on
      2026-10-07; there is no back-office screen for them yet (edit with SQL / a migration).
    - Colours of a piece: the gems of the same cut (each shop product is one colour), plus a product's colour
      variants (`swatch`: yellow / white gold of the 18ct pieces, one appearance row each).
    - **Sizes** are a gem's active `ss` variants (the back office's pack × SS options); a gem without any is offered
      in **SS2, SS5 and SS7** until the team sets its real sizes (owner, 2026-10-07). A shaped piece is drawn with
      its longest side equal to the SS diameter (≈ values of `STONE_SIZES`, SS2 ≈ 1.3 mm added). **Superseded by
      decision 107** (2026-10-22): sizes are SS gauges or millimetres, a piece stores its `size`.
    - A placed piece stores its product id, colour variant id, SS and a **snapshot of its look**: a design keeps
      rendering (share links, thumbnails) when its product leaves the shop or before the catalogue has loaded; the
      editor says "no longer in the shop" and leaves it out of the value.
    - **Indicative value and shopping list** (`estimateComposition`, owner's request 2026-10-11, replacing "one pack
      per crystal and colour"): pieces are grouped by product, colour and — when the shop sells the gem per size —
      SS; each group is bought as ONE variant, the cheapest number of a single pack covering the pieces, in stock
      first (2 pieces → at least the pack of 10; 30 → 3 × 10 or 2 × 25, whichever costs less). **Superseded by
      decision 122** (2026-11-03): packs of different sizes mix (30 → 25 + 10 when that costs least). Colour variants
      (gold charms) count per piece; a crystal without pack variants counts once. A piece whose gem, colour or size
      is not sold is left out. The Studio's settings panel lists these items with their stock and adds every
      in-stock one to the cart in one click (`ShoppingList.tsx`, `useCart().addLines`); the cart is priced again by
      `create_order()` as always. The value stored with a creation is the one computed at its last save.

82. **Shipping and card refunds are operated from the back office** (agent, 2026-10-07, asked by the user). What
    exists: `/admin/commandes/<ref>` creates parcels (one or several per order, lines and quantities, carrier,
    tracking number and page, estimated date), marks them shipped / delivered / returned / lost / cancelled, and
    requests a card refund (total or partial, with the lines coming back and an optional restock). See *Shipments and
    tracking* and *Refunds*; migration `20261007184209_shipping_refunds`, Edge Function `refund-order`, refund events in
    `stripe-webhook`.
    - The status dialog no longer sets `shipped`, `delivered` or `refunded` by hand: parcels drive the first two, a
      refund confirmed by Stripe the third. Cancelling a paid order stays refused: refund it first.
    - **Decisions to confirm (agent's safest reading, reversible):**
      1. *Purchased gift cards.* A refund of an order that bought a gift card still active is **refused** (the card must
         be cancelled first): otherwise the money goes back and the card stays usable. A refund recorded by the Stripe
         webhook (money already returned in the dashboard) is never blocked.
      2. *Partial refunds of course lines* keep the course access; only a **full** refund revokes it (existing trigger).
         Decide whether refunding a course line partially, or by line, should revoke access.
      3. *Loyalty stamps* of a refunded order are kept (nothing removes them). Decide whether a full refund should take
         the stamp back.
      4. *Restock* is a team choice per refund (a checkbox, lines required): refunded units are also removed from what
         is "to ship". Unshipped units of a fully refunded order are not returned to stock automatically.
      5. *Carrier pages.* The parcel form proposes the public tracking page of Colissimo, Chronopost, Mondial Relay, DHL,
         UPS, FedEx and GLS from the tracking number (`webapp/src/lib/carriers.ts`, editable): confirm the list and the
         address patterns. Without a page, a **guest** customer gets no shipping e-mail (members get a link to their
         orders).
      6. *Refund e-mail only for card refunds*; credits onto gift cards (`refund_to_gift_cards`) send nothing.
      7. *Stripe outage while refunding*: the refund stays `pending` (and cannot be cancelled once a Stripe refund id is
         attached); the team checks it in the Stripe dashboard before trying again. A refund made directly in the Stripe
         dashboard is recorded automatically (reason `other`, no restock).
    - Awaits the user: add `refund.created`, `refund.updated`, `refund.failed` to the Stripe webhook endpoint (dashboard).
83. **Promotions and campaigns are saved by two RPCs, previewed by a third** (agent, 2026-10-07, to confirm the
    throttle numbers): the back office never writes the promotion tables itself — a promotion spans seven tables and a
    trigger forbids publishing it before its children exist, so `admin_save_promotion()` / `admin_save_campaign()`
    do it in one transaction (SECURITY INVOKER: RLS and `manage_promotions` still decide). The cart shows what
    `quote_basket()` answers instead of computing a discount (decision 21: the engine is server-side only). It is
    callable by visitors, so refused codes are throttled (10 per 10 minutes per account, else per address as the
    platform saw it: `sb-forwarded-for`, never the caller-writable first `x-forwarded-for` entry). This only slows
    casual guessing: `create-checkout-session` answers `promotion_code_invalid` without any throttle. A shared code such
    as `WELCOME15` is guessable; unique codes (10 random characters) are not. Unique codes are exported as CSV from
    the promotion's detail page (staff read `promotion_codes`). Collections and customer
    segments have no back-office screen yet (read-only in the editor). The campaign activity feed was dropped:
    `audit_logs` is readable by administrators only, so the screen shows created / updated dates.
84. **Orders made free by a promotion are not offered yet** (agent, 2026-10-08; decided 2026-11-11): `create_order()` marks an
    order paid at creation only when gift cards cover it; a 100 % promotion with no gift card would leave a pending
    order with nothing to charge on Stripe. The cart disables the button with an explanation, and
    `create-checkout-session` cancels such an order and answers `free_order` (it used to answer `paid` for any
    zero amount). Marking a zero-total order paid (stock committed, stamps, courses) needs the owner's decision.
85. **The loyalty reward no longer switches promotions off: the best offer wins** (owner's request, 2026-10-08;
    amends the "alone" rule of the Promotions section and decision 14): with the reward requested,
    `compute_order_discounts()` applies the most favourable of promotions alone, the reward alone, or promotions
    flagged `combinable_with_loyalty` plus the reward on what they leave (a tie keeps the reward unused). The reward
    is reserved only when its `order_discounts` row exists. A typed code can be used with the reward. The cart says
    when the reward or a code was not retained. Default stays "never both"; staff opt a promotion in per promotion.
86. **Legal invoices and credit notes are issued by the database** (user's request, 2026-10-09; agent's choices, to
    confirm with the accountant): an invoice at payment, a credit note at each confirmed refund, numbered per
    calendar year (`FA-YYYY-NNNNNN`, `AV-YYYY-NNNNNN`, gapless, chronological). To confirm: (a) the number format and
    the yearly reset (a single never-reset series is also lawful); (b) invoices for every paid order, B2C included
    (in France only required on request for consumers, but harmless); (c) the VAT split of a credit note (items at
    their rate, surplus as shipping, otherwise pro rata); (d) gift card purchases invoiced at 0 % with the mention
    "hors champ de la TVA" (multi-purpose vouchers); (e) the payment mentions printed on every invoice: "acquittée",
    no early-payment discount, and the B2B late-payment penalties and €40 recovery fee (art. L441-10 Code de
    commerce); (f) the seller's identity on an invoice is whatever Settings holds at issue time — the legal name,
    registration (SIREN/RCS) and VAT numbers must be filled before launch; (g) no backfill for orders paid before the
    migration; (h) the PDF is drawn in the member's interface language (French or English).
87. **The checkout says when a shop-window promotion is used up, and knows a guest by the e-mail typed** (user's request,
    2026-10-09; agent's choices, decided 2026-11-11). A product keeps its promotion price in the shop window for everyone; at
    the checkout `quote_basket()` lists in `used_up` the automatic promotions this customer has already had as often
    as allowed (paid orders only), and the cart shows "vous avez déjà profité de l'offre…" with no struck price. To
    confirm: (a) a guest's e-mail is sent to the quote as soon as it is complete, so the preview matches the order
    `create_order()` will price — the trade-off: anyone can learn, quietly, whether an address has already used a
    given promotion or has paid orders ("new customers" promotions). The checkout already revealed it, but only by
    creating an order; the quote is throttled (5 new addresses per caller per 10 minutes, then quoted without
    e-mail). Removing it is one argument less in the cart. (b) A use held by an order still waiting for its payment
    (≤ 60 min, released when the payment step is left or expires) blocks the promotion but is not announced as used.
    (c) A typed code already used by the customer is still refused with the generic "code not valid" message.
88. **Members' Lounge on Supabase** (user's request, 2026-10-10: "a first version on the data"; agent's choices, to
    confirm). (a) **Who enters**: any active course entitlement (bought, granted by hand, bundle, promotion) and any
    active team member; losing the course closes the lounge immediately, old messages stay under the member's name.
    (b) **What other members see**: first name + initial of the last name, a handle `first.l` (`emma.m`), the
    country of the profile, the lounges visited, presence, the titles of completed courses, the number of channel
    messages, the day they joined the lounge (shown on the profile card since 2026-10-14) — never e-mail, phone, full last name, city or photo. (c) **Private messages are
    private, staff included**: no back-office access to them, so no moderation of private conversations yet.
    (d) **No moderation tools yet**: nothing can be hidden, deleted, reported or blocked (members or staff) — needed
    before opening the lounge to customers. (e) **Rate limit** 20 messages per minute per member; ≤ 4 images of 5 MB
    per message. (f) **Account deletion** removes the member's messages and both sides of their private
    conversations (cascade) — to check against the retention policy. (g) **Presence** is a heartbeat every minute
    while the member space is open (offline after 3 minutes; "invisible" stored as `offline`). (h) Channel names and
    topics are fixed product copy in the webapp (`lib/communityChat/model.ts`), not editable from the back office.
    (i) Images uploaded for a message that is then refused are removed by the browser; one left behind by a closed tab
    stays in the member's folder (no cleanup job).
89. **The cart shows what the gift cards pay** (user's request, 2026-10-11: the payment form is on our own page, so the
    deduction should not first appear at the payment step; agent's choices, decided 2026-11-11). `quote_gift_cards()` answers
    the total the typed codes would pay on the cart's amount and which codes cannot be used; the cart shows a "Gift
    card −X" line and "Amount due", and takes a refused code out at once. This is a partial balance check for whoever
    holds a code (asking with a large amount gives the whole balance): accepted because the code is the bearer
    credential that spends the money anyway, codes carry ~60 bits, refusals are throttled per caller (10 / 10 min)
    and the answer never carries the expiry, the order or names. The public balance form above stays not built.
90. **Back-in-stock alerts** (user's request, 2026-10-14: "notify customers once, by e-mail, when a product they
    signed up for on its page is back"; agent's choices, decided 2026-11-11). The button replaces "Add to cart" on an
    out-of-stock product or option; a member is signed up in one click on the account's address, a visitor types
    one. One e-mail per request, then the request is closed; the next restock needs a new request. Choices to
    confirm: (a) visitors are accepted **without double opt-in or captcha**, protected by the throttle (10 new
    requests / hour per caller, 30 waiting per address) — at worst someone receives one "back in stock" e-mail per
    product they never asked for; (b) `preorder` counts as available again (the storefront sells it); (c) requests
    are kept after notification (address included) with no purge yet, and deleted with the member's account
    (`on delete cascade`); a retention period (e.g. 12 months) is to decide; (d) there is no unsubscribe link (a
    one-off service e-mail, not marketing) and no way to cancel a request; (e) the e-mail goes out within ~5
    minutes of the restock (the sweep), first come first served, 25 per run; (f) an e-mail that fails 5 times
    (email_log attempt cap) leaves its request waiting for good, and a new request for the same address and target
    then answers ok without adding one: such failures show on `/admin/alertes-stock` ("Send failed"); (g) staff
    with `manage_products` (admin, manager) see the customers' addresses on that screen — today they also hold
    `manage_customers`; staff cannot delete a request (e.g. a GDPR erasure: SQL editor meanwhile).

91. **Quick restock from the product list** (user's request, 2026-10-14: "restock from a pop-up, not only from the
    three-dot menu"). A change is sent as a relative delta (`admin_adjust_stock()`), never as the count the list
    loaded, so it cannot erase a sale paid in between; an exact count typed after a stocktake carries the count it
    started from and is refused if the shelf moved. Agent's choices, decided on the owner's delegation (2026-11-11): (a) a correction may lower the
    stock (down to the reserved units), with no reason or note asked; the ledger keeps who changed what and when;
    (b) the pop-up saves each changed option of a product with variants one call at a time and stops at the first
    refusal (the options already saved stay saved); (c) untracked products keep their one-click "back on sale"
    in the menu, no pop-up; (d) staff with `manage_products` (admin, manager) may use it, like the edit form.
92. **Images per language in the course builder** (user's request, 2026-10-15: "images with text: the learner's
    language must show the right image"). French is the reference file of every image slot; an English file is
    optional and lives in the English translation row (no `*_en` column). The learner sees the file of their
    interface language, else the French one. Agent's choices, decided on the owner's delegation (2026-11-11): (a) covered slots are image blocks,
    video posters and question images — course and module covers and the video files themselves stay
    single-language; (b) removing a question's image or a video's thumbnail removes its English version too;
    (c) German, when enabled, gets its own rows the same way (no schema change). Builder (2026-10-19,
    `LocalizedImageField` in `components/admin/training/MediaPicker.tsx`): both slots are shown whatever language is
    being edited — "Default image" (the French file, shown in every language) and "English image" (optional,
    replaces it for English readers, available once a default exists) — with a "what learners see" line per
    language; covers say they are the same in every language.
93. **3D Studio: 48-hour free trial, then subscription** (user's request, 2026-10-17). Every account may start one
    free trial of the full Studio, explicitly, with no payment details; it lasts 48 hours of continuous time from
    its start on the database clock and never restarts. Using the Studio (saving or changing designs, Gem Groups,
    thumbnails) needs an active trial, an active subscription or active staff, enforced by RLS; reading and deleting
    one's own designs never does. The editor needs an account (no anonymous use any more). Agent's choices, to
    confirm: (a) active staff use the Studio without a trial (support, testing); (b) an account that has ever had a
    subscription gets no trial; (c) a subscription grants access while `active`, `trialing` or `past_due` and
    `current_period_end` is in the future (Stripe's own retry period); (d) sharing a saved design stays possible
    after the trial (it is viewing, not editing); (e) a subscription started within 30 days after the trial's end
    counts as a trial conversion in the statistics; (f) plans and prices are still the display values of
    `data/studio.ts` until the Stripe Prices exist (superseded by decision 94).
94. **3D Studio subscriptions sold through Stripe** (user's request, 2026-10-18; prices confirmed by the owner the same
    day). Three plans, Essential €5.00, Artist €19.90, Atelier €39.90 per month, or yearly at ten months' price
    (€50, €199, €399: "two months free"), VAT included; every plan unlocks the whole Studio (the feature lists are
    presentation only). Stripe Checkout in subscription mode — first Stripe's hosted page, paid on our own page
    since 2026-10-18 (below); the Stripe Prices are test-mode
    objects created by `studio-billing-setup` on the owner's go-ahead, live ones are created at launch. Access only
    from the verified webhook (`studio_subscriptions`), one blocking subscription per account, Stripe customer reused.
    Paid on our own page since 2026-10-18 (owner's request: keep the member on the site): the subscription's
    Checkout Session uses `ui_mode: "custom"` and is paid through the shop's Payment Element form
    (`StripePaymentForm`, decision 80) on a checkout page of its own, `/studio-3d/paiement` (owner's request: not on
    the plans page), which opens the editor once paid; the customer portal stayed Stripe's page until decision 112.
    Agent's choices, decided on the owner's delegation (2026-11-11): (a) the 14-day EU withdrawal right — since 2026-10-18 (owner's choice, migration
    `20261018155521`) the member must tick, in the payment step beside the card form, an express request for immediate access
    acknowledging that a withdrawal within 14 days costs the share of the subscription already used (L221-25,
    option "service": the Studio is an online service, so the right is kept, not waived — a full waiver under
    L221-28 was considered and set aside as unlikely to hold for a subscription). Pay does nothing until it is
    ticked; the function then records it in `consent_records` (`studio_immediate_access`, version
    `studio-withdrawal-2026-10`, wording in `_shared/studioBilling.ts`, the same as the box — checked by a Deno
    test) and merges its id and version into the Checkout Session's metadata, and only then does the browser
    confirm the payment; it is e-mailed with the plan and first payment once the first invoice is paid. Limit: the
    payment is confirmed from the browser (Stripe.js), so a hand-crafted client could pay without asking for the
    record; such a subscription has no request on file (no confirmation e-mail is sent for it) and the safe reading
    is that its withdrawal is refunded in full — not automated (`request_studio_withdrawal()` always deducts the
    days used), to decide. To confirm with a lawyer:
    the wording; the refund on withdrawal (automated since decision 95); the Studio clause of the terms of sale (`data/legal/terms.ts` covers products and courses);
    (b) ~~subscription invoices are Stripe's own documents~~ — **superseded by decision 115 (2026-10-26)**: the
    database issues the legal `FA-` invoice of every paid subscription invoice and the `AV-` credit note of a
    withdrawal, in the sequence of decision 86; Stripe only collects; (c) VAT is inclusive at
    one rate (no Stripe Tax, no per-country rate, no B2B reverse charge), like decision 5; (d) `past_due` keeps
    access while Stripe retries (Stripe's dunning settings decide how long), decision 93 (c); (e) a plan or interval
    change in the portal is prorated immediately (`create_prorations`); (f) two subscriptions on one account (two
    checkouts paid at once despite the expiry of the other open sessions) are logged, not refunded automatically;
    (g) staff may subscribe (testing); (h) a subscription page reached signed out asks to sign in first (no guest
    subscription).
95. **3D Studio withdrawal refunded automatically** (user's request, 2026-10-18; migrations `20261018163051`,
    `20261018163229`). Within 14 days of the first payment the member withdraws from `/compte/studio` in one step;
    the database alone decides (`request_studio_withdrawal()`, service role) and `studio-withdraw` does the Stripe
    side: the subscription is cancelled at once without proration (access ends when the webhook mirrors
    `customer.subscription.deleted`), then the rest of the first payment is refunded to the payment that paid the
    first invoice (`invoicePayments`, idempotency key `studio-withdrawal:<id>`, metadata kind = studio_withdrawal);
    each step is recorded so a second call resumes; the refund is confirmed only by the verified `refund.*` event
    (`settle_studio_withdrawal_refund()`; such refunds never go down the order path). The acknowledgement e-mail
    (`studio_withdrawal_confirmation`, L221-21) goes out at once, the sweep catches failures. `/admin/statistiques`
    shows the money settled, still in its withdrawal period, and refunded (`StudioRevenuePanel`, browser-side from
    `studio_subscription_invoices` + `studio_withdrawals`). `studio-billing-setup` `smoke_withdraw` runs the same
    withdrawal for an account without a browser (test mode). Agent's choices, decided on the owner's delegation (2026-11-11): (a) eligibility — the
    first invoice is the only paid one (a renewal carries no right; a paid plan change goes to the team,
    `manual_review`), until the end of the 14th day after that payment, Paris time; (b) the amount — days STARTED
    since the period's start (from Stripe) over the period's days, the used share rounded DOWN to the cent in the
    member's favour (an alternative is to the second); (c) the creations stay readable after a withdrawal (nothing
    is deleted); (d) no limit on withdrawals per account (each one costs the days used); (e) Stripe's invoice keeps
    no credit note for this refund (decision 94 (b) with the accountant) — since decision 115 the database issues
    the `AV-` credit note when the refund is confirmed; (f) a Studio refund made by hand in the
    Stripe dashboard is not recorded anywhere; (g) the webhook endpoint must receive `refund.created`,
    `refund.updated`, `refund.failed`: added to the TEST-mode endpoint on 2026-10-18 at the owner's request
    (`studio-billing-setup` `webhook_events`), to add to the live endpoint at launch. Verified end to end the same
    day in test mode (`smoke_withdraw` on the owner's test subscription paid that morning: 1 day of 31 used, €0.64
    kept, €19.26 refunded; subscription cancelled by `customer.subscription.deleted`, refund confirmed by
    `refund.updated`, acknowledgement e-mail delivered).
96. **3D Studio collections** (owner's request, 2026-10-19: "more organisation features to justify the
    subscription"; migrations `20261018224456`, `20261018224648`). A member files their saved creations into named
    collections. Agent's choices, decided on the owner's delegation (2026-11-11): (a) **many-to-many**, not folders: one design can be in "Bridal" and
    in "Client Léa" at once, and nothing in the existing data asked for a single place; (b) creating, renaming and
    adding a creation to a collection need Studio access, like saving a design; reading, deleting a collection
    and taking a creation out of one do not, so a member whose trial or subscription ended can still see and tidy
    their work (mirrors decision 93); (c) a collection name is 1–40 characters, unique per member ignoring case;
    the colour is one of five design tokens or none, never free; (d) no limit on the number of collections; (e) a
    duplicated creation is not put in the original's collections ("Save as new" pre-ticks them in the save dialog
    instead); (f) staff organise their own creations only, they never read members' collections; (g) no audit
    trigger (personal organisation, like `creations`).
97. **3D Studio: Global Toothgems templates** (owner's request, 2026-10-19; migration `20261018224657`). Recurring
    value for the subscription: ordinary creations made by team members, published with one flag
    (`creations.template_published_at`), browsed by every member with Studio access (the same
    `has_studio_access()` as the writes: active trial, active subscription, active staff) and copied into their
    own creations with "Use this template" — the original is never modified. Newest first, "New" for 30 days
    (`TEMPLATE_NEW_DAYS`, webapp constant), publication date shown. Agent's choices, decided on the owner's delegation (2026-11-11): (a) the
    permission is `manage_content` (managers, administrators); (b) publishing is limited to one's own creations,
    unpublishing to any template (an author who left included); (c) a template stays published if its author
    stops being staff, until someone unpublishes it; (d) templates are live — the author's next saves change
    what members see (copies already made do not change); (e) the copy keeps the name, description, tags and
    estimate, starts unfavourited, and gets its own copy of the render; (f) the library is capped at 500 rows
    (no paging yet); (g) members can see the author's user id inside the render's storage path (the only owner
    data the reader exposes); (h) no record of which template a copy came from (no usage figures beyond the
    PostHog event `studio_template_used`).
98. **3D Studio: folder view of My Creations, chosen per account** (owner's request, 2026-10-19: "a view like a
    file explorer, folders you enter to see the creations; the current view by default; the choice stored per
    user"; migration `20261019062619`). The collections of decision 96 are shown as folders; the choice of layout
    is a row of `studio_preferences`. Agent's choices, decided on the owner's delegation (2026-11-11): (a) stored in its own Studio table, not as a
    column of `profiles` (keeps the Studio domain apart; room for later workspace settings); (b) changing it needs
    no Studio access (it only changes how the member's own work is shown); (c) the top level lists the folders,
    then the creations in no collection; a creation in several collections shows in each folder; (d) searching
    or filtering at the top level searches the whole library (matching folders by name + matching creations,
    wherever they are filed), like a file explorer's search; (e) one level only: collections are not nested;
    (f) no drag-and-drop into folders yet (filing goes through the card's "Collections…" menu).
99. **3D Studio: the Glowbook, an artist's public showcase** (owner's request, 2026-10-19: "a public read-only
    showcase of the artist's chosen creations, to link in their Instagram bio; moderation before any publication;
    added only from the creations, not while editing a design; a confirmation pop-up when saving a creation that
    is in the showcase, and when staff save a template shared with every artist"; migrations `20261019072230`,
    `20261019072443`). Decided by the owner the same day: the address is `/fr/glowbook/<handle>` and
    `/en/glowbook/<handle>`; the page is hidden while its author has no Studio access; saving an approved creation
    is public at once, without a new review. Agent's choices, decided on the owner's delegation (2026-11-11): (a) moderators are the staff holding
    `moderate_reviews` (no new permission); (b) the page itself (handle, name, bio, Instagram) is moderated
    before its first publication, then its name/bio/Instagram edits are live like the creations, while a new
    handle goes back to moderation (the page is offline until approved); (c) a pending creation also triggers
    the save warning ("will be published once approved"), a declined one does not; (d) at most 60 creations per
    Glowbook; the handle is 3–30 characters `[a-z0-9._-]`, with a short reserved list; (e) no e-mail to the
    artist on approval or rejection yet (the status and the reason show in the Studio); (f) the page shows each
    creation's saved render and details, not a 3D viewer; (g) render links are signed for 7 days on every
    request (the Open Graph image included), the page is never cached; (h) not listed in the sitemap; (i) like
    templates (97 (g)), visitors can see the author's user id inside the render's storage path, the only owner
    data the page exposes. Added the same day at the owner's request: each creation opens read-only in 3D
    (`/studio-3d/glowbook/<handle>/<item>`, migration `20261019112411`) and every read-only viewer (Glowbook and
    share links) lists the design's shop items with "add all to cart" (the editor's shopping list; the checkout
    prices again). Agent's choice, decided on the owner's delegation (2026-11-11): (j) a Glowbook creation cannot be copied into the visitor's own
    Studio (share links still can): it is the artist's published work.
100. **3D Studio: the Glowbook's own look** (owner's request, 2026-10-19: "let the artist customise the page —
    profile picture, banner, identity colour, etc.; reserved to a subscription later, open to everyone for now";
    migrations `20261019134715`, `20261019135003`). Built: profile picture, banner (framed and re-encoded to JPEG
    in the browser), identity colour from a list of ten (each tested for contrast), light / tinted / dark
    background, grid or large cards, a creation in the spotlight, city, booking link, website and TikTok, with a
    live preview in the Studio. The plan switch is `private.glowbook_customization_allowed(user)` (Studio access
    today): it gates saving and whether the public page shows the look. Agent's choices, decided on the owner's delegation (2026-11-11): (a) new
    pictures and links wait for a moderator (in `pending_changes`) while the page keeps the approved ones;
    removing one is immediate; colour, background, layout, spotlight and city are live (fixed lists or the
    artist's own approved creation; the city is short text, live like the bio, decision 99 (b)); (b) approving a
    page applies what waits with it; (c) links are https only, shown with `rel="nofollow"`; (d) without the plan,
    the page falls back to the default look but keeps its city; (e) no custom hex colour, font or free CSS (fixed
    lists keep every page readable and on-brand); (f) pictures no page uses are deleted by the browser after a
    save, best effort. Also on the owner's request the same day: the read-only 3D viewer no longer has a second
    bar under the site's header; "read only" is a small badge in its side panel.
101. **3D Studio: posts for social networks, branded by plan** (user's request, 2026-10-19: HD still and 360°
    turntable in Story / square / portrait; Essential watermarked, Artist own logo or none, Atelier + layout
    templates; migrations `20261019142032`, `20261019142220`). Agent's choices, decided on the owner's delegation (2026-11-11): (a) the trial (and a
    member without access) gets the Essential behaviour, active staff the Atelier one; (b) the watermark is drawn
    client-side — the server enforces the tier and the logo only; a server-side render would be needed to make the
    watermark unremovable; (c) video: one full turn in 6 s at 30 fps, ~10 Mbit/s, MP4 (H.264) when
    `MediaRecorder` can record it, else WebM (Firefox; Instagram may refuse it); recorded in real time, so leaving
    the tab stops it; (d) no GIF since 2026-11-06 (owner's choice: MP4 plays everywhere, `gifenc` removed); (e) three Atelier layouts (Gallery, Spotlight, Studio card) plus
    the full stage for everyone, texts = title (the creation's name by default) and an account handle typed by
    the member, not stored; (f) logo: PNG / JPEG / WebP up to 2 MB, no SVG, redrawn as a PNG within 1024 px in the
    browser; one per member; a member who leaves the plan keeps it stored but unusable until they come back;
    (g) exports are of the SAVED creation (not unsaved edits on the stage).
    Addendum 2026-10-21 (user's request: one button per network; migration `20261021172034`). Agent's choices, to
    confirm: (h) the render of a creation with an active share link becomes readable by anyone who can sign it
    (the link already shows the whole design), so link previews show the creation; revoking the link closes it;
    (i) Pinterest's `media` is the creation's card render (480 × 360) through the member's own signed URL — the
    exports themselves are never uploaded to a public bucket; (j) recommended formats: TikTok, Snapchat and
    Instagram video → Story 9:16, Instagram / Facebook / X / Threads / Pinterest stills → portrait 4:5, WhatsApp
    still → square (no 2:3 format for Pinterest); (k) desktop create pages: tiktok.com/upload,
    instagram.com, snapchat.com/web, pinterest.com/pin-builder, facebook.com, x.com/compose/post, threads.net,
    web.whatsapp.com; (l) brand marks are drawn as monograms (no brand logos shipped).
    Addendum 2026-11-06 (owner's request: too many choices, links to networks not worth keeping): (i), (j), (k) and
    (l) are void — the per-network buttons, the "Where will you post it?" picker and the networks of the editor's
    Share menu and of the share dialog are gone; the file goes through the system share sheet or is downloaded,
    the link is copied. (h) stays: the preview cards of a pasted link still show the creation. The GIF output is
    gone too (d). Agent's choice, decided on the owner's delegation (2026-11-11): the three formats and the Atelier layouts stay.
102. **3D Studio: Glowbook sections, QR poster and "certified artist" badge** (owner's request, 2026-10-19;
    migrations `20261019142050`, `20261019143019`). Built: sections the artist creates, renames, orders and
    deletes, each Glowbook creation filed in one section or none, the public page filtered by section chips;
    a QR code of the public address, downloadable as a PNG and as a printable A4 poster; a "certified artist"
    badge derived by the database from the Academy. New dependency `qrcode-generator` 2.0.4 (MIT, no
    dependencies, ~20 kB minified; QR encoding is the one piece the stack cannot do; only `lib/glowbookPoster/qr.ts`
    imports it, in the Studio). Agent's choices, decided on the owner's delegation (2026-11-11): (a) section names are short public text, live once
    the page is approved like the bio (decision 99 (b)); moderators see them with the page in `/admin/glowbook`;
    (b) sections follow the plan switch `private.glowbook_customization_allowed` (writes and public display; the
    page falls back to one list without them), deleting a section is always allowed; at most 12 sections of
    ≤ 40 characters; only sections holding an approved creation are shown; under a section filter the spotlight
    creation is not repeated at the top; (c) the badge counts only completed courses that issued a certificate
    (`certificate_code` not null), withdrawn courses included (the certificate stays valid), whatever later
    refunds (completions are sticky); it shows the course titles (English title when published, else French) and
    no code, date or score; it is NOT gated by the plan switch (it rewards training) and is shown by default —
    including on pages already live (the existing Glowbook of a certified artist gained it without opting in);
    the wording "Artiste certifiée" is feminine in French, as asked; (d) QR and poster only once the page is
    approved (the address answers 404 before); the QR encodes the address in the artist's UI language and the
    current site origin; the poster uses the APPROVED picture and colour (never one waiting for a moderator),
    falls back to initials when the picture cannot be read, and is a 300 dpi image wrapped in a PDF (like the
    certificate), its QR always ink on white (light identity colours would not scan); the PNG is the code alone.
103. **3D Studio: the Glowbook opens on the creations, the spotlight as a turning video** (owner's request,
    2026-10-21: "make the public page sexier: no cover, land directly on the creations, show the profile another
    way, the spotlight creation always a video turning around it in orbit mode, 4 seconds by default, generated
    automatically if possible"; migration `20261021174016_studio_glowbook_spotlight_video`). The public page has
    no banner any more: a slim identity bar (picture, name, city, booking, "Profile"), then the spotlight creation
    large, then the others; the full profile (bio, badge, links) closes the page, where "Profile" leads. The
    spotlight video can only be drawn where WebGL runs, so the **artist's own Studio tab records it**: the
    "Create a post" turntable on a hidden stage, square 1080 px, 4 Mbit/s, no watermark, 4 s by default (4, 6 or 8
    chosen in "Customise my page"), uploaded to the private bucket `glowbook-videos` and recorded by
    `studio_set_spotlight_video()`; whenever the database says the video is missing or stale, any open Studio tab
    records a new one after 2 s. A video is shown (and signable by anyone) only while it turns around the
    approved spotlight item AND that creation's `scene_data` still hashes to the md5 stamped when it was recorded;
    the RPC refuses a video drawn from a creation edited since (`p_creation_updated_at`, 40001). Until then the
    page shows the still render, which is also the video's poster. Validated by G13 (and G12) of
    `tests/studio_glowbook_validation.sql`. Agent's choices, decided on the owner's delegation (2026-11-11): (a) the video is **not moderated** — it
    is a mechanical render of a creation already approved, the same trust as its still render, whose later edits
    are live too; (b) server-side rendering (headless Chrome on a GPU host) was not built: it would be a new
    backend piece outside Supabase / Vercel functions, so a design edited outside the Studio's open tab shows its
    still until the artist next opens the Studio; (c) the video plays muted and looped once hydrated, never on
    its own for visitors who ask for reduced motion, always with a pause button; a browser that cannot play the
    file (a WebM recorded by Firefox, on an older iPhone) keeps the still; (d) the banner column, its moderation
    and its files stay (reversible), but the page and the editor no longer show it; (e) it rides the existing
    plan switch `private.glowbook_customization_allowed()` — the owner said the Glowbook will be reserved to the
    top plans, which is not wired yet; (f) a deleted Glowbook leaves its video files in the member's folder
    (no page uses them; the member's next recording cleans them).
142. **Reminder e-mails: abandoned cart, review request, unused loyalty reward** (owner's choice, 2026-11-13, after a market comparison of European competitors; migration `20261113111250_email_reminders`, see *Reminder e-mails*). Found before building: **no review-request e-mail had ever existed or been sent** — no template, no code, no `email_log` row with a review key; the `review_requests` view only feeds the member area. **Agent's choices, all reversible (switches and delays in one row, functions replaceable):** (a) **abandoned cart = commercial prospection**: sent only with marketing consent (member opt-in or newsletter subscription); a guest without consent gets nothing, even though the CNIL may accept a reminder of an ongoing transaction or the soft opt-in (L34-5 CPCE) — the narrowest reading until a lawyer says otherwise; (b) the review request and the loyalty reminder go to members as part of the customer relationship (no consent check) but carry the opt-out link and the layout's marketing wording; a lawyer may class them as prospection (then gate them on consent like (a)); (c) declined payments (`payment_failed`) and our own checkout failures get no cart reminder; (d) one opt-out per address for the three kinds, stored as a sha256 with its token, **kept after an account deletion** as a suppression list (it holds no address) — to confirm; (e) caps: one e-mail per event ever, plus 30 days per address (carts, reviews) and 60 days (loyalty); windows (48 h, 30 days, 60 days) so that switching on never mails a backlog; (f) a review is asked only for products of delivered parcels, never after a withdrawal or a refund, one e-mail per order; (g) no price in the cart reminder (decision 129); (h) **all three switched off** until `/rappels/desinscription` is live in production. Not built: a back-office screen for the switches, statistics of the reminders, a promotion code in the cart reminder, a second reminder.

141. **Course reviews like product reviews** (owner's request, 2026-11-13, after a market comparison: social proof on course sales pages). Migration `20261113111154_course_reviews`, see *Reviews*. Audit first: the course page already rendered the review block (`ReviewsSection`, from the prototype) but with Supabase nothing could fill it — the database accepted products only (`reviews_one_subject`, product checks in the insert trigger, product-only select policy), the store refused course reviews (`reviewsSupabase.tsx`), the mapping dropped rows without a product, eligibility answered "not purchased" for every course, and course names came from the prototype's fixtures; no course review existed on the project. **Decided by the owner (2026-11-13), replacing the agent's first proposal of half the path:** a course is reviewed only by a holder of an **active** entitlement who has **completed** it (migration `20261113140000_course_reviews_after_completion`); a grant by hand or a pack is verified ("Verified student") exactly like a purchase; a refund or revocation keeps an already written review online, and its author can still edit or delete it. Photos follow the same form as products. Entry points: the public course page (holders), the course overview in the learner space, the completion moment, the dashboard and `/compte/avis`. **Addendum (owner's request, same day):** a course review request e-mail, the fourth reminder of decision 142 (`course_review_request`, migration `20261113160000_course_review_request_email`): 3 days after a completion, only while the learner may review and has not, once per completion, at most one a week per address, with the shared opt-out link; **off** like the other reminders until the opt-out page is live in production. Delay chosen by the agent (3 days: the completion moment already asks on screen; the e-mail is the reminder), to confirm.
140. **Gift card balance check** (owner's request, 2026-11-13, after a market comparison: "a person must be able to consult their card's balance from their member space and publicly on `/carte-cadeau`, without any new menu entry"; lifts the pending public check and member-area check of the review of 2026-11-11; migration `20261113111051_gift_card_balance_check`, Edge Function `gift-card-balance`, see *Gift cards*). Built: a section `#solde` on `/carte-cadeau` (server-rendered heading, form hydrated) and a panel on the member's loyalty page `/compte/fidelite` (next to the loyalty card, the members' "advantages" page; no menu entry anywhere). **Agent's choices, all reversible:** (a) **no list of "my cards"** in the member space: the buyer gave the card away, and showing them its balance would show how the recipient spends it; listing the cards received (recipient e-mail = account e-mail) or used in the member's orders would decide decision 57's ownership question for the owner, and the check by code already serves both — so the member types the code like a visitor, without captcha; (b) answer = status (active / used up / expired / cancelled), available amount, currency, expiry, last 4 — an expired card shows what was left on it, a cancelled one 0; (c) unknown codes, cards waiting for payment, void cards and cards scheduled for later delivery all answer the same "not found" (nobody legitimately holds those codes yet) and count as refusals; used-up, expired and cancelled cards are real codes and do not; (d) throttles: refusals 10 / 10 minutes per account or per address hash; for members the counter is **shared with the cart's `quote_gift_cards()`** (both key them `user:<id>`), so alternating the two gives no extra guesses — visitors are keyed differently (`ip:<address>` in the cart, `iph:<hash>` here), so a visitor gets 10 in each, the balance form being also behind Turnstile and the per-address cap; visitors also 20 lookups / hour per address hash (`private.rate_limit_hits`, bucket `gift_card_balance_ip`) and Cloudflare Turnstile (the newsletter's keys); a missing address header puts every such caller in one bucket (stricter, never looser); (e) addresses are stored only as SHA-256 hashes (`iph:<hash>` refusals pruned after a day; the per-address lookup hits in `private.rate_limit_hits` purged by the nightly retention job after 7 days, decision 127); (f) "available" includes what an unpaid order holds, like the cart; (g) no e-mail link to the check yet (the delivery e-mail is unchanged) and no analytics event for it. Security advisor warning accepted: `check_gift_card_balance()` is `SECURITY DEFINER` and executable by `authenticated` (it must read `gift_cards.code`, which no API role may read; it returns only the fields above). **Applied and deployed 2026-11-13:** migration on the project (suite passed there, rolled back), `gift-card-balance` deployed from the pinned commit `b518c63` (right after: malformed code 400 `invalid_request`, no captcha 400 `captcha_required`, fake token 400 `captcha_failed`, honeypot 200 `found: false`). Not yet checked: a real card's balance through the visitor form with a captcha (needs the site's origin), and the member panel signed in.

139. **Packs: a product that also opens a course and months of the 3D Studio** (owner's request, 2026-11-08: "the professional kit with the course on sale and three months of the 3D Studio in one promotional pack; stock is the kit's"). Migrations `20261108170000_product_inclusions` and `20261108171000_pro_master_pack`, see *Packs: included access*. Owner's choices the same day: Studio plan **Artist**; the 3 months **start at the purchase** (the payment); a buyer who **already holds the course** pays the full pack (no reduction, no second entitlement); with a Studio subscription **the better plan wins**; a member who got the offered access **no longer opens the 48-hour trial**; withdrawal by a **partial refund** decided by the team (a partial refund keeps the access, a full refund revokes both); **one payment**, the price split between kit, course and Studio comes later; **no gift**. Price of the GLOBAL™ PRO MASTER PACK: (340.00 + 590.00) × 0.9 = 837.00 EUR, no compare-at price (a struck-through reference would claim a reduction the new product never had); the description states "kit and course bought separately: 930 €" as a fact and the Artist plan's value at its monthly price (3 × 19.90 €). Created as a **draft**; the kit's contents are still `[A COMPLÉTER]` in its description. The cart and `create-checkout-session` ask the course waiver of decision 128 for a pack that opens a course (**deployed 2026-11-13** from the pinned commit `84b72c5`, after the branch `claude/nifty-hawking-7klamc` was merged into `dev` that day — numbered 129 on that branch, renumbered 139; anonymous empty call answered 400 right after; the pack can be published). **Safe readings chosen by the agent, to confirm:** (a) a second pack adds its months after the first instead of running beside it; (b) a revoked (refunded) grant does not block the trial; (c) an included course that is unpublished makes the pack unsellable; (d) the pack's picture is the professional kit's storage object until a pack visual is uploaded — deleting that picture from the kit removes it from the pack too; (e) the withdrawal rule and the waiver wording for a mixed pack (goods + course + Studio), and the VAT split if the franchise ends, are for the lawyer and the accountant.
138. **Sign in with Apple, and the "Last used" badge** (owner's request, 2026-11-11). No schema change. **Apple
postponed on 2026-11-13** (owner: "not a priority, the Apple Developer Program costs $99 a year; stay on Google
only, hide the Apple sign-in, keep the code"): `APPLE_SIGN_IN_ENABLED = false` (`lib/authProviders.ts`) hides the
buttons on `/connexion` and `/inscription` without even asking Supabase, `signInWithApple` answers `unavailable`,
and the privacy policy and cookie list no longer name Apple. The code was reviewed before being parked: no secret in
the browser (the Apple secret lives only in Supabase), the redirect's landing goes through `isSafeNext`, the
"Last used" note holds a validated method name only, and the pending note cannot confirm a later unrelated sign-in
(removed on every settle and on every successful sign-in). Points (a)–(c) below wait for Apple's return; the badge
stays live for Google. **Apple:**
the redirect flow (`signInWithOAuth({ provider: "apple" })`) beside Google on `/connexion` and `/inscription` (terms
dialog first, generalised as `components/register/ProviderTermsDialog.tsx`), a black button per Apple's guidelines
(`AppleButton`, `AppleMark`); shown only when the project's Auth settings say Apple is on (`lib/authProviders.ts`),
so the owner switches it on in the dashboard without a deploy; the account deletion re-authenticates an Apple-only
account with Apple (`reauthMethodOf`); the privacy policy names Apple (data received, relay address, recipient
"Apple Distribution International Ltd / Apple Inc."). Setup and the 6-month secret: *Authentication* above.
**Last used:** after a sign-in that worked, this browser keeps the method's name (`gt-last-sign-in`, local storage,
listed in the cookie policy; no account data): at once for a password or Google's own button, and for a redirect once
the session comes back with that provider among its identities (a 15-minute `gt-pending-sign-in` note); a small
"Last used" badge then sits on the Google or Apple button (`components/auth/LastUsedFrame.tsx`,
`lib/lastSignInMethod.ts`), none after a password sign-in. Kept after sign-out, removed when the account is deleted.
**To confirm:** (a) whether naming Apple in the privacy policy calls for a new `LEGAL_POLICY_VERSION` (today
`2026-10-04`; unchanged here — a new version would ask every member to accept again); (b) an Apple sign-up whose
address already belongs to an e-mail/password account is linked by Supabase only when Apple shares the real address —
with Hide My Email it is a second account; (c) Apple's JS button (ID token, no secret to rotate, pop-up) instead of
the redirect, if the 6-month rotation proves a burden; (d) the badge has no expiry (shown until another method is
used).
137. **Captcha on Supabase Auth: the webapp sends the token, the switch is the owner's** (owner's request, 2026-11-11, part of decision 134's protection of sign-in). Every Auth call Supabase's captcha protection checks now carries a Cloudflare Turnstile token: sign-in with a password (`/connexion`, which staff also use) or a Google ID token, sign-up, the password-reset request, the sign-up and e-mail-change confirmation resends, and the current-password re-check of the Security page (password change, e-mail change, account deletion). One invisible widget for the whole tab (`webapp/src/lib/captcha/authCaptcha.ts`, "interaction-only", the same site key `NEXT_PUBLIC_TURNSTILE_SITE_KEY` as the newsletter): most visitors never see it, and Cloudflare shows its box in the corner of the screen when it needs a click; tokens are single use, so the widget is reset after each. Nothing is blocked in the browser: without a site key, or when the script cannot load, the call goes out without a token and Supabase decides — it ignores the token while its protection is off, and answers `captcha_failed` while it is on (mapped to its own message on the sign-in and sign-up pages, to the existing generic failure elsewhere). Not checked by Supabase, so not touched: the e-mail link verification of `/auth/confirm` (`verifyOtp` with a token hash) and the Google redirect sign-in. **To do by the owner:** Authentication › Attack Protection › Enable captcha protection, provider Cloudflare Turnstile, with the Turnstile secret key of the same site (the one the newsletter function uses as `TURNSTILE_SECRET_KEY`), and add the production and preview hostnames to the Turnstile site. **To confirm:** (a) a visitor whose browser blocks challenges.cloudflare.com can no longer sign in once the protection is on (the message says to allow it); (b) the local stack used by CI keeps the protection off.
136. **Dashboard "first steps" card, its closing saved on the account** (owner's request, 2026-11-11, migration `20261111181710_member_preferences`). A new member (account under 14 days old) sees a checklist under the greeting in `/compte` — profile (phone + delivery address), shop (a favourite or an order), 3D Studio, Academy — each ticked from what the account really holds, no simulated state (`webapp/src/lib/memberWelcome.ts`, `components/account/dashboard/WelcomeChecklist.tsx`). The member can close it: `member_preferences.welcome_dismissed_at`, so it stays closed on every device; no reward at the end (owner's choice). **The Studio step is offered even to someone who already bought or holds a course**, and left out only for a subscriber (active, pending, staff) and for an account created from a Studio page — recorded as the auth sign-up metadata `signup_origin = "studio"` (`registrationMetadata`, set when the sign-up started from a `/studio-3d` page; **not set for a Google sign-up**, which carries no such metadata). A started trial (active or over) ticks the step. Display state only: nothing is granted by it. Not added to `my_personal_data()` (a display flag, no personal content).
135. **The 3D Studio is sold, collected and invoiced by the website publisher** (owner's decision, 2026-11-11: "the shop's profits go to PIMP TON SMILE, the Studio's to DoDigital; keep the current Stripe account for the Studio — it is DoDigital's —, PIMP TON SMILE's account will be created"; migration `20261111093306_studio_seller_publisher`). **Two sellers:** the seller (PIMP TON SMILE, `store_settings` identity columns) sells the goods, the Academy courses and gift cards under the terms of sale; the website publisher (DoDigital, `store_settings.publisher_*`, decision 121) sells the 3D Studio subscriptions under their own **3D Studio subscription terms** (`webapp/src/data/legal/studioTerms.ts`, `/fr/conditions-abonnement-studio` / `/en/studio-subscription-terms` — English wording to confirm by the owner —, version `STUDIO_TERMS_VERSION` guarded by a fingerprint test like the terms of sale). The terms of sale no longer mention the Studio (version `2026-11-11`) and point to the Studio terms; the legal notice has a "3D Studio seller" section; the privacy policy names two controllers — the seller for the account, orders, Academy, loyalty, newsletter and customer service, the publisher for the Studio subscription, creations, Glowbook and try-on (**to confirm with a lawyer**, the shared account in particular); the terms of use link to the Studio terms. `storeFill.ts` fills the Studio terms through markers of their own (`[[!Vendeur du Studio…]]` / `[[!Studio seller…]]`), never the seller's. **Invoices:** Studio invoices and credit notes freeze the publisher (`private.studio_invoice_seller()`), in their own gapless series `FS-YYYY-NNNNNN` / `AS-YYYY-NNNNNN` (prefix to confirm with the accountant), under the publisher's own VAT regime (`publisher_vat_franchise`, Settings › Store › Publisher; the Studio's price notes read it, `useStudioVatFranchise()`); a credit note follows the invoice it credits. The PDF keeps the Global Toothgems logo and layout, says "3D Studio subscription Global Toothgems, sold and invoiced by DoDigital — <legal name>" above the lines and carries the publisher's legal mentions in the footer. The test-mode Studio invoice `FA-2026-000004` keeps its FA number. **Contract confirmation:** the Studio subscription confirmation carries the Studio terms PDF (decision 130's machinery, `contractTermsForEmail("studio")`), and `consent_records.terms_version` records `STUDIO_TERMS_VERSION`. **Payments:** one Stripe account per business (`supabase/functions/_shared/stripeAccounts.ts`): the Studio keeps the original `STRIPE_*` secrets (DoDigital's account); the shop, Academy and gift cards read `SHOP_STRIPE_SECRET_KEY` / `SHOP_STRIPE_PUBLISHABLE_KEY` / `SHOP_STRIPE_WEBHOOK_SECRET` (PIMP TON SMILE's account) and borrow the Studio's keys **only while they are test keys** — with live keys and no shop key, the shop checkout answers `payment_unavailable` and `refund-order` fails, so the shop's money is never collected on the publisher's account. `stripe-webhook` verifies against each endpoint's secret and acts only for the businesses that endpoint carries (an order event on the Studio's endpoint, a non-withdrawal refund there, or a withdrawal refund on the shop's endpoint is acknowledged and ignored); read-backs use the account that owns the object. Gift cards, promotion codes and loyalty rewards never apply to the Studio (its checkout is separate). **Before launch (owner):** create PIMP TON SMILE's Stripe account, set the three `SHOP_STRIPE_*` secrets, give each account its own webhook endpoint to `stripe-webhook` with only its own events (`supabase/functions/.env.example`); test orders paid before then live on DoDigital's account. **To confirm:** (a) the FS/AS prefix and the publisher's VAT franchise with the accountant (its thresholds are shared with its other activity; EU OSS for electronic services above €10,000); (b) the controllers' split; (c) the publisher's e-mail printed on Studio invoices is a personal address; (d) the publisher's consumer mediator (to supply). **Deployed 2026-11-11** from the pinned commit `b6a992d`: `stripe-webhook`, `create-checkout-session`, `refund-order`, `create-studio-subscription`, `studio-manage-subscription`, `studio-withdraw`, `studio-billing-setup`, `send-pending-emails`, `email-showcase` (unsigned or anonymous calls answered 400/401 right after).
134. **The back office has no sign-in page, and staff need a second factor** (owner's decision, 2026-11-11: "the admin route is too well known and easy to discover"; option chosen among those proposed: one sign-in page for everyone). **Hiding:** `/admin/connexion` is gone; staff sign in on `/connexion` and open the back office from the member space; every `/admin` address answers the site's ordinary 404 to anyone who is not an active staff member, signed in or not (proxy rewrite to an address no route matches, then `notFound()` on the server, then the browser zone; Next.js keeps an `x-middleware-rewrite` header on that response, which a determined visitor can notice), and robots.txt no longer names `/admin`. Obscurity only reduces noise — the route names are in the public JavaScript bundles — the protection is the second factor. **Second factor:** migration `20261111094500_staff_mfa_required` makes `private.is_staff()` and `private.has_permission()` (so every back-office policy, staff RPC, `my_permissions()` and the Edge Functions that read it with the caller's JWT) require a session at assurance level `aal2` (Supabase Auth MFA, TOTP in an authenticator app); a staff member at `aal1` sees the second-factor screen (`webapp/src/components/admin/StaffSecondFactor.tsx`: enrolment with QR code and key the first time, a 6-digit code afterwards). Also affected, accepted: the Studio's staff access and tier call `is_staff()`, so staff use the Studio as staff only once past the second factor; the Lounge, Glowbook and share-branding checks join `roles.is_staff` directly and are unchanged. **Sequencing:** the migration locks every staff member out of any deployed front that lacks the screen, so it is applied only once the screen is live in production (to do by the owner or on their go-ahead), and every staff member enrols right after — until they do, someone holding a staff password could enrol their own authenticator. **To confirm:** (a) recovery of a lost authenticator: the owner deletes the factor in the Supabase dashboard (Auth › Users), the staff member enrols again at the next sign-in — no back-office screen for it; no recovery codes (Supabase offers none); (b) a second-factor session lasts as long as the Supabase session (no re-check after a delay); (c) the captcha on sign-in: the token is sent since decision 137; enabling the protection in the Supabase dashboard is the owner's step.
133. **3D Studio: the Essential plan revised** (owner's request, 2026-11-11: "Essential gets the Global Toothgems
     templates; it no longer gets the social posts, the front view, the placement sheet and the share links"). Migration
     `20261111093241_studio_essential_plan_tools` (applied with the previously approved `20261026190000`, also applied
     that day). Templates: any Studio tier (`private.studio_templates_allowed()`); collections stay Artist and up.
     Share links: created only from the Artist plan up (`private.studio_share_links_allowed()`); an owner below Artist
     can still disable a link; **the existing links of an owner below Artist no longer open** (viewer, preview card,
     card render) and come back as they were on an upgrade — like folders and the Glowbook (**confirmed by the
     owner on 2026-11-11**). Posts, front view and placement sheet are drawn in the browser from the member's own creation: only the
     screens hold them back (`STUDIO_PLAN_FEATURES.posts` / `clientTools`, locked rows opening the plan panel). The
     estimate sheet and the plain PNG snapshot (and its system share sheet) stay open to every plan (assumption: the
     owner's "fiche client" is the placement sheet, as on the plan cards). A trial counts as Essential, so the 48-hour
     trial now has the templates and no longer the front view, placement sheet, links or posts. Suites:
     `studio_templates_validation.sql` (T10), `studio_share_branding_validation.sql` (B8), `studio_try_on_validation.sql` (T2).
132. **Members' Lounge moderation (DSA / LCEN)** (owner's request, 2026-11-10, after the audit of 2026-11-09: "add moderation to the members' lounges so they comply with the DSA (art. 16, 17, 20) and the LCEN (art. 6) before opening them to customers"; migration `20261110124815_lounge_moderation`, see *Members' Lounge moderation*). **Applied and deployed 2026-11-11** (owner's go-ahead): the migration after `20261109213000_order_withdrawals` (whose `my_personal_data()` is the base of this one), both run by the owner with the CLI; `send-pending-emails`, `purge-storage-objects` and `submit-contact-request` deployed from the pinned commit `cb9e91e` (anonymous calls refused, sweep and Storage purge 200; a first report and deletion made on the project that morning produced a delivered statement of reasons and report outcome). Built: reports of messages and images (members), the contact category `illegal_content` (anyone), hide / restore / delete / mute / exclude / lift with a mandatory statement, statements of reasons and outcomes by e-mail, complaints within 6 months, blocks between members, `/compte/moderation`, `/admin/salons`, export / erasure / purge. Private messages stay closed (decision 118); every piece works on a private message should they reopen (moderators would then read a reported private message — to accept at reopening). **Agent's choices, all reversible, decided 2026-11-11 (legal points in the lawyer checklist):** (a) a **new permission `moderate_community`** (manager and admin), rather than `moderate_reviews`: deciding about members (mutes, exclusions) and unlawful content is a different responsibility from product reviews and Glowbook pages, and the owner can give one without the other; (b) **handling time** stated in the terms of use: "usually within 2 working days", manifestly unlawful content "without delay" — nothing enforces or measures it except the median shown in the counters; (c) reasons (unlawful content with ten categories modelled on the DSA transparency categories, harassment, spam, someone else's personal data, other) and the limits (one report per member and message, 10 an hour and 30 a day, explanation 10–2 000 characters); (d) mute durations offered 1 h / 24 h / 7 d / 30 d (the database accepts 5 minutes to 1 year), an exclusion lasts until lifted; team members cannot be sanctioned; **no automatic sanction after N reports** (not built, by design); (e) the statement goes to the member concerned only; reporters get the outcome, and the statement only for a dismissal (it is written for them then); reporters' names are shown to moderators (to judge bad faith), never to the author; (f) complaints: answered by any moderator — the screen suggests someone other than the author of the decision (DSA art. 20(6) asks for appropriately qualified staff, not a different person) — reversed: a hidden message comes back, a mute or exclusion is lifted, a reporter's report returns to the queue, a deleted message cannot be restored (the answer says so); (g) non-members notify through the existing contact form rather than a public form on the lounge: the lounge is closed to them (there is nothing they can point at but a description), and the form already has the honeypot, address limit, attachments, acknowledgement e-mail and ticket workflow; the notice is not linked to a message automatically — the moderator finds it in the lounge and decides from `/admin/salons`; (h) **retention**: texts (reporters' explanations, the content copy, complaint texts) 12 months after the decision unless a complaint is open, rows 3 years, events a day, blocks until the account goes — written in the privacy policy; (i) **erasure**: the reporter's settled explanations, the content copy of decisions about the erased member and their complaint texts go with the account; **LCEN art. 6 II and décret n° 2021-1362** ask hosts to keep the data identifying the author of a content for one year after its removal — this build deletes them at erasure (GDPR first); a lawyer should say whether a decision's copy and target must instead outlive an erasure for a year; (j) **DSA scope**: the lounge is open to course holders only, which arguably makes it a hosting service rather than an online platform (no dissemination to the public), and a micro or small enterprise is exempt from art. 20–28 and 15 anyway (art. 19): art. 16 and 17 apply, art. 20 (complaints) and the out-of-court bodies mention are implemented by choice; no yearly transparency report is published (the counters in `/admin/salons` are its basis) and no statement is sent to the Commission's database (art. 24(5), platforms only); (k) the **single point of contact** (art. 11–12) is the store's support e-mail, stated in the terms of use, French or English. Not built: editing or deleting one's own message, in-app notification of a decision (e-mail and the page only), linking a contact ticket to a message, trusted flaggers (art. 22, platforms only).
131. **Online withdrawal function for shop orders** (audit of 2026-11-09, owner's request: L221-21 C. conso. as amended by ordinance n° 2026-2, applicable since 19 June 2026; migration `20261109213000_order_withdrawals`, Edge Function `order-withdrawal`; see *Shop withdrawals*). **Applied and deployed** (owner's go-ahead): migration run by the owner with the CLI on 2026-11-11; `order-withdrawal`, `refund-order` and `send-pending-emails` deployed by the owner's CLI on 2026-11-10 and redeployed from the pinned commit `cb9e91e` on 2026-11-11 (anonymous calls refused). The French texts (L221-21, D221-5) could not be read from this session (Légifrance and the law blogs were unreachable); the labels follow article 11a of the directive ("withdraw from contract here" / "confirm withdrawal"): **"Se rétracter du contrat ici"** and **"Confirmer la rétractation"**, to check against D221-5 with a lawyer. **Agent's readings, all reversible, decided 2026-11-11 (legal points in the lawyer checklist):** (a) start of the period — the last parcel's `delivered_at`, else the later of its estimated delivery and its shipping date + the promised maximum delay in working days (7 when none); receipt day not counted; Saturday/Sunday carried to Monday, public holidays not carried; withdrawal open before delivery; (b) proof of unsealing — the customer's own declaration per sealed line, the team checking the parcel on receipt and refusing (`unsealed_hygiene`) if needed; the hygiene flag is set for the categories gems and lip-gloss only (`products.withdrawal_hygiene_seal`), the equipment category (composites, primers, etch gel…) and the kits are **not** flagged and need the owner's list — no back-office switch yet; (c) guests — a signed link (48 h) e-mailed to the order's address after order number + e-mail, rather than a declaration on number + e-mail alone (an address alone does not prove access to the mailbox; the neutral answer prevents enumeration), protected by honeypot, 10 requests / hour / IP, 3 / hour / order+e-mail and Turnstile (the newsletter's keys, set by the owner on 2026-11-08: the function reads the same `TURNSTILE_SECRET_KEY`, the page the same `NEXT_PUBLIC_TURNSTILE_SITE_KEY`); (d) initial delivery costs — the suggested refund adds the order's delivery only when every physical unit comes back, and the team lowers it to the cheapest standard rate for an express delivery (L221-24); a partial withdrawal refunds no delivery — to confirm (some readings refund the delivery pro rata); (e) professionals — a "consumer" box on the declaration (no B2B data at checkout); (f) the acknowledgement repeats the declaration (order, name, lines, date and time in Paris time), the return address from Settings › Store, the 14 days to send back, return costs on the customer and the refund timing; no e-mail on refusal or return received (the customer sees the state on their order page; a guest only by e-mail on refund); (g) the declaration cannot be cancelled by the customer; one declaration per unit (no double declaration), a refused declaration frees its units; (h) withdrawals are never purged (contractual record kept with the order). Not built: a back-office list of all withdrawals, return labels, refusal e-mail. The terms of sale, returns page and FAQ describe the function; the terms' text changed, so `TERMS_OF_SALE_VERSION` is now **2026-11-10** (decision 130's fingerprint test updated, `npm run sync:documents` run): the functions that attach the terms (`create-checkout-session`, `stripe-webhook`, `send-pending-emails`, `create-studio-subscription`, `email-showcase`) send the 2026-11-09 text until redeployed — to deploy together with this migration, since the new text describes a function the project does not have yet.
130. **Terms of sale on a durable medium with every contract confirmation** (audit of 2026-11-09, owner's request, closing the "durable medium" point of decision 126; art. L221-13 of the French Consumer Code). Migration `20261109194750_terms_of_sale_version`. **Version:** the terms of sale carry their own version, `TERMS_OF_SALE_VERSION` in `webapp/src/data/legal/terms.ts` (the ISO day they took effect, also the page's "last updated"; first version `2026-11-09`), guarded by a Vitest fingerprint of the text (`termsDocument.test.ts` fails when `terms.ts` or the rules it quotes from `policies.ts` change without a new version). **Kept with the contract:** `orders.terms_version` (goods, courses and gift cards bought; written by `create-checkout-session` after `create_order()`, frozen; an unpaid order whose version cannot be written is released and the checkout answers `server_error`, an order already paid in full by gift cards stands) and `consent_records.terms_version` on the Studio's `studio_immediate_access` row (recorded at Pay by `create-studio-subscription`). **One text source:** the PDF is drawn from the page's own data — `terms.ts`, `policies.ts`, the seller's details filled by `storeFill.ts` (now portable: `LegalStoreDetails`, `addressLines`, `officeAddress`) — by `data/legal/termsDocument.ts` through the documents' template (`lib/documents/template.ts`, which gained a level-2 heading); no new dependency. `npm run sync:documents` copies those modules to `supabase/functions/_shared/legal/` (imports rewritten for Deno; the Vitest sync test fails while a copy is stale). **Sent with:** the order confirmation (one copy covers every contract an order holds: goods, courses, gift cards bought — the gift card delivery e-mail goes to the recipient, who is not the buyer, and carries none; the course enrolment carries none either since (e)), and the Studio subscription confirmation (whose terms include the Studio clause; next to the first `FA-` invoice) — `_shared/email/termsPdf.ts`, in the order's (or member's) language, French or English, file `conditions-generales-de-vente-<version>.pdf` / `terms-of-sale-<version>.pdf`, headed "Applies to: Order GT-… / 3D Studio subscription — <plan>", the seller's legal mentions in the footer; the e-mail footer names the version ("Conditions générales de vente jointes à cet e-mail (PDF) : version du 9 novembre 2026"). The order confirmation still carries no invoice (owner's choice of 2026-11-08). **Safe fallback (agent's choice):** if the PDF cannot be drawn, the full text of the same terms is written into the e-mail as HTML (and plain text), the footer says so, and the failure is logged — retrying on the next sweep was rejected because drawing is local and deterministic (what fails once fails every time) and the order confirmation is not swept at all, while the e-mail body is itself a durable medium. A course enrolment or Studio confirmation never leaves without a terms provider (skipped, retried by the next sweep); if Settings › Store cannot be read, the e-mail waits (sweep) or is not sent and logged (order confirmation, like any database failure there). **Decisions to confirm:** (a) the copy attached is the version this build holds; an order whose recorded version differs (terms changed between checkout and payment, i.e. a deploy in between) is still confirmed with the version in force and logged — the accepted version stays on the order, and the terms say it is sent on request; previous versions are kept in the Git history, not as files; (b) the Studio confirmation carries the terms of sale, not the terms of use, which also govern the Studio as a service; (c) orders, enrolments and subscriptions confirmed before the redeploy received the link only — no catch-up sending; (d) the wording of the terms' clauses on confirmation ("Order confirmation", "3D Studio subscriptions", "Updates to these terms"), changed for this version, with a lawyer. **Deployed 2026-11-09** from the pinned commit `2632088` (after the migration: the order e-mail reads `terms_version`): `create-checkout-session`, `stripe-webhook`, `send-pending-emails`, `create-studio-subscription`, `email-showcase`; each answered as expected right after (unsigned or anonymous calls 400/401). Not yet checked with a real paid test order or a showcase send. **(e) 2026-11-10, owner's request:** the course enrolment e-mail ("your course is ready") no longer carries the terms of sale — a course is only ever bought through an order, whose confirmation already carries the PDF covering every contract it holds; it keeps the waiver repeated word for word. In effect since 2026-11-11: `stripe-webhook`, `create-checkout-session`, `create-studio-subscription` and `email-showcase` redeployed from the pinned commit `cb9e91e` (with `send-pending-emails`, same commit); right after, an unsigned webhook answered 400 `invalid_signature`, an empty checkout 400, anonymous Studio and showcase calls 401. The terms of sale they attach are version 2026-11-10 (decision 131). Not yet checked with a real paid test order.
129. **Omnibus: a struck-out price is only the database's reference price** (audit of 2026-11-09, owner's request: "make the shop's struck-out prices comply with the Omnibus directive (art. L112-1-1 C. conso., directive 98/6/EC art. 6a) and make sure nobody can set an arbitrary struck-out price"; migration `20261109190153_omnibus_price_reference`). See "Omnibus price reference" above. Before: the struck-out price was the free-typed compare-at price of the product form or the price before a promotion, with no price history. Now the compare-at field is gone from the back office (the mock-only "promotional price" too), the database refuses a compare-at value, the price history is written by triggers only, and the shop, the product page, the home rails, the course cards and pages and the cart strike out a price only when `storefront_price_references()` says `reduced` — always the reference price, the percentage computed on it (rounded down). A percentage promotion that cuts a unit price shows that percentage on its badge, or no percentage when nothing is struck. The product page adds "Lowest price in the 30 days before the reduction: X" under a struck-out price; the product form shows the reference price and why nothing is struck (read only). In the cart, a line with a cut for everyone follows the same rule; a line discounted only by the customer's own code or loyalty reward keeps its total before that discount struck out (the arithmetic of their order, not a reduction announcement). **Rules chosen by the agent, decided 2026-11-11; legal points in the lawyer checklist:** (a) **only promotions announce a reduction**: lowering the list price in the product form strikes nothing (a new price), even if it was higher in the last 30 days; (b) **successive reductions** form one series while their periods touch or overlap with no moment at the list price; the reference stays the lowest price of the 30 days before the series started, however long the series lasts — an open-ended promotion keeps its struck-out price indefinitely (a long or permanent "reduction" may be judged misleading: cap to decide); a gap of even a minute starts a new series, whose 30-day window then includes the previous promotion's low price; (c) **less than 30 days of history**: the window starts at the first price known; **no history before the series** (a product put on sale with a promotion from its first day, or a promotion running when this migration was applied) → nothing struck; the history starts on 2026-11-09 with the prices of that day, so a reduction can be struck out only once its item has had a price before it (no reconstruction from `audit_logs`, which records the price changes and could backfill it); (d) **courses are included** (course promotions announce reductions like shop promotions); (e) `exclude_discounted_products` excluded lines with a compare-at price: none has one any more, so a promotion that excluded "already discounted" lines now applies to every line, including lines under an automatic unit cut — redefining "already discounted" as "under a reduction" means changing the discount engine (`private.compute_order_discounts()`), not done; at the time, the shared code BUBU10 (amount off, minimum 80 €) had the flag and kit-application-premium lost its compare-at price (279 over 249); (f) **currency**: only prices in the item's current currency count; a currency change starts the history again; (g) the percentage is rounded down, never overstating the reduction; (h) wording to validate: FR "Prix le plus bas des 30 jours précédant la réduction : X" / EN "Lowest price in the 30 days before the reduction: X" (product page), screen readers "Prix de référence :" before a struck-out amount, the course pages' "Prix de référence (le plus bas des 30 jours précédant la réduction)" (was "Prix habituel"); (i) personalised discounts (codes, loyalty) and conditional offers (minimum basket, x + y, bundles, gifts) are treated as outside the rule and strike no unit price — to confirm with a lawyer; (j) a promotion's own title may still say "-20 %" while the database announces less or nothing: the badge follows the database, the title is the merchant's text. **Validation:** the suite `omnibus_price_reference_validation.sql` passes in CI on an empty database (2026-11-09, run 348); its run on the project was interrupted (the Supabase tool asked a confirmation for the suite's rolled-back deletes, unanswered). `iteration6_validation.sql` P1 now expects the premium kit discounted too (point (e)); `seed.sql` casts its all-null compare-at column. Advisors (2026-11-09): the only new findings are `storefront_price_references()` (anon, authenticated) and `admin_price_references()` (authenticated, checks `manage_products`) as callable security-definer functions — accepted, like `quote_basket()`: they are the read path that keeps the history tables closed.
128. **Courses are sold with the express waiver of the right of withdrawal** (owner's choice, 2026-11-08: "add a checkbox", answering decision 126 (e)). Migration `20261108210525_course_withdrawal_waiver`. A course is digital content supplied at once: under L221-28 13° the right of withdrawal ends when the buyer starts following it, provided they asked for immediate access and expressly waived the right beforehand. When the basket holds a course, the cart shows a checkbox (`checkout.course.consentLabel`, word for word `COURSE_WITHDRAWAL_CONSENT` in `supabase/functions/_shared/courseConsent.ts`, checked by `courseConsent_test.ts`) and sends `course_immediate_access: true`; `create-checkout-session` refuses a course without it (`course_consent_required`, nothing reserved; a guest gets `account_required` first) and records it in `consent_records` (purpose `course_immediate_access`, version `course-withdrawal-2026-11`, source `checkout`) **before** `create_order()`, since an order paid in full by gift cards grants its courses inside it; a waiver that cannot be recorded stops the checkout. `pending_course_enrolment_emails()` also returns the buyer's latest waiver given before the order, and the enrolment e-mail repeats it word for word with its date (`_shared/email/courseContent.ts`): the confirmation on a durable medium (L221-13); an enrolment without a waiver adds nothing. `erase_account()` keeps these proofs like the Studio's (`user_id` cleared). Prerequisite applied the same day: migration `20261106190000_account_privacy_rights` (decision 125) was not on the project although decision 125 called it live; it was run with its own version, without its `private.audit_changes()` section (the superset from `20261108205151` was already there), before this one (the retention purge deletes a course waiver 5 years after it was given, like the Studio's: migration `20261108211113_retention_purge_course_waiver`, decision 127). **Deployed 2026-11-08** from the pinned commit `90ce072`: `create-checkout-session`, `send-pending-emails`, `stripe-webhook`; checked right after (a non-boolean `course_immediate_access` answers 400, a guest buying a course `account_required`, nothing created). Until the storefront that sends the box reaches production (the `dev` → `main` merge), a course cannot be bought there: the deployed function refuses it without the waiver. The terms of sale and the returns page now say the right is lost once a first lesson is opened, and that until then the 14 days still run. **To confirm:** (a) "started" means a first lesson opened — staff check the learner's progress before refusing a withdrawal (no automatic refusal is built); (b) the wording, with a lawyer. Also settled by the owner the same day: the **data controller is the seller** (PIMP TON SMILE), as the privacy policy says (decision 126 (i), the open point of decision 121) — a written processing agreement with DoDigital (art. 28 GDPR) is the owner's to sign. Product pages: 83 of the 100 active gems say "for hygiene and safety reasons, no exchange or return is accepted" (broader than the law allows: the exclusion only covers unsealed goods and never the legal guarantees), the other 17 gems, the equipment, lip glosses and kits say nothing — a corrected sentence was proposed to the owner, not written.
127. **Retention periods enforced by nightly purge jobs** (owner's request, 2026-11-08: the privacy policy validated in decision 126 promised retention periods nothing enforced; migration `20261108205151_retention_purge_jobs`, Edge Function `purge-storage-objects`). Every night (02:15 UTC) `private.purge_expired_personal_data()` deletes: **customer-service tickets** 3 years after the last exchange — the latest of the ticket's creation, last change (status, priority, assignee, first answer, resolution) and its staff notes — whatever their status, with their notes; their attachments, and contact uploads no ticket references after a day (form never sent), go to `private.storage_purge_queue`, emptied at 02:45 UTC by `purge-storage-objects` through the Storage API (SQL cannot delete Storage objects, `storage.protect_delete`); a path leaves the queue only once Storage accepted the removal. **Consent proofs**: a record goes once a later record of the same account and purpose has replaced it for more than 5 years; the latest record of an account and purpose — the consent or refusal in force — is kept however old; a per-purchase proof (`studio_immediate_access`, `course_immediate_access`) and a record no longer linked to an account (erased account, decision 125) go 5 years after they were made. **Newsletter**: a `pending` sign-up never confirmed (never sent to Resend) goes 30 days after its confirmation link expired; `unsubscribed` / `bounced` / `complained` rows are the opt-out list and stay. **Back-in-stock alerts**: 1 year after the alert was sent, 3 years after the request when it never was. **Throttle ledgers** (`promotion_code_attempts`, `gift_card_code_attempts`, `promotion_email_lookups` after a day, `private.rate_limit_hits` after 7 days): what an unused ledger left behind. Orders, order lines, payments, refunds, invoices, credit notes and Studio billing are **never** purged (10-year accounting retention). The audit trail does not keep a copy of what is purged: `private.audit_changes()` records a deletion made during the purge as `{"reason": "retention_purge"}` (decision 125's erasure branch is carried in the same function), the earlier audit rows of a purged ticket or sign-up are redacted to that reason, and each run that deletes something writes one summary row (`table_name` and `actor_role` `retention_purge`, the counts). The privacy policy's retention table states these rules (fr/en). Suite `retention_purge_validation.sql` (9/9 on the project, rolled back); Deno tests for the sweep. `purge-storage-objects` deployed on 2026-11-08 from the pinned commit `5a3f4cb` (entry point on raw GitHub) and called once through `private.call_email_function`: 200, nothing queued. **Safe readings chosen by the agent, to confirm:** (a) the 5 years of a consent proof run from the end of the consent (withdrawn or replaced), not from when it was given — the proof of the consent in force is never deleted; (b) open tickets are purged too once 3 years pass without any exchange; (c) "last exchange" counts staff-side changes (status, notes) — we keep no thread of the e-mails themselves; (d) unconfirmed newsletter sign-ups 30 days after the link expired, back-in-stock alerts 1 year / 3 years — new rules, now in the policy; (e) the purge redacts the existing audit rows of what it deletes — an exception to the audit trail being append-only that gains no privacy today: those tables only audit updates of status, priority, assignee and account, never the text or the address; the redaction can be dropped; (f) the policy now says consent proofs are kept 5 years after the consent ends, but `erase_account()` (decision 125) deletes an erased member's proofs at once (except `studio_immediate_access`): either the erasure keeps them unlinked (this purge then deletes them after 5 years) or the policy adds "deleted with your account" — to decide. `20261106190000_account_privacy_rights` was applied on the project later the same day (under its own version); `private.audit_changes()` there still has the purge branch (checked), and in the repository's order this migration comes after it. Any later migration that re-creates `audit_changes()` must keep both the erasure and the purge cases. Follow-up migration `20261108211113_retention_purge_course_waiver` (applied 2026-11-08): the course waiver `course_immediate_access` (decision 128) is a per-purchase proof like `studio_immediate_access`, deleted 5 years after it was given. **Still without a rule (listed, not purged):** orders and invoices after their 10 years (to purge only once the accountant confirms the start of the period), inactive accounts (no inactivity deletion: the policy says "until you delete your account"), `email_log` (recipient hash only, the idempotency key of each business e-mail — purging it could resend e-mails), `audit_logs` (its own retention to set), `stripe_webhook_events` (no payload, event ids for deduplication), `studio_try_on_requests` (no photo, the daily limit and statistics), `data_export_requests`, `lounge_*` messages and reviews (kept while the account exists, as the policy says), and the providers' own logs (Resend, Stripe, PostHog, decision 125 (f)).
126. **Legal pages completed with workable rules, to validate** (owner's request, 2026-11-08: "I validate most of what is written in the legal documents; mark as done what I have read, complete reliably what can be, replace most of the to-supply items with something workable, I will validate later; list only what is still critical"). No schema change. The terms of sale, terms of use, privacy policy, legal notice, returns, shipping and FAQ no longer carry "[[…]]" markers or "to verify" boxes (the `verify` tone has no user left and was dropped from the page key); what remains is business information to supply, shown as such: the **consumer mediator** (L612-1, the seller must join one) and the **publisher's and seller's telephone numbers** (LCEN art. 6 III and 19 — `publisher_phone` and `phone` are empty on the project although decision 121 says the publisher's was set). The shop's commercial rules are written once in `webapp/src/data/legal/policies.ts` and quoted by every page (`lp()`), so the terms, returns, shipping and FAQ cannot disagree. `storeFill.ts` now also fills the support e-mail, the privacy e-mail and the data controller; the privacy and returns pages are filled on the server like the terms (`app/_public/storePages.tsx`). The shipping page's destinations, rate table and free-delivery thresholds are read live from the shipping zones and rates (`data/legal/shippingGrid.ts`, `lib/shippingGridServer.ts`, same cache as the store details), so the page always matches the cart. `DRAFT_DATE` is 2026-11-08. **Defaults chosen by the agent, all reversible, to validate:** (a) withdrawal for goods 14 days from receipt (the legal minimum), 14 days to send the goods back, return postage paid by the customer on a change of mind, refund processed within 5 working days of receiving the return, express surcharge not refunded, partial returns refund only the items; (b) excluded from withdrawal for hygiene: gems, adhesives, composites and other application products for the mouth once their sealed packaging is opened — **the products must actually be sealed and their pages must say so**; (c) cancellation until the parcel is handed to the carrier; preparation 1–3 working days; customer-service answer within 2 working days; damaged parcel reported preferably within 3 working days; carriers named La Poste (Colissimo), Chronopost or GLS (the values in `shipments`); customs paid by the recipient, a refused parcel refunded without shipping or carrier return charges; (d) customers: consumers and professionals; guest checkout for goods and gift cards, an account for courses and the Studio; gift cards valid 12 months (`gift_card_settings.expiry_months`); courses 24 months of access; the certificate is "neither a diploma nor a state-recognised certification"; (e) **courses stay withdrawable for 14 days even once started**: the checkout collects no express request for immediate performance with acknowledgement of losing the right (L221-28 13°), unlike the Studio's `studio_immediate_access`; adding that consent to the course checkout would let the terms exclude started courses — decided by the owner: the checkbox, see decision 128; (f) Studio subscriptions: the terms of sale now describe the trial, automatic renewal, cancellation at period end, prorated plan changes, suspension on a failed payment and the prorated withdrawal (decision 95); subscribers are told of a terms change 30 days ahead; (g) legal guarantee and hidden-defect wording from L217-3 et seq. and art. 1641–1649 C. civ.; no commercial warranty; liability towards professionals capped at the order amount; French law, Strasbourg courts between professionals; the official model withdrawal form (annex to R221-1) reproduced; (h) terms of use: acceptance by the sign-up checkbox (`consent_records` purpose `terms`), minimum age 15 (and a guardian's consent to order under 18), suspension after an e-mail and 8 days to reply except emergencies, account deletion immediate (decision 125), members' content licensed for display on the site while published, reviews and Glowbook pages checked before publication within about 3 working days, notice-and-action wording (LCEN art. 6 / DSA), members told of a significant change by e-mail 15 days ahead; each artist responsible for the rules of their own practice — **the regulatory status of tooth-gem application and of the products (cosmetic / dental) is for a lawyer**; (i) privacy: the **data controller is the seller** (PIMP TON SMILE), the publisher acting on its behalf — decision 121 left this open, confirmed by the owner on 2026-11-08 (decision 128); providers named from the code: Vercel, Supabase (Paris), Resend, PostHog (EU, consent only), Stripe Payments Europe (processor for payment, independent controller for its own obligations), Google (sign-in and Gemini try-on), OpenFreeMap, Nominatim, the carriers; US transfers on the Data Privacy Framework and standard contractual clauses (each provider's DPF membership to check); retention from decision 125 (a): account data until deletion, accounting 10 years, customer-service requests 3 years after the last exchange, consent proofs 5 years, newsletter until unsubscribing then an opt-out list — enforced by the nightly purge since decision 127, which also made the policy state the exact rules (consent proofs 5 years after they end, unconfirmed sign-ups, back-in-stock alerts); no DPO; CNIL as the authority; no profiling except Stripe's fraud scoring; (j) the legal notice's trademark clause no longer states a registration status. **Also open, not changed here:** the VAT franchise is stated unconditionally — the EU distance-sales threshold (OSS) for goods, courses and Studio subscriptions sold to other EU countries is for the accountant; the order confirmation e-mail linked to the terms but did not carry them on a durable medium (L221-13) — **closed by decision 130** (2026-11-09): every contract confirmation now carries the terms of sale as a PDF in the version recorded on the contract. (k) Owner's go-ahead the same day ("Yes, hide them"): the review bar, the internal notes, the "Draft" badge and the launch checklist of the help centre are gone from the legal pages — the former `internal` blocks became source comments ("Editor's note, never published"), so they no longer reach the page's data either, and the `internal` block kind is gone (`ReviewBar`, `ReviewNote`, `ComplianceChecklist`, `lib/reviewMode.tsx`, `data/legal/checklist.ts` deleted). Business information still missing (the mediator, the telephone numbers) keeps its visible "to supply" marker.
125. **Members export their personal data and delete their account themselves** (owner's question, 2026-11-06: "check that the export and the deletion of a member's account work and are legally viable" — they were simulated in the browser; owner's go-ahead the same day: "set it up with safe defaults"; migration `20261106190000_account_privacy_rights`, Edge Function `delete-account`). GDPR art. 15/20 and 17. **Export:** `my_personal_data()` (security definer, the signed-in account only) returns one JSON archive — account, profile, addresses, consents, newsletter, orders with lines/parcels/refunds/documents (and guest orders placed with the account's **confirmed** address), gift cards bought, loyalty, favourites, back-in-stock alerts, reviews, Academy (entitlements, progress, quiz answers, certificates), 3D Studio (trial, subscriptions, payments, withdrawals, documents, creations, Gem Groups, share links, collections, preferences, logo, Glowbook, try-on requests, feedback), lounge profile/messages/reactions, customer-service tickets (by account or confirmed address), the CRM tags and notes the team wrote, and the list of the member's Storage files; rows pass `private.personal_data_clean()` (no codes, tokens, hashes, provider or staff identifiers, no other member's id). The browser adds 7-day signed links to the files the member may read, and saves the file; nothing is stored on our side. At most one archive every 5 minutes. **Erasure:** the member confirms with their password (or a Google sign-in less than 10 minutes old — the function reads the token's `amr` timestamps) and a typed word; `delete-account` checks the blockers as the member, removes their files from the personal buckets (`private.personal_file_buckets()`), then `erase_account()` in one transaction unsubscribes the newsletter (row kept `unsubscribed` as the opposition list; the Resend sync removes the contact), deletes the consent records except `studio_immediate_access`, writes one audit row (`profiles`, reason `account_erasure`), and deletes the auth user — sessions, identities, profile and everything that cascades from it go. `audit_changes()` no longer copies a row deleted during an erasure (it records the reason only), else the audit log would have kept the reviews' text and the rest. Fixed on the way: `studio_subscriptions`, `studio_subscription_invoices`, `studio_withdrawals` and `consent_records` now take `user_id` null instead of cascading — the cascade used to hit `invoices` (`on delete restrict`), so **a Studio subscriber could not be deleted at all**. The confirmation e-mail (`account_deleted`, fr/en) goes to the address the account had. Blockers (temporary, explained with a link on the page): staff account (the team removes it first), Studio subscription `incomplete`/`trialing`/`active`/`past_due`/`unpaid`/`paused`, withdrawal `requested`/`refund_pending`, an order `pending` whose `expires_at` is in the future. **Safe defaults chosen by the agent, decided 2026-11-11; legal points in the lawyer checklist:** (a) retention — orders, invoices, credit notes (Studio included) 10 years (art. L123-22 C. com.), unlinked from any account; customer-service tickets and their attachments kept (user_id null) until the purge deletes them 3 years after the last exchange, consent proofs 5 years after they end (both enforced since decision 127); **no purge exists** for orders after 10 years, inactive accounts, `email_log` or `audit_logs` (see decision 127's open points); (b) the Studio immediate-access consent is kept without a user link — weak as proof once unlinked, the confirmation e-mail repeating it is the durable record; (c) a running Studio subscription **blocks** the erasure (the contract is being performed) rather than being cancelled by it — a yearly plan can delay an erasure by months; the page says "contact us" to stop it at once; (d) reviews and lounge messages are **deleted**, not anonymised; replies to a deleted message lose their link (`reply_to_id` set null); a private conversation goes with either member (private messages are closed anyway, decision 118); (e) the staff's CRM notes and tags are in the export (the right of access covers them: write them accordingly); (f) the Stripe customer object, PostHog's person and Resend's delivery logs are not erased by us — **PostHog closed on 2026-11-13**: `delete-account` now deletes the PostHog person behind the account id with its events and recordings (`_shared/posthogPersons.ts`, secret `POSTHOG_PERSON_DELETE_API_KEY`, "Person: Write" key; best effort after the erasure, a failure is logged and handled by hand; `delete-account` deployed from the pinned commit `3a365ee` on 2026-11-13, unauthenticated call answered 401); Stripe and Resend unchanged (Stripe keeps payment records for its own obligations; PostHog's person deletion needs a personal API key) — to handle from those dashboards on request; (g) no grace period: the erasure is immediate once confirmed; (h) the privacy policy's retention table was filled from (a) on 2026-11-08 (decision 126). The `data-exports` bucket and the asynchronous statuses of `data_export_requests` are no longer used.
124. **3D Studio on a phone: a notice, not a block** (owner's request, 2026-11-05: "the experience is degraded on a phone, a tablet or a computer is strongly advised"). A phone is a touch device (`pointer: coarse`) whose shorter screen side is under 600 CSS px (`lib/studioWorkspace/phoneNotice.ts`, tablets and narrow desktop windows never see it). The editor opens a dismissible dialog (`PhoneNotice`, workspace dialog `phoneNotice`) once per browser session (sessionStorage), before the first-visit welcome, which opens when it closes; the editor stays fully usable. Texts: `studio.workspace.phoneNotice.*` (FR/EN).
123. **A suspended or deactivated customer loses their courses and their Studio access in the database** (agent's access-rights audit, 2026-11-05, migration `20261105175827_suspended_accounts_lose_member_access`, suite `supabase/tests/suspended_accounts_validation.sql`). Until then only staff and the Members' Lounge tested `profiles.status = 'active'`; for a customer the suspension was applied by the browser alone (`auth.tsx` drops the session), so a suspended member calling the API with their own token kept their Academy courses (`holds_course`, `lock_learner_course`, `learner_courses`, the private media of those courses) and their Studio trial or subscription (`has_studio_access`, `studio_user_has_access`, `studio_user_tier`, `studio_subscription_active`, `studio_access_json`), and could open a new trial. The helper `private.account_active(user)` is now part of each of those checks; rows, entitlements and subscriptions are untouched, so reactivating the account gives everything back. **To confirm**: a suspended member still reads their own orders, invoices and Studio withdrawal (legal rights) and the billing functions read the subscription rows directly (a subscription keeps being billed until the member cancels or withdraws — suspension does not cancel it at Stripe). Also noted by the audit, not changed: (a) `studio_share_creation` and the share links need no Studio access (an expired trial can still create a link, and links stay readable after the owner's access ends, unlike Glowbook pages); (b) Supabase Auth's leaked-password protection is off (dashboard setting, the owner's).
122. **3D Studio: the Swarovski 2058 (Xilion Rose) gems drawn, and packs mixed in the shopping list** (owner's request, 2026-11-03: "look at the latest round gems added to the stock, create them in the 3D Studio with the sizes available, and handle adding to the cart according to the packs available"; migration `20261103184717_studio_xilion_rose_appearances`).
    - **The gems**: 17 round products `swarovski-2058-*` were added in the back office that day (shop shape `xilion-rose`, drawn as the Studio's `round`). They were already in the Studio (decision 81), drawn from their colour family only — Emeraude and Black Diamond (no family) came out clear, Iris and Crystal Vitrail Light took the amethyst family's purple, the coated crystals had no iridescence. Each now has its drawing row: tint measured on its product photo and kept close to the same Swarovski colour in other cuts, iridescent for Crystal AB, Crystal Shimmer and Crystal Vitrail Light.
    - **Sizes** are not drawing data: the Studio offers each gem's active SS options (decision 107). On 2026-11-03, 8 of the 17 sell packs of 20 / 50 / 100 in **SS5 and SS7** (Aquamarine, Black Diamond, Crystal, Crystal AB, Crystal Shimmer, Crystal Vitrail Light, Golden Shadow, Heliotrope) and offer exactly those two sizes; Emeraude and Iris sell packs of 20 / 50 / 100 **without a size** and Dark Joncquil, Fuchsia, Light Siam, Peridot, Rose, Rose Clair and Saphir have **no option at all** — these 9 are offered in the fallback SS2 / SS5 / SS7 until the back office gives them their pack × SS options (the agent did not create variants: prices and stock are the owner's). All 17 had no stock that day, so the shopping list shows them out of stock and "Add to cart" leaves them out.
    - **Packs mixed** (`coverPieces`, `lib/studio3d/gemCatalog.ts`; supersedes the "ONE variant" rule of decision 81): each group of pieces (gem, colour, size) is bought in the cheapest mix of its packs, each pack any number of times — with 20 at 6.90, 50 at 11.90 and 100 at 22.90: 12 pieces → 20; 25 → 50; 70 → 50 + 20; 120 → 100 + 20; 150 → 100 + 50. Exact (a dynamic programme over the number of stones); ties go to fewer stones, then fewer items. In stock first: out-of-stock packs are used only when none of the group's packs is in stock, and the line is then shown out of stock. A line holds its items (`EstimateLine.items`); "Add to cart" puts one cart line per item, the count on the button and in "Buy the gems" counts items; the shopping list, estimate sheet and placement sheet write "1 × Pack of 100 + 1 × Pack of 20". Still an indicative value: the cart is priced again by `create_order()`.
    - **To check by the owner** (catalogue data, not changed by the agent): the packs of Black Diamond, Emeraude and Iris have no price of their own, so every pack costs the product's 6.90 — the pack of 100 at the price of the pack of 20 (the Studio then picks the biggest pack that is not wasteful, and the cart charges it 6.90 too); the "Pack de 20 · SS5" of Crystal AB, Crystal Shimmer, Crystal Vitrail Light, Golden Shadow and Heliotrope also use the product price (6.90 / 7.90, which looks intended). Emeraude and Black Diamond have no colour family (shop colour filter); Crystal Vitrail Light and Iris are filed under amethyst. Agent's choices, decided on the owner's delegation (2026-11-11): (a) the tints; (b) mixing packs rather than a single pack size per line.

121. **The website publisher is not the seller** (owner's request, 2026-11-01: "the site will not be held nor shown as published by that entity [the seller], but by my micro-entreprise DoDigital"; migration `20261101100230_store_publisher`). `store_settings.publisher_*` (trading name, legal name, legal form, registration, one-line address, e-mail; Settings › Store › "Publisher, publication and hosting") identify the business that holds and publishes the site. The legal notice opens with the publisher ("owned and published by …") and then a **Seller** section (the existing identity columns: who the goods, courses and subscriptions are sold by, LCEN art. 19); the intellectual-property holder and the terms of use's publisher and IP clause are the publisher; invoices, credit notes, the order form and the terms of sale's seller clause stay the seller's. A missing publisher keeps its "to supply" markers — it never falls back to the seller. Not decided by the agent (left as it was): the privacy policy still says the data controller is "the website publisher", with its fields to supply — who is the controller (seller, publisher, joint controllers, or the publisher as processor) is for the owner / a lawyer. DoDigital's details set on the project the same day from the owner's message: "Doryan Dillenseger EI" (the "EI" mention required next to an individual entrepreneur's name), "Entreprise individuelle (EI), micro-entreprise", "SIRET 844 422 725 00037 · APE 6201Z", 2 rue Cassiopée, 67000 Strasbourg, e-mail and telephone; publication director Doryan Dillenseger, "Entrepreneur individuel". (b) Owner's choice the same day ("option B"): invoices, credit notes and the order form have **no seller block** at the top — the buyer only; the seller's full legal identity (trading name, legal name with EI, legal form, registration, VAT number, address, e-mail) is printed in the legal mentions at the foot of every page. French law (art. L441-9 C. com., art. 242 nonies A ann. II CGI) and the VAT directive (art. 226) require these mentions on the invoice, not in a given place; to confirm with the accountant. Hosting (legal notice) set the same day: Vercel Inc. (site; address used: 340 S Lemon Ave #4133, Walnut, CA 91789 — sources disagree, the agent could not open vercel.com: to check against Vercel's own legal page) and Supabase (database and files, EU region Paris; 970 Toa Payoh North #07-04, Singapore 318992 — same caveat). **`email-showcase`** (Edge Function, 2026-11-01, owner's request: "send me one e-mail of every kind the site can send"): `POST {to}` with `x-internal-secret`, sends one sample of each of the 14 `email_templates` through the real pipeline (layout, content builders, invoice / credit-note PDFs with the store's current seller identity, example numbers `FA-EXEMPLE-…`) plus the two Supabase Auth templates, with example data only (event keys `showcase:<run>:<template>` in `email_log`); called from SQL with `net.http_post` and the Vault secret. First run on 2026-11-01 to the owner: 16 sent. (a) Migration `20261101102156_store_publisher_phone` adds `publisher_phone` (an individual publisher must publish a telephone number, LCEN art. 6 III 1), same format check as `phone`.
120. **Trading name "PIMP TON SMILE"; the entrepreneur's name only where the law requires it** (owner's request, 2026-11-01: update the legal information and the documents with the business's details — societe.com, SIREN 913 636 957 —, "show the first and last name only where necessary, without putting it forward; use the trading name 'PIMP TON SMILE'; same for invoices: describe the business in a small box, not put forward but visible as the law requires"; migration `20261101094412_store_trading_name`). `store_settings.trading_name` (Settings › Store, "Trading name") is distinct from `store_name` (the site's brand, Global Toothgems) and `legal_name` (the legal identity: for an EI, the entrepreneur's name). Invoices and credit notes freeze it (`private.invoice_seller()`): the seller block shows the trading name, address and e-mail; the legal identity, legal form, registration and VAT number are printed in the small legal mentions at the foot of every page ("PIMP TON SMILE · <name>, Entrepreneur individuel (EI) · Immatriculation SIREN …"); documents issued before keep their snapshot (no trading name: the block keeps the legal name and numbers as before). The order form follows the same rule. The legal notice says the site is published by the trading name and lists the legal name in its field list ("Dénomination"; LCEN art. 6 III requires an individual's name); the terms of sale name the seller "PIMP TON SMILE — <name>, Entrepreneur individuel (EI)" with its office and registration (L221-5 / L111-1 Code de la consommation); the terms of use and their IP clause name the trading name (`data/legal/storeFill.ts`, pages read the store row on the server). Values set on the project the same day from the owner's registry extract (INSEE / RNE): trading name "PIMP TON SMILE" (as registered, upper case everywhere at the owner's request), legal name, legal form "Entrepreneur individuel (EI)", "SIRET 913 636 957 00031", VAT number FR22913636957, office 4 boulevard de Lyon, 67000 Strasbourg. The website publisher is another business (decision 121). To confirm: the legal-form wording, showing the VAT number under the franchise, and redeploying the Edge Functions that e-mail invoices (`_shared/documents/` synced, not redeployed by the agent).
114. **VAT franchise: the shop charges no VAT for now** (owner's request, 2026-10-26: "for now the e-commerce turnover is a micro-entreprise not subject to VAT — take it into account in the invoices and everywhere it appears, with the legal article on the invoices"; migration `20261026185024_vat_franchise`). One switch, `store_settings.vat_franchise` (Settings › Store › Business identity, on by default), not a deletion of VAT: the rates of the VAT tab stay configured and apply again to **new** orders the day the switch is turned off. While it is on, `vat_rate_bp()` returns 0 for every destination and category, so orders, invoices and credit notes carry no VAT; the prices customers pay do not change (the amounts that were "VAT included" are now the prices). Invoices and credit notes freeze the regime in `seller.vat_franchise`: under the franchise the PDF has no VAT column, VAT total or breakdown, says "Total" (not HT/TTC) and carries **"TVA non applicable, art. 293 B du CGI"** — kept in French on English documents, followed by an English gloss; a credit note follows its invoice's regime; documents issued before keep their layout. The storefront reads the switch (`lib/vatRegime.ts`): the checkout and Studio payment steps say the mention instead of "VAT included", the footer adds it after the copyright (nothing while unknown, mock mode included); the order confirmation e-mail says "Total" when the order's VAT is 0; the terms of sale state the franchise. Orders keep the regime they were created under (`orders.vat_franchise`, migration `20261026190347`): an order created under one regime and paid after the switch changed is invoiced under its own; orders created before the franchise keep their VAT. The 3D Studio price notes (plans, locked editor, subscribe page) also take the regime's wording. To confirm with the accountant: (a) that the business is under the franchise and its thresholds are watched (the switch is manual: nothing turns it off when the threshold is crossed); (b) EU distance sales (the €10,000 EU threshold) and sales outside the EU; (c) the English gloss; (d) ~~the 3D Studio subscriptions are billed by Stripe with its own invoices~~ — since decision 115 the Studio invoices are ours and carry the mention like the shop's; (e) a VAT number is still shown on invoices when one is filled in (a micro-entrepreneur may hold one for intra-EU purchases); (f) the admin hints "TVA incluse" in statistics and the course price "(TTC)" were left as they are.
118. **Members' Lounge: private messages closed for everyone** (owner's request, 2026-10-29: "disable the private message option of the artists' lounge entirely; it must not be reachable for now; keep the logic behind it, but make it inaccessible to anyone"; migration `20261029181630_lounge_direct_messages_closed`). See "Members' Lounge" above. The database is the authority (switch, insert triggers, restrictive read policies); the webapp hides every entry point behind `LOUNGE_DIRECT_MESSAGES_ENABLED`. Agent's choices, decided on the owner's delegation (2026-11-11): (a) staff are closed out too ("anyone"); (b) the conversation that existed on the project (1 conversation, 1 message on 2026-10-29) is kept, unreadable, not deleted; (c) `lounge_overview()` still returns the caller's own conversation metadata including the last message preview (not rewritten, to keep the logic untouched) — the webapp ignores it; closing it too means a new version of that function; (d) mute / mark-read on a conversation id stay possible (no content involved).
117. **Kits and packs whose stock is their products' stock** (owner's request, 2026-10-28: "the lip gloss trio is sold beside the three glosses; a trio sold must take one of each, five of one gloss sold must take five trios away; later the professional and DIY kits; stock managed on the single products only"; migration `20261029181304_product_bundles`). A product becomes a kit by listing its components in the back office; the database derives the kit's stock (kits the components can make) and an order of a kit reserves, then sells, its components. Rejected alternatives: syncing two counters both ways (drifts, double movements), expanding a kit into hidden order lines (invoices and parcels would show them). Agent's choices, decided on the owner's delegation (2026-11-11): (a) **the owner decides what becomes of a product's own count when it becomes a kit** — it is replaced by the calculation (the form warns: pre-assembled trios must first be added to each gloss's stock; on 2026-10-28 the TRIO had 10 units of its own); (b) components may be drafts (a part never sold alone carries its stock); their status is not checked at checkout; (c) one row per product and option, several options of the same product in one kit are possible in the database but the form picks one option per product; (d) the daily stock digest lists the components, not the kits; (e) a refund with restock of a kit returns all its components (no partial return of one product of a kit from the back office); (f) back to an ordinary product, the count restarts at 0; (g) the storefront does not list a kit's contents yet (the table is publicly readable for active kits).
116. **Product titles, descriptions and search tags reviewed** (owner's validation, 2026-10-28, after an audit of the 102 active products; migration `20261028143732`). Every active product now has a French and an English description, `meta_title` (≤ 70) and `meta_description` (≤ 170): the product page uses them for the `<title>` (the site appends " · Global Toothgems", so search titles carry no brand) and the meta description (`productMetaDescription()`, `lib/catalog/productMeta.ts`; the structured data keeps describing the product itself). The 77 Swarovski® gems share one structure (accroche, one sentence per shape, "Détails du produit", one hygiene line) generated from the shape and colour in the name; sizes: baguette 3,7 × 1,9 mm, heart 3,6 mm, diamond shape 3 × 5 mm, StarFlower 4 mm; quantity "10 ou 25" for hearts, StarFlowers and products that sell packs of 10 and 25, else 10. Names: "Coeur" → "Cœur", the 18k gold pieces written "… en or 18 carats" / "18k Gold …", "Sapphire- Baguette" fixed; the CLEO French text, stored in the English column, moved to French and the address `global-lipgloss-nova` became `global-lipgloss-cleo` (old address: 404, decision 37). **Unknown data is written `[A COMPLÉTER]` in the text, to find with** `select name from products where description like '%A COMPLÉTER%'` **(45 products on 2026-10-28):** size and quantity of Navette, Raindrop, Rivoli Star and Square, the 18k gold pieces' fineness / size / packaging, the contents of the DIY and Pro kits, the lamp's optical power, the cotton swabs', glasses' and organizer's details, BAD HABIT's tagline and volume. Agent's choices, decided on the owner's delegation (2026-11-11): (a) the shape sentences and the 18k motifs' descriptions are interpretations of the names, to check against the photos; (b) "sans plomb" / "hypoallergénique" are the existing claims, kept, and "100 % sûrs à utiliser" was dropped — legal wording to confirm with a lawyer; (c) the new French texts use the informal "tu" (the brand's tone in the kits and lip glosses); (d) colour names are not unified between families (Rose Clair vs Light Rose), nor the French / English product names beyond the fixes above; (e) the variants' names ("Eclair en Or 18ct"…) and the English slugs were left alone; (f) `spec_material` of "SWAROVSKI® Baguette - Rose" reads "20" (an old entry, not touched).
115. **3D Studio invoices and credit notes are ours, not Stripe's** (owner's question, 2026-10-26: could invoicing be handled entirely in-house; direction agreed: Stripe keeps collecting, the database becomes the single source of legal documents; migration `20261026211240_studio_invoices`). Stripe stays the payment engine (subscriptions, recurring charges, proration, retries, refunds). When `stripe-webhook` records a paid Studio invoice it also passes its total and its lines, read with `invoices.listLineItems` (amount, price, period, proration flag); a trigger on `studio_subscription_invoices` issues the `FA-` invoice in the same transaction — same sequences (`take_invoice_number`), same seller snapshot and VAT regime (decision 114: "TVA non applicable, art. 293 B du CGI"), same immutability, same PDF template (`lib/documents/`, line kind `subscription`: plan, billing interval, period, or "prorated adjustment"; a proration credit is a negative line; account credit used shows as "Paid from your account credit"). A withdrawal refund confirmed by the verified `refund.*` webhook (`settle_studio_withdrawal_refund`) issues the `AV-` credit note against the first invoice, for the refunded amount ("unused share", days used). Members read and download their documents on `/compte/studio` (`lib/studioInvoices.ts`, RLS: owner and active staff); staff print the period's documents from `/admin/statistiques` (panel "3D Studio invoices"). E-mails: the subscription confirmation carries the first invoice; each later paid invoice (renewal, plan change) gets `studio_invoice` with its PDF; the withdrawal acknowledgement goes out at once without it, and `studio_credit_note` sends the credit note once the refund is confirmed (migration `20261026213754`: attaching it to the acknowledgement could race the confirmation). Agent's choices, decided on the owner's delegation (2026-11-11): (a) **a Stripe invoice whose total is zero or negative** (a downgrade credited to the customer balance) gets no document — the credit appears on the next invoice as "Paid from your account credit"; the accountant may want a credit note instead; (b) when the webhook's lines cannot be trusted (unknown price, not adding up to the total) the invoice carries one line for the subscription's plan and the total, rather than refusing the payment record; (c) the buyer is the member's e-mail and default billing (else shipping) address, else their name — Stripe's billing details are not read; (d) outside the franchise the rate is the store country's standard rate, VAT included (EU B2C digital services are normally taxed at the customer's country — OSS — to confirm before the franchise is turned off); (e) an invoice row can no longer be deleted (`on delete restrict` toward `studio_subscription_invoices` and `studio_withdrawals`), which also blocked deleting an account that holds Studio invoices (legal retention) — since decision 125 the Studio billing rows outlive the account with `user_id` null instead; (f) Studio invoices paid before this migration (test mode) have no document — Stripe's numbered documents remain for them, and the `FA-` sequence simply continues; (g) a refund made by hand in the Stripe dashboard on a Studio invoice still issues no credit note (decision 95 (f)). **For the owner:** turn off Stripe's customer e-mails for invoices and receipts (Dashboard › Settings › Customer emails: "Successful payments" and "Finalized invoices"), so a member never receives two documents with two numbers.
119. **A product's variants can combine options (colour × plug…)** (owner's request, 2026-10-29: the curing lamp, sold in silver or black, must also be offered with a European or a US plug; owner's choices: same price for every combination, stock kept per combination; migration `20261029190000_product_variant_options`). Rejected: four flat variants (mixed buttons, the silver photo linked twice) and a cart-line "sub-option" outside the variants (the plug would be neither stocked nor invoiced as a distinct article). See "Product options" above. Agent's choices, decided on the owner's delegation (2026-11-11): (a) at most 3 options and 30 values per option; (b) a combination's name is its values joined by " · " ("Argent · Prise EU"), so value names should read on their own in the cart and on invoices; (c) a variant converted from a plain variant keeps its SKU (`GT-LED-01-ARGENT` now sells "Argent · Prise EU"; SKUs never change on rename), new combinations get theirs from the derived name (`GT-LED-01-ARGENT-PRISE-US`); (d) the combination preselected on the product page is the first one in stock in the options' order (EU first when it is listed first); (e) option and value names are required in French and in English in the back office (the database accepts a missing English name and falls back to French).
113. **3D Studio plans differ by what they save and by the Glowbook** (owner's request, 2026-10-26: "the first plan
    is limited in features and in the content it can save, the second has more features and more groups and
    creations, the third has almost everything unlimited plus the Glowbook, to share creations and let clients
    try them on their smile with the AI"; migration `20261026170231_studio_plan_entitlements`). See "3D Studio
    plans" above. Agent's choices, decided on the owner's delegation (2026-11-11): (a) **the numbers** — Essential 15 creations / 3 Gem Groups,
    Artist 150 / 30, Atelier unlimited (one function, `private.studio_plan_limit()`); (b) every creation counts,
    Glowbook and template copies included; collections are not limited; (c) **after a downgrade nothing is
    deleted**: the member reads, edits and deletes everything, and saves a new one once under the limit; (d) the
    **Glowbook becomes Atelier-only** (it was open to every member with Studio access): below it the page, its
    3D creations, renders, pictures and video are hidden and come back as they were on an upgrade; the owner
    may still delete it (no delete button on the locked screen yet); (e) the **trial counts as Essential**
    (decision 101's rule), so a trial member does not try the Glowbook or the AI; (f) the Artist plan's extra
    over Essential is its numbers and the post signature — no new feature was invented for it; (g) one account
    = one artist: no team seats are sold (the former, unused copy promising seats, early access and priority
    support was removed). Before this decision no member but a staff account held any Studio row.
    (b) (owner's request, 2026-10-26): **the Global Toothgems templates page and the folders (collections) are
    for the Artist plan and above** — read as "Artist and up", a higher plan never losing a lower one's
    feature (to confirm). Browsing, copying and the template renders need it; so do reading, creating,
    renaming and filing into a folder (owner, 2026-10-26: after a move to a smaller plan the folders are simply
    no longer shown nor readable). Nothing is deleted: the rows stay, unreadable, and come back as they were on
    an upgrade; the creations themselves stay readable. The Studio hides the folder bar, the folder view and the
    "Folders" menu entry below the plan (`collectionsStatus` "locked" in `lib/studioWorkspace/workspace.tsx`). Migration `20261026190000_studio_templates_collections_artist` is written and tested in
    the repository but **not applied yet**: the owner gave the go-ahead on 2026-10-26 (asked again on 2026-10-27), but the Supabase
    connector's confirmation got no answer in time (to apply in the next session, then rename the file to
    the applied version). The Studio already shows the lock screens (`components/studio/workspace/PlanLocked.tsx`:
    templates page, every folder create / rename / file action, the save dialog's folder list).
112. **3D Studio subscription managed on our own page, not in the Stripe customer portal** (owner's request,
    2026-10-26: "keep the subscription management on our site: staying on the same interface builds trust and lets us
    show the plans and what they offer side by side"; no migration). `/compte/studio` now switches the plan or the
    billing, compares the plans, replaces the card, lists and downloads the invoices, cancels at the end of the period
    and keeps a cancelled subscription, through the Edge Function `studio-manage-subscription` (member token, strict
    body allow-list: an action, a plan and an interval, never a price or an amount; the subscription from
    `studio_subscriptions` + `stripe_customers`, read back from Stripe and required to carry metadata kind
    `studio_subscription` and the member's customer; the price from `studio_plan_prices`). Nothing is granted there:
    Stripe's change comes back through the verified webhook (`customer.subscription.updated`,
    `apply_studio_subscription()` updates plan and interval of an existing row). The function `studio-billing-portal`
    is removed from the repository (its deployed copy is unused and can be deleted from the dashboard; the portal
    configuration made by `studio-billing-setup` stays, unused). The rules are the portal's, unchanged: (a) a switch
    is prorated (`create_prorations`) — within the same interval nothing is charged now and the adjustment is on the
    next invoice; a month ↔ year switch restarts the period and is invoiced at once, the unused share credited. The
    page shows Stripe's own preview (`invoices.createPreview`) and the change reuses the preview's proration instant
    (up to 15 minutes) so the amount charged is the amount shown; (b) a charged switch uses
    `payment_behavior: pending_if_incomplete`: it applies only once paid, a bank check (3-D Secure) is finished on the
    page with Stripe.js (`handleNextAction`), a declined payment voids the invoice and nothing changes; (c) a switch is
    refused while a payment is to fix (`past_due`, `unpaid`) or while a cancellation is scheduled (keep the
    subscription first); a new switch replaces one still waiting for its payment; (d) cancellation at the end of the
    period with an optional reason (the portal's five), one click from the page plus one confirmation, and undone
    with "Keep my subscription" until then; (e) the card is replaced through the shop's payment form in a
    setup-mode Checkout Session (`ui_mode: custom`, card only, metadata kind `studio_card`, nothing charged), then
    becomes the default of the customer and of the subscription; with a payment to fix, the open invoice is retried
    with it at once (3-D Secure on the page); older cards are not detached; (f) invoices: since decision 115 the page lists
    our own `FA-` / `AV-` documents, read from `invoices` and drawn as PDFs in the browser (Stripe's PDFs and
    numbers are no longer shown; an unpaid invoice shows as the plan's `past_due` state). The comparison table shows only what the database gates by
    plan (decision 101: watermark, own logo, layout templates); every other row is the whole Studio. Agent's choices,
    to confirm: (g) a plan switch within the 14-day withdrawal period: a same-interval switch issues no invoice, so a
    later withdrawal is still computed on the first payment only (the days on the new plan are not charged); an
    interval switch issues a paid `subscription_update` invoice, which sends a withdrawal to the team
    (`manual_review`, decision 95 (a)); (h) no new immediate-access request is asked for a switch (the one given at
    subscription covers the contract) — to confirm with the lawyer with decision 94 (a); (i) an upgrade within the
    same interval is not charged at once (portal rule kept; charging it now would be `always_invoice`).
111. **3D Studio: try a creation on a smile with AI** (owner's request, 2026-10-25: "let me try a creation on a smile with Google's Nano Banana 2 — I will connect it later; I will store the reference images myself; the request flow must be easy; clients must easily try the artist's creations; in time only artists on the highest plan will have the option for their 3D creations"; migration `20261025135203_studio_smile_try_on`, Edge Function `studio-try-on`). See "3D Studio smile try-on with AI" above. It replaces the former "automatic placement" interface (placements and landmarks returned by a service, never connected): the AI now returns an image. The manual placement of the gems on the photo was removed the same day (owner: "the only feature will be the AI"), so there is no try-on without the provider (connected by the owner on 2026-11-06: Gemini key and model are set as function secrets). Agent's choices, decided on the owner's delegation (2026-11-11): (a) **the switch is restricted to Atelier** since 2026-10-26 (owner's request; migration `20261026164042`, before that open to every member with Studio access) — active staff count as Atelier (`studio_user_tier`); when restricted, the artist's own entry point still opens and the AI answers `not_allowed` (no upsell screen yet); (b) **visitors must sign in** to ask for an AI render (each call costs money); (c) **10 renders per account per 24 hours** (`TRY_ON_DAILY_LIMIT`), counted before the provider is called, failures included; (d) the photo and the image are **never stored**; `studio_try_on_requests` has no retention rule yet; (e) the visitor's consent box is their own ("this is a photo of me"), the artist's stays the client's consent; the photo goes to Google (Gemini API) — the privacy policy must name it, and the API terms on data use (paid tier, region) are to check before launch; (f) the result is labelled "AI-generated image: a preview, not an exact promise"; (g) the model id is a secret (`GEMINI_IMAGE_MODEL`), not hard-coded, and the key is set (2026-11-06) but the request format is still to be confirmed by real renders; (h) with prompt v2 the gems are listed to the model from the database, and the browser's front view only gives their position and rotation (a visitor could alter that picture for their own render only); with v1 the picture is the only description of the design; (i) v2 is the default prompt until the owner compares both on real photos; (j) the render authenticates with the owner's personal ADC credentials (refresh token in a function secret) until a non-personal identity is set up for production.
110. **Product characteristics are per product, shown for gems only; FAQs are groups assigned to products and categories** (owner's request, 2026-10-25: "characteristics only for gems, and configurable — the data is not well represented for each gem; create sets of frequently asked questions and assign the group to different products, from a new admin page"; owner's choices: assignment by product **and** category, keep the five fields; migration `20261025090755_product_specs_faq`). Before: back, packaging and wear were the same UI strings on every product page, the material fell back to the category name ("Matière : Matériel" on a tool), the FAQ was three gem questions in the front end. Now see "Product characteristics and FAQ groups" above. Agent's choices, decided on the owner's delegation (2026-11-11): (a) **no default values** — a gem without characteristics shows only its size (the former "6 à 12 mois" / "Capsule stérile" / "Plat, poli" were not copied to any product: a durability or packaging claim is written per product by the shop); (b) the three former questions became one published group "Toothgems — questions fréquentes" assigned to the `gems` category, so gem pages kept their FAQ; (c) a product's own groups **replace** its category's (no merge); a draft group never counts; (d) English characteristics and answers fall back to French when not translated, like other product texts; (e) `metadata.material` is left in the rows, unread, rather than deleted (to clean up once confirmed); (f) the storefront shows no FAQPage structured data yet.

109. **Orders keep the promised delivery delay; parcels get a default estimated delivery** (owner's request, 2026-10-22: "when the admin marks an order sent, set the estimated delivery to the maximum day of the chosen option — e.g. France 2 to 4 days → D+4 — and leave it editable"; migration `20261022113049_order_shipping_delays`). `orders.shipping_min_days` / `shipping_max_days` (working days, both null or both set) are copied from the shipping rate by a `BEFORE INSERT` trigger (`private.order_snapshot_shipping_days()`), so the promise survives a later edit or deletion of the rate and `create_order()` did not change; the 28 existing orders with a rate took its current delays (pre-production). The back office (`ParcelDialog`) pre-fills the estimated delivery of a parcel leaving now (created as shipped, or completed before shipping) with today + `shipping_max_days` **working days** (Monday–Friday, `webapp/src/lib/workingDays.ts`), says where the date comes from, and leaves it editable; a parcel that already has a date keeps it, and "Mark as shipped" on a parcel without one opens the form first. Agent's choices, decided on the owner's delegation (2026-11-11): (a) public holidays are not skipped (the team corrects the date); (b) the count starts on the day the parcel is marked shipped, in the browser's calendar, a weekend start counting from Monday; (c) no default when the order has no delay (courses, gift cards, older orders without a rate).
108. **3D Studio: where the artist works, on their Glowbook** (owner's request, 2026-10-22: "let the artist set where they operate, so users find their place of activity more easily — with an open-source map, no extra usage cost"; migration `20261022111758`, whose comments say "decision 107" because that number went to the gem free sizes written in parallel). In "Customise my page" the artist searches an address, picks a result and adjusts the pin; the public page shows the place under the profile with directions links (Google Maps, Apple Maps, OpenStreetMap — plain links) and a map drawn on demand. Two modes: **salon** (`exact`: address and pin public) and **area** (`area`, the default: only a district name and a ~1.5 km circle; the coordinates are rounded to 2 decimals ≈ 1.1 km by the database before they are stored, so a home address is never held). No usage cost: the map is MapLibre GL (BSD, `maplibre-gl`, loaded only when a map is shown) drawing **OpenFreeMap**'s vector tiles (no key, no quota, commercial use allowed, attribution shown); the address search calls OpenStreetMap's **Nominatim** from the artist's browser, once per explicit search (its policy forbids search-as-you-type and allows 1 request/s), with the credit shown. The style URL and the geocoder are constants in `lib/studioWorkspace/glowbookPlace.ts` (swap there for a self-hosted or paid provider). Agent's choices, decided on the owner's delegation (2026-11-11): (a) the place is live, without moderation, like the city and the bio (decision 99 (b)) — a salon's address is personal data the artist publishes themselves; (b) the public map loads by itself when the visitor scrolls near it (owner's choice, 2026-10-22, instead of the agent's first "Show the map" button): a visitor who never reaches it downloads nothing, but one who does sends their IP to OpenFreeMap without being asked — legal risk to confirm with a lawyer (cf. the 2022 Google Fonts ruling in Germany); the address and directions work without the map — the privacy policy lists OpenFreeMap and Nominatim, their data location to fill in; (c) area is the default mode; (d) the place is behind the same plan switch as the rest of the look (`private.glowbook_customization_allowed`); (e) the free public services have no SLA (Nominatim's terms may change): a self-hosted tile set or geocoder is the fallback if traffic grows. Not built: a directory or map of all artists, search engines' LocalBusiness data, reverse geocoding when the pin moves.

107. **Gem sizes: SS for round stones, free millimetres for every other cut** (owner's request, 2026-10-22: "no more SS only: let the admin set sizes freely like the packs — apart from round gems, sizes are like 2x4 mm — and make the 3D Studio show the sizes the shop really sells"; migration `20261022112844`). Supersedes the size rule of decision 81.
    - **Data**: a pack × size option stays one `product_variants` row; its attributes are `{"pack", "ss"}` (an SS gauge, as before) or `{"pack", "mm": [w, l]}` — one value (diameter / longest side) or two (width × length), ascending, 0.5–30 mm to a tenth. Key `mm`, not `size`: the charm `charm-etoile-or-18k` already has generic variants `{"size": "2mm"}` / `{"size": "3mm"}` (one ordered), which stay in the generic variant editor untouched. A product is sized one way — SS or mm, never both (refused by `admin_save_product()`). Names and SKUs are derived by the database as before: "Pack de 10 · 2,5 × 5 mm" / "Pack of 10 · 2.5 × 5 mm", `…-P10-2P5X5MM`; an option is matched by pack + size, whatever order the two dimensions were typed in.
    - **"Free" means typed, not free text**: the administrator types "2x4", "2 × 4 mm", "2,5" (back office `/admin/produits`, Options, switch "In SS (round stones)" / "In millimetres", the default following the gem's shape: round → SS, any other cut → mm); the field says as it is typed which size it will add and how long the Studio will draw it. A label that is not one or two dimensions ("Small", "Large") is refused, because the Studio could not draw it. Sizes of the other way stay in the draft (not sent) so switching back gives them back.
    - **3D Studio**: a gem's sizes are those of its active options, smallest first by longest side; until it has any, SS2/SS5/SS7 for a round stone and **3/4/5 mm** (longest side) for any other cut (the SS gauges are far too small for a baguette or a charm). A piece sized in SS or by one millimetre value is drawn with its longest side equal to it (SS: its approximate diameter), in the proportions of its outline, scaled uniformly as before. A width × length size is drawn at both (2026-10-22, follow-up): the outline's long axis gets the length and its short axis the width, so a 2 × 6 baguette (outline 1:2) is drawn 2 × 6 — in the 3D editor and its collisions, the front view, placement sheet, try-on and card previews (`lib/studio3d/pieceScale.ts` `scaleAxes()`, `frontView.ts` `glyphStretch()`). The per-axis scale is derived from the piece's shape and size wherever it is drawn, never stored (changing gem changes the shape and keeps the size); depth stays half the longest side, so thickness and standoff from the enamel do not change with the width. A round or square outline takes its length vertically before it is turned. Pieces sized in SS or by one value draw exactly as before (unit-tested). The shopping list, placement sheet, quote and "select identical" match pieces to shop options by size key (`ss6`, `mm2x4`); changing gem keeps the same size when the new gem sells it, else the nearest longest side.
    - **Saved designs**: pieces (creations, Gem Groups, templates, Glowbook, share links) now store `size: {"ss": n}` or `{"mm": [...]}` instead of a bare `ss`; scene format stays version 2 and the bare `ss` of every design saved before is still read, at exactly the scale it had (unit-tested). The try-on interface gives the service `sizeMm` (longest side) instead of `ss`.
    - Not built: a translated label for a size (dimensions are language-neutral apart from the decimal comma), sizes in the generic variant editor, converting the charm's `{"size": "2mm"}` / `{"size": "3mm"}` variants. That needs a data fix, not an admin action: the 2 mm one is ordered, so removing it only deactivates it, and the gem editor refuses (and the admin never offers it on) a product with any other kind of variant, even inactive. The in-place conversion is `{"mm": [2]}` / `{"mm": [3]}` with English names "2 mm" / "3 mm" (ids, order links and SKUs `GEM-GOLD-004-2MM` / `-3MM` unchanged; the SKUs already match the derived scheme) — awaiting the owner's go-ahead.
    - To confirm: that refusing non-dimensional size names is acceptable; the 3/4/5 mm fallback for cuts without sizes; one sizing way per product.

106. **Daily low-stock digest to the support inbox** (owner's request, 2026-10-22: "alert the support when items are low or out of stock, but not spam: once a day"; migration `20261022090133`). One e-mail a day, from 08:00 Paris time, listing every active physical product (option by option when it sells options) that is out of stock or at/under its own `low_stock_threshold` (default 5), out of stock first, with SKU and the sellable quantity. Sent by the existing `send-pending-emails` sweep (no new cron job or secret): `pending_stock_digest()` returns nothing before 08:00, once today's e-mail is sent (`email_log` key `stock_digest:<Paris date>`, exactly-once, a failed send is retried by the next sweeps) or when nothing is low — so no e-mail on a quiet day. It is the state at send time, not a diff: an item stays listed until it is restocked. Recipient: `store_settings.support_email`, else the `EMAIL_REPLY_TO` secret (like the contact form); written in French. Lists are cut at 100 items per section ("… and N more"). Not built: a per-product opt-out, a threshold of the digest itself, a back-office toggle or recipient field. To confirm: the 08:00 hour, and that the digest should also list the manual "out of stock" of untracked items (it does). At the time of writing roughly 70 products are out of stock, so the first digest is long.

105. **3D Studio: the spotlight video sweeps in front of the smile** (owner's request, 2026-10-21: "slower, stay in front of the 3D model, -45° to +45°, right then back left, only 5 seconds, no length choice"; migration `20261021190830`). The camera orbits the gems at the still's distance (engine `orbit: "front"`), angle = -45°·cos(2πt/5 s), so the looping video goes right, left, right with a slow-down at each end and no jump. One length, 5 s, not offered to the artist. Older 4/6/8 s full turns are no longer current and are re-recorded by the artist's Studio. Not verified on a real recording yet (no signed-in session for the agent).
104. **Academy: folders and thumbnails in the training media library** (owner's request, 2026-10-21: "sort the images more easily, keep the tags, newest first, folders — e.g. to separate the images used for each language — changeable after upload; mind the Supabase cost"; migration `20261021173947`). Built: one folder per file, optional (`training_media_folders`); the library sorts newest first, oldest or by name; a keyword filters by click; several files are filed at once; the builder's picker filters by folder. Cost: the grids showed every original (41 images = 64 MB on 2026-10-21); they now show a WebP of at most 480 px drawn by the browser, page by page and lazy-loaded. Agent's choices, decided on the owner's delegation (2026-11-11): (a) the fixed `category` column stays (filter and field) next to folders — three ways to classify a file (category, folder, keywords) may be one too many; dropping categories later is a migration; (b) folders are flat (no sub-folders) and ordered by name (`position` exists, not offered in the UI); (c) thumbnails are drawn in the browser, not by Supabase image transformations (plan-dependent, billed per image), and older files get theirs the first time a `manage_training` member opens the library — one download of each original, once; (d) the rows are still read in full (no server-side paging): `urlOf()` resolves every course's media from them, and they weigh a few hundred bytes each.
