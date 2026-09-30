import { publicScreen } from "../../../../_public/publicPage";
import { CheckoutReturn } from "../../../../../src/screens/CheckoutReturn";

const page = publicScreen("checkoutReturn", "fr", <CheckoutReturn />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
