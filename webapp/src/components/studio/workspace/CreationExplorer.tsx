import clsx from "clsx";
import { useMemo } from "react";
import { ArrowLeft, ChevronRight, Folder, FolderOpen, FolderPlus, LayoutGrid, MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { Menu } from "../../ui/Menu";
import { useStudio } from "../../../lib/studio3d/store";
import { creationIdsIn } from "../../../lib/studioWorkspace/collections";
import { explorerFolderContents, explorerRoot, type ExplorerFolder } from "../../../lib/studioWorkspace/explorer";
import type { CreationFilter, CreationSort } from "../../../lib/studioWorkspace/library";
import type { LibraryView, StudioCollection } from "../../../lib/studioWorkspace/types";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { CollectionDot } from "./Collections";
import { CreationCard, CreationThumb } from "./CreationCard";
import { EmptyState } from "./EmptyState";
import { focusRing, iconButton } from "./workspaceStyles";

const grid = "m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,236px),1fr))] gap-5 p-0";
const sectionTitle = "m-0 flex items-baseline gap-2 text-[12px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]";

/**
 * "Grid" or "Folders": how My Creations is laid out. Two pressed-state
 * buttons with their labels (never icons alone); the choice is the member's
 * and follows their account.
 */
export function LibraryViewToggle() {
  const { t } = useTranslation();
  const ws = useWorkspace();
  const views: { id: LibraryView; icon: typeof LayoutGrid }[] = [
    { id: "grid", icon: LayoutGrid },
    { id: "explorer", icon: Folder },
  ];
  return (
    <div
      role="group"
      aria-label={t("studio.workspace.explorer.viewLabel")}
      className="inline-flex flex-none rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-0.5"
    >
      {views.map(({ id, icon: Icon }) => {
        const on = ws.libraryView === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => ws.setLibraryView(id)}
            className={clsx(
              "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-pill)] px-3 text-[12px] font-semibold transition-colors",
              on ? "bg-[var(--gt-ink-900)] text-white" : "text-[var(--gt-ink-700)] hover:bg-[var(--gt-ink-100)]",
              focusRing,
            )}
          >
            <Icon size={14} aria-hidden="true" />
            {t(`studio.workspace.explorer.views.${id}`)}
          </button>
        );
      })}
    </div>
  );
}

function FolderActions({ collection, className }: { collection: StudioCollection; className?: string }) {
  const { t } = useTranslation();
  return (
    <Menu
      label={t("studio.workspace.collections.manage", { name: collection.name })}
      width={220}
      trigger={(props) => (
        <button type="button" {...props} className={clsx(iconButton, className)}>
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      )}
      items={[
        {
          id: "edit",
          label: t("studio.workspace.collections.rename"),
          icon: PencilLine,
          onSelect: () => openWorkspaceDialog({ kind: "editCollection", collection }),
        },
        {
          id: "delete",
          label: t("studio.workspace.collections.delete"),
          icon: Trash2,
          destructive: true,
          onSelect: () => openWorkspaceDialog({ kind: "deleteCollection", collection }),
        },
      ]}
    />
  );
}

