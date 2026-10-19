import { loadQuestionnaires } from "../lib/questions.mjs";
import Survey from "./survey";

export const dynamic = "force-dynamic";

export default function Home() {
  const { content, version } = loadQuestionnaires();
  return <Survey content={content} questionnaireVersion={version} privacyContact={process.env.PRIVACY_CONTACT ?? ""} />;
}
