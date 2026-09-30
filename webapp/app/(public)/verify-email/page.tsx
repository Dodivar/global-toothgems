import { addressMetadata } from "../../_public/metadata";
import { VerifyEmailScreen } from "../../../src/zones/public";

export const metadata = addressMetadata("/verify-email");

export default function Page() {
  return <VerifyEmailScreen />;
}
