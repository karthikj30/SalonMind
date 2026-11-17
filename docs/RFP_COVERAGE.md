# RFP coverage & test traceability

Every requirement in `docs/Salon_Management_System_RFP.pdf`, where it lives in the code, and the test
that proves it. Three test layers:

* **Unit** — `npm test` → `tests/domain.test.ts` (40 tests, pure business rules)
* **Integration (real Postgres, no mocks)** — `npm run test:integration` → `tests/integration/rfp.test.mts`
  (46 tests; creates a throw-away salon through the same service functions the UI uses, runs the real
  agents, asserts on rows they wrote, deletes everything)
* **E2E (real browser, real UI)** — `BASE_URL=… node tests/e2e.mjs` (signup → … → 390px phone audit → account deletion)

## §1–2 Objective & architecture

| Requirement | Implementation | Tests |
|---|---|---|
| Multi-tenant SaaS for any Indian salon | `tenants`, `tenant_members`, RLS on every table (`supabase/migrations`) | INT *Tenant isolation…*, INT *Public (anon) can read…*, E2E signup/onboarding |
| AI-native, autonomous multi-agent network communicating asynchronously | `src/lib/agents/*` (20 agents), event bus `agent_events`, `processEvents`, `tick` | INT *Orchestrator tick…* + every event-chain test below |
| Self-optimizing engine | `optimizer` agent tunes `tenants.settings` | INT *Self-optimizer tightens deposit threshold…* |
| Auto-generated localized micro-frontends | AI Studio `generateLayout` → typed widget schema, any language | INT *Generative micro-frontend…*, E2E AI Studio |
| Configure workflows from the salon's needs | **Workflow designer**: plain language → validated plan (pause/resume agents, bounded parameters, protected billing); runtime skips paused agents | UNIT *Workflow designer* (2); INT *Workflow designer: plain-language instruction pauses agents…* |
| Hyper-scale / festival concurrency | Serverless (Vercel, bom1), Postgres indexes per tenant, optimistic event claiming, bounded event drains | design (see ARCHITECTURE §4) |

## §3 Module 1 — Procurement & inventory

| Feature | Implementation | Tests |
|---|---|---|
| Predictive stock refilling (history + seasonality + bookings → PO) | `inventory` agent, `domain/forecast.ts`, festival calendar `time.ts` | UNIT *Forecast: festival demand triggers reorder*; INT *Predictive refill drafts a PO…* |
| Autonomous vendor negotiation (bulk tiers + vendor history) | `negotiator` agent (email thread, learned `vendors.flexibility`) | INT *…and the negotiator gets a discount* |
| Smart waste tracking (smart-scale logs, anomalies) | `waste` agent, Inventory → smart-scale log | INT *Waste tracking flags over-use…* |

## Module 2 — CRM & marketing

| Feature | Implementation | Tests |
|---|---|---|
| Retention cycles: 4-week client at week 5 → personalised WhatsApp/SMS | `churn` (cycle) + `retention` agents | UNIT *CRM: 4-week client…*; INT *Autonomous campaign: 4-week client at week 5…* |
| Predictive churn (review sentiment + visit frequency) → recovery | `churn` → `client.at_risk` → `retention` recovery | INT *Churn: negative review + drifting frequency…* |
| Unified inbox (Instagram, WhatsApp, Google, calls) + AI rep | `concierge` agent, WhatsApp-style `/app/inbox` (chat list, ticks, AI/human filter, take-over, open in WhatsApp, reply-as-salon / test-as-customer composer), WhatsApp-style public web chat | INT *Unified inbox: every channel gets an AI reply…*; E2E inbox (proposal → customer YES from the thread composer) |

## Module 3 — Scheduling & resources

| Feature | Implementation | Tests |
|---|---|---|
| Matrix scheduling (skill × room × equipment × margin) | `domain/scheduling.ts`, `services/booking.ts` | UNIT *Scheduler…* (3); INT *Dynamic matrix scheduling…* |
| Yield pricing: Diwali surge, mid-week flash discounts | `domain/pricing.ts`, `deals` agent | UNIT *Pricing…*; INT *Off-peak flash deals…*, *cancellation → last-minute deal* |
| No-show probability → nudges / partial deposits | `noshow` agent, `domain/noshow.ts` | UNIT *No-show…*; INT *No-show mitigation…* |

