import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getProduct } from "../data/products";
import { photo } from "./images";
import { readStoredCart, writeStoredCart } from "./cartStorage";
import { addToLines, cartCount, cartSubtotal, setLineQty, type CartLine } from "./checkout/cartLines";
import { isSupabaseConfigured } from "./supabase/client";
import { useHydrated } from "./useHydrated";

export type { CartLine } from "./checkout/cartLines";

interface CartContextValue {
  lines: CartLine[];
  count: number;
  /** Indicative, in minor units: the order is priced by the database. */
  subtotal: number;
  addLine: (line: Omit<CartLine, "id">) => void;
  updateQty: (id: string, qty: number) => void;
  removeLine: (id: string) => void;
  /** Empties the cart once its contents have become an order. */
  clearCart: () => void;
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

  const addLine = useCallback((line: Omit<CartLine, "id">) => setLines((prev) => addToLines(prev, line)), [setLines]);
  const updateQty = useCallback((id: string, qty: number) => setLines((prev) => setLineQty(prev, id, qty)), [setLines]);
  const removeLine = useCallback((id: string) => setLines((prev) => prev.filter((l) => l.id !== id)), [setLines]);
  const clearCart = useCallback(() => setLines(() => []), [setLines]);

  const count = useMemo(() => cartCount(lines), [lines]);
  const subtotal = useMemo(() => cartSubtotal(lines), [lines]);

  return (
    <CartContext.Provider value={{ lines, count, subtotal, addLine, updateQty, removeLine, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
