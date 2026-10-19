# Pro artist module — showroom, booking with deposit, client file (study)

> **Update 2026-10-19 — decided and built:** the public showcase part of P1 exists as the **Glowbook** (decision 99 in `supabase/README.md`): `/fr/glowbook/<handle>`, an artist's moderated, read-only page of chosen Studio creations, linked from Instagram. No booking, directory or tagging yet; the rest of this study is still undecided.

**Study requested on 2026-10-15, written on 2026-10-17 against `dev` @ `e28eb02`.**

**Nothing is decided and nothing is built.** This document records an analysis so the subject can be
picked up later without redoing it. It is not a plan of record: no scope decision, no schema, no
migration and no screen follows from it. Every legal point below is **unverified and must be
validated by counsel** (`AGENTS.md` §15: an agent never invents a rule that touches money, taxes,
permissions, legal behaviour, customer access or data retention). Every external figure (law
articles, Stripe and SMS pricing, competitor pricing, timelines) is **indicative** and was not
checked against a primary source in the session that wrote this.

## The idea, as stated by the owner

A module for professional tooth gem artists, beside the 3D Studio: manage their own clientele, show a
portfolio / showroom of the work they like doing so prospects see what they are good at, and from
there **book an appointment slot with a deposit**. Part of a wider goal: serve one person whether
they want to buy products, learn, create for fun, or equip themselves professionally.

**Open question, never resolved:** "un créneau dans la journée" — a time slot inside an opening day
(classic booking), or a same-day appointment (immediate booking)? The two are different products.

## TL;DR

1. **Legal blocker 1 can kill the project** and costs one meeting with a lawyer: whether organising
   and collecting money for an application performed by a non-dentist is actionable in France.
   Instruct it before writing any code.
2. **The defensible product is not the ERP, it is the loop**: Studio 3D design → estimate sheet
   (already built) → appointment → the artist's gems reordered from this shop. A generic agenda
   competes with established players on their own ground and loses.
3. **A money-free validation MVP** (public showroom + appointment *request*, ~20 assisted dev days)
   tests the idea without triggering Stripe Connect, DAC7, invoicing mandates or intermediary status.
   After the shop launches, not before.

## Scope status

**New scope, post-launch.** `global-toothgems-llm-guidelines/01-scope-and-launch.md` lists
"instructor marketplace, multi-role training marketplace" under post-launch; this is adjacent to it
and larger: a second product (two-sided B2B SaaS) on top of a B2C product that has not launched.

Per the scope rule in that file, this is stated and not silently expanded. The post-launch list in
`guidelines/01` and the domain table in `AGENTS.md` §4 are deliberately **left untouched**: adding a
row there would make the scope call that the owner has not made.

### Prerequisites, as of 2026-10-17 @ `e28eb02` — recheck against `AGENTS.md` §4 before resuming

The pro module depends on all of these, and none was finished at the time of the study:

| Prerequisite | State then |
| --- | --- |
| Cart → checkout → payment | *Built, not deployed*: `stripe-webhook` and migration `20260930200000` still awaited the owner's go-ahead |
| Studio 3D subscription | Does not exist: `STUDIO_ACCESS_MODE = "preview"` in `webapp/src/lib/studioAccess.tsx`, no Stripe Billing, no server-side entitlement |
| Member content moderation | **Absent** from the Members' Lounge (`AGENTS.md` §4 notes it is needed before opening to customers). A public portfolio is the same problem, indexed by search engines |
| GDPR export / account deletion | Not wired |
| Legal pages | Placeholders awaiting business and legal review |
| `btree_gist` extension | Not in `supabase/migrations/` (only `pg_cron` and `pg_net`) — needed for slot exclusion constraints |
| Buyer VAT number on invoices | Not built (decision 86 in `supabase/README.md`) |
| B2B layer (pro price lists, VIES validation, reverse charge) | Not built; `guidelines/01` puts B2B VAT reverse charge in post-launch |

## Positioning, and the critique

### What is already in the repo and points at the loop

- `webapp/src/lib/studio3d/quoteSheet.ts` already renders an estimate sheet (a PNG the artist hands
  to a client) from the current design, priced **at shop prices**, with the shop items listed row by
  row. That is the missing link between a design and a sale.
- `webapp/src/lib/studio3d/gemCatalog.ts` and migration `20261007141456_studio_shop_gems` make the
  Studio library the shop's real gems. A design is therefore already a basket.
