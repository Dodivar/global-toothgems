import { CalendarCheck, MapPinned } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/Button";
import { useStudioFeature } from "../../../lib/studioAccess";
import { rememberBookingCreation } from "../../../lib/glowbookBookingCreation";
import { useNavigate } from "../../../lib/navigation";
import { ARTIST_DIRECTORY_PATH } from "../../../lib/studioUrl";
import type { Creation } from "../../../lib/studioWorkspace/types";

/**
 * "Have it made by an artist" (decision 148), on a saved creation, for members
 * whose plan does not include the Glowbook (below Atelier): the creation is
 * remembered for the tab and the member goes to the artist directory; on the
 * artist's page the booking dialog comes with it selected, and the booked
 * artist then opens it read-only from their calendar. An Atelier member is an
 * artist themself: the block is left out.
 */
export function BookArtistForCreation({ creation, onLeave }: { creation: Pick<Creation, "id" | "name" | "elementCount">; onLeave: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ownGlowbook = useStudioFeature("glowbook");
  if (ownGlowbook !== false) return null;

  const go = () => {
    rememberBookingCreation({ id: creation.id, name: creation.name });
    onLeave();
    navigate(ARTIST_DIRECTORY_PATH);
  };

  return (
    <section
      aria-labelledby={`gt-book-artist-${creation.id}`}
      className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--gt-blue-200)] bg-[var(--surface-brand-wash)] p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
    >
      <span aria-hidden="true" className="hidden h-10 w-10 place-items-center rounded-[var(--radius-sm)] bg-[var(--gt-ink-900)] text-[var(--gt-blue-200)] sm:grid">
        <MapPinned size={18} strokeWidth={1.75} />
      </span>
      <div className="grid gap-0.5">
        <h3 id={`gt-book-artist-${creation.id}`} className="m-0 text-[14px] font-[var(--weight-black)] text-[var(--text-primary)]">
          {t("studio.workspace.bookArtist.title")}
        </h3>
        <p className="m-0 text-[12.5px] leading-relaxed text-[var(--text-muted)]">{t("studio.workspace.bookArtist.body")}</p>
      </div>
      <Button variant="dark" size="sm" iconLeft={CalendarCheck} disabled={creation.elementCount === 0} onClick={go}>
        {t("studio.workspace.bookArtist.cta")}
      </Button>
    </section>
  );
}
