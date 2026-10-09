/** Hands a file to the browser's download. Browser only: from click handlers, never during render. */
export function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked later: some browsers start reading the blob after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Opens the browser's print dialog on a PDF, from a hidden frame so no pop-up
 * is needed. Where the frame cannot print (some mobile browsers), the PDF
 * opens in a new tab instead, where the reader's own print button does it.
 */
export function printFile(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0";
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
  };
  frame.src = url;
  document.body.appendChild(frame);
  // The dialog blocks while open in most browsers; the frame and the blob are dropped well after.
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 120_000);
}
