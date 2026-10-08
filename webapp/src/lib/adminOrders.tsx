import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BOOK_LIMIT, holdsMoney, type AdminOrder, type AdminOrderStatus, type FulfillmentStatus } from "../data/adminOrders";
import { useCatalog } from "./catalog/CatalogProvider";
import {
  ADMIN_ORDER_SELECT,
  fulfillmentToDb,
  mapAdminOrders,
  type AdminOrderRow,
  type OrderNoteRow,
} from "./adminOrderMapping";
import {
  cancelRefund as cancelRefundRequest,
  createShipment,
  requestRefund,
  setShipmentStatus,
  type FulfillmentResult,
  type ParcelChange,
  type ParcelInput,
  type RefundInput,
} from "./adminFulfillment";
import { isSupabaseConfigured, requireSupabase } from "./supabase/client";
import type { OrderParcel } from "../data/orders";
import { useToast } from "./toast";

/**
 * The order book as the back office sees it.
 *
 * Read from `orders` with their lines, discounts, payments, parcels and
 * refunds (RLS: every active staff member reads every order; a customer only
 * their own, a visitor nothing) and from `order_notes` (staff only, migration
 * `20260930210000_order_staff_notes`). Amounts
 * are those recorded by `create_order()`, mapped in `adminOrderMapping.ts`.
 * Status changes, cancellations (`cancel_order`) and notes are written there
 * under `manage_orders`; the database's triggers apply stock, loyalty and
 * audit-log effects.
 *
 * Parcels (`createParcel`, `changeParcel`) and card refunds (`refund`,
 * `cancelRefund`) go through `adminFulfillment.ts`. A refund is a Stripe API
 * call whose verified webhook — not the browser — records the new state
 * (`AGENTS.md` §7–8): it shows as pending here until then. For the same
 * reason, cancelling an order whose money is held is refused: refund it first.
 * The status dialog no longer sets "shipped", "delivered" or "refunded" by
 * hand: parcels and refunds drive them.
 *
 * Without Supabase (local mock mode) the book is empty: the order book is a
 * live domain, and the back office never shows invented orders.
 */

/** What a status change implies for fulfilment, so the two never disagree. */
const FULFILLMENT_FOR: Partial<Record<AdminOrderStatus, FulfillmentStatus>> = {
  processing: "preparing",
};

/** PostgREST answers at most this many rows per request (Supabase `max_rows`). */
const PAGE_ROWS = 1000;

export interface AdminOrdersContextValue {
  orders: AdminOrder[];
  /** True until the first read of the book has answered. */
  loading: boolean;
  /** The last read failed: the book shown is empty, not "no orders". */
  failed: boolean;
  /** The book holds more orders than `BOOK_LIMIT`; only the newest were read. */
  truncated: boolean;
  /** Reads the book again. */
  reload: () => void;
  /*
   * The actions below return false when they are refused before anything is
   * sent — the store has already said why — so the caller skips its success
   * message.
   */
  setStatus: (reference: string, status: AdminOrderStatus) => boolean;
  setStatusMany: (references: string[], status: AdminOrderStatus) => boolean;
  cancel: (reference: string) => boolean;
  cancelMany: (references: string[]) => boolean;
  addNote: (reference: string, body: string, author: string) => boolean;
  /** Parcels and refunds: answer with the reason when refused, and re-read the book either way. */
  createParcel: (reference: string, input: ParcelInput) => Promise<FulfillmentResult>;
  changeParcel: (parcel: OrderParcel, change: ParcelChange) => Promise<FulfillmentResult>;
  refund: (reference: string, input: RefundInput) => Promise<FulfillmentResult>;
  cancelRefund: (refundId: string) => Promise<FulfillmentResult>;
}

const AdminOrdersContext = createContext<AdminOrdersContextValue | null>(null);

export function AdminOrdersProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseAdminOrdersProvider>{children}</SupabaseAdminOrdersProvider>
  ) : (
    <EmptyAdminOrdersProvider>{children}</EmptyAdminOrdersProvider>
  );
}

