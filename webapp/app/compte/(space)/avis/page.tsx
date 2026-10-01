import { zoneScreen } from "../../../_zones/zonePage";
import { Reviews } from "../../../../src/screens/account/Reviews";

const page = zoneScreen("/compte/avis", <Reviews />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
