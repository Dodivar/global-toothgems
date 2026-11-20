import { useTranslation } from "react-i18next";
import { StudioLoopVideo, type LoopFilm } from "./StudioLoopVideo";

/**
 * The Studio presentation page's hero film (`/videos/studio-3d-tools*`): a
 * silent, square 15-second loop rendered frame by frame from the Studio's own
 * 3D engine, the editor's tools at work on the team's creations, with no
 * interface around the 3D — "Cristaux minimalistes": a column lassoed, aligned
 * and mirrored with its canine, the lower crystals lassoed, aligned and spaced
 * evenly; the Scorpion's body lassoed and recoloured twice; a turn round the
 * "Étoile halo"; the "Cœur" smile opening and closing while the teeth change
 * colour. The tools' moves are the engine's own results, slid into place. No
 * text is burned in, so one file serves both languages. Above the fold, so
 * its metadata loads with the page.
 */
const HERO_FILM: LoopFilm = {
  src: "/videos/studio-3d-tools.mp4",
  mobileSrc: "/videos/studio-3d-tools-mobile.mp4",
  poster: "/videos/studio-3d-tools-poster.webp",
};

export function HeroVideo() {
  const { t } = useTranslation();
  return (
    <StudioLoopVideo film={HERO_FILM} description={t("studioPage.hero.video.description")} preload="metadata" aspectClassName="aspect-square" framed={false} />
  );
}
