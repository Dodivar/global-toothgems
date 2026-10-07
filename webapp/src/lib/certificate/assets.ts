import wordmark from "../../assets/logo-wordmark-black.png";
import type { CertificateAsset } from "./layout";

/**
 * Where the document's brand images are served from: the same files as the
 * header's logo, so the certificate carries the real Global Toothgems mark.
 * Same origin, so the canvas that draws the downloadable file stays exportable.
 */
export const CERTIFICATE_ASSETS: Record<CertificateAsset, string> = {
  wordmark: wordmark.src,
};
