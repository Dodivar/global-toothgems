import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  Globe2,
  MapPinned,
  PackageSearch,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  Truck,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../admin/AdminButton";
import { AdminIconButton } from "../admin/AdminIconButton";
import { AdminSelect } from "../admin/AdminSelect";
import { ConfirmationDialog } from "../admin/ConfirmationDialog";
import { EmptyState } from "../admin/EmptyState";
import { OverflowMenu } from "../admin/OverflowMenu";
import { useToast } from "../../lib/toast";
import { useAdminSettings } from "../../lib/adminSettings";
import { countryName, flagOf, resolveZone, shippingIssues } from "../../lib/settingsRules";
import { COUNTRY_GROUPS, type ShippingRate, type ShippingZone } from "../../data/adminSettings";
import { RateSheet, ZoneSheet } from "./ShippingSheets";
import { RATE_ICON, useRateText } from "./shippingFormat";
import { Eyebrow, RowSwitch, SettingsCard, StatusPill, focusRing } from "./SettingsUi";

/**
 * Shipping zones and the methods offered in each.
 *
 * The page answers one question above all: "what does a customer in country X
 * get offered?" So every zone card leads with its countries, the rates sit
 * directly under the countries they apply to, and a destination checker at
 * the top answers the question for one country outright — including the
 * uncomfortable answer "nothing, this zone is switched off".
 */

let seq = 0;
const newId = (prefix: string) => `${prefix}-new-${Date.now().toString(36)}-${++seq}`;

const blankRate = (): ShippingRate => ({
  id: newId("rate"),
  kind: "standard",
  name: "",
  minDays: 2,
  maxDays: 4,
  priceCents: 0,
  freeOverCents: null,
  minOrderCents: null,
  maxOrderCents: null,
  minWeightG: null,
  maxWeightG: null,
  active: true,
});

type SheetState =
  | { type: "zone"; zone: ShippingZone; isNew: boolean }
  | { type: "rate"; zoneId: string; rate: ShippingRate; isNew: boolean }
  | null;

type ConfirmState = { type: "zone"; zone: ShippingZone } | { type: "rate"; zone: ShippingZone; rate: ShippingRate } | null;

