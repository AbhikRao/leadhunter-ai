# LeadHunter AI

Autonomous B2B lead research built on the [TinyFish Web Agent API](https://tinyfish.ai).

Given a company name and a target role, a TinyFish browser agent navigates Google, LinkedIn, and the company's own website to find real decision-maker contacts — returning structured data exportable directly to your CRM.

---

## What it does

1. Searches Google for LinkedIn profiles matching the target role and company
2. Visits each profile to extract name, title, location, bio, and any visible email
3. Visits the company homepage to enrich with website, industry, and size
4. Streams every browser action live to the UI via SSE
5. Returns structured results with confidence scores — exportable to CSV

This workflow cannot be built without a web agent. LinkedIn has no public API. The data only exists on live, dynamic, bot-protected pages, which TinyFish navigates with stealth browser profiles.

---

## Running locally

```bash
git clone https://github.com/AbhikRao/leadhunter-ai
cd leadhunter-ai
npm install
cp .env.example .env   # add TINYFISH_API_KEY
npm start              # backend on :3001
open public/index.html
```

---

## Stack

- **Frontend:** Vanilla HTML/CSS/JS — no framework, no build step
- **Backend:** Node.js serverless functions (Vercel) + local Express dev server
- **Web automation:** TinyFish Web Agent `/run-sse` and `/run-async`
