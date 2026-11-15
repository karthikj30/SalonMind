# Master prompt — build SalonMind with Google Antigravity

Paste the block below into an **Antigravity** agent session (Agent Manager → new task, "Planning" mode,
model: Gemini 3 Pro or Claude). The workspace rules in `.agent/rules/` and the workflows in
`.agent/workflows/` are picked up automatically and keep the agent on track across sessions.

---

```text
ROLE
You are a principal software engineer and AI-systems architect. You build production-grade, AI-native
SaaS on FREE TIERS ONLY. You plan first (Implementation Plan artifact), then build in small verifiable
steps, and you prove every step works in the browser — never just "it compiles".

PROJECT
"SalonMind" — an AI-native, multi-tenant salon ERP + consumer marketplace for India, from an RFP.
AI is the core architecture: an asynchronous mesh of specialised agents runs operations with minimal
human intervention. Any salon in India (single boutique → national chain) can sign up and is an
isolated tenant.

NON-NEGOTIABLE CONSTRAINTS
1. Free tier only: Vercel Hobby (Next.js), Supabase free (Postgres + pgvector + Auth + pg_cron/pg_net),
   free LLMs: Groq (llama-3.3-70b-versatile; meta-llama/llama-4-scout-17b-16e-instruct for vision),
   Google Gemini (gemini-2.5-flash, gemini-embedding-001 @768 dims), OpenRouter ":free" models,
   Hugging Face router, Ollama locally. No paid APIs, no credit card features.
2. The app MUST work with zero AI keys: every LLM call goes through ONE gateway with a provider
   fallback chain and a deterministic rules-engine fallback supplied by the caller.
3. NO synthetic/seed data. Everything is created manually through the UI so the owner can watch
   what agents do. Provide a "Get started" checklist on the dashboard instead of seed scripts.
4. Every autonomous action is logged (agent, trigger, summary, actions, LLM provider, duration) and
   shown in an "Agent Console". Agents communicate via an event bus table, not direct calls.
5. Tenant isolation in the database via Row Level Security on every table. Browser holds only the
   publishable key + user JWT. Autonomous jobs use a dedicated "platform agent" service account
   (RLS-whitelisted), NOT a service-role key.
6. India specifics: IST everywhere, ₹ formatting (en-IN), GST (CGST+SGST intra-state, IGST inter-state,
   SAC 999721 for salon services @18%, place-of-supply = where the service is performed), FY numbering
   (YYYY-YY), UPI/card/netbanking, festival + wedding-season demand calendar, Indian languages
   (hi, ta, te, bn, mr, kn, ml, gu, pa), DPDP Act (consent, export, erasure), mobile-first & light JS.

STACK
Next.js 15 App Router + TypeScript + Tailwind (server components + server actions, minimal client JS),
@supabase/ssr, Supabase Postgres + pgvector, node:test for unit tests, Playwright for E2E.

DATA MODEL (Postgres)
tenants(settings jsonb for agent parameters, ui_layout jsonb for AI-generated dashboard),
tenant_members, platform_agents, staff(skill_level 1-5, skills[], shifts, employment_type
employee|booth_renter, booth_rent_pct, commission_slabs jsonb, product_commission_pct, hourly_cost),
rooms(equipment[]), services(duration, base_price, min_skill_level, required_equipment[], embedding
vector(768), embedding_model), service_products(recipe qty), clients(language, consent, churn_risk,
avg_cycle_days, last_visit_at), bookings(price, pricing_note, no_show_risk, deposit_required/paid,
rating, review, review_sentiment, schedule_reasoning, source), products, vendors(price_tiers,
flexibility 0-1), usage_logs(expected vs actual, flagged), purchase_orders(items jsonb, is_interstate,
ai_reasoning), negotiations(messages jsonb), messages(channel whatsapp|sms|instagram|google|call|web,
direction, status simulated|sent, agent, meta), campaigns, deals(kind flash|offpeak|last_minute|
festival|manual), job_postings(ad_copy jsonb), candidates(score, screening_chat), payroll_runs,
staff_adjustments(tip|penalty|bonus), learning_assignments, invoices(items, cgst/sgst/igst, splits,
irn), gst_returns(gstr1, gstr3b, itc), agent_events(event bus), agent_runs(audit log).
RPCs: create_tenant (security definer, makes caller owner), provision_user (pre-confirmed account,
platform-agent only), match_services(query_embedding, model, k) for vector search.

AGENT MESH (each = async fn with subscribes[] + periodic flag; registry + runtime with
emit / runAgent / processEvents(claim pending→processing) / tick)
 M1 Procurement: inventory (forecast = max(history/day, booked-services×recipe/day) × festival
    multiplier; reorder if days_left < lead_time+buffer → draft POs per vendor, emit po.drafted),
    negotiator (on po.drafted: tier discount + ask; LLM writes email; simulate vendor reply using
    learned flexibility; update PO; EMA-update vendor flexibility), waste (actual > 1.2×expected →
    flag, emit staff.waste_flag).
 M2 CRM: concierge (on message.received: LLM JSON intent {language,intent,service,date,time,name};
    ground in DB facts; book via scheduler; reply in customer's language/script), churn (visit-cycle
    drift + sentiment + no-shows → logistic risk; ≥0.6 emits client.at_risk; LLM sentiment for
    reviews in any language with lexicon fallback), retention (overdue vs personal cycle + grace,
    consent-checked, 14-day cool-down → personalised WhatsApp offer; recovery variant on at_risk).
 M3 Scheduling: matrix scheduler (enumerate time×stylist×room; filter skill, shift, overlap,
    equipment; score margin, specialty, load balance, preference distance), yield pricing (festival,
    weekend, evening, occupancy surge; off-peak discount; capped by settings), noshow (logistic
    risk → nudge ≥ nudge_threshold, deposit ≥ deposit_threshold), deals (flash for empty mid-week
    days, festival listings, last-minute deal on booking.cancelled).
 M4 HR: recruiter (job.created → Naukri/Apna/Instagram/WhatsApp ads + boolean search strings;
    candidate.added → bias-safe score 0-100 + summary; conversational screening interview),
    payroll (progressive slab commission, product commission, tips, penalties, bonuses, booth-renter
    revenue share), performance (utilisation, ratings, waste → micro-learning from a fixed catalogue).
 M5 Marketplace: NL/photo search → intent (LLM JSON, regex fallback) → embed → pgvector + lexical
    hybrid → budget/city filters → live slots with dynamic price → book (bot session) → public salon
    page + web chat with the same concierge.
 M6 Billing/GST: billing (on booking.completed: invoice with CGST/SGST/IGST, FY invoice numbers,
    IRN-style hash, split payout owner/booth-renter/tax-bucket/gateway-fee, recipe stock consumption,
    emit stock.check), gst (GSTR-1 B2CS/HSN/docs, GSTR-3B with ITC utilisation order from received POs).
 Platform: optimizer (bounded self-tuning of thresholds/caps from no-show rate & occupancy, logged),
    AI Studio (NL prompt → validated widget-schema dashboard = generative micro-frontend; LLM may only
    pick from a typed registry — never generate executable code).

UI (owner app /app/*): Dashboard (widget grid + Run all agents), Agent Console (agents by module,
Run buttons, run log with provider, event bus), Bookings (slot suggestions with reasons, quick book,
complete & bill with payment method/product/tip/rating/review, confirm/no-show/cancel, deposit),
Unified Inbox (threads + "Test: incoming message" form for any channel + human takeover), Clients
(risk, cycle, consent, export, erase), Campaigns & Deals, Services & Rooms (+recipes), Staff & Payroll,
Recruitment (ads, candidates, interview chat), Inventory & POs (forecast, negotiation thread,
approve/receive), Billing & GST (invoices, printable invoice, GSTR drafts, JSON download), AI Studio,
Settings (profile, publish toggle, agent parameters, re-index embeddings, compliance).
Public: landing, /marketplace (search + photo + deals), /s/[slug] (services, slot picker, booking,
chat widget). Auth: /signup (provision via platform agent then sign in), /login, /onboarding.

PLAN → BUILD ORDER (create an Implementation Plan artifact first, then a Task List)
 1. Supabase project (region ap-south-1), migrations, RLS, RPCs, platform agent account.
 2. Next.js skeleton, Supabase SSR clients, middleware, auth + onboarding.
 3. Pure domain modules + unit tests: time/IST, scheduling, pricing, noshow, forecast, crm, gst,
    payroll, intent. (Run `npm test` — all green before continuing.)
 4. LLM gateway + embeddings with fallbacks.
 5. Agent runtime (bus, runs, tick) + agents module by module.
 6. Owner UI pages, then marketplace + public salon page + chat.
 7. /api/agents/tick (Bearer CRON_SECRET), Vercel cron, Supabase pg_cron+pg_net every 30 min.
 8. Deploy to Vercel (import GitHub repo, set env vars), verify production.

VERIFICATION (use the Antigravity browser agent after every module)
Walk the manual test script in docs/TESTING.md in the built-in browser: create the salon, staff,
rooms, services, products, vendor, recipe, client; book via suggestions; complete & bill; send
Hinglish WhatsApp test message; run agents; check Agent Console, Billing, Inventory POs, HR, Studio,
Marketplace search for "balayage under ₹3000 available this evening", book from the public page.
Capture screenshots/recordings as artifacts. Fix anything that is not visibly correct.
Run `npm run typecheck && npm test && npm run build` before every commit.

ENV
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable), AGENT_BOT_EMAIL,
AGENT_BOT_PASSWORD, CRON_SECRET, optional GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY,
HF_TOKEN, OLLAMA_BASE_URL, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID.

DEFINITION OF DONE
All 6 RFP modules usable from the UI, agents visibly acting in the Agent Console with and without LLM
keys, unit tests + E2E pass, deployed on Vercel, README + ARCHITECTURE + TESTING docs updated.
```

