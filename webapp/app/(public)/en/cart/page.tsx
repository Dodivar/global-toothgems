import { publicScreen } from "../../../_public/publicPage";
import { CartScreen } from "../../../../src/zones/public";

const page = publicScreen("cart", "en", CartScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
