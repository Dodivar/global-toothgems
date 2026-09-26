import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";
import { Badge } from "../ui/Badge";
import type { ContactCategory } from "../../data/legal/types";
import { LEGAL_PATHS } from "../../data/legal/routes";
import {
  BackToTop,
  Breadcrumbs,
  ContactCta,
  ContentKey,
  DesktopToc,
  MobileToc,
  ReviewBar,
  type Crumb,
  type TocEntry,
} from "./PageChrome";
import { useDocumentTitle, useHashScroll } from "./hooks";

export const LEGAL_TITLE_ID = "legal-page-title";

/**
 * The frame every help-centre and legal page shares: breadcrumb, a modest
 * title block (no hero — nobody came here for one), the review strip, then the
 * document beside a sticky table of contents on large screens and under a
 * collapsible one on small screens. It ends on a contact prompt and offers a
 * way back up once the reader is deep in.
 */
export function LegalLayout({
  eyebrow,
  title,
  intro,
  updated,
  crumbs,
  toc,
  numbered,
  showKey,
  contactCategory,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  /** ISO date; omitted on pages that are not documents (contact). */
  updated?: string;
  /** Crumbs between "Home" and the current page. Defaults to the help centre. */
  crumbs?: Crumb[];
  toc?: TocEntry[];
  numbered?: boolean;
  showKey?: boolean;
  contactCategory?: ContactCategory;
  /** Right-hand column content on pages without a table of contents. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  useDocumentTitle(title);
  useHashScroll();

  const trail: Crumb[] = [
    { label: t("legal.home"), to: "/" },
    ...(crumbs ?? [{ label: t("legal.hub.title"), to: LEGAL_PATHS.help }]),
    { label: title },
  ];

  const updatedLabel = updated
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(new Date(`${updated}T12:00:00`))
    : null;

  const hasToc = toc && toc.length > 0;

  return (
    <div className="bg-[var(--surface-page)]">
      {/* A pale wash behind the title block only: colour at the edge, white where the reading happens. */}
      <div className="border-b border-[var(--border-subtle)] bg-[linear-gradient(180deg,var(--gt-blue-50),var(--surface-page))]">
        <header className="mx-auto grid max-w-[var(--max-width-content)] gap-5 px-[clamp(16px,4vw,48px)] pb-8 pt-5 sm:pb-10 sm:pt-6">
          <Breadcrumbs items={trail} />
          <ReviewBar />
          <div className="grid max-w-[820px] gap-3">
            <span className="gt-eyebrow text-[var(--gt-blue-700)]">{eyebrow}</span>
            <h1 id={LEGAL_TITLE_ID} tabIndex={-1} className="text-[clamp(28px,4.2vw,var(--text-h1))] leading-[1.12] outline-none">
              {title}
            </h1>
            <div className="max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] leading-[var(--leading-relaxed)] text-[var(--text-body)] sm:text-[length:var(--text-body-lg)]">
              {intro}
            </div>
            {updatedLabel && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock size={14} aria-hidden="true" />
                  {t("legal.updated")} <time dateTime={updated}>{updatedLabel}</time>
                </span>
                <Badge tone="warning" size="sm">
                  {t("legal.draft")}
                </Badge>
              </div>
            )}
          </div>
        </header>
      </div>

      <div className="mx-auto max-w-[var(--max-width-content)] px-[clamp(16px,4vw,48px)] py-8 sm:py-12">
        <div className={hasToc || aside ? "grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-14" : "grid"}>
          {hasToc ? <DesktopToc entries={toc} numbered={numbered} /> : aside ? <div className="hidden lg:block">{aside}</div> : null}
          <div className="grid min-w-0 content-start gap-8">
            {(showKey || hasToc) && (
              <div className="grid gap-3">
                {hasToc && <MobileToc entries={toc} numbered={numbered} />}
                {showKey && <ContentKey />}
              </div>
            )}
            {children}
            {contactCategory && <ContactCta category={contactCategory} />}
          </div>
        </div>
      </div>
      <BackToTop targetId={LEGAL_TITLE_ID} />
    </div>
  );
}

/** One numbered or titled section of a document, with an anchor the contents can jump to. */
export function LegalSectionFrame({
  id,
  number,
  title,
  part,
  children,
}: {
  id: string;
  number?: number;
  title: string;
  /** Group label, shown above the first section of each group. */
  part?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="gt-legal-anchor grid gap-4 border-t border-[var(--border-subtle)] pt-8 first:border-t-0 first:pt-0">
      {part && <span className="gt-eyebrow -mb-1 text-[var(--gt-blue-700)]">{part}</span>}
      <h2 id={`${id}-title`} className="flex items-baseline gap-3 text-[clamp(20px,2.4vw,24px)] leading-[1.25]">
        {number !== undefined && (
          <span aria-hidden="true" className="min-w-[2ch] text-[length:var(--text-body-md)] font-bold tabular-nums text-[var(--gt-blue-600)]">
            {String(number).padStart(2, "0")}
          </span>
        )}
        <span>
          {number !== undefined && <span className="sr-only">{number}. </span>}
          {title}
        </span>
      </h2>
      <div className="gt-legal-prose grid gap-4">{children}</div>
    </section>
  );
}
