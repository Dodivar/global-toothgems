import { useTranslation } from "react-i18next";
import {
  Archive,
  Ban,
  CalendarClock,
  CheckCheck,
  CircleCheck,
  CirclePause,
  Euro,
  Gift,
  History,
  Hourglass,
  Layers,
  MailCheck,
  MailOpen,
  MailWarning,
  PackagePlus,
  Percent,
  PencilLine,
  PieChart,
  Truck,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { Badge, type BadgeTone } from "../ui/Badge";
import type {
  CampaignStatus,
  DeliveryStatus,
  GiftCardStatus,
  Promotion,
  PromotionStatus,
  PromotionType,
} from "../../data/adminPromotions";
import { formatPrice } from "../../lib/format";
import { euros } from "../../lib/promotionRules";

/**
 * The status vocabulary of the Promotions workspace.
 *
 * Same contract as the order book's `StatusBadges`: every badge carries a tone,
 * an icon and the word. Colour is the third signal, never the only one — a
 * paused promotion and an active one differ by their glyph and their label
 * before they differ by amber and emerald.
 *
 * Fuchsia (`highlight`) is kept for the promotional accent itself — the
 * discount chip — so the eye goes to "what customers get" rather than to a
 * status.
 */

const PROMO_META: Record<PromotionStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  active: { tone: "success", icon: CircleCheck },
  scheduled: { tone: "brand", icon: CalendarClock },
  expired: { tone: "neutral", icon: History },
  draft: { tone: "neutral", icon: PencilLine },
  paused: { tone: "warning", icon: CirclePause },
  archived: { tone: "neutral", icon: Archive },
};

const CAMPAIGN_META: Record<CampaignStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  active: { tone: "success", icon: CircleCheck },
  scheduled: { tone: "brand", icon: CalendarClock },
  draft: { tone: "neutral", icon: PencilLine },
  paused: { tone: "warning", icon: CirclePause },
  completed: { tone: "neutral", icon: CheckCheck },
  archived: { tone: "neutral", icon: Archive },
};

const CARD_META: Record<GiftCardStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  active: { tone: "success", icon: CircleCheck },
  partiallyRedeemed: { tone: "brand", icon: PieChart },
  redeemed: { tone: "neutral", icon: CheckCheck },
  scheduled: { tone: "brand", icon: CalendarClock },
  expired: { tone: "warning", icon: Hourglass },
  cancelled: { tone: "error", icon: Ban },
};

const DELIVERY_META: Record<DeliveryStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  delivered: { tone: "success", icon: MailCheck },
  opened: { tone: "success", icon: MailOpen },
  scheduled: { tone: "brand", icon: CalendarClock },
  bounced: { tone: "error", icon: MailWarning },
};

export const TYPE_ICON: Record<PromotionType, LucideIcon> = {
  percentage: Percent,
  fixed: Euro,
  bxgy: Layers,
  freeShipping: Truck,
  bundle: PackagePlus,
  gift: Gift,
};

export function promotionStatusIcon(status: PromotionStatus): LucideIcon {
  return PROMO_META[status].icon;
}

export function PromotionStatusBadge({ status, size = "sm" }: { status: PromotionStatus; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const meta = PROMO_META[status];
  return (
    <Badge tone={meta.tone} icon={meta.icon} size={size}>
      {t(`promo.status.${status}`)}
    </Badge>
  );
}

export function CampaignStatusBadge({ status, size = "sm" }: { status: CampaignStatus; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const meta = CAMPAIGN_META[status];
  return (
    <Badge tone={meta.tone} icon={meta.icon} size={size}>
      {t(`promo.campaignStatus.${status}`)}
    </Badge>
  );
}

export function GiftCardStatusBadge({ status, size = "sm" }: { status: GiftCardStatus; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const meta = CARD_META[status];
  return (
    <Badge tone={meta.tone} icon={meta.icon} size={size}>
      {t(`promo.cardStatus.${status}`)}
    </Badge>
  );
}

/** Delivery is secondary to status, so it is drawn as quiet text + icon rather than a second pill. */
export function DeliveryLabel({ status }: { status: DeliveryStatus }) {
  const { t } = useTranslation();
  const meta = DELIVERY_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 text-[length:var(--text-caption)] font-medium",
        meta.tone === "error"
          ? "text-[var(--status-error-fg)]"
          : meta.tone === "brand"
            ? "text-[var(--gt-blue-700)]"
            : "text-[var(--text-body)]",
      )}
    >
      <Icon size={14} strokeWidth={1.9} aria-hidden="true" />
      {t(`promo.delivery.${status}`)}
    </span>
  );
}