## Module 4 — Recruitment & HR

| Feature | Implementation | Tests |
|---|---|---|
| Sourcing (job boards/social) + resume screening + conversational screening | `recruiter` agent: channel ads (Naukri/Apna/Instagram/WhatsApp) + search strings, scoring, chat interview | INT *Job ads… + resume screening + conversational interview* |
| Payroll: revenue slabs, product cross-sales, tips, penalties | `domain/payroll.ts`, `computePayroll` | UNIT *Payroll…* (2); INT *Payroll: slabs, product commission…* |
| Performance engineering → micro-learning | `performance` agent | INT *Waste tracking… Performance Coach assigns training*, *Performance coach reviews…* |

## Module 5 — Marketplace

| Feature | Implementation | Tests |
|---|---|---|
| Intent text search ("balayage under ₹3000 … this evening") | `services/marketplace.ts` (LLM/regex intent → pgvector + lexical → filters → live slots) | UNIT *Intent parser: RFP example*; INT *Intent search…*; E2E marketplace |
| Visual search (hairstyle photo) | vision via Groq Llama-4-Scout / Gemini → query | manual (needs a free vision key) |
| Aggregated deals (AI discounts, last-minute, off-peak) | `deals` table + public feed | INT *Public (anon) can read live deals…*, *last-minute deal* |

## Module 6 — Billing, POS & GST

| Feature | Implementation | Tests |
|---|---|---|
| UPI / card / netbanking + split payouts (owner, booth renter, tax bucket) | `billing` agent, `domain/gst.ts splitPayout`, `services/invoicing.ts` | UNIT *Split payout…*; INT *Checkout by booth renter…* |
| e-invoicing, CGST/SGST/IGST | `computeInvoice`, FY numbering, IRN-format reference | UNIT *GST* (3); INT *Checkout by booth renter…* |
| ITC reconciliation + monthly return drafts | `gst` agent → GSTR-1 / GSTR-3B | UNIT *GSTR-3B uses ITC…*; INT *ITC: inter-state PO received…* |

## §4 Technical & cloud specifications — what the PDF names vs. what is built

| PDF spec | Built | Tests / evidence |
|---|---|---|
| Cloud-native **microservices** | `web` (Next.js) + `agent-worker` (event-bus consumer microservice) + `agents-tick` CronJob; Dockerfiles for both | INT *microservices* (web publishes, worker container consumes async) |
| **Kubernetes (EKS/GKE)** orchestration | `deploy/k8s`: Deployments, Services, **HPA** (web 2→20, worker 1→10), PDB, CronJob, Ingress, Kustomize; GKE/EKS steps in `docs/DEPLOY_K8S.md` | images built + containers run here; `scripts/validate_k8s.py` statically validates all manifests in CI; live cluster not created (sandbox permission) |
| **Serverless** for spikes | Vercel functions (default topology), `bom1` region | production deployment |
| PostgreSQL for transactional data | Supabase Postgres, RLS, exclusion constraints | all INT tests |
| **Vector DB (pgvector)** | `services.embedding vector(768)` + `match_services`; LangChain `Embeddings` (Gemini / local) | INT *Intent search…* |
| LLMs (**OpenAI GPT, Anthropic Claude, Google Gemini**) via **LangChain** | `src/lib/ai/llm.ts` on **LangChain.js** `BaseChatModel`s: Gemini, OpenAI GPT, Claude, plus free Groq/OpenRouter/HF/Ollama; fallback chain + rules engine | every INT test (rules mode); `USE_LLM_IN_TESTS=1` with keys |
| Multilingual conversational AI (**Hindi, Tamil, Telugu, Bengali, Marathi**…) | LLM replies in the customer's language; **native-script rules engine for 13 languages** — en, hi, bn, mr, te, ta, gu, ur, kn, or, ml, pa, as (script detection, NFC-normalised keywords, all Indian digit systems; no key needed) | UNIT *Multilingual rules engine*, *13 languages: booking request in every new script…*, *Colour is not mistaken for tomorrow*; INT *A customer books entirely in Tamil*, *Kannada and Urdu customers book end-to-end*, *Hindi price question* |
| Localized consumer experience | Marketplace, salon page and chat in 13 languages incl. right-to-left Urdu; search understands all of them without an AI key | UNIT *Every consumer UI language is complete and its example searches parse*; E2E phone audit in en/ta/ur |
| Low-bandwidth 4G/5G, mobile-first | Server components (~111 kB first load), image downscaling before upload, PWA; every owner and consumer page verified at 390px with no sideways scroll | build output; E2E *mobile audit* |
| Extreme concurrency (festival peaks) | DB exclusion constraints, atomic event claiming, HPAs | INT *Festival rush: 20 simultaneous bookings → exactly one wins* |
| **AES-256**, ISO 27001 / SOC 2 readiness, **DPDP** | AES-256-GCM field encryption, RLS, audit trail, consent/export/erasure — see `docs/SECURITY.md` | UNIT *AES-256-GCM…*; INT *Tenant isolation…*; E2E DPDP deletion |

