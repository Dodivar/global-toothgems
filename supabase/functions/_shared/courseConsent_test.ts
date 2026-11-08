import { assertEquals } from "jsr:@std/assert@1";
import fr from "../../../webapp/src/i18n/locales/fr.json" with { type: "json" };
import en from "../../../webapp/src/i18n/locales/en.json" with { type: "json" };
import { COURSE_CONSENT_TEXTS, COURSE_WITHDRAWAL_CONSENT } from "./courseConsent.ts";

Deno.test("the cart shows exactly the course waiver the function records", () => {
  assertEquals(fr.checkout.course.consentLabel, COURSE_WITHDRAWAL_CONSENT.text.fr);
  assertEquals(en.checkout.course.consentLabel, COURSE_WITHDRAWAL_CONSENT.text.en);
  assertEquals(COURSE_CONSENT_TEXTS[COURSE_WITHDRAWAL_CONSENT.version], COURSE_WITHDRAWAL_CONSENT.text);
});
