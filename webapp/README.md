# Global Toothgems — static/mock prototype

A fully interactive React implementation of the Global Toothgems brand site — a premium tooth-gem e-commerce shop and professional Academy — built from a Claude Design prototype (see the design brief and chat transcripts that shipped with it).

> **Architecture note:** this directory intentionally deviates from the stack mandated in the repo root's `AGENTS.md` and `global-toothgems-llm-guidelines/` (Next.js, Supabase/Postgres, Supabase Auth, Stripe). It was built at explicit user request as a fast, visual, fully-clickable reference implementation — Vite + React, no backend, cart/checkout/lesson-progress state held in memory only. Treat it as a design/behavior reference to port from, not as the production app. Porting to the mandated Next.js + Supabase + Stripe architecture is still open work.

## Stack

- **React 19 + TypeScript**, built with **Vite**
- **Tailwind CSS v4** for styling, driven by the design system's CSS variable tokens (`src/index.css`)
- **react-router-dom** for routing
- **react-i18next** for French/English (French is the default; a toggle in the header switches and persists the choice)
- **lucide-react** for icons

## Requirements

- Node.js 20+ (built and tested on Node 22)

## Getting started

```bash
cd webapp
npm install
npm run dev
```

This starts the Vite dev server (default [http://localhost:5173](http://localhost:5173)) with hot module reload.

## Other scripts

```bash
npm run build     # type-check (tsc -b) and build a production bundle into dist/
npm run preview   # serve the production build locally to sanity-check it
npm run lint      # oxlint
```

## Deploying (`vercel.json`)

Routing is client-side: `main.tsx` mounts a `BrowserRouter`, and the build is a
single `index.html` plus assets. A static host knows nothing about the routes in
`App.tsx`, so a request that lands directly on one — a pasted link, a refresh, a
bookmark — asks for a file that was never built and gets a 404. Following a link
inside the app works either way, which is why the breakage only shows up on
direct URLs, and why the newest routes (`/accueil-b`, `/connexion-b`) surface it
first: they are not linked from the navigation, so a direct URL is the only way
in.

`vercel.json` fixes that by rewriting every unmatched path to `/index.html` and
letting the router read the URL. Rewrites run after the filesystem check, so real
files — the hashed bundles, `favicon.svg`, `icons.svg` — are still served as
themselves.

The file must sit in whatever directory Vercel builds from. This app lives in
`webapp/`, so the project's **Root Directory** has to be `webapp` for the build
to find `package.json` at all, and `vercel.json` belongs next to it. A copy at
the repository root would be ignored.

## Project structure

```
src/
  pages/            One component per screen (Home, Shop, ProductDetail, Cart, Academy, CourseDetail, Lesson, Login)
  pages/account/    The member area: sidebar layout + one component per section
  pages/community/  The Artist Community: its own layout + one component per screen
  pages/legal/      Help centre, FAQ, contact and about pages
  data/legal/       Legal and help content (bilingual data rendered by components/legal/)
  components/ui/     Design-system primitives (Button, Badge, ProductCard, CourseCard, QuizQuestion, ...)
  components/account/ Dashboard pieces (stat tile, course row, certificate card, order card)
  components/academy/ The training detail page: hero, curriculum accordion, assessment, diploma, community, shared primitives
  components/community/ Forum pieces (navigation, discussion card, showcase card, reactions, member card, composer, locked preview)
  components/reviews/ Customer reviews: stars, badges, review card, section, form, request, overlays; admin/ holds the moderation workspace
  components/loyalty/ The Loyalty Club: stamp, card, progress, reward, steps, journey, FAQ, checkout banner, demo switcher
  components/layout/ Header (desktop nav + mega panel, mobile burger menu) and Footer
  pages/admin/      The administration workspace: access screen, shell, dashboard, orders, products, categories
  components/admin/ Workspace primitives (rail, header, product table, form, media uploader, drawer, dialogs) and the orders workspace (KPI row, filter toolbar, order table + card list, row actions, bulk bar, pagination, detail cards, timeline, notes)
  data/               Bilingual product/course/review/lesson/order data (the storefront's order history and the back office's order book are separate models)
  i18n/               react-i18next setup + locales/fr.json, locales/en.json
  lib/                Auth, cart, learning-progress and order contexts, toasts, price/date helpers
```

## The training detail page (`/academy/formation/:id`)

The Academy catalogue opens one page per training — the sales page for that course, open to visitors like `/academy` itself, since gating it would hide what it advertises. It runs the visitor through the decision in order: what the training is, what they will experience, what they will be able to do, the curriculum module by module, how the journey runs, how the assessment works, the diploma, the artist community included with the purchase, why it is worth taking, and a closing call to action. A sticky bar carries the price and the call to action on small screens once the hero's own button scrolls away.

Two rules shape its content:

- **Nothing is invented.** Title, level, price, duration, modules and lessons come from `data/courses.ts` and `data/lessons.ts`; the diploma is rendered with the member area's own `CertificateDocument`; the sample question is the lesson player's own quiz.
- **What the prototype does not have is labelled.** The forum preview says it is a preview, and the assessment meter says it is an example — a visitor reading a sales page has no score, and showing one as if it were theirs would be a lie dressed as reassurance.

The pass mark lives once, as `PASS_SCORE` in `data/lessons.ts`. It is a prototype value: the real rule belongs with the course record and has to be enforced server-side.

The hero reflects the visitor's own state — enrolled, in progress, completed — but only when signed in: the seeded demo enrolments exist regardless of the session, and this page is public.

Every route into a training now lands here rather than on the login form: both home pages, the Academy grid, the header's Academy panel and both footers' Academy columns. `CourseCard` takes a `to` so those cards are real links — a public page has to be openable in a new tab and crawlable — and `lib/academyUrl.ts` holds the path the way `lib/shopUrl.ts` holds the filtered-collection ones. Only `/academy/lecon`, the player, stays behind `RequireAccount`: the videos are the paid content.

The account is asked for at the purchase, and the training asked for travels with the visitor: pressing "start" while signed out puts the course id in the navigation state, and signing in adds that course to the account before opening the player, so the purchase resumes instead of opening whichever course happened to be active.

## Account creation (`/inscription`)

A four-step journey — Account → Profile → Preferences → Done — with a simulated
email verification and a welcome screen. The "Create account" tab of `/connexion`,
the cart and the training pages all lead here.

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

## The member area (`/compte`)

The signed-in area is an administration dashboard: a left sidebar on desktop, a scrollable row of pills on small screens, and one route per section.

| Route | Section |
| --- | --- |
| `/compte` | Dashboard — summary tiles, the "resume where you left off" card, the courses being followed with their module breakdown, and the courses still available |
| `/compte/attestations` | Certificates |
| `/compte/commandes` | Order history, with parcel tracking |
| `/compte/fidelite` | Loyalty card — the stamp card, the reward, and the demo controls |
| `/compte/profil` | Profile details, editable |

The sidebar also links out to the course catalogue (`/academy`) and signs the member out. `RequireAccount` wraps the layout, so every section is gated at once.

The member area is capped at `--max-width-account` rather than `--max-width-content`: it spends a 248 px sidebar, the column gap and its own gutters out of the width every other screen gives entirely to content, so the wider cap is what makes its content column measure the same 1240 px as the shop grid.

The sections own no state of their own. Learning progress lives in `lib/progress.tsx`, order history in `lib/orders.tsx` and the member profile in `lib/auth.tsx` — in-memory contexts shaped like the existing `lib/cart.tsx`. The lesson player writes to the first and the cart writes to the second, so validating a lesson or paying moves the dashboard immediately. Certificates are derived from a course reaching 100 %, never stored as a separate flag, and the delivery timeline is derived from the order status for the same reason. Editing the profile moves the greeting and the avatar, because both are derived from the stored name rather than copied from it.

Every course reuses the single authored syllabus in `data/lessons.ts` (9 lessons, ~1 h 30), so the lesson counts and durations in `data/courses.ts` were aligned to it — a course advertising 18 lessons could never reach 100 % or unlock its certificate.

## The Artist Community (`/compte/communaute`)

The private forum reserved for members who own a training. It is part of the member area — it is reached from the account sidebar and it lives under `/compte` — but it carries its own navigation rather than nesting inside the account sidebar, because two levels of vertical navigation on one screen is what makes forum software feel like software.

| Route | Screen |
| --- | --- |
| `/compte/communaute` | Community home — welcome, community figures, the discussions of the day, the wall of recent creations, the channels, and a contextual column (who is around, artists to welcome, the guidelines) |
| `/compte/communaute/canal/:channelId` | One channel: a reading list, or the image-led wall in *Vos créations*, with Latest / Most replies / Unanswered |
| `/compte/communaute/discussion/:discussionId` | One thread: opening post, reactions, replies, reply composer, author card |
| `/compte/communaute/activite/:view` | Your activity: `discussions`, `reponses`, `enregistrees` |
| `/compte/communaute/membres` | The artist directory |
| `/compte/communaute/charte` | Community guidelines |

Eight channels (general chat, show your work, techniques, training help, inspiration, tools & materials, business, introductions) are declared in `data/community.ts`, together with the members, the discussions and their replies. A showcase post is a discussion like any other, with an image and a short body — the wall is a presentation of the same object, so a creation opens, reacts and replies through the same code path as a question about adhesive.

Ages in that file are stored as `minutesAgo` rather than as dates, so a prototype opened again months later still reads "il y a 2 h" instead of showing a room whose last message is a season old.

### Access

Forum access is derived, never stored: the community is what a training purchase unlocks, so the rule is "at least one course on the account", read from `lib/progress.tsx`. `CommunityLayout` decides it once, so a deep link into a thread meets the same door as the home page.

Both states are designed:

- **With access** — the full community.
- **Without access** — the account sidebar still shows *Communauté artistes*, marked with a lock, a pastel wash and the words "accès avec une formation" (never by the icon alone, and never disabled). It leads to a preview: the real figures and four real discussion titles shown in the clear, the discussion cards and the wall behind an elegant overlay, and one access card — *La communauté des artistes vous attend* — with **Découvrir les formations** and a way back to the account. The blurred preview is `inert` and `aria-hidden`, so it is never a keyboard trap.

The seeded account owns two courses, so the locked state would be unreachable in a review. A visible, labelled **Aperçu prototype** switch in the community sidebar forces either state, exactly like the loyalty card's demo control.

### Scope

Interactions are simulated against in-memory state in `lib/community.tsx`: reacting, saving, replying, starting a discussion (with a sample photograph in place of an upload) and opening member profiles all work and move the same counters the navigation reads, and all of it resets on reload. Nothing is sent, stored or authorised — real membership, moderation and authorization belong to the server, driven by the same verified payment event as course access.

## The administration area (`/admin`)

A separate, desktop-first management workspace for the product catalogue, built as an interactive visual prototype: no backend, no persistence, no real authentication. It is deliberately not the storefront in a sidebar — same palette, same Montserrat, but squarer controls, denser rows and its own near-black navigation rail, because a catalogue table and a product page are not the same job.

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

Sign in with `camille@globaltoothgems.com` / `toothgems2026`; the screen prints both. Customers, Training, Analytics and Settings are drawn in the rail and permanently disabled — they show how the workspace could grow without pretending they exist.

### How it is put together

- `data/adminCatalog.ts` — the mock catalogue: sixteen products covering every state the interface can show (active, draft, archived, out of stock, low stock, untracked inventory, discounted), the categories, and the media library the picker offers instead of a real upload.
- `lib/adminCatalog.tsx` — the one place any product changes. Every screen above it already looks like a screen talking to a server: the callbacks are async, writes take a simulated 700 ms, and the list has a first-load skeleton. Replacing the bodies of those callbacks with real calls is the whole migration.
- `lib/adminAuth.tsx` — the mock administrator session, kept separate from the customer session in `lib/auth.tsx`. A rejected password leaves no session behind, as the real endpoint must.
- `lib/productFilters.ts` — search, filtering and sorting as pure functions on plain state; the product list holds its filters in the URL, so a filtered view can be linked to and stepped back through.
- `data/adminOrders.ts` — the back office's order book: 38 orders across every status, payment and fulfilment state, 14 customers in four countries, six flagged for attention (one per reason) and seven internal notes. Deliberately a separate model from `data/orders.ts`, which is the *member's* view of their own purchases and is written to by `lib/orders.tsx` when the cart is paid; only the line-item shape is shared. Timelines, tracking numbers and payment references are derived from each order's own state rather than typed out, so a status can never disagree with the history beside it. Every line refers to a real catalogue id, because `productLine()` throws on an unknown one.
- `lib/adminOrders.tsx` — the one place any order changes, shaped like `lib/adminCatalog.tsx`. Marking an order shipped moves the badge, the fulfilment column, the KPI row and that order's timeline together. It never invents a payment: an unpaid order marked shipped stays unpaid.
- `lib/adminOrderFilters.ts` — search, filtering, sorting and paging as pure functions over URL state, the same convention as `lib/productFilters.ts`. The date presets are anchored to the newest order in the book rather than to the wall clock, so "Today" never silently returns nothing on fixed mock data.
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

Product management and order management are the two functional sections. There is no database, no API, no file upload, no server-side validation and no real authorization: `RequireAdmin` is a UI gate, and real administration access means Supabase Auth plus server-side RBAC and RLS, none of which may ever depend on a value from this code. A page reload restores the seeded catalogue and order book and signs the administrator out.

In the orders screens specifically, changing a status, refunding, cancelling, exporting, printing an invoice and tracking a parcel all stop at the screen. A real status transition is a server-side change behind explicit RBAC with an audit entry, and a real refund is a Stripe call whose webhook — not the browser — writes the new state. Each dialog says so where the action is taken.

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

A front-end-only prototype of the promotional side of the back office, plus the customer-facing gift card page. No backend, no payment, no persistence: every change lives in memory and a reload restores the seed. It adds one entry, **Promotions**, to the rail's main group; nothing else in the rail changed.

| Route | Screen |
| --- | --- |
| `/admin/promotions` | Overview — KPI row, then tabs in the query string (`?vue=actives`, `programmees`, `expirees`, `campagnes`, `cartes-cadeaux`). The "All" tab adds a six-week "what runs when" calendar above the list |
| `/admin/promotions/nouvelle` · `/:id/modifier` | Promotion editor — six lettered sections (basics, discount type, eligibility, usage rules, scheduling, promo code), a sticky summary with a publish checklist and a live product-card preview. `?campagne=<id>` pre-fills the campaign |
| `/admin/promotions/:id` | Promotion detail — state banner (paused, expired, scheduled, invalid), performance, configuration, code, campaign, customer view, history |
| `/admin/promotions/campagnes/nouvelle` · `/:id` · `/:id/modifier` | Campaign editor with live storefront preview (desktop / mobile), and campaign detail: banner, promotions, products, dates, banner preview, activity |
| `/admin/promotions/cartes-cadeaux/:code` | Gift card detail — card visual, balance, ledger with running balance, resend / adjust / extend / cancel (cancel requires typing the code), related order sheet |
| `/admin/promotions/cartes-cadeaux/configuration` | Gift card product settings — denominations (reorder by buttons or drag), custom amount range, validity, scheduled delivery, field rules, designs |
| `/admin/promotions/apercu` | Customer preview — one promotion on the product card, product page, cart, checkout summary and campaign landing |
| `/carte-cadeau` (`/gift-card`) | Storefront gift card page, driven by the configuration above |

How it is put together:

- `data/adminPromotions.ts` — types and seed: 15 promotions, 7 campaigns, 14 gift cards and the gift card product. **Money is integer cents.** **Statuses are derived** from a stored lifecycle (draft / live / paused / archived) and the dates, against a fixed prototype date `PROMO_NOW` (24 Nov 2027, printed on every screen) so the 2027 campaigns of the brief keep their states. Gift card balances are the sum of each card's ledger, never a stored number.
- `lib/adminPromotions.tsx` — the store (async, simulated latency), mounted in `App.tsx` rather than the admin layout so the storefront page reads the same gift card configuration: save a new amount order in the back office, then open `/carte-cadeau` in the same tab (a new tab reloads and resets the prototype).
- `lib/promotionRules.ts` — pure rules: validation, scope resolution, campaign roll-ups, KPIs, list filtering and sorting.
- `components/promotions/` — badges, the CSS-drawn gift card and campaign banner (`.gt-giftcard`, `.gt-campaign-cover` in `index.css`), product picker, timelines, tables, storefront previews, dialogs and bottom sheet.
- Copy lives in `i18n/locales/promotions.{fr,en}.json`, mounted under the `promo` key.

A labelled **Prototype** bar on the overview switches between sample data, an empty shop and a loading error. "Christmas Early Bird -15%" is deliberately invalid (end before start, missing code) to show the invalid-configuration state; "Spring Studio Days" is a campaign with no promotions and no products.

Everything that matters for money or access — code uniqueness, discount calculation, balance changes, cancellation, delivery — must be enforced server-side in the real implementation; the checks here are presentation only.

## Reviews and moderation (`/admin/avis`, `/compte/avis`)

A front-end-only prototype of customer reviews for products and trainings, and of their moderation. No backend, no uploads leave the browser, no persistence: a reload restores the seed. It adds **Reviews** to the admin rail's main group and **My reviews** to the member area's navigation; nothing else in either navigation changed.

| Where | What |
| --- | --- |
| `/boutique/:id` | Reviews section below the purchase info, specifications and FAQ: average, count, star distribution (each bar filters), most helpful review, customer photos, filters (stars, with photos, verified) and sorting, review cards with verified badge, privacy name ("Sarah M."), helpful vote, discreet report, and the team's public response. The rating line under the product name reads the same published reviews |
| `/academy/formation/:id` | The course variant: "Verified student", progress at the time of writing, what students highlight (most-used tags) and student result photos |
| `/compte/avis` | My reviews: requests for what can still be reviewed, every review with a status explained in plain words (in review, published, needs changes with the team's message, not published with the reason), edit / edit and send again, and the lifecycle |
| `/compte`, `/compte/commandes`, `/compte/attestations`, `/academy/lecon` | The reusable review request (`ReviewRequestCard`): on the dashboard, beside a finished training, and in the lesson player from 50 % progress; "Write a review" on eligible order lines |
| `/admin/avis` | Overview: KPIs, "needs your attention", distribution, moderation health, average rating by product and by training |
| `/admin/avis?vue=file` | Moderation queue: status views (pending, edited, reported, published, needs changes, rejected, hidden, all), search, type, product/training, rating, date and sort — all in the query string. Table on desktop, cards on phones |
| `/admin/avis?vue=signalements` | Reported reviews: reports grouped by reason, keep published / hide / remove / investigate, recently decided |
| `?avis=RV-1008` | Moderation panel (side sheet): the full review and photos, customer, order (linked when it is in the admin order book), verification, reports, public response with live preview, internal notes, history, and the decision row |

How it is put together:

- `data/reviewSystem.ts` — types and seed (~45 reviews across products and trainings: every status, photos, responses, reports, an unverified gift review, an edited review back in moderation). The prototype's "today" is `REVIEW_NOW` (23 Sept 2026).
- `lib/reviewRules.ts` — pure rules: summaries, public filters and sorts, featured review, form validation, queue filters, dashboard statistics.
- `lib/reviews.tsx` — the store and every lifecycle action, mounted in `App.tsx` above the storefront and the admin, so a review approved in the back office appears on the product page in the same session. Also the eligibility hooks and the three overlays' state (form, report, photo viewer), rendered once by `components/reviews/ReviewOverlays.tsx`.
- `components/reviews/` — stars (display and radio-group input), badges, card, section, form, request, eligibility panel; `components/reviews/admin/` — dashboard, queue, reported view, moderation sheet and action dialogs.
- Copy lives in `i18n/locales/reviews.{fr,en}.json`, mounted under the `reviews` key.

Rules the prototype shows, and the assumptions behind them (to confirm before the real build):

- **Eligibility** comes from the account's own data: a product is reviewable once an order containing it has **shipped or been delivered** (not cancelled); a training once **50 %** of it is validated (`COURSE_REVIEW_THRESHOLD`). One review per product or training; after that, the way forward is editing it. Signed out, nothing is reviewable.
- **Editing a published review sends it back to moderation and takes it off the page** until the new version is approved.
- **Reports never remove anything automatically.** "Remove" rejects the review and keeps it, its reports and its history on record.
- **Customer text is never translated or edited** (guideline 08); a review that can't be published is sent back with a message or rejected with a reason the customer sees.
- Averages and counts on product and course pages are computed from the published reviews in the store, so they differ from the catalogue's `rating`/`reviewCount` fields that shop cards still show.

Prototype controls: the admin bar switches between sample data, no reviews and a loading error (this also empties the storefront sections); each storefront section has its own small switch for loading, empty and error. Everything that matters — eligibility, the order behind "verified", photo type/size checks and storage, authorship, moderation permissions — must be enforced server-side in the real implementation; the checks here are presentation only.

## Notes on scope

This app reproduces the prototype's interactions against local/mock state only — there is no real backend, payment processing, or authentication. A few simplifications carried over intentionally from the prototype (flagged during the build):

- All Academy courses share the same authored 9-lesson syllabus; progress is tracked per course, but only one course outline exists.
- Nothing is persisted: the session, cart, progress and orders all live in memory and reset on reload.
- Paying always succeeds. It records an order and empties the cart; real fulfilment belongs to a Stripe webhook, not to the browser.
- The Artist Community (`/compte/communaute`) has no backend either: members, discussions and replies are written fixtures, posting and replying live in memory, the photo "upload" picks from three sample images, and forum access is derived from the courses on the account rather than verified anywhere.
- The Loyalty Club (`/fidelite`, `/compte/fidelite`) is **display only**, and more so than the rest of this app: no stamp is ever awarded, stored or redeemed, and the checkout banner reads the subtotal without touching the total, the payment or the order. Its card state is static mock data in `data/loyalty.ts`, switched by a visible demo control on the member page. Awarding a stamp is a server's job, driven by the same verified payment event as fulfilment.

Everything else — filtering, cart totals, the lesson video/quiz simulation, per-product detail pages, the member dashboard — is fully interactive.
