import { useState } from "react";
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

const stateBadge: Record<string, { tone: BadgeTone; text: string } | null> = {
  available: null,
  enrolled: { tone: "brand", text: "Inscrit" },
  completed: { tone: "success", text: "Terminée" },
  draft: { tone: "neutral", text: "Bientôt" },
};

export function CourseCard({
  course,
  tone = "paper",
  onSelect,
}: {
  course: CourseCardData;
  tone?: "paper" | "ink";
  onSelect?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const { title, level, lessonCount, duration, price, image, imageLabel, progress, state = "available", locked = false } = course;
  const badge = stateBadge[state];
  const ink = tone === "ink";

  return (
    <article
      onMouseEnter={() => !locked && setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={locked ? undefined : onSelect}
      className={`overflow-hidden rounded-[var(--radius-card)] border transition-[transform,box-shadow] duration-[var(--duration-normal)] ${locked ? "cursor-default opacity-80" : "cursor-pointer"}`}
      style={{
        background: ink ? "var(--gt-ink-800)" : "var(--surface-card)",
        borderColor: ink ? "var(--gt-ink-700)" : "var(--border-subtle)",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-xs)",
        transform: hover ? "translateY(-3px)" : "none",
      }}
    >
      <div className="relative aspect-video bg-[var(--surface-sunken)]">
        {image ? (
          <img src={image} alt={title} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--surface-brand-wash)] text-[var(--gt-blue-500)]">
            <GraduationCap size={22} />
            <span className="text-[10px] font-medium uppercase tracking-[var(--tracking-eyebrow)]">{imageLabel ?? "Formation"}</span>
          </div>
        )}
        {badge && (
          <span className="absolute left-2 top-2">
            <Badge tone={badge.tone} size="sm">{badge.text}</Badge>
          </span>
        )}
        {locked && (
          <span className="gt-glass absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full">
            <Lock size={14} />
          </span>
        )}
      </div>
      <div className="grid gap-2 p-[var(--space-5)]">
        <span
          className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[var(--tracking-eyebrow)]"
          style={{ color: ink ? "var(--gt-ink-300)" : "var(--text-muted)" }}
        >
          <span>{level}</span>
          <span className="flex items-center gap-1"><ListVideo size={12} />{lessonCount} leçons</span>
          <span className="flex items-center gap-1"><Clock size={12} />{duration}</span>
        </span>
        <h4 className="text-[16px] font-bold" style={{ color: ink ? "var(--gt-off-white)" : "var(--text-primary)" }}>{title}</h4>
        {progress != null && <ProgressBar value={progress} size="sm" label="Progression" />}
        {price != null && (
          <strong className="text-[15px] font-bold" style={{ color: ink ? "var(--gt-off-white)" : "var(--text-primary)" }}>
            {formatPrice(price)}
          </strong>
        )}
      </div>
    </article>
  );
}
