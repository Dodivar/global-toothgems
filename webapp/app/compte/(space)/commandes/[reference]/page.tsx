import { zoneScreen } from "../../../../_zones/zonePage";
import { OrderDetailScreen } from "../../../../../src/zones/account";

const page = zoneScreen(({ reference }) => `/compte/commandes/${reference}`, OrderDetailScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
