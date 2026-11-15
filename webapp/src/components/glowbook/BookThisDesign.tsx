"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarCheck } from "lucide-react";
import { Button } from "../ui/Button";
import { fetchBookableItems, fetchBookingInfo } from "../../lib/glowbookBooking";
import { type BookableItem, BookingDialog } from "./BookingDialog";
import { useBookingReturn } from "./useBookingReturn";

/**
 * "Book this design" beside a Glowbook creation in 3D (decision 144): shown
 * only when the artist's calendar takes bookings now (asked once the viewer
 * has loaded); opens the booking dialog with this creation chosen, the
 * artist's other approved creations beside it to choose from instead.
 */
export function BookThisDesign({ handle, itemId, designName, artistName }: { handle: string; itemId: string; designName: string; artistName: string }) {
  const { t } = useTranslation();
  // null until the visitor opens or closes it: back from signing in, it opens by itself.
  const [opened, setOpen] = useState<boolean | null>(null);
  const [bookable, setBookable] = useState(false);
  const [items, setItems] = useState<BookableItem[]>([{ id: itemId, name: designName }]);
  const back = useBookingReturn(bookable);

  useEffect(() => {
    let live = true;
    fetchBookingInfo(handle)
      .then((info) => live && setBookable(info !== null))
      .catch(() => live && setBookable(false));
    return () => {
      live = false;
    };
  }, [handle]);

  // The page's creations, this one first; a failure leaves this one alone (and the custom design).
  useEffect(() => {
    if (!bookable) return;
    let live = true;
    fetchBookableItems(handle)
      .then((all) => {
        if (!live) return;
        setItems([{ id: itemId, name: designName }, ...all.filter((i) => i.id !== itemId)]);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [bookable, handle, itemId, designName]);

  const open = opened ?? back !== null;

  if (!bookable) return null;
  return (
    <section aria-labelledby="gt-book-this" className="grid justify-items-start gap-2.5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-page)] p-4">
      <h2 id="gt-book-this" className="m-0 inline-flex items-center gap-2 text-[15px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
        <CalendarCheck size={16} aria-hidden="true" />
        {t("booking.viewer.title")}
      </h2>
      <p className="m-0 text-[12.5px] leading-relaxed text-[var(--text-muted)]">{t("booking.viewer.body", { name: artistName })}</p>
      <Button size="sm" iconLeft={CalendarCheck} onClick={() => setOpen(true)}>
        {t("booking.viewer.cta")}
      </Button>
      <BookingDialog
        open={open}
        onClose={() => setOpen(false)}
        handle={handle}
        artistName={artistName}
        items={items}
        initialItemId={back ? back.itemId : itemId}
        initialSlot={back?.slot ?? null}
      />
    </section>
  );
}
