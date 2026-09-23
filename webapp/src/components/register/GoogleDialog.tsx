import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, CircleAlert, FlaskConical, LoaderCircle } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { TAKEN_EMAILS } from "../../lib/registration";

/** The multicolour "G". Drawn inline so the prototype carries no remote asset. */
export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export interface GoogleIdentity {
  email: string;
  firstName: string;
  lastName: string;
}

/** Mock Google accounts. The second one is already registered here, to show that path. */
const ACCOUNTS: (GoogleIdentity & { initials: string; tint: string })[] = [
  { email: "camille.laurent@gmail.com", firstName: "Camille", lastName: "Laurent", initials: "CL", tint: "var(--gt-blue-300)" },
  { email: "lea.martin@gmail.com", firstName: "Léa", lastName: "Martin", initials: "LM", tint: "var(--gt-fuchsia-300)" },
];

type Phase = { name: "choose" } | { name: "connecting"; email: string } | { name: "taken"; email: string };

/**
 * Simulated "Continue with Google".
 *
 * A recognisable account chooser inside the site's own dialog, labelled as a
 * prototype, so a reviewer can walk the path without anyone being sent to
 * Google. Picking an account shows a short connecting state, then hands the
 * identity back; picking the one already registered shows the "account exists"
 * outcome instead. Mounted only while open, so each opening starts at the chooser.
 */
export function GoogleDialog({
  onClose,
  onComplete,
  onSignIn,
}: {
  onClose: () => void;
  onComplete: (identity: GoogleIdentity) => void;
  onSignIn: () => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>({ name: "choose" });

  useEffect(() => {
    if (phase.name !== "connecting") return;
    const account = ACCOUNTS.find((a) => a.email === phase.email)!;
    const timer = setTimeout(() => {
      if (TAKEN_EMAILS.includes(account.email)) {
        setPhase({ name: "taken", email: account.email });
      } else {
        onComplete({ email: account.email, firstName: account.firstName, lastName: account.lastName });
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [phase, onComplete]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("register.google.title")}
      description={t("register.google.description")}
      icon={<GoogleMark />}
      closeLabel={t("common.close")}
    >
      {phase.name === "choose" && (
        <div className="grid gap-3">
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("register.google.choose")}</p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => setPhase({ name: "connecting", email: account.email })}
                  className="flex min-h-[60px] w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white px-3.5 py-2.5 text-left transition-colors hover:border-[var(--gt-ink-400)] hover:bg-[var(--gt-off-white)]"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-9 w-9 flex-none place-items-center rounded-full text-[12px] font-bold text-[var(--gt-ink-900)]"
                    style={{ background: account.tint }}
                  >
                    {account.initials}
                  </span>
                  <span className="grid min-w-0 flex-1">
                    <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                      {account.firstName} {account.lastName}
                    </span>
                    <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">{account.email}</span>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" className="text-[var(--text-muted)]" />
                </button>
              </li>
            ))}
          </ul>
          <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] bg-[var(--surface-sunken)] p-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <FlaskConical size={14} aria-hidden="true" className="mt-[1px] flex-none" />
            {t("register.google.mockNote")}
          </p>
        </div>
      )}

      {phase.name === "connecting" && (
        <div role="status" className="grid justify-items-center gap-3 py-6 text-center">
          <LoaderCircle size={28} aria-hidden="true" className="animate-spin text-[var(--gt-blue-600)]" />
          <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{t("register.google.connecting")}</p>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{phase.email}</p>
        </div>
      )}

      {phase.name === "taken" && (
        <div role="alert" className="grid gap-4">
          <p className="m-0 flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] p-3.5 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
            <CircleAlert size={17} aria-hidden="true" className="mt-[1px] flex-none" />
            <span>
              <strong className="block">{t("register.google.takenTitle")}</strong>
              {t("register.google.takenBody", { email: phase.email })}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="dark" onClick={onSignIn}>
              {t("register.signInInstead")}
            </Button>
            <Button variant="ghost" onClick={() => setPhase({ name: "choose" })}>
              {t("register.google.otherAccount")}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
