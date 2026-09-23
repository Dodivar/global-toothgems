import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  NOW_TIME,
  PROMO_NOW,
  promotionStatus,
  toTime,
  type Promotion,
  type PromotionStatus,
} from "../../data/adminPromotions";
import { usePromoDates } from "./PromoBadges";

const DAY = 86_400_000;

/**
 * "When does this run?" as a picture.
 *
 * A single horizontal track from a little before the start to a little after
 * the end, with today marked. Every mark is also written out below the track —
 * the bar is for the glance, the sentence is the information.
 */
export function ScheduleTimeline({
  startsAt,
  endsAt,
  invalid,
}: {
  startsAt: string;
  endsAt: string | null;
  invalid?: boolean;
}) {
  const { t } = useTranslation();
  const { dateTime, dayMonth } = usePromoDates();

  const start = startsAt ? toTime(startsAt) : NOW_TIME;
  const rawEnd = endsAt ? toTime(endsAt) : null;
  const end = rawEnd && rawEnd > start ? rawEnd : start + 30 * DAY;
  const span = end - start;
  const pad = Math.max(span * 0.18, 2 * DAY);
  const min = Math.min(start, NOW_TIME) - pad;
  const max = Math.max(end, NOW_TIME) + pad;
  const pos = (time: number) => ((time - min) / (max - min)) * 100;

  const durationDays = rawEnd && rawEnd > start ? Math.max(1, Math.round((rawEnd - start) / DAY)) : null;
  const untilStart = Math.ceil((start - NOW_TIME) / DAY);
  const untilEnd = rawEnd ? Math.ceil((rawEnd - NOW_TIME) / DAY) : null;

  let sentence: string;
  if (invalid) sentence = t("promo.timeline.invalid");
  else if (start > NOW_TIME) sentence = t("promo.timeline.startsIn", { count: untilStart });
  else if (untilEnd != null && untilEnd < 0) sentence = t("promo.timeline.ended", { count: Math.abs(untilEnd) });
  else if (untilEnd != null) sentence = t("promo.timeline.endsIn", { count: untilEnd });
  else sentence = t("promo.timeline.running");

  return (
    <div className="grid gap-3">
      <div className="relative h-14" aria-hidden="true">
        {/* track */}
        <span className="absolute inset-x-0 top-6 h-2 rounded-full bg-[var(--gt-ink-100)]" />
        {/* active run */}
        <span
          className={clsx(
            "absolute top-6 h-2 rounded-full transition-[left,width] duration-[var(--duration-slow)] ease-[var(--ease-out-soft)]",
            invalid
              ? "bg-[repeating-linear-gradient(45deg,var(--gt-red-400)_0_6px,var(--gt-red-50)_6px_12px)]"
              : "bg-[linear-gradient(90deg,var(--gt-emerald-400),var(--gt-blue-400))]",
            !endsAt && "[mask-image:linear-gradient(90deg,#000_70%,transparent)]",
          )}
          style={{ left: `${pos(start)}%`, width: `${Math.max(1.5, pos(end) - pos(start))}%` }}
        />
        {/* start / end pins */}
        <Pin at={pos(start)} label={dayMonth(startsAt || PROMO_NOW)} tone="start" />
        {endsAt && !invalid && <Pin at={pos(end)} label={dayMonth(endsAt)} tone="end" />}
        {/* today */}
        <span className="absolute top-2 h-10 w-px bg-[var(--gt-fuchsia-400)]" style={{ left: `${pos(NOW_TIME)}%` }}>
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--gt-fuchsia-50)] px-1.5 text-[9px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--accent-highlight-ink)]">
            {t("promo.timeline.today")}
          </span>
        </span>
      </div>
      <dl className="m-0 grid gap-x-4 gap-y-1 text-[length:var(--text-caption)] sm:grid-cols-3">
        <div>
          <dt className="text-[var(--text-muted)]">{t("promo.timeline.start")}</dt>
          <dd className="m-0 font-semibold text-[var(--text-primary)]">{startsAt ? dateTime(startsAt) : "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">{t("promo.timeline.end")}</dt>
          <dd className="m-0 font-semibold text-[var(--text-primary)]">{endsAt ? dateTime(endsAt) : t("promo.timeline.noEnd")}</dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">{t("promo.timeline.duration")}</dt>
          <dd className="m-0 font-semibold text-[var(--text-primary)]">
            {durationDays ? t("promo.timeline.days", { count: durationDays }) : t("promo.timeline.open")}
          </dd>
        </div>
      </dl>
      <p
        className={clsx(
          "m-0 text-[length:var(--text-caption)] font-medium",
          invalid ? "text-[var(--status-error-fg)]" : "text-[var(--text-body)]",
        )}
      >
        {sentence}
      </p>
    </div>
  );
}

