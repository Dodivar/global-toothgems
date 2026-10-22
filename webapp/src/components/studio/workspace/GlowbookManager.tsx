import { useId, useState, type FormEvent } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowRight, ArrowUp, Check, CircleAlert, Clock3, Copy, ExternalLink, LayoutGrid, PencilLine, RotateCw, Rows3, Send, Sparkles, Star, Trash2 } from "lucide-react";
import { Button } from "../../ui/Button";
import { useNavigate } from "../../../lib/navigation";
import { isLocale, localizedPath } from "../../../lib/localeRoutes";
import { studioSectionPath } from "../../../lib/studioUrl";
import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  HANDLE_MAX,
  moveItem,
  suggestHandle,
  validateGlowbook,
  type Glowbook,
  type GlowbookDetails,
  type GlowbookItem,
  type GlowbookProblem,
} from "../../../lib/studioWorkspace/glowbook";
import { glowbookCounts, glowbookTodos, type GlowbookPanel, type GlowbookTodo } from "../../../lib/studioWorkspace/glowbookDashboard";
import { useGlowbook } from "../../../lib/studioWorkspace/glowbookStore";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { useToast } from "../../../lib/toast";
import { CreationThumb } from "./CreationCard";
import { LibrarySkeleton } from "./CreationLibrary";
import { GlowbookLookEditor } from "./GlowbookLookEditor";
import { GlowbookSections } from "./GlowbookSections";
import { GlowbookBadgeCard, GlowbookQrCard } from "./GlowbookShare";
import { ModerationBadge } from "./GlowbookStatus";
import { usePrefersReducedMotion } from "../../homeAlt/usePrefersReducedMotion";
import { EmptyState } from "./EmptyState";
import { SignInPrompt } from "./SignInPrompt";
import { chipClass, eyebrow, fieldClass, focusRing, iconButton, useWorkspaceFormat } from "./workspaceStyles";

/**
 * "My Glowbook" (decision 99): the artist's public showcase — its address,
 * name, bio and Instagram account, the creations in it and where each stands
 * in moderation. Creations are added from My Creations (a creation's detail),
 * never from the editor.
 */
export function GlowbookManager() {
  const { t } = useWorkspaceFormat();
  const gb = useGlowbook();

  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-6 px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
      <header className="grid min-w-0 gap-2">
        <p className={eyebrow}>{t("studio.glowbook.eyebrow")}</p>
        <h1 className="m-0 text-[clamp(1.6rem,2.6vw,2.25rem)] font-[var(--weight-black)] leading-[1.1] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
          {t("studio.glowbook.title")}
        </h1>
        <p className="m-0 max-w-[62ch] text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-muted)]">{t("studio.glowbook.sub")}</p>
      </header>

      {gb.status === "signedOut" && <SignInPrompt />}
      {gb.status === "unavailable" && <EmptyState art="search" title={t("studio.glowbook.unavailableTitle")} body={t("studio.glowbook.unavailableBody")} />}
      {gb.status === "error" && (
        <EmptyState
          art="search"
          title={t("studio.glowbook.loadFailedTitle")}
          body={t("studio.workspace.toasts.tryAgain")}
          actions={
            <Button variant="outline" size="sm" iconLeft={RotateCw} onClick={gb.reload}>
              {t("studio.workspace.library.retry")}
            </Button>
          }
        />
      )}
      {gb.status === "loading" && <LibrarySkeleton />}

      {gb.status === "ready" && !gb.glowbook && <GlowbookForm onDone={() => undefined} />}

      {gb.status === "ready" && gb.glowbook && <GlowbookDashboard glowbook={gb.glowbook} />}
    </div>
  );
}

/* -------------------------------------------------------------- dashboard */

type Panel = GlowbookPanel | "sections" | "share";

const PANEL_ID: Record<Panel, string> = {
  profile: "gt-glowbook-profile",
  creations: "gt-glowbook-items",
  sections: "gt-glowbook-sections",
  look: "gt-glowbook-look",
  share: "gt-glowbook-share",
};

/**
 * The artist's control panel: figures and to-dos first, then every setting
 * of the page. One column on phones, in the order an artist works through it
 * (profile, creations, sections, look, sharing); on wide screens the
 * creations take the main column beside the profile and sharing, and the
 * look spreads below (its preview beside the fields on the widest).
 */
