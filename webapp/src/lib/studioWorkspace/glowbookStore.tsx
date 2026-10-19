import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { useStudioAccess } from "../studioAccess";
import { supabase } from "../supabase/client";
import { useToast } from "../toast";
import { exposureOf, sortItems, type Glowbook, type GlowbookDetails, type GlowbookItem, type PublicExposure } from "./glowbook";
import { createGlowbookRepository, GlowbookError, type GlowbookRepository } from "./glowbookRepository";
import { StudioStoreError } from "./repository";

/**
 * The member's Glowbook beside their workspace (decision 99): their public
 * page's details and moderation state, the creations in it, and the actions
 * on them. Live on Supabase only: with the demo accounts of the mock sign-in
 * it is `unavailable`, never a fake page.
 */

export type GlowbookStatus = "signedOut" | "unavailable" | "loading" | "ready" | "error";

interface GlowbookValue {
  status: GlowbookStatus;
  glowbook: Glowbook | null;
  /** In their order on the page. */
  items: GlowbookItem[];
  reload: () => void;
  itemFor: (creationId: string) => GlowbookItem | undefined;
  /**
   * What saving this creation would make public, as the database has it now:
   * the warning before a save must not rely on a list still loading. When the
   * read fails, what this page last knew (`known`) decides.
   */
  exposureFor: (creationId: string, known: { templatePublishedAt?: string | null }) => Promise<PublicExposure | null>;
  /** Resolves to the form's error code, or null when saved. */
  save: (details: GlowbookDetails) => Promise<GlowbookError["code"] | "invalid" | "failed" | null>;
  add: (creation: { id: string; name: string }) => Promise<boolean>;
  remove: (creation: { id: string; name: string }) => Promise<boolean>;
  move: (orderedCreationIds: string[]) => Promise<boolean>;
  removeAll: () => Promise<boolean>;
}

const GlowbookContext = createContext<GlowbookValue | null>(null);

