import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Review annotations for the legal and help pages.
 *
 * The pages carry two kinds of scaffolding: placeholders for information the
 * business has not supplied (always visible — a missing VAT number must never
 * be hidden) and internal notes addressed to whoever reviews the prototype.
 * The notes, and the pre-launch checklist, can be switched off to see the page
 * roughly as a customer would. Neither exists in production.
 */

const STORAGE_KEY = "gt-review-notes";

function readStored() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

interface ReviewModeValue {
  showNotes: boolean;
  setShowNotes: (show: boolean) => void;
}

const ReviewModeContext = createContext<ReviewModeValue | null>(null);

export function ReviewModeProvider({ children }: { children: ReactNode }) {
  const [showNotes, setShow] = useState(readStored);

  const value = useMemo<ReviewModeValue>(
    () => ({
      showNotes,
      setShowNotes: (show) => {
        setShow(show);
        try {
          window.localStorage.setItem(STORAGE_KEY, show ? "on" : "off");
        } catch {
          /* Storage unavailable: the setting lasts this visit. */
        }
      },
    }),
    [showNotes],
  );

  return <ReviewModeContext.Provider value={value}>{children}</ReviewModeContext.Provider>;
}

export function useReviewMode() {
  const ctx = useContext(ReviewModeContext);
  if (!ctx) throw new Error("useReviewMode must be used within ReviewModeProvider");
  return ctx;
}
