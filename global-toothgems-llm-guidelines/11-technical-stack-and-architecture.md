---
name: global-toothgems-technical-stack
---

# Technical Stack & Application Architecture

## Target stack

The default technology choices for the platform are:

- Next.js + React + TypeScript for the web application.
- Tailwind CSS + shadcn/ui for the UI system.
- Supabase for PostgreSQL, authentication, Row Level Security (RLS), Storage and selected Edge Functions.
- Stripe for payments, Checkout, tax capabilities and payment webhooks.
- next-intl (or an equivalent mature i18n solution) for application localization.
- Resend + React Email for transactional email when email delivery is required.
- Sentry for application/error monitoring.
- Vitest for unit/integration tests and Playwright for end-to-end tests.
- GitHub for source control and CI/CD workflows.
- Vercel is the preferred initial deployment target for the Next.js application.

Optional technologies must be introduced only when the requirement justifies them:
- Cloudflare for DNS/CDN/security needs;
- Mux for serious course-video streaming;
- Algolia or Typesense for advanced search;
- PostHog for product analytics when GA4 alone is insufficient.

## Architecture shape

Prefer one modular Next.js application for the MVP rather than microservices.

Logical areas:
- public storefront;
- customer account;
- checkout and orders;
- learning portal;
- administration.

These are functional domains inside one application, not separate products.

## Backend responsibilities

Use Next.js Server Components, Server Actions and Route Handlers where appropriate. Use Supabase Edge Functions when an isolated server-side function, webhook endpoint or provider integration benefits from that boundary.

Never expose privileged Supabase service-role credentials to the browser.

## Source of truth

- Stripe is the financial source of truth for payment state.
- Supabase/PostgreSQL is the application source of truth for customers, catalog, orders, enrollments, progress and business state.
- Stripe webhook events reconcile payment state into the application database.

A browser redirect after checkout must never be treated as proof of payment.

## Environments

Maintain separate development, staging and production environments. Database migrations must be versioned in Git and applied consistently; production schema must not be modified manually as an undocumented change.

## Architectural rule

Do not introduce a separate backend framework, database, authentication provider, CMS, LMS or commerce engine unless a concrete requirement demonstrates that the current architecture cannot satisfy the need safely and maintainably.
