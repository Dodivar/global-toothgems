import { useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Gem, Search, X } from "lucide-react";
import { GemPhoto } from "./PieceIcon";
import { ShapeGlyph } from "../../ui/ShapeGlyph";
import { GemGroupPanel } from "../workspace/GemGroupPanel";
import { useEditorLabels } from "./editorLabels";
import { FREE_TOOTH } from "../../../data/studioEditor";
import { useTaxonomy } from "../../../lib/catalog/useTaxonomy";
import { useLocalized } from "../../../lib/localized";
import { placeOnTooth } from "../../../lib/studio3d/actions";
import { getEngine } from "../../../lib/studio3d/engine";
import { filterSections, librarySections, type LibrarySection } from "../../../lib/studio3d/librarySections";
import type { StudioSnapshot } from "../../../lib/studio3d/store";
import { useStudioGems } from "../../../lib/studio3d/useStudioGems";

/** Where a keyboard placement lands when no tooth is selected: the upper right central incisor. */
const DEFAULT_TOOTH = "11";
/** The sections the artist folded, kept in this browser (a convenience, never needed). */
const FOLDED_KEY = "gt-studio3d-library-folded-v1";

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]";

function readFolded(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeFolded(ids: string[]) {
  try {
    localStorage.setItem(FOLDED_KEY, JSON.stringify(ids));
  } catch {
    /* storage blocked: the folds last as long as the page */
  }
}

/**
 * The jewelry library: the shop's gems, whatever their stock (decided by the
 * owner, 2026-10-07), with their shop photo and name. Grouped by cut — the
 * shop's shape — and, for gems without one (the 18ct charms), by family
 * (`librarySections`).
 *
 * Three ways in, all reaching the same placement logic: drag a piece onto a
 * tooth; click it to "arm" it, then click a tooth; or, from the keyboard,
 * press Enter on it to place it on the selected tooth. On a touch screen a
 * card dragged sideways goes to the stage, while a swipe up or down scrolls
 * the list (`touch-pan-y`).
 *
 * To find a gem fast: the search, one chip per cut (one cut at a time), and
 * sections that fold. A search or a chosen cut unfolds what it shows.
 */
export function EditorLibrary({ snap }: { snap: StudioSnapshot }) {
  const { t, toothName } = useEditorLabels();
  const { status, gems, reload } = useStudioGems();
  const { familyName } = useTaxonomy();
  const l = useLocalized();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"gems" | "groups">("gems");
  const [chosen, setChosen] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The editor renders in the browser only (`zoneScreen`): storage can be read at once.
  const [folded, setFolded] = useState<string[]>(readFolded);

  const sections = useMemo(
    () =>
      librarySections(
        gems,
        {
          shape: (shape) => t(`shop.shapes.${shape}`),
          family: familyName,
          other: t("studio.editor.library.otherGems"),
          gemName: (gem) => l(gem.name),
        },
        q,
      ),
    [gems, q, t, familyName, l],
  );
  const shown = filterSections(sections, chosen);
  const chosenSection = sections.find((s) => s.id === chosen) ?? null;
  const choose = (id: string | null) => {
    setChosen(id);
    setPickerOpen(false);
  };
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  // What the artist asked to see is never folded away.
  const unfoldAll = !!q.trim() || !!chosen;
  const isFolded = (id: string) => !unfoldAll && folded.includes(id);
  const saveFolded = (ids: string[]) => {
    setFolded(ids);
    writeFolded(ids);
  };
  const allFolded = !unfoldAll && shown.length > 0 && shown.every((s) => folded.includes(s.id));
  const foldAll = () =>
    saveFolded(allFolded ? folded.filter((id) => !shown.some((s) => s.id === id)) : [...new Set([...folded, ...shown.map((s) => s.id)])]);
  const foldLabel = t(allFolded ? "studio.editor.library.unfoldAll" : "studio.editor.library.foldAll");

  const selectedPiece = snap.jewels.find((j) => j.id === snap.selectedJewelIds[0]);
  const targetTooth =
    snap.selectedToothId && snap.selectedToothId !== FREE_TOOTH
      ? snap.selectedToothId
      : selectedPiece && selectedPiece.toothId !== FREE_TOOTH
        ? selectedPiece.toothId
        : DEFAULT_TOOTH;

  return (
    <aside
      aria-labelledby="gt-editor-library"
      className="flex min-h-0 flex-col border-b border-[var(--border-subtle)] bg-[var(--surface-card)] studio-side:border-b-0 studio-side:border-r"
    >
      {/* On a phone held sideways every line of height counts: the title is left to screen readers. */}
      <div className="grid gap-1 px-4 pb-3 pt-4 studio-short:p-0 studio-short:pt-2.5">
        <h2 id="gt-editor-library" className="m-0 text-[length:var(--text-body-md)] font-[var(--weight-black)] text-[var(--text-primary)] studio-short:sr-only">
          {t("studio.editor.library.title")}
        </h2>
        {tab === "gems" && <p className="m-0 text-[12px] leading-snug text-[var(--text-muted)] studio-short:hidden">{t("studio.editor.library.sub")}</p>}
      </div>
      {/* Single gems, or the account's saved Gem Groups: two sources, one placement model. */}
      <div
        role="tablist"
        aria-label={t("studio.workspace.panel.tabsLabel")}
        className="mx-4 mb-3 grid grid-cols-2 gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)] p-1 studio-short:mb-2"
      >
        {(["gems", "groups"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`gt-editor-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`gt-editor-tabpanel-${id}`}
            onClick={() => setTab(id)}
            className={clsx(
              "h-8 rounded-[var(--radius-pill)] text-[12px] font-bold transition-[background-color,color,box-shadow] duration-[var(--duration-fast)]",
              focusRing,
              tab === id ? "bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--gt-ink-600)] hover:text-[var(--text-primary)]",
            )}
          >
            {t(`studio.workspace.panel.tabs.${id}`)}
          </button>
        ))}
      </div>
      {tab === "groups" && (
        <div id="gt-editor-tabpanel-groups" role="tabpanel" aria-labelledby="gt-editor-tab-groups" className="gt-editor-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          <GemGroupPanel snap={snap} />
        </div>
      )}
      {tab === "gems" && (
        <div id="gt-editor-tabpanel-gems" role="tabpanel" aria-labelledby="gt-editor-tab-gems" className="contents">
          <label className="mx-4 mb-2 flex h-9 flex-none items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3 text-[var(--text-subtle)] transition-colors focus-within:border-[var(--focus-ring)]">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t("studio.editor.library.search")}
              placeholder={t("studio.editor.library.search")}
              className="w-full min-w-0 bg-transparent text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)]"
            />
          </label>
          {/* The cut shown: one button naming it, opening the shape picker (the shop's own
              glyphs) in place of the list; and every section folded or unfolded at once. */}
          {sections.length > 1 && (
            <div className="mb-1 flex flex-none items-center gap-1 px-4">
              <button
                type="button"
                aria-expanded={pickerOpen}
                aria-controls="gt-editor-shape-picker"
                onClick={() => setPickerOpen(!pickerOpen)}
                className={clsx(
                  "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-pill)] border pl-2 pr-3 text-left text-[12px] font-semibold transition-colors",
                  focusRing,
                  pickerOpen || chosenSection
                    ? "border-[var(--gt-ink-900)] bg-[var(--surface-card)] text-[var(--text-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-page)] text-[var(--text-body)] hover:border-[var(--border-strong)]",
                )}
              >
                <ShapeMedia section={chosenSection} size={22} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[var(--text-subtle)]">{t("studio.editor.library.shapeLabel")} · </span>
                  {chosenSection ? chosenSection.label : t("studio.editor.library.allShapes")}
                </span>
                <span className="tabular-nums text-[var(--text-subtle)]">{chosenSection ? chosenSection.items.length : total}</span>
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  className={clsx("flex-none transition-transform duration-[var(--duration-fast)]", pickerOpen && "rotate-180")}
                />
              </button>
              {chosenSection && !pickerOpen && (
                <button
                  type="button"
                  onClick={() => setChosen(null)}
                  aria-label={t("studio.editor.library.showAllShapes")}
                  title={t("studio.editor.library.showAllShapes")}
                  className={clsx("grid h-9 w-9 flex-none place-items-center rounded-full text-[var(--gt-ink-600)] hover:bg-[var(--gt-ink-100)]", focusRing)}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
              {!unfoldAll && !pickerOpen && shown.length > 1 && (
                <button
                  type="button"
                  onClick={foldAll}
                  aria-label={foldLabel}
                  title={foldLabel}
                  className={clsx("grid h-9 w-9 flex-none place-items-center rounded-full text-[var(--gt-ink-600)] hover:bg-[var(--gt-ink-100)]", focusRing)}
                >
                  {allFolded ? <ChevronsUpDown size={15} aria-hidden="true" /> : <ChevronsDownUp size={15} aria-hidden="true" />}
                </button>
              )}
            </div>
          )}
          <p id="gt-editor-library-keys" className="sr-only">
            {t("studio.editor.library.keyboardHint", { tooth: toothName(targetTooth), fdi: targetTooth })}
          </p>
          <div className="gt-editor-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5">
            {status === "loading" && (
              <p role="status" className="m-0 py-3 text-[12px] text-[var(--text-muted)]">
                {t("studio.editor.library.loading")}
              </p>
            )}
            {status === "error" && (
              <div role="alert" className="grid gap-2 py-3">
                <p className="m-0 text-[12px] text-[var(--text-muted)]">{t("studio.editor.library.error")}</p>
                <button
                  type="button"
                  onClick={reload}
                  className="h-8 justify-self-start rounded-[var(--radius-pill)] border border-[var(--border-default)] px-3 text-[11px] font-semibold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  {t("studio.editor.library.retry")}
                </button>
              </div>
            )}
            {pickerOpen && (
              <ShapePicker
                sections={sections}
                chosen={chosen}
                total={total}
                allLabel={t("studio.editor.library.allShapes")}
                label={t("studio.editor.library.shapesLabel")}
                onChoose={choose}
                onClose={() => setPickerOpen(false)}
              />
            )}
            {!pickerOpen &&
              shown.map((g) => {
                const isClosed = isFolded(g.id);
                return (
                  <section key={g.id} aria-labelledby={`gt-editor-cat-${g.id}`}>
                    <h3 className="m-0 mt-2">
                      <button
                        type="button"
                        id={`gt-editor-cat-${g.id}`}
                        aria-expanded={!isClosed}
                        aria-controls={`gt-editor-cat-list-${g.id}`}
                        disabled={unfoldAll}
                        onClick={() => saveFolded(isClosed ? folded.filter((id) => id !== g.id) : [...folded, g.id])}
                        className={clsx(
                          "flex min-h-9 w-full items-center gap-2 rounded-[var(--radius-sm)] text-left text-[10px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)] after:h-px after:flex-1 after:bg-[var(--border-subtle)]",
                          "enabled:hover:text-[var(--text-primary)] disabled:cursor-default",
                          focusRing,
                        )}
                      >
                        {!unfoldAll && (
                          <ChevronDown
                            size={13}
                            aria-hidden="true"
                            className={clsx("flex-none transition-transform duration-[var(--duration-fast)]", isClosed && "-rotate-90")}
                          />
                        )}
                        <span>{g.label}</span>
                        <span className="font-semibold tabular-nums tracking-normal">{g.items.length}</span>
                      </button>
                    </h3>
                    <ul
                      id={`gt-editor-cat-list-${g.id}`}
                      hidden={isClosed}
                      className="m-0 mb-2 mt-1 grid list-none grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 p-0 studio-side:grid-cols-2"
                    >
                      {g.items.map((item) => {
                        const armed = snap.armedTypeId === item.key;
                        const name = l(item.name);
                        return (
                          <li key={item.key}>
                            <button
                              type="button"
                              aria-pressed={armed}
                              aria-describedby="gt-editor-library-keys"
                              title={t("studio.editor.library.cardHint", { name })}
                              onPointerDown={(e) => {
                                if (e.button === 0) getEngine()?.beginPlacing(item.key, e);
                              }}
                              onClick={(e) => {
                                // A pointer click is handled by the engine (arm / drag);
                                // `detail === 0` is Enter or Space on the focused card.
                                if (e.detail === 0) placeOnTooth(item.key, targetTooth);
                              }}
                              className={clsx(
                                "flex w-full cursor-grab touch-pan-y flex-col items-center gap-2 rounded-[var(--radius-md)] border px-2 pb-2.5 pt-3 transition-[border-color,background-color,transform,box-shadow] duration-[var(--duration-fast)] studio-short:gap-1.5 studio-short:pt-2",
                                "hover:-translate-y-px hover:shadow-[var(--shadow-sm)] active:cursor-grabbing",
                                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                                armed
                                  ? "border-[var(--gt-blue-500)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]"
                                  : "border-[var(--border-subtle)] bg-[var(--surface-page)] text-[var(--gt-ink-600)] hover:border-[var(--gt-blue-300)]",
                              )}
                            >
                              <GemPhoto src={item.image} look={item.finishes[0].look} size={44} className="pointer-events-none" />
                              <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight">{name}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            {status === "ready" && !pickerOpen && !shown.length && (
              <div className="grid gap-2 py-3">
                <p className="m-0 text-[12px] text-[var(--text-muted)]">{t("studio.editor.library.empty")}</p>
                {chosen && sections.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setChosen(null)}
                    className="h-8 justify-self-start rounded-[var(--radius-pill)] border border-[var(--border-default)] px-3 text-[11px] font-semibold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    {t("studio.editor.library.showAllShapes")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

/** A cut's glyph (the shop's own drawing), a jewel for a family of charms, four dots for "all". */
function ShapeMedia({ section, size }: { section: LibrarySection | null; size: number }) {
  if (!section)
    return (
      <span aria-hidden="true" className="grid flex-none grid-cols-2 place-items-center gap-0.5 p-1" style={{ width: size, height: size }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-full w-full rounded-[2px] bg-[var(--gt-blue-400)]" />
        ))}
      </span>
    );
  if (section.shape) return <ShapeGlyph shape={section.shape} size={size} className="flex-none text-[var(--gt-blue-700)]" />;
  // Charms have no cut: a jewel drawn in the same line.
  return <Gem size={size * 0.82} strokeWidth={1.5} aria-hidden="true" className="flex-none text-[var(--gt-blue-700)]" />;
}

/**
 * Every cut at once, as the shop's shape filter draws them: a tile per cut
 * with its glyph, its name and how many gems it holds under the search. Shown
 * in place of the list, so it has the panel's whole height on a small screen;
 * a pick (or Escape) brings the list back.
 */
function ShapePicker({
  sections,
  chosen,
  total,
  allLabel,
  label,
  onChoose,
  onClose,
}: {
  sections: readonly LibrarySection[];
  chosen: string | null;
  total: number;
  allLabel: string;
  label: string;
  onChoose: (id: string | null) => void;
  onClose: () => void;
}) {
  const tiles: { id: string | null; label: string; count: number; section: LibrarySection | null }[] = [
    { id: null, label: allLabel, count: total, section: null },
    ...sections.map((s) => ({ id: s.id, label: s.label, count: s.items.length, section: s })),
  ];
  return (
    <div
      id="gt-editor-shape-picker"
      role="radiogroup"
      aria-label={label}
      className="gt-editor-chip grid grid-cols-3 gap-1.5 pb-2 pt-2"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        // Marked handled, so the editor's own Escape (deselect) leaves the stage alone.
        e.preventDefault();
        onClose();
      }}
    >
      {tiles.map((tile) => {
        const on = chosen === tile.id;
        return (
          <button
            key={tile.id ?? "all"}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChoose(tile.id)}
            className={clsx(
              "flex min-h-[74px] flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border px-1 pb-1.5 pt-2 text-center transition-colors",
              focusRing,
              on
                ? "border-[var(--gt-ink-900)] bg-[var(--surface-brand-wash)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-page)] hover:border-[var(--gt-blue-300)]",
            )}
          >
            <ShapeMedia section={tile.section} size={26} />
            <span className="line-clamp-2 text-[11px] font-medium leading-tight text-[var(--text-primary)]">{tile.label}</span>
            <span className="text-[10.5px] tabular-nums text-[var(--text-subtle)]">{tile.count}</span>
          </button>
        );
      })}
    </div>
  );
}
