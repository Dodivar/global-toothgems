import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Bookmark, ChevronDown, GraduationCap, LayoutDashboard, Package, TrendingUp, Users } from "lucide-react";
import { photo } from "../../lib/images";
import monogram from "../../assets/monogram-white.png";

const BENEFITS: { icon: LucideIcon; key: string }[] = [
  { icon: Package, key: "orders" },
  { icon: GraduationCap, key: "access" },
  { icon: TrendingUp, key: "progress" },
  { icon: Bookmark, key: "saved" },
  { icon: LayoutDashboard, key: "dashboard" },
  { icon: Users, key: "community" },
];

function BenefitList({ tone }: { tone: "glass" | "plain" }) {
  const { t } = useTranslation();
  return (
    <ul className={tone === "glass" ? "m-0 grid list-none grid-cols-2 gap-x-5 gap-y-3.5 p-0" : "m-0 grid list-none gap-3 p-0"}>
      {BENEFITS.map(({ icon: Icon, key }) => (
        <li key={key} className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]"
          >
            <Icon size={14} />
          </span>
          <span className="pt-[3px] text-[length:var(--text-body-sm)] leading-snug text-[var(--text-primary)]">
            {t(`register.benefits.${key}`)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Desktop editorial column: one photograph, one glass panel carrying the value
 * proposition, one proof point. Deliberately restrained — it is the mount, the
 * form is the stone — and entirely non-interactive, so the tab order never
 * wanders into it.
 */
export function BrandAside() {
  const { t } = useTranslation();
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-2xl)] bg-[var(--gt-blue-100)]">
      <div className="gt-sparkle relative aspect-[4/5] max-h-[calc(100vh-140px)] min-h-[620px] w-full">
        <img src={photo("img-12.jpg")} alt="" decoding="async" className="gt-kenburns absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,17,17,.28)_0%,rgba(17,17,17,0)_30%,rgba(17,17,17,0)_55%,rgba(63,90,117,.45)_100%)]" />

        <div className="absolute left-5 top-5 flex items-center gap-2.5 rounded-full border border-white/40 bg-[rgba(17,17,17,.38)] py-1.5 pl-1.5 pr-4 text-white backdrop-blur-[10px]">
          <img src={monogram} alt="" className="h-8 w-8 rounded-full bg-white/15 object-contain p-1.5" />
          <span className="text-[length:var(--text-caption)] leading-tight">
            <strong className="block text-[13px]">{t("home.heroStat1Value")}</strong>
            {t("home.heroStat1Label")}
          </span>
        </div>

        <div className="gt-glass-panel gt-glass-panel-compact absolute inset-x-5 bottom-5 grid gap-4 rounded-[var(--radius-xl)] p-6">
          <div className="grid gap-1">
            <span aria-hidden="true" className="gt-script text-[34px] leading-none text-[var(--gt-blue-500)]">
              {t("register.aside.script")}
            </span>
            <p className="m-0 text-[length:var(--text-h4)] font-bold leading-snug text-[var(--text-primary)]">{t("register.aside.title")}</p>
          </div>
          <BenefitList tone="glass" />
        </div>
      </div>
    </div>
  );
}

/** The same promise on small screens, folded so the form stays first. */
export function BenefitsDisclosure() {
  const { t } = useTranslation();
  return (
    <details className="group rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white/70 lg:hidden">
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-2 px-4 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
        {t("register.benefitsToggle")}
        <ChevronDown size={16} aria-hidden="true" className="ml-auto text-[var(--text-muted)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">
        <BenefitList tone="plain" />
      </div>
    </details>
  );
}
