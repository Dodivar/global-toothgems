import { StudioEngine } from "../engine";
import { DesignStore } from "../store";
import type { StudioScene } from "../../studioWorkspace/scene";
import { composeFrame, fontsReady, whiteMark, type MarkImage } from "./compose";
import { FORMAT_SIZES, scaledSize, type FormatSize, type ShareFormat } from "./formats";
import type { Layout } from "./layouts";
import { loopAngles, progressShare, SPOTLIGHT_VIDEO, sweepAngle, turntableAngle, TURNTABLE_GIF, TURNTABLE_VIDEO, type ImageType, type VideoType } from "./motion";

/**
 * Social exports, drawn in this tab: a still, a 360° video or a GIF of a
 * saved creation, at the network sizes. Nothing leaves the browser — the
 * dialog downloads the file or hands it to the system share sheet.
 *
 * The design is rendered on its own hidden stage (an `offscreen` engine with
 * its own store), so the editor's view, camera and history are untouched.
 */

export type ExportErrorCode = "webgl" | "model" | "video" | "interrupted" | "encode" | "cancelled";

export class ExportError extends Error {
  readonly code: ExportErrorCode;
  constructor(code: ExportErrorCode) {
    super(code);
    this.code = code;
    this.name = "ExportError";
  }
}

export interface ExportLook {
  /** The layout at the export's own size. */
  layoutAt: (format: ShareFormat, size: FormatSize) => Layout;
  texts: { title?: string; handle?: string };
  /** The corner mark, decoded, or null for none. */
  mark: MarkImage | null;
}

export interface ExportOptions {
  signal?: AbortSignal;
  onProgress?: (share: number) => void;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const yieldToPage = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new ExportError("cancelled");
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new ExportError("encode"))), type, quality));
}

/** A hidden stage holding one saved design, kept while the export dialog is open. */
export class ExportStage {
  private host: HTMLDivElement;
  private engine: StudioEngine;

  private constructor(host: HTMLDivElement, engine: StudioEngine) {
    this.host = host;
    this.engine = engine;
  }

  /** Builds the stage and waits for the design to be on its model. */
  static async open(scene: StudioScene): Promise<ExportStage> {
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    // In the document (some browsers only capture attached canvases), never on screen.
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:2px;height:2px;overflow:hidden;pointer-events:none;opacity:0";
    document.body.appendChild(host);
    const store = new DesignStore({ persist: false });
    let engine: StudioEngine;
    try {
      engine = new StudioEngine(host, store, { offscreen: true });
    } catch {
      host.remove();
      throw new ExportError("webgl");
    }
    const stage = new ExportStage(host, engine);
    store.loadScene(scene, null);
    try {
      await engine.whenReady();
      await fontsReady();
    } catch {
      stage.close();
      throw new ExportError("model");
    }
    return stage;
  }

  close() {
    this.engine.dispose();
    this.host.remove();
  }

