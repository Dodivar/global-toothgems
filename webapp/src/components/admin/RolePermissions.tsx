import { useTranslation } from "react-i18next";
import { Check, Minus, Plus } from "lucide-react";
import clsx from "clsx";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  USER_ROLES,
  permissionDiff,
  type UserRole,
} from "../../data/adminUsers";
import { ROLE_META } from "./userMeta";

/**
 * How the three roles differ, drawn from `ROLE_PERMISSIONS` and nothing else.
 *
 * Three views of the same table: the full comparison (the page's permissions
 * panel and the form's "compare roles" disclosure), one role's summary (the
 * profile drawer), and the difference between two roles (the role-change
 * confirmation). Because all three read the same source, the consequences a
 * confirmation spells out cannot disagree with the table below it.
 *
 * Allowed and not-allowed are a tick and a dash *and* a visually hidden word,
 * so the matrix reads correctly to a screen reader and without colour.
 */

export function RoleMatrix({ highlight, compact = false }: { highlight?: UserRole; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-[var(--admin-radius)] border border-[var(--border-subtle)]">
      <table className="w-full table-fixed border-collapse text-[length:var(--text-body-sm)]">
        <caption className="sr-only">{t("admin.users.matrixCaption")}</caption>
        <colgroup>
          <col />
          {USER_ROLES.map((role) => (
            <col key={role} style={{ width: compact ? "22%" : "20%" }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-[var(--admin-panel-sunken)]">
            <th
              scope="col"
              className="border-b border-[var(--border-subtle)] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]"
            >
              {t("admin.users.matrixPermission")}
            </th>
            {USER_ROLES.map((role) => {
              const Icon = ROLE_META[role].icon;
              return (
                <th
                  key={role}
                  scope="col"
                  className={clsx(
                    "border-b border-[var(--border-subtle)] px-1.5 py-2.5 text-center align-bottom text-[11px] font-semibold leading-tight text-[var(--text-primary)]",
                    highlight === role && "bg-[var(--surface-brand-wash)]",
                  )}
                >
                  <span className="grid justify-items-center gap-1">
                    <Icon size={14} strokeWidth={2} aria-hidden="true" className="text-[var(--text-muted)]" />
                    <span className="break-words">{t(`admin.users.role.${role}`)}</span>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map((permission) => (
            <tr key={permission} className="border-b border-[var(--border-subtle)] last:border-b-0">
              <th
                scope="row"
                className="px-3 py-2 text-left text-[length:var(--text-caption)] font-medium text-[var(--text-body)]"
              >
                {t(`admin.users.permission.${permission}`)}
              </th>
              {USER_ROLES.map((role) => (
                <td
                  key={role}
                  className={clsx("px-1.5 py-2 text-center", highlight === role && "bg-[var(--surface-brand-wash)]")}
                >
                  <PermissionMark allowed={ROLE_PERMISSIONS[role].has(permission)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PermissionMark({ allowed }: { allowed: boolean }) {
  const { t } = useTranslation();
  return allowed ? (
    <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)]">
      <Check size={13} strokeWidth={2.6} aria-hidden="true" />
      <span className="sr-only">{t("admin.users.allowed")}</span>
    </span>
  ) : (
    <span className="inline-grid h-6 w-6 place-items-center text-[var(--text-muted)]">
      <Minus size={13} strokeWidth={2.2} aria-hidden="true" />
      <span className="sr-only">{t("admin.users.notAllowed")}</span>
    </span>
  );
}

/** One role's permissions, as a checklist. Used on the profile drawer. */
export function PermissionSummary({ role }: { role: UserRole }) {
  const { t } = useTranslation();
  const granted = ROLE_PERMISSIONS[role];
  return (
    <ul className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2">
      {PERMISSIONS.map((permission) => {
        const allowed = granted.has(permission);
        return (
          <li
            key={permission}
            className={clsx(
              "flex items-center gap-2 rounded-[var(--admin-radius-sm)] px-2 py-1.5 text-[length:var(--text-caption)]",
              allowed ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]",
            )}
          >
            <PermissionMark allowed={allowed} />
            <span className={clsx(!allowed && "line-through decoration-[var(--gt-ink-300)]")}>
              {t(`admin.users.permission.${permission}`)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * What a role change adds and removes, as two short lists.
 *
 * Only the difference: listing the four permissions that stay the same would
 * bury the two that change, and those two are the whole reason the dialog
 * exists.
 */
export function RoleChangeSummary({ from, to }: { from: UserRole; to: UserRole }) {
  const { t } = useTranslation();
  const { gained, lost } = permissionDiff(from, to);
  if (gained.length === 0 && lost.length === 0) return null;
  return (
    <div className="grid gap-2.5 rounded-[var(--admin-radius)] border border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-3.5">
      {gained.length > 0 && (
        <div className="grid gap-1.5">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
            {t("admin.users.gains")}
          </p>
          <ul className="m-0 grid list-none gap-1 p-0">
            {gained.map((permission) => (
              <li key={permission} className="flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)]">
                  <Plus size={12} strokeWidth={2.6} aria-hidden="true" />
                </span>
                {t(`admin.users.permission.${permission}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {lost.length > 0 && (
        <div className="grid gap-1.5">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
            {t("admin.users.loses")}
          </p>
          <ul className="m-0 grid list-none gap-1 p-0">
            {lost.map((permission) => (
              <li key={permission} className="flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--status-error-bg)] text-[var(--status-error-fg)]">
                  <Minus size={12} strokeWidth={2.6} aria-hidden="true" />
                </span>
                {t(`admin.users.permission.${permission}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
