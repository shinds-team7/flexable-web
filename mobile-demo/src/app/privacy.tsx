import { LegalPage } from "@/real/service/LegalPage";
import { privacyBody } from "@/real/service/legal";
export default function Privacy() {
  return <LegalPage title="개인정보처리방침" body={privacyBody} />;
}
