"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "../lib/navigation";
import { ArrowRight, Home, Link2Off, MailCheck, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "../components/ui/Button";
import { AuthShell, StateHeading } from "../components/security/AuthShell";
import { SuccessMark } from "../components/security/SuccessMark";
import { CONFIRM_TOKEN_RE, confirmNewsletter, type ConfirmResult } from "../lib/newsletter/api";

type Phase = "ready" | "confirming" | ConfirmResult;

/**
 * Where the newsletter's double opt-in e-mail lands: `/newsletter/confirmer?token=…`.
 *
 * The subscription is confirmed only when the visitor presses the button, never on
 * page load: mail providers' link scanners open every link of a message, and would
 * otherwise confirm addresses whose owners never clicked.
 */
export function NewsletterConfirm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [phase, setPhase] = useState<Phase>(() => (CONFIRM_TOKEN_RE.test(token) ? "ready" : "invalid"));
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (phase !== "ready" && phase !== "confirming") headingRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const confirm = async () => {
    setPhase("confirming");
    setPhase(await confirmNewsletter(token));
  };

  const homeButton = (
    <Button variant="ghost" fullWidth iconLeft={Home} onClick={() => navigate("/")}>
      {t("newsletter.confirm.home")}
    </Button>
  );

  if (phase === "ready" || phase === "confirming") {
    return (
      <AuthShell>
        <StateHeading icon={MailCheck} tone="brand" eyebrow={t("newsletter.confirm.eyebrow")} title={t("newsletter.confirm.readyTitle")} headingRef={headingRef}>
          <p>{t("newsletter.confirm.readyBody")}</p>
        </StateHeading>
        <div className="grid gap-2">
          <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} loading={phase === "confirming"} onClick={() => void confirm()}>
            {phase === "confirming" ? t("newsletter.confirm.confirming") : t("newsletter.confirm.confirm")}
          </Button>
          {homeButton}
        </div>
      </AuthShell>
    );
  }

  if (phase === "confirmed") {
    return (
      <AuthShell>
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
      <AuthShell>
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
    <AuthShell>
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
