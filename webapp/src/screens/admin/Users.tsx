"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "../../lib/navigation";
import { UserPlus } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { AdminSheet } from "../../components/admin/AdminSheet";
import { Pagination } from "../../components/admin/Pagination";
import { RoleMatrix } from "../../components/admin/RolePermissions";
import { ROLE_META } from "../../components/admin/userMeta";
import { UserDetailDrawer } from "../../components/admin/UserDetailDrawer";
import { CancelInvitationDialog, RoleChangeDialog, SuspendUserDialog } from "../../components/admin/UserDialogs";
import { UserForm } from "../../components/admin/UserForm";
import { UserMetricsRow } from "../../components/admin/UserMetricsRow";
import { NoUserResults, NoUsersYet, UserCardList, UsersLoadProblem, UsersSkeleton, UsersTable } from "../../components/admin/UsersTable";
import { UsersToolbar } from "../../components/admin/UsersToolbar";
import { useAdminUsers, type UserDraft, type UserWriteError } from "../../lib/adminUsers";
import {
  DEFAULT_USER_PAGE_SIZE,
  DEFAULT_USER_SORT,
  USER_PARAM,
  activeUserFilterCount,
  applyUserFilters,
  guardFor,
  paginateUsers,
  readUserFilters,
  userMetrics,
  type UserSortKey,
} from "../../lib/adminUserFilters";
import { useToast } from "../../lib/toast";
import { USER_ROLES, userName, type AdminUser, type UserRole } from "../../data/adminUsers";
import { useAdminShell } from "./AdminLayout";

/**
 * Users — who can work in the back office, and with what access.
 *
 * The reading order is the one every admin workspace uses, so there is nothing
 * to learn: the header says where you are and offers the one primary action,
 * the KPI row counts *and* filters, the toolbar finds, and the list below is
 * the page. A comparison of the three roles closes the page, because "what can
 * a manager actually do" is the question behind most visits here.
 *
 * State lives where it does on Customers and Orders:
 *
 * - **The URL** holds what the list shows and which profile is open, so a
 *   filtered list or a profile is a link, and Back closes the drawer.
 * - **`useAdminUsers`** holds the users, so a role change moves the badge, the
 *   tiles, the permission summary and the user's history at once.
 * - **This component** holds what is genuinely transient: which dialog is open
 *   and which request is in flight.
 *
 * The team, the permission matrix and every change live in Supabase
 * (`lib/adminUsers.tsx`). What the signed-in member may do comes from
 * `my_permissions()` and only decides what is offered: the guards here explain
 * the database's rules (`private.guard_profile_update()`), which refuse the
 * same actions anyway — a refusal is shown as such, never as a success.
 */

const EMPTY_DRAFT: UserDraft = {
  firstName: "",
  lastName: "",
  email: "",
  role: "readOnly",
  jobTitle: "",
  team: "",
};