---

## Sub-agent prompts (use as separate Antigravity agents in the Agent Manager)

Run these in parallel workspaces once the skeleton (steps 1–4) exists. Each must only touch its own
folder + its page, and must add tests.

| Agent | Prompt |
|---|---|
| **DB & Security agent** | "Own `supabase/migrations`. Every table has tenant_id + RLS `has_tenant_access`. Add indexes for every foreign key used in filters. Run Supabase advisors and fix all security warnings. Never expose service-role keys." |
| **Domain engine agent** | "Own `src/lib/domain`. Pure, dependency-free TypeScript. Each function documented with the business rule and covered by node:test cases including Indian GST edge cases (inter-state, ITC utilisation order, FY rollover)." |
| **Agent-mesh agent** | "Own `src/lib/agents`. Each agent: subscribes[], periodic, run(ctx, event) → {summary, actions, emits, provider}. Ground every LLM response in DB facts, provide a rules fallback, never let the LLM set prices or create records directly — only through domain functions." |
| **UX agent** | "Own `src/app` + `src/components`. Mobile-first, server components, forms with server actions and pending states, flash messages, empty states that tell the user what to create next. No client JS unless interaction requires it." |
| **QA agent** | "Own `tests/`. Keep `tests/e2e.mjs` covering the manual test script; run it against localhost and the Vercel URL using the browser agent; attach screenshots; file issues for anything broken." |

## Prompts embedded in the product (agent system prompts)

The runtime prompts live next to the agents and are deliberately short, grounded and JSON-typed:

* Concierge intent: *"Extract intent from a salon customer conversation… Return JSON {language, intent, service, date, time, name}"* → facts gathered from DB → reply prompt *"Use ONLY these facts; never invent prices or slots."*
* Campaign: *"Write ONE WhatsApp message (max 55 words) in {language}… include the concrete offer and a call to action."*
* Negotiation: *"Write a short, polite, firm B2B negotiation email (max 120 words)."*
* Screening: *"Return JSON {score, summary, strengths, gaps}. Ignore gender, religion, caste, age, marital status."*
* Sentiment: *"Return JSON {sentiment -1..1, topics[]} for this salon review (any Indian language)."*
* Marketplace intent: *"Translate Hindi/Tamil/etc. to English keywords… 'evening' = 17:00-21:00."*
* Studio: *"Only use the listed datasets. Return JSON {widgets:[{dataset,title,span}]}."*
