import { useTranslation } from "react-i18next";

/**
 * The guided tour's pictures. The welcome and the celebration show real
 * designs of the Global Toothgems team ("Étoile halo", "Coeur"), rendered by
 * the editor's own engine — the stills of the Studio page. The three stage
 * gestures are small inline SVG pictograms, and the celebration's sparkles use
 * `.gt-editor-pulse`, which `index.css` already stops where less motion was
 * asked for.
 */

/** A still of one of the team's designs (`public/images/studio-page/`), 600 px and 1200 px wide, square. */
function TeamDesign({ name, position, aspect }: { name: string; position: string; aspect: string }) {
  const base = `/images/studio-page/creation-${name}`;
  return (
    <img
      src={`${base}-600.webp`}
      srcSet={`${base}-600.webp 600w, ${base}-1200.webp 1200w`}
      sizes="(min-width: 640px) 440px, 90vw"
      width={600}
      height={600}
      alt=""
      decoding="async"
      className="block w-full object-cover"
      style={{ aspectRatio: aspect, objectPosition: position }}
    />
  );
}

/** The welcome's hero: the team's "Étoile halo", as the editor renders it. */
export function TourHero() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-[var(--radius-md)] bg-[var(--gt-blue-50)]">
      <TeamDesign name="etoile-halo" position="50% 50%" aspect="320 / 132" />
    </div>
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
          className="grid justify-items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-1 py-1.5"
        >
          {art}
          <span className="text-center text-[9.5px] font-bold leading-[1.15] text-[var(--text-muted)]">
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
  className: "block h-6 w-10",
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

/** The end of the tour: the team's "Coeur", as the editor renders it, and a ribbon of sparkles. */
export function TourCelebration() {
  return (
    <div aria-hidden="true" className="relative overflow-hidden rounded-[var(--radius-md)] bg-[var(--gt-blue-50)]">
      <TeamDesign name="coeur" position="50% 19%" aspect="320 / 140" />
      <svg viewBox="0 0 320 140" className="absolute inset-0 h-full w-full">
        {[
          [34, 30],
          [62, 104],
          [262, 36],
          [290, 98],
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
    </div>
  );
}