export function ShippingSection() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { draft, update } = useAdminSettings();
  const zones = draft.shipping;
  const [sheet, setSheet] = useState<SheetState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(id);
  }, [flash]);

  const setZones = (next: (z: ShippingZone[]) => ShippingZone[]) => update("shipping", next);
  const patchZone = (id: string, patch: (z: ShippingZone) => ShippingZone) => setZones((all) => all.map((z) => (z.id === id ? patch(z) : z)));

  const issues = useMemo(() => shippingIssues(zones), [zones]);
  const covered = zones.filter((z) => z.active).reduce((n, z) => n + z.countries.length, 0);
  const methods = zones.reduce((n, z) => n + z.rates.length, 0);
  const pending = t("settings.toast.pendingBody");

  /* Zone actions ----------------------------------------------------------- */

  const applyZone = (zone: ShippingZone, isNew: boolean) => {
    setZones((all) => {
      // A country chosen here leaves whichever zone held it before.
      const stripped = all.map((z) => (z.id === zone.id ? z : { ...z, countries: z.countries.filter((c) => !zone.countries.includes(c)) }));
      return isNew ? [...stripped, zone] : stripped.map((z) => (z.id === zone.id ? zone : z));
    });
    setSheet(null);
    setFlash(zone.id);
    showToast(t(isNew ? "settings.shipping.toast.zoneAdded" : "settings.shipping.toast.zoneUpdated", { name: zone.name }), pending, "info");
  };

  const duplicateZone = (zone: ShippingZone) => {
    // The copy starts with no countries and switched off: a country can only
    // live in one zone, and a copy going live by accident would double-list.
    const copy: ShippingZone = {
      ...zone,
      id: newId("zone"),
      name: t("settings.shipping.copyName", { name: zone.name }),
      countries: [],
      restOfWorld: false,
      active: false,
      rates: zone.rates.map((r) => ({ ...r, id: newId("rate") })),
    };
    setZones((all) => [...all, copy]);
    setSheet({ type: "zone", zone: copy, isNew: false });
    showToast(t("settings.shipping.toast.zoneDuplicated", { name: zone.name }), t("settings.shipping.toast.zoneDuplicatedBody"), "info");
  };

  const toggleZone = (zone: ShippingZone, active: boolean) => {
    patchZone(zone.id, (z) => ({ ...z, active }));
    showToast(t(active ? "settings.shipping.toast.zoneEnabled" : "settings.shipping.toast.zoneDisabled", { name: zone.name }), pending, "info");
  };

  /* Rate actions ----------------------------------------------------------- */

  const applyRate = (zoneId: string, rate: ShippingRate, isNew: boolean) => {
    patchZone(zoneId, (z) => ({ ...z, rates: isNew ? [...z.rates, rate] : z.rates.map((r) => (r.id === rate.id ? rate : r)) }));
    setSheet(null);
    setFlash(rate.id);
    showToast(t(isNew ? "settings.shipping.toast.rateAdded" : "settings.shipping.toast.rateUpdated", { name: rate.name }), pending, "info");
  };

  const toggleRate = (zoneId: string, rateId: string, active: boolean) =>
    patchZone(zoneId, (z) => ({ ...z, rates: z.rates.map((r) => (r.id === rateId ? { ...r, active } : r)) }));

  const onConfirmDelete = () => {
    if (!confirm) return;
    if (confirm.type === "zone") {
      setZones((all) => all.filter((z) => z.id !== confirm.zone.id));
      showToast(t("settings.shipping.toast.zoneDeleted", { name: confirm.zone.name }), pending, "info");
    } else {
      patchZone(confirm.zone.id, (z) => ({ ...z, rates: z.rates.filter((r) => r.id !== confirm.rate.id) }));
      showToast(t("settings.shipping.toast.rateDeleted", { name: confirm.rate.name }), pending, "info");
    }
    setConfirm(null);
  };

  const newZone = (): ShippingZone => ({ id: newId("zone"), name: "", countries: [], restOfWorld: false, active: true, rates: [] });
  const sheetZone = sheet?.type === "rate" ? zones.find((z) => z.id === sheet.zoneId) : undefined;

  return (
    <>
      {/* Overview ------------------------------------------------------------ */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-start">
        <div className="gt-admin-panel grid grid-cols-3 divide-x divide-[var(--border-subtle)] p-0">
          {[
            { label: t("settings.shipping.stats.zones"), value: zones.length, hint: t("settings.shipping.stats.active", { count: zones.filter((z) => z.active).length }) },
            { label: t("settings.shipping.stats.countries"), value: covered, hint: zones.some((z) => z.restOfWorld && z.active) ? t("settings.shipping.stats.plusWorld") : t("settings.shipping.stats.listed") },
            { label: t("settings.shipping.stats.methods"), value: methods, hint: t("settings.shipping.stats.active", { count: zones.reduce((n, z) => n + z.rates.filter((r) => r.active).length, 0) }) },
          ].map((s) => (
            <div key={s.label} className="grid content-center gap-0.5 px-4 py-4 sm:px-5">
              <span className="text-[26px] font-bold leading-none tabular-nums text-[var(--text-primary)]">{s.value}</span>
              <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{s.label}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{s.hint}</span>
            </div>
          ))}
        </div>
        <DestinationChecker zones={zones} />
      </div>

      {issues.length > 0 && (
        <div className="flex items-start gap-3 rounded-[var(--admin-radius)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-4 text-[var(--status-warning-fg)]">
          <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" />
          <div className="grid gap-1">
            <p className="m-0 text-[length:var(--text-body-sm)] font-semibold">{t("settings.shipping.issues.title", { count: issues.length })}</p>
            <ul className="m-0 grid list-disc gap-0.5 pl-4 text-[length:var(--text-caption)] text-[var(--text-body)]">
              {issues.map((i) => (
                <li key={i.zoneId}>{t(`settings.shipping.issues.${i.key}`, { zone: zones.find((z) => z.id === i.zoneId)?.name })}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Zones --------------------------------------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="text-[length:var(--text-h4)]">{t("settings.shipping.zonesTitle")}</h2>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("settings.shipping.zonesHint")}</p>
        </div>
        <AdminButton variant="dark" iconLeft={Plus} onClick={() => setSheet({ type: "zone", zone: newZone(), isNew: true })}>
          {t("settings.shipping.addZone")}
        </AdminButton>
      </div>

      {zones.length === 0 ? (
        <div className="gt-admin-panel">
          <EmptyState
            icon={MapPinned}
            title={t("settings.shipping.empty.title")}
            body={t("settings.shipping.empty.body")}
            action={
              <AdminButton variant="primary" iconLeft={Plus} onClick={() => setSheet({ type: "zone", zone: newZone(), isNew: true })}>
                {t("settings.shipping.addZone")}
              </AdminButton>
            }
          />
        </div>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0">
          {zones.map((zone) => (
            <li key={zone.id}>
              <ZoneCard
                zone={zone}
                flash={flash}
                lang={i18n.language}
                onEdit={() => setSheet({ type: "zone", zone, isNew: false })}
                onDuplicate={() => duplicateZone(zone)}
                onDelete={() => setConfirm({ type: "zone", zone })}
                onToggle={(v) => toggleZone(zone, v)}
                onAddRate={() => setSheet({ type: "rate", zoneId: zone.id, rate: blankRate(), isNew: true })}
                onEditRate={(rate) => setSheet({ type: "rate", zoneId: zone.id, rate, isNew: false })}
                onDeleteRate={(rate) => setConfirm({ type: "rate", zone, rate })}
                onToggleRate={(rateId, v) => toggleRate(zone.id, rateId, v)}
              />
            </li>
          ))}
        </ul>
      )}

      <ZoneSheet
        open={sheet?.type === "zone"}
        zone={sheet?.type === "zone" ? sheet.zone : newZone()}
        zones={zones}
        isNew={sheet?.type === "zone" && sheet.isNew}
        onClose={() => setSheet(null)}
        onApply={(z) => sheet?.type === "zone" && applyZone(z, sheet.isNew)}
      />
      <RateSheet
        open={sheet?.type === "rate"}
        rate={sheet?.type === "rate" ? sheet.rate : blankRate()}
        zoneName={sheetZone?.name ?? ""}
        isNew={sheet?.type === "rate" && sheet.isNew}
        onClose={() => setSheet(null)}
        onApply={(r) => sheet?.type === "rate" && applyRate(sheet.zoneId, r, sheet.isNew)}
      />
      <ConfirmationDialog
        open={confirm != null}
        tone="danger"
        icon={Trash2}
        title={
          confirm?.type === "zone"
            ? t("settings.shipping.confirm.zoneTitle", { name: confirm.zone.name })
            : t("settings.shipping.confirm.rateTitle", { name: confirm?.type === "rate" ? confirm.rate.name : "" })
        }
        body={
          confirm?.type === "zone"
            ? t("settings.shipping.confirm.zoneBody", { count: confirm.zone.countries.length, rates: confirm.zone.rates.length })
            : t("settings.shipping.confirm.rateBody", { zone: confirm?.zone.name ?? "" })
        }
        confirmLabel={confirm?.type === "zone" ? t("settings.shipping.confirm.zoneConfirm") : t("settings.shipping.confirm.rateConfirm")}
        cancelLabel={t("settings.ui.cancel")}
        onConfirm={onConfirmDelete}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function ZoneCard({
  zone,
  flash,
  lang,
  onEdit,
  onDuplicate,
  onDelete,
  onToggle,
  onAddRate,
  onEditRate,
  onDeleteRate,
  onToggleRate,
}: {
  zone: ShippingZone;
  flash: string | null;
  lang: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggle: (v: boolean) => void;
  onAddRate: () => void;
  onEditRate: (r: ShippingRate) => void;
  onDeleteRate: (r: ShippingRate) => void;
  onToggleRate: (id: string, v: boolean) => void;
}) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const activeRates = zone.rates.filter((r) => r.active).length;
  const PREVIEW = 8;
  const names = zone.countries.map((c) => ({ code: c, name: countryName(c, lang) })).sort((a, b) => a.name.localeCompare(b.name, lang));
  const visible = showAll ? names : names.slice(0, PREVIEW);

  return (
    <article
      aria-labelledby={`${zone.id}-name`}
      className={clsx(
        "gt-admin-panel overflow-hidden transition-[box-shadow,border-color] duration-[var(--duration-normal)]",
        flash === zone.id && "gt-settings-flash",
        !zone.active && "bg-[var(--admin-panel-sunken)]",
      )}
    >
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3 p-5 sm:px-6">
        <span
          aria-hidden="true"
          className={clsx(
            "grid h-11 w-11 flex-none place-items-center rounded-[12px] text-[20px]",
            zone.active ? "bg-[var(--gt-blue-100)]" : "bg-[var(--surface-sunken)] grayscale",
          )}
        >
          {zone.restOfWorld ? <Globe2 size={20} strokeWidth={1.8} className="text-[var(--gt-blue-700)]" /> : zone.countries.length === 1 ? flagOf(zone.countries[0]) : <MapPinned size={20} strokeWidth={1.8} className="text-[var(--gt-blue-700)]" />}
        </span>

        <div className="grid min-w-[14rem] flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`${zone.id}-name`} className={clsx("text-[length:var(--text-h4)]", !zone.active && "text-[var(--text-muted)]")}>
              {zone.name}
            </h3>
            <StatusPill active={zone.active} />
          </div>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {zone.restOfWorld
              ? t("settings.shipping.restOfWorldLine")
              : `${t("settings.shipping.countryCount", { count: zone.countries.length })} · ${t("settings.shipping.methodCount", { count: zone.rates.length, active: activeRates })}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-1 inline-flex items-center gap-2 text-[length:var(--text-caption)] font-semibold text-[var(--text-body)]">
            <RowSwitch checked={zone.active} onChange={onToggle} label={t("settings.shipping.zoneActive", { name: zone.name })} />
            <span aria-hidden="true" className="hidden sm:inline">
              {zone.active ? t("settings.ui.on") : t("settings.ui.off")}
            </span>
          </span>
          <AdminButton variant="outline" size="sm" iconLeft={Pencil} onClick={onEdit}>
            {t("settings.shipping.editZone")}
          </AdminButton>
          <OverflowMenu
            label={t("settings.shipping.zoneMenu", { name: zone.name })}
            actions={[
              { id: "rate", label: t("settings.shipping.addRate"), icon: Plus, onSelect: onAddRate },
              { id: "dup", label: t("settings.shipping.duplicate"), icon: Copy, onSelect: onDuplicate },
              { id: "del", label: t("settings.shipping.deleteZone"), icon: Trash2, onSelect: onDelete, tone: "danger", separated: true },
            ]}
          />
        </div>
      </header>

      {/* Countries: the first thing under the name, so the rates below read
          as "these methods, for these countries". */}
      {!zone.restOfWorld && (
        <div className="px-5 pb-4 sm:px-6">
          {names.length === 0 ? (
            <p className="m-0 inline-flex items-center gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-warning-bg)] px-3 py-2 text-[length:var(--text-caption)] font-medium text-[var(--status-warning-fg)]">
              <TriangleAlert size={14} aria-hidden="true" />
              {t("settings.shipping.noCountries")}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0" aria-label={t("settings.shipping.countriesIn", { name: zone.name })}>
              {visible.map((c) => (
                <li
                  key={c.code}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] px-2.5 text-[length:var(--text-caption)] text-[var(--text-primary)]"
                >
                  <span aria-hidden="true">{flagOf(c.code)}</span>
                  {c.name}
                </li>
              ))}
              {names.length > PREVIEW && (
                <li>
                  <button
                    type="button"
                    aria-expanded={showAll}
                    onClick={() => setShowAll((v) => !v)}
                    className={clsx("inline-flex h-7 items-center rounded-[var(--radius-pill)] px-2.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline underline-offset-2 hover:bg-[var(--gt-ink-100)]", focusRing)}
                  >
                    {showAll ? t("settings.shipping.showLess") : t("settings.shipping.showMore", { count: names.length - PREVIEW })}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {!zone.active && (
        <p className="mx-5 mb-4 flex items-start gap-2 rounded-[var(--admin-radius-sm)] border border-dashed border-[var(--border-default)] px-3 py-2 text-[length:var(--text-caption)] text-[var(--text-body)] sm:mx-6">
          <TriangleAlert size={14} aria-hidden="true" className="mt-px flex-none text-[var(--status-warning-fg)]" />
          {zone.restOfWorld ? t("settings.shipping.inactiveWorld") : t("settings.shipping.inactiveZone")}
        </p>
      )}

      {/* Rates */}
      <div className="border-t border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)]">
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-3 sm:px-6">
          <Eyebrow>{t("settings.shipping.methodsTitle")}</Eyebrow>
        </div>
        {zone.rates.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-1 sm:px-6">
            <p className="m-0 flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              <PackageSearch size={15} aria-hidden="true" />
              {t("settings.shipping.noRates")}
            </p>
          </div>
        ) : (
          <ul className="m-0 grid list-none gap-1.5 px-3 pb-2 pt-1 sm:px-4">
            {zone.rates.map((rate) => (
              <RateRow
                key={rate.id}
                rate={rate}
                flash={flash === rate.id}
                zoneActive={zone.active}
                onEdit={() => onEditRate(rate)}
                onDelete={() => onDeleteRate(rate)}
                onToggle={(v) => onToggleRate(rate.id, v)}
              />
            ))}
          </ul>
        )}
        <div className="px-3 pb-3 sm:px-4">
          <button
            type="button"
            onClick={onAddRate}
            className={clsx(
              "flex w-full items-center justify-center gap-2 rounded-[var(--admin-radius-sm)] border border-dashed border-[var(--border-default)] py-2.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-body)] transition-colors hover:border-[var(--gt-emerald-500)] hover:bg-[var(--status-success-bg)] hover:text-[var(--status-success-fg)]",
              focusRing,
            )}
          >
            <Plus size={14} aria-hidden="true" />
            {t("settings.shipping.addRateTo", { name: zone.name })}
          </button>
        </div>
      </div>
    </article>
  );
}

function RateRow({
  rate,
  flash,
  zoneActive,
  onEdit,
  onDelete,
  onToggle,
}: {
  rate: ShippingRate;
  flash: boolean;
  zoneActive: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const { delivery, price, conditions } = useRateText();
  const Icon = RATE_ICON[rate.kind];
  const conds = conditions(rate);
  const live = rate.active && zoneActive;

  return (
    <li
      className={clsx(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-[var(--admin-radius-sm)] border bg-[var(--admin-panel)] px-3 py-2.5 transition-[border-color,box-shadow] sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]",
        flash ? "gt-settings-flash border-[var(--gt-emerald-400)]" : "border-[var(--border-subtle)]",
        !rate.active && "opacity-70",
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          "grid h-9 w-9 place-items-center rounded-[9px]",
          rate.kind === "free" ? "bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)]" : rate.kind === "express" ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]" : "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
        )}
      >
        <Icon size={16} strokeWidth={1.9} />
      </span>
      <div className="grid min-w-0 gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{rate.name}</span>
          {!rate.active && <StatusPill active={false} />}
        </span>
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {delivery(rate)}
          {conds.length > 0 && <span className="sm:hidden"> · {conds.join(" · ")}</span>}
        </span>
      </div>
      <div className="hidden min-w-0 flex-wrap gap-1 sm:flex">
        {conds.length === 0 ? (
          <span className="text-[length:var(--text-caption)] text-[var(--text-subtle)]">{t("settings.shipping.cond.none")}</span>
        ) : (
          conds.map((c) => (
            <span key={c} className="inline-flex h-6 items-center rounded-[6px] bg-[var(--surface-sunken)] px-2 text-[11px] font-medium text-[var(--text-body)]">
              {c}
            </span>
          ))
        )}
      </div>
      <span
        className={clsx(
          "col-start-3 row-start-1 text-right text-[length:var(--text-body-sm)] font-bold tabular-nums sm:col-start-auto sm:row-start-auto",
          rate.priceCents === 0 ? "text-[var(--status-success-fg)]" : "text-[var(--text-primary)]",
        )}
      >
        {price(rate)}
        {!live && <span className="sr-only"> — {t("settings.shipping.notOffered")}</span>}
      </span>
      <div className="col-span-3 flex items-center justify-end gap-1 border-t border-[var(--border-subtle)] pt-2 sm:col-span-1 sm:border-0 sm:pt-0">
        <RowSwitch checked={rate.active} onChange={onToggle} label={t("settings.shipping.rateActive", { name: rate.name })} />
        <AdminIconButton icon={Pencil} size="sm" label={t("settings.shipping.editRate", { name: rate.name })} onClick={onEdit} />
        <AdminIconButton icon={Trash2} size="sm" tone="danger" label={t("settings.shipping.deleteRate", { name: rate.name })} onClick={onDelete} />
      </div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * "What would a customer in X be offered?" — answered from the draft, so the
 * operator can check a change before saving it.
 */
function DestinationChecker({ zones }: { zones: ShippingZone[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { delivery, price, conditions } = useRateText();
  const [code, setCode] = useState("DE");

  const options = useMemo(() => {
    const all = Array.from(new Set([...COUNTRY_GROUPS.flatMap((g) => g.countries), "BR", "KR", "IN"]));
    return all
      .map((c) => ({ code: c, name: countryName(c, lang) }))
      .sort((a, b) => a.name.localeCompare(b.name, lang))
      .map((c) => ({ value: c.code, label: `${flagOf(c.code)}  ${c.name}` }));
  }, [lang]);

  const { zone, reason } = resolveZone(code, zones);
  const rates = zone?.active ? zone.rates.filter((r) => r.active) : [];

  return (
    <SettingsCard icon={Truck} tone="emerald" title={t("settings.shipping.checker.title")} description={t("settings.shipping.checker.description")}>
      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="sr-only">{t("settings.shipping.checker.country")}</span>
          <AdminSelect value={code} onChange={(e) => setCode(e.target.value)} options={options} aria-label={t("settings.shipping.checker.country")} />
        </label>
        <div aria-live="polite" className="grid gap-2">
          {!zone || !zone.active || rates.length === 0 ? (
            <p className="m-0 flex items-start gap-2 rounded-[var(--admin-radius-sm)] bg-[var(--status-error-bg)] p-3 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">
              <TriangleAlert size={14} aria-hidden="true" className="mt-px flex-none" />
              {!zone
                ? t("settings.shipping.checker.noZone", { country: countryName(code, lang) })
                : !zone.active
                  ? t("settings.shipping.checker.inactive", { country: countryName(code, lang), zone: zone.name })
                  : t("settings.shipping.checker.noRate", { country: countryName(code, lang), zone: zone.name })}
            </p>
          ) : (
            <>
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
                {t(reason === "catchAll" ? "settings.shipping.checker.viaWorld" : "settings.shipping.checker.via", { country: countryName(code, lang), zone: zone.name })}
              </p>
              <ul className="m-0 grid list-none gap-1 p-0">
                {rates.map((r) => {
                  const Icon = RATE_ICON[r.kind];
                  const conds = conditions(r);
                  return (
                    <li key={r.id} className="flex items-center gap-2.5 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] px-3 py-2">
                      <Icon size={15} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{r.name}</span>
                        <span className="truncate text-[11px] text-[var(--text-muted)]">
                          {delivery(r)}
                          {conds.length > 0 && ` · ${conds.join(" · ")}`}
                        </span>
                      </span>
                      <span className="text-[length:var(--text-caption)] font-bold tabular-nums text-[var(--text-primary)]">{price(r)}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
