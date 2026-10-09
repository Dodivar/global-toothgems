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
