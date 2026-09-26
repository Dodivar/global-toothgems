import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRightLeft, Check, Globe2, Search, X } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../admin/AdminButton";
import { AdminSheet, SheetBody, SheetFooter } from "../admin/AdminSheet";
import { ToggleSwitch } from "../admin/ToggleSwitch";
import { Segmented } from "../promotions/PromoUi";
import { centsToInput, parseEuros } from "../../lib/promotionRules";
import { countryName, flagOf, gramsToInput, parseKg, validateRate, validateZone, zoneOwning } from "../../lib/settingsRules";
import { COUNTRY_GROUPS, RATE_KINDS, type RateKind, type ShippingRate, type ShippingZone } from "../../data/adminSettings";
import { RATE_ICON, useRateText } from "./shippingFormat";
import { Eyebrow, SubHeading, TextField, focusRing } from "./SettingsUi";

/* -------------------------------------------------------------------------- */
/* Zone                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Create or edit a shipping zone: its name and the countries it covers.
 *
 * A country belongs to one zone at most — two zones for the same country would
 * leave checkout guessing which prices apply. So a country already in another
 * zone is shown with that zone's name, and choosing it *moves* it, with the
 * move spelled out before it is applied.
 */
export function ZoneSheet({
  open,
  zone,
  zones,
  isNew,
  onClose,
  onApply,
}: {
  open: boolean;
  zone: ShippingZone;
  zones: ShippingZone[];
  isNew: boolean;
  onClose: () => void;
  onApply: (zone: ShippingZone) => void;
}) {
  const { t } = useTranslation();
  return (
    <AdminSheet
      open={open}
      onClose={onClose}
      title={isNew ? t("settings.shipping.zoneSheet.newTitle") : t("settings.shipping.zoneSheet.editTitle", { name: zone.name })}
      description={t("settings.shipping.zoneSheet.description")}
      closeLabel={t("settings.ui.close")}
      width={640}
    >
      {open && <ZoneForm key={zone.id} zone={zone} zones={zones} isNew={isNew} onClose={onClose} onApply={onApply} />}
    </AdminSheet>
  );
}

