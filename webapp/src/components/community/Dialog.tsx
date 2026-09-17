import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import clsx from "clsx";
import { IconButton } from "../ui/IconButton";

/**
 * The community's modal shell.
 *
 * Built on the native `<dialog>` and `showModal()`, for the same reasons the
 * certificate viewer is: the platform gives a focus trap, Escape, inert
 * background content, a `::backdrop` and restored focus, and hand-rolling those
 * is where accessible dialogs usually go wrong. The member area already proved
 * this pattern — this is that component's mechanics, generalised, because the
 * community needs two dialogs rather than one.
 *
 * The component is mounted only while open, so the effect opens it on mount.
 */
export function CommunityDialog({
  titleId,
  onClose,
  children,
  width = "560px",
  className,
}: {
  /** Id of the heading inside `children`; the dialog is labelled by it. */
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    /* `close` does not bubble and React's `onClose` prop never fires on this
       element, so the listener is attached directly. Escape, the backdrop and
       the close button all end here: one exit, one callback. */
    const handleClose = () => closeRef.current();
    dialog.addEventListener("close", handleClose);

    /* Focus is restored by the browser when a dialog closes, but this component
       unmounts in the same tick and loses it. Read the opener first, put the
       keyboard back on it on the way out. */
    const opener = document.activeElement;
    if (!dialog.open) dialog.showModal();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      dialog.removeEventListener("close", handleClose);
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      /* A click that lands on the dialog element itself landed on the backdrop:
         the panel below fills it completely. */
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className={clsx(
        "m-auto max-h-[calc(100dvh-24px)] overflow-y-auto overscroll-contain rounded-[var(--radius-card)] border-0 bg-transparent p-0",
        "backdrop:bg-[rgba(17,17,17,.58)] backdrop:backdrop-blur-[2px]",
        className,
      )}
      style={{ width: `min(${width}, calc(100vw - 24px))` }}
    >
      <div className="gt-celebrate relative grid gap-[var(--space-5)] rounded-[var(--radius-card)] bg-[var(--surface-card)] p-[clamp(18px,3vw,28px)] text-[var(--text-body)] shadow-[var(--shadow-lg)]">
        {/* Wrapped rather than positioned directly: `IconButton` declares
            `relative` itself, and in Tailwind the cascade decides between two
            position utilities, not the order they are written in. */}
        <span className="absolute right-3 top-3 z-[1]">
          <IconButton icon={X} label={t("common.close")} variant="ghost" size="sm" onClick={() => ref.current?.close()} />
        </span>
        {children}
      </div>
    </dialog>
  );
}
