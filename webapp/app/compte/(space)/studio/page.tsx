import { zoneScreen } from "../../../_zones/zonePage";
import { StudioSubscription } from "../../../../src/screens/account/StudioSubscription";

const page = zoneScreen("/compte/studio", <StudioSubscription />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
