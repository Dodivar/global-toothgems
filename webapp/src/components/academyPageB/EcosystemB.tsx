import { useTranslation } from "react-i18next";
import { ArrowUpRight, Box, MessagesSquare, ShoppingBag, type LucideIcon } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Link } from "../../lib/navigation";
import { useReveal } from "../../lib/useReveal";

type Row = { key: "create" | "equip" | "share"; icon: LucideIcon; to?: string };

/**
 * The rest of the Global Toothgems world, as three rows: the 3D Studio, the
 * shop, and sharing between artists (not open yet, so it says "coming soon"
 * and links nowhere). "Learn" is left out: it is this page.
 */
export function EcosystemB() {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();
  const rows: Row[] = [
    { key: "create", icon: Box, to: "/studio-3d" },
    { key: "equip", icon: ShoppingBag, to: "/boutique" },
    { key: "share", icon: MessagesSquare },
  ];

  return (
    <section ref={ref} aria-labelledby="academyb-ecosystem-title" className="gt-reveal bg-[var(--gt-blue-50)] py-[clamp(48px,7vw,120px)]">
      <div className="gt-alt-wide grid gap-[clamp(24px,4vw,56px)] px-[var(--gt-alt-gutter)] lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:items-center">
        <div className="grid gap-3">
          <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("academyPage.ecosystem.eyebrow")}</span>
          <h2 id="academyb-ecosystem-title" className="gt-alt-h2 max-w-[18ch] !text-[clamp(28px,3.4vw,52px)]">{t("academyPage.ecosystem.title")}</h2>
          <p className="m-0 max-w-[46ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("academyPage.ecosystem.lead")}</p>
        </div>
        <ul className="m-0 grid list-none gap-3 p-0">
          {rows.map(({ key, icon: Icon, to }) => (
            <li
              key={key}
              className="gt-academyb-eco relative grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--gt-blue-200)] bg-white p-4 sm:p-5"
            >
              <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
                <Icon size={19} strokeWidth={1.75} />
              </span>
              <span className="grid gap-0.5">
                <h3 className="text-[16px] font-bold leading-snug text-[var(--text-primary)]">
                  {to ? (
                    <Link
                      to={to}
                      className="rounded-[var(--radius-xs)] after:absolute after:inset-0 after:rounded-[var(--radius-lg)] after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                    >
                      {t(`academyPage.ecosystem.${key}.title`)}
                    </Link>
                  ) : (
                    t(`academyPage.ecosystem.${key}.title`)
                  )}
                </h3>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`academyPage.ecosystem.${key}.body`)}</p>
              </span>
              {to ? (
                <ArrowUpRight size={18} aria-hidden="true" className="gt-alt-tile-arrow text-[var(--gt-blue-700)]" />
              ) : (
                <Badge tone="neutral" size="sm">{t("academyPage.ecosystem.soon")}</Badge>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
