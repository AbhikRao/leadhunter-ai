// api/research.js — Vercel serverless function
// Relays TinyFish SSE stream to the browser. API key stays server-side.

const KEY = process.env.TINYFISH_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!KEY) return res.status(500).json({ error: 'TINYFISH_API_KEY not set' });

  const { company, role, ctx } = req.body;
  if (!company || !role) return res.status(400).json({ error: 'company and role required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emit = (data) => res.write('data: ' + JSON.stringify(data) + '\n\n');

  const goal = [
    'You are a B2B lead researcher. Complete these steps:',
    `1. Go to https://www.google.com. Search: "${role}" "${company}" site:linkedin.com`,
    `2. Identify up to 3 LinkedIn profiles of people who are "${role}" at "${company}".`,
    '3. Visit each profile. Extract: full name, exact title, company, location, 2-sentence bio, email if visible.',
    `4. Search Google for "${company} official website". Visit it. Extract: URL, description, industry, size.`,
    ctx ? '5. Extra instructions: ' + ctx : '',
    'Return ONLY valid JSON (no markdown, no code fences):',
    '{ "company": { "name":"","website":"","description":"","industry":"","size":"" },',
    '  "leads": [{ "name":"","title":"","company":"","linkedinUrl":"","location":"","email":null,"summary":"","confidence":"high" }],',
    '  "totalFound":0, "searchedAt":"" }',
  ].filter(Boolean).join('\n');

  try {
    emit({ type: 'LOG', message: `Searching for ${role} at ${company}` });

    const upstream = await fetch('https://agent.tinyfish.ai/v1/automation/run-sse', {
      method: 'POST',
      headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.google.com', goal, browser_profile: 'stealth' }),
    });

    if (!upstream.ok) {
      emit({ type: 'ERROR', message: `TinyFish ${upstream.status}: ${await upstream.text()}` });
      return res.end();
    }

    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6).trim());
          switch (ev.type) {
            case 'STARTED':       emit({ type: 'STARTED', runId: ev.runId }); break;
            case 'STREAMING_URL': emit({ type: 'STREAMING_URL', streamingUrl: ev.streamingUrl }); break;
            case 'PROGRESS':      emit({ type: 'PROGRESS', message: ev.purpose || ev.message || '' }); break;
            case 'HEARTBEAT':     emit({ type: 'HEARTBEAT' }); break;
            case 'COMPLETE':
              ev.status === 'COMPLETED'
                ? emit({ type: 'COMPLETE', result: ev.resultJson })
                : emit({ type: 'ERROR', message: ev.error?.message || `Run ${ev.status}` });
              break;
            default: emit(ev);
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') emit({ type: 'ERROR', message: err.message });
  } finally {
    res.end();
  }
}
