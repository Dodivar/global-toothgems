import { describe, expect, it } from "vitest";
import { courseAfterPayment } from "./afterPayment";
import type { CartLine } from "./cartLines";

const base: CartLine = { id: "p::v", productId: "p", name: "Gem", image: "", unitPrice: 1000, currency: "EUR", qty: 1 };
const course = (id: string): CartLine => ({ ...base, id: `course::${id}`, productId: `slug-${id}`, courseId: id });

describe("courseAfterPayment", () => {
  it("opens the course when the basket held exactly one", () => {
    expect(courseAfterPayment([base, course("c1")])).toBe("/academy/mes-formations/c1");
  });

  it("sends several courses or a pack's course to the member space", () => {
    expect(courseAfterPayment([course("c1"), course("c2")])).toBe("/compte");
    expect(courseAfterPayment([{ ...base, pack: { course: true } }])).toBe("/compte");
    expect(courseAfterPayment([course("c1"), { ...base, pack: { course: true } }])).toBe("/compte");
  });

  it("gives nothing when no course was opened", () => {
    expect(courseAfterPayment([base])).toBeNull();
    expect(courseAfterPayment([{ ...base, pack: { course: false } }])).toBeNull();
  });
});
