import { zoneScreen } from "../../../_zones/zonePage";
import { Orders } from "../../../../src/screens/account/Orders";

const page = zoneScreen("/compte/commandes", <Orders />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
