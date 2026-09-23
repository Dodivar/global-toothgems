import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  ChevronRight,
  CircleCheck,
  Eye,
  Pencil,
  RotateCcw,
  SearchX,
  Trash2,
  UserCog,
  UserPlus,
  UsersRound,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "./AdminButton";
import { OverflowMenu, type MenuAction } from "./OverflowMenu";
import { LastActivity, RoleBadge, UserAvatar, UserStatusBadge, YouTag } from "./UserBadges";
import { formatDate, useAdminLocale } from "./userMeta";
import { useLocalized } from "../../lib/localized";
import type { UserSortKey } from "../../lib/adminUserFilters";
import type { GuardReason } from "../../lib/adminUserFilters";
import { CURRENT_USER_ID, userName, type AdminUser } from "../../data/adminUsers";

/**
 * The user list: a table above `xl`, cards below it.
 *
 * Built like the customers table, so the two read as one product:
 *
 * - **A row is a link, and also clickable.** The name is a real `<Link>` to the
 *   profile drawer's address, which is what keyboard and screen-reader users
 *   navigate and what makes a profile openable in a new tab. The row's own
 *   click is a mouse convenience that ignores clicks on controls.
 * - **A suspended account is a hairline, a greyed avatar and a badge** — never a
 *   red row, and never colour alone.
 * - **Below `xl` the table is not rendered at all.** Seven columns beside a
 *   264px rail would scroll sideways on a laptop; the cards re-cut the same
 *   information for the width instead.
 */

export interface UsersListProps {
  users: AdminUser[];
  sort: UserSortKey;
  onSort: (sort: UserSortKey) => void;
  /** Address of a user's profile drawer, keeping the list's filters. */
  hrefFor: (user: AdminUser) => string;
  onOpen: (user: AdminUser) => void;
  guardFor: (user: AdminUser) => GuardReason;
  onEdit: (user: AdminUser) => void;
  onChangeRole: (user: AdminUser) => void;
  onSuspend: (user: AdminUser) => void;
  onReactivate: (user: AdminUser) => void;
  onResend: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
}

const headCell =
  "sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]";

function SortableHead({
  label,
  ascKey,
  descKey,
  sort,
  onSort,
  className,
  firstKey,
}: {
  label: string;
  ascKey: UserSortKey;
  descKey: UserSortKey;
  /** What the first press sorts by: newest first for dates, A–Z for names. */
  firstKey?: UserSortKey;
  sort: UserSortKey;
  onSort: (sort: UserSortKey) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const active = sort === ascKey || sort === descKey;
  const ascending = sort === ascKey;
  return (
    <th scope="col" className={clsx(headCell, className)} aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(active ? (ascending ? descKey : ascKey) : (firstKey ?? ascKey))}
        className={clsx(
          "inline-flex items-center gap-1 rounded-[var(--radius-xs)] uppercase transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          active && "text-[var(--text-primary)]",
        )}
      >
        {label}
        {active ? (
          ascending ? (
            <ArrowUp size={12} aria-hidden="true" />
          ) : (
            <ArrowDown size={12} aria-hidden="true" />
          )
        ) : (
          <ArrowDown size={12} aria-hidden="true" className="opacity-25" />
        )}
        <span className="sr-only">{t("admin.users.sortHint")}</span>
      </button>
    </th>
  );
}

/**
 * Secondary actions for one user.
 *
 * Portalled (`OverflowMenu`) rather than anchored inside the row: the table
 * scrolls inside its own card, and a filtered list of one or two users is too
 * short to hold a six-entry menu — an in-place panel would be clipped. Actions
 * the guards forbid stay in the list, disabled, with the reason underneath.
 */
function UserRowActions({ user, props }: { user: AdminUser; props: UsersListProps }) {
  const { t } = useTranslation();
  const guard = props.guardFor(user);
  const actions: MenuAction[] = [
    { id: "view", label: t("admin.users.actionView"), icon: Eye, onSelect: () => props.onOpen(user) },
    { id: "edit", label: t("admin.users.editUser"), icon: Pencil, onSelect: () => props.onEdit(user) },
    {
      id: "role",
      label: t("admin.users.changeRole"),
      icon: UserCog,
      disabled: Boolean(guard),
      onSelect: () => props.onChangeRole(user),
    },
  ];
  if (user.status === "invited") {
    actions.push({ id: "resend", label: t("admin.users.resendInvitation"), icon: RotateCcw, onSelect: () => props.onResend(user) });
  }
  actions.push(
    user.status === "suspended"
      ? { id: "reactivate", label: t("admin.users.reactivate"), icon: CircleCheck, onSelect: () => props.onReactivate(user) }
      : { id: "suspend", label: t("admin.users.suspend"), icon: Ban, disabled: Boolean(guard), onSelect: () => props.onSuspend(user) },
  );
  actions.push({
    id: "delete",
    label: t("admin.users.deleteUser"),
    icon: Trash2,
    tone: "danger",
    separated: true,
    disabled: Boolean(guard),
    onSelect: () => props.onDelete(user),
  });

  return (
    <OverflowMenu
      label={t("admin.users.rowActionsLabel", { name: userName(user) })}
      actions={actions}
      note={guard ? t(`admin.users.guard.${guard}`) : undefined}
    />
  );
}

