"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
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
 * to the artist's Glowbook. The list beside it stays the way to browse: the map only repeats
 * it.
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
  /** Called when the visitor follows the card's link (analytics). */
  onOpen?: () => void;
}

export interface DirectoryMapCanvasProps {
  points: DirectoryMapPoint[];
  /** Where the visitor searched: the map frames the nearest artists around it. */
  focus: { lat: number; lng: number } | null;
  className?: string;
}

interface PopupLabels {
  open: string;
  place: string;
  certified: string;
  creations: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

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

function popupContent(point: DirectoryMapPoint, labels: PopupLabels): HTMLElement {
  const root = el("div", "grid w-[252px] gap-3 p-4 text-[var(--gt-ink-900)]");

  const head = el("div", "flex items-center gap-3 pr-7");
  head.append(avatar(point, "h-12 w-12 flex-none rounded-full ring-2 ring-[var(--gt-blue-200)]", "text-[18px]"));
  const who = el("div", "grid min-w-0 gap-1");
  who.append(el("strong", "truncate text-[15px] font-black leading-tight tracking-[-0.01em]", point.name));
  if (point.certified) {
    const badge = el(
      "span",
      "inline-flex w-fit items-center gap-1 rounded-full border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] px-2 py-px text-[11px] font-bold text-[var(--gt-blue-700)]",
    );
    badge.append(icon(ICON_BADGE, 12), document.createTextNode(labels.certified));
    who.append(badge);
  }
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
  if (point.onOpen) link.addEventListener("click", point.onOpen);

  root.append(head, where, meta, link);
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

/** Pans the map just enough for an opened card to be seen whole. */
function revealPopup(m: MapLibreMap, card: HTMLElement) {
  const frame = m.getContainer().getBoundingClientRect();
  const box = card.getBoundingClientRect();
  const margin = 12;
  const dx = box.left < frame.left + margin ? box.left - frame.left - margin : box.right > frame.right - margin ? box.right - frame.right + margin : 0;
  const dy = box.top < frame.top + margin ? box.top - frame.top - margin : box.bottom > frame.bottom - margin ? box.bottom - frame.bottom + margin : 0;
  if (dx || dy) m.panBy([dx, dy], { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300 });
}

export default function DirectoryMapCanvas({ points, focus, className }: DirectoryMapCanvasProps) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const m = new MapLibreMap({
      container: container.current,
      style: MAP_STYLE_URL,
      center: [2.35, 46.6],
      zoom: 4.6,
      cooperativeGestures: true,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.current = m;
    return () => {
      map.current = null;
      m.remove();
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const markers = points.map((point) => {
      const exact = point.place.mode === "exact";
      const labels: PopupLabels = {
        open: t("directory.map.open"),
        place: t(exact ? "directory.card.salon" : "directory.card.area", { place: point.place.label }),
        certified: t("directory.card.certified"),
        creations: t("directory.card.creations", { count: point.creationCount }),
      };
      const popup = new Popup({ offset: exact ? 54 : 28, closeButton: true, className: "gt-map-popup", maxWidth: "none" }).setDOMContent(popupContent(point, labels));
      popup.on("open", () => {
        const card = popup.getElement();
        card?.querySelector(".maplibregl-popup-close-button")?.setAttribute("aria-label", t("directory.map.close"));
        if (card) requestAnimationFrame(() => revealPopup(m, card));
      });
      const marker = new Marker({ element: markerElement(point), anchor: exact ? "bottom" : "center" });
      marker.setLngLat([point.place.lng, point.place.lat]).setPopup(popup).addTo(m);
      marker.getElement().setAttribute("aria-label", t("directory.map.pin", { name: point.name }));
      return marker;
    });

    // Frame the search's nearest artists, else all of them.
    const framed = focus
      ? [...points].sort((a, b) => Math.hypot(a.place.lat - focus.lat, a.place.lng - focus.lng) - Math.hypot(b.place.lat - focus.lat, b.place.lng - focus.lng)).slice(0, 5)
      : points;
    if (framed.length) {
      const bounds = new LngLatBounds();
      framed.forEach((p) => bounds.extend([p.place.lng, p.place.lat]));
      if (focus) bounds.extend([focus.lng, focus.lat]);
      m.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
    }
    return () => markers.forEach((marker) => marker.remove());
  }, [points, focus, t]);

  return <div ref={container} className={className} />;
}
