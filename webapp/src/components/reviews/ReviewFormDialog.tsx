import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ImagePlus, Info, MessageSquareHeart, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { StarInput } from "./Stars";
import { VerifiedBadge } from "./ReviewBadges";
import {
  ACCEPTED_PHOTO_TYPES,
  BODY_MAX,
  BODY_MIN,
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  TITLE_MAX,
  privacyName,
  subjectKey,
  tagsFor,
  type CustomerReview,
  type ReviewTag,
} from "../../data/reviewSystem";
import { validateReview, type ReviewInput } from "../../lib/reviewRules";
import {
  subjectImage,
  subjectName,
  useReviewAuthor,
  useReviewEligibility,
  useReviews,
  type FormTarget,
} from "../../lib/reviews";
import { useAuth } from "../../lib/auth";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

const EMPTY_INPUT: ReviewInput = { rating: 0, title: "", body: "", tags: [], photos: [] };

/** Simulated round trip of the submission. */
const SUBMIT_LATENCY = 750;

/**
 * Writing or editing a review, as one dialog opened from anywhere — a product
 * page, a course page, an order, the dashboard's request, "My reviews".
 *
 * Mounted once by `ReviewOverlays`; `key`ed on the target so every opening
 * starts from the right state: the saved draft for that product, the review
 * being edited, or a blank form with the rating chosen on the request's stars.
 */
export function ReviewFormDialog() {
  const { formTarget, closeForm } = useReviews();
  const { t } = useTranslation();
  if (!formTarget) return null;
  return (
    <FormDialogBody
      key={`${subjectKey(formTarget.subject)}:${formTarget.reviewId ?? "new"}:${formTarget.rating ?? 0}`}
      target={formTarget}
      onClose={closeForm}
      closeLabel={t("reviews.form.close")}
    />
  );
}

