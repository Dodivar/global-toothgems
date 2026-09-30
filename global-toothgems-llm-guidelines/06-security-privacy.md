---
name: global-toothgems-security-privacy
description: Authentication, roles and permissions, RLS, secrets, storage and uploads, personal data (GDPR), audit and security testing.
---

# Security & Privacy

Security is a functional requirement, not a polishing step.

## Authentication

- Supabase Auth is the only identity system, shared by customers, learners, Studio users and staff (`lib/auth.tsx` for members, `lib/adminAuth.tsx` for staff — same Auth, different gates).
- Never implement custom password handling. Protect sessions, password reset, e-mail verification, account enumeration (neutral messages), brute force (Auth rate limits), CSRF where relevant.
- Sign-up metadata is untrusted: the `handle_new_auth_user` trigger validates it and never takes a role from it.
- Never log passwords, tokens, gift-card codes or payment secrets.

## Roles and permissions (implemented)

| Role (`profiles.role`) | Rank | Permissions |
| --- | --- | --- |
| `customer` | 0 | none (own data only) |
| `viewer` (read only) | 10 | `view_dashboard`, `view_users`, `view_statistics` |
| `manager` | 20 | the above + `manage_users`, `manage_products`, `manage_training`, `manage_orders`, `manage_customers`, `manage_promotions`, `moderate_reviews`, `manage_content` |
| `admin` | 30 | everything, incl. `manage_settings` |

- Checks in SQL: `private.is_staff()`, `private.has_permission('<key>')`; the UI reads `my_permissions()` for navigation only.
- Rank rules: nobody changes their own role or status; staff act only on ranks ≤ their own. A suspended member loses access immediately.
- New roles or permissions (e.g. support, instructor, content manager) = a migration on `roles` / `permissions` / `role_permissions`, never a front-end flag.
- The first administrator is bootstrapped by SQL only (`supabase/README.md`, Operations).

## Authorization

Deny by default. Every table has RLS enabled in the migration that creates it. A customer reads and writes only their own profile, addresses, orders, entitlements, progress, reviews, favourites, creations and consents. Front-end guards (`RequireAccount`, `RequireAdmin`) are UX. Test that another user and an anonymous visitor are refused.

## Secrets

Never commit or log API keys, Stripe secrets, webhook signing secrets, the service-role key, database passwords, OAuth secrets. Browser: publishable key only. Edge Functions: `Deno.env` secrets set in Supabase. If a secret is ever committed, tell the user immediately: it must be rotated, not just deleted.

## Storage

| Bucket | Visibility |
| --- | --- |
| `product-media` | public read by URL, staff write |
| `avatars`, `review-photos`, `data-exports`, `contact-attachments`, `studio-thumbnails` | private, per-user folders `<user_id>/…`, signed URLs |
| future course media | private, signed URLs after an entitlement check |

Never put private customer files or paid training media in a public bucket.

## Uploads and user-generated content

Untrusted: validate type and size (bucket limits + client checks), store in the owner's folder, never serve as executable content, moderate before public display, render user text as text (no `dangerouslySetInnerHTML` on user content).

## Payments

Provider secrets server-side only; payment status only from verified provider events; never trust client price, return URL or query parameters.

## Personal data (GDPR)

- Collect only what the feature needs; document the purpose.
- Consent is separate from authentication and transactions, append-only and versioned (`consent_records`, `LEGAL_POLICY_VERSION` in the webapp — bump it when legal texts change).
- Data export and account deletion are backend jobs (Edge Functions with the service role); orders survive deletion anonymised (`user_id` set null, snapshots kept).
- Retention periods (tickets, attachments, consent proofs) are legal decisions: flag them, do not invent them.
- Cookie consent must actually gate non-essential scripts before any analytics/marketing tag is added.

## Audit

Sensitive changes are written to `audit_logs` by trigger: permission and role changes, manual entitlement grants, refunds and order adjustments, publication changes, account moderation, configuration of money (prices, VAT, shipping, promotions). New sensitive tables get the audit trigger in their migration.

## QR codes

QR destinations are platform URLs, never mutable third-party links.

## Security review checklist (every feature handling input)

XSS · injection · IDOR/BOLA (another user's id in a request) · broken function-level authorization (a customer calling a staff RPC) · CSRF · upload abuse · rate limiting (public forms, gift-card balance, auth) · sensitive data leakage (column grants for `anon`, error messages) · `SECURITY DEFINER` functions checking the caller.
