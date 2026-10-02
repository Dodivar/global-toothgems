"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "../lib/navigation";
import { ArrowRight, CheckCircle2, CircleAlert, Gift, GraduationCap, Lock, LogIn, Mail, Minus, Plus, ShoppingBag, Trash2, Truck, UserRound } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { DELIVERY_COUNTRIES, countryLabelKey } from "../data/countries";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Checkbox } from "../components/ui/Checkbox";
import { ProgressBar } from "../components/ui/ProgressBar";
import { ProductCard } from "../components/ui/ProductCard";
import { IconButton } from "../components/ui/IconButton";
import { CheckoutLoyaltyBanner } from "../components/loyalty/CheckoutLoyaltyBanner";
import { DEFAULT_LOYALTY_STATE, LOYALTY_STATES } from "../data/loyalty";
import { useCart } from "../lib/cart";
import { useOrders } from "../lib/orders";
import { useAuth } from "../lib/auth";
import { useProgress } from "../lib/progress";
import { LEARN_BASE } from "../lib/academyUrl";
import { bestSellers } from "../data/products";
import { useCatalog } from "../lib/catalog/CatalogProvider";
import { toMajorUnits } from "../lib/catalog/money";
import { pick } from "../data/types";
import { useFormat } from "../lib/format";
import { isSupabaseConfigured } from "../lib/supabase/client";
import { fetchShippingRates, startCheckout, type CheckoutError } from "../lib/checkout/api";
import { buildCheckoutRequest, EMPTY_CHECKOUT_FORM, invalidFields, type CheckoutForm } from "../lib/checkout/checkoutForm";
import { hasCourse, needsShipping, shippableSubtotal } from "../lib/checkout/cartLines";
import { GiftCardVisual } from "../components/promotions/Visuals";
import { GiftCardCodes } from "../components/shop/GiftCardCodes";
import type { GiftCardDesign } from "../lib/giftCards/giftCardMapping";
import {
  applicableRates,
  freeShippingThreshold,
  pickRate,
  type ShippingOption,
  type ShippingRateRow,
} from "../lib/checkout/shippingRates";

/** The prototype's single delivery rule, kept for mock mode (no Supabase variables). */
const MOCK_RATES: ShippingRateRow[] = [
  {
    id: "mock-standard",
    kind: "standard",
    min_days: 2,
    max_days: 4,
    price: "6.90",
    currency: "EUR",
    free_over_amount: "80.00",
    min_order_amount: null,
    max_order_amount: null,
    position: 1,
  },
];

const MOCK_FORM: CheckoutForm = {
  firstName: "Camille",
  lastName: "Roussel",
  email: "camille@studio.fr",
  street: "14 rue des Capucins",
  postalCode: "69001",
  city: "Lyon",
  country: "fr",
};

type RatesState = { country: string; status: "loading" | "ready" | "error"; rows: ShippingRateRow[] };

