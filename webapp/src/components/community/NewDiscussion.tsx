import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ImagePlus, Plus, Send, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { CHANNELS, SAMPLE_UPLOADS } from "../../data/community";
import { pick } from "../../data/types";
import { useCommunity } from "../../lib/community";
import { useToast } from "../../lib/toast";
import { CommunityDialog } from "./Dialog";
import { focusRing } from "./styles";
import { discussionPath } from "./routes";

/**
 * Starting a discussion.
 *
 * The call to action appears on the home page, in every channel header, in the
 * empty states and in the mobile bar, so the composer is opened through a
 * context rather than passed down as a callback five levels deep — the same
 * arrangement as the member profile dialog.
 *
 * Posting is simulated: the discussion is added to the in-memory community
 * state and the thread opens on it. Nothing is uploaded and nothing is stored.
 */

interface ComposerContextValue {
  /** Opens the composer, optionally pre-selecting a channel. */
  openComposer: (channelId?: string) => void;
}

const ComposerContext = createContext<ComposerContextValue | null>(null);

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [openChannel, setOpenChannel] = useState<string | null>(null);
  const openComposer = useCallback((channelId?: string) => setOpenChannel(channelId ?? CHANNELS[0].id), []);
  const value = useMemo(() => ({ openComposer }), [openComposer]);

  return (
    <ComposerContext.Provider value={value}>
      {children}
      {openChannel && <NewDiscussionDialog channelId={openChannel} onClose={() => setOpenChannel(null)} />}
    </ComposerContext.Provider>
  );
}

export function useComposer() {
  const ctx = useContext(ComposerContext);
  if (!ctx) throw new Error("useComposer must be used within ComposerProvider");
  return ctx;
}

/** The community's primary call to action. */
export function StartDiscussionButton({
  channelId,
  variant = "primary",
  size = "md",
  fullWidth,
  label,
}: {
  channelId?: string;
  variant?: "primary" | "dark" | "outline" | "glass";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  label?: string;
}) {
  const { t } = useTranslation();
  const { openComposer } = useComposer();

  return (
    <Button
      variant={variant}
      size={size}
      iconLeft={Plus}
      fullWidth={fullWidth}
      onClick={() => openComposer(channelId)}
    >
      {label ?? t("community.startDiscussion")}
    </Button>
  );
}

function NewDiscussionDialog({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const titleId = useId();
  const fieldId = useId();
  const { addDiscussion } = useCommunity();
  const { showToast } = useToast();

  const [channel, setChannel] = useState(channelId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const ready = title.trim().length > 2 && body.trim().length > 2;

  const submit = () => {
    if (!ready || posting) return;
    setPosting(true);
    /* A beat of latency, so the button's loading state is visible and posting
       feels like it travelled somewhere. Nothing is sent. */
    window.setTimeout(() => {
      const created = addDiscussion({
        channelId: channel,
        title: title.trim(),
        body: body.trim(),
        image: attachment ?? undefined,
      });
      showToast(t("community.toastPosted"), t("community.toastPostedBody"));
      onClose();
      navigate(discussionPath(created.id));
    }, 420);
  };

  return (
    <CommunityDialog titleId={titleId} onClose={onClose} width="640px">
      <div className="grid gap-1 pr-8">
        <span className="gt-eyebrow">{t("community.composerEyebrow")}</span>
        <h2 id={titleId} className="text-[length:var(--text-h3)]">
          {t("community.composerTitle")}
        </h2>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("community.composerIntro")}
        </p>
      </div>

      <div className="grid gap-4">
        <label htmlFor={`${fieldId}-channel`} className="grid gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
            {t("community.composerChannel")}
          </span>
          <span className="relative">
            <select
              id={`${fieldId}-channel`}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="h-11 w-full appearance-none rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-4 pr-9 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--focus-ring)]"
            >
              {CHANNELS.map((c) => (
                <option key={c.id} value={c.id}>
                  {pick(c.name, lang)}
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
          </span>
        </label>

        <label htmlFor={`${fieldId}-title`} className="grid gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
            {t("community.composerSubject")}
          </span>
          <input
            id={`${fieldId}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("community.composerSubjectPlaceholder")}
            maxLength={110}
            className="h-11 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)]"
          />
        </label>

        <label htmlFor={`${fieldId}-body`} className="grid gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
            {t("community.composerMessage")}
          </span>
          <textarea
            id={`${fieldId}-body`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("community.composerMessagePlaceholder")}
            rows={5}
            className="resize-y rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)] p-4 text-sm leading-[var(--leading-normal)] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)]"
          />
        </label>

        <fieldset className="m-0 grid gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] p-4">
          <legend className="flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
            <ImagePlus size={13} aria-hidden="true" />
            {t("community.composerPhoto")}
          </legend>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("community.composerPhotoHint")}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            {SAMPLE_UPLOADS.map((sample) => {
              const selected = attachment === sample.src;
              return (
                <button
                  key={sample.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={pick(sample.alt, lang)}
                  onClick={() => setAttachment(selected ? null : sample.src)}
                  className={clsx(
                    "relative h-16 w-16 overflow-hidden rounded-[var(--radius-md)] border-2 transition-[border-color,transform] duration-[var(--duration-fast)] hover:scale-[1.03]",
                    focusRing,
                    selected ? "border-[var(--accent-cta)]" : "border-transparent",
                  )}
                >
                  <img src={sample.src} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              );
            })}
            {attachment && (
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] px-3 py-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]",
                  focusRing,
                )}
              >
                <X size={12} aria-hidden="true" />
                {t("community.composerPhotoRemove")}
              </button>
            )}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          {t("community.composerCancel")}
        </Button>
        <Button variant="primary" iconRight={Send} disabled={!ready} loading={posting} onClick={submit}>
          {t("community.composerPost")}
        </Button>
      </div>
    </CommunityDialog>
  );
}
