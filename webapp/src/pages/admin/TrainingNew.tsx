import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CircleAlert, Wrench } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { CourseForm } from "../../components/admin/training/CourseForm";
import { blankCourse, useAdminTraining } from "../../lib/adminTraining";
import { useLocalized, type ContentLang } from "../../lib/localized";
import { useToast } from "../../lib/toast";
import type { TrainingCourse } from "../../data/adminTraining";
import { useAdminShell } from "./AdminLayout";

/**
 * Course creation.
 *
 * Only the course's information is asked for here. Structure comes next, in the
 * builder this page hands over to — asking someone to name their modules before
 * they have written the description is how half-built courses happen. The
 * hand-over is stated in the page rather than implied, so the short form does
 * not read as the whole job.
 */
export function TrainingNew() {
  const { t } = useTranslation();
  const L = useLocalized();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { createCourse, saving } = useAdminTraining();

  const [draft, setDraft] = useState<TrainingCourse>(() => blankCourse());
  const [lang, setLang] = useState<ContentLang>("fr");
  const [submitted, setSubmitted] = useState(false);

  const errors = useMemo(() => {
    const result: { title?: string; shortDescription?: string } = {};
    // Validated on the language being edited: demanding both translations
    // before a course exists would stop anyone starting one.
    if (draft.title[lang].trim() === "") result.title = t("admin.training.create.errorTitle");
    if (draft.shortDescription[lang].trim() === "") {
      result.shortDescription = t("admin.training.create.errorShort");
    }
    return result;
  }, [draft, lang, t]);

  const invalid = Object.keys(errors).length > 0;

  const submit = async () => {
    setSubmitted(true);
    if (invalid) {
      document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    const saved = await createCourse(draft);
    showToast(
      t("admin.training.toasts.createdTitle"),
      t("admin.training.toasts.createdBody", { name: L(saved.title) }),
    );
    navigate(`/admin/formations/${saved.id}`);
  };

  return (
    <>
      <AdminHeader
        title={t("admin.training.create.title")}
        description={t("admin.training.create.description")}
        crumbs={[
          { label: t("admin.nav.dashboard"), to: "/admin" },
          { label: t("admin.nav.training"), to: "/admin/formations" },
          { label: t("admin.training.create.title") },
        ]}
        onOpenNav={openNav}
        actions={
          <>
            <AdminButton variant="outline" onClick={() => navigate("/admin/formations")}>
              {t("admin.training.create.cancel")}
            </AdminButton>
            <AdminButton variant="primary" iconRight={ArrowRight} loading={saving} onClick={submit}>
              {t("admin.training.create.submit")}
            </AdminButton>
          </>
        }
      />

      <div className="grid gap-4 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        {submitted && invalid && (
          <p
            role="alert"
            className="m-0 flex items-start gap-2.5 rounded-[var(--admin-radius)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-4 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]"
          >
            <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
            {Object.values(errors).join(" · ")}
          </p>
        )}

        {/* What happens after "Create": stated before the form, because the
            answer changes how much someone bothers to fill in here. */}
        <div className="gt-admin-panel flex flex-wrap items-center gap-3 border-[var(--gt-blue-300)] bg-[var(--gt-blue-50)] p-4">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 flex-none place-items-center rounded-[var(--admin-radius-sm)] bg-[var(--gt-blue-200)] text-[var(--gt-blue-700)]"
          >
            <Wrench size={17} strokeWidth={1.9} />
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5">
            <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
              {t("admin.training.create.structureNote")}
            </strong>
            <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">
              {t("admin.training.create.structureNoteBody")}
            </span>
          </span>
        </div>

        <CourseForm
          draft={draft}
          onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
          lang={lang}
          onLangChange={setLang}
          errors={submitted ? errors : undefined}
        />

        <div className="flex flex-wrap justify-end gap-2">
          <AdminButton variant="outline" onClick={() => navigate("/admin/formations")}>
            {t("admin.training.create.cancel")}
          </AdminButton>
          <AdminButton variant="primary" iconRight={ArrowRight} loading={saving} onClick={submit}>
            {t("admin.training.create.submit")}
          </AdminButton>
        </div>
      </div>
    </>
  );
}
