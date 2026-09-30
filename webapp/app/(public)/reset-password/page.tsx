import { addressMetadata } from "../../_public/metadata";
import { ResetPasswordScreen } from "../../../src/zones/public";

export const metadata = addressMetadata("/reset-password");

export default function Page() {
  return <ResetPasswordScreen />;
}
