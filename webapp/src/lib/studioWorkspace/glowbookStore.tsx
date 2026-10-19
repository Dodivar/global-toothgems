import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { useStudioAccess } from "../studioAccess";
import { supabase } from "../supabase/client";
import { useToast } from "../toast";
import { exposureOf, sortItems, type Glowbook, type GlowbookDetails, type GlowbookItem, type PublicExposure } from "./glowbook";
import { createGlowbookRepository, GlowbookError, type GlowbookRepository } from "./glowbookRepository";
import { lookPatch, type GlowbookLook, type MediaKind } from "./glowbookLook";
import { GlowbookMediaError, prepareGlowbookPicture, type MediaError } from "../../components/glowbook/prepareMedia";
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
  /** The look as the artist last chose it: the approved one with what waits for a moderator over it. */
  draftLook: GlowbookLook | null;
  /** Signed URLs of the member's own pictures (approved and proposed), by storage path. */
  mediaUrls: Map<string, string>;
  /** Saves the look (decision 100). Resolves to whether it was stored. */
  saveLook: (next: GlowbookLook) => Promise<boolean>;
  /** Frames and uploads a picture; its path and a preview URL, or why it was refused. */
  uploadPicture: (kind: MediaKind, file: File) => Promise<{ path: string; url: string } | { error: MediaError | "failed" }>;
}

const GlowbookContext = createContext<GlowbookValue | null>(null);

/** Every picture a Glowbook uses or proposes. */
function mediaPathsOf(g: Glowbook): string[] {
  return [g.look.avatarPath, g.look.bannerPath, g.pending.avatarPath, g.pending.bannerPath].filter((p): p is string => !!p);
}

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
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(() => new Map());
  const [tick, setTick] = useState(0);
  const current = loaded && loaded.repo === repo ? loaded : null;
  const status: GlowbookStatus = !userId ? (restoring ? "loading" : "signedOut") : !repo ? "unavailable" : current ? current.status : "loading";

  useEffect(() => {
    if (!repo) return;
    let live = true;
    repo
      .load()
      .then(({ glowbook, items }) => {
        if (!live) return;
        setLoaded({ repo, status: "ready", glowbook, items: sortItems(items) });
        // Pictures are decoration here: a signing failure leaves the placeholders.
        if (glowbook) void repo.signMedia(mediaPathsOf(glowbook)).then((urls) => live && setMediaUrls(urls)).catch(() => undefined);
      })
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

  const glowbook = current?.glowbook ?? null;
  const draftLook = useMemo(() => (glowbook ? { ...glowbook.look, ...glowbook.pending } : null), [glowbook]);

  const saveLook = useCallback(
    async (next: GlowbookLook) => {
      if (!repo || !glowbook || !draftLook) return false;
      const changes = lookPatch(draftLook, next);
      if (!Object.keys(changes).length) return true;
      try {
        const saved = await repo.saveLook(changes);
        patch((prev) => ({ glowbook: saved, items: prev.items }));
        const waiting = Object.keys(saved.pending).length > 0;
        showToast(t(waiting ? "studio.glowbook.toasts.lookSavedPending" : "studio.glowbook.toasts.lookSaved"), undefined, "success");
        const keep = mediaPathsOf(saved);
        void repo.cleanupMedia(keep).catch(() => undefined);
        void repo.signMedia(keep).then(setMediaUrls).catch(() => undefined);
        return true;
      } catch (err) {
        fail(err, "lookFailed");
        return false;
      }
    },
    [repo, glowbook, draftLook, patch, showToast, t, fail],
  );

  const uploadPicture = useCallback<GlowbookValue["uploadPicture"]>(
    async (kind, file) => {
      if (!repo) return { error: "failed" };
      try {
        const blob = await prepareGlowbookPicture(file, kind);
        const path = await repo.uploadMedia(kind, blob);
        const url = URL.createObjectURL(blob);
        setMediaUrls((prev) => new Map(prev).set(path, url));
        return { path, url };
      } catch (err) {
        if (err instanceof GlowbookMediaError) return { error: err.code };
        fail(err, "uploadFailed");
        return { error: "failed" };
      }
    },
    [repo, fail],
  );

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
    draftLook,
    mediaUrls,
    saveLook,
    uploadPicture,
  };
  return <GlowbookContext.Provider value={value}>{children}</GlowbookContext.Provider>;
}

export function useGlowbook(): GlowbookValue {
  const ctx = useContext(GlowbookContext);
  if (!ctx) throw new Error("useGlowbook must be used within GlowbookProvider");
  return ctx;
}
