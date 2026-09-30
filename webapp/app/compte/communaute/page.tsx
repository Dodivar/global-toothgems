import { zoneScreen } from "../../_zones/zonePage";
import { CommunityHomeScreen } from "../../../src/zones/account";

const page = zoneScreen("/compte/communaute", CommunityHomeScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
