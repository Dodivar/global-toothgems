import { zoneScreen } from "../../../_zones/zonePage";
import { GuidelinesScreen } from "../../../../src/zones/account";

const page = zoneScreen("/compte/communaute/charte", GuidelinesScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