export function PromotionTypeLabel({ type, className }: { type: PromotionType; className?: string }) {
  const { t } = useTranslation();
  const Icon = TYPE_ICON[type];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-body)]", className)}>
      <span
        aria-hidden="true"
        className="grid h-5 w-5 flex-none place-items-center rounded-[6px] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]"
      >
        <Icon size={12} strokeWidth={2.2} />
      </span>
      {t(`promo.type.${type}`)}
    </span>
  );
}

/** Formats cents in the UI language. Display only. */
export function useMoney() {
  // Subscribing to the translation hook is what re-renders callers on a
  // language switch; `formatPrice` reads the language itself.
  useTranslation();
  return (cents: number) => formatPrice(euros(cents));
}

/**
 * The discount in the fewest words: "−20 %", "−15 €", "2 + 1", "Free shipping".
 * The same string the storefront badge shows, so the table reads like the shop.
 */
export function useDiscountLabel() {
  const { t } = useTranslation();
  const money = useMoney();
  return (p: Pick<Promotion, "discount">, variant: "short" | "badge" = "short") => {
      const d = p.discount;
      switch (d.type) {
        case "percentage":
          return t(`promo.discount.${variant}.percentage`, { value: d.percent ?? 0 });
        case "fixed":
          return t(`promo.discount.${variant}.fixed`, { value: money(d.amountCents ?? 0) });
        case "bxgy":
          return t(`promo.discount.${variant}.bxgy`, { buy: d.buyQty ?? 0, get: d.getQty ?? 0 });
        case "freeShipping":
          return t(`promo.discount.${variant}.freeShipping`);
        case "bundle":
          return t(`promo.discount.${variant}.bundle`, { value: money(d.bundlePriceCents ?? 0) });
        case "gift":
          return t(`promo.discount.${variant}.gift`);
      }
  };
}

/** The fuchsia chip that stands for "what the customer gets". */
export function DiscountChip({ label, size = "md" }: { label: string; size?: "sm" | "md" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center whitespace-nowrap rounded-[var(--radius-pill)] border border-[var(--gt-fuchsia-300)] bg-[var(--gt-fuchsia-50)] font-bold tabular-nums text-[var(--accent-highlight-ink)]",
        size === "sm" ? "h-[22px] px-2 text-[11px]" : "h-7 px-2.5 text-[length:var(--text-caption)]",
      )}
    >
      {label}
    </span>
  );
}

/** Monospace promo / gift card code. */
export function CodeTag({ code, muted = false }: { code: string; muted?: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-[6px] border border-dashed px-1.5 py-0.5 font-[family-name:var(--gt-font-mono)] text-[11px] font-semibold tracking-[.04em]",
        muted
          ? "border-[var(--border-default)] text-[var(--text-muted)]"
          : "border-[var(--gt-ink-400)] bg-[var(--admin-panel-sunken)] text-[var(--text-primary)]",
      )}
    >
      {code}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

const DATE_LOCALES: Record<string, string> = { fr: "fr-FR", en: "en-GB" };

/**
 * European dates in the UI language. English uses en-GB rather than en-IE's
 * default so "24 Nov 2027" reads day-first everywhere.
 */
export function usePromoDates() {
  const { i18n } = useTranslation();
  const locale = DATE_LOCALES[(i18n.language ?? "fr").slice(0, 2)] ?? "fr-FR";
  return {
    date: (value: string) =>
      new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)),
    dateLong: (value: string) =>
      new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
        new Date(value),
      ),
    dateTime: (value: string) =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value)),
    numeric: (value: string) =>
      new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)),
    time: (value: string) =>
      new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(value)),
    dayMonth: (value: string) =>
      new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(value)),
    locale,
  };
}
