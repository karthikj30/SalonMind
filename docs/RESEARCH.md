# Market & open-source research (Nov 2026)

What comparable salon products ship, what we took from them, and what we deliberately left out.

## Commercial salon software

Sources: MioSalon's 2026 hands-on comparison of 10 tools (MioSalon, GlossGenius, Vagaro, Fresha, Zenoti,
Mindbody, Boulevard, Phorest, Square, Booker); India-focused listings for SalonBoost, Zylu, Dingg, SalonX;
Zenoti's 2026 comparison pages.

| Capability seen in the market | Who has it | SalonMind |
|---|---|---|
| Memberships & service packages | MioSalon, GlossGenius, Vagaro, Fresha, Zenoti, Zylu, SalonBoost | ✅ added — plans with auto-discount + wallet credit, GST-invoiced sale |
| Prepaid wallet | SalonBoost, MioSalon | ✅ added — top-up, pay-at-checkout, ledger (GST at redemption) |
| Loyalty points / referrals | MioSalon, Fresha, Square, Phorest | ✅ added — Loyalty & Referral Agent |
| Automated waitlist filling | MioSalon, Fresha, Boulevard, GlossGenius | ✅ added — Waitlist Agent + "reply YES" booking via concierge |
| Staff attendance / blocked time | MioSalon, Fresha, OpenSalon | ✅ added — leave & blocked time respected by the scheduler |
| Google review requests / reputation | Fresha, GlossGenius, Square, Zenoti | ✅ added — Reputation & Rebooking Agent (+ service recovery for ≤3★) |
| Rebooking suggestions | MioSalon | ✅ added — next-visit date from the client's own cycle |
| Birthday / win-back campaigns | most platforms | ✅ birthday added; win-back already existed (Campaign + Churn agents) |
| WhatsApp reminders / invoices | Dingg, SalonBoost, SalonX (WhatsApp Business API) | ✅ via WhatsApp Cloud API when keys are set; simulated otherwise |
| AI receptionist / concierge | Zenoti (HyperConnect), Boulevard (beta), Mindbody | ✅ AI Concierge across WhatsApp/IG/Google/call/web |
| Consumer marketplace | Fresha (main differentiator) | ✅ with NL + photo search, live slots and AI deals |
| Consultation / consent forms, patch-test notes | GlossGenius, Vagaro, Fresha | ⏭ roadmap (client notes cover allergies today) |
| Gift cards | MioSalon, Vagaro, Mindbody | ⏭ roadmap (wallet top-up covers prepaid value) |
| Multi-location chains | Zenoti, Zylu | partial — one user can own many salons; chain-level reports on roadmap |

## Open-source projects on GitHub

Found via GitHub search (`salon management`, `appointment booking open source`):

| Repo | What it does | Ideas taken |
|---|---|---|
| clawnify/OpenSalon (Preact + Hono + SQLite) | Open-source Fresha/Salonist alternative: day calendar, blocked time slots, status workflow, CSV day sheet, REST API, "agent mode" UI | blocked time / leave ✅, reschedule ✅ |
| AbdullahBakir97/Barber-Salon (Django + HTMX) | appointments with working-hour validation, reviews moderation, gallery, multi-language | past-date validation on history import ✅, reviews → reputation agent ✅ |
| Abhisheksingh0303/Salon-Management-System (PHP) | classic CRUD for appointments, staff, services, billing | — (SalonMind already covers) |
| KarmaComputing/salon-booking-guru (Go) | online client booking | — |
| calcom/cal.diy (50k★) | scheduling infrastructure | design reference for buffer/limits (future) |

### Second sweep — repos whose ideas are now implemented

