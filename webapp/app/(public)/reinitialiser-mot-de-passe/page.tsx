import { addressMetadata } from "../../_public/metadata";
import { ResetPassword } from "../../../src/screens/ResetPassword";
import { BrowserOnly } from "../../../src/zones/BrowserOnly";

export const metadata = addressMetadata("/reinitialiser-mot-de-passe");

export default function Page() {
  return (
    <BrowserOnly>
      <ResetPassword />
    </BrowserOnly>
  );
}
