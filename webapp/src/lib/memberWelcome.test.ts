import { describe, expect, it } from "vitest";
import { isNewAccount, showsWelcome, welcomeSteps, type WelcomeFacts } from "./memberWelcome";

const facts = (over: Partial<WelcomeFacts> = {}): WelcomeFacts => ({
  phone: "",
  addressLine: "",
  hasFavorites: false,
  hasOrders: false,
  studio: "not_started",
  signedUpForStudio: false,
  holdsCourse: false,
  ...over,
});

const ids = (f: WelcomeFacts) => welcomeSteps(f).map((s) => s.id);

describe("welcomeSteps", () => {
  it("lists the four steps, none done, for a bare new account", () => {
    const steps = welcomeSteps(facts());
    expect(steps.map((s) => s.id)).toEqual(["profile", "shop", "studio", "academy"]);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it("ticks the profile only with a phone and an address", () => {
    expect(welcomeSteps(facts({ phone: "+33 6 12" }))[0]?.done).toBe(false);
    expect(welcomeSteps(facts({ phone: "+33 6 12", addressLine: "18 rue des Lices" }))[0]?.done).toBe(true);
  });

  it("ticks the shop for a favourite or an order", () => {
    expect(welcomeSteps(facts({ hasFavorites: true }))[1]?.done).toBe(true);
    expect(welcomeSteps(facts({ hasOrders: true }))[1]?.done).toBe(true);
  });

  it("still offers the Studio after a purchase or a course", () => {
    expect(ids(facts({ hasOrders: true, holdsCourse: true }))).toContain("studio");
  });

  it("leaves the Studio out for a subscriber, staff and a pending subscription", () => {
    for (const studio of ["subscribed", "staff", "subscription_pending"] as const) {
      expect(ids(facts({ studio }))).not.toContain("studio");
    }
  });

  it("leaves the Studio out for an account created for it, and while its state is unknown", () => {
    expect(ids(facts({ signedUpForStudio: true }))).not.toContain("studio");
    expect(ids(facts({ studio: null }))).not.toContain("studio");
  });

  it("ticks the Studio once the trial was tried, even over", () => {
    const studio = (s: WelcomeFacts["studio"]) => welcomeSteps(facts({ studio: s })).find((x) => x.id === "studio")?.done;
    expect(studio("trial_active")).toBe(true);
    expect(studio("trial_expired")).toBe(true);
    expect(studio("subscription_ended")).toBe(true);
    expect(studio("not_started")).toBe(false);
  });

  it("ticks the Academy for a held course", () => {
    expect(welcomeSteps(facts({ holdsCourse: true })).at(-1)?.done).toBe(true);
  });
});

describe("isNewAccount", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  it("is true within 14 days and false after", () => {
    expect(isNewAccount("2026-11-01T12:00:00Z", now)).toBe(true);
    expect(isNewAccount("2026-10-28T12:00:00Z", now)).toBe(true);
    expect(isNewAccount("2026-10-28T11:59:00Z", now)).toBe(false);
  });
  it("is false without a readable date", () => {
    expect(isNewAccount(null, now)).toBe(false);
    expect(isNewAccount("nope", now)).toBe(false);
  });
});

describe("showsWelcome", () => {
  const open = welcomeSteps(facts());
  const finished = welcomeSteps(facts()).map((s) => ({ ...s, done: true }));
  it("shows for a new account with steps left", () => {
    expect(showsWelcome({ isNew: true, dismissed: false, steps: open })).toBe(true);
  });
  it("hides once closed, old, or finished", () => {
    expect(showsWelcome({ isNew: true, dismissed: true, steps: open })).toBe(false);
    expect(showsWelcome({ isNew: false, dismissed: false, steps: open })).toBe(false);
    expect(showsWelcome({ isNew: true, dismissed: false, steps: finished })).toBe(false);
  });
});
