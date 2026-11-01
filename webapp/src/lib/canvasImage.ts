/*
 * Browser helpers shared by the documents drawn on a canvas (certificate,
 * Glowbook poster, Studio estimate sheet).
 */

/** An image loaded and ready to draw; rejects when it cannot be read. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image unavailable"));
    image.src = src;
  });
}

/** The canvas encoded as `type`; rejects when the browser cannot encode it. */
export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("export failed"))), type, quality);
  });
}
