import { zoneScreen } from "../../../_zones/zonePage";
import { ReviewsScreen } from "../../../../src/zones/account";

const page = zoneScreen("/compte/avis", ReviewsScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
