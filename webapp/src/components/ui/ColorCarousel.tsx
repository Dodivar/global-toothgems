import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CarouselTrack } from "./CarouselTrack";
import { ColorSwatch } from "./ColorSwatch";
import type { ColorGroup } from "../../data/products";

interface ColorCarouselProps {
  groups: ColorGroup[];
  /** Builds the shop URL a tile links to. */
  hrefFor: (group: ColorGroup) => string;
  /** Tighter tiles for the header panel, where vertical room is scarce. */
  compact?: boolean;
  onNavigate?: () => void;
}

/** Horizontal picker of gem colours — the shape carousel's twin. */
export function ColorCarousel({ groups, hrefFor, compact = false, onNavigate }: ColorCarouselProps) {
  const { t } = useTranslation();

  return (
    <CarouselTrack prevLabel={t("shop.colorPrev")} nextLabel={t("shop.colorNext")}>
      {groups.map((group) => (
        <li key={group.color} className="shrink-0 snap-start">
          <Link
            to={hrefFor(group)}
            onClick={onNavigate}
            aria-label={t("shop.colorTileAria", { color: t(`shop.colors.${group.color}`), count: group.count })}
            className={`group grid justify-items-center gap-2.5 rounded-[var(--radius-card)] p-2 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-brand-wash)] ${
              compact ? "w-[84px] gap-2" : "w-[104px] sm:w-[124px]"
            }`}
          >
            <span
              className={`flex items-center justify-center rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2 shadow-[var(--shadow-xs)] transition-[transform,border-color,box-shadow] duration-[var(--duration-normal)] group-hover:-translate-y-[3px] group-hover:border-[var(--border-brand)] group-hover:shadow-[var(--shadow-md)] ${
                compact ? "h-[56px] w-[56px]" : "h-[84px] w-[84px] sm:h-[96px] sm:w-[96px]"
              }`}
            >
              <ColorSwatch color={group.color} size={compact ? 36 : 62} />
            </span>
            <span className="grid justify-items-center gap-0.5 text-center">
              <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                {t(`shop.colors.${group.color}`)}
              </span>
              {!compact && (
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t("home.shapeCount", { count: group.count })}
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </CarouselTrack>
  );
}
