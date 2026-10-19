export class InputError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.status = status;
  }
}

export function validateProfile(profile) {
  if (!profile || typeof profile !== "object") throw new InputError("invalid_profile");
  const { firstName, lastName, email, age, language, consent } = profile;
  if (
    typeof firstName !== "string" || !firstName.trim() || firstName.trim().length > 100 ||
    typeof lastName !== "string" || !lastName.trim() || lastName.trim().length > 100 ||
    typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    !Number.isInteger(age) || age < 1 || age > 120 ||
    !["en", "fa"].includes(language) || consent !== true
  ) throw new InputError("invalid_profile");
  return {
    first_name: firstName.trim(), last_name: lastName.trim(),
    email: email.trim().toLowerCase(), age, language,
  };
}

export function validateAnswer(question, answer) {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) throw new InputError("invalid_answer");
  const { choices, text, followup, attraction, concern } = answer;
  if (
    !Array.isArray(choices) || choices.some((choice) => typeof choice !== "string" || !question.options.some((option) => option.id === choice)) ||
    new Set(choices).size !== choices.length || choices.length < question.minChoices || choices.length > question.maxChoices ||
    [text, followup, attraction, concern].some((value) => typeof value !== "string" || value.length > 5000) ||
    (question.kind === "text" && !text.trim()) ||
    (question.id === "q09" && (!choices.length || choices.includes("7")) && !text.trim())
  ) throw new InputError("invalid_answer");
  return {
    choices,
    text: question.kind === "text" || question.id === "q09" ? text.trim() : "",
    followup: question.followup ? followup.trim() : "",
    attraction: question.id === "q12" ? attraction.trim() : "",
    concern: question.id === "q12" ? concern.trim() : "",
  };
}

export function validateCompletion(questions, answers) {
  for (const question of questions) validateAnswer(question, answers[question.id]);
}

export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportCsv(rows, deidentified = false) {
  const columns = ["id", "age", "language", "questionnaire_version", "started_at", "completed_at", "status"];
  if (!deidentified) columns.splice(1, 0, "first_name", "last_name", "email");
  const fields = ["choices", "text", "followup", "attraction", "concern"];
  for (let number = 1; number <= 12; number += 1) {
    for (const field of fields) columns.push(`q${String(number).padStart(2, "0")}_${field}`);
  }
  const values = rows.map((row) => columns.map((column) => {
    if (column === "status") return row.completed_at ? "completed" : "in_progress";
    const match = /^(q\d{2})_(.+)$/.exec(column);
    const value = match ? row.answers?.[match[1]]?.[match[2]] : row[column];
    return Array.isArray(value) ? value.join("|") : value;
  }));
  return `\uFEFF${[columns, ...values].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
