# Security & Access Control

## Authentication

Use Supabase Auth as the default identity provider.

Customer and learning identities must use the same account. A customer should not need separate credentials for the storefront and training portal.

## Authorization

Use explicit server-side roles and permissions. Suggested roles include:

- customer
- instructor
- support
- content_manager
- admin
- super_admin

Frontend role checks are for UX only. They must never be the security boundary.

Enforce authorization through server-side logic and PostgreSQL RLS where applicable.

## Administrative access

Administrative operations require elevated authorization. Sensitive actions should be auditable.

Maintain audit records for important administrative events such as:
- permission changes;
- manual enrollment/access grants;
- refunds or order adjustments;
- content publication changes;
- account moderation;
- destructive operations.

## Payments

Never trust payment status, price or order totals supplied by the browser.

Stripe webhooks must be verified and processed idempotently. Fulfillment must be driven by verified provider events rather than only by a success-page redirect.

## Files and course media

Private paid training resources must not be exposed through permanent public URLs. Use private storage and controlled/signed access where appropriate.

Do not place service-role keys, Stripe secrets or other privileged credentials in client-side code.

## Input and output security

Validate untrusted input at system boundaries. Sanitize or safely render user-generated content. Avoid exposing database errors, provider secrets, stack traces or unnecessary internal identifiers.

## Privacy

Collect only data required for the product. Model marketing consent separately from authentication and transactional requirements.

Design customer data flows with GDPR and other applicable privacy requirements in mind, especially for international sales.