- `supabase/migrations/20260929072816_studio_creation_shares.sql` already shares a creation
  read-only by link — the mechanism for showing a client their planned placement.
- `webapp/src/data/studio.ts` already defines four plan tiers: `trial` (free, 2 days),
  `essential` €5, `artist` €19.90 (featured), `atelier` €39.90. The copy for `atelier` in
  `webapp/src/i18n/locales/studio.fr.json` already promises "plusieurs postes pour votre équipe",
  i.e. a multi-seat model. The pro module slots into the two top tiers; nothing is implemented.

**The loop:** client browses the showroom → picks a look → the artist composes it in the Studio →
the estimate sheet prices it from the shop catalogue → the client approves and pays a deposit → the
slot is held → the gems in the estimate drop into the artist's own reorder basket. Only this platform
can run that loop, because it owns the catalogue, the designer and the training.

### Critique to keep in mind

- **The market is held.** Planity, Fresha and Treatwell own beauty booking in France, and at least
  one of them was free for professionals (indicative, not verified, and may have changed). A generic
  agenda is both the least differentiating and the most tedious part (time zones, DST, no-shows,
  reminders, calendar sync).
- **Therefore: do not monetise the ERP, monetise the reorder.** A €20–40/month subscription for an
  agenda loses against a free competitor. "ERP included above X € of gems per quarter" is hard to
  beat and aligns the platform's interest with the artist's. The ERP is a B2B retention tool, not a
  profit centre.
- **"All possible services" is the project's main risk, not its ambition.** Shop + Academy + Studio +
  Lounge + certificates + loyalty + gift cards + ERP + public directory, for one owner, before a
  single euro has been taken in production, is four products competing for the same attention. The
  defensible version of the goal is not "every service" but "one journey where each service feeds the
  next": the artist buys gems, trains in the Academy, designs in the Studio, books through the
  module, and reorders.
- **Sequencing.** Nothing here should start before the shop checkout is deployed and live.

## Legal blockers, ranked by lethality — all to validate with counsel

No position on any of this exists in the repo today (checked: `guidelines/00`, `guidelines/06`,
`supabase/README.md`).

1. **Who may lawfully apply a tooth gem, per country.** In France dental practice is reserved
   (Code de la santé publique, L4141-1 ff.); applying a gem to enamel with adhesive and etching is a
   grey zone that the professional order may qualify as a dental act. Selling products and training
   is an indirect exposure; **organising and collecting payment for a third party's application** is
   closer to facilitation. The answer may differ by country. Until this is settled, do not build paid
   booking.
2. **Collecting a deposit for a third party is payment intermediation.** The artist's money must not
   transit through the platform's own Stripe account without a regulated status. The sane route is
   **Stripe Connect**, artist as *merchant of record*, platform taking an application fee. Also to
   check: that Stripe accepts this activity on a Connect platform at all (a para-dental vertical is
   the kind that goes to manual review).
3. **Platform duties, once it matches and collects.** DAC7 reporting (personal services are a
   covered activity, so tax identifiers must be collected and reported annually), French
   platform-operator duties (CGI 242 bis: tax and social information, annual recap statement),
   consumer transparency (C. conso L111-7: ranking, capital links), the P2B regulation (artists
   become "business users": dedicated terms, ranking transparency, mediation), and the DSA (trader
   traceability, notice-and-action). Small / micro-enterprise exemptions exist on part of this — to
   confirm, not to assume.
4. **`acompte` or `arrhes`?** This decides the whole cancellation design. French law defaults sums
   paid at order to **`arrhes`** (sums the buyer forfeits if they withdraw, and the seller returns
   doubled if they do — C. conso L214-1), whereas an **`acompte`** (part payment) binds both parties
   firmly. Also needed: whether the 14-day withdrawal right applies to a dated personal service.
   Until it is settled, **do not write "non-refundable deposit" in the UI** — that is the textbook
   unfair term.
5. **GDPR: the platform changes hat.** On the artist's client file the artist is
   **`responsable de traitement`** (controller) and the platform is **`sous-traitant`** (processor),
   so: a data processing agreement per artist, a register, and real portability (the artist exports
   their client file when they leave, or it is a lock-in complaint). **Design to avoid health data**:
   a closed list of contraindications plus an acknowledgement checkbox, never a free-text medical
   history field. Special-category data brings explicit consent, reinforced security and possibly
   French health-data hosting rules — **Supabase is not HDS-certified**. Before/after photos are
   personal data of an identifiable third party: written consent, image rights, private bucket and
   signed URLs, never public by default.
