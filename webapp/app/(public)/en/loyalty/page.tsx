import { publicScreen } from "../../../_public/publicPage";
import { LoyaltyScreen } from "../../../../src/zones/public";

const page = publicScreen("loyalty", "en", LoyaltyScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
