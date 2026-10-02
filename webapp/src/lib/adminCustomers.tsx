import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AdminCustomerRecord, CustomerTag, StaffSettableStatus, StatusChange } from "../data/adminCustomers";
import {
  CUSTOMER_ADDRESS_SELECT,
  CUSTOMER_NOTE_SELECT,
  CUSTOMER_PROFILE_SELECT,
  mapCustomers,
  mapStatusHistory,
  profilePatch,
  tagDiff,
  tagToDb,
  writeErrorOf,
  type CustomerAddressRow,
  type CustomerCourseRow,
  type CustomerNoteRow,
  type CustomerProfileDraft,
  type CustomerProfileRow,
  type CustomerTagRow,
  type CustomerWriteError,
} from "./adminCustomerMapping";
import { useAdminAuth } from "./adminAuth";
import { useAdminOrders } from "./adminOrders";
import { isSupabaseConfigured, requireSupabase } from "./supabase/client";

/**
 * The customer base as the back office reads and changes it — the single
 * persistence boundary of this domain (screens never call Supabase).
 *
 * Reads (any active staff member, RLS `is_staff`): `profiles` with role
 * `customer`, their default shipping address (`customer_addresses`),
 * `customer_tags`, `customer_notes` with their author, the course seats of
 * `admin_customer_courses()`, and — per account, on demand — the status
 * changes of `admin_customer_status_history()`. Order counts and spend come
 * from the live order book (`useAdminOrders`), which is why this provider sits
 * inside `AdminOrdersProvider`.
 *
 * Writes, all under the signed-in member's JWT and `manage_customers`:
 * names, phone, birth date, country and status (`UPDATE profiles`, then
 * `private.guard_profile_update()`; status changes audited), tags (insert /
 * delete, audited) and notes (insert, delete; edit only one's own). Email,
 * marketing consent and the address book belong to the customer and are never
 * written here. Every write re-reads the base; a refusal is returned as a
 * reason the screen words, never turned into a success. `canManage` only
 * decides what the screen offers — the database decides what happens.
 *
 * Without Supabase (local mock mode) the base is empty and nothing can be
 * changed: this is a live domain and never shows invented people.
 */

export type { CustomerProfileDraft, CustomerWriteError };
export type CustomerWriteResult = { ok: true } | { ok: false; error: CustomerWriteError };
/** A bulk status change: how many accounts actually changed. */
export type CustomerBulkResult = { ok: true; changed: number } | { ok: false; error: CustomerWriteError };

export interface AdminCustomersContextValue {
  customers: AdminCustomerRecord[];
  /** True until the first read (base and order book) has answered. */
  loading: boolean;
  /** The last read failed: the empty list is not "no customers". */
  failed: boolean;
  /** False in local mock mode: there is no base to read. */
  available: boolean;
  /** The order book was cut at its limit: counts and spend cover the newest orders only. */
  ordersTruncated: boolean;
  reload: () => void;
  /** `manage_customers` (navigation only: RLS decides). */
  canManage: boolean;
  /** The signed-in member, for "your own notes". */
  currentUserId: string | null;
  /** Their name, shown on the note composer. */
  operatorName: string;
  setStatus: (ids: string[], status: StaffSettableStatus) => Promise<CustomerBulkResult>;
  addTag: (id: string, tag: CustomerTag) => Promise<CustomerWriteResult>;
  removeTag: (id: string, tag: CustomerTag) => Promise<CustomerWriteResult>;
  addNote: (id: string, body: string) => Promise<CustomerWriteResult>;
  editNote: (noteId: string, body: string) => Promise<CustomerWriteResult>;
  deleteNote: (noteId: string) => Promise<CustomerWriteResult>;
  /** The edit form's save: the profile, then the tag difference. */
  saveProfile: (id: string, draft: CustomerProfileDraft) => Promise<CustomerWriteResult>;
  /** The account's status changes, oldest first; null when they could not be read. */
  readStatusHistory: (id: string) => Promise<StatusChange[] | null>;
}

const AdminCustomersContext = createContext<AdminCustomersContextValue | null>(null);

interface Snapshot {
  profiles: CustomerProfileRow[];
  addresses: CustomerAddressRow[];
  tags: CustomerTagRow[];
  notes: CustomerNoteRow[];
  courses: CustomerCourseRow[];
  permissions: ReadonlySet<string>;
  currentUserId: string | null;
}

const EMPTY: Snapshot = {
  profiles: [],
  addresses: [],
  tags: [],
  notes: [],
  courses: [],
  permissions: new Set(),
  currentUserId: null,
};

/** PostgREST answers at most this many rows per request. */
const PAGE_ROWS = 1000;

type PageQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;

