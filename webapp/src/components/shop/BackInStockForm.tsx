"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useAuth } from "../../lib/auth";
import { requestBackInStockAlert, type BackInStockError } from "../../lib/backInStock";

interface BackInStockFormProps {
  /** `products.id` of the product. */
  productId: string;
  /** `product_variants.id` of the picked option, for a product sold in options. */
  variantId?: string;
  /** Bumped by the sticky bar of phones to open the form and bring it into view. */
  openRequest?: number;
  className?: string;
}

type Phase = "idle" | "form" | "sending" | "done";

/**
 * Takes the place of "Add to cart" when the product (or the picked option) is
 * out of stock: "Tell me when it's back". A member is signed up in one click on
 * the account's address; a visitor types an address. One e-mail, once, when the
 * stock comes back (lib/backInStock.ts). Same markup on the server and on the
 * first browser render: the auth state is only read once the button is pressed.
 */
export function BackInStockForm({ productId, variantId, openRequest = 0, className }: BackInStockFormProps) {
  const { t, i18n } = useTranslation();
  const { realAuth, userId, email: accountEmail } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<BackInStockError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const locale = i18n.language.startsWith("en") ? "en" : "fr";
  const member = realAuth && userId !== null;

  const submit = async (address?: string) => {
    setPhase("sending");
    setError(null);
    const result = await requestBackInStockAlert({ productId, variantId, email: address, locale });
    if (result.ok) {
      setSentTo(member ? accountEmail : address ?? null);
      setPhase("done");
    } else {
      setError(result.error);
      setPhase(member ? "idle" : "form");
    }
  };

  const open = () => {
    if (member) void submit();
    else setPhase("form");
  };

  // The phone's sticky bar asks to open the form: show it and put the cursor in it.
  useEffect(() => {
    if (openRequest === 0) return;
    rootRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (!member) setPhase((current) => (current === "idle" ? "form" : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on each request only
  }, [openRequest]);

  useEffect(() => {
    if (phase === "form") document.getElementById(fieldId)?.focus({ preventScroll: true });
  }, [phase, fieldId]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(email);
  };

  return (
    <div ref={rootRef} className={`grid gap-3 ${className ?? ""}`}>
      {phase === "done" ? (
        <p className="m-0 flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--status-success-bg)] p-4 text-sm text-[var(--text-primary)]">
          <CheckCircle2 size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--status-success-fg)]" />
          <span>{sentTo ? t("product.restock.doneTo", { email: sentTo }) : t("product.restock.done")}</span>
        </p>
      ) : phase === "idle" || (member && phase === "sending") ? (
        <Button variant="primary" size="lg" iconLeft={BellRing} onClick={open} loading={phase === "sending"} fullWidth>
          {t("product.restock.cta")}
        </Button>
      ) : (
        <form onSubmit={onSubmit} noValidate className="grid gap-3">
          <p className="m-0 text-sm text-[var(--text-body)]">{t("product.restock.intro")}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Input
                id={fieldId}
                label={t("product.restock.emailLabel")}
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error === "invalid_email" || undefined}
                aria-describedby={`${fieldId}-note`}
              />
            </div>
            <Button type="submit" variant="primary" size="md" iconLeft={BellRing} loading={phase === "sending"}>
              {t("product.restock.submit")}
            </Button>
          </div>
          <p id={`${fieldId}-note`} className="m-0 text-xs text-[var(--text-muted)]">{t("product.restock.note")}</p>
        </form>
      )}
      <p role="status" aria-live="polite" className={error ? "m-0 text-sm text-[var(--status-error-fg)]" : "sr-only"}>
        {error ? t(`product.restock.errors.${error}`) : ""}
      </p>
    </div>
  );
}
