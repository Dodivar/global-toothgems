import { useMemo, useState } from "react";
import { BookOpen, Plus, RotateCw } from "lucide-react";
import { useNavigate, useSearchParams } from "../../../lib/navigation";
import { Button } from "../../ui/Button";
import { useStudio } from "../../../lib/studio3d/store";
import { studioSectionPath } from "../../../lib/studioUrl";
import {
  CREATION_FILTERS,
  matchesFilter,
  queryCreations,
  type CreationFilter,
  type CreationSort,
} from "../../../lib/studioWorkspace/library";
import { COLLECTION_PARAM, collectionCounts, creationIdsIn } from "../../../lib/studioWorkspace/collections";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { CollectionBar } from "./Collections";
import { CreationCard } from "./CreationCard";
import { CreationExplorer, LibraryViewToggle } from "./CreationExplorer";
import { EmptyState } from "./EmptyState";
import { SearchAndFilters } from "./SearchAndFilters";
import { SignInPrompt } from "./SignInPrompt";
import { useWorkspaceActions } from "./useWorkspaceActions";
import { eyebrow, useWorkspaceFormat, workspacePage } from "./workspaceStyles";

/**
 * "My Creations": the account's personal library of saved designs — the
 * collections, one row of search, filter and sort, and a grid of visual cards.
 */
