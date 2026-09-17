import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, MessageSquarePlus, Send } from "lucide-react";
import { Button } from "../ui/Button";
import type { AdminNote } from "../../data/adminOrders";
import { pick } from "../../data/types";

/**
 * Internal notes.
 *
 * The lock and the sand-coloured surface are doing real work: these notes are
 * the one place in the interface where an operator could mistake an internal
 * remark for something the customer will read. "Marc — Logistique: parcel held
 * at the sorting centre" is a fact for the team, and there is no worse bug in a
 * back office than a note that turns out to have been an email.
 *
 * So the panel states it twice — the header says internal, and the composer
 * repeats it next to the send button, where the mistake would actually be made.
 */
export function OrderNotes({
  notes,
  onAdd,
  author,
}: {
  notes: AdminNote[];
  onAdd: (body: string) => void;
  author: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith("en") ? "en-IE" : "fr-FR";
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);

  const stamp = (at: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(`${at}:00`));

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    onAdd(body);
    setDraft("");
    setComposing(false);
  };

  return (
    <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--gt-ink-200)] bg-[var(--surface-sunken)] p-[var(--space-5)]">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[length:var(--text-h4)]">
          <Lock size={15} aria-hidden="true" className="text-[var(--text-muted)]" />
          {t("admin.orders.notesTitle")}
        </h2>
        {!composing && (
          <Button size="sm" variant="outline" iconLeft={MessageSquarePlus} onClick={() => setComposing(true)}>
            {t("admin.orders.notesAdd")}
          </Button>
        )}
      </header>

      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.orders.notesHint")}</p>

      {notes.length === 0 && !composing && (
        <p className="m-0 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] p-4 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("admin.orders.notesEmpty")}
        </p>
      )}

      {notes.length > 0 && (
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {notes.map((note) => (
            <li
              key={note.id}
              className="grid gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3.5"
            >
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{note.author}</strong>
                <span className="text-[11px] tabular-nums text-[var(--text-subtle)]">{stamp(note.at)}</span>
              </span>
              <p className="m-0 text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-body)]">
                {pick(note.body, lang)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {composing && (
        <div className="grid gap-2.5 rounded-[var(--radius-md)] border border-[var(--gt-ink-900)] bg-[var(--surface-card)] p-3.5">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
              {t("admin.orders.notesNewLabel", { author })}
            </span>
            <textarea
              value={draft}
              autoFocus
              rows={3}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter would be ambiguous in a multi-line field, so the shortcut
                // is the explicit one people already know from chat clients.
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
                if (e.key === "Escape") {
                  setComposing(false);
                  setDraft("");
                }
              }}
              placeholder={t("admin.orders.notesPlaceholder")}
              className="resize-y rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-card)] p-3 text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)]"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              <Lock size={12} aria-hidden="true" />
              {t("admin.orders.notesInternalOnly")}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setComposing(false);
                  setDraft("");
                }}
              >
                {t("admin.orders.dialogKeep")}
              </Button>
              <Button size="sm" iconLeft={Send} disabled={!draft.trim()} onClick={submit}>
                {t("admin.orders.notesSave")}
              </Button>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
