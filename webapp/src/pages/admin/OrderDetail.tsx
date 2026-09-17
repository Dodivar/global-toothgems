import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, ChevronLeft, ChevronRight, History, Printer, RotateCcw, SlidersHorizontal } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { Button } from "../../components/ui/Button";
import { Card, CustomerCard, ItemsCard, PaymentCard, ShippingCard } from "../../components/admin/DetailPanels";
import { OrderTimeline } from "../../components/admin/OrderTimeline";
import { OrderNotes } from "../../components/admin/OrderNotes";
import {
  AttentionBadge,
  FulfillmentBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  StatusTrack,
} from "../../components/admin/StatusBadges";
import { CancelDialog, RefundDialog, StatusDialog } from "../../components/admin/OrderDialogs";
import { useAdminOrders } from "../../lib/adminOrders";
import { useToast } from "../../lib/toast";
import { formatPrice } from "../../lib/format";
import { orderItemCount, orderTotal, type AdminOrder } from "../../data/adminOrders";
import { useAdminShell } from "./AdminLayout";

/**
 * One order, in full.
 *
 * A route rather than a drawer. Three reasons, in order of weight: the member
 * area already established one URL per section and `vercel.json` rewrites every
 * path so a deep link survives a refresh; an order is the thing a colleague
 * pastes into a message, and a drawer has no address; and the record is too
 * tall to read in a panel — items, money, address, carrier, payment, history and
 * notes is a page's worth of content, and a drawer would just add a scroll
 * inside a scroll.
 *
 * The list's own query string travels in the URL, so the breadcrumb's
 * "Commandes" and the back link both return to the same filtered page rather
 * than to row one.
 *
 * The workspace's `AdminHeader` carries the reference, the breadcrumb and the
 * one primary action, the way `AdminProducts` does — its actions slot is
 * `flex-none`, so a second button there overflows a 375px screen. Printing and
 * the destructive pair live in the order panel instead, which has room at any
 * width and keeps "cancel" off a bar the cursor crosses all day.
 */

/** The author every note typed in this prototype is attributed to. */
const CURRENT_OPERATOR = "Léa — Support";

