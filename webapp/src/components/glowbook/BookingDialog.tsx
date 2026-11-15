"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { Box, CalendarCheck, Check, ChevronLeft, ChevronRight, Gem, LogIn, PencilLine, UserPlus } from "lucide-react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useAuth } from "../../lib/auth";
import { isCaptchaConfigured, useTurnstile } from "../../lib/captcha/turnstile";
import { bookSlot, fetchOwnCreations, fetchSlots } from "../../lib/glowbookBooking";
import { forgetBookingCreation, readBookingCreation } from "../../lib/glowbookBookingCreation";
import { bookingReturnPath } from "../../lib/glowbookBookingReturn";
import {
  addDays,
  type BookingError,
  COMMENT_MAX,
  dayHeader,
  differentZone,
  formatDay,
  formatWhen,
  localDay,
  NAME_MAX,
  slotWeek,
  validateDraft,
  weekStart,
  zoneCity,
} from "../../lib/glowbookBookingMapping";
import { isLocale } from "../../lib/localeRoutes";
import { Link, useNavigate } from "../../lib/navigation";

/**
 * Booking an hour on an artist's Glowbook (decision 144). A signed-in member
 * picks a free hour in a week view of the artist's calendar (their time zone)
 * and leaves a phone number; the hour is locked at once and both sides get an
 * e-mail. Opened from a creation, the booking is for that creation (shown, not
 * changeable); opened from the page, it is a custom design the member
 * describes in the message, or one of the member's own Studio creations
 * (decision 148: the artist then opens it read-only from their calendar),
 * selected already when the member came from the Studio's "Book an artist
 * for this design" (`glowbookBookingCreation`). A visitor sees the same free hours (they are
 * public) and is asked to sign in only to confirm; the address carries their
 * hour through the sign-in screen, so the dialog opens again on it
 * (`glowbookBookingReturn`). The database decides what is free and refuses
 * what breaks a rule; this dialog only explains its answers.
 */

export interface BookableItem {
  id: string;
  name: string;
}

interface BookingDialogProps {
  open: boolean;
  onClose: () => void;
  handle: string;
  artistName: string;
  /** Opened from a creation's "Book this design": the booking is for it. */
  creation?: BookableItem | null;
  /** Back from signing in: the hour chosen before, selected again if it is still free. */
  initialSlot?: string | null;
}

const field =
  "w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 py-2.5 text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)] aria-[invalid=true]:border-[var(--status-error-fg)]";
const label = "text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]";

const cellBase = "grid h-8 w-full place-items-center rounded-[6px] border";
const CELL = {
  free: "cursor-pointer border-[var(--gt-blue-400)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)] hover:border-[var(--gt-blue-700)] hover:bg-[var(--gt-blue-200)]",
  chosen: "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-white",
  unavailable: "border-transparent bg-[var(--surface-sunken)] opacity-60",
} as const;
const navButton =
  "grid h-9 w-9 place-items-center rounded-[var(--radius-pill)] border border-[var(--border-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-40";
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

type Phase = { kind: "form" } | { kind: "sending" } | { kind: "done"; startsAt: string; timezone: string };

