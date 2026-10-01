import { useMemo } from "react";
import clsx from "clsx";
import type { ContentBlock, ImageBlock, VideoBlock } from "../../data/adminTraining";
import type { ContentLang } from "../../lib/localized";
import { sanitizeHtml } from "../../lib/learning/sanitizeHtml";
import { useCourseMediaUrl } from "../../lib/progress";
import { VideoPlayer } from "./VideoPlayer";

/**
 * How authored content reads, for the learner and in the administrator's
 * preview alike (`components/admin/training/ContentBlocks.tsx` delegates here),
 * so the two are the same rendering rather than two lookalikes.
 *
 * Blocks render in the order the administrator put them, whatever the mix:
 * text, image, text, video, image… Text keeps a reading measure (~68
 * characters); images and video take the wider column so they read as part of
 * the lesson rather than as attachments.
 *
 * Image and video fields are media references, resolved to URLs by the
 * member's signed URLs or the back office's media library (`useCourseMediaUrl`).
 */

export function LessonBlocks({ blocks, lang }: { blocks: ContentBlock[]; lang: ContentLang }) {
  return (
    <div className="grid gap-[clamp(24px,3vw,36px)]">
      {blocks.map((block) => (
        <LessonBlock key={block.id} block={block} lang={lang} />
      ))}
    </div>
  );
}

export function LessonBlock({ block, lang }: { block: ContentBlock; lang: ContentLang }) {
  if (block.type === "text") return <RichText html={block.html[lang]} />;
  if (block.type === "image") return <LessonImage block={block} lang={lang} />;
  return <LessonVideo block={block} lang={lang} />;
}

/** Authored HTML, sanitised on the way in (see `sanitizeHtml`). */
export function RichText({ html, className }: { html: string; className?: string }) {
  const safe = useMemo(() => sanitizeHtml(html), [html]);
  return <div className={clsx("gt-rich-text gt-learn-prose", className)} dangerouslySetInnerHTML={{ __html: safe }} />;
}

function LessonImage({ block, lang }: { block: ImageBlock; lang: ContentLang }) {
  const urlOf = useCourseMediaUrl();
  const src = urlOf(block.src);
  const caption = block.caption[lang];
  const layout =
    block.align === "full"
      ? "w-full"
      : block.align === "center"
        ? "mx-auto w-full max-w-[560px]"
        : "w-full max-w-[420px]";
  return (
    <figure className={clsx("m-0 grid gap-2.5", layout)}>
      <img
        src={src || undefined}
        // An image the author left without a description is treated as
        // decorative rather than read out as a file name.
        alt={block.alt[lang] ?? ""}
        loading="lazy"
        decoding="async"
        className={clsx(
          "w-full rounded-[var(--radius-media)] bg-[var(--surface-sunken)] object-cover shadow-[var(--shadow-sm)]",
          block.align === "full" ? "aspect-[16/9]" : "aspect-[4/3]",
        )}
      />
      {caption && (
        <figcaption className="flex gap-2 text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
          <span aria-hidden="true" className="mt-[7px] h-px w-4 flex-none bg-[var(--gt-blue-400)]" />
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function LessonVideo({ block, lang }: { block: VideoBlock; lang: ContentLang }) {
  const urlOf = useCourseMediaUrl();
  const caption = block.caption[lang];
  return (
    <figure className="m-0 grid gap-2.5">
      <VideoPlayer source={urlOf(block.source)} poster={urlOf(block.poster)} title={block.title[lang]} duration={block.duration} />
      {(block.title[lang] || caption) && (
        <figcaption className="grid gap-0.5">
          {block.title[lang] && (
            <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
              {block.title[lang]} <span className="font-medium tabular-nums text-[var(--text-subtle)]">· {block.duration}</span>
            </strong>
          )}
          {caption && <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{caption}</span>}
        </figcaption>
      )}
    </figure>
  );
}
