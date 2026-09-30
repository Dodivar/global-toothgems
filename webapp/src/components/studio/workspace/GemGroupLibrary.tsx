import { useMemo, useState } from "react";
import { BookOpen, MousePointer2, RotateCw } from "lucide-react";
import { useNavigate } from "../../../lib/navigation";
import { Button } from "../../ui/Button";
import { studioSectionPath } from "../../../lib/studioUrl";
import { queryGroups } from "../../../lib/studioWorkspace/library";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { LibrarySkeleton } from "./CreationLibrary";
import { EmptyState } from "./EmptyState";
import { GemGroupCard } from "./GemGroupCard";
import { HelpHint } from "./HelpHint";
import { SearchAndFilters } from "./SearchAndFilters";
import { SignInPrompt } from "./SignInPrompt";
import { eyebrow, useWorkspaceFormat } from "./workspaceStyles";

/**
 * "My Gem Groups": the reusable arrangements — design blocks an experienced
 * artist drops onto a smile instead of placing the same gems one by one.
 */
export function GemGroupLibrary() {
  const { t } = useWorkspaceFormat();
  const ws = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => queryGroups(ws.groups, query), [ws.groups, query]);

  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-7 px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
      <header className="grid gap-2">
        <p className={eyebrow}>{t("studio.workspace.groups.eyebrow")}</p>
        <h1 className="m-0 flex items-center gap-2 text-[clamp(1.6rem,2.6vw,2.25rem)] font-[var(--weight-black)] leading-[1.1] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
          {t("studio.workspace.groups.title")}
          <HelpHint id="groups" />
        </h1>
        <p className="m-0 max-w-[60ch] text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-muted)]">
          {t("studio.workspace.groups.sub")}
        </p>
      </header>

      {ws.status === "signedOut" && <SignInPrompt />}
      {ws.status === "loading" && <LibrarySkeleton />}
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

      {ws.status === "ready" && ws.groups.length === 0 && (
        <EmptyState
          art="group"
          title={t("studio.workspace.groups.emptyTitle")}
          body={t("studio.workspace.groups.emptyBody")}
          actions={
            <>
              <Button variant="primary" size="sm" iconLeft={MousePointer2} onClick={() => navigate(studioSectionPath(null))}>
                {t("studio.workspace.groups.emptyCta")}
              </Button>
              <Button variant="outline" size="sm" iconLeft={BookOpen} onClick={() => navigate(studioSectionPath("help"))}>
                {t("studio.workspace.creations.emptyHelp")}
              </Button>
            </>
          }
        />
      )}

      {ws.status === "ready" && ws.groups.length > 0 && (
        <>
          <SearchAndFilters query={query} onQuery={setQuery} placeholder={t("studio.workspace.groups.searchPlaceholder")} />
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
                <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                  {t("studio.workspace.library.resetFilters")}
                </Button>
              }
            />
          ) : (
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,224px),1fr))] gap-5 p-0">
              {shown.map((g) => (
                <li key={g.id} className="grid">
                  <GemGroupCard group={g} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
