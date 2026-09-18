import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Award,
  BadgeCheck,
  BookOpen,
  CalendarPlus,
  ChevronRight,
  CircleSlash,
  FileText,
  GraduationCap,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Receipt,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import { FulfillmentBadge, OrderStatusBadge, PaymentStatusBadge } from "./StatusBadges";
import { formatDateShort, formatPrice } from "../../lib/format";
import { pick } from "../../data/types";
import { COURSES } from "../../data/courses";
import { countryLabelKey } from "../../data/countries";
import { orderItemCount, orderTotal, type AdminOrder } from "../../data/adminOrders";
import {
  averageOrderValue,
  trainingState,
  type AdminCustomerRecord,
  type CustomerEvent,
  type CustomerEventKind,
  type Enrollment,
} from "../../data/adminCustomers";

/**
 * The panels behind the customer detail tabs.
 *
 * Each one answers a single question and stops there. The temptation on a
 * customer record is to show everything it holds; what an administrator
 * actually arrives with is one of five questions — who are they, what have they
 * bought, where are they in the training, what has happened, what do we know
 * internally — and each tab is the shortest complete answer to one of them.
 */

/** Course title in the active language, or the id if the course is gone. */
function courseTitle(courseId: string, lang: string): string {
  const course = COURSES.find((c) => c.id === courseId);
  return course ? pick(course.title, lang) : courseId;
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The six figures, as one metric row.
 *
 * Six small cells rather than six cards: this sits directly under the profile
 * header, and six bordered cards there would push the tabs — the thing the
 * operator came to use — below the fold on a laptop.
 *
 * "Total orders" and "Total spent" are the customer's **lifetime** figures, and
 * they are labelled as such, because the orders tab underneath lists only what
 * the current book holds. Presenting either as the other is the one genuinely
 * misleading thing this page could do.
 */
export function CustomerSummary({
  customer,
  orderCountInBook,
  lastOrder,
}: {
  customer: AdminCustomerRecord;
  orderCountInBook: number;
  lastOrder?: string;
}) {
  const { t } = useTranslation();
  const state = trainingState(customer);

  const cells: { key: string; label: string; value: string; hint?: string }[] = [
    {
      key: "orders",
      label: t("admin.customers.summaryOrders"),
      value: String(customer.orderCount),
      hint: t("admin.customers.summaryLifetime"),
    },
    {
      key: "spent",
      label: t("admin.customers.summarySpent"),
      value: customer.lifetimeValue === 0 ? "—" : formatPrice(customer.lifetimeValue),
      hint: t("admin.customers.summaryLifetime"),
    },
    {
      key: "aov",
      label: t("admin.customers.summaryAverage"),
      value: customer.orderCount === 0 ? "—" : formatPrice(averageOrderValue(customer)),
    },
    {
      key: "last",
      label: t("admin.customers.summaryLastOrder"),
      value: lastOrder ? formatDateShort(lastOrder.slice(0, 10)) : "—",
      hint: lastOrder ? undefined : t("admin.customers.summaryNoneInBook"),
    },
    {
      key: "training",
      label: t("admin.customers.summaryTraining"),
      value: t(`admin.customers.training.${state}`),
      hint:
        customer.enrollments.length > 0
          ? t("admin.customers.summaryCourses", { count: customer.enrollments.length })
          : undefined,
    },
    {
      key: "created",
      label: t("admin.customers.summaryCreated"),
      value: formatDateShort(customer.since),
    },
  ];

  return (
    <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-3 xl:grid-cols-6">
      {cells.map((cell) => (
        <div key={cell.key} className="grid gap-1 bg-[var(--surface-card)] p-3.5">
          <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
            {cell.label}
          </dt>
          <dd className="m-0 grid gap-0.5">
            <span className="truncate text-[length:var(--text-body-md)] font-[var(--weight-black)] tabular-nums leading-tight text-[var(--text-primary)]">
              {cell.value}
            </span>
            {cell.hint && <span className="truncate text-[10px] text-[var(--text-subtle)]">{cell.hint}</span>}
          </dd>
        </div>
      ))}
      {/* The one place the two order figures could be read as contradicting
          each other, said out loud for a screen reader. A `div`, not a `p`:
          only `dt`, `dd` and `div` are permitted children of a `dl`. */}
      {orderCountInBook !== customer.orderCount && (
        <div className="sr-only">{t("admin.customers.summaryBookNote", { count: orderCountInBook })}</div>
      )}
    </dl>
  );
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

function Panel({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[length:var(--text-h4)]">
          {Icon && <Icon size={15} aria-hidden="true" className="text-[var(--text-muted)]" />}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

/**
 * The overview tab: the account's details, plus the last three things that
 * happened.
 *
 * The recent activity is capped at three and links to the full timeline. A tab
 * called "Overview" that reproduces the whole of the "Activity" tab is two tabs
 * doing one job.
 */
export function OverviewPanel({
  customer,
  recent,
  onEdit,
  onSeeAllActivity,
}: {
  customer: AdminCustomerRecord;
  recent: CustomerEvent[];
  onEdit: () => void;
  onSeeAllActivity: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,1fr)]">
      <Panel
        title={t("admin.customers.detailsTitle")}
        icon={UserRound}
        action={
          <Button size="sm" variant="ghost" iconLeft={Pencil} onClick={onEdit}>
            {t("admin.customers.actionEdit")}
          </Button>
        }
      >
        <dl className="m-0 grid gap-4 sm:grid-cols-2">
          <Field
            label={t("admin.customers.fieldEmail")}
            value={
              <a
                href={`mailto:${customer.email}`}
                className="flex items-center gap-1.5 break-all underline decoration-1 underline-offset-4 hover:text-[var(--accent-highlight-ink)]"
              >
                <Mail size={13} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
                {customer.email}
              </a>
            }
          />
          <Field
            label={t("admin.customers.fieldPhone")}
            value={
              <a
                href={`tel:${customer.phone.replace(/\s/g, "")}`}
                className="flex items-center gap-1.5 underline decoration-1 underline-offset-4 hover:text-[var(--accent-highlight-ink)]"
              >
                <Phone size={13} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
                {customer.phone}
              </a>
            }
          />
          <Field
            label={t("admin.customers.fieldAddress")}
            value={
              <span className="flex items-start gap-1.5">
                <MapPin size={13} aria-hidden="true" className="mt-1 flex-none text-[var(--text-muted)]" />
                <span>
                  {customer.addressLine}
                  <br />
                  {customer.postalCode} {customer.city}
                  <br />
                  {t(countryLabelKey(customer.country))}
                </span>
              </span>
            }
          />
          <div className="grid gap-4">
            <Field
              label={t("admin.customers.fieldBirthDate")}
              value={
                customer.birthDate ? (
                  formatDateShort(customer.birthDate)
                ) : (
                  <span className="text-[var(--text-subtle)]">{t("admin.customers.notProvided")}</span>
                )
              }
            />
            <Field
              label={t("admin.customers.fieldMarketing")}
              value={
                <Badge tone={customer.marketingOptIn ? "success" : "neutral"} size="sm">
                  {t(customer.marketingOptIn ? "admin.customers.optedIn" : "admin.customers.optedOut")}
                </Badge>
              }
            />
          </div>
        </dl>
      </Panel>

      <Panel
        title={t("admin.customers.recentActivity")}
        icon={Sparkles}
        action={
          <Button size="sm" variant="ghost" iconRight={ChevronRight} onClick={onSeeAllActivity}>
            {t("admin.customers.seeAll")}
          </Button>
        }
      >
        {recent.length === 0 ? (
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("admin.customers.activityEmpty")}
          </p>
        ) : (
          <ActivityTimeline events={recent} />
        )}
      </Panel>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Orders                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The orders tab.
 *
 * The heading says "orders in this workspace" rather than "orders": the book is
 * a recent window, and a customer whose summary says fifteen will see four
 * listed here. Naming the scope is a line of copy; letting the two numbers
 * contradict each other unexplained is a support ticket.
 *
 * Each row links to the real order page rather than reproducing it — the order
 * detail already exists, and a second rendering of an order inside a customer
 * tab is a second thing to keep correct.
 */
export function OrdersPanel({
  orders,
  lifetimeCount,
  hrefForOrder,
}: {
  orders: AdminOrder[];
  lifetimeCount: number;
  hrefForOrder: (order: AdminOrder) => string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  if (orders.length === 0) {
    return (
      <Panel title={t("admin.customers.ordersTitle")} icon={ShoppingBag}>
        <div className="grid justify-items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] px-6 py-10 text-center">
          <span
            aria-hidden="true"
            className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-muted)]"
          >
            <Receipt size={19} />
          </span>
          <h3 className="text-[length:var(--text-body-md)]">{t("admin.customers.ordersEmptyTitle")}</h3>
          <p className="m-0 max-w-[44ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {lifetimeCount > 0
              ? t("admin.customers.ordersEmptyOutsideWindow", { count: lifetimeCount })
              : t("admin.customers.ordersEmptyBody")}
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title={t("admin.customers.ordersTitle")}
      icon={ShoppingBag}
      action={
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("admin.customers.ordersScope", { shown: orders.length, lifetime: lifetimeCount })}
        </span>
      }
    >
      <ul className="m-0 grid list-none gap-2 p-0">
        {orders.map((order) => (
          <li key={order.reference}>
            <Link
              to={hrefForOrder(order)}
              className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3.5 transition-colors hover:border-[var(--gt-ink-400)] hover:bg-[var(--gt-ink-100)]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <span className="grid min-w-0 gap-1.5">
                <span className="flex flex-wrap items-baseline gap-2">
                  <strong className="tabular-nums text-[var(--text-primary)]">#{order.reference}</strong>
                  <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {formatDateShort(order.placedAt.slice(0, 10))}
                    {" · "}
                    {t("admin.customers.ordersItems", { count: orderItemCount(order) })}
                  </span>
                </span>
                {/* The products, as one line. The full list lives on the order
                    page; here it only has to be recognisable. */}
                <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {order.lines.map((line) => pick(line.name, lang)).join(" · ")}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <PaymentStatusBadge status={order.payment.status} size="sm" compact />
                  <FulfillmentBadge status={order.fulfillment} size="sm" compact />
                  <OrderStatusBadge status={order.status} size="sm" compact />
                </span>
              </span>

              <span className="flex items-center justify-between gap-3 sm:justify-end">
                <strong className="text-[length:var(--text-body-md)] tabular-nums text-[var(--text-primary)]">
                  {formatPrice(orderTotal(order))}
                </strong>
                <ChevronRight size={16} aria-hidden="true" className="flex-none text-[var(--text-subtle)]" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Training                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The training tab.
 *
 * The progress bar is the point of this panel, so it is the widest element in
 * each row — and the percentage is printed beside it, because a bar alone is
 * unreadable for anyone who cannot see it and imprecise for everyone else.
 *
 * A finished course shows its score and whether the certificate has been
 * issued. Those are two different facts: a student can pass and still be
 * waiting on the diploma, and that gap is exactly the thing an administrator
 * opens this tab to check.
 */
export function TrainingPanel({ customer }: { customer: AdminCustomerRecord }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  if (customer.enrollments.length === 0) {
    return (
      <Panel title={t("admin.customers.trainingTitle")} icon={GraduationCap}>
        <div className="grid justify-items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] px-6 py-10 text-center">
          <span
            aria-hidden="true"
            className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-muted)]"
          >
            <BookOpen size={19} />
          </span>
          <h3 className="text-[length:var(--text-body-md)]">{t("admin.customers.trainingEmptyTitle")}</h3>
          <p className="m-0 max-w-[46ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("admin.customers.trainingEmptyBody")}
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={t("admin.customers.trainingTitle")} icon={GraduationCap}>
      <ul className="m-0 grid list-none gap-3 p-0">
        {customer.enrollments.map((seat) => (
          <EnrollmentRow key={seat.courseId} seat={seat} title={courseTitle(seat.courseId, lang)} />
        ))}
      </ul>
    </Panel>
  );
}

function EnrollmentRow({ seat, title }: { seat: Enrollment; title: string }) {
  const { t } = useTranslation();
  const done = seat.progress >= 100;

  return (
    <li className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="grid min-w-0 gap-1">
          <strong className="text-[length:var(--text-body-md)] text-[var(--text-primary)]">{title}</strong>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("admin.customers.trainingEnrolled", { date: formatDateShort(seat.enrolledAt) })}
          </span>
        </span>
        <Badge tone={done ? "success" : "brand"} size="sm" icon={done ? Award : BookOpen}>
          {t(done ? "admin.customers.training.completed" : "admin.customers.training.inProgress")}
        </Badge>
      </div>

      {/* `ProgressBar` draws its own label-and-percentage row, so the caption
          is passed to it rather than printed above it: two rows saying the same
          thing is how a "progress" block ends up 40px taller than the bar. */}
      <ProgressBar value={seat.progress} label={t("admin.customers.trainingProgress")} size="sm" />

      <dl className="m-0 grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-3">
        <Field
          label={t("admin.customers.trainingScore")}
          value={
            seat.score != null ? (
              <span className="tabular-nums">{t("admin.customers.trainingScoreValue", { score: seat.score })}</span>
            ) : (
              <span className="text-[var(--text-subtle)]">—</span>
            )
          }
        />
        <Field
          label={t("admin.customers.trainingCertificate")}
          value={
            done && seat.certificate ? (
              <Badge tone="success" size="sm" icon={BadgeCheck}>
                {t("admin.customers.trainingCertificateIssued")}
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm" icon={CircleSlash}>
                {t(done ? "admin.customers.trainingCertificatePending" : "admin.customers.trainingCertificateNone")}
              </Badge>
            )
          }
        />
        <Field label={t("admin.customers.trainingLastActivity")} value={formatDateShort(seat.lastActivity)} />
      </dl>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                   */
/* -------------------------------------------------------------------------- */

const EVENT_META: Record<CustomerEventKind, { icon: LucideIcon; tone: "neutral" | "good" | "warn" }> = {
  accountCreated: { icon: CalendarPlus, tone: "neutral" },
  orderPlaced: { icon: ShoppingBag, tone: "neutral" },
  orderDelivered: { icon: BadgeCheck, tone: "good" },
  trainingPurchased: { icon: GraduationCap, tone: "neutral" },
  courseStarted: { icon: BookOpen, tone: "neutral" },
  courseCompleted: { icon: Award, tone: "good" },
  diplomaIssued: { icon: BadgeCheck, tone: "good" },
  profileUpdated: { icon: Pencil, tone: "neutral" },
  statusChanged: { icon: ShieldAlert, tone: "warn" },
  noteAdded: { icon: FileText, tone: "neutral" },
};

const TONE_CLASS = {
  neutral: "bg-[var(--gt-ink-100)] text-[var(--text-body)] border-[var(--border-subtle)]",
  good: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--gt-emerald-300)]",
  warn: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--gt-amber-400)]",
};

/**
 * The account's history, newest first.
 *
 * Newest first, unlike the order timeline. The question is different: an order
 * timeline is read to understand how it got here, so it reads forwards; a
 * customer's history is read to find out what just happened, and the answer to
 * that is at the top.
 *
 * The connecting line is drawn by the markers themselves rather than by a
 * border on the list, so the last event has no trailing stub.
 */
export function ActivityTimeline({ events }: { events: CustomerEvent[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const locale = lang.startsWith("en") ? "en-IE" : "fr-FR";

  const stamp = (at: string) => {
    // Registration dates are plain days; everything else carries a time. A
    // midnight printed beside "Account created" would be invented precision.
    const hasTime = at.includes("T");
    const date = new Date(hasTime ? `${at}:00` : `${at}T12:00:00`);
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(hasTime ? { hour: "2-digit" as const, minute: "2-digit" as const } : {}),
    }).format(date);
  };

  const detailFor = (event: CustomerEvent): string | undefined => {
    if (!event.detail) return undefined;
    if (event.kind === "statusChanged") return t(`admin.customers.status.${event.detail}`);
    if (["trainingPurchased", "courseStarted", "courseCompleted", "diplomaIssued"].includes(event.kind)) {
      return courseTitle(event.detail, lang);
    }
    return event.detail;
  };

  return (
    <ol className="m-0 grid list-none gap-0 p-0">
      {[...events].reverse().map((event, index, all) => {
        const meta = EVENT_META[event.kind];
        const Icon = meta.icon;
        const detail = detailFor(event);
        return (
          <li key={`${event.kind}-${event.at}-${index}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <span className="grid justify-items-center">
              <span
                aria-hidden="true"
                className={`grid h-7 w-7 place-items-center rounded-full border ${TONE_CLASS[meta.tone]}`}
              >
                <Icon size={13} strokeWidth={2} />
              </span>
              {index < all.length - 1 && <span aria-hidden="true" className="w-px flex-1 bg-[var(--border-subtle)]" />}
            </span>
            <span className={`grid gap-0.5 ${index < all.length - 1 ? "pb-4" : ""}`}>
              <span className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                {t(`admin.customers.event.${event.kind}`)}
                {detail && <span className="text-[var(--text-muted)]">{` — ${detail}`}</span>}
              </span>
              <span className="text-[11px] tabular-nums text-[var(--text-subtle)]">{stamp(event.at)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ActivityPanel({ events }: { events: CustomerEvent[] }) {
  const { t } = useTranslation();
  return (
    <Panel title={t("admin.customers.activityTitle")} icon={Sparkles}>
      {events.length === 0 ? (
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("admin.customers.activityEmpty")}
        </p>
      ) : (
        <ActivityTimeline events={events} />
      )}
    </Panel>
  );
}
