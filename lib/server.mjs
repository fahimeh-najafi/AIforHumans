import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { InputError } from "./validation.mjs";

export const COOKIE_NAME = "workshop_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

export async function database(query = "", options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new InputError("configuration", 503);
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/submissions${query}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...options.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    // Postgres "details" can contain the failing row (PII), so log only code and message.
    const { code, message } = await response.json().catch(() => ({}));
    console.error("database request failed", options.method ?? "GET", response.status, code, message);
    throw new InputError("save_failed", 503);
  }
  return response.status === 204 ? [] : response.json();
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getSubmission() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const earliest = new Date(Date.now() - SESSION_SECONDS * 1000).toISOString();
  const rows = await database(`?session_hash=eq.${hashToken(token)}&started_at=gte.${encodeURIComponent(earliest)}&limit=1`);
  return rows[0] ?? null;
}

export async function setSession(token) {
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: SESSION_SECONDS,
  });
}

export function newToken() {
  return randomBytes(32).toString("hex");
}

export function publicSubmission(row) {
  if (!row) return null;
  const { id, language, answers, current_question, completed_at, revision, questionnaire_version } = row;
  return { id, language, answers, current_question, completed_at, revision, questionnaire_version };
}

export async function readBody(request) {
  const origin = request.headers.get("origin");
  let originUrl;
  try { originUrl = new URL(origin); } catch { throw new InputError("forbidden", 403); }
  if (originUrl.origin !== origin || !["http:", "https:"].includes(originUrl.protocol) || originUrl.host !== request.headers.get("host")) {
    throw new InputError("forbidden", 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new InputError("invalid_request");
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("invalid_request");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32000) {
      await reader.cancel();
      throw new InputError("invalid_request", 413);
    }
    chunks.push(Buffer.from(value));
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new InputError("invalid_request");
  }
}

export function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function failure(error) {
  if (!(error instanceof InputError)) console.error("unexpected failure", error);
  return json({ error: error instanceof InputError ? error.message : "save_failed" }, error instanceof InputError ? error.status : 503);
}

export function isAdmin(request) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 16) return false;
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Basic ")) return false;
  const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
  return timingSafeEqual(hashBuffer(decoded), hashBuffer(`admin:${password}`));
}

function hashBuffer(value) {
  return createHash("sha256").update(value).digest();
}