export function GlowbookProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { userId, restoring, realAuth } = useAuth();
  const access = useStudioAccess();
  const reportDenied = access?.reportDenied;
  const repo = useMemo<GlowbookRepository | null>(
    () => (userId && realAuth && supabase ? createGlowbookRepository(supabase, userId) : null),
    [userId, realAuth],
  );

  const [loaded, setLoaded] = useState<{
    repo: GlowbookRepository;
    status: "ready" | "error";
    glowbook: Glowbook | null;
    items: GlowbookItem[];
  } | null>(null);
  const [tick, setTick] = useState(0);
  const current = loaded && loaded.repo === repo ? loaded : null;
  const status: GlowbookStatus = !userId ? (restoring ? "loading" : "signedOut") : !repo ? "unavailable" : current ? current.status : "loading";

  useEffect(() => {
    if (!repo) return;
    let live = true;
    repo
      .load()
      .then(({ glowbook, items }) => live && setLoaded({ repo, status: "ready", glowbook, items: sortItems(items) }))
      .catch(() => live && setLoaded({ repo, status: "error", glowbook: null, items: [] }));
    return () => {
      live = false;
    };
  }, [repo, tick]);

  const patch = useCallback(
    (fn: (prev: { glowbook: Glowbook | null; items: GlowbookItem[] }) => { glowbook: Glowbook | null; items: GlowbookItem[] }) =>
      setLoaded((prev) => (prev && prev.repo === repo ? { ...prev, ...fn(prev) } : prev)),
    [repo],
  );

  const fail = useCallback(
    (err: unknown, key: string) => {
      if (err instanceof StudioStoreError && err.code === "accessDenied") {
        showToast(t("studio.access.denied.title"), t("studio.access.denied.body"), "warning");
        reportDenied?.(key);
        return;
      }
      if (err instanceof GlowbookError && err.code === "full") {
        showToast(t("studio.glowbook.toasts.full"), undefined, "warning");
        return;
      }
      showToast(t(`studio.glowbook.toasts.${key}`), t("studio.workspace.toasts.tryAgain"), "error");
      if (err instanceof StudioStoreError && err.code === "notFound") setTick((n) => n + 1);
    },
    [showToast, t, reportDenied],
  );

  const items = useMemo(() => current?.items ?? [], [current]);
  const byCreation = useMemo(() => new Map(items.map((i) => [i.creationId, i])), [items]);
  const itemFor = useCallback((id: string) => byCreation.get(id), [byCreation]);

  const exposureFor = useCallback<GlowbookValue["exposureFor"]>(
    async (creationId, known) => {
      if (!repo) return exposureOf(byCreation.get(creationId), known.templatePublishedAt ?? null);
      try {
        const now = await repo.publicState(creationId);
        return exposureOf(now.item, now.templatePublishedAt);
      } catch {
        // Unknown: fall back on what the page last read, rather than skip the warning.
        return exposureOf(byCreation.get(creationId), known.templatePublishedAt ?? null);
      }
    },
    [repo, byCreation],
  );

  const save = useCallback<GlowbookValue["save"]>(
    async (details) => {
      if (!repo) return "failed";
      try {
        const glowbook = await repo.save(details);
        patch((prev) => ({ glowbook, items: prev.items }));
        showToast(
          t(glowbook.status === "pending" ? "studio.glowbook.toasts.savedPending" : "studio.glowbook.toasts.saved"),
          undefined,
          "success",
        );
        return null;
      } catch (err) {
        if (err instanceof GlowbookError) return err.code;
        if (err instanceof StudioStoreError && err.code === "invalid") return "invalid";
        fail(err, "saveFailed");
        return "failed";
      }
    },
    [repo, patch, showToast, t, fail],
  );

  const add = useCallback(
    async (c: { id: string; name: string }) => {
      if (!repo) return false;
      try {
        const item = await repo.add(c.id);
        patch((prev) => ({ glowbook: prev.glowbook, items: sortItems([...prev.items.filter((i) => i.creationId !== c.id), item]) }));
        showToast(t("studio.glowbook.toasts.added", { name: c.name }), t("studio.glowbook.toasts.addedBody"), "success");
        return true;
      } catch (err) {
        fail(err, "addFailed");
        return false;
      }
    },
    [repo, patch, showToast, t, fail],
  );

  const remove = useCallback(
    async (c: { id: string; name: string }) => {
      if (!repo) return false;
      try {
        await repo.remove(c.id);
        patch((prev) => ({ glowbook: prev.glowbook, items: prev.items.filter((i) => i.creationId !== c.id) }));
        showToast(t("studio.glowbook.toasts.removed", { name: c.name }), undefined, "success");
        return true;
      } catch (err) {
        fail(err, "removeFailed");
        return false;
      }
    },
    [repo, patch, showToast, t, fail],
  );

  const move = useCallback(
    async (ids: string[]) => {
      if (!repo) return false;
      const before = items;
      const rank = new Map(ids.map((id, i) => [id, i]));
      patch((prev) => ({
        glowbook: prev.glowbook,
        items: sortItems(prev.items.map((i) => ({ ...i, position: rank.get(i.creationId) ?? i.position }))),
      }));
      try {
        await repo.reorder(ids);
        return true;
      } catch (err) {
        patch((prev) => ({ glowbook: prev.glowbook, items: before }));
        fail(err, "moveFailed");
        return false;
      }
    },
    [repo, items, patch, fail],
  );

  const removeAll = useCallback(async () => {
    if (!repo) return false;
    try {
      await repo.removeAll();
      patch(() => ({ glowbook: null, items: [] }));
      showToast(t("studio.glowbook.toasts.deleted"), undefined, "success");
      return true;
    } catch (err) {
      fail(err, "deleteFailed");
      return false;
    }
  }, [repo, patch, showToast, t, fail]);

  const value: GlowbookValue = {
    status,
    glowbook: current?.glowbook ?? null,
    items,
    reload: () => setTick((n) => n + 1),
    itemFor,
    exposureFor,
    save,
    add,
    remove,
    move,
    removeAll,
  };
  return <GlowbookContext.Provider value={value}>{children}</GlowbookContext.Provider>;
}

export function useGlowbook(): GlowbookValue {
  const ctx = useContext(GlowbookContext);
  if (!ctx) throw new Error("useGlowbook must be used within GlowbookProvider");
  return ctx;
}
