import { zoneScreen } from "../../../_zones/zonePage";
import { LoungeModeration } from "../../../../src/screens/account/LoungeModeration";

const page = zoneScreen("/compte/moderation", <LoungeModeration />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
