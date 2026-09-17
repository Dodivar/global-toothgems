/**
 * Placeholder rows while the catalogue loads.
 *
 * Shaped like the table it replaces — thumbnail, two text lines, four cells —
 * so the layout does not jump when the real rows arrive. The live region
 * announces the wait, since a screen reader sees nothing in a skeleton.
 */
export function TableLoadingState({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div className="grid" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[56px_minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_88px] items-center gap-4 border-b border-[var(--border-subtle)] px-5 py-4 last:border-b-0"
        >
          <div className="gt-skeleton h-11 w-11 rounded-[var(--admin-radius-sm)]" />
          <div className="grid gap-2">
            <div className="gt-skeleton h-3 w-1/2 rounded-full" />
            <div className="gt-skeleton h-2.5 w-1/4 rounded-full" />
          </div>
          <div className="gt-skeleton h-2.5 w-2/3 rounded-full" />
          <div className="gt-skeleton h-2.5 w-1/2 rounded-full" />
          <div className="gt-skeleton h-2.5 w-2/3 rounded-full" />
          <div className="gt-skeleton h-5 w-20 rounded-full" />
          <div className="gt-skeleton h-2.5 w-10 justify-self-end rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Panel-sized placeholder for the dashboard cards. */
export function CardLoadingState({ label }: { label: string }) {
  return (
    <div className="gt-admin-panel grid gap-3 p-5" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="gt-skeleton h-2.5 w-24 rounded-full" />
      <div className="gt-skeleton h-7 w-16 rounded-full" />
    </div>
  );
}
