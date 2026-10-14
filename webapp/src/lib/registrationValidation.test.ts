import { describe, expect, it } from "vitest";
import {
  EMPTY_REGISTRATION,
  maskEmail,
  passwordStrength,
  resolveContext,
  suggestEmail,
  validateField,
  validateStep,
  type RegistrationData,
} from "./registration";

/* Guidance only: Supabase Auth and the handle_new_auth_user trigger re-check everything server-side. */

const valid: RegistrationData = {
  ...EMPTY_REGISTRATION,
  email: "camille@example.com",
  password: "Gems-2026!",
  confirmPassword: "Gems-2026!",
  firstName: "Camille",
  lastName: "Roussel",
  country: "FR",
  terms: true,
};

describe("validateField", () => {
  it("accepts a complete registration on every step", () => {
    for (const step of ["account", "profile", "preferences"] as const) expect(validateStep(step, valid, false)).toEqual({});
  });

  it.each([
    ["email", { email: "" }, "register.errors.emailRequired"],
    ["email", { email: "camille@" }, "register.errors.emailInvalid"],
    ["email", { email: "camille @example.com" }, "register.errors.emailInvalid"],
    ["email", { email: "camille@example.c" }, "register.errors.emailInvalid"],
    ["password", { password: "" }, "register.errors.passwordRequired"],
    ["password", { password: "Password123" }, "register.errors.passwordCommon"],
    ["password", { password: "Ab1!xyz" }, "register.errors.passwordWeak"], // 7 characters
    ["password", { password: "abcdefg1!" }, "register.errors.passwordWeak"], // no capital
    ["password", { password: "Abcdefgh1" }, "register.errors.passwordWeak"], // no special character
    ["confirmPassword", { confirmPassword: "" }, "register.errors.confirmRequired"],
    ["confirmPassword", { confirmPassword: "Gems-2026?" }, "register.errors.confirmMismatch"],
    ["firstName", { firstName: "  " }, "register.errors.firstNameRequired"],
    ["country", { country: "" }, "register.errors.countryRequired"],
    ["country", { country: "XX" }, "register.errors.countryInvalid"],
    ["phone", { phone: "06 12 ab" }, "register.errors.phoneCharacters"],
    ["phone", { phone: "12345" }, "register.errors.phoneLength"],
    ["phone", { phone: "+1234567890123456" }, "register.errors.phoneLength"],
    ["terms", { terms: false }, "register.errors.termsRequired"],
  ] as const)("%s: %j → %s", (field, patch, error) => {
    expect(validateField(field, { ...valid, ...patch })).toBe(error);
  });

  it("accepts an empty phone and a formatted one", () => {
    expect(validateField("phone", { ...valid, phone: "" })).toBeNull();
    expect(validateField("phone", { ...valid, phone: "+33 (0)6.12-34-56-78" })).toBeNull();
  });

  it("asks no password when Google already authenticated the address", () => {
    expect(validateStep("account", { ...valid, password: "", confirmPassword: "" }, true)).toEqual({});
  });
});

describe("passwordStrength", () => {
  it.each([
    ["", 0],
    ["password", 1],
    ["abc", 1],
    ["abcdefg1", 2],
    ["Gems-2026!", 3],
    ["Gems-2026!-long", 4],
  ] as const)("%j → %i", (value, strength) => {
    expect(passwordStrength(value)).toBe(strength);
  });
});

describe("helpers", () => {
  it("suggests the usual mailbox typo fixes only", () => {
    expect(suggestEmail("Lea@GMIAL.com")).toBe("lea@gmail.com");
    expect(suggestEmail("lea@example.com")).toBeNull();
    expect(suggestEmail("no-at-sign")).toBeNull();
  });

  it("masks the local part of an address", () => {
    expect(maskEmail("camille.roussel@studio.fr")).toBe("c••••••••l@studio.fr");
    expect(maskEmail("ab@x.fr")).toBe("a•@x.fr");
    expect(maskEmail("not-an-address")).toBe("not-an-address");
  });

  it("reads the context from the address before history state", () => {
    expect(resolveContext(new URLSearchParams("contexte=achat&produit=p1&qte=2"), null)).toEqual({ kind: "purchase", productId: "p1", qty: 2 });
    expect(resolveContext(new URLSearchParams("contexte=achat&qte=-3"), null)).toEqual({ kind: "purchase", productId: undefined, qty: undefined });
    expect(resolveContext(new URLSearchParams(""), { course: "c1" })).toEqual({ kind: "training", courseId: "c1" });
    expect(resolveContext(new URLSearchParams(""), { from: "/panier" })).toEqual({ kind: "purchase" });
    expect(resolveContext(new URLSearchParams("contexte=nope"), null)).toEqual({ kind: "general" });
  });
});
