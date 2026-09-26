import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  CircleDashed,
  CircleDot,
  Clock,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Loader2,
  Video,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import type { BlockType, CourseStatus } from "../../../data/adminTraining";
import { CONTENT_LANGS, type ContentLang } from "../../../lib/localized";
import type { Localized } from "../../../data/types";

/**
 * The small shared pieces of the training workspace.
 *
 * They live together because each one is a few lines and all of them appear on
 * three or more screens — splitting them into their own files would make the
 * builder harder to read, not easier.
 */

/* -------------------------------------------------------------------------- */
/* Status, level and type indicators                                           */
/* -------------------------------------------------------------------------- */

/**
 * Publication status.
 *
 * Colour carries the meaning fastest, so it is never the only carrier: each
 * badge also has a word and a shape. The four statuses are close enough in
 * meaning — draft, review, published, unpublished — that a tint alone would
 * make them guesswork.
 */
const STATUS_STYLE: Record<CourseStatus, { className: string; icon: LucideIcon }> = {
  draft: { className: "bg-[var(--surface-sunken)] text-[var(--text-body)]", icon: CircleDashed },
  review: { className: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]", icon: HelpCircle },
  published: { className: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]", icon: Check },
  unpublished: { className: "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]", icon: CircleDot },
};

export function StatusBadge({ status, size = "md" }: { status: CourseStatus; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const { className, icon: Icon } = STATUS_STYLE[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] font-semibold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[length:var(--text-caption)]",
        className,
      )}
    >
      <Icon size={size === "sm" ? 11 : 13} strokeWidth={2.2} aria-hidden="true" />
      {t(`admin.training.status.${status}`)}
    </span>
  );
}

/** Neutral metadata pill: level, category, duration. Never a status. */
export function MetaPill({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] px-2.5 py-1 text-[length:var(--text-caption)] font-medium text-[var(--text-muted)] whitespace-nowrap">
      {Icon && <Icon size={12} strokeWidth={2} aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * Content-block type marker.
 *
 * The three block types are the thing an administrator scans a long step for,
 * so each gets its own colour *and* its own icon *and* its own word. Icons
 * alone would leave the list unreadable to anyone who does not already know
 * which glyph means video.
 */
export const BLOCK_STYLE: Record<BlockType, { icon: LucideIcon; className: string }> = {
  text: { icon: FileText, className: "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]" },
  image: { icon: ImageIcon, className: "bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)]" },
  video: { icon: Video, className: "bg-[var(--gt-emerald-50)] text-[var(--accent-cta-ink)]" },
};

export function BlockTypeBadge({ type }: { type: BlockType }) {
  const { t } = useTranslation();
  const { icon: Icon, className } = BLOCK_STYLE[type];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)]",
        className,
      )}
    >
      <Icon size={11} strokeWidth={2.2} aria-hidden="true" />
      {t(`admin.training.blocks.${type}`)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Panels                                                                      */
/* -------------------------------------------------------------------------- */

/** A titled panel. The workspace's only grouping surface, as in the catalogue. */
export function Section({
  title,
  description,
  aside,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("gt-admin-panel p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="flex items-center gap-2 text-[length:var(--text-h4)]">
            {Icon && <Icon size={16} strokeWidth={2} aria-hidden="true" className="text-[var(--text-muted)]" />}
            {title}
          </h2>
          {description && (
            <p className="m-0 max-w-[62ch] text-[length:var(--text-caption)] text-[var(--text-muted)]">{description}</p>
          )}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Bilingual authoring                                                         */
/* -------------------------------------------------------------------------- */

/**
 * FR/EN switch for one editing surface.
 *
 * Copied in behaviour from the product form on purpose: an administrator who
 * has learnt it on the catalogue should not have to learn it again here. The
 * missing-translation marker is a dot plus a word, never a dot alone.
 */
export function LangSwitch({
  lang,
  onChange,
  probe,
}: {
  lang: ContentLang;
  onChange: (lang: ContentLang) => void;
  /** The field whose emptiness marks a language as untranslated. */
  probe?: Localized;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t("admin.form.contentLanguage")}
      className="flex flex-none gap-0.5 rounded-[var(--radius-pill)] bg-[var(--surface-sunken)] p-0.5"
    >
      {CONTENT_LANGS.map((code) => {
        const active = lang === code;
        const missing = probe ? probe[code].trim() === "" : false;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            aria-pressed={active}
            className={clsx(
              "inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[var(--tracking-wide)] transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]",
              active
                ? "bg-[var(--gt-ink-900)] text-[var(--text-inverse)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            )}
          >
            {code}
            {missing && (
              <>
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--accent-highlight)]" />
                <span className="sr-only">{t("admin.form.translationMissing")}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Save state                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether the work in front of the administrator is safe.
 *
 * Three states, each with its own word: saving, unsaved, saved. The dot is
 * decoration — the sentence is the message, and it is in a polite live region
 * so the change is announced rather than only seen.
 */
export function SaveIndicator({
  dirty,
  saving,
  lastSavedAt,
}: {
  dirty: boolean;
  saving: boolean;
  lastSavedAt: string | null;
}) {
  const { t, i18n } = useTranslation();

  const label = saving
    ? t("admin.training.save.saving")
    : dirty
      ? t("admin.training.save.unsaved")
      : lastSavedAt
        ? t("admin.training.save.lastSaved", {
            time: new Date(lastSavedAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }),
          })
        : t("admin.training.save.saved");

  return (
    <p
      role="status"
      aria-live="polite"
      className={clsx(
        "m-0 inline-flex items-center gap-1.5 whitespace-nowrap text-[length:var(--text-caption)] font-medium",
        dirty && !saving ? "text-[var(--status-warning-fg)]" : "text-[var(--text-muted)]",
      )}
    >
      {saving ? (
        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
      ) : dirty ? (
        <CircleDot size={13} strokeWidth={2.2} aria-hidden="true" />
      ) : (
        <Check size={13} strokeWidth={2.4} aria-hidden="true" className="text-[var(--status-success-fg)]" />
      )}
      {label}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Counts                                                                      */
/* -------------------------------------------------------------------------- */

/** Module / step / quiz counts, as one scannable row. */
export function CountRow({
  modules,
  steps,
  quizzes,
  className,
}: {
  modules: number;
  steps: number;
  quizzes: number;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={clsx("flex flex-wrap items-center gap-1.5", className)}>
      <MetaPill icon={Layers}>{t("admin.training.list.modules", { count: modules })}</MetaPill>
      <MetaPill icon={FileText}>{t("admin.training.list.steps", { count: steps })}</MetaPill>
      {quizzes > 0 ? (
        <MetaPill icon={ListChecks}>{t("admin.training.list.quizzes", { count: quizzes })}</MetaPill>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-dashed border-[var(--border-default)] px-2.5 py-1 text-[length:var(--text-caption)] font-medium text-[var(--text-subtle)] whitespace-nowrap">
          <ListChecks size={12} strokeWidth={2} aria-hidden="true" />
          {t("admin.training.list.noQuiz")}
        </span>
      )}
    </div>
  );
}

export { Clock };
