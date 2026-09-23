import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EyeOff, Flag, MessageSquareWarning, ShieldCheck, Trash2, XCircle, type LucideIcon } from "lucide-react";
import { FormDialog } from "../../promotions/PromoUi";
import { AdminSelect } from "../../admin/AdminSelect";
import { REJECT_REASONS, REPORT_REASONS, type RejectReason, type ReportReason } from "../../../data/reviewSystem";
import { useReviews } from "../../../lib/reviews";
import { useAdminAuth } from "../../../lib/adminAuth";
import { useToast } from "../../../lib/toast";

/**
 * Every moderation decision that deserves a second look goes through one of
 * these dialogs — rejecting, asking for changes, hiding, flagging, and the
 * three outcomes of a report. Approving and restoring are single clicks: they
 * publish a customer's words, and are just as easy to undo.
 *
 * The dialogs say what the customer will see, and what stays internal, before
 * anything is confirmed. Nothing here deletes a review: "remove" rejects it
 * and keeps it on record with its reports and history.
 */

export type DialogAction = "reject" | "changes" | "hide" | "flag" | "keep" | "hideReported" | "remove" | "removeResponse";

export interface PendingAction {
  kind: DialogAction;
  id: string;
}

const META: Record<DialogAction, { icon: LucideIcon; tone: "default" | "danger" | "primary"; note: "required" | "optional" | "none" }> = {
  reject: { icon: XCircle, tone: "danger", note: "optional" },
  changes: { icon: MessageSquareWarning, tone: "primary", note: "required" },
  hide: { icon: EyeOff, tone: "default", note: "optional" },
  flag: { icon: Flag, tone: "default", note: "optional" },
  keep: { icon: ShieldCheck, tone: "primary", note: "optional" },
  hideReported: { icon: EyeOff, tone: "default", note: "optional" },
  remove: { icon: Trash2, tone: "danger", note: "optional" },
  removeResponse: { icon: Trash2, tone: "danger", note: "none" },
};

export function useModerator(): string {
  const { admin } = useAdminAuth();
  return admin?.name ?? "Administrateur";
}

export function ModerationDialogs({ action, onClose }: { action: PendingAction | null; onClose: () => void }) {
  if (!action) return null;
  return <ActionDialog key={`${action.kind}:${action.id}`} action={action} onClose={onClose} />;
}

function ActionDialog({ action, onClose }: { action: PendingAction; onClose: () => void }) {
  const { t } = useTranslation();
  const actor = useModerator();
  const { showToast } = useToast();
  const store = useReviews();
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState<RejectReason>("guidelines");
  const [flagReason, setFlagReason] = useState<ReportReason>("fake");
  const [tried, setTried] = useState(false);
  const meta = META[action.kind];
  const k = `reviews.admin.dialogs.${action.kind}`;
  const missing = meta.note === "required" && !note.trim();

  const confirm = () => {
    setTried(true);
    if (missing) return;
    const { id } = action;
    switch (action.kind) {
      case "reject":
        store.reject(id, actor, rejectReason, note);
        break;
      case "changes":
        store.requestChanges(id, actor, note);
        break;
      case "hide":
        store.hide(id, actor, note);
        break;
      case "flag":
        store.flag(id, actor, flagReason, note);
        break;
      case "keep":
        store.resolveReports(id, actor, "kept", note);
        break;
      case "hideReported":
        store.resolveReports(id, actor, "hidden", note);
        break;
      case "remove":
        store.resolveReports(id, actor, "removed", note);
        break;
      case "removeResponse":
        store.removeResponse(id, actor);
        break;
    }
    showToast(t(`${k}.toast`), t(`${k}.toastBody`), action.kind === "reject" || action.kind === "remove" ? "info" : "success");
    onClose();
  };

  return (
    <FormDialog
      open
      title={t(`${k}.title`)}
      description={t(`${k}.body`)}
      icon={meta.icon}
      tone={meta.tone}
      confirmLabel={t(`${k}.confirm`)}
      cancelLabel={t("reviews.admin.cancel")}
      onConfirm={confirm}
      onClose={onClose}
    >
      {action.kind === "reject" && (
        <label className="grid gap-1.5">
          <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{t("reviews.admin.dialogs.rejectReason")}</span>
          <AdminSelect
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value as RejectReason)}
            options={REJECT_REASONS.map((r) => ({ value: r, label: t(`reviews.rejectReasons.${r}`) }))}
          />
          <span className="text-[11px] text-[var(--text-muted)]">
            {t("reviews.admin.dialogs.customerSees", { text: t(`reviews.rejectReasons.customer.${rejectReason}`) })}
          </span>
        </label>
      )}
      {action.kind === "flag" && (
        <label className="grid gap-1.5">
          <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{t("reviews.admin.dialogs.flagReason")}</span>
          <AdminSelect
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value as ReportReason)}
            options={REPORT_REASONS.map((r) => ({ value: r, label: t(`reviews.reportReasons.${r}`) }))}
          />
        </label>
      )}
      {meta.note !== "none" && (
        <label className="grid gap-1.5">
          <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
            {t(`${k}.noteLabel`)}
            {meta.note === "optional" && <span className="font-normal text-[var(--text-subtle)]"> · {t("reviews.form.optional")}</span>}
          </span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={tried && missing ? true : undefined}
            className="gt-admin-field min-h-[84px]"
            placeholder={t(`${k}.notePlaceholder`)}
          />
          {tried && missing && (
            <span role="alert" className="text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">
              {t("reviews.admin.dialogs.noteRequired")}
            </span>
          )}
        </label>
      )}
    </FormDialog>
  );
}
