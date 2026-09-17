import { useTranslation } from "react-i18next";
import {
  Ban,
  BellRing,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleSlash,
  Clock3,
  CreditCard,
  Hourglass,
  MapPinOff,
  PackageCheck,
  PackageOpen,
  PackageX,
  RotateCcw,
  Split,
  Timer,
  Truck,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge, type BadgeTone } from "../ui/Badge";
import type {
  AdminOrderStatus,
  AttentionReason,
  FulfillmentStatus,
  PaymentStatus,
} from "../../data/adminOrders";

/**
 * The status vocabulary of the order book, in one place.
 *
 * Every badge carries a tone *and* an icon *and* the word itself. Colour alone
 * would fail WCAG 2.2 1.4.1 and, more practically, would be unreadable for the
 * roughly one administrator in twelve who cannot separate the emerald from the
 * amber. The icon is the redundant channel; the label is the primary one.
 *
 * Tones are spent sparingly, as the design system asks: emerald for what is
 * settled, amber for what is waiting on us, red only for what is broken, blue
 * for work in progress, ink for a closed order. Fuchsia is reserved for the
 * attention flag, which is the one thing that should pull the eye.
 *
 * `compact` swaps in a shorter wording for the table, where "Partiellement
 * remboursé" is wider than the column it has to live in. It resolves through
 * i18next's key-array fallback, so only the states that actually need a terse
 * form carry one and everything else keeps the single authored label.
 */

/** Table wording first, full wording as the fallback. */
function label(group: string, key: string, compact: boolean): string[] {
  return compact
    ? [`admin.orders.${group}Short.${key}`, `admin.orders.${group}.${key}`]
    : [`admin.orders.${group}.${key}`];
}

const ORDER_META: Record<AdminOrderStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  pending: { tone: "warning", icon: Hourglass },
  confirmed: { tone: "brand", icon: CheckCircle2 },
  processing: { tone: "brand", icon: PackageOpen },
  shipped: { tone: "brand", icon: Truck },
  delivered: { tone: "success", icon: PackageCheck },
  cancelled: { tone: "neutral", icon: Ban },
  refunded: { tone: "neutral", icon: RotateCcw },
};

const PAYMENT_META: Record<PaymentStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  paid: { tone: "success", icon: CheckCircle2 },
  pending: { tone: "warning", icon: Clock3 },
  failed: { tone: "error", icon: XCircle },
  refunded: { tone: "neutral", icon: RotateCcw },
  partiallyRefunded: { tone: "neutral", icon: Split },
};

const FULFILLMENT_META: Record<FulfillmentStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  unfulfilled: { tone: "neutral", icon: CircleDashed },
  preparing: { tone: "brand", icon: PackageOpen },
  partiallyFulfilled: { tone: "warning", icon: Split },
  fulfilled: { tone: "success", icon: PackageCheck },
};

const ATTENTION_ICON: Record<AttentionReason, LucideIcon> = {
  paymentFailed: CreditCard,
  addressIncomplete: MapPinOff,
  delayed: Timer,
  lowStock: PackageX,
  refundRequested: BellRing,
  fulfillmentIssue: CircleSlash,
};

export function orderStatusIcon(status: AdminOrderStatus): LucideIcon {
  return ORDER_META[status].icon;
}

export function attentionIcon(reason: AttentionReason): LucideIcon {
  return ATTENTION_ICON[reason];
}

export function OrderStatusBadge({
  status,
  size = "md",
  compact = false,
}: {
  status: AdminOrderStatus;
  size?: "sm" | "md";
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const meta = ORDER_META[status];
  return (
    <Badge tone={meta.tone} size={size} icon={meta.icon}>
      {t(label("orderStatus", status, compact))}
    </Badge>
  );
}

export function PaymentStatusBadge({
  status,
  size = "md",
  compact = false,
}: {
  status: PaymentStatus;
  size?: "sm" | "md";
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const meta = PAYMENT_META[status];
  return (
    <Badge tone={meta.tone} size={size} icon={meta.icon}>
      {t(label("paymentStatus", status, compact))}
    </Badge>
  );
}

export function FulfillmentBadge({
  status,
  size = "md",
  compact = false,
}: {
  status: FulfillmentStatus;
  size?: "sm" | "md";
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const meta = FULFILLMENT_META[status];
  return (
    <Badge tone={meta.tone} size={size} icon={meta.icon}>
      {t(label("fulfillmentStatus", status, compact))}
    </Badge>
  );
}

/**
 * The attention flag. Deliberately quieter than a red alert: it is a queue
 * marker, not an error. The fuchsia hairline and the reason are what make it
 * scannable down a column of 25 rows without turning the table into a warning
 * screen.
 */
export function AttentionBadge({
  reason,
  size = "md",
  withReason = true,
  compact = false,
}: {
  reason: AttentionReason;
  size?: "sm" | "md";
  withReason?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const Icon = ATTENTION_ICON[reason];
  return (
    <Badge tone="highlight" size={size} icon={Icon}>
      {withReason ? t(label("attention", reason, compact)) : t("admin.orders.attentionRequired")}
    </Badge>
  );
}

/**
 * The order's position on pending → confirmed → processing → shipped →
 * delivered, as five dots. Reads faster than the badge on the detail header,
 * where the question is "how far along is this" rather than "what is it".
 * Cancelled and refunded orders left the track, so they get a single note.
 */
const TRACK: AdminOrderStatus[] = ["pending", "confirmed", "processing", "shipped", "delivered"];

export function StatusTrack({ status }: { status: AdminOrderStatus }) {
  const { t } = useTranslation();
  const off = status === "cancelled" || status === "refunded";
  const index = TRACK.indexOf(status);

  if (off) {
    return (
      <p className="m-0 flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        <CircleSlash size={13} aria-hidden="true" />
        {t(`admin.orders.trackOff.${status}`)}
      </p>
    );
  }

  return (
    <ol className="m-0 flex list-none flex-wrap items-center gap-0 p-0">
      {TRACK.map((step, i) => {
        const done = i <= index;
        const current = i === index;
        return (
          <li key={step} className="flex items-center">
            <span className="flex items-center gap-1.5">
              <Circle
                size={current ? 13 : 9}
                aria-hidden="true"
                strokeWidth={current ? 3 : 2}
                className={done ? "text-[var(--gt-emerald-500)]" : "text-[var(--gt-ink-300)]"}
                fill={done ? "currentColor" : "none"}
              />
              <span
                className={
                  current
                    ? "text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]"
                    : "text-[length:var(--text-caption)] text-[var(--text-subtle)]"
                }
              >
                {t(`admin.orders.orderStatus.${step}`)}
              </span>
              {current && <span className="sr-only">{t("admin.orders.currentStep")}</span>}
            </span>
            {i < TRACK.length - 1 && (
              <span
                aria-hidden="true"
                className={`mx-2 h-px w-4 sm:w-7 ${i < index ? "bg-[var(--gt-emerald-400)]" : "bg-[var(--border-subtle)]"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