| Repo | Stars | What we ported | Where |
|---|---|---|---|
| [reinh2/Kontor](https://github.com/reinh2/Kontor) — self-hosted AI front desk | — | **Two-phase AI booking** (model proposes frozen args, customer must say YES), **human handoff** on complaints / repeated confusion, **DB-enforced no double-booking** (exclusion constraint) | `crm.ts` concierge, `booking_proposals`, `conversations`, migration 0006 |
| [Centre-for-Information-Technology-India/upi-pg](https://github.com/Centre-for-Information-Technology-India/upi-pg) | 49 | NPCI `upi://pay` deposit/bill links + QR (rendered server-side, zero fees, no gateway) | `domain/upi.ts`, No-Show agent, public booking page |
| [frappe/india-payroll](https://github.com/frappe/india-payroll) | 28 | **PF** (12%, ₹15k ceiling, EPS/EPF split), **ESI** (0.75%/3.25% ≤ ₹21k), **state professional tax** (MH incl. women exemption & Feb, KA, WB, GJ, TS/AP) | `domain/statutory.ts`, payroll |
| [SGrappelli/pronto](https://github.com/SGrappelli/pronto) — Next.js + Supabase salon CRM/POS | 75 | **CSV client import** from Fresha/Vagaro/Booksy/Square exports (alias mapping, +91 normalisation, DD/MM dates, dedupe) | `domain/csv.ts`, Clients page |
| [alextselegidis/easyappointments](https://github.com/alextselegidis/easyappointments) | 4.5k | Calendar sync → **per-stylist ICS feed** (Google/Apple/Outlook subscribe) incl. leave | `/api/ics/[token]` |
| [JunaydEco-coder/hairstyle-recommendation-system](https://github.com/JunaydEco-coder/hairstyle-recommendation-system) & similar | 61 | **Face-shape style advisor** — done with a free vision LLM instead of a custom CV model | marketplace "Style advisor" |

### Also reviewed (good references, not ported)

* [opensourcepos/opensourcepos](https://github.com/opensourcepos/opensourcepos) (4.5k★) — barcode/receipt POS; our POS is service-centric.
* [IamRamgarhia/Free-GST-Billing-Software](https://github.com/IamRamgarhia/Free-GST-Billing-Software) (509★) — quotations/credit notes; credit notes are a candidate next step.
* [openai/openai-agents-js](https://github.com/openai/openai-agents-js) (4k★) — agent framework; our event-bus mesh needs no paid SDK and runs on free models.
* [kirklandsig/AIReceptionist](https://github.com/kirklandsig/AIReceptionist), [7XLabs/Aiva](https://github.com/7XLabs/Aiva) — voice receptionists; need paid realtime/telephony, so voice stays on the roadmap.
* [amicalhq/refref](https://github.com/amicalhq/refref) — referral platform; our Loyalty & Referral agent covers salon needs.
* [UMCU-Digital-Health/No_Show](https://github.com/UMCU-Digital-Health/No_Show) — trained no-show model; our explainable logistic model can be re-fit once a salon has history.

None of the open-source projects are AI-native or multi-tenant, none handle Indian GST, and none have an
agent mesh — those remain SalonMind's differentiators.

## Third sweep (Nov 2026) — free language / speech services and front-desk features

**Free translation and speech services checked**

| Service | Key needed | Result | Used |
|---|---|---|---|
| MyMemory public API | none (≈5,000 chars/day per IP) | all 12 Indian languages translated correctly in a live test, incl. Assamese and Odia | ✅ keyless tier |
| LLM gateway (Groq / Gemini / OpenRouter / Hugging Face router) | free key | best quality, batched; already part of the app | ✅ first tier when a key is set |
| Hugging Face Inference `Helsinki-NLP/opus-mt-en-mul`, `opus-mt-mul-en` | `HF_TOKEN` | hosted ("warm"); quality below the two above | ✅ last tier |
| AI4Bharat IndicTrans2 (Hugging Face) | — | best open Indic model, but not on hosted inference (custom code) — needs self-hosting | ❌ documented as an upgrade path |
| Bhashini (Govt. of India) | registration + keys | free but key-gated | ❌ not keyless |
| Browser Web Speech API | none | speech recognition in Chrome / Edge / Safari with `hi-IN`, `ta-IN`… locales | ✅ primary speech-to-text |
| Groq `whisper-large-v3-turbo` | free key | fast multilingual transcription | ✅ fallback 1 |
| Hugging Face `openai/whisper-large-v3-turbo` | `HF_TOKEN` | hosted | ✅ fallback 2 |

**Features seen in competing products**

| Idea | Seen in | Status here |
|---|---|---|
| AI receptionist / concierge that books from calls and messages | Zenoti, Fresha, Boulevard | ✅ concierge (text); live voice calls need a telephony provider |
| Walk-in queue with tokens, QR self check-in, waiting-area display | SpeedUpSalon, DINGG | ✅ built (wait estimates from the real calendar) |
| Day-end closing / cash tally | common in Indian POS | ✅ built |
| Owner daily digest | Zenoti-style "assistant" summaries | ✅ Daily Briefing Agent |
| Hands-free / voice operation | — (not found in competitors) | ✅ Voice Agent |
| Gift cards tied to billing | SpeedUpSalon, Salon4me, Salonify | ⏭ next (new table; wallet engine can be reused) |
| Service packages / family-pooled memberships | Zylu, SpeedUpSalon, DINGG | ⏭ next |
| Staff attendance / check-in | DINGG (commission leakage) | ⏭ next |
| AI lead management | Zenoti | ⏭ later |

Sources: https://www.zenoti.com/thecheckin/best-salon-management-software-2026 ·
https://www.techjockey.com/detail/speedupsalon ·
https://dingg.app/blogs/best-salon-management-software-in-india-for-2026-why-dingg-stands-out ·
https://www.capterra.in/software/1026558/zylu · https://sagnikbhattacharya.com/blog/salon-spa-software-ai-compared ·
https://console.groq.com/docs/speech-to-text · https://huggingface.co/ai4bharat/indictrans2-en-indic-1B ·
https://dev.to/build996/free-whisper-api-groq-deepgram-assemblyai-compared-562m

## Source links

* https://blog.miosalon.com/10-best-salon-software-hands-on-comparison-for-salons-in-2026/
* https://www.softwaresuggest.com/salonboost · https://www.capterra.in/software/1026558/zylu
* https://dingg.app/blogs/how-to-increase-salon-revenue-with-membership-plans-in-2026
* https://www.zenoti.com/thecheckin/best-salon-management-software-2026
* https://github.com/clawnify/OpenSalon · https://github.com/AbdullahBakir97/Barber-Salon
