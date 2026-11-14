"use client";

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { CalendarCheck, CalendarDays, Check, ChevronRight, LogIn, Sparkles, UserPlus } from "lucide-react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useAuth } from "../../lib/auth";
import { isCaptchaConfigured, useTurnstile } from "../../lib/captcha/turnstile";
import { bookSlot, fetchSlots } from "../../lib/glowbookBooking";
import {
  addDays,
  type BookingError,
  COMMENT_MAX,
  differentZone,
  formatDay,
  formatHour,
  formatWhen,
  groupSlotsByDay,
  NAME_MAX,
  type SlotList,
  validateDraft,
  zoneCity,
} from "../../lib/glowbookBookingMapping";
import { isLocale } from "../../lib/localeRoutes";
import { Link, useNavigate } from "../../lib/navigation";

/**
 * Booking an hour on an artist's Glowbook (decision 144). A signed-in member
 * picks a design (one of the page's creations, or a custom one described in
 * their own words), a free hour in the artist's time zone, and leaves a phone
 * number; the hour is locked at once and both sides get an e-mail. A visitor is
 * asked to sign in first. The database decides what is free and refuses what
 * breaks a rule; this dialog only explains its answers.
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
  items: readonly BookableItem[];
  /** Opened from a creation's "Book this design": it comes chosen. */
  initialItemId?: string | null;
}

const field =
  "w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 py-2.5 text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)] aria-[invalid=true]:border-[var(--status-error-fg)]";
const label = "text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]";
const chip = (on: boolean) =>
  clsx(
    "inline-flex min-h-10 items-center justify-center rounded-[var(--radius-pill)] border px-3.5 text-[13px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
    on
      ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-card)]"
      : "border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:border-[var(--text-primary)]",
  );

type Phase = { kind: "form" } | { kind: "sending" } | { kind: "done"; startsAt: string; timezone: string };

