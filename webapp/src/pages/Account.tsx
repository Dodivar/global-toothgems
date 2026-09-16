import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Check,
  Download,
  GraduationCap,
  ListVideo,
  LogOut,
  Lock,
  Package,
  PlayCircle,
  Receipt,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { CourseCard } from "../components/ui/CourseCard";
import { ProgressBar } from "../components/ui/ProgressBar";
import type { Course } from "../data/courses";
import { FLAT, MODULES, MODULE_OFFSETS, moduleIndexForFlatIndex } from "../data/lessons";
import { orderItemCount, orderTotal, type Order, type OrderStatus } from "../data/orders";
import { pick } from "../data/types";
import { useAuth } from "../lib/auth";
import { useOrders } from "../lib/orders";
import { useProgress, type CourseProgress } from "../lib/progress";
import { useToast } from "../lib/toast";
import { formatDate, formatMonthYear, formatPrice } from "../lib/format";
import { useReveal } from "../lib/useReveal";

/**
 * The member dashboard: one scrolling page rather than tabs, like every other
 * screen here. It reads the same in-memory state the rest of the app writes —
 * `progress.tsx` for the courses, `orders.tsx` for the purchases — so finishing
 * a lesson or paying in the cart is visible here immediately.
 *
 * Certificates are derived from progress reaching 100 %, never stored as a
 * separate flag: a flag would drift the moment a lesson is validated.
 */

const statusTone: Record<OrderStatus, BadgeTone> = {
  processing: "warning",
  shipped: "brand",
  delivered: "success",
  accessGranted: "success",
  cancelled: "neutral",
};

/** Certificate reference shown on an unlocked attestation. */
function certificateRef(courseId: string, awardedOn: string): string {
  return `GT-${courseId.toUpperCase()}-${awardedOn.slice(0, 4)}-${awardedOn.slice(5, 7)}`;
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse gap-1 rounded-[var(--radius-card)] border border-white/12 bg-white/[.06] p-4">
      <dt className="text-[length:var(--text-caption)] text-[var(--gt-ink-300)]">{label}</dt>
      <dd className="m-0 text-[26px] font-[var(--weight-black)] tabular-nums leading-none text-[var(--gt-off-white)]">
        {value}
      </dd>
    </div>
  );
}

