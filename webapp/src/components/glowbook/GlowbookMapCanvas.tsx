"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Feature, Polygon } from "geojson";
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AREA_RADIUS_METERS, circleRing, MAP_STYLE_URL, type GlowbookPlace } from "../../lib/studioWorkspace/glowbookPlace";

/**
 * The map itself (decision 108): MapLibre GL, open source, drawing
 * OpenFreeMap's free vector tiles (attribution shown by the map). Loaded only
 * in the browser, on demand, by `GlowbookMap` — never during the server
 * render. A salon is a pin; an area is a circle. In the Studio the artist
 * moves the point by dragging the pin or clicking the map (`onMove`).
 */

// MapLibre looks for its worker next to its own file, which the bundler moves:
// point it at the copy the bundler emits.
setWorkerUrl(new URL("../../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

const AREA_SOURCE = "gt-area";

export interface GlowbookMapCanvasProps {
  place: GlowbookPlace;
  /** The pin / circle colour (the artist's identity colour). */
  color: string;
  /** The Studio: the point can be moved. */
  onMove?: (lat: number, lng: number) => void;
  className?: string;
}

function areaData(place: GlowbookPlace): Feature<Polygon> {
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circleRing(place.lat, place.lng, AREA_RADIUS_METERS)] } };
}

export default function GlowbookMapCanvas({ place, color, onMove, className }: GlowbookMapCanvasProps) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  const editable = !!onMove;

  // One map per mount; the place is applied by the effect below.
  useEffect(() => {
    if (!container.current) return;
    const m = new MapLibreMap({
      container: container.current,
      style: MAP_STYLE_URL,
      center: [place.lng, place.lat],
      zoom: place.mode === "area" ? 12.5 : 15,
      // A page scrolls over the map: two fingers / ctrl + wheel to move it.
      cooperativeGestures: !editable,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new NavigationControl({ showCompass: false }), "top-right");
    if (editable) m.on("click", (e: MapMouseEvent) => onMoveRef.current?.(e.lngLat.lat, e.lngLat.lng));
    map.current = m;
    return () => {
      marker.current = null;
      map.current = null;
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; the place effect follows changes
  }, [editable]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const at: [number, number] = [place.lng, place.lat];

    if (place.mode === "exact" || editable) {
      if (!marker.current) {
        marker.current = new Marker({ color, draggable: editable }).setLngLat(at).addTo(m);
        marker.current.on("dragend", () => {
          const p = marker.current?.getLngLat();
          if (p) onMoveRef.current?.(p.lat, p.lng);
        });
        marker.current.getElement().setAttribute("aria-label", t("studio.glowbook.place.pinLabel"));
      } else {
        marker.current.setLngLat(at);
      }
    } else if (marker.current) {
      marker.current.remove();
      marker.current = null;
    }

    const drawArea = () => {
      const source = m.getSource(AREA_SOURCE) as GeoJSONSource | undefined;
      if (place.mode !== "area") {
        if (m.getLayer(`${AREA_SOURCE}-fill`)) m.removeLayer(`${AREA_SOURCE}-fill`);
        if (m.getLayer(`${AREA_SOURCE}-line`)) m.removeLayer(`${AREA_SOURCE}-line`);
        if (source) m.removeSource(AREA_SOURCE);
        return;
      }
      if (source) {
        source.setData(areaData(place));
        return;
      }
      m.addSource(AREA_SOURCE, { type: "geojson", data: areaData(place) });
      m.addLayer({ id: `${AREA_SOURCE}-fill`, type: "fill", source: AREA_SOURCE, paint: { "fill-color": color, "fill-opacity": 0.16 } });
      m.addLayer({ id: `${AREA_SOURCE}-line`, type: "line", source: AREA_SOURCE, paint: { "line-color": color, "line-width": 2 } });
    };
    if (m.isStyleLoaded()) drawArea();
    else m.once("load", drawArea);

    // Keep the point in view without fighting the artist's own zoom.
    if (!m.getBounds().contains(at)) m.easeTo({ center: at, duration: 400 });
    return () => {
      m.off("load", drawArea);
    };
  }, [place, color, editable, t]);

  return <div ref={container} className={className} />;
}
