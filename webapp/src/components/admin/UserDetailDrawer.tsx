import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Ban,
  CircleCheck,
  Clock3,
  Eye,
  KeyRound,
  LogIn,
  Mail,
  PackageCheck,
  Pencil,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCog,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "./AdminButton";
import { AdminSheet, SheetBody, SheetFooter } from "./AdminSheet";
import { PermissionSummary } from "./RolePermissions";
import { UserForm } from "./UserForm";
import { LastActivity, RoleBadge, UserAvatar, UserStatusBadge, YouTag } from "./UserBadges";
import { formatDate, formatDateTime, formatRelative, useAdminLocale } from "./userMeta";
import { useLocalized } from "../../lib/localized";
import { CURRENT_USER_ID, userName, type AdminUser, type UserActivityKind } from "../../data/adminUsers";
import type { UserDraft } from "../../lib/adminUsers";
import type { GuardReason } from "../../lib/adminUserFilters";

/**
 * A user's profile, in a drawer over the list.
 *
 * A drawer rather than a route, unlike customers and orders. A staff account is
 * a short record — who, what role, what they did lately — and the job done on
 * it is almost always a side trip from the list: check a role, suspend someone,
 * fix a typo in an address. The list staying in place behind it is worth more
 * here than a full page. It still has an address: the open user is in the query
 * string (`?utilisateur=…`), so the view can be pasted to a colleague and the
 * back button closes it.
 *
 * The drawer has two modes, reading and editing, and editing reuses the exact
 * form the "Add user" panel uses. The role and status are also editable from
 * the reading mode, through their own confirmations, because those are the two
 * changes that alter what a person can do — they deserve a deliberate step
 * rather than being one field among six.
 *
 * Actions that would lock the team out — demoting or removing yourself, or the
 * last active administrator — are disabled with the reason written beside
 * them, never hidden.
 */

const ACTIVITY_ICON: Record<UserActivityKind, LucideIcon> = {
  signedIn: LogIn,
  viewedDashboard: Eye,
  viewedStatistics: Eye,
  viewedOrders: Eye,
  viewedCustomers: Eye,
  updatedOrder: PackageCheck,
  updatedStock: PackageCheck,
  updatedProduct: Pencil,
  publishedLesson: Send,
  updatedCourse: Pencil,
  repliedCustomer: Mail,
  exportedOrders: PackageCheck,
  changedSettings: Settings2,
  invitedUser: UserPlus,
  uploadedMedia: Pencil,
  accountCreated: UserPlus,
  invitationSent: Send,
  invitationResent: RotateCcw,
  profileUpdated: Pencil,
  roleChanged: UserCog,
  activated: CircleCheck,
  suspended: Ban,
  reactivated: CircleCheck,
};

/** Entries written by an administrator's action, rather than the user's own work. */
const ADMINISTRATIVE: UserActivityKind[] = [
  "accountCreated",
  "invitationSent",
  "invitationResent",
  "profileUpdated",
  "roleChanged",
  "activated",
  "suspended",
  "reactivated",
];

