import { zoneScreen } from "../../../_zones/zonePage";
import { Agenda } from "../../../../src/screens/account/Agenda";

const page = zoneScreen("/compte/agenda", <Agenda />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
