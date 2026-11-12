"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../ui/Dialog";
import { TermsNotice } from "../auth/TermsNotice";
import { GoogleMark } from "./GoogleMark";
import { GoogleIdentityButton } from "../auth/GoogleIdentityButton";
import { isGoogleIdentityConfigured } from "../../lib/googleIdentity";
import type { OAuthProvider } from "../../lib/authProviders";
import { AppleMark } from "../auth/AppleMark";

/**
 * The one step between "Continue with Google / Apple" and the provider itself
 * on the registration page: the acceptance of the terms, a single button
 * labelled as such. The provider cannot carry it, so it is given here and
 * recorded when the browser comes back with the new account
 * (`lib/googleTerms.ts`).
 */
export function ProviderTermsDialog({
  provider,
  onClose,
  onAccept,
  onToken,
}: {
  provider: OAuthProvider;
  onClose: () => void;
  /** Starts the redirect to the provider; resolves false when it could not start. */
  onAccept: () => Promise<boolean>;
  /**
   * Google's own button instead of the redirect (its pop-up names this site,
   * not the Supabase domain): clicking it is the acceptance. Resolves false
   * when the session could not open.
   */
  onToken?: (token: string, nonce: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  // Google's script blocked or unreachable: the redirect button takes over.
  const [nativeFailed, setNativeFailed] = useState(false);
  const native = provider === "google" && !!onToken && isGoogleIdentityConfigured && !nativeFailed;

  const accept = async () => {
    setBusy(true);
    // On success the browser is leaving, so the dialog stays busy.
    if (!(await onAccept())) setBusy(false);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t(provider === "apple" ? "termsAccept.appleDialogTitle" : "termsAccept.dialogTitle")}
      description={t(provider === "apple" ? "termsAccept.appleDialogBody" : "termsAccept.dialogBody")}
      icon={provider === "apple" ? <AppleMark /> : <GoogleMark />}
      closeLabel={t("common.close")}
    >
      <TermsNotice
        cta={t(provider === "apple" ? "termsAccept.appleCta" : "termsAccept.googleCta")}
        busy={busy}
        onAccept={() => void accept()}
        action={
          native ? (
            <GoogleIdentityButton
              onUnavailable={() => setNativeFailed(true)}
              onCredential={(token, nonce) => {
                setBusy(true);
                void onToken?.(token, nonce).then((ok) => {
                  if (!ok) setBusy(false);
                });
              }}
            />
          ) : undefined
        }
      />
    </Dialog>
  );
}
