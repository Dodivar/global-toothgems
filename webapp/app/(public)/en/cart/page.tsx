import { publicScreen } from "../../../_public/publicPage";
import { Cart } from "../../../../src/screens/Cart";

const page = publicScreen("cart", "en", <Cart />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
