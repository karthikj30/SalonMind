# SalonMind — proposal response (RFP §5)

> All prices are **indicative (Nov 2026)**, compiled from vendor pages and third-party summaries. Re-check the
> official pricing pages before committing budgets: [Gemini API](https://ai.google.dev/pricing) ·
> [Supabase](https://supabase.com/pricing) · [Vercel](https://vercel.com/pricing) ·
> [GKE](https://cloud.google.com/kubernetes-engine/pricing) · Claude prices from Anthropic's model table.
> Currency conversions assume **₹85 = $1**.

## 1. Architecture blueprint

See [`ARCHITECTURE.md`](ARCHITECTURE.md) (multi-agent mesh, event bus, tenant isolation via Postgres RLS) and
[`DEPLOY_K8S.md`](DEPLOY_K8S.md) (web + agent-worker microservices, HPAs, CronJob).

## 2. Implementation evidence

Instead of case studies, the working system is the evidence. It is live, and every RFP bullet has a test that
runs against the real database ([`RFP_COVERAGE.md`](RFP_COVERAGE.md)):

* 22 agents (consultation & safety, prepaid value, translator, voice, walk-in queue and daily briefing added to: procurement, negotiation, waste, concierge, churn, campaigns, loyalty, reputation,
  no-show, yield pricing, waitlist, recruitment, performance, billing, GST, self-optimizer) on an event bus.
* LangChain.js LLM layer (Gemini / OpenAI GPT / Anthropic Claude / free Groq, OpenRouter, Hugging Face,
  Ollama) with a deterministic, multilingual rules engine as the final fallback.
* 40 unit tests, 46 real-database integration tests (incl. tenant isolation, a 20-way concurrent booking race,
  a Tamil end-to-end booking, a container-to-container microservice test), browser E2E on production.

## 3. Timeline & milestones

| Phase | Duration | Scope | Status |
|---|---|---|---|
| **Discovery** | 2 weeks | RFP analysis, agent catalogue, data model, architecture, free-tier stack | ✅ done |
| **MVP** | 6 weeks | All 6 modules, 20 agents, marketplace, GST, multilingual concierge, owner UI, CI, free-tier deploy | ✅ done — this repository |
| **Beta launch** | 8 weeks | Real WhatsApp Business numbers per salon, Razorpay Route split settlements, GSP/IRP e-invoicing, consultation & patch-test forms, credit notes, 10–20 pilot salons in 2 cities, load test to festival peak, observability (OpenTelemetry + Grafana) | planned |
| **Enterprise scaled release** | 12 weeks | Chains & branches (HQ dashboards, inter-branch stock), GKE production cluster in `asia-south1` with DR replica, SSO, SOC 2 Type I readiness + ISO 27001 ISMS kickoff, voice receptionist, partner APIs | planned |

## 4. Development cost estimate (Beta + Enterprise, ~5 months)

| Role | FTE | Indicative monthly cost (India) | 5-month cost |
|---|---|---|---|
| Senior full-stack engineers | 2 | ₹2.0–3.0 L each | ₹20–30 L |
| AI / LLM engineer | 1 | ₹2.5–3.5 L | ₹12.5–17.5 L |
| QA / test automation | 1 | ₹1.2–1.8 L | ₹6–9 L |
| Product designer | 0.5 | ₹1.5–2.0 L | ₹3.8–5 L |
| Product / delivery manager | 0.5 | ₹2.0–2.5 L | ₹5–6.3 L |
| **Total** | **5** | | **≈ ₹47–68 L** |

Assumes the MVP in this repository as the starting point; excludes WhatsApp/GSP/payment-gateway commercial fees.

## 5. Cloud infrastructure estimates (per month)

| Stage | Salons | Stack | Indicative cost |
|---|---|---|---|
| **Pilot** | ≤ 5 | Vercel Hobby, Supabase Free, free LLM tiers (Groq / Gemini free) | **₹0** |
| **Growth** | ~100 | Vercel Pro (~$20 per seat, unverified), Supabase Pro ($25 base incl. $10 compute credit; larger compute from ~$110), serverless agents | **≈ $70–200 (₹6–17 k)** + LLM below |
| **Scale** | ~1,000 | GKE Autopilot `asia-south1`: web 4 × (0.5 vCPU, 1 GiB) + agent-worker 3 × (0.5 vCPU, 1 GiB) ≈ 3.5 vCPU, 7 GiB → ~$114 vCPU + ~$25 memory at list rates of $0.0445/vCPU-h and $0.0049/GiB-h (Mumbai rates may differ); cluster fee $0.10/h largely covered by the $74.40 monthly free credit; Supabase Pro + Large compute (~$110) | **≈ $250–400 (₹21–34 k)** + LLM below |

Festival peaks are absorbed by HPA scale-out (web 2→20, worker 1→10); you pay only for the extra pod-hours.

## 6. AI token consumption projections

Per salon per day, assuming 40 bookings, 60 inbound messages and ~20 campaign / back-office generations:

| Workload | LLM calls | Input tokens | Output tokens |
|---|---|---|---|
| Bookings (no-show nudge, review sentiment, reputation message) | 120 | 108 k | 36 k |
| Inbox (intent extraction + reply) | 120 | 144 k | 36 k |
| Campaigns, negotiation, recruiting, GST notes | 20 | 12 k | 6 k |
| **Total per day** | **260** | **264 k** | **78 k** |
| **Per month (30 days)** | **7,800** | **≈ 7.9 M** | **≈ 2.3 M** |

| Model (via the LangChain gateway) | Price per 1M tokens (in / out) | Cost per salon per month | 1,000 salons |
|---|---|---|---|
| Groq / Gemini free tiers | free within daily limits | ₹0 for a handful of salons | not viable — rate limits |
| Gemini 2.5 Flash (paid) | $0.30 / $2.50 | ≈ $8.1 (₹690) | ≈ $8.1 k |
| Claude Haiku 5.5 | $0.10 / $0.50 | ≈ $2.0 (₹170) | ≈ $2.0 k |
| Claude Opus 5.5 (premium tier) | $4 / $20 | ≈ $78 (₹6.6 k) | ≈ $78 k |

Cost levers already built in: rules engine handles routine replies with zero tokens, prices/slots come from the
database (short grounded prompts), and every call is logged with its provider in `agent_runs` for cost
attribution. Recommended plan: free tiers for pilots, then a small paid model for bulk traffic with a premium
model reserved for complex conversations.
