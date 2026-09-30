import { zoneScreen } from "../../../_zones/zonePage";
import { ProfileScreen } from "../../../../src/zones/account";

const page = zoneScreen("/compte/profil", ProfileScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
