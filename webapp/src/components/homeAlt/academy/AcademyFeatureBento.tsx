import { useTranslation } from "react-i18next";
import { ArrowRight, ArrowUpRight, Award, Gem, Palette, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "../../ui/Button";
import { Link, useNavigate } from "../../../lib/navigation";
import { photo } from "../../../lib/images";
import { GEMS_CATEGORY, shopHref } from "../../../data/taxonomy";
import { STUDIO_PATH } from "../../../lib/studioUrl";
import { useAcademy } from "../../../lib/academy/AcademyProvider";
import { catalogueFigures } from "../../../lib/academy/publicCourse";
import { useReveal } from "../../../lib/useReveal";
import { AcademyCourseRow, AcademyFigures } from "./AcademyBandParts";

const PILLARS = [
  { key: "pillar1", icon: Sparkles },
  { key: "pillar2", icon: Gem },
  { key: "pillar3", icon: ShieldCheck },
  { key: "pillar4", icon: Palette },
] as const;

const tileLink = "gt-alt-tile-link text-inherit after:absolute after:inset-0 after:content-['']";

/**
 * Proposal C — "the bento". A light, photo-led mosaic on the off-white page:
 * a full-bleed placement carries the statement and the call to action, and
 * the tiles around it show what the training covers, the certificate, the
 * 3D Studio, the shop and the catalogue's real figures — the Academy as one
 * door into the whole Global Toothgems world. The courses follow.
 */
export function AcademyFeatureBento() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { courses } = useAcademy();
  const ref = useReveal<HTMLElement>();
  const figures = catalogueFigures(courses);

  return (
    <section ref={ref} aria-labelledby="gt-alt-academy-title" className="gt-reveal gt-alt-section w-full bg-[var(--gt-off-white)]">
      <div className="gt-alt-wide px-[var(--gt-alt-gutter)]">
        <div className="gt-alt-bento grid gap-3 sm:gap-4 lg:gap-5">
          {/* The statement, over a real placement. */}
          <div className="relative flex min-h-[520px] flex-col justify-end overflow-hidden rounded-[var(--radius-xl)] bg-[var(--gt-ink-900)] [grid-area:hero] lg:min-h-[640px]">
            <img src={photo("mouth-01.jpg")} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
            <div aria-hidden="true" className="gt-alt-bento-shade absolute inset-0" />
            <div className="relative grid justify-items-start gap-5 p-[clamp(22px,3.4vw,56px)] text-[var(--gt-off-white)]">
              <span className="gt-eyebrow !text-[var(--gt-blue-300)]">{t("homeAlt.academy.eyebrow")}</span>
              <h2 id="gt-alt-academy-title" className="gt-alt-h2 max-w-[16ch] !text-[var(--gt-off-white)]">{t("homeAlt.academy.title")}</h2>
              <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta w-full sm:w-auto" onClick={() => navigate("/academy")}>
                {t("homeAlt.academy.cta")}
              </Button>
            </div>
          </div>

          {/* What the training covers. */}
          <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(20px,2.4vw,36px)] shadow-[var(--shadow-card)] [grid-area:learn]">
            <h3 className="gt-eyebrow mb-4 !text-[var(--gt-blue-700)]">{t("homeAlt.academy.pillarsLabel")}</h3>
            <ul className="m-0 grid list-none gap-x-6 gap-y-4 p-0 sm:grid-cols-2">
              {PILLARS.map(({ key, icon: Icon }) => (
                <li key={key} className="grid grid-cols-[auto_1fr] items-start gap-3">
                  <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
                    <Icon size={18} strokeWidth={1.75} />
                  </span>
                  <span className="grid gap-0.5">
                    <span className="text-[16px] font-bold text-[var(--text-primary)]">{t(`homeAlt.academy.${key}Title`)}</span>
                    <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`homeAlt.academy.${key}Body`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* The certificate, only when a course issues one. */}
          {figures.certificate && (
            <div className="grid content-between gap-6 rounded-[var(--radius-xl)] bg-[var(--gt-ink-900)] p-[clamp(20px,2.4vw,36px)] text-[var(--gt-off-white)] [grid-area:cert]">
              <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-[var(--accent-cta)] text-[var(--text-on-accent)]">
                <Award size={22} strokeWidth={1.75} />
              </span>
              <span className="grid gap-2">
                <h3 className="text-[clamp(19px,1.6vw,24px)] font-bold leading-tight text-[var(--gt-off-white)]">{t("homeAlt.academy.bento.certificateTitle")}</h3>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">{t("homeAlt.academy.bento.certificateBody")}</p>
              </span>
            </div>
          )}

          {/* The 3D Studio. */}
          <div className="gt-alt-tile group relative flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--gt-blue-100)] shadow-[var(--shadow-card)] [grid-area:studio]">
            <span className="relative block aspect-[16/9] overflow-hidden">
              <img src="/videos/studio-3d-intro-poster.jpg" alt="" loading="lazy" decoding="async" className="gt-alt-tile-art absolute inset-0 h-full w-full object-cover" />
            </span>
            <span className="grid gap-1.5 p-[clamp(18px,2vw,28px)]">
              <h3 className="flex items-center justify-between gap-2 text-[clamp(17px,1.4vw,20px)] font-bold text-[var(--text-primary)]">
                <Link to={STUDIO_PATH} className={tileLink}>{t("homeAlt.academy.bento.studioTitle")}</Link>
                <ArrowUpRight aria-hidden="true" size={18} className="gt-alt-tile-arrow shrink-0" />
              </h3>
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("homeAlt.academy.bento.studioBody")}</p>
            </span>
          </div>

          {/* The shop. */}
          <div className="gt-alt-tile group relative grid grid-cols-[1fr_auto] items-center gap-4 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(18px,2vw,28px)] shadow-[var(--shadow-card)] [grid-area:shop]">
            <span className="grid gap-1.5">
              <h3 className="flex items-center gap-2 text-[clamp(17px,1.4vw,20px)] font-bold text-[var(--text-primary)]">
                <Link to={shopHref(GEMS_CATEGORY)} className={tileLink}>{t("homeAlt.academy.bento.shopTitle")}</Link>
                <ArrowUpRight aria-hidden="true" size={18} className="gt-alt-tile-arrow shrink-0" />
              </h3>
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("homeAlt.academy.bento.shopBody")}</p>
            </span>
            <span aria-hidden="true" className="relative h-24 w-24 sm:h-28 sm:w-28">
              <img src={photo("img-14.jpg")} alt="" loading="lazy" decoding="async" className="gt-alt-cutout gt-alt-tile-art absolute left-0 top-0 w-[70%]" />
              <img src={photo("img-20.jpg")} alt="" loading="lazy" decoding="async" className="gt-alt-cutout gt-alt-tile-art absolute bottom-0 right-0 w-[58%]" />
            </span>
          </div>

          {/* The catalogue, counted. */}
          <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(20px,2.4vw,36px)] shadow-[var(--shadow-card)] [grid-area:figures]">
            <AcademyFigures figures={figures} tone="light" narrow />
          </div>
        </div>

        <AcademyCourseRow tone="light" className="mt-[clamp(56px,7vw,112px)]" />
      </div>
    </section>
  );
}
