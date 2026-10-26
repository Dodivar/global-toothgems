import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { useStudioAccess, useStudioFeature } from "../studioAccess";
import { trackStudio } from "../studioAnalytics";
import { supabase } from "../supabase/client";
import { useToast } from "../toast";
import { limitKind, StudioStoreError } from "./repository";
import { sortTemplates, type StudioTemplate } from "./templates";
import { createTemplatesRepository, type TemplatesRepository } from "./templatesRepository";
import type { Creation } from "./types";
import { useWorkspace } from "./workspace";

/**
 * The Global Toothgems template library, beside the member's own workspace
 * (decision 97): the published templates, "use this template", and — for
 * `manage_content` staff — publishing their own creations.
 *
 * Templates live only on Supabase. With the demo accounts of the mock sign-in
 * (no real account) the library is `unavailable`: there is no fake catalogue.
 */

/** `locked`: the member's plan does not open the templates (decision 113 (b): Artist and above). */
export type TemplatesStatus = "signedOut" | "unavailable" | "locked" | "loading" | "ready" | "error";

interface TemplatesValue {
  status: TemplatesStatus;
  templates: StudioTemplate[];
  /** `my_permissions()` holds `manage_content`: shows the publish controls (the database decides). */
  canPublish: boolean;
  reload: () => void;
  /** Copy a template into the member's creations; the copy, already in the library, or null on failure. */
  copyTemplate: (t: StudioTemplate) => Promise<Creation | null>;
  /** Whether one of the caller's creations is currently published. */
  isPublished: (creationId: string) => boolean;
  /** Publish one of the caller's creations, or unpublish any template (staff). */
  setPublished: (target: { id: string; name: string }, published: boolean) => Promise<boolean>;
}

const TemplatesContext = createContext<TemplatesValue | null>(null);

export function StudioTemplatesProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { userId, restoring, realAuth } = useAuth();
  const ws = useWorkspace();
  const access = useStudioAccess();
  const reportDenied = access?.reportDenied;
  const refreshAccess = access?.refresh;
  // Below the Artist plan the database refuses the library: nothing is asked.
  const locked = useStudioFeature("templates") === false;
  const repo = useMemo<TemplatesRepository | null>(
    () => (userId && realAuth && supabase && !locked ? createTemplatesRepository(supabase, userId) : null),
    [userId, realAuth, locked],
  );

  const [loaded, setLoaded] = useState<{
    repo: TemplatesRepository;
    status: "ready" | "error";
    templates: StudioTemplate[];
    canPublish: boolean;
  } | null>(null);
  const [tick, setTick] = useState(0);
  const current = loaded && loaded.repo === repo ? loaded : null;
  const status: TemplatesStatus = !userId
    ? restoring
      ? "loading"
      : "signedOut"
    : locked
      ? "locked"
      : !repo
        ? "unavailable"
        : current
          ? current.status
          : "loading";
  const templates = useMemo(() => current?.templates ?? [], [current]);

  useEffect(() => {
    if (!repo) return;
    let live = true;
    Promise.all([repo.list(), repo.canPublish().catch(() => false)])
      .then(([list, canPublish]) => live && setLoaded({ repo, status: "ready", templates: sortTemplates(list), canPublish }))
      .catch(() => live && setLoaded({ repo, status: "error", templates: [], canPublish: false }));
    return () => {
      live = false;
    };
  }, [repo, tick]);

  const fail = useCallback(
    (err: unknown, key: string) => {
      const limit = limitKind(err);
      if (limit) {
        // The plan's number is reached (decision 113): nothing was saved; the
        // usage is read again so the plan pages show it.
        showToast(t("studio.access.limit.title"), t(`studio.access.limit.${limit}`), "warning");
        void refreshAccess?.();
        return;
      }
      if (err instanceof StudioStoreError && err.code === "accessDenied") {
        showToast(t("studio.access.denied.title"), t("studio.access.denied.body"), "warning");
        reportDenied?.(key);
        return;
      }
      const gone = err instanceof StudioStoreError && err.code === "notFound";
      showToast(t(`studio.templates.toasts.${gone ? "gone" : key}`), t("studio.workspace.toasts.tryAgain"), "error");
      if (gone) setTick((n) => n + 1);
    },
    [showToast, t, reportDenied, refreshAccess],
  );

  const adoptCreation = ws.adoptCreation;
  const copyTemplate = useCallback(
    async (template: StudioTemplate) => {
      if (!repo) return null;
      try {
        const copy = await repo.use(template);
        adoptCreation(copy);
        showToast(t("studio.templates.toasts.used", { name: copy.name }), undefined, "success");
        trackStudio("studio_template_used", { piece_count: copy.elementCount });
        return copy;
      } catch (err) {
        fail(err, "useFailed");
        return null;
      }
    },
    [repo, adoptCreation, showToast, t, fail],
  );

  const publishedIds = useMemo(() => new Set(templates.map((x) => x.id)), [templates]);
  const isPublished = useCallback((id: string) => publishedIds.has(id), [publishedIds]);

  const setPublished = useCallback(
    async (c: { id: string; name: string }, published: boolean) => {
      if (!repo) return false;
      try {
        await repo.setPublished(c.id, published);
        showToast(t(`studio.templates.toasts.${published ? "published" : "unpublished"}`, { name: c.name }), undefined, "success");
        setTick((n) => n + 1);
        return true;
      } catch (err) {
        fail(err, "publishFailed");
        return false;
      }
    },
    [repo, showToast, t, fail],
  );

  const value: TemplatesValue = {
    status,
    templates,
    canPublish: current?.canPublish ?? false,
    reload: () => setTick((n) => n + 1),
    copyTemplate,
    isPublished,
    setPublished,
  };
  return <TemplatesContext.Provider value={value}>{children}</TemplatesContext.Provider>;
}

export function useStudioTemplates(): TemplatesValue {
  const ctx = useContext(TemplatesContext);
  if (!ctx) throw new Error("useStudioTemplates must be used within StudioTemplatesProvider");
  return ctx;
}