function FormDialogBody({ target, onClose, closeLabel }: { target: FormTarget; onClose: () => void; closeLabel: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { profile, displayName } = useAuth();
  const { getReview, drafts, saveDraft, submitReview, updateReview } = useReviews();
  const eligibility = useReviewEligibility();
  const authorOf = useReviewAuthor();

  const editing: CustomerReview | undefined = target.reviewId ? getReview(target.reviewId) : undefined;
  const key = subjectKey(target.subject);
  const [input, setInput] = useState<ReviewInput>(() => {
    if (editing) {
      return { rating: editing.rating, title: editing.title, body: editing.body, tags: editing.tags, photos: editing.photos };
    }
    const draft = drafts[key];
    const base = draft ?? EMPTY_INPUT;
    return target.rating ? { ...base, rating: target.rating } : base;
  });
  const [errors, setErrors] = useState<ReturnType<typeof validateReview>>({});
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [tagsOpen, setTagsOpen] = useState(() => input.tags.length > 0);
  const [phase, setPhase] = useState<"form" | "sending" | "done">("form");
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const ratingRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { title: useId(), body: useId(), rating: useId(), photos: useId(), tags: useId() };

  // Keep an unsent new review as a draft when the dialog closes, so "Not now"
  // never throws away a paragraph. Edits are not drafted: the review exists.
  const inputRef = useRef(input);
  const phaseRef = useRef(phase);
  useEffect(() => {
    inputRef.current = input;
    phaseRef.current = phase;
  });
  useEffect(
    () => () => {
      if (editing || phaseRef.current === "done") return;
      const i = inputRef.current;
      const hasContent = i.title.trim() || i.body.trim() || i.photos.length || i.tags.length;
      saveDraft(target.subject, hasContent ? i : null);
    },
    // Runs on unmount only, reading the latest input through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const name = subjectName(target.subject, lang);
  const image = subjectImage(target.subject);
  const course = target.subject.kind === "course";
  const e = eligibility(target.subject);
  // Captured once: after an edit is sent the review is pending again, but the
  // confirmation still has to explain that a *published* review went back.
  const [published] = useState(() => editing?.status === "published");
  const author = editing ? authorOf(editing) : profile?.firstName ? privacyName(profile.firstName, profile.lastName) : displayName;
  const hadDraft = !editing && Boolean(drafts[key]);

  const set = <K extends keyof ReviewInput>(field: K, value: ReviewInput[K]) => {
    setInput((prev) => ({ ...prev, [field]: value }));
    if (field in errors) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const toggleTag = (tag: ReviewTag) =>
    set("tags", input.tags.includes(tag) ? input.tags.filter((x) => x !== tag) : [...input.tags, tag]);

  /**
   * Photos are read locally and never leave the browser in this prototype. The
   * checks mirror what the upload endpoint must enforce server-side — type,
   * size, count — before anything is stored or shown to anyone.
   */
  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    setPhotoError(null);
    const room = MAX_PHOTOS - input.photos.length;
    const accepted: { src: string; alt: string }[] = [];
    for (const file of Array.from(files)) {
      if (accepted.length >= room) {
        setPhotoError(t("reviews.form.photoTooMany", { max: MAX_PHOTOS }));
        break;
      }
      if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
        setPhotoError(t("reviews.form.photoType", { name: file.name }));
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setPhotoError(t("reviews.form.photoSize", { name: file.name, max: MAX_PHOTO_BYTES / 1024 / 1024 }));
        continue;
      }
      accepted.push({ src: URL.createObjectURL(file), alt: "" });
    }
    if (accepted.length) set("photos", [...input.photos, ...accepted]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateReview(input);
    setErrors(found);
    if (found.rating) return ratingRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    if (found.title) return titleRef.current?.focus();
    if (found.body) return bodyRef.current?.focus();

    setPhase("sending");
    window.setTimeout(() => {
      if (editing) updateReview(editing.id, input);
      else if (e.state === "eligible") submitReview(target.subject, input, { orderRef: e.orderRef, progressPct: e.progressPct });
      setPhase("done");
    }, SUBMIT_LATENCY);
  };

  if (phase === "done") {
    return (
      <Dialog open onClose={onClose} title={t("reviews.form.successTitle")} closeLabel={closeLabel} size="lg"
        footer={
          <>
            <Button variant="dark" size="sm" onClick={() => { onClose(); navigate("/compte/avis"); }}>
              {t("reviews.form.viewMine")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>{t("reviews.form.close")}</Button>
          </>
        }
      >
        <div className="grid justify-items-center gap-4 py-4 text-center" role="status">
          <span className="gt-check-in relative grid h-16 w-16 place-items-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)]">
            <MessageSquareHeart size={28} strokeWidth={1.8} aria-hidden="true" />
            <Sparkles size={16} aria-hidden="true" className="gt-envelope-spark absolute -right-1 -top-1 text-[var(--accent-highlight)]" />
          </span>
          <p className="m-0 max-w-[40ch] text-[length:var(--text-h4)] font-bold leading-[var(--leading-snug)] text-[var(--text-primary)]">
            {t("reviews.form.thanks")}
          </p>
          <p className="m-0 max-w-[48ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t(published ? "reviews.form.successEdited" : "reviews.form.successBody")}
          </p>
          <ol className="m-0 flex list-none flex-wrap justify-center gap-2 p-0 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)]">
            <li className="rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)] px-3 py-1 text-[var(--text-muted)] line-through decoration-1">{t("reviews.lifecycle.draft")}</li>
            <li className="rounded-[var(--radius-pill)] bg-[var(--status-warning-bg)] px-3 py-1 text-[var(--status-warning-fg)]" aria-current="step">
              {t("reviews.lifecycle.pending")}
            </li>
            <li className="rounded-[var(--radius-pill)] border border-dashed border-[var(--border-default)] px-3 py-1 text-[var(--text-muted)]">{t("reviews.lifecycle.published")}</li>
          </ol>
        </div>
      </Dialog>
    );
  }

  const bodyLength = input.body.trim().length;
  const tags = tagsFor(target.subject.kind);

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={editing ? t("reviews.form.editTitle") : t(course ? "reviews.form.titleCourse" : "reviews.form.titleProduct")}
      description={t("reviews.form.intro")}
      icon={<MessageSquareHeart size={18} />}
      closeLabel={closeLabel}
    >
      <form id="gt-review-form" onSubmit={submit} noValidate className="grid gap-5">
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3">
          {image && <img src={image} alt="" className="h-12 w-12 flex-none rounded-[var(--radius-sm)] object-cover" />}
          <div className="grid min-w-0 gap-1">
            <strong className="truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{name}</strong>
            <span className="flex flex-wrap items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {editing ? (
                <VerifiedBadge review={editing} />
              ) : (
                e.state === "eligible" && (
                  <VerifiedBadge review={{ subject: target.subject, orderRef: e.orderRef } as CustomerReview} />
                )
              )}
              {!editing && e.state === "eligible" && !e.orderRef.startsWith("ENR-") && t("reviews.form.fromOrder", { ref: e.orderRef })}
            </span>
          </div>
        </div>

        {published && (
          <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-[var(--status-info-bg)] p-3 text-[length:var(--text-caption)] text-[var(--status-info-fg)]">
            <Info size={15} aria-hidden="true" className="mt-0.5 flex-none" />
            {t("reviews.form.editNotice")}
          </p>
        )}
        {editing?.status === "needsChanges" && editing.changesRequest && (
          <div className="grid gap-1 rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-[var(--status-info-bg)] p-3 text-[length:var(--text-caption)] text-[var(--text-body)]">
            <strong className="text-[var(--status-info-fg)]">{t("reviews.mine.teamMessage")}</strong>
            <span lang={editing.lang}>{editing.changesRequest}</span>
          </div>
        )}
        {hadDraft && (
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("reviews.form.draftRestored")}</p>
        )}

        <div ref={ratingRef}>
          <StarInput
            value={input.rating}
            onChange={(v) => set("rating", v)}
            label={t("reviews.form.ratingLabel")}
            invalid={Boolean(errors.rating)}
            describedBy={errors.rating ? ids.rating : undefined}
          />
          {errors.rating && <FieldError id={ids.rating}>{t(`reviews.form.errors.${errors.rating}`)}</FieldError>}
        </div>

        <div className="grid gap-1.5">
          <label htmlFor={ids.title} className="gt-field-label">{t("reviews.form.titleLabel")}</label>
          <input
            ref={titleRef}
            id={ids.title}
            className="gt-field"
            value={input.title}
            maxLength={TITLE_MAX + 20}
            placeholder={t(course ? "reviews.form.titlePlaceholderCourse" : "reviews.form.titlePlaceholder")}
            onChange={(ev) => set("title", ev.target.value)}
            aria-invalid={Boolean(errors.title) || undefined}
            aria-describedby={errors.title ? `${ids.title}-err` : undefined}
          />
          {errors.title && <FieldError id={`${ids.title}-err`}>{t(`reviews.form.errors.${errors.title}`, { max: TITLE_MAX })}</FieldError>}
        </div>

        <div className="grid gap-1.5">
          <label htmlFor={ids.body} className="gt-field-label">{t("reviews.form.bodyLabel")}</label>
          <textarea
            ref={bodyRef}
            id={ids.body}
            rows={6}
            className="gt-field h-auto min-h-[150px] resize-y rounded-[var(--radius-lg)] py-3 leading-[var(--leading-normal)]"
            value={input.body}
            placeholder={t(course ? "reviews.form.bodyPlaceholderCourse" : "reviews.form.bodyPlaceholder")}
            onChange={(ev) => set("body", ev.target.value)}
            aria-invalid={Boolean(errors.body) || undefined}
            aria-describedby={`${ids.body}-count${errors.body ? ` ${ids.body}-err` : ""}`}
          />
          <div className="flex flex-wrap items-start justify-between gap-2">
            {errors.body ? (
              <FieldError id={`${ids.body}-err`}>{t(`reviews.form.errors.${errors.body}`, { min: BODY_MIN, max: BODY_MAX })}</FieldError>
            ) : (
              <span className="text-[11px] text-[var(--text-subtle)]">{t("reviews.form.bodyHint", { min: BODY_MIN })}</span>
            )}
            <span id={`${ids.body}-count`} className={clsx("text-[11px] tabular-nums", bodyLength > BODY_MAX ? "text-[var(--status-error-fg)]" : "text-[var(--text-subtle)]")}>
              {t("reviews.form.count", { count: bodyLength, max: BODY_MAX })}
            </span>
          </div>
        </div>

        {/* Photos: optional, and the most persuasive part of a review in a
            visual craft — so the control is generous, and each photo asks for
            a description, which becomes its text alternative. */}
        <fieldset className="m-0 grid gap-2 border-0 p-0" aria-describedby={ids.photos}>
          <legend className="gt-field-label mb-1.5 p-0">
            {t("reviews.form.photosLabel")} <span className="font-normal normal-case tracking-normal text-[var(--text-subtle)]">· {t("reviews.form.optional")}</span>
          </legend>
          <p id={ids.photos} className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("reviews.form.photosHint", { max: MAX_PHOTOS })}
          </p>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3 p-0">
            {input.photos.map((p, i) => (
              <li key={p.src} className="gt-pop-in grid gap-1.5">
                <div className="relative aspect-square overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-sunken)]">
                  <img src={p.src} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => set("photos", input.photos.filter((_, j) => j !== i))}
                    aria-label={t("reviews.form.photoRemove", { index: i + 1 })}
                    className={clsx("gt-glass absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full text-[var(--text-primary)]", focusRing)}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
                <label className="grid gap-1">
                  <span className="sr-only">{t("reviews.form.photoAltLabel", { index: i + 1 })}</span>
                  <input
                    className="gt-field h-9 text-[length:var(--text-caption)]"
                    placeholder={t("reviews.form.photoAltPlaceholder")}
                    value={p.alt}
                    onChange={(ev) => set("photos", input.photos.map((x, j) => (j === i ? { ...x, alt: ev.target.value } : x)))}
                  />
                </label>
              </li>
            ))}
            {input.photos.length < MAX_PHOTOS && (
              <li>
                <label
                  className={clsx(
                    "grid aspect-square cursor-pointer place-items-center content-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] bg-[var(--surface-brand-wash)] p-2 text-center text-[length:var(--text-caption)] font-semibold text-[var(--gt-blue-700)] transition-colors hover:border-[var(--gt-blue-400)] hover:bg-[var(--gt-blue-100)]",
                    "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                  )}
                >
                  <ImagePlus size={20} aria-hidden="true" />
                  {t("reviews.form.photoAdd")}
                  <span className="text-[10px] font-normal text-[var(--text-muted)]">{t("reviews.form.photoFormats")}</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPTED_PHOTO_TYPES.join(",")}
                    multiple
                    className="sr-only"
                    onChange={(ev) => addPhotos(ev.target.files)}
                  />
                </label>
              </li>
            )}
          </ul>
          {photoError && <FieldError id={`${ids.photos}-err`}>{photoError}</FieldError>}
        </fieldset>

        {/* Highlights: optional and folded by default, so the form reads as
            "stars, a title, a few words" rather than as a questionnaire. */}
        <div className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setTagsOpen((v) => !v)}
            aria-expanded={tagsOpen}
            aria-controls={ids.tags}
            className={clsx("flex items-center justify-between gap-3 rounded-[var(--radius-md)] px-4 py-3 text-left text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]", focusRing)}
          >
            <span>
              {t("reviews.form.tagsLabel")}{" "}
              <span className="font-normal text-[var(--text-subtle)]">
                · {input.tags.length ? t("reviews.form.tagsSelected", { count: input.tags.length }) : t("reviews.form.optional")}
              </span>
            </span>
            <ChevronDown size={16} aria-hidden="true" className={clsx("transition-transform duration-[var(--duration-fast)]", tagsOpen && "rotate-180")} />
          </button>
          <div id={ids.tags} className="gt-collapse" data-open={tagsOpen}>
            <div>
              <div role="group" aria-label={t("reviews.form.tagsLabel")} className="flex flex-wrap gap-2 px-4 pb-4">
                {tags.map((tag) => {
                  const on = input.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={on}
                      tabIndex={tagsOpen ? 0 : -1}
                      onClick={() => toggleTag(tag)}
                      className={clsx(
                        "rounded-[var(--radius-pill)] border px-3 py-1.5 text-[length:var(--text-caption)] font-semibold transition-colors duration-[var(--duration-fast)]",
                        on
                          ? "border-[var(--gt-blue-400)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]"
                          : "border-[var(--border-subtle)] text-[var(--text-body)] hover:border-[var(--border-default)]",
                        focusRing,
                      )}
                    >
                      {on && <span aria-hidden="true">✓ </span>}
                      {t(`reviews.tags.${tag}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <p className="m-0 text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
          {t("reviews.form.publishedAs", { name: author })} {t("reviews.form.moderationNote")}
        </p>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--border-subtle)] pt-4">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={phase === "sending"}>
            {editing ? t("reviews.form.cancel") : t("reviews.form.later")}
          </Button>
          <Button type="submit" variant="primary" size="md" loading={phase === "sending"}>
            {editing ? t("reviews.form.resubmit") : t("reviews.form.submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} role="alert" className="gt-field-message text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">
      {children}
    </span>
  );
}
