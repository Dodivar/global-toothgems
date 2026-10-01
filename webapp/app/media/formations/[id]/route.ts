import { isSupabaseConfigured } from "../../../../src/lib/supabase/env";
import { createPublicServerSupabase } from "../../../../src/lib/supabase/publicServer";

/**
 * The cover image of a published course (Academy phase B), from the private
 * `training-media` bucket, at a stable address the public pages, Open Graph
 * and search engines can use (`/media/formations/<media id>`).
 *
 * Read with the publishable key, as an anonymous visitor: RLS lets one read
 * the media row and the file only while they are the cover of a published
 * course (`…_academy_public_pages`), so any other media of the library, a
 * draft's cover or a withdrawn course's answers 404. Never the service role.
 * Cached by the CDN for an hour (`?v=` changes when the file is replaced);
 * a course withdrawn meanwhile keeps its cover cached up to that long.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSupabaseConfigured || !UUID.test(id)) return notFound();

  const db = createPublicServerSupabase();
  const media = await db.from("training_media").select("storage_path, mime_type, kind").eq("id", id).maybeSingle();
  if (media.error) return unavailable(media.error);
  if (!media.data || media.data.kind !== "image") return notFound();

  const file = await db.storage.from("training-media").download(media.data.storage_path);
  // The row is readable but the file is not (missing, or storage failing): logged, short-lived 404.
  if (file.error || !file.data) {
    console.warn("[academy] cover file unreadable", id, file.error);
    return notFound();
  }

  return new Response(file.data, {
    headers: {
      "Content-Type": media.data.mime_type,
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
}

function unavailable(error: unknown) {
  console.error("[academy] cover read failed", error);
  return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
}
