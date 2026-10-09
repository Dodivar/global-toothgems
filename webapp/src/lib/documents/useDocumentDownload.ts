import { useCallback, useEffect, useRef, useState } from "react";
import type { BusinessDocument } from "./template";

/**
 * Producing a PDF document from a click: the caller builds the document (it
 * may read what it needs first), the template renders it, the browser saves
 * it. The renderer and its font and logo data are imported on first use:
 * they are only needed once someone asks for a file, never on the server.
 */

export type DocumentDownloadStatus = "idle" | "working" | "error";

export function useDocumentDownload() {
  const [status, setStatus] = useState<DocumentDownloadStatus>("idle");
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Resolves true once the browser has the file. */
  const download = useCallback(async (build: () => Promise<{ document: BusinessDocument; fileName: string }>): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setStatus("working");
    try {
      const [{ renderDocument }, { saveFile }, built] = await Promise.all([import("./template"), import("../saveFile"), build()]);
      const bytes = renderDocument(built.document);
      saveFile(new Blob([bytes as BlobPart], { type: "application/pdf" }), built.fileName);
      if (mounted.current) setStatus("idle");
      return true;
    } catch (error) {
      console.warn("[documents] the PDF could not be produced", error);
      if (mounted.current) setStatus("error");
      return false;
    } finally {
      busy.current = false;
    }
  }, []);

  return { status, download };
}
