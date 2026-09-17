import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Shown when a list has nothing in it. Always says why it is empty and what to
 * do next: "no result" with no way forward is where an administrator gets
 * stuck.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-3 px-6 py-[clamp(40px,7vw,72px)] text-center">
      <span
        aria-hidden="true"
        className="grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-muted)]"
      >
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <h3 className="text-[length:var(--text-h4)]">{title}</h3>
      <p className="m-0 max-w-[46ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{body}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
