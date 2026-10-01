import { zoneScreen } from "../../../../_zones/zonePage";
import { Channel } from "../../../../../src/screens/community/Channel";

const page = zoneScreen(({ channelId }) => `/compte/communaute/canal/${channelId}`, <Channel />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
