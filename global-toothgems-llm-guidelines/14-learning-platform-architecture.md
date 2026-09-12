# Learning Platform Architecture

## Functional scope

The training platform is a first-class domain inside the same Global Toothgems application.

It should support:
- courses;
- modules;
- lessons;
- resources/downloads;
- enrollments;
- progress tracking;
- quizzes and assessments;
- certificates;
- prerequisites;
- access duration/expiration rules;
- bundles or purchases that grant course access.

## Identity

Use the same Supabase customer identity as the e-commerce platform. Do not create a second user account system for training.

## Access control

Course access must be represented by explicit enrollment/entitlement records. Never infer paid access from a frontend route or a hidden button.

Support access sources such as:
- paid purchase;
- bundle purchase;
- manual administrative grant;
- promotional access;
- other explicitly defined business rules.

## Progress

Lesson and course progress must be persisted server-side. Completion states must be validated by server-side business rules.

The model should allow future reporting such as:
- course completion;
- lesson completion;
- assessment results;
- certificate issuance.

## Video and files

For small/simple media requirements, Supabase Storage can be used initially. If the platform requires serious video streaming, adaptive delivery, playback analytics or scalable video infrastructure, Mux is a preferred future specialist service.

Paid resources should use private storage and controlled access.

## Content localization

Course titles, descriptions and other customer-facing course content must support translations through structured locale-aware data rather than hard-coded language columns.

## Certificates

Certificates should have a durable record containing the recipient, course, issuance date and verification identifier. Certificate generation and verification should remain auditable.
