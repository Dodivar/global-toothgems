"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLE_URL } from "../../lib/studioWorkspace/glowbookPlace";
import type { GlowbookPlace } from "../../lib/studioWorkspace/glowbookPlace";

/**
 * The artist directory's map (decision 145): every listed artist on one
 * MapLibre map with OpenFreeMap's tiles, like the Glowbook's (decision 108).
 * Loaded only in the browser, on demand, by `DirectoryMap`. A salon is a pin;
 * an area is a halo drawn at its rounded point (never more precise than
 * the Glowbook's own circle); both show the artist's picture. Each opens a
 * card in the site's style (picture, certification, place, creations) linking
 * to the artist's Glowbook.
 *
 * Artists close together are gathered in a numbered bubble (MapLibre's own
 * clustering on a GeoJSON source, drawn as DOM buttons so they stay
 * focusable and need no font from the tile style). A click zooms in until
 * they separate; artists that never separate — an area is rounded to ~1 km,
 * so neighbours often share the very same point — open a card listing them.
 */

setWorkerUrl(new URL("../../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

export interface DirectoryMapPoint {
  handle: string;
  name: string;
  place: GlowbookPlace;
  href: string;
  /** The artist's profile picture / logo (signed URL), else their initial is drawn. */
  avatarUrl: string | null;
  certified: boolean;
  creationCount: number;
}

export interface DirectoryMapCanvasProps {
  points: DirectoryMapPoint[];
  /** Where the visitor searched: the map frames the nearest artists around it. */
  focus: { lat: number; lng: number } | null;
  /** Called when the visitor follows a card's link (analytics). */
  onOpen?: (handle: string) => void;
  className?: string;
}

interface PopupLabels {
  open: string;
  place: string;
  certified: string;
  creations: string;
}

const SOURCE = "gt-directory-artists";
/**
 * The map's closest zoom, and the source clusters up to it: artists sharing a
 * point stay one bubble at every zoom (never stacked markers), listed in a
 * card once zooming cannot separate them.
 */
const MAX_ZOOM = 16;
const CLUSTER_RADIUS_PX = 52;
const SVG_NS = "http://www.w3.org/2000/svg";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A small stroked icon (lucide's paths), so the card needs no React root. */
function icon(paths: string[], size = 13): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [name, value] of Object.entries({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) {
    svg.setAttribute(name, String(value));
  }
  svg.classList.add("flex-none");
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

const ICON_PIN = ["M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0", "M12 7a3 3 0 1 0 0 6 3 3 0 1 0 0-6"];
const ICON_STORE = ["m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7", "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8", "M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4", "M2 7h20"];
const ICON_BADGE = ["M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z", "m9 12 2 2 4-4"];
const ICON_ARROW = ["M5 12h14", "m12 5 7 7-7 7"];
const ICON_ZOOM = ["M11 3a8 8 0 1 0 0 16 8 8 0 1 0 0-16", "m21 21-4.3-4.3", "M11 8v6", "M8 11h6"];

/** The artist's picture in a round frame, else their initial on the brand blue. */
function avatar(point: DirectoryMapPoint, className: string, initialClass: string): HTMLElement {
  const initial = () =>
    el("span", `${className} ${initialClass} grid place-items-center bg-[var(--surface-brand)] font-black text-[var(--gt-ink-900)]`, point.name.slice(0, 1).toUpperCase());
  if (!point.avatarUrl) return initial();
  const img = el("img", `${className} object-cover bg-[var(--surface-sunken)]`);
  img.src = point.avatarUrl;
  img.alt = "";
  img.decoding = "async";
  img.draggable = false;
  // A signed URL can expire on a page left open: fall back to the initial.
  img.addEventListener("error", () => img.replaceWith(initial()), { once: true });
  return img;
}

function certifiedBadge(label: string): HTMLElement {
  const badge = el(
    "span",
    "inline-flex w-fit items-center gap-1 rounded-full border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] px-2 py-px text-[11px] font-bold text-[var(--gt-blue-700)]",
  );
  badge.append(icon(ICON_BADGE, 12), document.createTextNode(label));
  return badge;
}

function popupContent(point: DirectoryMapPoint, labels: PopupLabels, onOpen?: () => void): HTMLElement {
  const root = el("div", "grid w-[252px] gap-3 p-4 text-[var(--gt-ink-900)]");

  const head = el("div", "flex items-center gap-3 pr-7");
  head.append(avatar(point, "h-12 w-12 flex-none rounded-full ring-2 ring-[var(--gt-blue-200)]", "text-[18px]"));
  const who = el("div", "grid min-w-0 gap-1");
  who.append(el("strong", "truncate text-[15px] font-black leading-tight tracking-[-0.01em]", point.name));
  if (point.certified) who.append(certifiedBadge(labels.certified));
  head.append(who);

  const where = el("p", "m-0 flex items-start gap-1.5 text-[12.5px] leading-snug text-[var(--text-body)]");
  const whereIcon = icon(point.place.mode === "area" ? ICON_PIN : ICON_STORE);
  whereIcon.classList.add("mt-0.5");
  where.append(whereIcon, el("span", "min-w-0", labels.place));

  const meta = el("p", "m-0 text-[12px] text-[var(--text-muted)]", labels.creations);

  const link = el(
    "a",
    "mt-1 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--gt-ink-900)] px-4 text-[13px] font-bold text-white no-underline transition-colors hover:bg-[var(--gt-ink-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
  );
  link.href = point.href;
  link.append(document.createTextNode(labels.open), icon(ICON_ARROW, 14));
  if (onOpen) link.addEventListener("click", onOpen);

  root.append(head, where, meta, link);
  return root;
}

/** The card of artists sharing one spot: a short list, each row linking to their Glowbook. */
function clusterListContent(points: DirectoryMapPoint[], title: string, certified: string, onOpen?: (handle: string) => void): HTMLElement {
  const root = el("div", "grid w-[272px] gap-2 p-4 text-[var(--gt-ink-900)]");
  root.append(el("strong", "pr-8 text-[14px] font-black leading-tight", title));
  const list = el("ul", "m-0 grid max-h-[260px] list-none gap-1 overflow-y-auto p-0");
  for (const point of points) {
    const item = el("li", "min-w-0");
    const link = el(
      "a",
      "flex items-center gap-3 rounded-[14px] p-2 text-[var(--gt-ink-900)] no-underline transition-colors hover:bg-[var(--gt-ink-50,#f4f4f4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
    );
    link.href = point.href;
    link.append(avatar(point, "h-9 w-9 flex-none rounded-full", "text-[14px]"));
    const who = el("span", "grid min-w-0 flex-1 gap-0.5");
    who.append(el("span", "truncate text-[13.5px] font-bold", point.name));
    if (point.certified) who.append(certifiedBadge(certified));
    link.append(who, icon(ICON_ARROW, 14));
    if (onOpen) link.addEventListener("click", () => onOpen(point.handle));
    item.append(link);
    list.append(item);
  }
  root.append(list);
  return root;
}

/**
 * The marker: the artist's picture. A salon is a pin (white frame ringed in
 * ink, a tail pointing at the address); an area is the picture in a pale blue
 * halo at its rounded point — never a precise spot.
 */
function markerElement(point: DirectoryMapPoint): HTMLElement {
  const button = el("button", "gt-map-marker relative grid cursor-pointer place-items-center border-0 bg-transparent p-0");
  button.type = "button";
  if (point.place.mode === "area") {
    const halo = el(
      "span",
      "gt-map-marker-face grid h-[46px] w-[46px] place-items-center rounded-full bg-[rgba(90,119,150,.3)] ring-2 ring-[rgba(90,119,150,.55)] transition-transform duration-150",
    );
    halo.append(avatar(point, "h-8 w-8 rounded-full border-2 border-white shadow-[0_2px_6px_rgba(17,17,17,.25)]", "text-[13px]"));
    button.append(halo);
  } else {
    const face = el("span", "gt-map-marker-face relative grid origin-bottom place-items-center pb-[7px] transition-transform duration-150");
    face.append(
      avatar(point, "relative z-[1] h-10 w-10 rounded-full border-[3px] border-white shadow-[0_3px_10px_rgba(17,17,17,.3)] outline outline-2 outline-[var(--gt-ink-900)]", "text-[15px]"),
      el("span", "absolute bottom-0 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-[var(--gt-ink-900)]"),
    );
    button.append(face);
  }
  return button;
}

/**
 * A group of artists: the number in an ink bubble that grows a little with
 * it, and a small label under it ("3 artists · Zoom in") shown on hover and
 * keyboard focus. The number itself is always visible; the label only adds
 * the action.
 */
function clusterElement(count: number, tip: string): HTMLElement {
  const size = count < 10 ? 44 : count < 50 ? 52 : 60;
  const button = el("button", "gt-map-cluster relative grid cursor-pointer place-items-center border-0 bg-transparent p-0");
  button.type = "button";
  const face = el(
    "span",
    "gt-map-marker-face grid place-items-center rounded-full bg-[var(--gt-ink-900)] text-[15px] font-black text-white ring-4 ring-[rgba(17,17,17,.18)] shadow-[0_4px_12px_rgba(17,17,17,.3)] transition-transform duration-150",
    String(count),
  );
  face.style.width = `${size}px`;
  face.style.height = `${size}px`;
  const label = el(
    "span",
    "gt-map-cluster-tip pointer-events-none absolute left-1/2 top-full mt-1.5 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[11.5px] font-bold text-[var(--gt-ink-900)] shadow-[0_3px_10px_rgba(17,17,17,.2)]",
  );
  label.append(icon(ICON_ZOOM, 12), document.createTextNode(tip));
  button.append(face, label);
  return button;
}

/** The point the list is sorted from: a small blue dot, not clickable. */
function originElement(label: string): HTMLElement {
  const dot = el("span", "gt-map-origin block h-4 w-4 rounded-full border-[3px] border-white bg-[var(--gt-blue-600,#3b6ea5)] shadow-[0_0_0_6px_rgba(59,110,165,.25)]");
  dot.setAttribute("role", "img");
  dot.setAttribute("aria-label", label);
  return dot;
}

/** Pans the map just enough for an opened card to be seen whole. */
function revealPopup(m: MapLibreMap, card: HTMLElement) {
  const frame = m.getContainer().getBoundingClientRect();
  const box = card.getBoundingClientRect();
  const margin = 12;
  const dx = box.left < frame.left + margin ? box.left - frame.left - margin : box.right > frame.right - margin ? box.right - frame.right + margin : 0;
  const dy = box.top < frame.top + margin ? box.top - frame.top - margin : box.bottom > frame.bottom - margin ? box.bottom - frame.bottom + margin : 0;
  if (dx || dy) m.panBy([dx, dy], { duration: reducedMotion() ? 0 : 300 });
}

function toGeoJson(points: DirectoryMapPoint[]): GeoJSON.FeatureCollection<GeoJSON.Point, { handle: string }> {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({ type: "Feature", properties: { handle: p.handle }, geometry: { type: "Point", coordinates: [p.place.lng, p.place.lat] } })),
  };
}

export default function DirectoryMapCanvas({ points, focus, onOpen, className }: DirectoryMapCanvasProps) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  // Read by the markers' handlers, so a new list never rebuilds the map.
  const latest = useRef({ points, onOpen, t });
  useEffect(() => {
    latest.current = { points, onOpen, t };
  });

  /* The map, once. */
  useEffect(() => {
    if (!container.current) return;
    const m = new MapLibreMap({
      container: container.current,
      style: MAP_STYLE_URL,
      center: [2.35, 46.6],
      zoom: 4.6,
      maxZoom: MAX_ZOOM,
      cooperativeGestures: true,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource(SOURCE, { type: "geojson", data: toGeoJson([]), cluster: true, clusterRadius: CLUSTER_RADIUS_PX, clusterMaxZoom: MAX_ZOOM });
      // Invisible: the source's tiles only load for a layer; the markers are DOM.
      m.addLayer({ id: `${SOURCE}-anchor`, type: "circle", source: SOURCE, paint: { "circle-radius": 1, "circle-opacity": 0 } });
      setReady(true);
    });
    map.current = m;
    return () => {
      map.current = null;
      setReady(false);
      m.remove();
    };
  }, []);

  /* The artists: data into the clustered source, DOM markers kept in step with what it shows. */
  const handles = points.map((p) => p.handle).join(",");
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const source = m.getSource(SOURCE) as GeoJSONSource | undefined;
    if (!source) return;
    const byHandle = new Map(latest.current.points.map((p) => [p.handle, p]));
    source.setData(toGeoJson(latest.current.points));

    const shown = new Map<string, Marker>();
    const motion = () => (reducedMotion() ? 0 : 450);

    const artistMarker = (point: DirectoryMapPoint) => {
      const { t: tr } = latest.current;
      const exact = point.place.mode === "exact";
      const labels: PopupLabels = {
        open: tr("directory.map.open"),
        place: tr(exact ? "directory.card.salon" : "directory.card.area", { place: point.place.label }),
        certified: tr("directory.card.certified"),
        creations: tr("directory.card.creations", { count: point.creationCount }),
      };
      const popup = new Popup({ offset: exact ? 54 : 28, closeButton: true, className: "gt-map-popup", maxWidth: "none" }).setDOMContent(
        popupContent(point, labels, () => latest.current.onOpen?.(point.handle)),
      );
      popup.on("open", () => {
        const card = popup.getElement();
        card?.querySelector(".maplibregl-popup-close-button")?.setAttribute("aria-label", tr("directory.map.close"));
        if (card) requestAnimationFrame(() => revealPopup(m, card));
      });
      const marker = new Marker({ element: markerElement(point), anchor: exact ? "bottom" : "center" });
      marker.setLngLat([point.place.lng, point.place.lat]).setPopup(popup);
      marker.getElement().setAttribute("aria-label", tr("directory.map.pin", { name: point.name }));
      return marker;
    };

    const clusterMarker = (id: number, count: number, lngLat: [number, number]) => {
      const { t: tr } = latest.current;
      const element = clusterElement(count, tr("directory.map.clusterTip", { count }));
      element.setAttribute("aria-label", tr("directory.map.cluster", { count }));
      const marker = new Marker({ element, anchor: "center" }).setLngLat(lngLat);
      element.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          // Zoom in while the artists can still separate (at least one level per
          // click, so a bubble drawn from the previous zoom's tiles still moves on).
          const current = m.getZoom();
          if (current < MAX_ZOOM) {
            const expansion = await source.getClusterExpansionZoom(id);
            if (expansion <= MAX_ZOOM) {
              m.easeTo({ center: lngLat, zoom: Math.min(MAX_ZOOM, Math.max(expansion, Math.floor(current) + 1)), duration: motion() });
              return;
            }
          }
          // Still together at the closest zoom: list them.
          const leaves = await source.getClusterLeaves(id, 100, 0);
          const group = leaves.flatMap((f) => {
            const point = byHandle.get(String(f.properties?.handle ?? ""));
            return point ? [point] : [];
          });
          const popup = new Popup({ offset: 30, closeButton: true, className: "gt-map-popup", maxWidth: "none" })
            .setLngLat(lngLat)
            .setDOMContent(clusterListContent(group, tr("directory.map.clusterList", { count: group.length }), tr("directory.card.certified"), (h) => latest.current.onOpen?.(h)))
            .addTo(m);
          const card = popup.getElement();
          card?.querySelector(".maplibregl-popup-close-button")?.setAttribute("aria-label", tr("directory.map.close"));
          if (card) requestAnimationFrame(() => revealPopup(m, card));
        } catch {
          // The source changed under the click (new search): nothing to open.
        }
      });
      return marker;
    };

    const sync = () => {
      if (!m.getSource(SOURCE) || !m.isSourceLoaded(SOURCE)) return;
      const next = new Map<string, () => Marker>();
      // A feature crossing a tile edge comes back once per tile: keyed, so drawn once.
      for (const f of m.querySourceFeatures(SOURCE)) {
        const props = f.properties ?? {};
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        if (props.cluster) {
          const id = Number(props.cluster_id);
          const count = Number(props.point_count);
          next.set(`c:${id}:${count}`, () => clusterMarker(id, count, [lng, lat]));
        } else {
          const point = byHandle.get(String(props.handle ?? ""));
          if (point) next.set(`p:${point.handle}`, () => artistMarker(point));
        }
      }
      for (const [key, marker] of shown) {
        if (!next.has(key)) {
          marker.remove();
          shown.delete(key);
        }
      }
      for (const [key, make] of next) {
        if (!shown.has(key)) shown.set(key, make().addTo(m));
      }
    };

    const onData = (e: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (e.sourceId === SOURCE && e.isSourceLoaded) sync();
    };
    m.on("sourcedata", onData);
    m.on("moveend", sync);
    m.on("idle", sync);
    sync();
    return () => {
      m.off("sourcedata", onData);
      m.off("moveend", sync);
      m.off("idle", sync);
      shown.forEach((marker) => marker.remove());
    };
    // `handles` stands for the list: same artists, same markers.
  }, [ready, handles]);

  /* The framing: the search's nearest artists and the search point, else all of them. */
  const focusKey = focus ? `${focus.lat},${focus.lng}` : "";
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const all = latest.current.points;
    const framed = focus
      ? [...all].sort((a, b) => Math.hypot(a.place.lat - focus.lat, a.place.lng - focus.lng) - Math.hypot(b.place.lat - focus.lat, b.place.lng - focus.lng)).slice(0, 5)
      : all;
    if (framed.length) {
      const bounds = new LngLatBounds();
      framed.forEach((p) => bounds.extend([p.place.lng, p.place.lat]));
      if (focus) bounds.extend([focus.lng, focus.lat]);
      m.fitBounds(bounds, { padding: 56, maxZoom: 12, duration: 0 });
    }
    if (!focus) return;
    const origin = new Marker({ element: originElement(latest.current.t("directory.map.origin")), anchor: "center" }).setLngLat([focus.lng, focus.lat]).addTo(m);
    return () => {
      origin.remove();
    };
    // `focusKey` and `handles` stand for `focus` and the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusKey, handles]);

  return <div ref={container} className={className} />;
}
