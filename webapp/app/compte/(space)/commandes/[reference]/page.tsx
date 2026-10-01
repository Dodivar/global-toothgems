import { zoneScreen } from "../../../../_zones/zonePage";
import { OrderDetail } from "../../../../../src/screens/account/OrderDetail";

const page = zoneScreen(({ reference }) => `/compte/commandes/${reference}`, <OrderDetail />);
export const generateMetadata = page.generateMetadata;
export default page.Page;
