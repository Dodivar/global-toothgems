import { useCallback, useEffect, useState } from "react";

/**
 * Which side panels of the editor are open — the library on the left, the
 * inspector on the right — in the side-by-side layout (`studio-side` in
 * `index.css`: desktops, tablets, phones held sideways). Stacked on a phone
 * held upright, both are always there under the stage and this is ignored.
 *
 * The stage comes first: only a roomy desktop window opens the inspector by
 * default (on a tablet the quick bar over the selection covers most edits),
 * and a landscape phone starts on the stage alone. Where two panels would
 * cover most of the stage, opening one closes the other. The artist's own choice is
 * remembered per kind of screen, in this browser only.
 */

export type EditorPanel = "library" | "inspector";
export type EditorPanels = Record<EditorPanel, boolean>;

/** Same queries as the `studio-side` / `studio-short` variants of `index.css`. */
const SIDE_QUERY = "(min-width: 1024px), (orientation: landscape) and (min-width: 640px)";
/** Room for both panels and a generous stage, with a mouse: the inspector opens by default. */
const ROOMY_QUERY = "(min-width: 1536px) and (min-height: 820px) and (pointer: fine)";
/** Narrower than this, the stage cannot afford both panels at once. */
const BOTH_QUERY = "(min-width: 1280px)";
/** A phone held sideways: the library waits to be asked for too. */
const PHONE_QUERY = "(max-width: 899px)";

const STORAGE_KEY = "gt-studio3d-panels-v1";

type ScreenKind = "roomy" | "compact" | "phone";

interface Layout {
  side: boolean;
  kind: ScreenKind;
  both: boolean;
}

function readLayout(): Layout {
  const m = (q: string) => window.matchMedia(q).matches;
  return {
    side: m(SIDE_QUERY),
    kind: m(ROOMY_QUERY) ? "roomy" : m(PHONE_QUERY) ? "phone" : "compact",
    both: m(BOTH_QUERY),
  };
}

const DEFAULTS: Record<ScreenKind, EditorPanels> = {
  roomy: { library: true, inspector: true },
  compact: { library: true, inspector: false },
  phone: { library: false, inspector: false },
};

function readSaved(kind: ScreenKind): EditorPanels | null {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Record<string, unknown> | null;
    const v = all?.[kind] as Partial<EditorPanels> | undefined;
    return v && typeof v.library === "boolean" && typeof v.inspector === "boolean" ? { library: v.library, inspector: v.inspector } : null;
  } catch {
    return null;
  }
}

function writeSaved(kind: ScreenKind, panels: EditorPanels) {
  try {
    const all = (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Record<string, unknown> | null) ?? {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...all, [kind]: panels }));
  } catch {
    /* storage blocked: the choice lasts as long as the page */
  }
}

/** Keep one panel when two do not fit, preferring `keep`. */
function fit(panels: EditorPanels, both: boolean, keep: EditorPanel): EditorPanels {
  if (both || !(panels.library && panels.inspector)) return panels;
  return keep === "library" ? { library: true, inspector: false } : { library: false, inspector: true };
}

export function useEditorPanels() {
  // The editor renders in the browser only (`zoneScreen`): the screen is known from the first render,
  // so the first render already shows the right drawers.
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [panels, setPanels] = useState<EditorPanels>(() => {
    const first = readLayout();
    return fit(readSaved(first.kind) ?? DEFAULTS[first.kind], first.both, "library");
  });

  // Again whenever the screen turns or is resized across a threshold.
  useEffect(() => {
    const queries = [SIDE_QUERY, ROOMY_QUERY, BOTH_QUERY, PHONE_QUERY].map((q) => window.matchMedia(q));
    let kind: ScreenKind = readLayout().kind;
    const sync = () => {
      const next = readLayout();
      setLayout(next);
      if (next.kind !== kind) {
        kind = next.kind;
        setPanels(fit(readSaved(next.kind) ?? DEFAULTS[next.kind], next.both, "library"));
      } else setPanels((cur) => fit(cur, next.both, "library"));
    };
    queries.forEach((q) => q.addEventListener("change", sync));
    return () => queries.forEach((q) => q.removeEventListener("change", sync));
  }, []);

  const setPanel = useCallback(
    (panel: EditorPanel, open: boolean) => {
      setPanels((cur) => {
        const next = fit({ ...cur, [panel]: open }, layout.both, panel);
        writeSaved(layout.kind, next);
        return next;
      });
    },
    [layout.both, layout.kind],
  );

  return {
    /** The side-by-side layout is in use (otherwise both panels are stacked under the stage). */
    side: layout.side,
    /** Each panel is shown: always in the stacked layout. */
    open: layout.side ? panels : { library: true, inspector: true },
    setPanel,
    toggle: (panel: EditorPanel) => setPanel(panel, !panels[panel]),
  };
}

/** As long as `--duration-fast`, the length of the panels' slide (`index.css`). */
const SLIDE_MS = 160;

/**
 * A side panel on its way in or out: it stays drawn over the stage while it slides
 * away, then lets it go. `phase` names the slide to play — none on the first
 * render, so the editor does not open with its panels flying in.
 */
export function usePanelPresence(open: boolean) {
  const [prev, setPrev] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [moved, setMoved] = useState(false);
  if (prev !== open) {
    setPrev(open);
    setLeaving(!open);
    setMoved(true);
  }
  useEffect(() => {
    if (!leaving) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setLeaving(false), still ? 0 : SLIDE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  return { shown: open || leaving, phase: !moved ? null : open ? ("in" as const) : leaving ? ("out" as const) : null };
}