export function UserDetailDrawer({
  user,
  mode,
  guard,
  editSubmitting,
  editError,
  onClearEditError,
  onClose,
  onEdit,
  onCancelEdit,
  onSave,
  onChangeRole,
  onSuspend,
  onReactivate,
  onResendInvitation,
  resending,
  onDelete,
}: {
  user: AdminUser | null;
  mode: "view" | "edit";
  guard: GuardReason;
  editSubmitting: boolean;
  editError?: string;
  onClearEditError: () => void;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (draft: UserDraft) => void;
  onChangeRole: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onResendInvitation: () => void;
  resending: boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const locale = useAdminLocale();
  const localized = useLocalized();

  // Leaving the form unmounts the control that had focus. Hand it to the
  // button that opened the form, so a keyboard user lands where they started.
  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current === "edit" && mode === "view") {
      document.querySelector<HTMLElement>("[data-user-edit-trigger]")?.focus();
    }
    previousMode.current = mode;
  }, [mode]);

  if (!user) return null;

  const isSelf = user.id === CURRENT_USER_ID;
  const guardText = guard ? t(`admin.users.guard.${guard}`) : undefined;
  const editing = mode === "edit";

  const identity = (
    <div className="flex items-start gap-3.5">
      <UserAvatar user={user} size={56} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="m-0 truncate text-[length:var(--text-body-lg)] font-[var(--weight-bold)] text-[var(--text-primary)]">
            {userName(user)}
          </p>
          {isSelf && <YouTag />}
        </div>
        <a
          href={`mailto:${user.email}`}
          className="w-fit max-w-full truncate text-[length:var(--text-caption)] text-[var(--text-body)] underline decoration-1 underline-offset-2 transition-colors hover:text-[var(--accent-highlight-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {user.email}
        </a>
        <p className="m-0 truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {localized(user.jobTitle) || "—"} · {t(`admin.users.team.${user.team}`)}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <RoleBadge role={user.role} />
          <UserStatusBadge status={user.status} />
        </div>
      </div>
    </div>
  );

  return (
    <AdminSheet
      open
      onClose={editing ? onCancelEdit : onClose}
      title={editing ? t("admin.users.editTitle") : t("admin.users.profileTitle")}
      description={editing ? t("admin.users.editDescription", { name: userName(user) }) : undefined}
      closeLabel={editing ? t("admin.users.cancelEdit") : t("admin.users.closeProfile")}
      headerExtra={editing ? undefined : identity}
    >
      {editing ? (
        <UserForm
          // Re-keyed per user so a draft never carries over to another profile.
          key={user.id}
          mode="edit"
          user={user}
          guard={guard}
          initial={{
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            status: user.status,
            jobTitle: localized(user.jobTitle),
            team: user.team,
          }}
          submitting={editSubmitting}
          serverError={editError}
          onClearServerError={onClearEditError}
          onSubmit={onSave}
          onCancel={onCancelEdit}
        />
      ) : (
        <>
          <SheetBody>
            <div className="grid gap-6">
              {user.status === "invited" && (
                <div className="flex flex-wrap items-center gap-3 rounded-[var(--admin-radius)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-3.5">
                  <Clock3 size={17} aria-hidden="true" className="flex-none text-[var(--status-warning-fg)]" />
                  <p className="m-0 min-w-0 flex-1 text-[length:var(--text-caption)] text-[var(--text-body)]">
                    {t("admin.users.invitedBanner", { date: formatDate(user.createdAt, locale) })}
                  </p>
                  <AdminButton size="sm" variant="outline" iconLeft={RotateCcw} loading={resending} onClick={onResendInvitation}>
                    {t("admin.users.resendInvitation")}
                  </AdminButton>
                </div>
              )}
              {user.status === "suspended" && (
                <div className="flex items-start gap-3 rounded-[var(--admin-radius)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-3.5">
                  <ShieldOff size={17} aria-hidden="true" className="mt-px flex-none text-[var(--status-error-fg)]" />
                  <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">{t("admin.users.suspendedBanner")}</p>
                </div>
              )}

              <section aria-labelledby="gt-user-account-title" className="grid gap-3">
                <h3 id="gt-user-account-title" className="text-[length:var(--text-body-md)] font-semibold">
                  {t("admin.users.sectionAccount")}
                </h3>
                <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--admin-radius)] border border-[var(--border-subtle)] bg-[var(--border-subtle)]">
                  <Fact label={t("admin.users.factCreated")} value={formatDate(user.createdAt, locale)} />
                  <Fact label={t("admin.users.factLastActive")} value={<LastActivity user={user} />} />
                  <Fact label={t("admin.users.factInvitedBy")} value={user.invitedBy ?? t("admin.users.founderAccount")} />
                  <Fact label={t("admin.users.factTeam")} value={t(`admin.users.team.${user.team}`)} />
                  <Fact
                    label={t("admin.users.factTwoFactor")}
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        {user.twoFactor ? (
                          <ShieldCheck size={14} aria-hidden="true" className="text-[var(--status-success-fg)]" />
                        ) : (
                          <KeyRound size={14} aria-hidden="true" className="text-[var(--status-warning-fg)]" />
                        )}
                        {user.twoFactor ? t("admin.users.twoFactorOn") : t("admin.users.twoFactorOff")}
                      </span>
                    }
                  />
                  <Fact label={t("admin.users.factId")} value={<span className="font-mono text-[12px]">{user.id}</span>} />
                </dl>
              </section>

              <section aria-labelledby="gt-user-permissions-title" className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="gt-user-permissions-title" className="text-[length:var(--text-body-md)] font-semibold">
                    {t("admin.users.sectionPermissions")}
                  </h3>
                  <AdminButton size="sm" variant="outline" iconLeft={UserCog} disabled={Boolean(guard)} onClick={onChangeRole}>
                    {t("admin.users.changeRole")}
                  </AdminButton>
                </div>
                <p className="m-0 text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
                  <strong className="font-semibold text-[var(--text-primary)]">{t(`admin.users.role.${user.role}`)}</strong>
                  {" — "}
                  {t(`admin.users.roleDescription.${user.role}`)}
                </p>
                <div className="rounded-[var(--admin-radius)] border border-[var(--border-subtle)] p-1.5">
                  <PermissionSummary role={user.role} />
                </div>
                {guardText && <GuardNote text={guardText} />}
              </section>

              <section aria-labelledby="gt-user-activity-title" className="grid gap-3">
                <h3 id="gt-user-activity-title" className="text-[length:var(--text-body-md)] font-semibold">
                  {t("admin.users.sectionActivity")}
                </h3>
                <ol className="m-0 grid list-none gap-0 p-0">
                  {user.activity.slice(0, 8).map((entry, index, list) => {
                    const Icon = ACTIVITY_ICON[entry.kind];
                    const administrative = ADMINISTRATIVE.includes(entry.kind);
                    const params = { ...entry.params };
                    if (entry.kind === "roleChanged" && entry.params) {
                      params.from = t(`admin.users.role.${entry.params.from}`);
                      params.to = t(`admin.users.role.${entry.params.to}`);
                    }
                    if (entry.kind === "changedSettings" && entry.params?.area) {
                      params.area = t(`admin.users.settingsArea.${entry.params.area}`);
                    }
                    return (
                      <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                        {index < list.length - 1 && (
                          <span aria-hidden="true" className="absolute bottom-0 left-[13px] top-7 w-px bg-[var(--border-subtle)]" />
                        )}
                        <span
                          aria-hidden="true"
                          className={clsx(
                            "relative grid h-7 w-7 flex-none place-items-center rounded-full border",
                            administrative
                              ? "border-[var(--gt-blue-200)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]"
                              : "border-[var(--border-subtle)] bg-[var(--admin-panel)] text-[var(--text-muted)]",
                          )}
                        >
                          <Icon size={13} strokeWidth={2} />
                        </span>
                        <div className="grid min-w-0 gap-0.5 pt-0.5">
                          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                            {t(`admin.users.activity.${entry.kind}`, params)}
                          </p>
                          <time
                            dateTime={entry.at}
                            title={formatDateTime(entry.at, locale)}
                            className="text-[11px] text-[var(--text-muted)]"
                          >
                            {formatRelative(entry.at, locale)} · {formatDateTime(entry.at, locale)}
                          </time>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
          </SheetBody>

          <SheetFooter>
            <AdminButton variant="ghost" iconLeft={Trash2} disabled={Boolean(guard)} onClick={onDelete} className="text-[var(--status-error-fg)] hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)]">
              {t("admin.users.deleteUser")}
            </AdminButton>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {user.status === "suspended" ? (
                <AdminButton variant="outline" iconLeft={CircleCheck} onClick={onReactivate}>
                  {t("admin.users.reactivate")}
                </AdminButton>
              ) : (
                <AdminButton variant="outline" iconLeft={Ban} disabled={Boolean(guard)} onClick={onSuspend}>
                  {t("admin.users.suspend")}
                </AdminButton>
              )}
              <AdminButton variant="primary" iconLeft={Pencil} onClick={onEdit} data-user-edit-trigger>
                {t("admin.users.editUser")}
              </AdminButton>
            </span>
          </SheetFooter>
        </>
      )}
    </AdminSheet>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1 bg-[var(--admin-panel)] p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-[length:var(--text-caption)] text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function GuardNote({ text }: { text: string }) {
  return (
    <p className="m-0 flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
      <KeyRound size={13} aria-hidden="true" className="mt-px flex-none" />
      {text}
    </p>
  );
}
