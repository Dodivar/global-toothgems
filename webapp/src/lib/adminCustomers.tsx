import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  ADMIN_CUSTOMER_RECORDS,
  noteBody,
  type AdminCustomerRecord,
  type CustomerStatus,
  type CustomerTag,
} from "../data/adminCustomers";
import type { AdminNote } from "../data/adminOrders";

/**
 * The customer base as the back office edits it, held in memory.
 *
 * In-memory mockup state, like `cart.tsx`, `orders.tsx` and `adminOrders.tsx`.
 * The rule that file states applies here too: suspending an account has to move
 * the badge in the table, the "Active" tile in the KPI row, the status on the
 * detail page *and* that account's own history at once. A prototype that raises
 * a toast without moving the data teaches the wrong thing about what the button
 * does — and on this page it teaches it about a consequential action.
 *
 * None of this is authorization. A real status change is a server-side
 * transition behind explicit RBAC, written to an audit log, and a suspension
 * has to invalidate the customer's sessions — which is a back-end concern by
 * definition (`AGENTS.md` sections 7 and 12). Nothing in this file may be
 * relied on by the production app.
 */

/** The administrator every action in this prototype is attributed to. */
export const CURRENT_OPERATOR = "Léa — Support";

/** Fields the edit form may write. Everything else is read-only here. */
export interface CustomerProfileDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  addressLine: string;
  postalCode: string;
  city: string;
  country: string;
  status: CustomerStatus;
  tags: CustomerTag[];
  marketingOptIn: boolean;
}

export interface AdminCustomersContextValue {
  customers: AdminCustomerRecord[];
  setStatus: (id: string, status: CustomerStatus) => void;
  /** Same, for a selection in the table. */
  setStatusMany: (ids: string[], status: CustomerStatus) => void;
  addTag: (id: string, tag: CustomerTag) => void;
  removeTag: (id: string, tag: CustomerTag) => void;
  addNote: (id: string, body: string, author?: string) => void;
  editNote: (id: string, noteId: string, body: string) => void;
  deleteNote: (id: string, noteId: string) => void;
  /** Writes the edit form back onto the record. */
  saveProfile: (id: string, draft: CustomerProfileDraft) => void;
}

const AdminCustomersContext = createContext<AdminCustomersContextValue | null>(null);

/** Now, in the `YYYY-MM-DDTHH:mm` shape the seeded data uses. */
function now(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminCustomersProvider({ children }: { children: ReactNode }) {
  const [customers, setCustomers] = useState<AdminCustomerRecord[]>(ADMIN_CUSTOMER_RECORDS);

  const patch = useCallback((ids: string[], update: (customer: AdminCustomerRecord) => AdminCustomerRecord) => {
    const set = new Set(ids);
    setCustomers((prev) => prev.map((c) => (set.has(c.id) ? update(c) : c)));
  }, []);

  /**
   * A status change, one account or a whole selection.
   *
   * Written as one `patch` rather than a loop, for the reason `adminOrders`
   * documents about bulk cancellation: a loop stamps every record with its own
   * `now()`, so twelve accounts suspended by one click carry twelve different
   * times in their histories.
   *
   * Setting the status a record already has writes nothing. Without the guard,
   * confirming "Active" on an active account appends a history entry saying it
   * changed, which is a lie an audit trail should never contain.
   */
  const applyStatus = useCallback(
    (ids: string[], status: CustomerStatus) => {
      const at = now();
      patch(ids, (customer) =>
        customer.status === status
          ? customer
          : {
              ...customer,
              status,
              events: [...customer.events, { kind: "statusChanged", at, detail: status }],
            },
      );
    },
    [patch],
  );

  const setStatus = useCallback((id: string, status: CustomerStatus) => applyStatus([id], status), [applyStatus]);
  const setStatusMany = applyStatus;

  const addTag = useCallback(
    (id: string, tag: CustomerTag) => {
      patch([id], (customer) =>
        customer.tags.includes(tag) ? customer : { ...customer, tags: [...customer.tags, tag] },
      );
    },
    [patch],
  );

  const removeTag = useCallback(
    (id: string, tag: CustomerTag) => {
      patch([id], (customer) => ({ ...customer, tags: customer.tags.filter((t) => t !== tag) }));
    },
    [patch],
  );

  const addNote = useCallback(
    (id: string, body: string, author: string = CURRENT_OPERATOR) => {
      patch([id], (customer) => {
        const note: AdminNote = {
          // Seeded ids are `<customer>-n<n>`; a note typed now cannot reuse that
          // counter, because deleting a note would then let the next one collide
          // with an id already on screen.
          id: `${id}-n-${Date.now()}`,
          author,
          at: now(),
          // A note typed now exists in one language only. Storing the same
          // string under both keys is honest about that: it is what was
          // written, not a translation of it.
          body: noteBody(body),
        };
        return { ...customer, notes: [...customer.notes, note] };
      });
    },
    [patch],
  );

  const editNote = useCallback(
    (id: string, noteId: string, body: string) => {
      patch([id], (customer) => ({
        ...customer,
        notes: customer.notes.map((note) => (note.id === noteId ? { ...note, body: noteBody(body) } : note)),
      }));
    },
    [patch],
  );

  const deleteNote = useCallback(
    (id: string, noteId: string) => {
      patch([id], (customer) => ({ ...customer, notes: customer.notes.filter((note) => note.id !== noteId) }));
    },
    [patch],
  );

  /**
   * The edit form's save.
   *
   * A status changed from inside the form writes the same history entry the
   * status dialog writes, rather than passing silently: where the change was
   * made is an implementation detail, and an account that shows as suspended
   * with nothing in its history saying when is the exact gap an administrator
   * would have to answer for.
   */
  const saveProfile = useCallback(
    (id: string, draft: CustomerProfileDraft) => {
      const at = now();
      patch([id], (customer) => {
        const statusChanged = customer.status !== draft.status;
        return {
          ...customer,
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          birthDate: draft.birthDate || undefined,
          addressLine: draft.addressLine.trim(),
          postalCode: draft.postalCode.trim(),
          city: draft.city.trim(),
          country: draft.country,
          status: draft.status,
          tags: draft.tags,
          marketingOptIn: draft.marketingOptIn,
          events: [
            ...customer.events,
            { kind: "profileUpdated" as const, at },
            ...(statusChanged ? [{ kind: "statusChanged" as const, at, detail: draft.status }] : []),
          ],
        };
      });
    },
    [patch],
  );

  const value = useMemo<AdminCustomersContextValue>(
    () => ({ customers, setStatus, setStatusMany, addTag, removeTag, addNote, editNote, deleteNote, saveProfile }),
    [customers, setStatus, setStatusMany, addTag, removeTag, addNote, editNote, deleteNote, saveProfile],
  );

  return <AdminCustomersContext.Provider value={value}>{children}</AdminCustomersContext.Provider>;
}

export function useAdminCustomers() {
  const ctx = useContext(AdminCustomersContext);
  if (!ctx) throw new Error("useAdminCustomers must be used within AdminCustomersProvider");
  return ctx;
}
