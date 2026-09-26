import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CarouselTrack } from "./CarouselTrack";
import { ShapeGlyph } from "./ShapeGlyph";
import type { ShapeGroup } from "../../data/products";

interface ShapeCarouselProps {
  groups: ShapeGroup[];
  /** Builds the shop URL a tile links to. */
  hrefFor: (group: ShapeGroup) => string;
  /** Tighter tiles for the header panel, where vertical room is scarce. */
  compact?: boolean;
  onNavigate?: () => void;
}

/** Horizontal picker of gem cuts. */
export function ShapeCarousel({ groups, hrefFor, compact = false, onNavigate }: ShapeCarouselProps) {
  const { t } = useTranslation();

  return (
    <CarouselTrack prevLabel={t("home.shapePrev")} nextLabel={t("home.shapeNext")}>
      {groups.map((group) => (
        <li key={group.shape} className="shrink-0 snap-start">
          <Link
            to={hrefFor(group)}
            onClick={onNavigate}
            aria-label={t("home.shapeTileAria", { shape: t(`shop.shapes.${group.shape}`), count: group.count })}
            className={`group grid justify-items-center gap-2.5 rounded-[var(--radius-card)] p-2 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-brand-wash-strong)] ${
              compact ? "w-[84px] gap-2" : "w-[104px] sm:w-[124px]"
            }`}
          >
            <span
              className={`flex items-center justify-center rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--gt-blue-700)] shadow-[var(--shadow-xs)] transition-[transform,border-color,box-shadow] duration-[var(--duration-normal)] group-hover:-translate-y-[3px] group-hover:border-[var(--border-brand)] group-hover:shadow-[var(--shadow-md)] ${
                compact ? "h-[56px] w-[56px]" : "h-[84px] w-[84px] sm:h-[96px] sm:w-[96px]"
              }`}
            >
              <ShapeGlyph shape={group.shape} size={compact ? 28 : 44} />
            </span>
            <span className="grid justify-items-center gap-0.5 text-center">
              <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                {t(`shop.shapes.${group.shape}`)}
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
