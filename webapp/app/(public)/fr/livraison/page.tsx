import { publicScreen } from "../../../_public/publicPage";
import { ShippingScreen } from "../../../../src/zones/public";

const page = publicScreen("shipping", "fr", ShippingScreen);
export const generateMetadata = page.generateMetadata;
export default page.Page;
