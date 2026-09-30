import { zoneScreen } from "../../../_zones/zonePage";
import { SecurityScreen } from "../../../../src/zones/account";

const page = zoneScreen("/compte/securite", SecurityScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
