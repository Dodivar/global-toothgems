"use client";

import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, CircleAlert, Clock3, ExternalLink, Gem, Lock, PlugZap, Sparkles, X, type LucideIcon } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { EmptyState } from "../../components/admin/EmptyState";
import { SearchInput } from "../../components/admin/SearchInput";
import { ErrorPanel, Segmented } from "../../components/promotions/PromoUi";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { useAdminGlowbook } from "../../lib/adminGlowbook";
import { filterQueue, queueCounts, type QueueEntry, type QueueLook, type QueueStatus, type QueueView } from "../../lib/adminGlowbookMapping";
import { useFormat } from "../../lib/format";
import { localizedPath } from "../../lib/localeRoutes";
import { useToast } from "../../lib/toast";
import { REVIEW_NOTE_MAX } from "../../lib/studioWorkspace/glowbook";
import { tiktokUrl } from "../../lib/studioWorkspace/glowbookLook";
import { useAdminShell } from "./AdminLayout";

const STATUS_BADGE: Record<QueueStatus, { tone: BadgeTone; icon: LucideIcon }> = {
  pending: { tone: "warning", icon: Clock3 },
  approved: { tone: "success", icon: Check },
  rejected: { tone: "error", icon: CircleAlert },
};

/**
 * Glowbook moderation (decision 99): artists' public pages and the creations
 * they put in them wait here until a moderator (`moderate_reviews`) approves
 * them; nothing is public before. A rejection carries a note the artist
 * reads. A decision can be changed later — taking down something already
 * public is a rejection. Approved creations stay live: the artist's later
 * saves are public without a new review (decided by the owner).
 */