export function OrderDetail() {
  const { t } = useTranslation();
  const { reference = "" } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { orders, setStatus, refund, cancel, addNote } = useAdminOrders();

  const order = orders.find((o) => o.reference === reference);

  /** Neighbours in the book, so an operator can work through a queue in place. */
  const { previous, next } = useMemo(() => {
    const index = orders.findIndex((o) => o.reference === reference);
    return {
      previous: index > 0 ? orders[index - 1] : undefined,
      next: index >= 0 && index < orders.length - 1 ? orders[index + 1] : undefined,
    };
  }, [orders, reference]);

  const [statusOpen, setStatusOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const backTo = `/admin/commandes${search}`;

  if (!order) {
    return (
      <section className="grid justify-items-start gap-4 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] p-[var(--space-8)]">
        <h1 className="text-[length:var(--text-h3)]">{t("admin.orders.detailMissingTitle")}</h1>
        <p className="m-0 max-w-[48ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("admin.orders.detailMissingBody", { reference: `#${reference}` })}
        </p>
        <Button size="sm" variant="outline" iconLeft={ArrowLeft} onClick={() => navigate("/admin/commandes")}>
          {t("admin.orders.backToOrders")}
        </Button>
      </section>
    );
  }

  const closed = order.status === "cancelled" || order.status === "refunded";
  const refundable = order.payment.status === "paid" || order.payment.status === "partiallyRefunded";
  const notWired = () => showToast(t("common.notIncludedTitle"), t("admin.orders.toastNotWired"), "info");

  const neighbourLink = (target: AdminOrder | undefined, direction: "previous" | "next") => {
    if (!target) return null;
    const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
    return (
      <Link
        to={`/admin/commandes/${target.reference}${search}`}
        aria-label={t(direction === "previous" ? "admin.orders.previousOrder" : "admin.orders.nextOrder", {
          reference: `#${target.reference}`,
        })}
        className="grid h-9 w-9 place-items-center rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <Icon size={16} aria-hidden="true" />
      </Link>
    );
  };

  return (
    <>
      <AdminHeader
        title={`#${order.reference}`}
        crumbs={[
          { label: t("admin.nav.dashboard"), to: "/admin" },
          { label: t("admin.nav.orders"), to: backTo },
          { label: `#${order.reference}` },
        ]}
        onOpenNav={openNav}
        actions={
          <AdminButton
            variant="primary"
            iconLeft={SlidersHorizontal}
            disabled={closed}
            onClick={() => setStatusOpen(true)}
          >
            {t("admin.orders.actionAdvance")}
          </AdminButton>
        }
      />

      <div className="grid gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
      {/* Back link and queue navigation. The breadcrumb above already leads to
          the list; this row is for working through a queue order by order
          without going back to it. */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {t("admin.orders.backToOrders")}
        </Link>
        <span className="ml-auto flex items-center gap-1.5">
          {neighbourLink(previous, "previous")}
          {neighbourLink(next, "next")}
        </span>
      </div>

      {/* The order's own summary: when it was placed, the three states, how far
          along it is, and the two decisions. Everything an operator needs
          before choosing what to do with it. */}
      <div className="gt-admin-panel grid gap-4 p-[var(--space-5)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <span className="gt-eyebrow">{t("admin.orders.detailEyebrow")}</span>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {t("admin.orders.detailPlaced", {
                date: new Intl.DateTimeFormat(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(`${order.placedAt}:00`)),
              })}
              {" · "}
              {t("admin.orders.itemsUnits", { count: orderItemCount(order) })}
            </p>
          </div>

          <div className="grid justify-items-start gap-1 sm:justify-items-end">
            <span className="gt-eyebrow">{t("admin.orders.summaryTotal")}</span>
            <strong className="text-[length:var(--text-h2)] font-[var(--weight-black)] tabular-nums leading-none text-[var(--text-primary)]">
              {formatPrice(orderTotal(order))}
            </strong>
          </div>
        </div>

        {order.attention && (
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--gt-fuchsia-300)] bg-[var(--gt-fuchsia-50)] p-3">
            <AttentionBadge reason={order.attention} size="sm" />
            <p className="m-0 flex-1 text-[length:var(--text-body-sm)] text-[var(--accent-highlight-ink)]">
              {t(`admin.orders.attentionBody.${order.attention}`)}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.payment.status} />
          <FulfillmentBadge status={order.fulfillment} />
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-4">
          <StatusTrack status={order.status} />
        </div>

        {/* Printing on the left, the two decisions on the right. `ml-auto` is
            what keeps them apart: nobody should reach "cancel" on the way to
            "print". */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-4">
          <AdminButton variant="outline" iconLeft={Printer} onClick={() => notWired()}>
            {t("admin.orders.actionPrintInvoice")}
          </AdminButton>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {refundable && (
              <Button size="sm" variant="ghost" iconLeft={RotateCcw} onClick={() => setRefundOpen(true)}>
                {t("admin.orders.actionRefund")}
              </Button>
            )}
            {!closed && order.status !== "delivered" && (
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-red-400)] px-4 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--status-error-fg)] transition-colors hover:bg-[var(--status-error-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <Ban size={14} aria-hidden="true" />
                {t("admin.orders.actionCancel")}
              </button>
            )}
          </span>
        </div>
      </div>

      {/* Two columns on desktop: the order itself on the left, who and where on
          the right. One column below `xl`, in reading order. */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="grid min-w-0 gap-4">
          <ItemsCard order={order} />
          <ShippingCard
            order={order}
            onTrack={() =>
              showToast(
                t("admin.orders.toastTrackTitle", { carrier: order.shipment?.carrier ?? "" }),
                t("admin.orders.toastTrackBody", { number: order.shipment?.number ?? "" }),
                "info",
              )
            }
          />
          <OrderNotes
            notes={order.notes}
            author={CURRENT_OPERATOR}
            onAdd={(body) => {
              addNote(order.reference, body, CURRENT_OPERATOR);
              showToast(t("admin.orders.toastNoteTitle"), t("admin.orders.toastNoteBody"));
            }}
          />
        </div>

        <div className="grid min-w-0 gap-4">
          <CustomerCard
            order={order}
            onViewProfile={() => {
              navigate(`/admin/commandes?client=${order.customer.id}`);
              showToast(
                t("admin.orders.toastCustomerTitle"),
                t("admin.orders.toastCustomerBody", {
                  name: `${order.customer.firstName} ${order.customer.lastName}`,
                }),
                "info",
              );
            }}
          />
          <PaymentCard order={order} />
          <Card title={t("admin.orders.timelineTitle")} icon={History}>
            <OrderTimeline events={order.timeline} />
          </Card>
        </div>
      </div>

      <StatusDialog
        order={statusOpen ? order : null}
        onClose={() => setStatusOpen(false)}
        onConfirm={(status) => {
          setStatus(order.reference, status);
          showToast(
            t("admin.orders.toastStatusTitle", { reference: `#${order.reference}` }),
            t("admin.orders.toastStatusBody", { status: t(`admin.orders.orderStatus.${status}`) }),
          );
          setStatusOpen(false);
        }}
      />

      <RefundDialog
        order={refundOpen ? order : null}
        onClose={() => setRefundOpen(false)}
        onConfirm={(amount, full) => {
          refund(order.reference, amount, full);
          showToast(
            t("admin.orders.toastRefundTitle", { reference: `#${order.reference}` }),
            t("admin.orders.toastRefundBody", { amount: formatPrice(amount) }),
          );
          setRefundOpen(false);
        }}
      />

      <CancelDialog
        orders={cancelOpen ? [order] : []}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => {
          cancel(order.reference);
          showToast(
            t("admin.orders.toastCancelTitle", { reference: `#${order.reference}` }),
            t("admin.orders.toastCancelBody"),
            "warning",
          );
          setCancelOpen(false);
        }}
      />
      </div>
    </>
  );
}
