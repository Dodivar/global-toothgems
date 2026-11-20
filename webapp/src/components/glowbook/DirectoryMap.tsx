"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import clsx from "clsx";
import { MapPin } from "lucide-react";
import type { DirectoryMapCanvasProps } from "./DirectoryMapCanvas";

/**
 * The directory's map frame (decision 145). Like the Glowbook's map (owner's
 * choice, 2026-11-14: same behaviour), MapLibre and the tiles load by
 * themselves once the frame comes within a screen of the viewport; a visitor
 * who stays on the list downloads neither. The frame is drawn from the start,
 * on the server too, so nothing shifts. The page gives it the site's whole
 * width, like the Glowbook's place band (owner's request, 2026-11-20).
 */
const Canvas = dynamic(() => import("./DirectoryMapCanvas"), { ssr: false, loading: () => <Placeholder /> });

function Placeholder() {
  return (
    <span aria-hidden="true" className="grid h-full w-full place-items-center text-[var(--text-subtle)]">
      <MapPin size={22} />
    </span>
  );
}

export function DirectoryMap({ frameClassName, ...props }: Omit<DirectoryMapCanvasProps, "className"> & { frameClassName?: string }) {
  const [show, setShow] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = frame.current;
    if (!el || show) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setShow(true), { rootMargin: "100% 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [show]);

  return (
    <div ref={frame} className={clsx("relative overflow-hidden bg-[var(--surface-sunken)]", frameClassName)}>
      {show ? <Canvas {...props} className="h-full w-full" /> : <Placeholder />}
    </div>
  );
}