export function BookingDialog({ open, onClose, handle, artistName, creation = null, initialSlot = null }: BookingDialogProps) {
  const { t, i18n } = useTranslation();
  const lang = isLocale(i18n.language) ? i18n.language : "fr";
  const { signedIn, profile } = useAuth();
  const navigate = useNavigate();
  const ids = { name: useId(), phone: useId(), comment: useId(), problem: useId(), design: useId(), when: useId(), mine: useId() };
  // From the page: a custom idea, or one of the member's own Studio creations (decision 148).
  const [designMode, setDesignMode] = useState<"custom" | "mine">("custom");
  const [ownCreations, setOwnCreations] = useState<{ id: string; name: string }[] | null>(null);
  const [ownCreationId, setOwnCreationId] = useState<string>("");

  // Free slots gathered week by week; `today` and the horizon come from the first answer.
  const [calendar, setCalendar] = useState<{ timezone: string; today: string; lastDay: string } | null>(null);
  const [free, setFree] = useState<string[]>([]);
  const [loadedWeeks, setLoadedWeeks] = useState<ReadonlySet<string>>(new Set());
  const [week, setWeek] = useState<string | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error" | "closed">("idle");
  const [slot, setSlot] = useState<string | null>(null);
  const wantedSlot = useRef<string | null>(initialSlot);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [showProblem, setShowProblem] = useState(false);
  const [error, setError] = useState<BookingError | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const captchaNeeded = isCaptchaConfigured;
  const { attach: attachCaptcha, token: captchaToken, reset: resetCaptcha } = useTurnstile(open && signedIn && captchaNeeded, lang);

  // A fresh form each time the dialog opens (not when the profile reloads
  // while it is open: that would wipe a choice).
  useEffect(() => {
    if (!open) return;
    setSlot(null);
    wantedSlot.current = initialSlot;
    setError(null);
    setShowProblem(false);
    setPhase({ kind: "form" });
    setComment("");
    setDesignMode("custom");
    setOwnCreationId("");
  }, [open, initialSlot]);

  // The member's own creations, from the page only; the one chosen in the Studio comes selected.
  useEffect(() => {
    if (!open || !signedIn || creation) return;
    let live = true;
    fetchOwnCreations()
      .then((list) => {
        if (!live) return;
        setOwnCreations(list ?? []);
        const chosen = readBookingCreation();
        if (chosen && list?.some((c) => c.id === chosen.id)) {
          setDesignMode("mine");
          setOwnCreationId(chosen.id);
        } else if (list && list.length > 0) {
          setOwnCreationId(list[0].id);
        }
      })
      .catch(() => live && setOwnCreations([]));
    return () => {
      live = false;
    };
  }, [open, signedIn, creation]);

  // The profile fills the name and phone, once it is there.
  useEffect(() => {
    if (!open || !profile) return;
    setName(`${profile.firstName} ${profile.lastName}`.trim());
    setPhone(profile.phone ?? "");
  }, [open, profile]);

  // First answer: the next two weeks (this week and the next are complete),
  // opened on the week of the first free hour.
  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const next = await fetchSlots(handle);
      if (!next || !next.from) {
        setLoadState("closed");
        return;
      }
      const thisWeek = weekStart(next.from);
      // Back from signing in: the hour chosen before, if it is still free.
      const wanted = wantedSlot.current ? Date.parse(wantedSlot.current) : NaN;
      wantedSlot.current = null;
      const kept = next.slots.find((s) => Date.parse(s) === wanted) ?? null;
      const first = kept ?? [...next.slots].sort()[0];
      setCalendar({ timezone: next.timezone, today: next.from, lastDay: addDays(next.from, next.horizonDays) });
      setFree(next.slots);
      setLoadedWeeks(new Set([thisWeek, addDays(thisWeek, 7)]));
      setWeek(first ? weekStart(localDay(first, next.timezone)) : thisWeek);
      if (kept) setSlot(kept);
      setLoadState("idle");
    } catch {
      setLoadState("error");
    }
  }, [handle]);

  // Free hours are public: a visitor sees them before being asked to sign in.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Later weeks are asked for when the member reaches them.
  useEffect(() => {
    if (!calendar || !week || loadedWeeks.has(week)) return;
    let live = true;
    setWeekLoading(true);
    fetchSlots(handle, week < calendar.today ? calendar.today : week, addDays(week, 6))
      .then((next) => {
        if (!live) return;
        setFree((prev) => [...new Set([...prev, ...(next?.slots ?? [])])]);
        setLoadedWeeks((prev) => new Set([...prev, week]));
      })
      .catch(() => live && setLoadState("error"))
      .finally(() => live && setWeekLoading(false));
    return () => {
      live = false;
    };
  }, [calendar, week, loadedWeeks, handle]);

  const retry = () => {
    setLoadedWeeks(new Set());
    void load();
  };

  const timezone = calendar?.timezone ?? "Europe/Paris";
  const grid = useMemo(() => (week ? slotWeek(free, timezone, week) : null), [free, timezone, week]);
  const [viewerZone, setViewerZone] = useState<string | undefined>(undefined);
  useEffect(() => setViewerZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  const canGoBack = !!calendar && !!week && week > weekStart(calendar.today);
  const canGoOn = !!calendar && !!week && addDays(week, 7) <= calendar.lastDay;

  const custom = creation === null;
  const clientCreationId = custom && designMode === "mine" && ownCreationId ? ownCreationId : null;
  const describe = custom && !clientCreationId;
  const draft = { slot, itemId: creation?.id ?? null, clientCreationId, custom, name, phone, comment };
  const problem = validateDraft(draft);

  const goSignIn = (path: "/connexion" | "/inscription") => {
    const from =
      typeof window !== "undefined"
        ? bookingReturnPath(window.location.pathname, window.location.search, { itemId: creation?.id ?? null, slot })
        : "/";
    onClose();
    navigate(path, { state: { from, reason: "booking" } });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setShowProblem(true);
    if (problem || !slot) return;
    setPhase({ kind: "sending" });
    setError(null);
    const captcha = captchaNeeded ? await captchaToken() : null;
    const answer = await bookSlot({ handle, startsAt: slot, itemId: creation?.id ?? null, clientCreationId, name, phone, comment, locale: lang, captcha });
    resetCaptcha();
    if (answer.kind === "booked") {
      if (clientCreationId) forgetBookingCreation();
      setPhase({ kind: "done", startsAt: answer.startsAt, timezone: answer.timezone });
      return;
    }
    setPhase({ kind: "form" });
    setError(answer.error);
    if (answer.error === "slot_taken" || answer.error === "slot_unavailable") {
      setSlot(null);
      retry();
    }
  };

  const title = t("booking.dialog.title", { name: artistName });

  if (phase.kind === "done") {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={t("booking.done.title")}
        icon={<Check size={18} />}
        closeLabel={t("booking.dialog.close")}
        footer={
          <>
            <Button variant="primary" onClick={() => { onClose(); navigate("/compte/rendez-vous"); }}>
              {t("booking.done.mine")}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {t("booking.dialog.close")}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
          <p className="m-0 font-bold text-[var(--text-primary)]">
            {t("booking.done.when", { name: artistName, when: formatWhen(phase.startsAt, phase.timezone, lang) })}
          </p>
          <p className="m-0">{t("booking.done.body")}</p>
          <p className="m-0 text-[var(--text-muted)]">{t("booking.done.cancel")}</p>
        </div>
      </Dialog>
    );
  }

  const sending = phase.kind === "sending";
  const problemText = showProblem && problem ? t(`booking.problem.${problem}`) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      description={t("booking.dialog.sub")}
      icon={<CalendarCheck size={18} />}
      closeLabel={t("booking.dialog.close")}
      footer={
        signedIn ? (
          <>
            <Button variant="primary" type="submit" form={`${ids.problem}-form`} disabled={sending || loadState === "closed"} iconLeft={CalendarCheck}>
              {sending ? t("booking.dialog.sending") : t("booking.dialog.confirm")}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {t("booking.dialog.cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" iconLeft={LogIn} disabled={loadState === "closed"} onClick={() => goSignIn("/connexion")}>
              {t("booking.gate.signIn")}
            </Button>
            <Button variant="outline" iconLeft={UserPlus} disabled={loadState === "closed"} onClick={() => goSignIn("/inscription")}>
              {t("booking.gate.register")}
            </Button>
          </>
        )
      }
    >
      <form id={`${ids.problem}-form`} onSubmit={submit} noValidate className="grid gap-5">
        {/* The creation, when the booking started from one: shown, not changeable */}
        {creation && (
          <section aria-labelledby={ids.design} className="grid gap-2">
            <h3 id={ids.design} className={clsx(label, "m-0")}>{t("booking.design.title")}</h3>
            <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3.5 py-3">
              <span aria-hidden="true" className="grid h-9 w-9 flex-none place-items-center rounded-[var(--radius-pill)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]">
                <Gem size={16} />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate text-[14px] font-bold text-[var(--text-primary)]">{creation.name}</span>
                <span className="text-[12.5px] text-[var(--text-muted)]">{t("booking.design.chosenHint", { name: artistName })}</span>
              </span>
            </div>
          </section>
        )}

        {/* When: the artist's week, laid out like their own calendar */}
        <fieldset className="m-0 grid min-w-0 gap-3 border-0 p-0">
          <legend className={clsx(label, "mb-2")}>{t("booking.when.title")}</legend>
          {loadState === "loading" && !calendar && <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("booking.when.loading")}</p>}
          {loadState === "error" && (
            <p role="alert" className="m-0 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
              {t("booking.when.error")}{" "}
              <button type="button" className="font-bold underline" onClick={retry}>{t("booking.when.retry")}</button>
            </p>
          )}
          {loadState === "closed" && <p role="alert" className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("booking.when.closed")}</p>}
          {calendar && week && grid && loadState !== "closed" && (
            <>
              <div className="flex items-center justify-between gap-2">
                <button type="button" aria-label={t("booking.when.prevWeek")} disabled={!canGoBack} onClick={() => setWeek(addDays(week, -7))} className={navButton}>
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <span id={ids.when} aria-live="polite" className="text-center text-[13px] font-semibold text-[var(--text-primary)]">
                  {formatDay(week, lang, "short")} – {formatDay(addDays(week, 6), lang, "short")}
                </span>
                <button type="button" aria-label={t("booking.when.nextWeek")} disabled={!canGoOn} onClick={() => setWeek(addDays(week, 7))} className={navButton}>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>

              {weekLoading && grid.hours.length === 0 ? (
                <div role="status" className="gt-skeleton h-48 rounded-[var(--radius-md)]">
                  <span className="sr-only">{t("booking.when.weekLoading")}</span>
                </div>
              ) : grid.hours.length === 0 ? (
                <p className="m-0 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] px-4 py-6 text-center text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                  {t("booking.when.weekEmpty")}
                </p>
              ) : (
                <div className="-mx-1 overflow-x-auto px-1">
                  <table aria-describedby={ids.when} className="w-full min-w-[300px] table-fixed border-separate border-spacing-[3px] text-[11px] sm:border-spacing-1 sm:text-[11.5px]">
                    <caption className="sr-only">{t("booking.when.title")}</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="w-9 sm:w-11" />
                        {grid.days.map((d) => {
                          const head = dayHeader(d, lang);
                          return (
                            <th key={d} scope="col" abbr={formatDay(d, lang)} className="pb-1 text-center font-semibold text-[var(--text-muted)]">
                              <span className="block text-[10.5px] uppercase tracking-[var(--tracking-wide)]">{head.weekday}</span>
                              <span
                                className={clsx(
                                  "mx-auto mt-0.5 grid h-6 w-6 place-items-center rounded-[var(--radius-pill)] text-[12.5px] font-bold",
                                  d === calendar.today ? "bg-[var(--gt-ink-900)] text-white" : "text-[var(--text-primary)]",
                                )}
                              >
                                {head.date}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {grid.hours.map((hour) => (
                        <tr key={hour}>
                          <th scope="row" className="pr-1 text-right font-semibold tabular-nums text-[var(--text-subtle)]">{hh(hour)}</th>
                          {grid.days.map((d) => {
                            const at = grid.free.get(`${d}|${hour}`);
                            if (!at) {
                              return (
                                <td key={d} className="p-0">
                                  <div aria-hidden="true" className={clsx(cellBase, CELL.unavailable)} />
                                </td>
                              );
                            }
                            const chosen = slot === at;
                            return (
                              <td key={d} className="p-0">
                                <button
                                  type="button"
                                  aria-pressed={chosen}
                                  aria-label={t("booking.when.cell", { day: formatDay(d, lang), hour: hh(hour) })}
                                  onClick={() => setSlot(at)}
                                  className={clsx(
                                    cellBase,
                                    "transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]",
                                    chosen ? CELL.chosen : CELL.free,
                                  )}
                                >
                                  <span aria-hidden="true" className="inline-flex items-center gap-0.5 text-[9.5px] font-bold tabular-nums sm:text-[10.5px]">
                                    {chosen && <Check size={12} className="hidden sm:block" />}
                                    {hh(hour)}
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
              )}

              <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[11.5px] text-[var(--text-muted)]">
                {(["free", "chosen", "unavailable"] as const).map((k) => (
                  <li key={k} className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className={clsx("inline-block h-3 w-4 rounded-[3px] border", CELL[k])} />
                    {t(`booking.when.${k}`)}
                  </li>
                ))}
              </ul>

              <p
                aria-live="polite"
                className={clsx(
                  "m-0 rounded-[var(--radius-md)] px-3.5 py-2.5 text-[length:var(--text-body-sm)]",
                  slot ? "bg-[var(--surface-brand-wash)] font-bold text-[var(--text-primary)]" : "bg-[var(--surface-page)] text-[var(--text-muted)]",
                )}
              >
                {slot ? t("booking.when.picked", { when: formatWhen(slot, timezone, lang) }) : t("booking.when.pick")}
              </p>
              <p className="m-0 text-[12.5px] text-[var(--text-muted)]">
                {differentZone(timezone, viewerZone)
                  ? t("booking.when.zoneOther", { city: zoneCity(timezone) })
                  : t("booking.when.zone", { city: zoneCity(timezone) })}{" "}
                {t("booking.when.duration")}
              </p>
            </>
          )}
        </fieldset>

        {!signedIn && (
          <div className="grid gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-3.5 py-3 text-[length:var(--text-body-sm)]">
            <p className="m-0 font-semibold text-[var(--text-primary)]">{t("booking.gate.toConfirm", { name: artistName })}</p>
            <p className="m-0 text-[var(--text-muted)]">{t("booking.gate.why")}</p>
          </div>
        )}
        {signedIn && (
          <>
        {/* What, from the page: a custom idea, or one of the member's own Studio creations */}
        {custom && ownCreations && ownCreations.length > 0 && (
          <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
            <legend className={clsx(label, "mb-2")}>{t("booking.design.title")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["custom", "mine"] as const).map((mode) => (
                <label
                  key={mode}
                  className={clsx(
                    "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border px-3.5 py-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                    designMode === mode ? "border-[var(--gt-ink-900)] bg-[var(--surface-brand-wash)]" : "border-[var(--border-subtle)] bg-[var(--surface-card)]",
                  )}
                >
                  <input type="radio" name={ids.design} value={mode} checked={designMode === mode} onChange={() => setDesignMode(mode)} className="sr-only" />
                  <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-[var(--radius-pill)] bg-[var(--surface-page)] text-[var(--gt-blue-700)]">
                    {mode === "custom" ? <PencilLine size={15} /> : <Box size={15} />}
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-[14px] font-bold text-[var(--text-primary)]">{t(`booking.design.${mode === "custom" ? "custom" : "mine"}`)}</span>
                    <span className="text-[12.5px] text-[var(--text-muted)]">{t(`booking.design.${mode === "custom" ? "customSub" : "mineSub"}`, { name: artistName })}</span>
                  </span>
                  {designMode === mode && <Check size={16} aria-hidden="true" className="ml-auto flex-none text-[var(--text-primary)]" />}
                </label>
              ))}
            </div>
            {designMode === "mine" && (
              <label htmlFor={ids.mine} className="grid gap-1.5">
                <span className={label}>{t("booking.design.pick")}</span>
                <select id={ids.mine} className={field} value={ownCreationId} onChange={(e) => setOwnCreationId(e.target.value)}>
                  {ownCreations.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || t("studio.workspace.untitled")}</option>
                  ))}
                </select>
                <span className="text-[12px] text-[var(--text-muted)]">{t("booking.design.mineHint", { name: artistName })}</span>
              </label>
            )}
          </fieldset>
        )}

        {/* Who */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor={ids.name} className="grid gap-1.5">
            <span className={label}>{t("booking.fields.name")}</span>
            <input id={ids.name} className={field} value={name} maxLength={NAME_MAX} autoComplete="name" onChange={(e) => setName(e.target.value)} aria-invalid={showProblem && problem === "name"} />
          </label>
          <label htmlFor={ids.phone} className="grid gap-1.5">
            <span className={label}>{t("booking.fields.phone")}</span>
            <input id={ids.phone} className={field} value={phone} inputMode="tel" autoComplete="tel" onChange={(e) => setPhone(e.target.value)} aria-invalid={showProblem && problem === "phone"} />
          </label>
        </div>
        <label htmlFor={ids.comment} className="grid gap-1.5">
          <span className={label}>{describe ? t("booking.fields.commentRequired") : t("booking.fields.comment")}</span>
          <textarea
            id={ids.comment}
            className={clsx(field, "min-h-[112px] resize-y leading-relaxed")}
            value={comment}
            maxLength={COMMENT_MAX}
            placeholder={t("booking.fields.commentPlaceholder")}
            onChange={(e) => setComment(e.target.value)}
            aria-invalid={showProblem && (problem === "comment" || problem === "commentLength")}
            aria-describedby={`${ids.comment}-hint`}
          />
          <span id={`${ids.comment}-hint`} className="text-[12px] text-[var(--text-muted)]">
            {describe && <>{t("booking.fields.customHint")}{" "}</>}
            {t("booking.fields.noHealth")} · {comment.length}/{COMMENT_MAX}
          </span>
        </label>

        <div ref={attachCaptcha} />
        {(problemText || error) && (
          <p id={ids.problem} role="alert" className="m-0 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-3.5 py-2.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--status-error-fg)]">
            {error ? t(`booking.error.${error}`) : problemText}
          </p>
        )}

        <p className="m-0 text-[12px] leading-relaxed text-[var(--text-muted)]">
          {t("booking.info", { name: artistName })}{" "}
          <Link to="/confidentialite" className="font-semibold underline">
            {t("booking.privacy")}
          </Link>
        </p>
          </>
        )}
      </form>
    </Dialog>
  );
}
