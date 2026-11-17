/**
 * The block the course enrolment e-mail adds under its staff-editable body: the
 * request for immediate access with the waiver of the right of withdrawal, word
 * for word in the version the buyer ticked at the checkout. That restatement is
 * the confirmation on a durable medium L221-13 and L221-28 13° ask for, so it
 * comes from the code (`COURSE_CONSENT_TEXTS`), never from the template. An
 * enrolment without a recorded waiver (bought before it was asked) adds nothing.
 * Pure; labels are fr/en, anything else falls back to English.
 *
 * It also opens the course: a "Start my course" button to the learner page
 * (`/academy/mes-formations/<slug>`, decision 154 addendum) — the e-mail used to
 * say "start whenever you like" with no way there. A signed-out reader is sent
 * to sign in and comes back to the course.
 */
import { COURSE_CONSENT_TEXTS } from "../courseConsent.ts";
import { notice } from "./components.ts";
import { chromeLocale } from "./layout.ts";
import type { EmailContent } from "./render.ts";

export interface CourseWaiver {
  /** `consent_records.policy_version` of the waiver the buyer ticked. */
  version: string;
  acceptedAt: string;
}

const LABELS = {
  fr: {
    open: "Commencer ma formation",
    title: "Votre demande d’accès immédiat",
    acceptedOn: (date: string) => `Acceptée le ${date}, avant le paiement :`,
  },
  en: {
    open: "Start my course",
    title: "Your request for immediate access",
    acceptedOn: (date: string) => `Accepted on ${date}, before paying:`,
  },
} as const;

function dateOf(iso: string, locale: "fr" | "en"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long", timeZone: "Europe/Paris" }).format(date);
}

/** The learner page of a course: its address is the course's French slug, unprefixed (a private zone). */
export function learnerCourseUrl(siteUrl: string, slug: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/academy/mes-formations/${encodeURIComponent(slug)}`;
}

export function courseEnrolmentContent(
  waiver: CourseWaiver | null,
  locale: string,
  course?: { siteUrl: string; slug: string | null },
): EmailContent {
  const lang = chromeLocale(locale);
  const content: EmailContent = {};
  if (course?.slug) content.primaryAction = { label: LABELS[lang].open, url: learnerCourseUrl(course.siteUrl, course.slug) };
  const accepted = waiver ? COURSE_CONSENT_TEXTS[waiver.version]?.[lang] : undefined;
  if (waiver && accepted) {
    const quoted = lang === "fr" ? `« ${accepted} »` : `“${accepted}”`;
    content.blocks = [notice({ tone: "info", title: LABELS[lang].title, body: `${LABELS[lang].acceptedOn(dateOf(waiver.acceptedAt, lang))} ${quoted}` })];
  }
  return content;
}
