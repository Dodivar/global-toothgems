"use client";

import { useCallback, useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  CircleAlert,
  Clock3,
  ListChecks,
  Lock,
  Plus,
  RefreshCw,
  RotateCw,
  Sparkles,
  Trash2,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { ArtistBookingCard } from "../glowbook/ArtistBookingCard";
import { bookingAvailable, fetchArtistAppointments, fetchArtistCalendar, fetchImportedHours, saveBookingSettings, setCalendarHours, unblockClient } from "../../lib/glowbookBooking";
import {
  addDays,
  type ArtistCalendar,
  type BookingSettings,
  DEFAULT_SETTINGS,
  defaultWeek,
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
} from "../../lib/glowbookBookingMapping";
import { AGENDA_TABS, agendaTab, type AgendaTab } from "../../lib/agendaRoutes";
import { bookingCreationPath, GLOWBOOK_INTRO_PATH, glowbookCreationPath, studioSectionPath } from "../../lib/studioUrl";
import { Link } from "../../lib/navigation";
import { useToast } from "../../lib/toast";
import { fieldClass, focusRing } from "../studio/workspace/workspaceStyles";
import { GlowbookCalendarFeed } from "../studio/workspace/GlowbookCalendarFeed";
import { GlowbookCalendarImport } from "../studio/workspace/GlowbookCalendarImport";
import { AgendaClosures } from "./AgendaClosures";
import { AgendaWeek, type CreationOf } from "./AgendaWeek";
import { BUCKETS, signedUrls } from "../../lib/supabase/storage";
import { agendaCard as card, agendaCardTitle as cardTitle, agendaLabel as label, agendaSmall as small } from "./agendaStyles";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const HOURS = Array.from({ length: 25 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** One opening range: start and end hours side by side in one bordered group. */
const rangeGroup = clsx(
  "inline-flex h-10 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)] pl-1 pr-1",
  "focus-within:border-[var(--focus-ring)]",
);
/** An hour picker inside a range group; its own padding so the text is never clipped. */
const timeSelect = clsx(
  "h-8 cursor-pointer rounded-[var(--radius-sm)] bg-transparent px-2 text-[14px] leading-normal tabular-nums text-[var(--text-primary)] outline-none",
  "hover:bg-[var(--surface-sunken)] focus-visible:shadow-[var(--shadow-focus)]",
);

const TAB_ICON: Record<AgendaTab, LucideIcon> = {
  appointments: ListChecks,
  week: CalendarDays,
  hours: Clock3,
  closures: CalendarOff,
  sync: RefreshCw,
};

type State = "loading" | "ready" | "error" | "unavailable";

/**
 * The artist's calendar (decisions 144 and 147), the body of `/compte/agenda`:
 * the appointments (to record, to come), the week where each hour is closed
 * or opened with a click, the weekly hours and booking settings, time off
 * (whole days closed at once), and the sync with other calendars. One part
 * at a time in tabs, addressed by `?tab=`.
 *
 * Without the Atelier plan (`plan === false`) only the appointments already
 * booked are shown — `glowbook_artist_calendar` stays readable so they can
 * still be honoured or cancelled; without a Glowbook page, the way to create
 * one. The database checks every write.
 */
export function ArtistAgenda({ plan }: { plan: boolean | null }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const baseId = useId();
  const ids = { tz: useId(), notice: useId(), horizon: useId() };
  const [tab, setTab] = useState<AgendaTab>("appointments");
  const [today, setToday] = useState<string | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<ArtistCalendar | null>(null);
  const [upcoming, setUpcoming] = useState<ArtistCalendar["bookings"]>([]);
  const [toMark, setToMark] = useState<ArtistCalendar["bookings"]>([]);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [state, setState] = useState<State>(bookingAvailable() ? "loading" : "unavailable");
  const [settings, setSettings] = useState<BookingSettings>(DEFAULT_SETTINGS);
  const [hours, setHours] = useState<WeekHours>(defaultWeek());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingCell, setPendingCell] = useState<string | null>(null);

  // Dates and the address's tab are read once hydrated (no clock or window during render).
  useEffect(() => {
    const day = localDay(new Date().toISOString(), DEFAULT_SETTINGS.timezone);
    setToday(day);
    setWeek(weekStart(day));
    setTab(agendaTab(new URLSearchParams(window.location.search).get("tab")));
  }, []);

  const selectTab = (next: AgendaTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "appointments") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

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

  // Opening or closing hours changes no appointment: only the week is read again
  // (the appointment lists cost two to four 62-day reads).
  const reloadWeek = useCallback(async () => {
    if (!week) return;
    try {
      const weekly = await fetchArtistCalendar(week, addDays(week, 6));
      if (weekly) setCalendar(weekly);
    } catch {
      setState("error");
    }
  }, [week]);

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
  const closures = useMemo(() => calendar?.closures ?? [], [calendar]);
  const rows = useMemo(() => visibleHours(calendar?.rules ?? [], calendar?.hours ?? []), [calendar]);
  const byInstant = useMemo(() => new Map((calendar?.hours ?? []).map((h) => [`${h.day}|${h.hour}`, h])), [calendar]);
  // The chosen creations' pictures (the artist's own private thumbnails), signed once per load.
  const [images, setImages] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const paths = [...new Set([...(calendar?.bookings ?? []), ...upcoming, ...toMark].flatMap((b) => (b.thumbnailPath ? [b.thumbnailPath] : [])))];
    if (paths.length === 0) return;
    let cancelled = false;
    signedUrls(BUCKETS.studioThumbnails, paths)
      .then((urls) => {
        if (!cancelled) setImages(urls);
      })
      .catch(() => {
        /* No picture rather than a broken one. */
      });
    return () => {
      cancelled = true;
    };
  }, [calendar, upcoming, toMark]);
  const handle = calendar?.handle ?? null;
  const creationOf: CreationOf = (b) => ({
    imageUrl: b.thumbnailPath ? (images.get(b.thumbnailPath) ?? null) : null,
    // The client's own creation (decision 149) opens read-only from the booking; a Glowbook one from the page.
    viewUrl: b.clientCreation ? bookingCreationPath(b.id) : b.itemLive && b.itemId && handle ? glowbookCreationPath(handle, b.itemId) : null,
  });

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
    void reloadWeek();
  };

  const closeDay = async (day: string) => {
    const open = rows.filter((h) => {
      const s = hourState(byInstant.get(`${day}|${h}`), false, false);
      return s === "open" || s === "extra";
    });
    if (open.length === 0) return;
    const result = await setCalendarHours(open.map((h) => zonedInstant(day, h, tz)), "blocked");
    if (result.ok) void reloadWeek();
    else showToast(t("booking.artist.actionFailed"), undefined, "error");
  };

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const at = AGENDA_TABS.indexOf(tab);
    const to = e.key === "Home" ? 0 : e.key === "End" ? AGENDA_TABS.length - 1 : step ? (at + step + AGENDA_TABS.length) % AGENDA_TABS.length : -1;
    if (to < 0) return;
    e.preventDefault();
    selectTab(AGENDA_TABS[to]);
    document.getElementById(`${baseId}-tab-${AGENDA_TABS[to]}`)?.focus();
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
        <div className="gt-skeleton h-12 rounded-[var(--radius-lg)]" />
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

  const hasAppointments = upcoming.length > 0 || toMark.length > 0;
  const appointments = (
    <AppointmentLists upcoming={upcoming} toMark={toMark} onChanged={() => void load(true)} creationOf={creationOf} />
  );

  // No Glowbook page: nothing to book yet — unless appointments are left to handle.
  if (!calendar?.pageStatus && !hasAppointments) {
    return plan === false ? (
      <Gate icon={Lock} title={t("booking.page.lockedTitle")} body={t("booking.page.lockedBody")} cta={t("booking.page.lockedCta")} to={GLOWBOOK_INTRO_PATH} />
    ) : (
      <Gate icon={Sparkles} title={t("booking.page.noPageTitle")} body={t("booking.page.noPageBody")} cta={t("booking.page.noPageCta")} to={studioSectionPath("glowbook")} />
    );
  }

  // The plan ended (or the page is gone): only the appointments already booked.
  if (plan === false || !calendar?.pageStatus) {
    return (
      <div className="grid gap-6">
        <div role="status" className="flex flex-wrap items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
          <CircleAlert size={18} aria-hidden="true" className="mt-0.5 flex-none" />
          <p className="m-0 min-w-0 flex-1 font-semibold">{t("booking.page.planEnded")}</p>
          <Link to="/compte/studio" className="font-bold underline underline-offset-4">{t("booking.page.planEndedCta")}</Link>
        </div>
        {appointments}
      </div>
    );
  }

  const status = !calendar.switchOn
    ? "switchOff"
    : !calendar.settings?.enabled
      ? "disabled"
      : calendar.pageStatus !== "approved"
        ? "pending"
        : calendar.open
          ? "open"
          : "closed";

  return (
    <div className="grid gap-5">
      <div
        role="status"
        className={clsx(
          "flex flex-wrap items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-[length:var(--text-body-sm)]",
          status === "open" ? "border-[var(--gt-green-400,#7ccf9b)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]" : "border-[var(--border-subtle)] bg-[var(--surface-page)] text-[var(--text-body)]",
        )}
      >
        {status === "open" ? <CalendarCheck size={18} aria-hidden="true" className="mt-0.5 flex-none" /> : <CircleAlert size={18} aria-hidden="true" className="mt-0.5 flex-none" />}
        <p className="m-0 min-w-0 flex-1 font-semibold">{t(`booking.agenda.status.${status}`)}</p>
        <Link to={studioSectionPath("glowbook")} className="font-bold underline underline-offset-4">{t("booking.page.glowbookLink")}</Link>
      </div>

      <div
        role="tablist"
        aria-label={t("booking.page.tabsLabel")}
        onKeyDown={onTabKey}
        className="flex gap-1 overflow-x-auto border-b border-[var(--border-subtle)] [scrollbar-width:none]"
      >
        {AGENDA_TABS.map((id) => {
          const Icon = TAB_ICON[id];
          const on = tab === id;
          const count = id === "appointments" ? toMark.length + upcoming.length : id === "closures" ? closures.length : 0;
          return (
            <button
              key={id}
              id={`${baseId}-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${baseId}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => selectTab(id)}
              className={clsx(
                "-mb-px inline-flex flex-none items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-bold transition-colors",
                on ? "border-[var(--gt-ink-900)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                focusRing,
              )}
            >
              <Icon size={15} aria-hidden="true" />
              {t(`booking.page.tabs.${id}`)}
              {count > 0 && (
                <span className="rounded-[var(--radius-pill)] bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--text-muted)]">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab}`} className="min-w-0">
        {tab === "appointments" && appointments}

        {tab === "week" && (
          <AgendaWeek
            week={week}
            today={today}
            timezone={tz}
            rows={rows}
            hours={calendar.hours}
            bookings={calendar.bookings}
            imported={imported}
            closures={closures}
            dirty={dirty}
            pendingCell={pendingCell}
            onWeek={setWeek}
            onToggle={(day, hour, state) => void toggle(day, hour, state)}
            onCloseDay={(day) => void closeDay(day)}
            onChanged={() => void load(true)}
            creationOf={creationOf}
          />
        )}

        {tab === "hours" && (
          <section aria-labelledby={`${ids.tz}-title`} className={card}>
            <h2 id={`${ids.tz}-title`} className={cardTitle}>{t("booking.agenda.settingsTitle")}</h2>
            <Checkbox label={t("booking.agenda.enable")} description={t("booking.agenda.enableHint")} checked={settings.enabled} onChange={(v) => edit("enabled", v)} />
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
                {WEEKDAYS.map((d) => {
                  const ranges = hours[d] ?? [];
                  const dayName = t(`booking.weekdays.${d}`);
                  return (
                    <li key={d} className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2.5 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center">
                      <span className="text-[13.5px] font-bold text-[var(--text-primary)]">{dayName}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        {ranges.length === 0 && (
                          <span className="inline-flex h-10 items-center px-1 text-[13px] text-[var(--text-subtle)]">{t("booking.agenda.closedDay")}</span>
                        )}
                        {ranges.map((r, i) => (
                          <span key={i} className={rangeGroup}>
                            <select
                              aria-label={t("booking.agenda.from", { day: dayName })}
                              className={timeSelect}
                              value={r.start}
                              onChange={(e) => editDay(d, hours[d].map((x, j) => (j === i ? { ...x, start: Number(e.target.value) } : x)))}
                            >
                              {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{hh(h)}</option>)}
                            </select>
                            <span aria-hidden="true" className="text-[var(--text-subtle)]">–</span>
                            <select
                              aria-label={t("booking.agenda.to", { day: dayName })}
                              className={timeSelect}
                              value={r.end}
                              onChange={(e) => editDay(d, hours[d].map((x, j) => (j === i ? { ...x, end: Number(e.target.value) } : x)))}
                            >
                              {HOURS.slice(1).map((h) => <option key={h} value={h}>{hh(h)}</option>)}
                            </select>
                            <button
                              type="button"
                              aria-label={t("booking.agenda.removeRange")}
                              onClick={() => editDay(d, hours[d].filter((_, j) => j !== i))}
                              className={clsx("ml-0.5 grid h-8 w-8 flex-none place-items-center rounded-[var(--radius-pill)] text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]", focusRing)}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </span>
                        ))}
                        {ranges.length < 4 && (
                          <button
                            type="button"
                            onClick={() => {
                              const last = ranges.at(-1);
                              const start = last ? Math.min(last.end + 1, 23) : 10;
                              editDay(d, [...ranges, { start, end: Math.min(start + 4, 24) }]);
                            }}
                            className={clsx("inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-pill)] border border-dashed border-[var(--border-strong)] px-3.5 text-[12.5px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]", focusRing)}
                          >
                            <Plus size={13} aria-hidden="true" />
                            {t("booking.agenda.addRange")}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
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
        )}

        {tab === "closures" && (
          <AgendaClosures
            closures={closures}
            upcoming={calendar.upcoming}
            timezone={tz}
            today={localDay(new Date().toISOString(), tz)}
            onChanged={() => void load(true)}
          />
        )}

        {tab === "sync" && (
          <div className="grid gap-6">
            <div className="grid gap-6 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">
              <GlowbookCalendarImport onChanged={() => void load(true)} />
              <GlowbookCalendarFeed />
            </div>
            {(calendar.blocks.length ?? 0) > 0 && (
              <section aria-labelledby={`${ids.horizon}-blocks`} className={card}>
                <h2 id={`${ids.horizon}-blocks`} className={cardTitle}>{t("booking.agenda.blocks")}</h2>
                <ul className="m-0 grid list-none gap-2 p-0">
                  {calendar.blocks.map((b) => (
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
        )}
      </div>
    </div>
  );
}

/** The appointments to record (past, outcome missing) and those to come. */
function AppointmentLists({
  upcoming,
  toMark,
  onChanged,
  creationOf,
}: {
  upcoming: ArtistCalendar["bookings"];
  toMark: ArtistCalendar["bookings"];
  onChanged: () => void;
  creationOf: CreationOf;
}) {
  const { t } = useTranslation();
  const ids = { mark: useId(), coming: useId() };
  return (
    <div className="grid gap-6">
      {toMark.length > 0 && (
        <section aria-labelledby={ids.mark} className={card}>
          <h2 id={ids.mark} className={cardTitle}>{t("booking.agenda.toMark", { count: toMark.length })}</h2>
          <p className={small}>{t("booking.agenda.toMarkHint")}</p>
          <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
            {toMark.map((b) => (
              <li key={b.id}>
                <ArtistBookingCard booking={b} creation={creationOf(b)} onChanged={onChanged} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby={ids.coming} className={card}>
        <h2 id={ids.coming} className={cardTitle}>{t("booking.agenda.upcoming", { count: upcoming.length })}</h2>
        {upcoming.length === 0 ? (
          <p className={small}>{t("booking.agenda.noneUpcoming")}</p>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
            {upcoming.map((b) => (
              <li key={b.id}>
                <ArtistBookingCard booking={b} creation={creationOf(b)} onChanged={onChanged} />
              </li>
            ))}
          </ul>
        )}
        <p className={small}>{t("booking.agenda.pastHint")}</p>
      </section>
    </div>
  );
}

/** What stands in place of the calendar: no plan, or no Glowbook page yet. */
function Gate({ icon: Icon, title, body, cta, to }: { icon: LucideIcon; title: string; body: string; cta: string; to: string }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={clsx(card, "max-w-[640px]")}>
      <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
        <Icon size={18} />
      </span>
      <h2 id={titleId} className={cardTitle}>{title}</h2>
      <p className="m-0 text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-body)]">{body}</p>
      <div>
        <Link
          to={to}
          className={clsx(
            "inline-flex h-10 items-center rounded-[var(--radius-pill)] bg-[var(--gt-ink-900)] px-5 text-[length:var(--text-body-sm)] font-bold text-white hover:bg-[var(--gt-ink-700)]",
            focusRing,
          )}
        >
          {cta}
        </Link>
      </div>
    </section>
  );
}
