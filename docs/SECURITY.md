# Security & compliance controls (RFP §4)

| Requirement | Control in SalonMind | Evidence |
|---|---|---|
| End-to-end encryption (AES-256) | TLS 1.2+ in transit (Vercel/Supabase); AES-256 disk encryption at rest (Supabase); **app-level AES-256-GCM** for sensitive free text — client health/allergy notes and candidate resumes are ciphertext in the DB, backups and logs (`src/lib/security/crypto.ts`, key `DATA_ENCRYPTION_KEY`) | unit test *AES-256-GCM field encryption* (round-trip, random IV, tamper detection) |
| Tenant isolation | Postgres Row-Level Security on every table; browser holds only publishable key + user JWT; DB exclusion constraints | integration *Tenant isolation…*, *Public (anon)…* |
| Least privilege | security-definer RPCs gated to roles; anon cannot execute helper functions; agents act via a scoped service account (no service-role key) | Supabase advisors; migrations 0003, 0005 |
| Audit logging (ISO 27001 A.8.15 / SOC 2 CC7.2) | Every autonomous action in `agent_runs` + `agent_events`. **Append-only `audit_log`** trigger on sensitive tables (actor, actor type, table, op, row, changed column names — never values) | migration `0007_audit_log.sql` — *pending approval in Supabase at the time of writing* |
| Change management / secure SDLC (A.8.25–8.29, CC8.1) | CI on every push (typecheck, 40 unit tests, build, Kubernetes manifest validation, Docker image builds); 46 real-DB integration tests; browser E2E; reviewed migrations | `.github/workflows/ci.yml`, `docs/RFP_COVERAGE.md` |
| Availability (A.8.14, A1.2) | Serverless autoscaling; K8s HPAs, PDBs, rolling updates with zero unavailable; health/readiness probes | `deploy/k8s` |
| AI safety | LLM output is parsed into typed JSON and validated; prices/slots/tax computed by domain code, never the model; AI bookings are two-phase (customer must say YES); complaints escalate to humans | integration *two-phase*, *handoff* |
| DPDP Act 2023 | Purpose-bound consent (`consent_marketing`), data export (`/api/clients/:id/export`), client erasure (anonymise + keep de-identified tax records), **owner self-deletion** of account and salons, data minimisation in audit logs, Indian data residency (Supabase `ap-south-1`, Vercel `bom1`) | integration + E2E *DPDP erasure* |

## Translation, voice and the public queue — data handling

* **Translation:** before any text is sent to a translation provider, phone numbers, e-mail addresses, UPI ids and
  links are replaced by placeholders and restored afterwards (`maskPii`, tested). Catalogue translations are public
  rows; cached inbox translations are private rows (`translations.is_public = false`) that anonymous visitors cannot
  read (integration test).
* **Voice:** only the page's field names and labels are sent to the server, never the values already typed. The agent
  log stores the kind of action taken, not what was said. Passwords, OTP / card fields and delete buttons are blocked
  in the validator that every proposed action passes through — whether it came from the rules engine or an LLM.
  Anonymous visitors (sign-in / sign-up pages) never trigger a model call.
* **Dashboard translation:** only strings that exist in the app's source (generated allowlist `src/lib/i18n/app/source.ts`)
  are ever sent to a translation provider; client names, notes and messages are never matched, so never sent.
* **On-device speech:** when the browser has no speech recogniser and no server key is set, Whisper runs inside the
  browser (Hugging Face transformers.js); the audio never leaves the device.
* **Walk-in queue:** the public page shows token numbers and wait times only; names and phone numbers are readable
  by salon staff alone (RLS, integration test).
* **Audit log:** migration `0007_audit_log.sql` is applied in production; the integration test proves entries cannot
  be edited or deleted and never contain values.

* **Manage-my-booking link:** `/b/<token>` uses a random UUID per booking (`bookings.manage_token`, 122 bits) as the
  only credential. The page shows that one booking (service, time, stylist, price) — never phone numbers or other
  customers — is marked `noindex`, and changes are rate-limited per IP and closed 2 hours before the appointment.
* **Gift cards:** codes avoid look-alike characters and are unique per salon; redemption uses a conditional update on
  the balance so two tills cannot spend the same balance twice. Codes, amounts and dates are appended to WhatsApp
  messages verbatim — the model only writes the greeting.

## What remains organisational (cannot be "built in")

ISO 27001 certification and a SOC 2 Type II report require an ISMS, risk register, policies, access
reviews, vendor management and an external auditor over an observation window. The controls above are
the technical evidence an auditor would sample; the certificates themselves are a business process.
