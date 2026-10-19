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