## Added after market research (Zenoti, Fresha, Boulevard, MioSalon, Dingg, Zylu, SalonBoost, OpenSalon)

| Feature | Agent / code | Tests |
|---|---|---|
| Memberships (auto-discount) | `membership_plans`, `client_memberships`, `billing` | UNIT *Checkout…*; INT *Membership discount + points…*, *Membership sale…* |
| Prepaid wallet | `wallet_transactions`, `walletSplit` | UNIT *Loyalty earn + wallet split*; INT *…wallet pays first* |
| Loyalty points & referrals | `loyalty` agent | INT *Checkout…loyalty*, *Referral bonus…* |
| Automated waitlist (+ "YES" to book) | `waitlist` agent + concierge | UNIT *Waitlist: FIFO match*; INT *…waitlist offered the slot; YES books it* |
| Staff leave / blocked time | `staff_time_off`, scheduler | UNIT *staff on leave*; INT *Staff leave blocks the scheduler* |
| Review requests, service recovery, rebooking | `reputation` agent | INT *Checkout…review request*, *Low rating triggers service recovery* |
| Birthday campaigns | `retention` agent | UNIT *Birthday countdown*; INT *Birthday campaign* |
| Rescheduling | `rescheduleBooking` | INT *Reschedule…* |
| Visit-history import | `logPastVisit` | INT *Autonomous campaign…* (rejects future dates) |

## Ported from open-source projects (second sweep)

| Feature | Source idea | Tests |
|---|---|---|
| No double-booking guaranteed by Postgres exclusion constraints | Kontor | INT *Postgres exclusion constraint makes double-booking impossible…* |
| Two-phase AI booking (propose → customer YES) | Kontor | INT *Unified inbox… (proposal, then "haan, confirm")*; E2E concierge proposal + confirmation |
| Human handoff (complaints, repeated confusion) | Kontor | INT *Complaint escalates to a human…*, *Two unclear messages…* |
| UPI deposit links + QR | upi-pg | UNIT *UPI deep link…*; INT *No-show mitigation… carries an NPCI UPI link* |
| PF / ESI / professional tax | frappe/india-payroll | UNIT *Statutory payroll…*; INT *Payroll…* |
| CSV client import | pronto | UNIT *CSV import…*; INT *CSV client import…* |
| Stylist ICS calendar feed | easyappointments | UNIT *ICS feed…*; INT *Stylist ICS feed* (HTTP, with BASE_URL) |
| Face-shape style advisor | hairstyle-recommendation repos | manual (needs a free vision key) |

## Languages, voice and front desk (third research sweep)

