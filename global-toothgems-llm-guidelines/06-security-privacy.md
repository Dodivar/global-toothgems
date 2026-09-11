---
name: global-toothgems-security-privacy
description: Security, privacy, authentication, authorization, payments, uploads and data-protection rules for Global Toothgems.
---

# Security & Privacy Rules

## Authentication

Use established authentication mechanisms rather than custom password handling.

Protect:
- sessions;
- password reset;
- email verification where applicable;
- account enumeration;
- brute force;
- CSRF where relevant.

Never log passwords, tokens or payment secrets.

## Authorization

Authorization is server-side and deny-by-default.

At minimum distinguish:
- anonymous visitor;
- authenticated customer/learner;
- administrator.

A customer must only access their own:
- profile;
- orders;
- training entitlements;
- learning progress;
- private reviews/drafts.

## Payments

Payment-provider secrets remain server-side.

Payment status must be verified using trusted provider mechanisms.
Never trust:
- client-side price;
- return URL alone;
- query parameters as proof of payment.

## Personal data

Collect only data required for the stated functionality.

Customer data should have:
- clear purpose;
- appropriate access control;
- appropriate retention;
- deletion/export strategy where required.

## Reviews/photos

User-uploaded images are untrusted content.

Apply:
- file type validation;
- size limits;
- safe storage;
- access control;
- image processing/normalization if appropriate;
- moderation.

Do not execute or serve uploaded content as executable code.

## QR codes

QR destinations must be controlled by the platform.
Avoid QR links to mutable third-party URLs unless there is a deliberate operational reason.

## Admin

Administrative functions require strong authorization.

Sensitive operations should be auditable, especially:
- order changes;
- refunds;
- content publication;
- user access changes;
- course entitlement changes.

## Secrets

Never commit:
- API keys;
- payment secrets;
- database passwords;
- OAuth secrets;
- signing keys.

Never print them into logs.

## Security testing

For every feature handling user input, explicitly consider:
- XSS;
- injection;
- IDOR/BOLA;
- CSRF;
- broken authorization;
- file upload abuse;
- rate limiting;
- sensitive data leakage.

Security is a functional requirement, not a final polishing step.
