import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BadgeCheck, FileDown, GraduationCap, ImageDown, Lock, QrCode } from "lucide-react";
import { Button } from "../../ui/Button";
import { Link } from "../../../lib/navigation";
import { useToast } from "../../../lib/toast";
import { useGlowbook } from "../../../lib/studioWorkspace/glowbookStore";
import { ACCENT_COLORS, initialsOf } from "../../../lib/studioWorkspace/glowbookLook";
import { certifiedTitles } from "../../../lib/studioWorkspace/glowbookSections";
import type { Glowbook } from "../../../lib/studioWorkspace/glowbook";
import { posterFileName, shortUrl } from "../../../lib/glowbookPoster/layout";
import { qrMatrix, qrPath, QR_QUIET_ZONE } from "../../../lib/glowbookPoster/qr";

const card = "grid gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)] sm:p-6";
const heading =
  "m-0 inline-flex items-center gap-2 text-[length:var(--text-h4)] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]";

/** A picture file as a bitmap the canvas can draw, or null (the poster then shows the initials). */
async function bitmapOf(blob: Blob | null): Promise<ImageBitmap | null> {
  if (!blob) return null;
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/**
 * "QR code of my page" (decision 102): the public page's address in the
 * artist's UI language as a QR code, downloadable as a PNG and as an A4
 * poster to print for the studio (name, @handle, approved profile picture
 * and identity colour, call to scan, short address, Global Toothgems mark).
 * Offered only once the page is approved: before, the address answers 404.
 * Files are drawn in the browser (`components/glowbook/posterRender.ts`,
 * loaded on first use).
 */
export function GlowbookQrCard({ glowbook, url }: { glowbook: Glowbook; url: string }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const gb = useGlowbook();
  const [busy, setBusy] = useState<"png" | "pdf" | null>(null);
  const live = glowbook.status === "approved";
  const matrix = useMemo(() => (live ? qrMatrix(url) : null), [live, url]);

  const download = async (format: "png" | "pdf") => {
    if (!matrix || busy) return;
    setBusy(format);
    try {
      const render = await import("../../glowbook/posterRender");
      if (format === "png") {
        render.saveFile(await render.glowbookQrPng(matrix), posterFileName(glowbook.handle, t("studio.glowbook.qr.fileQr"), "png"));
      } else {
        // The approved look only: a picture still waiting for a moderator is never printed.
        const avatarPath = glowbook.look.avatarPath;
        const avatar = avatarPath ? await bitmapOf(await gb.downloadMedia(avatarPath)) : null;
        const blob = await render.glowbookPosterPdf(
          {
            displayName: glowbook.displayName,
            handle: glowbook.handle,
            url,
            accent: ACCENT_COLORS[glowbook.look.accent].solid,
            hasAvatar: !!avatar,
            initials: initialsOf(glowbook.displayName),
            qr: matrix,
            labels: { eyebrow: t("studio.glowbook.qr.eyebrow"), cta: t("studio.glowbook.qr.cta"), footer: t("studio.glowbook.qr.footer") },
          },
          avatar,
          { title: t("studio.glowbook.qr.docTitle", { name: glowbook.displayName }), author: "Global Toothgems" },
        );
        avatar?.close();
        render.saveFile(blob, posterFileName(glowbook.handle, t("studio.glowbook.qr.filePoster"), "pdf"));
      }
    } catch (error) {
      console.warn("[glowbook] the QR file could not be produced", error);
      showToast(t("studio.glowbook.toasts.qrFailed"), t("studio.workspace.toasts.tryAgain"), "error");
    } finally {
      setBusy(null);
    }
  };

  const total = matrix ? matrix.length + QR_QUIET_ZONE * 2 : 0;
  return (
    <section aria-labelledby="gt-glowbook-qr" className={card}>
      <div className="grid gap-1">
        <h2 id="gt-glowbook-qr" className={heading}>
          <QrCode size={18} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
          {t("studio.glowbook.qr.title")}
        </h2>
        <p className="m-0 text-[13px] leading-relaxed text-[var(--text-muted)]">{t("studio.glowbook.qr.sub")}</p>
      </div>
      {!matrix ? (
        <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          <Lock size={14} aria-hidden="true" className="mt-0.5 flex-none" />
          {t("studio.glowbook.qr.locked")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-5">
          <svg
            role="img"
            aria-label={t("studio.glowbook.qr.previewAlt", { url: shortUrl(url) })}
            viewBox={`0 0 ${total} ${total}`}
            shapeRendering="crispEdges"
            className="h-36 w-36 flex-none rounded-[var(--radius-md)] border border-[var(--border-subtle)]"
          >
            <rect width={total} height={total} fill="#ffffff" />
            <path d={qrPath(matrix, QR_QUIET_ZONE)} fill="#16171b" />
          </svg>
          <div className="grid min-w-0 flex-1 basis-[220px] gap-3">
            <code className="truncate text-[13px] text-[var(--text-primary)]">{shortUrl(url)}</code>
            <div className="flex flex-wrap gap-2">
              <Button variant="dark" size="sm" iconLeft={FileDown} loading={busy === "pdf"} disabled={busy !== null} onClick={() => void download("pdf")}>
                {t("studio.glowbook.qr.pdf")}
              </Button>
              <Button variant="outline" size="sm" iconLeft={ImageDown} loading={busy === "png"} disabled={busy !== null} onClick={() => void download("png")}>
                {t("studio.glowbook.qr.png")}
              </Button>
            </div>
            <p className="m-0 text-[12px] text-[var(--text-subtle)]">{t("studio.glowbook.qr.hint", { language: t("studio.glowbook.qr.language") })}</p>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The "certified artist" badge (decision 102): the database grants it from
 * the Academy courses the artist completed with a certificate; the artist
 * may hide it. Without a certificate, the card says how to earn one.
 */
export function GlowbookBadgeCard({ glowbook }: { glowbook: Glowbook }) {
  const { t, i18n } = useTranslation();
  const gb = useGlowbook();
  const toggleId = useId();
  const [busy, setBusy] = useState(false);
  if (gb.certification === null) return null;
  const titles = certifiedTitles(gb.certification, i18n.language);

  return (
    <section aria-labelledby="gt-glowbook-badge" className={card}>
      <h2 id="gt-glowbook-badge" className={heading}>
        <BadgeCheck size={18} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
        {t("studio.glowbook.badge.title")}
      </h2>
      {titles.length === 0 ? (
        <div className="grid gap-3">
          <p className="m-0 text-[13px] leading-relaxed text-[var(--text-muted)]">{t("studio.glowbook.badge.notEarned")}</p>
          <Link
            to="/academy"
            className="inline-flex w-fit items-center gap-2 text-[13px] font-bold text-[var(--text-link,var(--gt-blue-600))] underline decoration-1 underline-offset-2"
          >
            <GraduationCap size={15} aria-hidden="true" />
            {t("studio.glowbook.badge.toAcademy")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="m-0 text-[13px] leading-relaxed text-[var(--text-muted)]">{t("studio.glowbook.badge.earned")}</p>
          <p className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">{t("studio.glowbook.badge.courses", { titles: titles.join(" · ") })}</p>
          <label htmlFor={toggleId} className="inline-flex w-fit cursor-pointer items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
            <input
              id={toggleId}
              type="checkbox"
              checked={glowbook.showCertification}
              disabled={busy}
              onChange={async (e) => {
                setBusy(true);
                await gb.setShowCertification(e.target.checked);
                setBusy(false);
              }}
              className="h-4 w-4 accent-[var(--gt-ink-900)]"
            />
            {t("studio.glowbook.badge.show")}
          </label>
          {!glowbook.showCertification && <p className="m-0 text-[12px] text-[var(--text-subtle)]">{t("studio.glowbook.badge.hiddenNote")}</p>}
        </div>
      )}
    </section>
  );
}
