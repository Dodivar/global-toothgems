import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { zoneOf, type AppZone } from "./appZones";

describe("zoneOf", () => {
  it("gives each private area its zone and everything else to the public one", () => {
    const cases: [string, AppZone][] = [
      ["/compte", "account"],
      ["/compte/communaute/membres", "account"],
      ["/academy/lecon", "learn"],
      ["/academy/mes-formations/fondation", "learn"],
      ["/academy/mes-formations/fondation/lecon/s1", "learn"],
      ["/admin", "admin"],
      ["/admin/connexion", "admin"],
      ["/admin/produits/abc", "admin"],
      ["/studio-3d/atelier", "studio"],
      ["/studio-3d/atelier/mes-groupes", "studio"],
      ["/studio-3d/partage/abc", "studio"],
      ["/", "public"],
      ["/boutique", "public"],
      ["/connexion", "public"],
      ["/academy", "public"],
      ["/academy/formation/fondation", "public"],
      ["/academy/mes-formations", "public"],
      ["/studio-3d", "public"],
      ["/studio-3d/editor/groups", "public"],
      ["/comptes", "public"],
      ["/administration", "public"],
    ];
    for (const [path, zone] of cases) expect(zoneOf(path), path).toBe(zone);
  });

  it("matches the routes each zone app declares", () => {
    const apps: [string, AppZone][] = [
      ["../App.tsx", "public"],
      ["../zones/AccountApp.tsx", "account"],
      ["../zones/AdminApp.tsx", "admin"],
    ];
    for (const [file, zone] of apps) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      const paths = [...source.matchAll(/path="(\/[^"]*)"/g)].map((m) => m[1].replace(/\/\*$/, "").replace(/:[A-Za-z]+/g, "x"));
      expect(paths.length, file).toBeGreaterThan(0);
      for (const path of paths) expect(zoneOf(path), `${file}: ${path}`).toBe(zone);
    }
  });

  it("has a segment in app/ for each private zone, so a zone's address never reloads into the wrong one", () => {
    const segments = [
      "compte/[[...slug]]",
      "academy/(learner)/lecon",
      "academy/(learner)/mes-formations/[courseId]",
      "academy/(learner)/mes-formations/[courseId]/lecon/[nodeKey]",
      "academy/(learner)/mes-formations/[courseId]/terminee",
      "admin/connexion",
      "admin/(staff)/[[...slug]]",
      "studio-3d/atelier/[[...section]]",
      "studio-3d/partage",
      "studio-3d/partage/[token]",
    ];
    for (const segment of segments) expect(existsSync(new URL(`../../app/${segment}/page.tsx`, import.meta.url)), segment).toBe(true);
  });
});
