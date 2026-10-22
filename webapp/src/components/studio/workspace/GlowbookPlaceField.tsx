import { useId, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Home, LoaderCircle, MapPin, Search, Store, Trash2 } from "lucide-react";
import { Button } from "../../ui/Button";
import { GlowbookMap } from "../../glowbook/GlowbookMap";
import {
  geocoderSearchUrl,
  parseGeocoderResults,
  PLACE_LABEL_MAX,
  placeFromCandidate,
  roundPlace,
  samePlace,
  switchPlaceMode,
  type GlowbookPlace,
  type PlaceCandidate,
  type PlaceMode,
} from "../../../lib/studioWorkspace/glowbookPlace";
import { chipClass, fieldClass } from "./workspaceStyles";

/**
 * "Where I work" in "Customise my page" (decision 108). The artist searches
 * an address (OpenStreetMap's Nominatim, one request per search — its policy
 * forbids search-as-you-type), picks a result, then moves the pin on the map
 * if needed. Two modes: a salon (the address is public, with directions) or
 * an area (only the district, ~1 km; the coordinates are rounded and the
 * address is never stored). The field and the search work without touching
 * the map. Saved with the rest of the look.
 */

/** Nominatim allows one request a second at most. */
const SEARCH_GAP_MS = 1100;

type SearchState = { kind: "idle" } | { kind: "searching" } | { kind: "results"; items: PlaceCandidate[] } | { kind: "failed" };

