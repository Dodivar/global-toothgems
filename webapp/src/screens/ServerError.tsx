"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Hourglass, House, RotateCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { SystemPage } from "../components/system/SystemPage";
import { MisalignedGemsVisual } from "../components/system/SystemVisuals";
import { useRouterLink } from "../components/system/useRouterLink";

/**
 * 500 — a temporary problem on our side.
 *
 * Reassurance first, then one clear action. No codes beyond the status label,
 * no stack trace, no server vocabulary.
 *
 * "Try again" shows its loading state and requests the page again.
 */
export function ServerError() {
  const { t } = useTranslation();
  const link = useRouterLink();
  const [retrying, setRetrying] = useState(false);

  const retry = () => {
    setRetrying(true);
    window.location.reload();
  };

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
      visual={<MisalignedGemsVisual pauseLabel={t("errors.serverError.pause")} />}
    />
  );
}
