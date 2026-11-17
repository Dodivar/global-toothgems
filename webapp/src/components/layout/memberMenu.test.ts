import { describe, expect, it } from "vitest";
import { accountMenuGroups, MEMBER_MENU_GROUPS } from "./memberMenu";

const paths = (groups: ReturnType<typeof accountMenuGroups>) => groups.flatMap((group) => group.items.map((item) => item.to));

describe("member menu", () => {
  it("gathers the artist's tools in the Atelier group", () => {
    const atelier = MEMBER_MENU_GROUPS.find((group) => group.id === "studio");
    expect(atelier?.items.map((item) => item.to)).toEqual(["/studio-3d/atelier", "/compte/glowbook", "/compte/agenda", "/compte/studio"]);
  });
});

describe("the header's My space menu", () => {
  it("leaves out the ways out to the storefront and keeps the dashboard", () => {
    const all = paths(accountMenuGroups({ glowbook: true, bookings: true, lounge: true }));
    expect(all[0]).toBe("/compte");
    expect(all).not.toContain("/");
    expect(all).not.toContain("/boutique");
    expect(all).not.toContain("/academy");
  });

  it("puts the favourites right after the orders", () => {
    const all = paths(accountMenuGroups({ glowbook: true, bookings: true, lounge: true }));
    expect(all.indexOf("/boutique?favoris=1")).toBe(all.indexOf("/compte/commandes") + 1);
  });

  it("lists only what the member can open, unknown rights included", () => {
    const essential = paths(accountMenuGroups({ glowbook: false, bookings: false, lounge: false }));
    expect(essential).not.toContain("/compte/glowbook");
    expect(essential).not.toContain("/compte/agenda");
    expect(essential).not.toContain("/compte/salons");
    expect(essential).toContain("/studio-3d/atelier");
    expect(essential).toContain("/compte/studio");

    const unknown = paths(accountMenuGroups({ glowbook: null, bookings: null, lounge: false }));
    expect(unknown).not.toContain("/compte/glowbook");

    const artist = paths(accountMenuGroups({ glowbook: true, bookings: false, lounge: true }));
    expect(artist).toContain("/compte/glowbook");
    expect(artist).not.toContain("/compte/agenda");
    expect(artist).toContain("/compte/salons");
  });

  it("shows the calendar or the appointments, never both", () => {
    const atelier = paths(accountMenuGroups({ glowbook: true, bookings: true, lounge: true }));
    expect(atelier).toContain("/compte/agenda");
    expect(atelier).not.toContain("/compte/rendez-vous");
    const artist = paths(accountMenuGroups({ glowbook: true, bookings: false, lounge: true }));
    expect(artist).toContain("/compte/rendez-vous");
  });

  it("never draws an empty group", () => {
    for (const group of accountMenuGroups({ glowbook: false, bookings: false, lounge: false })) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});
