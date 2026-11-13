"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "../lib/navigation";
import { BellOff, Home, Link2Off, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "../components/ui/Button";
import { AuthShell, StateHeading } from "../components/security/AuthShell";
import { SuccessMark } from "../components/security/SuccessMark";
import { REMINDER_TOKEN_RE, stopEmailReminders, type StopRemindersResult } from "../lib/emailReminders";

type Phase = "ready" | "stopping" | StopRemindersResult;

/**
 * Where the reminder e-mails' "stop these reminders" link lands (decision 141):
 * `/rappels/desinscription?token=…`. Nothing happens on the visit itself — mail scanners
 * open links — only when the visitor presses the button.
 */
export function RemindersUnsubscribe() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [phase, setPhase] = useState<Phase>(() => (REMINDER_TOKEN_RE.test(token) ? "ready" : "invalid"));
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (phase !== "ready" && phase !== "stopping") headingRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const stop = async () => {
    setPhase("stopping");
    setPhase(await stopEmailReminders(token));
  };

  const homeButton = (
    <Button variant="ghost" fullWidth iconLeft={Home} onClick={() => navigate("/")}>
      {t("reminders.unsubscribe.home")}
    </Button>
  );

  if (phase === "ready" || phase === "stopping") {
    return (
      <AuthShell monogram={false}>
        <div className="grid gap-2 text-center">
          <span className="gt-eyebrow">{t("reminders.unsubscribe.eyebrow")}</span>
          <h1 className="text-[clamp(26px,4vw,34px)] leading-[1.15] tracking-[var(--tracking-display)]">{t("reminders.unsubscribe.title")}</h1>
          <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("reminders.unsubscribe.body")}</p>
        </div>
        <div className="grid gap-2">
          <Button variant="primary" size="lg" fullWidth iconLeft={BellOff} loading={phase === "stopping"} onClick={() => void stop()}>
            {phase === "stopping" ? t("reminders.unsubscribe.stopping") : t("reminders.unsubscribe.action")}
          </Button>
          {homeButton}
        </div>
      </AuthShell>
    );
  }

  if (phase === "stopped") {
    return (
      <AuthShell monogram={false}>
        <div role="status" className="grid justify-items-center gap-5 pt-2 text-center">
          <SuccessMark />
          <div className="grid gap-2">
            <h1 ref={headingRef} tabIndex={-1} className="text-[clamp(26px,4vw,34px)] leading-[1.15] tracking-[var(--tracking-display)] outline-none">
              {t("reminders.unsubscribe.doneTitle")}
            </h1>
            <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("reminders.unsubscribe.doneBody")}</p>
          </div>
        </div>
        <div className="grid gap-2">{homeButton}</div>
      </AuthShell>
    );
  }

  if (phase === "error") {
    return (
      <AuthShell monogram={false}>
        <StateHeading icon={TriangleAlert} tone="warning" title={t("reminders.unsubscribe.errorTitle")} headingRef={headingRef}>
          <p>{t("reminders.unsubscribe.errorBody")}</p>
        </StateHeading>
        <div className="grid gap-2">
          <Button variant="primary" size="lg" fullWidth iconLeft={RotateCw} onClick={() => void stop()}>
            {t("reminders.unsubscribe.retry")}
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
        title={t(unavailable ? "reminders.unsubscribe.unavailableTitle" : "reminders.unsubscribe.invalidTitle")}
        headingRef={headingRef}
      >
        <p>{t(unavailable ? "reminders.unsubscribe.unavailableBody" : "reminders.unsubscribe.invalidBody")}</p>
      </StateHeading>
      <div className="grid gap-2">{homeButton}</div>
    </AuthShell>
  );
}
