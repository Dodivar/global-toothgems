---
name: global-toothgems-learning-platform
description: Academy rules and target architecture — courses, modules, lessons, quizzes, entitlements, progress, media, certificates, course administration.
---

# Learning Platform (Academy)

## Current state

The Academy is fully designed in the UI (catalogue, course sales pages, lesson player, quizzes, certificates, admin Training workspace and course builder) but runs on mock data (`webapp/src/data/courses.ts`, `lessons.ts`, `adminTraining*.ts`, `lib/progress.tsx`, `lib/adminTraining.tsx`). **There is no Academy schema yet.** Designing it is launch-blocking work: start from what the admin course builder and the lesson player already need, so the UI can be wired without redesign.

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

Draft → published → unpublished/hidden → archived. Draft and hidden content is never readable by learners (RLS), only by staff with `manage_training`. Teasing a course before publication is a published sales page with unpublished lessons, not a leak of drafts.

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
