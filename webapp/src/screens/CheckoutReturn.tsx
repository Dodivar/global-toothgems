"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, CircleAlert, Clock } from "lucide-react";
import { useNavigate, useSearchParams } from "../lib/navigation";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { useCart } from "../lib/cart";
import { LEARN_BASE } from "../lib/academyUrl";
import { hasCourse } from "../lib/checkout/cartLines";
import { useProgress } from "../lib/progress";
import { fetchCheckoutStatus, isCheckoutSessionId, type CheckoutStatus } from "../lib/checkout/api";
import { isSupabaseConfigured } from "../lib/supabase/client";
import { useHydrated } from "../lib/useHydrated";
import { useLoyalty } from "../lib/loyalty";
import { useOrders } from "../lib/orders";

/**
 * Where Stripe sends the customer back (`/fr/panier/confirmation?session_id=cs_…`).
 *
 * It only READS the order's state: the payment is confirmed by the verified
 * webhook, never by reaching this address. While the webhook has not arrived
 * the page says so and checks again for a while.
 */

const POLL_MS = 2500;
const POLL_LIMIT = 24; // about a minute

type View =
  | { kind: "checking" }
  | { kind: "slow" }
  | { kind: "invalid" }
  | { kind: "error" }
  /** `course`: the basket being paid held a course (noted before it is emptied). */
  | { kind: "done"; status: CheckoutStatus; course: boolean };

export function CheckoutReturn() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { lines, clearCart } = useCart();
  const { reload: reloadCourses } = useProgress();
  const { reload: reloadLoyalty } = useLoyalty();
  const { reload: reloadOrders } = useOrders();
  // The basket as it is now, read when the order's state arrives.
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  const hydrated = useHydrated();
  const sessionId = params.get("session_id");
  const validLink = isSupabaseConfigured && isCheckoutSessionId(sessionId);
  const [polled, setView] = useState<View>({ kind: "checking" });
  // Decided from the address alone, once hydrated (the server renders "checking").
  const view: View = hydrated && !validLink ? { kind: "invalid" } : polled;
  const [attempt, setAttempt] = useState(0);
  const cleared = useRef(false);

  useEffect(() => {
    if (!hydrated || !isCheckoutSessionId(sessionId) || !isSupabaseConfigured) return;
    let active = true;
    let timer: number | undefined;
    let polls = 0;
    const check = () => {
      fetchCheckoutStatus(sessionId)
        .then((status) => {
          if (!active) return;
          if (status && status.state !== "pending") {
            setView({ kind: "done", status, course: hasCourse(linesRef.current) });
            return;
          }
          polls += 1;
          if (polls >= POLL_LIMIT) {
            setView({ kind: "slow" });
            return;
          }
          timer = window.setTimeout(check, POLL_MS);
        })
        .catch((error: unknown) => {
          console.error("[checkout] status", error instanceof Error ? error.message : error);
          if (active) setView({ kind: "error" });
        });
    };
    check();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [hydrated, sessionId, attempt]);

  // The basket became a paid order: it is emptied once, on the database's word.
  const paid = view.kind === "done" && view.status.state === "paid";
  const boughtCourse = paid && view.course;
  useEffect(() => {
    if (paid && !cleared.current) {
      cleared.current = true;
      // The webhook has granted access by now: read the member's courses again.
      if (boughtCourse) reloadCourses();
      // The stamp (or the spent reward) was settled by the same webhook.
      reloadLoyalty();
      // The order was marked paid by the same webhook: the history read earlier lacks it.
      reloadOrders();
      clearCart();
    }
  }, [paid, boughtCourse, clearCart, reloadCourses, reloadLoyalty, reloadOrders]);

  const retry = () => {
    setView({ kind: "checking" });
    setAttempt((n) => n + 1);
  };

  let content;
  if (view.kind === "done" && view.status.state === "paid") {
    content = (
      <>
        <Badge tone="success" icon={CheckCircle2}>{t("cart.confirmedBadge")}</Badge>
        <span className="gt-accent text-[clamp(28px,4vw,40px)] leading-none text-[var(--gt-blue-600)]">{t("cart.confirmedScript")}</span>
        <h1 className="text-[length:var(--text-h1)]">{t("cart.confirmedTitle")}</h1>
        <p className="m-0 max-w-[480px] text-[length:var(--text-body-md)] text-[var(--text-body)]">
          {t("checkout.paidBody")}
          {boughtCourse && ` ${t("checkout.course.paidBody")}`}
        </p>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("checkout.reference", { reference: view.status.orderNumber })}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {boughtCourse ? (
            <Button variant="primary" onClick={() => navigate(LEARN_BASE)}>{t("checkout.course.openCourses")}</Button>
          ) : (
            <Button variant="primary" onClick={() => navigate("/compte/commandes")}>{t("cart.confirmedOpenAccount")}</Button>
          )}
          <Button variant="outline" onClick={() => navigate("/boutique")}>{t("cart.confirmedContinueShopping")}</Button>
        </div>
      </>
    );
  } else if (view.kind === "done") {
    content = (
      <>
        <Badge tone="warning" icon={CircleAlert}>{t("checkout.notPaidBadge")}</Badge>
        <h1 className="text-[length:var(--text-h2)]">{t("checkout.notPaidTitle")}</h1>
        <p className="m-0 max-w-[480px] text-[var(--text-body)]">{t("checkout.notPaidBody")}</p>
        <Button variant="primary" onClick={() => navigate("/panier")}>{t("checkout.backToCart")}</Button>
      </>
    );
  } else if (view.kind === "invalid") {
    content = (
      <>
        <h1 className="text-[length:var(--text-h2)]">{t("checkout.invalidTitle")}</h1>
        <p className="m-0 max-w-[480px] text-[var(--text-body)]">{t("checkout.invalidBody")}</p>
        <Button variant="primary" onClick={() => navigate("/panier")}>{t("checkout.backToCart")}</Button>
      </>
    );
  } else if (view.kind === "slow" || view.kind === "error") {
    content = (
      <>
        <Badge tone="warning" icon={Clock}>{t("checkout.pendingBadge")}</Badge>
        <h1 className="text-[length:var(--text-h2)]">{t("checkout.pendingTitle")}</h1>
        <p role="status" className="m-0 max-w-[480px] text-[var(--text-body)]">
          {view.kind === "slow" ? t("checkout.slowBody") : t("checkout.statusError")}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="primary" onClick={retry}>{t("checkout.checkAgain")}</Button>
          {/* A bank redirect that failed leaves the order unpaid: the basket is still there. */}
          <Button variant="outline" onClick={() => navigate("/panier")}>{t("checkout.backToCart")}</Button>
        </div>
      </>
    );
  } else {
    content = (
      <>
        <Badge tone="brand" icon={Clock}>{t("checkout.pendingBadge")}</Badge>
        <h1 className="text-[length:var(--text-h2)]">{t("checkout.pendingTitle")}</h1>
        <p role="status" className="m-0 max-w-[480px] text-[var(--text-body)]">{t("checkout.pendingBody")}</p>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-[680px] px-[clamp(14px,4vw,48px)] py-[clamp(56px,8vw,96px)] text-center">
      <div className="grid justify-items-center gap-5" aria-live="polite">{content}</div>
    </div>
  );
}
