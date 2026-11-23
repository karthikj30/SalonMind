# ✂️ SalonMind — AI-native salon ERP & marketplace for India

A multi-tenant SaaS where a mesh of AI agents runs salon operations: procurement, vendor negotiation,
waste tracking, unified WhatsApp/Instagram/Google inbox, churn prediction, retention campaigns, matrix
scheduling, yield pricing, no-show mitigation, recruitment, payroll, GST billing — memberships, prepaid wallet, loyalty & referrals, waitlist, reviews — plus a consumer
marketplace with natural-language and photo search. Built from the RFP in this repo and runs **entirely
on free tiers**.

* **Live:** https://salonmind-khaki.vercel.app (owner app at `/signup`, consumer marketplace at `/marketplace`)
* **Apps:** Android APK and Windows / Mac / Linux desktop apps — website → **Get the app** (`/download`); details in
  [`docs/APPS.md`](docs/APPS.md). They load the live site, so every update arrives automatically without reinstalling.
* **Mirror on Render (free tier):** https://salonmind.onrender.com — same database, deployed from `render.yaml`. Free Render
  services sleep after 15 minutes without traffic, so the first visit after a pause takes about a minute.
* **Architecture & RFP mapping:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
* **Antigravity master prompt (plan & build):** [`docs/ANTIGRAVITY_PROMPT.md`](docs/ANTIGRAVITY_PROMPT.md) · rules in [`.agent/`](.agent)
* **Manual test script:** [`docs/TESTING.md`](docs/TESTING.md)
* **Proposal (timeline, costs, token projections):** [`docs/PROPOSAL.md`](docs/PROPOSAL.md)
* **RFP → code → test traceability:** [`docs/RFP_COVERAGE.md`](docs/RFP_COVERAGE.md) · **market research:** [`docs/RESEARCH.md`](docs/RESEARCH.md)

## Look & feel

A luxury-salon design — deep plum, blush rose-gold and champagne gold on warm ivory, Playfair Display headings with
Inter body text, matching line icons and hand-drawn illustrations (no stock photos). The screenshots below were taken
on the live site by the automated end-to-end test, which creates a salon through the real UI and deletes it afterwards.
Every page also works on phones (tab bar, drawer menu and voice button).

| | |
|---|---|
| ![Landing page](docs/screenshots/landing.jpg) | ![Owner dashboard](docs/screenshots/dashboard.jpg) |
| **Landing page** — The pitch, six RFP modules and what goes beyond the brief; first visit offers the Android app, desktop app or the web. | **Owner dashboard** — Today at a glance — bookings, revenue, clients at churn risk and live marketplace deals, laid out by the AI Studio. |
| ![Agent Console](docs/screenshots/agents.jpg) | ![Unified inbox (Module 2)](docs/screenshots/inbox.jpg) |
| **Agent Console** — 22 agents on an event bus, each run logged with the model that answered (Groq gpt-oss-120b, rules fallback). | **Unified inbox (Module 2)** — WhatsApp-style inbox: the AI concierge proposes a slot in Hinglish, books on “yes” and sends a manage-my-booking link. |
| ![Matrix scheduling (Module 3)](docs/screenshots/growth.jpg) | ![Billing, GST & profit (Module 6)](docs/screenshots/billing-pnl.jpg) |
| **Matrix scheduling (Module 3)** — Stylist day calendar; the scheduler matches skill × room × equipment × margin and prices wedding-season demand. | **Billing, GST & profit (Module 6)** — Day-end closing, monthly profit & loss (revenue without GST, stock at cost, staff, expenses) and GSTR drafts. |
| ![Consumer marketplace (Module 5)](docs/screenshots/marketplace.jpg) | ![Salon booking page](docs/screenshots/salon-page.jpg) |
| **Consumer marketplace (Module 5)** — Plain-language search — “balayage under ₹3500 tomorrow evening” — with live slots and deals across salons. | **Salon booking page** — Public menu, live slots with yield pricing, UPI deposit QR and an AI chat; available in 13 languages. |
| ![Inventory & procurement (Module 1)](docs/screenshots/inventory.jpg) | ![Recruitment (Module 4)](docs/screenshots/hr.jpg) |
| **Inventory & procurement (Module 1)** — Stock forecasts (usage × bookings × festival demand) and purchase orders drafted and negotiated by agents. | **Recruitment (Module 4)** — AI-written job ads for Naukri / Apna / Instagram, resume scoring and a chat screening interview. |
| ![Attendance & payroll (Module 4)](docs/screenshots/staff-payroll.jpg) | ![Memberships, gift cards & packages](docs/screenshots/loyalty-prepaid.jpg) |
| **Attendance & payroll (Module 4)** — Clock-in / clock-out feeding payroll: slab commissions, PF / ESI / PT and loss of pay for absences. | **Memberships, gift cards & packages** — Memberships with wallet credit, gift cards sold without GST and prepaid service packages. |
| ![Client consultation card](docs/screenshots/client-card.jpg) | ![Walk-in token queue](docs/screenshots/queue-public.jpg) |
| **Client consultation card** — Colour formulas and patch tests; the Safety Agent asks for a test 48 h before any colour service. | **Walk-in token queue** — QR self check-in with live wait times from the real calendar; customers' names are never shown. |
| ![AI Studio](docs/screenshots/studio.jpg) | ![Get the app](docs/screenshots/download.jpg) |
| **AI Studio** — Describe the dashboard or a workflow in plain language; agents are tuned and widgets generated within safe limits. | **Get the app** — Android APK (QR) and desktop apps that open the live salon, so updates arrive without reinstalling. |
| ![Manage my booking (Tamil)](docs/screenshots/manage-booking.jpg) | ![Dashboard in Urdu](docs/screenshots/dashboard-urdu.jpg) |
| **Manage my booking (Tamil)** — Customers move or cancel their own appointment from the link in their confirmation, in their language. | **Dashboard in Urdu** — The whole owner dashboard in 13 languages; Urdu switches to right-to-left. |

