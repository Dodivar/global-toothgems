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

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: { ...fr, promo: promoFr, reviews: reviewsFr, settings: settingsFr } },
      en: { translation: { ...en, promo: promoEn, reviews: reviewsEn, settings: settingsEn } },
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
