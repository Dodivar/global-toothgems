import { useTranslation } from "react-i18next";

/**
 * The guided tour's drawings: the welcome's stage, the three stage gestures,
 * and the little celebration at the end. All inline SVG in the Studio's own
 * stage colours — no image to load, and the two
 * slow sparkles use `.gt-editor-pulse`, which `index.css` already stops where
 * less motion was asked for.
 */

/** The smile the editor shows, as a flat drawing: the welcome's hero. */
export function TourHero() {
  const teeth = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
  return (
    <svg aria-hidden="true" viewBox="0 0 320 132" className="block w-full rounded-[var(--radius-md)]">
      <defs>
        <radialGradient id="gt-tour-stage" cx="50%" cy="34%" r="82%">
          <stop offset="0%" stopColor="var(--gt-blue-50)" />
          <stop offset="64%" stopColor="var(--gt-blue-200)" />
          <stop offset="100%" stopColor="var(--gt-blue-300)" />
        </radialGradient>
      </defs>
      <rect width="320" height="132" fill="url(#gt-tour-stage)" />
      <path d="M40 32 Q160 -4 280 32 L280 46 Q160 20 40 46Z" fill="#eeb2b6" opacity=".85" />
      {teeth.map((x) => (
        <rect
          key={x}
          x={160 + x * 34 - 15}
          y={36 + Math.abs(x) * 4}
          width="30"
          height={62 - Math.abs(x) * 5}
          rx="11"
          fill="#fbf8f1"
          stroke="rgba(120,98,70,.2)"
        />
      ))}
      {/* Three gems already placed, and a sparkle waiting for the next one. */}
      <circle cx="143" cy="62" r="6.5" fill="#ff9dc0" stroke="#fff" strokeWidth="2" />
      <circle cx="177" cy="62" r="6.5" fill="#eef6ff" stroke="#fff" strokeWidth="2" />
      <path d="M110 60l2.6 5.2 5.4.8-4 3.8 1 5.4-5-2.8-5 2.8 1-5.4-4-3.8 5.4-.8Z" fill="#f6c05a" stroke="#fff" strokeWidth="1.2" />
      <path
        d="M233 54l-2-6-2 6-6 2 6 2 2 6 2-6 6-2Z"
        fill="#fff"
        className="gt-editor-pulse"
      />
      <circle cx="68" cy="40" r="3" fill="#fff" opacity=".8" />
    </svg>
  );
}

/**
 * The three ways the camera moves on the stage, drawn rather than described.
 * Shown on the first step only, and only until the artist has actually moved
 * the view — the explanation steps aside once it is no longer needed.
 */
export function StageGestures() {
  const { t } = useTranslation();
  const items = [
    { id: "rotate", art: <RotateArt /> },
    { id: "zoom", art: <ZoomArt /> },
    { id: "frame", art: <FrameArt /> },
  ] as const;
  return (
    <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
      {items.map(({ id, art }) => (
        <li
          key={id}
          className="grid justify-items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-1.5 py-2"
        >
          {art}
          <span className="text-center text-[10.5px] font-bold leading-tight text-[var(--text-muted)]">
            {t(`studio.workspace.onboarding.gestures.${id}`)}
          </span>
        </li>
      ))}
    </ul>
  );
}

const artProps = {
  "aria-hidden": true as const,
  viewBox: "0 0 48 32",
  className: "block h-8 w-12",
};

/** Drag: a cursor sweeping an arc around the arch. */
function RotateArt() {
  return (
    <svg {...artProps}>
      <ellipse cx="24" cy="18" rx="11" ry="5" fill="none" stroke="var(--gt-blue-300)" strokeWidth="1.5" strokeDasharray="3 3" />
      <path d="M12 14 Q24 5 36 14" fill="none" stroke="var(--gt-blue-600)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M36 14l-1-4.4 4.2 1.6Z" fill="var(--gt-blue-600)" />
      <circle cx="24" cy="18" r="3.4" fill="var(--gt-fuchsia-300)" stroke="#fff" strokeWidth="1.4" />
    </svg>
  );
}

/** Wheel or pinch: two arrows closing on the gem. */
function ZoomArt() {
  return (
    <svg {...artProps}>
      <circle cx="24" cy="16" r="7" fill="none" stroke="var(--gt-blue-300)" strokeWidth="1.5" />
      <circle cx="24" cy="16" r="3" fill="var(--gt-blue-200)" />
      <path d="M8 16h7m-2.5-2.5L15 16l-2.5 2.5" fill="none" stroke="var(--gt-blue-600)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 16h-7m2.5-2.5L33 16l2.5 2.5" fill="none" stroke="var(--gt-blue-600)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The camera bar: a chosen view, straight back to a readable framing. */
function FrameArt() {
  return (
    <svg {...artProps}>
      <rect x="9" y="7" width="30" height="18" rx="4" fill="none" stroke="var(--gt-blue-300)" strokeWidth="1.5" />
      <path d="M14 12h4m-4 8h4" stroke="var(--gt-blue-600)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="28" cy="16" r="4" fill="var(--gt-emerald-300)" stroke="#fff" strokeWidth="1.4" />
    </svg>
  );
}

/** The end of the tour: the smile with its gems, and a ribbon of sparkles. */
export function TourCelebration() {
  return (
    <svg aria-hidden="true" viewBox="0 0 320 104" className="block w-full rounded-[var(--radius-md)]">
      <rect width="320" height="104" fill="url(#gt-tour-stage-done)" />
      <defs>
        <radialGradient id="gt-tour-stage-done" cx="50%" cy="30%" r="80%">
          <stop offset="0%" stopColor="var(--gt-emerald-50)" />
          <stop offset="70%" stopColor="var(--gt-blue-100)" />
          <stop offset="100%" stopColor="var(--gt-blue-200)" />
        </radialGradient>
      </defs>
      {[-2, -1, 0, 1, 2].map((x) => (
        <rect
          key={x}
          x={160 + x * 34 - 14}
          y={30 + Math.abs(x) * 4}
          width="28"
          height={52 - Math.abs(x) * 5}
          rx="10"
          fill="#fbf8f1"
          stroke="rgba(120,98,70,.2)"
        />
      ))}
      <circle cx="146" cy="52" r="6" fill="#ff9dc0" stroke="#fff" strokeWidth="2" />
      <circle cx="174" cy="52" r="6" fill="#eef6ff" stroke="#fff" strokeWidth="2" />
      <path d="M160 60l2.8 5.6 5.8.8-4.3 4 1 5.8-5.3-3-5.3 3 1-5.8-4.3-4 5.8-.8Z" fill="#f6c05a" stroke="#fff" strokeWidth="1.3" />
      {[
        [54, 28],
        [92, 56],
        [228, 34],
        [268, 62],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x} ${y}l-1.6-4.6-1.6 4.6-4.6 1.6 4.6 1.6 1.6 4.6 1.6-4.6 4.6-1.6Z`}
          fill="#fff"
          opacity=".9"
          className="gt-editor-pulse"
          style={{ animationDelay: `${i * 0.3}s` }}
        />
      ))}
    </svg>
  );
}
