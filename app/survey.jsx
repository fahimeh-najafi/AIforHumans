"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { validateAnswer, OTHER_CHOICE } from "../lib/validation.mjs";

const labels = {
  en: {
    workshop: "AI FOR HUMANS · BEFORE WE MEET", language: "Language / زبان", firstName: "First name", lastName: "Last name",
    age: "Age", email: "Email", start: "Start questionnaire", next: "Save & continue", back: "Previous", submit: "Submit answers",
    saving: "Saving…", loading: "Loading your questionnaire…", retry: "Try again", question: "Question", of: "of",
    details: "A little about you", detailsHint: "All fields are required. No account needed.", optional: "Optional",
    response: "Your response", own: "Your own consideration", saved: "Answers save when you continue. You can return in this browser for 7 days.",
    consent: "I have read the notice below and agree to my information and answers being stored for workshop planning.",
    privacy: "Your name, age, email, language and answers are stored privately for workshop planning, including unfinished responses. They are not displayed publicly. To request access or deletion, contact:",
    thanks: "Thank you for sharing your perspective.", done: "Your answers have been submitted. You can close this page now.",
    reference: "Your reference", required: "Choose an answer or write your response. For the final question, choose exactly two claims.",
    errors: {
      invalid_profile: "Please check all your details and accept the privacy notice.",
      invalid_answer: "Please check your answer. Choose the requested number of options and fill in any required response.",
      configuration: "The questionnaire is not open yet. Please contact the organizer.",
      expired: "Your session has expired. Refresh the page to start again; previously saved answers remain with the organizer.",
      conflict: "Another tab or an earlier retry saved changes. Latest progress loaded; review your answer and try again.",
      version_changed: "The questionnaire changed since you started. Please contact the organizer before continuing.",
      save_failed: "We couldn’t save or load your response. Check your connection and try again. Keep this page open.",
    },
  },
  fa: {
    workshop: "هوش مصنوعی برای انسان‌ها · پیش از دیدار", language: "زبان / Language", firstName: "نام", lastName: "نام خانوادگی",
    age: "سن", email: "ایمیل", start: "شروع پرسش‌نامه", next: "ذخیره و ادامه", back: "قبلی", submit: "ثبت پاسخ‌ها",
    saving: "در حال ذخیره…", loading: "در حال بارگذاری پرسش‌نامه…", retry: "تلاش دوباره", question: "پرسش", of: "از",
    details: "کمی دربارهٔ شما", detailsHint: "تکمیل همهٔ موارد الزامی است. نیازی به حساب کاربری نیست.", optional: "اختیاری",
    response: "پاسخ شما", own: "معیار پیشنهادی شما", saved: "پاسخ‌ها با زدن دکمهٔ ادامه ذخیره می‌شوند. تا ۷ روز می‌توانید در همین مرورگر برگردید.",
    consent: "توضیح زیر را خوانده‌ام و با ذخیرهٔ اطلاعات و پاسخ‌هایم برای برنامه‌ریزی کارگاه موافقم.",
    privacy: "نام، سن، ایمیل، زبان و پاسخ‌های شما، از جمله پاسخ‌های ناتمام، به‌صورت خصوصی برای برنامه‌ریزی کارگاه ذخیره می‌شوند و نمایش عمومی ندارند. برای درخواست دسترسی یا حذف اطلاعات، با این نشانی تماس بگیرید:",
    thanks: "از اینکه دیدگاهتان را با ما در میان گذاشتید سپاسگزاریم.", done: "پاسخ‌های شما ثبت شد. اکنون می‌توانید این صفحه را ببندید.",
    reference: "شناسهٔ پاسخ شما", required: "گزینه‌ای انتخاب کنید یا پاسخ خود را بنویسید. در پرسش پایانی دقیقاً دو گزاره انتخاب کنید.",
    errors: {
      invalid_profile: "لطفاً اطلاعات را بررسی کنید و توضیح حریم خصوصی را بپذیرید.",
      invalid_answer: "لطفاً پاسخ را بررسی کنید؛ تعداد گزینه‌ها و پاسخ‌های نوشتاری الزامی را کامل کنید.",
      configuration: "پرسش‌نامه هنوز آمادهٔ دریافت پاسخ نیست. با برگزارکننده تماس بگیرید.",
      expired: "مهلت نشست تمام شده است. برای شروع دوباره صفحه را تازه کنید؛ پاسخ‌های ذخیره‌شده نزد برگزارکننده باقی می‌مانند.",
      conflict: "در زبانه‌ای دیگر یا تلاش قبلی تغییری ذخیره شده است. آخرین وضعیت بارگذاری شد؛ پاسخ را بررسی و دوباره تلاش کنید.",
      version_changed: "پرسش‌نامه از زمان شروع شما تغییر کرده است. پیش از ادامه با برگزارکننده تماس بگیرید.",
      save_failed: "ذخیره یا بارگذاری پاسخ ممکن نشد. اتصال را بررسی و دوباره تلاش کنید. این صفحه را باز نگه دارید.",
    },
  },
};

