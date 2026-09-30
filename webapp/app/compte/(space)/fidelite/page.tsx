import { zoneScreen } from "../../../_zones/zonePage";
import { LoyaltyScreen } from "../../../../src/zones/account";

const page = zoneScreen("/compte/fidelite", LoyaltyScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
