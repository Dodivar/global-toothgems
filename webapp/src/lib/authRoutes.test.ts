import { describe, expect, it } from "vitest";
import {
  authConfirmUrl,
  confirmNext,
  gateFor,
  isSafeNext,
  parseConfirmType,
  returnPathFrom,
  signInRedirect,
  withLinkError,
} from "./authRoutes";

describe("gateFor", () => {
  it("gates the member space and the learner pages behind an account", () => {
    for (const path of ["/compte", "/compte/commandes", "/compte/salons/en/discussion", "/academy/lecon", "/academy/mes-formations/fondation", "/academy/mes-formations/fondation/lecon/m1"]) {
      expect(gateFor(path), path).toBe("account");
    }
  });

  it("gates the back office behind staff, except its sign-in screen", () => {
    expect(gateFor("/admin")).toBe("staff");
    expect(gateFor("/admin/produits/42")).toBe("staff");
    expect(gateFor("/admin/connexion")).toBeNull();
  });

  it("leaves every other page open", () => {
    for (const path of ["/", "/boutique", "/connexion", "/academy", "/academy/formation/fondation", "/studio-3d/atelier", "/comptes", "/administration", "/auth/confirm"]) {
      expect(gateFor(path), path).toBeNull();
    }
  });
});

describe("signInRedirect / returnPathFrom", () => {
  it("sends members and staff to their own sign-in page with the path they asked for", () => {
    expect(signInRedirect("account", "/compte/commandes", "?page=2")).toBe("/connexion?suite=%2Fcompte%2Fcommandes%3Fpage%3D2");
    expect(signInRedirect("staff", "/admin", "")).toBe("/admin/connexion?suite=%2Fadmin");
  });

  it("reads the return path back, only when it stays on the site", () => {
    expect(returnPathFrom("?suite=%2Fcompte%2Fcommandes%3Fpage%3D2")).toBe("/compte/commandes?page=2");
    expect(returnPathFrom("?suite=https%3A%2F%2Fevil.example")).toBeUndefined();
    expect(returnPathFrom("")).toBeUndefined();
  });
});

describe("isSafeNext", () => {
  it("refuses paths a browser would read as another origin", () => {
    expect(isSafeNext("/compte")).toBe(true);
    expect(isSafeNext("//evil.example")).toBe(false);
    expect(isSafeNext("/\\evil.example")).toBe(false);
    expect(isSafeNext("/\t/evil.example")).toBe(false);
    expect(isSafeNext("/a\\b")).toBe(false);
    expect(isSafeNext("evil")).toBe(false);
  });
});

describe("e-mail links", () => {
  it("accepts only the link kinds the app sends", () => {
    expect(parseConfirmType("signup")).toBe("signup");
    expect(parseConfirmType("email_change")).toBe("email_change");
    // Team invitations (Edge Function invite-staff-member).
    expect(parseConfirmType("invite")).toBe("invite");
    expect(parseConfirmType("magiclink")).toBeNull();
    expect(parseConfirmType("toString")).toBeNull();
    expect(parseConfirmType(null)).toBeNull();
  });

  it("lands on the safe next page, else on the page for the kind of link", () => {
    expect(confirmNext("/confirmation-compte?suite=/panier", "signup")).toBe("/confirmation-compte?suite=/panier");
    expect(confirmNext("https://evil.example", "recovery")).toBe("/reinitialiser-mot-de-passe");
    expect(confirmNext(null, "email_change")).toBe("/verifier-email?type=changement");
    expect(confirmNext(null, "invite")).toBe("/reinitialiser-mot-de-passe");
    expect(confirmNext(null, null)).toBe("/confirmation-compte");
  });

  it("builds the redirect given to Supabase and the error landing", () => {
    expect(authConfirmUrl("/reinitialiser-mot-de-passe", "https://globaltoothgems.com")).toBe(
      "https://globaltoothgems.com/auth/confirm?next=%2Freinitialiser-mot-de-passe",
    );
    expect(withLinkError("/verifier-email?type=changement", "otp_expired")).toBe(
      "/verifier-email?type=changement&error=access_denied&error_code=otp_expired",
    );
    expect(withLinkError("/confirmation-compte", undefined)).toBe("/confirmation-compte?error=access_denied&error_code=invalid_link");
  });
});
