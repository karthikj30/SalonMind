# RFP coverage & test traceability

Every requirement in `docs/Salon_Management_System_RFP.pdf`, where it lives in the code, and the test
that proves it. Three test layers:

* **Unit** — `npm test` → `tests/domain.test.ts` (19 tests, pure business rules)
* **Integration (real Postgres, no mocks)** — `npm run test:integration` → `tests/integration/rfp.test.mts`
  (27 tests; creates a throw-away salon through the same service functions the UI uses, runs the real
  agents, asserts on rows they wrote, deletes everything)
* **E2E (real browser, real UI)** — `BASE_URL=… node tests/e2e.mjs` (signup → … → account deletion)

## §1–2 Objective & architecture

| Requirement | Implementation | Tests |
|---|---|---|
| Multi-tenant SaaS for any Indian salon | `tenants`, `tenant_members`, RLS on every table (`supabase/migrations`) | INT *Tenant isolation…*, INT *Public (anon) can read…*, E2E signup/onboarding |
| AI-native, autonomous multi-agent network communicating asynchronously | `src/lib/agents/*` (16 agents), event bus `agent_events`, `processEvents`, `tick` | INT *Orchestrator tick…* + every event-chain test below |
| Self-optimizing engine | `optimizer` agent tunes `tenants.settings` | INT *Self-optimizer tightens deposit threshold…* |
| Auto-generated localized micro-frontends | AI Studio `generateLayout` → typed widget schema, any language | INT *Generative micro-frontend…*, E2E AI Studio |
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
| Unified inbox (Instagram, WhatsApp, Google, calls) + AI rep | `concierge` agent, `/app/inbox`, public web chat | INT *Unified inbox: every channel gets an AI reply…*; E2E inbox |

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

## §4 Technical specs

| Spec | How | Tests |
|---|---|---|
| Relational + vector DB | Postgres + pgvector `match_services` | INT *Intent search…* |
| Unified LLM abstraction | `src/lib/ai/llm.ts` provider chain + rules fallback | every INT test runs in rules mode; `USE_LLM_IN_TESTS=1` runs them with your keys |
| Multilingual (hi, ta, te, bn, mr …) | client `language` → prompts; Devanagari/Hinglish rules | INT *Unified inbox… Hinglish* |
| Low-bandwidth mobile | Server components, ~107 kB first load, image downscaling before upload | build output |
| Security & DPDP | RLS, least-privilege RPCs, consent, export, erasure, owner self-deletion | INT *Tenant isolation…*; E2E DPDP deletion |

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

## Known limits (honest)

* WhatsApp/SMS sends are real only with WhatsApp Cloud API keys; otherwise logged as `simulated`.
* Vendor replies in negotiation are simulated from learned flexibility (no supplier API exists to call).
* IRN is a deterministic reference hash in the IRP format; a real IRN needs a GSP/IRP integration.
* Job-board "parsing" = generated ads + boolean search strings; scraping Naukri/LinkedIn violates their ToS.
* Voice screening/calls: call transcripts are handled as a channel; live voice needs a telephony provider.
* ISO 27001 / SOC 2 are organisational certifications — the app provides the technical controls (RLS, audit log, encryption at rest via Supabase), not the certificate.
