# Production readiness — what to watch once hundreds of people use the site

Written 2026-11-12 after a refactoring pass over the recent work. It complements
`CHECKLIST-OUVERTURE.md` (business and legal launch steps) and
`supabase/README.md` › "Review of 2026-11-11" (open decisions): it does not
repeat them, it covers **stability over time**. Facts marked *(observed)* were
read on the Supabase project on 2026-11-12.

## 1. Act before the launch

| # | What | Why | How |
|---|------|-----|-----|
| 1 | **Raise the pg_net timeout of the cron → Edge Function calls** | `private.call_email_function()` calls `net.http_post` with the default 5 s timeout. *(observed)* 5 calls timed out and 1 answered 500 on 2026-11-12. The function usually keeps running, but the call is logged as failed and a slow sweep (many e-mails, PDFs to draw) will time out more often as volume grows. | New migration re-creating the function with `timeout_milliseconds := 60000` in `net.http_post(...)`. |
| 2 | **Watch the jobs through their HTTP answers, not `cron.job_run_details`** | pg_cron only records that the `net.http_post` was queued: *(observed)* 0 failures there while `net._http_response` holds timeouts and a 500. | A weekly look (or an alert) at `select status_code, count(*) from net._http_response group by 1` — the table only keeps ~6 h, so check soon after an incident. Better: item 4. |
| 3 | **Purge `cron.job_run_details`** | It grows by ~8 000 rows a week (4 jobs every 5 minutes) and is never purged *(observed: 6.7 MB after 7 weeks)*. Harmless now, a slow bloat over years. | A daily `cron.schedule('purge-cron-history', '0 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '14 days'$$)`. |
| 4 | **Error monitoring on the server side** | PostHog captures browser exceptions; Edge Functions only write to their own logs (`[name] message`). Nobody is told when `stripe-webhook` or `send-pending-emails` starts failing. | Sentry (planned in AGENTS.md §5) or, at minimum, a Supabase log drain / alert on `level = error` for the function logs. All function logs now go through `_shared/log.ts` (`functionLogger`): that is the single place to add structured JSON or a forwarder. |
| 5 | **Turn on leaked-password protection** | Security advisor `auth_leaked_password_protection` *(observed)*. | Supabase › Authentication › Attack Protection. One click, no code. |
| 6 | **Auth connection pool** | Advisor `auth_db_connections_absolute`: Auth is capped at 10 connections. If the compute is upgraded, Auth will not follow. | Switch it to a percentage in Supabase › Database › Connection pooling when upgrading. |
| 7 | **Backups / point-in-time recovery** | Orders, invoices (legally immutable) and entitlements live only in Postgres. | Check the plan's daily backups; consider PITR (Pro add-on) before the first real money. Test one restore on a branch. |
| 8 | **Staff second factor** | Migration `20261111094500_staff_mfa_required` is **not applied** (supabase/README.md) while AGENTS.md describes MFA as enforced. Until it is, a staff password alone opens the back office. | Already in the checklist: apply it once every staff member has enrolled. |

## 2. Deployments: the habits that avoid breaking production

1. **Never merge `dev` → `main` with a red CI.** On 2026-11-12 `dev` was red again (the terms of sale moved to 2026-11-12, four Deno tests still expected the 11th). Fixed in this pass. Rule of thumb: when you bump `TERMS_OF_SALE_VERSION` or `STUDIO_TERMS_VERSION`, run `npm run sync:documents` **and** `deno test` in `supabase/functions`.
2. **Order of a release that touches the database and the code:**
   1. migration applied on the project (additive: new columns nullable or with a default, new functions alongside the old ones);
   2. Edge Functions redeployed (pinned commit, see supabase/README.md › Edge Functions › Deploy);
   3. Vercel promotes the web app;
   4. only later, a second migration removes what the old code still used.
   A destructive change shipped in one step breaks the browsers still holding the previous bundle (Vercel keeps old deployments reachable; open tabs keep old JS for hours).
3. **Edge Functions are deployed one by one, the repository is not.** Shared code (`_shared/`) changes only reach a function when *that* function is redeployed. After a change in `_shared/` (this pass moved `turnstile.ts` there and added `http.ts` helpers and `log.ts`), redeploy every function that imports it in the same session, or note which ones still run the older commit. Keep the list of deployed commits per function in supabase/README.md up to date.
4. **Migrations are forward-only.** Write the reverse SQL in the PR description for anything risky; test the migration on a Supabase branch or `supabase start` + `npm run test:db` before the project (CI does this on an empty database).
5. **Stripe:** never change the pinned `apiVersion` (`_shared/clients.ts`) and the webhook endpoint API version in the same release; when adding a webhook event type, add it to *both* accounts' endpoints (shop and Studio) and to the live endpoints at the switch.
6. **Vercel:** use preview deployments for every PR; production builds already refuse missing/unsafe Supabase variables (`productionGuard.ts`). Use "Instant rollback" in Vercel rather than a revert commit when a release misbehaves — then fix forward.
7. **Deploy outside peaks** (evenings/week-ends for a shop selling to EU customers are the peaks — prefer weekday mornings), and never during a promotion or a newsletter send.