export function Users() {
  const { t } = useTranslation();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const {
    users,
    loading,
    failed,
    available,
    reload,
    currentUserId,
    permissions,
    callerRank,
    inviteUser,
    updateUser,
    changeRole,
    setStatus,
    resendInvitation,
    cancelInvitation,
  } = useAdminUsers();
  const canManage = permissions.has("manage_users");
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => readUserFilters(params), [params]);
  const activeCount = activeUserFilterCount(filters);

  /* ---------------------------------------------------------------------- */
  /* URL writes                                                             */
  /* ---------------------------------------------------------------------- */

  /** One writer. Any filter change resets the page, so a narrowed list never opens on an empty page 3. */
  const write = useCallback(
    (changes: Record<string, string | null | undefined>, keepPage = false) => {
      const next = new URLSearchParams(params);
      Object.entries(changes).forEach(([key, value]) => {
        if (value == null || value === "" || value === "all") next.delete(key);
        else next.set(key, value);
      });
      if (!keepPage) next.delete(USER_PARAM.page);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const onSearch = useCallback((value: string) => write({ [USER_PARAM.search]: value || null }), [write]);

  const onSet = useCallback(
    (key: "role" | "status" | "activity" | "sort", value: string) => {
      if (key === "sort") write({ [USER_PARAM.sort]: value === DEFAULT_USER_SORT ? null : value }, true);
      else write({ [USER_PARAM[key]]: value });
    },
    [write],
  );

  const onReset = useCallback(() => {
    const next = new URLSearchParams();
    const open = params.get(USER_PARAM.user);
    if (open) next.set(USER_PARAM.user, open);
    setParams(next, { replace: true });
  }, [params, setParams]);

  /** A KPI tile replaces the filters with its own, or clears them when pressed again. */
  const onTile = (tile: "total" | "active" | "manager" | "administrator") => {
    if (tile === "total") return onReset();
    const [param, value] = tile === "active" ? [USER_PARAM.status, "active"] : [USER_PARAM.role, tile];
    const alreadyOn = params.get(param) === value && activeCount === 1;
    const next = new URLSearchParams();
    const open = params.get(USER_PARAM.user);
    if (open) next.set(USER_PARAM.user, open);
    if (params.get(USER_PARAM.sort)) next.set(USER_PARAM.sort, params.get(USER_PARAM.sort)!);
    if (!alreadyOn) next.set(param, value);
    setParams(next, { replace: true });
  };

  /* ---------------------------------------------------------------------- */
  /* Results and loading                                                    */
  /* ---------------------------------------------------------------------- */

  const overview = useMemo(() => userMetrics(users), [users]);
  const filtered = useMemo(() => applyUserFilters(users, filters), [users, filters]);
  const page = useMemo(() => paginateUsers(filtered, filters), [filtered, filters]);

  /* ---------------------------------------------------------------------- */
  /* Drawer                                                                 */
  /* ---------------------------------------------------------------------- */

  const openId = params.get(USER_PARAM.user);
  const openUser = users.find((u) => u.id === openId) ?? null;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string>();

  const hrefFor = useCallback(
    (user: AdminUser) => {
      const next = new URLSearchParams(params);
      next.set(USER_PARAM.user, user.id);
      return `?${next.toString()}`;
    },
    [params],
  );

  // Pushed rather than replaced, so the browser's Back closes the drawer.
  const openProfile = useCallback(
    (user: AdminUser, edit = false) => {
      const next = new URLSearchParams(params);
      next.set(USER_PARAM.user, user.id);
      setEditingId(edit ? user.id : null);
      setEditError(undefined);
      setParams(next);
    },
    [params, setParams, setEditingId, setEditError],
  );

  const closeProfile = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete(USER_PARAM.user);
    setEditingId(null);
    setEditError(undefined);
    setParams(next, { replace: true });
  }, [params, setParams, setEditingId, setEditError]);

  const guardOf = useCallback(
    (user: AdminUser) => guardFor(user, users, { currentUserId, canManage, callerRank }),
    [users, currentUserId, canManage, callerRank],
  );

  /* ---------------------------------------------------------------------- */
  /* Writes                                                                 */
  /* ---------------------------------------------------------------------- */

  const roleLabel = (role: UserRole) => t(`admin.users.role.${role}`);
  const reason = (error: UserWriteError) => t(`admin.users.toastError.${error}`);

  const saveEdit = async (user: AdminUser, draft: UserDraft) => {
    setEditSubmitting(true);
    const result = await updateUser(user.id, draft);
    setEditSubmitting(false);
    if (!result.ok) {
      showToast(t("admin.users.toastSaveErrorTitle"), reason(result.error), "error");
      return false;
    }
    setEditingId(null);
    showToast(t("admin.users.toastSavedTitle"), t("admin.users.toastSavedBody", { name: userName({ ...draft }) }));
    return true;
  };

  // Role change: from the drawer, a row menu, or the edit form (with a draft).
  const [roleTarget, setRoleTarget] = useState<{ user: AdminUser; presetRole?: UserRole; draft?: UserDraft } | null>(null);
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const closeRoleDialog = useCallback(() => setRoleTarget(null), [setRoleTarget]);

  const confirmRole = async (role: UserRole) => {
    if (!roleTarget) return;
    const { user, draft } = roleTarget;
    setRoleSubmitting(true);
    if (draft) {
      // A failed save leaves the form open, its draft intact.
      await saveEdit(user, { ...draft, role });
      setRoleSubmitting(false);
      setRoleTarget(null);
      return;
    }
    const result = await changeRole(user.id, role);
    setRoleSubmitting(false);
    setRoleTarget(null);
    if (!result.ok) {
      showToast(t("admin.users.toastRoleErrorTitle"), reason(result.error), "error");
      return;
    }
    showToast(t("admin.users.toastRoleTitle"), t("admin.users.toastRoleBody", { name: userName(user), role: roleLabel(role) }));
  };

  const [suspendTarget, setSuspendTarget] = useState<AdminUser | null>(null);
  const [suspendSubmitting, setSuspendSubmitting] = useState(false);
  const closeSuspend = useCallback(() => setSuspendTarget(null), [setSuspendTarget]);

  const confirmSuspend = async () => {
    if (!suspendTarget) return;
    setSuspendSubmitting(true);
    const result = await setStatus(suspendTarget.id, "suspended");
    setSuspendSubmitting(false);
    setSuspendTarget(null);
    if (!result.ok) {
      showToast(t("admin.users.toastStatusErrorTitle"), reason(result.error), "error");
      return;
    }
    showToast(t("admin.users.toastSuspendedTitle"), t("admin.users.toastSuspendedBody", { name: userName(suspendTarget) }), "warning");
  };

  const reactivate = async (user: AdminUser) => {
    const result = await setStatus(user.id, "active");
    if (!result.ok) {
      showToast(t("admin.users.toastStatusErrorTitle"), reason(result.error), "error");
      return;
    }
    showToast(t("admin.users.toastReactivatedTitle"), t("admin.users.toastReactivatedBody", { name: userName(user) }));
  };

  const [resendingId, setResendingId] = useState<string | null>(null);
  const resend = async (user: AdminUser) => {
    setResendingId(user.id);
    const result = await resendInvitation(user.id);
    setResendingId(null);
    if (result.ok) showToast(t("admin.users.toastResentTitle"), t("admin.users.toastResentBody", { email: user.email }), "info");
    else showToast(t("admin.users.toastResendErrorTitle"), reason(result.error), "error");
  };

  const [cancelTarget, setCancelTarget] = useState<AdminUser | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const closeCancel = useCallback(() => setCancelTarget(null), [setCancelTarget]);

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    const target = cancelTarget;
    setCancelSubmitting(true);
    const result = await cancelInvitation(target.id);
    setCancelSubmitting(false);
    setCancelTarget(null);
    if (!result.ok) {
      showToast(t("admin.users.toastCancelInviteErrorTitle"), reason(result.error), "error");
      return;
    }
    if (openId === target.id) closeProfile();
    showToast(t("admin.users.toastCancelInviteTitle"), t("admin.users.toastCancelInviteBody", { email: target.email }));
  };

  // Invite
  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string>();
  const closeAdd = useCallback(() => {
    setAddOpen(false);
    setAddError(undefined);
  }, []);

  const submitAdd = async (draft: UserDraft) => {
    setAddSubmitting(true);
    const result = await inviteUser(draft);
    setAddSubmitting(false);
    if (!result.ok) {
      if (result.error === "alreadyMember" || result.error === "accountUnavailable") setAddError(reason(result.error));
      showToast(t("admin.users.toastCreateErrorTitle"), reason(result.error), "error");
      return;
    }
    setAddOpen(false);
    setAddError(undefined);
    const email = draft.email.trim().toLowerCase();
    showToast(
      t("admin.users.toastCreatedTitle"),
      result.outcome === "promoted"
        ? t("admin.users.toastPromoted", { email, role: roleLabel(draft.role) })
        : t("admin.users.toastCreatedInvited", { email }),
    );
  };

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  const listProps = {
    users: page.items,
    sort: filters.sort,
    onSort: (sort: UserSortKey) => onSet("sort", sort),
    hrefFor,
    onOpen: (user: AdminUser) => openProfile(user),
    guardFor: guardOf,
    onEdit: (user: AdminUser) => openProfile(user, true),
    onChangeRole: (user: AdminUser) => setRoleTarget({ user }),
    onSuspend: (user: AdminUser) => setSuspendTarget(user),
    onReactivate: reactivate,
    onResend: resend,
    onCancelInvitation: (user: AdminUser) => setCancelTarget(user),
    currentUserId,
  };

  const roleCounts = useMemo(
    () => Object.fromEntries(USER_ROLES.map((role) => [role, users.filter((u) => u.role === role).length])) as Record<UserRole, number>,
    [users],
  );

  return (
    <>
      <AdminHeader
        title={t("admin.users.title")}
        description={t("admin.users.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.users.title") }]}
        onOpenNav={openNav}
        actions={
          // Offered to members holding manage_users only; the Edge Function checks it again.
          canManage ? (
            <AdminButton variant="primary" iconLeft={UserPlus} onClick={() => setAddOpen(true)}>
              <span className="hidden sm:inline">{t("admin.users.addUser")}</span>
              <span className="sm:hidden">{t("admin.users.addUserShort")}</span>
            </AdminButton>
          ) : undefined
        }
      />

      <div className="grid gap-4 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <UserMetricsRow
          metrics={overview}
          activeFilters={activeCount}
          roleFilter={filters.role}
          statusFilter={filters.status}
          onSelect={onTile}
        />

        <div className="gt-admin-panel p-[var(--space-4)]">
          <UsersToolbar
            filters={filters}
            resultCount={filtered.length}
            activeCount={activeCount}
            onSearch={onSearch}
            onSet={onSet}
            onReset={onReset}
          />
        </div>

        {!available ? (
          <UsersLoadProblem />
        ) : loading ? (
          <UsersSkeleton rows={6} />
        ) : failed ? (
          <UsersLoadProblem onRetry={reload} />
        ) : users.length === 0 ? (
          <NoUsersYet onAdd={canManage ? () => setAddOpen(true) : undefined} />
        ) : filtered.length === 0 ? (
          <NoUserResults search={filters.search} onReset={onReset} />
        ) : (
          <>
            <UsersTable {...listProps} />
            <UserCardList {...listProps} />
            <Pagination
              page={page}
              onPage={(value) => write({ [USER_PARAM.page]: value === 1 ? null : String(value) }, true)}
              pageSize={filters.pageSize}
              onPageSize={(size) => write({ [USER_PARAM.pageSize]: size === DEFAULT_USER_PAGE_SIZE ? null : String(size) })}
              rangeKey="admin.users.paginationRange"
              navLabelKey="admin.users.paginationLabel"
            />
          </>
        )}

        {/* Roles and permissions: the page's reference card. Three roles on the
            left, each with a plain description and how many people hold it;
            the comparison on the right, drawn from the same table the
            confirmations read. */}
        <section aria-labelledby="gt-roles-title" className="gt-admin-panel mt-2 grid gap-5 p-[clamp(16px,2.4vw,24px)]">
          <div className="grid gap-1">
            <h2 id="gt-roles-title" className="text-[length:var(--text-h4)]">
              {t("admin.users.rolesTitle")}
            </h2>
            <p className="m-0 max-w-[70ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("admin.users.rolesBody")}</p>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
            <ul className="m-0 grid list-none content-start gap-2.5 p-0">
              {USER_ROLES.map((role) => {
                const Icon = ROLE_META[role].icon;
                return (
                  <li key={role} className="flex items-start gap-3 rounded-[var(--admin-radius)] border border-[var(--border-subtle)] p-3.5">
                    <span
                      aria-hidden="true"
                      className={
                        role === "administrator"
                          ? "grid h-9 w-9 flex-none place-items-center rounded-[var(--admin-radius-sm)] bg-[var(--gt-ink-900)] text-[var(--text-inverse)]"
                          : role === "manager"
                            ? "grid h-9 w-9 flex-none place-items-center rounded-[var(--admin-radius-sm)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]"
                            : "grid h-9 w-9 flex-none place-items-center rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] text-[var(--text-body)]"
                      }
                    >
                      <Icon size={17} strokeWidth={1.9} />
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <strong className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                          {t(`admin.users.role.${role}`)}
                        </strong>
                        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
                          {t("admin.users.roleHolders", { count: roleCounts[role] })}
                        </span>
                      </span>
                      <span className="text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
                        {t(`admin.users.roleDescription.${role}`)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <RoleMatrix />
          </div>
        </section>
      </div>

      {/* Overlays. The drawer and the add panel portal themselves; the dialogs
          are rendered after them so they always stack on top. */}
      <AdminSheet
        open={addOpen}
        onClose={addSubmitting ? () => undefined : closeAdd}
        title={t("admin.users.addTitle")}
        description={t("admin.users.addDescription")}
        closeLabel={t("common.close")}
      >
        <UserForm
          mode="create"
          initial={EMPTY_DRAFT}
          submitting={addSubmitting}
          serverError={addError}
          onClearServerError={() => setAddError(undefined)}
          onSubmit={submitAdd}
          onCancel={closeAdd}
        />
      </AdminSheet>

      <UserDetailDrawer
        user={openUser}
        mode={openUser && editingId === openUser.id ? "edit" : "view"}
        guard={openUser ? guardOf(openUser) : null}
        editSubmitting={editSubmitting}
        editError={editError}
        onClearEditError={() => setEditError(undefined)}
        onClose={closeProfile}
        onEdit={() => {
          if (!openUser) return;
          setEditError(undefined);
          setEditingId(openUser.id);
        }}
        onCancelEdit={() => {
          if (editSubmitting) return;
          setEditError(undefined);
          setEditingId(null);
        }}
        onSave={(draft) => {
          if (!openUser) return;
          // A role change inside the form still goes through its confirmation.
          if (draft.role !== openUser.role) setRoleTarget({ user: openUser, presetRole: draft.role, draft });
          else void saveEdit(openUser, draft);
        }}
        onChangeRole={() => openUser && setRoleTarget({ user: openUser })}
        onSuspend={() => openUser && setSuspendTarget(openUser)}
        onReactivate={() => openUser && void reactivate(openUser)}
        onResendInvitation={() => openUser && void resend(openUser)}
        resending={Boolean(openUser && resendingId === openUser.id)}
        onCancelInvitation={() => openUser && setCancelTarget(openUser)}
        isSelf={Boolean(openUser && openUser.id === currentUserId)}
      />

      <RoleChangeDialog
        user={roleTarget?.user ?? null}
        presetRole={roleTarget?.presetRole}
        loading={roleSubmitting}
        onClose={closeRoleDialog}
        onConfirm={(role) => void confirmRole(role)}
      />
      <SuspendUserDialog user={suspendTarget} loading={suspendSubmitting} onClose={closeSuspend} onConfirm={() => void confirmSuspend()} />
      <CancelInvitationDialog user={cancelTarget} loading={cancelSubmitting} onClose={closeCancel} onConfirm={() => void confirmCancel()} />
    </>
  );
}
