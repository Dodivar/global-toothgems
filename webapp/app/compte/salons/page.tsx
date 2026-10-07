import { zoneScreen } from "../../_zones/zonePage";
import { MembersLounge } from "../../../src/screens/communityChat/MembersLounge";

/** The Members' Lounge: the community's chat, beside the Artist Community's feed. */
const page = zoneScreen("/compte/salons", <MembersLounge />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
