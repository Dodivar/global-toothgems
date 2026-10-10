---
name: global-toothgems-scope-and-launch
description: What must work for the first production launch, what is already live, what is deliberately post-launch, and how to treat features outside scope.
---

# Scope & Launch

The product has moved past the MVP definition phase: most screens exist. The remaining work to launch is mostly **making existing surfaces real** (Supabase, Stripe, e-mail, operations), not designing new ones. The live/mock status per domain is the table in `AGENTS.md` §4 — keep it current.

## Launch blockers (must be real before opening to customers)

### Commerce
- Cart → checkout → payment through **Stripe Checkout**, orders created by `create_order()` in an Edge Function, fulfilment by the verified webhook (`mark_order_paid`, `cancel_order`), expiry job for `expire_stale_orders()`.
- Order confirmation page reading the real order state (pending until the webhook confirms), confirmation e-mail.
- Member order history and admin order management on real data (done for reading; refunds through Stripe).
- Shipping rates and VAT from the database; promotions codes and gift-card redemption at checkout if they are offered at launch.
- Installment payment ("4x") only through what Stripe actually offers for the country/currency (e.g. Klarna via Checkout); never invented.

### Accounts and legal
- Sign-up, sign-in, recovery, e-mail/password change (live); account deletion and data export through a backend job (GDPR).
- Cookie consent that actually gates any non-essential script; newsletter double opt-in; consent records.
- Legal pages (terms of sale, privacy, cookies, legal notice, returns) with real business data, validated by the owner/counsel — agents never invent legal identifiers or commercial terms.
- Custom SMTP (Resend) for Auth e-mails.

### Academy
- At least one purchasable course: course/module/lesson/quiz schema, entitlement granted by the payment webhook, lesson access checked server-side, private media with signed URLs, progress and quiz results persisted.
- Course administration without code changes (create/edit, draft/publish, ordering).
- Kit QR codes pointing to platform-controlled, mobile-friendly pages, if kits ship at launch.

### Operations
- Separate production Supabase project (or an explicit decision to promote the current one after removing demo data), production Stripe keys, production domain.
- Error monitoring (Sentry), CI running lint/tests/build on pushes, backups understood.
- No mock data, demo account or "Prototype controls" reachable in the production build.

## Live or schema-ready, keep working

Catalogue, variants and gem options, categories/families, gem colours, recommendations, reviews and moderation, favourites, Studio 3D workspace, auth, staff roles and permissions, audit log, translations, shipping/VAT tables, promotions, gift cards, loyalty, contact tickets, newsletter, e-mail templates, content pages, statistics. See `supabase/README.md` for the rules already enforced — do not re-implement them in the browser.

## Promoted into scope by the product owner (already built at least in UI)

- **Loyalty Club** (stamps per qualifying order, reward) — live: schema, member card and public rules read from Supabase; reward spent from the cart (needs the checkout function redeployed). Rules in `supabase/README.md` decisions 13, 21.
- **Gift cards** — schema done; storefront page and admin UI on mock data.
- **Promotions & campaigns** — live: back office on Supabase, promotion codes and automatic promotions in the cart (previewed by `quote_basket()`, applied by `create_order()`). Collections and customer segments have no back-office screen yet.
- **Studio 3D** — editor and workspace live; paid subscription (Stripe subscription + server-side entitlement) not built, access is `preview` (`webapp/src/lib/studioAccess.tsx`).
- **Certificates** — UI exists (derived from 100 % progress). Before being presented as real, a certificate must be a durable server-side record (see `05`).

## Post-launch (do not build now unless the user asks)

- German UI and other languages.
- Referral programme, advanced gifting (scheduling UI beyond what exists), XP/levels/badges, streaks.
- Advanced quizzes (tooth identification interactions, branching), graduate-only areas, social certificate verification.
- Multi-currency price lists, B2B VAT reverse charge, OSS reporting.
- Instructor marketplace, multi-role training marketplace.

## Scope rule

When a request is not clearly in the lists above:
1. do not silently expand it;
2. say whether it is launch-blocking, post-launch or new;
3. if the user wants it anyway, build it properly (real data, real authorization) — never as a mock to "fill in later";
4. add only the minimum foundation needed to avoid blocking a future expansion.
