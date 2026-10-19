import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { loadQuestionnaires } from "../lib/questions.mjs";
import { startDatabaseFixture } from "./fixture.mjs";

const { content, version } = loadQuestionnaires();
const profile = { firstName: "Sara", lastName: "Example", email: "sara@example.com", age: 28, language: "en", consent: true, questionnaireVersion: version };
const blank = () => ({ choices: [], text: "", followup: "", attraction: "", concern: "" });

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("production app with isolated database fixture", { timeout: 60000 }, async (context) => {
  const fixture = await startDatabaseFixture();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const admin = `Basic ${Buffer.from("admin:test-admin-password-long-enough").toString("base64")}`;
  let output = "";
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    windowsHide: true,
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", SUPABASE_URL: fixture.url, SUPABASE_SERVICE_ROLE_KEY: "test-service-key", ADMIN_PASSWORD: "test-admin-password-long-enough", PRIVACY_CONTACT: "organizer@example.com" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  context.after(async () => {
    child.kill();
    await fixture.close();
  });
  let running = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/submission`)).ok) { running = true; break; }
    } catch {}
    if (child.exitCode !== null) break;
    await delay(150);
  }
  assert.ok(running, `App failed to start. Run npm run build first.\n${output}`);
  let cookie = "";
  let current;
  const send = (method, body, extraHeaders = {}) => fetch(`${base}/api/submission`, {
    method, headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie, ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });

  await context.test("public page excludes the facilitator guide and server credentials", async () => {
    const response = await fetch(base);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /AI for Humans/);
    assert.doesNotMatch(html, /test-service-key|test-admin-password|Facilitator|راهنمای برگزارکننده/);
    assert.equal(response.headers.get("x-frame-options"), "DENY");
  });

  await context.test("rejects cross-site requests and invalid profiles", async () => {
    assert.equal((await send("POST", profile, { Origin: "https://attacker.invalid" })).status, 403);
    assert.equal((await send("POST", { ...profile, age: 0 })).status, 400);
    assert.equal(fixture.state.rows.length, 0);
  });

  await context.test("starts a session, keeps contact data private, and resumes without duplicates", async () => {
    const response = await send("POST", profile);
    assert.equal(response.status, 201);
    const setCookie = response.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=lax/i);
    cookie = setCookie.split(";")[0];
    current = (await response.json()).submission;
    assert.equal(current.language, "en");
    assert.equal(current.revision, 0);
    assert.ok(!("email" in current) && !("session_hash" in current) && !("first_name" in current));
    assert.notEqual(fixture.state.rows[0].session_hash, cookie.split("=")[1]);
    assert.equal((await send("POST", profile)).status, 200);
    assert.equal(fixture.state.rows.length, 1);
    assert.equal((await (await send("GET")).json()).submission.id, current.id);
    const stranger = await fetch(`${base}/api/submission`);
    assert.equal((await stranger.json()).submission, null);
  });

  await context.test("outages and invalid answers do not mutate progress", async () => {
    const body = { questionId: "q01", answer: { ...blank(), choices: ["1"] }, nextQuestion: 1, complete: false, revision: 0 };
    fixture.state.failWrites = true;
    assert.equal((await send("PATCH", body)).status, 503);
    fixture.state.failWrites = false;
    assert.equal(fixture.state.rows[0].revision, 0);
    assert.equal((await send("PATCH", { ...body, answer: blank() })).status, 400);
    assert.equal((await send("PATCH", { ...body, complete: true })).status, 400);
    assert.equal(fixture.state.rows[0].completed_at, null);
  });

  await context.test("saves all answers, rejects stale writes, and finalizes only once", async () => {
    for (const [index, question] of content.en.questions.entries()) {
      const answer = { ...blank(), choices: question.kind === "text" ? [] : question.id === "q12" ? ["1", "2"] : ["1"], text: question.kind === "text" ? "Not sure" : "", concern: question.id === "q12" ? "مسئولیت" : "" };
      const body = { questionId: question.id, answer, nextQuestion: Math.min(index + 1, 11), complete: index === 11, revision: current.revision };
      const response = await send("PATCH", body);
      assert.equal(response.status, 200, await response.clone().text());
      current = (await response.json()).submission;
      if (index === 0) {
        assert.equal((await send("PATCH", body)).status, 409);
        assert.equal((await (await send("GET")).json()).submission.current_question, 1);
      }
    }
    assert.ok(current.completed_at);
    assert.equal(current.revision, 12);
    const retry = await send("PATCH", { revision: 11 });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).submission.completed_at, current.completed_at);
    assert.equal(fixture.state.rows[0].answers.q12.concern, "مسئولیت");
  });

  await context.test("admin authentication protects lists, details, and CSV", async () => {
    for (const suffix of ["", "?format=csv", `?id=${current.id}`]) {
      assert.equal((await fetch(`${base}/admin${suffix}`)).status, 401);
    }
    const list = await fetch(`${base}/admin`, { headers: { Authorization: admin } });
    assert.equal(list.status, 200);
    assert.match(await list.text(), /sara@example.com/);
    const detail = await fetch(`${base}/admin?id=${current.id}`, { headers: { Authorization: admin } });
    assert.match(await detail.text(), /مسئولیت/);
    const full = await fetch(`${base}/admin?format=csv&status=completed`, { headers: { Authorization: admin } });
    assert.match(full.headers.get("content-disposition"), /attachment/);
    assert.match(await full.text(), /sara@example.com/);
    const reduced = await fetch(`${base}/admin?format=csv&deidentified=1`, { headers: { Authorization: admin } });
    assert.doesNotMatch(await reduced.text(), /sara@example.com|first_name|session_hash/);
  });

  await context.test("admin escapes participant content and exports beyond one database page", async () => {
    const source = fixture.state.rows[0];
    source.first_name = '<script>alert("unsafe")</script>';
    const list = await fetch(`${base}/admin`, { headers: { Authorization: admin } });
    const html = await list.text();
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    for (let index = 0; index < 501; index += 1) {
      fixture.state.rows.push({ ...source, id: `fixture-${index}`, session_hash: `fixture-${index}`, first_name: `Person-${index}` });
    }
    const response = await fetch(`${base}/admin?format=csv`, { headers: { Authorization: admin } });
    const csv = await response.text();
    assert.equal(csv.trim().split("\r\n").length, 503);
    assert.match(csv, /fixture-500/);
  });

  await context.test("old-version sessions cannot write and seven-day sessions expire", async () => {
    const row = fixture.state.rows[0];
    row.completed_at = null;
    row.questionnaire_version = "old-version";
    assert.equal((await send("PATCH", { revision: row.revision })).status, 409);
    row.started_at = "2020-01-01T00:00:00.000Z";
    assert.equal((await (await send("GET")).json()).submission, null);
    assert.equal((await send("PATCH", {})).status, 401);
  });
});
