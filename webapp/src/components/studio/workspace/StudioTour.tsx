import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, Compass, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getEngine } from "../../../lib/studio3d/engine";
import type { StudioSnapshot } from "../../../lib/studio3d/store";
import {
  exitTour,
  markTourStepDone,
  nextTourStep,
  placeTourCard,
  previousTourStep,
  tourBaseline,
  useTour,
  visibleStage,
  type Box,
  type TourAnchor,
  type TourBaseline,
  type TourStep,
} from "../../../lib/studioWorkspace/studioTour";
import { openWorkspaceDialog, rememberOnboarding } from "../../../lib/studioWorkspace/workspaceUi";
import { StageGestures } from "./TourArt";
import { focusRing } from "./workspaceStyles";

/**
 * The guided tour over the real editor: a spotlight on one control at a time,
 * and a small card beside it saying what to do.
 *
 * Deliberately **not** a modal. The whole point is that the artist uses the
 * studio while being guided, so: the dim layer and the ring never take pointer
 * events, the card is `aria-modal="false"`, nothing is made `inert`, the
 * editor's own keyboard shortcuts keep working, and Escape leaves the tour only
 * while the focus is inside the card (anywhere else it still deselects on the
 * stage). Leaving at any step changes nothing on the stage.
 *
 * A step is ticked off only when the editor's own state says the action
 * happened (`studioTour.ts`); a step whose action cannot be observed has no
 * goal and simply has a "Next". Nothing here fakes a success.
 */

/** The card's width when it stands beside a control; docked it spans the screen. */
const CARD_WIDTH = 332;
const DOCKED_MAX = 420;
/** A guess until the card is measured, so its first frame is not in the wrong corner. */
const CARD_HEIGHT = 250;

