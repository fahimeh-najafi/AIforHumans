import { loadQuestionnaires } from "../../../lib/questions.mjs";
import { InputError, validateProfile, validateAnswer, validateCompletion } from "../../../lib/validation.mjs";
import { database, getSubmission, setSession, newToken, hashToken, publicSubmission, readBody, json, failure } from "../../../lib/server.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ submission: publicSubmission(await getSubmission()) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    const existing = await getSubmission();
    if (existing) return json({ submission: publicSubmission(existing) });
    if (!process.env.PRIVACY_CONTACT) throw new InputError("configuration", 503);
    const profile = validateProfile(body);
    const { version } = loadQuestionnaires();
    if (body.questionnaireVersion !== version) throw new InputError("version_changed", 409);
    const token = newToken();
    const rows = await database("", {
      method: "POST",
      body: JSON.stringify({ ...profile, session_hash: hashToken(token), questionnaire_version: version }),
    });
    await setSession(token);
    return json({ submission: publicSubmission(rows[0]) }, 201);
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request) {
  try {
    const body = await readBody(request);
    const submission = await getSubmission();
    if (!submission) throw new InputError("expired", 401);
    if (submission.completed_at) return json({ submission: publicSubmission(submission) });
    const { content, version } = loadQuestionnaires();
    if (submission.questionnaire_version !== version) throw new InputError("version_changed", 409);
    if (body.revision !== submission.revision) throw new InputError("conflict", 409);
    const questions = content[submission.language].questions;
    const question = questions.find((entry) => entry.id === body.questionId);
    if (!question || !Number.isInteger(body.nextQuestion) || body.nextQuestion < 0 || body.nextQuestion >= questions.length || typeof body.complete !== "boolean") {
      throw new InputError("invalid_request");
    }
    const answers = { ...submission.answers, [question.id]: validateAnswer(question, body.answer) };
    if (body.complete) validateCompletion(questions, answers);
    const rows = await database(`?id=eq.${submission.id}&revision=eq.${submission.revision}&completed_at=is.null`, {
      method: "PATCH",
      body: JSON.stringify({
        answers, current_question: body.nextQuestion, revision: submission.revision + 1,
        completed_at: body.complete ? new Date().toISOString() : null,
      }),
    });
    if (!rows.length) throw new InputError("conflict", 409);
    return json({ submission: publicSubmission(rows[0]) });
  } catch (error) {
    return failure(error);
  }
}
