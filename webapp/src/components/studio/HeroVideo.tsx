import { useTranslation } from "react-i18next";
import { StudioLoopVideo, type LoopFilm } from "./StudioLoopVideo";

/**
 * The Studio presentation page's hero film (`/videos/studio-3d-hero*`): a
 * silent 27-second loop rendered from the Studio's own 3D engine with the
 * owner's creations — a heart placed gem by gem, an orbit around a star, gems
 * recoloured together, a piece moved and turned, the teeth's shade and light,
 * the mouth opening. No text is burned in, so one file serves both languages.
 * Above the fold, so its metadata loads with the page.
 */
const HERO_FILM: LoopFilm = {
  src: "/videos/studio-3d-hero.mp4",
  mobileSrc: "/videos/studio-3d-hero-mobile.mp4",
  poster: "/videos/studio-3d-hero-poster.webp",
};

export function HeroVideo() {
  const { t } = useTranslation();
  return (
    <StudioLoopVideo film={HERO_FILM} description={t("studioPage.hero.video.description")} preload="metadata" aspectClassName="aspect-[16/10] sm:aspect-[16/9]" />
  );
}
