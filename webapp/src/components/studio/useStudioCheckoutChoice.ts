import { trackStudio } from "../../lib/studioAnalytics";
import { useNavigate } from "../../lib/navigation";
import { useAuth } from "../../lib/auth";
import { RETURN_PARAM, SIGN_IN_PATH } from "../../lib/authRoutes";
import { studioCheckoutPath, type StudioCheckoutSurface } from "../../lib/studioUrl";
import type { ChooseStudioPlan } from "./StudioPlans";

/**
 * What a plan button does on a public page: the checkout page of that plan,
 * through the sign-in page for a visitor (the subscription belongs to an
 * account). Shared by the plan cards and the Atelier page's own offer.
 */
export function useStudioCheckoutChoice(surface: StudioCheckoutSurface): ChooseStudioPlan {
  const navigate = useNavigate();
  const { signedIn } = useAuth();
  return (plan, interval, price) => {
    const checkout = studioCheckoutPath({ plan, interval, surface });
    if (!signedIn) {
      navigate(`${SIGN_IN_PATH}?${new URLSearchParams({ [RETURN_PARAM]: checkout })}`);
      return;
    }
    trackStudio("studio_subscription_cta_clicked", {
      plan_id: plan,
      interval,
      price_minor: price?.amountMinor ?? null,
      currency: price?.currency ?? null,
      surface,
      checkout_available: true,
    });
    navigate(checkout);
  };
}
