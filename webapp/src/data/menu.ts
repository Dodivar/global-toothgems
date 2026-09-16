import type { Localized } from "./types";

export interface MenuItem {
  title: Localized;
  sub: Localized;
  thumb: string;
  to: string;
}

const img = (name: string) => new URL(`../assets/photos/${name}`, import.meta.url).href;

export const MENU: Record<"gems" | "shop" | "academy", MenuItem[]> = {
  gems: [
    {
      title: { fr: "Gems dentaires Swarovski®", en: "Swarovski® dental gems" },
      sub: { fr: "SS3 · SS5 · SS7", en: "SS3 · SS5 · SS7" },
      thumb: img("img-05.jpg"),
      to: "/boutique/aquamarine",
    },
    {
      title: { fr: "Gems dentaires Preciosa®", en: "Preciosa® dental gems" },
      sub: { fr: "SS3 · SS6", en: "SS3 · SS6" },
      thumb: img("img-15.jpg"),
      to: "/boutique/capri",
    },
    {
      title: { fr: "Sparklets™", en: "Sparklets™" },
      sub: { fr: "SS0 · SS1", en: "SS0 · SS1" },
      thumb: img("img-07.jpg"),
      to: "/boutique/solitaire",
    },
    {
      title: { fr: "Gems zircone cubique", en: "Cubic zirconia gems" },
      sub: { fr: "Minis", en: "Minis" },
      thumb: img("img-20.jpg"),
      to: "/boutique/opale",
    },
    {
      title: { fr: "Bijoux dentaires or 14k et 18k", en: "14k & 18k gold dental jewelry" },
      sub: { fr: "Cœurs, étoiles, gouttes", en: "Hearts, stars, drops" },
      thumb: img("img-04.jpg"),
      to: "/boutique/aurora-heart",
    },
    {
      title: { fr: "Or 18k — collection Minis", en: "18k gold — Minis collection" },
      sub: { fr: "Nouveau drop", en: "New drop" },
      thumb: img("img-13.jpg"),
      to: "/boutique/sunflower",
    },
  ],
  shop: [
    {
      title: { fr: "Kits professionnels", en: "Professional kits" },
      sub: { fr: "Outils + 20 gems", en: "Tools + 20 gems" },
      thumb: img("img-11.jpg"),
      to: "/boutique?categorie=Kits",
    },
    {
      title: { fr: "Outils et lampes", en: "Tools and lamps" },
      sub: { fr: "Lampe LED 1200", en: "1200 LED lamp" },
      thumb: img("img-01.jpg"),
      to: "/boutique?categorie=Outils",
    },
    {
      title: { fr: "Adhésifs et mordançage", en: "Adhesives and etchants" },
      sub: { fr: "Grade clinique", en: "Clinical grade" },
      thumb: img("img-08.jpg"),
      to: "/boutique?categorie=Outils",
    },
    {
      title: { fr: "Suivi client", en: "Aftercare" },
      sub: { fr: "Cartes FR · EN · DE", en: "Cards FR · EN · DE" },
      thumb: img("mouth-01.jpg"),
      to: "/boutique?categorie=Suivi",
    },
    {
      title: { fr: "Mon panier", en: "My cart" },
      sub: { fr: "Récapitulatif et paiement", en: "Summary and payment" },
      thumb: img("img-02.jpg"),
      to: "/panier",
    },
  ],
  academy: [
    {
      title: { fr: "Fondation Tooth Gem", en: "Tooth Gem Foundation" },
      sub: { fr: "9 leçons · 1 h 30", en: "9 lessons · 1h30" },
      thumb: img("img-12.jpg"),
      to: "/academy/lecon",
    },
    {
      title: { fr: "Placement avancé", en: "Advanced placement" },
      sub: { fr: "9 leçons · 1 h 30", en: "9 lessons · 1h30" },
      thumb: img("mouth-02.jpg"),
      to: "/academy/lecon",
    },
    {
      title: { fr: "Business studio", en: "Business studio" },
      sub: { fr: "9 leçons · 1 h 30", en: "9 lessons · 1h30" },
      thumb: img("mouth-03.jpg"),
      to: "/academy/lecon",
    },
    {
      title: { fr: "Mon espace membre", en: "My member area" },
      sub: { fr: "Progression, attestations, commandes", en: "Progress, certificates, orders" },
      thumb: img("mouth-04.jpg"),
      to: "/compte",
    },
  ],
};
