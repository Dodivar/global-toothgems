import { useState } from "react";
import clsx from "clsx";
import { Search } from "lucide-react";
import { PieceIcon } from "./PieceIcon";
import { useEditorLabels } from "./editorLabels";
import { CATALOG, FREE_TOOTH, JEWELRY_CATEGORIES } from "../../../data/studioEditor";
import { placeOnTooth } from "../../../lib/studio3d/actions";
import { getEngine } from "../../../lib/studio3d/engine";
import type { StudioSnapshot } from "../../../lib/studio3d/store";

/** Where a keyboard placement lands when no tooth is selected: the upper right central incisor. */
const DEFAULT_TOOTH = "11";

/**
 * The jewelry library.
 *
 * Three ways in, all reaching the same placement logic: drag a piece onto a
 * tooth; click it to "arm" it, then click a tooth; or, from the keyboard,
 * press Enter on it to place it on the selected tooth.
 */
export function EditorLibrary({ snap }: { snap: StudioSnapshot }) {
  const { t, pieceName, toothName } = useEditorLabels();
  const [q, setQ] = useState("");
  const query = q.trim().toLocaleLowerCase();

  const groups = JEWELRY_CATEGORIES.map((cat) => ({
    cat,
    items: CATALOG.filter(
      (item) =>
        item.category === cat &&
        (!query ||
          pieceName(item.id).toLocaleLowerCase().includes(query) ||
          t(`studio.editor.library.categories.${cat}`).toLocaleLowerCase().includes(query)),
    ),
  })).filter((g) => g.items.length);

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
        <p className="m-0 text-[12px] leading-snug text-[var(--text-muted)]">{t("studio.editor.library.sub")}</p>
      </div>
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
        {groups.map((g) => (
          <section key={g.cat} aria-labelledby={`gt-editor-cat-${g.cat}`}>
            <h3
              id={`gt-editor-cat-${g.cat}`}
              className="mb-2 mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)] after:h-px after:flex-1 after:bg-[var(--border-subtle)]"
            >
              {t(`studio.editor.library.categories.${g.cat}`)}
            </h3>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 p-0 lg:grid-cols-2">
              {g.items.map((item) => {
                const armed = snap.armedTypeId === item.id;
                const name = pieceName(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={armed}
                      aria-describedby="gt-editor-library-keys"
                      title={t("studio.editor.library.cardHint", { name })}
                      onPointerDown={(e) => {
                        if (e.button === 0) getEngine()?.beginPlacing(item.id, e);
                      }}
                      onClick={(e) => {
                        // A pointer click is handled by the engine (arm / drag);
                        // `detail === 0` is Enter or Space on the focused card.
                        if (e.detail === 0) placeOnTooth(item.id, targetTooth);
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
                      <PieceIcon id={item.id} size={24} />
                      <span className="text-center text-[11.5px] font-semibold leading-tight">{name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!groups.length && <p className="m-0 py-3 text-[12px] text-[var(--text-muted)]">{t("studio.editor.library.empty")}</p>}
      </div>
    </aside>
  );
}