function ZoneForm({
  zone,
  zones,
  isNew,
  onClose,
  onApply,
}: {
  zone: ShippingZone;
  zones: ShippingZone[];
  isNew: boolean;
  onClose: () => void;
  onApply: (zone: ShippingZone) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [z, setZ] = useState<ShippingZone>(zone);
  const [query, setQuery] = useState("");
  const [attempted, setAttempted] = useState(false);

  const errors = validateZone(z, zones);
  const otherRow = zones.find((o) => o.restOfWorld && o.id !== z.id);
  const selected = new Set(z.countries);

  const toggle = (code: string) =>
    setZ((prev) => ({
      ...prev,
      countries: prev.countries.includes(code) ? prev.countries.filter((c) => c !== code) : [...prev.countries, code],
    }));

  const setGroup = (codes: string[], on: boolean) =>
    setZ((prev) => ({
      ...prev,
      countries: on ? Array.from(new Set([...prev.countries, ...codes])) : prev.countries.filter((c) => !codes.includes(c)),
    }));

  const q = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      COUNTRY_GROUPS.map((g) => ({
        ...g,
        countries: g.countries
          .filter((c, i, all) => all.indexOf(c) === i)
          .map((c) => ({ code: c, name: countryName(c, lang) }))
          .filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q)
          .sort((a, b) => a.name.localeCompare(b.name, lang)),
      })).filter((g) => g.countries.length > 0),
    [lang, q],
  );

  // Countries this zone would take from another one, grouped by that zone.
  const moves = useMemo(() => {
    const byZone = new Map<string, string[]>();
    for (const code of z.countries) {
      const owner = zoneOwning(code, zones, z.id);
      if (owner) byZone.set(owner.name, [...(byZone.get(owner.name) ?? []), code]);
    }
    return Array.from(byZone.entries());
  }, [z.countries, zones, z.id]);

  const apply = () => {
    setAttempted(true);
    if (Object.keys(errors).length > 0) return;
    onApply({ ...z, name: z.name.trim(), countries: z.restOfWorld ? [] : z.countries });
  };

  return (
    <>
      <SheetBody>
        <div className="grid gap-5">
          <TextField
            label={t("settings.shipping.zoneSheet.name")}
            hint={t("settings.shipping.zoneSheet.nameHint")}
            value={z.name}
            required
            onChange={(v) => setZ({ ...z, name: v })}
            error={errors.name ? t(`settings.errors.${errors.name}`) : undefined}
            showError={attempted}
          />

          <div className="grid gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-4">
            <ToggleSwitch
              label={t("settings.shipping.zoneSheet.restOfWorld")}
              description={otherRow ? t("settings.shipping.zoneSheet.restOfWorldTaken", { name: otherRow.name }) : t("settings.shipping.zoneSheet.restOfWorldHint")}
              checked={z.restOfWorld}
              disabled={!!otherRow}
              onChange={(v) => setZ({ ...z, restOfWorld: v })}
            />
            <ToggleSwitch
              label={t("settings.shipping.zoneSheet.active")}
              description={t("settings.shipping.zoneSheet.activeHint")}
              checked={z.active}
              onChange={(v) => setZ({ ...z, active: v })}
            />
          </div>

          {z.restOfWorld ? (
            <div className="flex items-start gap-3 rounded-[var(--admin-radius-sm)] bg-[var(--gt-blue-50)] p-4 text-[length:var(--text-caption)] text-[var(--gt-blue-700)]">
              <Globe2 size={18} aria-hidden="true" className="flex-none" />
              <span>{t("settings.shipping.zoneSheet.restOfWorldBody")}</span>
            </div>
          ) : (
            <fieldset className="m-0 grid gap-3 border-0 p-0">
              <legend className="mb-1 flex w-full items-baseline justify-between gap-3 p-0">
                <span className="text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">
                  {t("settings.shipping.zoneSheet.countries")}
                  <span className="ml-1 text-[var(--accent-highlight-ink)]" aria-hidden="true">*</span>
                </span>
                <span className="text-[length:var(--text-caption)] font-semibold tabular-nums text-[var(--text-muted)]">
                  {t("settings.shipping.countryCount", { count: z.countries.length })}
                </span>
              </legend>

              {z.countries.length > 0 && (
                <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={t("settings.shipping.zoneSheet.selected")}>
                  {z.countries.map((c) => (
                    <li key={c}>
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        aria-label={t("settings.shipping.zoneSheet.remove", { country: countryName(c, lang) })}
                        className={clsx(
                          "inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] pl-2 pr-1.5 text-[length:var(--text-caption)] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--gt-blue-400)]",
                          focusRing,
                        )}
                      >
                        <span aria-hidden="true">{flagOf(c)}</span>
                        {countryName(c, lang)}
                        <X size={12} aria-hidden="true" className="text-[var(--text-muted)]" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {attempted && errors.countries && (
                <p role="alert" className="m-0 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">
                  {t(`settings.errors.${errors.countries}`)}
                </p>
              )}

              <label className="relative block">
                <span className="sr-only">{t("settings.shipping.zoneSheet.search")}</span>
                <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("settings.shipping.zoneSheet.search")}
                  className="gt-admin-field pl-9"
                />
              </label>

              <div className="grid gap-4">
                {groups.map((g) => {
                  const codes = g.countries.map((c) => c.code);
                  const allOn = codes.every((c) => selected.has(c));
                  return (
                    <div key={g.id} className="grid gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <Eyebrow>{t(`settings.shipping.groups.${g.id}`)}</Eyebrow>
                        <button
                          type="button"
                          onClick={() => setGroup(codes, !allOn)}
                          className={clsx("rounded-[4px] text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline underline-offset-2 hover:text-[var(--accent-highlight-ink)]", focusRing)}
                        >
                          {allOn ? t("settings.shipping.zoneSheet.clearGroup") : t("settings.shipping.zoneSheet.selectGroup", { count: codes.length })}
                        </button>
                      </div>
                      <ul className="m-0 grid list-none grid-cols-1 gap-1 p-0 sm:grid-cols-2">
                        {g.countries.map((c) => {
                          const owner = zoneOwning(c.code, zones, z.id);
                          const on = selected.has(c.code);
                          return (
                            <li key={c.code}>
                              <label
                                className={clsx(
                                  "flex cursor-pointer items-center gap-2.5 rounded-[6px] border px-2.5 py-2 transition-colors",
                                  on ? "border-[var(--gt-blue-300)] bg-[var(--gt-blue-50)]" : "border-transparent hover:bg-[var(--gt-ink-100)]",
                                  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggle(c.code)}
                                  className="h-4 w-4 flex-none accent-[var(--gt-ink-900)]"
                                />
                                <span aria-hidden="true">{flagOf(c.code)}</span>
                                <span className="grid min-w-0 flex-1">
                                  <span className="truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{c.name}</span>
                                  {owner && (
                                    <span className="truncate text-[11px] text-[var(--text-muted)]">
                                      {on ? t("settings.shipping.zoneSheet.movingFrom", { zone: owner.name }) : t("settings.shipping.zoneSheet.inZone", { zone: owner.name })}
                                    </span>
                                  )}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
                {groups.length === 0 && (
                  <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("settings.shipping.zoneSheet.noMatch", { query })}</p>
                )}
              </div>
            </fieldset>
          )}

          {moves.length > 0 && !z.restOfWorld && (
            <div className="flex items-start gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-3.5 text-[length:var(--text-caption)] text-[var(--status-warning-fg)]">
              <ArrowRightLeft size={16} aria-hidden="true" className="mt-px flex-none" />
              <ul className="m-0 grid list-none gap-0.5 p-0">
                {moves.map(([from, codes]) => (
                  <li key={from}>
                    {t("settings.shipping.zoneSheet.moveNotice", {
                      count: codes.length,
                      countries: codes.map((c) => countryName(c, lang)).join(", "),
                      zone: from,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </SheetBody>
      <SheetFooter>
        <span className="mr-auto hidden text-[length:var(--text-caption)] text-[var(--text-muted)] sm:inline">{t("settings.ui.appliesOnSave")}</span>
        <AdminButton variant="outline" onClick={onClose}>
          {t("settings.ui.cancel")}
        </AdminButton>
        <AdminButton variant="primary" iconLeft={Check} onClick={apply}>
          {isNew ? t("settings.shipping.zoneSheet.add") : t("settings.shipping.zoneSheet.apply")}
        </AdminButton>
      </SheetFooter>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Rate                                                                       */
/* -------------------------------------------------------------------------- */

interface RateInputs {
  name: string;
  minDays: string;
  maxDays: string;
  price: string;
  freeOver: string;
  minOrder: string;
  maxOrder: string;
  minWeight: string;
  maxWeight: string;
}

function toInputs(r: ShippingRate): RateInputs {
  return {
    name: r.name,
    minDays: String(r.minDays),
    maxDays: String(r.maxDays),
    price: centsToInput(r.priceCents),
    freeOver: centsToInput(r.freeOverCents),
    minOrder: centsToInput(r.minOrderCents),
    maxOrder: centsToInput(r.maxOrderCents),
    minWeight: gramsToInput(r.minWeightG),
    maxWeight: gramsToInput(r.maxWeightG),
  };
}

const int = (v: string) => (v.trim() === "" ? NaN : Number(v));

/**
 * Create or edit one shipping method inside a zone. The preview at the bottom
 * is the option as it will read at checkout, so the operator checks the
 * wording and the price in the customer's terms before applying.
 */
export function RateSheet({
  open,
  rate,
  zoneName,
  isNew,
  onClose,
  onApply,
}: {
  open: boolean;
  rate: ShippingRate;
  zoneName: string;
  isNew: boolean;
  onClose: () => void;
  onApply: (rate: ShippingRate) => void;
}) {
  const { t } = useTranslation();
  return (
    <AdminSheet
      open={open}
      onClose={onClose}
      title={isNew ? t("settings.shipping.rateSheet.newTitle") : t("settings.shipping.rateSheet.editTitle")}
      description={t("settings.shipping.rateSheet.description", { zone: zoneName })}
      closeLabel={t("settings.ui.close")}
      width={600}
    >
      {open && <RateForm key={rate.id} rate={rate} isNew={isNew} onClose={onClose} onApply={onApply} />}
    </AdminSheet>
  );
}

function RateForm({
  rate,
  isNew,
  onClose,
  onApply,
}: {
  rate: ShippingRate;
  isNew: boolean;
  onClose: () => void;
  onApply: (rate: ShippingRate) => void;
}) {
  const { t } = useTranslation();
  const { delivery, price, conditions } = useRateText();
  const [kind, setKind] = useState<RateKind>(rate.kind);
  const [active, setActive] = useState(rate.active);
  // A new method starts named after its type and without a price, so the
  // operator types one rather than accepting a silent zero.
  const [v, setV] = useState<RateInputs>(() => {
    const inputs = toInputs(rate);
    return isNew ? { ...inputs, name: inputs.name || t(`settings.shipping.kind.${rate.kind}`), price: rate.priceCents ? inputs.price : "" } : inputs;
  });
  const [attempted, setAttempted] = useState(false);
  const set = (patch: Partial<RateInputs>) => setV((prev) => ({ ...prev, ...patch }));

  const parsed: ShippingRate = {
    ...rate,
    kind,
    active,
    name: v.name,
    minDays: int(v.minDays),
    maxDays: int(v.maxDays),
    priceCents: kind === "free" || kind === "pickup" ? 0 : (parseEuros(v.price) ?? 0),
    freeOverCents: kind === "free" ? null : parseEuros(v.freeOver),
    minOrderCents: parseEuros(v.minOrder),
    maxOrderCents: parseEuros(v.maxOrder),
    minWeightG: parseKg(v.minWeight),
    maxWeightG: parseKg(v.maxWeight),
  };
  const errors = validateRate(parsed);
  const e = (k: keyof typeof errors) => (errors[k] ? t(`settings.errors.${errors[k]}`) : undefined);

  const changeKind = (next: RateKind) => {
    const defaults = RATE_KINDS.map((k) => t(`settings.shipping.kind.${k}`));
    const patch: Partial<RateInputs> = {};
    if (!v.name.trim() || defaults.includes(v.name)) patch.name = t(`settings.shipping.kind.${next}`);
    if (next === "free" && !v.minOrder) patch.minOrder = "75";
    if (next === "pickup") Object.assign(patch, { minDays: "1", maxDays: "1" });
    setKind(next);
    set(patch);
  };

  const apply = () => {
    setAttempted(true);
    if (Object.keys(errors).length > 0) return;
    onApply({ ...parsed, name: parsed.name.trim() });
  };

  const Icon = RATE_ICON[kind];
  const previewReady = !errors.days && !errors.name;

  return (
    <>
      <SheetBody>
        <div className="grid gap-5">
          <Segmented
            label={t("settings.shipping.rateSheet.kind")}
            value={kind}
            onChange={changeKind}
            options={RATE_KINDS.map((k) => ({ value: k, label: t(`settings.shipping.kind.${k}`), icon: RATE_ICON[k] }))}
          />
          <p className="-mt-3 m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`settings.shipping.kindHint.${kind}`)}</p>

          <TextField
            label={t("settings.shipping.rateSheet.name")}
            hint={t("settings.shipping.rateSheet.nameHint")}
            value={v.name}
            required
            onChange={(name) => set({ name })}
            error={e("name")}
            showError={attempted}
          />

          <div className="grid grid-cols-2 gap-4">
            <TextField
              label={kind === "pickup" ? t("settings.shipping.rateSheet.readyIn") : t("settings.shipping.rateSheet.minDays")}
              value={kind === "pickup" ? v.maxDays : v.minDays}
              inputMode="numeric"
              suffix={t("settings.shipping.rateSheet.days")}
              onChange={(x) => set(kind === "pickup" ? { minDays: x.replace(/\D/g, ""), maxDays: x.replace(/\D/g, "") } : { minDays: x.replace(/\D/g, "") })}
              error={e("days")}
              showError={attempted}
            />
            {kind !== "pickup" && (
              <TextField
                label={t("settings.shipping.rateSheet.maxDays")}
                value={v.maxDays}
                inputMode="numeric"
                suffix={t("settings.shipping.rateSheet.days")}
                onChange={(x) => set({ maxDays: x.replace(/\D/g, "") })}
              />
            )}
          </div>

          {kind === "free" ? (
            <TextField
              label={t("settings.shipping.rateSheet.freeFrom")}
              hint={t("settings.shipping.rateSheet.freeFromHint")}
              value={v.minOrder}
              inputMode="decimal"
              prefix="€"
              required
              onChange={(minOrder) => set({ minOrder })}
              error={e("freeOver")}
              showError={attempted}
            />
          ) : kind === "pickup" ? (
            <p className="m-0 rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] p-3 text-[length:var(--text-caption)] text-[var(--text-body)]">
              {t("settings.shipping.rateSheet.pickupFree")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <TextField
                label={t("settings.shipping.rateSheet.price")}
                value={v.price}
                inputMode="decimal"
                prefix="€"
                required
                onChange={(p) => set({ price: p })}
                error={e("price")}
                showError={attempted}
              />
              <TextField
                label={t("settings.shipping.rateSheet.freeOver")}
                hint={t("settings.shipping.rateSheet.optional")}
                value={v.freeOver}
                inputMode="decimal"
                prefix="€"
                onChange={(freeOver) => set({ freeOver })}
                error={e("freeOver")}
                showError={attempted}
              />
            </div>
          )}

          <SubHeading hint={t("settings.shipping.rateSheet.conditionsHint")}>{t("settings.shipping.rateSheet.conditions")}</SubHeading>
          {kind !== "free" && (
            <div className="grid grid-cols-2 gap-4">
              <TextField label={t("settings.shipping.rateSheet.minOrder")} value={v.minOrder} inputMode="decimal" prefix="€" placeholder={t("settings.shipping.rateSheet.noLimit")} onChange={(minOrder) => set({ minOrder })} />
              <TextField label={t("settings.shipping.rateSheet.maxOrder")} value={v.maxOrder} inputMode="decimal" prefix="€" placeholder={t("settings.shipping.rateSheet.noLimit")} onChange={(maxOrder) => set({ maxOrder })} error={e("orderRange")} showError />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <TextField label={t("settings.shipping.rateSheet.minWeight")} value={v.minWeight} inputMode="decimal" suffix="kg" placeholder={t("settings.shipping.rateSheet.noLimit")} onChange={(minWeight) => set({ minWeight })} />
            <TextField label={t("settings.shipping.rateSheet.maxWeight")} value={v.maxWeight} inputMode="decimal" suffix="kg" placeholder={t("settings.shipping.rateSheet.noLimit")} onChange={(maxWeight) => set({ maxWeight })} error={e("weightRange")} showError />
          </div>

          <div className="rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-4">
            <ToggleSwitch label={t("settings.shipping.rateSheet.active")} description={t("settings.shipping.rateSheet.activeHint")} checked={active} onChange={setActive} />
          </div>

          <div className="grid gap-2">
            <Eyebrow>{t("settings.shipping.rateSheet.preview")}</Eyebrow>
            <div className="flex items-center gap-3 rounded-[var(--admin-radius)] border-2 border-[var(--gt-ink-900)] bg-[var(--admin-panel)] p-3.5 shadow-[var(--shadow-sm)]" aria-live="polite">
              <span aria-hidden="true" className="grid h-5 w-5 flex-none place-items-center rounded-full border-2 border-[var(--gt-ink-900)]">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--gt-ink-900)]" />
              </span>
              <Icon size={18} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{v.name || t(`settings.shipping.kind.${kind}`)}</span>
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {previewReady ? delivery(parsed) : "—"}
                  {conditions(parsed).length > 0 && ` · ${conditions(parsed).join(" · ")}`}
                </span>
              </span>
              <span className="text-[length:var(--text-body-sm)] font-bold tabular-nums text-[var(--text-primary)]">{price(parsed)}</span>
            </div>
          </div>
        </div>
      </SheetBody>
      <SheetFooter>
        <span className="mr-auto hidden text-[length:var(--text-caption)] text-[var(--text-muted)] sm:inline">{t("settings.ui.appliesOnSave")}</span>
        <AdminButton variant="outline" onClick={onClose}>
          {t("settings.ui.cancel")}
        </AdminButton>
        <AdminButton variant="primary" iconLeft={Check} onClick={apply}>
          {isNew ? t("settings.shipping.rateSheet.add") : t("settings.shipping.rateSheet.apply")}
        </AdminButton>
      </SheetFooter>
    </>
  );
}
