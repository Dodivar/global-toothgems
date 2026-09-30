import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGAL_ALIASES, LEGAL_PATHS } from "../data/legal/routes";
import { STUDIO_PATH, STUDIO_SUBSCRIBE_PATH } from "./studioUrl";
import {
  PUBLIC_ROUTES,
  alternates,
  legacyAddress,
  localizedPath,
  negotiateLocale,
  parsePath,
  publicRoute,
  toAddress,
} from "./localeRoutes";

describe("parsePath / toAddress", () => {
  it("maps English addresses to the app's French paths and back", () => {
    expect(parsePath("/en/shop/aurora-heart")).toMatchObject({ locale: "en", internal: "/boutique/aurora-heart", params: { id: "aurora-heart" } });
    expect(parsePath("/fr/boutique/aurora-heart").internal).toBe("/boutique/aurora-heart");
    expect(parsePath("/en").internal).toBe("/");
    expect(toAddress("/boutique/aurora-heart", "en")).toBe("/en/shop/aurora-heart");
    expect(toAddress("/boutique/aurora-heart", "fr")).toBe("/fr/boutique/aurora-heart");
    expect(toAddress("/", "en")).toBe("/en");
    expect(toAddress("/academy/formation/fondation", "en")).toBe("/en/academy/course/fondation");
  });

  it("leaves the member space, the back office and the workspaces unprefixed", () => {
    for (const path of ["/compte", "/compte/commandes", "/admin/produits", "/connexion", "/academy/mes-formations/x", "/studio-3d/atelier", "/studio-3d/partage/abc"]) {
      expect(toAddress(path, "en"), path).toBe(path);
      expect(parsePath(path)).toMatchObject({ locale: null, internal: path });
    }
  });

  it("keeps an unknown prefixed address unknown, in the requested language", () => {
    expect(parsePath("/fr/compte")).toMatchObject({ locale: "fr", route: null, internal: "/fr/compte" });
    expect(toAddress("/fr/nimporte-quoi", "en")).toBe("/en/nimporte-quoi");
    expect(parsePath("/en/boutique").route).toBeNull(); // French segments under /en are not an alias
  });

  it("gives both languages of a page", () => {
    expect(alternates(parsePath("/fr/aide/faq"))).toEqual({ fr: "/fr/aide/faq", en: "/en/help/faq" });
    expect(alternates(parsePath("/compte"))).toBeNull();
  });
});

describe("legacyAddress", () => {
  it("moves old French addresses under /fr and English aliases under /en", () => {
    expect(legacyAddress("/boutique")).toBe("/fr/boutique");
    expect(legacyAddress("/boutique/aurora-heart")).toBe("/fr/boutique/aurora-heart");
    expect(legacyAddress("/aide/faq")).toBe("/fr/aide/faq");
    expect(legacyAddress("/accueil-b")).toBe("/fr");
    expect(legacyAddress("/help")).toBe("/en/help");
    expect(legacyAddress("/gift-card")).toBe("/en/gift-card");
    expect(legacyAddress("/studio-3d/subscribe")).toBe("/en/3d-studio/subscribe");
  });

  it("leaves the home page, prefixed addresses and app screens alone", () => {
    for (const path of ["/", "/fr/boutique", "/en", "/compte", "/connexion", "/admin", "/studio-3d/partage"]) {
      expect(legacyAddress(path), path).toBeNull();
    }
  });

  it("moves the Studio workspace's English aliases, section and token kept", () => {
    expect(legacyAddress("/studio-3d/editor")).toBe("/studio-3d/atelier");
    expect(legacyAddress("/studio-3d/editor/groups")).toBe("/studio-3d/atelier/mes-groupes");
    expect(legacyAddress("/studio-3d/editor/inconnu")).toBe("/studio-3d/atelier");
    expect(legacyAddress("/studio-3d/share")).toBe("/studio-3d/partage");
    expect(legacyAddress("/studio-3d/share/abc")).toBe("/studio-3d/partage/abc");
    expect(legacyAddress("/studio-3d/share/abc/def")).toBeNull();
    expect(legacyAddress("/studio-3d/editeur")).toBeNull();
  });

  it("covers every English alias the app used to accept", () => {
    for (const alias of Object.keys(LEGAL_ALIASES)) expect(legacyAddress(alias), alias).toMatch(/^\/en\//);
  });
});

describe("negotiateLocale", () => {
  it("prefers the saved choice, then the browser, then English", () => {
    expect(negotiateLocale("fr", "en-US,en;q=0.9")).toBe("fr");
    expect(negotiateLocale(null, "fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(negotiateLocale(null, "de-DE,de;q=0.9,fr;q=0.5")).toBe("fr");
    expect(negotiateLocale(null, "en;q=0.4,fr;q=0.8")).toBe("fr");
    expect(negotiateLocale(null, "de-DE,es;q=0.9")).toBe("en");
    expect(negotiateLocale("de", null)).toBe("en");
    expect(negotiateLocale(undefined, "fr;q=0")).toBe("en");
  });
});

describe("route table", () => {
  it("agrees with the path constants the app uses", () => {
    expect(publicRoute("help").fr).toBe(LEGAL_PATHS.help);
    expect(publicRoute("faq").fr).toBe(LEGAL_PATHS.faq);
    expect(publicRoute("shipping").fr).toBe(LEGAL_PATHS.shipping);
    expect(publicRoute("returns").fr).toBe(LEGAL_PATHS.returns);
    expect(publicRoute("contact").fr).toBe(LEGAL_PATHS.contact);
    expect(publicRoute("legalNotice").fr).toBe(LEGAL_PATHS.legalNotice);
    expect(publicRoute("terms").fr).toBe(LEGAL_PATHS.terms);
    expect(publicRoute("privacy").fr).toBe(LEGAL_PATHS.privacy);
    expect(publicRoute("cookies").fr).toBe(LEGAL_PATHS.cookies);
    expect(publicRoute("about").fr).toBe(LEGAL_PATHS.about);
    expect(publicRoute("studio").fr).toBe(STUDIO_PATH);
    expect(publicRoute("studioSubscribe").fr).toBe(STUDIO_SUBSCRIBE_PATH);
  });

  it("never gives two pages the same address", () => {
    for (const locale of ["fr", "en"] as const) {
      const paths = PUBLIC_ROUTES.map((route) => route[locale]);
      expect(new Set(paths).size, locale).toBe(paths.length);
    }
  });

  it("has a page in app/ for every public route, in both languages, and for the unprefixed public pages", () => {
    for (const route of PUBLIC_ROUTES) {
      for (const locale of ["fr", "en"] as const) {
        const segments = route[locale].replace(/:\w+/g, (m) => (route.id === "product" ? "[slug]" : `[${m.slice(1)}]`));
        const file = `../../app/(public)/${locale}${segments === "/" ? "" : segments}/page.tsx`;
        expect(existsSync(new URL(file, import.meta.url)), `${route.id} ${locale}`).toBe(true);
      }
    }
    for (const path of ["/connexion", "/inscription", "/mot-de-passe-oublie", "/forgot-password", "/reinitialiser-mot-de-passe", "/reset-password", "/verifier-email", "/verify-email", "/confirmation-compte", "/erreur", "/maintenance"]) {
      expect(existsSync(new URL(`../../app/(public)${path}/page.tsx`, import.meta.url)), path).toBe(true);
    }
  });

  it("builds addresses with their parameters", () => {
    expect(localizedPath("product", "en", { id: "opale" })).toBe("/en/shop/opale");
    expect(localizedPath("home", "fr")).toBe("/fr");
  });
});
