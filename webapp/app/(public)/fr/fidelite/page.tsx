import { publicScreen } from "../../../_public/publicPage";
import { LoyaltyScreen } from "../../../../src/zones/public";

const page = publicScreen("loyalty", "fr", LoyaltyScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
