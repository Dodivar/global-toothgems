import { zoneScreen } from "../../../_zones/zonePage";
import { Security } from "../../../../src/screens/account/Security";

const page = zoneScreen("/compte/securite", <Security />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
