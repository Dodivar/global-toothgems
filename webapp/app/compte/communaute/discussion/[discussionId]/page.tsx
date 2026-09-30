import { zoneScreen } from "../../../../_zones/zonePage";
import { Discussion } from "../../../../../src/screens/community/Discussion";

const page = zoneScreen(({ discussionId }) => `/compte/communaute/discussion/${discussionId}`, <Discussion />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
