import { publicScreen } from "../../../_public/publicPage";
import { ShopAlt } from "../../../../src/screens/ShopAlt";

const page = publicScreen("shop", "fr", <ShopAlt />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
