import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export function parseQuestionnaire(source) {
  source = source.replace(/\r\n/g, "\n");
  const participantText = source.split(/^# (?!#)/m).slice(1, 2).join("");
  const sections = participantText.split(/^## /m);
  const introduction = sections.shift().trim();
  const questions = sections.map((section, index) => {
    const lines = section.trim().replace(/\n---\s*$/, "").split("\n");
    const title = lines.shift().replace(/^[\d۰-۹]+\.\s*/, "");
    const id = `q${String(index + 1).padStart(2, "0")}`;
    const kind = index === 7 ? "text" : [8, 11].includes(index) ? "multiple" : "single";
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
    const closingPrompts = index === 11
      ? followup.split("\n").filter((line) => line.startsWith("> ")).map((line) => line.slice(2))
      : [];
    return {
      id, title, kind, options,
      prompt: (firstOption === -1 ? lines : lines.slice(0, firstOption)).join("\n").trim(),
      followup: index === 11 ? "" : followup,
      closingPrompts,
      minChoices: kind === "text" ? 0 : index === 8 ? 0 : index === 11 ? 2 : 1,
      maxChoices: kind === "text" ? 0 : kind === "multiple" ? 2 : 1,
    };
  });
  if (questions.length !== 12 || questions.some((question) => question.kind !== "text" && !question.options.length)) {
    throw new Error("Expected twelve participant questions with answer options.");
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
