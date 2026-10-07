import { useMemo, useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import { GemPhoto } from "./PieceIcon";
import { GemGroupPanel } from "../workspace/GemGroupPanel";
import { useEditorLabels } from "./editorLabels";
import { FREE_TOOTH } from "../../../data/studioEditor";
import { useTaxonomy } from "../../../lib/catalog/useTaxonomy";
import { useLocalized } from "../../../lib/localized";
import { placeOnTooth } from "../../../lib/studio3d/actions";
import { getEngine } from "../../../lib/studio3d/engine";
import type { StudioGem } from "../../../lib/studio3d/gemCatalog";
import type { StudioSnapshot } from "../../../lib/studio3d/store";
import { useStudioGems } from "../../../lib/studio3d/useStudioGems";

/** Where a keyboard placement lands when no tooth is selected: the upper right central incisor. */
const DEFAULT_TOOTH = "11";

/**
 * The jewelry library: the shop's gems, whatever their stock (decided by the
 * owner, 2026-10-07), with their shop photo and name. Grouped by cut — the
 * shop's shape — and, for gems without one (the 18ct charms), by family.
 *
 * Three ways in, all reaching the same placement logic: drag a piece onto a
 * tooth; click it to "arm" it, then click a tooth; or, from the keyboard,
 * press Enter on it to place it on the selected tooth.
 */
export function EditorLibrary({ snap }: { snap: StudioSnapshot }) {
  const { t, toothName } = useEditorLabels();
  const { status, gems, reload } = useStudioGems();
  const { familyName } = useTaxonomy();
  const l = useLocalized();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"gems" | "groups">("gems");
  const query = q.trim().toLocaleLowerCase();

  const sections = useMemo(() => {
    const bySection = new Map<string, { id: string; label: string; byShape: boolean; items: StudioGem[] }>();
    for (const gem of gems) {
      const byShape = gem.shopShape !== null;
      const id = byShape ? `shape-${gem.shopShape}` : `family-${gem.family ?? "other"}`;
      const label = byShape
        ? t(`shop.shapes.${gem.shopShape}`)
        : gem.family
          ? familyName(gem.family)
          : t("studio.editor.library.otherGems");
      const section = bySection.get(id) ?? { id, label, byShape, items: [] };
      if (!query || l(gem.name).toLocaleLowerCase().includes(query) || label.toLocaleLowerCase().includes(query)) section.items.push(gem);
      bySection.set(id, section);
    }
    // Cuts first, alphabetically; then the families of charms.
    return [...bySection.values()]
      .filter((s) => s.items.length)
      .sort((a, b) => Number(b.byShape) - Number(a.byShape) || a.label.localeCompare(b.label));
  }, [gems, query, t, familyName, l]);

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
      className="flex min-h-0 flex-col border-b border-[var(--border-subtle)] bg-[var(--surface-card)] lg:border-b-0 lg:border-r"
    >
      <div className="grid gap-1 px-4 pb-3 pt-4">
        <h2 id="gt-editor-library" className="m-0 text-[length:var(--text-body-md)] font-[var(--weight-black)] text-[var(--text-primary)]">
          {t("studio.editor.library.title")}
        </h2>
        {tab === "gems" && <p className="m-0 text-[12px] leading-snug text-[var(--text-muted)]">{t("studio.editor.library.sub")}</p>}
      </div>
      {/* Single gems, or the account's saved Gem Groups: two sources, one placement model. */}
      <div role="tablist" aria-label={t("studio.workspace.panel.tabsLabel")} className="mx-4 mb-3 grid grid-cols-2 gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)] p-1">
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
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]",
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
          <label className="mx-4 mb-2 flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3 text-[var(--text-subtle)] transition-colors focus-within:border-[var(--focus-ring)]">
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
          <p id="gt-editor-library-keys" className="sr-only">
            {t("studio.editor.library.keyboardHint", { tooth: toothName(targetTooth), fdi: targetTooth })}
          </p>
          <div className="gt-editor-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-5">
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
            {sections.map((g) => (
              <section key={g.id} aria-labelledby={`gt-editor-cat-${g.id}`}>
                <h3
                  id={`gt-editor-cat-${g.id}`}
                  className="mb-2 mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)] after:h-px after:flex-1 after:bg-[var(--border-subtle)]"
                >
                  {g.label}
                </h3>
                <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 p-0 lg:grid-cols-2">
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
                            "flex w-full cursor-grab flex-col items-center gap-2 rounded-[var(--radius-md)] border px-2 pb-2.5 pt-3 transition-[border-color,background-color,transform,box-shadow] duration-[var(--duration-fast)]",
                            "hover:-translate-y-px hover:shadow-[var(--shadow-sm)] active:cursor-grabbing lg:touch-none",
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
            ))}
            {status === "ready" && !sections.length && <p className="m-0 py-3 text-[12px] text-[var(--text-muted)]">{t("studio.editor.library.empty")}</p>}
          </div>
        </div>
      )}
    </aside>
  );
}