6. **Invoicing.** A client's deposit to an artist must **not** enter the platform's
   `FA-YYYY-NNNNNN` / `AV-YYYY-NNNNNN` sequence (decision 86 in `supabase/README.md`): the platform
   is not the seller and that sequence is legally frozen and immutable. Either the artist invoices
   (the platform issues only a receipt), or the platform invoices in their name under a written
   **`mandat de facturation`** (billing mandate), with a separate sequence per artist. The French B2B
   e-invoicing reform also applies to the platform's own subscription invoices to professionals.
7. **If "equip themselves professionally" is in scope.** Adhesives, etchants and curing lamps are
   **medical devices** (MDR 2017/745): as a distributor the platform has its own obligations (CE
   marking checks, traceability, UDI, vigilance, storage conditions), and some are professional-use
   only, which the current catalogue cannot express.

## Technical blockers

- **The role model does not fit, and getting it wrong opens the back office.** A pro artist must
  **not** be a `roles` row with `is_staff = true`: `private.is_staff()` and
  `private.has_permission()` are the door to `/admin`, and `webapp/proxy.ts` relies on them. What is
  needed is a **separate multi-tenant model**: an organisation (the studio), its members (exactly the
  "plusieurs postes" of the `atelier` plan), and an `org_id` on every business row behind a single
  helper such as `private.is_org_member(org_id, permission)`.
- **Cross-tenant isolation is the project's largest security risk.** Today RLS reduces to "it is mine
  or I am staff"; this introduces tenant isolation, which is a different discipline. One bad policy
  leaks artist A's client file to artist B. **Non-negotiable: a dedicated `supabase/tests/` suite
  asserting cross-tenant *refusal* on every table** — `AGENTS.md` §16 already requires a test that
  another user is refused.
- **The artist's clients have no account.** `public.profiles` is 1:1 with `auth.users`, so the client
  file must hold **non-auth contacts**, with an optional link to an account when the client creates
  one (to see the appointment, pay the deposit, receive the estimate). Two identities to reconcile
  from the start, or duplicates everywhere.
- **Booking is a concurrency problem, not a UI problem.** Two clients on the same slot in the same
  second: the only reliable answer is a database constraint,
  `EXCLUDE USING gist (artist_id WITH =, slot WITH &&) WHERE (status in ('held','confirmed'))` over a
  `tstzrange` — which requires the **`btree_gist`** extension, absent from the migrations. Plus: the
  slot **held** during payment then expired (reuse the `expire_stale_orders()` + `pg_cron` pattern
  already in the repo), weekly availability rules expressed in local time and materialised
  (Europe/Paris and DST: "Tuesday 14:00" is not a fixed UTC offset), buffers, time off, minimum
  notice.
- **Connect is a second webhook surface**: connected-account events, blocking onboarding/KYC (an
  artist "pending verification" cannot collect), payouts, and refunds where Stripe keeps its fees —
  on a €20 deposit a round trip costs someone roughly €0.50 (indicative): decide whom.
- **Smaller, concrete points.** New public pages (artist page, showroom) must be added to
  `webapp/src/lib/localeRoutes.ts` in both FR and EN, and **the English wording of the segments is
  the owner's call** (`AGENTS.md` §4). A "certified artist" badge conflicts with the owner's decision
  that there is no public certificate page — to reopen. Appointment reminders should reuse
  `email_log` + `pending_*_emails` + the `send-pending-emails` sweep (already live); SMS is another
  provider, another cost (~€0.05–0.08 per message, indicative) and its own consent rules. Two-way
  Google Calendar sync is a trap: start with a **read-only iCal feed**.

## Feature set, for the module to be complete

**Showroom / portfolio** — per-artist gallery, pieces tagged (shape, colour, tooth) and **linked to
the shop catalogue**, indicative price, an "I want this" action that pre-fills the booking request,
client reviews tied to an honoured appointment (same rule as product reviews), per-language slug,
`LocalBusiness` JSON-LD. **Moderation is mandatory**: back-office queue, reporting, banning — before
anything is published.

**Agenda and booking** — services (name, duration, price, deposit, preparation), recurring
availability plus exceptions, booking in at most three screens, confirmation and reminders at D-2 and
D-1, self-service rescheduling, waiting list on a released slot, cancellation policy displayed and
enforced, no-show recorded, iCal export.