/** Every row of a read, page by page, so no customer is silently cut off. */
async function readAll<T>(query: PageQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await query(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_ROWS) return rows;
  }
}

async function readBase(signal: AbortSignal): Promise<Snapshot> {
  const client = requireSupabase();
  const [session, mine, profiles, addresses, tags, notes, courses] = await Promise.all([
    client.auth.getSession(),
    client.rpc("my_permissions").abortSignal(signal),
    readAll<CustomerProfileRow>((from, to) =>
      client
        .from("profiles")
        .select(CUSTOMER_PROFILE_SELECT)
        .eq("role", "customer")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
        .abortSignal(signal),
    ),
    readAll<CustomerAddressRow>((from, to) =>
      client
        .from("customer_addresses")
        .select(CUSTOMER_ADDRESS_SELECT)
        .eq("address_type", "shipping")
        .eq("is_default", true)
        .order("id", { ascending: true })
        .range(from, to)
        .abortSignal(signal),
    ),
    readAll<CustomerTagRow>((from, to) =>
      client.from("customer_tags").select("user_id, tag").order("id", { ascending: true }).range(from, to).abortSignal(signal),
    ),
    readAll<CustomerNoteRow>(
      (from, to) =>
        client
          .from("customer_notes")
          .select(CUSTOMER_NOTE_SELECT)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(signal) as unknown as PromiseLike<{ data: CustomerNoteRow[] | null; error: unknown }>,
    ),
    readAll<CustomerCourseRow>((from, to) =>
      client.rpc("admin_customer_courses", {}).range(from, to).abortSignal(signal),
    ),
  ]);
  if (mine.error) throw mine.error;
  return {
    profiles,
    addresses,
    tags,
    notes,
    courses,
    permissions: new Set(mine.data ?? []),
    currentUserId: session.data.session?.user.id ?? null,
  };
}

async function insertTags(id: string, tags: CustomerTag[]): Promise<CustomerWriteError | null> {
  if (tags.length === 0) return null;
  const { error } = await requireSupabase()
    .from("customer_tags")
    .insert(tags.map((tag) => ({ user_id: id, tag: tagToDb(tag) })))
    .select("id");
  // 23505: the tag is already there (another tab, a colleague) — the wanted state.
  if (error && error.code !== "23505") return writeErrorOf(error);
  return null;
}

async function deleteTags(id: string, tags: CustomerTag[]): Promise<CustomerWriteError | null> {
  if (tags.length === 0) return null;
  const { data, error } = await requireSupabase()
    .from("customer_tags")
    .delete()
    .eq("user_id", id)
    .in("tag", tags.map(tagToDb))
    .select("id");
  if (error) return writeErrorOf(error);
  return (data ?? []).length === 0 ? "forbidden" : null;
}

export function AdminCustomersProvider({ children }: { children: ReactNode }) {
  return isSupabaseConfigured ? (
    <SupabaseAdminCustomersProvider>{children}</SupabaseAdminCustomersProvider>
  ) : (
    <UnavailableAdminCustomersProvider>{children}</UnavailableAdminCustomersProvider>
  );
}

