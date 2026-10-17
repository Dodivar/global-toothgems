import { ArrowRight, Compass, Gem, MousePointer2, PartyPopper, Sliders, Sparkles, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { getEngine } from "../../../lib/studio3d/engine";
import { startTour, TOUR_STEPS } from "../../../lib/studioWorkspace/studioTour";
import { rememberOnboarding } from "../../../lib/studioWorkspace/workspaceUi";
import { TourCelebration, TourHero } from "./TourArt";

/**
 * The two moments around the guided tour (`StudioTour`), and the only two that
 * are modal: the welcome, where there is nothing to do on the stage yet, and
 * the celebration, once the tour is through.
 *
 * The welcome never traps anyone: "Explore on my own" is a first-class choice
 * beside "Start the tutorial", and either way the answer is remembered in this
 * browser so the stage opens straight away next time.
 */

/** A taste of the tour on the welcome: what the six steps add up to. */
const PROMISES: { id: string; icon: LucideIcon }[] = [
  { id: "explore", icon: Compass },
  { id: "place", icon: MousePointer2 },
  { id: "refine", icon: Sliders },
];

export function OnboardingOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();

  const explore = () => {
    rememberOnboarding("skipped");
    onClose();
  };

  const begin = () => {
    // The welcome asks once: taking the tour answers it, whether or not the
    // tour is seen through (the compass and Help replay it afterwards).
    rememberOnboarding("started");
    onClose();
    // Without a 3D stage (WebGL refused) the tour leaves out the steps that need one.
    startTour({ withStage: !!getEngine() });
  };

  return (
    <Dialog
      open
      onClose={explore}
      title={t("studio.workspace.onboarding.welcome.title")}
      description={t("studio.workspace.onboarding.welcome.sub")}
      icon={<Sparkles size={17} />}
      closeLabel={t("studio.workspace.onboarding.close")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={explore}>
            {t("studio.workspace.onboarding.welcome.explore")}
          </Button>
          <Button variant="primary" size="sm" iconRight={ArrowRight} className="ml-auto" onClick={begin}>
            {t("studio.workspace.onboarding.welcome.start")}
          </Button>
        </>
      }
    >
      <div className="gt-editor-panel-in grid gap-4">
        <TourHero />
        <p className="m-0 text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-body)]">{t("studio.workspace.onboarding.welcome.body")}</p>
        <ul className="m-0 grid list-none gap-2 p-0">
          {PROMISES.map(({ id, icon: Icon }) => (
            <li key={id} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-px grid h-7 w-7 flex-none place-items-center rounded-[var(--radius-sm)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)]"
              >
                <Icon size={14} />
              </span>
              <p className="m-0 pt-1 text-[12.5px] leading-snug text-[var(--text-body)]">{t(`studio.workspace.onboarding.welcome.promises.${id}`)}</p>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[11.5px] font-semibold text-[var(--text-subtle)]">
          {t("studio.workspace.onboarding.welcome.length", { count: TOUR_STEPS.length })}
        </p>
      </div>
    </Dialog>
  );
}

/**
 * The end of the tour. It says what is now within reach and where the guide
 * lives from here on — it never claims anything was saved, since saving a
 * creation needs an account and the tour has not done it.
 */
export function TourCompleteDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("studio.workspace.onboarding.complete.title")}
      description={t("studio.workspace.onboarding.complete.sub")}
      icon={<PartyPopper size={17} />}
      closeLabel={t("studio.workspace.onboarding.close")}
      footer={
        <Button variant="primary" size="sm" iconRight={Gem} className="ml-auto" onClick={onClose}>
          {t("studio.workspace.onboarding.complete.cta")}
        </Button>
      }
    >
      <div className="gt-editor-panel-in grid gap-4">
        <TourCelebration />
        <p className="m-0 text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-body)]">{t("studio.workspace.onboarding.complete.body")}</p>
        <p className="m-0 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--gt-blue-700)]">
          {t("studio.workspace.onboarding.complete.again")}
        </p>
      </div>
    </Dialog>
  );
}
