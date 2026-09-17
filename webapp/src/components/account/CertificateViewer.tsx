import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Download, X } from "lucide-react";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { CertificateDocument } from "./CertificateDocument";
import { certificateRef } from "./CertificateCard";
import type { Course } from "../../data/courses";
import { pick } from "../../data/types";
import type { CourseProgress } from "../../lib/progress";
import { formatDate } from "../../lib/format";

/**
 * Full-size view of one certificate.
 *
 * Built on the native `<dialog>` and `showModal()` rather than on a hand-rolled
 * overlay: the platform already gives the modal a focus trap, Escape, inert
 * background content, a `::backdrop` and focus restored to whatever opened it.
 * Re-implementing those by hand is where accessible dialogs usually go wrong.
 *
 * The component is mounted only while a certificate is selected, so the effect
 * below opens it once on mount and the browser handles the rest.
 */
export function CertificateViewer({
  course,
  progress,
  holder,
  lang,
  onClose,
  onDownload,
}: {
  course: Course;
  progress: CourseProgress;
  holder: string;
  lang: string;
  onClose: () => void;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  /** Kept in a ref so the effect below can stay dependency-free. */
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    /*
     * The `close` event is listened for here rather than through React's
     * `onClose` prop: `close` does not bubble and the prop never fires on this
     * element. Escape, the backdrop and the two close buttons all end in the
     * same place, so this one listener is the only exit.
     *
     * Nothing closes the dialog on teardown: removing an open modal from the
     * document takes it out of the top layer on its own, and it does so without
     * firing `close`. Calling `close()` here instead would queue an event that
     * lands after StrictMode's second mount has re-attached this listener, and
     * shut the viewer the moment it opened.
     */
    const handleClose = () => closeRef.current();
    dialog.addEventListener("close", handleClose);

    /*
     * The browser restores focus to the opener when a dialog closes, but the
     * viewer unmounts in the same tick, which loses it. Read the opener before
     * `showModal()` moves the keyboard into the dialog, and put it back on the
     * way out.
     */
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

  // The page only opens the viewer for completed courses.
  const awardedOn = progress.completedOn!;
  const reference = certificateRef(course.id, awardedOn);

  const rows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: t("account.certificateMetaCourse"), value: pick(course.title, lang) },
    { label: t("account.certificateMetaLevel"), value: pick(course.level, lang) },
    {
      label: t("account.certificateMetaLessons"),
      value: `${t("course.lessonCount", { count: progress.total })} · ${course.duration}`,
    },
    { label: t("account.certificateMetaDate"), value: formatDate(awardedOn) },
    { label: t("account.certificateMetaRef"), value: reference, mono: true },
  ];

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      /* A click landing on the dialog itself is a click on the backdrop: the
         content below fills the element completely. */
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      /* The browser already closes a modal dialog on Escape. Doing it here too
         costs one comparison and keeps the shortcut working if the dialog is
         ever opened non-modally; closing a closed dialog is a no-op. */
      onKeyDown={(e) => {
        if (e.key === "Escape") ref.current?.close();
      }}
      className="m-auto max-h-[calc(100dvh-24px)] w-[min(1120px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-[var(--radius-card)] border-0 bg-transparent p-0 backdrop:bg-[rgba(17,17,17,.62)] backdrop:backdrop-blur-[2px]"
    >
      <div className="gt-celebrate grid gap-[var(--space-5)] rounded-[var(--radius-card)] bg-[var(--surface-card)] p-[clamp(16px,3vw,32px)] text-[var(--text-body)] shadow-[var(--shadow-lg)]">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <span className="gt-eyebrow">{t("account.certificateUnlocked")}</span>
            <h2 id={titleId} className="text-[length:var(--text-h3)]">
              {pick(course.title, lang)}
            </h2>
          </div>
          <IconButton
            icon={X}
            label={t("common.close")}
            variant="outline"
            size="sm"
            onClick={() => ref.current?.close()}
          />
        </div>

        <div className="grid gap-[var(--space-5)] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start lg:gap-[var(--space-8)]">
          <div className="overflow-hidden rounded-[var(--radius-md)] bg-[var(--gt-white)] p-[2.5%] shadow-[var(--shadow-inset-hairline),var(--shadow-sm)]">
            <div className="overflow-hidden rounded-[2px] shadow-[0_0_0_1px_var(--gt-ink-200)]">
              <CertificateDocument
                course={course}
                holder={holder}
                awardedOn={awardedOn}
                reference={reference}
                lang={lang}
              />
            </div>
          </div>

          <div className="grid content-start gap-[var(--space-5)]">
            <dl className="m-0 grid gap-3">
              {rows.map((row) => (
                <div key={row.label} className="grid gap-0.5 border-b border-[var(--border-subtle)] pb-3 last:border-0">
                  <dt className="gt-eyebrow">{row.label}</dt>
                  <dd
                    className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-primary)]"
                    style={row.mono ? { fontFamily: "var(--gt-font-mono)" } : undefined}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap gap-2">
              <Button variant="dark" size="sm" iconLeft={Download} onClick={onDownload}>
                {t("account.certificateDownload")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => ref.current?.close()}>
                {t("common.close")}
              </Button>
            </div>

            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-subtle)]">
              {t("account.certificateViewerNote")}
            </p>
          </div>
        </div>
      </div>
    </dialog>
  );
}
