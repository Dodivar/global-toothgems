import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { CircleAlert, Clapperboard, Download, ImageUp, LoaderCircle, Lock, Share, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import watermark from "../../../assets/logo-wordmark-blue.png";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { ProgressBar } from "../../ui/ProgressBar";
import { usePrefersReducedMotion } from "../../homeAlt/usePrefersReducedMotion";
import { downloadFile } from "../tryOn/exportComposite";
import { fieldClass, focusRing } from "../workspace/workspaceStyles";
import { defaultMark, markChoices, resolveMark, type ShareMark } from "../../../lib/studio3d/socialExport/branding";
import type { MarkImage } from "../../../lib/studio3d/socialExport/compose";
import { ExportError, ExportStage, loadBrandMark, type ExportErrorCode, type ExportLook } from "../../../lib/studio3d/socialExport/exporter";
import { FORMAT_RATIOS, FORMAT_SIZES, SHARE_FORMATS, scaledSize, type ShareFormat } from "../../../lib/studio3d/socialExport/formats";
import { LAYOUT_TEMPLATE_IDS, layoutFor, type LayoutTemplateId } from "../../../lib/studio3d/socialExport/layouts";
import { exportFileName, pickVideoType, TURNTABLE_GIF, TURNTABLE_VIDEO, type ImageType, type ShareOutput } from "../../../lib/studio3d/socialExport/motion";
import { canShareFiles } from "../../../lib/studio3d/socialShare";
import type { Creation } from "../../../lib/studioWorkspace/types";
import { useShareBranding } from "./useShareBranding";

type StageState = { kind: "loading" } | { kind: "ready"; stage: ExportStage } | { kind: "failed"; code: ExportErrorCode };
type Job =
  | { kind: "idle" }
  | { kind: "running"; output: ShareOutput; progress: number }
  | { kind: "done"; output: ShareOutput; file: File; url: string }
  | { kind: "failed"; code: ExportErrorCode };

const PREVIEW_WIDTH = 540;
const TITLE_MAX = 60;
const HANDLE_MAX = 40;

/** A group of native radio buttons dressed as chips: arrow keys move between them. */
function ChoiceGroup<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  name: string;
  value: T;
  options: { value: T; label: string; sub?: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0" disabled={disabled}>
      <legend className="mb-2 p-0 text-[12.5px] font-bold text-[var(--text-primary)]">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className={clsx("relative", o.disabled && "opacity-45")}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
              className="peer absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
            <span
              className={clsx(
                "inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]",
                o.value === value
                  ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-white"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--gt-ink-700)] peer-hover:border-[var(--gt-blue-400)]",
              )}
            >
              {o.label}
              {o.sub && <span className={clsx("text-[11px] font-medium", o.value === value ? "text-white/70" : "text-[var(--text-subtle)]")}>{o.sub}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Note({ children, icon = <Lock size={13} aria-hidden="true" /> }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <p className="m-0 flex gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[12px] leading-snug text-[var(--text-muted)]">
      <span className="mt-0.5 flex-none text-[var(--gt-blue-600)]">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

function fileSize(bytes: number, locale: string): string {
  const mb = bytes / (1024 * 1024);
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: mb >= 10 ? 0 : 1 });
  return mb >= 1 ? `${n.format(mb)} MB` : `${n.format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/**
 * "Create a post": a saved creation as a social network post — an HD still,
 * a 360° video or a GIF, in Story, square or portrait — with the signature
 * the member's plan allows (decision 101). Rendered on a hidden stage of its
 * own; the file is downloaded or handed to the system share sheet, never
 * uploaded.
 */
export default function SocialExportDialog({ creation, onClose }: { creation: Creation; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const k = (key: string, opts?: Record<string, unknown>) => t(`studio.socialExport.${key}`, opts);
  const uid = useId();
  const reducedMotion = usePrefersReducedMotion();
  const branding = useShareBranding();
  const { rights } = branding;
  const videoType = useMemo(() => (typeof MediaRecorder === "undefined" ? null : pickVideoType((type) => MediaRecorder.isTypeSupported(type))), []);

  const [stage, setStage] = useState<StageState>({ kind: "loading" });
  const [brandMark, setBrandMark] = useState<MarkImage | null>(null);
  const [format, setFormat] = useState<ShareFormat>("story");
  const [output, setOutput] = useState<ShareOutput>("image");
  const [imageType, setImageType] = useState<ImageType>("png");
  const [chosenMark, setChosenMark] = useState<ShareMark | null>(null);
  const [templateId, setTemplateId] = useState<LayoutTemplateId>("plain");
  const [title, setTitle] = useState(creation.name.slice(0, TITLE_MAX));
  const [handle, setHandle] = useState("");
  const [job, setJob] = useState<Job>({ kind: "idle" });
  const [shareFailed, setShareFailed] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The hidden stage, for as long as the dialog is open.
  useEffect(() => {
    let active = true;
    let opened: ExportStage | null = null;
    ExportStage.open(creation.scene)
      .then((s) => {
        if (!active) return s.close();
        opened = s;
        setStage({ kind: "ready", stage: s });
      })
      .catch((err: unknown) => active && setStage({ kind: "failed", code: err instanceof ExportError ? err.code : "model" }));
    void loadBrandMark(watermark.src).then((m) => active && setBrandMark(m));
    return () => {
      active = false;
      abortRef.current?.abort();
      opened?.close();
    };
  }, [creation.scene]);

  // Free the last file's object URL when it is replaced or the dialog closes.
  const resultUrl = job.kind === "done" ? job.url : null;
  useEffect(() => () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [resultUrl]);

  const choices = markChoices(rights, !!branding.logo);
  const selectedMark: ShareMark = chosenMark && choices.includes(chosenMark) ? chosenMark : defaultMark(rights, !!branding.logo);
  const mark = resolveMark(rights, selectedMark, !!branding.logo);
  const effectiveTemplate: LayoutTemplateId = rights.mayUseTemplates ? templateId : "plain";
  const effectiveOutput: ShareOutput = output === "video" && !videoType ? "image" : output;

  const look = useMemo<ExportLook>(
    () => ({
      layoutAt: (f, size) => layoutFor(effectiveTemplate, rights.mayUseTemplates, f, size, { title, handle }),
      texts: { title, handle },
      mark: mark === "brand" ? brandMark : mark === "logo" ? branding.logo : null,
    }),
    [effectiveTemplate, rights.mayUseTemplates, title, handle, mark, brandMark, branding.logo],
  );

  // The still preview, redrawn when anything changes.
  const previewSize = scaledSize(format, PREVIEW_WIDTH);
  useEffect(() => {
    if (stage.kind !== "ready" || !previewRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (previewRef.current) stage.stage.preview(previewRef.current, format, look);
    });
    return () => cancelAnimationFrame(frame);
  }, [stage, format, look]);

  // A setting changed after an export: the shown file no longer matches.
  useEffect(() => {
    setJob((j) => (j.kind === "done" || j.kind === "failed" ? { kind: "idle" } : j));
    setShareFailed(false);
  }, [format, effectiveOutput, imageType, look]);

  const running = job.kind === "running";

  const create = async () => {
    if (stage.kind !== "ready" || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const out = effectiveOutput;
    setShareFailed(false);
    setJob({ kind: "running", output: out, progress: 0 });
    const onProgress = (progress: number) => setJob((j) => (j.kind === "running" ? { ...j, progress } : j));
    try {
      let blob: Blob;
      let ext: string;
      if (out === "image") {
        blob = await stage.stage.image(format, imageType, look);
        ext = imageType === "png" ? "png" : "jpg";
      } else if (out === "video" && videoType) {
        blob = await stage.stage.video(format, videoType, look, { signal: controller.signal, onProgress });
        ext = videoType.extension;
      } else {
        blob = await stage.stage.gif(format, look, { signal: controller.signal, onProgress });
        ext = "gif";
      }
      const file = new File([blob], exportFileName(creation.name, format, out, ext), { type: blob.type });
      setJob({ kind: "done", output: out, file, url: URL.createObjectURL(file) });
    } catch (err) {
      const code = err instanceof ExportError ? err.code : "encode";
      setJob(code === "cancelled" ? { kind: "idle" } : { kind: "failed", code });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const share = async (file: File) => {
    setShareFailed(false);
    try {
      await navigator.share({ files: [file], title: creation.name });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // closed by the member
      setShareFailed(true);
    }
  };

  const onLogoPicked = (file: File | undefined) => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (file) void branding.uploadLogo(file);
  };

  const markOptions = choices.map((value) => ({ value, label: k(`mark.${value}`) }));
  const shareable = job.kind === "done" && canShareFiles(job.file);

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      scrollBody
      title={k("title")}
      description={k("intro", { name: creation.name })}
      icon={<Clapperboard size={17} />}
      closeLabel={k("close")}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            {k("close")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="ml-auto"
            iconLeft={effectiveOutput === "image" ? ImageUp : Clapperboard}
            disabled={stage.kind !== "ready" || running || branding.loading}
            onClick={() => void create()}
          >
            {k(`create.${effectiveOutput}`)}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-start">
        <div className="grid justify-items-center gap-2 sm:sticky sm:top-0">
          <div
            className="relative w-full max-w-[min(100%,calc(46dvh*var(--ratio)))] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--gt-blue-100)]"
            style={{ aspectRatio: `${previewSize.width} / ${previewSize.height}`, ["--ratio" as string]: `${previewSize.width / previewSize.height}` }}
          >
            {job.kind === "done" && job.output === "video" && !reducedMotion ? (
              <video src={job.url} aria-label={k("result.videoLabel")} className="h-full w-full object-cover" autoPlay muted loop playsInline controls />
            ) : job.kind === "done" && job.output === "video" ? (
              <video src={job.url} aria-label={k("result.videoLabel")} className="h-full w-full object-cover" muted loop playsInline controls />
            ) : job.kind === "done" && job.output === "gif" && !reducedMotion ? (
              <img src={job.url} alt={k("result.gifLabel")} className="h-full w-full object-cover" />
            ) : (
              <canvas
                ref={previewRef}
                width={previewSize.width}
                height={previewSize.height}
                role="img"
                aria-label={k("previewLabel")}
                className={clsx("h-full w-full", stage.kind !== "ready" && "invisible")}
              />
            )}
            {stage.kind === "loading" && (
              <p role="status" className="absolute inset-0 m-0 grid place-items-center gap-2 p-4 text-center text-[12.5px] font-semibold text-[var(--gt-ink-700)]">
                <span className="grid justify-items-center gap-2">
                  <LoaderCircle size={20} aria-hidden="true" className="motion-safe:animate-spin" />
                  {k("preparing")}
                </span>
              </p>
            )}
            {stage.kind === "failed" && (
              <p role="alert" className="absolute inset-0 m-0 grid place-items-center p-4 text-center text-[12.5px] font-semibold text-[var(--status-error-fg)]">
                {k(`errors.${stage.code}`)}
              </p>
            )}
          </div>
          {job.kind === "done" && job.output === "gif" && reducedMotion && <p className="m-0 text-center text-[11.5px] text-[var(--text-muted)]">{k("result.reducedMotion")}</p>}
        </div>

        <div className="grid min-w-0 gap-4">
          <ChoiceGroup
            label={k("format.label")}
            name={`${uid}-format`}
            value={format}
            disabled={running}
            onChange={setFormat}
            options={SHARE_FORMATS.map((f) => ({ value: f, label: k(`format.${f}`), sub: FORMAT_RATIOS[f] }))}
          />

          <div className="grid gap-1.5">
            <ChoiceGroup
              label={k("output.label")}
              name={`${uid}-output`}
              value={effectiveOutput}
              disabled={running}
              onChange={setOutput}
              options={[
                { value: "image", label: k("output.image") },
                { value: "video", label: k("output.video"), disabled: !videoType },
                { value: "gif", label: k("output.gif") },
              ]}
            />
            {!videoType && <p className="m-0 text-[11.5px] text-[var(--text-muted)]">{k("output.videoUnsupported")}</p>}
            {effectiveOutput === "video" && videoType && (
              <p className="m-0 text-[11.5px] text-[var(--text-muted)]">
                {k("output.videoHint", { seconds: TURNTABLE_VIDEO.durationMs / 1000, type: videoType.extension.toUpperCase() })}
              </p>
            )}
            {effectiveOutput === "gif" && <p className="m-0 text-[11.5px] text-[var(--text-muted)]">{k("output.gifHint", { width: TURNTABLE_GIF.width })}</p>}
          </div>

          {effectiveOutput === "image" && (
            <ChoiceGroup
              label={k("imageType.label")}
              name={`${uid}-type`}
              value={imageType}
              disabled={running}
              onChange={setImageType}
              options={[
                { value: "png", label: k("imageType.png") },
                { value: "jpeg", label: k("imageType.jpeg") },
              ]}
            />
          )}

          <div className="grid gap-2">
            {branding.loading ? (
              <p role="status" className="m-0 flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
                <LoaderCircle size={14} aria-hidden="true" className="motion-safe:animate-spin" />
                {k("mark.label")}
              </p>
            ) : (
              <ChoiceGroup label={k("mark.label")} name={`${uid}-mark`} value={selectedMark} disabled={running} onChange={setChosenMark} options={markOptions} />
            )}
            {branding.unavailable ? (
              <Note icon={<CircleAlert size={13} aria-hidden="true" />}>{k("mark.brandingUnavailable")}</Note>
            ) : (
              !branding.loading && !rights.mayRemoveWatermark && <Note>{k("mark.essentialNote")}</Note>
            )}
          </div>

          {rights.mayUseLogo && (
            <div className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
              <span className="text-[12.5px] font-bold text-[var(--text-primary)]">{k("logo.label")}</span>
              <div className="flex flex-wrap items-center gap-3">
                {branding.logoUrl ? (
                  <img
                    src={branding.logoUrl}
                    alt={k("logo.alt")}
                    className="h-12 max-w-[160px] rounded-[var(--radius-sm)] bg-[repeating-conic-gradient(var(--gt-ink-100)_0_25%,white_0_50%)] bg-[length:12px_12px] object-contain p-1"
                  />
                ) : (
                  <p className="m-0 text-[12px] text-[var(--text-muted)]">{k("logo.none")}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    id={`${uid}-logo`}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    aria-describedby={`${uid}-logo-hint`}
                    disabled={branding.savingLogo || running}
                    onChange={(e) => onLogoPicked(e.target.files?.[0])}
                  />
                  <label
                    htmlFor={`${uid}-logo`}
                    className={clsx(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-brand-wash)]",
                      "[input:focus-visible+&]:outline [input:focus-visible+&]:outline-2 [input:focus-visible+&]:outline-offset-2 [input:focus-visible+&]:outline-[var(--focus-ring)]",
                      (branding.savingLogo || running) && "pointer-events-none opacity-50",
                    )}
                  >
                    {branding.savingLogo ? <LoaderCircle size={13} aria-hidden="true" className="motion-safe:animate-spin" /> : <ImageUp size={13} aria-hidden="true" />}
                    {branding.logoUrl ? k("logo.replace") : k("logo.upload")}
                  </label>
                  {branding.logoUrl && (
                    <Button variant="ghost" size="sm" iconLeft={Trash2} disabled={branding.savingLogo || running} onClick={() => void branding.deleteLogo()}>
                      {k("logo.remove")}
                    </Button>
                  )}
                </div>
              </div>
              <p id={`${uid}-logo-hint`} className="m-0 text-[11.5px] text-[var(--text-subtle)]">
                {branding.savingLogo ? k("logo.saving") : k("logo.hint")}
              </p>
              {branding.logoError && (
                <p role="alert" className="m-0 text-[12px] text-[var(--status-error-fg)]">
                  {k(`logo.errors.${branding.logoError}`)}
                </p>
              )}
            </div>
          )}
          {!rights.mayUseLogo && branding.branding?.hasLogo && <Note>{k("logo.kept")}</Note>}

          {rights.mayUseTemplates ? (
            <div className="grid gap-3">
              <ChoiceGroup
                label={k("template.label")}
                name={`${uid}-template`}
                value={effectiveTemplate}
                disabled={running}
                onChange={setTemplateId}
                options={LAYOUT_TEMPLATE_IDS.map((id) => ({ value: id, label: k(`template.${id}`) }))}
              />
              {effectiveTemplate !== "plain" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-[12px] font-bold text-[var(--text-primary)]">
                    {k("template.titleLabel")}
                    <input className={fieldClass} value={title} maxLength={TITLE_MAX} disabled={running} onChange={(e) => setTitle(e.target.value)} />
                  </label>
                  <label className="grid gap-1.5 text-[12px] font-bold text-[var(--text-primary)]">
                    {k("template.handleLabel")}
                    <input
                      className={fieldClass}
                      value={handle}
                      maxLength={HANDLE_MAX}
                      placeholder={k("template.handlePlaceholder")}
                      autoComplete="off"
                      disabled={running}
                      onChange={(e) => setHandle(e.target.value)}
                    />
                  </label>
                </div>
              )}
            </div>
          ) : (
            !branding.loading && <Note>{k("template.locked")}</Note>
          )}

          {job.kind === "running" && (
            <div role="status" className="grid gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3">
              <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">{k(`progress.${job.output}`)}</span>
              {job.output !== "image" && <ProgressBar value={Math.round(job.progress * 100)} tone="brand" size="sm" label={k(`progress.${job.output}`)} />}
              {job.output !== "image" && (
                <Button variant="outline" size="sm" className="justify-self-start" onClick={() => abortRef.current?.abort()}>
                  {k("progress.cancel")}
                </Button>
              )}
            </div>
          )}

          {job.kind === "failed" && (
            <p role="alert" className="m-0 flex gap-2 text-[12.5px] text-[var(--status-error-fg)]">
              <CircleAlert size={15} aria-hidden="true" className="mt-0.5 flex-none" />
              {k(`errors.${job.code}`)}
            </p>
          )}

          {job.kind === "done" && (
            <div role="status" className="grid gap-2.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-brand-wash)] p-3">
              <p className="m-0 break-all text-[12.5px] font-semibold text-[var(--text-primary)]">
                {k("result.ready", { file: job.file.name, size: fileSize(job.file.size, i18n.language) })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" iconLeft={Download} onClick={() => downloadFile(job.file)}>
                  {k("result.download")}
                </Button>
                {shareable && (
                  <Button variant="outline" size="sm" iconLeft={Share} onClick={() => void share(job.file)}>
                    {k("result.share")}
                  </Button>
                )}
              </div>
              {shareable && <p className="m-0 text-[11.5px] text-[var(--text-muted)]">{k("result.shareHint")}</p>}
              {shareFailed && (
                <p role="alert" className="m-0 text-[12px] text-[var(--status-error-fg)]">
                  {k("errors.share")}
                </p>
              )}
            </div>
          )}
          <span className={clsx("sr-only", focusRing)} aria-hidden="true" data-format={FORMAT_SIZES[format].width} />
        </div>
      </div>
    </Dialog>
  );
}
