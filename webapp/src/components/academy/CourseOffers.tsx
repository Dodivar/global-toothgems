"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Box, GraduationCap, UserRound } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { Link } from "../../lib/navigation";
import { pick } from "../../data/types";
import { useFormat } from "../../lib/format";
import { sellable, studioMonths, type CourseOffers as Offers, type CoursePackOffer } from "../../lib/academy/courseOffers";
import type { Money } from "../../lib/academy/publicCourse";
import { SectionIntro } from "./TrainingPrimitives";

/**
 * "Choose your package" on a course's sales page: the course alone, and each
 * pack that opens the course (the GLOBAL™ PRO MASTER PACK: kit + months of the
 * 3D Studio). Every figure comes from the catalogue (`lib/academy/courseOffers.ts`);
 * the differences shown are plain sums against the course alone, never a
 * reduction claim. An option the shop cannot sell now (out of stock) says so
 * and links to its product page instead of offering a button the checkout
 * would refuse. Renders the same on the server and in the browser.
 */
export function CourseOffers({
  id,
  title,
  coursePrice,
  offers,
  busy,
  inCart,
  onBuyCourse,
  onBuyPack,
}: {
  id: string;
  title: string;
  coursePrice: Money;
  offers: Offers;
  busy: boolean;
  /** Which option is already in the cart, if any. */
  inCart: { course: boolean; packs: ReadonlySet<string> };
  onBuyCourse: () => void;
  onBuyPack: (pack: CoursePackOffer) => void;
}) {
  const { t, i18n } = useTranslation();
  const { formatMoney } = useFormat();
  const lang = i18n.language.startsWith("en") ? "en" : "fr";
  const money = (cents: number, currency: string) => formatMoney(cents, currency);
  const extra = (cents: number, currency: string) =>
    currency === coursePrice.currency && cents > coursePrice.minor
      ? t("training.offers.extra", { amount: money(cents - coursePrice.minor, currency) })
      : null;
  const months = studioMonths(offers);

  return (
    <div className="grid gap-[clamp(20px,3vw,32px)]">
      <SectionIntro id={id} eyebrow={t("training.offers.eyebrow")} title={t("training.offers.title")} lead={months ? t("training.offers.lead", { count: months }) : t("training.offers.leadPlain")} />

      <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 lg:max-w-[1040px]">
        {/* 1 — The course alone */}
        <OfferCard
          name={t("training.offers.courseTitle")}
          price={money(coursePrice.minor, coursePrice.currency)}
          items={[{ icon: "course", label: title }]}
          action={
            <Button variant="outline" onClick={onBuyCourse} loading={busy} disabled={busy} className="w-full">
              {inCart.course ? t("training.ctaInCart") : t("training.offers.courseCta")}
            </Button>
          }
        />

        {/* 2 — Each pack that opens the course */}
        {offers.packs.map((pack) => (
          <OfferCard
            key={pack.id}
            featured
            badge={t("training.offers.packBadge")}
            name={pick(pack.name, lang)}
            price={money(pack.priceCents, pack.currency)}
            extra={extra(pack.priceCents, pack.currency)}
            items={[
              { icon: "course", label: title },
              ...pack.components.map((component) => ({
                icon: "box" as const,
                label: pick(component.name, lang),
                to: `/boutique/${component.id}`,
              })),
              ...(pack.studio
                ? [
                    {
                      icon: "studio" as const,
                      label: t("product.pack.studio", { plan: t(`product.pack.plan.${pack.studio.plan}`), count: pack.studio.months }),
                      hint: t("training.offers.studioHint"),
                    },
                  ]
                : []),
            ]}
            note={t("training.offers.packNote")}
            action={
              sellable(pack) ? (
                <Button variant="primary" onClick={() => onBuyPack(pack)} loading={busy} disabled={busy} className="w-full">
                  {inCart.packs.has(pack.id) ? t("training.ctaInCart") : t("training.offers.packCta")}
                </Button>
              ) : (
                <SoldOut to={`/boutique/${pack.id}`} label={t("training.offers.packSoldOut")} />
              )
            }
            detailsTo={sellable(pack) ? `/boutique/${pack.id}` : undefined}
          />
        ))}
      </ul>

      <div className="grid gap-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
        <p className="m-0 flex items-start gap-2">
          <UserRound size={14} aria-hidden="true" className="mt-1 flex-none" />
          <span>{t("training.offers.account")}</span>
        </p>
        <p className="m-0 pl-[22px]">
          {t("training.offers.studioAlone")}{" "}
          <Link to="/studio-3d" className="font-semibold text-[var(--text-link)] underline decoration-1 underline-offset-2">
            {t("training.offers.studioAloneLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}

type OfferItem = { icon: "course" | "box" | "studio"; label: string; hint?: string; to?: string };

function OfferCard({
  name,
  price,
  extra,
  items,
  note,
  action,
  featured = false,
  badge,
  detailsTo,
}: {
  name: string;
  price: string;
  extra?: string | null;
  items: OfferItem[];
  note?: string;
  action: ReactNode;
  featured?: boolean;
  badge?: string;
  detailsTo?: string;
}) {
  const { t } = useTranslation();
  return (
    <li
      className={clsx(
        "relative grid content-start gap-4 rounded-[var(--radius-card)] border bg-[var(--surface-card)] p-[var(--space-5)]",
        featured ? "border-2 border-[var(--gt-blue-500)] shadow-[var(--shadow-md)]" : "border-[var(--border-subtle)]",
      )}
    >
      {badge && (
        <span className="w-fit rounded-full bg-[var(--gt-blue-700)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          {badge}
        </span>
      )}
      <div className="grid gap-1">
        <h3 className="m-0 text-[length:var(--text-h4)] text-[var(--text-primary)]">{name}</h3>
        <p className="m-0 flex flex-wrap items-baseline gap-x-2">
          <strong className="text-[28px] font-[var(--weight-black)] leading-none text-[var(--text-primary)]">{price}</strong>
          {extra && <span className="text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{extra}</span>}
        </p>
      </div>
      <ul className="m-0 grid list-none gap-2.5 p-0">
        {items.map((item) => (
          <li key={`${item.icon}-${item.label}`} className="flex items-start gap-2.5 text-sm text-[var(--text-body)]">
            <ItemIcon icon={item.icon} />
            <span className="grid gap-0.5">
              {item.to ? (
                <Link to={item.to} className="font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-2">
                  {item.label}
                </Link>
              ) : (
                <span className="font-semibold text-[var(--text-primary)]">{item.label}</span>
              )}
              {item.hint && <span className="text-xs text-[var(--text-muted)]">{item.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
      {note && <p className="m-0 text-xs text-[var(--text-muted)]">{note}</p>}
      <div className="mt-auto grid gap-2">
        {action}
        {detailsTo && (
          <Link to={detailsTo} className="text-center text-sm font-semibold text-[var(--text-link)] underline decoration-1 underline-offset-2">
            {t("training.offers.packDetails")}
          </Link>
        )}
      </div>
    </li>
  );
}

function ItemIcon({ icon }: { icon: OfferItem["icon"] }) {
  const cls = "mt-0.5 flex-none text-[var(--gt-blue-700)]";
  if (icon === "course") return <GraduationCap size={18} aria-hidden="true" className={cls} />;
  if (icon === "box") return <Box size={18} aria-hidden="true" className={cls} />;
  return (
    <span aria-hidden="true" className="mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center text-[11px] font-black text-[var(--gt-blue-700)]">
      3D
    </span>
  );
}

function SoldOut({ to, label }: { to: string; label: string }) {
  const { t } = useTranslation();
  return (
    <p className="m-0 grid gap-1 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3 text-center text-sm">
      <strong className="text-[var(--text-primary)]">{label}</strong>
      <Link to={to} className="font-semibold text-[var(--text-link)] underline decoration-1 underline-offset-2">
        {t("training.offers.notifyMe")}
      </Link>
    </p>
  );
}