| Feature | Agent / code | Tests |
|---|---|---|
| Indic translation through free providers (LLM → MyMemory → Hugging Face opus-mt), script check, PII masking | `src/lib/ai/translate.ts`, `domain/translate.ts` | UNIT *Translation gateway guards…*; INT *Gateway translates English → Tamil and Kannada → English…* |
| Catalogue in 12 Indian languages on salon page, marketplace and search | `translator` agent, table `translations` (migration 0008) | INT *Translator Agent stores the catalogue…*; E2E salon page in Hindi |
| Inbox: Translate toggle; reply in the customer's language; rules-engine campaigns translated | `/app/inbox`, `manualReply`, `llmTextIn` | E2E Tamil → English, English → Tamil reply |
| Voice Agent: navigate, fill forms, save on request, answer business questions; browser STT, Whisper fallback; Ctrl+K palette | `voice` agent, `domain/voice.ts`, `VoiceAssistant`, `/api/voice/*` | UNIT *Voice agent…* (4); INT *A spoken sentence becomes safe UI actions…*; E2E sign-up fill, add client, save, Q&A, microphone stand-in |
| Walk-in token queue with QR self check-in and live wait estimates | `queue` agent, `services/queue.ts`, `domain/queue.ts`, `/s/[slug]/queue` (migration 0009) | UNIT *Walk-in queue…*; INT *Walk-ins get sequential tokens…*; E2E desk token, QR join, call |
| Day-end closing report (payment modes, cash to count, GST bucket, booth payouts) | `domain/dayclose.ts`, Billing page | UNIT *Day-end closing…*; INT *Day-end closing adds up the real invoices…*; E2E |
| Daily owner briefing on WhatsApp | `briefing` agent | INT *Daily Briefing Agent messages the owner once a day…* |
| Append-only audit trail live | migration 0007 | INT *Changes to sensitive tables are logged…* |
| Owner dashboard, sign-in / sign-up and the public queue page in 13 languages (Urdu right-to-left) | `src/lib/i18n/app/*` (hand-made, 442 strings × 12 languages), `UiTranslator`, `/api/i18n/ui` (allowlisted runtime fallback, cached per salon), queue strings in `i18n/ui*.ts` | UNIT *Owner dashboard dictionaries…*, *UI string allowlist is up to date…*; E2E Hindi dashboard, Urdu RTL dashboard at 390px, Tamil queue page |
| Voice replies in the user's language; on-device Whisper when the browser has no recogniser and no server key | `translateKeeping` (names masked), `VoiceAssistant` (transformers.js + `onnx-community/whisper-base`) | INT *A Hindi voice question is answered in Hindi…*; E2E Hindi voice command; E2E `E2E_STT_WAV=…` real audio → on-device Whisper |
| Phone UX: bottom tab bar, voice button, proper `tel` keyboards | `Sidebar.tsx` | E2E mobile audit (17 pages at 390px) |

## Proposal (RFP §5)

Timeline, development cost, cloud infrastructure and AI token projections: [`PROPOSAL.md`](PROPOSAL.md).

## Known limits (honest)

* Voice: browser speech recognition needs Chrome, Edge or Safari; the server Whisper fallback needs a free `GROQ_API_KEY` or `HF_TOKEN` and was not exercised with a live key here. The Hugging Face opus-mt translation tier is likewise untested without a valid token; MyMemory (keyless) is tested live.
* The owner dashboard and the public queue page are in English; the marketplace, salon page and chat are in 13 languages.
* WhatsApp/SMS sends are real only with WhatsApp Cloud API keys; otherwise logged as `simulated`.
* Vendor replies in negotiation are simulated from learned flexibility (no supplier API exists to call).
* IRN is a deterministic reference hash in the IRP format; a real IRN needs a GSP/IRP integration.
* Job-board "parsing" = generated ads + boolean search strings; scraping Naukri/LinkedIn violates their ToS.
* Voice screening/calls: call transcripts are handled as a channel; live voice needs a telephony provider.
* ISO 27001 / SOC 2 are organisational certifications — the app provides the technical controls (RLS, audit log, encryption at rest via Supabase), not the certificate.
