---
name: global-toothgems-learning-platform
description: Online training architecture, course authoring, progress, quizzes and future certification rules.
---

# Learning Platform Rules

## Core model

The platform should support a hierarchy similar to:

Course
→ Modules
→ Lessons
→ Activities/Quizzes

The exact model may differ, but the separation must allow content to evolve without code changes.

## Course lifecycle

Courses/content should support:
- draft;
- published;
- unpublished/hidden;
- archived where useful.

Never expose draft content to ordinary learners.

## Enrollment/access

A learner gets access based on a trusted entitlement/purchase relationship.

Never trust:
- URL parameters;
- client-side state;
- hidden buttons;
- local storage;
to determine whether a user owns a course.

## Progress

Persist progress server-side.

A progress record should distinguish between:
- started;
- completed;
- last position where useful;
- assessment result where applicable.

Avoid marking a lesson complete merely because the user opened its URL.

## Quiz progression

The desired experience includes gated steps.

For any gated sequence:
- prerequisite completion must be validated server-side;
- the UI should clearly communicate why the next step is locked;
- users must not bypass gates by changing URLs or client state.

## Feedback

For incorrect quiz answers, the product direction is:
- explain why the answer was incorrect;
- show the correct answer;
- provide useful educational feedback.

Avoid punitive or humiliating wording.

## Scoring

Final scoring must be deterministic and reproducible.

If a passing threshold exists, store:
- score;
- threshold/version where relevant;
- completion timestamp.

Do not implement “diploma awarded” logic in MVP unless certification is explicitly enabled.

## Course authoring

Administrators should eventually be able to create:
- courses;
- modules;
- lessons;
- questions;
- answers;
- explanations;
- ordering;
- publication status.

Design the data model so this can happen without rewriting the learner experience.

## Video

Course videos should:
- work well on mobile;
- avoid unnecessary autoplay;
- have meaningful titles;
- expose loading/error states.

For physical-kit QR videos, ensure the destination is usable without requiring a desktop.

## Future certification

Diplomas/certificates are roadmap scope.
The future concept includes:
- attractive certificate;
- completion/score conditions;
- social sharing;
- graduate-only areas;
- celebration/confetti.

Do not let these concepts contaminate MVP access-control assumptions.
