import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Check, FolderPlus, PencilLine, Rows3, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "../../ui/Button";
import { useGlowbook } from "../../../lib/studioWorkspace/glowbookStore";
import {
  moveSection,
  SECTION_NAME_MAX,
  sectionCounts,
  validateSectionName,
  type GlowbookSection,
  type SectionProblem,
} from "../../../lib/studioWorkspace/glowbookSections";
import { fieldClass, iconButton } from "./workspaceStyles";

/**
 * "Sections of my page" (decision 102): the artist names, orders, renames and
 * deletes the sections their public page is filtered by. Creations are filed
 * from the list of Glowbook creations below (one section or none). Names are
 * public once the page is approved, like the bio. Writes follow the plan
 * switch in the database; deleting a section is always possible.
 */
export function GlowbookSections() {
  const { t } = useTranslation();
  const gb = useGlowbook();
  const ids = { name: useId(), error: useId() };
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<SectionProblem | "failed" | null>(null);
  const [busy, setBusy] = useState(false);
  const counts = sectionCounts(gb.items);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateSectionName(name, gb.sections);
    setProblem(found);
    if (found || busy) return;
    setBusy(true);
    const result = await gb.saveSection(null, name);
    setBusy(false);
    setProblem(result);
    if (result === null) setName("");
  };

  return (
    <section
      aria-labelledby="gt-glowbook-sections"
      className="grid gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)] sm:p-6"
    >
      <div className="grid gap-1">
        <h2
          id="gt-glowbook-sections"
          className="m-0 inline-flex items-center gap-2 text-[length:var(--text-h4)] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]"
        >
          <Rows3 size={18} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
          {t("studio.glowbook.sections.title")}
        </h2>
        <p className="m-0 text-[13px] leading-relaxed text-[var(--text-muted)]">{t("studio.glowbook.sections.sub")}</p>
      </div>

      {gb.sections.length === 0 ? (
        <p className="m-0 text-[13px] text-[var(--text-subtle)]">{t("studio.glowbook.sections.empty")}</p>
      ) : (
        <ol className="m-0 grid list-none gap-2 p-0">
          {gb.sections.map((section, index) => (
            <SectionRow key={section.id} section={section} count={counts.get(section.id) ?? 0} first={index === 0} last={index === gb.sections.length - 1} />
          ))}
        </ol>
      )}

      <form onSubmit={add} noValidate className="grid gap-1.5">
        <label htmlFor={ids.name} className="text-[12.5px] font-bold text-[var(--text-primary)]">
          {t("studio.glowbook.sections.nameLabel")}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={ids.name}
            value={name}
            maxLength={SECTION_NAME_MAX}
            placeholder={t("studio.glowbook.sections.addPlaceholder")}
            aria-invalid={!!problem}
            aria-describedby={problem ? ids.error : undefined}
            onChange={(e) => setName(e.target.value)}
            className={clsx(fieldClass, "min-w-0 flex-1 basis-[200px]")}
          />
          <Button type="submit" variant="outline" size="sm" iconLeft={FolderPlus} loading={busy}>
            {t("studio.glowbook.sections.add")}
          </Button>
        </div>
        {problem && (
          <p id={ids.error} role="alert" className="m-0 text-[12px] font-semibold text-[var(--status-error-fg)]">
            {t(`studio.glowbook.sections.errors.${problem}`, { max: SECTION_NAME_MAX })}
          </p>
        )}
      </form>
    </section>
  );
}

function SectionRow({ section, count, first, last }: { section: GlowbookSection; count: number; first: boolean; last: boolean }) {
  const { t } = useTranslation();
  const gb = useGlowbook();
  const ids = { input: useId(), error: useId() };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.name);
  const [problem, setProblem] = useState<SectionProblem | "failed" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateSectionName(draft, gb.sections, section.id);
    setProblem(found);
    if (found || busy) return;
    setBusy(true);
    const result = await gb.saveSection(section.id, draft);
    setBusy(false);
    setProblem(result);
    if (result === null) setEditing(false);
  };

  return (
    <li className="grid gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2">
      {editing ? (
        <form onSubmit={rename} noValidate className="flex flex-wrap items-center gap-2">
          <label htmlFor={ids.input} className="sr-only">
            {t("studio.glowbook.sections.renameLabel", { name: section.name })}
          </label>
          <input
            id={ids.input}
            value={draft}
            maxLength={SECTION_NAME_MAX}
            autoFocus
            aria-invalid={!!problem}
            aria-describedby={problem ? ids.error : undefined}
            onChange={(e) => setDraft(e.target.value)}
            className={clsx(fieldClass, "min-w-0 flex-1 basis-[180px]")}
          />
          <Button type="submit" variant="dark" size="sm" iconLeft={Check} loading={busy}>
            {t("studio.glowbook.sections.save")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={X}
            onClick={() => {
              setEditing(false);
              setDraft(section.name);
              setProblem(null);
            }}
          >
            {t("studio.glowbook.sections.cancel")}
          </Button>
        </form>
      ) : confirm ? (
        <div role="group" aria-label={t("studio.glowbook.sections.deleteConfirm", { name: section.name })} className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-[var(--status-error-fg)]">
            {t("studio.glowbook.sections.deleteConfirm", { name: section.name })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
            {t("studio.glowbook.sections.cancel")}
          </Button>
          <Button variant="danger" size="sm" iconLeft={Trash2} onClick={() => void gb.deleteSection(section)}>
            {t("studio.glowbook.sections.deleteYes")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 basis-[120px] truncate text-[14px] font-bold text-[var(--text-primary)]">{section.name}</span>
          <span className="text-[12px] text-[var(--text-muted)]">{t("studio.glowbook.sections.count", { count })}</span>
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className={iconButton}
              disabled={first}
              aria-label={t("studio.glowbook.sections.moveUp", { name: section.name })}
              title={t("studio.glowbook.sections.moveUp", { name: section.name })}
              onClick={() => void gb.moveSections(moveSection(gb.sections, section.id, -1))}
            >
              <ArrowUp size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={iconButton}
              disabled={last}
              aria-label={t("studio.glowbook.sections.moveDown", { name: section.name })}
              title={t("studio.glowbook.sections.moveDown", { name: section.name })}
              onClick={() => void gb.moveSections(moveSection(gb.sections, section.id, 1))}
            >
              <ArrowDown size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={iconButton}
              aria-label={t("studio.glowbook.sections.rename", { name: section.name })}
              title={t("studio.glowbook.sections.rename", { name: section.name })}
              onClick={() => {
                setDraft(section.name);
                setEditing(true);
              }}
            >
              <PencilLine size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={clsx(iconButton, "text-[var(--status-error-fg)]")}
              aria-label={t("studio.glowbook.sections.delete", { name: section.name })}
              title={t("studio.glowbook.sections.delete", { name: section.name })}
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </span>
        </div>
      )}
      {editing && problem && (
        <p id={ids.error} role="alert" className="m-0 text-[12px] font-semibold text-[var(--status-error-fg)]">
          {t(`studio.glowbook.sections.errors.${problem}`, { max: SECTION_NAME_MAX })}
        </p>
      )}
    </li>
  );
}