export function UsersTable(props: UsersListProps) {
  const { t } = useTranslation();
  const locale = useAdminLocale();
  const localized = useLocalized();
  const { users, sort, onSort, hrefFor, onOpen } = props;

  return (
    <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)] xl:block">
      <div className="gt-admin-scroll max-h-[min(72vh,900px)] overflow-auto">
        <table className="w-full min-w-[920px] table-fixed border-collapse text-[length:var(--text-body-sm)]">
          <caption className="sr-only">{t("admin.users.tableCaption")}</caption>
          <colgroup>
            <col style={{ width: "25%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "5%" }} />
          </colgroup>
          <thead>
            <tr>
              <SortableHead label={t("admin.users.colUser")} ascKey="nameAsc" descKey="nameDesc" sort={sort} onSort={onSort} className="pl-5" />
              <th scope="col" className={headCell}>
                {t("admin.users.colEmail")}
              </th>
              <SortableHead label={t("admin.users.colRole")} ascKey="roleAsc" descKey="roleDesc" firstKey="roleDesc" sort={sort} onSort={onSort} />
              <th scope="col" className={headCell}>
                {t("admin.users.colStatus")}
              </th>
              <SortableHead
                label={t("admin.users.colLastActivity")}
                ascKey="activityAsc"
                descKey="activityDesc"
                firstKey="activityDesc"
                sort={sort}
                onSort={onSort}
              />
              <SortableHead
                label={t("admin.users.colCreated")}
                ascKey="createdAsc"
                descKey="createdDesc"
                firstKey="createdDesc"
                sort={sort}
                onSort={onSort}
              />
              <th scope="col" className={clsx(headCell, "pr-4 text-right")}>
                <span className="sr-only">{t("admin.users.colActions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const suspended = user.status === "suspended";
              return (
                <tr
                  key={user.id}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a,button,input,label,[role='menu']")) return;
                    onOpen(user);
                  }}
                  className="gt-admin-row group cursor-pointer border-b border-[var(--border-subtle)] last:border-b-0"
                >
                  <td className="relative py-3 pl-5 pr-3 align-middle">
                    {suspended && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-[var(--gt-red-500)]" />}
                    <span className="flex min-w-0 items-center gap-3">
                      <UserAvatar user={user} />
                      <span className="grid min-w-0">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Link
                            to={hrefFor(user)}
                            onClick={(event) => {
                              // Plain clicks open the drawer in place; modified
                              // clicks keep the browser's own behaviour (new tab).
                              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                              event.preventDefault();
                              onOpen(user);
                            }}
                            className="truncate rounded-[var(--radius-xs)] font-semibold text-[var(--text-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                          >
                            {userName(user)}
                          </Link>
                          {user.id === CURRENT_USER_ID && <YouTag />}
                        </span>
                        <span className="truncate text-[12px] text-[var(--text-muted)]">{localized(user.jobTitle)}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <a
                      href={`mailto:${user.email}`}
                      className="block truncate text-[var(--text-body)] underline decoration-[var(--gt-ink-300)] decoration-1 underline-offset-2 transition-colors hover:text-[var(--accent-highlight-ink)] hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                    >
                      {user.email}
                    </a>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <UserStatusBadge status={user.status} />
                  </td>
                  <td className="px-3 py-3 align-middle text-[length:var(--text-caption)]">
                    <LastActivity user={user} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-middle text-[length:var(--text-caption)] text-[var(--text-body)]">
                    <time dateTime={user.createdAt}>{formatDate(user.createdAt, locale)}</time>
                  </td>
                  <td className="pr-4 align-middle">
                    <span className="flex justify-end">
                      <UserRowActions user={user} props={props} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The same users as cards, for tablet and phone.
 *
 * Who and what access go to the top — name, role, status — because that is
 * what an operator on a phone is checking. Activity and creation dates become a
 * two-column strip, and the card ends in a full-width "View profile" bar, so
 * the touch target is a bar rather than a 14px name.
 */
export function UserCardList(props: UsersListProps) {
  const { t } = useTranslation();
  const locale = useAdminLocale();
  const localized = useLocalized();
  const { users, hrefFor, onOpen } = props;

  return (
    <ul className="m-0 grid list-none gap-2.5 p-0 md:grid-cols-2 xl:hidden">
      {users.map((user) => {
        const suspended = user.status === "suspended";
        return (
          <li key={user.id} className="min-w-0">
            <article className="relative grid h-full gap-3 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-xs)]">
              {suspended && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-[var(--gt-red-500)]" />}
              <div className="flex items-start gap-3">
                <UserAvatar user={user} size={42} />
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <h3 className="m-0 truncate text-[length:var(--text-body-md)] font-[var(--weight-bold)] text-[var(--text-primary)]">
                      {userName(user)}
                    </h3>
                    {user.id === CURRENT_USER_ID && <YouTag />}
                  </span>
                  <a
                    href={`mailto:${user.email}`}
                    className="w-fit max-w-full truncate text-[length:var(--text-caption)] text-[var(--text-body)] underline decoration-[var(--gt-ink-300)] underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    {user.email}
                  </a>
                  <span className="truncate text-[11px] text-[var(--text-muted)]">{localized(user.jobTitle)}</span>
                </div>
                <UserRowActions user={user} props={props} />
              </div>

              <div className="flex flex-wrap gap-1.5">
                <RoleBadge role={user.role} />
                <UserStatusBadge status={user.status} />
              </div>

              <dl className="m-0 grid grid-cols-2 gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3 text-[length:var(--text-caption)]">
                <div className="grid min-w-0 gap-0.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
                    {t("admin.users.colLastActivity")}
                  </dt>
                  <dd className="m-0 min-w-0">
                    <LastActivity user={user} compact />
                  </dd>
                </div>
                <div className="grid min-w-0 gap-0.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
                    {t("admin.users.colCreated")}
                  </dt>
                  <dd className="m-0 text-[var(--text-primary)]">
                    <time dateTime={user.createdAt}>{formatDate(user.createdAt, locale)}</time>
                  </dd>
                </div>
              </dl>

              <Link
                to={hrefFor(user)}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                  event.preventDefault();
                  onOpen(user);
                }}
                aria-label={t("admin.users.viewProfileOf", { name: userName(user) })}
                className="mt-auto flex items-center justify-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] py-2.5 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {t("admin.users.actionView")}
                <ChevronRight size={14} aria-hidden="true" />
              </Link>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Placeholders                                                               */
/* -------------------------------------------------------------------------- */

/** Rows of the right shape while the list loads, announced to screen readers. */
export function UsersSkeleton({ rows = 6 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)]"
    >
      <span className="sr-only">{t("admin.users.loading")}</span>
      <div className="grid gap-px bg-[var(--border-subtle)]">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 bg-[var(--surface-card)] px-5 py-[18px]">
            <span className="gt-skeleton h-9 w-9 flex-none rounded-full" />
            <span className="grid flex-1 gap-1.5">
              <span className="gt-skeleton h-3 w-[40%] rounded-full" />
              <span className="gt-skeleton h-2.5 w-[22%] rounded-full" />
            </span>
            <span className="gt-skeleton hidden h-3 w-[180px] flex-none rounded-full md:block" />
            <span className="gt-skeleton h-[22px] w-[84px] flex-none rounded-[var(--radius-pill)]" />
            <span className="gt-skeleton hidden h-[22px] w-[72px] flex-none rounded-[var(--radius-pill)] sm:block" />
            <span className="gt-skeleton hidden h-3 w-[90px] flex-none rounded-full lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function NoUserResults({ search, onReset }: { search: string; onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid justify-items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-[clamp(32px,7vw,64px)] text-center">
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-[var(--radius-lg)] bg-[var(--surface-sunken)] text-[var(--text-muted)]">
        <SearchX size={22} />
      </span>
      <h2 className="text-[length:var(--text-h4)]">
        {search.trim() ? t("admin.users.emptySearchTitle", { term: search.trim() }) : t("admin.users.emptyFilterTitle")}
      </h2>
      <p className="m-0 max-w-[46ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("admin.users.emptyFilterBody")}</p>
      <AdminButton variant="outline" onClick={onReset}>
        {t("admin.users.clearFilters")}
      </AdminButton>
    </div>
  );
}

export function NoUsersYet({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid justify-items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-[clamp(32px,7vw,64px)] text-center">
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-[var(--radius-lg)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]">
        <UsersRound size={22} />
      </span>
      <h2 className="text-[length:var(--text-h4)]">{t("admin.users.emptyTitle")}</h2>
      <p className="m-0 max-w-[44ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("admin.users.emptyBody")}</p>
      <AdminButton variant="primary" iconLeft={UserPlus} onClick={onAdd}>
        {t("admin.users.addUser")}
      </AdminButton>
    </div>
  );
}
