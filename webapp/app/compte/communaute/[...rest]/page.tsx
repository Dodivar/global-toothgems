import { zoneScreen } from "../../../_zones/zonePage";
import { NotFoundScreen } from "../../../../src/zones/account";

const page = zoneScreen(({ rest }) => `/compte/communaute/${rest}`, NotFoundScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
