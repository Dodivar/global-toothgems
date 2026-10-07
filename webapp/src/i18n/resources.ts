// UI strings of every namespace, for i18next in the browser and for the
// server (page metadata). Pure data: no i18next, no window.
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
// The alternative shop page at /boutique, under `shopAlt`.
import shopAltFr from "./locales/shopAlt.fr.json";
import shopAltEn from "./locales/shopAlt.en.json";
// The learner experience (course overview, lesson player, knowledge checks),
// under `learning`; and the back office's training image library, under
// `trainingMedia`.
import learningFr from "./locales/learning.fr.json";
import learningEn from "./locales/learning.en.json";
import trainingMediaFr from "./locales/trainingMedia.fr.json";
import trainingMediaEn from "./locales/trainingMedia.en.json";
// The Academy marketplace at /academy, under `academyPage`.
import academyPageFr from "./locales/academyPage.fr.json";
import academyPageEn from "./locales/academyPage.en.json";
// The Members' Lounge (community chat at /compte/salons), under `lounge`.
import loungeFr from "./locales/communityChat.fr.json";
import loungeEn from "./locales/communityChat.en.json";

export const resources = {
  fr: { translation: { ...fr, promo: promoFr, reviews: reviewsFr, settings: settingsFr, studio: { ...studioFr, workspace: studioWorkspaceFr }, homeAlt: homeAltFr, shopAlt: shopAltFr, learning: learningFr, trainingMedia: trainingMediaFr, academyPage: academyPageFr, lounge: loungeFr } },
  en: { translation: { ...en, promo: promoEn, reviews: reviewsEn, settings: settingsEn, studio: { ...studioEn, workspace: studioWorkspaceEn }, homeAlt: homeAltEn, shopAlt: shopAltEn, learning: learningEn, trainingMedia: trainingMediaEn, academyPage: academyPageEn, lounge: loungeEn } },
};
