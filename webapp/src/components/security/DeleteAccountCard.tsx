import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "../../lib/navigation";
import { CircleCheck, Home, LogIn, Trash2, TriangleAlert, UserX } from "lucide-react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { PasswordField, TextField } from "../register/Field";
import { SecurityCard } from "./SecurityCard";
import { Notice } from "./Notice";
import { useAuth } from "../../lib/auth";
import { deleteAccount, deletionPhraseMatches, type ServiceOutcome } from "../../lib/accountSecurity";
import { verifyCurrentPassword } from "../../lib/accountCredentials";
import { accountHasPassword, deleteOwnAccount, fetchErasureBlockers } from "../../lib/accountPrivacy";
import type { ErasureBlocker } from "../../lib/accountPrivacyMapping";
import { useAccountSecurity } from "../../lib/securityState";

type Phase =
  | { kind: "checking" }
  | { kind: "blocked"; blockers: ErasureBlocker[] }
  | { kind: "confirm" }
  | { kind: "deleting" }
  | { kind: "reauthenticate" }
  | { kind: "failed" }
  | { kind: "deleted" };

const CONSEQUENCES = ["access", "courses", "studio", "community", "loyalty", "newsletter"] as const;

/** Where a blocker is lifted, when the member can do it themselves. */
const BLOCKER_LINKS: Partial<Record<ErasureBlocker, string>> = {
  studio_subscription: "/compte/studio",
  studio_withdrawal: "/compte/studio",
};

/** Where Google sends the member back after signing in again. */
const RETURN_PATH = "/compte/securite#security-delete";

/**
 * Deleting the account: present, honest, and deliberately quiet (GDPR art. 17,
 * decision 125).
 *
 * The section sits last on the page, on a muted surface, behind an outline
 * button. The dialog first asks the database what would stop the erasure now
 * (a running Studio subscription, a withdrawal or a payment under way, a staff
 * account) and says how to lift it. Otherwise it lists the consequences and
 * what the law makes us keep, then asks for the password (or a fresh Google
 * sign-in) and a typed confirmation word: the function `delete-account`
 * refuses a sign-in older than 10 minutes.
 *
 * After the deletion the dialog becomes the confirmation; its only way out
 * signs the member out and returns them to the home page.
 */
