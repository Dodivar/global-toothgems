import { publicScreen } from "../../../../_public/publicPage";
import { CheckoutReturnScreen } from "../../../../../src/zones/public";

const page = publicScreen("checkoutReturn", "en", CheckoutReturnScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
