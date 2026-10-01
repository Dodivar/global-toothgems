import { publicScreen } from "../../../_public/publicPage";
import { Academy } from "../../../../src/screens/Academy";

const page = publicScreen("academy", "fr", <Academy />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
