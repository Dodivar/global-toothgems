import { useTranslation } from "react-i18next";
import { ArrowUpRight, Box, GraduationCap, MessagesSquare, ShoppingBag, type LucideIcon } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Link } from "../../lib/navigation";
import { photo } from "../../lib/images";
import { useReveal } from "../../lib/useReveal";

type Tile = { key: "learn" | "create" | "equip" | "share"; icon: LucideIcon } & ({ to: string } | { onClick: () => void } | { soon: true });

/**
 * The Academy as one part of the Global Toothgems world: learn here, create
 * in the 3D Studio, get equipped in the shop. Sharing between artists has no
 * live space yet, so it says "coming soon" rather than offering a link to a
 * mock-up.
 */
export function Ecosystem({ onLearn }: { onLearn: () => void }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();
  const tiles: Tile[] = [
    { key: "learn", icon: GraduationCap, onClick: onLearn },
    { key: "create", icon: Box, to: "/studio-3d" },
    { key: "equip", icon: ShoppingBag, to: "/boutique" },
    { key: "share", icon: MessagesSquare, soon: true },
  ];
  const action = "inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] after:absolute after:inset-0 after:content-['']";

  return (
    <section ref={ref} aria-labelledby="academy-ecosystem-title" className="gt-reveal gt-alt-section gt-academy-ecosystem">
      <div className="gt-alt-wide grid gap-[clamp(32px,4vw,64px)] px-[var(--gt-alt-gutter)] lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:items-center">
        <div className="grid content-start gap-5">
          <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("academyPage.ecosystem.eyebrow")}</span>
          <h2 id="academy-ecosystem-title" className="gt-alt-h2 max-w-[17ch]">{t("academyPage.ecosystem.title")}</h2>
          <p className="m-0 max-w-[46ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("academyPage.ecosystem.lead")}</p>
          <div className="gt-sparkle relative mt-2 hidden aspect-[16/10] max-w-[440px] overflow-hidden rounded-[var(--radius-xl)] lg:block">
            <img src={photo("img-17.jpg")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          </div>
        </div>
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <li
                key={tile.key}
                className="gt-academy-eco-tile relative grid content-start gap-3 rounded-[var(--radius-xl)] border border-white/80 bg-white/70 p-[clamp(20px,2.2vw,32px)] shadow-[var(--shadow-sm)] backdrop-blur-sm"
              >
                <span className="flex items-center justify-between gap-3">
                  <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-inverse)] text-[var(--gt-blue-300)]">
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  {"soon" in tile && <Badge tone="neutral" size="sm">{t("academyPage.ecosystem.soon")}</Badge>}
                </span>
                <h3 className="text-[length:var(--text-h3)] font-[var(--weight-black)] text-[var(--text-primary)]">{t(`academyPage.ecosystem.${tile.key}.title`)}</h3>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`academyPage.ecosystem.${tile.key}.body`)}</p>
                {"to" in tile && (
                  <Link to={tile.to} className={action}>
                    {t(`academyPage.ecosystem.${tile.key}.cta`)}
                    <ArrowUpRight size={15} aria-hidden="true" className="gt-alt-tile-arrow" />
                  </Link>
                )}
                {"onClick" in tile && (
                  <button type="button" onClick={tile.onClick} className={`${action} text-left`}>
                    {t(`academyPage.ecosystem.${tile.key}.cta`)}
                    <ArrowUpRight size={15} aria-hidden="true" className="gt-alt-tile-arrow" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
