import { zoneScreen } from "../../_zones/zonePage";
import { StudioCheckout } from "../../../src/screens/StudioCheckout";

/** The Studio subscription's checkout (`studioCheckoutPath`): signed-in members only, then the editor. */
const page = zoneScreen("/studio-3d/paiement", <StudioCheckout />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
