/**
 * Sharing a Studio render. The file goes through the system share sheet where
 * the browser offers one (the member picks the app: Instagram, WhatsApp,
 * Photos…); elsewhere it is downloaded. The Studio opens no network page and
 * keeps no list of networks (owner's choice 2026-11-06, decision 101).
 */

/** Can this browser hand a file to the system share sheet? */
export function canShareFiles(file: File): boolean {
  return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

/**
 * Whether the share sheet would take a file of this type, asked before the
 * file exists (with an empty probe), so a menu can show its entry at once
 * instead of inserting it once the file is rendered.
 */
export function canShareFileType(type: string, name = "probe.png"): boolean {
  if (typeof File === "undefined") return false;
  return canShareFiles(new File([], name, { type }));
}
