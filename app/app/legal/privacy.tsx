import { LegalDocument } from "../../src/components/LegalDocument";
import { PRIVACY_SECTIONS, TERMS_VERSION } from "../../src/legal";

export default function PrivacyScreen() {
  return <LegalDocument title="Privacy Policy" effective={TERMS_VERSION} sections={PRIVACY_SECTIONS} />;
}
