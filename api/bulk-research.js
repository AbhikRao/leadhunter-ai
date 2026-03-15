// api/bulk-research.js — Vercel serverless function
// Fires parallel TinyFish /run-async jobs and returns run IDs for polling.

const KEY = process.env.TINYFISH_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!KEY) return res.status(500).json({ error: 'TINYFISH_API_KEY not set' });

  const { leads } = req.body;
  if (!Array.isArray(leads) || !leads.length)
    return res.status(400).json({ error: 'leads array required' });

  const jobs = await Promise.all(leads.map(async ({ company, role }) => {
    const goal = `Find the ${role} at ${company} via Google and LinkedIn. Return JSON: { name, title, linkedinUrl, email, location, summary }`;
    const r = await fetch('https://agent.tinyfish.ai/v1/automation/run-async', {
      method: 'POST',
      headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.google.com', goal, browser_profile: 'stealth' }),
    });
    const body = await r.json();
    return { company, role, run_id: body.run_id };
  }));

  res.json({ jobs });
}
