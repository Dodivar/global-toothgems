import { Camera, ShieldCheck, Star } from "lucide-react";
import { Badge } from "./Badge";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={14}
          fill={i < Math.round(rating) ? "var(--gt-ink-900)" : "none"}
          color={i < Math.round(rating) ? "var(--gt-ink-900)" : "var(--gt-ink-300)"}
        />
      ))}
    </span>
  );
}

export interface ReviewData {
  author: string;
  date: string;
  rating: number;
  locale?: string;
  title: string;
  body: string;
  verified?: boolean;
  photo?: string;
  photoLabel?: string;
}

export function ReviewBlock({ author, date, rating = 5, locale, title, body, verified = false, photo, photoLabel }: ReviewData) {
  return (
    <article className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)]">
      <div className="flex flex-wrap items-center gap-3">
        <Stars rating={rating} />
        <strong className="text-sm text-[var(--text-primary)]">{author}</strong>
        {verified && (
          <Badge tone="success" icon={ShieldCheck} size="sm">Achat vérifié</Badge>
        )}
        <span className="ml-auto text-xs text-[var(--text-muted)]">
          {date}
          {locale ? ` · ${locale}` : ""}
        </span>
      </div>
      {title && <h5 className="text-[15px] font-bold text-[var(--text-primary)]">{title}</h5>}
      <p className="m-0 text-sm leading-[var(--leading-normal)] text-[var(--text-body)]">{body}</p>
      {photo !== undefined && (
        photo ? (
          <img src={photo} alt="" className="h-24 w-24 rounded-[var(--radius-sm)] object-cover" />
        ) : (
          <div className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] text-[var(--text-subtle)]">
            <Camera size={16} />
            <span className="text-[9px] uppercase tracking-[var(--tracking-eyebrow)]">{photoLabel ?? "Photo client"}</span>
          </div>
        )
      )}
    </article>
  );
}