  private target(size: FormatSize): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ExportError("encode");
    return { canvas, ctx };
  }

  /** One picture at `size`, the camera still (`azimuth` null) or turning. */
  private draw(ctx: CanvasRenderingContext2D, format: ShareFormat, size: FormatSize, look: ExportLook, azimuth: number | null) {
    const layout = look.layoutAt(format, size);
    const mark = look.mark && layout.markTone === "light" && look.mark.image === brandMarkImage ? brandMarkLight() : look.mark;
    const render = this.engine.renderExportFrame({
      width: Math.max(2, Math.round(layout.render.w)),
      height: Math.max(2, Math.round(layout.render.h)),
      azimuth,
      transparent: !layout.renderOnStage,
    });
    composeFrame(ctx, layout, size, { render, texts: look.texts, mark });
  }

  /** The still preview, drawn on a visible canvas of the dialog. */
  preview(canvas: HTMLCanvasElement, format: ShareFormat, look: ExportLook) {
    const size = { width: canvas.width, height: canvas.height };
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    this.draw(ctx, format, size, look, null);
  }

  async image(format: ShareFormat, type: ImageType, look: ExportLook): Promise<Blob> {
    const size = FORMAT_SIZES[format];
    const { canvas, ctx } = this.target(size);
    this.draw(ctx, format, size, look, null);
    return canvasBlob(canvas, type === "png" ? "image/png" : "image/jpeg", type === "jpeg" ? 0.93 : undefined);
  }

  /**
   * The design alone on its model, the still's framing (in front of the
   * smile, slightly above), no texts and no mark: the design picture sent to
   * the smile try-on's AI (decision 111). `framing` "overview": the same
   * stage seen from further away, the whole smile around the gems (the
   * try-on's second design picture, so the model sees the gems' real share).
   */
  stageStill(size: FormatSize, type: ImageType = "jpeg", framing: "design" | "overview" = "design"): Promise<Blob> {
    const { canvas, ctx } = this.target(size);
    const render = this.engine.renderExportFrame({ ...size, azimuth: null, transparent: false, framing });
    ctx.drawImage(render, 0, 0, size.width, size.height);
    return canvasBlob(canvas, type === "png" ? "image/png" : "image/jpeg", type === "jpeg" ? 0.92 : undefined);
  }

  /** One full turn of a social post, at the network size, in the member's layout. */
  video(format: ShareFormat, type: VideoType, look: ExportLook, options: ExportOptions = {}): Promise<Blob> {
    const size = FORMAT_SIZES[format];
    return this.record(size, type, TURNTABLE_VIDEO, turntableAngle, (ctx, azimuth) => this.draw(ctx, format, size, look, azimuth), options);
  }

  /**
   * A Glowbook's spotlight (decisions 103 and 105): the stage alone, square,
   * no texts and no mark — it plays on Global Toothgems' own page. The camera
   * stays in front of the smile and sweeps left → right → left, so the
   * looping video goes back and forth over the gems.
   */
  spotlight(type: VideoType, options: ExportOptions = {}): Promise<Blob> {
    const { size, fps, bitsPerSecond, durationMs, amplitude } = SPOTLIGHT_VIDEO;
    const frame = { width: size, height: size };
    return this.record(
      frame,
      type,
      { durationMs, fps, bitsPerSecond },
      (elapsed, duration) => sweepAngle(elapsed, duration, amplitude),
      (ctx, azimuth) => {
        const render = this.engine.renderExportFrame({ width: size, height: size, azimuth, transparent: false, orbit: "front" });
        ctx.drawImage(render, 0, 0, size, size);
      },
      options,
    );
  }

  /**
   * A camera move recorded from a canvas stream. The angle (`angleAt`)
   * follows the clock, so the move lasts `durationMs` whatever the device's
   * speed. Leaving the tab stops it (browsers stop drawing hidden pages).
   */
  private async record(
    size: FormatSize,
    type: VideoType,
    { durationMs, fps, bitsPerSecond }: { durationMs: number; fps: number; bitsPerSecond: number },
    angleAt: (elapsedMs: number, durationMs: number) => number,
    drawFrame: (ctx: CanvasRenderingContext2D, azimuth: number) => void,
    { signal, onProgress }: ExportOptions = {},
  ): Promise<Blob> {
    if (typeof MediaRecorder === "undefined") throw new ExportError("video");
    const { canvas, ctx } = this.target(size);
    this.host.appendChild(canvas);
    let recorder: MediaRecorder;
    try {
      drawFrame(ctx, angleAt(0, durationMs));
      const stream = canvas.captureStream(fps);
      recorder = new MediaRecorder(stream, { mimeType: type.mimeType, videoBitsPerSecond: bitsPerSecond });
    } catch (err) {
      canvas.remove();
      throw err instanceof ExportError ? err : new ExportError("video");
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    let hidden = false;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hidden = true;
    };
    document.addEventListener("visibilitychange", onVisibility);
    try {
      recorder.start(500);
      const started = performance.now();
      const frameMs = 1000 / fps;
      let last = -Infinity;
      for (;;) {
        await nextFrame();
        if (signal?.aborted) throw new ExportError("cancelled");
        if (hidden) throw new ExportError("interrupted");
        const elapsed = performance.now() - started;
        if (elapsed >= durationMs) break;
        if (elapsed - last < frameMs * 0.9) continue;
        last = elapsed;
        drawFrame(ctx, angleAt(elapsed, durationMs));
        onProgress?.(progressShare(elapsed, durationMs));
      }
      recorder.stop();
      await stopped;
    } catch (err) {
      if (recorder.state !== "inactive") recorder.stop();
      throw err instanceof ExportError ? err : new ExportError("video");
    } finally {
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.remove();
    }
    if (!chunks.length) throw new ExportError("encode");
    onProgress?.(1);
    return new Blob(chunks, { type: type.fileType });
  }

  /** One full turn as a looping GIF, at half size, frame by frame (cancellable between frames). */
  async gif(format: ShareFormat, look: ExportLook, { signal, onProgress }: ExportOptions = {}): Promise<Blob> {
    // The encoder only comes with the first GIF.
    const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
    const size = scaledSize(format, TURNTABLE_GIF.width);
    const { ctx } = this.target(size);
    const encoder = GIFEncoder();
    const angles = loopAngles(TURNTABLE_GIF.frames);
    for (let i = 0; i < angles.length; i++) {
      checkAbort(signal);
      this.draw(ctx, format, size, look, angles[i]);
      const { data } = ctx.getImageData(0, 0, size.width, size.height);
      const palette = quantize(data, TURNTABLE_GIF.maxColors);
      const index = applyPalette(data, palette);
      encoder.writeFrame(index, size.width, size.height, { palette, delay: TURNTABLE_GIF.delayMs, repeat: 0 });
      onProgress?.(progressShare(i + 1, angles.length));
      await yieldToPage();
    }
    checkAbort(signal);
    encoder.finish();
    return new Blob([encoder.bytes()], { type: "image/gif" });
  }
}

/* The brand wordmark, decoded once; and its white copy for dark layouts. */
let brandMarkImage: HTMLImageElement | null = null;
let brandMarkWhite: MarkImage | null = null;
let brandMarkLoading: Promise<MarkImage | null> | null = null;

function brandMarkLight(): MarkImage | null {
  if (!brandMarkImage) return null;
  brandMarkWhite ??= whiteMark({ image: brandMarkImage, width: brandMarkImage.naturalWidth, height: brandMarkImage.naturalHeight });
  return brandMarkWhite;
}

/** The Global Toothgems wordmark (the same file as the editor's export watermark). */
export function loadBrandMark(src: string): Promise<MarkImage | null> {
  brandMarkLoading ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      brandMarkImage = img;
      resolve({ image: img, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      brandMarkLoading = null;
      resolve(null);
    };
    img.src = src;
  });
  return brandMarkLoading;
}

/** A member's logo file, decoded for drawing (never tainting the canvas: it is a local Blob). */
export async function decodeLogo(blob: Blob): Promise<MarkImage | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    return { image: bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    return null;
  }
}