## Stack (all free)

Next.js 15 on Vercel Hobby · Supabase Postgres + pgvector + Auth + pg_cron (Mumbai) · **LangChain.js** LLM
layer: free Groq → Gemini → OpenRouter `:free` → Hugging Face → Ollama, optional OpenAI GPT / Anthropic Claude,
then a deterministic, multilingual rules engine. Also ships as **Kubernetes microservices** (web + agent-worker,
HPAs, CronJob) — see [`docs/DEPLOY_K8S.md`](docs/DEPLOY_K8S.md) — with AES-256-GCM field encryption
([`docs/SECURITY.md`](docs/SECURITY.md)). Light/dark themes with motion that respects reduced-motion settings.
Works with **no AI key at all** (rules-engine mode); add a free key to unlock multilingual LLM behaviour.

**13 languages, no key needed:** English, हिन्दी, বাংলা, मराठी, తెలుగు, தமிழ், ગુજરાતી, اردو (right-to-left), ಕನ್ನಡ,
ଓଡ଼ିଆ, മലയാളം, ਪੰਜਾਬੀ and অসমীয়া — for the marketplace, salon page and chat, natural-language search, and the AI
Concierge (it detects the script, understands "tomorrow 6 o'clock haircut", proposes and confirms bookings in the
customer's own language). The **Unified Inbox** looks and works like WhatsApp (chat list, ticks, wallpaper, take-over,
open in WhatsApp), and every page is checked at phone width by the E2E test.

## 22 agents

| Module | Agents |
|---|---|
| Procurement & Inventory | Procurement (predictive refill), Vendor Negotiation, Waste Tracking |
| CRM & Marketing | AI Concierge (unified inbox), Churn Analytics, Campaign (cycle, recovery, birthday), Loyalty & Referral, Reputation & Rebooking, Prepaid Value (gift cards & packages), Consultation & Safety (patch tests) |
| Scheduling & Resources | No-Show, Yield Pricing / Deals, Waitlist, Walk-in Queue (+ matrix scheduler with staff leave) |
| Recruitment & HR | Recruitment, Performance Coach (+ payroll engine) |
| Billing, POS & GST | Billing & POS, GST Compliance |
| Platform | Self-Optimizer, Translator, Voice, Daily Briefing (+ AI Studio generative dashboards) |

Also built in (ideas ported from open-source projects — see `docs/RESEARCH.md`): two-phase AI booking with
human handoff, Postgres-enforced no double-booking, UPI deposit links + QR, PF/ESI/professional-tax payroll,
CSV client import, stylist calendar (ICS) feeds and a face-shape style advisor.

**Languages, voice and front desk (latest):**