function GlowbookDashboard({ glowbook }: { glowbook: Glowbook }) {
  const gb = useGlowbook();
  const ws = useWorkspace();
  const reducedMotion = usePrefersReducedMotion();
  const [editing, setEditing] = useState(false);
  // A creation deleted elsewhere has left the page too (cascade): never count it,
  // once the library is known (before, an empty list would read as an empty page).
  const items = ws.status === "ready" ? gb.items.filter((item) => ws.creations.some((c) => c.id === item.creationId)) : gb.items;

  const scrollTo = (panel: Panel) =>
    document.getElementById(PANEL_ID[panel])?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  const fix = (panel: GlowbookPanel) => {
    // A refused page is fixed in its form.
    if (panel === "profile") setEditing(true);
    scrollTo(panel);
  };

  return (
    <>
      <GlowbookOverview glowbook={glowbook} items={items} onGo={fix} />
      <GlowbookJumpNav itemCount={items.length} onGo={scrollTo} />
      {/* Headings jumped to land below the sticky shortcuts on phones. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr_auto] lg:items-start [&_h2]:scroll-mt-20 lg:[&_h2]:scroll-mt-6">
        <div id={PANEL_ID.profile} className={clsx(panelClass, "lg:col-start-2 lg:row-start-1")}>
          {editing ? (
            <GlowbookForm glowbook={glowbook} onDone={() => setEditing(false)} />
          ) : (
            <GlowbookSummary glowbook={glowbook} onEdit={() => setEditing(true)} />
          )}
        </div>
        <div className="grid min-w-0 gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <GlowbookItems />
          <GlowbookSections />
        </div>
        <div className="min-w-0 lg:col-span-2 lg:row-start-3">
          <GlowbookLookEditor glowbook={glowbook} />
        </div>
        <div id={PANEL_ID.share} className={clsx(panelClass, "self-start lg:col-start-2 lg:row-start-2")}>
          <GlowbookQr glowbook={glowbook} />
          <GlowbookBadgeCard glowbook={glowbook} />
        </div>
      </div>
    </>
  );
}

/** Below the sticky shortcuts on phones when jumped to. */
const panelClass = "grid min-w-0 scroll-mt-16 gap-6 lg:scroll-mt-6";
const statLabel = "text-[10.5px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]";

const TODO_ICON: Record<GlowbookTodo["code"], typeof Check> = {
  pageRejected: CircleAlert,
  noItems: LayoutGrid,
  itemsRejected: CircleAlert,
  changesRejected: CircleAlert,
  noSpotlight: Star,
  unfiled: Rows3,
};
const BLOCKING: ReadonlySet<GlowbookTodo["code"]> = new Set(["pageRejected", "itemsRejected", "changesRejected"]);

/** The page at a glance: where it stands, its creations by moderation state, and what to do next. */
function GlowbookOverview({ glowbook, items, onGo }: { glowbook: Glowbook; items: GlowbookItem[]; onGo: (panel: GlowbookPanel) => void }) {
  const { t } = useTranslation();
  const gb = useGlowbook();
  const counts = glowbookCounts(items, gb.sections.length);
  const todos = glowbookTodos(glowbook, items, gb.sections.length);
  const stats: { key: "approved" | "pending" | "rejected"; icon: typeof Check; tone: string }[] = [
    { key: "approved", icon: Check, tone: "text-[var(--status-success-fg)]" },
    { key: "pending", icon: Clock3, tone: "text-[var(--status-warning-fg)]" },
    { key: "rejected", icon: CircleAlert, tone: "text-[var(--status-error-fg)]" },
  ];

  return (
    <section aria-labelledby="gt-glowbook-overview" className="grid gap-3">
      <h2 id="gt-glowbook-overview" className="sr-only">
        {t("studio.glowbook.dashboard.overview")}
      </h2>
      <dl className="m-0 grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4">
        <div className={clsx(statCard, "col-span-3 md:col-span-1")}>
          <dt className={statLabel}>{t("studio.glowbook.dashboard.page")}</dt>
          <dd className="m-0 flex flex-wrap items-center gap-1.5">
            <ModerationBadge status={glowbook.status} kind="page" />
            {Object.keys(glowbook.pending).length > 0 && <ModerationBadge status="pending" kind="changes" />}
          </dd>
        </div>
        {stats.map(({ key, icon: Icon, tone }) => (
          <div key={key} className={statCard}>
            <dt className={clsx(statLabel, "flex items-center gap-1.5")}>
              <Icon size={13} aria-hidden="true" className={clsx("flex-none", counts[key] > 0 ? tone : "text-[var(--text-subtle)]")} />
              <span className="min-w-0 truncate">{t(`studio.glowbook.dashboard.stats.${key}`)}</span>
            </dt>
            <dd className="m-0 text-[26px] font-[var(--weight-black)] leading-none tabular-nums text-[var(--text-primary)]">{counts[key]}</dd>
          </div>
        ))}
      </dl>

      {todos.length > 0 && (
        <div className="grid gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 sm:p-4">
          <h3 className="m-0 text-[11px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
            {t("studio.glowbook.dashboard.todoTitle")}
          </h3>
          <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
            {todos.map((todo) => {
              const Icon = TODO_ICON[todo.code];
              return (
                <li
                  key={todo.code}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] py-2 pl-3 pr-1.5"
                >
                  <Icon
                    size={16}
                    aria-hidden="true"
                    className={clsx("flex-none", BLOCKING.has(todo.code) ? "text-[var(--status-error-fg)]" : "text-[var(--gt-blue-600)]")}
                  />
                  <p className="m-0 min-w-0 flex-1 basis-[160px] text-[13px] font-semibold leading-snug text-[var(--text-primary)]">
                    {t(`studio.glowbook.dashboard.todo.${todo.code}`, { count: "count" in todo ? todo.count : 0 })}
                  </p>
                  <Button variant="ghost" size="sm" iconRight={ArrowRight} className="ml-auto flex-none" onClick={() => onGo(todo.panel)}>
                    {t(`studio.glowbook.dashboard.go.${todo.code}`)}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

const statCard = "grid min-w-0 content-between gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-sm)] sm:p-4";

/** On phones the page is long: shortcuts to each part stay at the top of the scroll. */
function GlowbookJumpNav({ itemCount, onGo }: { itemCount: number; onGo: (panel: Panel) => void }) {
  const { t } = useTranslation();
  const links: { panel: Panel; label: string }[] = [
    { panel: "profile", label: t("studio.glowbook.dashboard.nav.profile") },
    { panel: "creations", label: t("studio.glowbook.dashboard.nav.creations", { count: itemCount }) },
    { panel: "sections", label: t("studio.glowbook.dashboard.nav.sections") },
    { panel: "look", label: t("studio.glowbook.dashboard.nav.look") },
    { panel: "share", label: t("studio.glowbook.dashboard.nav.share") },
  ];
  return (
    <nav
      aria-label={t("studio.glowbook.dashboard.nav.label")}
      className="sticky top-0 z-10 -mx-4 -my-3 bg-[var(--surface-page)]/95 px-4 py-2.5 backdrop-blur-[8px] sm:-mx-8 sm:px-8 lg:hidden"
    >
      <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 [scrollbar-width:none]">
        {links.map(({ panel, label }) => (
          <li key={panel} className="flex-none">
            <button type="button" onClick={() => onGo(panel)} className={clsx(chipClass(false), "whitespace-nowrap")}>
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The page's address in the UI language (`/fr/glowbook/<handle>`), absolute. The workspace renders in the browser only. */
function useGlowbookUrl(handle: string) {
  const { i18n } = useTranslation();
  const lang = isLocale(i18n.language) ? i18n.language : "fr";
  return `${window.location.origin}${localizedPath("glowbook", lang, { id: handle })}`;
}

/** The QR code of the page's address, in the UI language (decision 102). */
function GlowbookQr({ glowbook }: { glowbook: Glowbook }) {
  return <GlowbookQrCard glowbook={glowbook} url={useGlowbookUrl(glowbook.handle)} />;
}

function GlowbookSummary({ glowbook, onEdit }: { glowbook: Glowbook; onEdit: () => void }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const gb = useGlowbook();
  const url = useGlowbookUrl(glowbook.handle);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const live = glowbook.status === "approved";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("studio.glowbook.toasts.linkCopied"), t("studio.glowbook.toasts.linkCopiedBody"), "success");
    } catch {
      showToast(t("studio.glowbook.toasts.copyFailed"), url, "warning");
    }
  };

  return (
    <section
      aria-label={t("studio.glowbook.pageSection")}
      className="grid gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)] sm:p-6"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden="true" className="grid h-12 w-12 flex-none place-items-center rounded-full bg-[var(--gt-ink-900)] text-white">
          <Sparkles size={20} />
        </span>
        <div className="grid min-w-0 flex-1 basis-[220px] gap-0.5">
          <p className="m-0 truncate text-[18px] font-[var(--weight-black)] text-[var(--text-primary)]">{glowbook.displayName}</p>
          <p className="m-0 truncate text-[13px] font-semibold text-[var(--text-muted)]">
            @{glowbook.handle}
            {glowbook.instagram && <span> · Instagram @{glowbook.instagram}</span>}
          </p>
        </div>
        <ModerationBadge status={glowbook.status} kind="page" />
      </div>

      {glowbook.bio && <p className="m-0 whitespace-pre-line text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-primary)]">{glowbook.bio}</p>}

      <p className="m-0 text-[13px] leading-relaxed text-[var(--text-muted)]">
        {glowbook.status === "rejected" ? (
          <>
            {t("studio.glowbook.page.rejected")}
            {glowbook.reviewNote && (
              <>
                {" "}
                <strong className="text-[var(--text-primary)]">{t("studio.glowbook.reason", { note: glowbook.reviewNote })}</strong>
              </>
            )}
          </>
        ) : (
          t(`studio.glowbook.page.${glowbook.status}`)
        )}
      </p>

      <div className="grid gap-1.5">
        <span className="text-[12px] font-bold text-[var(--text-primary)]">{t("studio.glowbook.link")}</span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 basis-[240px] truncate rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-3 py-2 text-[13px] text-[var(--text-primary)]">{url}</code>
          <Button variant="dark" size="sm" iconLeft={Copy} onClick={() => void copy()}>
            {t("studio.glowbook.copyLink")}
          </Button>
          {live && (
            <a href={url} target="_blank" rel="noopener noreferrer" className={clsx(iconButton, "border border-[var(--border-subtle)]")} aria-label={t("studio.glowbook.openPage")} title={t("studio.glowbook.openPage")}>
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          )}
        </div>
        <p className="m-0 text-[12px] text-[var(--text-subtle)]">{t("studio.glowbook.linkHint")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-4">
        <Button variant="outline" size="sm" iconLeft={PencilLine} onClick={onEdit}>
          {t("studio.glowbook.edit")}
        </Button>
        {confirmDelete ? (
          <span role="group" aria-label={t("studio.glowbook.deleteConfirm")} className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-semibold text-[var(--status-error-fg)]">{t("studio.glowbook.deleteConfirm")}</span>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              {t("studio.workspace.cancel")}
            </Button>
            <Button variant="danger" size="sm" iconLeft={Trash2} onClick={() => void gb.removeAll()}>
              {t("studio.glowbook.deleteYes")}
            </Button>
          </span>
        ) : (
          <Button variant="ghost" size="sm" iconLeft={Trash2} className="ml-auto text-[var(--status-error-fg)]" onClick={() => setConfirmDelete(true)}>
            {t("studio.glowbook.delete")}
          </Button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- form */

function GlowbookForm({ glowbook, onDone }: { glowbook?: Glowbook; onDone: () => void }) {
  const { t } = useTranslation();
  const gb = useGlowbook();
  const ids = { handle: useId(), name: useId(), bio: useId(), instagram: useId(), error: useId() };
  const [details, setDetails] = useState<GlowbookDetails>(() => ({
    handle: glowbook?.handle ?? "",
    displayName: glowbook?.displayName ?? "",
    bio: glowbook?.bio ?? "",
    instagram: glowbook?.instagram ?? "",
  }));
  const [handleTouched, setHandleTouched] = useState(!!glowbook);
  const [problem, setProblem] = useState<GlowbookProblem | "handleTaken" | "invalid" | null>(null);
  const [busy, setBusy] = useState(false);
  const handleChanged = !!glowbook && details.handle.trim().toLowerCase() !== glowbook.handle;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateGlowbook(details);
    setProblem(found);
    if (found || busy) return;
    setBusy(true);
    const result = await gb.save(details);
    setBusy(false);
    if (result === null) onDone();
    else if (result === "handleTaken" || result === "handleReserved" || result === "invalid") setProblem(result);
  };

  const fieldError = (keys: string[]) => (problem && keys.includes(problem) ? problem : null);
  const handleError = fieldError(["handleLength", "handleCharacters", "handleReserved", "handleTaken", "invalid"]);
  const nameError = fieldError(["displayNameRequired", "displayNameLength"]);
  const bioError = fieldError(["bioLength"]);
  const igError = fieldError(["instagramInvalid"]);
  const errorText = (p: string) => (
    <p id={ids.error} className="m-0 text-[12px] font-semibold text-[var(--status-error-fg)]">
      {t(`studio.glowbook.errors.${p}`, { max: HANDLE_MAX })}
    </p>
  );

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid gap-5 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)] sm:p-6"
    >
      <div className="grid gap-1">
        <h2 className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
          {t(glowbook ? "studio.glowbook.form.editTitle" : "studio.glowbook.form.createTitle")}
        </h2>
        <p className="m-0 text-[13px] leading-relaxed text-[var(--text-muted)]">{t("studio.glowbook.form.moderationNote")}</p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={ids.name} className="text-[12.5px] font-bold text-[var(--text-primary)]">
          {t("studio.glowbook.form.displayName")}
        </label>
        <input
          id={ids.name}
          value={details.displayName}
          maxLength={DISPLAY_NAME_MAX}
          autoFocus
          aria-invalid={!!nameError}
          aria-describedby={nameError ? ids.error : undefined}
          placeholder={t("studio.glowbook.form.displayNamePlaceholder")}
          onChange={(e) => {
            const displayName = e.target.value;
            setDetails((d) => ({ ...d, displayName, handle: handleTouched ? d.handle : suggestHandle(displayName) }));
          }}
          className={fieldClass}
        />
        {nameError && errorText(nameError)}
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={ids.handle} className="text-[12.5px] font-bold text-[var(--text-primary)]">
          {t("studio.glowbook.form.handle")}
        </label>
        <div className="flex min-w-0 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)] pl-3.5 focus-within:border-[var(--focus-ring)]">
          <span aria-hidden="true" className="flex-none text-[13px] text-[var(--text-subtle)]">
            …/glowbook/
          </span>
          <input
            id={ids.handle}
            value={details.handle}
            maxLength={HANDLE_MAX}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={!!handleError}
            aria-describedby={`${ids.handle}-hint${handleError ? ` ${ids.error}` : ""}`}
            onChange={(e) => {
              setHandleTouched(true);
              setDetails((d) => ({ ...d, handle: e.target.value.toLowerCase() }));
            }}
            className="w-full min-w-0 bg-transparent py-2.5 pr-3.5 text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none"
          />
        </div>
        <p id={`${ids.handle}-hint`} className="m-0 text-[12px] text-[var(--text-subtle)]">
          {handleChanged ? t("studio.glowbook.form.handleChangeWarning") : t("studio.glowbook.form.handleHint")}
        </p>
        {handleError && errorText(handleError)}
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={ids.bio} className="text-[12.5px] font-bold text-[var(--text-primary)]">
            {t("studio.glowbook.form.bio")} <span className="font-medium text-[var(--text-subtle)]">{t("studio.workspace.details.optional")}</span>
          </label>
          <span aria-hidden="true" className="text-[11px] tabular-nums text-[var(--text-subtle)]">
            {details.bio.length}/{BIO_MAX}
          </span>
        </div>
        <textarea
          id={ids.bio}
          rows={3}
          value={details.bio}
          maxLength={BIO_MAX}
          aria-invalid={!!bioError}
          placeholder={t("studio.glowbook.form.bioPlaceholder")}
          onChange={(e) => setDetails((d) => ({ ...d, bio: e.target.value }))}
          className={`${fieldClass} resize-none leading-relaxed`}
        />
        {bioError && errorText(bioError)}
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={ids.instagram} className="text-[12.5px] font-bold text-[var(--text-primary)]">
          {t("studio.glowbook.form.instagram")} <span className="font-medium text-[var(--text-subtle)]">{t("studio.workspace.details.optional")}</span>
        </label>
        <input
          id={ids.instagram}
          value={details.instagram}
          maxLength={31}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={!!igError}
          placeholder="@"
          onChange={(e) => setDetails((d) => ({ ...d, instagram: e.target.value }))}
          className={fieldClass}
        />
        {igError && errorText(igError)}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {glowbook && (
          <Button variant="ghost" size="sm" onClick={onDone}>
            {t("studio.workspace.cancel")}
          </Button>
        )}
        <Button type="submit" variant="dark" size="sm" iconLeft={glowbook ? Check : Send} loading={busy}>
          {t(glowbook ? "studio.glowbook.form.save" : "studio.glowbook.form.create")}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ items */

function GlowbookItems() {
  const { t, count } = useWorkspaceFormat();
  const gb = useGlowbook();
  const ws = useWorkspace();
  const navigate = useNavigate();
  const rows = gb.items.flatMap((item) => {
    const creation = ws.creations.find((c) => c.id === item.creationId);
    return creation ? [{ item, creation }] : [];
  });

  return (
    <section aria-labelledby="gt-glowbook-items" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="gt-glowbook-items" className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {t("studio.glowbook.items.title", { count: rows.length })}
          </h2>
          <p className="m-0 text-[13px] text-[var(--text-muted)]">{t("studio.glowbook.items.howTo")}</p>
        </div>
        <Button variant="outline" size="sm" iconLeft={LayoutGrid} onClick={() => navigate(studioSectionPath("creations"))}>
          {t("studio.glowbook.items.toCreations")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState compact title={t("studio.glowbook.items.emptyTitle")} body={t("studio.glowbook.items.emptyBody")} />
      ) : (
        <ol className="m-0 grid list-none gap-3 p-0">
          {rows.map(({ item, creation }, index) => (
            <li
              key={item.id}
              className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 sm:grid-cols-[104px_minmax(0,1fr)_auto]"
            >
              <button
                type="button"
                onClick={() => openWorkspaceDialog({ kind: "creationDetail", creationId: creation.id })}
                aria-label={t("studio.glowbook.items.open", { name: creation.name })}
                className={clsx("aspect-[4/3] overflow-hidden rounded-[var(--radius-md)] bg-[var(--gt-blue-100)]", focusRing)}
              >
                <CreationThumb creation={creation} />
              </button>
              <div className="grid min-w-0 gap-1">
                <p className="m-0 truncate text-[14.5px] font-bold text-[var(--text-primary)]">{creation.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <ModerationBadge status={item.status} kind="item" />
                  <span className="text-[12px] text-[var(--text-muted)]">{count(creation.elementCount)}</span>
                </div>
                {gb.sections.length > 0 && (
                  <label className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-[var(--text-muted)]">
                    <span className="sr-only">{t("studio.glowbook.sections.itemLabel", { name: creation.name })}</span>
                    <select
                      value={item.sectionId ?? ""}
                      onChange={(e) => void gb.fileItem(item, e.target.value || null)}
                      className="h-8 max-w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)] px-2 text-[12.5px] text-[var(--text-primary)]"
                    >
                      <option value="">{t("studio.glowbook.sections.none")}</option>
                      {gb.sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {item.status === "rejected" && item.reviewNote && (
                  <p className="m-0 text-[12.5px] text-[var(--status-error-fg)]">{t("studio.glowbook.reason", { note: item.reviewNote })}</p>
                )}
              </div>
              <div className="col-span-2 flex flex-wrap items-center justify-end gap-1 sm:col-span-1">
                {item.status === "rejected" && (
                  <Button variant="outline" size="sm" iconLeft={Send} onClick={() => void gb.add(creation)}>
                    {t("studio.glowbook.resubmit")}
                  </Button>
                )}
                <button
                  type="button"
                  className={iconButton}
                  disabled={index === 0}
                  aria-label={t("studio.glowbook.items.moveUp", { name: creation.name })}
                  title={t("studio.glowbook.items.moveUp", { name: creation.name })}
                  onClick={() => void gb.move(moveItem(gb.items, creation.id, -1))}
                >
                  <ArrowUp size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  disabled={index === rows.length - 1}
                  aria-label={t("studio.glowbook.items.moveDown", { name: creation.name })}
                  title={t("studio.glowbook.items.moveDown", { name: creation.name })}
                  onClick={() => void gb.move(moveItem(gb.items, creation.id, 1))}
                >
                  <ArrowDown size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={clsx(iconButton, "text-[var(--status-error-fg)]")}
                  aria-label={t("studio.glowbook.remove", { name: creation.name })}
                  title={t("studio.glowbook.remove", { name: creation.name })}
                  onClick={() => void gb.remove(creation)}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
