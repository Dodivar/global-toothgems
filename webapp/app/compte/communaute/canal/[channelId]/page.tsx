import { zoneScreen } from "../../../../_zones/zonePage";
import { ChannelScreen } from "../../../../../src/zones/account";

const page = zoneScreen(({ channelId }) => `/compte/communaute/canal/${channelId}`, ChannelScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
