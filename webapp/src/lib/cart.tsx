import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getProduct } from "../data/products";
import { photo } from "./images";
import { readStoredCart, writeStoredCart } from "./cartStorage";
import { addCourseToLines, addedQty, addGiftCardToLines, addToLines, cartCount, cartSubtotal, lineKey, setLineQty, undoAddition, type CartLine } from "./checkout/cartLines";
import { isSupabaseConfigured } from "./supabase/client";
import { useHydrated } from "./useHydrated";

export type { CartLine } from "./checkout/cartLines";

/**
 * The product a shopper just added, for the notice under the header's cart
 * icon (`CartAddedNotice`): the line as it now reads, and how many units the
 * addition really put on it, which is what "undo" takes back.
 */
export interface CartAddition {
  /** Changes at every addition, so a second one replaces the notice. */
  seq: number;
  line: CartLine;
  added: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  /** Indicative, in minor units: the order is priced by the database. */
  subtotal: number;
  addLine: (line: Omit<CartLine, "id">) => void;
  /** A gift card for one recipient: always its own line. */
  addGiftCard: (line: Omit<CartLine, "id" | "qty">) => void;
  /** An Academy course: one seat, added once. */
  addCourse: (line: Omit<CartLine, "id" | "qty"> & { courseId: string }) => void;
  updateQty: (id: string, qty: number) => void;
  removeLine: (id: string) => void;
  /** Empties the cart once its contents have become an order. */
  clearCart: () => void;
  /** The last product added with `addLine`, until its notice is dismissed. */
  lastAddition: CartAddition | null;
  /** Takes back the units of that addition (the rest of the cart is untouched). */
  undoAddition: (addition: CartAddition) => void;
  dismissAddition: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * The prototype's example basket, in mock mode only (no Supabase variables):
 * with the real catalogue a visitor's cart starts empty.
 */
function mockSeedLines(en: boolean): CartLine[] {
  if (isSupabaseConfigured) return [];
  const aurora = getProduct("aurora-heart")!;
  return [
    {
      id: "aurora-heart::seed",
      productId: "aurora-heart",
      name: en ? aurora.name.en : aurora.name.fr,
      variant: en ? "Aurora blue · 2.0mm" : "Bleu aurore · 2,0 mm",
      image: aurora.image,
      unitPrice: 4900,
      currency: "EUR",
      qty: 1,
    },
    {
      id: "bond-etch::seed",
      productId: "bond-etch",
      name: en ? "Bond & Etch Kit" : "Coffret Bond & Etch",
      variant: en ? "Clinical grade · 5ml" : "Grade clinique · 5 ml",
      image: photo("img-08.jpg"),
      unitPrice: 3900,
      currency: "EUR",
      qty: 1,
    },
  ];
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [seed] = useState<CartLine[]>(() => mockSeedLines(i18n.language.startsWith("en")));
  // The cart kept for the tab (`cartStorage.ts`), read once hydrated so a
  // server-rendered page hydrates with the markup the server sent.
  const hydrated = useHydrated();
  const stored = useMemo(() => (hydrated ? readStoredCart() : null), [hydrated]);
  // `changed`: the cart as edited on this page, written back at each change.
  const [changed, setChanged] = useState<CartLine[] | undefined>(undefined);
  const lines = changed ?? stored ?? seed;

  const setLines = useCallback(
    (next: (prev: CartLine[]) => CartLine[]) =>
      setChanged((prev) => {
        const value = next(prev ?? stored ?? seed);
        writeStoredCart(value);
        return value;
      }),
    [stored, seed],
  );

  // The cart as last rendered, to measure an addition outside the updater
  // (React may run an updater twice; the notice must be raised once).
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  const [lastAddition, setLastAddition] = useState<CartAddition | null>(null);
  const seqRef = useRef(0);

  const addLine = useCallback(
    (line: Omit<CartLine, "id">) => {
      const before = linesRef.current;
      const after = addToLines(before, line);
      linesRef.current = after;
      setLines((prev) => addToLines(prev, line));
      const id = lineKey(line);
      const added = addedQty(before, after, id);
      const next = after.find((l) => l.id === id);
      // Nothing to announce when the line was already at its cap.
      if (added > 0 && next) setLastAddition({ seq: ++seqRef.current, line: next, added });
    },
    [setLines],
  );
  const undoLastAddition = useCallback(
    (addition: CartAddition) => setLines((prev) => undoAddition(prev, addition.line.id, addition.added)),
    [setLines],
  );
  const dismissAddition = useCallback(() => setLastAddition(null), []);
  const addGiftCard = useCallback(
    (line: Omit<CartLine, "id" | "qty">) => {
      // Drawn outside the updater, which React may run twice.
      const id = crypto.randomUUID();
      setLines((prev) => addGiftCardToLines(prev, line, id));
    },
    [setLines],
  );
  const addCourse = useCallback(
    (line: Omit<CartLine, "id" | "qty"> & { courseId: string }) => setLines((prev) => addCourseToLines(prev, line)),
    [setLines],
  );
  const updateQty = useCallback((id: string, qty: number) => setLines((prev) => setLineQty(prev, id, qty)), [setLines]);
  const removeLine = useCallback((id: string) => setLines((prev) => prev.filter((l) => l.id !== id)), [setLines]);
  const clearCart = useCallback(() => setLines(() => []), [setLines]);

  const count = useMemo(() => cartCount(lines), [lines]);
  const subtotal = useMemo(() => cartSubtotal(lines), [lines]);

  return (
    <CartContext.Provider
      value={{ lines, count, subtotal, addLine, addGiftCard, addCourse, updateQty, removeLine, clearCart, lastAddition, undoAddition: undoLastAddition, dismissAddition }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
