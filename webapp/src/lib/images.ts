import type { StaticImageData } from "next/image";

// Next.js resolves an image import to its metadata; the URL is `.src`. Two
// patterns rather than `*.{jpg,png}`, resolved from `base` rather than written
// `../assets/...`: Turbopack matches neither braces nor parent-relative globs.
const modules = import.meta.glob(["./*.jpg", "./*.png"], {
  base: "../assets/photos",
  eager: true,
  import: "default",
}) as Record<string, StaticImageData>;

const photos: Record<string, string> = {};
for (const path in modules) {
  const name = path.split("/").pop()!;
  photos[name] = modules[path].src;
}

export function photo(name: string): string {
  const src = photos[name];
  if (!src) throw new Error(`Unknown photo: ${name}`);
  return src;
}
