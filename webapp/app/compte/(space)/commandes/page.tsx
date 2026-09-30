import { zoneScreen } from "../../../_zones/zonePage";
import { OrdersScreen } from "../../../../src/zones/account";

const page = zoneScreen("/compte/commandes", OrdersScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
