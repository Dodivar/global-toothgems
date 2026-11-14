"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { CalendarCheck, ChevronLeft, ChevronRight, CircleAlert, Plus, RotateCw, Trash2, UserCheck } from "lucide-react";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/Checkbox";
import { ArtistBookingCard } from "../../glowbook/ArtistBookingCard";
import { bookingAvailable, fetchArtistAppointments, fetchArtistCalendar, fetchImportedHours, saveBookingSettings, setCalendarHours, unblockClient } from "../../../lib/glowbookBooking";
import {
  addDays,
  type ArtistCalendar,
  type BookingSettings,
  DEFAULT_SETTINGS,
  defaultWeek,
  formatDay,
  HORIZON_CHOICES,
  hourState,
  type HourState,
  localDay,
  NOTICE_CHOICES,
  rulesToWeek,
  TIMEZONE_CHOICES,
  toggleTarget,
  validateWeek,
  visibleHours,
  type WeekHours,
  weekStart,
  weekToRules,
  zonedInstant,
} from "../../../lib/glowbookBookingMapping";
import type { Glowbook } from "../../../lib/studioWorkspace/glowbook";
import { useToast } from "../../../lib/toast";
import { fieldClass, focusRing } from "./workspaceStyles";
import { GlowbookCalendarFeed } from "./GlowbookCalendarFeed";
import { GlowbookCalendarImport } from "./GlowbookCalendarImport";

