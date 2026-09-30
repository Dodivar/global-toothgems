import type { Localized } from "./types";
import { photo } from "../lib/images";

export interface MenuItem {
  title: Localized;
  sub: Localized;
  thumb: string;
  to: string;
}

const img = photo;

/**
 * Menu photo of each family (and of a category with no family), by slug.
 * The fallback when the back office has not set an image on the family; a
 * slug missing here shows the brand's generic shot.
 */
export const TAXONOMY_THUMBS: Record<string, string> = {
  swarovski: img("img-05.jpg"),
  preciosa: img("img-15.jpg"),
  "bijoux-or-18ct": img("img-04.jpg"),
  opales: img("img-14.jpg"),
  "micro-gems": img("img-07.jpg"),
  essentiels: img("img-01.jpg"),
  accessoires: img("img-08.jpg"),
  "kit-professionnel": img("img-11.jpg"),
  "kit-diy": img("img-13.jpg"),
  "lip-gloss": img("mouth-05.jpg"),
};

export const DEFAULT_MENU_THUMB = img("mouth-01.jpg");

/* The shop's entries are the taxonomy itself (`ShopMenu`). The Academy
   entries point at the trainings' public pages, not at the lesson player: the
   menu is navigation, and it must not drop a signed-out visitor onto a login
   wall. */
export const ACADEMY_MENU: MenuItem[] = [
  {
    title: { fr: "Fondation Tooth Gem", en: "Tooth Gem Foundation" },
    sub: { fr: "9 leçons · 1 h 30", en: "9 lessons · 1h30" },
    thumb: img("img-12.jpg"),
    to: "/academy/formation/fondation",
  },
  {
    title: { fr: "Placement avancé", en: "Advanced placement" },
    sub: { fr: "9 leçons · 1 h 30", en: "9 lessons · 1h30" },
    thumb: img("mouth-02.jpg"),
    to: "/academy/formation/avance",
  },
  {
    title: { fr: "Business studio", en: "Business studio" },
    sub: { fr: "9 leçons · 1 h 30", en: "9 lessons · 1h30" },
    thumb: img("mouth-03.jpg"),
    to: "/academy/formation/business",
  },
  {
    title: { fr: "Mon espace membre", en: "My member area" },
    sub: { fr: "Progression, attestations, commandes", en: "Progress, certificates, orders" },
    thumb: img("mouth-04.jpg"),
    to: "/compte",
  },
];
