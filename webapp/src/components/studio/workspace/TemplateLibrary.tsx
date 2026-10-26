import { useMemo, useState } from "react";
import clsx from "clsx";
import { RotateCw, Search, X } from "lucide-react";
import { Button } from "../../ui/Button";
import { searchTemplates, type StudioTemplate } from "../../../lib/studioWorkspace/templates";
import { useStudioTemplates } from "../../../lib/studioWorkspace/templatesStore";
import { LibrarySkeleton } from "./CreationLibrary";
import { EmptyState } from "./EmptyState";
import { PlanLocked } from "./PlanLocked";
import { SignInPrompt } from "./SignInPrompt";
import { TemplateCard } from "./TemplateCard";
import { TemplateDetail } from "./TemplateDetail";
import { useWorkspaceActions } from "./useWorkspaceActions";
import { eyebrow, focusRing, useWorkspaceFormat, workspacePage } from "./workspaceStyles";

/**
 * "Global Toothgems templates": designs published by the team, newest first,
 * renewed over time (decision 97). Using one copies it into the member's own
 * creations and opens the copy on the stage; the template itself never changes.
 */
export function TemplateLibrary() {
  const { t } = useWorkspaceFormat();
  const lib = useStudioTemplates();
  const { applyTemplate, busyId } = useTemplateAction();
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const shown = useMemo(() => searchTemplates(lib.templates, query), [lib.templates, query]);
  const detail = detailId ? lib.templates.find((x) => x.id === detailId) : undefined;

  return (
    <div className={`${workspacePage} gap-7`}>
      <header className="grid min-w-0 gap-2">
        <p className={eyebrow}>{t("studio.templates.eyebrow")}</p>
        <h1 className="m-0 text-[clamp(1.6rem,2.6vw,2.25rem)] font-[var(--weight-black)] leading-[1.1] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
          {t("studio.templates.title")}
        </h1>
        <p className="m-0 max-w-[58ch] text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-muted)]">{t("studio.templates.sub")}</p>
      </header>

      {lib.status === "signedOut" && <SignInPrompt />}

      {lib.status === "locked" && <PlanLocked feature="templates" />}

      {lib.status === "unavailable" && (
        <EmptyState art="search" title={t("studio.templates.unavailableTitle")} body={t("studio.templates.unavailableBody")} />
      )}

      {lib.status === "error" && (
        <EmptyState
          art="search"
          title={t("studio.templates.loadFailedTitle")}
          body={t("studio.templates.loadFailedBody")}
          actions={
            <Button variant="outline" size="sm" iconLeft={RotateCw} onClick={lib.reload}>
              {t("studio.workspace.library.retry")}
            </Button>
          }
        />
      )}

      {lib.status === "loading" && <LibrarySkeleton />}

      {lib.status === "ready" && lib.templates.length === 0 && (
        <EmptyState title={t("studio.templates.emptyTitle")} body={t(lib.canPublish ? "studio.templates.emptyBodyStaff" : "studio.templates.emptyBody")} />
      )}

      {lib.status === "ready" && lib.templates.length > 0 && (
        <>
          <label
            className={clsx(
              "flex h-10 min-w-0 max-w-[420px] items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3.5 text-[var(--text-subtle)] transition-colors",
              "focus-within:border-[var(--focus-ring)] focus-within:shadow-[var(--shadow-focus)]",
            )}
          >
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">{t("studio.templates.searchPlaceholder")}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("studio.templates.searchPlaceholder")}
              className="w-full min-w-0 bg-transparent text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)] [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("studio.workspace.library.clearSearch")}
                className={clsx("grid h-6 w-6 flex-none place-items-center rounded-full hover:bg-[var(--gt-ink-100)]", focusRing)}
              >
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </label>

          <p className="sr-only" aria-live="polite">
            {t("studio.templates.resultCount", { count: shown.length })}
          </p>

          {shown.length === 0 ? (
            <EmptyState
              compact
              art="search"
              title={t("studio.workspace.library.noMatchTitle")}
              body={t("studio.templates.noMatchBody")}
              actions={
                <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                  {t("studio.workspace.library.resetFilters")}
                </Button>
              }
            />
          ) : (
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,236px),1fr))] gap-5 p-0">
              {shown.map((x) => (
                <li key={x.id} className="grid">
                  <TemplateCard template={x} busy={busyId === x.id} onUse={() => void applyTemplate(x)} onPreview={() => setDetailId(x.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {detail && (
        <TemplateDetail
          template={detail}
          busy={busyId === detail.id}
          onUse={async () => {
            if (await applyTemplate(detail)) setDetailId(null);
          }}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

/** Copy a template into the member's creations, then open the copy on the stage (asking first if the stage holds unsaved work). */
function useTemplateAction() {
  const lib = useStudioTemplates();
  const { openInStudio } = useWorkspaceActions();
  const [busyId, setBusyId] = useState<string | null>(null);
  const applyTemplate = async (template: StudioTemplate) => {
    if (busyId) return false;
    setBusyId(template.id);
    try {
      const copy = await lib.copyTemplate(template);
      if (copy) openInStudio(copy);
      return !!copy;
    } finally {
      setBusyId(null);
    }
  };
  return { applyTemplate, busyId };
}
