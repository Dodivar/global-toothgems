"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ArtistBookingCard } from "../glowbook/ArtistBookingCard";
import {
  addDays,
  type ArtistBooking,
  type CalendarClosure,
  type CalendarHour,
  cellName,
  dayClosed,
  formatDay,
  hourState,
  type HourState,
  toggleTarget,
  weekStart,
  zonedInstant,
} from "../../lib/glowbookBookingMapping";
import { focusRing } from "../studio/workspace/workspaceStyles";
import { agendaCard as card, agendaCardTitle as cardTitle, agendaSmall as small } from "./agendaStyles";

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export const CELL: Record<HourState, string> = {
  open: "border-[var(--gt-blue-300)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)] hover:border-[var(--gt-blue-600)]",
  extra: "border-[var(--gt-blue-600)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-800,#173a6b)] hover:border-[var(--gt-ink-900)]",
  closed: "border-[var(--border-subtle)] bg-[var(--surface-page)] text-[var(--text-subtle)] hover:border-[var(--border-strong)]",
  busy: "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] hover:border-[var(--gt-ink-900)]",
  blocked: "border-[var(--gt-red-400)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)] line-through hover:border-[var(--gt-red-600)]",
  booked: "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-white hover:bg-[var(--gt-ink-700)]",
  past: "border-transparent bg-transparent text-[var(--text-subtle)] opacity-60",
  holiday: "border-dashed border-[var(--gt-ink-300)] bg-[var(--surface-sunken)] text-[var(--text-muted)]",
};
const GLYPH: Partial<Record<HourState, string>> = { booked: "●", blocked: "×", busy: "≡", extra: "+", holiday: "–" };
const LEGEND: readonly HourState[] = ["open", "extra", "blocked", "busy", "holiday", "booked", "closed"];

/** A creation's signed picture and public 3D view, for an appointment's panel. */
export type CreationOf = (booking: ArtistBooking) => { imageUrl: string | null; viewUrl: string | null };

/**
 * The calendar's week (decisions 144 and 147): each hour closed or opened
 * with a click, and each appointment shown by the client's first name — a
 * click opens it below (client, creation asked for with its picture and 3D
 * view, comment, actions). On phones, one day at a time, hours listed down
 * the screen. Past appointments stay openable (to record the outcome).
 */
