"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, X } from "lucide-react";
import { type BookingCreationChoice, forgetBookingCreation, readBookingCreation } from "../../lib/glowbookBookingCreation";

/**
 * The Studio creation the member came to have made (decision 149), recalled on
 * the artist directory: the booking dialog on an artist's page will offer it. Read once hydrated (it lives in the tab's storage); "Forget" drops it.
 */
export function BookingCreationNotice() {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<BookingCreationChoice | null>(null);
  useEffect(() => setChoice(readBookingCreation()), []);
  if (!choice) return null;

  return (
    <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-[var(--surface-brand-wash)] px-3.5 py-2.5 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
      <Box size={16} aria-hidden="true" className="flex-none text-[var(--gt-blue-700)]" />
      <span className="min-w-0 flex-1">{t("booking.design.pending", { name: choice.name || t("studio.workspace.untitled") })}</span>
      <button
        type="button"
        onClick={() => {
          forgetBookingCreation();
          setChoice(null);
        }}
        className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <X size={13} aria-hidden="true" />
        {t("booking.design.pendingForget")}
      </button>
    </p>
  );
}
