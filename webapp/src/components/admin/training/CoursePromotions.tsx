import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Save, TicketPercent, Trash2, X } from "lucide-react";
import { AdminButton } from "../AdminButton";
import { AdminSelect } from "../AdminSelect";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { ToggleSwitch } from "../ToggleSwitch";
import { Section } from "./TrainingPrimitives";
import { trainingErrorMessage } from "./trainingErrors";
import type { TrainingCourse } from "../../../data/adminTraining";
import { useAdminTraining } from "../../../lib/adminTraining";
import {
  currentPrice,
  discountedPrice,
  minorToDecimalString,
  parsePriceInput,
  promotionProblems,
  promotionState,
  type CourseDiscountType,
  type CoursePromotion,
} from "../../../lib/coursePricing";
import { useFormat } from "../../../lib/format";
import { useToast } from "../../../lib/toast";

/**
 * Promotions of one course: a dated percentage or amount off, at most one
 * running at a time. A course is not a shop product, so the shop's promotion
 * engine does not apply to it (owner's decision, 2026-10-01).
 *
 * Saved one by one, straight away — independent of the course draft. The
 * database checks the same rules again (overlap, amount below the stored
 * price); the form checks them first so a refusal is the exception.
 */
export function CoursePromotions({ course }: { course: TrainingCourse }) {
  const { t } = useTranslation();
  const { formatMoney, formatDate } = useFormat();
  const { showToast } = useToast();
  const { promotionsFor, savePromotion, deletePromotion, saving } = useAdminTraining();
  const promotions = promotionsFor(course.id);
  const [editing, setEditing] = useState<CoursePromotion | null>(null);
  const [removing, setRemoving] = useState<CoursePromotion | null>(null);
  // The back office renders in the browser only, so reading the clock here is safe.
  const now = new Date();
  const price = currentPrice(course.priceMinor, promotions, now);
  const money = (minor: number) => formatMoney(minor, course.currency);

  const startNew = () =>
    setEditing({
      id: crypto.randomUUID(),
      courseId: course.id,
      label: "",
      discountType: "percentage",
      value: 10,
      startsAt: new Date().toISOString(),
      endsAt: null,
      active: true,
    });

  return (
    <Section
      title={t("admin.training.promotions.title")}
      description={t("admin.training.promotions.hint")}
      icon={TicketPercent}
      aside={
        !editing && (
          <AdminButton variant="outline" size="sm" iconLeft={Plus} onClick={startNew}>
            {t("admin.training.promotions.add")}
          </AdminButton>
        )
      }
    >
      <div className="grid gap-3">
        <p className="m-0 text-[length:var(--text-body-sm)]">
          {price.promotion ? (
            <>
              {t("admin.training.promotions.currentDiscounted", { price: money(price.priceMinor), regular: money(course.priceMinor) })}
            </>
          ) : (
            t("admin.training.promotions.current", { price: money(course.priceMinor) })
          )}
        </p>

        {promotions.length === 0 && !editing && (
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.training.promotions.empty")}</p>
        )}

        {promotions.length > 0 && (
          <ul className="m-0 grid list-none gap-2 p-0">
            {promotions
              .slice()
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
              .map((promotion) => {
                const state = promotionState(promotion, now);
                return (
                  <li
                    key={promotion.id}
                    className="flex flex-wrap items-center gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-3"
                  >
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="text-[length:var(--text-body-sm)]">{promotion.label}</strong>
                        <span className="rounded-[var(--radius-pill)] bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] font-semibold">
                          {t(`admin.training.promotions.state.${state}`)}
                        </span>
                      </span>
                      <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                        {promotion.discountType === "percentage"
                          ? t("admin.training.promotions.percentOff", { value: promotion.value })
                          : t("admin.training.promotions.amountOff", { value: money(promotion.value) })}
                        {" → "}
                        {money(discountedPrice(course.priceMinor, promotion.discountType, promotion.value))}
                        {" · "}
                        {promotion.endsAt
                          ? t("admin.training.promotions.period", { from: formatDate(promotion.startsAt), to: formatDate(promotion.endsAt) })
                          : t("admin.training.promotions.openEnded", { from: formatDate(promotion.startsAt) })}
                      </span>
                    </span>
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      iconLeft={Pencil}
                      onClick={() => setEditing(promotion)}
                      aria-label={t("admin.training.promotions.editNamed", { name: promotion.label })}
                    >
                      <span className="hidden sm:inline">{t("admin.training.promotions.edit")}</span>
                    </AdminButton>
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      iconLeft={Trash2}
                      onClick={() => setRemoving(promotion)}
                      aria-label={t("admin.training.promotions.deleteNamed", { name: promotion.label })}
                      className="text-[var(--status-error-fg)]"
                    />
                  </li>
                );
              })}
          </ul>
        )}

        {editing && (
          <PromotionForm
            key={editing.id}
            initial={editing}
            priceMinor={course.priceMinor}
            others={promotions}
            currency={course.currency}
            busy={saving}
            onCancel={() => setEditing(null)}
            onSave={async (promotion) => {
              try {
                await savePromotion(promotion);
                setEditing(null);
                showToast(t("admin.training.promotions.saved"));
              } catch (error) {
                const message = trainingErrorMessage(t, error);
                showToast(message.title, message.body, "error");
              }
            }}
          />
        )}
      </div>

      <ConfirmationDialog
        open={removing !== null}
        icon={Trash2}
        tone="danger"
        title={t("admin.training.promotions.deleteTitle")}
        body={<p className="m-0">{t("admin.training.promotions.deleteBody", { name: removing?.label ?? "" })}</p>}
        confirmLabel={t("admin.training.actions.delete")}
        cancelLabel={t("common.cancel")}
        loading={saving}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await deletePromotion(removing.id);
            showToast(t("admin.training.promotions.deleted"), undefined, "info");
          } catch (error) {
            const message = trainingErrorMessage(t, error);
            showToast(message.title, message.body, "error");
          } finally {
            setRemoving(null);
          }
        }}
        onCancel={() => setRemoving(null)}
      />
    </Section>
  );
}

