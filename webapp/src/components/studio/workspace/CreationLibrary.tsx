import { useMemo, useState } from "react";
import { BookOpen, Plus, RotateCw } from "lucide-react";
import { useNavigate } from "../../../lib/navigation";
import { Button } from "../../ui/Button";
import { useStudio } from "../../../lib/studio3d/store";
import { studioSectionPath } from "../../../lib/studioUrl";
import {
  CREATION_FILTERS,
  matchesFilter,
  queryCreations,
  summarize,
  type CreationFilter,
  type CreationSort,
} from "../../../lib/studioWorkspace/library";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { CreationCard } from "./CreationCard";
import { EmptyState } from "./EmptyState";
import { HelpHint } from "./HelpHint";
import { SearchAndFilters } from "./SearchAndFilters";
import { SignInPrompt } from "./SignInPrompt";
import { useWorkspaceActions } from "./useWorkspaceActions";
import { eyebrow, useWorkspaceFormat } from "./workspaceStyles";

/**
 * "My Creations": the account's personal library of saved designs — a quiet
 * summary, lightweight search and filters, and a grid of visual cards.
 */
export function CreationLibrary() {
  const { t, price, count, now } = useWorkspaceFormat();
  const ws = useWorkspace();
  const snap = useStudio();
  const navigate = useNavigate();
  const { newDesign } = useWorkspaceActions();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CreationFilter>("all");
  const [sort, setSort] = useState<CreationSort>("updated");

  const shown = useMemo(
    () => queryCreations(ws.creations, { query, filter, sort, now }),
    [ws.creations, query, filter, sort, now],
  );
  const counts = useMemo(
    () => Object.fromEntries(CREATION_FILTERS.map((f) => [f, ws.creations.filter((c) => matchesFilter(c, f, now)).length])),
    [ws.creations, now],
  );
  const summary = summarize(ws.creations, ws.groups);

  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-7 px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
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
          <Button variant="primary" size="sm" iconLeft={Plus} onClick={newDesign}>
            {t("studio.workspace.creations.newDesign")}
          </Button>
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
          <section
            aria-labelledby="gt-ws-summary"
            className="grid gap-3 rounded-[var(--radius-lg)] sm:flex sm:flex-wrap sm:items-center sm:gap-x-8 border border-[var(--border-subtle)] bg-[linear-gradient(120deg,var(--gt-blue-50),var(--surface-card)_55%)] px-5 py-4"
          >
            <h2 id="gt-ws-summary" className="m-0 text-[12px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)]">
              {t("studio.workspace.summary.title")}
            </h2>
            <dl className="m-0 grid flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-2">
              {(
                [
                  ["creations", count(summary.creations)],
                  ["groups", count(summary.groups)],
                  ["gems", count(summary.gemsUsed)],
                  ["value", price(summary.totalEstimateMinor)],
                ] as const
              ).map(([key, value]) => (
                // The figure reads first; the term stays first in the markup, as a list of terms wants.
                <div key={key} className="flex flex-col sm:flex-row sm:items-baseline sm:gap-1.5">
                  <dt className="flex items-center gap-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
                    {t(`studio.workspace.summary.${key}`, {
                      count: key === "creations" ? summary.creations : key === "groups" ? summary.groups : summary.gemsUsed,
                    })}
                    {key === "value" && <HelpHint id="estimate" align="end" className="h-5 w-5" />}
                  </dt>
                  <dd className="order-first m-0 text-[18px] font-[var(--weight-black)] tabular-nums text-[var(--text-primary)]">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

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

          <p className="sr-only" aria-live="polite">
            {t("studio.workspace.library.resultCount", { count: shown.length })}
          </p>

          {shown.length === 0 ? (
            <EmptyState
              compact
              art="search"
              title={t("studio.workspace.library.noMatchTitle")}
              body={t("studio.workspace.library.noMatchBody")}
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
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
