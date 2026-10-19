import { database, isAdmin } from "../../lib/server.mjs";
import { exportCsv } from "../../lib/validation.mjs";
import { loadQuestionnaires } from "../../lib/questions.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const select = "id,first_name,last_name,age,email,language,questionnaire_version,answers,current_question,started_at,completed_at";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

function html(content, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Workshop responses</title><style>
    body{font:16px/1.6 system-ui,sans-serif;color:#263c39;background:#f6f5ef;margin:0;padding:32px}main{max-width:1100px;margin:auto}a{color:#225d50}h1{font-weight:600}nav{display:flex;gap:20px;flex-wrap:wrap;margin:24px 0}table{width:100%;border-collapse:collapse;background:white}th,td{text-align:start;padding:12px;border-bottom:1px solid #dce3dc}small{color:#647570}.table-wrap{overflow:auto}article{background:white;border:1px solid #dce3dc;padding:24px;margin:20px 0;border-radius:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}dd{overflow-wrap:anywhere}button{font:inherit} @media(max-width:600px){body{padding:16px}}
  </style></head><body><main>${content}</main></body></html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" },
  });
}

async function csvResponse(filter, deidentified) {
  const snapshot = encodeURIComponent(new Date().toISOString());
  const query = `?select=${select}&order=started_at.asc,id.asc&started_at=lte.${snapshot}${filter}&limit=500`;
  let rows = await database(`${query}&offset=0`);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let offset = 0;
      const header = exportCsv([], deidentified);
      controller.enqueue(encoder.encode(header));
      try {
        while (rows.length) {
          controller.enqueue(encoder.encode(exportCsv(rows, deidentified).slice(header.length)));
          offset += rows.length;
          if (rows.length < 500) break;
          rows = await database(`${query}&offset=${offset}`);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="workshop-responses${deidentified ? "-without-contact-details" : ""}.csv"`,
  } });
}

export async function GET(request) {
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16) return html("<h1>Admin is not configured</h1><p>Set a random ADMIN_PASSWORD of at least 16 characters on the server.</p>", 503);
  if (!isAdmin(request)) return new Response("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Workshop admin", charset="UTF-8"', "Cache-Control": "no-store" } });
  try {
    const params = new URL(request.url).searchParams;
    const status = ["completed", "in_progress"].includes(params.get("status")) ? params.get("status") : "all";
    const filter = status === "completed" ? "&completed_at=not.is.null" : status === "in_progress" ? "&completed_at=is.null" : "";
    if (params.get("format") === "csv") return await csvResponse(filter, params.get("deidentified") === "1");
    const id = params.get("id");
    if (id) {
      if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id)) return html("<h1>Not found</h1>", 404);
      const [row] = await database(`?select=${select}&id=eq.${id}&limit=1`);
      if (!row) return html("<h1>Not found</h1>", 404);
      const { content, version } = loadQuestionnaires();
      const sameVersion = version === row.questionnaire_version;
      const answers = Object.entries(row.answers).map(([questionId, answer]) => {
        const question = sameVersion ? content[row.language].questions.find((entry) => entry.id === questionId) : null;
        const choices = answer.choices.map((choice) => question?.options.find((option) => option.id === choice)?.text ?? `Option ${choice}`);
        return `<article dir="${row.language === "fa" ? "rtl" : "ltr"}"><h2>${escape(questionId)} · ${escape(question?.title ?? "Saved answer")}</h2><ul>${choices.map((choice) => `<li>${escape(choice)}</li>`).join("")}</ul>${["text", "followup", "attraction", "concern"].filter((field) => answer[field]).map((field) => `<h3>${escape(field)}</h3><pre>${escape(answer[field])}</pre>`).join("")}</article>`;
      }).join("");
      return html(`<a href="/admin">← All responses</a><h1>${escape(row.first_name)} ${escape(row.last_name)}</h1><p>${escape(row.email)} · Age ${escape(row.age)} · ${escape(row.language)}</p><p>${row.completed_at ? "Completed" : "In progress"} · Started ${escape(row.started_at)}${row.completed_at ? ` · Completed ${escape(row.completed_at)}` : ""}</p><small>Reference: ${escape(row.id)} · Version: ${escape(row.questionnaire_version)}</small>${sameVersion ? "" : "<p>Older questionnaire version: displaying saved option IDs rather than potentially incorrect current labels.</p>"}${answers || "<p>No answers saved yet.</p>"}`);
    }
    const page = Math.min(20000, Math.max(0, Number.parseInt(params.get("page") ?? "0", 10) || 0));
    const rows = await database(`?select=${select}&order=started_at.desc,id.desc${filter}&limit=50&offset=${page * 50}`);
    const table = rows.map((row) => `<tr><td><a href="/admin?id=${escape(row.id)}">${escape(row.first_name)} ${escape(row.last_name)}</a></td><td>${escape(row.email)}</td><td>${escape(row.age)}</td><td>${escape(row.language)}</td><td>${row.completed_at ? "Completed" : `${Object.keys(row.answers).length}/12 saved`}</td><td>${escape(row.started_at)}</td></tr>`).join("");
    return html(`<h1>Workshop responses</h1><p>Private organizer area · ${escape(status.replaceAll("_", " "))} · page ${page + 1}</p><nav><a href="/admin">All</a><a href="/admin?status=completed">Completed</a><a href="/admin?status=in_progress">In progress</a></nav><nav><a href="/admin?format=csv&amp;status=${status}">Download CSV</a><a href="/admin?format=csv&amp;deidentified=1&amp;status=${status}">CSV without names and emails</a></nav><small>Exports include all matching pages. Free-text answers can still contain identifying information.</small><div class="table-wrap"><table><thead><tr><th>Participant</th><th>Email</th><th>Age</th><th>Language</th><th>Status</th><th>Started (UTC)</th></tr></thead><tbody>${table || '<tr><td colspan="6">No responses yet.</td></tr>'}</tbody></table></div><nav>${page ? `<a href="/admin?status=${status}&amp;page=${page - 1}">Previous page</a>` : ""}${rows.length === 50 ? `<a href="/admin?status=${status}&amp;page=${page + 1}">Next page</a>` : ""}</nav>`);
  } catch (error) {
    console.error("admin request failed", error);
    return html("<h1>Could not load responses</h1><p>Check the database connection and server configuration, then try again.</p>", 503);
  }
}
