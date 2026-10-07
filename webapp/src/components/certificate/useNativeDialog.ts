import { useEffect, useRef } from "react";

/**
 * Opens a native `<dialog>` as a modal for as long as the component holding it
 * is mounted, and reports every way out (Escape, the backdrop, a close button)
 * through one `close` listener.
 *
 * The platform gives the modal its focus trap, Escape, an inert page behind
 * and the top layer — which is also why the certificate's dialogs are native:
 * the share dialog opens from inside the viewer, and only a second top-layer
 * dialog can sit above a first one.
 *
 * Nothing closes the dialog on teardown: removing an open modal from the
 * document takes it out of the top layer on its own, without firing `close`.
 * Calling `close()` there instead would queue an event that lands after
 * StrictMode's second mount and shut the dialog the moment it opened.
 */
export function useNativeDialog(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => closeRef.current();
    dialog.addEventListener("close", handleClose);

    // The viewer unmounts in the same tick as it closes, which loses the
    // browser's own focus return: read the opener first and restore it.
    const opener = document.activeElement;
    if (!dialog.open) dialog.showModal();

    // The top layer does not stop the page behind it from scrolling.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      dialog.removeEventListener("close", handleClose);
      document.body.style.overflow = previous;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  const close = () => ref.current?.close();

  /** Props for the `<dialog>`: a click on the element itself is a click on the backdrop. */
  const dialogProps = {
    ref,
    onClick: (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === ref.current) ref.current?.close();
    },
  };

  return { ref, close, dialogProps };
}
