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
import { useSpotlightRecorder, type SpotlightValue } from "./useSpotlightRecorder";
import { useWorkspace } from "./workspace";
import { sortSections, type CertifiedCourse, type GlowbookSection, type SectionProblem } from "./glowbookSections";

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
  /** The page's sections, in order (decision 102). */
  sections: GlowbookSection[];
  /** Creates (null id) or renames a section. Resolves to the form's error, or null when saved. */
  saveSection: (id: string | null, name: string) => Promise<SectionProblem | "failed" | null>;
  deleteSection: (section: GlowbookSection) => Promise<boolean>;
  moveSections: (orderedIds: string[]) => Promise<boolean>;
  /** Files a Glowbook creation in a section, or in none (null). */
  fileItem: (item: GlowbookItem, sectionId: string | null) => Promise<boolean>;
  /** The courses behind the "certified artist" badge, as the database derives them; null while unknown. */
  certification: CertifiedCourse[] | null;
  setShowCertification: (visible: boolean) => Promise<boolean>;
  /** One of the member's own pictures as a file (the poster draws it), or null when it cannot be read. */
  downloadMedia: (path: string) => Promise<Blob | null>;
  /** The spotlight creation's turning video (decision 103), recorded by this tab when missing or stale. */
  spotlight: SpotlightValue;
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
    sections: GlowbookSection[];
  } | null>(null);
  const [certified, setCertified] = useState<{ repo: GlowbookRepository; courses: CertifiedCourse[] } | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(() => new Map());
  const [tick, setTick] = useState(0);
  const current = loaded && loaded.repo === repo ? loaded : null;
  const status: GlowbookStatus = !userId ? (restoring ? "loading" : "signedOut") : !repo ? "unavailable" : current ? current.status : "loading";

  useEffect(() => {
    if (!repo) return;
    let live = true;
    repo
      .load()
      .then(({ glowbook, items, sections }) => {
        if (!live) return;
        setLoaded({ repo, status: "ready", glowbook, items: sortItems(items), sections: sortSections(sections) });
        // Pictures are decoration here: a signing failure leaves the placeholders.
        if (glowbook) void repo.signMedia(mediaPathsOf(glowbook)).then((urls) => live && setMediaUrls(urls)).catch(() => undefined);
      })
      .catch(() => live && setLoaded({ repo, status: "error", glowbook: null, items: [], sections: [] }));
    // The badge is a bonus: when it cannot be read, the Studio says nothing about it.
    repo
      .certification()
      .then((courses) => live && setCertified({ repo, courses }))
      .catch(() => live && setCertified({ repo, courses: [] }));
    return () => {
      live = false;
    };
  }, [repo, tick]);

  const patch = useCallback(
    (
      fn: (prev: { glowbook: Glowbook | null; items: GlowbookItem[]; sections: GlowbookSection[] }) => {
        glowbook?: Glowbook | null;
        items?: GlowbookItem[];
        sections?: GlowbookSection[];
      },
    ) => setLoaded((prev) => (prev && prev.repo === repo ? { ...prev, ...fn(prev) } : prev)),
    [repo],
  );

  const fail = useCallback(
    (err: unknown, key: string) => {
      if (err instanceof StudioStoreError && err.code === "accessDenied") {
        showToast(t("studio.access.denied.title"), t("studio.access.denied.body"), "warning");
        reportDenied?.(key);
        return;
      }
      if (err instanceof GlowbookError && (err.code === "full" || err.code === "sectionsFull")) {
        showToast(t(`studio.glowbook.toasts.${err.code}`), undefined, "warning");
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

  const sections = useMemo(() => current?.sections ?? [], [current]);

  const saveSection = useCallback<GlowbookValue["saveSection"]>(
    async (id, name) => {
      if (!repo) return "failed";
      try {
        const saved = await repo.saveSection(id, name);
        patch((prev) => ({ sections: sortSections([...prev.sections.filter((x) => x.id !== saved.id), saved]) }));
        showToast(t(id ? "studio.glowbook.toasts.sectionRenamed" : "studio.glowbook.toasts.sectionAdded", { name: saved.name }), undefined, "success");
        return null;
      } catch (err) {
        if (err instanceof GlowbookError && err.code === "sectionTaken") return "taken";
        if (err instanceof GlowbookError && err.code === "sectionsFull") return "full";
        if (err instanceof StudioStoreError && err.code === "invalid") return "length";
        fail(err, "sectionFailed");
        return "failed";
      }
    },
    [repo, patch, showToast, t, fail],
  );

  const deleteSection = useCallback(
    async (section: GlowbookSection) => {
      if (!repo) return false;
      try {
        await repo.deleteSection(section.id);
        patch((prev) => ({
          sections: prev.sections.filter((x) => x.id !== section.id),
          items: prev.items.map((i) => (i.sectionId === section.id ? { ...i, sectionId: null } : i)),
        }));
        showToast(t("studio.glowbook.toasts.sectionDeleted", { name: section.name }), undefined, "success");
        return true;
      } catch (err) {
        fail(err, "sectionFailed");
        return false;
      }
    },
    [repo, patch, showToast, t, fail],
  );

  const moveSections = useCallback(
    async (ids: string[]) => {
      if (!repo) return false;
      const before = sections;
      const rank = new Map(ids.map((id, i) => [id, i]));
      patch((prev) => ({ sections: sortSections(prev.sections.map((x) => ({ ...x, position: rank.get(x.id) ?? x.position }))) }));
      try {
        await repo.reorderSections(ids);
        return true;
      } catch (err) {
        patch(() => ({ sections: before }));
        fail(err, "moveFailed");
        return false;
      }
    },
    [repo, sections, patch, fail],
  );

  const fileItem = useCallback(
    async (item: GlowbookItem, sectionId: string | null) => {
      if (!repo) return false;
      try {
        const saved = await repo.fileItem(item.id, sectionId);
        patch((prev) => ({ items: prev.items.map((i) => (i.id === saved.id ? saved : i)) }));
        return true;
      } catch (err) {
        fail(err, "sectionFailed");
        return false;
      }
    },
    [repo, patch, fail],
  );

  const setShowCertification = useCallback(
    async (visible: boolean) => {
      if (!repo) return false;
      try {
        const saved = await repo.setShowCertification(visible);
        patch(() => ({ glowbook: saved }));
        showToast(t(visible ? "studio.glowbook.toasts.badgeShown" : "studio.glowbook.toasts.badgeHidden"), undefined, "success");
        return true;
      } catch (err) {
        fail(err, "badgeFailed");
        return false;
      }
    },
    [repo, patch, showToast, t, fail],
  );

  const downloadMedia = useCallback(
    async (path: string) => {
      if (!repo) return null;
      try {
        return await repo.downloadMedia(path);
      } catch {
        return null;
      }
    },
    [repo],
  );

  const ws = useWorkspace();
  const spotlight = useSpotlightRecorder(glowbook ? repo : null, glowbook?.look.featuredItemId ?? null, items, ws.creations);

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
    sections,
    saveSection,
    deleteSection,
    moveSections,
    fileItem,
    certification: certified && certified.repo === repo ? certified.courses : null,
    setShowCertification,
    downloadMedia,
    spotlight,
  };
  return <GlowbookContext.Provider value={value}>{children}</GlowbookContext.Provider>;
}

export function useGlowbook(): GlowbookValue {
  const ctx = useContext(GlowbookContext);
  if (!ctx) throw new Error("useGlowbook must be used within GlowbookProvider");
  return ctx;
}