/** A folder: a cover of its latest creations, its name and count; opens on click or Enter. */
function FolderTile({ folder, onOpen }: { folder: ExplorerFolder; onOpen: () => void }) {
  const { t } = useTranslation();
  const { collection, count, previews } = folder;
  return (
    <article className="group/folder relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)] transition-[box-shadow,transform] duration-[var(--duration-normal)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] motion-reduce:hover:translate-y-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("studio.workspace.explorer.openFolder", { name: collection.name, count })}
        className={clsx("flex flex-1 flex-col text-left", focusRing, "focus-visible:-outline-offset-2")}
      >
        <div aria-hidden="true" className="grid aspect-[4/3] w-full grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden bg-[var(--gt-blue-100)]">
          {previews.length === 0 ? (
            <div className="col-span-2 row-span-2 grid place-items-center text-[var(--gt-blue-400)]">
              <Folder size={44} strokeWidth={1.4} />
            </div>
          ) : (
            previews.map((c, i) => (
              <div
                key={c.id}
                className={clsx(
                  "overflow-hidden bg-[var(--surface-card)]",
                  // One creation fills the cover; two share it; three: the first takes the left half.
                  previews.length === 1 && "col-span-2 row-span-2",
                  previews.length === 2 && "row-span-2",
                  previews.length === 3 && i === 0 && "row-span-2",
                )}
              >
                <CreationThumb creation={c} />
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-2.5 p-4 pr-12">
          <FolderOpen size={18} aria-hidden="true" className="flex-none text-[var(--gt-blue-600)]" />
          <span className="grid min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <CollectionDot color={collection.color} />
              <span className="truncate text-[15px] font-[var(--weight-black)] leading-snug text-[var(--text-primary)]">{collection.name}</span>
            </span>
            <span className="text-[12px] text-[var(--text-muted)]">{t("studio.workspace.explorer.folderCount", { count })}</span>
          </span>
        </div>
      </button>
      <FolderActions collection={collection} className="absolute bottom-3.5 right-2.5 h-8 w-8" />
    </article>
  );
}

function NewFolderTile() {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => openWorkspaceDialog({ kind: "editCollection" })}
      className={clsx(
        "grid min-h-[180px] place-items-center content-center gap-2 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--border-default)] p-6 text-[13px] font-bold text-[var(--gt-blue-700)] transition-colors hover:border-[var(--gt-blue-400)] hover:bg-[var(--surface-brand-wash)]",
        focusRing,
      )}
    >
      <FolderPlus size={26} aria-hidden="true" />
      {t("studio.workspace.collections.new")}
    </button>
  );
}

/**
 * My Creations as folders. At the top level the collections come first, then
 * the creations filed nowhere; a folder opens on its creations, with a trail
 * back. The open folder is the address's `?collection=` (the same one the
 * grid filters on), so back, reload and switching layouts keep it.
 */
export function CreationExplorer({
  query,
  filter,
  sort,
  now,
  folderId,
  onOpenFolder,
  onReset,
}: {
  query: string;
  filter: CreationFilter;
  sort: CreationSort;
  now: number;
  folderId: string | null;
  onOpenFolder: (id: string | null) => void;
  onReset: () => void;
}) {
  const { t, i18n } = useTranslation();
  const ws = useWorkspace();
  const snap = useStudio();
  const locale = i18n.language;
  const folder = folderId ? (ws.collections.find((c) => c.id === folderId) ?? null) : null;

  const root = useMemo(
    () => explorerRoot(ws.creations, ws.collections, ws.memberships, { query, filter, sort, now, locale }),
    [ws.creations, ws.collections, ws.memberships, query, filter, sort, now, locale],
  );
  const inside = useMemo(
    () => (folder ? explorerFolderContents(ws.creations, folder.id, ws.memberships, { query, filter, sort, now, locale }) : []),
    [folder, ws.creations, ws.memberships, query, filter, sort, now, locale],
  );
  // How many creations the open folder holds, whatever the search: tells an empty folder from no match.
  const folderSize = useMemo(() => {
    if (!folder) return 0;
    const ids = creationIdsIn(folder.id, ws.memberships);
    return ws.creations.filter((c) => ids.has(c.id)).length;
  }, [folder, ws.creations, ws.memberships]);

  const cards = (list: typeof ws.creations, inFolder?: StudioCollection) => (
    <ul className={grid}>
      {list.map((c) => (
        <li key={c.id} className="grid">
          <CreationCard creation={c} onStage={snap.active?.creationId === c.id} folder={inFolder} />
        </li>
      ))}
    </ul>
  );

  const noMatch = (
    <EmptyState
      compact
      art="search"
      title={t("studio.workspace.library.noMatchTitle")}
      body={t("studio.workspace.library.noMatchBody")}
      actions={
        <Button variant="outline" size="sm" onClick={onReset}>
          {t("studio.workspace.library.resetFilters")}
        </Button>
      }
    />
  );

  if (folder) {
    return (
      <section aria-labelledby="gt-explorer-folder" className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenFolder(null)}
            aria-label={t("studio.workspace.explorer.back")}
            className={clsx(iconButton, "h-9 w-9 border border-[var(--border-subtle)]")}
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <nav aria-label={t("studio.workspace.explorer.trail")} className="min-w-0 flex-1">
            <ol className="m-0 flex min-w-0 list-none items-center gap-1 p-0 text-[14px]">
              <li className="flex-none">
                <button
                  type="button"
                  onClick={() => onOpenFolder(null)}
                  className={clsx("rounded-[var(--radius-sm)] px-1 font-semibold text-[var(--gt-blue-700)] hover:underline", focusRing)}
                >
                  {t("studio.workspace.creations.eyebrow")}
                </button>
              </li>
              <li aria-hidden="true" className="flex-none text-[var(--text-subtle)]">
                <ChevronRight size={14} />
              </li>
              <li className="flex min-w-0 items-center gap-1.5" aria-current="page">
                <CollectionDot color={folder.color} />
                <h2 id="gt-explorer-folder" className="m-0 truncate text-[16px] font-[var(--weight-black)] text-[var(--text-primary)]">
                  {folder.name}
                </h2>
                <span className="flex-none text-[12px] text-[var(--text-muted)]">· {t("studio.workspace.explorer.folderCount", { count: folderSize })}</span>
              </li>
            </ol>
          </nav>
          <FolderActions collection={folder} className="h-9 w-9" />
        </div>
        {folderSize === 0 ? (
          <EmptyState
            compact
            title={t("studio.workspace.collections.emptyCollectionTitle")}
            body={t("studio.workspace.collections.emptyCollectionBody")}
            actions={
              <Button variant="outline" size="sm" iconLeft={ArrowLeft} onClick={() => onOpenFolder(null)}>
                {t("studio.workspace.explorer.back")}
              </Button>
            }
          />
        ) : inside.length === 0 ? (
          noMatch
        ) : (
          cards(inside, folder)
        )}
      </section>
    );
  }

  return (
    <div className="grid gap-8">
      {(!root.searching || root.folders.length > 0) && (
        <section aria-labelledby="gt-explorer-folders" className="grid gap-3">
          <h2 id="gt-explorer-folders" className={sectionTitle}>
            {t("studio.workspace.collections.label")}{" "}
            <span className="tabular-nums">({root.folders.length})</span>
          </h2>
          {!root.searching && root.folders.length === 0 && (
            <p className="m-0 text-[12.5px] text-[var(--text-muted)]">{t("studio.workspace.collections.emptyHint")}</p>
          )}
          <ul className={grid}>
            {root.folders.map((f) => (
              <li key={f.collection.id} className="grid">
                <FolderTile folder={f} onOpen={() => onOpenFolder(f.collection.id)} />
              </li>
            ))}
            {!root.searching && (
              <li className="grid">
                <NewFolderTile />
              </li>
            )}
          </ul>
        </section>
      )}

      <section aria-labelledby="gt-explorer-loose" className="grid gap-3">
        <h2 id="gt-explorer-loose" className={sectionTitle}>
          {t(root.searching ? "studio.workspace.explorer.results" : "studio.workspace.explorer.loose")}{" "}
          <span className="tabular-nums">({root.creations.length})</span>
        </h2>
        {root.creations.length > 0 ? (
          cards(root.creations)
        ) : root.searching ? (
          root.folders.length === 0 && noMatch
        ) : (
          <p className="m-0 text-[12.5px] text-[var(--text-muted)]">{t("studio.workspace.explorer.allFiled")}</p>
        )}
      </section>
    </div>
  );
}
