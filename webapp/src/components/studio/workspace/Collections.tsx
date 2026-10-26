import clsx from "clsx";
import { useId, useState, type FormEvent } from "react";
import { FolderPlus, MoreHorizontal, PencilLine, Plus, RotateCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/Checkbox";
import { Dialog } from "../../ui/Dialog";
import { Menu } from "../../ui/Menu";
import { collectionIdsOf, sortCollections } from "../../../lib/studioWorkspace/collections";
import { COLLECTION_COLORS, type CollectionColor, type CollectionDetails, type StudioCollection } from "../../../lib/studioWorkspace/types";
import { COLLECTION_NAME_MAX, validateCollection, type CollectionError } from "../../../lib/studioWorkspace/validation";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog, type WorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { chipClass, collectionDot, fieldClass, focusRing, iconButton } from "./workspaceStyles";

/**
 * Collections of saved creations: the library's collection bar, the
 * checklist that files a creation (card menu, detail, save dialog) and the
 * dialogs that create, rename and delete a collection. Everything goes
 * through the workspace store; the database decides who may write.
 */

export function CollectionDot({ color, className }: { color: CollectionColor | null; className?: string }) {
  return <span aria-hidden="true" className={clsx("inline-block h-2.5 w-2.5 flex-none rounded-full", collectionDot[color ?? "none"], className)} />;
}

/** The member's collections, alphabetically in the UI language. */
export function useSortedCollections(): StudioCollection[] {
  const { i18n } = useTranslation();
  const { collections } = useWorkspace();
  return sortCollections(collections, i18n.language);
}

/* ---------------------------------------------------------------- bar */

/**
 * "All creations" and one chip per collection, with counts; the chosen one
 * narrows the library (combined with the search and the filter chips).
 */
export function CollectionBar({
  selectedId,
  onSelect,
  counts,
  total,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  counts: Record<string, number>;
  total: number;
}) {
  const { t } = useTranslation();
  const ws = useWorkspace();
  const sorted = useSortedCollections();
  const selected = sorted.find((c) => c.id === selectedId) ?? null;
  const labelId = useId();

  if (ws.collectionsStatus === "error") {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-2.5 text-[12.5px] text-[var(--text-muted)]">
        <span className="min-w-0 flex-1">{t("studio.workspace.collections.loadFailed")}</span>
        <Button variant="ghost" size="sm" iconLeft={RotateCw} onClick={ws.reload}>
          {t("studio.workspace.library.retry")}
        </Button>
      </div>
    );
  }

  return (
    <section aria-labelledby={labelId} className="grid gap-2">
      {/* The chips speak for themselves: the heading is for assistive technology only. */}
      <h2 id={labelId} className="sr-only">
        {t("studio.workspace.collections.label")}
      </h2>
      <div className="flex items-center gap-1.5">
        <div role="group" aria-labelledby={labelId} className="gt-editor-scroll-x -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-1">
          <button type="button" aria-pressed={selectedId === null} onClick={() => onSelect(null)} className={chipClass(selectedId === null)}>
            {t("studio.workspace.collections.all")}
            <span className={clsx("tabular-nums", selectedId === null ? "text-white/70" : "text-[var(--text-subtle)]")}>{total}</span>
          </button>
          {sorted.map((c) => {
            const on = c.id === selectedId;
            return (
              <button key={c.id} type="button" aria-pressed={on} onClick={() => onSelect(on ? null : c.id)} className={chipClass(on)}>
                <CollectionDot color={c.color} className={on && !c.color ? "border-white/70" : undefined} />
                <span className="max-w-[18ch] truncate">{c.name}</span>
                <span className={clsx("tabular-nums", on ? "text-white/70" : "text-[var(--text-subtle)]")}>{counts[c.id] ?? 0}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => openWorkspaceDialog({ kind: "editCollection" })}
            className={clsx(chipClass(false), "border-dashed text-[var(--gt-blue-700)]")}
          >
            <FolderPlus size={14} aria-hidden="true" />
            {t("studio.workspace.collections.new")}
          </button>
        </div>
        {selected && (
          <Menu
            label={t("studio.workspace.collections.manage", { name: selected.name })}
            width={220}
            trigger={(props) => (
              <button type="button" {...props} className={clsx(iconButton, "mb-1 h-8 w-8")}>
                <MoreHorizontal size={15} aria-hidden="true" />
              </button>
            )}
            items={[
              {
                id: "edit",
                label: t("studio.workspace.collections.rename"),
                icon: PencilLine,
                onSelect: () => openWorkspaceDialog({ kind: "editCollection", collection: selected }),
              },
              {
                id: "delete",
                label: t("studio.workspace.collections.delete"),
                icon: Trash2,
                destructive: true,
                onSelect: () => openWorkspaceDialog({ kind: "deleteCollection", collection: selected }),
              },
            ]}
          />
        )}
      </div>
      {sorted.length === 0 && <p className="m-0 text-[12px] text-[var(--text-subtle)]">{t("studio.workspace.collections.emptyHint")}</p>}
    </section>
  );
}

/* ---------------------------------------------------------- checklist */

/**
 * One box per collection, and a field to create one on the spot (it is
 * ticked at once). Controlled: the caller decides whether a tick writes now
 * (the picker) or with the save (the save dialog).
 */
export function CollectionChecklist({
  checked,
  onToggle,
  legend,
}: {
  checked: Set<string>;
  onToggle: (collection: StudioCollection, on: boolean) => void;
  legend: string;
}) {
  const { t } = useTranslation();
  const ws = useWorkspace();
  const sorted = useSortedCollections();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<CollectionError | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { field: useId(), error: useId() };

  const create = async () => {
    const details: CollectionDetails = { name: draft, color: null };
    const problem = validateCollection(details, ws.collections.map((c) => c.name));
    setError(problem);
    if (problem || busy) return;
    setBusy(true);
    const created = await ws.createCollection(details);
    setBusy(false);
    if (!created) return;
    setDraft("");
    onToggle(created, true);
  };

  if (ws.collectionsStatus === "error") {
    return <p className="m-0 text-[12.5px] text-[var(--text-muted)]">{t("studio.workspace.collections.loadFailed")}</p>;
  }

  return (
    <fieldset className="m-0 grid gap-3 border-0 p-0">
      <legend className="mb-1 p-0 text-[12.5px] font-bold text-[var(--text-primary)]">{legend}</legend>
      {sorted.length === 0 ? (
        <p className="m-0 text-[12.5px] text-[var(--text-muted)]">{t("studio.workspace.collections.picker.empty")}</p>
      ) : (
        <ul className="m-0 grid max-h-[240px] list-none gap-2.5 overflow-y-auto p-0 pr-1">
          {sorted.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Checkbox label={c.name} checked={checked.has(c.id)} onChange={(on) => onToggle(c, on)} />
              </div>
              <CollectionDot color={c.color} className="mt-1.5" />
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-1.5">
        <label htmlFor={ids.field} className="text-[12px] font-semibold text-[var(--text-muted)]">
          {t("studio.workspace.collections.picker.newLabel")}
        </label>
        <div className="flex gap-2">
          <input
            id={ids.field}
            value={draft}
            maxLength={COLLECTION_NAME_MAX}
            aria-invalid={!!error}
            aria-describedby={error ? ids.error : undefined}
            placeholder={t("studio.workspace.collections.dialog.namePlaceholder")}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              // Inside the save dialog's form, Enter creates the collection, not the design.
              if (e.key === "Enter") {
                e.preventDefault();
                void create();
              }
            }}
            className={clsx(fieldClass, "py-2")}
          />
          <Button variant="outline" size="sm" iconLeft={Plus} loading={busy} disabled={!draft.trim()} onClick={() => void create()}>
            {t("studio.workspace.collections.picker.add")}
          </Button>
        </div>
        {error && (
          <p id={ids.error} className="m-0 text-[12px] font-semibold text-[var(--status-error-fg)]">
            {t(`studio.workspace.collections.errors.${error}`, { max: COLLECTION_NAME_MAX })}
          </p>
        )}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------ dialogs */

/** Which collections a saved creation sits in; each tick is saved at once. */
export function CreationCollectionsDialog({
  creationId,
  back,
  onClose,
}: {
  creationId: string;
  back?: WorkspaceDialog;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ws = useWorkspace();
  const creation = ws.creations.find((c) => c.id === creationId);
  if (!creation) return null;
  const checked = collectionIdsOf(creation.id, ws.memberships);
  const close = () => {
    onClose();
    if (back) openWorkspaceDialog(back);
  };

  return (
    <Dialog
      open
      onClose={close}
      title={t("studio.workspace.collections.picker.title")}
      description={t("studio.workspace.collections.picker.sub", { name: creation.name })}
      icon={<FolderPlus size={17} />}
      closeLabel={t("studio.workspace.close")}
      footer={
        <Button variant="primary" size="sm" className="ml-auto" onClick={close}>
          {t("studio.workspace.collections.picker.done")}
        </Button>
      }
    >
      <CollectionChecklist
        legend={t("studio.workspace.collections.picker.legend", { name: creation.name })}
        checked={checked}
        onToggle={(collection, on) => void ws.setInCollection(creation, collection, on)}
      />
    </Dialog>
  );
}

/** Create a collection, or rename / recolour one. */
export function CollectionEditDialog({ collection, onClose }: { collection?: StudioCollection; onClose: () => void }) {
  const { t } = useTranslation();
  const ws = useWorkspace();
  const [details, setDetails] = useState<CollectionDetails>({ name: collection?.name ?? "", color: collection?.color ?? null });
  const [error, setError] = useState<CollectionError | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { name: useId(), error: useId(), colors: useId() };
  const others = ws.collections.filter((c) => c.id !== collection?.id).map((c) => c.name);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateCollection(details, others);
    setError(problem);
    if (problem || busy) return;
    setBusy(true);
    const ok = collection ? await ws.updateCollection(collection, details) : !!(await ws.createCollection(details));
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t(collection ? "studio.workspace.collections.dialog.editTitle" : "studio.workspace.collections.dialog.createTitle")}
      description={t("studio.workspace.collections.dialog.sub")}
      icon={collection ? <PencilLine size={17} /> : <FolderPlus size={17} />}
      closeLabel={t("studio.workspace.close")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("studio.workspace.cancel")}
          </Button>
          <Button type="submit" form="gt-collection-form" variant="primary" size="sm" className="ml-auto" loading={busy}>
            {t(collection ? "studio.workspace.collections.dialog.save" : "studio.workspace.collections.dialog.create")}
          </Button>
        </>
      }
    >
      <form id="gt-collection-form" onSubmit={submit} className="grid gap-5">
        <div className="grid gap-1.5">
          <label htmlFor={ids.name} className="text-[12.5px] font-bold text-[var(--text-primary)]">
            {t("studio.workspace.collections.dialog.name")}
          </label>
          <input
            id={ids.name}
            autoFocus
            required
            value={details.name}
            maxLength={COLLECTION_NAME_MAX}
            aria-invalid={!!error}
            aria-describedby={error ? ids.error : undefined}
            placeholder={t("studio.workspace.collections.dialog.namePlaceholder")}
            onChange={(e) => {
              setDetails({ ...details, name: e.target.value });
              if (error) setError(null);
            }}
            className={fieldClass}
          />
          {error && (
            <p id={ids.error} className="m-0 text-[12px] font-semibold text-[var(--status-error-fg)]">
              {t(`studio.workspace.collections.errors.${error}`, { max: COLLECTION_NAME_MAX })}
            </p>
          )}
        </div>
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-1 p-0 text-[12.5px] font-bold text-[var(--text-primary)]">{t("studio.workspace.collections.dialog.color")}</legend>
          <div className="flex flex-wrap gap-2">
            {([null, ...COLLECTION_COLORS] as (CollectionColor | null)[]).map((color) => {
              const on = details.color === color;
              const label = t(`studio.workspace.collections.colors.${color ?? "none"}`);
              return (
                <label
                  key={color ?? "none"}
                  className={clsx(
                    "inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] border px-3 text-[12.5px] font-semibold transition-colors",
                    "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                    on ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-100)] text-[var(--gt-ink-900)]" : "border-[var(--border-subtle)] text-[var(--gt-ink-700)] hover:border-[var(--gt-blue-400)]",
                  )}
                >
                  <input
                    type="radio"
                    name={ids.colors}
                    className="sr-only"
                    checked={on}
                    onChange={() => setDetails({ ...details, color })}
                  />
                  <CollectionDot color={color} />
                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

/** The collections a creation sits in, as chips, with the button that files it. */
export function CreationCollectionsSummary({ creationId, back }: { creationId: string; back?: WorkspaceDialog }) {
  const { t } = useTranslation();
  const ws = useWorkspace();
  const sorted = useSortedCollections();
  if (ws.collectionsStatus !== "ready") return null;
  const mine = collectionIdsOf(creationId, ws.memberships);
  const inside = sorted.filter((c) => mine.has(c.id));

  return (
    <section className="grid gap-2">
      <h3 className="m-0 text-[10.5px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
        {t("studio.workspace.collections.label")}
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {inside.length === 0 ? (
          <span className="text-[12.5px] italic text-[var(--text-subtle)]">{t("studio.workspace.collections.detailNone")}</span>
        ) : (
          <ul aria-label={t("studio.workspace.collections.label")} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {inside.map((c) => (
              <li
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--gt-ink-700)]"
              >
                <CollectionDot color={c.color} className="h-2 w-2" />
                {c.name}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => openWorkspaceDialog({ kind: "creationCollections", creationId, back })}
          className={clsx(
            "inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-[12px] font-bold text-[var(--gt-blue-700)] hover:bg-[var(--surface-brand-wash)]",
            focusRing,
          )}
        >
          <FolderPlus size={13} aria-hidden="true" />
          {t("studio.workspace.collections.addTo")}
        </button>
      </div>
    </section>
  );
}
