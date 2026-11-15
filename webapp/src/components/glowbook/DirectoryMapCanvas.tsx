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
 * an area is a soft dot drawn at its rounded point (never more precise than
 * the Glowbook's own circle). Each opens a small card linking to the artist's
 * Glowbook. The list beside it stays the way to browse: the map only repeats
 * it.
 */

setWorkerUrl(new URL("../../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

export interface DirectoryMapPoint {
  handle: string;
  name: string;
  place: GlowbookPlace;
  href: string;
}

export interface DirectoryMapCanvasProps {
  points: DirectoryMapPoint[];
  /** Where the visitor searched: the map frames the nearest artists around it. */
  focus: { lat: number; lng: number } | null;
  color: string;
  className?: string;
}

function popupContent(point: DirectoryMapPoint, linkLabel: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "grid gap-1 text-[13px]";
  const name = document.createElement("strong");
  name.textContent = point.name;
  const where = document.createElement("span");
  where.textContent = point.place.label;
  where.className = "text-[12px] opacity-75";
  const link = document.createElement("a");
  link.href = point.href;
  link.textContent = linkLabel;
  link.className = "font-bold underline";
  root.append(name, where, link);
  return root;
}

function areaDot(color: string): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.style.width = "26px";
  el.style.height = "26px";
  el.style.borderRadius = "9999px";
  el.style.background = color;
  el.style.opacity = "0.55";
  el.style.border = "2px solid white";
  el.style.cursor = "pointer";
  return el;
}

export default function DirectoryMapCanvas({ points, focus, color, className }: DirectoryMapCanvasProps) {
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
      const popup = new Popup({ offset: 18, closeButton: true }).setDOMContent(popupContent(point, t("directory.map.open")));
      const marker = point.place.mode === "exact" ? new Marker({ color }) : new Marker({ element: areaDot(color) });
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
  }, [points, focus, color, t]);

  return <div ref={container} className={className} />;
}
