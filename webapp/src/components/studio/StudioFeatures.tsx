import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { Check, Copy, Download, Eye, FolderHeart, Layers, Link2, PenTool, Send, Shuffle, Share2 } from "lucide-react";
import { SmileCanvas } from "./SmileCanvas";
import { GemIcon } from "./Gem";
import { pick } from "../../data/types";
import { COMPOSITIONS, SAVED_CREATIONS } from "../../data/studio";
import type { GemShape } from "../../data/products";

/**
 * The six capabilities of the Studio, each with its own small visual so the
 * grid reads as a product tour rather than as six identical tiles. Every
 * interaction here (the before/after slider, the copy link) is local UI state:
 * there is no saved composition and no share link behind it.
 */

export function StudioFeatureCard({
  icon: Icon,
  title,
  body,
  visual,
  className,
  horizontal,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  visual: ReactNode;
  className?: string;
  horizontal?: boolean;
}) {
  return (
    <article
      className={clsx(
        "group grid gap-5 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(16px,2vw,22px)] shadow-[var(--shadow-xs)] transition-[transform,box-shadow,border-color] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] hover:-translate-y-1 hover:border-[var(--gt-blue-200)] hover:shadow-[var(--shadow-lg)] focus-within:border-[var(--gt-blue-300)]",
        horizontal ? "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:items-center" : "content-start",
        className,
      )}
    >
      <div className={clsx("grid gap-2.5", horizontal ? "lg:order-1 lg:pl-3" : "order-2")}>
        <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]">
          <Icon size={17} />
        </span>
        <h3 className="text-[length:var(--text-h4)]">{title}</h3>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{body}</p>
      </div>
      <div className={clsx("min-w-0", horizontal ? "lg:order-2" : "order-1")}>{visual}</div>
    </article>
  );
}

/** A composition cropped onto its pieces, for thumbnails and small visuals. */
function Crop({ id, zoom = 1.2, className }: { id: keyof typeof COMPOSITIONS; zoom?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={clsx("gt-studio-stage overflow-hidden", className)}>
      <div className="absolute inset-0 grid place-items-center" style={{ transform: `scale(${zoom})`, transformOrigin: "50% 50%" }}>
        <SmileCanvas pieces={COMPOSITIONS[id]} className="block h-auto w-full" />
      </div>
    </div>
  );
}

const HOP_SHAPES: GemShape[] = ["round", "heart", "star", "drop", "navette", "flower"];

function BeforeAfter() {
  const { t } = useTranslation();
  const [split, setSplit] = useState(52);
  return (
    <div className="grid gap-2">
      <div className="relative aspect-[16/10] overflow-hidden rounded-[var(--radius-lg)]">
        <Crop id="statement" zoom={1} className="absolute inset-0" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          <div aria-hidden="true" className="gt-studio-stage absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 grid place-items-center" style={{ transform: "scale(1)" }}>
              <SmileCanvas pieces={[]} className="block h-auto w-full" />
            </div>
          </div>
        </div>
        <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_12px_rgba(0,0,0,.4)]" style={{ left: `${split}%` }}>
          <span className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[var(--gt-ink-900)] shadow-[var(--shadow-md)]">
            <Shuffle size={12} />
          </span>
        </span>
        <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-white">
          {t("studio.features.before")}
        </span>
        <span className="absolute right-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--gt-ink-900)]">
          {t("studio.features.after")}
        </span>
      </div>
      <input
        type="range"
        min={5}
        max={95}
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        aria-label={t("studio.features.compareLabel")}
        className="gt-studio-range w-full"
      />
    </div>
  );
}

