import { useCallback, useEffect, useRef, useState } from "react";
import type { CertificateContent } from "./layout";
import { certificateFileName } from "./share";

/**
 * Producing the certificate's files from a click: the A4 PDF, the PNG for a
 * post, and the PNG handed to the device's share sheet. Each action carries
 * its own state so the button that started it can show it (loading, done,
 * failed); "done" falls back to idle after a few seconds.
 *
 * The renderer is imported on first use: it is only needed once someone asks
 * for a file, and never on the server.
 */

export type ExportStatus = "idle" | "working" | "done" | "error";
export type ExportAction = "pdf" | "png" | "share";

const RESET_MS = 4000;

async function renderer() {
  return import("./render");
}

/** Whether this device can hand an image to its share sheet (phones, some desktops). */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    const probe = new File([new Uint8Array([0])], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export function useCertificateExport(content: CertificateContent) {
  const [status, setStatus] = useState<Record<ExportAction, ExportStatus>>({ pdf: "idle", png: "idle", share: "idle" });
  const timers = useRef<Partial<Record<ExportAction, ReturnType<typeof setTimeout>>>>({});
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  });
  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach((timer) => clearTimeout(timer));
  }, []);

  /** The PNG, rendered once per content: the share sheet needs it at once. */
  const png = useRef<{ key: string; blob: Promise<Blob> } | null>(null);
  const pngOf = useCallback((current: CertificateContent) => {
    // Keyed by value: the content object is rebuilt on every render.
    const key = JSON.stringify(current);
    if (png.current?.key !== key) {
      const blob = renderer().then((render) => render.certificatePng(current));
      blob.catch(() => {
        if (png.current?.blob === blob) png.current = null;
      });
      png.current = { key, blob };
    }
    return png.current.blob;
  }, []);

  /**
   * Renders the image ahead of a share. Safari only opens the share sheet
   * shortly after the tap, so the image has to be ready before it.
   */
  const prepare = useCallback(() => {
    void pngOf(contentRef.current).catch(() => undefined);
  }, [pngOf]);

  const set = useCallback((action: ExportAction, next: ExportStatus) => {
    clearTimeout(timers.current[action]);
    setStatus((prev) => ({ ...prev, [action]: next }));
    if (next === "done") timers.current[action] = setTimeout(() => setStatus((prev) => ({ ...prev, [action]: "idle" })), RESET_MS);
  }, []);

  /** Saves the file on the device. Resolves true once the browser has it. */
  const download = useCallback(
    async (format: "pdf" | "png"): Promise<boolean> => {
      const current = contentRef.current;
      set(format, "working");
      try {
        const render = await renderer();
        const blob = format === "pdf" ? await render.certificatePdf(current) : await pngOf(current);
        render.saveFile(blob, certificateFileName(current.courseTitle, current.reference, format));
        set(format, "done");
        return true;
      } catch {
        set(format, "error");
        return false;
      }
    },
    [set, pngOf],
  );

  /**
   * Opens the device's share sheet with the image and the caption. Resolves
   * "cancelled" when the member closes the sheet: that is not a failure.
   */
  const shareImage = useCallback(
    async (caption: string): Promise<"shared" | "cancelled" | "failed"> => {
      const current = contentRef.current;
      set("share", "working");
      try {
        const blob = await pngOf(current);
        const file = new File([blob], certificateFileName(current.courseTitle, current.reference, "png"), { type: "image/png" });
        await navigator.share({ files: [file], text: caption, title: current.courseTitle });
        set("share", "done");
        return "shared";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          set("share", "idle");
          return "cancelled";
        }
        set("share", "error");
        return "failed";
      }
    },
    [set, pngOf],
  );

  return { status, download, shareImage, prepare };
}
