import { publicScreen } from "../../../_public/publicPage";
import { ReturnsPage } from "../../../_public/storePages";

const page = publicScreen("returns", "en", <ReturnsPage />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
