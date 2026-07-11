import { LegalDocument } from "../../src/components/LegalDocument";
import { COMMUNITY_SECTIONS, TERMS_VERSION } from "../../src/legal";

export default function CommunityScreen() {
  return (
    <LegalDocument
      title="Community Guidelines"
      effective={TERMS_VERSION}
      sections={COMMUNITY_SECTIONS}
    />
  );
}
