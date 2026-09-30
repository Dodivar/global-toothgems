import { zoneScreen } from "../../../_zones/zonePage";
import { Loyalty } from "../../../../src/screens/account/Loyalty";

const page = zoneScreen("/compte/fidelite", <Loyalty />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
