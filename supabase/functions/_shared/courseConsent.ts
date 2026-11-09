/**
 * The waiver an Academy buyer gives at the shop's checkout (Code de la
 * consommation L221-28 13°): a course is digital content supplied at once, so
 * the right of withdrawal ends when the buyer starts following it, provided
 * they asked for immediate access and expressly waived the right beforehand.
 * Until a lesson is opened the 14 days still run (terms of sale, "Courses").
 *
 * `create-checkout-session` refuses a basket holding a course without the
 * ticked box and records it in `consent_records` (purpose below) before the
 * order is created; the enrolment e-mail repeats the sentence accepted. The
 * cart shows the same sentence (`checkout.course.consentLabel`, checked by
 * `courseConsent_test.ts`). A new wording takes a new `version`, and the old
 * one stays in `COURSE_CONSENT_TEXTS` so earlier e-mails can still quote it.
 */
export const COURSE_WITHDRAWAL_CONSENT = {
  version: "course-withdrawal-2026-11",
  text: {
    fr: "Je demande l’accès immédiat à la formation et je renonce expressément à mon droit de rétractation : je reconnais le perdre dès que je commence à suivre la formation.",
    en: "I ask for immediate access to the course and I expressly waive my right of withdrawal: I acknowledge that I lose it as soon as I start following the course.",
  },
} as const;

export const COURSE_CONSENT_PURPOSE = "course_immediate_access";

/** Every wording ever accepted, by `consent_records.policy_version`. */
export const COURSE_CONSENT_TEXTS: Record<string, { fr: string; en: string }> = {
  [COURSE_WITHDRAWAL_CONSENT.version]: COURSE_WITHDRAWAL_CONSENT.text,
};
