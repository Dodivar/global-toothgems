import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { Localized } from "../../data/types";
import { pick } from "../../data/types";
import { useFormat } from "../../lib/format";
import { layoutCertificate, PAGE, type CertificateContent, type CertificateOp, type Paint } from "../../lib/certificate/layout";
import { ISSUER } from "../../lib/certificate/share";

/**
 * The certificate itself, drawn as a document rather than shown as a thumbnail.
 *
 * The page is an inline SVG built from `lib/certificate/layout.ts` — the same
 * operations the download draws on a canvas (`lib/certificate/render.ts`), so
 * the PDF a member keeps is exactly what the screen showed them. The SVG scales
 * with its box: one component serves the card thumbnail, the completion
 * screen, the full-size viewer and the course page's sample.
 *
 * Nothing on it is invented: the issuer is the Academy itself (decided by the
 * owner, 2026-10-07), with no hand-drawn signature, no accreditation body and
 * no verification registry.
 */

/**
 * What the document prints about the course: a member's course or the sales
 * page's published course, its level already in the page's language there.
 */
export interface CertificateCourse {
  title: Localized;
  level: Localized | string;
  lessonCount: number;
  duration: string;
}

export interface CertificateInput {
  course: CertificateCourse;
  holder: string;
  /** ISO date of completion. */
  awardedOn: string;
  reference: string;
  lang: string;
}

/** The document's text in the given language — shared by the screen and the exported file. */
export function certificateContent(
  { course, holder, awardedOn, reference, lang }: CertificateInput,
  t: TFunction,
  formatDate: (iso: string) => string,
): CertificateContent {
  const level = typeof course.level === "string" ? course.level : pick(course.level, lang);
  const details = [
    level,
    course.lessonCount > 0 ? t("course.lessonCount", { count: course.lessonCount }) : "",
    course.duration,
  ].filter(Boolean);
  return {
    brand: ISSUER,
    academy: "Academy",
    title: t("account.certificateDocEyebrow"),
    awardedTo: t("account.certificateDocAwardedTo"),
    holder,
    statement: t("account.certificateDocCompleted"),
    courseTitle: pick(course.title, lang),
    details: details.join("  ·  "),
    dateLabel: t("account.certificateDocDateLabel"),
    date: formatDate(awardedOn),
    referenceLabel: t("account.certificateDocRefLabel"),
    reference,
    seal: t("account.certificateDocSeal"),
    issuer: `${ISSUER} Academy`,
    issuerLabel: t("account.certificateDocIssuer"),
  };
}

/** `certificateContent` with the tree's translations and date format. */
export function useCertificateContent(input: CertificateInput): CertificateContent {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  return certificateContent(input, t, formatDate);
}

function SvgPaint({ id, paint }: { id: string; paint: Paint }) {
  if (typeof paint === "string") return null;
  const stops = paint.stops.map((stop) => <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />);
  return paint.kind === "linear" ? (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={paint.x1} y1={paint.y1} x2={paint.x2} y2={paint.y2}>
      {stops}
    </linearGradient>
  ) : (
    <radialGradient id={id} gradientUnits="userSpaceOnUse" cx={paint.cx} cy={paint.cy} r={paint.r}>
      {stops}
    </radialGradient>
  );
}

function SvgOp({ op, uid, index }: { op: CertificateOp; uid: string; index: number }) {
  if (op.kind === "text") {
    return (
      <text
        x={op.x}
        y={op.y}
        textAnchor={op.align}
        fill={op.color}
        fontSize={op.size}
        fontWeight={op.weight}
        fontStyle={op.italic ? "italic" : undefined}
        letterSpacing={op.tracking ? `${op.tracking}em` : undefined}
        fontFamily={op.mono ? "var(--gt-font-mono)" : "var(--gt-font-sans)"}
        textLength={op.fitWidth}
        lengthAdjust={op.fitWidth ? "spacingAndGlyphs" : undefined}
      >
        {op.text}
      </text>
    );
  }
  const ref = (paint: Paint | undefined, kind: string) =>
    paint === undefined ? "none" : typeof paint === "string" ? paint : `url(#${uid}-${index}-${kind})`;
  const common = {
    fill: ref(op.fill, "f"),
    stroke: ref(op.stroke, "s"),
    strokeWidth: op.stroke ? (op.lineWidth ?? 0.25) : undefined,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    opacity: op.opacity,
  };
  return (
    <>
      {op.fill && <SvgPaint id={`${uid}-${index}-f`} paint={op.fill} />}
      {op.stroke && <SvgPaint id={`${uid}-${index}-s`} paint={op.stroke} />}
      {op.kind === "rect" && <rect x={op.x} y={op.y} width={op.w} height={op.h} {...common} />}
      {op.kind === "circle" && <circle cx={op.cx} cy={op.cy} r={op.r} {...common} />}
      {op.kind === "path" && <path d={op.d} {...common} />}
    </>
  );
}

/** The document drawn from ready content (the completion screen builds it once for screen and file). */
export function CertificateSheet({ content, className }: { content: CertificateContent; className?: string }) {
  // Gradient ids must be unique per instance: a page can show several certificates.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    /* Decorative as far as assistive technology is concerned: every value shown
       here is repeated as real text around it, so reading the document too
       would say everything twice. */
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${PAGE.width} ${PAGE.height}`}
      className={className ?? "block h-auto w-full"}
      style={{ aspectRatio: `${PAGE.width} / ${PAGE.height}` }}
    >
      {layoutCertificate(content).map((op, i) => (
        <SvgOp key={i} op={op} uid={uid} index={i} />
      ))}
    </svg>
  );
}

export function CertificateDocument(props: CertificateInput & { className?: string }) {
  const content = useCertificateContent(props);
  return <CertificateSheet content={content} className={props.className} />;
}