export function DeleteAccountCard({ outcome }: { outcome: ServiceOutcome }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { realAuth, email, signOut, signInWithGoogle } = useAuth();
  const { resetAll } = useAccountSecurity();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "confirm" });
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [withPassword, setWithPassword] = useState(true);
  const passwordRef = useRef<HTMLInputElement>(null);

  const phrase = t("security.delete.phrase");
  const matches = deletionPhraseMatches(typed, phrase);
  const busy = phase.kind === "deleting" || phase.kind === "checking";
  const deleted = phase.kind === "deleted";

  const openDialog = async () => {
    setTyped("");
    setPassword("");
    setPasswordError(null);
    setOpen(true);
    if (!realAuth) return setPhase({ kind: "confirm" });
    setPhase({ kind: "checking" });
    const [blockers, hasPassword] = await Promise.all([fetchErasureBlockers(), accountHasPassword()]);
    setWithPassword(hasPassword);
    if (blockers === null) return setPhase({ kind: "failed" });
    setPhase(blockers.length > 0 ? { kind: "blocked", blockers } : { kind: "confirm" });
  };

  // Google sends the member back here after a fresh sign-in: reopen the dialog.
  useEffect(() => {
    if (realAuth && window.location.hash === "#security-delete") void openDialog();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signing out while still on a member route would make the route guard send
  // the visitor to the login page instead of home. So `leave` only navigates,
  // and the session ends as this card unmounts — once the home page is showing.
  const leaving = useRef(false);
  useEffect(
    () => () => {
      if (!leaving.current) return;
      signOut();
      resetAll();
    },
    [signOut, resetAll],
  );

  const leave = () => {
    leaving.current = true;
    navigate("/", { replace: true });
  };

  const close = () => {
    if (busy) return;
    if (deleted) return leave();
    setOpen(false);
  };

  const submitLive = async () => {
    if (withPassword) {
      if (!password) {
        setPasswordError(t("security.errors.currentPasswordRequired"));
        passwordRef.current?.focus();
        return;
      }
      setPhase({ kind: "deleting" });
      const verified = await verifyCurrentPassword(password);
      if (!verified.ok) {
        if (verified.result === "wrongPassword") {
          setPhase({ kind: "confirm" });
          setPasswordError(t("security.errors.wrongPassword"));
          requestAnimationFrame(() => passwordRef.current?.focus());
          return;
        }
        return setPhase({ kind: "failed" });
      }
    } else {
      setPhase({ kind: "deleting" });
    }
    const answer = await deleteOwnAccount();
    if (answer.kind === "deleted") return setPhase({ kind: "deleted" });
    if (answer.kind === "blocked") return setPhase({ kind: "blocked", blockers: answer.blockers });
    if (answer.kind === "reauthenticate") return setPhase({ kind: "reauthenticate" });
    setPhase({ kind: "failed" });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!matches || busy) return;
    if (realAuth) {
      await submitLive();
    } else {
      setPhase({ kind: "deleting" });
      try {
        await deleteAccount(outcome);
        setPhase({ kind: "deleted" });
      } catch {
        setPhase({ kind: "failed" });
      }
    }
  };

  useEffect(() => {
    if (deleted) requestAnimationFrame(() => document.getElementById(DONE_ID)?.focus());
  }, [deleted]);

  const showForm = phase.kind === "confirm" || phase.kind === "deleting" || phase.kind === "failed" || phase.kind === "reauthenticate";

  return (
    <SecurityCard
      id="security-delete"
      icon={UserX}
      quiet
      title={t("security.delete.title")}
      description={<p>{t("security.delete.body")}</p>}
    >
      <ul className="m-0 grid list-disc gap-1.5 pl-5 text-[length:var(--text-body-sm)] text-[var(--text-body)] marker:text-[var(--text-subtle)]">
        <li>{t("security.delete.point1")}</li>
        <li>{t("security.delete.point2")}</li>
        <li>{t("security.delete.point3")}</li>
      </ul>
      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("security.delete.exportHint")}</p>
      <div>
        <Button variant="dangerOutline" size="sm" iconLeft={Trash2} onClick={() => void openDialog()}>
          {t("security.delete.open")}
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={close}
        tone={deleted ? "neutral" : "danger"}
        icon={deleted ? <CircleCheck size={16} /> : <TriangleAlert size={16} />}
        title={t(deleted ? "security.delete.doneTitle" : phase.kind === "blocked" ? "security.delete.blockedTitle" : "security.delete.dialogTitle")}
        description={deleted || phase.kind === "blocked" ? undefined : t("security.delete.dialogBody")}
        closeLabel={t("common.close")}
      >
        {deleted && (
          <div role="status" className="grid gap-4">
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("security.delete.doneBody")}</p>
            <Button id={DONE_ID} variant="dark" iconLeft={Home} fullWidth onClick={leave}>
              {t("security.delete.doneCta")}
            </Button>
          </div>
        )}

        {phase.kind === "checking" && (
          <p role="status" className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("security.delete.checking")}
          </p>
        )}

        {phase.kind === "blocked" && (
          <div className="grid gap-4">
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("security.delete.blockedBody")}</p>
            <ul className="m-0 grid list-none gap-3 p-0">
              {phase.blockers.map((blocker) => (
                <li key={blocker} className="grid gap-1 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-3.5 py-3">
                  <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t(`security.delete.blockers.${blocker}.title`)}</strong>
                  <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`security.delete.blockers.${blocker}.body`)}</span>
                  {BLOCKER_LINKS[blocker] && (
                    <Link
                      to={BLOCKER_LINKS[blocker]!}
                      className="justify-self-start text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4"
                    >
                      {t(`security.delete.blockers.${blocker}.link`)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={close}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        )}

        {showForm && (
          <form noValidate onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <h3 className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{t("security.delete.consequencesTitle")}</h3>
              <ul className="m-0 grid list-disc gap-1.5 pl-5 text-[length:var(--text-body-sm)] text-[var(--text-body)] marker:text-[var(--status-error-fg)]">
                {CONSEQUENCES.map((c) => (
                  <li key={c}>{t(`security.delete.consequences.${c}`)}</li>
                ))}
              </ul>
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("security.delete.retention")}</p>
            </div>

            {phase.kind === "failed" && (
              <Notice tone="error" live="alert" title={t("security.errors.serverTitle")}>
                {t("security.delete.failedBody")}
              </Notice>
            )}

            {phase.kind === "reauthenticate" && (
              <Notice tone="warning" live="alert" title={t("security.delete.reauthTitle")}>
                <p>{t(withPassword ? "security.delete.reauthPasswordBody" : "security.delete.reauthGoogleBody")}</p>
              </Notice>
            )}

            {realAuth && withPassword && (
              <>
                {/* Lets password managers attach the password to the right account. */}
                <input type="text" name="username" autoComplete="username" hidden readOnly value={email ?? ""} />
                <PasswordField
                  ref={passwordRef}
                  id="security-delete-password"
                  label={t("security.delete.passwordLabel")}
                  autoComplete="current-password"
                  value={password}
                  disabled={busy}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(null);
                  }}
                  error={passwordError ?? undefined}
                />
              </>
            )}

            {realAuth && !withPassword && (
              <div className="grid gap-2">
                <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("security.delete.googleHint")}</p>
                <div>
                  <Button variant="ghost" size="sm" iconLeft={LogIn} disabled={busy} onClick={() => void signInWithGoogle(RETURN_PATH)}>
                    {t("security.delete.googleAgain")}
                  </Button>
                </div>
              </div>
            )}

            <TextField
              id="security-delete-phrase"
              label={t("security.delete.phraseLabel", { phrase })}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={typed}
              disabled={busy}
              onChange={(e) => setTyped(e.target.value)}
              hint={t("security.delete.phraseHint")}
              success={matches}
              successMessage={t("security.delete.phraseOk")}
            />

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={close} disabled={busy}>
                {t("security.delete.keep")}
              </Button>
              <Button type="submit" variant="danger" iconLeft={Trash2} loading={phase.kind === "deleting"} disabled={!matches}>
                {phase.kind === "deleting" ? t("security.delete.deleting") : t("security.delete.confirm")}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </SecurityCard>
  );
}

const DONE_ID = "security-delete-done";
