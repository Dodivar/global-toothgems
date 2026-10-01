---
name: global-toothgems-learning-platform
description: Academy rules and target architecture — courses, modules, lessons, quizzes, entitlements, progress, media, certificates, course administration.
---

# Learning Platform (Academy)

## Current state

The Academy is fully designed in the UI (catalogue, course sales pages, lesson player, quizzes, certificates, admin Training workspace and course builder). **Authoring schema is live (phase A, migration `academy_authoring`, 2026-10-01)**: courses, modules, steps, content blocks, quizzes, the training media library, course price and course promotions. Still on mock data: the public Academy pages (phase B: `data/courses.ts`), the learner side — access, progress, quiz attempts, certificates (phase C: `lib/progress.tsx`, `lib/learning/`), and selling a course (phase D, with checkout). See `supabase/README.md` → *Academy authoring*.

## Decisions (owner, 2026-10-01)

- **A course is not a product** and never appears in the shop. Its price lives on `courses` and is edited with `manage_training` only. Selling courses needs a course line in `create_order()` / Stripe Checkout (phase D).
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
- The course sales page (`/academy/formation/:id`) stays public and crawlable; only the player is gated.

## Progress and quizzes

- Progress persisted server-side; opening a URL does not complete a lesson. Completion rules (video watched threshold, quiz passed) are enforced by a database function.
- Gated sequences: prerequisites validated server-side; the UI explains why a step is locked; changing the URL does not bypass a gate.
- Scoring deterministic and reproducible; store score, threshold version and timestamp. The pass mark (`PASS_SCORE` in `data/lessons.ts` today) moves to the course record.
- Incorrect answers teach: explain why, show the correct answer, never shame.

## Media

- Paid videos and downloads in a private bucket, served by short-lived signed URLs after the entitlement check (Edge Function or `SECURITY DEFINER` function that checks it).
- Supabase Storage is acceptable at launch for simple MP4 delivery; Mux is the planned upgrade if adaptive streaming, playback analytics or scale require it (explicit decision).
- Videos work on mobile, no autoplay with sound, meaningful titles, loading/error states.
- Kit QR codes point to platform-controlled pages that work on a phone without an account when the content is free.

## Certificates

A certificate shown as real must be a durable record (recipient, course, issue date, verification code, score) created by a server rule when completion conditions are met — not a flag computed in the browser. Social verification pages, graduate-only areas and celebrations are post-launch (`01`).

## Community

The Artist Community is unlocked by owning a course. When built for real, its access derives from the same entitlements, server-side. Post-launch.

## Course administration

Staff with `manage_training` create and edit courses, modules, lessons, questions, answers, explanations, ordering and publication without code changes. Publication changes are audited.
