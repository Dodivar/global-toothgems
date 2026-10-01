import { addressMetadata } from "../../_public/metadata";
import { VerifyEmailLanding } from "../../../src/screens/VerifyEmailLanding";
import { BrowserOnly } from "../../../src/zones/BrowserOnly";

export const metadata = addressMetadata("/verify-email");

export default function Page() {
  return (
    <BrowserOnly>
      <VerifyEmailLanding />
    </BrowserOnly>
  );
}
