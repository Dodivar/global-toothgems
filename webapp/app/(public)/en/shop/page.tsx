import { publicScreen } from "../../../_public/publicPage";
import { ShopScreen } from "../../../../src/zones/public";

const page = publicScreen("shop", "en", ShopScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