function SupabaseAdminCustomersProvider({ children }: { children: ReactNode }) {
  const { admin } = useAdminAuth();
  const { orders, loading: ordersLoading, failed: ordersFailed, truncated, reload: reloadOrders } = useAdminOrders();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    readBase(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setFailed(false);
        setSnapshot(next);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("[admin customers] load failed", error);
        setFailed(true);
        setSnapshot(EMPTY);
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  /** "Try again" after a failure reads both sources again. */
  const reloadAll = useCallback(() => {
    reload();
    if (ordersFailed) reloadOrders();
  }, [reload, reloadOrders, ordersFailed]);

  const customers = useMemo(
    () => (snapshot ? mapCustomers({ ...snapshot, orders }) : []),
    [snapshot, orders],
  );

  /** Runs one write, then re-reads the base whatever happened. */
  const run = useCallback(
    async (write: () => Promise<CustomerWriteError | null>): Promise<CustomerWriteResult> => {
      try {
        const error = await write();
        return error ? { ok: false, error } : { ok: true };
      } catch (error) {
        console.error("[admin customers] write failed", error);
        return { ok: false, error: "unavailable" };
      } finally {
        reload();
      }
    },
    [reload],
  );

  const setStatus = useCallback(
    async (ids: string[], status: StaffSettableStatus): Promise<CustomerBulkResult> => {
      // Only the accounts that change: an update to the status a row already
      // has would still be audited as a write.
      const targets = customers.filter((c) => ids.includes(c.id) && c.status !== status).map((c) => c.id);
      if (targets.length === 0) return { ok: true, changed: 0 };
      try {
        const { data, error } = await requireSupabase()
          .from("profiles")
          .update({ status })
          .in("id", targets)
          .select("id");
        if (error) return { ok: false, error: writeErrorOf(error) };
        // RLS lets a refused update touch no row rather than fail.
        if ((data ?? []).length === 0) return { ok: false, error: "forbidden" };
        return { ok: true, changed: data.length };
      } catch (error) {
        console.error("[admin customers] status change failed", error);
        return { ok: false, error: "unavailable" };
      } finally {
        reload();
      }
    },
    [customers, reload],
  );

  const addTag = useCallback((id: string, tag: CustomerTag) => run(() => insertTags(id, [tag])), [run]);
  const removeTag = useCallback((id: string, tag: CustomerTag) => run(() => deleteTags(id, [tag])), [run]);

  const addNote = useCallback(
    (id: string, body: string) =>
      run(async () => {
        const { error } = await requireSupabase()
          .from("customer_notes")
          .insert({ user_id: id, body: body.trim() })
          .select("id")
          .single();
        return error ? writeErrorOf(error) : null;
      }),
    [run],
  );

  const editNote = useCallback(
    (noteId: string, body: string) =>
      run(async () => {
        const { error } = await requireSupabase()
          .from("customer_notes")
          .update({ body: body.trim() })
          .eq("id", noteId)
          .select("id")
          .single();
        return error ? writeErrorOf(error) : null;
      }),
    [run],
  );

  const deleteNote = useCallback(
    (noteId: string) =>
      run(async () => {
        const { data, error } = await requireSupabase().from("customer_notes").delete().eq("id", noteId).select("id");
        if (error) return writeErrorOf(error);
        return (data ?? []).length === 0 ? "forbidden" : null;
      }),
    [run],
  );

  const saveProfile = useCallback(
    (id: string, draft: CustomerProfileDraft) =>
      run(async () => {
        const customer = customers.find((c) => c.id === id);
        if (!customer) return "notFound";
        const { error } = await requireSupabase()
          .from("profiles")
          .update(profilePatch(draft))
          .eq("id", id)
          .select("id")
          .single();
        if (error) return writeErrorOf(error);
        const { add, remove } = tagDiff(customer.tags, draft.tags);
        return (await insertTags(id, add)) ?? (await deleteTags(id, remove));
      }),
    [run, customers],
  );

  const readStatusHistory = useCallback(async (id: string): Promise<StatusChange[] | null> => {
    const { data, error } = await requireSupabase().rpc("admin_customer_status_history", { p_user_id: id });
    if (error) {
      console.error("[admin customers] status history failed", error);
      return null;
    }
    return mapStatusHistory(data ?? []);
  }, []);

  const value = useMemo<AdminCustomersContextValue>(
    () => ({
      customers,
      loading: snapshot === null || ordersLoading,
      failed: failed || ordersFailed,
      available: true,
      ordersTruncated: truncated,
      reload: reloadAll,
      canManage: snapshot?.permissions.has("manage_customers") ?? false,
      currentUserId: snapshot?.currentUserId ?? null,
      operatorName: admin?.name ?? "",
      setStatus,
      addTag,
      removeTag,
      addNote,
      editNote,
      deleteNote,
      saveProfile,
      readStatusHistory,
    }),
    [
      customers,
      snapshot,
      ordersLoading,
      failed,
      ordersFailed,
      truncated,
      reloadAll,
      admin,
      setStatus,
      addTag,
      removeTag,
      addNote,
      editNote,
      deleteNote,
      saveProfile,
      readStatusHistory,
    ],
  );

  return <AdminCustomersContext.Provider value={value}>{children}</AdminCustomersContext.Provider>;
}

const refuse = () => Promise.resolve({ ok: false as const, error: "unavailable" as const });

/** Local mock mode: no base, every write refused. */
function UnavailableAdminCustomersProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AdminCustomersContextValue>(
    () => ({
      customers: [],
      loading: false,
      failed: false,
      available: false,
      ordersTruncated: false,
      reload: () => undefined,
      canManage: false,
      currentUserId: null,
      operatorName: "",
      setStatus: refuse,
      addTag: refuse,
      removeTag: refuse,
      addNote: refuse,
      editNote: refuse,
      deleteNote: refuse,
      saveProfile: refuse,
      readStatusHistory: () => Promise.resolve(null),
    }),
    [],
  );
  return <AdminCustomersContext.Provider value={value}>{children}</AdminCustomersContext.Provider>;
}

export function useAdminCustomers() {
  const ctx = useContext(AdminCustomersContext);
  if (!ctx) throw new Error("useAdminCustomers must be used within AdminCustomersProvider");
  return ctx;
}
