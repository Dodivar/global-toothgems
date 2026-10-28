import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUpRight, Box, GraduationCap, MessagesSquare, ShoppingBag, type LucideIcon } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Link } from "../../lib/navigation";
import { useReveal } from "../../lib/useReveal";

type Row = { key: "learn" | "create" | "equip" | "share"; icon: LucideIcon } & ({ to: string } | { onClick: () => void } | { soon: true });

/**
 * The Academy as one part of the Global Toothgems world, as four rows: train
 * here (back to the catalogue), create in the 3D Studio, get equipped in the
 * shop, and sharing between artists (not open yet, so it says "coming soon"
 * and links nowhere). Each live row is one keyboard stop on its title, and
 * its whole surface answers the pointer.
 */
export function Ecosystem({ onLearn }: { onLearn: () => void }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();
  const rows: Row[] = [
    { key: "learn", icon: GraduationCap, onClick: onLearn },
    { key: "create", icon: Box, to: "/studio-3d" },
    { key: "equip", icon: ShoppingBag, to: "/boutique" },
    { key: "share", icon: MessagesSquare, soon: true },
  ];
  const stretched =
    "rounded-[var(--radius-xs)] text-left after:absolute after:inset-0 after:rounded-[var(--radius-lg)] after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

  return (
    <section ref={ref} aria-labelledby="academy-ecosystem-title" className="gt-reveal bg-[var(--gt-blue-50)] py-[clamp(48px,7vw,120px)]">
      <div className="gt-alt-wide grid gap-[clamp(24px,4vw,56px)] px-[var(--gt-alt-gutter)] lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:items-center">
        <div className="grid gap-3">
          <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("academyPage.ecosystem.eyebrow")}</span>
          <h2 id="academy-ecosystem-title" className="gt-alt-h2 max-w-[18ch] !text-[clamp(28px,3.4vw,52px)]">{t("academyPage.ecosystem.title")}</h2>
          <p className="m-0 max-w-[46ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("academyPage.ecosystem.lead")}</p>
        </div>
        <ul className="m-0 grid list-none gap-3 p-0">
          {rows.map((row) => {
            const Icon = row.icon;
            const title = t(`academyPage.ecosystem.${row.key}.title`);
            return (
              <li
                key={row.key}
                className="gt-academy-eco relative grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--gt-blue-200)] bg-white p-4 sm:p-5"
              >
                <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
                  <Icon size={19} strokeWidth={1.75} />
                </span>
                <span className="grid gap-0.5">
                  <h3 className="text-[16px] font-bold leading-snug text-[var(--text-primary)]">
                    {"to" in row && <Link to={row.to} className={stretched}>{title}</Link>}
                    {"onClick" in row && <button type="button" onClick={row.onClick} className={stretched}>{title}</button>}
                    {"soon" in row && title}
                  </h3>
                  <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`academyPage.ecosystem.${row.key}.body`)}</p>
                </span>
                {"to" in row && <ArrowUpRight size={18} aria-hidden="true" className="gt-alt-tile-arrow text-[var(--gt-blue-700)]" />}
                {"onClick" in row && <ArrowDown size={18} aria-hidden="true" className="gt-academy-eco-down text-[var(--gt-blue-700)]" />}
                {"soon" in row && <Badge tone="neutral" size="sm">{t("academyPage.ecosystem.soon")}</Badge>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
