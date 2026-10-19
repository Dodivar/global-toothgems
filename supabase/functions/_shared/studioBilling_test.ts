import { assertEquals } from "jsr:@std/assert@1";
import fr from "../../../webapp/src/i18n/locales/studio.fr.json" with { type: "json" };
import en from "../../../webapp/src/i18n/locales/studio.en.json" with { type: "json" };
import { STUDIO_WITHDRAWAL_CONSENT } from "./studioBilling.ts";

// The box the member ticks and the sentence recorded, sent to Stripe and e-mailed
// must be the same words: a new wording is a new `version`.
Deno.test("the plans page shows the immediate-access request recorded under its version", () => {
  assertEquals(fr.access.checkout.consent.label, STUDIO_WITHDRAWAL_CONSENT.text.fr);
  assertEquals(en.access.checkout.consent.label, STUDIO_WITHDRAWAL_CONSENT.text.en);
});
