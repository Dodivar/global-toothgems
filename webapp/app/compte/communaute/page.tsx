import { zoneScreen } from "../../_zones/zonePage";
import { CommunityHome } from "../../../src/screens/community/CommunityHome";

const page = zoneScreen("/compte/communaute", <CommunityHome />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
