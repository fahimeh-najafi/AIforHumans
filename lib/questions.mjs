import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { OTHER_CHOICE } from "./validation.mjs";

export const QUESTION_COUNT = 12;

// Ids are positions in the markdown; this is the only place that says which position behaves unusually.
const RULES = {
  q08: { kind: "text" },
  q09: { kind: "multiple", min: 0, hasOtherChoice: true },
  q12: { kind: "multiple", min: 2, closing: true },
};

export function parseQuestionnaire(source) {
  source = source.replace(/\r\n/g, "\n");
  const participantText = source.split(/^# (?!#)/m).slice(1, 2).join("");
  const sections = participantText.split(/^## /m);
  const introduction = sections.shift().trim();
  const questions = sections.map((section, index) => {
    const lines = section.trim().replace(/\n---\s*$/, "").split("\n");
    const title = lines.shift().replace(/^[\d۰-۹]+\.\s*/, "");
    const id = `q${String(index + 1).padStart(2, "0")}`;
    const rule = RULES[id];
    const kind = rule?.kind ?? "single";
    const firstOption = kind === "text" ? -1 : lines.findIndex((line) => line.startsWith("- "));
    const options = [];
    let lastOption = firstOption;
    if (firstOption !== -1) {
      for (let lineIndex = firstOption; lineIndex < lines.length; lineIndex += 1) {
        if (lines[lineIndex].startsWith("- ")) {
          options.push({ id: String(options.length + 1), text: lines[lineIndex].slice(2).replace(/^\*\*[^*]+\*\*\s*/, "") });
          lastOption = lineIndex;
        } else if (lines[lineIndex].trim()) {
          break;
        }
      }
    }
    const followup = firstOption === -1 ? "" : lines.slice(lastOption + 1).join("\n").trim();
    const closingPrompts = rule?.closing
      ? followup.split("\n").filter((line) => line.startsWith("> ")).map((line) => line.slice(2))
      : [];
    if (rule?.closing && closingPrompts.length !== 2) throw new Error(`${id} must end with two closing prompts.`);
    if (rule?.hasOtherChoice && !options.some((option) => option.id === OTHER_CHOICE)) throw new Error(`${id} must offer a "something else" option.`);
    return {
      id, title, kind, options,
      prompt: (firstOption === -1 ? lines : lines.slice(0, firstOption)).join("\n").trim(),
      followup: rule?.closing ? "" : followup,
      closingPrompts,
      minChoices: kind === "text" ? 0 : (rule?.min ?? 1),
      maxChoices: kind === "text" ? 0 : kind === "multiple" ? 2 : 1,
    };
  });
  if (questions.length !== QUESTION_COUNT || questions.some((question) => question.kind !== "text" && !question.options.length)) {
    throw new Error(`Expected ${QUESTION_COUNT} participant questions with answer options.`);
  }
  return { introduction, questions };
}

let cached;

export function loadQuestionnaires() {
  if (cached) return cached;
  const loaded = readQuestionnaires();
  if (process.env.NODE_ENV === "production") cached = loaded;
  return loaded;
}

function readQuestionnaires() {
  const english = readFileSync(path.join(process.cwd(), "language-models-workshop-questionnaire.md"), "utf8");
  const persian = readFileSync(path.join(process.cwd(), "language-models-workshop-questionnaire.fa.md"), "utf8");
  const content = { en: parseQuestionnaire(english), fa: parseQuestionnaire(persian) };
  if (content.en.questions.some((question, index) => question.options.length !== content.fa.questions[index].options.length)) {
    throw new Error("English and Persian option counts must match.");
  }
  const version = `v1-${createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 12)}`;
  return { content, version };
}