const card = "grid gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)] sm:p-6";
const cardTitle = "m-0 inline-flex items-center gap-2 text-[16px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]";
const small = "m-0 text-[12.5px] leading-relaxed text-[var(--text-muted)]";
const label = "text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]";
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const HOURS = Array.from({ length: 25 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

const CELL: Record<HourState, string> = {
  open: "border-[var(--gt-blue-300)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)] hover:border-[var(--gt-blue-600)]",
  extra: "border-[var(--gt-blue-600)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-800,#173a6b)] hover:border-[var(--gt-ink-900)]",
  closed: "border-[var(--border-subtle)] bg-[var(--surface-page)] text-[var(--text-subtle)] hover:border-[var(--border-strong)]",
  busy: "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] hover:border-[var(--gt-ink-900)]",
  blocked: "border-[var(--gt-red-400)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)] line-through hover:border-[var(--gt-red-600)]",
  booked: "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-white",
  past: "border-transparent bg-transparent text-[var(--text-subtle)] opacity-60",
};

/**
 * The Glowbook calendar (decision 144), in "My Glowbook": switch bookings on,
 * the time zone, notice and horizon, the weekly hours; a week view where each
 * hour can be closed or opened with a click (the hours booked elsewhere,
 * Planity included, are closed this way); the appointments to come; the
 * clients no longer accepted. Visitors book only while the page is approved
 * and the plan active; the database checks every write.
 */
export function GlowbookAgenda({ glowbook }: { glowbook: Glowbook }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "fr";
  const { showToast } = useToast();
  const ids = { tz: useId(), notice: useId(), horizon: useId() };
  const [today, setToday] = useState<string | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<ArtistCalendar | null>(null);
  const [upcoming, setUpcoming] = useState<ArtistCalendar["bookings"]>([]);
  const [toMark, setToMark] = useState<ArtistCalendar["bookings"]>([]);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"loading" | "ready" | "error" | "unavailable">(bookingAvailable() ? "loading" : "unavailable");
  const [settings, setSettings] = useState<BookingSettings>(DEFAULT_SETTINGS);
  const [hours, setHours] = useState<WeekHours>(defaultWeek());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingCell, setPendingCell] = useState<string | null>(null);

  // Dates are read once hydrated (no clock during render).
  useEffect(() => {
    const day = localDay(new Date().toISOString(), DEFAULT_SETTINGS.timezone);
    setToday(day);
    setWeek(weekStart(day));
  }, []);

  const load = useCallback(
    async (keepForm: boolean) => {
      if (!week || !today || !bookingAvailable()) return;
      try {
        const [weekly, around, closedElsewhere] = await Promise.all([
          fetchArtistCalendar(week, addDays(week, 6)),
          fetchArtistAppointments(today),
          fetchImportedHours(new Date(`${addDays(week, -1)}T00:00:00Z`).toISOString(), new Date(`${addDays(week, 8)}T00:00:00Z`).toISOString()),
        ]);
        setImported(closedElsewhere);
        if (!weekly) {
          setState("unavailable");
          return;
        }
        setCalendar(weekly);
        setUpcoming(around?.upcoming ?? []);
        setToMark(around?.toMark ?? []);
        if (!keepForm) {
          setSettings(weekly.settings ?? DEFAULT_SETTINGS);
          setHours(weekly.settings ? rulesToWeek(weekly.rules) : defaultWeek());
          setDirty(!weekly.settings);
        }
        setState("ready");
      } catch {
        setState("error");
      }
    },
    [week, today],
  );

  useEffect(() => {
    void load(dirty);
    // Reload the week when it changes; the form keeps unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, today]);

  const weekProblem = validateWeek(hours);
  const edit = <K extends keyof BookingSettings>(key: K, value: BookingSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setDirty(true);
  };
  const editDay = (day: number, next: { start: number; end: number }[]) => {
    setHours((w) => ({ ...w, [day]: next }));
    setDirty(true);
  };

  const save = async () => {
    if (weekProblem) return;
    setSaving(true);
    const result = await saveBookingSettings(settings, weekToRules(hours));
    setSaving(false);
    if (result.ok) {
      setDirty(false);
      showToast(t("booking.agenda.saved"), settings.enabled ? t("booking.agenda.savedOn") : t("booking.agenda.savedOff"), "success");
      void load(false);
    } else {
      showToast(t("booking.artist.actionFailed"), t(`booking.artist.codes.${result.code}`, { defaultValue: t("booking.artist.codes.unavailable") }), "error");
    }
  };

  const tz = calendar?.settings?.timezone ?? settings.timezone;
  const days = useMemo(() => (week ? WEEKDAYS.map((_, i) => addDays(week, i)) : []), [week]);
  const rows = useMemo(() => visibleHours(calendar?.rules ?? [], calendar?.hours ?? []), [calendar]);
  const byInstant = useMemo(() => new Map((calendar?.hours ?? []).map((h) => [`${h.day}|${h.hour}`, h])), [calendar]);
  const bookedAt = useMemo(
    () => new Set((calendar?.bookings ?? []).filter((b) => b.status === "booked").map((b) => new Date(b.startsAt).toISOString())),
    [calendar],
  );

  const toggle = async (day: string, hour: number, current: HourState) => {
    const target = toggleTarget(current);
    if (!target) return;
    const instant = zonedInstant(day, hour, tz);
    setPendingCell(`${day}|${hour}`);
    const result = await setCalendarHours([instant], target);
    setPendingCell(null);
    if (!result.ok) {
      showToast(t("booking.artist.actionFailed"), t(`booking.artist.codes.${result.code}`, { defaultValue: t("booking.artist.codes.unavailable") }), "error");
      return;
    }
    void load(true);
  };

  const closeDay = async (day: string) => {
    const open = rows.filter((h) => {
      const s = hourState(byInstant.get(`${day}|${h}`), false, false);
      return s === "open" || s === "extra";
    });
    if (open.length === 0) return;
    const result = await setCalendarHours(open.map((h) => zonedInstant(day, h, tz)), "blocked");
    if (result.ok) void load(true);
    else showToast(t("booking.artist.actionFailed"), undefined, "error");
  };

  if (state === "unavailable") {
    return (
      <div className={card}>
        <p className={small}>{t("booking.agenda.unavailable")}</p>
      </div>
    );
  }
  if (state === "loading" || !week || !today) {
    return (
      <div role="status" className="grid gap-3">
        <span className="sr-only">{t("booking.mine.loading")}</span>
        <div className="gt-skeleton h-40 rounded-[var(--radius-xl)]" />
        <div className="gt-skeleton h-64 rounded-[var(--radius-xl)]" />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className={card}>
        <p className={small}>{t("booking.mine.error")}</p>
        <div>
          <Button variant="outline" size="sm" iconLeft={RotateCw} onClick={() => void load(dirty)}>{t("booking.when.retry")}</Button>
        </div>
      </div>
    );
  }

  const nowMs = Date.now();
  const status = !calendar?.switchOn
    ? "switchOff"
    : !calendar?.settings?.enabled
      ? "disabled"
      : glowbook.status !== "approved"
        ? "pending"
        : calendar.open
          ? "open"
          : "closed";

  return (
    <div className="grid gap-6">
      <div
        role="status"
        className={clsx(
          "flex items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-[length:var(--text-body-sm)]",
          status === "open" ? "border-[var(--gt-green-400,#7ccf9b)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]" : "border-[var(--border-subtle)] bg-[var(--surface-page)] text-[var(--text-body)]",
        )}
      >
        {status === "open" ? <CalendarCheck size={18} aria-hidden="true" className="mt-0.5 flex-none" /> : <CircleAlert size={18} aria-hidden="true" className="mt-0.5 flex-none" />}
        <p className="m-0 font-semibold">{t(`booking.agenda.status.${status}`)}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start [&>*]:min-w-0">
        {/* Settings and weekly hours */}
        <section aria-labelledby={`${ids.tz}-title`} className={card}>
          <h2 id={`${ids.tz}-title`} className={cardTitle}>{t("booking.agenda.settingsTitle")}</h2>
          <Checkbox
            label={t("booking.agenda.enable")}
            description={t("booking.agenda.enableHint")}
            checked={settings.enabled}
            onChange={(v) => edit("enabled", v)}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <label htmlFor={ids.tz} className="grid gap-1.5">
              <span className={label}>{t("booking.agenda.timezone")}</span>
              <select id={ids.tz} className={fieldClass} value={settings.timezone} onChange={(e) => edit("timezone", e.target.value)}>
                {[...new Set([settings.timezone, ...TIMEZONE_CHOICES])].map((z) => (
                  <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>
            <label htmlFor={ids.notice} className="grid gap-1.5">
              <span className={label}>{t("booking.agenda.notice")}</span>
              <select id={ids.notice} className={fieldClass} value={settings.minNoticeHours} onChange={(e) => edit("minNoticeHours", Number(e.target.value))}>
                {[...new Set([settings.minNoticeHours, ...NOTICE_CHOICES])].sort((a, b) => a - b).map((h) => (
                  <option key={h} value={h}>{t("booking.agenda.noticeHours", { count: h })}</option>
                ))}
              </select>
            </label>
            <label htmlFor={ids.horizon} className="grid gap-1.5">
              <span className={label}>{t("booking.agenda.horizon")}</span>
              <select id={ids.horizon} className={fieldClass} value={settings.horizonDays} onChange={(e) => edit("horizonDays", Number(e.target.value))}>
                {[...new Set([settings.horizonDays, ...HORIZON_CHOICES])].sort((a, b) => a - b).map((d) => (
                  <option key={d} value={d}>{t("booking.agenda.horizonDays", { count: d })}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-2">
            <p className={label}>{t("booking.agenda.weekTitle")}</p>
            <ul className="m-0 grid list-none gap-2 p-0">
              {WEEKDAYS.map((d) => (
                <li key={d} className="grid gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2.5 sm:grid-cols-[110px_minmax(0,1fr)] sm:items-center">
                  <span className="text-[13px] font-bold text-[var(--text-primary)]">{t(`booking.weekdays.${d}`)}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {(hours[d] ?? []).length === 0 && <span className="text-[12.5px] text-[var(--text-subtle)]">{t("booking.agenda.closedDay")}</span>}
                    {(hours[d] ?? []).map((r, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        <select
                          aria-label={t("booking.agenda.from", { day: t(`booking.weekdays.${d}`) })}
                          className={clsx(fieldClass, "h-9 w-auto py-1")}
                          value={r.start}
                          onChange={(e) => editDay(d, hours[d].map((x, j) => (j === i ? { ...x, start: Number(e.target.value) } : x)))}
                        >
                          {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{hh(h)}</option>)}
                        </select>
                        <span aria-hidden="true">–</span>
                        <select
                          aria-label={t("booking.agenda.to", { day: t(`booking.weekdays.${d}`) })}
                          className={clsx(fieldClass, "h-9 w-auto py-1")}
                          value={r.end}
                          onChange={(e) => editDay(d, hours[d].map((x, j) => (j === i ? { ...x, end: Number(e.target.value) } : x)))}
                        >
                          {HOURS.slice(1).map((h) => <option key={h} value={h}>{hh(h)}</option>)}
                        </select>
                        <button
                          type="button"
                          aria-label={t("booking.agenda.removeRange")}
                          onClick={() => editDay(d, hours[d].filter((_, j) => j !== i))}
                          className={clsx("grid h-9 w-9 place-items-center rounded-[var(--radius-pill)] text-[var(--text-muted)] hover:bg-[var(--surface-sunken)]", focusRing)}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                    {(hours[d] ?? []).length < 4 && (
                      <button
                        type="button"
                        onClick={() => {
                          const last = hours[d]?.at(-1);
                          const start = last ? Math.min(last.end + 1, 23) : 10;
                          editDay(d, [...(hours[d] ?? []), { start, end: Math.min(start + 4, 24) }]);
                        }}
                        className={clsx("inline-flex h-9 items-center gap-1 rounded-[var(--radius-pill)] border border-dashed border-[var(--border-strong)] px-3 text-[12.5px] font-semibold text-[var(--text-primary)]", focusRing)}
                      >
                        <Plus size={13} aria-hidden="true" />
                        {t("booking.agenda.addRange")}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {weekProblem && <p role="alert" className="m-0 text-[12.5px] font-semibold text-[var(--status-error-fg)]">{t(`booking.agenda.weekProblem.${weekProblem}`)}</p>}
          </div>
          <p className={small}>{t("booking.agenda.linkNote")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void save()} disabled={saving || !!weekProblem || !dirty} loading={saving}>
              {t("booking.agenda.save")}
            </Button>
            {dirty && <span className="text-[12.5px] text-[var(--text-muted)]">{t("booking.agenda.unsaved")}</span>}
          </div>
        </section>

        {/* Week view */}
        <section aria-labelledby={`${ids.notice}-week`} className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`${ids.notice}-week`} className={cardTitle}>{t("booking.agenda.weekView")}</h2>
            <div className="flex items-center gap-1">
              <button type="button" aria-label={t("booking.agenda.prevWeek")} disabled={week <= weekStart(today)} onClick={() => setWeek(addDays(week, -7))}
                className={clsx("grid h-9 w-9 place-items-center rounded-[var(--radius-pill)] border border-[var(--border-subtle)] disabled:opacity-40", focusRing)}>
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <span className="min-w-[9.5rem] text-center text-[13px] font-semibold text-[var(--text-primary)]">
                {formatDay(week, lang, "short")} – {formatDay(addDays(week, 6), lang, "short")}
              </span>
              <button type="button" aria-label={t("booking.agenda.nextWeek")} onClick={() => setWeek(addDays(week, 7))}
                className={clsx("grid h-9 w-9 place-items-center rounded-[var(--radius-pill)] border border-[var(--border-subtle)]", focusRing)}>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          <p className={small}>{t("booking.agenda.weekHint", { city: tz.split("/").pop()?.replace(/_/g, " ") })}</p>
          {dirty && <p className={clsx(small, "font-semibold text-[var(--status-warning-fg)]")}>{t("booking.agenda.saveFirst")}</p>}
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[560px] border-separate border-spacing-1 text-[11.5px]">
              <caption className="sr-only">{t("booking.agenda.weekView")}</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-12" />
                  {days.map((day) => (
                    <th key={day} scope="col" className="text-center font-semibold text-[var(--text-muted)]">
                      <span className="block">{formatDay(day, lang, "short")}</span>
                      {day >= today && (
                        <button type="button" onClick={() => void closeDay(day)} className="mt-0.5 text-[10.5px] font-semibold text-[var(--text-subtle)] underline hover:text-[var(--text-primary)]">
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
                    {days.map((day) => {
                      const key = `${day}|${hour}`;
                      const entry = byInstant.get(key);
                      const instant = entry?.startsAt ? new Date(entry.startsAt).toISOString() : zonedInstant(day, hour, tz);
                      const cell = hourState(entry, bookedAt.has(instant), new Date(instant).getTime() < nowMs, imported.has(instant));
                      const actionable = toggleTarget(cell) !== null && !dirty;
                      return (
                        <td key={key} className="p-0">
                          <button
                            type="button"
                            disabled={!actionable || pendingCell === key}
                            onClick={() => void toggle(day, hour, cell)}
                            aria-label={`${formatDay(day, lang)} ${hh(hour)} : ${t(`booking.agenda.cell.${cell}`)}`}
                            className={clsx("h-8 w-full rounded-[6px] border text-[10.5px] font-bold transition-colors disabled:cursor-default", CELL[cell], focusRing)}
                          >
                            <span aria-hidden="true">{cell === "booked" ? "●" : cell === "blocked" ? "×" : cell === "busy" ? "≡" : cell === "extra" ? "+" : ""}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[11.5px] text-[var(--text-muted)]">
            {(["open", "extra", "blocked", "busy", "booked", "closed"] as const).map((s) => (
              <li key={s} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={clsx("inline-block h-3 w-4 rounded-[3px] border", CELL[s])} />
                {t(`booking.agenda.cell.${s}`)}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {toMark.length > 0 && (
        <section aria-labelledby={`${ids.horizon}-mark`} className={card}>
          <h2 id={`${ids.horizon}-mark`} className={cardTitle}>{t("booking.agenda.toMark", { count: toMark.length })}</h2>
          <p className={small}>{t("booking.agenda.toMarkHint")}</p>
          <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
            {toMark.map((b) => (
              <li key={b.id}>
                <ArtistBookingCard booking={b} onChanged={() => void load(true)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${ids.horizon}-coming`} className={card}>
        <h2 id={`${ids.horizon}-coming`} className={cardTitle}>{t("booking.agenda.upcoming", { count: upcoming.length })}</h2>
        {upcoming.length === 0 ? (
          <p className={small}>{t("booking.agenda.noneUpcoming")}</p>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
            {upcoming.map((b) => (
              <li key={b.id}>
                <ArtistBookingCard booking={b} onChanged={() => void load(true)} />
              </li>
            ))}
          </ul>
        )}
        <p className={small}>{t("booking.agenda.pastHint")}</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">
        <GlowbookCalendarImport onChanged={() => void load(true)} />
        <GlowbookCalendarFeed />
      </div>

      {(calendar?.blocks.length ?? 0) > 0 && (
        <section aria-labelledby={`${ids.horizon}-blocks`} className={card}>
          <h2 id={`${ids.horizon}-blocks`} className={cardTitle}>{t("booking.agenda.blocks")}</h2>
          <ul className="m-0 grid list-none gap-2 p-0">
            {calendar!.blocks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2">
                <span className="text-[13.5px] font-semibold text-[var(--text-primary)]">{b.clientName}</span>
                <Button size="sm" variant="ghost" iconLeft={UserCheck} onClick={async () => {
                  const r = await unblockClient(b.id);
                  if (r.ok) void load(true);
                }}>
                  {t("booking.agenda.unblock")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
