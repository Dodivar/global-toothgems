import { zoneScreen } from "../../../_zones/zonePage";
import { NotFound } from "../../../../src/screens/NotFound";

const page = zoneScreen(({ rest }) => `/compte/communaute/${rest}`, <NotFound />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
