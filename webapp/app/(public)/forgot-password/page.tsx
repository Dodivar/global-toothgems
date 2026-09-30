import { addressMetadata } from "../../_public/metadata";
import { ForgotPasswordScreen } from "../../../src/zones/public";

export const metadata = addressMetadata("/forgot-password");

export default function Page() {
  return <ForgotPasswordScreen />;
}
