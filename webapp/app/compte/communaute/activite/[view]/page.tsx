import { zoneScreen } from "../../../../_zones/zonePage";
import { Activity } from "../../../../../src/screens/community/Activity";

const page = zoneScreen(({ view }) => `/compte/communaute/activite/${view}`, <Activity />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
