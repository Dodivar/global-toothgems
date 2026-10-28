import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  BookOpen,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Gem,
  Keyboard,
  Layers,
  MessageSquareHeart,
  MousePointer2,
  PlayCircle,
  Repeat,
  Save,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { getEngine } from "../../../lib/studio3d/engine";
import { useStudioStaff } from "../../../lib/studioAccess";
import {
  HELP_CHAPTERS,
  helpTopicFromHash,
  matchesHelpQuery,
  subscribeHelpRequests,
  takeRequestedHelpTopic,
  type HelpTopic,
  type HelpTopicId,
} from "../../../lib/studioWorkspace/helpTopics";
import { startTour } from "../../../lib/studioWorkspace/studioTour";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { SearchAndFilters } from "./SearchAndFilters";
import { useWorkspaceActions } from "./useWorkspaceActions";
import { eyebrow, focusRing } from "./workspaceStyles";

/** The six short lessons, each under `studio.workspace.help.tutorials.<id>`. */
const TUTORIALS: { id: string; icon: LucideIcon; accent?: boolean }[] = [
  { id: "choose", icon: Gem },
  { id: "place", icon: MousePointer2 },
  { id: "compose", icon: Sparkles },
  { id: "save", icon: Save, accent: true },
  { id: "groups", icon: Layers, accent: true },
  { id: "reuse", icon: Repeat },
];

/** Shortcuts the editor already understands (see `StudioEditor` and the engine). */
const SHORTCUTS: { keys: string[]; id: string }[] = [
  { keys: ["Ctrl", "Z"], id: "undo" },
  { keys: ["Ctrl", "Shift", "Z"], id: "redo" },
  { keys: ["Ctrl", "S"], id: "save" },
  { keys: ["Shift", "Click"], id: "multi" },
  { keys: ["Ctrl", "A"], id: "all" },
  { keys: ["L"], id: "lasso" },
  { keys: ["D"], id: "duplicate" },
  { keys: ["Shift", "D"], id: "duplicateMirror" },
  { keys: ["Del"], id: "delete" },
  { keys: ["Esc"], id: "deselect" },
  { keys: ["Right click"], id: "actions" },
  { keys: ["Shift", "Drag"], id: "pan" },
  { keys: ["Double click"], id: "focus" },
];

const topicKey = (id: HelpTopicId) => `studio.workspace.help.topics.${id}`;
const anchorId = (id: HelpTopicId) => `gt-help-${id}`;

/**
 * Help & Tutorial: the six short lessons for a first session, then the guide
 * to every feature that is not obvious at first sight, in chapters of folded
 * topics (one open at a time is not enforced: compare as you like), with a
 * search across them, the keyboard shortcuts and the way to send feedback.
 *
 * Every explanation button of the workspace leads here, on its topic
 * (`#<topic>` or a request from `useOpenStudioHelp`): the topic opens, is
 * scrolled to and briefly marked.
 */
