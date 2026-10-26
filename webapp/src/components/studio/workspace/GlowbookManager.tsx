import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CircleAlert,
  Clock3,
  Copy,
  ExternalLink,
  LayoutGrid,
  Link2,
  Palette,
  PencilLine,
  QrCode,
  RotateCw,
  Rows3,
  Send,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";
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
import { useGlowbookPlan } from "../../../lib/studioAccess";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { useToast } from "../../../lib/toast";
import { CreationThumb } from "./CreationCard";
import { LibrarySkeleton } from "./CreationLibrary";
import { PlanLocked } from "./PlanLocked";
import { GlowbookLookEditor } from "./GlowbookLookEditor";
import { GlowbookSections } from "./GlowbookSections";
import { GlowbookBadgeCard, GlowbookQrCard } from "./GlowbookShare";
import { ModerationBadge } from "./GlowbookStatus";
import { GlowbookAvatar } from "../../glowbook/GlowbookIdentity";
import { glowbookThemeStyle } from "../../glowbook/theme";
import { EmptyState } from "./EmptyState";
import { SignInPrompt } from "./SignInPrompt";
import { eyebrow, fieldClass, focusRing, iconButton, useWorkspaceFormat, workspacePage } from "./workspaceStyles";

/**
 * "My Glowbook" (decision 99): the artist's public showcase — its address,
 * name, bio and Instagram account, the creations in it and where each stands
 * in moderation. Creations are added from My Creations (a creation's detail),
 * never from the editor.
 */
export function GlowbookManager() {
  const { t } = useWorkspaceFormat();
  const gb = useGlowbook();
  // Below the Atelier plan the Glowbook is closed (decision 113): the database refuses its writes.
  const locked = useGlowbookPlan() === false;

  return (
    <div className={`${workspacePage} gap-6`}>
      <header className="grid min-w-0 gap-2">
        <p className={eyebrow}>{t("studio.glowbook.eyebrow")}</p>
        <h1 className="m-0 text-[clamp(1.6rem,2.6vw,2.25rem)] font-[var(--weight-black)] leading-[1.1] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
          {t("studio.glowbook.title")}
        </h1>
        <p className="m-0 max-w-[62ch] text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-muted)]">{t("studio.glowbook.sub")}</p>
      </header>

      {gb.status === "signedOut" && <SignInPrompt />}
      {gb.status !== "signedOut" && locked && <PlanLocked feature="glowbook" />}
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

      {!locked && gb.status === "ready" && !gb.glowbook && <GlowbookForm onDone={() => undefined} />}

      {!locked && gb.status === "ready" && gb.glowbook && <GlowbookDashboard glowbook={gb.glowbook} />}
    </div>
  );
}

/* -------------------------------------------------------------- dashboard */

type Tab = GlowbookPanel | "share";
const TABS: readonly Tab[] = ["creations", "look", "profile", "share"];
const TAB_ICON: Record<Tab, typeof Check> = { creations: LayoutGrid, look: Palette, profile: UserRound, share: QrCode };

/**
 * The artist's control panel. On top, always in view: who the page is, its
 * address and where it stands, the creations by moderation state and what
 * to do next. Below, one part at a time in tabs — creations (with their
 * sections), look, profile, sharing — so neither a phone nor a wide screen
 * has to scroll through everything; on wide screens each tab uses two
 * columns.
 */