export function BookingDialog({ open, onClose, handle, artistName, items, initialItemId = null }: BookingDialogProps) {
  const { t, i18n } = useTranslation();
  const lang = isLocale(i18n.language) ? i18n.language : "fr";
  const { signedIn, profile } = useAuth();
  const navigate = useNavigate();
  const ids = { name: useId(), phone: useId(), comment: useId(), problem: useId(), design: useId() };

  const [slots, setSlots] = useState<SlotList | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error" | "closed">("idle");
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(initialItemId);
  const [custom, setCustom] = useState(initialItemId === null && items.length === 0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [showProblem, setShowProblem] = useState(false);
  const [error, setError] = useState<BookingError | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const captchaNeeded = isCaptchaConfigured;
  const { attach: attachCaptcha, token: captchaToken, reset: resetCaptcha } = useTurnstile(open && signedIn && captchaNeeded, lang);

  // A fresh form each time the dialog opens; the profile fills the name and phone.
  useEffect(() => {
    if (!open) return;
    setItemId(initialItemId);
    setCustom(initialItemId === null && items.length === 0);
    setSlot(null);
    setError(null);
    setShowProblem(false);
    setPhase({ kind: "form" });
    setComment("");
    if (profile) {
      setName(`${profile.firstName} ${profile.lastName}`.trim());
      setPhone(profile.phone ?? "");
    }
  }, [open, initialItemId, items.length, profile]);

  const load = useCallback(
    async (from?: string) => {
      setLoadState("loading");
      try {
        const next = await fetchSlots(handle, from, from ? addDays(from, 13) : undefined);
        if (!next) {
          setLoadState("closed");
          return;
        }
        setSlots((prev) => (prev && from ? { ...next, slots: [...new Set([...prev.slots, ...next.slots])], from: prev.from } : next));
        setLoadState("idle");
      } catch {
        setLoadState("error");
      }
    },
    [handle],
  );

  useEffect(() => {
    if (open && signedIn) void load();
  }, [open, signedIn, load]);

  const days = useMemo(() => (slots ? groupSlotsByDay(slots.slots, slots.timezone) : []), [slots]);
  const activeDay = day && days.some((d) => d.day === day) ? day : (days[0]?.day ?? null);
  const daySlots = days.find((d) => d.day === activeDay)?.slots ?? [];
  const timezone = slots?.timezone ?? "Europe/Paris";
  const [viewerZone, setViewerZone] = useState<string | undefined>(undefined);
  useEffect(() => setViewerZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  const canLoadMore = slots ? slots.to < addDays(slots.from, slots.horizonDays - 1) && slots.to !== "" : false;

  const draft = { slot, itemId, custom, name, phone, comment };
  const problem = validateDraft(draft);

  const goSignIn = (path: "/connexion" | "/inscription") => {
    const from = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/";
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
    const answer = await bookSlot({ handle, startsAt: slot, itemId: custom ? null : itemId, name, phone, comment, locale: lang, captcha });
    resetCaptcha();
    if (answer.kind === "booked") {
      setPhase({ kind: "done", startsAt: answer.startsAt, timezone: answer.timezone });
      return;
    }
    setPhase({ kind: "form" });
    setError(answer.error);
    if (answer.error === "slot_taken" || answer.error === "slot_unavailable") {
      setSlot(null);
      void load();
    }
  };

  const title = t("booking.dialog.title", { name: artistName });

  if (!signedIn) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={title}
        description={t("booking.gate.body", { name: artistName })}
        icon={<CalendarCheck size={18} />}
        closeLabel={t("booking.dialog.close")}
        footer={
          <>
            <Button variant="primary" iconLeft={LogIn} onClick={() => goSignIn("/connexion")}>
              {t("booking.gate.signIn")}
            </Button>
            <Button variant="outline" iconLeft={UserPlus} onClick={() => goSignIn("/inscription")}>
              {t("booking.gate.register")}
            </Button>
          </>
        }
      >
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("booking.gate.why")}</p>
      </Dialog>
    );
  }

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
        <>
          <Button variant="primary" type="submit" form={`${ids.problem}-form`} disabled={sending || loadState === "closed"} iconLeft={CalendarCheck}>
            {sending ? t("booking.dialog.sending") : t("booking.dialog.confirm")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t("booking.dialog.cancel")}
          </Button>
        </>
      }
    >
      <form id={`${ids.problem}-form`} onSubmit={submit} noValidate className="grid gap-5">
        {/* What the client wants */}
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className={clsx(label, "mb-2")}>{t("booking.design.title")}</legend>
          <div role="radiogroup" aria-describedby={ids.design} className="flex flex-wrap gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={!custom && itemId === item.id}
                onClick={() => { setCustom(false); setItemId(item.id); }}
                className={chip(!custom && itemId === item.id)}
              >
                {item.name}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={custom} onClick={() => { setCustom(true); setItemId(null); }} className={chip(custom)}>
              <Sparkles size={14} aria-hidden="true" className="mr-1.5" />
              {t("booking.design.custom")}
            </button>
          </div>
          <p id={ids.design} className="m-0 text-[12.5px] text-[var(--text-muted)]">
            {custom ? t("booking.design.customHint") : t("booking.design.hint")}
          </p>
        </fieldset>

        {/* When */}
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className={clsx(label, "mb-2")}>{t("booking.when.title")}</legend>
          {loadState === "loading" && !slots && <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("booking.when.loading")}</p>}
          {loadState === "error" && (
            <p role="alert" className="m-0 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
              {t("booking.when.error")}{" "}
              <button type="button" className="font-bold underline" onClick={() => void load()}>{t("booking.when.retry")}</button>
            </p>
          )}
          {loadState === "closed" && <p role="alert" className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("booking.when.closed")}</p>}
          {slots && days.length === 0 && loadState !== "loading" && (
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("booking.when.none")}</p>
          )}
          {days.length > 0 && (
            <>
              <div role="group" aria-label={t("booking.when.days")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {days.map((d) => (
                  <button key={d.day} type="button" aria-pressed={d.day === activeDay} onClick={() => { setDay(d.day); setSlot(null); }} className={clsx(chip(d.day === activeDay), "flex-none")}>
                    <CalendarDays size={14} aria-hidden="true" className="mr-1.5" />
                    {formatDay(d.day, lang, "short")}
                  </button>
                ))}
                {canLoadMore && (
                  <button type="button" onClick={() => slots && void load(addDays(slots.to, 1))} className={clsx(chip(false), "flex-none")}>
                    {t("booking.when.more")}
                    <ChevronRight size={14} aria-hidden="true" className="ml-1" />
                  </button>
                )}
              </div>
              <div role="radiogroup" aria-label={activeDay ? formatDay(activeDay, lang) : undefined} className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
                {daySlots.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={slot === s} onClick={() => setSlot(s)} className={chip(slot === s)}>
                    {formatHour(s, timezone, lang)}
                  </button>
                ))}
              </div>
              <p className="m-0 text-[12.5px] text-[var(--text-muted)]">
                {differentZone(timezone, viewerZone)
                  ? t("booking.when.zoneOther", { city: zoneCity(timezone) })
                  : t("booking.when.zone", { city: zoneCity(timezone) })}{" "}
                {t("booking.when.duration")}
              </p>
            </>
          )}
        </fieldset>

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
          <span className={label}>{custom ? t("booking.fields.commentRequired") : t("booking.fields.comment")}</span>
          <textarea
            id={ids.comment}
            className={clsx(field, "min-h-[96px] resize-y")}
            value={comment}
            maxLength={COMMENT_MAX}
            placeholder={t("booking.fields.commentPlaceholder")}
            onChange={(e) => setComment(e.target.value)}
            aria-invalid={showProblem && (problem === "comment" || problem === "commentLength")}
            aria-describedby={`${ids.comment}-hint`}
          />
          <span id={`${ids.comment}-hint`} className="text-[12px] text-[var(--text-muted)]">
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
      </form>
    </Dialog>
  );
}