export function GlowbookPlaceField({
  place,
  color,
  invalid,
  errorId,
  onChange,
}: {
  place: GlowbookPlace | null;
  color: string;
  invalid: boolean;
  errorId: string;
  onChange: (place: GlowbookPlace | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const ids = { query: useId(), label: useId(), results: useId() };
  // The place's own mode once there is one (a reset or a reload changes it); the chip's choice before.
  const [emptyMode, setEmptyMode] = useState<PlaceMode>("area");
  const mode = place?.mode ?? emptyMode;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  const [picked, setPicked] = useState<PlaceCandidate | null>(null);
  const lastSearch = useRef(0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3 || search.kind === "searching") return;
    const wait = lastSearch.current + SEARCH_GAP_MS - Date.now();
    setSearch({ kind: "searching" });
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastSearch.current = Date.now();
    try {
      const response = await fetch(geocoderSearchUrl(q, i18n.language.startsWith("en") ? "en" : "fr"), { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(String(response.status));
      setSearch({ kind: "results", items: parseGeocoderResults(await response.json()) });
    } catch {
      setSearch({ kind: "failed" });
    }
  };

  const pick = (candidate: PlaceCandidate) => {
    setPicked(candidate);
    setSearch({ kind: "idle" });
    onChange(placeFromCandidate(candidate, mode));
  };

  const switchMode = (next: PlaceMode) => {
    setEmptyMode(next);
    if (!place) return;
    // The last result only while the place is still that result (not moved, not reset).
    const current = picked && samePlace(placeFromCandidate(picked, place.mode), place) ? picked : null;
    onChange(switchPlaceMode(place, next, current));
  };

  const move = (lat: number, lng: number) => {
    if (place) onChange(roundPlace({ ...place, lat, lng }));
  };

  return (
    <fieldset className="m-0 grid gap-3 border-0 p-0">
      <legend className="mb-1 inline-flex items-center gap-1.5 p-0 text-[12.5px] font-bold text-[var(--text-primary)]">
        <MapPin size={14} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
        {t("studio.glowbook.place.title")}
      </legend>
      <p className="m-0 -mt-1 text-[12px] leading-relaxed text-[var(--text-subtle)]">{t("studio.glowbook.place.hint")}</p>

      <div role="radiogroup" aria-label={t("studio.glowbook.place.modeLabel")} className="flex flex-wrap gap-2">
        {(["area", "exact"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => switchMode(m)} className={clsx(chipClass(mode === m), "inline-flex items-center gap-1.5")}>
            {m === "area" ? <Home size={13} aria-hidden="true" /> : <Store size={13} aria-hidden="true" />}
            {t(`studio.glowbook.place.modes.${m}`)}
          </button>
        ))}
      </div>
      <p className="m-0 text-[12px] leading-relaxed text-[var(--text-muted)]">{t(`studio.glowbook.place.modeHint.${mode}`)}</p>

      <form onSubmit={(e) => void submit(e)} role="search" className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-[220px] flex-1 gap-1.5">
          <label htmlFor={ids.query} className="text-[12px] font-semibold text-[var(--text-primary)]">
            {t(mode === "exact" ? "studio.glowbook.place.searchExact" : "studio.glowbook.place.searchArea")}
          </label>
          <input
            id={ids.query}
            type="search"
            value={query}
            maxLength={200}
            autoComplete="off"
            placeholder={t(mode === "exact" ? "studio.glowbook.place.searchExactPlaceholder" : "studio.glowbook.place.searchAreaPlaceholder")}
            aria-describedby={search.kind === "results" || search.kind === "failed" ? ids.results : undefined}
            onChange={(e) => setQuery(e.target.value)}
            className={fieldClass}
          />
        </div>
        <Button type="submit" variant="outline" size="sm" iconLeft={search.kind === "searching" ? LoaderCircle : Search} disabled={query.trim().length < 3 || search.kind === "searching"}>
          {t("studio.glowbook.place.search")}
        </Button>
      </form>

      <div id={ids.results} aria-live="polite">
        {search.kind === "failed" && <p className="m-0 text-[12px] font-semibold text-[var(--status-error-fg)]">{t("studio.glowbook.place.searchFailed")}</p>}
        {search.kind === "results" &&
          (search.items.length === 0 ? (
            <p className="m-0 text-[12px] text-[var(--text-muted)]">{t("studio.glowbook.place.noResult")}</p>
          ) : (
            <ul className="m-0 grid list-none gap-1 p-0" aria-label={t("studio.glowbook.place.resultsLabel")}>
              {search.items.map((c) => (
                <li key={`${c.lat},${c.lng},${c.label}`}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    className="flex w-full items-start gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-left text-[12.5px] text-[var(--text-primary)] hover:border-[var(--gt-blue-600)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gt-blue-600)]"
                  >
                    <MapPin size={13} aria-hidden="true" className="mt-0.5 flex-none text-[var(--text-subtle)]" />
                    {mode === "area" && c.area ? (
                      <span className="grid gap-0.5">
                        <span className="font-semibold">{c.area}</span>
                        <span className="text-[11.5px] text-[var(--text-subtle)]">{c.label}</span>
                      </span>
                    ) : (
                      <span>{c.label}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ))}
        {search.kind !== "idle" && <p className="m-0 mt-1 text-[11px] text-[var(--text-subtle)]">{t("studio.glowbook.place.searchCredit")}</p>}
      </div>

      {place && (
        <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
          <div className="grid gap-1.5">
            <label htmlFor={ids.label} className="text-[12px] font-semibold text-[var(--text-primary)]">
              {t(place.mode === "exact" ? "studio.glowbook.place.labelExact" : "studio.glowbook.place.labelArea")}
            </label>
            <input
              id={ids.label}
              value={place.label}
              maxLength={PLACE_LABEL_MAX}
              aria-invalid={invalid}
              aria-describedby={invalid ? errorId : undefined}
              onChange={(e) => onChange({ ...place, label: e.target.value })}
              className={fieldClass}
            />
          </div>
          <GlowbookMap place={place} color={color} onMove={move} className="h-[260px] rounded-[var(--radius-md)] border border-[var(--border-subtle)]" />
          <p className="m-0 text-[11.5px] text-[var(--text-subtle)]">{t("studio.glowbook.place.moveHint")}</p>
          <div>
            <Button variant="ghost" size="sm" iconLeft={Trash2} onClick={() => onChange(null)}>
              {t("studio.glowbook.place.remove")}
            </Button>
          </div>
        </div>
      )}
    </fieldset>
  );
}
