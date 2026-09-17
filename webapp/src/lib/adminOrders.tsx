import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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

/**
 * The order book as the back office sees it, held in memory.
 *
 * In-memory mockup state, like `cart.tsx`, `orders.tsx` and `progress.tsx`.
 * Marking an order shipped here moves the KPI row, the badge, the fulfilment
 * column and the order's own timeline at once, which is the whole point: a
 * prototype that shows a toast without moving the data teaches the wrong thing
 * about what the action does.
 *
 * None of this is authorization, and none of it is fulfilment. A real status
 * change is a server-side transition behind explicit RBAC, recorded in an audit
 * log, and a real refund is a Stripe API call whose webhook — not the browser —
 * writes the new state (`AGENTS.md` sections 7 and 8). Nothing in this file may
 * be relied on by the production app.
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
  /** Moves one order along, updating fulfilment and timeline with it. */
  setStatus: (reference: string, status: AdminOrderStatus) => void;
  /** Same, for a batch selected in the table. */
  setStatusMany: (references: string[], status: AdminOrderStatus) => void;
  /** Records a refund: full or partial, with the amount actually given back. */
  refund: (reference: string, amount: number, full: boolean) => void;
  cancel: (reference: string) => void;
  cancelMany: (references: string[]) => void;
  addNote: (reference: string, body: string, author: string) => void;
}

const AdminOrdersContext = createContext<AdminOrdersContextValue | null>(null);

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

export function AdminOrdersProvider({ children }: { children: ReactNode }) {
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
    () => ({ orders, setStatus, setStatusMany, refund, cancel, cancelMany, addNote }),
    [orders, setStatus, setStatusMany, refund, cancel, cancelMany, addNote],
  );

  return <AdminOrdersContext.Provider value={value}>{children}</AdminOrdersContext.Provider>;
}

export function useAdminOrders() {
  const ctx = useContext(AdminOrdersContext);
  if (!ctx) throw new Error("useAdminOrders must be used within AdminOrdersProvider");
  return ctx;
}
