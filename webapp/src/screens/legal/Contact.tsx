import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  CircleAlert,
  Clock,
  FileText,
  Mail,
  MapPin,
  Paperclip,
  Phone,
  Send,
  ShieldCheck,
  Timer,
  X,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/register/Field";
import { Notice } from "../../components/security/Notice";
import { SuccessMark } from "../../components/security/SuccessMark";
import { LegalLayout } from "../../components/legal/LegalLayout";
import { Placeholder } from "../../components/legal/RichText";
import { ReviewNote } from "../../components/legal/ReviewNote";
import { CONTACT_CATEGORY_PARAM, LEGAL_PATHS } from "../../data/legal/routes";
import type { ContactCategory } from "../../data/legal/types";

const CATEGORIES: ContactCategory[] = ["order", "delivery", "returns", "product", "training", "technical", "privacy", "professional", "other"];

/** Prototype limit for the attachment. A technical choice, not a business rule — adjust with the real upload service. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_FILES = ".jpg,.jpeg,.png,.pdf";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Values {
  name: string;
  email: string;
  order: string;
  category: ContactCategory | "";
  subject: string;
  message: string;
}

type Errors = Partial<Record<keyof Values | "file", string>>;

function isCategory(value: string | null): value is ContactCategory {
  return value !== null && (CATEGORIES as string[]).includes(value);
}

/**
 * Contact page: the form, the other ways to reach us, and a confirmation once
 * sent.
 *
 * Nothing leaves the browser — the prototype has no backend — and the success
 * screen says so. The category can arrive pre-selected from any page that
 * links here with `?sujet=…`, so "a question about a return" starts in the
 * right place. Validation runs on submit and then live, errors are tied to
 * their fields, and focus moves to the first one that needs attention.
 */
