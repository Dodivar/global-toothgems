import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { Badge } from "../ui/Badge";
import { ROLE_META, STATUS_META, formatDateTime, formatRelative, useAdminLocale } from "./userMeta";
import { userAvatarTint, userInitials, type AdminUser, type UserRole, type UserStatus } from "../../data/adminUsers";

/**
 * The Users workspace's vocabulary, in one place.
 *
 * Every badge carries a tone, an icon *and* the word, the contract
 * `CustomerBadges` set: colour alone fails WCAG 2.2 1.4.1, and here the
 * difference between two badges is the difference between "can look" and "can
 * change everything".
 *
 * The role icons are chosen to say what the role *does*, so they still read if
 * the colours are lost: an eye for looking, a pen for editing, a shield for
 * holding the keys. The tones climb with the access — quiet neutral, brand
 * blue, then ink — so the most powerful accounts are also the most visible in a
 * scan of the table, without spending green or fuchsia on them.
 */

export function RoleBadge({ role, size = "sm" }: { role: UserRole; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const meta = ROLE_META[role];
  return (
    <Badge tone={meta.tone} size={size} icon={meta.icon}>
      {t(`admin.users.role.${role}`)}
    </Badge>
  );
}

export function UserStatusBadge({ status, size = "sm" }: { status: UserStatus; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} size={size} icon={meta.icon}>
      {t(`admin.users.status.${status}`)}
    </Badge>
  );
}

/**
 * The avatar: initials on a stable tint, like the customer avatars. The shop
 * holds no staff photographs, and a silhouette repeated down a column carries
 * no information. `aria-hidden`, because the name is always printed beside it.
 *
 * A suspended account's avatar is desaturated: a second, shape-free cue next to
 * the badge, never the only one.
 */
export function UserAvatar({
  user,
  size = 36,
  className,
}: {
  user: Pick<AdminUser, "id" | "firstName" | "lastName" | "status">;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: userAvatarTint(user.id),
        fontSize: Math.round(size * 0.36),
      }}
      className={clsx(
        "grid flex-none place-items-center rounded-full font-[var(--weight-black)] uppercase tracking-[var(--tracking-tight)] text-[var(--gt-ink-900)] ring-2 ring-[var(--surface-card)]",
        user.status === "suspended" && "opacity-55 grayscale",
        className,
      )}
    >
      {userInitials(user)}
    </span>
  );
}

/**
 * "You", beside the signed-in administrator's own name.
 *
 * The one place the page spends fuchsia: it answers "which of these is me" at a
 * glance, and it explains in advance why that row's destructive actions are
 * disabled.
 */
export function YouTag() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex h-[18px] flex-none items-center rounded-[var(--radius-pill)] border border-[var(--gt-fuchsia-300)] bg-[var(--gt-fuchsia-50)] px-1.5 text-[9px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--accent-highlight-ink)]">
      {t("admin.users.you")}
    </span>
  );
}

/**
 * Last activity, as a relative time over the exact date.
 *
 * Relative first because "is this person still around" is the question the
 * column answers; the exact timestamp stays one line below for the operator who
 * needs it, rather than hidden in a hover-only tooltip.
 */
export function LastActivity({ user, compact = false }: { user: AdminUser; compact?: boolean }) {
  const { t } = useTranslation();
  const locale = useAdminLocale();
  if (!user.lastActiveAt) {
    return (
      <span className="grid gap-0.5">
        <span className="text-[var(--text-muted)]">{t("admin.users.neverActive")}</span>
        {!compact && (
          <span className="text-[11px] text-[var(--text-muted)]">
            {user.status === "invited" ? t("admin.users.awaitingAcceptance") : "—"}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="grid gap-0.5">
      <time dateTime={user.lastActiveAt} className="whitespace-nowrap text-[var(--text-primary)]">
        {formatRelative(user.lastActiveAt, locale)}
      </time>
      {!compact && (
        <span className="whitespace-nowrap text-[11px] tabular-nums text-[var(--text-muted)]">
          {formatDateTime(user.lastActiveAt, locale)}
        </span>
      )}
    </span>
  );
}
