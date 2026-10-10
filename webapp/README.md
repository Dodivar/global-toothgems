# Global Toothgems — web application

The production web application of Global Toothgems: storefront, Academy, member area, Studio 3D and back office, in one Next.js (App Router) application backed by Supabase (see `supabase/README.md`) and deployed on Vercel. It was migrated from Vite + React Router in five phases (done on 2026-09-30): every screen is an App Router segment, public pages are rendered on the server, the private areas in the browser under server-checked layouts — see `docs/migration-nextjs.md` for the phases and the per-route checklist.

> **Status: being industrialised.** The app started as a fully clickable implementation of the Claude Design prototype, with every domain on in-memory mock data. Domains are now connected to Supabase one by one; the up-to-date live/mock table is in the root `AGENTS.md` §4. With the Supabase variables set, these are **live**: the storefront catalogue, back-office product management and categories, member and staff authentication, favourites (`wishlist_items`), reviews and moderation, member and admin order reading, the back-office customers workspace, the Studio 3D workspace, and the Academy's back-office authoring and its public pages (catalogue, course sales pages). Gift cards (back office, `/carte-cadeau`, codes in the cart) are live too, paid through the checkout. The back-office settings (store details, shipping, VAT rates, languages) are live too. Promotions and campaigns (back office, and promotion codes in the cart) are live too. The back-office statistics are live too (`analytics_snapshot()` and the Academy tables). Cart/checkout/payment (Stripe functions not deployed yet), contact and newsletter, and the Academy's learner side still run on mock data.
>
> Architecture (decided): Next.js App Router on Vercel, business rules in Postgres (RLS + functions), server code in Supabase Edge Functions, payments by Stripe with webhook-driven fulfilment. Sections below that describe "prototype" behaviour, "Prototype controls" panels or mock stores document code that is **still mock and scheduled to be replaced**, not a target design.

## Stack

