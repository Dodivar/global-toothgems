"use client";

import { useTranslation } from "react-i18next";
import { ArrowRight, GraduationCap, Heart, LayoutDashboard, Package, Sparkles, type LucideIcon } from "lucide-react";
import { Link } from "../../lib/navigation";
import { useAuth } from "../../lib/auth";
import { useOrders } from "../../lib/orders";
import { useProgress } from "../../lib/progress";
import { useLoyalty } from "../../lib/loyalty";
import { useFavorites } from "../../lib/favorites";
import { useHydrated } from "../../lib/useHydrated";
import { ordersOnTheirWay } from "../../lib/memberDashboard";
import { MEMBER_SPACE_PATH } from "../../lib/memberSpace";
import { homeBandSettled, homeShortcuts, type HomeShortcut } from "../../lib/memberHome";
import { pick } from "../../data/types";

const ICONS: Record<HomeShortcut["kind"], LucideIcon> = {
  order: Package,
  course: GraduationCap,
  reward: Sparkles,
  favorites: Heart,
  space: LayoutDashboard,
};

/**
 * The home page's band for a signed-in member (owner, 2026-11-17), under the
 * carousel: "Hello <first name>" and up to three shortcuts to what is theirs
 * now — a parcel on its way, the course to resume, a loyalty reward, the
 * favourites (`homeShortcuts`) —, plus the way to My space.
 *
 * The home page is rendered on the server, where the session is not known:
 * the band renders nothing there and on the first browser render
 * (`useHydrated`), then appears once the session is restored. It reads only
 * the stores every page already has (orders, courses, loyalty, favourites) and
 * waits for them, so it appears once, complete, rather than growing.
 */
export function MemberHomeBand() {
  const { t, i18n } = useTranslation();
  const hydrated = useHydrated();
  const { signedIn, profile, displayName } = useAuth();
  const { orders, status: ordersStatus } = useOrders();
  const { status: learningStatus, enrolledCourses, progressFor, trainingFor, activeCourseId } = useProgress();
  const { card, status: loyaltyStatus } = useLoyalty();
  const { favoriteProducts, status: favoritesStatus } = useFavorites();

  const settled = homeBandSettled({ orders: ordersStatus, learning: learningStatus, loyalty: loyaltyStatus, favorites: favoritesStatus });
  if (!hydrated || !signedIn || !settled) return null;

  const lang = i18n.language;
  const inProgress = enrolledCourses()
    .filter((course) => course.status !== "unpublished")
    .map((course) => ({ course, progress: progressFor(course.id) }))
    .filter(({ progress }) => progress.doneCount > 0 && !progress.completed);
  const resume =
    inProgress.find(({ course }) => course.id === activeCourseId) ?? inProgress.slice().sort((a, b) => b.progress.pct - a.progress.pct)[0] ?? null;
  const shortcuts = homeShortcuts({
    onTheirWay: ordersStatus === "ready" ? ordersOnTheirWay(orders) : [],
    resume: resume
      ? {
          courseId: resume.course.id,
          title: pick(trainingFor(resume.course.id)?.title ?? resume.course.title, lang),
          pct: resume.progress.pct,
          nextKey: resume.progress.current?.key ?? null,
        }
      : null,
    rewardReady: card?.rewardReady === true,
    favorites: favoriteProducts.length,
  });
  const firstName = profile?.firstName?.trim() || displayName;

  const label = (s: HomeShortcut) => {
    switch (s.kind) {
      case "order":
        return { title: t(s.shipped ? "homeAlt.member.orderShipped" : "homeAlt.member.orderPreparing"), sub: t("account.orderReference", { reference: s.reference }) };
      case "course":
        return { title: t("homeAlt.member.resume"), sub: `${s.title} · ${t("homeAlt.member.progress", { pct: s.pct })}` };
      case "reward":
        return { title: t("homeAlt.member.reward"), sub: t("homeAlt.member.rewardSub") };
      case "favorites":
        return { title: t("homeAlt.member.favorites"), sub: t("homeAlt.member.favoritesSub", { count: s.count }) };
      case "space":
        return { title: t("homeAlt.member.space"), sub: t("homeAlt.member.spaceSub") };
    }
  };

  return (
    /* It appears after the first paint (the session is the browser's): on phones, where the carousel is
       shorter than the screen, it unfolds instead of pushing the page down at once. */
    <section
      aria-labelledby="gt-alt-member-title"
      className="grid w-full grid-rows-[1fr] border-b border-[var(--border-subtle)] bg-[var(--surface-card)] motion-safe:animate-[gt-unfold_var(--duration-slow)_var(--ease-out-soft)_both]"
    >
      <div className="min-h-0 overflow-hidden">
      <div className="gt-alt-wide grid gap-4 px-[var(--gt-alt-gutter)] py-5 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)] lg:items-center lg:gap-8">
        <div className="flex items-center justify-between gap-4 lg:grid lg:justify-items-start lg:gap-1">
          <h2 id="gt-alt-member-title" className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {t("homeAlt.member.hello", { name: firstName })}
          </h2>
          <Link
            to={MEMBER_SPACE_PATH}
            className="inline-flex flex-none items-center gap-1 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]"
          >
            {t("homeAlt.member.toSpace")}
            <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </div>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          {shortcuts.map((shortcut) => {
            const Icon = ICONS[shortcut.kind];
            const { title, sub } = label(shortcut);
            return (
              <li key={shortcut.kind}>
                <Link
                  to={shortcut.to}
                  className="group flex h-full items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-page)] p-3 transition-colors hover:border-[var(--gt-blue-300)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  <span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]">
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">{title}</span>
                    <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">{sub}</span>
                  </span>
                  <ArrowRight size={14} aria-hidden="true" className="flex-none text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      </div>
    </section>
  );
}
