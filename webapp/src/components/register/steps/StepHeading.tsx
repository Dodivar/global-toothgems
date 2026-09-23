/**
 * Title of a step. Focusable (not tabbable) so the page can move focus here
 * when the step changes: a screen-reader user hears where they now are instead
 * of being left on a button that no longer exists.
 */
export function StepHeading({
  headingRef,
  title,
  body,
  aside,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  title: string;
  body?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <h2 ref={headingRef} tabIndex={-1} className="text-[length:var(--text-h3)] outline-none">
          {title}
        </h2>
        {aside}
      </div>
      {body && <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{body}</p>}
    </div>
  );
}