export function Cart() {
  const { formatPrice } = useFormat();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { lines, subtotal, updateQty, removeLine, clearCart } = useCart();
  const { products } = useCatalog();
  const { placeOrder } = useOrders();
  const { signedIn } = useAuth();
  const { reload: reloadCourses } = useProgress();
  const lang = i18n.language;
  const live = isSupabaseConfigured;
  const money = (minor: number) => formatPrice(toMajorUnits(minor));

  const [reference, setReference] = useState<string | null>(null);
  const [boughtCourse, setBoughtCourse] = useState(false);
  const [saveInfo, setSaveInfo] = useState(true);
  const [form, setForm] = useState<CheckoutForm>(live ? EMPTY_CHECKOUT_FORM : MOCK_FORM);
  const [chosenRate, setChosenRate] = useState<string | null>(null);
  const [rates, setRates] = useState<RatesState>({ country: "", status: live ? "loading" : "ready", rows: live ? [] : MOCK_RATES });
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [checkoutError, setCheckoutError] = useState<CheckoutError | null>(null);
  // Gift card codes are bearer credentials: kept in memory for this page only, never stored.
  const [giftCodes, setGiftCodes] = useState<string[]>([]);
  // Gift cards are sent by e-mail: a basket of gift cards only has no delivery to choose.
  const shipped = needsShipping(lines);
  const goods = shippableSubtotal(lines);
  // A course opens on an account: the basket waits while the visitor signs in.
  const courseInBasket = hasCourse(lines);
  const accountMissing = live && courseInBasket && !signedIn;

  // Delivery rates of the destination's zone (public tables), read again when the country changes.
  const [ratesAttempt, setRatesAttempt] = useState(0);
  useEffect(() => {
    // Nothing to ship (gift cards, courses): no rate to read.
    if (!live || !shipped) return;
    let current = true;
    fetchShippingRates(form.country)
      .then((rows) => current && setRates({ country: form.country, status: "ready", rows }))
      .catch((error: unknown) => {
        console.error("[cart] shipping rates", error instanceof Error ? error.message : error);
        if (current) setRates({ country: form.country, status: "error", rows: [] });
      });
    return () => {
      current = false;
    };
  }, [live, shipped, form.country, ratesAttempt]);

  const ratesReady = !live || !shipped || (rates.status === "ready" && rates.country === form.country);
  const ratesFailed = live && shipped && rates.status === "error" && rates.country === form.country;
  const currency = lines[0]?.currency ?? "EUR";
  const options: ShippingOption[] = ratesReady && shipped ? applicableRates(rates.rows, goods, currency) : [];
  const rateId = pickRate(options, chosenRate);
  const selected = options.find((o) => o.id === rateId) ?? null;
  const shipping = selected?.price ?? 0;
  const total = subtotal + shipping;
  const threshold = ratesReady && shipped ? freeShippingThreshold(rates.rows, currency) : null;
  const remainingForFreeShipping = threshold === null ? null : Math.max(0, threshold - goods);

  const invalid = invalidFields(form, rateId, shipped);
  const steps = [t("cart.step0"), t("cart.step1"), t("cart.step2"), t("cart.step3")];
  const countryOptions = DELIVERY_COUNTRIES.map((c) => ({ value: c, label: t(countryLabelKey(c)) }));

  // Derived from what the customer has actually supplied.
  const currentStep =
    lines.length === 0 ? 0 : invalid.some((field) => field !== "shipping" && field !== "country") ? 1 : invalid.length > 0 ? 2 : 3;

  const set = (key: keyof CheckoutForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const pay = async () => {
    setCheckoutError(null);
    if (accountMissing) {
      setCheckoutError("account_required");
      return;
    }
    if (invalid.length > 0 || (shipped && !rateId)) {
      setShowErrors(true);
      return;
    }
    if (!live) {
      // Mock mode: records the cart as a demo order, as the prototype did.
      setReference(placeOrder(lines, toMajorUnits(shipping)));
      clearCart();
      return;
    }
    const request = buildCheckoutRequest(lines, form, shipped ? rateId : null, lang.startsWith("en") ? "en" : "fr", giftCodes);
    if (!request) {
      setCheckoutError("unavailable");
      return;
    }
    setSubmitting(true);
    const result = await startCheckout(request);
    if (result.kind === "redirect") {
      // Stays "submitting" while the browser leaves for Stripe. Nothing is
      // granted by coming back: the webhook confirms the payment.
      window.location.assign(result.url);
      return;
    }
    setSubmitting(false);
    if (result.kind === "paid") {
      // Entirely covered by gift cards: create_order() recorded the payment itself
      // (and granted the courses it held).
      setReference(result.orderNumber);
      if (courseInBasket) {
        setBoughtCourse(true);
        reloadCourses();
      }
      setGiftCodes([]);
      clearCart();
      return;
    }
    setCheckoutError(result.error);
  };

  if (reference) {
    return (
      <div className="mx-auto max-w-[680px] px-[clamp(14px,4vw,48px)] py-[clamp(56px,8vw,96px)] text-center">
        <div className="gt-celebrate grid justify-items-center gap-5">
          <Badge tone="success" icon={CheckCircle2}>{t("cart.confirmedBadge")}</Badge>
          <span className="gt-accent text-[clamp(28px,4vw,40px)] leading-none text-[var(--gt-blue-600)]">
            {t("cart.confirmedScript")}
          </span>
          <h1 className="text-[length:var(--text-h1)]">{t("cart.confirmedTitle")}</h1>
          <p className="m-0 max-w-[480px] text-[length:var(--text-body-md)] text-[var(--text-body)]">
            {live ? t("checkout.paidBody") : t("cart.confirmedBody")}
            {boughtCourse && ` ${t("checkout.course.paidBody")}`}
          </p>
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {live ? t("checkout.reference", { reference }) : t("cart.confirmedReference", { reference })}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {boughtCourse ? (
              <Button variant="primary" onClick={() => navigate(LEARN_BASE)}>{t("checkout.course.openCourses")}</Button>
            ) : (
              <Button variant="primary" onClick={() => navigate("/compte")}>{t("cart.confirmedOpenAccount")}</Button>
            )}
            <Button variant="outline" onClick={() => navigate("/boutique")}>{t("cart.confirmedContinueShopping")}</Button>
          </div>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    const suggestions = bestSellers(products);
    return (
      <div className="mx-auto max-w-[var(--max-width-content)] px-[clamp(14px,4vw,48px)] py-[clamp(48px,7vw,88px)]">
        <div className="grid justify-items-center gap-5 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-muted)]">
            <ShoppingBag size={26} aria-hidden="true" />
          </span>
          <h1 className="text-[length:var(--text-h2)]">{t("cart.emptyCartTitle")}</h1>
          <Button variant="primary" size="lg" onClick={() => navigate("/boutique")}>{t("cart.continueShopping")}</Button>
        </div>
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
                  stock: p.stock,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const fieldError = (field: keyof CheckoutForm) => showErrors && invalid.includes(field);
  const payLabel = giftCodes.length > 0
    ? t("checkout.giftCard.payWithCards")
    : selected || !shipped
      ? t("cart.pay", { amount: money(total) })
      : t("checkout.payNoShipping");
  const payButton = (
    <Button variant="primary" fullWidth size="lg" onClick={pay} loading={submitting} disabled={submitting || !ratesReady || accountMissing}>
      {payLabel}
    </Button>
  );

  // Rendered next to each pay button (desktop summary, mobile bar); only one
  // of the two is displayed, so each message is announced once.
  const alertClass =
    "m-0 flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-4 py-3 text-sm font-medium text-[var(--status-error-fg)]";
  const alerts = (
    <>
      {showErrors && invalid.length > 0 && (
        <p role="alert" className={alertClass}>
          <CircleAlert size={16} aria-hidden="true" className="flex-none" /> {t("checkout.formIncomplete")}
        </p>
      )}
      {checkoutError && (
        <p role="alert" className={alertClass}>
          <CircleAlert size={16} aria-hidden="true" className="flex-none" /> {t(`checkout.errors.${checkoutError}`)}
        </p>
      )}
    </>
  );

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
          <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)]">
            <h2 className="text-[length:var(--text-h3)]">{t("cart.cartTitle")}</h2>

            {threshold !== null && remainingForFreeShipping !== null && (
              <div className="grid gap-2 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] p-4">
                <span className="flex items-center gap-2 text-sm font-medium text-[var(--gt-blue-700)]">
                  <Truck size={16} aria-hidden="true" />
                  {remainingForFreeShipping > 0
                    ? t("cart.freeShippingProgress", { amount: money(remainingForFreeShipping) })
                    : t("cart.freeShippingReached")}
                </span>
                <ProgressBar
                  value={Math.min(100, (goods / threshold) * 100)}
                  size="sm"
                  tone={remainingForFreeShipping > 0 ? "brand" : "emerald"}
                  showValue={false}
                  label={t("cart.freeShippingLabel", { threshold: money(threshold) })}
                />
              </div>
            )}

            <ul className="m-0 grid list-none gap-0 p-0">
              {lines.map((line) => (
                <li key={line.id} className="flex flex-wrap items-center gap-4 border-b border-[var(--border-subtle)] py-4 last:border-0 last:pb-0">
                  {line.giftCard ? (
                    <span className="w-16 flex-none">
                      <GiftCardVisual design={line.giftCard.design as GiftCardDesign} amountCents={line.unitPrice} size="sm" label="" />
                    </span>
                  ) : line.courseId && !line.image ? (
                    <span aria-hidden="true" className="grid h-16 w-16 flex-none place-items-center rounded-[var(--radius-sm)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
                      <GraduationCap size={24} />
                    </span>
                  ) : (
                    <img
                      src={line.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-16 w-16 flex-none rounded-[var(--radius-sm)] object-cover"
                    />
                  )}
                  <div className="grid min-w-[150px] flex-1 gap-1">
                    <strong className="text-sm text-[var(--text-primary)]">{line.name}</strong>
                    {line.variant && <span className="text-xs text-[var(--text-muted)]">{line.variant}</span>}
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      disabled={submitting}
                      className="inline-flex items-center gap-1 justify-self-start bg-transparent p-0 text-xs text-[var(--text-muted)] underline decoration-1 underline-offset-2 hover:text-[var(--status-error-fg)]"
                    >
                      <Trash2 size={12} aria-hidden="true" />
                      {t("cart.remove")}
                    </button>
                  </div>
                  {line.giftCard ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <Mail size={13} aria-hidden="true" />
                      {line.giftCard.deliverAt ? t("checkout.giftCard.scheduled") : t("checkout.giftCard.byEmail")}
                    </span>
                  ) : line.courseId ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      <GraduationCap size={13} aria-hidden="true" />
                      {t("checkout.course.line")}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border-default)]">
                      <IconButton icon={Minus} label={t("cart.decrease")} variant="ghost" size="sm" disabled={submitting} onClick={() => updateQty(line.id, Math.max(1, line.qty - 1))} />
                      <span className="w-6 text-center text-sm font-semibold">{line.qty}</span>
                      <IconButton icon={Plus} label={t("cart.increase")} variant="ghost" size="sm" disabled={submitting} onClick={() => updateQty(line.id, line.qty + 1)} />
                    </div>
                  )}
                  <strong className="w-20 text-right text-sm text-[var(--text-primary)]" aria-label={t("cart.lineTotalAria")}>
                    {money(line.unitPrice * line.qty)}
                  </strong>
                </li>
              ))}
            </ul>

            {/* Loyalty is shown, never applied (mock card): no discount, no change to what is charged. */}
            <CheckoutLoyaltyBanner subtotal={toMajorUnits(subtotal)} state={LOYALTY_STATES[DEFAULT_LOYALTY_STATE]} />
          </section>

          {/* A course is the one thing that needs an account; otherwise
              an account stays optional, never a wall. */}
          {accountMissing && (
            <section className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--gt-blue-300)] bg-[var(--surface-brand-wash-strong)] p-[var(--space-6)]">
              <h2 className="flex items-center gap-2 text-[length:var(--text-h4)]">
                <GraduationCap size={18} aria-hidden="true" className="flex-none text-[var(--gt-blue-700)]" />
                {t("checkout.course.accountTitle")}
              </h2>
              <p className="m-0 text-sm text-[var(--text-body)]">{t("checkout.course.accountBody")}</p>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" iconLeft={LogIn} onClick={() => navigate("/connexion", { state: { from: "/panier" } })}>
                  {t("checkout.course.signIn")}
                </Button>
                <Button variant="outline" onClick={() => navigate("/inscription?contexte=achat")}>
                  {t("checkout.course.createAccount")}
                </Button>
              </div>
            </section>
          )}
          {!signedIn && !courseInBasket && (
            <Link
              to="/inscription?contexte=achat"
              className="group flex items-center gap-4 rounded-[var(--radius-card)] border border-[var(--gt-blue-200)] bg-[var(--surface-brand-wash-strong)] p-4 transition-colors hover:border-[var(--gt-blue-400)]"
            >
              <span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-full bg-white text-[var(--gt-blue-700)] shadow-[var(--shadow-xs)]">
                <UserRound size={18} />
              </span>
              <span className="grid flex-1 gap-0.5">
                <strong className="text-sm text-[var(--text-primary)]">{t("cart.accountPromptTitle")}</strong>
                <span className="text-xs text-[var(--text-muted)]">{t("cart.accountPromptBody")}</span>
              </span>
              <ArrowRight size={16} aria-hidden="true" className="flex-none text-[var(--text-primary)] transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}

          <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)]">
            <h2 className="text-[length:var(--text-h3)]">{t("cart.detailsTitle")}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label={t("cart.firstName")} autoComplete="given-name" required aria-invalid={fieldError("firstName")} value={form.firstName} onChange={set("firstName")} />
              <Input label={t("cart.lastName")} autoComplete="family-name" required aria-invalid={fieldError("lastName")} value={form.lastName} onChange={set("lastName")} />
              <div className="sm:col-span-2">
                <Input label={t("cart.email")} type="email" autoComplete="email" inputMode="email" required aria-invalid={fieldError("email")} value={form.email} onChange={set("email")} />
              </div>
              <div className="sm:col-span-2">
                <Input label={t("cart.street")} autoComplete="street-address" required aria-invalid={fieldError("street")} value={form.street} onChange={set("street")} />
              </div>
              <Input label={t("cart.postalCode")} autoComplete="postal-code" required aria-invalid={fieldError("postalCode")} value={form.postalCode} onChange={set("postalCode")} />
              <Input label={t("cart.city")} autoComplete="address-level2" required aria-invalid={fieldError("city")} value={form.city} onChange={set("city")} />
              <div className="sm:col-span-2">
                <Select label={t("cart.country")} options={countryOptions} value={form.country} onChange={(country) => setForm((f) => ({ ...f, country }))} />
              </div>
            </div>
            {/* Saving the address on the account is not built yet: offered in the demo only. */}
            {!live && (
              <Checkbox label={t("cart.saveInfo")} description={t("cart.saveInfoDescription")} checked={saveInfo} onChange={setSaveInfo} />
            )}
          </section>

          {!shipped ? (
            <section className="grid gap-2 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)]">
              <h2 className="text-[length:var(--text-h3)]">{t("checkout.shippingTitle")}</h2>
              <p className="m-0 flex items-start gap-2 text-sm text-[var(--text-body)]">
                {courseInBasket ? (
                  <GraduationCap size={16} aria-hidden="true" className="mt-0.5 flex-none" />
                ) : (
                  <Gift size={16} aria-hidden="true" className="mt-0.5 flex-none" />
                )}
                {t("checkout.noShipping")}
              </p>
            </section>
          ) : (
          <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)]">
            <h2 className="text-[length:var(--text-h3)]">{t("checkout.shippingTitle")}</h2>
            {!ratesReady && !ratesFailed && (
              <p role="status" className="m-0 text-sm text-[var(--text-muted)]">{t("checkout.shippingLoading")}</p>
            )}
            {ratesFailed && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-4 py-3 text-sm text-[var(--status-error-fg)]">
                <CircleAlert size={16} aria-hidden="true" />
                <span className="flex-1">{t("checkout.shippingError")}</span>
                <Button variant="outline" size="sm" onClick={() => setRatesAttempt((n) => n + 1)}>{t("checkout.retry")}</Button>
              </div>
            )}
            {ratesReady && options.length === 0 && (
              <p role="alert" className="m-0 text-sm text-[var(--status-error-fg)]">{t("checkout.shippingNone")}</p>
            )}
            {options.length > 0 && (
              <fieldset className="m-0 grid gap-3 border-0 p-0">
                <legend className="sr-only">{t("checkout.shippingTitle")}</legend>
                {options.map((option) => {
                  const isSelected = option.id === rateId;
                  return (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center justify-between gap-4 rounded-[var(--radius-md)] px-4 py-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]"
                      style={{
                        border: `1px solid ${isSelected ? "var(--gt-ink-900)" : "var(--border-default)"}`,
                        background: isSelected ? "var(--gt-ink-100)" : "transparent",
                      }}
                    >
                      <input type="radio" name="shipping" value={option.id} checked={isSelected} onChange={() => setChosenRate(option.id)} disabled={submitting} className="sr-only" />
                      <span className="grid gap-0.5">
                        <strong className="text-sm text-[var(--text-primary)]">{t(`checkout.shippingKind.${option.kind}`)}</strong>
                        <span className="text-xs text-[var(--text-muted)]">
                          {t("checkout.shippingDays", { min: option.minDays, max: option.maxDays })}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {option.price === 0 ? t("cart.shippingFree") : money(option.price)}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
          </section>
          )}

          {live && (
            <GiftCardCodes
              codes={giftCodes}
              onChange={(codes) => {
                setGiftCodes(codes);
                if (checkoutError === "gift_card_invalid") setCheckoutError(null);
              }}
              disabled={submitting}
              refused={checkoutError === "gift_card_invalid"}
            />
          )}

          <section className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)]">
            <h2 className="text-[length:var(--text-h3)]">{t("cart.paymentTitle")}</h2>
            <p className="m-0 flex items-start gap-2 text-sm text-[var(--text-body)]">
              <Lock size={16} aria-hidden="true" className="mt-0.5 flex-none" />
              {t("checkout.paymentRedirect")}
            </p>
            <p className="m-0 text-xs text-[var(--text-muted)]">{t("cart.payCardDetail")}</p>
          </section>
        </div>

        <aside className="grid content-start gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)] shadow-[var(--shadow-xs)] lg:sticky lg:top-24">
          <h2 className="text-[length:var(--text-h4)]">{t("cart.summaryTitle")}</h2>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between text-[var(--text-body)]">
              <span>{t("cart.subtotal")}</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[var(--text-body)]">
              <span>{t("cart.shipping")}</span>
              {!shipped ? (
                <span>{courseInBasket ? t("checkout.course.noDelivery") : t("checkout.giftCard.emailDelivery")}</span>
              ) : selected ? (
                <span className={shipping === 0 ? "font-semibold text-[var(--status-success-fg)]" : undefined}>
                  {shipping === 0 ? t("cart.shippingFree") : money(shipping)}
                </span>
              ) : (
                <span className="text-[var(--text-muted)]">—</span>
              )}
            </div>
            <div className="flex justify-between border-t border-[var(--border-subtle)] pt-2 text-base font-bold text-[var(--text-primary)]">
              <span>{t("cart.total")}</span>
              <span>{money(total)}</span>
            </div>
            {giftCodes.length > 0 && (
              // Balances are never read by the browser: the database applies the cards and computes what is left to pay.
              <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] px-3 py-2 text-xs text-[var(--gt-blue-700)]">
                <Gift size={14} aria-hidden="true" className="mt-0.5 flex-none" />
                {t("checkout.giftCard.summary", { count: giftCodes.length })}
              </p>
            )}
          </div>
          <div className="hidden gap-3 lg:grid">
            {alerts}
            {payButton}
          </div>
          <p className="m-0 text-xs text-[var(--text-muted)]">{t("cart.summaryFootnote")}</p>
        </aside>
      </div>

      {/* On mobile the summary sits below long form sections, so the pay
          button travels with the customer. */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 shadow-[var(--shadow-lg)] lg:hidden">
        <div className="grid gap-2">
          {alerts}
          {payButton}
        </div>
      </div>
    </div>
  );
}