interface Book {
  rows: AdminOrderRow[];
  /** Staff notes by order id, from `order_notes`. */
  notes: Map<string, OrderNoteRow>;
  truncated: boolean;
}

/** Unpaid checkouts that expired are noise in the book; failed payments stay visible. */
function isInBook(row: AdminOrderRow): boolean {
  return !(row.status === "cancelled" && row.payment_status === "pending");
}

/** The whole book, newest first, read page by page so no row is silently cut off. */
async function readBook(signal: AbortSignal): Promise<Book> {
  const client = requireSupabase();
  const rows: AdminOrderRow[] = [];
  let truncated = false;
  for (let from = 0; ; from += PAGE_ROWS) {
    if (from >= BOOK_LIMIT) {
      truncated = true;
      break;
    }
    const { data, error } = await client
      .from("orders")
      .select(ADMIN_ORDER_SELECT)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_ROWS - 1)
      .abortSignal(signal);
    if (error) throw error;
    const page = data as unknown as AdminOrderRow[];
    rows.push(...page);
    if (page.length < PAGE_ROWS) break;
  }

  const { data: noteRows, error: notesError } = await client
    .from("order_notes")
    .select("order_id, body, updated_at")
    .abortSignal(signal);
  if (notesError) throw notesError;
  const notes = new Map(noteRows.map((n) => [n.order_id, { body: n.body, updated_at: n.updated_at }]));

  return { rows: rows.filter(isInBook), notes, truncated };
}

function SupabaseAdminOrdersProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { findProduct } = useCatalog();
  const [book, setBook] = useState<Book | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    readBook(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setFailed(false);
        setBook(next);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[admin orders] load failed", error);
        setFailed(true);
        setBook({ rows: [], notes: new Map(), truncated: false });
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const orders = useMemo(
    () => (book ? mapAdminOrders(book.rows, findProduct, book.notes) : []),
    [book, findProduct],
  );

  const rowsOf = useCallback(
    (references: string[]) => (book?.rows ?? []).filter((r) => references.includes(r.order_number)),
    [book],
  );

  /** Runs the writes, then re-reads the book; a refusal is said, never hidden. */
  const write = useCallback(
    (run: () => Promise<{ error: unknown }[]>) => {
      void run()
        .then((results) => {
          const refused = results.find((r) => r.error);
          if (refused) throw refused.error;
        })
        .catch((error: unknown) => {
          console.error("[admin orders] write refused", error);
          showToast(t("admin.orders.writeErrorTitle"), t("admin.orders.writeErrorBody"), "error");
        })
        .finally(reload);
    },
    [reload, showToast, t],
  );

  /** Refuses a change that would claim a refund nobody made. */
  const refusesMoney = useCallback(
    (references: string[]) => {
      if (!orders.some((o) => references.includes(o.reference) && holdsMoney(o))) return false;
      showToast(t("admin.orders.refundUnavailableTitle"), t("admin.orders.refundUnavailableBody"), "info");
      return true;
    },
    [orders, showToast, t],
  );

  const setStatusMany = useCallback(
    (references: string[], status: AdminOrderStatus) => {
      if ((status === "cancelled" || status === "refunded") && refusesMoney(references)) return false;
      const fulfillment = FULFILLMENT_FOR[status];
      const patch = { status, ...(fulfillment ? { fulfillment_status: fulfillmentToDb(fulfillment) } : {}) };
      const ids = rowsOf(references).map((r) => r.id);
      write(async () => [await requireSupabase().from("orders").update(patch).in("id", ids)]);
      return true;
    },
    [write, rowsOf, refusesMoney],
  );

  const setStatus = useCallback((reference: string, status: AdminOrderStatus) => setStatusMany([reference], status), [setStatusMany]);

  const cancelMany = useCallback(
    (references: string[]) => {
      if (refusesMoney(references)) return false;
      const ids = rowsOf(references).map((r) => r.id);
      write(() => Promise.all(ids.map((id) => requireSupabase().rpc("cancel_order", { p_order_id: id }))));
      return true;
    },
    [write, rowsOf, refusesMoney],
  );

  const cancel = useCallback((reference: string) => cancelMany([reference]), [cancelMany]);

  /**
   * Appended to the order's notes, signed and dated (UTC). Written through
   * `orders.admin_note`: the trigger `orders_zz_move_admin_note` appends the
   * entry to `order_notes` (staff only) and empties the column, in one
   * statement under `manage_orders`.
   */
  const addNote = useCallback(
    (reference: string, body: string, author: string) => {
      const row = rowsOf([reference])[0];
      if (!row) return false;
      const stamp = `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
      const entry = `${author} · ${stamp}\n${body.trim()}`;
      write(async () => [await requireSupabase().from("orders").update({ admin_note: entry }).eq("id", row.id)]);
      return true;
    },
    [rowsOf, write],
  );

  /** Runs a fulfilment write, then re-reads the book whatever the answer was. */
  const settle = useCallback(
    async (run: () => Promise<FulfillmentResult>): Promise<FulfillmentResult> => {
      try {
        return await run();
      } catch (error) {
        console.error("[admin orders] fulfilment write failed", error);
        return { ok: false, error: "unavailable" };
      } finally {
        reload();
      }
    },
    [reload],
  );

  const createParcel = useCallback(
    (reference: string, input: ParcelInput) => {
      const row = rowsOf([reference])[0];
      return row ? settle(() => createShipment(row.id, input)) : Promise.resolve<FulfillmentResult>({ ok: false, error: "notFound" });
    },
    [rowsOf, settle],
  );
  const changeParcel = useCallback(
    (parcel: OrderParcel, change: ParcelChange) => settle(() => setShipmentStatus(parcel.id, change)),
    [settle],
  );
  const refund = useCallback(
    (reference: string, input: RefundInput) => {
      const row = rowsOf([reference])[0];
      return row ? settle(() => requestRefund(row.id, input)) : Promise.resolve<FulfillmentResult>({ ok: false, error: "notFound" });
    },
    [rowsOf, settle],
  );
  const cancelRefund = useCallback((refundId: string) => settle(() => cancelRefundRequest(refundId)), [settle]);

  const value = useMemo<AdminOrdersContextValue>(
    () => ({
      orders,
      loading: book === null,
      failed,
      truncated: book?.truncated ?? false,
      reload,
      setStatus,
      setStatusMany,
      cancel,
      cancelMany,
      addNote,
      createParcel,
      changeParcel,
      refund,
      cancelRefund,
    }),
    [orders, book, failed, reload, setStatus, setStatusMany, cancel, cancelMany, addNote, createParcel, changeParcel, refund, cancelRefund],
  );

  return <AdminOrdersContext.Provider value={value}>{children}</AdminOrdersContext.Provider>;
}

const refused = () => false;

const EMPTY_BOOK: AdminOrdersContextValue = {
  orders: [],
  loading: false,
  failed: false,
  truncated: false,
  reload: () => {},
  setStatus: refused,
  setStatusMany: refused,
  cancel: refused,
  cancelMany: refused,
  addNote: refused,
  createParcel: () => Promise.resolve({ ok: false, error: "unavailable" }),
  changeParcel: () => Promise.resolve({ ok: false, error: "unavailable" }),
  refund: () => Promise.resolve({ ok: false, error: "unavailable" }),
  cancelRefund: () => Promise.resolve({ ok: false, error: "unavailable" }),
};

/** No Supabase configured: no orders exist, and none are invented. */
function EmptyAdminOrdersProvider({ children }: { children: ReactNode }) {
  return <AdminOrdersContext.Provider value={EMPTY_BOOK}>{children}</AdminOrdersContext.Provider>;
}

export function useAdminOrders() {
  const ctx = useContext(AdminOrdersContext);
  if (!ctx) throw new Error("useAdminOrders must be used within AdminOrdersProvider");
  return ctx;
}
