import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CircleCheck, Home, Trash2, TriangleAlert, UserX } from "lucide-react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { TextField } from "../register/Field";
import { SecurityCard } from "./SecurityCard";
import { Notice } from "./Notice";
import { useAuth } from "../../lib/auth";
import { deleteAccount, deletionPhraseMatches, type ServiceOutcome } from "../../lib/accountSecurity";
import { useAccountSecurity } from "../../lib/securityState";

type Phase = "confirm" | "deleting" | "failed" | "deleted";

const CONSEQUENCES = ["access", "courses", "community", "loyalty"] as const;

/**
 * Deleting the account: present, honest, and deliberately quiet.
 *
 * The section sits last on the page, on a muted surface, and its button is an
 * outline — findable by anyone who looks for it, never the thing the eye lands
 * on. The real decision happens in a dialog that lists the consequences and
 * asks for a typed confirmation word; the final button stays disabled until
 * the word matches, and it is the only solid red control in the product.
 *
 * After the (simulated) deletion the dialog becomes the confirmation, and its
 * only way out signs the member out and returns them to the home page.
 */
export function DeleteAccountCard({ outcome }: { outcome: ServiceOutcome }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { resetAll } = useAccountSecurity();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("confirm");
  const [typed, setTyped] = useState("");

  const phrase = t("security.delete.phrase");
  const matches = deletionPhraseMatches(typed, phrase);
  const busy = phase === "deleting";

  const openDialog = () => {
    setPhase("confirm");
    setTyped("");
    setOpen(true);
  };

  // Signing out while still on a member route would make the route guard send
  // the visitor to the login page instead of home. So `leave` only navigates,
  // and the session ends as this card unmounts — once the home page is showing.
  const leaving = useRef(false);
  // `signOut` and `resetAll` are stable, so this cleanup only runs on unmount.
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
    if (phase === "deleted") return leave();
    setOpen(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!matches || busy) return;
    setPhase("deleting");
    try {
      await deleteAccount(outcome);
      setPhase("deleted");
      requestAnimationFrame(() => document.getElementById(DONE_ID)?.focus());
    } catch {
      setPhase("failed");
    }
  };

  const deleted = phase === "deleted";

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
        <Button variant="dangerOutline" size="sm" iconLeft={Trash2} onClick={openDialog}>
          {t("security.delete.open")}
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={close}
        tone={deleted ? "neutral" : "danger"}
        icon={deleted ? <CircleCheck size={16} /> : <TriangleAlert size={16} />}
        title={t(deleted ? "security.delete.doneTitle" : "security.delete.dialogTitle")}
        description={deleted ? undefined : t("security.delete.dialogBody")}
        closeLabel={t("common.close")}
      >
        {deleted ? (
          <div role="status" className="grid gap-4">
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("security.delete.doneBody")}</p>
            <Button id={DONE_ID} variant="dark" iconLeft={Home} fullWidth onClick={leave}>
              {t("security.delete.doneCta")}
            </Button>
          </div>
        ) : (
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

            {phase === "failed" && (
              <Notice tone="error" live="alert" title={t("security.errors.serverTitle")}>
                {t("security.delete.failedBody")}
              </Notice>
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
              <Button type="submit" variant="danger" iconLeft={Trash2} loading={busy} disabled={!matches}>
                {busy ? t("security.delete.deleting") : t("security.delete.confirm")}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </SecurityCard>
  );
}

const DONE_ID = "security-delete-done";