export function CreationLibrary() {
  const { t, now } = useWorkspaceFormat();
  const ws = useWorkspace();
  const snap = useStudio();
  const navigate = useNavigate();
  const { newDesign } = useWorkspaceActions();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CreationFilter>("all");
  const [sort, setSort] = useState<CreationSort>("updated");
  // The chosen collection lives in the address (?collection=…), so it survives a reload and the back button.
  const [params, setParams] = useSearchParams();
  const requested = params.get(COLLECTION_PARAM);
  // A collection that no longer exists (deleted, another account) shows the whole library.
  const collectionId = requested && ws.collections.some((c) => c.id === requested) ? requested : null;
  const selectCollection = (id: string | null) =>
    setParams(
      (prev) => {
        if (id) prev.set(COLLECTION_PARAM, id);
        else prev.delete(COLLECTION_PARAM);
        return prev;
      },
      { replace: true },
    );
  const inCollection = useMemo(
    () => (collectionId ? creationIdsIn(collectionId, ws.memberships) : null),
    [collectionId, ws.memberships],
  );
  const inScope = useMemo(
    () => (inCollection ? ws.creations.filter((c) => inCollection.has(c.id)) : ws.creations),
    [ws.creations, inCollection],
  );

  const shown = useMemo(
    () => queryCreations(ws.creations, { query, filter, sort, now, inCollection }),
    [ws.creations, query, filter, sort, now, inCollection],
  );
  // Filter counts follow the chosen collection; collection counts, the whole library.
  const counts = useMemo(
    () => Object.fromEntries(CREATION_FILTERS.map((f) => [f, inScope.filter((c) => matchesFilter(c, f, now)).length])),
    [inScope, now],
  );
  const perCollection = useMemo(
    () => collectionCounts(ws.collections, ws.memberships, ws.creations.map((c) => c.id)),
    [ws.collections, ws.memberships, ws.creations],
  );
  // The folders need the collections: if they could not be read, the grid (with its retry) stands in.
  const explorer = ws.libraryView === "explorer" && ws.collectionsStatus === "ready";
  const resetAll = () => {
    setQuery("");
    setFilter("all");
    selectCollection(null);
  };

  return (
    <div className={`${workspacePage} gap-7`}>
      <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="grid min-w-0 flex-1 basis-[320px] gap-2">
          <p className={eyebrow}>{t("studio.workspace.creations.eyebrow")}</p>
          <h1 className="m-0 text-[clamp(1.6rem,2.6vw,2.25rem)] font-[var(--weight-black)] leading-[1.1] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {t("studio.workspace.creations.title")}
          </h1>
          <p className="m-0 max-w-[58ch] text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-muted)]">
            {t("studio.workspace.creations.sub")}
          </p>
        </div>
        {ws.status === "ready" && (
          <div className="flex flex-wrap items-center gap-2.5">
            {ws.creations.length > 0 && ws.collectionsStatus !== "locked" && <LibraryViewToggle />}
            <Button variant="primary" size="sm" iconLeft={Plus} onClick={newDesign}>
              {t("studio.workspace.creations.newDesign")}
            </Button>
          </div>
        )}
      </header>

      {ws.status === "signedOut" && <SignInPrompt />}

      {ws.status === "error" && (
        <EmptyState
          art="search"
          title={t("studio.workspace.library.loadFailedTitle")}
          body={t("studio.workspace.library.loadFailedBody")}
          actions={
            <Button variant="outline" size="sm" iconLeft={RotateCw} onClick={ws.reload}>
              {t("studio.workspace.library.retry")}
            </Button>
          }
        />
      )}

      {ws.status === "loading" && <LibrarySkeleton />}

      {ws.status === "ready" && ws.creations.length === 0 && (
        <EmptyState
          title={t("studio.workspace.creations.emptyTitle")}
          body={t("studio.workspace.creations.emptyBody")}
          actions={
            <>
              <Button variant="primary" size="sm" iconLeft={Plus} onClick={() => navigate(studioSectionPath(null))}>
                {t("studio.workspace.creations.emptyCta")}
              </Button>
              <Button variant="outline" size="sm" iconLeft={BookOpen} onClick={() => navigate(studioSectionPath("help"))}>
                {t("studio.workspace.creations.emptyHelp")}
              </Button>
            </>
          }
        />
      )}

      {ws.status === "ready" && ws.creations.length > 0 && (
        <>
          {/* One block of tools above the grid: where to look (collections), then what to show. */}
          <div className="grid gap-3">
            {/* Below the Artist plan there are no folders to show (decision 113 (b)). */}
            {!explorer && ws.collectionsStatus !== "locked" && (
              <CollectionBar selectedId={collectionId} onSelect={selectCollection} counts={perCollection} total={ws.creations.length} />
            )}
            <SearchAndFilters
              query={query}
              onQuery={setQuery}
              placeholder={t("studio.workspace.creations.searchPlaceholder")}
              filter={filter}
              onFilter={setFilter}
              sort={sort}
              onSort={setSort}
              counts={counts}
            />
          </div>

          {explorer ? (
            <CreationExplorer
              query={query}
              filter={filter}
              sort={sort}
              now={now}
              folderId={collectionId}
              onOpenFolder={selectCollection}
              onReset={resetAll}
            />
          ) : (
            <>
              <p className="sr-only" aria-live="polite">
                {t("studio.workspace.library.resultCount", { count: shown.length })}
              </p>

              {shown.length === 0 && inCollection && inScope.length === 0 ? (
                <EmptyState
                  compact
                  title={t("studio.workspace.collections.emptyCollectionTitle")}
                  body={t("studio.workspace.collections.emptyCollectionBody")}
                  actions={
                    <Button variant="outline" size="sm" onClick={() => selectCollection(null)}>
                      {t("studio.workspace.collections.showAll")}
                    </Button>
                  }
                />
              ) : shown.length === 0 ? (
                <EmptyState
                  compact
                  art="search"
                  title={t("studio.workspace.library.noMatchTitle")}
                  body={t("studio.workspace.library.noMatchBody")}
                  actions={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetAll}
                    >
                      {t("studio.workspace.library.resetFilters")}
                    </Button>
                  }
                />
              ) : (
                <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,236px),1fr))] gap-5 p-0">
                  {shown.map((c) => (
                    <li key={c.id} className="grid">
                      <CreationCard creation={c} onStage={snap.active?.creationId === c.id} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export function LibrarySkeleton() {
  return (
    <ul aria-hidden="true" className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,236px),1fr))] gap-5 p-0">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
          <div className="aspect-[4/3] animate-pulse bg-[var(--gt-blue-100)] motion-reduce:animate-none" />
          <div className="grid gap-2 p-4">
            <div className="h-4 w-2/3 rounded bg-[var(--gt-ink-100)]" />
            <div className="h-3 w-1/2 rounded bg-[var(--gt-ink-100)]" />
          </div>
        </li>
      ))}
    </ul>
  );
}
