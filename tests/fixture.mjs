import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

export async function startDatabaseFixture() {
  const state = { rows: [], failWrites: false };
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.headers.apikey !== "test-service-key") {
      response.writeHead(401).end(JSON.stringify({ error: "Invalid key" }));
      return;
    }
    const url = new URL(request.url, "http://localhost");
    const query = url.searchParams;
    const matches = (row) => [...query.entries()].every(([key, filter]) => {
      if (["select", "order", "limit", "offset"].includes(key)) return true;
      if (filter === "is.null") return row[key] == null;
      if (filter === "not.is.null") return row[key] != null;
      if (filter.startsWith("eq.")) return String(row[key]) === filter.slice(3);
      if (filter.startsWith("gte.")) return row[key] >= filter.slice(4);
      if (filter.startsWith("lte.")) return row[key] <= filter.slice(4);
      return false;
    });
    if (request.method !== "GET" && state.failWrites) {
      response.writeHead(503).end(JSON.stringify({ error: "Simulated outage" }));
      return;
    }
    let result;
    if (["POST", "PATCH"].includes(request.method)) {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (request.method === "POST") {
        const row = {
          id: randomUUID(), started_at: new Date().toISOString(), consented_at: new Date().toISOString(),
          privacy_notice_version: "v1", answers: {}, current_question: 0, revision: 0, completed_at: null, ...body,
        };
        state.rows.push(row);
        result = [row];
      } else {
        result = state.rows.filter(matches);
        for (const row of result) Object.assign(row, body);
      }
    } else {
      result = state.rows.filter(matches);
      const descending = query.get("order")?.includes("desc");
      result.sort((left, right) => {
        const comparison = left.started_at.localeCompare(right.started_at) || left.id.localeCompare(right.id);
        return descending ? -comparison : comparison;
      });
      const offset = Number(query.get("offset") ?? 0);
      result = result.slice(offset, offset + Number(query.get("limit") ?? 1000));
    }
    if (query.has("select")) {
      const fields = query.get("select").split(",");
      result = result.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])));
    }
    response.writeHead(request.method === "POST" ? 201 : 200).end(JSON.stringify(result));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { state, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}
