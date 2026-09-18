import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, MessageSquarePlus, Pencil, Send, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import type { AdminNote } from "../../data/adminOrders";
import { pick } from "../../data/types";

/**
 * Internal notes on a customer.
 *
 * The lock and the sand-coloured surface do the same work they do on the order
 * page, and here the stakes are higher: an order note is about a parcel, a
 * customer note is about a person. "Three chargebacks opened on delivered
 * orders" is a fact for the team, and there is no worse bug in a back office
 * than a note that turns out to have been an email.
 *
 * So the panel states it three times — the header says internal, the hint
 * repeats it, and the composer says it again next to the send button, which is
 * where the mistake would actually be made.
 *
 * Editing and deleting are per note and belong to the note's own row rather
 * than to a selection mode: there are rarely more than three, and a mode is a
 * concept to learn in front of a two-click operation. Deleting asks first,
 * because a deleted note is the one thing on this page with nothing behind it.
 */
export function CustomerNotes({
  notes,
  author,
  onAdd,
  onEdit,
  onDelete,
}: {
  notes: AdminNote[];
  author: string;
  onAdd: (body: string) => void;
  onEdit: (noteId: string, body: string) => void;
  onDelete: (noteId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith("en") ? "en-IE" : "fr-FR";

  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminNote | null>(null);

  const stamp = (at: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
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

  const submitEdit = () => {
    const body = editDraft.trim();
    if (!body || !editingId) return;
    onEdit(editingId, body);
    setEditingId(null);
    setEditDraft("");
  };

  const startEdit = (note: AdminNote) => {
    setEditingId(note.id);
    setEditDraft(pick(note.body, lang));
  };

  return (
    <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--gt-ink-200)] bg-[var(--surface-sunken)] p-[var(--space-5)]">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[length:var(--text-h4)]">
          <Lock size={15} aria-hidden="true" className="text-[var(--text-muted)]" />
          {t("admin.customers.notesTitle")}
        </h2>
        {!composing && (
          <Button size="sm" variant="outline" iconLeft={MessageSquarePlus} onClick={() => setComposing(true)}>
            {t("admin.customers.notesAdd")}
          </Button>
        )}
      </header>

      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {t("admin.customers.notesHint")}
      </p>

      {/* The empty state carries the call to action rather than just describing
          the absence: an operator who opens Notes on a new customer is usually
          there to write one. */}
      {notes.length === 0 && !composing && (
        <div className="grid justify-items-start gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] p-5">
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("admin.customers.notesEmpty")}
          </p>
          <Button size="sm" variant="outline" iconLeft={MessageSquarePlus} onClick={() => setComposing(true)}>
            {t("admin.customers.notesAdd")}
          </Button>
        </div>
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
                <span className="flex items-center gap-1">
                  <span className="mr-1 text-[11px] tabular-nums text-[var(--text-subtle)]">{stamp(note.at)}</span>
                  <button
                    type="button"
                    onClick={() => startEdit(note)}
                    aria-label={t("admin.customers.notesEditLabel", { author: note.author })}
                    className="grid h-7 w-7 place-items-center rounded-[var(--radius-pill)] text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(note)}
                    aria-label={t("admin.customers.notesDeleteLabel", { author: note.author })}
                    className="grid h-7 w-7 place-items-center rounded-[var(--radius-pill)] text-[var(--text-muted)] transition-colors hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </span>
              </span>

              {editingId === note.id ? (
                <div className="grid gap-2">
                  <label className="grid gap-1.5">
                    <span className="sr-only">{t("admin.customers.notesEditLabel", { author: note.author })}</span>
                    <textarea
                      value={editDraft}
                      autoFocus
                      rows={3}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submitEdit();
                        if (e.key === "Escape") {
                          setEditingId(null);
                          setEditDraft("");
                        }
                      }}
                      className="gt-admin-field"
                    />
                  </label>
                  <span className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft("");
                      }}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button size="sm" disabled={!editDraft.trim()} onClick={submitEdit}>
                      {t("admin.customers.notesSave")}
                    </Button>
                  </span>
                </div>
              ) : (
                <p className="m-0 whitespace-pre-line text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-body)]">
                  {pick(note.body, lang)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {composing && (
        <div className="grid gap-2.5 rounded-[var(--radius-md)] border border-[var(--gt-ink-900)] bg-[var(--surface-card)] p-3.5">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
              {t("admin.customers.notesNewLabel", { author })}
            </span>
            <textarea
              value={draft}
              autoFocus
              rows={3}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter would be ambiguous in a multi-line field, so the
                // shortcut is the explicit one people know from chat clients.
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
                if (e.key === "Escape") {
                  setComposing(false);
                  setDraft("");
                }
              }}
              placeholder={t("admin.customers.notesPlaceholder")}
              className="gt-admin-field"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              <Lock size={12} aria-hidden="true" />
              {t("admin.customers.notesInternalOnly")}
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
                {t("common.cancel")}
              </Button>
              <Button size="sm" iconLeft={Send} disabled={!draft.trim()} onClick={submit}>
                {t("admin.customers.notesSave")}
              </Button>
            </span>
          </div>
        </div>
      )}

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        tone="danger"
        icon={<Trash2 size={18} />}
        title={t("admin.customers.notesDeleteTitle")}
        description={t("admin.customers.notesDeleteBody")}
        closeLabel={t("common.close")}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <span className="ml-auto">
              <Button
                size="sm"
                variant="dark"
                iconLeft={Trash2}
                onClick={() => {
                  if (deleteTarget) onDelete(deleteTarget.id);
                  setDeleteTarget(null);
                }}
              >
                {t("admin.customers.notesDeleteConfirm")}
              </Button>
            </span>
          </>
        }
      >
        {deleteTarget && (
          <p className="m-0 rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] p-3 text-[length:var(--text-body-sm)] italic text-[var(--text-body)]">
            {pick(deleteTarget.body, lang)}
          </p>
        )}
      </Dialog>
    </section>
  );
}
