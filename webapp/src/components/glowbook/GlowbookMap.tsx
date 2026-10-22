"use client";

import dynamic from "next/dynamic";
import clsx from "clsx";
import { MapPin } from "lucide-react";
import type { GlowbookMapCanvasProps } from "./GlowbookMapCanvas";

/**
 * The Glowbook's map (decision 108), loaded on demand: MapLibre (~1 MB) and
 * its tiles reach the browser only when this is rendered, never on the
 * server. Until then — and on the server — a quiet placeholder of the same
 * size, so nothing shifts.
 */
const Canvas = dynamic(() => import("./GlowbookMapCanvas"), {
  ssr: false,
  loading: () => <Placeholder />,
});

function Placeholder() {
  return (
    <span aria-hidden="true" className="grid h-full w-full place-items-center" style={{ background: "var(--gb-soft, var(--surface-sunken))", color: "var(--gb-muted, var(--text-subtle))" }}>
      <MapPin size={22} className="motion-safe:animate-pulse" />
    </span>
  );
}

export function GlowbookMap({ className, ...props }: GlowbookMapCanvasProps) {
  return (
    <div className={clsx("relative overflow-hidden", className)}>
      <Canvas {...props} className="h-full w-full" />
    </div>
  );
}
