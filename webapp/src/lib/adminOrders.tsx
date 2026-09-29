import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ADMIN_ORDERS,
  orderTotal,
  type AdminNote,
  type AdminOrder,
  type AdminOrderStatus,
  type FulfillmentStatus,
  type TimelineEvent,
  type TimelineKind,
} from "../data/adminOrders";
import { useCatalog } from "./catalog/CatalogProvider";
import { fulfillmentToDb, mapAdminOrders, type AdminOrderRow } from "./adminOrderMapping";
import { isSupabaseConfigured, requireSupabase } from "./supabase/client";
import { useToast } from "./toast";

/**
 * The order book as the back office sees it.
 *
 * With Supabase configured it is read from `orders` (RLS: staff read every
 * order) and status changes, cancellations and notes are written there; the
 * database's triggers apply stock, loyalty and audit-log effects. Refunds are
 * not offered: a refund is a Stripe API call whose webhook — not the browser —
 * writes the new state (`AGENTS.md` sections 7 and 8), and that backend does
 * not exist yet.
 *
 * Without Supabase, the prototype's in-memory book is used. Marking an order
 * shipped there moves the KPI row, the badge, the fulfilment column and the
 * order's own timeline at once, so the prototype does not show a toast without
 * moving the data. None of the mock is authorization or fulfilment.
 */

/** What a status change implies for fulfilment, so the two never disagree. */
const FULFILLMENT_FOR: Partial<Record<AdminOrderStatus, FulfillmentStatus>> = {
  processing: "preparing",
  shipped: "fulfilled",
  delivered: "fulfilled",
};

/** The timeline entry a status change writes, when it writes one. */
const EVENT_FOR: Partial<Record<AdminOrderStatus, TimelineKind>> = {
  processing: "processing",
  shipped: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
  refunded: "refunded",
};

export interface AdminOrdersContextValue {
  orders: AdminOrder[];
  /** True until the first read of the book has answered. */
  loading: boolean;
  /** Moves one order along, updating fulfilment and timeline with it. */
  setStatus: (reference: string, status: AdminOrderStatus) => void;
  /** Same, for a batch selected in the table. */
  setStatusMany: (references: string[], status: AdminOrderStatus) => void;
  /**
   * Records a refund: full or partial, with the amount actually given back.
   * Returns false when refunds cannot be made here (the caller then says so
   * instead of confirming).
   */
  refund: (reference: string, amount: number, full: boolean) => boolean;
  cancel: (reference: string) => void;
  cancelMany: (references: string[]) => void;
  addNote: (reference: string, body: string, author: string) => void;
}

const AdminOrdersContext = createContext<AdminOrdersContextValue | null>(null);

export function AdminOrdersProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseAdminOrdersProvider>{children}</SupabaseAdminOrdersProvider>
  ) : (
    <MockAdminOrdersProvider>{children}</MockAdminOrdersProvider>
  );
}

/* ------------------------------------------------------------------ */
/* Supabase                                                           */
/* ------------------------------------------------------------------ */

const ADMIN_ORDER_SELECT = `
  id, order_number, user_id, customer_email, billing_address, shipping_address, status, payment_status,
  fulfillment_status, discount_amount, shipping_amount, currency, admin_note, created_at, updated_at,
  order_items ( product_name, variant_name, unit_price, quantity, product:products ( slug ) ),
  shipments ( status, carrier, tracking_number, estimated_delivery, shipped_at, delivered_at, created_at ),
  payments ( provider_payment_id, provider_checkout_id, status, amount, amount_refunded, payment_method_type,
             card_brand, card_last4, created_at )
`;

/** Unpaid checkouts that expired are noise in the book; failed payments stay visible. */
function isInBook(row: AdminOrderRow): boolean {
  return !(row.status === "cancelled" && row.payment_status === "pending");
}

function SupabaseAdminOrdersProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { findProduct } = useCatalog();
  const [rows, setRows] = useState<AdminOrderRow[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    requireSupabase()
      .from("orders")
      .select(ADMIN_ORDER_SELECT)
      .order("created_at", { ascending: false })
      .abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) {
          console.error("[admin orders] load failed", error.message);
          setRows([]);
          showToast(t("admin.orders.loadErrorTitle"), t("admin.orders.loadErrorBody"), "error");
          return;
        }
        setRows((data as unknown as AdminOrderRow[]).filter(isInBook));
      });
    return () => controller.abort();
  }, [attempt, showToast, t]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const orders = useMemo(() => (rows ? mapAdminOrders(rows, findProduct) : []), [rows, findProduct]);

  const idsOf = useCallback(
    (references: string[]) => (rows ?? []).filter((r) => references.includes(r.order_number)).map((r) => r.id),
    [rows],
  );

  /** Runs the writes, then re-reads the book; a refusal is said, never hidden. */
  const write = useCallback(
    (run: () => Promise<{ error: unknown }[]>) => {
      void run()
        .then((results) => {
          const failed = results.find((r) => r.error);
          if (failed) throw failed.error;
        })
        .catch((error: unknown) => {
          console.error("[admin orders] write refused", error);
          showToast(t("admin.orders.writeErrorTitle"), t("admin.orders.writeErrorBody"), "error");
        })
        .finally(reload);
    },
    [reload, showToast, t],
  );

  const setStatusMany = useCallback(
    (references: string[], status: AdminOrderStatus) => {
      const fulfillment = FULFILLMENT_FOR[status];
      const patch = { status, ...(fulfillment ? { fulfillment_status: fulfillmentToDb(fulfillment) } : {}) };
      write(async () => [await requireSupabase().from("orders").update(patch).in("id", idsOf(references))]);
    },
    [write, idsOf],
  );

  const setStatus = useCallback((reference: string, status: AdminOrderStatus) => setStatusMany([reference], status), [setStatusMany]);

  const cancelMany = useCallback(
    (references: string[]) =>
      write(() => Promise.all(idsOf(references).map((id) => requireSupabase().rpc("cancel_order", { p_order_id: id })))),
    [write, idsOf],
  );

  const cancel = useCallback((reference: string) => cancelMany([reference]), [cancelMany]);

  const refund = useCallback(() => {
    showToast(t("admin.orders.refundUnavailableTitle"), t("admin.orders.refundUnavailableBody"), "info");
    return false;
  }, [showToast, t]);

  /** Appended to the order's single note column, signed and dated. */
  const addNote = useCallback(
    (reference: string, body: string, author: string) => {
      const row = rows?.find((r) => r.order_number === reference);
      if (!row) return;
      const entry = `${author} · ${new Date().toLocaleString()}\n${body.trim()}`;
      const note = row.admin_note ? `${row.admin_note}\n\n${entry}` : entry;
      write(async () => [await requireSupabase().from("orders").update({ admin_note: note }).eq("id", row.id)]);
    },
    [rows, write],
  );

  const value = useMemo<AdminOrdersContextValue>(
    () => ({ orders, loading: rows === null, setStatus, setStatusMany, refund, cancel, cancelMany, addNote }),
    [orders, rows, setStatus, setStatusMany, refund, cancel, cancelMany, addNote],
  );

  return <AdminOrdersContext.Provider value={value}>{children}</AdminOrdersContext.Provider>;
}