export function Contact() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const preset = params.get(CONTACT_CATEGORY_PARAM);

  const [values, setValues] = useState<Values>({
    name: "",
    email: "",
    order: "",
    category: isCategory(preset) ? preset : "",
    subject: "",
    message: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);

  const validate = (v: Values, f: File | null): Errors => {
    const e: Errors = {};
    if (!v.name.trim()) e.name = t("legal.contact.errors.name");
    if (!v.email.trim()) e.email = t("legal.contact.errors.emailRequired");
    else if (!EMAIL.test(v.email.trim())) e.email = t("legal.contact.errors.emailFormat");
    if (!v.category) e.category = t("legal.contact.errors.category");
    if (!v.subject.trim()) e.subject = t("legal.contact.errors.subject");
    if (v.message.trim().length < 20) e.message = t("legal.contact.errors.message");
    if (f && f.size > MAX_FILE_BYTES) e.file = t("legal.contact.errors.fileSize");
    return e;
  };

  const update = <K extends keyof Values>(key: K, value: Values[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (submitted) setErrors(validate(next, file));
  };

  const onFile = (f: File | null) => {
    setFile(f);
    if (submitted || (f && f.size > MAX_FILE_BYTES)) setErrors(validate(values, f));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const found = validate(values, file);
    setErrors(found);
    const firstKey = (["name", "email", "category", "subject", "message", "file"] as const).find((k) => found[k]);
    if (firstKey) {
      const target = formRef.current?.querySelector<HTMLElement>(`[data-field="${firstKey}"]`);
      target?.focus();
      return;
    }
    setSending(true);
    // Simulated round trip: long enough to show the sending state.
    window.setTimeout(() => {
      setSending(false);
      setSent(true);
      requestAnimationFrame(() => successHeading.current?.focus());
    }, 900);
  };

  const reset = () => {
    setValues({ name: "", email: "", order: "", category: "", subject: "", message: "" });
    setFile(null);
    setErrors({});
    setSubmitted(false);
    setSent(false);
  };

  const errorCount = Object.keys(errors).length;

  return (
    <LegalLayout
      eyebrow={t("legal.contact.eyebrow")}
      title={t("legal.contact.title")}
      intro={t("legal.contact.intro")}
      crumbs={[{ label: t("legal.hub.title"), to: LEGAL_PATHS.help }]}
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <div className="min-w-0">
          {sent ? (
            <section
              aria-labelledby="contact-success"
              className="gt-celebrate grid justify-items-start gap-4 rounded-[var(--radius-xl)] border border-[var(--gt-emerald-300)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-sm)] sm:p-8"
            >
              <SuccessMark />
              <h2 id="contact-success" ref={successHeading} tabIndex={-1} className="text-[length:var(--text-h3)] outline-none">
                {t("legal.contact.successTitle", { name: values.name.trim().split(" ")[0] })}
              </h2>
              <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] leading-[1.7] text-[var(--text-body)]">
                {t("legal.contact.successBody", { email: values.email.trim() })}{" "}
                <Placeholder label={t("legal.contact.responseTimePlaceholder")} />
              </p>
              <dl className="m-0 grid w-full gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-4 text-[length:var(--text-body-sm)] sm:grid-cols-[140px_minmax(0,1fr)]">
                <dt className="font-semibold text-[var(--text-primary)]">{t("legal.contact.fields.category")}</dt>
                <dd className="m-0">{values.category && t(`legal.contact.categories.${values.category}`)}</dd>
                <dt className="font-semibold text-[var(--text-primary)]">{t("legal.contact.fields.subject")}</dt>
                <dd className="m-0 break-words">{values.subject}</dd>
                {values.order && (
                  <>
                    <dt className="font-semibold text-[var(--text-primary)]">{t("legal.contact.fields.order")}</dt>
                    <dd className="m-0">{values.order}</dd>
                  </>
                )}
                {file && (
                  <>
                    <dt className="font-semibold text-[var(--text-primary)]">{t("legal.contact.fields.file")}</dt>
                    <dd className="m-0 break-all">{file.name}</dd>
                  </>
                )}
              </dl>
              <ReviewNote className="w-full">{t("legal.contact.demoNote")}</ReviewNote>
              <div className="flex flex-wrap gap-3">
                <Button variant="dark" onClick={reset}>
                  {t("legal.contact.sendAnother")}
                </Button>
                <Link
                  to={LEGAL_PATHS.faq}
                  className="inline-flex h-[46px] items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-strong)] px-[22px] text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] hover:bg-[var(--gt-ink-100)]"
                >
                  {t("legal.cta.faq")}
                </Link>
              </div>
            </section>
          ) : (
            <form ref={formRef} noValidate onSubmit={onSubmit} className="grid gap-6" aria-describedby="contact-required-note">
              <p id="contact-required-note" className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {t("legal.contact.requiredNote")}
              </p>

              {submitted && errorCount > 0 && (
                <Notice tone="error" live="alert" title={t("legal.contact.errorSummary", { count: errorCount })}>
                  <p>{t("legal.contact.errorSummaryBody")}</p>
                </Notice>
              )}

              {/* Category first: it frames everything below it, and it may already be chosen. */}
              <fieldset
                className="m-0 grid gap-3 border-0 p-0"
                aria-describedby={errors.category ? "contact-category-error" : undefined}
              >
                <legend className="gt-field-label mb-3 p-0">{t("legal.contact.fields.category")}</legend>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((category, i) => (
                    <label key={category} className="relative">
                      <input
                        type="radio"
                        name="category"
                        value={category}
                        checked={values.category === category}
                        onChange={() => update("category", category)}
                        data-field={i === 0 ? "category" : undefined}
                        className="peer sr-only"
                      />
                      <span
                        className={clsx(
                          "inline-flex min-h-11 cursor-pointer items-center rounded-[var(--radius-pill)] border px-4 text-[length:var(--text-body-sm)] font-medium transition-colors",
                          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]",
                          values.category === category
                            ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-off-white)]"
                            : errors.category
                              ? "border-[var(--gt-red-400)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:border-[var(--gt-red-600)]"
                              : "border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:border-[var(--gt-ink-400)]",
                        )}
                      >
                        {t(`legal.contact.categories.${category}`)}
                      </span>
                    </label>
                  ))}
                </div>
                <div id="contact-category-error" aria-live="polite" className="empty:hidden">
                  {errors.category && <FieldError message={errors.category} />}
                </div>
                {values.category === "privacy" && (
                  <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("legal.contact.privacyHint")}</p>
                )}
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  label={t("legal.contact.fields.name")}
                  autoComplete="name"
                  value={values.name}
                  onChange={(e) => update("name", e.target.value)}
                  error={errors.name}
                  data-field="name"
                />
                <TextField
                  label={t("legal.contact.fields.email")}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={values.email}
                  onChange={(e) => update("email", e.target.value)}
                  error={errors.email}
                  data-field="email"
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <TextField
                  label={t("legal.contact.fields.order")}
                  optional
                  value={values.order}
                  onChange={(e) => update("order", e.target.value)}
                  hint={t("legal.contact.orderHint")}
                  autoComplete="off"
                />
                <TextField
                  label={t("legal.contact.fields.subject")}
                  value={values.subject}
                  onChange={(e) => update("subject", e.target.value)}
                  error={errors.subject}
                  maxLength={120}
                  data-field="subject"
                />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="contact-message" className="gt-field-label">
                  {t("legal.contact.fields.message")}
                </label>
                <textarea
                  id="contact-message"
                  data-field="message"
                  rows={7}
                  value={values.message}
                  onChange={(e) => update("message", e.target.value)}
                  aria-invalid={errors.message ? true : undefined}
                  aria-required="true"
                  aria-describedby="contact-message-hint contact-message-error"
                  maxLength={3000}
                  className="gt-field h-auto min-h-[168px] resize-y rounded-[var(--radius-lg)] py-3.5 leading-[1.6]"
                />
                <div className="flex justify-between gap-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  <span id="contact-message-hint">{t("legal.contact.messageHint")}</span>
                  <span aria-hidden="true" className="tabular-nums">
                    {values.message.length} / 3000
                  </span>
                </div>
                <div id="contact-message-error" aria-live="polite" className="empty:hidden">
                  {errors.message && <FieldError message={errors.message} />}
                </div>
              </div>

              <div className="grid gap-1.5">
                <span id="contact-file-label" className="gt-field-label">
                  {t("legal.contact.fields.file")}{" "}
                  <span className="font-normal text-[var(--text-muted)]">· {t("register.optional")}</span>
                </span>
                {file ? (
                  <div
                    className={clsx(
                      "flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3",
                      errors.file ? "border-[var(--gt-red-400)] bg-[var(--status-error-bg)]" : "border-[var(--border-default)] bg-[var(--surface-card)]",
                    )}
                  >
                    <FileText size={18} aria-hidden="true" className="flex-none text-[var(--gt-blue-700)]" />
                    <span className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{file.name}</span>
                    <span className="flex-none text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {file.size < 1024 * 1024
                        ? t("legal.contact.sizeKb", { size: Math.max(1, Math.round(file.size / 1024)) })
                        : t("legal.contact.sizeMb", { size: (file.size / 1024 / 1024).toFixed(1) })}
                    </span>
                    <button
                      type="button"
                      data-field="file"
                      onClick={() => {
                        onFile(null);
                        if (fileInput.current) fileInput.current.value = "";
                        fileInput.current?.focus();
                      }}
                      aria-label={t("legal.contact.removeFile", { name: file.name })}
                      className="grid h-9 w-9 flex-none place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
                <label
                  className={clsx(
                    "flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-4 transition-colors hover:border-[var(--gt-blue-500)] hover:bg-[var(--surface-brand-wash)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]",
                    file && "sr-only",
                  )}
                >
                  <input
                    ref={fileInput}
                    type="file"
                    accept={ACCEPTED_FILES}
                    aria-labelledby="contact-file-label"
                    aria-describedby="contact-file-hint contact-file-error"
                    onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                  <Paperclip size={18} aria-hidden="true" className="flex-none text-[var(--gt-blue-700)]" />
                  <span className="grid text-[length:var(--text-body-sm)]">
                    <span className="font-semibold text-[var(--text-primary)]">{t("legal.contact.fileCta")}</span>
                    <span id="contact-file-hint" className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {t("legal.contact.fileHint")}
                    </span>
                  </span>
                </label>
                <div id="contact-file-error" aria-live="polite" className="empty:hidden">
                  {errors.file && <FieldError message={errors.file} />}
                </div>
              </div>

              <div className="flex gap-3 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] p-4 text-[length:var(--text-caption)] leading-[1.6] text-[var(--text-body)]">
                <ShieldCheck size={18} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
                <p className="m-0">
                  {t("legal.contact.privacyNotice")}{" "}
                  <Link to={LEGAL_PATHS.privacy} className="gt-legal-link">
                    {t("legal.contact.privacyLink")}
                  </Link>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Button type="submit" size="lg" iconRight={Send} loading={sending}>
                  {sending ? t("legal.contact.sending") : t("legal.contact.submit")}
                </Button>
              </div>
            </form>
          )}
        </div>

        <aside aria-labelledby="contact-other" className="grid content-start gap-4">
          <div className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
            <h2 id="contact-other" className="text-[length:var(--text-h4)]">
              {t("legal.contact.otherTitle")}
            </h2>
            <ul className="m-0 grid list-none gap-4 p-0">
              <ContactLine icon={Mail} label={t("legal.contact.lines.email")} value={<Placeholder business label={t("legal.contact.lines.emailPlaceholder")} />} />
              <ContactLine icon={Phone} label={t("legal.contact.lines.phone")} value={<Placeholder label={t("legal.contact.lines.phonePlaceholder")} />} />
              <ContactLine icon={MapPin} label={t("legal.contact.lines.address")} value={<Placeholder label={t("legal.contact.lines.addressPlaceholder")} />} />
              <ContactLine icon={Clock} label={t("legal.contact.lines.hours")} value={<Placeholder business label={t("legal.contact.lines.hoursPlaceholder")} />} />
              <ContactLine icon={Timer} label={t("legal.contact.lines.response")} value={<Placeholder label={t("legal.contact.responseTimePlaceholder")} />} />
            </ul>
          </div>
          <nav aria-label={t("legal.contact.quickTitle")} className="grid gap-1 rounded-[var(--radius-card)] bg-[var(--surface-sunken)] p-3">
            <span className="gt-eyebrow px-2 pb-1 pt-1">{t("legal.contact.quickTitle")}</span>
            {[
              { to: LEGAL_PATHS.faq, label: t("legal.pages.faq") },
              { to: LEGAL_PATHS.shipping, label: t("legal.pages.shipping") },
              { to: LEGAL_PATHS.returns, label: t("legal.pages.returns") },
              { to: "/compte/commandes", label: t("legal.contact.trackOrder") },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex min-h-11 items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 text-[length:var(--text-body-sm)] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-card)]"
              >
                {link.label}
                <ArrowRight size={15} aria-hidden="true" className="text-[var(--text-muted)]" />
              </Link>
            ))}
          </nav>
        </aside>
      </div>
    </LegalLayout>
  );
}

function ContactLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="grid h-9 w-9 flex-none place-items-center rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]">
        <Icon size={16} />
      </span>
      <span className="grid gap-0.5 text-[length:var(--text-body-sm)]">
        <span className="text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{label}</span>
        <span>{value}</span>
      </span>
    </li>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p className="gt-field-message m-0 flex items-start gap-1.5 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">
      <CircleAlert size={14} aria-hidden="true" className="mt-[1px] flex-none" />
      <span>{message}</span>
    </p>
  );
}
