import { zoneScreen } from "../../../_zones/zonePage";
import { Members } from "../../../../src/screens/community/Members";

const page = zoneScreen("/compte/communaute/membres", <Members />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
