---
name: global-toothgems-learning-platform
description: Academy rules and target architecture — courses, modules, lessons, quizzes, entitlements, progress, media, certificates, course administration.
---

# Learning Platform (Academy)

## Current state

The Academy is fully designed in the UI (catalogue, course sales pages, lesson player, quizzes, certificates, admin Training workspace and course builder). **Authoring schema is live (phase A, migration `academy_authoring`, 2026-10-01)**: courses, modules, steps, content blocks, quizzes, the training media library, course price and course promotions, written by the back office (`lib/adminTraining.tsx` + `lib/adminTrainingBackend.ts`, `lib/trainingMedia.tsx`, `/admin/formations/medias`). **Public pages are live (phase B, migration `academy_public_pages`, 2026-10-01)**: the catalogue, course sales pages, home band and header/footer entries read the published courses, their outline (modules, steps, knowledge checks' pass marks — never content or answers), cover and current price (`lib/academy/`, server-rendered from `app/_public/coursePage.tsx`). **Course sales are built (phase D, migration `course_checkout`, 2026-10-02, not applied yet)**: "Buy" puts one seat in the cart; `create_order()` prices it (`course_current_prices`, VAT `training`), requires an account and refuses a course already held; the `purchase` entitlement is inserted when the order becomes paid (verified Stripe webhook) and revoked by a full refund. **Learner side is live (phase C, migration `academy_learner_access`, 2026-10-01)**: `course_entitlements` (granted by hand from `/admin/formations/<id>/acces` (audited) or bought), content served by `learner_courses()` without answer keys, progress, attempts, scoring and completion written by database functions that port `lib/learning/path.ts`, certificates as `course_completions` rows with a verification code, lesson media through signed URLs after the entitlement check (`lib/progress.tsx`, `lib/learning/`). See `supabase/README.md` → *Academy authoring*, *Academy public pages* and *Academy learner access*.

## Decisions (owner, 2026-10-01)

- **A course is not a product** and never appears in the shop. Its price lives on `courses` and is edited with `manage_training` only. A course is sold as a course line of the same order and Stripe Checkout (`order_items.course_id`, phase D); shop promotions, codes and the loyalty reward never apply to it.
- **Course promotions** are their own mechanism (`course_promotions`): a dated percentage or amount off one course, one at a time, no codes. Shop promotions do not apply to courses.
- **No instructor field**: a single trainer authors every course.
- **No "review" status**: draft → published ⇄ unpublished. A course that was ever published is never deleted nor turned back into a draft.
- **Unpublished course**: its buyers still see it in their space, greyed out, not selectable, with a "back soon" message; nobody can open its content until it is published again.
- **Media library** is a dedicated back-office screen (`/admin/formations/medias`); the course builder only *picks* media (select-only picker linking to the library). Videos are uploaded (resumable TUS uploads) to the private `training-media` bucket; 50 MB per file on the free plan, raised on Pro.

## Target model

```
courses (product link, status, level, translations)
  └─ course_modules (position, translations)
       └─ lessons (position, kind: video | text | quiz, duration, media path, translations, is_preview)
            └─ quiz_questions (kind, position, explanation, translations)
                 └─ quiz_choices (is_correct, translations)
course_entitlements (user, course, source: purchase | bundle | manual_grant | promotion, order_id, granted_by, starts_at, expires_at, revoked_at)
lesson_progress (user, lesson, status: started | completed, last_position, completed_at)
quiz_attempts (user, lesson, answers, score, pass_threshold snapshot, passed, created_at)
certificates (user, course, issued_at, verification code, score snapshot)
```

Names are indicative; the invariants are not. Same conventions as the rest of the schema (see `09-supabase-workflow.md`), translations in `*_translations` tables, no language columns.

## Lifecycle

Draft → published ⇄ unpublished (enforced by the `courses_guard` trigger; publication requires `course_publication_problems()` to be empty). Draft and unpublished content is never readable by learners (RLS), only by staff. An unpublished course stays listed, greyed out, for the members who own it. Teasing a course before publication is a published sales page with unpublished lessons, not a leak of drafts.

## Access

- Access = an active `course_entitlements` row, granted by the Stripe webhook for purchases, or by staff (audited) for manual grants.
- Never infer access from URL parameters, client state, hidden buttons, local storage or the success page.
- Lesson content (video URLs, text, correct answers) is readable only with an entitlement — or for `is_preview` lessons. Correct answers and explanations are returned **after** an answer is submitted, by a function, never shipped in advance to the browser.
- The course sales page (`/fr/academy/formation/<slug>`, `/en/academy/course/<English slug>`) stays public and crawlable; only the player is gated. Its outline is public; a step's content is not.

## Progress and quizzes

- Progress persisted server-side; opening a URL does not complete a lesson. Completion rules (video watched threshold, quiz passed) are enforced by a database function.
- Gated sequences: prerequisites validated server-side; the UI explains why a step is locked; changing the URL does not bypass a gate.
- Scoring deterministic and reproducible; store score, threshold version and timestamp. The pass mark is on the course record (`courses.min_score`, per check `course_quizzes.passing_score`) and snapshotted on each attempt (`quiz_attempts.passing_score`). The prototype's `PASS_SCORE` (`data/lessons.ts`) only feeds the mock-mode sales page fixtures.
- With immediate feedback, the first answer to a question stands for the attempt (the server records it before correcting it); a check is keyed by its module, so replacing a module's check keeps a member's pass.
- Progress rows keep soft references (no foreign key) to steps, checks and answers: an author can delete or replace a node of a published course, and what members completed is never erased nor blocks the save.
- Incorrect answers teach: explain why, show the correct answer, never shame.

## Media

- Paid videos and downloads in a private bucket, served by short-lived signed URLs after the entitlement check (Edge Function or `SECURITY DEFINER` function that checks it).
- Supabase Storage is acceptable at launch for simple MP4 delivery; Mux is the planned upgrade if adaptive streaming, playback analytics or scale require it (explicit decision).
- Videos work on mobile, no autoplay with sound, meaningful titles, loading/error states.
- Kit QR codes point to platform-controlled pages that work on a phone without an account when the content is free.

## Certificates

A certificate shown as real must be a durable record (recipient, course, issue date, verification code, score) created by a server rule when completion conditions are met — not a flag computed in the browser. It is the `course_completions` row of a course that issues certificates (code `GTC-XXXX-XXXX-XXXX`), written once and kept after a revocation or later course edits.

The document (decided by the owner, 2026-10-07): issued by "Global Toothgems Academy" with no hand-drawn signature, and carries the Global Toothgems logo (the header's black wordmark). The holder's name is the profile's first and last name at display time, never the e-mail fallback: a certificate cannot be downloaded or shared until both are filled in, and the member is asked for them in place (decided by the owner, 2026-10-07). It is drawn once (`webapp/src/lib/certificate/layout.ts`) and rendered both on screen (SVG) and as the member's file (canvas → A4 PDF or PNG, in the browser, no dependency), so what is downloaded is what was shown. **No public certificate page**: sharing is the certificate's image plus an editable caption (device share sheet, or image + copied caption + the network opened) and LinkedIn's pre-filled "add a certification" form; nothing of ours exposes the holder. The completion screen celebrates (once, still under reduced motion) and offers download and share in place. Graduate-only areas stay post-launch (`01`).

## Community

The Members' Lounge is unlocked by an active course entitlement (or being active staff), checked server-side by `private.lounge_can_enter()` on every read and write (see `supabase/README.md`, *Members' Lounge*).

## Course administration

Staff with `manage_training` create and edit courses, modules, lessons, questions, answers, explanations, ordering and publication without code changes. Publication changes are audited.
