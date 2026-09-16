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
  pages/            One component per screen (Home, Shop, ProductDetail, Cart, Academy, Lesson)
  components/ui/     Design-system primitives (Button, Badge, ProductCard, CourseCard, QuizQuestion, ...)
  components/layout/ Header (desktop nav + mega panel, mobile burger menu) and Footer
  data/               Bilingual product/course/review/lesson data
  i18n/               react-i18next setup + locales/fr.json, locales/en.json
  lib/                Cart context, toast notifications, price/format helpers
```

## Notes on scope

This app reproduces the prototype's interactions against local/mock state only — there is no real backend, payment processing, or authentication. A few simplifications carried over intentionally from the prototype (flagged during the build):

- All Academy courses currently open the same shared lesson-progress state (only "Fondation Tooth Gem" has its full 9-lesson breakdown authored).
- Checkout is non-persistent: paying always succeeds and resets if you navigate away.

Everything else — filtering, cart totals, the lesson video/quiz simulation, per-product detail pages — is fully interactive.
