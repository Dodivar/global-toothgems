import { useTranslation } from "react-i18next";
import { BadgeCheck, Hourglass, type LucideIcon } from "lucide-react";
import clsx from "clsx";

/**
 * Small pieces of the achievement around a certificate: the badge (the
 * Academy's gem, mounted like a medal), the status pill and the row of figures
 * that earned it. Shared by the completion screen and the member area.
 */

/** The cut gem of the certificate's seal, as an icon. */
function GemMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round">
      <path d="M6.7 4.5H17.3L22 10.6L12 21.5L2 10.6Z" fill="var(--gt-emerald-50)" />
      <path d="M2 10.6H22M6.7 4.5L9.6 10.6L12 4.5L14.4 10.6L17.3 4.5M9.6 10.6L12 21.5L14.4 10.6" strokeWidth={1.1} />
    </svg>
  );
}

const BADGE_SIZES = { sm: { box: 44, gem: 20, ring: 3 }, md: { box: 72, gem: 32, ring: 4 }, lg: { box: 112, gem: 50, ring: 6 } } as const;

/**
 * The achievement badge. `reveal` plays its entrance once (a turn and a
 * settle, then one sheen) — the completion screen's moment; elsewhere it rests.
 */
export function AchievementBadge({ size = "md", reveal = false, className }: { size?: keyof typeof BADGE_SIZES; reveal?: boolean; className?: string }) {
  const s = BADGE_SIZES[size];
  return (
    <span
      aria-hidden="true"
      className={clsx("relative grid flex-none place-items-center rounded-full shadow-[var(--shadow-md)]", reveal && "gt-cert-badge", className)}
      style={{
        width: s.box,
        height: s.box,
        padding: s.ring,
        background: "conic-gradient(from 200deg, var(--gt-emerald-300), var(--gt-blue-300), var(--gt-emerald-400), var(--gt-blue-200), var(--gt-emerald-300))",
      }}
    >
      <span className="relative grid h-full w-full place-items-center overflow-hidden rounded-full bg-[var(--gt-white)] text-[var(--accent-cta-ink)] shadow-[inset_0_0_0_1px_var(--gt-blue-100)]">
        <GemMark size={s.gem} />
        {reveal && <span className="gt-cert-sheen pointer-events-none absolute inset-0 rounded-full" />}
      </span>
    </span>
  );
}

/** Earned or under way — said with an icon and a word, never by colour alone. */
export function CertificateStatus({ state, pct }: { state: "earned" | "pending"; pct?: number }) {
  const { t } = useTranslation();
  const earned = state === "earned";
  const Icon = earned ? BadgeCheck : Hourglass;
  return (
    <span
      className={clsx(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-[var(--tracking-wide)]",
        earned ? "bg-[var(--status-success-bg)] text-[var(--accent-cta-ink)]" : "bg-[var(--surface-sunken)] text-[var(--text-muted)]",
      )}
    >
      <Icon size={13} aria-hidden="true" />
      {earned ? t("certificate.statusEarned") : t("certificate.statusPending", { pct: pct ?? 0 })}
    </span>
  );
}

export interface AchievementStat {
  icon: LucideIcon;
  label: string;
  value: string;
  mono?: boolean;
}

/** The figures that make the achievement — only those that exist. */
export function AchievementStats({ stats, className }: { stats: AchievementStat[]; className?: string }) {
  return (
    <dl className={clsx("m-0 grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]", className)}>
      {stats.map(({ icon: Icon, label, value, mono }) => (
        <div
          key={label}
          className="flex flex-col-reverse gap-1 rounded-[var(--radius-md)] border border-white/70 bg-white/70 p-3.5 text-left shadow-[var(--shadow-xs)] backdrop-blur-[6px]"
        >
          <dt className="flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <Icon size={13} aria-hidden="true" className="flex-none text-[var(--gt-blue-600)]" />
            {label}
          </dt>
          <dd
            className={clsx("m-0 text-[length:var(--text-body-md)]", mono ? "break-all" : "truncate", " font-bold tabular-nums text-[var(--text-primary)]")}
            style={mono ? { fontFamily: "var(--gt-font-mono)", fontSize: "13px", fontWeight: 600 } : undefined}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