/* ------------------------------------------------------------------ */
/* Mock (no Supabase configured)                                      */
/* ------------------------------------------------------------------ */

/** Now, in the `YYYY-MM-DDTHH:mm` shape the seeded data uses. */
function now(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function withEvent(order: AdminOrder, kind: TimelineKind | undefined): TimelineEvent[] {
  if (!kind) return order.timeline;
  return [...order.timeline, { kind, at: now() }];
}

function MockAdminOrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<AdminOrder[]>(ADMIN_ORDERS);

  const patch = useCallback((references: string[], update: (order: AdminOrder) => AdminOrder) => {
    const set = new Set(references);
    setOrders((prev) => prev.map((o) => (set.has(o.reference) ? update(o) : o)));
  }, []);

  const applyStatus = useCallback(
    (references: string[], status: AdminOrderStatus) => {
      patch(references, (order) => ({
        ...order,
        status,
        fulfillment: FULFILLMENT_FOR[status] ?? order.fulfillment,
        // A status change never invents a payment: an unpaid order marked
        // "processing" stays unpaid, and the attention flag stays until the
        // reason behind it is actually resolved.
        timeline: withEvent(order, EVENT_FOR[status]),
      }));
    },
    [patch],
  );

  const setStatus = useCallback((reference: string, status: AdminOrderStatus) => applyStatus([reference], status), [applyStatus]);
  const setStatusMany = useCallback((references: string[], status: AdminOrderStatus) => applyStatus(references, status), [applyStatus]);

  const refund = useCallback(
    (reference: string, amount: number, full: boolean) => {
      patch([reference], (order) => ({
        ...order,
        status: full ? "refunded" : order.status,
        payment: {
          ...order.payment,
          status: full ? "refunded" : "partiallyRefunded",
          refunded: amount,
        },
        // The refund answers the request, so the queue marker goes with it.
        attention: order.attention === "refundRequested" ? undefined : order.attention,
        timeline: withEvent(order, full ? "refunded" : "partiallyRefunded"),
      }));
      return true;
    },
    [patch],
  );

  /**
   * One cancellation, or a whole selection, in a single update.
   *
   * Written as one `patch` rather than a loop over single cancellations: the
   * loop worked — React applies queued functional updaters in order — but it
   * spent one updater per order and stamped each one with its own `now()`, so
   * twelve orders cancelled by one click carried twelve different times. The
   * refunded amount is still each order's own total, because it is read from
   * the order being mapped.
   */
  const cancelAll = useCallback(
    (references: string[]) => {
      const at = now();
      patch(references, (order) => {
        const paid = order.payment.status === "paid";
        return {
          ...order,
          status: "cancelled",
          fulfillment: "unfulfilled",
          payment: paid ? { ...order.payment, status: "refunded", refunded: orderTotal(order) } : order.payment,
          timeline: paid
            ? [
                ...order.timeline,
                { kind: "cancelled" as TimelineKind, at },
                { kind: "refunded" as TimelineKind, at },
              ]
            : [...order.timeline, { kind: "cancelled" as TimelineKind, at }],
        };
      });
    },
    [patch],
  );

  const cancel = useCallback((reference: string) => cancelAll([reference]), [cancelAll]);
  const cancelMany = cancelAll;

  const addNote = useCallback(
    (reference: string, body: string, author: string) => {
      patch([reference], (order) => {
        const note: AdminNote = {
          id: `${reference}-n${order.notes.length + 1}`,
          author,
          at: now(),
          // A note typed now exists in one language only. Storing the same
          // string under both keys is honest about that: it is what was
          // written, not a translation of it.
          body: { fr: body, en: body },
        };
        return { ...order, notes: [...order.notes, note] };
      });
    },
    [patch],
  );

  const value = useMemo<AdminOrdersContextValue>(
    () => ({ orders, loading: false, setStatus, setStatusMany, refund, cancel, cancelMany, addNote }),
    [orders, setStatus, setStatusMany, refund, cancel, cancelMany, addNote],
  );

  return <AdminOrdersContext.Provider value={value}>{children}</AdminOrdersContext.Provider>;
}

export function useAdminOrders() {
  const ctx = useContext(AdminOrdersContext);
  if (!ctx) throw new Error("useAdminOrders must be used within AdminOrdersProvider");
  return ctx;
}
