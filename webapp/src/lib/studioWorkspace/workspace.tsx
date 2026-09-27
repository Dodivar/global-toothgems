import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { useToast } from "../toast";
import { getEngine } from "../studio3d/engine";
import { uid } from "../studio3d/math";
import { studioStore, useStudio } from "../studio3d/store";
import { createLocalRepositories, type KeyValueStorage } from "./localRepository";
import { StudioStoreError, type StudioRepositories } from "./repository";
import { piecesKey } from "./scene";
import type { Creation, FeedbackInput, GemGroup, RecordDetails } from "./types";
import { copyName } from "./validation";

/**
 * The Studio workspace around the 3D editor: the signed-in account's saved
 * creations and Gem Groups, and the save state of the design on the stage.
 *
 * State layers stay apart:
 *   - the 3D scene lives in `studioStore` (and the engine renders it);
 *   - persisted records come from the repositories (`repository.ts`);
 *   - this provider holds the loaded lists and the save pipeline between them;
 *   - UI state (which dialog is open, filters…) stays in the components.
 *
 * Every write reports its outcome through the site's toasts, in one place, so
 * "Creation saved" and "Unable to save" read the same from any control.
 */

export type LibraryStatus = "signedOut" | "loading" | "ready" | "error";
/** What the stage's design is, relative to the account. */
export type SaveState = "empty" | "unsaved" | "saving" | "saved" | "failed";