export function HelpPanel() {
  const { t } = useTranslation();
  const { toEditor } = useWorkspaceActions();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<HelpTopicId>>(() => new Set());
  const [target, setTarget] = useState<HelpTopicId | null>(null);

  // The tour points at the editor's controls, and this page covers them: back
  // to the stage first, then the walkthrough starts there.
  const replay = () => {
    toEditor();
    startTour({ withStage: !!getEngine() });
  };

  const showTopic = useCallback((id: HelpTopicId) => {
    setQuery("");
    setOpen((current) => new Set(current).add(id));
    setTarget(id);
  }, []);

  // A topic asked for on arrival (fragment or request), then any later request.
  useEffect(() => {
    const first = takeRequestedHelpTopic() ?? helpTopicFromHash(window.location.hash);
    if (first) showTopic(first);
    const onRequest = () => {
      const id = takeRequestedHelpTopic();
      if (id) showTopic(id);
    };
    const onHash = () => {
      const id = helpTopicFromHash(window.location.hash);
      if (id) showTopic(id);
    };
    window.addEventListener("hashchange", onHash);
    const unsubscribe = subscribeHelpRequests(onRequest);
    return () => {
      window.removeEventListener("hashchange", onHash);
      unsubscribe();
    };
  }, [showTopic]);

  // Once the asked-for topic is open on screen: bring it into view, focus it, unmark it later.
  useEffect(() => {
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(anchorId(target));
      if (!el) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
      el.querySelector("summary")?.focus({ preventScroll: true });
    });
    const timer = window.setTimeout(() => setTarget(null), 2400);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [target]);

  const toggle = useCallback((id: HelpTopicId, next: boolean) => {
    setOpen((current) => {
      if (current.has(id) === next) return current;
      const copy = new Set(current);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }, []);

  // Every topic's words, for the search.
  const searchText = useMemo(() => {
    const text = new Map<HelpTopicId, string>();
    for (const chapter of HELP_CHAPTERS) {
      for (const topic of chapter.topics) {
        const key = topicKey(topic.id);
        text.set(
          topic.id,
          [
            t(`${key}.title`),
            t(`studio.workspace.help.chapters.${chapter.id}.title`),
            ...lines(t(`${key}.body`, { returnObjects: true })),
            ...lines(t(`${key}.points`, { returnObjects: true, defaultValue: [] })),
          ].join(" "),
        );
      }
    }
    return text;
  }, [t]);

  const searching = query.trim() !== "";
  const staff = useStudioStaff();
  const chapters = useMemo(
    () =>
      HELP_CHAPTERS.map((chapter) => {
        const visible = chapter.topics.filter((topic) => staff || !topic.staffOnly);
        return {
          ...chapter,
          topics: searching ? visible.filter((topic) => matchesHelpQuery(searchText.get(topic.id) ?? "", query)) : visible,
        };
      }).filter((chapter) => chapter.topics.length > 0),
    [query, searching, searchText, staff],
  );
  const shown = chapters.reduce((n, chapter) => n + chapter.topics.length, 0);
  const allOpen = chapters.every((chapter) => chapter.topics.every((topic) => open.has(topic.id)));
  const toggleAll = () => setOpen(allOpen ? new Set() : new Set(chapters.flatMap((chapter) => chapter.topics.map((topic) => topic.id))));

  return (
    <div className="mx-auto grid w-full max-w-[1080px] gap-10 px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="grid min-w-0 flex-1 basis-[320px] gap-2">
          <p className={eyebrow}>{t("studio.workspace.help.eyebrow")}</p>
          <h1 className="m-0 text-[clamp(1.6rem,2.6vw,2.25rem)] font-[var(--weight-black)] leading-[1.1] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {t("studio.workspace.help.title")}
          </h1>
          <p className="m-0 max-w-[62ch] text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-muted)]">
            {t("studio.workspace.help.sub")}
          </p>
        </div>
        <Button variant="outline" size="sm" iconLeft={PlayCircle} onClick={replay}>
          {t("studio.workspace.help.replayTour")}
        </Button>
      </header>

      <SearchAndFilters query={query} onQuery={setQuery} placeholder={t("studio.workspace.help.searchPlaceholder")} />

      {!searching && (
        <section aria-labelledby="gt-help-start" className="grid gap-4">
          <h2 id="gt-help-start" className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] text-[var(--text-primary)]">
            {t("studio.workspace.help.startTitle")}
          </h2>
          <Tutorials />
        </section>
      )}

      <section aria-labelledby="gt-help-guide" className="grid gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <h2 id="gt-help-guide" className="m-0 flex items-center gap-2 text-[length:var(--text-h4)] font-[var(--weight-black)] text-[var(--text-primary)]">
              <BookOpen size={18} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
              {t("studio.workspace.help.guideTitle")}
            </h2>
            <p className="m-0 text-[13px] text-[var(--text-muted)]" aria-live="polite">
              {searching ? t("studio.workspace.help.resultCount", { count: shown }) : t("studio.workspace.help.guideSub")}
            </p>
          </div>
          {shown > 0 && (
            <Button variant="ghost" size="sm" iconLeft={allOpen ? ChevronsDownUp : ChevronsUpDown} onClick={toggleAll}>
              {t(allOpen ? "studio.workspace.help.collapseAll" : "studio.workspace.help.expandAll")}
            </Button>
          )}
        </div>

        {shown === 0 ? (
          <div className="grid justify-items-start gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-6">
            <p className="m-0 text-[14px] font-bold text-[var(--text-primary)]">{t("studio.workspace.help.noMatchTitle")}</p>
            <p className="m-0 text-[13px] text-[var(--text-muted)]">{t("studio.workspace.help.noMatchBody")}</p>
            <Button variant="outline" size="sm" onClick={() => setQuery("")}>
              {t("studio.workspace.library.clearSearch")}
            </Button>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
            {!searching && (
              <nav aria-label={t("studio.workspace.help.chaptersLabel")} className="max-lg:hidden">
                <ol className="sticky top-4 m-0 grid list-none gap-0.5 p-0">
                  {chapters.map((chapter) => (
                    <li key={chapter.id}>
                      <a
                        href={`#gt-help-chapter-${chapter.id}`}
                        onClick={(event) => {
                          event.preventDefault();
                          document.getElementById(`gt-help-chapter-${chapter.id}`)?.scrollIntoView({ block: "start" });
                        }}
                        className={clsx(
                          "flex items-center justify-between gap-2 rounded-[var(--radius-md)] px-3 py-2 text-[13px] font-semibold text-[var(--text-body)] hover:bg-[var(--surface-brand-wash)] hover:text-[var(--text-primary)]",
                          focusRing,
                        )}
                      >
                        {t(`studio.workspace.help.chapters.${chapter.id}.title`)}
                        <span className="text-[11px] font-bold text-[var(--text-subtle)]">{chapter.topics.length}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            <div className={clsx("grid min-w-0 gap-8", searching && "lg:col-span-2")}>
              {chapters.map((chapter) => (
                <section key={chapter.id} id={`gt-help-chapter-${chapter.id}`} aria-labelledby={`gt-help-chapter-${chapter.id}-title`} className="grid scroll-mt-4 gap-3">
                  <div className="grid gap-1">
                    <h3 id={`gt-help-chapter-${chapter.id}-title`} className="m-0 text-[17px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
                      {t(`studio.workspace.help.chapters.${chapter.id}.title`)}
                    </h3>
                    <p className="m-0 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">{t(`studio.workspace.help.chapters.${chapter.id}.sub`)}</p>
                  </div>
                  <div className="grid divide-y divide-[var(--border-subtle)] rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
                    {chapter.topics.map((topic) => (
                      <Topic key={topic.id} topic={topic} open={open.has(topic.id)} marked={target === topic.id} onToggle={toggle} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="gt-help-keys" className="grid content-start gap-3">
          <h2 id="gt-help-keys" className="m-0 flex items-center gap-2 text-[length:var(--text-h4)] font-[var(--weight-black)] text-[var(--text-primary)]">
            <Keyboard size={18} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
            {t("studio.workspace.help.shortcutsTitle")}
          </h2>
          <dl className="m-0 grid gap-x-8 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-2 sm:grid-cols-2">
            {SHORTCUTS.map(({ keys, id }) => (
              <div key={id} className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] py-2.5">
                <dt className="text-[13px] text-[var(--text-body)]">{t(`studio.workspace.help.shortcuts.${id}`)}</dt>
                <dd className="m-0 flex flex-none gap-1">
                  {keys.map((k) => (
                    <kbd
                      key={k}
                      className="whitespace-nowrap rounded-[6px] border border-[var(--border-default)] border-b-2 bg-[var(--surface-page)] px-1.5 py-0.5 font-[inherit] text-[11px] font-bold text-[var(--text-primary)]"
                    >
                      {t(`studio.workspace.help.keys.${k}`, { defaultValue: k })}
                    </kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <p className="m-0 text-[12px] leading-relaxed text-[var(--text-muted)]">{t("studio.workspace.help.shortcutsMac")}</p>
        </section>

        <section aria-labelledby="gt-help-feedback" className="grid content-start gap-2 self-start rounded-[var(--radius-lg)] bg-[var(--surface-brand-wash)] p-5">
          <h2 id="gt-help-feedback" className="m-0 text-[14px] font-bold text-[var(--text-primary)]">
            {t("studio.workspace.help.feedbackTitle")}
          </h2>
          <p className="m-0 text-[13px] leading-relaxed text-[var(--text-muted)]">{t("studio.workspace.help.feedbackBody")}</p>
          <Button
            variant="dark"
            size="sm"
            iconLeft={MessageSquareHeart}
            className="mt-1 justify-self-start"
            onClick={() => openWorkspaceDialog({ kind: "feedback" })}
          >
            {t("studio.workspace.nav.feedback")}
          </Button>
        </section>
      </div>
    </div>
  );
}

/** Translation arrays read back as strings (a missing key returns its name, not an array). */
function lines(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((line): line is string => typeof line === "string") : [];
}

/** One folded topic: its question-like title, then paragraphs and, when useful, a list of points. */
function Topic({
  topic,
  open,
  marked,
  onToggle,
}: {
  topic: HelpTopic;
  open: boolean;
  marked: boolean;
  onToggle: (id: HelpTopicId, open: boolean) => void;
}) {
  const { t } = useTranslation();
  const key = topicKey(topic.id);
  const details = useRef<HTMLDetailsElement>(null);
  const body = lines(t(`${key}.body`, { returnObjects: true }));
  const points = lines(t(`${key}.points`, { returnObjects: true, defaultValue: [] }));

  return (
    <details
      ref={details}
      id={anchorId(topic.id)}
      open={open}
      onToggle={() => onToggle(topic.id, details.current?.open ?? false)}
      className={clsx(
        "group/topic scroll-mt-4 transition-colors duration-[var(--duration-base)] first:rounded-t-[var(--radius-lg)] last:rounded-b-[var(--radius-lg)]",
        marked && "bg-[var(--surface-brand-wash)]",
      )}
    >
      <summary
        className={clsx(
          "flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-[14px] font-bold text-[var(--text-primary)] [&::-webkit-details-marker]:hidden",
          focusRing,
          "focus-visible:-outline-offset-2",
        )}
      >
        <span className="min-w-0 flex-1">{t(`${key}.title`)}</span>
        {topic.plan && (
          <span className="flex-none rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)]">
            {t(`studio.workspace.help.plan.${topic.plan}`)}
          </span>
        )}
        <ChevronDown size={16} aria-hidden="true" className="flex-none transition-transform duration-[var(--duration-fast)] group-open/topic:rotate-180" />
      </summary>
      <div className="grid max-w-[75ch] gap-3 px-5 pb-5 text-[13.5px] leading-relaxed text-[var(--text-body)]">
        {body.map((paragraph, i) => (
          <p key={i} className="m-0">
            {paragraph}
          </p>
        ))}
        {points.length > 0 && (
          <ul className="m-0 grid list-disc gap-1.5 pl-5">
            {points.map((point, i) => (
              <li key={i} className="marker:text-[var(--gt-blue-600)]">
                {point}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

/** The six lessons for a first session, their steps folded away until asked for. */
function Tutorials() {
  const { t } = useTranslation();
  return (
    <ol className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4 p-0">
      {TUTORIALS.map(({ id, icon: Icon, accent }, i) => (
        <li key={id} className="grid">
          <article className="flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]">
            <div
              aria-hidden="true"
              className="relative flex h-[92px] items-center justify-between overflow-hidden bg-[radial-gradient(90%_120%_at_85%_0%,var(--gt-blue-200),var(--gt-blue-50)_70%)] px-5"
            >
              <span className="text-[40px] font-[var(--weight-black)] leading-none tracking-[var(--tracking-tight)] text-[var(--gt-blue-400)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={clsx(
                  "grid h-12 w-12 place-items-center rounded-[var(--radius-md)] border border-white/80 bg-white/75 shadow-[var(--shadow-sm)] backdrop-blur-[6px]",
                  accent ? "text-[var(--accent-cta-ink)]" : "text-[var(--gt-blue-700)]",
                )}
              >
                <Icon size={22} />
              </span>
            </div>
            <div className="grid flex-1 content-start gap-1.5 p-5 pb-3">
              <h3 className="m-0 text-[16px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
                {t(`studio.workspace.help.tutorials.${id}.title`)}
              </h3>
              <p className="m-0 text-[13px] leading-relaxed text-[var(--text-muted)]">{t(`studio.workspace.help.tutorials.${id}.summary`)}</p>
            </div>
            <details className="group/steps border-t border-[var(--border-subtle)]">
              <summary
                className={clsx(
                  "flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] hover:bg-[var(--surface-brand-wash)] [&::-webkit-details-marker]:hidden",
                  focusRing,
                  "focus-visible:-outline-offset-2",
                )}
              >
                {t("studio.workspace.help.showSteps")}
                <ChevronDown size={15} aria-hidden="true" className="transition-transform duration-[var(--duration-fast)] group-open/steps:rotate-180" />
              </summary>
              <ol className="m-0 grid gap-2 px-5 pb-5 pt-1 text-[13px] leading-relaxed text-[var(--text-body)]">
                {lines(t(`studio.workspace.help.tutorials.${id}.steps`, { returnObjects: true })).map((step, k) => (
                  <li key={k} className="ml-4 pl-1 marker:font-bold marker:text-[var(--gt-blue-600)]">
                    {step}
                  </li>
                ))}
              </ol>
            </details>
          </article>
        </li>
      ))}
    </ol>
  );
}
