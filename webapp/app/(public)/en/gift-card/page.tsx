import { publicScreen } from "../../../_public/publicPage";
import { GiftCardScreen } from "../../../../src/zones/public";

const page = publicScreen("giftCard", "en", GiftCardScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
