import { LegalPage } from "@/real/service/LegalPage";
import { termsBody } from "@/real/service/legal";
export default function Terms() {
  return <LegalPage title="서비스 이용약관" body={termsBody} />;
}
