"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Download, ExternalLink, MapPin, Package, Printer, Receipt, RotateCcw, RotateCw, Truck } from "lucide-react";
import { Link, useParams } from "../../lib/navigation";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyPanel } from "../../components/account/SectionHeader";
import { OrderStatusBadges, ShipmentTracking } from "../../components/account/OrderCard";
import { OrderLineThumb } from "../../components/account/OrderLineThumb";
import { OrderLineReviewAction } from "../../components/reviews/OrderLineReviewAction";
import { isActiveOrder, isShipment, type Order, type OrderAddress, type OrderParcel } from "../../data/orders";
import { pick } from "../../data/types";
import { useFormat } from "../../lib/format";
import { useOrders } from "../../lib/orders";
import { courseHref } from "../../lib/academyUrl";
import { orderAmountRows, orderDocument, orderDocumentFileName } from "../../lib/documents/orderDocument";
import { useDocumentDownload } from "../../lib/documents/useDocumentDownload";
import { fetchStoreDetails } from "../../lib/storeDetails";
import { supabase } from "../../lib/supabase/client";

/**
 * One order, as recorded: the lines frozen at purchase time, every amount the
 * database stored (never recomputed), the parcels and their tracking, the
 * refunds and the two address snapshots. Read through `lib/orders.tsx`, so
 * RLS decides which orders exist here: another account's reference is simply
 * not found.
 *
 * "Print the summary" prints this page as an order summary, and "Download
 * the order form" produces the same content as a PDF (`lib/documents/`, the
 * site's document template, with the store's legal identity read from
 * Settings). Both are labelled as not being an invoice: invoices need a legal
 * sequential numbering the database does not have yet (supabase/README.md,
 * "Next iterations").
 */
export function OrderDetail() {
  const { t } = useTranslation();
  const { reference = "" } = useParams();
  const { orders, status, reload } = useOrders();
  const order = orders.find((o) => o.reference === reference);

  const back = (
    <Link
      to="/compte/commandes"
      className="gt-no-print inline-flex items-center gap-2 justify-self-start rounded-[2px] text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      <ArrowLeft size={14} aria-hidden="true" />
      {t("account.orderDetail.back")}
    </Link>
  );

  if (status === "loading") {
    return (
      <section className="grid gap-5">
        {back}
        <h1 className="text-[length:var(--text-h2)]">{t("account.orderReference", { reference })}</h1>
        <p role="status" aria-busy="true" className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("account.ordersLoading")}
        </p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="grid gap-5">
        {back}
        <h1 className="text-[length:var(--text-h2)]">{t("account.orderReference", { reference })}</h1>
        <div role="alert">
          <EmptyPanel
            action={
              <Button variant="outline" size="sm" iconLeft={RotateCw} onClick={reload}>
                {t("account.ordersRetry")}
              </Button>
            }
          >
            {t("account.ordersLoadError")}
          </EmptyPanel>
        </div>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="grid gap-5">
        {back}
        <h1 className="text-[length:var(--text-h2)]">{t("account.orderDetail.notFoundTitle")}</h1>
        <EmptyPanel>{t("account.orderDetail.notFoundBody")}</EmptyPanel>
      </section>
    );
  }

  return <OrderDetailView order={order} back={back} />;
}