function Pin({ at, label, tone }: { at: number; label: string; tone: "start" | "end" }) {
  return (
    <span className="absolute top-[18px]" style={{ left: `${at}%` }}>
      <span
        className={clsx(
          "absolute left-0 top-0 block h-4 w-4 -translate-x-1/2 rounded-full border-2 border-[var(--gt-white)] shadow-[var(--shadow-sm)]",
          tone === "start" ? "bg-[var(--gt-emerald-500)]" : "bg-[var(--gt-blue-600)]",
        )}
      />
      <span className="absolute left-0 top-5 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-[var(--text-muted)]">
        {label}
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Overview calendar                                                          */
/* -------------------------------------------------------------------------- */

const BAR_TONE: Record<PromotionStatus, string> = {
  active: "bg-[var(--gt-emerald-300)] border-[var(--gt-emerald-500)] text-[var(--gt-ink-900)]",
  scheduled: "bg-[var(--gt-blue-200)] border-[var(--gt-blue-500)] text-[var(--gt-ink-900)]",
  paused: "bg-[repeating-linear-gradient(45deg,var(--gt-amber-50)_0_6px,var(--gt-white)_6px_12px)] border-[var(--gt-amber-400)] text-[var(--gt-ink-900)]",
  expired: "bg-[var(--gt-ink-100)] border-[var(--gt-ink-300)] text-[var(--text-muted)]",
  draft: "bg-[var(--gt-white)] border-dashed border-[var(--gt-ink-400)] text-[var(--text-muted)]",
  archived: "bg-[var(--gt-ink-100)] border-[var(--gt-ink-300)] text-[var(--text-muted)]",
};

/**
 * Six weeks around today, one row per promotion that touches them.
 *
 * Answers "what is running when" at a glance — the question the table answers
 * one row at a time. Each bar is a link to its promotion, labelled with the
 * name and the dates so it is useful without hover. Scrolls sideways on
 * narrow screens rather than squashing weeks into slivers.
 */
export function PromotionCalendar({ promotions, campaignName }: { promotions: Promotion[]; campaignName: (id: string | null) => string }) {
  const { t } = useTranslation();
  const { dayMonth, date } = usePromoDates();
  const from = NOW_TIME - 14 * DAY;
  const to = NOW_TIME + 35 * DAY;
  const pct = (time: number) => ((Math.min(Math.max(time, from), to) - from) / (to - from)) * 100;

  const rows = promotions
    .filter((p) => {
      const s = promotionStatus(p);
      if (s === "archived" || s === "draft") return false;
      const start = toTime(p.schedule.startsAt);
      const end = p.schedule.endsAt ? toTime(p.schedule.endsAt) : Number.POSITIVE_INFINITY;
      return end >= from && start <= to;
    })
    .sort((a, b) => toTime(a.schedule.startsAt) - toTime(b.schedule.startsAt));

  const weeks = Array.from({ length: 8 }, (_, i) => from + i * 7 * DAY);

  if (rows.length === 0) return null;

  return (
    <div className="gt-admin-scroll overflow-x-auto">
      <div className="relative min-w-[680px]">
        <div className="relative mb-2 h-5 border-b border-[var(--border-subtle)]" aria-hidden="true">
          {weeks.map((w) => (
            <span
              key={w}
              className="absolute top-0 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]"
              style={{ left: `${pct(w)}%` }}
            >
              {dayMonth(new Date(w).toISOString())}
            </span>
          ))}
        </div>
        <ul className="relative m-0 grid list-none gap-1.5 p-0">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-2 bottom-0 z-[1] w-px bg-[var(--gt-fuchsia-400)]"
            style={{ left: `${pct(NOW_TIME)}%` }}
          />
          {rows.map((p) => {
            const status = promotionStatus(p);
            const start = toTime(p.schedule.startsAt);
            const end = p.schedule.endsAt ? toTime(p.schedule.endsAt) : to;
            const left = pct(start);
            const width = Math.max(4, pct(end) - left);
            const range = p.schedule.endsAt
              ? t("promo.calendar.range", { from: date(p.schedule.startsAt), to: date(p.schedule.endsAt) })
              : t("promo.calendar.from", { from: date(p.schedule.startsAt) });
            return (
              <li key={p.id} className="relative h-8">
                <Link
                  to={`/admin/promotions/${p.id}`}
                  className={clsx(
                    "absolute inset-y-0 flex items-center gap-1.5 overflow-hidden rounded-[6px] border px-2 text-[11px] font-semibold transition-[filter,box-shadow] hover:shadow-[var(--shadow-sm)] hover:brightness-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]",
                    BAR_TONE[status],
                    !p.schedule.endsAt && "rounded-r-none border-r-0",
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  aria-label={`${p.name} — ${t(`promo.status.${status}`)} — ${range}${p.campaignId ? ` — ${campaignName(p.campaignId)}` : ""}`}
                  title={`${p.name} · ${range}`}
                >
                  <span className="truncate">{p.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="m-0 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
          <LegendSwatch className={BAR_TONE.active} label={t("promo.status.active")} />
          <LegendSwatch className={BAR_TONE.scheduled} label={t("promo.status.scheduled")} />
          <LegendSwatch className={BAR_TONE.paused} label={t("promo.status.paused")} />
          <LegendSwatch className={BAR_TONE.expired} label={t("promo.status.expired")} />
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-px bg-[var(--gt-fuchsia-400)]" />
            {t("promo.timeline.today")}
          </span>
        </p>
      </div>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={clsx("h-3 w-5 rounded-[3px] border", className)} />
      {label}
    </span>
  );
}
