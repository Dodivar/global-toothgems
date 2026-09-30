import { zoneScreen } from "../../../../_zones/zonePage";
import { ActivityScreen } from "../../../../../src/zones/account";

const page = zoneScreen(({ view }) => `/compte/communaute/activite/${view}`, ActivityScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
