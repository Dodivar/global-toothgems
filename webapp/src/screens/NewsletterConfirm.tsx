"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "../lib/navigation";
import { ArrowRight, Home, Link2Off, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "../components/ui/Button";
import { AuthShell, StateHeading } from "../components/security/AuthShell";
import { SuccessMark } from "../components/security/SuccessMark";
import { CONFIRM_TOKEN_RE, confirmNewsletter, type ConfirmResult } from "../lib/newsletter/api";

type Phase = "confirming" | ConfirmResult;

/**
 * Where the newsletter's double opt-in e-mail lands: `/newsletter/confirmer?token=…`.
 *
 * Clicking the e-mail's link is the confirmation (owner's choice, 2026-11-06: no second
 * button). It is sent from the browser once the page has loaded, never by the server on
 * the request: a mail scanner that only fetches the link does not run it. Scanners that
 * run scripts could still confirm an address; the double opt-in still proves the
 * mailbox, and every campaign carries an unsubscribe link.
 */
export function NewsletterConfirm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [phase, setPhase] = useState<Phase>(() => (CONFIRM_TOKEN_RE.test(token) ? "confirming" : "invalid"));
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The token is single use: one request per page, even when the effect runs twice.
  const started = useRef(false);

  const confirm = async () => {
    setPhase("confirming");
    setPhase(await confirmNewsletter(token));
  };

  useEffect(() => {
    if (started.current || !CONFIRM_TOKEN_RE.test(token)) return;
    started.current = true;
    void confirmNewsletter(token).then(setPhase);
  }, [token]);

  useEffect(() => {
    if (phase !== "confirming") headingRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const homeButton = (
    <Button variant="ghost" fullWidth iconLeft={Home} onClick={() => navigate("/")}>
      {t("newsletter.confirm.home")}
    </Button>
  );

  if (phase === "confirming") {
    return (
      <AuthShell monogram={false}>
        <div role="status" className="grid justify-items-center gap-2 py-2 text-center">
          <span className="gt-eyebrow">{t("newsletter.confirm.eyebrow")}</span>
          <h1 className="text-[clamp(26px,4vw,34px)] leading-[1.15] tracking-[var(--tracking-display)]">{t("newsletter.confirm.confirming")}</h1>
        </div>
      </AuthShell>
    );
  }

  if (phase === "confirmed") {
    return (
      <AuthShell monogram={false}>
        <div role="status" className="grid justify-items-center gap-5 pt-2 text-center">
          <SuccessMark />
          <div className="grid gap-2">
            <h1 ref={headingRef} tabIndex={-1} className="text-[clamp(26px,4vw,34px)] leading-[1.15] tracking-[var(--tracking-display)] outline-none">
              {t("newsletter.confirm.doneTitle")}
            </h1>
            <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("newsletter.confirm.doneBody")}</p>
          </div>
        </div>
        <div className="grid gap-2">
          <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={() => navigate("/boutique")}>
            {t("newsletter.confirm.shop")}
          </Button>
          {homeButton}
        </div>
      </AuthShell>
    );
  }

  if (phase === "error") {
    return (
      <AuthShell monogram={false}>
        <StateHeading icon={TriangleAlert} tone="warning" title={t("newsletter.confirm.errorTitle")} headingRef={headingRef}>
          <p>{t("newsletter.confirm.errorBody")}</p>
        </StateHeading>
        <div className="grid gap-2">
          <Button variant="primary" size="lg" fullWidth iconLeft={RotateCw} onClick={() => void confirm()}>
            {t("newsletter.confirm.retry")}
          </Button>
          {homeButton}
        </div>
      </AuthShell>
    );
  }

  const unavailable = phase === "unavailable";
  return (
    <AuthShell monogram={false}>
      <StateHeading
        icon={Link2Off}
        tone={unavailable ? "neutral" : "error"}
        title={t(unavailable ? "newsletter.confirm.unavailableTitle" : "newsletter.confirm.invalidTitle")}
        headingRef={headingRef}
      >
        <p>{t(unavailable ? "newsletter.confirm.unavailableBody" : "newsletter.confirm.invalidBody")}</p>
      </StateHeading>
      <div className="grid gap-2">{homeButton}</div>
    </AuthShell>
  );
}
