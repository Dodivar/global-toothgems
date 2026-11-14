import { zoneScreen } from "../../../_zones/zonePage";
import { Bookings } from "../../../../src/screens/account/Bookings";

const page = zoneScreen("/compte/rendez-vous", <Bookings />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
