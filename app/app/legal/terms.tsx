import { LegalDocument } from "../../src/components/LegalDocument";
import { TERMS_SECTIONS, TERMS_VERSION } from "../../src/legal";

export default function TermsScreen() {
  return <LegalDocument title="Terms of Use" effective={TERMS_VERSION} sections={TERMS_SECTIONS} />;
}
