import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hourglass, House, RotateCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { SystemPage } from "../components/system/SystemPage";
import { MisalignedGemsVisual } from "../components/system/SystemVisuals";
import { useRouterLink } from "../components/system/useRouterLink";

/** How long the mock retry "works" before reporting back. */
const RETRY_MS = 1400;

/**
 * 500 — a temporary problem on our side.
 *
 * Reassurance first, then one clear action. No codes beyond the status label,
 * no stack trace, no server vocabulary.
 *
 * Prototype behaviour: "Try again" shows its loading state, then reports that
 * the issue is still being handled, so every state of the button and of the
 * live message can be reviewed. In production it would re-request the page.
 */
export function ServerError() {
  const { t } = useTranslation();
  const link = useRouterLink();
  const [retrying, setRetrying] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const retry = () => {
    setRetrying(true);
    timer.current = window.setTimeout(() => {
      setRetrying(false);
      setAttempts((count) => count + 1);
    }, RETRY_MS);
  };

  const message = attempts === 0 ? "" : attempts === 1 ? t("errors.serverError.stillOff") : t("errors.serverError.stillOffAgain");

  return (
    <SystemPage
      kind="serverError"
      status={{ label: t("errors.serverError.status"), icon: Hourglass }}
      title={t("errors.serverError.title")}
      body={t("errors.serverError.body")}
      note={t("errors.serverError.note")}
      actions={
        <>
          <Button variant="primary" size="lg" iconLeft={RotateCw} loading={retrying} onClick={retry}>
            {retrying ? t("errors.serverError.retrying") : t("errors.serverError.retry")}
          </Button>
          <Button {...link("/")} variant="outline" size="lg" iconLeft={House}>
            {t("errors.actions.home")}
          </Button>
        </>
      }
      after={
        // Always mounted, so the announcement is heard when its text arrives.
        <p role="status" className="m-0 min-h-[1.5em] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {message}
        </p>
      }
      visual={<MisalignedGemsVisual pauseLabel={t("errors.serverError.pause")} />}
    />
  );
}
