import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "../../lib/navigation";
import { ArrowRight, Clock, Home, Link2Off, MailCheck } from "lucide-react";
import { Button } from "../ui/Button";
import { AuthShell, StateHeading } from "./AuthShell";
import { SuccessMark } from "./SuccessMark";
import { useAuth } from "../../lib/auth";
import { authLinkErrorFromUrl, type AuthLinkError } from "../../lib/authRedirect";
import { readEmailChange } from "../../lib/accountCredentials";

type Phase = "verifying" | "done" | "halfway" | AuthLinkError;

/**
 * Where Supabase's email-change links land (`/verifier-email?type=changement`)
 * when Supabase is configured.
 *
 * Supabase has already acted on the link before redirecting here. The page
 * never assumes the outcome: it reads it from the URL (a refused link, or the
 * "confirm the other link" message of a secure email change, where both the
 * old and the new address must confirm) and then from the account itself —
 * the change is done only once Supabase no longer holds a pending address.
 */
export function EmailChangeLanding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signedIn, restoring } = useAuth();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Read once, before anything rewrites the address bar.
  const [fromUrl] = useState<AuthLinkError | "halfway" | null>(() => {
    const error = authLinkErrorFromUrl();
    if (error) return error;
    const { hash, search } = window.location;
    const message = [hash.replace(/^#/, ""), search.replace(/^\?/, "")].some((part) => new URLSearchParams(part).get("message"));
    return message ? "halfway" : null;
  });
  const [checked, setChecked] = useState<{ phase: Phase; email: string | null } | null>(null);

  useEffect(() => {
    if (fromUrl || restoring || !signedIn) return;
    let active = true;
    void readEmailChange().then((state) => {
      if (!active) return;
      if (!state) setChecked({ phase: "invalid", email: null });
      else setChecked({ phase: state.pending ? "halfway" : "done", email: state.email });
    });
    return () => {
      active = false;
    };
  }, [fromUrl, restoring, signedIn]);

  // Without a session and without a message in the URL, the link did nothing usable.
  const phase: Phase = fromUrl ?? (!restoring && !signedIn ? "invalid" : checked?.phase ?? "verifying");

  useEffect(() => {
    if (phase !== "verifying") headingRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const toSecurity = () => {
    if (signedIn) navigate("/compte/securite");
    else navigate("/connexion", { state: { from: "/compte/securite" } });
  };

  const actions = (primary: string) => (
    <div className="grid gap-2">
      <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={toSecurity}>
        {primary}
      </Button>
      <Button variant="ghost" fullWidth iconLeft={Home} onClick={() => navigate("/")}>
        {t("security.verify.home")}
      </Button>
    </div>
  );

  if (phase === "verifying") {
    return (
      <AuthShell>
        <div role="status" className="grid justify-items-center gap-3 py-2 text-center">
          <h1 className="text-[clamp(26px,4vw,34px)] leading-[1.15] tracking-[var(--tracking-display)]">{t("security.verify.verifyingTitle")}</h1>
          <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("security.verify.verifyingBody")}</p>
        </div>
      </AuthShell>
    );
  }

  if (phase === "done") {
    return (
      <AuthShell>
        <div className="grid justify-items-center gap-5 pt-2 text-center">
          <SuccessMark />
          <div className="grid gap-2">
            <h1 ref={headingRef} tabIndex={-1} className="text-[clamp(26px,4vw,34px)] leading-[1.15] tracking-[var(--tracking-display)] outline-none">
              {t("security.verify.changeDoneTitle")}
            </h1>
            <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">
              {t("security.verify.successChangeBody", { email: checked?.email ?? "" })}
            </p>
          </div>
        </div>
        {actions(t("security.verify.backToSecurity"))}
      </AuthShell>
    );
  }

  if (phase === "halfway") {
    return (
      <AuthShell>
        <StateHeading icon={MailCheck} tone="success" title={t("security.verify.changeHalfTitle")} headingRef={headingRef}>
          <p>{t("security.verify.changeHalfBody")}</p>
        </StateHeading>
        {actions(t("security.verify.backToSecurity"))}
      </AuthShell>
    );
  }

  const expired = phase === "expired";
  return (
    <AuthShell>
      <StateHeading
        icon={expired ? Clock : Link2Off}
        tone="warning"
        title={t(expired ? "security.verify.expiredTitle" : "security.verify.invalidTitle")}
        headingRef={headingRef}
      >
        <p>{t("security.verify.changeRetryBody")}</p>
      </StateHeading>
      {actions(t("security.verify.backToSecurity"))}
    </AuthShell>
  );
}
