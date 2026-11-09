import { publicScreen } from "../../../_public/publicPage";
import { ShippingPage } from "../../../_public/storePages";

const page = publicScreen("shipping", "fr", <ShippingPage />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