**Deposit payment** — Connect, fixed or percentage deposit, balance on site or online, receipt (not
invoice), refund per policy, balance reminder.

**Client file (CRM)** — contact, history, preferences, free-text notes that are **not medical**;
consent and contraindication form signed online and timestamped; before/after photos under explicit
consent in a private bucket; **the Studio 3D placement attached to the appointment** (the real asset:
the placement becomes reusable data at touch-up time); "gem fell off" warranty follow-up;
re-application reminder at six months.

**Rest of the ERP** — per-artist gem stock with a **reorder button into the shop** (reuse the
`admin_adjust_stock()` pattern: relative and atomic), revenue and statistics, no-show rate, top
services, average basket, accounting CSV export, multiple seats (`atelier` plan), and a public artist
directory filtered by city — which doubles as a B2C acquisition channel.

**Bridges to what exists** — the artist stays a shop customer (pro pricing), an Academy graduate (the
certificate feeds their profile — decision to reopen), a Lounge member (a "pros" room) and a Studio
user; and every appointment consumes the platform's gems. That mesh is the real answer to "every
possible service": one account, four uses, one supplier.

## Estimate

Calibrated on this repository's actual pace (the whole platform was built from 2026-09-23, roughly
three weeks). A "day" below means one day of **AI-assisted development like those**, not a classic
person-day.

| Phase | Content | Dev |
| --- | --- | --- |
| **P0** | Studio subscription + Stripe Billing + server-side entitlement (hard prerequisite, already in scope) | 4–6 d |
| **P1** | Pro tenant, public profile, showroom, **moderation**, directory | 8–12 d |
| **P2** | Services, availability, booking **without payment** (+ `btree_gist`, expiry, reminders) | 10–15 d |
| **P3** | Stripe Connect, deposit, cancellation, refund, receipts | 15–25 d |
| **P4** | CRM, consents, Studio placement attached to the appointment, stock + reorder | 10–15 d |
| **P5** | Multi-seat, pro statistics, exports | 5–8 d |

**Total ≈ 50 to 80 assisted dev days**, excluding maintenance — and maintenance of a two-sided
product with payments is not marginal: artist support, deposit disputes, blocked KYC, ghost slots.

**The critical path is not the code.** Legal opinion on blocker 1: 4 to 8 weeks, and it may say no.
Stripe Connect platform approval: 2 to 6 weeks. Pro terms, DPA and cancellation policy: several weeks
of back-and-forth. **Count 4 to 6 calendar months** before a first deposit can be collected lawfully,
even if the code is ready in two. Recurring costs to budget: Connect (roughly €2 per active account
per month plus ~0.25 % of payout volume, indicative), SMS, and support time.

### Recommended validation MVP

**P1 + P2 only, no money**: public showroom + appointment **request** (the artist confirms by hand,
any deposit is settled off-platform). About 20 assisted dev days; triggers **none** of legal blockers
2, 3, 4 and 6; and answers the only question that matters — do artists publish a showroom, and do
clients ask for appointments? If yes, the legal opinion and Connect are funded by real traction. If
no, 60 days and a regulated status have been saved. **After the shop launches, not before.**

## Decisions to confirm (`AGENTS.md` §15)

1. **Lawfulness of application by a non-dentist**, per country — blocking; instruct before any code.
2. `acompte` or `arrhes`; whether the 14-day withdrawal right applies; who bears the Stripe fees on a
   refund.
3. Controller / processor: template DPA per artist, portability of the client file, retention periods
   (consents, photos).
4. **No health data**: contraindications as a closed list, no free-text medical field. To validate as
   a product rule.
5. Who invoices the end client: the artist, or the platform under a `mandat de facturation`?
   Numbering sequence **separate** from `FA-YYYY`.
6. Business model: pro subscription, commission on the deposit, or **free above a gem purchase
   volume** (the study's recommendation).
7. "Certified artist" badge: reopens the owner's "no public certificate page" decision.
8. A pro is a **tenant**, never `is_staff` — to be written into `AGENTS.md` if the direction is
   approved.
9. "Créneau dans la journée": a time slot, or a same-day appointment?

## When resuming this subject

1. Get the legal opinion on blocker 1. Everything else is worthless until it comes back positive.
2. Recheck the prerequisites table above against `AGENTS.md` §4 — several of those lines were
   expected to change shortly after this study was written.
3. The owner decides whether to run the validation MVP, and the scope call is recorded in
   `AGENTS.md` / `guidelines/01` at that point, not before.
