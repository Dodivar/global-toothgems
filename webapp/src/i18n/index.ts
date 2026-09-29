import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import fr from "./locales/fr.json";
import en from "./locales/en.json";
// The Promotions & Gift Cards workspace keeps its copy in its own pair of files
// (mounted under the top-level `promo` key) so the two main locale files stay
// reviewable.
import promoFr from "./locales/promotions.fr.json";
import promoEn from "./locales/promotions.en.json";
// Reviews and their moderation, likewise in their own pair, under `reviews`.
import reviewsFr from "./locales/reviews.fr.json";
import reviewsEn from "./locales/reviews.en.json";
// Same arrangement for the Settings workspace, under `settings`.
import settingsFr from "./locales/settings.fr.json";
import settingsEn from "./locales/settings.en.json";
// The 3D Studio's presentation and subscription pages, under `studio`.
import studioFr from "./locales/studio.fr.json";
import studioEn from "./locales/studio.en.json";
// The Studio workspace around the editor (creations, Gem Groups, help), under `studio.workspace`.
import studioWorkspaceFr from "./locales/studioWorkspace.fr.json";
import studioWorkspaceEn from "./locales/studioWorkspace.en.json";
// The alternative home page at /accueil-b, under `homeAlt`.
import homeAltFr from "./locales/homeAlt.fr.json";
import homeAltEn from "./locales/homeAlt.en.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: { ...fr, promo: promoFr, reviews: reviewsFr, settings: settingsFr, studio: { ...studioFr, workspace: studioWorkspaceFr }, homeAlt: homeAltFr } },
      en: { translation: { ...en, promo: promoEn, reviews: reviewsEn, settings: settingsEn, studio: { ...studioEn, workspace: studioWorkspaceEn }, homeAlt: homeAltEn } },
    },
    fallbackLng: "fr",
    supportedLngs: ["fr", "en"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage"],
      caches: ["localStorage"],
      lookupLocalStorage: "gt-lang",
    },
  });

export default i18n;
