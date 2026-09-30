import { publicScreen } from "../../../_public/publicPage";
import { Academy } from "../../../../src/screens/Academy";

const page = publicScreen("academy", "en", <Academy />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
