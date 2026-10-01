import { addressMetadata } from "../../_public/metadata";
import { ForgotPassword } from "../../../src/screens/ForgotPassword";
import { BrowserOnly } from "../../../src/zones/BrowserOnly";

export const metadata = addressMetadata("/forgot-password");

export default function Page() {
  return (
    <BrowserOnly>
      <ForgotPassword />
    </BrowserOnly>
  );
}