const emptyAnswer = () => ({ choices: [], text: "", followup: "", attraction: "", concern: "" });

async function api(method = "GET", body) {
  const response = await fetch("/api/submission", {
    method, headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(25000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result.submission;
}

export default function Survey({ content, questionnaireVersion, privacyContact }) {
  const [language, setLanguage] = useState("en");
  const [submission, setSubmission] = useState(null);
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef(null);
  const text = labels[language];
  const questions = content[language].questions;
  const question = questions[step];
  const answer = answers[question.id] ?? emptyAnswer();
  const completed = Boolean(submission?.completed_at);
  const versionChanged = Boolean(submission && submission.questionnaire_version !== questionnaireVersion && !completed);

  function restore(saved) {
    setSubmission(saved);
    if (saved) {
      setLanguage(saved.language);
      setAnswers(saved.answers);
      setStep(saved.current_question);
    }
  }

  async function load() {
    setError("");
    try {
      restore(await api());
      setReady(true);
    } catch (failure) {
      setError(failure.message);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "fa" ? "rtl" : "ltr";
  }, [language]);
  useEffect(() => {
    if (ready && submission) heading.current?.focus();
  }, [step, ready, Boolean(submission), completed]);
  useEffect(() => {
    if (!submission || completed || !Object.keys(answers).length) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    const hasUnsaved = Object.entries(answers).some(([id, draft]) => JSON.stringify(draft) !== JSON.stringify(submission.answers[id]));
    if (hasUnsaved) window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [answers, submission, completed]);

  function update(field, value) {
    setAnswers((previous) => ({ ...previous, [question.id]: { ...(previous[question.id] ?? emptyAnswer()), [field]: value } }));
    setError("");
  }

  async function start(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      restore(await api("POST", {
        firstName: form.get("firstName"), lastName: form.get("lastName"), email: form.get("email"),
        age: Number(form.get("age")), language, consent: form.get("consent") === "on", questionnaireVersion,
      }));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function next(event) {
    event.preventDefault();
    if (busy) return;
    try {
      validateAnswer(question, answer);
    } catch {
      setError("invalid_answer");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await api("PATCH", {
        questionId: question.id, answer, nextQuestion: Math.min(step + 1, questions.length - 1),
        complete: step === questions.length - 1, revision: submission.revision,
      });
      setSubmission(saved);
      setAnswers((previous) => ({ ...saved.answers, ...previous, [question.id]: saved.answers[question.id] }));
      setStep(saved.current_question);
    } catch (failure) {
      if (failure.message === "conflict") {
        try {
          const latest = await api();
          if (latest) {
            setSubmission(latest);
            setAnswers({ ...latest.answers, [question.id]: answer });
          }
        } catch {}
      }
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function textarea(field, label, required = false) {
    return <label className="written-response">
      <span>{label}{!required && <small> · {text.optional}</small>}</span>
      <textarea rows={4} maxLength={5000} value={answer[field]} onChange={(event) => update(field, event.target.value)} required={required} />
    </label>;
  }

  const errorMessage = error ? (text.errors[error] ?? text.errors.save_failed) : "";

  return <main className="shell" dir={language === "fa" ? "rtl" : "ltr"}>
    <header className="topbar">
      <span className="brand"><span className="brand-mark" aria-hidden="true">✳</span> AI for Humans</span>
      {!submission && <label className="language-picker">{text.language}
        <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={busy}>
          <option value="en">English</option><option value="fa">فارسی</option>
        </select>
      </label>}
    </header>

    {!ready ? <section className="card status-card" aria-live="polite">
      <p>{error ? errorMessage : text.loading}</p>
      {error && <button type="button" onClick={load}>{text.retry}</button>}
    </section> : completed ? <section className="card thank-you">
      <span className="completion-mark" aria-hidden="true">✓</span>
      <p className="eyebrow">{text.workshop}</p>
      <h1 ref={heading} tabIndex={-1}>{text.thanks}</h1>
      <p>{text.done}</p>
      <p className="reference">{text.reference}: <bdi>{submission.id}</bdi></p>
    </section> : versionChanged ? <section className="card status-card">
      <p role="alert">{text.errors.version_changed}</p><p><bdi>{privacyContact}</bdi></p>
    </section> : !submission ? <>
      <section className="introduction">
        <p className="eyebrow">{text.workshop}</p>
        <Markdown>{`# ${content[language].introduction}`}</Markdown>
      </section>
      <section className="card">
        <h2 ref={heading} tabIndex={-1}>{text.details}</h2>
        <p className="muted">{text.detailsHint}</p>
        <form onSubmit={start}>
          <fieldset disabled={busy}>
            <div className="form-grid">
              <label>{text.firstName}<input name="firstName" autoComplete="given-name" maxLength={100} required /></label>
              <label>{text.lastName}<input name="lastName" autoComplete="family-name" maxLength={100} required /></label>
              <label>{text.age}<input name="age" type="number" inputMode="numeric" min={1} max={120} step={1} required /></label>
              <label>{text.email}<input name="email" type="email" autoComplete="email" maxLength={254} dir="ltr" required /></label>
            </div>
            <div className="privacy-notice"><p>{text.privacy} <bdi>{privacyContact || "—"}</bdi></p></div>
            <label className="consent"><input name="consent" type="checkbox" required /><span>{text.consent}</span></label>
            {error && <p className="error" role="alert">{errorMessage}</p>}
            <button type="submit">{busy ? text.saving : text.start}<span aria-hidden="true">{language === "fa" ? "←" : "→"}</span></button>
          </fieldset>
        </form>
      </section>
    </> : <>
      <div className="progress-heading"><span>{text.question} {new Intl.NumberFormat(language).format(step + 1)} {text.of} {new Intl.NumberFormat(language).format(questions.length)}</span><span>{Math.round(step / questions.length * 100)}%</span></div>
      <progress value={step} max={questions.length} aria-label={`${text.question} ${step + 1} ${text.of} ${questions.length}`} />
      <section className="card question-card">
        <h1 ref={heading} tabIndex={-1}>{question.title}</h1>
        <div className="prose"><Markdown>{question.prompt}</Markdown></div>
        <form onSubmit={next}>
          <fieldset disabled={busy} aria-label={question.title}>
            <legend className="sr-only">{text.response}</legend>
            <div className="options">
              {question.options.map((option) => {
                const selected = answer.choices.includes(option.id);
                const atLimit = question.kind === "multiple" && !selected && answer.choices.length >= question.maxChoices;
                return <label key={option.id} className={`option ${selected ? "selected" : ""}`}>
                  <input type={question.kind === "multiple" ? "checkbox" : "radio"} name={question.id} value={option.id} checked={selected} disabled={atLimit}
                    onChange={() => update("choices", question.kind === "single" ? [option.id] : selected ? answer.choices.filter((choice) => choice !== option.id) : [...answer.choices, option.id])} />
                  <span><Markdown>{option.text}</Markdown></span>
                </label>;
              })}
            </div>
            {question.kind === "text" && textarea("text", text.response, true)}
            {question.id === "q09" && textarea("text", text.own, !answer.choices.length || answer.choices.includes(OTHER_CHOICE))}
            {question.followup && <div className="followup"><Markdown>{question.followup}</Markdown>{textarea("followup", text.response)}</div>}
            {question.closingPrompts.map((prompt, index) => <div key={prompt} className="followup">{textarea(index === 0 ? "attraction" : "concern", prompt)}</div>)}
            {error && <p className="error" role="alert">{errorMessage}</p>}
            <div className="navigation">
              <button type="button" className="secondary" disabled={step === 0} onClick={() => { setStep(step - 1); setError(""); }}>{text.back}</button>
              <button type="submit">{busy ? text.saving : step === questions.length - 1 ? text.submit : text.next}</button>
            </div>
          </fieldset>
        </form>
      </section>
      <p className="save-note">{text.saved}</p>
    </>}
    <footer>AI for Humans <span aria-hidden="true">·</span> {language === "fa" ? "فضایی برای کنجکاوی، نه قضاوت" : "A space for curiosity, not judgment"}</footer>
  </main>;
}
