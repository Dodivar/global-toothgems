const modules = import.meta.glob<{ default: string }>("../assets/photos/*.{jpg,png}", { eager: true });

const photos: Record<string, string> = {};
for (const path in modules) {
  const name = path.split("/").pop()!;
  photos[name] = modules[path].default;
}

export function photo(name: string): string {
  const src = photos[name];
  if (!src) throw new Error(`Unknown photo: ${name}`);
  return src;
}
