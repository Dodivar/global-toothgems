import { zoneScreen } from "../../../_zones/zonePage";
import { Guidelines } from "../../../../src/screens/community/Guidelines";

const page = zoneScreen("/compte/communaute/charte", <Guidelines />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