function OrderDetailView({ order, back }: { order: Order; back: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { formatDate } = useFormat();

  return (
    <article className="gt-print-area grid gap-[clamp(20px,3vw,32px)]">
      <header className="grid gap-3">
        {back}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-2">
            <span className="gt-eyebrow flex items-center gap-2">
              <Package size={13} aria-hidden="true" />
              {t("account.ordersEyebrow")}
            </span>
            <h1 className="text-[length:var(--text-h2)]">{t("account.orderReference", { reference: order.reference })}</h1>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {t("account.orderPlacedOn", { date: formatDate(order.placedOn) })}
            </p>
          </div>
          <div className="gt-no-print flex flex-wrap gap-2">
            <OrderDocumentButton order={order} />
            <Button variant="outline" size="sm" iconLeft={Printer} onClick={() => window.print()}>
              {t("account.orderDetail.printRecap")}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="sr-only">{t("account.orderDetail.statusLabel")}</span>
          <OrderStatusBadges order={order} />
        </div>
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("account.orderDetail.recapNotice")}</p>
      </header>

      {isShipment(order) && <ShipmentTracking order={order} />}

      <div className="grid gap-[clamp(20px,3vw,32px)] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid gap-[clamp(20px,3vw,32px)]">
          <Lines order={order} lang={i18n.language} />
          <Delivery order={order} lang={i18n.language} />
          {order.refunds.length > 0 && <Refunds order={order} lang={i18n.language} />}
        </div>
        <div className="grid gap-[clamp(20px,3vw,32px)]">
          <Amounts order={order} />
          <Addresses order={order} />
        </div>
      </div>
    </article>
  );
}

