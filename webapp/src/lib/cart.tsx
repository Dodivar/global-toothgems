import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getProduct } from "../data/products";
import { photo } from "./images";

export interface CartLine {
  id: string;
  productId: string;
  name: string;
  variant?: string;
  image: string;
  price: number;
  qty: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  addLine: (line: Omit<CartLine, "id">) => void;
  updateQty: (id: string, qty: number) => void;
  removeLine: (id: string) => void;
  /** Empties the cart once its contents have become an order. */
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function seedLines(en: boolean): CartLine[] {
  const aurora = getProduct("aurora-heart")!;
  return [
    {
      id: "aurora-heart::seed",
      productId: "aurora-heart",
      name: en ? aurora.name.en : aurora.name.fr,
      variant: en ? "Aurora blue · 2.0mm" : "Bleu aurore · 2,0 mm",
      image: aurora.image,
      price: 49,
      qty: 1,
    },
    {
      id: "bond-etch::seed",
      productId: "bond-etch",
      name: en ? "Bond & Etch Kit" : "Coffret Bond & Etch",
      variant: en ? "Clinical grade · 5ml" : "Grade clinique · 5 ml",
      image: photo("img-08.jpg"),
      price: 39,
      qty: 1,
    },
  ];
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [lines, setLines] = useState<CartLine[]>(() => seedLines(i18n.language.startsWith("en")));

  const addLine = (line: Omit<CartLine, "id">) => {
    setLines((prev) => {
      const key = `${line.productId}::${line.variant ?? ""}`;
      const existing = prev.find((l) => `${l.productId}::${l.variant ?? ""}` === key);
      if (existing) {
        return prev.map((l) => (l.id === existing.id ? { ...l, qty: l.qty + line.qty } : l));
      }
      return [...prev, { ...line, id: key }];
    });
  };

  const updateQty = (id: string, qty: number) => {
    setLines((prev) =>
      qty <= 0 ? prev.filter((l) => l.id !== id) : prev.map((l) => (l.id === id ? { ...l, qty } : l)),
    );
  };

  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  const clearCart = () => setLines([]);

  const count = useMemo(() => lines.reduce((sum, l) => sum + l.qty, 0), [lines]);
  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.qty * l.price, 0), [lines]);

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