function ShareSheet() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const exports: { icon: LucideIcon; key: string }[] = [
    { icon: Download, key: "exportImage" },
    { icon: Send, key: "exportArtist" },
    { icon: Share2, key: "exportSocial" },
  ];
  return (
    <div className="gt-glass grid grid-cols-[minmax(0,1fr)] gap-3 rounded-[var(--radius-lg)] bg-[var(--surface-brand-wash)] p-3.5">
      <span className="text-[11px] font-semibold text-[var(--text-muted)]">{t("studio.features.shareSheetTitle")}</span>
      <div className="flex min-w-0 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-white py-1 pl-3 pr-1">
        <Link2 size={13} aria-hidden="true" className="flex-none text-[var(--text-subtle)]" />
        <span className="min-w-0 flex-1 truncate font-[family-name:var(--gt-font-mono)] text-[11px] text-[var(--text-body)]">studio.globaltoothgems.com/c/aurora-7f2</span>
        <button
          type="button"
          onClick={() => setCopied(true)}
          aria-live="polite"
          className={clsx(
            "inline-flex h-7 flex-none items-center gap-1 rounded-full px-2.5 text-[10.5px] font-semibold transition-colors",
            copied ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]" : "bg-[var(--surface-inverse)] text-white hover:bg-[var(--gt-ink-700)]",
          )}
        >
          {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
          {copied ? t("studio.features.copied") : t("studio.features.copy")}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {exports.map(({ icon: Icon, key }) => (
          <span key={key} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-white px-2.5 py-1 text-[10.5px] font-semibold text-[var(--text-body)]">
            <Icon size={12} aria-hidden="true" />
            {t(`studio.features.${key}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StudioFeatures() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
      <StudioFeatureCard
        className="md:col-span-2"
        icon={Layers}
        title={t("studio.features.build.title")}
        body={t("studio.features.build.body")}
        visual={
          <div className="relative">
            <Crop id="signature" zoom={1.05} className="relative aspect-[16/8] rounded-[var(--radius-lg)]" />
            <span className="gt-studio-float absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 py-1 pl-1 pr-3 text-[11px] font-semibold text-white backdrop-blur-md">
              <span className="flex -space-x-1.5">
                <GemIcon shape="heart" material="gold" size={20} />
                <GemIcon shape="round" material="crystal" size={20} />
                <GemIcon shape="star" material="gold" size={20} />
              </span>
              {t("studio.features.build.chip")}
            </span>
          </div>
        }
      />
      <StudioFeatureCard
        icon={Shuffle}
        title={t("studio.features.experiment.title")}
        body={t("studio.features.experiment.body")}
        visual={
          <div className="grid aspect-[16/9] grid-cols-3 place-items-center gap-2 rounded-[var(--radius-lg)] bg-[var(--surface-brand-wash)] p-4 lg:aspect-auto lg:min-h-[200px]">
            {HOP_SHAPES.map((shape, i) => (
              <span
                key={shape}
                className="gt-studio-hop grid h-12 w-12 place-items-center rounded-[var(--radius-md)] bg-white shadow-[var(--shadow-sm)]"
                style={{ transitionDelay: `${i * 40}ms` }}
              >
                <GemIcon shape={shape} material={i % 3 === 1 ? "gold" : i % 3 === 2 ? "sapphire" : "crystal"} size={28} />
              </span>
            ))}
          </div>
        }
      />
      <StudioFeatureCard icon={Eye} title={t("studio.features.visualize.title")} body={t("studio.features.visualize.body")} visual={<BeforeAfter />} />
      <StudioFeatureCard
        icon={PenTool}
        title={t("studio.features.signature.title")}
        body={t("studio.features.signature.body")}
        visual={
          <div className="gt-studio-ph--blush relative grid aspect-[16/10] place-items-center overflow-hidden rounded-[var(--radius-lg)]">
            <span className="gt-script text-[clamp(34px,4vw,46px)] text-[var(--gt-fuchsia-600)]">{t("studio.features.signature.script")}</span>
            <span className="absolute bottom-3 right-3 flex gap-1">
              <GemIcon shape="flower" material="opal" size={24} />
              <GemIcon shape="round" material="rose" size={24} />
            </span>
          </div>
        }
      />
      <StudioFeatureCard icon={Share2} title={t("studio.features.share.title")} body={t("studio.features.share.body")} visual={<ShareSheet />} />
      <StudioFeatureCard
        className="md:col-span-2 lg:col-span-3"
        horizontal
        icon={FolderHeart}
        title={t("studio.features.save.title")}
        body={t("studio.features.save.body")}
        visual={
          <ul aria-label={t("studio.features.save.listLabel")} className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:gap-3">
            {SAVED_CREATIONS.map((c, i) => (
              <li key={c.id} className="grid min-w-0 gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--gt-off-white)] p-1.5 sm:p-2 transition-colors hover:border-[var(--gt-blue-300)]">
                <Crop id={c.id} zoom={1.2} className="relative aspect-[16/10] rounded-[var(--radius-md)]" />
                <div className="flex flex-wrap items-center justify-between gap-1 px-1 pb-0.5">
                  <span className="grid min-w-0">
                    <strong className="truncate text-[12.5px] text-[var(--text-primary)]">{c.name}</strong>
                    <span className="text-[11px] text-[var(--text-muted)]">{pick(c.edited, lang)}</span>
                  </span>
                  {i === 0 && (
                    <span className="rounded-full bg-[var(--gt-blue-100)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gt-blue-700)]">
                      {t("studio.features.save.latest")}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        }
      />
    </div>
  );
}
