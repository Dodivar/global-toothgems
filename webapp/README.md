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

## Project structure

```
src/
  pages/            One component per screen (Home, Shop, ProductDetail, Cart, Academy, Lesson, Login, Account)
  components/ui/     Design-system primitives (Button, Badge, ProductCard, CourseCard, QuizQuestion, ...)
  components/layout/ Header (desktop nav + mega panel, mobile burger menu) and Footer
  data/               Bilingual product/course/review/lesson/order data
  i18n/               react-i18next setup + locales/fr.json, locales/en.json
  lib/                Auth, cart, learning-progress and order contexts, toasts, price/date helpers
```

## The member area (`/compte`)

`Account.tsx` is the signed-in dashboard: a greeting and summary tiles, a "resume where you left off" card, per-course progression with a module breakdown, certificates, the courses still available, and the order history.

It owns no state of its own. Learning progress lives in `lib/progress.tsx` and order history in `lib/orders.tsx`, both in-memory contexts shaped like the existing `lib/cart.tsx`. The lesson player writes to the first and the cart writes to the second, so validating a lesson or paying moves the dashboard immediately. Certificates are derived from a course reaching 100 %, never stored as a separate flag.

Every course reuses the single authored syllabus in `data/lessons.ts` (9 lessons, ~1 h 30), so the lesson counts and durations in `data/courses.ts` were aligned to it — a course advertising 18 lessons could never reach 100 % or unlock its certificate.

## Notes on scope

This app reproduces the prototype's interactions against local/mock state only — there is no real backend, payment processing, or authentication. A few simplifications carried over intentionally from the prototype (flagged during the build):

- All Academy courses share the same authored 9-lesson syllabus; progress is tracked per course, but only one course outline exists.
- Nothing is persisted: the session, cart, progress and orders all live in memory and reset on reload.
- Paying always succeeds. It records an order and empties the cart; real fulfilment belongs to a Stripe webhook, not to the browser.

Everything else — filtering, cart totals, the lesson video/quiz simulation, per-product detail pages, the member dashboard — is fully interactive.
