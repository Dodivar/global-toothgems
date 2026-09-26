import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Ban, ShieldAlert, Trash2, UserCog } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { AdminButton } from "./AdminButton";
import { AdminPortal } from "./AdminSheet";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { RolePicker } from "./UserForm";
import { RoleChangeSummary } from "./RolePermissions";
import { RoleBadge, UserAvatar, UserStatusBadge } from "./UserBadges";
import { roleRank, userName, type AdminUser, type UserRole } from "../../data/adminUsers";

/**
 * The confirmations of the Users workspace.
 *
 * All three are portalled, so they sit above the profile drawer when they are
 * opened from it, and they follow the rule the customer dialogs set: say what
 * will happen to whom, in plain words, before anything happens.
 *
 * Their confirming buttons are never where focus lands. The role change opens
 * on the role picker, the suspension and deletion on Cancel — a hurried Enter
 * must never be the thing that removes someone's access.
 */

/**
 * A dismiss handler that keeps one identity for the dialog's whole life and
 * ignores dismissal while a request is in flight.
 *
 * The admin's focus traps re-run when their close callback changes, and a
 * re-run hands focus back to the trigger and then to the first control again.
 * An inline `loading ? noop : onClose` would change identity the moment the
 * request starts — exactly when focus must stay put.
 */
function useStableDismiss(onClose: () => void, loading: boolean) {
  const state = useRef({ onClose, loading });
  useEffect(() => {
    state.current = { onClose, loading };
  }, [onClose, loading]);
  return useCallback(() => {
    if (!state.current.loading) state.current.onClose();
  }, []);
}

/* -------------------------------------------------------------------------- */
/* Role change                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Changing one user's role.
 *
 * An intentional, two-part interaction: pick the new role, then read what it
 * changes before confirming. The consequences are written out as a sentence
 * *and* as the permission difference — the sentence answers "is this what I
 * meant", the list answers "what exactly will they be able to do".
 *
 * Opened from the edit form with the new role already chosen, it skips the
 * picker and goes straight to the consequences: the choice was already made in
 * the form, and asking for it twice would make the confirmation feel like a
 * formality.
 */
export function RoleChangeDialog(props: {
  user: AdminUser | null;
  /** When set, the picker is skipped and this role is the one being confirmed. */
  presetRole?: UserRole;
  loading: boolean;
  onClose: () => void;
  onConfirm: (role: UserRole) => void;
}) {
  if (!props.user) return null;
  // Keyed on the target, so reopening on another user — or with another preset
  // role — starts from that user's own role rather than the last choice made.
  return <RoleChangeBody key={`${props.user.id}-${props.presetRole ?? ""}`} {...props} user={props.user} />;
}

