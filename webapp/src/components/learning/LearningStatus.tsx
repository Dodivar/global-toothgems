import { useTranslation } from "react-i18next";
import { Check, CircleDashed, ListChecks, Lock, PlayCircle, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { Badge, type BadgeTone } from "../ui/Badge";
import type { ModuleStatus, NodeKind } from "../../lib/learning/path";

/**
 * Status vocabulary shared by the overview, the player and the outline.
 *
 * Every state is an icon *and* a word (visible or screen-reader only), never a
 * colour on its own — completed, current, locked and not started must read the
 * same in greyscale.
 */

export type NodeStatus = "done" | "current" | "open" | "locked";

/** The round marker in front of a lesson. */
export function NodeMarker({
  status,
  kind,
  number,
  size = "md",
  celebrate,
}: {
  status: NodeStatus;
  kind: NodeKind;
  number: number;
  size?: "sm" | "md";
  /** Plays the small pop once, when a lesson has just been completed. */
  celebrate?: boolean;
}) {
  const dimension = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-[11px]";
  const icon = size === "sm" ? 12 : 14;
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "grid flex-none place-items-center rounded-full font-bold tabular-nums",
        dimension,
        celebrate && "gt-celebrate",
        status === "done" && "bg-[var(--gt-emerald-500)] text-[var(--gt-white)]",
        status === "current" && "bg-[var(--gt-ink-900)] text-[var(--gt-white)] ring-4 ring-[var(--gt-blue-200)]",
        status === "open" && "border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-muted)]",
        status === "locked" && "border border-dashed border-[var(--border-default)] text-[var(--text-subtle)]",
      )}
    >
      {status === "done" ? (
        <Check size={icon} strokeWidth={3} />
      ) : status === "locked" ? (
        <Lock size={icon - 2} strokeWidth={2.2} />
      ) : kind === "quiz" ? (
        <ListChecks size={icon} strokeWidth={2.2} />
      ) : (
        number
      )}
    </span>
  );
}

const MODULE_BADGE: Record<ModuleStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  completed: { tone: "success", icon: Check },
  inProgress: { tone: "brand", icon: PlayCircle },
  notStarted: { tone: "neutral", icon: CircleDashed },
  locked: { tone: "neutral", icon: Lock },
};

export function ModuleStatusBadge({ status, size = "sm" }: { status: ModuleStatus; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const { tone, icon } = MODULE_BADGE[status];
  return (
    <Badge tone={tone} size={size} icon={icon}>
      {t(`learning.status.${status}`)}
    </Badge>
  );
}

/**
 * A progress ring. The percentage is written inside it; the ring is the
 * illustration, the number is the information.
 */
export function ProgressRing({
  value,
  size = 88,
  stroke = 8,
  label,
  tone = "emerald",
  inverse,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  tone?: "emerald" | "brand";
  inverse?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="relative grid flex-none place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke={inverse ? "rgba(250,250,248,.16)" : "var(--surface-sunken)"}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={tone === "emerald" ? "var(--accent-cta)" : "var(--gt-blue-400)"}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset var(--duration-slow) var(--ease-out-soft)" }}
        />
      </svg>
      <span
        className={clsx(
          "absolute font-bold tabular-nums",
          size >= 80 ? "text-[length:var(--text-h4)]" : "text-[11px]",
          inverse ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]",
        )}
      >
        {pct}%
      </span>
    </div>
  );
}

/** Thin bar for module and lesson progress, labelled for assistive tech. */
export function ThinProgress({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={clsx("h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-sunken)]", className)}
    >
      <span
        className="block h-full rounded-[var(--radius-pill)] bg-[var(--accent-cta)] transition-[width] duration-[var(--duration-slow)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
