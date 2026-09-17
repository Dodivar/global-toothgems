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
  components/ui/     Design-system primitives (Button, Badge, ProductCard, CourseCard, QuizQuestion, ...)
  components/account/ Dashboard pieces (stat tile, course row, certificate card, order card)
  components/academy/ The training detail page: hero, curriculum accordion, assessment, diploma, community, shared primitives
  components/loyalty/ The Loyalty Club: stamp, card, progress, reward, steps, journey, FAQ, checkout banner, demo switcher
  components/layout/ Header (desktop nav + mega panel, mobile burger menu) and Footer
  data/               Bilingual product/course/review/lesson/order data
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

## Notes on scope

This app reproduces the prototype's interactions against local/mock state only — there is no real backend, payment processing, or authentication. A few simplifications carried over intentionally from the prototype (flagged during the build):

- All Academy courses share the same authored 9-lesson syllabus; progress is tracked per course, but only one course outline exists.
- Nothing is persisted: the session, cart, progress and orders all live in memory and reset on reload.
- Paying always succeeds. It records an order and empties the cart; real fulfilment belongs to a Stripe webhook, not to the browser.
- The Loyalty Club (`/fidelite`, `/compte/fidelite`) is **display only**, and more so than the rest of this app: no stamp is ever awarded, stored or redeemed, and the checkout banner reads the subtotal without touching the total, the payment or the order. Its card state is static mock data in `data/loyalty.ts`, switched by a visible demo control on the member page. Awarding a stamp is a server's job, driven by the same verified payment event as fulfilment.

Everything else — filtering, cart totals, the lesson video/quiz simulation, per-product detail pages, the member dashboard — is fully interactive.
