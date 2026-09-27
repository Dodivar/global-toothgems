import { useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Gem, Layers, MousePointer2, Save, Sparkles, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { rememberOnboarding } from "../../../lib/studioWorkspace/workspaceUi";

const STEPS: { id: string; icon: LucideIcon }[] = [
  { id: "welcome", icon: Sparkles },
  { id: "place", icon: MousePointer2 },
  { id: "compose", icon: Gem },
  { id: "save", icon: Save },
];

/**
 * The first-visit welcome: four short steps over the stage, never a wall.
 * "Skip tutorial" is always one press away (as are Escape and the close
 * button), and whichever way it ends is remembered in this browser.
 */
export function OnboardingOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const { id, icon: Icon } = STEPS[step];

  const finish = (choice: "done" | "skipped") => {
    rememberOnboarding(choice);
    onClose();
  };

  return (
    <Dialog
      open
      onClose={() => finish("skipped")}
      title={t(`studio.workspace.onboarding.${id}.title`)}
      description={t("studio.workspace.onboarding.progress", { step: step + 1, total: STEPS.length })}
      icon={<Icon size={17} />}
      closeLabel={t("studio.workspace.onboarding.skip")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => finish("skipped")}>
            {t("studio.workspace.onboarding.skip")}
          </Button>
          <div className="ml-auto flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" iconLeft={ArrowLeft} onClick={() => setStep((s) => s - 1)}>
                {t("studio.workspace.onboarding.back")}
              </Button>
            )}
            {last ? (
              <Button variant="primary" size="sm" iconRight={ArrowRight} onClick={() => finish("done")}>
                {t("studio.workspace.onboarding.start")}
              </Button>
            ) : (
              <Button variant="dark" size="sm" iconRight={ArrowRight} onClick={() => setStep((s) => s + 1)}>
                {t("studio.workspace.onboarding.next")}
              </Button>
            )}
          </div>
        </>
      }
    >
      <div key={id} className="gt-editor-panel-in grid gap-4">
        <StepArt id={id} />
        <p className="m-0 text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-body)]">
          {t(`studio.workspace.onboarding.${id}.body`)}
        </p>
        <div aria-hidden="true" className="flex justify-center gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={clsx(
                "h-1.5 rounded-full transition-[width,background-color] duration-[var(--duration-normal)]",
                i === step ? "w-6 bg-[var(--gt-ink-900)]" : "w-1.5 bg-[var(--gt-ink-200)]",
              )}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}

/** A small scene per step, in the Studio's stage colours. */
function StepArt({ id }: { id: string }) {
  const teeth = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
  return (
    <svg aria-hidden="true" viewBox="0 0 320 128" className="block w-full rounded-[var(--radius-md)]">
      <defs>
        <radialGradient id="gt-onb-stage" cx="50%" cy="35%" r="80%">
          <stop offset="0%" stopColor="var(--gt-blue-50)" />
          <stop offset="65%" stopColor="var(--gt-blue-200)" />
          <stop offset="100%" stopColor="var(--gt-blue-300)" />
        </radialGradient>
      </defs>
      <rect width="320" height="128" fill="url(#gt-onb-stage)" />
      <path d="M40 30 Q160 -6 280 30 L280 44 Q160 18 40 44Z" fill="#eeb2b6" opacity=".85" />
      {teeth.map((x) => (
        <rect
          key={x}
          x={160 + x * 34 - 15}
          y={34 + Math.abs(x) * 4}
          width="30"
          height={62 - Math.abs(x) * 5}
          rx="11"
          fill="#fbf8f1"
          stroke="rgba(120,98,70,.2)"
        />
      ))}
      {id === "welcome" && (
        <g>
          <circle cx="143" cy="62" r="6" fill="#eef6ff" stroke="#fff" strokeWidth="2" />
          <circle cx="177" cy="62" r="6" fill="#eef6ff" stroke="#fff" strokeWidth="2" />
          <path d="M233 54l-2-6-2 6-6 2 6 2 2 6 2-6 6-2Z" fill="#fff" className="gt-editor-pulse" />
        </g>
      )}
      {id === "place" && (
        <g>
          <rect x="18" y="44" width="46" height="46" rx="12" fill="#fff" stroke="var(--gt-blue-300)" />
          <circle cx="41" cy="67" r="9" fill="#ff9dc0" stroke="#fff" strokeWidth="2" />
          <path d="M64 67 C100 67 110 62 136 62" fill="none" stroke="var(--gt-blue-500)" strokeWidth="2" strokeDasharray="4 4" />
          <circle cx="143" cy="62" r="7" fill="#ff9dc0" stroke="#fff" strokeWidth="2" className="gt-editor-floaty" />
        </g>
      )}
      {id === "compose" && (
        <g>
          <circle cx="143" cy="58" r="6" fill="#ff9dc0" stroke="#fff" strokeWidth="2" />
          <circle cx="177" cy="58" r="6" fill="#ff9dc0" stroke="#fff" strokeWidth="2" />
          <path d="M160 72l3.5 7 7.5 1-5.5 5 1.5 7.5-7-3.8-7 3.8 1.5-7.5-5.5-5 7.5-1Z" fill="#f6c05a" stroke="#fff" strokeWidth="1.5" />
          <rect x="128" y="44" width="64" height="56" rx="10" fill="none" stroke="var(--gt-blue-600)" strokeWidth="1.5" strokeDasharray="4 3" />
        </g>
      )}
      {id === "save" && (
        <g>
          <circle cx="143" cy="62" r="6" fill="#4d7cff" stroke="#fff" strokeWidth="2" />
          <circle cx="177" cy="62" r="6" fill="#4d7cff" stroke="#fff" strokeWidth="2" />
          <g transform="translate(236 30)">
            <rect width="62" height="70" rx="10" fill="#fff" stroke="var(--gt-blue-300)" />
            <rect x="7" y="7" width="48" height="34" rx="6" fill="var(--gt-blue-100)" />
            <rect x="7" y="48" width="34" height="5" rx="2.5" fill="var(--gt-ink-200)" />
            <rect x="7" y="57" width="22" height="5" rx="2.5" fill="var(--gt-emerald-300)" />
          </g>
          <Layers x="18" y="44" width="40" height="40" color="var(--gt-blue-600)" strokeWidth={1.5} />
        </g>
      )}
    </svg>
  );
}