/** The order form as a PDF, with the seller's identity as Settings holds it today. */
function OrderDocumentButton({ order }: { order: Order }) {
  const { t, i18n } = useTranslation();
  const { formatDate, formatMoney, locale } = useFormat();
  const { status, download } = useDocumentDownload();
  const working = status === "working";

  const onDownload = () =>
    void download(async () => {
      const store = supabase ? await fetchStoreDetails(supabase) : null;
      const lang = i18n.language.startsWith("en") ? "en" : "fr";
      const fmt = {
        lang,
        money: (minor: number, currency: string) => formatMoney(minor, currency),
        date: (iso: string) => formatDate(iso),
        country: (code: string) => countryName(code, locale),
      };
      const issuedOn = new Date().toISOString().slice(0, 10);
      return { document: orderDocument(order, store, t, fmt, issuedOn), fileName: orderDocumentFileName(order.reference, t) };
    });

  return (
    <span className="grid justify-items-end gap-1">
      <Button variant="outline" size="sm" iconLeft={Download} onClick={onDownload} disabled={working} aria-busy={working}>
        {working ? t("account.orderDetail.downloadPdfWorking") : t("account.orderDetail.downloadPdf")}
      </Button>
      {status === "error" && (
        <span role="alert" className="max-w-[32ch] text-right text-[length:var(--text-caption)] text-[var(--status-error-fg)]">
          {t("account.orderDetail.downloadPdfError")}
        </span>
      )}
    </span>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Package; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]">
      <h2 className="flex items-center gap-2 text-[length:var(--text-h4)]">
        <Icon size={16} aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Lines({ order, lang }: { order: Order; lang: string }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const active = isActiveOrder(order);
  return (
    <Card title={t("account.orderDetail.itemsTitle")} icon={Package}>
      <ul className="m-0 grid list-none gap-4 p-0">
        {order.lines.map((line) => {
          const name = pick(line.name, lang);
          return (
            <li key={line.id} className="flex items-start gap-3">
              <OrderLineThumb line={line} size={56} />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                  {line.productId || line.courseId ? (
                    <Link
                      to={line.productId ? `/boutique/${line.productId}` : courseHref(line.courseId!)}
                      className="underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]"
                    >
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </span>
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {line.variant ? `${pick(line.variant, lang)} · ` : ""}
                  {t("account.orderQty", { qty: line.qty })} ·{" "}
                  {t("account.orderDetail.unitPrice", { price: formatMoney(line.unitAmount, order.currency) })}
                </span>
                {line.discountAmount > 0 && (
                  <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">
                    {t("account.orderDetail.lineDiscount", { amount: formatMoney(line.discountAmount, order.currency) })}
                  </span>
                )}
                {active && (
                  <span className="gt-no-print">
                    <OrderLineReviewAction line={line} />
                  </span>
                )}
              </span>
              <span className="whitespace-nowrap text-[length:var(--text-body-sm)] tabular-nums text-[var(--text-body)]">
                {formatMoney(line.totalAmount, order.currency)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div
      className={
        "flex items-baseline justify-between gap-4 " +
        (strong
          ? "border-t border-[var(--border-subtle)] pt-2 font-bold text-[var(--text-primary)]"
          : muted
            ? "text-[var(--text-muted)]"
            : "text-[var(--text-body)]")
      }
    >
      <dt>{label}</dt>
      <dd className="m-0 tabular-nums">{value}</dd>
    </div>
  );
}

/** The recorded amounts, in the order they add up (`orderAmountRows`, shared with the PDF). Nothing is recomputed. */
function Amounts({ order }: { order: Order }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const rows = orderAmountRows(order, t, (minor) => formatMoney(minor, order.currency));

  return (
    <Card title={t("account.orderDetail.summaryTitle")} icon={Receipt}>
      <dl className="m-0 grid gap-2 text-[length:var(--text-body-sm)]">
        {rows.map((row) => (
          <Row key={row.key} label={row.label} value={row.value} strong={row.emphasis === "strong"} muted={row.emphasis === "muted"} />
        ))}
      </dl>
    </Card>
  );
}

function Delivery({ order, lang }: { order: Order; lang: string }) {
  const { t } = useTranslation();
  if (!order.ships) {
    return (
      <Card title={t("account.orderDetail.deliveryTitle")} icon={Truck}>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("account.orderDetail.noShipping")}</p>
      </Card>
    );
  }
  return (
    <Card title={t("account.orderDetail.deliveryTitle")} icon={Truck}>
      {order.shippingMethod && (
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
          {t("account.orderDetail.shippingMethod", { method: order.shippingMethod })}
        </p>
      )}
      {order.parcels.length === 0 ? (
        isActiveOrder(order) && (
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("account.orderDetail.noParcel")}</p>
        )
      ) : (
        <ol className="m-0 grid list-none gap-3 p-0">
          {order.parcels.map((parcel, i) => (
            <Parcel key={parcel.id} parcel={parcel} number={i + 1} order={order} lang={lang} />
          ))}
        </ol>
      )}
    </Card>
  );
}

function Parcel({ parcel, number, order, lang }: { parcel: OrderParcel; number: number; order: Order; lang: string }) {
  const { t } = useTranslation();
  const { formatDateShort } = useFormat();
  const lineName = (lineId: string) => {
    const line = order.lines.find((l) => l.id === lineId);
    return line ? pick(line.name, lang) : null;
  };
  const tone = parcel.status === "delivered" ? "success" : parcel.status === "shipped" ? "brand" : parcel.status === "preparing" ? "warning" : "neutral";

  return (
    <li className="grid gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-4 text-[length:var(--text-caption)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
          {t("account.orderDetail.parcelTitle", { number })}
        </strong>
        <Badge tone={tone} size="sm">
          {t(`account.orderDetail.parcelStatus.${parcel.status}`)}
        </Badge>
      </div>
      {(parcel.carrier || parcel.trackingNumber) && (
        <dl className="m-0 flex flex-wrap gap-x-8 gap-y-1">
          {parcel.carrier && (
            <div className="flex gap-2">
              <dt className="text-[var(--text-muted)]">{t("account.trackingCarrier")}</dt>
              <dd className="m-0 font-semibold text-[var(--text-primary)]">
                {parcel.service ? `${parcel.carrier} · ${parcel.service}` : parcel.carrier}
              </dd>
            </div>
          )}
          {parcel.trackingNumber && (
            <div className="flex gap-2">
              <dt className="text-[var(--text-muted)]">{t("account.trackingNumber")}</dt>
              <dd className="m-0 font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--gt-font-mono)" }}>
                {parcel.trackingNumber}
              </dd>
            </div>
          )}
        </dl>
      )}
      <p className="m-0 text-[var(--text-body)]">
        {parcel.deliveredOn
          ? t("account.orderDetail.parcelDeliveredOn", { date: formatDateShort(parcel.deliveredOn) })
          : [
              parcel.shippedOn && t("account.orderDetail.parcelShippedOn", { date: formatDateShort(parcel.shippedOn) }),
              parcel.estimatedDelivery &&
                parcel.status === "shipped" &&
                t("account.orderDetail.parcelEta", { date: formatDateShort(parcel.estimatedDelivery) }),
            ]
              .filter(Boolean)
              .join(" · ")}
      </p>
      {parcel.items.length > 0 && (
        <p className="m-0 text-[var(--text-muted)]">
          {t("account.orderDetail.parcelContents", {
            items: parcel.items
              .map((item) => {
                const name = lineName(item.lineId);
                return name ? `${name} × ${item.qty}` : null;
              })
              .filter(Boolean)
              .join(", "),
          })}
        </p>
      )}
      {parcel.trackingUrl && (
        <a
          href={parcel.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="gt-no-print inline-flex items-center gap-1.5 justify-self-start rounded-[2px] font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {t("account.orderDetail.parcelTrack")}
          <ExternalLink size={12} aria-hidden="true" />
          <span className="sr-only">{t("account.orderDetail.newTab")}</span>
        </a>
      )}
    </li>
  );
}

function Refunds({ order, lang }: { order: Order; lang: string }) {
  const { t } = useTranslation();
  const { formatDateShort, formatMoney } = useFormat();
  const lineName = (lineId: string) => {
    const line = order.lines.find((l) => l.id === lineId);
    return line ? pick(line.name, lang) : null;
  };
  return (
    <Card title={t("account.orderDetail.refundsTitle")} icon={RotateCcw}>
      <ul className="m-0 grid list-none gap-3 p-0">
        {order.refunds.map((refund, i) => {
          const items = refund.items
            .map((item) => {
              const name = lineName(item.lineId);
              return name ? `${name} × ${item.qty}` : null;
            })
            .filter(Boolean)
            .join(", ");
          return (
            <li key={i} className="grid gap-1 border-b border-[var(--border-subtle)] pb-3 text-[length:var(--text-caption)] last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-[length:var(--text-body-sm)] tabular-nums text-[var(--text-primary)]">
                  {formatMoney(refund.amount, order.currency)}
                </strong>
                <Badge tone={refund.status === "succeeded" ? "success" : refund.status === "pending" ? "warning" : "neutral"} size="sm">
                  {t(`account.orderDetail.refundStatus.${refund.status}`)}
                </Badge>
              </div>
              <span className="text-[var(--text-body)]">{t(`account.orderDetail.refundReason.${refund.reason}`)}</span>
              <span className="text-[var(--text-muted)]">
                {refund.processedOn
                  ? t("account.orderDetail.refundProcessedOn", { date: formatDateShort(refund.processedOn) })
                  : t("account.orderDetail.refundRequestedOn", { date: formatDateShort(refund.requestedOn) })}
              </span>
              {items && <span className="text-[var(--text-muted)]">{t("account.orderDetail.refundItems", { items })}</span>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Addresses({ order }: { order: Order }) {
  const { t } = useTranslation();
  if (!order.shippingAddress && !order.billingAddress) return null;
  return (
    <Card title={t("account.orderDetail.addressesTitle")} icon={MapPin}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        {order.shippingAddress && <Address title={t("account.orderDetail.shippingAddress")} address={order.shippingAddress} />}
        {order.billingAddress && <Address title={t("account.orderDetail.billingAddress")} address={order.billingAddress} />}
      </div>
    </Card>
  );
}

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function Address({ title, address }: { title: string; address: OrderAddress }) {
  const { locale } = useFormat();
  return (
    <div className="grid gap-1">
      <h3 className="text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
        {title}
      </h3>
      <address className="text-[length:var(--text-body-sm)] not-italic leading-relaxed text-[var(--text-body)]">
        {address.name && <span className="block font-semibold text-[var(--text-primary)]">{address.name}</span>}
        {address.company && <span className="block">{address.company}</span>}
        {address.lines.map((line, i) => (
          <span key={i} className="block">
            {line}
          </span>
        ))}
        <span className="block">{[address.postalCode, address.city].filter(Boolean).join(" ")}</span>
        {address.region && <span className="block">{address.region}</span>}
        {address.countryCode && <span className="block">{countryName(address.countryCode, locale)}</span>}
        {address.phone && <span className="block">{address.phone}</span>}
      </address>
    </div>
  );
}
