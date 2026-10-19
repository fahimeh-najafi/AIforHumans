import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadQuestionnaires, parseQuestionnaire } from "../lib/questions.mjs";
import { validateProfile, validateAnswer, validateCompletion, csvCell, exportCsv } from "../lib/validation.mjs";

const { content, version } = loadQuestionnaires();
const blank = () => ({ choices: [], text: "", followup: "", attraction: "", concern: "" });
const profile = { firstName: "  Sara ", lastName: " Example ", email: "SARA@Example.com", age: 28, language: "fa", consent: true };

test("both languages have twelve aligned questions and no facilitator guide", () => {
  assert.match(version, /^v1-[a-f0-9]{12}$/);
  assert.deepEqual(content.en.questions.map((question) => question.options.length), [5, 5, 5, 5, 5, 5, 5, 0, 7, 5, 4, 7]);
  for (const language of ["en", "fa"]) {
    const questionnaire = content[language];
    assert.equal(questionnaire.questions.length, 12);
    assert.equal(questionnaire.questions[7].kind, "text");
    assert.match(questionnaire.questions[7].prompt, /\n- /);
    assert.equal(questionnaire.questions[11].closingPrompts.length, 2);
    assert.ok(questionnaire.questions[2].followup);
    assert.ok(questionnaire.questions[4].followup);
    assert.equal(questionnaire.questions[0].options[0].id, "1");
    assert.doesNotMatch(JSON.stringify(questionnaire), /Facilitator|راهنمای برگزارکننده|1: B/);
    assert.ok(!questionnaire.questions[0].options[0].text.startsWith("**"));
  }
});

test("content is unchanged by Windows versus Unix line endings", () => {
  const source = readFileSync("language-models-workshop-questionnaire.md", "utf8").replace(/\r\n/g, "\n");
  assert.deepEqual(parseQuestionnaire(source), parseQuestionnaire(source.replaceAll("\n", "\r\n")));
});

test("profile normalizes data and requires the agreed fields and consent", () => {
  assert.deepEqual(validateProfile(profile), { first_name: "Sara", last_name: "Example", email: "sara@example.com", age: 28, language: "fa" });
  for (const change of [{ firstName: " " }, { lastName: "" }, { age: 0 }, { age: 121 }, { age: 20.5 }, { age: "28" }, { email: "not-an-email" }, { consent: false }, { language: "de" }]) {
    assert.throws(() => validateProfile({ ...profile, ...change }), /invalid_profile/);
  }
});

test("single choices reject empty, duplicate, unknown and multiple options", () => {
  const question = content.en.questions[0];
  assert.deepEqual(validateAnswer(question, { ...blank(), choices: ["1"], text: "discard irrelevant data" }), { ...blank(), choices: ["1"] });
  for (const choices of [[], ["0"], ["1", "2"], ["1", "1"], [1]]) {
    assert.throws(() => validateAnswer(question, { ...blank(), choices }), /invalid_answer/);
  }
  assert.throws(() => validateAnswer(question, { ...blank(), choices: ["1"], followup: "x".repeat(5001) }), /invalid_answer/);
  assert.throws(() => validateAnswer(question, null), /invalid_answer/);
});

test("rain requires a written response and authorship supports an own consideration", () => {
  assert.throws(() => validateAnswer(content.en.questions[7], blank()), /invalid_answer/);
  assert.equal(validateAnswer(content.en.questions[7], { ...blank(), text: " Not sure " }).text, "Not sure");
  const question = content.en.questions[8];
  assert.throws(() => validateAnswer(question, blank()), /invalid_answer/);
  assert.throws(() => validateAnswer(question, { ...blank(), choices: ["7"] }), /invalid_answer/);
  assert.equal(validateAnswer(question, { ...blank(), text: "A different criterion" }).text, "A different criterion");
  assert.equal(validateAnswer(question, { ...blank(), choices: ["1", "2"] }).choices.length, 2);
  assert.throws(() => validateAnswer(question, { ...blank(), choices: ["1", "2", "3"] }), /invalid_answer/);
});

test("completion requires all questions, exactly two final claims, and preserves closing text", () => {
  const answers = Object.fromEntries(content.en.questions.map((question) => [question.id, {
    ...blank(), choices: question.kind === "text" ? [] : question.id === "q12" ? ["1", "2"] : ["1"],
    text: question.kind === "text" ? "Not sure" : "",
  }]));
  assert.doesNotThrow(() => validateCompletion(content.en.questions, answers));
  assert.throws(() => validateCompletion(content.en.questions, { ...answers, q01: undefined }), /invalid_answer/);
  assert.throws(() => validateAnswer(content.en.questions[11], { ...blank(), choices: ["1"] }), /invalid_answer/);
  assert.equal(validateAnswer(content.en.questions[11], { ...blank(), choices: ["1", "2"], concern: " Responsibility " }).concern, "Responsibility");
});

test("CSV quotes multiline Unicode and neutralizes spreadsheet formulas", () => {
  assert.equal(csvCell('سلام, "hello"\nworld'), '"سلام, ""hello""\nworld"');
  for (const value of ["=SUM(1,2)", "+1", "-1", "@command", "  =formula", "\ttext", "\rtext"]) {
    assert.ok(csvCell(value).startsWith('"\''));
  }
  const row = { id: "example", first_name: "Private", last_name: "Person", email: "private@example.com", age: 28, language: "fa", answers: { q12: { choices: ["1", "2"], concern: "سلام" } } };
  const full = exportCsv([row]);
  assert.ok(full.startsWith("\uFEFF"));
  assert.match(full, /"in_progress"/);
  assert.match(full, /"1\|2"/);
  assert.match(full, /سلام/);
  const reduced = exportCsv([row], true);
  assert.doesNotMatch(reduced, /Private|Person|private@example.com|first_name|last_name|email/);
  assert.match(reduced, /"age"/);
});