## 3. Load: what changes at a few hundred active users

The architecture (Vercel + Supabase + Stripe, business rules in Postgres) is sound for this scale; the risks are specific spots, not the stack.

- **Unindexed foreign keys** *(observed: 98)*. Most are on small tables (translations, `created_by` columns) and do not matter. The ones that will: foreign keys on tables that grow with traffic and are deleted from or joined on — `order_items`, `refunds`, `email_log`, `lounge_messages` / reactions / reports, `studio_designs`, `consent_records`, `back_in_stock_requests`. Add indexes for those in one migration when the tables pass a few thousand rows; check `pg_stat_statements` first (Supabase › Query performance).
- **Unused indexes** *(observed: 75)*: normal before traffic. Do not drop them now; re-check after 3 months of real use.
- **One permissive-policy duplicate**: `gift_cards` has two SELECT policies for `authenticated` — merge them into one `using (a or b)` policy when that table is next touched (performance only).
- **Members' Lounge (Realtime)**: each open lounge tab holds a Realtime connection. Check the plan's concurrent Realtime connection limit against the number of learners online at once (a live class can bring everyone in at the same minute).
- **Studio try-on (Gemini)**: each render costs money and takes up to a minute. The database caps 10 renders / account / day; also set a monthly budget alert in Google Cloud and watch the `studio_try_on_*` PostHog events for a sudden rise.
- **Edge Function cold starts**: payment-page functions (`create-checkout-session`, `create-studio-subscription`) can take 1–2 s on a cold start. Acceptable; do not add heavy imports to them (PDF drawing is already outside the payment path).
- **Resend limits**: the free plan's daily/monthly quota and the three-segment limit are business decisions already taken; watch Resend's dashboard after each newsletter (bounces/complaints are fed back by `resend-webhook`).
- **Rate limits are per IP from `sb-forwarded-for` / `cf-connecting-ip`** (`_shared/http.ts` › `clientAddress`). Shared IPs (offices, mobile carriers' NAT, a salon's Wi-Fi during a class) can trip the newsletter/contact/withdrawal limits for several people. If complaints appear, raise the limits rather than removing them.
- **Vercel Firewall**: turn on the managed rules / bot protection for `/fr/*`, `/en/*` and rate-limit `/auth/confirm`; it costs nothing and absorbs scrapers before they reach Supabase.

## 4. Operating routine (15 minutes a week)

1. GitHub Actions: last `dev` run green.
2. Supabase › Advisors (security + performance): nothing new at WARN level.
3. Supabase › Edge Functions › Logs: filter `error` for `stripe-webhook`, `send-pending-emails`, `create-checkout-session`.
4. SQL: `select status, count(*) from email_log where created_at > now() - interval '7 days' group by 1;` — `failed` should stay at 0.
5. SQL: `select status, count(*) from stripe_webhook_events where received_at > now() - interval '7 days' group by 1;` — no event stuck unprocessed.
6. Stripe dashboard › Webhooks: no failed deliveries.
7. Vercel › Observability: error rate and slowest routes.

## 5. Code maintainability — next refactors, by value and risk

Done in this pass (no behaviour change, all suites green): shared bearer/JWT and client-IP readers for Edge Functions (`_shared/http.ts`), Turnstile verification moved to `_shared/`, one `functionLogger`, one reader for Edge Function errors in the web app (`lib/supabase/functionError.ts`), CI fixed.

Worth doing next, in this order:

1. **Method/CORS preamble of the Edge Functions** — every handler repeats the OPTIONS/405 lines; a `preflight(req, cors)` helper is small but the error bodies differ slightly (`error` vs `code`), so it needs its tests updated per function.
2. **Browser storage access** — 22 modules touch `localStorage` with their own try/catch; a `lib/browserStorage.ts` (`read`, `write`, `remove`, all guarded) would remove a class of private-mode crashes. Medium effort, low risk, do it file by file.
3. **Small type guards** (`isRecord` ×5, `isNum` ×3) into one `lib/guards.ts`.
4. **Very large modules** — `lib/studio3d/engine.ts` (3 600 lines), `EditorViewport.tsx`, `Cart.tsx` (1 000 lines), `liveChatStore.tsx`. Split only with tests around them first (the Studio engine has little unit coverage of its rendering paths); not worth the risk right before launch.
5. **Remaining mock paths** (AGENTS.md §4): retire them domain by domain as `test:e2e:live` covers each screen — this is the largest long-term simplification of the code base.
