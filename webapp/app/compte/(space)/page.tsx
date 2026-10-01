import { zoneScreen } from "../../_zones/zonePage";
import { Dashboard } from "../../../src/screens/account/Dashboard";

const page = zoneScreen("/compte", <Dashboard />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