* **Indic translation with free providers** — a gateway tries the LLM (if a key is set), then the keyless
  [MyMemory](https://mymemory.translated.net/doc/spec.php) API, then Hugging Face `Helsinki-NLP/opus-mt`; every result
  must be in the right script, and phone numbers / e-mails / UPI ids are masked before text leaves the server. The
  **Translator Agent** stores each salon's menu, description and deals in 12 Indian languages, the inbox has a
  **Translate** toggle, and replies can be sent in the customer's language.
* **Owner dashboard in 13 languages** — a language picker in the sidebar (and on sign-in / sign-up) switches the whole
  dashboard; Urdu is right-to-left. ~440 of the most visible labels are hand-translated per language (instant, offline);
  the remaining help texts are translated once by the free gateway and cached. Only text from the app's own source code
  is ever sent for translation — never names, notes or messages (`npm run i18n:extract` keeps that allowlist current).
* **Voice Agent** — a microphone button on every signed-in page and on sign-in / sign-up / onboarding. Say (or type)
  “open bookings”, “add client name Meera phone 98765 43210”, “save”, “how many bookings today?” — in English or an
  Indian language; replies come back in that language. Speech-to-text: the browser's own recogniser (free, no key) →
  Groq / Hugging Face Whisper on the server (free key) → Hugging Face Whisper running *inside the browser* via
  transformers.js (no key at all, audio never leaves the device). It fills and navigates; it submits only
  when told, never fills passwords and never presses a delete button. **Ctrl/⌘ K** opens the same commands by keyboard.
* **Walk-in token queue** — tokens at the desk or by QR self check-in (`/s/<salon>/queue`), live wait estimates from
  the stylists' real calendar, “Call” seats the next customer through the scheduler; a **day-end closing** report on
  Billing; a **daily WhatsApp briefing** for the owner.

**Back office (latest):**

* **Client consultation card** — colour formulas (what was mixed, developer, timing) and allergy-alert patch tests on
  each client; the **Consultation & Safety Agent** asks clients to come in for a test at least 48 hours before a colour
  service and warns the owner if a test reacted. Bookings show the patch-test status next to colour services.
* **Attendance → payroll** — clock in/out at the desk; payroll deducts loss of pay for unexplained absences (from a
  stylist's first clock-in, approved leave never deducted) and shows late marks.
* **Expenses and profit & loss** — record rent, electricity, supplies…; Billing shows the month's real profit:
  revenue without GST, minus stock at cost, staff cost and expenses.

**Prepaid value and self-service (latest):**

* **Gift cards** — sell on *Memberships, Gift cards & Loyalty*; the code (e.g. `GC-7KQM-X2PA`) is sent to the
  recipient on WhatsApp. No GST at sale (a voucher is a payment instrument); at checkout the code pays after tax,
  before the prepaid wallet, so the taxable value is never reduced. Partial balances carry over.
* **Prepaid packages** — e.g. “5 haircuts for the price of 4”. GST is invoiced in full when sold; each visit for that
  service then uses one session at ₹0 (the session that expires first).
* **Prepaid Value Agent** — delivers gift-card codes the moment they are sold and reminds customers about balances and
  sessions two weeks and three days before they expire.
* **Manage my booking** — every confirmation and reminder carries a private link (`/b/<token>`) where the customer can
  move or cancel the appointment up to 2 hours before, in their language. A cancellation frees the slot straight away
  for the waitlist and last-minute-deal agents.

Agents communicate through an event bus (`agent_events`) and log every run (`agent_runs`) — watch them
in the **Agent Console**.

## Run locally

```bash
cp .env.example .env.local   # fill Supabase URL + publishable key, agent account, CRON_SECRET
npm install
npm run dev
```

Database: apply `supabase/migrations/*.sql` to a Supabase project, then create the agent service account
with `supabase/bootstrap_agent.sql` (set your own email/password).

## Free AI keys (optional, any one)

| Provider | Get key | Env var |
|---|---|---|
| Groq (Llama 3.3 70B, Llama 4 Scout vision, Whisper speech-to-text) | console.groq.com/keys | `GROQ_API_KEY` |
| Hugging Face (router LLMs, Whisper, opus-mt translation) | huggingface.co/settings/tokens | `HF_TOKEN` |
| Google Gemini (2.5 Flash, embeddings, vision) | aistudio.google.com/apikey | `GEMINI_API_KEY` |
| OpenRouter free models | openrouter.ai/keys | `OPENROUTER_API_KEY` |

After adding `GEMINI_API_KEY`, click **Settings → Re-index services** to switch search to semantic embeddings.

## Tests

```bash
npm run typecheck && npm test && npm run build      # 40 unit tests (GST, payroll, scheduler, pricing, voice parser, queue…)
npm run test:integration                            # 46 tests against the real Supabase DB
python3 scripts/validate_k8s.py                      # static validation of the Kubernetes manifests
BASE_URL=http://localhost:3000 node --env-file=.env.local tests/e2e.mjs   # browser E2E through the real UI + 390px phone audit (cleans up via account deletion)
```

## Autonomy (cron)

`/api/agents/tick` (Bearer `CRON_SECRET`) runs the orchestrator for every tenant. It is called every
30 minutes by Supabase `pg_cron` + `pg_net` (`supabase/cron.sql`) and daily by Vercel Cron.
