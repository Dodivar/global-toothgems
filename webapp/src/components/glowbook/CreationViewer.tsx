"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, CalendarCheck, ChevronLeft, ChevronRight, Gem, X } from "lucide-react";
import clsx from "clsx";
import { Link } from "../../lib/navigation";
import { glowbookCreationPath } from "../../lib/studioUrl";
import { SpotlightVideo } from "./SpotlightVideo";

/**
 * A Glowbook's creations full screen, one at a time, swiped like stories
 * (decision 151). Opened from a creation card; the visitor swipes (or uses
 * the arrows and the keyboard) through the creations the page shows, in its
 * order, and from each one books it or opens it in 3D, where its gems go to
 * the cart. The spotlight creation turns in its video. Back closes it: the
 * viewer adds one history entry while it is open, so a phone's back gesture
 * does not leave the page. Escape closes it too; focus stays inside and goes
 * back to the card on close.
 */

export interface ViewerItem {
  id: string;
  name: string;
  description: string;
  elementCount: number;
  imageUrl: string | null;
}

const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';
const HISTORY_KEY = "gbViewer";
const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export function CreationViewer({
  items,
  start,
  handle,
  artistName,
  spotlight,
  onClose,
  onBook,
}: {
  items: ViewerItem[];
  start: number;
  handle: string;
  artistName: string;
  /** The spotlight creation and its video, shown turning instead of its still. */
  spotlight: { itemId: string; videoUrl: string | null; videoType: string | null } | null;
  onClose: () => void;
  /** Book the creation shown; absent when the artist's calendar is closed. */
  onBook?: (item: ViewerItem) => void;
}) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(start);
  // What `close()` still has to do once the history entry is gone.
  const after = useRef<(() => void) | null>(null);
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);

  // One history entry while open: Back (the phone's gesture) closes the viewer instead of leaving the page.
  // Added once (a second development mount finds it there already).
  useEffect(() => {
    if (!window.history.state?.[HISTORY_KEY]) window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_KEY]: true }, "");
    const onPop = () => {
      closing.current();
      const next = after.current;
      after.current = null;
      next?.();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** Close through history (so the entry added on open goes), then run `then`. */
  const close = useCallback((then?: () => void) => {
    after.current = then ?? null;
    if (window.history.state?.[HISTORY_KEY]) window.history.back();
    else {
      closing.current();
      after.current = null;
      then?.();
    }
  }, []);

  // Open on the card that was tapped, without animating there.
  useLayoutEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = start * el.clientWidth;
  }, [start]);

  // Page scroll locked, focus moved in and given back to the card on close.
  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      restoreTo?.focus?.();
    };
  }, []);

  const go = useCallback((to: number) => {
    const el = track.current;
    if (!el) return;
    const target = Math.max(0, Math.min(items.length - 1, to));
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: target * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  }, [items.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      } else if (event.key === "ArrowRight") go(index + 1);
      else if (event.key === "ArrowLeft") go(index - 1);
      else if (event.key === "Tab") {
        const els = Array.from(root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [close, go, index]);

  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    const at = Math.round(el.scrollLeft / el.clientWidth);
    if (at !== index) setIndex(Math.max(0, Math.min(items.length - 1, at)));
  };

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={t("studio.glowbook.public.viewer.label", { name: artistName })}
      className="fixed inset-0 z-[480] flex flex-col bg-[#0e0f12] text-white"
    >
      <div className="flex flex-none items-center justify-between gap-3 px-4 pb-2 pt-[calc(10px+env(safe-area-inset-top))]">
        <p aria-live="polite" className="m-0 text-[13px] font-bold tabular-nums text-white/75">
          {t("studio.glowbook.public.viewer.counter", { index: index + 1, count: items.length })}
        </p>
        <button
          ref={closeButton}
          type="button"
          onClick={() => close()}
          aria-label={t("studio.glowbook.public.viewer.close")}
          className={clsx("grid h-11 w-11 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20", ring)}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={track}
          onScroll={onScroll}
          className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item, i) => {
            const near = Math.abs(i - index) <= 1;
            const video = spotlight && spotlight.itemId === item.id && spotlight.videoUrl ? spotlight : null;
            return (
              <section
                key={item.id}
                aria-roledescription={t("studio.glowbook.public.viewer.slide")}
                aria-label={t("studio.glowbook.public.viewer.counter", { index: i + 1, count: items.length })}
                aria-hidden={i !== index}
                inert={i !== index}
                className="flex h-full w-full flex-none snap-center snap-always flex-col"
              >
                <div className="grid min-h-0 flex-1 place-items-center px-4">
                  <div className="relative aspect-square max-h-full w-full max-w-[min(100%,720px)] overflow-hidden rounded-[var(--radius-lg)] bg-white/5">
                    {video && near ? (
                      <SpotlightVideo videoUrl={video.videoUrl} videoType={video.videoType} posterUrl={item.imageUrl} name={item.name} className="absolute inset-0" />
                    ) : item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed Storage URLs, not optimisable assets
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        loading={near ? "eager" : "lazy"}
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-white/60">
                        <Gem size={44} aria-hidden="true" />
                      </span>
                    )}
                  </div>
                </div>
                <div className="mx-auto grid w-full max-w-[720px] flex-none gap-2 px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4">
                  <h2 className="m-0 text-[22px] font-[var(--weight-black)] leading-tight tracking-[var(--tracking-tight)] text-white">{item.name}</h2>
                  {item.description && <p className="m-0 line-clamp-3 whitespace-pre-line text-[14px] leading-relaxed text-white/75">{item.description}</p>}
                  <p className="m-0 text-[12.5px] text-white/60">{t("studio.workspace.gems", { count: item.elementCount })}</p>
                  <div className="mt-1 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                    {onBook && (
                      <button
                        type="button"
                        onClick={() => close(() => onBook(item))}
                        className={clsx(
                          "inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-white px-5 text-[12.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[#16171b] transition-opacity hover:opacity-90",
                          ring,
                        )}
                      >
                        <CalendarCheck size={16} aria-hidden="true" />
                        {t("studio.glowbook.public.bookCreation")}
                      </button>
                    )}
                    <Link
                      to={glowbookCreationPath(handle, item.id)}
                      onClick={() => window.history.replaceState({ ...(window.history.state ?? {}), [HISTORY_KEY]: false }, "")}
                      aria-label={t("studio.glowbook.public.open3d", { name: item.name })}
                      className={clsx(
                        "inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-white/35 px-5 text-[12.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-white transition-colors hover:bg-white/10",
                        !onBook && "min-[380px]:col-span-2",
                        ring,
                      )}
                    >
                      <Box size={16} aria-hidden="true" />
                      {t("studio.glowbook.public.view3d")}
                    </Link>
                  </div>
                  <p className="m-0 text-[12px] text-white/55">{t("studio.glowbook.public.viewer.cartHint")}</p>
                </div>
              </section>
            );
          })}
        </div>

        {/* Arrows for a mouse; touch screens swipe. */}
        {index > 0 && (
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label={t("studio.glowbook.public.viewer.previous")}
            className={clsx("absolute left-4 top-[40%] hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/12 backdrop-blur-sm transition-colors hover:bg-white/25 pointer-fine:grid", ring)}
          >
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label={t("studio.glowbook.public.viewer.next")}
            className={clsx("absolute right-4 top-[40%] hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/12 backdrop-blur-sm transition-colors hover:bg-white/25 pointer-fine:grid", ring)}
          >
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
