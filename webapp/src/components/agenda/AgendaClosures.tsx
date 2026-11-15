"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CalendarOff, CircleAlert, RotateCcw } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { addClosure, deleteClosure } from "../../lib/glowbookBooking";
import {
  addDays,
  type CalendarClosure,
  CLOSURE_NOTE_MAX,
  CLOSURES_MAX,
  closureLength,
  formatDay,
  validateClosure,
  type ClosureProblem,
} from "../../lib/glowbookBookingMapping";
import { useToast } from "../../lib/toast";
import { fieldClass } from "../studio/workspace/workspaceStyles";
import { agendaCard, agendaCardTitle, agendaLabel, agendaSmall } from "./agendaStyles";

/**
 * Time off (decision 147): whole local days closed at once — holidays, a
 * training, the salon closed. The database refuses every booking on those
 * days (`glowbook_book_slot`) and offers no slot there; appointments already
 * booked inside a new period are kept and counted, the artist cancels them
 * from the appointments tab if they want.
 */
export function AgendaClosures({
  closures,
  today,
  onChanged,
}: {
  closures: CalendarClosure[];
  /** The artist's local "YYYY-MM-DD". */
  today: string;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("en") ? "en" : "fr";
  const { showToast } = useToast();
  const ids = { from: useId(), to: useId(), note: useId(), problem: useId(), list: useId() };
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<ClosureProblem>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const full = closures.length >= CLOSURES_MAX;

  const period = (c: Pick<CalendarClosure, "startsOn" | "endsOn">) =>
    c.startsOn === c.endsOn
      ? t("booking.closures.oneDay", { day: formatDay(c.startsOn, lang) })
      : t("booking.closures.range", { from: formatDay(c.startsOn, lang), to: formatDay(c.endsOn, lang) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateClosure({ startsOn, endsOn, note }, today);
    setProblem(found);
    if (found) return;
    setSaving(true);
    const result = await addClosure(startsOn, endsOn, note);
    setSaving(false);
    if (!result.ok) {
      showToast(t("booking.artist.actionFailed"), t(`booking.artist.codes.${result.code}`, { defaultValue: t("booking.artist.codes.unavailable") }), "error");
      return;
    }
    showToast(
      t("booking.closures.added"),
      result.bookings > 0 ? t("booking.closures.addedKept", { count: result.bookings }) : t("booking.closures.addedNone"),
      result.bookings > 0 ? "info" : "success",
    );
    setStartsOn("");
    setEndsOn("");
    setNote("");
    onChanged();
  };

  const remove = async (c: CalendarClosure) => {
    setRemoving(c.id);
    const result = await deleteClosure(c.id);
    setRemoving(null);
    if (result.ok) {
      showToast(t("booking.closures.removed"), period(c), "success");
      onChanged();
    } else {
      showToast(t("booking.closures.removeFailed"), t(`booking.artist.codes.${result.code}`, { defaultValue: t("booking.artist.codes.unavailable") }), "error");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start [&>*]:min-w-0">
      <form onSubmit={(e) => void submit(e)} noValidate aria-describedby={problem ? ids.problem : undefined} className={agendaCard}>
        <h2 className={agendaCardTitle}>
          <CalendarOff size={17} aria-hidden="true" />
          {t("booking.closures.title")}
        </h2>
        <p className={agendaSmall}>{t("booking.closures.hint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label htmlFor={ids.from} className="grid gap-1.5">
            <span className={agendaLabel}>{t("booking.closures.from")}</span>
            <input
              id={ids.from}
              type="date"
              className={fieldClass}
              min={today}
              max={addDays(today, 366)}
              value={startsOn}
              onChange={(e) => {
                const next = e.target.value;
                setStartsOn(next);
                // A one-day period by default; a later start pushes the end along.
                if (next && (!endsOn || endsOn < next)) setEndsOn(next);
                setProblem(null);
              }}
            />
          </label>
          <label htmlFor={ids.to} className="grid gap-1.5">
            <span className={agendaLabel}>{t("booking.closures.to")}</span>
            <input
              id={ids.to}
              type="date"
              className={fieldClass}
              min={startsOn || today}
              max={addDays(today, 366)}
              value={endsOn}
              onChange={(e) => {
                setEndsOn(e.target.value);
                setProblem(null);
              }}
            />
          </label>
        </div>
        <label htmlFor={ids.note} className="grid gap-1.5">
          <span className={agendaLabel}>{t("booking.closures.note")}</span>
          <input
            id={ids.note}
            type="text"
            className={fieldClass}
            maxLength={CLOSURE_NOTE_MAX}
            placeholder={t("booking.closures.notePlaceholder")}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setProblem(null);
            }}
          />
          <span className={agendaSmall}>{t("booking.closures.noteHint")}</span>
        </label>
        {problem && (
          <p id={ids.problem} role="alert" className="m-0 text-[12.5px] font-semibold text-[var(--status-error-fg)]">
            {t(`booking.closures.problem.${problem}`)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" iconLeft={CalendarOff} disabled={saving || full} loading={saving}>
            {t("booking.closures.add")}
          </Button>
          {full && <span className={agendaSmall}>{t("booking.closures.max")}</span>}
        </div>
      </form>

      <section aria-labelledby={ids.list} className={agendaCard}>
        <h2 id={ids.list} className={agendaCardTitle}>{t("booking.closures.listTitle")}</h2>
        {closures.length === 0 ? (
          <p className={agendaSmall}>{t("booking.closures.none")}</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {closures.map((c) => (
              <li key={c.id} className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="grid min-w-0 gap-0.5">
                    <p className="m-0 flex flex-wrap items-center gap-2 text-[14px] font-bold text-[var(--text-primary)]">
                      {period(c)}
                      {c.startsOn <= today && <Badge tone="brand" size="sm">{t("booking.closures.current")}</Badge>}
                    </p>
                    <p className={agendaSmall}>
                      {t("booking.closures.days", { count: closureLength(c) })}
                      {c.note ? ` · ${c.note}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconLeft={RotateCcw}
                    disabled={removing === c.id}
                    aria-label={t("booking.closures.removeLabel", { period: period(c) })}
                    onClick={() => void remove(c)}
                  >
                    {t("booking.closures.remove")}
                  </Button>
                </div>
                {c.bookings > 0 && (
                  <p className="m-0 flex items-start gap-1.5 text-[12.5px] font-semibold text-[var(--status-warning-fg)]">
                    <CircleAlert size={14} aria-hidden="true" className="mt-0.5 flex-none" />
                    {t("booking.closures.kept", { count: c.bookings })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
