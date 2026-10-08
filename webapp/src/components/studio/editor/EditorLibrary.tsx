import { useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Search } from "lucide-react";
import { GemPhoto } from "./PieceIcon";
import { GemGroupPanel } from "../workspace/GemGroupPanel";
import { useEditorLabels } from "./editorLabels";
import { FREE_TOOTH } from "../../../data/studioEditor";
import { useTaxonomy } from "../../../lib/catalog/useTaxonomy";
import { useLocalized } from "../../../lib/localized";
import { placeOnTooth } from "../../../lib/studio3d/actions";
import { getEngine } from "../../../lib/studio3d/engine";
import type { StudioGem } from "../../../lib/studio3d/gemCatalog";
import { filterSections, librarySections } from "../../../lib/studio3d/librarySections";
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
          {/* One cut at a time, with what it holds under the search; and every section folded or unfolded at once. */}
          {sections.length > 1 && (
            <div className="mb-1 flex flex-none items-center gap-1 pl-4 pr-2">
              <div
                role="group"
                aria-label={t("studio.editor.library.shapesLabel")}
                className="gt-editor-scroll-x flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain py-1 pr-6 [mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]"
                // A mouse wheel only turns up and down: let it run along the row.
                onWheel={(e) => {
                  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
                }}
              >
                <FilterChip on={!chosen} onClick={() => setChosen(null)} label={t("studio.editor.library.allShapes")} count={total} />
                {sections.map((section) => (
                  <FilterChip
                    key={section.id}
                    on={chosen === section.id}
                    onClick={() => setChosen(chosen === section.id ? null : section.id)}
                    label={section.label}
                    count={section.items.length}
                    gem={section.items[0]}
                  />
                ))}
              </div>
              {!unfoldAll && shown.length > 1 && (
                <button
                  type="button"
                  onClick={foldAll}
                  aria-label={foldLabel}
                  title={foldLabel}
                  className={clsx("grid h-8 w-8 flex-none place-items-center rounded-full text-[var(--gt-ink-600)] hover:bg-[var(--gt-ink-100)]", focusRing)}
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
            {shown.map((g) => {
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
            {status === "ready" && !shown.length && (
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

/** A cut (or family) to show alone, with how many gems it holds under the current search. */
function FilterChip({ on, onClick, label, count, gem }: { on: boolean; onClick: () => void; label: string; count: number; gem?: StudioGem }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(e) => {
        onClick();
        // The row scrolls: the chosen cut stays in sight.
        const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest", behavior: smooth ? "smooth" : "auto" });
      }}
      className={clsx(
        "inline-flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] border pl-2.5 pr-3 text-[11.5px] font-semibold transition-colors",
        focusRing,
        on
          ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-white"
          : "border-[var(--border-subtle)] bg-[var(--surface-page)] text-[var(--text-body)] hover:border-[var(--border-strong)]",
      )}
    >
      {gem && <GemPhoto src={gem.image} look={gem.finishes[0].look} size={16} />}
      {label}
      <span className={clsx("tabular-nums", on ? "text-white/70" : "text-[var(--text-subtle)]")}>{count}</span>
    </button>
  );
}
