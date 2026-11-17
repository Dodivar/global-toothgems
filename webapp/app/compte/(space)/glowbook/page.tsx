import { zoneScreen } from "../../../_zones/zonePage";
import { GlowbookSpaceScreen } from "../../../../src/zones/glowbookSpace";

const page = zoneScreen("/compte/glowbook", <GlowbookSpaceScreen />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
