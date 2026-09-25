/**
 * The editor's feedback channel.
 *
 * The 3D engine and the design store are plain classes, outside React, yet
 * they are the ones that know "that spot is taken" or "the model loaded". They
 * report by translation key; the editor page connects this channel to the
 * site's own toasts, so the Studio speaks through the same component, in the
 * same language, as the rest of Global Toothgems.
 */

export type NoticeTone = "success" | "info" | "warning" | "error";

/** A key under `studio.editor.toasts`, with its interpolation values. */
export type NoticeHandler = (key: string, params?: Record<string, string | number>, tone?: NoticeTone) => void;

let handler: NoticeHandler | null = null;

export function setNoticeHandler(next: NoticeHandler | null) {
  handler = next;
}

export function notify(key: string, params?: Record<string, string | number>, tone: NoticeTone = "success") {
  handler?.(key, params, tone);
}