export function AdminGlowbook() {
  const { t } = useTranslation();
  const { openNav } = useAdminShell();
  const { entries, images, state, retry, decide } = useAdminGlowbook();
  const [view, setView] = useState<QueueView>("pending");
  const [query, setQuery] = useState("");
  const counts = useMemo(() => queueCounts(entries), [entries]);
  const shown = useMemo(() => filterQueue(entries, view, query), [entries, view, query]);
  const loading = state === "loading";

  return (
    <>
      <AdminHeader
        title={t("studio.glowbook.admin.title")}
        description={t("studio.glowbook.admin.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.nav.glowbook") }]}
        onOpenNav={openNav}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        {state === "unavailable" ? (
          <div className="gt-admin-panel">
            <EmptyState icon={PlugZap} title={t("studio.glowbook.admin.unavailableTitle")} body={t("studio.glowbook.admin.unavailableBody")} />
          </div>
        ) : state === "forbidden" ? (
          <div className="gt-admin-panel">
            <EmptyState icon={Lock} title={t("studio.glowbook.admin.forbiddenTitle")} body={t("studio.glowbook.admin.forbiddenBody")} />
          </div>
        ) : state === "error" ? (
          <ErrorPanel title={t("studio.glowbook.admin.errorTitle")} body={t("studio.glowbook.admin.errorBody")} onRetry={retry} retryLabel={t("studio.glowbook.admin.retry")} />
        ) : (
          <section className="gt-admin-panel grid grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border-subtle)] p-4">
              <Segmented<QueueView>
                label={t("studio.glowbook.admin.viewLabel")}
                hideLabel
                value={view}
                onChange={setView}
                options={[
                  { value: "pending", label: t("studio.glowbook.admin.viewPending", { count: counts.pending }) },
                  { value: "approved", label: t("studio.glowbook.admin.viewApproved") },
                  { value: "rejected", label: t("studio.glowbook.admin.viewRejected") },
                  { value: "all", label: t("studio.glowbook.admin.viewAll") },
                ]}
              />
              <div className="w-full sm:w-[320px]">
                <SearchInput
                  id="glowbook-search"
                  value={query}
                  onChange={setQuery}
                  label={t("studio.glowbook.admin.searchLabel")}
                  placeholder={t("studio.glowbook.admin.searchPlaceholder")}
                  clearLabel={t("studio.glowbook.admin.searchClear")}
                />
              </div>
            </div>

            {loading ? (
              <div role="status" aria-live="polite" className="grid gap-3 p-4">
                <span className="sr-only">{t("studio.glowbook.admin.loading")}</span>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="gt-skeleton h-24 rounded-[var(--admin-radius-sm)]" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title={t(view === "pending" && !query ? "studio.glowbook.admin.emptyPendingTitle" : "studio.glowbook.admin.emptyTitle")}
                body={t(view === "pending" && !query ? "studio.glowbook.admin.emptyPendingBody" : "studio.glowbook.admin.emptyBody")}
              />
            ) : (
              <ul className="m-0 grid list-none gap-0 p-0">
                {shown.map((entry) => (
                  <QueueRow
                    key={`${entry.kind}:${entry.id}`}
                    entry={entry}
                    images={images}
                    decide={decide}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  );
}

function QueueRow({
  entry,
  images,
  decide,
}: {
  entry: QueueEntry;
  images: Map<string, string>;
  decide: (entry: QueueEntry, status: "approved" | "rejected", note: string) => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation();
  const { formatDateShort } = useFormat();
  const { showToast } = useToast();
  const noteId = useId();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const badge = STATUS_BADGE[entry.status];
  const statusKind = entry.kind === "page" ? "page" : entry.kind === "changes" ? "changes" : "item";
  const picture =
    entry.kind === "creation"
      ? entry.thumbnailPath
      : (entry.look.pending.avatarPath ?? entry.look.pending.bannerPath ?? entry.look.approved.avatarPath ?? null);
  const image = picture ? images.get(picture) : undefined;
  const pageUrl = localizedPath("glowbook", i18n.language === "en" ? "en" : "fr", { id: entry.handle });

  const run = async (status: "approved" | "rejected") => {
    setBusy(true);
    const ok = await decide(entry, status, status === "rejected" ? note : "");
    setBusy(false);
    if (ok) {
      setRejecting(false);
      setNote("");
      showToast(t(`studio.glowbook.admin.toasts.${status}`), undefined, "success");
    } else showToast(t("studio.glowbook.admin.toasts.failed"), t("studio.glowbook.admin.errorBody"), "error");
  };

  return (
    <li className="grid gap-3 border-b border-[var(--border-subtle)] p-4 last:border-b-0 sm:grid-cols-[136px_minmax(0,1fr)]">
      <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-[var(--admin-radius-sm)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-600)] max-sm:max-w-[200px]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
          <img src={image} alt={entry.kind === "creation" ? entry.name : ""} className="h-full w-full object-cover" />
        ) : entry.kind === "creation" ? (
          <Gem size={28} aria-hidden="true" />
        ) : (
          <Sparkles size={28} aria-hidden="true" />
        )}
      </div>

      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge size="sm" tone="neutral">
            {t(`studio.glowbook.admin.kind.${entry.kind}`)}
          </Badge>
          <Badge size="sm" tone={badge.tone} icon={badge.icon}>
            {t(`studio.glowbook.status.${statusKind}.${entry.status}`)}
          </Badge>
          <span className="text-[12px] text-[var(--text-muted)]">{t("studio.glowbook.admin.submitted", { date: formatDateShort(entry.submittedAt) })}</span>
        </div>

        {entry.kind === "page" ? (
          <>
            <p className="m-0 text-[15px] font-bold text-[var(--text-primary)]">
              {entry.displayName} <span className="font-semibold text-[var(--text-muted)]">@{entry.handle}</span>
            </p>
            {entry.bio && <p className="m-0 whitespace-pre-line text-[13px] leading-relaxed text-[var(--text-primary)]">{entry.bio}</p>}
            {entry.instagram && <p className="m-0 text-[12.5px] text-[var(--text-muted)]">Instagram @{entry.instagram}</p>}
            {Object.keys(entry.look.pending).length > 0 && <ProposedLook look={entry.look} images={images} withPage />}
          </>
        ) : entry.kind === "changes" ? (
          <>
            <p className="m-0 text-[15px] font-bold text-[var(--text-primary)]">
              {entry.displayName} <span className="font-semibold text-[var(--text-muted)]">@{entry.handle}</span>
            </p>
            {Object.keys(entry.look.pending).length > 0 ? (
              <ProposedLook look={entry.look} images={images} />
            ) : (
              <p className="m-0 text-[12.5px] text-[var(--text-muted)]">{t("studio.glowbook.admin.changesDone")}</p>
            )}
          </>
        ) : (
          <>
            <p className="m-0 text-[15px] font-bold text-[var(--text-primary)]">{entry.name}</p>
            <p className="m-0 text-[12.5px] text-[var(--text-muted)]">
              {t("studio.glowbook.admin.byArtist", { name: entry.displayName, handle: entry.handle })} ·{" "}
              {t("studio.workspace.gems", { count: entry.elementCount })} · {t(`studio.glowbook.status.page.${entry.pageStatus}`)}
            </p>
            {entry.description && <p className="m-0 whitespace-pre-line text-[13px] leading-relaxed text-[var(--text-primary)]">{entry.description}</p>}
          </>
        )}

        {entry.status === "rejected" && entry.reviewNote && (
          <p className="m-0 text-[12.5px] text-[var(--status-error-fg)]">{t("studio.glowbook.reason", { note: entry.reviewNote })}</p>
        )}

        {rejecting ? (
          <div className="grid gap-2">
            <label htmlFor={noteId} className="text-[12.5px] font-bold text-[var(--text-primary)]">
              {t("studio.glowbook.admin.noteLabel")}
            </label>
            <textarea
              id={noteId}
              rows={2}
              value={note}
              maxLength={REVIEW_NOTE_MAX}
              autoFocus
              placeholder={t("studio.glowbook.admin.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
              className="gt-field w-full resize-none rounded-[var(--admin-radius-sm)] border border-[var(--border-default)] px-3 py-2 text-[length:var(--text-body-sm)]"
            />
            <div className="flex flex-wrap gap-2">
              <AdminButton size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
                {t("studio.glowbook.admin.cancel")}
              </AdminButton>
              <AdminButton size="sm" variant="danger" iconLeft={X} onClick={() => void run("rejected")} disabled={busy}>
                {t(entry.status === "approved" ? "studio.glowbook.admin.takeDownConfirm" : "studio.glowbook.admin.rejectConfirm")}
              </AdminButton>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {entry.status !== "approved" && !(entry.kind === "changes" && entry.status === "rejected") && (
              <AdminButton size="sm" variant="dark" iconLeft={Check} onClick={() => void run("approved")} disabled={busy}>
                {t("studio.glowbook.admin.approve")}
              </AdminButton>
            )}
            {entry.status !== "rejected" && !(entry.kind === "changes" && entry.status === "approved") && (
              <AdminButton size="sm" variant="outline" iconLeft={X} onClick={() => setRejecting(true)} disabled={busy}>
                {t(entry.status === "approved" ? "studio.glowbook.admin.takeDown" : "studio.glowbook.admin.reject")}
              </AdminButton>
            )}
            {entry.pageStatus === "approved" && (
              <a
                href={pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--text-primary)] underline underline-offset-2"
              >
                {t("studio.glowbook.admin.openPage")}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** What an artist proposes (decision 100): new pictures beside the current ones, new links in full. */
function ProposedLook({ look, images, withPage = false }: { look: QueueLook; images: Map<string, string>; withPage?: boolean }) {
  const { t } = useTranslation();
  const { pending, approved } = look;
  const url = (path: string | null | undefined) => (path ? images.get(path) : undefined);
  const links: { key: string; label: string; value: string; href: string }[] = [];
  if (pending.bookingUrl) links.push({ key: "booking", label: t("studio.glowbook.look.booking"), value: pending.bookingUrl, href: pending.bookingUrl });
  if (pending.websiteUrl) links.push({ key: "website", label: t("studio.glowbook.look.website"), value: pending.websiteUrl, href: pending.websiteUrl });
  if (pending.tiktok) links.push({ key: "tiktok", label: t("studio.glowbook.look.tiktok"), value: `@${pending.tiktok}`, href: tiktokUrl(pending.tiktok) });
  return (
    <div className="grid gap-2 rounded-[var(--admin-radius-sm)] border border-dashed border-[var(--border-default)] p-3">
      <p className="m-0 text-[12px] font-bold text-[var(--text-primary)]">
        {t(withPage ? "studio.glowbook.admin.proposedWithPage" : "studio.glowbook.admin.proposed")}
      </p>
      {(pending.avatarPath || pending.bannerPath) && (
        <div className="flex flex-wrap items-end gap-3">
          {pending.avatarPath && (
            <figure className="m-0 grid justify-items-center gap-1">
              {url(pending.avatarPath) ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                <img src={url(pending.avatarPath)} alt={t("studio.glowbook.look.avatar")} className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <span className="h-16 w-16 rounded-full bg-[var(--surface-sunken)]" />
              )}
              <figcaption className="text-[11px] text-[var(--text-muted)]">
                {t(approved.avatarPath ? "studio.glowbook.admin.newAvatar" : "studio.glowbook.look.avatar")}
              </figcaption>
            </figure>
          )}
          {pending.bannerPath && (
            <figure className="m-0 grid justify-items-center gap-1">
              {url(pending.bannerPath) ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                <img src={url(pending.bannerPath)} alt={t("studio.glowbook.look.banner")} className="h-16 w-48 rounded-[var(--admin-radius-sm)] object-cover" />
              ) : (
                <span className="h-16 w-48 rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)]" />
              )}
              <figcaption className="text-[11px] text-[var(--text-muted)]">
                {t(approved.bannerPath ? "studio.glowbook.admin.newBanner" : "studio.glowbook.look.banner")}
              </figcaption>
            </figure>
          )}
        </div>
      )}
      {links.length > 0 && (
        <dl className="m-0 grid gap-1 text-[12.5px]">
          {links.map((l) => (
            <div key={l.key} className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-[var(--text-muted)]">{l.label}</dt>
              <dd className="m-0 min-w-0 break-all">
                <a href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="text-[var(--text-primary)] underline underline-offset-2">
                  {l.value}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