function GlowbookDashboard({ glowbook }: { glowbook: Glowbook }) {
  const { t } = useTranslation();
  const gb = useGlowbook();
  const ws = useWorkspace();
  const baseId = useId();
  const [tab, setTab] = useState<Tab>("creations");
  // The profile form starts afresh after a save or a cancel; it takes the focus when asked for.
  const [form, setForm] = useState({ key: 0, focus: false });
  // A creation deleted elsewhere has left the page too (cascade): never count it,
  // once the library is known (before, an empty list would read as an empty page).
  const items = ws.status === "ready" ? gb.items.filter((item) => ws.creations.some((c) => c.id === item.creationId)) : gb.items;

  const open = (next: Tab) => {
    setTab(next);
    document.getElementById(`${baseId}-tabs`)?.scrollIntoView({ block: "nearest" });
  };
  const fix = (panel: GlowbookPanel) => {
    // A refused page is fixed in its form.
    if (panel === "profile") setForm((f) => ({ key: f.key + 1, focus: true }));
    open(panel);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : step ? (TABS.indexOf(tab) + step + TABS.length) % TABS.length : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(TABS[to]);
    document.getElementById(`${baseId}-tab-${TABS[to]}`)?.focus();
  };

  return (
    <>
      <GlowbookHero glowbook={glowbook} onEdit={() => fix("profile")} />
      <GlowbookOverview glowbook={glowbook} items={items} onGo={fix} />

      <div className="grid min-w-0 gap-5">
        <div
          id={`${baseId}-tabs`}
          role="tablist"
          aria-label={t("studio.glowbook.dashboard.tabs.label")}
          onKeyDown={onKeyDown}
          className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto border-b border-[var(--border-subtle)] bg-[var(--surface-page)]/95 px-4 backdrop-blur-[8px] [scrollbar-width:none] sm:-mx-8 sm:px-8"
        >
          {TABS.map((id) => {
            const Icon = TAB_ICON[id];
            const on = tab === id;
            return (
              <button
                key={id}
                id={`${baseId}-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`${baseId}-panel`}
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(id)}
                className={clsx(
                  "-mb-px inline-flex flex-none items-center justify-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-[13px] font-bold transition-colors max-sm:flex-1 max-sm:gap-1.5 max-sm:px-1.5 max-sm:text-[12.5px]",
                  on
                    ? "border-[var(--gt-ink-900)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                  focusRing,
                )}
              >
                <Icon size={15} aria-hidden="true" className="max-[400px]:hidden" />
                {t(`studio.glowbook.dashboard.tabs.${id}`)}
                {id === "creations" && (
                  <span className="rounded-[var(--radius-pill)] bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--text-muted)]">
                    {items.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab}`} className="min-w-0">
          {tab === "creations" && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start [&>*]:min-w-0">
              <GlowbookItems />
              <div className="lg:sticky lg:top-16">
                <GlowbookSections />
              </div>
            </div>
          )}
          {tab === "look" && <GlowbookLookEditor glowbook={glowbook} />}
          {tab === "profile" && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start [&>*]:min-w-0">
              <GlowbookForm key={form.key} glowbook={glowbook} autoFocus={form.focus} onDone={() => setForm((f) => ({ key: f.key + 1, focus: false }))} />
              <div className="grid gap-6">
                <GlowbookBadgeCard glowbook={glowbook} />
                <GlowbookDangerZone />
              </div>
            </div>
          )}
          {tab === "share" && (
            <div className="grid gap-6 lg:grid-cols-2 lg:items-start [&>*]:min-w-0">
              <GlowbookQr glowbook={glowbook} />
              <GlowbookLinkCard glowbook={glowbook} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const statLabel = "text-[10.5px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]";
const card = "grid gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)] sm:p-6";

/** The page's identity card: picture, name, handle, status, and its address to copy or open. */
function GlowbookHero({ glowbook, onEdit }: { glowbook: Glowbook; onEdit: () => void }) {
  const { t } = useTranslation();
  const gb = useGlowbook();
  const url = useGlowbookUrl(glowbook.handle);
  const copy = useCopyLink(url);
  const live = glowbook.status === "approved";
  const avatarPath = gb.draftLook?.avatarPath ?? glowbook.look.avatarPath;
  const avatarUrl = avatarPath ? (gb.mediaUrls.get(avatarPath) ?? null) : null;

  return (
    <section
      aria-label={t("studio.glowbook.pageSection")}
      className="grid gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)] sm:p-5 lg:grid-cols-2 lg:items-center lg:gap-8"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span style={glowbookThemeStyle(gb.draftLook ?? glowbook.look)} className="contents">
          <GlowbookAvatar name={glowbook.displayName} url={avatarUrl} className="h-14 w-14 text-[18px] sm:h-16 sm:w-16" />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="m-0 truncate text-[18px] font-[var(--weight-black)] leading-tight text-[var(--text-primary)] sm:text-[20px]">{glowbook.displayName}</p>
          <p className="m-0 truncate text-[13px] font-semibold text-[var(--text-muted)]">
            @{glowbook.handle}
            {glowbook.instagram && <span> · Instagram @{glowbook.instagram}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <ModerationBadge status={glowbook.status} kind="page" />
            {Object.keys(glowbook.pending).length > 0 && <ModerationBadge status="pending" kind="changes" />}
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className={clsx(iconButton, "flex-none border border-[var(--border-subtle)] sm:hidden")}
          aria-label={t("studio.glowbook.edit")}
          title={t("studio.glowbook.edit")}
        >
          <PencilLine size={15} aria-hidden="true" />
        </button>
        <Button variant="outline" size="sm" iconLeft={PencilLine} className="flex-none max-sm:hidden" onClick={onEdit}>
          {t("studio.glowbook.edit")}
        </Button>
      </div>

      <div className="grid min-w-0 gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-3 py-2 text-[12.5px] text-[var(--text-primary)]" title={url}>
            {url.replace(/^https?:\/\//, "")}
          </code>
          <Button variant="dark" size="sm" iconLeft={Copy} className="flex-none" onClick={() => void copy()}>
            <span className="max-sm:sr-only">{t("studio.glowbook.copyLink")}</span>
          </Button>
          {live && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={clsx(iconButton, "flex-none border border-[var(--border-subtle)]")}
              aria-label={t("studio.glowbook.openPage")}
              title={t("studio.glowbook.openPage")}
            >
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          )}
        </div>
        <p className="m-0 text-[12px] leading-snug text-[var(--text-subtle)]">
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
      </div>
    </section>
  );
}

function useCopyLink(url: string) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  return async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("studio.glowbook.toasts.linkCopied"), t("studio.glowbook.toasts.linkCopiedBody"), "success");
    } catch {
      showToast(t("studio.glowbook.toasts.copyFailed"), url, "warning");
    }
  };
}

const TODO_ICON: Record<GlowbookTodo["code"], typeof Check> = {
  pageRejected: CircleAlert,
  noItems: LayoutGrid,
  itemsRejected: CircleAlert,
  changesRejected: CircleAlert,
  noSpotlight: Star,
  unfiled: Rows3,
};
const BLOCKING: ReadonlySet<GlowbookTodo["code"]> = new Set(["pageRejected", "itemsRejected", "changesRejected"]);

/** The creations by moderation state, and what to do next. */
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
    <section aria-labelledby="gt-glowbook-overview" className={clsx("grid gap-3", todos.length > 0 && "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start")}>
      <h2 id="gt-glowbook-overview" className="sr-only">
        {t("studio.glowbook.dashboard.overview")}
      </h2>
      <dl className="m-0 grid grid-cols-3 gap-2 sm:gap-3">
        {stats.map(({ key, icon: Icon, tone }) => (
          <div
            key={key}
            className="grid min-w-0 content-between gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-sm)] sm:p-4"
          >
            <dt className={clsx(statLabel, "flex items-start gap-1.5 leading-tight")}>
              <Icon size={13} aria-hidden="true" className={clsx("mt-px flex-none", counts[key] > 0 ? tone : "text-[var(--text-subtle)]")} />
              <span className="min-w-0 [overflow-wrap:anywhere]">{t(`studio.glowbook.dashboard.stats.${key}`)}</span>
            </dt>
            <dd className="m-0 text-[26px] font-[var(--weight-black)] leading-none tabular-nums text-[var(--text-primary)]">{counts[key]}</dd>
          </div>
        ))}
      </dl>

      {todos.length > 0 && (
        <div className="grid content-start gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
          <h3 className="m-0 px-1 text-[11px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
            {t("studio.glowbook.dashboard.todoTitle")}
          </h3>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {todos.map((todo) => {
              const Icon = TODO_ICON[todo.code];
              return (
                <li key={todo.code}>
                  <button
                    type="button"
                    onClick={() => onGo(todo.panel)}
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2.5 text-left transition-colors hover:border-[var(--gt-blue-400)]",
                      focusRing,
                    )}
                  >
                    <Icon
                      size={16}
                      aria-hidden="true"
                      className={clsx("flex-none", BLOCKING.has(todo.code) ? "text-[var(--status-error-fg)]" : "text-[var(--gt-blue-600)]")}
                    />
                    <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-[var(--text-primary)]">
                      {t(`studio.glowbook.dashboard.todo.${todo.code}`, { count: "count" in todo ? todo.count : 0 })}
                    </span>
                    <span className="inline-flex flex-none items-center gap-1 text-[11.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                      <span className="max-sm:sr-only">{t(`studio.glowbook.dashboard.go.${todo.code}`)}</span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
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

/** "Share": the address to paste in the Instagram bio, beside the QR code. */
function GlowbookLinkCard({ glowbook }: { glowbook: Glowbook }) {
  const { t } = useTranslation();
  const url = useGlowbookUrl(glowbook.handle);
  const copy = useCopyLink(url);
  const live = glowbook.status === "approved";
  return (
    <section aria-labelledby="gt-glowbook-link" className={card}>
      <h2 id="gt-glowbook-link" className={heading}>
        <Link2 size={18} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
        {t("studio.glowbook.link")}
      </h2>
      <code className="block min-w-0 break-all rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-3 py-2.5 text-[13px] text-[var(--text-primary)]">{url}</code>
      <div className="flex flex-wrap gap-2">
        <Button variant="dark" size="sm" iconLeft={Copy} onClick={() => void copy()}>
          {t("studio.glowbook.copyLink")}
        </Button>
        {live && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx(
              "inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-default)] px-4 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] hover:bg-[var(--gt-ink-100)]",
              focusRing,
            )}
          >
            <ExternalLink size={14} aria-hidden="true" />
            {t("studio.glowbook.openPage")}
          </a>
        )}
      </div>
      <p className="m-0 text-[12px] leading-relaxed text-[var(--text-subtle)]">{t("studio.glowbook.linkHint")}</p>
    </section>
  );
}

/** Deleting the whole page, apart from the everyday settings. */
function GlowbookDangerZone() {
  const { t } = useTranslation();
  const gb = useGlowbook();
  const [confirm, setConfirm] = useState(false);
  return (
    <section aria-labelledby="gt-glowbook-danger" className={clsx(card, "border-[var(--gt-red-200,var(--border-subtle))]")}>
      <h2 id="gt-glowbook-danger" className={heading}>
        <Trash2 size={18} aria-hidden="true" className="text-[var(--status-error-fg)]" />
        {t("studio.glowbook.delete")}
      </h2>
      {confirm ? (
        <div role="group" aria-label={t("studio.glowbook.deleteConfirm")} className="grid gap-3">
          <p className="m-0 text-[13px] font-semibold text-[var(--status-error-fg)]">{t("studio.glowbook.deleteConfirm")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
              {t("studio.workspace.cancel")}
            </Button>
            <Button variant="danger" size="sm" iconLeft={Trash2} onClick={() => void gb.removeAll()}>
              {t("studio.glowbook.deleteYes")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="m-0 text-[13px] leading-relaxed text-[var(--text-muted)]">{t("studio.glowbook.dashboard.deleteHint")}</p>
          <Button variant="outline" size="sm" iconLeft={Trash2} className="w-fit text-[var(--status-error-fg)]" onClick={() => setConfirm(true)}>
            {t("studio.glowbook.delete")}
          </Button>
        </>
      )}
    </section>
  );
}

const heading =
  "m-0 inline-flex items-center gap-2 text-[length:var(--text-h4)] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]";

/* ------------------------------------------------------------------- form */

function GlowbookForm({ glowbook, onDone, autoFocus = true }: { glowbook?: Glowbook; onDone: () => void; autoFocus?: boolean }) {
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
          autoFocus={autoFocus}
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
  const { t } = useWorkspaceFormat();
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
              className="grid grid-cols-[76px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 sm:grid-cols-[104px_minmax(0,1fr)]"
            >
              <button
                type="button"
                onClick={() => openWorkspaceDialog({ kind: "creationDetail", creationId: creation.id })}
                aria-label={t("studio.glowbook.items.open", { name: creation.name })}
                className={clsx("aspect-[4/3] overflow-hidden rounded-[var(--radius-md)] bg-[var(--gt-blue-100)]", focusRing)}
              >
                <CreationThumb creation={creation} />
              </button>
              <div className="grid min-w-0 gap-1.5">
                <p className="m-0 truncate text-[14.5px] font-bold leading-snug text-[var(--text-primary)]">{creation.name}</p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <ModerationBadge status={item.status} kind="item" />
                  <span className="text-[12px] text-[var(--text-muted)]">{t("studio.workspace.gems", { count: creation.elementCount })}</span>
                </div>
                <div className="flex min-w-0 items-center gap-1">
                  {gb.sections.length > 0 && (
                    <label className="min-w-0 flex-1 sm:max-w-[240px]">
                      <span className="sr-only">{t("studio.glowbook.sections.itemLabel", { name: creation.name })}</span>
                      <select
                        value={item.sectionId ?? ""}
                        onChange={(e) => void gb.fileItem(item, e.target.value || null)}
                        className="h-8 w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)] px-2 text-[12.5px] text-[var(--text-primary)]"
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
                  <span className="ml-auto flex flex-none items-center">
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
                  </span>
                </div>
              </div>
              {item.status === "rejected" && (
                <div className="col-span-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-3 py-2">
                  <p className="m-0 min-w-0 flex-1 basis-[160px] text-[12.5px] text-[var(--status-error-fg)]">
                    {item.reviewNote ? t("studio.glowbook.reason", { note: item.reviewNote }) : t("studio.glowbook.control.rejected")}
                  </p>
                  <Button variant="outline" size="sm" iconLeft={Send} onClick={() => void gb.add(creation)}>
                    {t("studio.glowbook.resubmit")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