- **Next.js 16 (App Router, Turbopack) + React 19 + TypeScript**
- **Tailwind CSS v4** through PostCSS (`postcss.config.mjs`), driven by the design system's CSS variable tokens (`src/index.css`)
- **Navigation**: `next/link` and `next/navigation` behind `src/lib/navigation` (`Link`, `NavLink`, `Navigate`, `useNavigate`, `useLocation`, `useParams`, `useSearchParams`, with React Router's former names and shapes). Screens write the internal French paths (`<Link to="/boutique">`); the module writes the address in the page's language. Import from it rather than from `next/navigation` in `src/`
- **react-i18next** for French/English. Public pages carry their language in the address (`/fr/…`, `/en/…`, `src/lib/localeRoutes.ts`); elsewhere the saved choice (FR/EN switches), else the browser's language, else English
- **lucide-react** for icons

## Requirements

- Node.js 20+ (built and tested on Node 22)

## Getting started

```bash
cd webapp
npm install
npm run dev
```

This starts the Next.js dev server on [http://localhost:5173](http://localhost:5173) — the port the app has always used, which the Supabase Auth redirect allow-list knows (`scripts/dev.mjs`; set `PORT` to use another one). `npm run dev:mock` runs the same server on the mock data, whatever `.env.local` says.

How the app is mounted (`docs/migration-nextjs.md`, phases 1–5):

```
app/layout.tsx                 root layout: <html lang>, fonts, favicon, src/index.css, the stores
                               (src/AppProviders.tsx) with the catalogue the server read for a public page
app/(public)/                  the public zone, in the storefront's chrome, rendered on the server:
  fr/…, en/…                   public pages, one segment per page and language (app/_public/publicPage.tsx),
                               product pages (app/_public/productPage.tsx: 404/308, head, JSON-LD)
  connexion/, inscription/, … sign-in, registration, recovery, /erreur, /maintenance (browser only)
  error.tsx                    the server-error screen in place of a page that failed
app/compte/, app/academy/(learner)/, app/admin/, app/studio-3d/
                               the private zones: one segment per screen, rendered in the browser only;
                               server layouts + pages turn signed-out visitors away (app/_zones/)
app/not-found.tsx, error.tsx   404 (status 404) and errors outside the public zone
app/auth/confirm/route.ts      where every Supabase Auth e-mail link lands (server)
proxy.ts                       before every page: language, session refresh, sign-in redirects, old addresses
src/AppProviders.tsx           the stores of the whole site, in their justified order; i18next instance per page
src/AppShell.tsx               the chrome: skip link, cookie banner and dialog, header, footer
src/zones/                     each zone's client layouts (PublicChrome, ZoneChrome, MemberShellLayout,
                               AdminStaffLayout, LearnerLayout, the Studio's lazy screens), BrowserOnly
src/screens/                   one client component per screen ("use client"), imported by its page
src/lib/navigation/            links and router hooks on next/link + next/navigation, localized addresses
```

**Pages.** Each screen has its own App Router segment and imports its own screen module, so a page downloads its screen and the shared code only (stores, fixtures, translations, chrome). Links between pages, zones included, are client-side navigations: the stores (in the root layout) keep their state, mock stores included. When adding a screen: a `"use client"` component in `src/screens/`, and a `page.tsx` in the segment of its address — `zoneScreen(path, <Screen />)` for a private page (it checks the session with the page's address; a unit test checks every gated page does), `publicScreen(id, locale, <Screen />)` for a public page in each language. The cart is kept for the tab in sessionStorage (`src/lib/cartStorage.ts`), and so are the mock member and staff sessions, so a reload keeps them.

Public pages (`/fr/…`, `/en/…`) are rendered on the server from the catalogue the server read with the publishable key (`src/lib/catalog/serverCatalog.ts`, loaded by the root layout for the address; fixtures in mock mode), in the language of the address, and hydrated by the browser. Their first browser render must match the server's: state that only the browser knows (localStorage, media queries) is read once hydrated (`src/lib/useHydrated.ts`), never in a `useState` initializer. Sign-in, recovery, the system pages and the private zones (member space, learner pages, back office, Studio workspace) render in the browser only (`BrowserOnly`, `ZoneChrome`). State a navigation hands to the page it opens (the page to return to after signing in, an e-mail already typed) is kept for the tab with that page's address (`src/lib/navigation/state.ts`).

### Addresses and language (phases 3.1 and 5)

Public pages live at `/fr/…` and `/en/…` with English segments (`/fr/boutique/coeur-chrome` ↔ `/en/shop/chrome-heart-tooth-gem`: product pages use each language's slug, `product_translations.slug`, see `src/lib/catalog/productSlugs.ts`); the full table is `src/lib/localeRoutes.ts`, and `docs/migration-nextjs.md` lists it. Screens use the French paths everywhere (`<Link to="/boutique">`, `navigate("/aide")`): `src/lib/navigation` writes the address of the current language (with the product's slug in that language) and reads addresses back, so write internal paths. A public page's language is its address: the root providers give it that language's i18next instance, on the server and in the browser, and the FR/EN switch moves to the other language's address. When adding a public page: its French/English addresses in `localeRoutes.ts`, a segment in `app/(public)/fr` and `app/(public)/en` (a unit test fails if one is missing), and its title/description source in `src/lib/pageMeta.ts`. `/` is sent by the proxy to the saved language (`gt-lang` cookie), else the browser's, else English; old unprefixed addresses are moved permanently. Screens live in `src/screens/` (not `src/pages/`, which Next.js would treat as a Pages Router directory). Image imports resolve to `{ src, width, height }` in Next.js: use `.src` in an `<img>`.

## Sessions and e-mail links (server side)

With Supabase configured (phase 2 of `docs/migration-nextjs.md`):

- **The session lives in cookies** (`@supabase/ssr`): `src/lib/supabase/client.ts` is the browser client, `server.ts` the one for route handlers (the visitor's session, publishable key, RLS), `proxySession.ts` the proxy's. A member signed in before the switch had the session in `localStorage`; the browser client carries it over once into cookies (`sessionReady`, which the auth providers wait for).
- **`proxy.ts`** refreshes the session on every page request (`getClaims()`, which validates the token rather than trusting the cookie) and redirects a signed-out visitor away from `/compte/*`, `/academy/lecon`, `/academy/mes-formations/*` (to `/connexion`) and `/admin/*` except its sign-in screen (to `/admin/connexion`), with `?suite=<page>`; both sign-in pages read it to send the visitor back. The back office also turns away a signed-in account that is not an active staff member (its own profile read under RLS, `src/lib/staffProfile.ts`; decided 2026-10-01) to `/admin/connexion?suite=…`. The client guards (`RequireAccount`, `RequireAdmin`) stay. The private zones' server layouts and pages check again with the same rules (`app/_zones/guard.ts`, server client, never the service role; their redirect reaches the browser within the streamed page, the proxy's is a 307). RLS remains the authority. In mock mode the proxy and those checks do nothing.
- **`/auth/confirm`** receives every Auth e-mail link — `?token_hash=…&type=…` (the templates in `supabase/templates/`, any device) or `?code=…` (Supabase's default templates, same browser only) — opens the session and forwards to `next` (a same-site path only) or to the page for the kind of link, with `error`/`error_code` when the link is refused. The app passes `…/auth/confirm?next=…` as the redirect of sign-up, resend, password reset and e-mail change. Supabase dashboard settings: `supabase/README.md`, "Member sign-up".
- The rules (which paths need a session, safe redirects, link kinds) are pure and unit-tested in `src/lib/authRoutes.ts`.

## Supabase connection (back-office products)

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase dashboard → Project settings → API). Set the same two variables in the Vercel project for deployed previews. Only the **publishable** key goes here: every read and write is authorized by Row Level Security in Postgres. Without the variables the app runs entirely on its mock data, as before.

With them set:

- **`/admin/connexion` signs in through Supabase Auth.** Only an active profile whose role is a staff role (`admin`, `manager`, `viewer`) gets past the screen; any other account is signed straight back out. Writing to the catalogue needs the `manage_products` permission (`admin` and `manager`); a `viewer` can look but every save is refused by the database. To give someone access, create the user in Supabase (Authentication → Users), then set their role:

  ```sql
  update public.profiles set role = 'admin' where email = 'someone@example.com';
  ```

- **Products** are read from `products` with their English translation, images, stock and variants, and saved through `admin_save_product()` — one transaction for the product, its published English translation, its stock row and its ordered images (migration `…_admin_product_management`). Prices travel as exact decimal strings; the form refuses more than two decimals.
- **Images** upload to the public `product-media` bucket as soon as they are picked (JPG, PNG, WebP or AVIF, 10 MB max), under `products/<product id>/`. They are linked to the product when the form is saved; files no product references any more are removed from the bucket on save and on delete. An upload whose form is then abandoned stays in the bucket.
- **Delete** only works for a product that was never ordered (the database protects order history); otherwise the message says to archive it.
- **Recommendations** are saved with `admin_save_product_recommendations()`.

What is not wired to the database yet, on purpose:

- **Promotional price.** There is no column for it: discounts belong to the promotions domain. The field is hidden when connected.
- **Variants.** Products with variants (three of the seeded ones) show their total stock read-only; the form never writes variant stock.
- **Categories and families** are read from the database but not editable; a product's family is picked in the product form.
- **The activity feed** shows this session's actions only; the full history is in `audit_logs` and `inventory_movements`.
- **The seeded products' images** point at files that were never uploaded, so they show broken until replaced.
- **Orders and reviews** are connected too (see "Orders and reviews on Supabase" below). The statistics workspace is live (see "Statistics on Supabase" below). The customers workspace is live (see "Customers on Supabase" below).

Code: `lib/supabase/` (client + generated `database.types.ts`), `lib/adminCatalogMapping.ts` (pure row ↔ form mapping, unit-tested), `lib/adminCatalogSupabase.tsx` (the Supabase store), `lib/adminCatalog.tsx` (the mock store, and the switch between the two), `lib/adminAuth.tsx`.

## Downloadable documents (PDF template)

Every business document the site hands out as a PDF goes through one template, `src/lib/documents/`, so they share a look: wordmark, title and references at the top, up to three party blocks (seller, billing, delivery…), then headings, tables (header repeated on each page they continue on), totals and paragraphs (a tinted "notice" for statements such as "not an invoice") flowing over A4 portrait pages, and the store's legal mentions (from Settings › Store, `store_settings`) with "Page n of N" at the foot of every page.

- `template.ts` — the `BusinessDocument` model (text only, already translated and formatted) and its layout; `renderDocument()` returns the PDF bytes.
- `pdfWriter.ts` + `text.ts` — the PDF written by hand (no dependency): real text in the standard Helvetica fonts (WinAnsi: French and English, €, typographic quotes), selectable and a few kilobytes; the wordmark is the only embedded image. Pure, so the same code can run in an Edge Function (e.g. to attach a document to an e-mail).
- `assets.generated.ts` — Helvetica's advance widths and the wordmark mask, generated by `python3 scripts/document-assets.py` (reportlab, Pillow); regenerate it when the logo changes.
- `useDocumentDownload.ts` — a click → build → render → save hook; the renderer is imported on first use.
- One builder per document fills the model from real data: `orderDocument.ts` (the member's "bon de commande", amounts as recorded, shared with the order page through `orderAmountRows`) and `invoiceDocument.ts` (the legal invoice and credit notes, drawn from the frozen `invoices` snapshot read with the order — `documents/invoiceModel.ts` — never from today's settings). The Studio 3D quote is the next one; it needs its pricing rule decided first (a creation's gems have no quoted price yet).

The Edge Functions draw the same invoices and credit notes to attach them to the order e-mails: the portable modules (`text`, `pdfWriter`, `template`, `legal`, `invoiceModel`, `invoiceDocument`, the generated assets) import nothing outside this folder but `../catalog/money.ts`, with `.ts` extensions so Deno resolves them; `npm run sync:documents` copies them, with the `documents` strings of `fr.json`/`en.json`, to `supabase/functions/_shared/documents/`. `sync.test.ts` fails while that copy is stale — run the script after any change here or to those strings.

Unit tests: `documents.test.ts` (encoding, wrapping, cross-reference table, page flow, the order form's content), `invoiceDocument.test.ts` (invoice rows, mandatory mentions, credit notes).

## Other scripts

```bash
npm run build     # next build: production build into .next/ (includes a type-check)
npm start         # serve the production build (next start)
npm run typecheck # tsc on the app, then on e2e/ + the tool configs
npm run lint      # oxlint
npm test          # vitest (catalogue mapping and money rules; vitest.config.ts)
npm run test:e2e  # Playwright: smoke tests in mock mode (dev server on 5199) + auth-server and auth-cache
                  # tests (dev server on 5198 against e2e/support/fake-supabase.mjs on 54399)
```

`npm run test:e2e` needs a Chromium: `npx playwright install chromium` once on a workstation (cloud sessions use the preinstalled one). `E2E_BASE_URL=http://localhost:3000 npm run test:e2e` runs the same tests against a server you started yourself (e.g. `npm run build && npm start`, built without the Supabase variables).

## Deploying (Vercel)

The Vercel project builds from the **Root Directory** `webapp` with the **Next.js** framework preset (`next build`, output managed by Vercel). There is no `vercel.json` any more: every screen is an App Router segment, and real files in `public/` (`favicon.svg`, `icons.svg`, videos) are served as themselves. An address without a screen, and a product slug the shop does not sell, answer HTTP 404 (the 404 page); the member space and back office answer 200 for their unknown sub-addresses (their 404 screen lives inside their shell).

Environment variables (Production and Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. They are inlined at build time, so a change needs a redeploy.

## Supabase connection (catalogue)

The storefront catalogue is read from the Supabase project described in
`supabase/README.md`. Copy `.env.example` to `.env.local` (git-ignored) and
set, locally and in the Vercel project settings:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the project's **publishable** key (`sb_publishable_…`) |

Only the publishable key ever goes in a `NEXT_PUBLIC_` variable — Next.js inlines them
into the public bundle. Every read is authorized by Row Level Security; the
service role key belongs to server code only. With both variables empty the
app runs on its mock fixtures, as before.

```
src/lib/supabase/client.ts          the browser client (typed), `isSupabaseConfigured`
src/lib/supabase/database.types.ts  generated from the live schema — regenerate after each migration
src/lib/supabase/storage.ts         buckets: public URLs (product-media), signed URLs (avatars, review-photos)
src/lib/catalog/api.ts              one PostgREST query: products + category + translations + variants + media + stock, and review stats
src/lib/catalog/mapping.ts          pure row → `Product` mapping (locale fallback, stock, minor-unit money) — unit-tested
src/lib/catalog/CatalogProvider.tsx loads the catalogue once, exposes `useCatalog()` (status, products, reload, findProduct)
```

What reads it: the shop (`/boutique`), the product page (`/boutique/:slug`,
base or English slug), the home best-sellers, the empty-cart suggestions, and
the shape/colour navigation. Loading shows skeletons; a failed load shows a
retry and never falls back to mock products. An unknown slug is a 404.

Mapping rules worth knowing:

- **Language**: base columns are French; the English text comes from
  *published* translation rows, else falls back to French.
- **Categories and families** are data (`fetchTaxonomy()`, `data/taxonomy.ts` for
  the mock): their slugs are the `categorie` and `famille` URL values
  (`/boutique?categorie=gems&famille=swarovski`). The header menu, the shop's
  product-type tree and the home tiles are built from them. Former values
  (`Gems`, `Outils`, `Suivi`, `Accessoires`, `Kits`) still resolve, through
  `LEGACY_CATEGORIES`.
- **Shape / colour filters** read `products.metadata.shape` / `.color`, using the
  slugs of `GEM_SHAPES` / `GEM_COLORS` (`"star"`, `"crystal"`…). Products without
  them are simply not in those filters.
- **Variants** come from `product_variants`; a null variant price inherits the
  product price. The cart line keeps the `variantId` for the future checkout.
- **Money** is converted to integer minor units from the decimal digits (no
  float maths). Prices shown are indicative: `create_order()` recomputes them.
- **Images** are public URLs of `product-media` objects. A path whose file is
  not uploaded yet shows the image placeholder.
- Gift cards (`product_type = 'gift_card'`) stay on their own page.

Not connected yet (still mock): the cart (kept for the browser tab only) and checkout, the Academy, the
community and most of the back office. Orders and reviews are connected (next
section).

## Orders and reviews on Supabase

With the Supabase variables set, three stores read and write the database.
Without them, the member's orders and reviews run on their mock data, and the
back office's order book is empty (it never shows invented orders).

| Store | Reads | Writes |
| --- | --- | --- |
| `lib/orders.tsx` (member area) | the account's own paid orders (`payment_status` paid / refunded / partially refunded): recorded amounts (subtotal, discount, shipping, VAT, total, gift cards, amount due), items, discounts (`order_discounts`), parcels with their contents, refunds, address snapshots — never the internal fields (`CUSTOMER_ORDER_SELECT`) | nothing: orders come from the checkout (`create-checkout-session`) and the Stripe webhook |
| `lib/adminOrders.tsx` (back office) | every order except expired unpaid checkouts (`ADMIN_ORDER_SELECT`): recorded amounts, items with their VAT rate and amount, discounts with code and source (promotion / loyalty), every payment row (card and gift card, `gift_cards.code_last4` only), parcels with their contents, refunds of every status, address snapshots, `paid_at` / `cancelled_at`; the staff notes from `order_notes` (migration `20260930210000_order_staff_notes`). Read 1 000 rows at a time (the Supabase `max_rows` cap), up to `BOOK_LIMIT` | status (+ implied fulfilment), cancellation of an unpaid order (`cancel_order`), notes (written to `orders.admin_note`, which a trigger appends to `order_notes`). Parcels (`create_shipment`, `set_shipment_status`) and card refunds (Edge Function `refund-order`, confirmed by Stripe's webhook) through `lib/adminFulfillment.ts`; cancelling an order that holds money is refused (refund it first) |
| `lib/reviewsSupabase.tsx` | published reviews for visitors (public columns only); own reviews, votes and reports for customers; everything for staff | submit / edit (photos to the private `review-photos` bucket), helpful votes, reports, and every moderation action |

The database enforces the review rules: only a customer whose order with the
product has shipped or been delivered can write one (the order is filled in by
the database), a customer edit goes back to moderation, and staff moderate
but never change the text. A consequence worth knowing: **staff cannot
moderate their own review** (the author rules apply), so test moderation with
a second staff account. The public signature is built by the database from
the profile's first and last name ("Client" when both are empty).

Course reviews are not stored yet (the table has no course column), so with
Supabase they are not offered. Mapping lives in pure, unit-tested modules:
`lib/orderMapping.ts`, `lib/adminOrderMapping.ts`, `lib/reviewMapping.ts`.

### Orders in the back office (`/admin/commandes`)

- **Amounts as recorded.** `adminOrderMapping.ts` builds on the member area's `mapOrder`, so both sides show
  the same figures: integer minor units of the order's currency, formatted only on screen (`formatMoney`). The
  detail page lists each line's VAT rate and amount and its share of the discounts, the discounts by name and
  code (loyalty rewards apart), shipping, the total, the VAT by rate (what the order's VAT holds beyond its lines
  is the shipping's, shown without a rate because `create_order` does not store it), gift cards by their last
  four characters, the amount paid online, refunds, both address snapshots, each parcel with its contents and
  tracking link, and the payment (method, last four digits, Stripe reference shortened).
- **Collected, per currency.** The header figure is never added across currencies: for orders whose payment was
  received and that are not cancelled, `amount_due` (total less gift cards) less succeeded refunds
  (`collectedByCurrency`). Gift cards count when sold, not again when spent. A buyer's "spent" is the member
  area's rule (`spentByCurrency`: recorded totals of paid orders that stand, less refunds).
- **Timeline from recorded dates only:** placed (`created_at`), paid (`paid_at`), payment failed (the failed
  payment row), shipped / delivered (each parcel), cancelled (`cancelled_at`), refund requested / refunded /
  partially refunded / failed (each refund). `orders.updated_at` is never used: a status set by hand without a
  dated fact has no event.
- **Invoices.** The order's `invoices` rows are read with it (staff read them all). "Print the invoice" opens the
  browser's print dialog on the PDF (hidden frame, `printFile`), "Download" saves it, each credit note has its own
  button; the row menu does the same, and the bulk bar's "Invoices" prints the selection as one file, each invoice
  keeping its own pages (`renderDocuments`). Drawn from the frozen snapshot by `lib/adminInvoices.ts` +
  `documents/invoiceDocument.ts`; an order without an invoice (unpaid, or paid before 2026-10-09) says so in a
  toast, never prints an order form in its place.
- **States:** skeleton while loading, an error panel with "Try again" when the read fails (never an empty
  book), "no orders yet", "no result" for filters.
- **Volume.** The whole book is read (1 000 rows per request, up to `BOOK_LIMIT` = 10 000 orders, beyond which a
  notice says only the newest are loaded) and filtered, sorted and paged in the browser, with the state in the
  URL. That is deliberate for now: the KPI row, the buyers' order counts and the customers workspace read the
  same book, and paging on the server needs an aggregate function for the KPIs (a new migration). Plan when the
  book grows: `range()` + filters on `orders` for the table (search on `order_number` / `customer_email` /
  address names, `order_items!inner` for the product filter), counts with `head: true`, a `SECURITY INVOKER`
  RPC for the collected figure per currency, and the buyer's figures read on the detail page.

## Cart and checkout (Stripe)

The cart (`lib/cart.tsx`, pure rules in `lib/checkout/cartLines.ts`) holds integer **minor units** and the
catalogue's `products.id` / `product_variants.id` on each line; it is kept for the tab in `sessionStorage`
(`lib/cartStorage.ts`, a cart stored in the older float format is discarded). Its prices are indicative.

A product added with `addLine` (product page, quick add on the cards) opens a notice under the header's cart
icon (`components/layout/CartAddedNotice.tsx`, styles `.gt-cart-notice` in `index.css`) instead of a toast: the
line, "Undo", "View cart" and a 4-second countdown bar held while the notice is hovered or focused. It closes
on a click elsewhere, Escape or a page change. Undo takes back the units the addition really put on the line
(`addedQty` / `undoAddition`, capped merges included). Gift cards and courses open the cart page instead.

With the Supabase variables set, `screens/Cart.tsx`:

1. reads the delivery rates of the destination's zone (public tables) and lets the customer pick one
   (`lib/checkout/shippingRates.ts`, cheapest pre-selected);
2. sends identifiers, quantities, contact details and the rate id — never an amount — to the Edge Function
   `create-checkout-session` (`lib/checkout/api.ts`, `supabase.functions.invoke`), which creates the order with
   `create_order()` and a Stripe Checkout Session (`ui_mode: custom`) for the amount the database computed;
3. switches to its payment step on the same page (`components/checkout/PaymentView.tsx`): a recap of the
   details with "Change", the order summary with the amount due as the database computed it, and Stripe's
   Payment Element (`components/checkout/PaymentStep.tsx`, lazy-loaded: Stripe.js is fetched only then, never in
   mock mode) drawn with the site's tokens (`lib/checkout/stripe.ts`, Appearance API + Montserrat). "Pay" calls
   `checkout.confirm()`; card payments confirm in place (3-D Secure in Stripe's modal) and go to the confirmation
   page, bank redirects come back to it. "Change" (or a basket changed in another tab) closes the step through the
   function (`release_client_secret`: order cancelled, stock and gift cards released); an expired step (60 min)
   offers "Restart payment". The step's client secret is kept in the tab's `sessionStorage` so a reload's next
   checkout closes it first (`previous_client_secret`).

Promotions in the cart (`lib/checkout/basketQuote.ts`, `useBasketQuote.ts`, `components/shop/PromotionCodes.tsx`):

- **A preview from the database, never a computation.** The cart asks `quote_basket()` (an RPC callable by visitors) what
  the shop goods would receive: running automatic promotions, the promotion codes typed, or the loyalty reward — the
  same engine as `create_order()`. The hook asks again (after a 250 ms pause, newest answer wins) whenever a line, a
  code, the delivery rate or the reward changes; only the answer for the exact basket is shown. The summary lists each
  discount (label, code, amount), a free-shipping promotion shows in the delivery line, a "gift with purchase" as a
  free line, and the payment step shows the same lines. Gift cards and courses are left out (they take no discount).
- **Codes.** Up to 3, format checked in the browser (`^[A-Z0-9][A-Z0-9_-]{0,63}$`, upper-cased), sent as
  `promotion_codes` with the checkout request. A code the database refuses is taken out of the list with a message
  (it never says whether the code exists); 10 refusals in 10 minutes lock the codes for the caller
  (`promotion_code_attempts`, `too_many_attempts`). **Reward and promotions (decision 85):** ticking the loyalty reward
  does not switch promotions off any more: the database applies whichever gives the customer most (promotions alone,
  the reward alone, or — for promotions marked "cumulable avec la fidélité" — both, the reward on what they leave).
  The summary says when the reward was not used (it stays available) or a typed code was not retained.
- **Free orders are not offered (yet).** A basket made entirely free by a promotion (and no gift card) has nothing to
  charge on Stripe: the cart says so and disables the button, and the checkout function releases such an order
  (`free_order`) instead of reporting it paid. Decision to confirm.
- **A guest is quoted without e-mail**, so "new customer" and per-customer limits are settled only when the order is
  created; the payment step always shows the amount the database computed.

Offers in the shop window (`lib/storefrontOffers.ts` pure and tested, `storefrontOffersApi.ts`, `useStorefrontOffers.ts`,
`components/shop/OfferBadges.tsx`, `OfferNotice.tsx`): visitors read the running automatic promotions and campaigns (RLS
shows only those) once hydrated, and every shop card (`StorefrontCard`, `ProductCard`), the product page and the cart
lines show them: the **campaign first** (ink badge), then the **promotion** (highlight badge), and the price. The unit
price is cut only for a percentage promotion with no minimum basket/quantity and no cap; the struck-out price is the
product's own "was" price when it has one, else the price before the cut; other kinds (x + y offered, bundle, gift,
amount off, conditional) show their badge and wording only. Promotions for a type of customer, free shipping, and
products already on sale (when the promotion excludes them) are not shown. The product page adds the customer's title
and description and the days left. In the cart, `quote_basket().lines` gives the amount each line carries: net price
in highlight, original struck out, the same badges. Display only: the database prices the order.

Gift cards in the cart (`lib/giftCards/`, `components/shop/GiftCardCodes.tsx`):

- **Buying one.** `/carte-cadeau` adds a gift card line (`CartLine.giftCard`: recipient, sender, message, design,
  delivery date; the amount is the line's `unitPrice` in minor units). Each card is its own line, quantity 1. The
  checkout sends it as `{product_id, quantity: 1, gift_card: {amount_minor, …}}`; `create_order()` checks the amount
  and the details against `gift_card_settings` and creates the card *pending*; it becomes usable only when the
  verified webhook marks the order paid. A basket of gift cards only asks for no delivery (`shipping_rate_id: null`).
- **Paying with one.** Up to 5 codes are typed in the cart (format checked in the browser only, kept in memory,
  never stored), shown masked, removable, and sent as `gift_card_codes`. The browser never reads a balance: the
  database applies the cards and computes `amount_due`; a fully covered order is paid at once (`status: paid`).
  Every refusal (unknown, expired, empty, cancelled code) is the same "cannot be used" message.
Academy courses in the cart (phase D):

- **Buying one.** The course page's "Buy" adds a course line (`CartLine.courseId` = `courses.id`, `productId` = the
  French slug, cover as image, current price as indicative `unitPrice`), once per course, quantity 1, never
  shipped (`needsShipping` / `shippableSubtotal` leave it out, as `create_order()` does). The checkout sends
  `{course_id, quantity: 1}`.
- **Account required.** A visitor with a course in the basket is asked to sign in or create an account first (the
  basket waits in `sessionStorage`; pay is disabled). The database refuses a guest course line anyway
  (`account_required`) and a course the member already holds (`course_owned`).
- **After payment.** Access comes from the database once the order is paid; the return page (or the cart when gift
  cards covered everything) reloads the member's courses (`useProgress().reload`) and offers "Go to my courses".
  Order history links a course line to its course page (`course:courses(slug)`).

- **Not deployed.** If `create-checkout-session` does not exist yet (HTTP 404) the cart says payment is unavailable;
  nothing is ever confirmed without the function's answer.

After the payment the customer lands on `/fr/panier/confirmation?session_id=cs_…` (`/en/cart/confirmation`,
`screens/CheckoutReturn.tsx`). That page only reads `checkout_session_status()` — order number and state — and
checks again for about a minute; the order becomes paid solely through the verified `stripe-webhook`. The cart
is emptied once the database says the order is paid. Errors are shown as translated messages (`checkout.errors.*`).

Without the variables the cart keeps its mock behaviour (example basket, one flat delivery rule, "payment"
recorded in the in-memory order history). Server side, secrets and the Stripe webhook set-up are described in
`../supabase/README.md` (*Edge Functions (iteration 19)*). To try the whole path locally: `supabase start`,
`supabase functions serve --env-file supabase/functions/.env`, `stripe listen --forward-to
http://127.0.0.1:54321/functions/v1/stripe-webhook`, point `.env.local` at the local project, and pay with the
test card 4242 4242 4242 4242 (`ALLOWED_RETURN_ORIGINS` must include `http://localhost:5173`).

## Project structure

```
src/
  screens/          One component per screen (Home, Shop, ProductDetail, Cart, Academy, CourseDetail, Lesson, Login)
  screens/account/  The member area: sidebar layout + one component per section
  screens/legal/    Help centre, FAQ, contact and about pages
  data/legal/       Legal and help content (bilingual data rendered by components/legal/)
  components/ui/     Design-system primitives (Button, Badge, ProductCard, CourseCard, QuizQuestion, ...)
  components/account/ Dashboard pieces (stat tile, course row, certificate card, order card)
  components/academy/ The training detail page: hero, curriculum accordion, assessment, diploma, community, shared primitives
  components/reviews/ Customer reviews: stars, badges, review card, section, form, request, overlays; admin/ holds the moderation workspace
  components/studio/ The 3D Studio mockups (and editor/, the working editor UI): smile canvas, rendered gems, interactive Studio window, feature cards, media placeholders, inspiration boards, steps, pricing card, FAQ, home teaser
  components/loyalty/ The Loyalty Club: stamp, card, progress, reward, steps, journey, FAQ, checkout banner
  components/layout/ Header (desktop nav + mega panel, mobile burger menu, site search: HeaderSearch over lib/siteSearch.ts) and Footer
  screens/admin/    The administration workspace: access screen, shell, dashboard, orders, products, categories
  components/admin/ Workspace primitives (rail, header, product table, form, media uploader, drawer, dialogs) and the orders workspace (KPI row, filter toolbar, order table + card list, row actions, bulk bar, pagination, detail cards, timeline, notes)
  data/               Bilingual product/course/review/lesson/order data (the storefront's order history and the back office's order book are separate models)
  i18n/               react-i18next setup + locales/fr.json, locales/en.json
  lib/                Auth, cart, learning-progress and order contexts, toasts, price/date helpers
```

## The Academy marketplace (`/fr/academy`, `/en/academy`)

The marketplace is where a visitor discovers, compares and chooses a training; the training's own page (next section) is where they understand it and decide. The two are kept apart on purpose: the marketplace never repeats a curriculum, a lesson list, quiz mechanics, certification rules or a course FAQ.

`screens/Academy.tsx` composes `components/academyPage/`, in the order the visitor's questions come: the hero (`AcademyHero`: the promise, "explore" and "find my starting point", the real featured course on a glass card, figures counted from the catalogue), why learn with Global Toothgems (`ValueSection`, outcomes rather than contents), the catalogue (`CourseCatalog`: the featured course as an editorial panel, the starting-point picker, the controls and the grid), how the Academy works (`HowItWorks`, six platform-level steps; the certificate step only when a published course issues one), "from curiosity to confidence" (`JourneyBand`), the wider Global Toothgems world (`Ecosystem`: the 3D Studio and the shop as links, artist exchange marked "coming soon" — there is no live space for it), learner reviews (`LearnerReviews`) and a closing call. Copy lives in `i18n/locales/academyPage.{fr,en}.json` (under `academyPage`); course themes and levels are `academy.categories` and `academy.levels`. The visual language is the home page's (`gt-alt`), with its own `gt-academy-*` rules in `index.css`.

- **Real data only.** Every course, price, badge and filter comes from the published catalogue (`AcademyProvider`); the browsing rules are pure functions in `lib/academy/catalog.ts` (tested): the featured course is the most recently published (no editorial flag exists yet), "new" means published within 60 days (read once hydrated, since it reads the clock), filters offer only the themes and levels the courses actually use, sorts are curated / newest / price / length. There is no popularity signal, so nothing is labelled "popular". The reviews section shows published course reviews from the review store and is left out of the page when there are none — on a live project that is always, until course reviews are stored in the database.
- **It scales with the catalogue.** One course: the featured panel alone. Two: the picker and the other course as a card. From three: every course in a filterable grid (theme chips, level, sort; a search field from seven), on a phone through a bottom sheet (the shared `Dialog`). Starting points (`new`, `improve`, `professional`, `refine`) never hide a course: the ones that suit (by level and theme) move to the top with a "for you" badge and a ring, and a starting point no course suits yet says so.
- **Server-rendered.** Filters are local state with fixed defaults (never read from the address), so the server's HTML lists every course as a real link (`e2e/auth-server.spec.ts` checks it).

## The training detail page (`/fr/academy/formation/<slug>`, `/en/academy/course/<slug>`)

The Academy catalogue opens one page per training — the sales page for that course, open to visitors like `/academy` itself, since gating it would hide what it advertises. It runs the visitor through the decision in order: what the training is, what they will experience, what they will be able to do, the curriculum module by module, how the journey runs, how the assessment works, the diploma, the artist community included with the purchase, why it is worth taking, and a closing call to action.

**Live since Academy phase B (2026-10-01).** With Supabase configured, the catalogue (`screens/Academy.tsx`), this page, the home page's Academy band and the header's and footer's Academy entries read the **published courses** (`src/lib/academy/`): `api.ts` (one query: course, published translations, cover, outline — modules, steps, knowledge checks' titles and pass marks; plus `course_current_prices`), `publicCourseMapping.ts` (rows → `PublicCourse`, money in minor units, tested), `serverAcademy.ts` (server reads with the publishable key, cached 60 s like the catalogue, tag `academy`), `AcademyProvider.tsx` (the store, seeded by the root layout on every public page, loaded in the browser elsewhere), `courseMeta.ts` (title, description, Course JSON-LD, tested). Without Supabase, `fixtures.ts` turns the prototype's courses (`data/courses.ts`, `data/lessons.ts`) into the same shape. The page itself is given its course by `app/_public/coursePage.tsx`, which also answers 404 (unknown, draft or withdrawn course) and 308 (another language's slug, the row id) and writes the head. Covers come from the private bucket through `/media/formations/<media id>` (`app/media/formations/[id]/route.ts`). Lesson content, questions and answers are never read here.

Two rules shape its content:

- **Nothing is invented.** Title, level, summary, description, objectives, prerequisites, price (and a running promotion), duration, modules, steps, knowledge checks and the pass mark are the course's own; sections without data are left out (no objectives → no outcomes list, no certificate → no diploma section). The catalogue's figures are counted from the published courses. The diploma is rendered with the member area's own `CertificateDocument`; the playable question is labelled as a sample.
- **What the platform does not have is labelled.** The forum preview says it is a preview, and the assessment meter says it is an example. A real course (`enrolment: "sale"`, phase D) offers **"Buy this course"**: one seat goes into the cart (`useCart().addCourse`, `courseId` = `courses.id`) and the visitor lands on the cart; a signed-in member who holds it gets "continue" instead (the button waits while their courses are being read). Its structured data has no offer yet. The prototype's courses (mock mode, `enrolment: "demo"`) keep the demo enrolment described below.

The hero reflects the visitor's own state — enrolled, in progress, completed — but only when signed in: the seeded demo enrolments exist regardless of the session, and this page is public.

Every route into a training now lands here rather than on the login form: both home pages, the Academy marketplace, the header's Academy panel and both footers' Academy columns. The course cards are real links (`components/academy/AcademyCourseCard.tsx`, shared by the home page's band and the marketplace; `CourseCard` takes a `to` for the same reason) — a public page has to be openable in a new tab and crawlable — and `lib/academyUrl.ts` holds the path the way `lib/shopUrl.ts` holds the filtered-collection ones. Only the learner's own pages (`/academy/mes-formations/…`, and `/academy/lecon`, which forwards to them) stay behind `RequireAccount`: the lessons are the paid content.

The account is asked for at the purchase, and the training asked for travels with the visitor: pressing "start" while signed out puts the course id in the navigation state, and signing in adds that course to the account before opening the player, so the purchase resumes instead of opening whichever course happened to be active.

## Account creation (`/inscription`)

A four-step journey — Account → Profile → Preferences → Done — with an email
verification and a welcome screen. The "Create an account" link of `/connexion`,
the cart and the training pages all lead here.

`/connexion` (sign-in only), `/inscription` and `/confirmation-compte` share one
setting, `components/auth/AuthScene.tsx`: the pastel facet field, the card with
its blue crown, and the editorial column (rounded photograph, account benefits).

**With Supabase configured, accounts are real** (`lib/auth.tsx`, same pattern as
`lib/adminAuth.tsx`). The last step calls `supabase.auth.signUp` with the
answers as metadata (`registrationMetadata()` in `lib/registration.ts`); the
database trigger copies them into `profiles` and records the terms, privacy and
marketing consents with `LEGAL_POLICY_VERSION` — bump that constant whenever the
legal texts change. Supabase sends the confirmation email; its link lands on
`/confirmation-compte?suite=<path>`, which picks up the session and continues to
the page the member was heading to. Sign-in reports unconfirmed addresses (with a
resend), wrong credentials, suspended accounts and rate limits separately.
`/mot-de-passe-oublie` and `/reinitialiser-mot-de-passe` use Supabase password
recovery (`lib/passwordRecovery.ts`). On the Security page, changing the email or
the password goes through Supabase Auth (`lib/accountCredentials.ts`); data export
and account deletion are still simulated. The
prototype controls, the mock inbox and the Google dialog only exist without
Supabase; Google sign-in is not connected. Without Supabase, everything below is
simulated as before.

The reason the visitor came is carried in the URL, and the page keeps it in view
and ends on it:

| URL | Context | Primary action at the end |
| --- | --- | --- |
| `/inscription` | Plain sign-up | Follows the chosen interest (products, training), else the dashboard |
| `/inscription?contexte=achat` | Purchase in progress — shows the cart (or `&produit=<id>&qte=<n>`) | Return to cart |
| `/inscription?contexte=formation&formation=<id>` | Training — shows the course | Continue to checkout (starts the course, like "Start this training") |

History state from the login wall (`{ from, course }`) is honoured too.

A **Prototype controls** panel at the top switches the context and forces
outcomes: registration failure, network error, verification email failure,
expired verification link. `camille@studio.fr`, `hello@globaltoothgems.com` and
`lea.martin@gmail.com` are treated as already registered. "Continue with Google"
opens a simulated account chooser; nothing is sent anywhere, no password is
stored, and marketing consent is never pre-ticked. Logic and mock service live in
`src/lib/registration.ts`, components in `src/components/register/`.

## The 3D Studio (`/studio-3d`)

A paid creative tool (€5 / month) for designing tooth jewellery compositions. The presentation and subscription pages are visual prototypes (no payment is taken); the **editor** at `/studio-3d/atelier` is a working three.js application, **free for every visitor during the preview**.

| Route | Screen |
| --- | --- |
| `/studio-3d` | Presentation page: hero with the Studio window, concept, six capabilities, media wall, inspiration boards, three steps, offer, FAQ |
| `/studio-3d/abonnement` | Subscription page: the single monthly plan, account, fictional payment, summary, loading and confirmation states (`/studio-3d/subscribe` redirects here) |
| `/studio-3d/atelier` | The editor: 3D dentition (both arches), the shop's gems as its library, placement by drag / click / keyboard, collision-free layout tools, presets, undo/redo, PNG / estimate sheet / JSON export (`/studio-3d/editor` redirects here). Full-screen, without the storefront header and footer |
| `/studio-3d/atelier/mes-creations` | My Creations: the account's saved designs (`…/editor/creations` redirects here) |
| `/studio-3d/atelier/mes-groupes` | My Gem Groups: reusable multi-gem arrangements (`…/editor/groups`) |
| `/studio-3d/atelier/aide` | Help & Tutorial (`…/editor/help`) |
| `/studio-3d/partage/<token>`, `/studio-3d/partage#…` | A creation shared read-only (a stored link, or a snapshot carried in the fragment): the design in 3D (orbit, zoom, auto-orbit), its name and description, and an invitation to sign in to use the Studio — or, signed in, "Edit a copy". Open to everyone, outside `RequireStudioAccess`; full-screen like the editor (`/studio-3d/share/<token>` and `/studio-3d/share#…` redirect here) |

### The editor

Ported from the standalone `studio3D.html` into the app's architecture:

| Where | What |
| --- | --- |
| `data/studioEditor.ts` | The piece model (product, colour variant, stone size, look snapshot), the Studio's outlines, the dentition, structural validation of designs read back from storage |
| `lib/studio3d/gemCatalog.ts` | **The library is the shop**: every active gem of the catalogue (`useCatalog`), whatever its stock, with its look (`studio_gem_appearances`, else its shop shape and colour), its colours (colour variants) and sizes (`ss` variants, else SS2/SS5/SS7); the indicative value of a composition at shop prices. Pure, unit-tested (`gemCatalog.test.ts`) |
| `lib/studio3d/useStudioGems.ts`, `gemRegistry.ts` | The React hook that builds the gems once per catalogue load, and the module-level copy the engine and the repositories read |
| `lib/studio3d/engine.ts` | The three.js engine: scene, camera, raycast placement, drag, collisions, mirror / distribute / align, group turn, the design check, glTF import, exports. On-demand rendering (idles when nothing moves) |
| `lib/studio3d/dentition.ts`, `assets/studio3d/dentition.glb` | The default dentition scan and its calibration: where each crown of both arches sits, so a surface point is known as a tooth (FDI 11–47) or as gum / socle |
| `lib/studio3d/geometry.ts` | Procedural teeth (the fallback arch), the gems' outlines as the shop photos show them (baguette, square, heart, lozenge "Diamond Shape", navette, raindrop, rivoli star, StarFlower, and the 18ct charms: open heart, halo star, bolt, cherries, snake, dachshund), each normalised so its longest side is the SS diameter; crystal / metal / iridescent materials, cached. The heart, navette, raindrop, rivoli star and StarFlower are traced from the product photos (silhouette measured on the photo, averaged over the stone's symmetries) and cut as the photos show: crown step round a pentagon table, step cut with a flat table, briolette diamonds, a five-ridged pyramid with its centre rosette, a bevelled outline round a pentagon table. The 18ct snake, dachshund, bolt, cherries and open heart are their photo's outline (with its openings: the open heart's middle, the gap between the cherries' stems), traced pixel by pixel, raised into a smooth polished relief (`goldCharm`; a crease marks the cleft between the two cherries). `geometry.test.ts` holds the measured proportions |
| `lib/studio3d/store.ts` | The design store (history, selection, local persistence in `gt-studio3d-design-v2`) |
| `lib/studio3d/actions.ts`, `notices.ts` | Shared commands, and the channel through which the engine reports to the site's toasts by translation key |
| `components/studio/editor/` | Top bar, library (shop photos, grouped by cut), 3D stage, inspector (colour = the shop gems of the same cut, size = its SS options, link to the product page), popovers |
| `screens/StudioEditor.tsx` | The page: layout, shortcuts, save on exit. Lazy-loaded, so three.js is only downloaded when the editor opens |

- **Access**: `lib/studioAccess.tsx` is the single switch. `STUDIO_ACCESS_MODE = "preview"` lets everyone in without paying. When the subscription goes live, switch it to `"subscription"` and back it with a server-side entitlement granted by the verified Stripe webhook; the client check is navigation only.
- **Saving**: the working draft is kept in the browser (`gt-studio3d-*` keys) as before; saving it to the account goes through the Studio workspace below.
- **Estimate**: the indicative value at shop prices (`estimateComposition`: one pack per crystal product and colour, one charm per metal piece — rule to confirm), shown as "approx." and labelled as not a quote. Never sent to checkout. The estimate sheet lists one row per shop item to buy.
- **Gems**: the library loads with the storefront catalogue; until it has, a drag places nothing. A piece whose product left the shop keeps rendering from its stored look and is named "no longer in the shop".
- **Default model**: the editor opens on `dentition.glb` (meshopt-compressed, ~1 MB, decoded from the bundle). If it cannot be fetched, the procedural upper arch stands in, with a notice. Pieces go on crowns only, never on gum or socle. A design saved on another model (older designs were made on the procedural arch) is re-seated tooth by tooth when it opens; the same happens when a model is imported or reset. Raycasts use a bounding-volume hierarchy (`three-mesh-bvh`): a scan of this size costs ~18 ms per ray without one, and placement casts hundreds.
- **Design check**: pieces that overlap another or do not sit on a tooth are framed in red on the stage and listed in a panel (placement and dragging never create them; sizes, type changes, group turns or a design from another model can).
- **Tablets and phones held sideways** (2026-10-08): the side-by-side layout (`studio-side` variant in `index.css`) also covers a phone in landscape, where the panels used to stack under a stage taller than the screen. The library and the inspector fold away from two switches in the stage's top corners (`useEditorPanels.ts`): only a roomy desktop window (≥ 1536 × 820, mouse) opens the inspector by default, a phone held sideways starts on the stage alone, and below 1280 px opening one panel closes the other. The panels are drawers over the stage (decided by the owner, 2026-10-09): the stage always fills the space, so the 3D canvas is never resized when one opens or closes, and the stage's own controls (switches, pills, camera bar, issue list, quick bar) keep to the part left in view (`--gt-lib-open` / `--gt-insp-open`). Folded drawers stay mounted (search, tab and scroll kept) and slide in and out in 160 ms (`usePanelPresence`; no slide under reduced motion). The artist's choice is kept per kind of screen in `gt-studio3d-panels-v1`.
- **Finding a gem**: a "Shape" button naming the cut shown opens a picker in place of the list — one tile per cut drawn with the shop's own glyphs (`ShapeGlyph`), a jewel for each family of charms, each with its count under the search — and sections that fold (`gt-studio3d-library-folded-v1`); a search or a chosen cut unfolds what it shows. The grouping is `lib/studio3d/librarySections.ts` (tested). On a touch screen a card dragged sideways goes to the stage, a swipe up or down scrolls the list (`touch-pan-y`; the browser's `pointercancel` drops the placement).
- **Multi-selection without Shift**: "Select" on the camera bar (or a finger held ~0.5 s on a gem) turns on a mode where each tap adds a gem to the selection or takes it out, a tap beside one keeps the selection, and a lasso adds to it — so two gems at opposite ends of the arch are two taps. "+ Identical" adds every piece of the same gem, colour and size; "Done" or Escape ends the mode. A mouse keeps Shift / Ctrl-click; its long press does nothing new. On Android the long press no longer opens the piece's context menu (the quick bar covers it).
- **Model import** (`.glb` / `.gltf`, 60 MB max) runs entirely in the browser; Draco-compressed files fetch their decoder from the jsDelivr build of the bundled three.js version.

- **The Studio window** (`components/studio/StudioMockup.tsx`) is lightly interactive: pieces can be selected, swapped from the library, resized, recoloured, added and removed; presets, undo/redo, zoom and a CSS-perspective "¾ / profile" view all work on local state. "Save" and "Share" only play their states.
- **The canvas** (`SmileCanvas.tsx`) is an SVG drawing of a smile; pieces reuse the shop's `GLYPH_PATHS` with material gradients (`Gem.tsx`, `gemStyle.ts`).
- **Replaceable media**: every tile of the "See what you can create." wall is a `MediaPlaceholder` carrying `data-placeholder="…"` and a visible `[… PLACEHOLDER]` tag. Search for `data-placeholder` to find them.
- **Fictional content**: compositions, library pieces, saved creations and inspiration boards live in `data/studio.ts`; copy lives in `i18n/locales/studio.{fr,en}.json` under `studio`. FAQ answers (mobile availability, saving, use when ordering) describe the intended product and must be confirmed before launch.
- **Price**: `STUDIO_PRICE` is a display value only. In production the price comes from the Stripe Price, the button hands over to Stripe Checkout (subscription mode) and access is granted by the verified webhook — never by the confirmation screen.
- **Editor entry points**: while preview access is on, "Open the Studio" on the presentation page (hero, FAQ, phone bar), the home teaser, "Recreate" on the inspiration boards and the subscription confirmation all lead to the editor; the offer section still leads to the subscription page.
- **Navigation**: "Studio 3D · New" sits after the Academy in both desktop headers, as a featured row above the tabs in both mobile menus, and as a link in the member area sidebar and pill row. The home page carries a teaser (`StudioTeaser`) between the best sellers and the Academy band.

### The Studio workspace (creations, Gem Groups, help, feedback)

The layer around the editor that makes it a personal design workspace. The editor itself is unchanged in its interaction model; the workspace adds a navigation rail (a drawer below `lg`), a save pipeline, a creative library, reusable Gem Groups, help and feedback.

| Where | What |
| --- | --- |
| `lib/studioWorkspace/scene.ts` | The saved `scene_data` format (version 2 since 2026-10-07: pieces are shop gems; format-1 designs were discarded): every piece with its product, colour, SS, look and full transform, the light, the camera and the Gem Groups pieces came from; `sanitizeScene` for anything read back |
| `lib/studioWorkspace/gemGroup.ts` | Gem Group arrangements (version 2), stored in an anchor tooth's frame (along the arch, up, out of the enamel) so they can be dropped on any tooth and keep their spacing, spin, gems, colours and sizes |
| `lib/studioWorkspace/repository.ts` | **The persistence boundary**: `CreationsRepository`, `GemGroupsRepository`, `FeedbackRepository`. The UI never touches storage or Supabase directly |
| `lib/studioWorkspace/supabaseRepository.ts` | The Supabase implementation, used for real accounts: `creations`, `gem_groups`, `studio_feedback`, thumbnails in the private `studio-thumbnails` bucket |
| `lib/studioWorkspace/localRepository.ts` | Browser-storage implementation for the mock sign-in's demo accounts, one namespace per account, seeded with the example library (`seed.ts`) |
| `lib/studioWorkspace/workspace.tsx` | Provider: the loaded library, the save state of the stage (`empty` / `unsaved` / `saving` / `saved` / `failed`), and every action with its toast |
| `lib/studioWorkspace/share.ts` | Read-only share links: stored links (token) and snapshot links (the design encoded in the URL fragment), both read defensively (tested in `share.test.ts`) |
| `lib/studio3d/socialShare.ts`, `components/studio/ShareNetworks.tsx` | Social networks: each network's share page pre-filled with the read-only link (no network script loaded), shared by the editor's Share menu and `ShareDialog` |
| `lib/studioWorkspace/library.ts`, `validation.ts` | Search, filters, sort, summary; name / description / tag rules (unit-tested in `studioWorkspace.test.ts`) |
| `lib/studio3d/archLayout.ts` | The reference arch as plain numbers, shared by the engine and the drawn previews |
| `components/studio/workspace/` | `StudioSidebar`, `CreationLibrary`, `CreationCard`, `CreationDetail`, `GemGroupLibrary`, `GemGroupCard`, `GemGroupPanel` (in the editor's library, with drag onto a tooth), `SaveCreationDialog`, `SaveGemGroupDialog`, `DeleteConfirmation`, `FeedbackModal`, `HelpPanel`, `HelpHint`, `OnboardingOverlay`, `SaveStatus`, `SaveControls`, `EmptyState`, `SearchAndFilters`, `ScenePreview`, `ShareDialog` |

- **Sections open over the stage** instead of replacing it: the editor stays mounted (hidden, `inert`), so an imported model, the camera and the undo history are still there when the artist comes back. The editor's keyboard shortcuts are off while a section or dialog is in front.
- **Saving** needs an account (signed out, Save explains why and returns after sign-in; the local draft is never lost). A new design opens the save dialog (name, description, tags); a linked one saves with "Save changes" or Ctrl+S; "Save as new creation" keeps the original. The draft remembers which creation it belongs to, per account, across reloads. An empty design is never saved over a creation.
- **Unsaved changes** are measured by content, not by history. Opening another creation or starting a new design over unsaved changes asks first.
- **Previews**: a saved creation stores a small JPEG captured from a fixed front camera (`engine.captureThumbnail`); a new Gem Group stores the same kind of render with every other piece of the stage hidden and the camera framed on its pieces (`engine.captureGroupThumbnail`). The save dialogs take the capture when they open (`useStageCapture`) and show it, so the image previewed is the one the card keeps. Records without one — the examples, groups saved before 2026-10-03 — are drawn from their own data by `ScenePreview`, on the same arch geometry, so a card always shows the real composition.
- **Opening a creation** re-seats every piece on the enamel of the current model (`engine.settlePendingLoad`) and restores its camera; this settling does not count as an edit.
- **Gem Groups**: select two or more gems → "Create Gem Group" (inspector, or right-click on the stage). Insert from the editor's "My Groups" tab (click: on the selected tooth or where the group was made; drag: onto any tooth, with the target tooth lit before dropping) or "Use in Studio" from the library. Pieces that do not fit slide to the nearest free spot or are skipped, and the toast says so.
- **Estimates** are the composition's indicative value at shop prices when it was saved (`estimated_price_minor` + currency). The summary's "total estimated design value" is informational only.
- **Onboarding** shows once per browser (`gt-studio3d-onboarding-v1`), can be skipped at any step and replayed from Help.
- **Feedback** records a rating, a type, the message and a little context (page, piece count, language, window size — nothing personal).

**On Supabase.** Real accounts use `lib/studioWorkspace/supabaseRepository.ts`, backed by `supabase/migrations/20260928222836_studio_workspace.sql`: `creations` (the scene in `scene_data`), `gem_groups`, `studio_feedback` and the private `studio-thumbnails` bucket, owner-only by RLS, with `user_id` defaulting to `auth.uid()` and not writable. A creation's render is uploaded to `studio-thumbnails/<user id>/<creation id>.jpg` after the row is saved (best effort) and served by signed URL; a Gem Group's to `studio-thumbnails/<user id>/groups/<group id>.jpg` (`gem_groups.thumbnail_path`, migration `20261003131220`), copied on duplicate and removed with the group. The demo accounts of the mock sign-in keep the local, seeded store (`localRepository.ts`). The switch is `createRepositories()` in `workspace.tsx`. Designs saved in a browser before the switch stay in that browser's storage and are not imported.

**Read-only share links.** "Share" (a creation card's menu, its detail dialog, the Save menu when the stage is linked to a creation, and the editor's Share menu) opens `ShareDialog`: the link, one button per social network (WhatsApp, Facebook, X, LinkedIn, e-mail — `socialShare.ts`, plain share pages opened in a new tab, no SDK), the system share sheet where available, and a preview. Opening the dialog is the explicit act that creates a link; the editor's Share menu only looks for an existing one (and asks to save a new design first).
- **Stored links** (real accounts, Supabase): `/studio-3d/partage/<token>`, backed by `creation_shares` (a random 48-hex token per creation, one active at a time, `revoked_at`). Owners read their own links through RLS and create / disable them only through `studio_share_creation` / `studio_revoke_creation_share`, which check ownership. Guests — signed in or not — never touch a table: `studio_shared_creation(token)`, a security-definer reader granted to `anon`, returns the name, description and scene of **that one creation** (Gem Group ids blanked), nothing about the owner, and nothing for an unknown or disabled token. The link always shows the latest saved version; "Disable link" in the dialog stops it at once, including where it was already posted, and a new one can be created. Deleting the creation deletes its links.
- **Snapshot links** (the mock sign-in's local library, and the fallback while the share table is missing from the database): the design itself in the URL fragment (`#z1.…` deflate-compressed base64url JSON; `#j1.…` where `CompressionStream` is missing) — sanitized scene, name and description, never the owner id, the client name, tags or the thumbnail. The fragment never reaches a server. A snapshot does not follow later edits and cannot be revoked; links of this form already sent keep opening.
- The viewer (`screens/StudioShare.tsx`) renders with its own `DesignStore({ persist: false })` and a `StudioEngine(…, { readOnly: true })`: every press goes to the camera, no piece can be selected or moved, and the recipient's own draft (`gt-studio3d-design-v2`) is never read nor written. Everything it receives is re-sanitized. Signed out, the panel asks them to sign in (and returns to the same link); signed in, "Edit a copy" loads the design as a new unsaved design on **their own** stage — the shared creation is never written — asking first if that would replace unsaved work.
- Limits: anyone who has a link can view the design; a design made on an imported model is shown on the default dentition. Social networks show the site's generic preview card (no per-creation image yet).

**Overlap to decide:** the editor's older "My presets" (whole designs kept in browser storage, under Presets) still works as before. Saved creations now cover that need per account; the presets menu could be retired or pointed at My Creations.

## The member area (`/compte`)

The signed-in area is an administration dashboard: a left sidebar on desktop, a scrollable row of pills on small screens, and one route per section.

| Route | Section |
| --- | --- |
| `/compte` | Dashboard — summary tiles, the "resume where you left off" card, the courses being followed with their module breakdown, and the courses still available |
| `/compte/attestations` | Certificates — the collection (newest featured), each with view (zoomable viewer), download (A4 PDF) and share (image + caption); courses under way as locked cards; an encouraging empty state. The document is `lib/certificate/layout.ts`, drawn as SVG on screen and on a canvas for the files (`lib/certificate/render.ts`, `pdf.ts`); sharing is `components/certificate/ShareAchievementDialog.tsx` (no public certificate page, by decision) |
| `/compte/commandes` | Order history, with parcel tracking and lifetime spend per currency |
| `/compte/commandes/:reference` | One order: lines as bought, recorded amounts, parcels and tracking, refunds, addresses; the legal invoice and each credit note as PDFs (issued by the database, `invoices`; an order paid before 2026-10-09 offers the order form instead) and "Print the summary" (not an invoice) |
| `/compte/fidelite` | Loyalty card — the member's real stamp card and reward (`lib/loyalty.tsx`, `loyalty_overview`), read again on arrival |
| `/compte/profil` | Profile details, editable and saved: name/phone on `profiles`, newsletter as a `marketing_email` consent record, address as the default shipping row of `customer_addresses` (emptying it deletes the row; a partial address is refused client-side) |

The sidebar also links out to the course catalogue (`/academy`) and signs the member out. `RequireAccount` wraps the layout, so every section is gated at once.

The member area is capped at `--max-width-account` rather than `--max-width-content`: it spends a 248 px sidebar, the column gap and its own gutters out of the width every other screen gives entirely to content, so the wider cap is what makes its content column measure the same 1240 px as the shop grid.

The sections own no state of their own. Learning progress lives in `lib/progress.tsx`, order history in `lib/orders.tsx` and the member profile in `lib/auth.tsx` — in-memory contexts shaped like the existing `lib/cart.tsx`. The lesson player writes to the first and the cart writes to the second; since phase 5 of `docs/migration-nextjs.md` the member space is reached by a client-side navigation again, so those mock writes show on the dashboard (a reload resets them). Certificates are derived from a course reaching 100 %, never stored as a separate flag, and the delivery timeline is derived from the order's recorded status and fulfilment for the same reason. Order amounts are integer minor units plus the order's currency (`data/orders.ts`), taken as recorded — never re-added from the lines — and formatted only at display (`formatMoney`); an order has three independent state axes (status, payment, fulfilment), a refund is not a cancellation. Editing the profile moves the greeting and the avatar, because both are derived from the stored name rather than copied from it.

Progress is computed against the course each product opens (`Course.trainingId`), as authored in the back office — see the learning experience below. The Academy sales pages read the published courses (phase B, above); the member area stays on the prototype courses until phase C.

## The learning experience (`/academy/mes-formations/:courseId`)

What a member who holds a course reads. The course is the one built in the back office (`/admin/formations`), never a separate copy, and the administrator's preview renders blocks and knowledge checks with the learner's own components. **With Supabase (phase C, live):** `lib/progress.tsx` loads `learner_courses()` once the member is signed in — the courses they hold an active entitlement to, keyed in the addresses by their French slug (`/academy/mes-formations/<slug>`), the published content without answer keys, the media paths (signed for 4 h, renewed every 3 h, resolved by `useCourseMediaUrl()`), and their progress — through `lib/learning/learnerApi.ts` and the pure mapping `lib/learning/learnerCourse.ts` (unit-tested). Validating a step calls `complete_course_step()` and moves on only once it is recorded; knowledge checks are corrected by the server (`lib/learning/grading.ts`: `answer_quiz_question()` for immediate feedback, `submit_quiz_answers()` for the attempt). **Without Supabase (mock mode)** the prototype's storefront courses (`data/courses.ts` → `trainingId`), seeded enrolments and local grading run instead (Playwright uses this mode).

| Route | Screen |
| --- | --- |
| `/academy/mes-formations/:courseId` | Course overview: cover, progress ring, modules and steps completed, time left, the next unfinished lesson behind one "Continue training" button, module cards with status badges, recently completed lessons, objectives and completion rules |
| `/academy/mes-formations/:courseId/lecon/:nodeKey` | The lesson player, a full-screen workspace (no storefront header/footer): lesson content in authored order (text, image, video, any mix), the module's knowledge check after its last step, a side panel with the course outline on desktop, and a progress strip, a contents sheet and a bottom action bar on phones |
| `/academy/mes-formations/:courseId/terminee` | Completion: the ring closing on 100 %, the badge, the certificate revealed with a short confetti fall (none under reduced motion), download and share in place, the figures that earned it, then the way on (other courses, review the course) |
| `/academy/lecon` | Forwards to the overview of the course just opened (every existing "open this course" action lands here) |

How it works:

- **One walk through the course.** `lib/learning/path.ts` turns a course into the learner's path — every step, each module's check after its last step (the same order the admin preview uses) — and holds the rules: sequential unlocking, which checks gate progression (the course's `allQuizzes` setting), attempts per check (`allowRetry`/`attempts`), the course minimum average score, deterministic scoring. Progress is stored per step and per check id, so reordering a course in the builder never moves a learner's progress onto another lesson. The rules are unit-tested (`learning.test.ts`); in production the same rules run server-side and the browser never decides a completion or a pass.
- **Access** (`lib/learning/access.ts`, enforced by the database functions): an entitlement is required; a draft is never shown; a course that was *unpublished* (owner, 2026-10-01) stays on its holders' dashboard, greyed out with a "back soon" message, and its pages show the same message instead of the content. Loading and load errors have their own screens.
- **Authored HTML is sanitised** before a learner reads it (`lib/learning/sanitizeHtml.ts`, allow-list, tested).
- **Video**: real sources (http(s), blob) play in a native `<video>` behind custom controls; the prototype's placeholder sources (`gtg-media://…`) run on a simulated clock labelled "demo footage". Keyboard: Space/K, ←/→, M, F.
- **Knowledge checks** follow the settings chosen in the builder: immediate or end-of-check feedback, revealed answers, shuffling once per attempt; a learner can retake a check as often as needed until they pass it (no attempt limit). Wrong answers are explained in the administrator's words, never punished. The browser never holds the answer keys: `QuizPlayer` asks a grader, which is the server for a learner and the local answer keys in the administrator's preview. With immediate feedback the first answer to a question stands.
- `lib/progress.tsx` is the one source for the dashboard, certificates (the server's verification code), community access and review eligibility. The dashboard's "available" courses are the published Academy (`useAcademy()`) minus the held ones; a course's sales page offers "continue the training" to a member who holds it.

## Course authoring on Supabase (back office)

The course builder (`/admin/formations`, `/nouvelle`, `/:id`, `/:id/apercu`, `/:id/publication`) reads and writes the Academy tables (`supabase/README.md` → *Academy authoring*) when Supabase is configured, and the prototype fixtures otherwise:

- `lib/adminTraining.tsx` — the store. Structural edits stay in memory (instant); **Save** sends the whole course to `admin_save_course()`; publishing saves first, then changes `courses.status` (the database checks readiness: `course_publication_problems()`). It loads nothing until a staff session is open (it sits in the root layout). Writes reject with a `TrainingError`, shown by the screens (`components/admin/training/trainingErrors.ts`).
- `lib/adminTrainingBackend.ts` — mock and Supabase backends; `lib/adminTrainingMapping.ts` — rows ↔ builder, payloads, error kinds (unit-tested). Node ids are browser-generated uuids kept across saves.
- **Price and promotions**: the price is typed in the course form (`lib/coursePricing.ts`, minor units, no float); `components/admin/training/CoursePromotions.tsx` manages dated percentage/amount promotions of one course (saved immediately; one active at a time). Courses are not shop products and never appear in the shop.
- Status: draft → published ⇄ unpublished, no "review" state; a course ever published cannot be deleted (the card hides the action, RLS refuses it). No instructor field.

## Course access (`/admin/formations/:id/acces`)

Besides purchases (phase D: a `purchase` entitlement from the paid order), a course reaches a member by hand: the screen (`screens/admin/TrainingAccess.tsx`, reached from a published course's card menu, "Member access") lists the holders with their source, dates, steps validated, completion and certificate code, gives the course to an account by exact e-mail (optional end date and internal note) and revokes an access after confirmation. `lib/adminCourseAccess.ts` calls `admin_course_entitlements()`, `admin_grant_course()` and `admin_revoke_course_entitlement()` — `manage_training`, audited — and keeps a page-local list in mock mode.

## Training media library (`/admin/formations/medias`)

The course editor's images **and videos** are managed on their own screen (`screens/admin/TrainingMedia.tsx`): upload by button or drag and drop (JPG/PNG/WebP/AVIF up to 10 MB; MP4/WebM/MOV up to 50 MB, the Supabase free plan's per-file limit — raise `MAX_VIDEO_BYTES` in `lib/trainingMediaRules.ts` and the dashboard setting on Pro), search, kind / category / usage filters, a details panel (preview or player, length, dimensions, size, date, usage count, name, category, FR/EN description, tags — saved with a button) and delete (refused while a course uses the file; the database refuses it too).

The builder's media fields (`components/admin/training/MediaPicker.tsx`) only **pick**: a select-only dialog (`MediaPickerDialog.tsx`) with search and categories, a link opening the library in a new tab and a *Refresh* button. Picking a video fills the block's duration from the file.

With Supabase, files go to the private `training-media` bucket under `media/<id>/` through resumable TUS uploads (`tus-js-client`, 6 MB chunks, direct storage hostname), each with a `training_media` row; the back office displays them through signed URLs renewed every 45 minutes (`lib/trainingMedia.tsx`). Course fields hold the media **id**, never a URL: every screen resolves it with `useTrainingMedia().urlOf()` (`components/admin/training/MediaImage.tsx`, the learner's `LessonBlocks`/`QuizPlayer`). In the prototype the library is the seeded photographs and uploads stay in the page.

## The Members' Lounge (`/compte/salons`)

The community's private chat — *Salon des membres* / *Members' Lounge*. Same door: an account with a training on it (`useCommunity().hasAccess`, the same rule and the same **Aperçu prototype** switch, reachable from the flask in the lounge's user panel). Without access, the page is an invitation (`LockedLounge`): the real lounge blurred behind one card, *Découvrir les formations*, and the way back to the account. The member-space sidebar carries both entries, each marked "accès avec une formation" when locked.

Language lounges (English by default, French, German, Spanish; Italian and Portuguese announced in the switcher) with the same five channels each (introductions, general, inspiration, techniques & tips, business & growth), and private conversations that belong to the community, not to a lounge.

**One address per room** (`lib/communityChat/loungeRoutes.ts`), so Back walks from room to room and a channel can be linked to: `/compte/salons/<en|fr|de|es>/<presentations|discussion|inspiration|techniques|business>`, `/compte/salons/messages/<member>`. The bare `/compte/salons` forwards to the room visited last on this device (`gt-lounge-last`), else `/compte/salons/en/discussion`; anything else is the 404 inside the shell. The lounge is the section's layout (`app/compte/salons/layout.tsx` → `MembersLounge`), so it stays mounted while the address changes; the optional catch-all page (`[[...room]]`) only checks the session.

**With the member space.** In the lounge the shell steps back rather than stacking two menus: on desktop its sidebar narrows to an 88 px rail of the same sections (icon + short label, like the Studio rail), whose "Menu" opens the full sidebar over the page; on phones the shell's top bar is left out and the lounge's drawer starts with "← Espace membre", which opens the same menu (`useMemberShellMenu`). The locked lounge and its 404 keep the full shell. The lounge state (`ChatProvider`) is mounted by the account zone (`zones/account.tsx`), so the sidebar's *Salon des membres* entry shows its activity on every member page — a fuchsia count for what is addressed to you (mentions, private messages), a dot for other unread messages — and the dashboard shows a lounge card (`LoungeActivityCard`) leading to the waiting private message, or to the last room.

Desktop is three columns beside the rail — lounge sidebar | conversation | members (from 1280 px; a drawer below, toggled from the header). Below 1024 px the lounge sidebar is a drawer opened from the conversation header, which also carries the private messages and the inbox.

| Piece | Where |
| --- | --- |
| Fixtures (members, lounges, channels, messages, private conversations) | `data/communityChat.ts` — `minutesAgo` ages, mentions stored as `{ type: "mention", memberId }` tokens, message text written in the lounge's language (content, not UI) |
| Pure rules (reactions, mention parsing and autocomplete, grouping, search) | `lib/communityChat/chatLogic.ts`, tested in `chatLogic.test.ts` |
| State (one reducer: open the room of the address, send, react, mark read, mute, notifications derived from the rooms) | `lib/communityChat/chatStore.tsx`, mounted by the account zone |
| Addresses | `lib/communityChat/loungeRoutes.ts`, tested in `loungeRoutes.test.ts` |
| Screen and components | `screens/communityChat/MembersLounge.tsx`, `components/communityChat/` |
| Copy | `i18n/locales/communityChat.{fr,en}.json`, under `lounge` |

Simulated, in memory, reset on reload: sending (text, `@mentions`, emoji, images kept as object URLs in the tab), replies shown as a compact quote with a connector, reactions, unread counts and the "New" marker, muting, mark-as-read, the inbox (mentions, replies, reactions, private messages), search (messages, members, channels of the current lounge and the private conversations), member profiles, presence, and — prototype only — a typing indicator and a canned answer when you write privately to someone online (`DEMO_AUTO_REPLY`). Nothing is sent, stored or authorised. A live version needs tables for lounges, channels, messages, reactions, read markers and conversations with RLS on the same course entitlement, Realtime for delivery, private Storage for images, and moderation — none of it exists yet.

## The administration area (`/admin`)

A separate, desktop-first management workspace for the product catalogue. Product management and sign-in run on Supabase when it is configured (see [Supabase connection](#supabase-connection-back-office-products)); without it, and for every other section, it is an interactive visual prototype with no persistence. It is deliberately not the storefront in a sidebar — same palette, same Montserrat, but squarer controls, denser rows and its own near-black navigation rail, because a catalogue table and a product page are not the same job.

| Route | Screen |
| --- | --- |
| `/admin/connexion` | Access screen — validation, loading, error and success states, plus a simulated password-recovery dialog |
| `/admin` | Dashboard — catalogue counts, the products that cannot currently be sold, and recent product activity |
| `/admin/commandes` | Order book — KPI row, search and filters, the table, bulk actions, export |
| `/admin/commandes/:reference` | One order in full: items and money, shipping, payment, customer, timeline, internal notes |
| `/admin/produits` | Product list — search, filters, sorting, row actions, preview drawer |
| `/admin/produits/nouveau` | Create a product |
| `/admin/produits/:id` | Edit a product |
| `/admin/categories` | Categories, read-only, with per-category counts and price ranges |

Without Supabase, sign in with `camille@globaltoothgems.com` / `toothgems2026`; the screen prints both. With Supabase, use a staff account. The customers workspace (`/admin/clients`) is described in "Customers on Supabase" below.

### How it is put together

- `data/adminCatalog.ts` — the mock catalogue: sixteen products covering every state the interface can show (active, draft, archived, out of stock, low stock, untracked inventory, discounted), the categories, and the media library the picker offers instead of a real upload.
- `lib/adminCatalog.tsx` — the one place any product changes. It picks the Supabase store (`lib/adminCatalogSupabase.tsx`) when the environment is configured and the in-memory prototype store otherwise; both implement the same contract (`lib/adminCatalogContext.ts`), so no screen knows which one it is on. A failed write is reported by a toast from the store and rejects, so the screen keeps the form and skips its success path.
- `lib/adminAuth.tsx` — the administrator session, kept separate from the customer session in `lib/auth.tsx`: Supabase Auth restricted to staff accounts when configured, the demo account otherwise. A rejected password leaves no session behind.
- `lib/productFilters.ts` — search, filtering and sorting as pure functions on plain state; the product list holds its filters in the URL, so a filtered view can be linked to and stepped back through.
- `data/adminOrders.ts` — the back office's order model (types only; the mock book is gone). A separate model from the member's `data/orders.ts`, sharing its amounts, lines, discounts, parcels, refunds and addresses. See *Orders in the back office* above.
- `lib/adminOrders.tsx` — the one place any order changes (Supabase only; without it the book is empty).
- `lib/adminOrderFilters.ts` — search, filtering, sorting and paging as pure functions over URL state, the same convention as `lib/productFilters.ts`; the KPI row and the filter options come from the book itself.
- `components/admin/` — the workspace's own primitives (rail, header, table, row, status badge, filters, form, media uploader, preview drawer, confirmation dialog, empty and loading states, form field, search input, category badge), plus the orders workspace's own pieces.
- `components/ui/Dialog.tsx` and `components/ui/Menu.tsx` — a modal with a focus trap and a keyboard-navigable dropdown, added for the orders screens. See the scope note below: they overlap with `components/admin/ConfirmationDialog.tsx`, `OverflowMenu.tsx` and `lib/useFocusTrap.ts` and should be consolidated onto those.

### Decisions worth knowing

- **Status is three values, not four.** `active`, `draft` and `archived` are the lifecycle; "out of stock" is an inventory fact derived from the count, so restocking is not a status change. `displayState()` recombines the two for the single badge that has to say everything at once.
- **Nothing says its state with colour alone.** Every status carries an icon and a word as well, and inventory is always a number *and* the word for what that number means.
- **Product text is stored per language**, matching the translation-aware model the guidelines ask for. The form carries a FR/EN switch rather than doubling every field, and marks a language whose name is still empty.
- **Destructive actions escalate.** Archiving is reversible and asks for a click; permanent deletion asks for the product's SKU to be typed. Focus opens on Cancel, or on the confirmation field when one is required — never on the destructive button. Restoring an archived product returns it to draft, never straight back on sale.
- **Clicking a product opens a drawer, not a page.** Triage means checking one product after another, and the drawer keeps the filtered list and your place in it on screen. Anything that changes a product still opens the full edit page, so there is exactly one place where products are edited.
- **Reordering media uses buttons, not drag and drop** — the obvious gesture is the inaccessible one.
- **An order's detail is a route, not a drawer** — the opposite call from products, for a reason. Triaging products means checking one after another, which is what a drawer is for; an order is the thing a colleague pastes into a message, and it holds a page's worth of content. The list's query string travels in the URL, so the breadcrumb and the back link both return to the same filtered page rather than to row one.
- **The KPI row is a filter, not a decoration.** Pressing "Pending" narrows the table to pending orders, and the figures are counted from the same array the table renders — a count that disagrees with the rows under it is worse than no count.
- **Attention is a tint and a badge, never a red row.** Six flagged orders in a table of twenty-five have to be findable at a glance without the page reading as an incident.
- **The orders table becomes cards below `xl`, not `lg`.** The rail costs 264px, so a 1024px screen would leave the table about 730px and scrolling by 300. From 1280 the scroll is under 100px, and it disappears around 1400.

### Scope

Product management and order management are the two functional sections. With Supabase configured, product management and the order book are real: Supabase Auth, the `manage_products` / `manage_orders` permissions and RLS decide every read and write, and `RequireAdmin` remains a navigation gate only. The screens still on mock data — and product management without Supabase — have no database, no server-side validation and no real authorization; a page reload restores the seeded data and signs the administrator out.

In the orders screens, status changes, cancellations of unpaid orders and notes are written to Supabase under `manage_orders` (audited); refunds are not offered (a Stripe call confirmed by its webhook, not the browser); exporting and printing an invoice are not wired and say so.

**Known duplication to consolidate.** The orders screens were built against their own primitives before the rest of this workspace existed, so they carry a second modal (`components/ui/Dialog.tsx`), dropdown (`components/ui/Menu.tsx`), KPI tile, empty state and loading state alongside the workspace's `ConfirmationDialog`, `OverflowMenu`, `StatCard`, `EmptyState`, `LoadingState`, `SearchInput` and `AdminButton`. The shell, the header, the rail, the guard and the route structure are shared; these presentational pieces are not, and porting the orders screens onto the workspace primitives is open work.


## Help centre and legal pages

Reached from the footer's Customer service, Legal and Company columns. The
English paths (`/terms-of-sale`, `/privacy-policy`, ...) redirect to the French
ones.

| Page | Path |
| --- | --- |
| Help centre (hub + internal pre-launch checklist) | `/aide` |
| FAQ | `/aide/faq` |
| Shipping & delivery | `/livraison` |
| Returns & refunds | `/retours-remboursements` |
| Contact | `/contact` (`?sujet=…` (order, delivery, returns, product, training, technical, privacy, professional, other) pre-selects the category) |
| Legal notice | `/mentions-legales` |
| Terms of sale | `/conditions-generales` |
| Privacy policy | `/confidentialite` |
| Cookie policy | `/cookies` |
| About | `/a-propos` |

**These pages are a design prototype, not legal text.** Every company
identifier, commercial rule (return window, shipping rates, zones), processor
and cookie is a visible placeholder: `[[Label]]` for "to verify" and
`[[!Label]]` for "business information required" in `data/legal/*.ts`. The only
provider named is Stripe. The EU consumer-law and GDPR summaries, labelled
"Legal information", still need checking against the countries actually
served. All of it must be reviewed by the business and by counsel before
publication.

- **Cookie consent** (`lib/cookieConsent.tsx`, `components/legal/Cookie*`) only
  records the visitor's choice in localStorage. No script is loaded or blocked.
  Optional categories start off, and "Reject" is as prominent as "Accept". The
  preferences dialog can be reopened from "Cookie settings" in the footer.
- **Review annotations** (`lib/reviewMode.tsx`): the hatched internal notes and
  the Stripe/compliance checklist on `/aide` can be hidden with the toggle at
  the top of each page, to preview the customer-facing version. Placeholders are
  never hidden.
- The contact form validates its input and shows a success state, but sends
  nothing.
- The cart's free-delivery threshold and flat shipping fee are sample values.
  The Shipping page says so, and the two must be aligned with the real rate
  card.

## Promotions, campaigns & gift cards (`/admin/promotions`)

Promotions and campaigns are **live** on Supabase (since 2026-10-08): no seed, no demo switch, no fixed "today".
**Gift cards are live** too (since 2026-10-01): their screens share the workspace's tab and look, not its store.

| Route | Screen |
| --- | --- |
| `/admin/promotions` | Overview — KPI row, then tabs in the query string (`?vue=actives`, `programmees`, `expirees`, `campagnes`, `cartes-cadeaux`). The "All" tab adds a six-week "what runs when" calendar above the list. The gift card tile and tab count are live |
| `/admin/promotions/nouvelle` · `/:id/modifier` | Promotion editor (live) — six lettered sections, sticky summary with a publish checklist and a live product-card preview. Saved in one call (`admin_save_promotion`): the promotion, its scope, segments, code and English text together. Saving a draft asks only for a name; publishing is checked again by the database |
| `/admin/promotions/:id` | Promotion detail (live) — figures from paid orders (`promotion_overview`, `promotion_daily_usage`), lifecycle actions, copy |
| `/admin/promotions/campagnes/nouvelle` · `/:id` · `/:id/modifier` | Campaign editor and detail (live) — products in order, English text, promotions attached; created/updated dates (the audit trail is read by administrators only) |
| `?vue=cartes-cadeaux` | Gift cards (live) — KPIs (in circulation, sold, outstanding, expired, awaiting delivery), product summary, **Issue a card** (`manage_promotions`), search by last 4 / people / order, status and delivery filters |
| `/admin/promotions/cartes-cadeaux/:id` | Gift card detail (live) — card visual, balance, the database's ledger (balance after each line, who, order), adjust (reason required) / extend / cancel (reason + the last 4 typed). Addressed by id: **the code is never shown**, only `•••• last4` |
| `/admin/promotions/cartes-cadeaux/configuration` | Gift card settings (live, `gift_card_settings`) — published switch, denominations (reorder by buttons or drag), custom amount range, validity, scheduled delivery, field rules, designs. Read-only without `manage_promotions` |
| `/admin/promotions/apercu` | Customer preview of a promotion (drawn from the promotion being viewed, over the live catalogue) |
| `/carte-cadeau` (`/gift-card`) | Storefront gift card page (live): published settings, adds a gift card line to the cart (see *Cart and checkout*) |

How it is put together:

- Gift cards: `lib/giftCards/giftCardMapping.ts` (pure, tested: rows ↔ UI shapes in minor units, statuses from
  `gift_card_overview.display_status`, ledger, filters, metrics, code normalisation, error reasons),
  `lib/giftCards/api.ts` (the domain's single persistence boundary: overview, ledger, settings, the staff RPCs),
  `lib/giftCards/AdminGiftCardsProvider.tsx` (back-office store in `AdminLayout`, loaded on first use, re-read after
  every write; empty and read-only in local mock mode) and `lib/giftCards/useStorefrontGiftCard.ts` (published
  settings for `/carte-cadeau` and the home page band, read once hydrated). Permissions come from `my_permissions()`
  for display only; the database enforces them (`manage_promotions` writes, every active staff member reads).
- Promotions and campaigns: `data/adminPromotions.ts` (types and pure rules, money in integer cents, statuses derived
  against the real clock and each promotion's own time zone — `toTime`, `toLocalInput`), `lib/promotionMapping.ts`
  (pure, tested: rows ↔ UI shapes and the payloads of `admin_save_promotion` / `admin_save_campaign`, error
  classification), `lib/promotionsApi.ts` (the domain's single persistence boundary: one embedded read of promotions
  with their children, `promotion_overview`, `promotion_daily_usage`, campaigns, collections, segments; the two save
  RPCs; lifecycle and campaign links as plain updates), `lib/adminPromotions.tsx` (store in `AppProviders.tsx`, loaded
  the first time a promotions screen asks, re-read after every write; a refusal is reported by a toast and answered
  with `null` / `false`; empty in local mock mode), `lib/promotionRules.ts` (pure rules: validation, filters, roll-ups).
  Collections and customer segments are read, not edited: there is no back-office screen for them yet, so the pickers
  show an empty state until some exist. Campaign covers are brand-library photos (`cover_path` keeps the file name).
- `components/promotions/` — badges, the CSS-drawn gift card and campaign banner (`.gt-giftcard`, `.gt-campaign-cover`
  in `index.css`), tables, timelines, previews, dialogs.
- Copy lives in `i18n/locales/promotions.{fr,en}.json`, mounted under the `promo` key (gift card back office: `promo.gc`).

**Not built (gift cards):** delivery of the code to the recipient (no transactional e-mail yet: cards show "not sent"
and nobody can read the code, by design), a public balance check, refunds of a purchased card, cards in the member
area. See `../supabase/README.md` (*Gift cards*).

## Reviews and moderation (`/admin/avis`, `/compte/avis`)

Customer reviews for products and trainings, and their moderation. With Supabase configured, product reviews are stored in the database (see "Orders and reviews on Supabase"); without it, this is the front-end-only prototype described below — no uploads leave the browser, a reload restores the seed. It adds **Reviews** to the admin rail's main group and **My reviews** to the member area's navigation; nothing else in either navigation changed.

| Where | What |
| --- | --- |
| `/boutique/:id` | Reviews section below the purchase info, specifications and FAQ: average, count, star distribution (each bar filters), most helpful review, customer photos, filters (stars, with photos, verified) and sorting, review cards with verified badge, privacy name ("Sarah M."), helpful vote, discreet report, and the team's public response. The rating line under the product name reads the same published reviews |
| `/academy/formation/:id` | The course variant: "Verified student", progress at the time of writing, what students highlight (most-used tags) and student result photos |
| `/compte/avis` | My reviews: requests for what can still be reviewed, every review with a status explained in plain words (in review, published, needs changes with the team's message, not published with the reason), edit / edit and send again, and the lifecycle |
| `/compte`, `/compte/commandes`, `/compte/attestations`, `/academy/mes-formations/:courseId` | The reusable review request (`ReviewRequestCard`): on the dashboard, beside a finished training, and on the course overview from 50 % progress; "Write a review" on eligible order lines |
| `/admin/avis` | Overview: KPIs, "needs your attention", distribution, moderation health, average rating by product and by training |
| `/admin/avis?vue=file` | Moderation queue: status views (pending, edited, reported, published, needs changes, rejected, hidden, all), search, type, product/training, rating, date and sort — all in the query string. Table on desktop, cards on phones |
| `/admin/avis?vue=signalements` | Reported reviews: reports grouped by reason, keep published / hide / remove / investigate, recently decided |
| `?avis=RV-1008` | Moderation panel (side sheet): the full review and photos, customer, order (linked when it is in the admin order book), verification, reports, public response with live preview, internal notes, history, and the decision row |

How it is put together:

- `data/reviewSystem.ts` — types and seed (~45 reviews across products and trainings: every status, photos, responses, reports, an unverified gift review, an edited review back in moderation). The prototype's "today" is `REVIEW_NOW` (23 Sept 2026).
- `lib/reviewRules.ts` — pure rules: summaries, public filters and sorts, featured review, form validation, queue filters, dashboard statistics.
- `lib/reviews.tsx` — the store switch (Supabase: `lib/reviewsSupabase.tsx`; otherwise the in-memory store in the same file), mounted in `AppProviders.tsx` (root layout); with Supabase, a review approved in the back office appears on the product page (the in-memory store lasts until a reload). Also the eligibility hooks and `useReviewSubjects` (product names and photos from the catalogue). The contract and the three overlays' state (form, report, photo viewer) live in `lib/reviewsContext.ts`; the overlays render once in `components/reviews/ReviewOverlays.tsx`.
- `components/reviews/` — stars (display and radio-group input), badges, card, section, form, request, eligibility panel; `components/reviews/admin/` — dashboard, queue, reported view, moderation sheet and action dialogs.
- Copy lives in `i18n/locales/reviews.{fr,en}.json`, mounted under the `reviews` key.

Rules the prototype shows, and the assumptions behind them (to confirm before the real build):

- **Eligibility** comes from the account's own data: a product is reviewable once an order containing it has **shipped or been delivered** (not cancelled); a training once **50 %** of it is validated (`COURSE_REVIEW_THRESHOLD`). One review per product or training; after that, the way forward is editing it. Signed out, nothing is reviewable.
- **Editing a published review sends it back to moderation and takes it off the page** until the new version is approved.
- **Reports never remove anything automatically.** "Remove" rejects the review and keeps it, its reports and its history on record.
- **Customer text is never translated or edited** (guideline 08); a review that can't be published is sent back with a message or rejected with a reason the customer sees.
- Averages and counts on product and course pages are computed from the published reviews in the store, so they differ from the catalogue's `rating`/`reviewCount` fields that shop cards still show.

Prototype controls: the admin bar switches between sample data, no reviews and a loading error (this also empties the storefront sections); each storefront section has its own small switch for loading, empty and error. Everything that matters — eligibility, the order behind "verified", photo type/size checks and storage, authorship, moderation permissions — must be enforced server-side in the real implementation; the checks here are presentation only.

## Store settings (`/admin/parametres`)

Store configuration in four sections, one route, the section in the query string (`?section=boutique`, `livraison`, `taxes`, `langues`). **Live on Supabase** (2026-10-02): read by any active staff member, saved with `manage_settings` (read-only notice and disabled controls otherwise). In mock mode the page says the settings are unavailable — it never shows invented values.

Every section edits a **draft** and commits it with **Save changes** — including edits made in a drawer or dialog. Each section is saved whole and atomically by its database function, then re-read alone, so unsaved work in another section survives a save. The header shows whether what you see is saved, the section navigation marks sections with unsaved drafts, drafts survive moving between sections, and the browser warns before a reload. A refused save says why (not allowed / a value refused / server unreachable) and keeps the draft.

| Section | What it covers | Saved by |
| --- | --- | --- |
| Store | Business identity (trading and legal name, legal form, share capital, registration and VAT numbers), contact e-mails and phone, registered office, publication director and host, contact page switches, opening hours, response-time sentence in French and English, with a live contact page preview. Currency shown read-only (EUR) | `admin_save_store_details()` |
| Shipping | Zone cards (countries first, then methods), enable/disable, duplicate, delete; zone drawer with grouped country picker (moves between zones spelled out); rate drawer (standard / express / free / pickup, delivery estimate, price, free-from threshold, order and weight ranges); a destination checker | `admin_save_shipping()` |
| Taxes & VAT | The checkout's VAT rules, read-only; a destination checker; standard rate per country; reduced rates per product category; a warning listing served EU countries with no active rate | `admin_save_tax_rates()` |
| Languages | Content languages from `languages`: French (original, locked), English (storefront, locked), the others switchable; the page says the public site stays French/English | `admin_save_languages()` |

Published elsewhere: the **legal notice** (`/fr/mentions-legales`) and the **contact page** (`/fr/contact`) are rendered with the saved store details (`lib/storeDetailsServer.ts`, cached 60 s, `app/_public/storePages.tsx`); a detail not supplied keeps its "to be supplied" placeholder, and the contact page shows only what the business chose to show.

How it is put together:

- `data/adminSettings.ts` — shapes and fixed lists only. **Money is integer cents, VAT rates integer basis points, weights grams.**
- `lib/adminSettings.tsx` — the domain's single persistence boundary: reads, drafts, per-section saves, `canManage` from `my_permissions()`; mounted in the admin layout.
- `lib/adminSettingsMapping.ts` (shipping, VAT, languages) and `lib/storeDetails.ts` (store row, shared with the public pages) — row ↔ screen mapping, normalised so reading back a save gives the same value; amounts sent as decimal strings built from cents. Tested in `adminSettingsMapping.test.ts`.
- `lib/settingsRules.ts` — pure rules mirroring the database: validation, destination-to-zone resolution, `vat_rate_bp()` resolution, served countries without VAT.
- `components/settings/` — one file per section plus the shipping drawers; copy in `i18n/locales/settings.{fr,en}.json` under the `settings` key.

Removed with the move to Supabase (recoverable from commit `9e95108`): the prototype's VAT switches (prices excluding VAT, tax basis, rounding, VAT numbers and VIES, exemptions — not implemented by `create_order()`), the order-number format, time zone / date format / units, the language order and default switch, and the **translation coverage panel and editor**, which ran on fictional items (`data/adminTranslations.ts`); a real translation workflow is not built.

## Users and roles (`/admin/utilisateurs`)

Live on Supabase; without the Supabase variables the screen says the directory is unavailable (no invented team).

- **One persistence boundary:** `src/lib/adminUsers.tsx`. Reads `staff_directory()` (needs `view_users`), `my_permissions()` and the permission matrix from `roles`, `permissions`, `role_permissions`. Row ↔ UI mapping (roles `viewer`/`manager`/`admin` ↔ read only / manager / administrator, `customer_care` ↔ `customerCare`, statuses, matrix order, error codes) is pure and tested in `src/lib/adminUserMapping.ts`.
- **Writes under the member's own JWT:** names, role and status are `UPDATE profiles` (RLS + `private.guard_profile_update()`: `manage_users`, ranks ≤ one's own, never one's own role/status, audited); job title and team are `UPSERT staff_profiles`. An update RLS lets touch no row is reported as refused, never as success. Every write re-reads the directory.
- **Invitations** go through the Edge Function `invite-staff-member` (`supabase.functions.invoke`): invite (new address → Supabase invitation e-mail; existing active customer → promoted, no e-mail), resend and cancel a pending invitation. The link lands on `/auth/confirm?…&type=invite`, then `/reinitialiser-mot-de-passe` where the invitee chooses a password.
- **What is offered** follows `my_permissions()` and the member's rank (`lib/adminUserFilters.ts` `guardFor`): without `manage_users` the Invite button is hidden and every action disabled with the reason; roles above one's own are disabled in the role picker; one's own role/status and the last active administrator are locked. UX only — the database refuses all of it anyway.
- **Not offered:** permanent deletion of a member (suspend instead), editing the sign-in e-mail (it belongs to the person's account), an activity history (the audit log needs `manage_settings`; not wired). `deactivated` accounts (database status) are shown and can be reactivated; the screen never deactivates.
- **Known limits:** an edit writes `profiles` then `staff_profiles` in two requests (not one transaction). For an account bootstrapped by SQL without staff details, the first edit creates them and stamps the editor as "invited by".

## Customers on Supabase (`/admin/clients`)

Live on Supabase; without the Supabase variables the workspace says the base is not connected (no invented people).

- **One persistence boundary:** `src/lib/adminCustomers.tsx`, inside `AdminOrdersProvider`. Reads `profiles` (role
  `customer`), the default shipping address (`customer_addresses`), `customer_tags`, `customer_notes` with their
  author, the course seats of `admin_customer_courses()` and `my_permissions()`, 1 000 rows per request until all
  are read; the status history of one account comes from `admin_customer_status_history()` on the detail page.
  Row ↔ UI mapping (statuses, tags `follow_up` ↔ `followUp`, seats, validation mirroring the `profiles` CHECKs,
  error codes) is pure and tested in `src/lib/adminCustomerMapping.ts`; vocabulary and derived facts in
  `src/data/adminCustomers.ts` (no fixtures).
- **Figures from the order book.** Order count, last order and net spend come from the live book
  (`useAdminOrders`): spend per currency with the member area's rule (`spendOf`), never added across currencies;
  sorting and the spend filter rank on euros only (`spendRank`, minor units). When the book is cut at
  `BOOK_LIMIT` a notice says the figures cover the newest orders only.
- **Training** shows each seat with the learner's own progress rule (steps validated + checks passed, over steps +
  checks), completion, score and certificate from `course_completions`; a withdrawn course is labelled. Seats are
  granted from `/admin/formations/:id/acces`.
- **Writes under the member's JWT and `manage_customers`:** names, phone, birth date, country and status
  (`UPDATE profiles`, guarded by `private.guard_profile_update()`, status audited), tags (insert/delete, audited),
  notes (add, delete; edit only one's own — RLS). Every write re-reads the base; a refusal is a toast with the
  reason, never a success. Without `manage_customers` the page is read-only (no selection, no edit tab).
- **Not written from here:** the e-mail (sign-in identity), marketing consent and the address book belong to the
  customer and are shown read-only. A closed (`deactivated`) account is shown and filtered but never reopened;
  staff choose between active and suspended only.
- **Not offered (no server side yet):** export, e-mail sending (the e-mail action opens the operator's own mail
  client), creating a customer account.

## Statistics on Supabase (`/admin/statistiques`)

- **One boundary**: `lib/adminAnalytics.ts` (URL filters, reads, controller); pure mapping in `lib/adminAnalyticsMapping.ts` (periods in the shop's time zone, `analytics_snapshot()` JSON → `AnalyticsSnapshot`, insights, CSV) and `lib/adminAnalyticsTraining.ts` (Academy panel), both unit-tested. Shapes and vocabulary: `data/adminAnalytics.ts`.
- **Shop figures**: `analytics_snapshot(from, to, filters, 'EUR', 'Europe/Paris')`, definitions in `supabase/README.md` ("Statistics"). Money is converted to minor units at the boundary. The always-empty "training" slice is left out of the breakdown and the category filter (course lines are not part of the shop's revenue).
- **Academy panel and its two KPI cards** (enrolments, completion rate): aggregated in the browser from `course_entitlements`, `course_completions`, `lesson_progress`, `quiz_attempts`, the course lines of paid orders and `courses` (staff read them under RLS). Definitions in the module's header; the shop filters do not narrow them (the panel says so).
- **Insights** are derived from the figures (`deriveInsights`); **cross-selling** shows the one figure the function measures (jewellery orders with aftercare). **Export**: CSV of the figures on screen (`;`, BOM, plain decimals).
- **Filters**: period presets or custom days (≤ 400), category, product (uuid), customer type, country (shipping zones' countries, ISO codes), order status — what `p_filters` accepts. No course filter.
- Without Supabase the screen says the figures are unavailable (e2e: `zones.spec.ts`).
- Not available without a schema change: courses inside the revenue and its breakdown, a course filter, product-page conversion, trained buyers / graduates' basket and repeat rate, PDF export.

## Remaining mock behaviour (to replace before launch)

Without the Supabase variables every domain runs on its mock store. With them, the following still do not touch the database:

- **Checkout extras.** Payment runs through Stripe (see *Cart and checkout*); gift card codes, promotion codes and the loyalty reward can be used in the cart. No confirmation e-mail is sent from the browser, and saving the address on the account is not offered.
- **Academy.** Authoring, public pages and the learner side are on Supabase (phases A–C). Courses are bought through the cart (phase D, migration `20261002100000_course_checkout` not applied yet) or granted by hand (`/admin/formations/:id/acces`). The back office's course list still shows placeholder learner figures (`enrolled`, `completionRate`); the statistics screen reads real ones.
- **Members' Lounge** (`/compte/salons`). UI prototype of the community chat: fixtures and in-memory messages, access derived client-side from the courses on the account. No backend. Post-launch.
- **Loyalty Club.** Live (2026-10-03). `lib/loyalty.tsx` reads the public rules (`loyalty_settings`) and the member's card (`loyalty_overview`, RLS-limited); `lib/loyaltyMapping.ts` derives the card state (unit-tested); `data/loyalty.ts` holds the types and the example cards of the marketing pages. The database awards the stamp when the Stripe webhook marks an order paid; the browser only reads. The cart banner counts shop goods only (no gift card, no course) and invites guests to sign in. The cart offers a checkbox to spend a completed card (`use_loyalty_reward` in the checkout request, previewed with `rewardDiscount`; the database refuses with `loyalty_reward_unavailable` when the card is gone or reserved). Not built: e-mail on stamp/reward.
- **Security page:** data export and account deletion are simulated (they need backend jobs).
- **Back-office statistics:** live, within the current schema (see "Statistics on Supabase"). A translation workflow (coverage, editor) is not built.
- **Gift card delivery:** cards are created and activated in the database, but nothing sends the code to the recipient yet (needs the e-mail Edge Function).

The mock stores, fixtures in `data/`, demo accounts and "Prototype controls" panels are removed domain by domain as each goes live; a production build must never fall back to them.
