import { zoneScreen } from "../../../_zones/zonePage";
import { MembersScreen } from "../../../../src/zones/account";

const page = zoneScreen("/compte/communaute/membres", MembersScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
