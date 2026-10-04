"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, CircleAlert } from "lucide-react";
import { Button } from "../ui/Button";
import { LegalDialog, type LegalDoc } from "../register/LegalDialog";

/**
 * The acceptance of the terms and the privacy policy in one click.
 *
 * The sentence names both documents (each opens in place, so nothing the
 * visitor is doing is lost) and the button that follows is the acceptance: its
 * label says so. Used wherever an account has not accepted yet — the page that
 * stands in for the member space, the cart, the dialog before Google — so the
 * wording and the gesture are the same everywhere.
 */
export function TermsNotice({
  cta,
  busy = false,
  failed = false,
  onAccept,
}: {
  cta: string;
  busy?: boolean;
  failed?: boolean;
  onAccept: () => void;
}) {
  const { t } = useTranslation();
  const [doc, setDoc] = useState<LegalDoc | null>(null);

  const legalLink = (which: LegalDoc, label: string) => (
    <a
      href={which === "terms" ? "/conditions-generales" : "/confidentialite"}
      onClick={(e) => {
        e.preventDefault();
        setDoc(which);
      }}
      className="font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-[3px] hover:text-[var(--text-link-hover)]"
    >
      {label}
    </a>
  );

  return (
    <div className="grid gap-4">
      <p className="m-0 text-[length:var(--text-body-sm)] leading-[1.6] text-[var(--text-body)]">
        {t("termsAccept.before")} {legalLink("terms", t("register.consent.terms"))} {t("register.consent.and")}{" "}
        {legalLink("privacy", t("register.consent.privacy"))}
        {t("register.consent.termsAfter")}
      </p>
      {failed && (
        <p role="alert" className="m-0 flex items-start gap-2 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">
          <CircleAlert size={14} aria-hidden="true" className="mt-[1px] flex-none" />
          {t("termsAccept.failed")}
        </p>
      )}
      <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} loading={busy} onClick={onAccept}>
        {cta}
      </Button>
      <LegalDialog doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
