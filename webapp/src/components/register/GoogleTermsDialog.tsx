"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../ui/Dialog";
import { TermsNotice } from "../auth/TermsNotice";
import { GoogleMark } from "./GoogleDialog";

/**
 * The one step between "Continue with Google" and Google itself on the
 * registration page: the acceptance of the terms, a single button labelled as
 * such. Google cannot carry it, so it is given here and recorded when the
 * browser comes back with the new account (`lib/googleTerms.ts`).
 */
export function GoogleTermsDialog({
  onClose,
  onAccept,
}: {
  onClose: () => void;
  /** Starts the Google redirect; resolves false when it could not start. */
  onAccept: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    // On success the browser is leaving, so the dialog stays busy.
    if (!(await onAccept())) setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("termsAccept.dialogTitle")}
      description={t("termsAccept.dialogBody")}
      icon={<GoogleMark />}
      closeLabel={t("common.close")}
    >
      <TermsNotice cta={t("termsAccept.googleCta")} busy={busy} onAccept={() => void accept()} />
    </Dialog>
  );
}
