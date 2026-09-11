---
name: global-toothgems-ecommerce
description: E-commerce domain rules for catalog, cart, checkout, orders, reviews, loyalty and customer commerce.
---

# E-commerce Rules

## Product integrity

A product price shown to the customer must originate from trusted server-side data.

The client must never be authoritative for:
- price;
- discount;
- tax;
- stock;
- payment status;
- order status.

## Cart

Cart behavior must be deterministic:
- quantities are validated;
- unavailable products cannot be purchased;
- totals are recalculated server-side;
- stale cart states are handled gracefully.

## Checkout

Checkout should minimize friction.

Required states:
- cart;
- customer;
- delivery;
- payment;
- processing;
- success;
- failure/cancelled.

Do not mark an order as paid based solely on a client redirect.
Use verified payment-provider confirmation/webhooks where applicable.

## Installment payment

“4x payment” is a product requirement direction, not a license to invent provider behavior.

Before implementation:
- identify the selected payment provider;
- verify eligibility, country and currency;
- implement according to the provider's official flow;
- clearly communicate installment conditions to customers.

## Reviews

Reviews with photos must have:
- moderation/status;
- safe image handling;
- abuse/spam consideration;
- clear association to the product.

If verified-purchase status is implemented, it must be based on actual order data.

## Loyalty

The desired future example is:
“5 purchases above €50 → 20% benefit”.

This is NOT MVP unless explicitly promoted.

When eventually implemented:
- define whether purchases mean orders or line items;
- define refunds/cancellations;
- define expiration;
- define stacking rules;
- define abuse prevention;
- calculate eligibility server-side.

## Referral

Referral is roadmap scope.
Do not add referral codes or tracking tables just because they may be useful later unless a concrete MVP requirement needs them.

## Gift cards/vouchers

If implemented:
- maintain immutable transaction history;
- prevent negative balances;
- define expiration and refund rules;
- ensure discounts cannot create unexpected negative order totals.

## Newsletter

Marketing consent must be explicit and auditable.
Do not subscribe users to marketing by default merely because they created an account.

## Instagram/product links

Treat social links as content/discovery metadata, not as a hidden dependency for product purchasing.
If external social APIs are introduced later, isolate the integration.
