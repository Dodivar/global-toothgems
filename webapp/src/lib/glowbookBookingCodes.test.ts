import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import bookingFr from "../i18n/locales/booking.fr.json";
import bookingEn from "../i18n/locales/booking.en.json";
import { BOOKING_ERRORS } from "./glowbookBookingMapping";

/**
 * Every refusal the Glowbook bookings can answer reaches the member in words,
 * in both languages: the booking dialog's codes (`booking.error.*`, from the
 * Edge Function `glowbook-booking`) and the calendar actions' codes
 * (`booking.artist.codes.*`, from the glowbook_* functions). A code added on
 * the server without its sentence fails here instead of showing "unavailable".
 */

const root = join(__dirname, "..", "..", "..");
const migrations = join(root, "supabase", "migrations");
const handler = readFileSync(join(root, "supabase", "functions", "glowbook-booking", "handler.ts"), "utf8");

/** Every `glowbook_booking: <code>` the migrations raise ("sign in first" is a sentence, not a code). */
function databaseCodes(): Set<string> {
  const codes = new Set<string>();
  for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql"))) {
    for (const match of readFileSync(join(migrations, file), "utf8").matchAll(/'glowbook_booking: ([a-z_]+)/g)) codes.add(match[1]);
  }
  codes.delete("sign");
  return codes;
}

/** The refusals the Edge Function passes on (BOOKING_REFUSALS) and its own codes. */
function functionCodes(): string[] {
  const list = /BOOKING_REFUSALS = \[([^\]]+)\]/.exec(handler)?.[1] ?? "";
  const refusals = [...list.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const own = [...handler.matchAll(/error: "([a-z_]+)"/g)].map((m) => m[1]);
  return [...new Set([...refusals, ...own])].filter((c) => c !== "server_error");
}

const locales = { fr: bookingFr, en: bookingEn } as const;

describe("Glowbook booking refusals", () => {
  it("reads the server's code lists (guards the parsing above)", () => {
    expect(databaseCodes().size).toBeGreaterThan(10);
    expect(functionCodes()).toContain("slot_taken");
  });

  it("names every code of the booking function in the dialog's list", () => {
    for (const code of functionCodes()) expect(BOOKING_ERRORS, code).toContain(code);
  });

  it("explains every dialog code in French and English", () => {
    for (const [locale, messages] of Object.entries(locales)) {
      for (const code of BOOKING_ERRORS) expect((messages.error as Record<string, string>)[code], `${locale}: error.${code}`).toBeTruthy();
    }
  });

  it("explains every database refusal, in the dialog or on the calendar, in both languages", () => {
    for (const [locale, messages] of Object.entries(locales)) {
      const artist = messages.artist.codes as Record<string, string>;
      const dialog = messages.error as Record<string, string>;
      for (const code of databaseCodes()) expect(artist[code] ?? dialog[code], `${locale}: ${code}`).toBeTruthy();
    }
  });
});
