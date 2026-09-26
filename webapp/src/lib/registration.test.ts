import { describe, expect, it } from "vitest";
import { EMPTY_REGISTRATION, LEGAL_POLICY_VERSION, registrationMetadata, type RegistrationData } from "./registration";
import { authLinkErrorFromUrl, isSafeNext } from "./authRedirect";

const filled: RegistrationData = {
  ...EMPTY_REGISTRATION,
  email: "lea@example.com",
  password: "Gems-2026!",
  confirmPassword: "Gems-2026!",
  firstName: "  Léa ",
  lastName: "Martin",
  country: "be",
  phone: " +32 470 12 34 56 ",
  persona: "artist",
  interest: "training",
  terms: true,
  marketing: false,
};

describe("registrationMetadata", () => {
  it("uses the keys the sign-up trigger reads", () => {
    expect(registrationMetadata(filled, "fr-FR")).toEqual({
      first_name: "Léa",
      last_name: "Martin",
      phone: "+32 470 12 34 56",
      country: "BE",
      locale: "fr",
      persona: "artist",
      interest: "training",
      terms_accepted: true,
      marketing: false,
      policy_version: LEGAL_POLICY_VERSION,
    });
  });

  it("always sends the policy version, without which no consent is recorded", () => {
    expect(registrationMetadata(EMPTY_REGISTRATION, "en").policy_version).toBe(LEGAL_POLICY_VERSION);
  });

  it("leaves out optional answers that were not given", () => {
    const meta = registrationMetadata({ ...filled, phone: "  ", country: "", persona: null, interest: null }, "en");
    expect(meta).not.toHaveProperty("phone");
    expect(meta).not.toHaveProperty("country");
    expect(meta).not.toHaveProperty("persona");
    expect(meta).not.toHaveProperty("interest");
  });

  it("never carries the password", () => {
    expect(JSON.stringify(registrationMetadata(filled, "fr"))).not.toContain(filled.password);
  });
});

describe("isSafeNext", () => {
  it("accepts same-site paths only", () => {
    expect(isSafeNext("/panier")).toBe(true);
    expect(isSafeNext("/academy/formation/fondation")).toBe(true);
    expect(isSafeNext("https://evil.example")).toBe(false);
    expect(isSafeNext("//evil.example")).toBe(false);
    expect(isSafeNext("/\\evil.example")).toBe(false);
  });
});

describe("authLinkErrorFromUrl", () => {
  it("reads Supabase link errors from the fragment or the query string", () => {
    expect(authLinkErrorFromUrl({ hash: "#error=access_denied&error_code=otp_expired", search: "" })).toBe("expired");
    expect(authLinkErrorFromUrl({ hash: "", search: "?error=access_denied&error_code=bad_code_verifier" })).toBe("invalid");
    expect(authLinkErrorFromUrl({ hash: "#access_token=abc&type=signup", search: "?suite=/compte" })).toBeNull();
  });
});
