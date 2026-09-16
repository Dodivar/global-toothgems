import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Minus, Plus, ShoppingBag, Trash2, Truck } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Checkbox } from "../components/ui/Checkbox";
import { ProgressBar } from "../components/ui/ProgressBar";
import { ProductCard } from "../components/ui/ProductCard";
import { IconButton } from "../components/ui/IconButton";
import { useCart } from "../lib/cart";
import { useOrders } from "../lib/orders";
import { bestSellers } from "../data/products";
import { pick } from "../data/types";
import { formatPrice } from "../lib/format";

const FREE_SHIPPING_THRESHOLD = 80;
const SHIPPING_FLAT = 6.9;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function Cart() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { lines, subtotal, updateQty, removeLine, clearCart } = useCart();
  const { placeOrder } = useOrders();
  const lang = i18n.language;

  const [paid, setPaid] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [method, setMethod] = useState<"card" | "split">("card");
  const [country, setCountry] = useState("fr");
  const [saveInfo, setSaveInfo] = useState(true);
  const [form, setForm] = useState({
    firstName: "Camille",
    lastName: "Roussel",
    email: "camille@studio.fr",
    street: "14 rue des Capucins",
    postalCode: "69001",
    city: "Lyon",
  });

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : SHIPPING_FLAT;
  const total = subtotal + shipping;
  const remainingForFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const shippingPct = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);

  const steps = [t("cart.step0"), t("cart.step1"), t("cart.step2"), t("cart.step3")];
  const countryOptions = (["fr", "de", "be", "ie"] as const).map((c) => ({ value: c, label: t(`cart.countries.${c}`) }));

  // Derived from what the customer has actually supplied, rather than pinned to
  // step 2 regardless of state.
  const currentStep = useMemo(() => {
    if (lines.length === 0) return 0;
    const detailsComplete =
      form.firstName.trim() !== "" &&
      form.lastName.trim() !== "" &&
      EMAIL_RE.test(form.email.trim()) &&
      form.street.trim() !== "" &&
      form.postalCode.trim() !== "" &&
      form.city.trim() !== "";
    if (!detailsComplete) return 1;
    if (!country) return 2;
    return 3;
  }, [lines.length, form, country]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  /**
   * Mockup payment. It records the cart as an order so it shows up in the member
   * area, then empties the cart — paying twice for the same basket is not a
   * thing. Real fulfilment is driven by the Stripe webhook, never by the browser
   * returning from checkout.
   */
  const pay = () => {
    setReference(placeOrder(lines, shipping));
    clearCart();
    setPaid(true);
  };

  if (paid) {
    return (
      <div className="mx-auto max-w-[680px] px-[clamp(14px,4vw,48px)] py-[clamp(56px,8vw,96px)] text-center">
        <div className="gt-celebrate grid justify-items-center gap-5">
          <Badge tone="success" icon={CheckCircle2}>{t("cart.confirmedBadge")}</Badge>
          {/* The celebratory moment: the one place the script font carries a full word. */}
          <span className="gt-script text-[clamp(56px,10vw,104px)] leading-none text-[var(--gt-blue-500)]">
            {t("cart.confirmedScript")}
          </span>
          <h1 className="text-[length:var(--text-h1)]">{t("cart.confirmedTitle")}</h1>
          <p className="m-0 max-w-[480px] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("cart.confirmedBody")}</p>
          {reference && (
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {t("cart.confirmedReference", { reference })}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="primary" onClick={() => navigate("/compte")}>{t("cart.confirmedOpenAccount")}</Button>
            <Button variant="outline" onClick={() => navigate("/boutique")}>{t("cart.confirmedContinueShopping")}</Button>
          </div>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    const suggestions = bestSellers().slice(0, 4);
    return (
      <div className="mx-auto max-w-[var(--max-width-content)] px-[clamp(14px,4vw,48px)] py-[clamp(48px,7vw,88px)]">
        <div className="grid justify-items-center gap-5 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-muted)]">
            <ShoppingBag size={26} aria-hidden="true" />
          </span>
          {/* cart.emptyCart says the same thing as the heading; one of them is enough. */}
          <h1 className="text-[length:var(--text-h2)]">{t("cart.emptyCartTitle")}</h1>
          <Button variant="primary" size="lg" onClick={() => navigate("/boutique")}>{t("cart.continueShopping")}</Button>
        </div>
        {/* An empty cart is the best place to re-enter the catalogue, not a dead end. */}
        <div className="mt-16 grid gap-6">
          <h2 className="text-[length:var(--text-h3)]">{t("cart.emptySuggestions")}</h2>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {suggestions.map((p) => (
              <ProductCard
                key={p.id}
                to={`/boutique/${p.id}`}
                product={{
                  id: p.id,
                  name: pick(p.name, lang),
                  subtitle: pick(p.subtitle, lang),
                  price: p.price,
                  image: p.image,
                  hoverImage: p.gallery?.[1]?.src,
                  rating: p.rating,
                  reviewCount: p.reviewCount,
                  stock: p.stock,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[var(--max-width-content)] px-[clamp(14px,4vw,48px)] py-[clamp(32px,4vw,56px)] pb-28 lg:pb-[clamp(32px,4vw,56px)]">
      <div className="mb-10 hidden sm:block">
        <ProgressBar variant="steps" steps={steps} current={currentStep} />
      </div>
      <div className="mb-10 sm:hidden">
        <ProgressBar value={(currentStep / (steps.length - 1)) * 100} label={steps[currentStep]} showValue={false} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-8">
          <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-[var(--space-6)]">
            <h2 className="text-[length:var(--text-h3)]">{t("cart.cartTitle")}</h2>

            {/* The free-delivery rule existed in the total but was never shown, so
                there was no reason for anyone to reach for it. */}
            <div className="grid gap-2 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] p-4">
              <span className="flex items-center gap-2 text-sm font-medium text-[var(--gt-blue-700)]">
                <Truck size={16} aria-hidden="true" />
                {remainingForFreeShipping > 0
                  ? t("cart.freeShippingProgress", { amount: formatPrice(remainingForFreeShipping) })
                  : t("cart.freeShippingReached")}
              </span>
              <ProgressBar
                value={shippingPct}
                size="sm"
                tone={remainingForFreeShipping > 0 ? "brand" : "emerald"}
                showValue={false}
                label={t("cart.freeShippingLabel", { threshold: formatPrice(FREE_SHIPPING_THRESHOLD) })}
              />
            </div>

            <ul className="m-0 grid list-none gap-0 p-0">
              {lines.map((line) => (
                <li key={line.id} className="flex flex-wrap items-center gap-4 border-b border-[var(--border-subtle)] py-4 last:border-0 last:pb-0">
                  <img
                    src={line.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-16 w-16 flex-none rounded-[var(--radius-sm)] object-cover"
                  />
                  <div className="grid min-w-[150px] flex-1 gap-1">
                    <strong className="text-sm text-[var(--text-primary)]">{line.name}</strong>
                    {line.variant && <span className="text-xs text-[var(--text-muted)]">{line.variant}</span>}
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="inline-flex items-center gap-1 justify-self-start bg-transparent p-0 text-xs text-[var(--text-muted)] underline decoration-1 underline-offset-2 hover:text-[var(--status-error-fg)]"
                    >
                      <Trash2 size={12} aria-hidden="true" />
                      {t("cart.remove")}
                    </button>
                  </div>
                  <div className="flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border-default)]">
                    <IconButton icon={Minus} label={t("cart.decrease")} variant="ghost" size="sm" onClick={() => updateQty(line.id, Math.max(1, line.qty - 1))} />
                    <span className="w-6 text-center text-sm font-semibold">{line.qty}</span>
                    <IconButton icon={Plus} label={t("cart.increase")} variant="ghost" size="sm" onClick={() => updateQty(line.id, line.qty + 1)} />
                  </div>
                  <strong className="w-20 text-right text-sm text-[var(--text-primary)]" aria-label={t("cart.lineTotalAria")}>
                    {formatPrice(line.price * line.qty)}
                  </strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-[var(--space-6)]">
            <h2 className="text-[length:var(--text-h3)]">{t("cart.detailsTitle")}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label={t("cart.firstName")} autoComplete="given-name" value={form.firstName} onChange={set("firstName")} />
              <Input label={t("cart.lastName")} autoComplete="family-name" value={form.lastName} onChange={set("lastName")} />
              <div className="sm:col-span-2">
                <Input label={t("cart.email")} type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set("email")} />
              </div>
              <div className="sm:col-span-2">
                <Input label={t("cart.street")} autoComplete="street-address" value={form.street} onChange={set("street")} />
              </div>
              <Input label={t("cart.postalCode")} autoComplete="postal-code" inputMode="numeric" value={form.postalCode} onChange={set("postalCode")} />
              <Input label={t("cart.city")} autoComplete="address-level2" value={form.city} onChange={set("city")} />
              <div className="sm:col-span-2">
                <Select label={t("cart.country")} options={countryOptions} value={country} onChange={setCountry} />
              </div>
            </div>
            <Checkbox label={t("cart.saveInfo")} description={t("cart.saveInfoDescription")} checked={saveInfo} onChange={setSaveInfo} />
          </section>

          <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-[var(--space-6)]">
            <h2 className="text-[length:var(--text-h3)]">{t("cart.paymentTitle")}</h2>
            <fieldset className="m-0 grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2">
              <legend className="sr-only">{t("cart.paymentTitle")}</legend>
              {(["card", "split"] as const).map((m) => {
                const selected = method === m;
                return (
                  <label
                    key={m}
                    className="grid cursor-pointer gap-1 rounded-[var(--radius-md)] px-4 py-3 text-left transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]"
                    style={{
                      border: `1px solid ${selected ? "var(--gt-ink-900)" : "var(--border-default)"}`,
                      background: selected ? "var(--gt-ink-100)" : "transparent",
                    }}
                  >
                    <input type="radio" name="payment" value={m} checked={selected} onChange={() => setMethod(m)} className="sr-only" />
                    <strong className="text-sm text-[var(--text-primary)]">{m === "card" ? t("cart.payCard") : t("cart.paySplit")}</strong>
                    <span className="text-xs text-[var(--text-muted)]">
                      {m === "card" ? t("cart.payCardDetail") : t("cart.paySplitDetail", { amount: formatPrice(total / 4) })}
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <p className="m-0 text-xs text-[var(--text-muted)]">{t("cart.paymentFootnote")}</p>
          </section>
        </div>

        <aside className="grid content-start gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)] shadow-[var(--shadow-xs)] lg:sticky lg:top-24">
          <h2 className="text-[length:var(--text-h4)]">{t("cart.summaryTitle")}</h2>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between text-[var(--text-body)]">
              <span>{t("cart.subtotal")}</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[var(--text-body)]">
              <span>{t("cart.shipping")}</span>
              <span className={shipping === 0 ? "font-semibold text-[var(--status-success-fg)]" : undefined}>
                {shipping === 0 ? t("cart.shippingFree") : formatPrice(shipping)}
              </span>
            </div>
            <div className="flex justify-between border-t border-[var(--border-subtle)] pt-2 text-base font-bold text-[var(--text-primary)]">
              <span>{t("cart.total")}</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>
          <div className="hidden lg:block">
            <Button variant="primary" fullWidth size="lg" onClick={pay}>
              {t("cart.pay", { amount: formatPrice(total) })}
            </Button>
          </div>
          <p className="m-0 text-xs text-[var(--text-muted)]">{t("cart.summaryFootnote")}</p>
        </aside>
      </div>

      {/* On mobile the summary sits below three long form sections, so the pay
          button needs to travel with the customer. */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 shadow-[var(--shadow-lg)] lg:hidden">
        <Button variant="primary" fullWidth size="lg" onClick={pay}>
          {t("cart.pay", { amount: formatPrice(total) })}
        </Button>
      </div>
    </div>
  );
}
