import { zoneScreen } from "../../../_zones/zonePage";
import { Profile } from "../../../../src/screens/account/Profile";

const page = zoneScreen("/compte/profil", <Profile />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
