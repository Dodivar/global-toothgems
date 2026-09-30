import { publicScreen } from "../../../_public/publicPage";
import { CartScreen } from "../../../../src/zones/public";

const page = publicScreen("cart", "fr", CartScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
