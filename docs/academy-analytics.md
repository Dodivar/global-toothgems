# Academy and account analytics (PostHog)

The Academy's learning funnel (`webapp/src/lib/academyAnalytics.ts`) and the sign-in / sign-up outcomes (`webapp/src/lib/authAnalytics.ts`), since 2026-11-12. Same rules as the shop (`docs/shop-analytics.md`), shared in `webapp/src/lib/analyticsCore.ts`: **consent only**, nothing personal (no e-mail, no name, never a learner's answers), never in the way. Every event also carries `app_environment` and `is_staff`.

The course **purchase** is the shop's funnel: `academy_course_added_to_cart` here, then `checkout_started` … `order_completed` with `contains_course = true`.

## Academy

Progress events are sent from the learner store (`lib/progress.tsx`) **after the server answered**: a step counts once `complete_step` recorded it, a quiz once the database graded it. `course_id` is the course key the URLs use (the same on the sales page and in the learner pages).

| Event | When | Properties |
| --- | --- | --- |
| `academy_course_added_to_cart` | "Buy" on a course's sales page | `course_id`, `price_minor`, `currency` |
| `academy_course_started` | The learner opens a lesson of a course where nothing is done yet (once per course and tab) | `course_id` |
| `academy_lesson_opened` | A lesson or quiz page opens (once per lesson and tab) | `course_id`, `course_pct`, `step_kind` (`step` or `quiz`), `module_index`, `index_in_module`, `path_index`, `path_length` |
| `academy_step_completed` | The server recorded a step as done | same + `done_count`, `total` |
| `academy_quiz_submitted` | The server graded a quiz | same + `score`, `passed`, `correct`, `total`, `passing_score` |
| `academy_course_completed` | The course became completed after a step or a quiz (once per course and tab) | `course_id`, `certificate` (a certificate code was issued), `quiz_average` |
| `academy_certificate_downloaded` | The certificate was saved as a file | `format` (`pdf` / `png`) |
| `academy_certificate_shared` | The share sheet sent the certificate image (closing the sheet is not counted) | `outcome` (`shared` / `failed`) |

## Accounts

`outcome` is the code the screens already use; no e-mail is ever sent.

| Event | When | Properties |
| --- | --- | --- |
| `auth_sign_in` | Password sign-in answered, or a session came back from Google / Apple | `method` (`email`, `google`, `apple`), `outcome` (`accepted`, `rejected`, `unconfirmed`, `captcha`, `rateLimited`, `suspended`, `unavailable`) |
| `auth_oauth_started` | The browser leaves for Google or Apple | `method`, `outcome` (`redirecting` / `unavailable`) |
| `auth_sign_up` | The sign-up form answered | `method` = `email`, `outcome` (`confirmationSent`, `signedIn`, `emailTaken`, `weakPassword`, `captcha`, `rateLimited`, `emailSend`, `network`, `server`), `origin` |
| `auth_confirmation_resent` | "Resend the e-mail" | `outcome` (`sent`, `rateLimited`, `failed`) |
| `auth_password_reset_requested` | The reset e-mail was asked for | `outcome` (`sent`, `rateLimited`, `failed`) |

## Reading it in PostHog

- **Learning funnel**: `academy_course_started` → `academy_step_completed` → `academy_quiz_submitted` (`passed = true`) → `academy_course_completed`, broken down by `course_id`.
- **Where learners stop**: Trends on `academy_lesson_opened`, breakdown `path_index`, filtered on one `course_id`; the step after which the curve falls is the one to rework. Quizzes failed often: `academy_quiz_submitted` where `passed = false`, breakdown `module_index`.
- **Sign-in health**: Trends on `auth_sign_in` broken down by `outcome`. A rise of `captcha` means Turnstile is refusing real people; `unavailable` means Supabase Auth or the network.
- **Sign-up**: Funnel `auth_sign_up` (`outcome = confirmationSent`) → `auth_sign_in` (`accepted`) to see how many confirm their e-mail; `emailSend` above zero means the confirmation e-mail is not leaving.
- **Alerts** worth setting: `auth_sign_in` with `outcome = captcha` above a few per hour; `auth_sign_up` with `outcome = emailSend` above zero.
