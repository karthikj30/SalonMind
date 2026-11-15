# Security & compliance controls (RFP §4)

| Requirement | Control in SalonMind | Evidence |
|---|---|---|
| End-to-end encryption (AES-256) | TLS 1.2+ in transit (Vercel/Supabase); AES-256 disk encryption at rest (Supabase); **app-level AES-256-GCM** for sensitive free text — client health/allergy notes and candidate resumes are ciphertext in the DB, backups and logs (`src/lib/security/crypto.ts`, key `DATA_ENCRYPTION_KEY`) | unit test *AES-256-GCM field encryption* (round-trip, random IV, tamper detection) |
| Tenant isolation | Postgres Row-Level Security on every table; browser holds only publishable key + user JWT; DB exclusion constraints | integration *Tenant isolation…*, *Public (anon)…* |
| Least privilege | security-definer RPCs gated to roles; anon cannot execute helper functions; agents act via a scoped service account (no service-role key) | Supabase advisors; migrations 0003, 0005 |
| Audit logging (ISO 27001 A.8.15 / SOC 2 CC7.2) | Every autonomous action in `agent_runs` + `agent_events`. **Append-only `audit_log`** trigger on sensitive tables (actor, actor type, table, op, row, changed column names — never values) | migration `0007_audit_log.sql` — *pending approval in Supabase at the time of writing* |
| Change management / secure SDLC (A.8.25–8.29, CC8.1) | CI on every push (typecheck, 30 unit tests, build, Kubernetes manifest validation, Docker image builds); 38 real-DB integration tests; browser E2E; reviewed migrations | `.github/workflows/ci.yml`, `docs/RFP_COVERAGE.md` |
| Availability (A.8.14, A1.2) | Serverless autoscaling; K8s HPAs, PDBs, rolling updates with zero unavailable; health/readiness probes | `deploy/k8s` |
| AI safety | LLM output is parsed into typed JSON and validated; prices/slots/tax computed by domain code, never the model; AI bookings are two-phase (customer must say YES); complaints escalate to humans | integration *two-phase*, *handoff* |
| DPDP Act 2023 | Purpose-bound consent (`consent_marketing`), data export (`/api/clients/:id/export`), client erasure (anonymise + keep de-identified tax records), **owner self-deletion** of account and salons, data minimisation in audit logs, Indian data residency (Supabase `ap-south-1`, Vercel `bom1`) | integration + E2E *DPDP erasure* |

## What remains organisational (cannot be "built in")

ISO 27001 certification and a SOC 2 Type II report require an ISMS, risk register, policies, access
reviews, vendor management and an external auditor over an observation window. The controls above are
the technical evidence an auditor would sample; the certificates themselves are a business process.
