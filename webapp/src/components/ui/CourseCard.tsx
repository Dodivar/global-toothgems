import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Clock, GraduationCap, ListVideo, Lock } from "lucide-react";
import { Badge, type BadgeTone } from "./Badge";
import { ProgressBar } from "./ProgressBar";
import { formatPrice } from "../../lib/format";

export interface CourseCardData {
  id: string;
  title: string;
  level: string;
  lessonCount: number;
  duration: string;
  price?: number;
  image?: string;
  imageLabel?: string;
  progress?: number | null;
  state?: "available" | "enrolled" | "completed" | "draft";
  locked?: boolean;
}

const stateBadge: Record<string, { tone: BadgeTone; key: string } | null> = {
  available: null,
  enrolled: { tone: "brand", key: "course.stateEnrolled" },
  completed: { tone: "success", key: "course.stateCompleted" },
  draft: { tone: "neutral", key: "course.stateDraft" },
};

export function CourseCard({
  course,
  tone = "paper",
  to,
  onSelect,
}: {
  course: CourseCardData;
  tone?: "paper" | "ink";
  /** Destination of the card, for the catalogues that lead to a training page. */
  to?: string;
  /** Used where opening the course is an action rather than a navigation. */
  onSelect?: () => void;
}) {
  const { t } = useTranslation();
  const { title, level, lessonCount, duration, price, image, imageLabel, progress, state = "available", locked = false } = course;
  const badge = stateBadge[state];
  const ink = tone === "ink";

  return (
    <article
      className={`group relative overflow-hidden rounded-[var(--radius-card)] border shadow-[var(--shadow-xs)] transition-[transform,box-shadow] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] ${
        locked
          ? "opacity-80"
          : "hover:-translate-y-[3px] hover:shadow-[var(--shadow-md)] focus-within:-translate-y-[3px] focus-within:shadow-[var(--shadow-md)]"
      }`}
      style={{
        background: ink ? "var(--gt-ink-800)" : "var(--surface-card)",
        borderColor: ink ? "var(--gt-ink-700)" : "var(--border-subtle)",
      }}
    >
      <div className="relative aspect-video bg-[var(--surface-sunken)]">
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[var(--duration-normal)] group-hover:scale-[1.03] group-focus-within:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--surface-brand-wash)] text-[var(--gt-blue-500)]">
            <GraduationCap size={22} />
            <span className="text-[10px] font-medium uppercase tracking-[var(--tracking-eyebrow)]">
              {imageLabel ?? t("course.imagePlaceholder")}
            </span>
          </div>
        )}
        {badge && (
          <span className="absolute left-2 top-2">
            <Badge tone={badge.tone} size="sm">{t(badge.key)}</Badge>
          </span>
        )}
        {locked && (
          <span
            className="gt-glass absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full"
            title={t("course.lockedAria")}
          >
            <Lock size={14} aria-hidden="true" />
            <span className="sr-only">{t("course.lockedAria")}</span>
          </span>
        )}
      </div>
      <div className="grid gap-2 p-[var(--space-5)]">
        <span
          className="flex flex-wrap items-center gap-3 text-[11px] font-medium uppercase tracking-[var(--tracking-eyebrow)]"
          style={{ color: ink ? "var(--gt-ink-300)" : "var(--text-muted)" }}
        >
          <span>{level}</span>
          <span className="flex items-center gap-1">
            <ListVideo size={12} aria-hidden="true" />
            {t("course.lessonCount", { count: lessonCount })}
          </span>
          <span className="flex items-center gap-1"><Clock size={12} aria-hidden="true" />{duration}</span>
        </span>
        <h4 className="text-[16px] font-bold" style={{ color: ink ? "var(--gt-off-white)" : "var(--text-primary)" }}>
          {/* Stretched control: whole card clickable by mouse, one keyboard stop.
              A real link where the card leads to a page — the training pages are
              public, so they have to be openable in a new tab and crawlable —
              and a button where it triggers an action instead. */}
          {locked ? (
            title
          ) : to ? (
            <Link
              to={to}
              className="rounded-[var(--radius-xs)] after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
            >
              {title}
            </Link>
          ) : onSelect ? (
            <button
              type="button"
              onClick={onSelect}
              className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
            >
              {title}
            </button>
          ) : (
            title
          )}
        </h4>
        {progress != null && <ProgressBar value={progress} size="sm" label={t("course.progress")} />}
        {price != null && (
          <strong className="text-[15px] font-bold" style={{ color: ink ? "var(--gt-off-white)" : "var(--text-primary)" }}>
            {formatPrice(price)}
          </strong>
        )}
      </div>
    </article>
  );
}