interface WorkspaceValue {
  userId: string | null;
  status: LibraryStatus;
  creations: Creation[];
  groups: GemGroup[];
  reload: () => void;
  saveState: SaveState;
  /** ISO time of the last save or load of the linked creation. */
  savedAt: string | null;
  /** The stage differs from the linked creation (or holds an unsaved new design). */
  dirty: boolean;
  /** Save the stage: as a new creation (`details` required) or into the linked one. */
  saveDesign: (mode: "new" | "update", details?: RecordDetails) => Promise<Creation | null>;
  openCreation: (c: Creation) => void;
  startNewDesign: () => void;
  updateCreationDetails: (c: Creation, details: RecordDetails) => Promise<boolean>;
  duplicateCreation: (c: Creation) => Promise<Creation | null>;
  toggleCreationFavorite: (c: Creation) => Promise<void>;
  deleteCreation: (c: Creation) => Promise<boolean>;
  saveSelectionAsGroup: (ids: string[], details: RecordDetails) => Promise<GemGroup | null>;
  insertGroup: (g: GemGroup, toothId?: string | null) => boolean;
  updateGroupDetails: (g: GemGroup, details: RecordDetails) => Promise<boolean>;
  duplicateGroup: (g: GemGroup) => Promise<GemGroup | null>;
  toggleGroupFavorite: (g: GemGroup) => Promise<void>;
  deleteGroup: (g: GemGroup) => Promise<boolean>;
  submitFeedback: (input: FeedbackInput) => Promise<boolean>;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/** Simulated round trip of the local prototype store, so "Saving…" is honest about latency. */
const LOCAL_LATENCY_MS = 380;

/** Browser storage, or a memory stand-in when it is blocked (private mode, policies). */
function browserStorage(): KeyValueStorage {
  try {
    const probe = "gt-studio-probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  }
}

function createRepositories(userId: string): StudioRepositories {
  // The one switch for the backend: when the Supabase tables are live, a
  // `createSupabaseRepositories(client)` goes here (see README, "3D Studio workspace").
  return createLocalRepositories(userId, { storage: browserStorage(), latency: LOCAL_LATENCY_MS, seed: true });
}

export function StudioWorkspaceProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { userId } = useAuth();
  const snap = useStudio();
  const repos = useMemo(() => (userId ? createRepositories(userId) : null), [userId]);

  // What was loaded, and for which repositories: a sign-out or another account
  // makes it stale at once, without waiting for an effect to clear it.
  const [loaded, setLoaded] = useState<{
    repos: StudioRepositories;
    status: "ready" | "error";
    creations: Creation[];
    groups: GemGroup[];
  } | null>(null);
  const current = loaded && loaded.repos === repos ? loaded : null;
  const status: LibraryStatus = !repos ? "signedOut" : current ? current.status : "loading";
  const creations = useMemo(() => current?.creations ?? [], [current]);
  const groups = useMemo(() => current?.groups ?? [], [current]);
  const [saving, setSaving] = useState(false);
  /** `piecesKey` of the design whose save failed; editing it again clears the failure. */
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const setCreations = useCallback((update: (list: Creation[]) => Creation[]) => {
    setLoaded((l) => (l ? { ...l, creations: update(l.creations) } : l));
  }, []);
  const setGroups = useCallback((update: (list: GemGroup[]) => GemGroup[]) => {
    setLoaded((l) => (l ? { ...l, groups: update(l.groups) } : l));
  }, []);

  const say = useCallback(
    (key: string, tone: "success" | "info" | "warning" | "error" = "success", values?: Record<string, unknown>) =>
      showToast(t(`studio.workspace.toasts.${key}`, values), undefined, tone),
    [showToast, t],
  );
  const fail = useCallback(
    (err: unknown, key = "genericFailed") => {
      const invalid = err instanceof StudioStoreError && err.code === "invalid";
      showToast(t(`studio.workspace.toasts.${invalid ? "invalid" : key}`), t("studio.workspace.toasts.tryAgain"), "error");
    },
    [showToast, t],
  );

  // Load the account's library.
  useEffect(() => {
    if (!repos) return;
    let live = true;
    Promise.all([repos.creations.list(), repos.groups.list()])
      .then(([c, g]) => live && setLoaded({ repos, status: "ready", creations: c, groups: g }))
      .catch(() => live && setLoaded({ repos, status: "error", creations: [], groups: [] }));
    return () => {
      live = false;
    };
  }, [repos, reloadTick]);

  // The draft stays linked to its creation only for its owner, and only while it exists.
  useEffect(() => {
    const active = studioStore.active;
    if (!active) return;
    if (!userId) return; // signed out: keep the link for when they come back
    if (active.ownerId !== userId) studioStore.unlink();
    else if (status === "ready" && !creations.some((c) => c.id === active.creationId)) studioStore.unlink();
  }, [userId, status, creations]);

  // Dirty is measured by content, not by history: sliders commit without an undo step.
  const currentKey = useMemo(() => piecesKey(snap.jewels), [snap.jewels]);
  const dirty = snap.active ? currentKey !== snap.active.baselineKey : snap.jewels.length > 0;
  const saveState: SaveState = saving
    ? "saving"
    : failedKey === currentKey
      ? "failed"
      : !snap.active && !snap.jewels.length
        ? "empty"
        : dirty
          ? "unsaved"
          : "saved";

  const replaceCreation = useCallback(
    (c: Creation) => setCreations((list) => [c, ...list.filter((x) => x.id !== c.id)]),
    [setCreations],
  );
  const replaceGroup = useCallback((g: GemGroup) => setGroups((list) => list.map((x) => (x.id === g.id ? g : x))), [setGroups]);

  const saveDesign = useCallback(
    async (mode: "new" | "update", details?: RecordDetails): Promise<Creation | null> => {
      if (!repos || !userId) return null;
      const active = studioStore.active;
      if (mode === "update" && !active) return null;
      if (mode === "new" && !details) return null;
      const engine = getEngine();
      const scene = studioStore.toScene({ model: engine?.modelKind() ?? "studio-arch", camera: engine?.getCameraState() ?? null });
      const savedKey = piecesKey(scene.pieces);
      setSaving(true);
      setFailedKey(null);
      try {
        const thumbnail = engine ? await engine.captureThumbnail().catch(() => null) : null;
        const saved =
          mode === "update" && active
            ? await repos.creations.update(active.creationId, { scene, thumbnail })
            : await repos.creations.create({ ...details!, scene, thumbnail });
        studioStore.markSaved({ creationId: saved.id, ownerId: userId, name: saved.name, savedAt: saved.updatedAt }, scene.pieces);
        replaceCreation(saved);
        say(mode === "update" ? "changesSaved" : "creationSaved");
        return saved;
      } catch (err) {
        setFailedKey(savedKey);
        fail(err, "saveFailed");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [repos, userId, say, fail, replaceCreation],
  );

  const openCreation = useCallback(
    (c: Creation) => {
      if (!userId) return;
      studioStore.loadScene(c.scene, { creationId: c.id, ownerId: userId, name: c.name, savedAt: c.updatedAt });
      setFailedKey(null);
      const at = new Date().toISOString();
      setCreations((list) => list.map((x) => (x.id === c.id ? { ...x, lastOpenedAt: at } : x)));
      // Recording the visit is housekeeping: a failure here must not disturb the editor.
      void repos?.creations.update(c.id, { lastOpenedAt: at }).catch(() => undefined);
      say("opened", "info", { name: c.name });
    },
    [repos, userId, say, setCreations],
  );

  const startNewDesign = useCallback(() => {
    studioStore.startNew();
    setFailedKey(null);
  }, []);

  const updateCreationDetails = useCallback(
    async (c: Creation, details: RecordDetails) => {
      if (!repos) return false;
      try {
        const saved = await repos.creations.update(c.id, details);
        setCreations((list) => list.map((x) => (x.id === c.id ? saved : x)));
        if (studioStore.active?.creationId === c.id) studioStore.renameActive(saved.name);
        say("detailsSaved");
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    [repos, say, fail, setCreations],
  );

  const duplicateCreation = useCallback(
    async (c: Creation) => {
      if (!repos) return null;
      try {
        const copy = await repos.creations.duplicate(c.id, copyName(c.name, t("studio.workspace.copySuffix")));
        setCreations((list) => [copy, ...list]);
        say("duplicated", "success", { name: copy.name });
        return copy;
      } catch (err) {
        fail(err);
        return null;
      }
    },
    [repos, say, fail, t, setCreations],
  );

  const toggleCreationFavorite = useCallback(
    async (c: Creation) => {
      if (!repos) return;
      // Optimistic: the heart answers at once and is put back if the write fails.
      setCreations((list) => list.map((x) => (x.id === c.id ? { ...x, isFavorite: !c.isFavorite } : x)));
      try {
        await repos.creations.update(c.id, { isFavorite: !c.isFavorite });
      } catch (err) {
        setCreations((list) => list.map((x) => (x.id === c.id ? { ...x, isFavorite: c.isFavorite } : x)));
        fail(err);
      }
    },
    [repos, fail, setCreations],
  );

  const deleteCreation = useCallback(
    async (c: Creation) => {
      if (!repos) return false;
      try {
        await repos.creations.remove(c.id);
        setCreations((list) => list.filter((x) => x.id !== c.id));
        if (studioStore.active?.creationId === c.id) studioStore.unlink();
        say("deleted", "success", { name: c.name });
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    [repos, say, fail, setCreations],
  );

  const saveSelectionAsGroup = useCallback(
    async (ids: string[], details: RecordDetails) => {
      const data = getEngine()?.captureGroup(ids);
      if (!repos || !data) {
        say("groupNeedsTwo", "warning");
        return null;
      }
      try {
        const g = await repos.groups.create({ ...details, data });
        setGroups((list) => [g, ...list]);
        say("groupSaved", "success", { name: g.name });
        return g;
      } catch (err) {
        fail(err, "saveFailed");
        return null;
      }
    },
    [repos, say, fail, setGroups],
  );

  const insertGroup = useCallback(
    (g: GemGroup, toothId?: string | null) => {
      const engine = getEngine();
      if (!engine) return false;
      const { placed, skipped } = engine.insertGroup(g.data, toothId);
      if (!placed.length) {
        say("groupNoRoom", "warning");
        return false;
      }
      studioStore.addGroupRef({ id: uid(), gemGroupId: g.id, name: g.name, pieceIds: placed });
      if (skipped) say("groupInsertedPartial", "info", { name: g.name, count: skipped });
      else say("groupInserted", "success", { name: g.name, count: placed.length });
      const at = new Date().toISOString();
      setGroups((list) => list.map((x) => (x.id === g.id ? { ...x, lastUsedAt: at } : x)));
      void repos?.groups.update(g.id, { lastUsedAt: at }).catch(() => undefined);
      return true;
    },
    [repos, say, setGroups],
  );

  const updateGroupDetails = useCallback(
    async (g: GemGroup, details: RecordDetails) => {
      if (!repos) return false;
      try {
        replaceGroup(await repos.groups.update(g.id, details));
        say("detailsSaved");
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    [repos, say, fail, replaceGroup],
  );

  const duplicateGroup = useCallback(
    async (g: GemGroup) => {
      if (!repos) return null;
      try {
        const copy = await repos.groups.duplicate(g.id, copyName(g.name, t("studio.workspace.copySuffix")));
        setGroups((list) => [copy, ...list]);
        say("duplicated", "success", { name: copy.name });
        return copy;
      } catch (err) {
        fail(err);
        return null;
      }
    },
    [repos, say, fail, t, setGroups],
  );

  const toggleGroupFavorite = useCallback(
    async (g: GemGroup) => {
      if (!repos) return;
      setGroups((list) => list.map((x) => (x.id === g.id ? { ...x, isFavorite: !g.isFavorite } : x)));
      try {
        await repos.groups.update(g.id, { isFavorite: !g.isFavorite });
      } catch (err) {
        setGroups((list) => list.map((x) => (x.id === g.id ? { ...x, isFavorite: g.isFavorite } : x)));
        fail(err);
      }
    },
    [repos, fail, setGroups],
  );

  const deleteGroup = useCallback(
    async (g: GemGroup) => {
      if (!repos) return false;
      try {
        await repos.groups.remove(g.id);
        setGroups((list) => list.filter((x) => x.id !== g.id));
        say("deleted", "success", { name: g.name });
        return true;
      } catch (err) {
        fail(err);
        return false;
      }
    },
    [repos, say, fail, setGroups],
  );

  const submitFeedback = useCallback(
    async (input: FeedbackInput) => {
      if (!repos) return false;
      try {
        await repos.feedback.submit(input);
        return true;
      } catch (err) {
        fail(err, "feedbackFailed");
        return false;
      }
    },
    [repos, fail],
  );

  const value: WorkspaceValue = {
    userId,
    status,
    creations,
    groups,
    reload: () => setReloadTick((n) => n + 1),
    saveState,
    savedAt: snap.active?.savedAt ?? null,
    dirty,
    saveDesign,
    openCreation,
    startNewDesign,
    updateCreationDetails,
    duplicateCreation,
    toggleCreationFavorite,
    deleteCreation,
    saveSelectionAsGroup,
    insertGroup,
    updateGroupDetails,
    duplicateGroup,
    toggleGroupFavorite,
    deleteGroup,
    submitFeedback,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within StudioWorkspaceProvider");
  return ctx;
}
