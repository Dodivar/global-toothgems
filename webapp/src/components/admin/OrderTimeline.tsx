import { useTranslation } from "react-i18next";
import {
  Ban,
  CheckCircle2,
  CircleSlash,
  MapPinOff,
  PackageOpen,
  PackageX,
  RotateCcw,
  ShoppingBag,
  Split,
  Timer,
  Truck,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TimelineEvent, TimelineKind } from "../../data/adminOrders";

/**
 * The order's history, oldest first.
 *
 * Oldest first, not newest: this is read to understand how the order got where
 * it is, and a story told backwards has to be re-read. The connecting line is
 * drawn by the markers themselves rather than by a border on the list, so the
 * last event has no trailing stub.
 *
 * Tone is carried by the marker, and the event is always named in words. The
 * flagged events — an address held, a stock shortage, a delay — sit in the same
 * timeline as the rest, because from an operator's point of view they *are* part
 * of the order's history, not a separate alert log.
 */

const META: Record<TimelineKind, { icon: LucideIcon; tone: "neutral" | "good" | "warn" | "bad" }> = {
  placed: { icon: ShoppingBag, tone: "neutral" },
  paymentConfirmed: { icon: CheckCircle2, tone: "good" },
  paymentFailed: { icon: XCircle, tone: "bad" },
  processing: { icon: PackageOpen, tone: "neutral" },
  shipped: { icon: Truck, tone: "neutral" },
  delivered: { icon: CheckCircle2, tone: "good" },
  cancelled: { icon: Ban, tone: "bad" },
  refundRequested: { icon: RotateCcw, tone: "warn" },
  refunded: { icon: RotateCcw, tone: "neutral" },
  partiallyRefunded: { icon: Split, tone: "warn" },
  addressFlagged: { icon: MapPinOff, tone: "warn" },
  stockFlagged: { icon: PackageX, tone: "warn" },
  delayFlagged: { icon: Timer, tone: "warn" },
  fulfillmentFlagged: { icon: CircleSlash, tone: "warn" },
};

const TONE_CLASS = {
  neutral: "border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-muted)]",
  good: "border-[var(--gt-emerald-300)] bg-[var(--gt-emerald-50)] text-[var(--status-success-fg)]",
  warn: "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
  bad: "border-[var(--gt-red-400)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]",
} as const;

export function OrderTimeline({ events }: { events: TimelineEvent[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("en") ? "en-IE" : "fr-FR";
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });

  return (
    <ol className="m-0 grid list-none gap-0 p-0">
      {events.map((event, index) => {
        const meta = META[event.kind];
        const Icon = meta.icon;
        const when = new Date(`${event.at}:00`);
        const last = index === events.length - 1;
        return (
          <li key={`${event.kind}-${event.at}-${index}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <span className="grid justify-items-center">
              <span
                aria-hidden="true"
                className={`grid h-7 w-7 place-items-center rounded-full border ${TONE_CLASS[meta.tone]}`}
              >
                <Icon size={13} strokeWidth={2.2} />
              </span>
              {!last && <span aria-hidden="true" className="w-px flex-1 bg-[var(--border-subtle)]" />}
            </span>
            <span className={`grid gap-0.5 ${last ? "" : "pb-4"}`}>
              <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                {t(`admin.orders.timeline.${event.kind}`)}
              </span>
              <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
                {dateFormat.format(when)} — {timeFormat.format(when)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
