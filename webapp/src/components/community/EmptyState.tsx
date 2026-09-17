import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import { TONE_SOFT } from "./channelStyle";
import type { AvatarTone } from "../../data/community";

/**
 * An empty state that says something.
 *
 * Every one of these in the community names what is missing and offers the one
 * action that fills it — an empty saved list is an invitation to keep a thread,
 * not an error. The dashed panel is the member area's `EmptyPanel` idea, given
 * the room it needs to carry a sentence and a button.
 */
export function EmptyState({
  icon: Icon,
  tone = "blue",
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  tone?: AvatarTone;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-4 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] px-[var(--space-6)] py-[clamp(32px,6vw,56px)] text-center">
      <span aria-hidden="true" className={clsx("grid h-12 w-12 place-items-center rounded-full", TONE_SOFT[tone])}>
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <div className="grid gap-1.5">
        <strong className="text-[length:var(--text-h4)] text-[var(--text-primary)]">{title}</strong>
        <p className="m-0 mx-auto max-w-[46ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{body}</p>
      </div>
      {action}
    </div>
  );
}
