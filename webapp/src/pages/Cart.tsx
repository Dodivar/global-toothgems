import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Minus, Plus } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Checkbox } from "../components/ui/Checkbox";
import { ProgressBar } from "../components/ui/ProgressBar";
import { IconButton } from "../components/ui/IconButton";
import { useCart } from "../lib/cart";
import { formatPrice } from "../lib/format";

export function Cart() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lines, subtotal, updateQty, removeLine } = useCart();
  const [paid, setPaid] = useState(false);
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

  const shipping = subtotal > 80 || subtotal === 0 ? 0 : 6.9;
  const total = subtotal + shipping;
  const steps = [t("cart.step0"), t("cart.step1"), t("cart.step2"), t("cart.step3")];
  const countryOptions = (["fr", "de", "be", "ie"] as const).map((c) => ({ value: c, label: t(`cart.countries.${c}`) }));

  if (paid) {
    return (
      <div className="mx-auto max-w-[640px] px-[clamp(14px,4vw,48px)] py-[clamp(56px,8vw,96px)] text-center">
        <div className="grid justify-items-center gap-5">
          <Badge tone="success" icon={CheckCircle2}>{t("cart.confirmedBadge")}</Badge>
          <h1 className="text-[length:var(--text-h1)]">{t("cart.confirmedTitle")}</h1>
          <p className="m-0 max-w-[480px] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("cart.confirmedBody")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="primary" onClick={() => navigate("/academy")}>{t("cart.confirmedOpenAcademy")}</Button>
            <Button variant="outline" onClick={() => navigate("/boutique")}>{t("cart.confirmedContinueShopping")}</Button>
          </div>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-[640px] px-[clamp(14px,4vw,48px)] py-[clamp(56px,8vw,96px)] text-center">
        <p className="m-0 pb-5 text-[var(--text-muted)]">{t("cart.emptyCart")}</p>
        <Button variant="primary" onClick={() => navigate("/boutique")}>{t("cart.continueShopping")}</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[var(--max-width-content)] px-[clamp(14px,4vw,48px)] py-[clamp(32px,4vw,56px)]">
      <div className="mb-10 hidden sm:block">
        <ProgressBar variant="steps" steps={steps} current={2} />
      </div>
      <div className="mb-10 sm:hidden">
        <ProgressBar value={50} label={t("cart.stepMobile")} showValue={false} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-8">
          <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-[var(--space-6)]">
            <h3 className="text-[length:var(--text-h3)]">{t("cart.cartTitle")}</h3>
            {lines.map((line) => (
              <div key={line.id} className="flex flex-wrap items-center gap-4 border-b border-[var(--border-subtle)] pb-4 last:border-0 last:pb-0">
                <img src={line.image} alt={line.name} className="h-16 w-16 flex-none rounded-[var(--radius-sm)] object-cover" />
                <div className="grid min-w-[150px] flex-1 gap-1">
                  <strong className="text-sm text-[var(--text-primary)]">{line.name}</strong>
                  {line.variant && <span className="text-xs text-[var(--text-muted)]">{line.variant}</span>}
                  <button type="button" onClick={() => removeLine(line.id)} className="justify-self-start bg-transparent p-0 text-xs text-[var(--text-muted)] underline decoration-1 underline-offset-2">
                    {t("cart.remove")}
                  </button>
                </div>
                <div className="flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border-default)]">
                  <IconButton icon={Minus} label={t("cart.decrease")} variant="ghost" size="sm" onClick={() => updateQty(line.id, Math.max(1, line.qty - 1))} />
                  <span className="w-6 text-center text-sm font-semibold">{line.qty}</span>
                  <IconButton icon={Plus} label={t("cart.increase")} variant="ghost" size="sm" onClick={() => updateQty(line.id, line.qty + 1)} />
                </div>
                <strong className="w-20 text-right text-sm text-[var(--text-primary)]">{formatPrice(line.price * line.qty)}</strong>
              </div>
            ))}
          </section>

          <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-[var(--space-6)]">
            <h3 className="text-[length:var(--text-h3)]">{t("cart.detailsTitle")}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label={t("cart.firstName")} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              <Input label={t("cart.lastName")} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              <div className="sm:col-span-2">
                <Input label={t("cart.email")} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Input label={t("cart.street")} value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
              </div>
              <Input label={t("cart.postalCode")} value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
              <Input label={t("cart.city")} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <div className="sm:col-span-2">
                <Select label={t("cart.country")} options={countryOptions} value={country} onChange={setCountry} />
              </div>
            </div>
            <Checkbox label={t("cart.saveInfo")} description={t("cart.saveInfoDescription")} checked={saveInfo} onChange={setSaveInfo} />
          </section>

          <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-[var(--space-6)]">
            <h3 className="text-[length:var(--text-h3)]">{t("cart.paymentTitle")}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(["card", "split"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className="grid gap-1 rounded-[var(--radius-md)] px-4 py-3 text-left transition-colors"
                  style={{
                    border: `1px solid ${method === m ? "var(--gt-ink-900)" : "var(--border-default)"}`,
                    background: method === m ? "var(--gt-ink-100)" : "transparent",
                  }}
                >
                  <strong className="text-sm text-[var(--text-primary)]">{m === "card" ? t("cart.payCard") : t("cart.paySplit")}</strong>
                  <span className="text-xs text-[var(--text-muted)]">
                    {m === "card" ? t("cart.payCardDetail") : t("cart.paySplitDetail", { amount: formatPrice(total / 4) })}
                  </span>
                </button>
              ))}
            </div>
            <p className="m-0 text-xs text-[var(--text-muted)]">{t("cart.paymentFootnote")}</p>
          </section>
        </div>

        <aside className="grid content-start gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)] shadow-[var(--shadow-xs)] lg:sticky lg:top-24">
          <h4 className="text-[length:var(--text-h4)]">{t("cart.summaryTitle")}</h4>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between text-[var(--text-body)]">
              <span>{t("cart.subtotal")}</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[var(--text-body)]">
              <span>{t("cart.shipping")}</span>
              <span>{shipping === 0 ? t("cart.shippingFree") : formatPrice(shipping)}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--border-subtle)] pt-2 text-base font-bold text-[var(--text-primary)]">
              <span>{t("cart.total")}</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>
          <Button variant="primary" fullWidth size="lg" onClick={() => setPaid(true)}>
            {t("cart.pay", { amount: formatPrice(total) })}
          </Button>
          <p className="m-0 text-xs text-[var(--text-muted)]">{t("cart.summaryFootnote")}</p>
        </aside>
      </div>
    </div>
  );
}