/** ISO timestamp ↔ the value of a `datetime-local` input, in the browser's time zone. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function PromotionForm({
  initial,
  priceMinor,
  others,
  currency,
  busy,
  onSave,
  onCancel,
}: {
  initial: CoursePromotion;
  priceMinor: number;
  others: CoursePromotion[];
  currency: string;
  busy: boolean;
  onSave: (promotion: CoursePromotion) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const ids = { label: useId(), type: useId(), value: useId(), start: useId(), end: useId(), errors: useId() };
  const [label, setLabel] = useState(initial.label);
  const [type, setType] = useState<CourseDiscountType>(initial.discountType);
  const [valueText, setValueText] = useState(
    initial.discountType === "amount" ? minorToDecimalString(initial.value).replace(".", ",") : String(initial.value),
  );
  const [start, setStart] = useState(toLocalInput(initial.startsAt));
  const [end, setEnd] = useState(initial.endsAt ? toLocalInput(initial.endsAt) : "");
  const [active, setActive] = useState(initial.active);
  const [tried, setTried] = useState(false);

  const value = type === "amount" ? parsePriceInput(valueText) ?? -1 : /^\d{1,2}$/.test(valueText.trim()) ? Number(valueText) : -1;
  const draft: CoursePromotion = {
    ...initial,
    label,
    discountType: type,
    value,
    startsAt: fromLocalInput(start) ?? "",
    endsAt: end ? fromLocalInput(end) ?? "invalid" : null,
    active,
  };
  const problems = promotionProblems(draft, priceMinor, others);
  const showProblems = tried && problems.length > 0;

  return (
    <div className="grid gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-default)] bg-[var(--admin-panel-sunken)] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1 sm:col-span-2">
          <label htmlFor={ids.label} className="text-[length:var(--text-caption)] font-semibold">
            {t("admin.training.promotions.label")}
          </label>
          <input
            id={ids.label}
            type="text"
            maxLength={120}
            className="gt-admin-field"
            placeholder={t("admin.training.promotions.labelPlaceholder")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor={ids.type} className="text-[length:var(--text-caption)] font-semibold">
            {t("admin.training.promotions.type")}
          </label>
          <AdminSelect
            id={ids.type}
            value={type}
            onChange={(e) => setType(e.target.value as CourseDiscountType)}
            options={[
              { value: "percentage", label: t("admin.training.promotions.typePercentage") },
              { value: "amount", label: t("admin.training.promotions.typeAmount") },
            ]}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor={ids.value} className="text-[length:var(--text-caption)] font-semibold">
            {type === "percentage" ? t("admin.training.promotions.valuePercent") : t("admin.training.promotions.valueAmount", { currency })}
          </label>
          <input
            id={ids.value}
            type="text"
            inputMode="decimal"
            className="gt-admin-field tabular-nums"
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor={ids.start} className="text-[length:var(--text-caption)] font-semibold">
            {t("admin.training.promotions.starts")}
          </label>
          <input id={ids.start} type="datetime-local" className="gt-admin-field" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={ids.end} className="text-[length:var(--text-caption)] font-semibold">
            {t("admin.training.promotions.ends")}
          </label>
          <input id={ids.end} type="datetime-local" className="gt-admin-field" value={end} onChange={(e) => setEnd(e.target.value)} />
          <span className="text-[11px] text-[var(--text-muted)]">{t("admin.training.promotions.endsHint")}</span>
        </div>
      </div>
      <ToggleSwitch label={t("admin.training.promotions.active")} description={t("admin.training.promotions.activeHint")} checked={active} onChange={setActive} />

      {value > 0 && !problems.includes("value") && (
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("admin.training.promotions.resulting", { price: formatMoney(discountedPrice(priceMinor, type, value), currency) })}
        </p>
      )}

      {showProblems && (
        <ul id={ids.errors} role="alert" className="m-0 grid list-none gap-0.5 p-0 text-[length:var(--text-caption)] text-[var(--status-error-fg)]">
          {problems.map((problem) => (
            <li key={problem}>{t(`admin.training.promotions.problems.${problem}`)}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <AdminButton
          variant="primary"
          size="sm"
          iconLeft={Save}
          loading={busy}
          aria-describedby={showProblems ? ids.errors : undefined}
          onClick={() => {
            setTried(true);
            if (problems.length === 0) void onSave({ ...draft, label: label.trim() });
          }}
        >
          {t("admin.training.promotions.save")}
        </AdminButton>
        <AdminButton variant="outline" size="sm" iconLeft={X} onClick={onCancel}>
          {t("common.cancel")}
        </AdminButton>
      </div>
    </div>
  );
}
