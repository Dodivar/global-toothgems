import { addressMetadata } from "../../_public/metadata";
import { VerifyEmailScreen } from "../../../src/zones/public";

export const metadata = addressMetadata("/verifier-email");

export default function Page() {
  return <VerifyEmailScreen />;
}
