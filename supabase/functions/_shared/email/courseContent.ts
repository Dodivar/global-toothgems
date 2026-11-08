/**
 * The block the course enrolment e-mail adds under its staff-editable body: the
 * request for immediate access with the waiver of the right of withdrawal, word
 * for word in the version the buyer ticked at the checkout. That restatement is
 * the confirmation on a durable medium L221-13 and L221-28 13° ask for, so it
 * comes from the code (`COURSE_CONSENT_TEXTS`), never from the template. An
 * enrolment without a recorded waiver (bought before it was asked) adds nothing.
 * Pure; labels are fr/en, anything else falls back to English.
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
    title: "Votre demande d’accès immédiat",
    acceptedOn: (date: string) => `Acceptée le ${date}, avant le paiement :`,
  },
  en: {
    title: "Your request for immediate access",
    acceptedOn: (date: string) => `Accepted on ${date}, before paying:`,
  },
} as const;

function dateOf(iso: string, locale: "fr" | "en"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long", timeZone: "Europe/Paris" }).format(date);
}

export function courseEnrolmentContent(waiver: CourseWaiver | null, locale: string): EmailContent | undefined {
  const lang = chromeLocale(locale);
  const accepted = waiver ? COURSE_CONSENT_TEXTS[waiver.version]?.[lang] : undefined;
  if (!waiver || !accepted) return undefined;
  const quoted = lang === "fr" ? `« ${accepted} »` : `“${accepted}”`;
  return { blocks: [notice({ tone: "info", title: LABELS[lang].title, body: `${LABELS[lang].acceptedOn(dateOf(waiver.acceptedAt, lang))} ${quoted}` })] };
}