export function AgendaWeek({
  week,
  today,
  timezone,
  rows,
  hours,
  bookings,
  imported,
  closures,
  dirty,
  pendingCell,
  onWeek,
  onToggle,
  onCloseDay,
  onChanged,
  creationOf,
}: {
  week: string;
  today: string;
  timezone: string;
  /** The local hours to show (`visibleHours`). */
  rows: number[];
  hours: CalendarHour[];
  bookings: ArtistBooking[];
  imported: Set<string>;
  closures: CalendarClosure[];
  /** Unsaved hours: clicks on free hours wait for the save (appointments still open). */
  dirty: boolean;
  pendingCell: string | null;
  onWeek: (monday: string) => void;
  onToggle: (day: string, hour: number, state: HourState) => void;
  onCloseDay: (day: string) => void;
  onChanged: () => void;
  creationOf: CreationOf;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "fr";
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [day, setDay] = useState(today >= week && today <= addDays(week, 6) ? today : week);
  const nowMs = Date.now();

  const byInstant = useMemo(() => new Map(hours.map((h) => [`${h.day}|${h.hour}`, h])), [hours]);
  const bookedAt = useMemo(() => new Map(bookings.filter((b) => b.status === "booked").map((b) => [new Date(b.startsAt).toISOString(), b])), [bookings]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const selected = selectedId ? (bookings.find((b) => b.id === selectedId) ?? null) : null;

  // The phone's day follows the week shown (the arrows of either view move it).
  useEffect(() => {
    if (day < week || day > addDays(week, 6)) setDay(today >= week && today <= addDays(week, 6) ? today : week);
  }, [week, day, today]);

  const open = (booking: ArtistBooking) => {
    setSelectedId(booking.id);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  /** One hour of the calendar, as both views draw it. */
  const slot = (d: string, hour: number) => {
    const key = `${d}|${hour}`;
    const entry = byInstant.get(key);
    const instant = entry?.startsAt ? new Date(entry.startsAt).toISOString() : zonedInstant(d, hour, timezone);
    const booking = bookedAt.get(instant) ?? null;
    const state = hourState(entry, booking !== null, new Date(instant).getTime() < nowMs && !booking, imported.has(instant), dayClosed(d, closures));
    const toggles = toggleTarget(state) !== null && !dirty;
    const label = booking
      ? `${formatDay(d, lang)} ${hh(hour)} : ${t("booking.agenda.cell.booked")}, ${booking.clientName ?? ""}`
      : `${formatDay(d, lang)} ${hh(hour)} : ${t(`booking.agenda.cell.${state}`)}`;
    return {
      key,
      state,
      booking,
      label,
      disabled: booking ? false : !toggles || pendingCell === key,
      onClick: () => (booking ? open(booking) : onToggle(d, hour, state)),
    };
  };

  const goDay = (next: string) => {
    setDay(next);
    if (next < week || next > addDays(week, 6)) onWeek(weekStart(next));
  };

  return (
    <div className="grid gap-5">
      <section aria-labelledby={titleId} className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={titleId} className={cardTitle}>{t("booking.agenda.weekView")}</h2>
          {/* Week arrows (wide screens). */}
          <div className="hidden items-center gap-1 sm:flex">
            <ArrowButton label={t("booking.agenda.prevWeek")} disabled={week <= weekStart(today)} onClick={() => onWeek(addDays(week, -7))} icon="prev" />
            <span className="min-w-[9.5rem] text-center text-[13px] font-semibold text-[var(--text-primary)]">
              {formatDay(week, lang, "short")} – {formatDay(addDays(week, 6), lang, "short")}
            </span>
            <ArrowButton label={t("booking.agenda.nextWeek")} onClick={() => onWeek(addDays(week, 7))} icon="next" />
          </div>
          {/* Day arrows (phones). */}
          <div className="flex items-center gap-1 sm:hidden">
            <ArrowButton label={t("booking.agenda.prevDay")} disabled={day <= today} onClick={() => goDay(addDays(day, -1))} icon="prev" />
            <span className="min-w-[8.5rem] text-center text-[13px] font-semibold text-[var(--text-primary)]">{formatDay(day, lang, "short")}</span>
            <ArrowButton label={t("booking.agenda.nextDay")} onClick={() => goDay(addDays(day, 1))} icon="next" />
          </div>
        </div>
        <p className={small}>{t("booking.agenda.weekHint", { city: timezone.split("/").pop()?.replace(/_/g, " ") })}</p>
        {dirty && <p className={clsx(small, "font-semibold text-[var(--status-warning-fg)]")}>{t("booking.agenda.saveFirst")}</p>}

        {/* The week (wide screens). */}
        <div className="-mx-1 hidden overflow-x-auto px-1 sm:block">
          <table className="w-full min-w-[620px] table-fixed border-separate border-spacing-1 text-[11.5px]">
            <caption className="sr-only">{t("booking.agenda.weekView")}</caption>
            <thead>
              <tr>
                <th scope="col" className="w-12" />
                {days.map((d) => (
                  <th key={d} scope="col" className="text-center font-semibold text-[var(--text-muted)]">
                    <span className="block">{formatDay(d, lang, "short")}</span>
                    {d >= today && !dayClosed(d, closures) && (
                      <button type="button" onClick={() => onCloseDay(d)} className="mt-0.5 text-[10.5px] font-semibold text-[var(--text-subtle)] underline hover:text-[var(--text-primary)]">
                        {t("booking.agenda.closeDay")}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((hour) => (
                <tr key={hour}>
                  <th scope="row" className="pr-1 text-right font-semibold tabular-nums text-[var(--text-subtle)]">{hh(hour)}</th>
                  {days.map((d) => {
                    const s = slot(d, hour);
                    return (
                      <td key={s.key} className="p-0">
                        <button
                          type="button"
                          disabled={s.disabled}
                          onClick={s.onClick}
                          aria-label={s.label}
                          aria-pressed={s.booking ? s.booking.id === selectedId : undefined}
                          title={s.booking ? `${s.booking.clientName ?? ""} · ${s.booking.designKind === "custom" ? t("booking.design.custom") : (s.booking.creationName ?? "")}` : undefined}
                          className={clsx(
                            "h-8 w-full overflow-hidden rounded-[6px] border px-1 text-[10.5px] font-bold transition-colors disabled:cursor-default",
                            CELL[s.state],
                            s.booking && s.booking.id === selectedId && "ring-2 ring-[var(--focus-ring)] ring-offset-1",
                            focusRing,
                          )}
                        >
                          <span aria-hidden="true" className="block truncate">
                            {s.booking ? cellName(s.booking.clientName) || GLYPH.booked : (GLYPH[s.state] ?? "")}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* One day (phones). */}
        <ul aria-label={formatDay(day, lang)} className="m-0 grid list-none gap-1.5 p-0 sm:hidden">
          {dayClosed(day, closures) && <li className={clsx(small, "font-semibold")}>{t("booking.agenda.dayClosed")}</li>}
          {rows.map((hour) => {
            const s = slot(day, hour);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  disabled={s.disabled}
                  onClick={s.onClick}
                  aria-label={s.label}
                  className={clsx("flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2 text-left disabled:cursor-default", CELL[s.state], focusRing)}
                >
                  <span className="w-12 flex-none text-[12.5px] font-bold tabular-nums">{hh(hour)}</span>
                  <span aria-hidden="true" className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {s.booking
                      ? `${s.booking.clientName ?? ""} · ${s.booking.designKind === "custom" ? t("booking.design.custom") : (s.booking.creationName ?? "")}`
                      : t(`booking.agenda.cell.${s.state}`)}
                  </span>
                </button>
              </li>
            );
          })}
          {day >= today && !dayClosed(day, closures) && (
            <li>
              <button type="button" onClick={() => onCloseDay(day)} className="text-[12.5px] font-semibold text-[var(--text-muted)] underline">
                {t("booking.agenda.closeThisDay")}
              </button>
            </li>
          )}
        </ul>

        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[11.5px] text-[var(--text-muted)]">
          {LEGEND.map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={clsx("inline-block h-3 w-4 rounded-[3px] border", CELL[s])} />
              {t(`booking.agenda.cell.${s}`)}
            </li>
          ))}
        </ul>
        <p className={small}>{t("booking.agenda.openHint")}</p>
      </section>

      {selected && (
        <section ref={panelRef} aria-label={t("booking.agenda.selected")} className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="m-0 text-[14px] font-[var(--weight-black)] text-[var(--text-primary)]">{t("booking.agenda.selected")}</h3>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label={t("booking.dialog.close")}
              className={clsx("grid h-9 w-9 place-items-center rounded-[var(--radius-pill)] text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]", focusRing)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <ArtistBookingCard booking={selected} creation={creationOf(selected)} onChanged={onChanged} />
        </section>
      )}
    </div>
  );
}

function ArrowButton({ label, onClick, disabled, icon }: { label: string; onClick: () => void; disabled?: boolean; icon: "prev" | "next" }) {
  const Icon = icon === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx("grid h-9 w-9 place-items-center rounded-[var(--radius-pill)] border border-[var(--border-subtle)] disabled:opacity-40", focusRing)}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