function RoleChangeBody({
  user,
  presetRole,
  loading,
  onClose,
  onConfirm,
}: {
  user: AdminUser;
  presetRole?: UserRole;
  loading: boolean;
  onClose: () => void;
  onConfirm: (role: UserRole) => void;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<UserRole>(presetRole ?? user.role);
  const name = useId();
  const dismiss = useStableDismiss(onClose, loading);

  const changed = choice !== user.role;
  const direction = roleRank(choice) > roleRank(user.role) ? "up" : "down";
  const from = t(`admin.users.role.${user.role}`);
  const to = t(`admin.users.role.${choice}`);

  return (
    <AdminPortal>
      <Dialog
        open
        onClose={dismiss}
        icon={<UserCog size={18} />}
        title={t("admin.users.roleDialogTitle")}
        description={
          changed
            ? t("admin.users.roleDialogBody", { name: userName(user), from, to })
            : t("admin.users.roleDialogChoose", { name: userName(user) })
        }
        closeLabel={t("common.close")}
        footer={
          <>
            <AdminButton variant="ghost" onClick={onClose} disabled={loading}>
              {t("common.cancel")}
            </AdminButton>
            <span className="ml-auto">
              <AdminButton variant="dark" loading={loading} disabled={!changed} onClick={() => onConfirm(choice)}>
                {t("admin.users.roleDialogConfirm")}
              </AdminButton>
            </span>
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-[var(--admin-radius)] border border-[var(--border-subtle)] p-3">
          <UserAvatar user={user} size={36} />
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
              {userName(user)}
            </span>
            <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">{user.email}</span>
          </span>
          {/* From → to, as badges: the change reads without the sentence. */}
          <span className="flex flex-none items-center gap-1.5">
            <RoleBadge role={user.role} />
            {changed && (
              <>
                <ArrowRight size={13} aria-hidden="true" className="text-[var(--text-muted)]" />
                <RoleBadge role={choice} />
              </>
            )}
          </span>
        </div>

        {!presetRole && (
          <RolePicker name={name} legend={t("admin.users.roleDialogLegend")} value={choice} onChange={setChoice} />
        )}

        {changed && (
          <div className="grid gap-3" aria-live="polite">
            <p className="m-0 text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-body)]">
              {t(`admin.users.roleConsequence.${choice}_${direction}`)}
            </p>
            <RoleChangeSummary from={user.role} to={choice} />
          </div>
        )}
      </Dialog>
    </AdminPortal>
  );
}

/* -------------------------------------------------------------------------- */
/* Suspend                                                                    */
/* -------------------------------------------------------------------------- */

export function SuspendUserDialog({
  user,
  loading,
  onClose,
  onConfirm,
}: {
  user: AdminUser | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const dismiss = useStableDismiss(onClose, loading);
  if (!user) return null;
  return (
    <AdminPortal>
      <ConfirmationDialog
        open
        icon={Ban}
        title={t("admin.users.suspendTitle", { name: userName(user) })}
        body={
          <div className="grid gap-2">
            <p className="m-0">{t("admin.users.suspendBody")}</p>
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.users.suspendNote")}</p>
          </div>
        }
        confirmLabel={t("admin.users.suspendConfirm")}
        cancelLabel={t("common.cancel")}
        loading={loading}
        onConfirm={onConfirm}
        onCancel={dismiss}
      />
    </AdminPortal>
  );
}

/* -------------------------------------------------------------------------- */
/* Delete                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Deleting a user.
 *
 * Destructive, so it says so in red — once, on the icon and the button — and
 * nowhere else: a dialog painted red from edge to edge reads as an error
 * rather than a decision. Suspending is offered as the alternative in the body,
 * because it is what most "remove this person" requests actually want.
 */
export function DeleteUserDialog({
  user,
  loading,
  onClose,
  onConfirm,
}: {
  user: AdminUser | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const dismiss = useStableDismiss(onClose, loading);
  if (!user) return null;
  return (
    <AdminPortal>
      <ConfirmationDialog
        open
        tone="danger"
        icon={Trash2}
        title={t("admin.users.deleteTitle")}
        body={
          <div className="grid gap-3">
            <p className="m-0">{t("admin.users.deleteBody", { name: userName(user) })}</p>
            <div className="flex items-center gap-3 rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] p-2.5">
              <UserAvatar user={user} size={32} />
              <span className="grid min-w-0 flex-1">
                <span className="truncate font-semibold text-[var(--text-primary)]">{userName(user)}</span>
                <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">{user.email}</span>
              </span>
              <span className="hidden flex-none flex-col items-end gap-1 sm:flex">
                <RoleBadge role={user.role} />
                <UserStatusBadge status={user.status} />
              </span>
            </div>
            {user.status !== "suspended" && (
              <p className="m-0 flex items-start gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                <ShieldAlert size={14} aria-hidden="true" className="mt-px flex-none" />
                {t("admin.users.deleteAlternative")}
              </p>
            )}
          </div>
        }
        confirmLabel={t("admin.users.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        loading={loading}
        onConfirm={onConfirm}
        onCancel={dismiss}
      />
    </AdminPortal>
  );
}
