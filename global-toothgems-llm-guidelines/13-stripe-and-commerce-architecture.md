# Stripe & Commerce Architecture

## Payment provider

Stripe is the default payment platform for Global Toothgems.

Use Stripe Checkout / Checkout Sessions as the preferred initial checkout flow unless a concrete UX or business requirement justifies a custom payment form.

Stripe is the financial source of truth; Supabase is the application/business-data source of truth.

## Checkout rules

The server must determine or validate:
- products and variants;
- quantities;
- prices;
- currency;
- discounts;
- applicable taxes;
- shipping where applicable;
- final order totals.

Never accept a client-calculated total as authoritative.

## Webhooks

Implement verified Stripe webhooks for payment and lifecycle events relevant to the application.

Webhook processing must be idempotent. Persist provider event identifiers or an equivalent deduplication mechanism.

Successful payment events may trigger fulfillment such as:
- marking an order paid;
- granting a digital product entitlement;
- enrolling a customer into a course;
- sending a transactional confirmation.

Do not grant paid access solely because a browser reached a success URL.

## Orders

An order must preserve historical commercial facts, including:
- purchased items;
- quantities;
- unit prices;
- discounts;
- tax amounts/rates where applicable;
- shipping amounts where applicable;
- currency;
- payment references;
- fulfillment/access state.

Current catalog data must not be used to reconstruct old orders.

## International commerce

Design the system to support multiple countries, currencies, tax regimes and shipping zones.

Do not assume that language, country, currency and tax jurisdiction are the same dimension.

Stripe Tax and multi-currency capabilities may be used where appropriate, but final tax/compliance decisions must follow the actual countries and business setup.

## Product types

The catalog should be able to represent at least:
- physical products;
- digital products;
- courses;
- bundles;
- variants.

Purchasing a product may create one or more explicit entitlements. Entitlements should be auditable and independent from the UI.
