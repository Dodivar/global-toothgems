import { zoneScreen } from "../../../../_zones/zonePage";
import { DiscussionScreen } from "../../../../../src/zones/account";

const page = zoneScreen(({ discussionId }) => `/compte/communaute/discussion/${discussionId}`, DiscussionScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