export function StudioTour({ snap, hidden }: { snap: StudioSnapshot; hidden: boolean }) {
  const { t } = useTranslation();
  const tour = useTour();
  const step: TourStep | undefined = tour.steps[tour.index];
  const cardRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ box: Box; which: TourAnchor } | null>(null);
  const [card, setCard] = useState({ width: CARD_WIDTH, height: CARD_HEIGHT });
  const [viewport, setViewport] = useState({ width: CARD_WIDTH * 4, height: CARD_HEIGHT * 3 });
  const [cameraMoved, setCameraMoved] = useState(false);
  // A Back / Next press moves the focus to the card; a step the artist
  // completed on the stage does not take the caret away from them.
  const focusCard = useRef(false);

  const live = tour.running && !hidden && !!step;

  /* -- the stage as it was when this step opened: goals are measured against it -- */
  // Taken while rendering, the way `usePanelPresence` adjusts to a new prop:
  // the baseline belongs to one step of one run and must not follow the stage
  // afterwards, so an effect would read it a render too late.
  const stepKey = `${tour.runId}:${tour.index}`;
  const [base, setBase] = useState<{ key: string; value: TourBaseline } | null>(null);
  if (tour.running && base?.key !== stepKey) {
    setBase({ key: stepKey, value: tourBaseline(snap) });
    setCameraMoved(false);
  }

  /* -- a camera move the artist asked for: orbit, pan, wheel, the zoom buttons, a view -- */
  useEffect(() => {
    if (!live || !step?.needsEngine) return;
    return getEngine()?.onCameraGesture(() => setCameraMoved(true));
  }, [live, step?.needsEngine]);

  /* -- follow the control on screen: drawers slide, windows turn, the stage resizes -- */
  const measure = useCallback(() => {
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    const el = cardRef.current;
    if (el) setCard({ width: el.offsetWidth, height: el.offsetHeight });
    setAnchor(step ? resolveAnchor(step) : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!live) return;
    measure();
    // A short poll rather than a frame loop: it catches the drawers' slide, a
    // panel opened by hand and a resized stage, for almost nothing.
    const timer = setInterval(measure, 200);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [live, measure]);

  /* -- stacked layout (a phone held upright): bring the control into view once -- */
  useEffect(() => {
    if (!live || !step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
    const box = el?.getBoundingClientRect();
    if (!el || !box || box.height === 0) return;
    if (box.top >= 0 && box.bottom <= window.innerHeight) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  }, [live, step]);

  /* -- the goal, read from the editor's own state -- */
  const ctx = base?.key === stepKey ? { snap, base: base.value, cameraMoved } : null;
  const met = !!(step?.goal && ctx && step.goal(ctx));
  const midway = !met && !!(step?.midway && ctx && step.midway(ctx));
  const succeeded = met || (!!step && tour.done.includes(step.id));

  useEffect(() => {
    if (met && step) markTourStepDone(step.id);
  }, [met, step]);

  /* -- the steps whose next move is the obvious continuation go on by themselves -- */
  const last = tour.index === tour.steps.length - 1;
  useEffect(() => {
    if (!live || !met || !step?.autoAdvance || last) return;
    const timer = setTimeout(nextTourStep, 1100);
    return () => clearTimeout(timer);
  }, [live, met, step?.autoAdvance, last]);

  /* -- after a Back / Next press, the keyboard keeps its place on the card -- */
  useEffect(() => {
    if (!live || !focusCard.current) return;
    focusCard.current = false;
    cardRef.current?.focus();
  }, [live, tour.index]);

  const leave = useCallback(() => {
    rememberOnboarding("skipped");
    exitTour();
  }, []);

  const move = useCallback((to: "next" | "back") => {
    focusCard.current = true;
    if (to === "next") nextTourStep();
    else previousTourStep();
  }, []);

  const finish = useCallback(() => {
    rememberOnboarding("done");
    exitTour();
    openWorkspaceDialog({ kind: "tourComplete" });
  }, []);

  if (!live || !step) return null;

  const total = tour.steps.length;
  // The panel a step names can be closed: then its switch is pointed at, and the card says so.
  const usingFallback = !!anchor && anchor.which !== step.anchor;
  const bodyKey = usingFallback && step.fallback ? `${step.id}.bodyClosed` : `${step.id}.body`;
  const { left, top, dock } = placeTourCard(anchor?.box ?? null, card, viewport, step.inside && !usingFallback);
  const width = dock === "beside" ? CARD_WIDTH : Math.min(DOCKED_MAX, viewport.width - 24);
  const taskKey = succeeded ? "success" : midway ? "midway" : step.goal ? "task" : "note";

  return (
    <>
      {/* The dim and the ring: decoration only, never in the way of a press. */}
      {anchor && <Spotlight box={anchor.box} />}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="gt-tour-title"
        aria-describedby="gt-tour-body"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            leave();
            return;
          }
          // Only from the card itself: inside a button or a field the arrows belong to it.
          if (e.target !== e.currentTarget) return;
          if (e.key === "ArrowRight" && !last) move("next");
          if (e.key === "ArrowLeft" && tour.index > 0) move("back");
        }}
        style={{ left, top, width }}
        className={clsx(
          "gt-tour-card fixed z-[420] grid gap-3 rounded-[var(--radius-lg)] border border-[var(--gt-blue-200)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-lg)]",
          focusRing,
        )}
      >
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)]"
          >
            <Compass size={15} />
          </span>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <p className="m-0 text-[10px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)]">
              {t("studio.workspace.onboarding.progress", { step: tour.index + 1, total })}
            </p>
            <h2
              id="gt-tour-title"
              className="m-0 text-[15.5px] font-[var(--weight-black)] leading-tight tracking-[var(--tracking-tight)] text-[var(--text-primary)]"
            >
              {t(`studio.workspace.onboarding.${step.id}.title`)}
            </h2>
          </div>
          <button
            type="button"
            onClick={leave}
            aria-label={t("studio.workspace.onboarding.close")}
            title={t("studio.workspace.onboarding.close")}
            className={clsx(
              "-mr-1 -mt-1 grid h-7 w-7 flex-none place-items-center rounded-full text-[var(--text-subtle)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
              focusRing,
            )}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <Trail index={tour.index} total={total} steps={tour.steps} done={tour.done} label={t("studio.workspace.onboarding.trail")} />

        <p id="gt-tour-body" className="m-0 text-[13px] leading-relaxed text-[var(--text-body)]">
          {t(`studio.workspace.onboarding.${bodyKey}`)}
        </p>

        {step.id === "stage" && !succeeded && <StageGestures />}

        {/* The one thing to do now — and what the editor has actually seen of it. */}
        <p
          aria-live="polite"
          className={clsx(
            "m-0 flex items-start gap-2 rounded-[var(--radius-md)] px-3 py-2 text-[12.5px] font-semibold leading-snug",
            succeeded ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]" : "bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]",
          )}
        >
          {succeeded ? (
            <Check size={14} aria-hidden="true" className="mt-px flex-none" />
          ) : (
            <Sparkles size={14} aria-hidden="true" className="mt-px flex-none" />
          )}
          <span>{t(`studio.workspace.onboarding.${step.id}.${taskKey}`)}</span>
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={leave}
            className={clsx(
              "h-8 rounded-[var(--radius-pill)] px-2.5 text-[12px] font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]",
              focusRing,
            )}
          >
            {t("studio.workspace.onboarding.skip")}
          </button>
          <div className="ml-auto flex items-center gap-2">
            {tour.index > 0 && (
              <button
                type="button"
                onClick={() => move("back")}
                className={clsx(
                  "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] px-3 text-[12px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-page)]",
                  focusRing,
                )}
              >
                <ArrowLeft size={14} aria-hidden="true" />
                {t("studio.workspace.onboarding.back")}
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? finish() : move("next"))}
              className={clsx(
                "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] px-3.5 text-[12px] font-bold transition-colors",
                focusRing,
                succeeded || !step.goal
                  ? "bg-[var(--accent-cta)] text-[var(--gt-ink-900)] hover:bg-[var(--accent-cta-hover)]"
                  : "bg-[var(--gt-ink-900)] text-white hover:bg-[var(--gt-ink-700)]",
              )}
            >
              {last ? t("studio.workspace.onboarding.finish") : succeeded ? t("studio.workspace.onboarding.continue") : t("studio.workspace.onboarding.next")}
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The dim over everything but the control in question: one very large outer
 * shadow around the hole, with a ring and a soft halo on the hole itself
 * (`gt-tour-spot` in `index.css`). `pointer-events: none` throughout — the
 * control underneath stays exactly as clickable as it was, which is what makes
 * this a guide rather than a barrier.
 */
