import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert, type LucideIcon } from "lucide-react";
import { AdminButton } from "./AdminButton";
import { useFocusTrap } from "../../lib/useFocusTrap";

/**
 * Confirmation in front of anything an administrator cannot casually undo.
 *
 * Two safeguards beyond the usual dialog: the confirming button is never the
 * one focus lands on, and a `destructive` dialog demands the product's name be
 * typed before it unlocks. Archiving is reversible and asks only for a click;
 * deleting is not, and asks for deliberate effort.
 */
interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  /** Plain consequences, in the administrator's words. */
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: "default" | "danger";
  icon?: LucideIcon;
  loading?: boolean;
  /** Requires this exact text to be typed before confirming becomes possible. */
  confirmPhrase?: string;
  confirmPhraseLabel?: string;
}

export function ConfirmationDialog({ open, ...rest }: ConfirmationDialogProps) {
  // Mounting the dialog only while it is open is what resets the typed
  // confirmation: a reopened dialog must never inherit the last one's.
  if (!open) return null;
  return <Dialog {...rest} />;
}

function Dialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  tone = "default",
  icon: Icon = TriangleAlert,
  loading = false,
  confirmPhrase,
  confirmPhraseLabel,
}: Omit<ConfirmationDialogProps, "open">) {
  const { t } = useTranslation();
  const ref = useFocusTrap<HTMLDivElement>(true, onCancel);
  const [typed, setTyped] = useState("");

  const locked = confirmPhrase ? typed.trim().toLowerCase() !== confirmPhrase.trim().toLowerCase() : false;

  return (
    <div className="fixed inset-0 z-[400] grid place-items-center p-4">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onCancel}
        className="gt-admin-scrim absolute inset-0 cursor-default bg-[rgba(17,17,17,.42)]"
      />

      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="gt-confirm-title"
        aria-describedby="gt-confirm-body"
        tabIndex={-1}
        className="gt-admin-dialog relative w-full max-w-[460px] rounded-[var(--admin-radius)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] p-6 shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden="true"
            className={
              tone === "danger"
                ? "grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--status-error-bg)] text-[var(--status-error-fg)]"
                : "grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
            }
          >
            <Icon size={19} strokeWidth={2} />
          </span>
          <div className="grid gap-2">
            <h2 id="gt-confirm-title" className="text-[length:var(--text-h4)]">
              {title}
            </h2>
            <div id="gt-confirm-body" className="text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-body)]">
              {body}
            </div>
          </div>
        </div>

        {confirmPhrase && (
          <label className="mt-5 grid gap-1.5">
            <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
              {confirmPhraseLabel ?? t("admin.dialog.typeToConfirm", { phrase: confirmPhrase })}
            </span>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="gt-admin-field"
            />
          </label>
        )}

        <div className="mt-6 flex justify-end gap-2">
          {/* Cancel precedes the confirming button in the DOM, so focus opens on
              the safe option — or, when one is required, on the confirmation
              field above. Either way it never opens on the destructive button,
              which is what a hurried Enter would otherwise hit. */}
          <AdminButton variant="outline" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </AdminButton>
          <AdminButton
            variant={tone === "danger" ? "danger" : "dark"}
            onClick={onConfirm}
            loading={loading}
            disabled={locked}
          >
            {confirmLabel}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
