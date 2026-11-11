import { publicScreen } from "../../../../_public/publicPage";
import { OrderWithdrawalGuest } from "../../../../../src/screens/OrderWithdrawalGuest";

const page = publicScreen("withdrawal", "fr", <OrderWithdrawalGuest />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