function Spotlight({ box }: { box: Box }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[410] overflow-hidden">
      <div style={{ left: box.left, top: box.top, width: box.width, height: box.height }} className="gt-tour-spot absolute rounded-[var(--radius-lg)]" />
    </div>
  );
}

/** The steps as a row of segments: where the artist is, and which objectives are behind them. */
function Trail({
  index,
  total,
  steps,
  done,
  label,
}: {
  index: number;
  total: number;
  steps: readonly TourStep[];
  done: readonly string[];
  label: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={index + 1}
      aria-valuetext={`${index + 1} / ${total}`}
      className="flex items-center gap-1"
    >
      {steps.map((s, i) => (
        <span
          key={s.id}
          aria-hidden="true"
          className={clsx(
            "h-1.5 flex-1 rounded-full transition-colors duration-[var(--duration-fast)]",
            i === index ? "bg-[var(--gt-ink-900)]" : done.includes(s.id) ? "bg-[var(--gt-emerald-400)]" : i < index ? "bg-[var(--gt-blue-400)]" : "bg-[var(--gt-ink-200)]",
          )}
        />
      ))}
    </div>
  );
}

/**
 * The element a step points at, measured. Where the panel it names is closed or
 * stacked out of sight, the switch that brings it back is pointed at instead —
 * the tour never opens a panel itself, because that choice is remembered as the
 * artist's own (`useEditorPanels`).
 */
function resolveAnchor(step: TourStep): { box: Box; which: TourAnchor } | null {
  for (const which of [step.anchor, step.fallback]) {
    if (!which) continue;
    const box = boxOf(which);
    if (!box) continue;
    // The stage reaches under its drawers: point at the part actually in view.
    if (which === "stage") {
      const panels = [boxOf("library"), boxOf("inspector")].filter((b): b is Box => b !== null);
      const seen = visibleStage(box, panels);
      return { box: seen.width > 0 ? seen : box, which };
    }
    return { box, which };
  }
  return null;
}

function boxOf(which: TourAnchor): Box | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${which}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