/** Per-module completion for one course, from its single `doneCount`. */
function ModuleBreakdown({ doneCount, lang }: { doneCount: number; lang: string }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {MODULES.map((module, i) => {
        const total = module.lessons.length;
        const done = Math.max(0, Math.min(total, doneCount - MODULE_OFFSETS[i]));
        const complete = done === total;
        return (
          <li
            key={module.title.fr}
            className="flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 py-1 text-[11px] font-medium"
            style={{
              borderColor: complete ? "var(--gt-emerald-300)" : "var(--border-subtle)",
              background: complete ? "var(--status-success-bg)" : "transparent",
              color: complete ? "var(--status-success-fg)" : "var(--text-muted)",
            }}
          >
            {complete && <Check size={11} strokeWidth={3} aria-hidden="true" />}
            <span>{pick(module.title, lang)}</span>
            <span className="tabular-nums">
              {done}/{total}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function EnrolledCourseRow({
  course,
  progress,
  lang,
  onOpen,
}: {
  course: Course;
  progress: CourseProgress;
  lang: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="grid grid-cols-1 gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)] sm:grid-cols-[132px_minmax(0,1fr)]">
      <div className="relative aspect-video overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-sunken)] sm:aspect-square">
        <img src={course.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </div>
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            <h3 className="text-[length:var(--text-h4)]">{pick(course.title, lang)}</h3>
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {pick(course.level, lang)} · {t("course.lessonCount", { count: progress.total })} · {course.duration}
            </span>
          </div>
          <Badge tone={progress.completed ? "success" : "brand"} size="sm">
            {t(progress.completed ? "course.stateCompleted" : "course.stateEnrolled")}
          </Badge>
        </div>

        <ProgressBar
          value={progress.pct}
          size="sm"
          tone={progress.completed ? "emerald" : "brand"}
          label={t("lesson.progressLabel", { done: progress.doneCount, total: progress.total })}
        />

        <ModuleBreakdown doneCount={progress.doneCount} lang={lang} />

        <div className="flex flex-wrap items-center gap-3">
          <Button variant={progress.completed ? "outline" : "dark"} size="sm" iconRight={ArrowRight} onClick={onOpen}>
            {t(progress.completed ? "account.courseReview" : "account.courseContinue")}
          </Button>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {progress.completed && progress.completedOn
              ? t("account.courseCompletedOn", { date: formatDate(progress.completedOn) })
              : t("account.courseRemaining", { minutes: progress.remainingMinutes })}
          </span>
        </div>
      </div>
    </li>
  );
}

function CertificateCard({
  course,
  progress,
  lang,
  onDownload,
}: {
  course: Course;
  progress: CourseProgress;
  lang: string;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  const unlocked = progress.completed && progress.completedOn !== null;

  if (!unlocked) {
    const remaining = progress.total - progress.doneCount;
    return (
      <article className="grid content-start gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] p-[var(--space-5)]">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-subtle)]">
          <Lock size={18} aria-hidden="true" />
        </span>
        <div className="grid gap-1">
          <h3 className="text-[length:var(--text-h4)] text-[var(--text-muted)]">{pick(course.title, lang)}</h3>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("account.certificateRemaining", { count: remaining })}
          </span>
        </div>
        <ProgressBar value={progress.pct} size="sm" tone="brand" showValue={false} />
      </article>
    );
  }

  return (
    <article className="relative grid content-start gap-3 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-inverse)] p-[var(--space-5)] text-[var(--text-inverse)]">
      {/* Faint seal behind the card — the certificate's only ornament. */}
      <Award
        size={132}
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-6 text-white/[.07]"
        strokeWidth={1}
      />
      <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[var(--gt-emerald-400)] text-[var(--gt-ink-900)]">
        <BadgeCheck size={20} aria-hidden="true" />
      </span>
      <div className="relative grid gap-1">
        <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
          {t("account.certificateUnlocked")}
        </span>
        <h3 className="text-[length:var(--text-h4)] text-[var(--gt-off-white)]">{pick(course.title, lang)}</h3>
        <span className="text-[length:var(--text-caption)] text-[var(--gt-ink-300)]">
          {t("account.certificateAwardedOn", { date: formatDate(progress.completedOn!) })}
        </span>
        <span className="text-[11px] text-[var(--gt-ink-400)]" style={{ fontFamily: "var(--gt-font-mono)" }}>
          {certificateRef(course.id, progress.completedOn!)}
        </span>
      </div>
      <div className="relative">
        <Button variant="glass" size="sm" iconLeft={Download} onClick={onDownload}>
          {t("account.certificateDownload")}
        </Button>
      </div>
    </article>
  );
}

function OrderCard({ order, lang, onInvoice, onTrack }: { order: Order; lang: string; onInvoice: () => void; onTrack: () => void }) {
  const { t } = useTranslation();
  const total = orderTotal(order);
  const cancelled = order.status === "cancelled";

  return (
    <li className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
            {t("account.orderReference", { reference: order.reference })}
          </strong>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("account.orderPlacedOn", { date: formatDate(order.placedOn) })} ·{" "}
            {t("account.orderItems", { count: orderItemCount(order) })}
          </span>
        </div>
        <Badge tone={statusTone[order.status]} size="sm">
          {t(`account.orderStatus.${order.status}`)}
        </Badge>
      </div>

      <ul className="m-0 grid list-none gap-3 p-0">
        {order.lines.map((line, i) => {
          const name = pick(line.name, lang);
          const to = line.productId ? `/boutique/${line.productId}` : null;
          return (
            <li key={`${order.reference}-${i}`} className="flex items-center gap-3">
              <img
                src={line.image}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-12 w-12 flex-none rounded-[var(--radius-sm)] object-cover"
                style={{ opacity: cancelled ? 0.5 : 1 }}
              />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                  {to ? (
                    <Link to={to} className="underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </span>
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {line.variant ? `${pick(line.variant, lang)} · ` : ""}
                  {t("account.orderQty", { qty: line.qty })}
                </span>
              </span>
              <span className="whitespace-nowrap text-[length:var(--text-body-sm)] tabular-nums text-[var(--text-body)]">
                {formatPrice(line.unitPrice * line.qty)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" iconLeft={Receipt} onClick={onInvoice}>
            {t("account.orderInvoice")}
          </Button>
          {order.status === "shipped" && (
            <Button variant="ghost" size="sm" iconLeft={Truck} onClick={onTrack}>
              {t("account.orderTrack")}
            </Button>
          )}
        </div>
        <span className="text-[length:var(--text-body-sm)] font-bold tabular-nums text-[var(--text-primary)]">
          {t("account.orderTotal")} {formatPrice(total)}
        </span>
      </div>
    </li>
  );
}

export function Account() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const { displayName, initials, email, signOut } = useAuth();
  const { openCourse, progressFor, enrolledCourses, availableCourses } = useProgress();
  const { orders, memberSince } = useOrders();
  const { showToast } = useToast();

  const coursesRef = useReveal<HTMLElement>();
  const certificatesRef = useReveal<HTMLElement>();
  const ordersRef = useReveal<HTMLElement>();

  const enrolled = enrolledCourses();
  const available = availableCourses();
  const progressByCourse = enrolled.map((course) => ({ course, progress: progressFor(course.id) }));

  const inProgress = progressByCourse.filter(({ progress }) => !progress.completed);
  const certificates = progressByCourse.filter(({ progress }) => progress.completed).length;
  const lessonsDone = progressByCourse.reduce((sum, { progress }) => sum + progress.doneCount, 0);
  /** The course the "resume" card offers: the least advanced one still open. */
  const resume = inProgress.slice().sort((a, b) => a.progress.pct - b.progress.pct)[0] ?? null;

  const open = (courseId: string) => {
    openCourse(courseId);
    navigate("/academy/lecon");
  };

  const notShipped = () => showToast(t("common.notIncludedTitle"), t("common.notIncludedScreen"), "info");

  return (
    <div>
      <section className="relative overflow-hidden bg-[var(--surface-inverse)] px-[clamp(14px,4vw,48px)] py-[clamp(40px,6vw,72px)] text-[var(--text-inverse)]">
        {/* Same gem field as the Academy hero: the member area belongs to it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[.16]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 18%, var(--gt-blue-300) 0, transparent 36%), radial-gradient(circle at 88% 8%, var(--gt-emerald-400) 0, transparent 32%), radial-gradient(circle at 70% 92%, var(--gt-fuchsia-400) 0, transparent 38%)",
          }}
        />
        <div className="relative mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="grid h-14 w-14 flex-none place-items-center rounded-full bg-[var(--gt-blue-300)] text-[18px] font-[var(--weight-black)] text-[var(--gt-ink-900)]"
              >
                {initials}
              </span>
              <div className="grid gap-1">
                <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
                  {t("account.eyebrow")}
                </span>
                <h1 className="text-[length:var(--text-h1)] text-[var(--gt-off-white)]">
                  {t("account.greeting", { name: displayName })}
                </h1>
                {memberSince && (
                  <span className="text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">
                    {t("account.memberSince", { date: formatMonthYear(memberSince) })}
                  </span>
                )}
              </div>
            </div>
            <Button variant="glass" size="sm" iconLeft={LogOut} onClick={() => { signOut(); navigate("/"); }}>
              {t("auth.signOut")}
            </Button>
          </div>

          <dl aria-label={t("account.statsLabel")} className="m-0 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile value={String(inProgress.length)} label={t("account.statCourses")} />
            <StatTile value={String(lessonsDone)} label={t("account.statLessons")} />
            <StatTile value={String(certificates)} label={t("account.statCertificates")} />
            <StatTile value={String(orders.length)} label={t("account.statOrders")} />
          </dl>

          {/* Resume card: the single most useful thing on the page, so it sits
              inside the hero rather than below the fold. */}
          {resume ? (
            <div className="grid grid-cols-1 gap-5 rounded-[var(--radius-card)] border border-white/12 bg-white/[.06] p-[var(--space-5)] sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
              <div className="relative aspect-video overflow-hidden rounded-[var(--radius-md)]">
                <img
                  src={resume.course.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 grid place-items-center text-white/90">
                  <PlayCircle size={40} strokeWidth={1.5} aria-hidden="true" />
                </span>
              </div>
              <div className="grid content-center gap-3">
                <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
                  {t("account.resumeEyebrow")}
                </span>
                <strong className="text-[length:var(--text-h4)] text-[var(--gt-off-white)]">
                  {t("account.resumeLesson", {
                    number: resume.progress.activeIdx + 1,
                    title: pick(FLAT[resume.progress.activeIdx].title, lang),
                  })}
                </strong>
                <span className="text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">
                  {pick(resume.course.title, lang)} ·{" "}
                  {pick(MODULES[moduleIndexForFlatIndex(resume.progress.activeIdx)].title, lang)} ·{" "}
                  {t("account.resumeRemaining", { minutes: resume.progress.remainingMinutes })}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" iconRight={ArrowRight} onClick={() => open(resume.course.id)}>
                    {t("account.resumeCta")}
                  </Button>
                  <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--gt-ink-300)]">
                    {t("lesson.progressLabel", { done: resume.progress.doneCount, total: resume.progress.total })} ·{" "}
                    {resume.progress.pct}%
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-white/12 bg-white/[.06] p-[var(--space-5)]">
              <div className="grid gap-1">
                <strong className="text-[length:var(--text-h4)] text-[var(--gt-off-white)]">
                  {t("account.resumeDoneTitle")}
                </strong>
                <span className="text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">
                  {t("account.resumeDoneBody")}
                </span>
              </div>
              <Button variant="primary" iconRight={ArrowRight} onClick={() => navigate("/academy")}>
                {t("account.resumeDoneCta")}
              </Button>
            </div>
          )}
        </div>
      </section>

      <section
        ref={coursesRef}
        className="gt-reveal mx-auto grid max-w-[var(--max-width-content)] gap-5 px-[clamp(14px,4vw,48px)] pt-[clamp(40px,5vw,72px)]"
      >
        <div className="grid gap-2">
          <span className="gt-eyebrow flex items-center gap-2">
            <GraduationCap size={13} aria-hidden="true" />
            {t("account.coursesEyebrow")}
          </span>
          <h2 className="text-[length:var(--text-h2)]">{t("account.coursesTitle")}</h2>
        </div>
        {enrolled.length === 0 ? (
          <p className="m-0 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] p-[var(--space-6)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("account.coursesEmpty")}
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-4 p-0">
            {progressByCourse.map(({ course, progress }) => (
              <EnrolledCourseRow
                key={course.id}
                course={course}
                progress={progress}
                lang={lang}
                onOpen={() => open(course.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section
        ref={certificatesRef}
        className="gt-reveal mx-auto grid max-w-[var(--max-width-content)] gap-5 px-[clamp(14px,4vw,48px)] pt-[clamp(40px,5vw,72px)]"
      >
        <div className="grid gap-2">
          <span className="gt-eyebrow flex items-center gap-2">
            <Award size={13} aria-hidden="true" />
            {t("account.certificatesEyebrow")}
          </span>
          <h2 className="text-[length:var(--text-h2)]">{t("account.certificatesTitle")}</h2>
          <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("account.certificatesBody")}
          </p>
        </div>
        {enrolled.length === 0 ? (
          <p className="m-0 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] p-[var(--space-6)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("account.certificatesEmpty")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {progressByCourse.map(({ course, progress }) => (
              <CertificateCard
                key={course.id}
                course={course}
                progress={progress}
                lang={lang}
                onDownload={() =>
                  showToast(t("account.toastCertificateTitle"), t("account.toastCertificateBody"), "info")
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto grid max-w-[var(--max-width-content)] gap-5 px-[clamp(14px,4vw,48px)] pt-[clamp(40px,5vw,72px)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-2">
            <span className="gt-eyebrow flex items-center gap-2">
              <ListVideo size={13} aria-hidden="true" />
              {t("account.availableEyebrow")}
            </span>
            <h2 className="text-[length:var(--text-h2)]">{t("account.availableTitle")}</h2>
          </div>
          <Link
            to="/academy"
            className="text-[length:var(--text-caption)] text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]"
          >
            {t("account.availableCta")}
          </Link>
        </div>
        {available.length === 0 ? (
          <p className="m-0 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] p-[var(--space-6)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("account.availableAllDone")}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((course) => (
              <CourseCard
                key={course.id}
                course={{
                  id: course.id,
                  title: pick(course.title, lang),
                  level: pick(course.level, lang),
                  lessonCount: course.lessonCount,
                  duration: course.duration,
                  price: course.price,
                  image: course.image,
                  state: "available",
                }}
                onSelect={() => open(course.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section
        ref={ordersRef}
        className="gt-reveal mx-auto grid max-w-[var(--max-width-content)] gap-5 px-[clamp(14px,4vw,48px)] py-[clamp(40px,5vw,72px)]"
      >
        <div className="grid gap-2">
          <span className="gt-eyebrow flex items-center gap-2">
            <Package size={13} aria-hidden="true" />
            {t("account.ordersEyebrow")}
          </span>
          <h2 className="text-[length:var(--text-h2)]">{t("account.ordersTitle")}</h2>
        </div>
        {orders.length === 0 ? (
          <div className="grid justify-items-start gap-4 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] p-[var(--space-6)]">
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("account.ordersEmpty")}</p>
            <Button variant="outline" size="sm" iconLeft={ShoppingBag} onClick={() => navigate("/boutique")}>
              {t("account.ordersEmptyCta")}
            </Button>
          </div>
        ) : (
          <ul className="m-0 grid list-none gap-4 p-0">
            {orders.map((order) => (
              <OrderCard
                key={order.reference}
                order={order}
                lang={lang}
                onInvoice={notShipped}
                onTrack={notShipped}
              />
            ))}
          </ul>
        )}

        <div className="mt-4 grid gap-3 rounded-[var(--radius-card)] bg-[var(--surface-sunken)] p-[var(--space-6)]">
          <h2 className="text-[length:var(--text-h4)]">{t("account.detailsTitle")}</h2>
          <dl className="m-0 grid gap-2 text-[length:var(--text-body-sm)] sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-[var(--text-muted)]">{t("account.detailsName")}</dt>
              <dd className="m-0 font-semibold text-[var(--text-primary)]">{displayName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-[var(--text-muted)]">{t("account.detailsEmail")}</dt>
              <dd className="m-0 font-semibold text-[var(--text-primary)]">{email}</dd>
            </div>
          </dl>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("account.detailsNote")}</p>
          <div>
            <Button variant="outline" size="sm" iconLeft={LogOut} onClick={() => { signOut(); navigate("/"); }}>
              {t("auth.signOut")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
