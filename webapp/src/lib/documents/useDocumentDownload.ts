import { useCallback, useEffect, useRef, useState } from "react";
import type { BusinessDocument } from "./template";

/**
 * Producing a PDF document from a click: the caller builds the document (it
 * may read what it needs first) — or several, rendered into one file —, the
 * template renders it, the browser saves it (`download`) or opens its print
 * dialog (`print`). The renderer and its font and logo data are imported on
 * first use: they are only needed once someone asks for a file, never on the
 * server.
 */

export type DocumentDownloadStatus = "idle" | "working" | "error";

/** One document, or several printed or saved as one file. */
export type BuiltDocument = { document: BusinessDocument; fileName: string } | { documents: BusinessDocument[]; fileName: string };

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

  const run = useCallback(async (mode: "download" | "print", build: () => Promise<BuiltDocument>): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setStatus("working");
    try {
      const [{ renderDocuments }, files, built] = await Promise.all([import("./template"), import("../saveFile"), build()]);
      const docs = "documents" in built ? built.documents : [built.document];
      const blob = new Blob([renderDocuments(docs) as BlobPart], { type: "application/pdf" });
      if (mode === "print") files.printFile(blob);
      else files.saveFile(blob, built.fileName);
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

  /** Resolves true once the browser has the file. */
  const download = useCallback((build: () => Promise<BuiltDocument>) => run("download", build), [run]);
  /** Resolves true once the print dialog was asked for. */
  const print = useCallback((build: () => Promise<BuiltDocument>) => run("print", build), [run]);

  return { status, download, print };
}
