// backend/server.js
// Local dev server — mirrors the Vercel serverless functions so you
// can run the full stack with `npm start` without deploying.

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app  = express();
const KEY  = process.env.TINYFISH_API_KEY;

if (!KEY) { console.error("Missing TINYFISH_API_KEY in .env"); process.exit(1); }

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const emit = (res, data) => res.write("data: " + JSON.stringify(data) + "\n\n");

function buildGoal(company, role, ctx) {
  return `You are a B2B lead researcher. Complete these steps:
1. Go to https://www.google.com. Search: "${role}" "${company}" site:linkedin.com
2. Identify up to 3 LinkedIn profiles of people who are "${role}" at "${company}".
3. Visit each profile. Extract: full name, exact title, company, location, 2-sentence bio, email if visible.
4. Search Google for "${company} official website". Visit it. Extract: URL, description, industry, size.
${ctx ? "5. Extra instructions: " + ctx : ""}
Return ONLY valid JSON — no markdown, no code fences:
{ "company": { "name":"","website":"","description":"","industry":"","size":"" },
  "leads": [{ "name":"","title":"","company":"","linkedinUrl":"","location":"","email":null,"summary":"","confidence":"high" }],
  "totalFound":0, "searchedAt":"" }`.trim();
}

app.post("/api/research", async (req, res) => {
  const { company, role, ctx } = req.body;
  if (!company || !role) return res.status(400).json({ error: "company and role required" });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  try {
    emit(res, { type: "LOG", message: `Searching for ${role} at ${company}` });
    const upstream = await fetch("https://agent.tinyfish.ai/v1/automation/run-sse", {
      method: "POST",
      headers: { "X-API-Key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.google.com", goal: buildGoal(company, role, ctx), browser_profile: "stealth" }),
    });
    if (!upstream.ok) { emit(res, { type: "ERROR", message: `TinyFish ${upstream.status}` }); return res.end(); }
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const ev = JSON.parse(line.slice(6).trim());
          switch (ev.type) {
            case "STARTED":       emit(res, { type: "STARTED", runId: ev.runId }); break;
            case "STREAMING_URL": emit(res, { type: "STREAMING_URL", streamingUrl: ev.streamingUrl }); break;
            case "PROGRESS":      emit(res, { type: "PROGRESS", message: ev.purpose || ev.message || "" }); break;
            case "HEARTBEAT":     emit(res, { type: "HEARTBEAT" }); break;
            case "COMPLETE":
              ev.status === "COMPLETED"
                ? emit(res, { type: "COMPLETE", result: ev.resultJson })
                : emit(res, { type: "ERROR", message: ev.error?.message || `Run ${ev.status}` });
              break;
            default: emit(res, ev);
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") emit(res, { type: "ERROR", message: err.message });
  } finally { res.end(); }
});

app.post("/api/bulk-research", async (req, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads) || !leads.length) return res.status(400).json({ error: "leads array required" });
  const jobs = await Promise.all(leads.map(async ({ company, role }) => {
    const goal = `Find the ${role} at ${company} via Google and LinkedIn. Return JSON: { name, title, linkedinUrl, email, location, summary }`;
    const r = await fetch("https://agent.tinyfish.ai/v1/automation/run-async", {
      method: "POST",
      headers: { "X-API-Key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.google.com", goal, browser_profile: "stealth" }),
    });
    const body = await r.json();
    return { company, role, run_id: body.run_id };
  }));
  res.json({ jobs });
});

app.get("/api/run/:id", async (req, res) => {
  const r = await fetch(`https://agent.tinyfish.ai/v1/runs/${req.params.id}`, { headers: { "X-API-Key": KEY } });
  res.json(await r.json());
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`\n  LeadHunter  →  http://localhost:${PORT}\n`));
