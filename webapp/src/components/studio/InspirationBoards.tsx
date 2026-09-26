import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import { SmileCanvas } from "./SmileCanvas";
import { MATERIAL_SWATCH } from "./gemStyle";
import { pick } from "../../data/types";
import { COMPOSITIONS, INSPIRATION, type InspirationBoard } from "../../data/studio";
import { STUDIO_EDITOR_PATH, STUDIO_SUBSCRIBE_PATH } from "../../lib/studioUrl";
import { useStudioAccess } from "../../lib/studioAccess";

/**
 * Editorial mood boards, one per style. Deliberately not product cards: no
 * price, no add-to-cart — a pinned "print" of the composition, its palette and
 * a line of intent, laid out as a masonry wall so the rhythm feels curated.
 */

const TONE: Record<InspirationBoard["tone"], string> = {
  sand: "bg-[var(--gt-sand)] text-[var(--gt-ink-900)]",
  blue: "bg-[var(--gt-blue-100)] text-[var(--gt-ink-900)]",
  blush: "bg-[var(--gt-fuchsia-50)] text-[var(--gt-ink-900)]",
  ink: "bg-[var(--gt-ink-900)] text-white",
};

/** Alternate tall and wide prints so the columns never line up. */
const ASPECT = ["aspect-[4/5]", "aspect-[16/11]", "aspect-[1/1]", "aspect-[16/12]", "aspect-[4/5]", "aspect-[16/10]"];

export function InspirationBoards() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  // During the free preview, "Recreate" goes straight to the editor.
  const recreateTo = useStudioAccess().granted ? STUDIO_EDITOR_PATH : STUDIO_SUBSCRIBE_PATH;

  return (
    <div className="columns-1 gap-5 sm:columns-2 lg:columns-3">
      {INSPIRATION.map((board, i) => {
        const ink = board.tone === "ink";
        const materials = [...new Set(COMPOSITIONS[board.id].map((p) => p.material))];
        return (
          <article
            key={board.id}
            className={clsx(
              "group relative mb-5 grid break-inside-avoid gap-4 rounded-[var(--radius-xl)] p-[clamp(16px,2vw,22px)]",
              TONE[board.tone],
            )}
          >
            <header className="flex items-baseline justify-between gap-3">
              <h3 className={clsx("text-[length:var(--text-h3)] font-[var(--weight-black)] uppercase tracking-[var(--tracking-display)]", ink && "text-white")}>
                {pick(board.title, lang)}
              </h3>
              <span className={clsx("font-[family-name:var(--gt-font-mono)] text-[11px]", ink ? "text-white/60" : "text-[var(--text-muted)]")}>
                {t("studio.inspiration.number", { n: String(i + 1).padStart(2, "0") })}
              </span>
            </header>

            {/* The "print": a framed render, slightly askew, that straightens on hover. */}
            <div
              className={clsx(
                "gt-studio-print rounded-[var(--radius-md)] p-2 shadow-[var(--shadow-md)]",
                ink ? "bg-[var(--gt-ink-700)]" : "bg-white",
                i % 2 ? "rotate-[1.2deg]" : "-rotate-[1.2deg]",
              )}
            >
              <div aria-hidden="true" className={clsx("gt-studio-stage relative overflow-hidden rounded-[var(--radius-sm)]", ASPECT[i % ASPECT.length])}>
                <div className="absolute inset-0 grid place-items-center" style={{ transform: "scale(1.45)" }}>
                  <SmileCanvas pieces={COMPOSITIONS[board.id]} className="block h-auto w-full" />
                </div>
              </div>
            </div>

            <p className={clsx("m-0 text-[length:var(--text-body-sm)] italic leading-relaxed", ink ? "text-white/85" : "text-[var(--text-body)]")}>
              “{pick(board.note, lang)}”
            </p>

            <footer className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className="flex -space-x-1" aria-hidden="true">
                  {materials.map((m) => (
                    <span key={m} className="h-4 w-4 rounded-full border-2" style={{ background: MATERIAL_SWATCH[m], borderColor: ink ? "var(--gt-ink-900)" : "#fff" }} />
                  ))}
                </span>
                <span className={clsx("text-[11.5px] font-semibold", ink ? "text-white/75" : "text-[var(--text-muted)]")}>{pick(board.pieces, lang)}</span>
              </span>
              <Link
                to={recreateTo}
                aria-label={t("studio.inspiration.recreateAria", { style: pick(board.title, lang) })}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-semibold underline decoration-1 underline-offset-4 transition-colors",
                  ink ? "text-[var(--gt-blue-200)] hover:text-white" : "text-[var(--gt-ink-900)] hover:text-[var(--text-link-hover)]",
                )}
              >
                {t("studio.inspiration.recreate")}
                <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
