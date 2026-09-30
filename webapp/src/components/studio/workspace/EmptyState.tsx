import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * An empty library, or a search with no match: a small visual, one sentence
 * of why, and the next step. The illustration is a dashed jaw waiting for its
 * first gems, drawn in the Studio's pastel blue.
 */
export function EmptyState({
  title,
  body,
  actions,
  compact = false,
  art = "arch",
}: {
  title: string;
  body: string;
  actions?: ReactNode;
  compact?: boolean;
  art?: "arch" | "group" | "search";
}) {
  return (
    <div
      className={clsx(
        "mx-auto grid max-w-[520px] justify-items-center gap-3 text-center",
        compact ? "py-8" : "rounded-[var(--radius-xl)] border border-dashed border-[var(--gt-blue-300)] bg-[var(--surface-card)] px-6 py-12 sm:px-10",
      )}
    >
      <EmptyArt kind={art} small={compact} />
      <h2 className={clsx("m-0 font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]", compact ? "text-[17px]" : "text-[length:var(--text-h3)]")}>
        {title}
      </h2>
      <p className="m-0 max-w-[44ch] text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-muted)]">{body}</p>
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2.5">{actions}</div>}
    </div>
  );
}

function EmptyArt({ kind, small }: { kind: "arch" | "group" | "search"; small: boolean }) {
  const size = small ? 96 : 150;
  return (
    <svg aria-hidden="true" width={size} height={size * 0.62} viewBox="0 0 150 94" className="mb-1 overflow-visible">
      <defs>
        <radialGradient id="gt-empty-glow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="var(--gt-blue-100)" />
          <stop offset="100%" stopColor="var(--gt-blue-100)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="75" cy="50" rx="74" ry="44" fill="url(#gt-empty-glow)" />
      {kind === "search" ? (
        <g fill="none" stroke="var(--gt-blue-500)" strokeWidth="3" strokeLinecap="round">
          <circle cx="68" cy="42" r="20" />
          <path d="M83 57 98 72" />
        </g>
      ) : (
        <g>
          {/* A row of front teeth, the canines slightly pointed. */}
          {[-3, -2, -1, 0, 1, 2].map((i) => {
            const x = 75 + i * 17 + 1;
            const drop = Math.abs(i + 0.5) * 3.2;
            return (
              <rect
                key={i}
                x={x}
                y={24 + drop}
                width="15"
                height={36 - drop * 0.6}
                rx="6"
                fill="#fbf8f1"
                stroke="var(--gt-blue-300)"
                strokeWidth="1.4"
              />
            );
          })}
          {kind === "group" ? (
            <g fill="none" stroke="var(--gt-fuchsia-400)" strokeWidth="1.6" strokeDasharray="3 2.5">
              <circle cx="67" cy="40" r="4" />
              <circle cx="84" cy="40" r="4" />
              <circle cx="70" cy="51" r="3" />
              <circle cx="81" cy="51" r="3" />
              <rect x="58" y="31" width="35" height="27" rx="7" stroke="var(--gt-blue-500)" />
            </g>
          ) : (
            <g fill="none" strokeWidth="1.6" strokeDasharray="3 2.5">
              <circle cx="67" cy="42" r="4.5" stroke="var(--gt-blue-500)" />
              <circle cx="84" cy="42" r="4.5" stroke="var(--gt-blue-500)" />
              <path d="M101 45.5 104 41l3 4.5-3 4.5Z" stroke="var(--gt-fuchsia-400)" />
            </g>
          )}
          <path d="M112 16 114 11l2 5 5 2-5 2-2 5-2-5-5-2Z" fill="var(--gt-blue-400)" className="gt-editor-pulse" />
        </g>
      )}
    </svg>
  );
}
