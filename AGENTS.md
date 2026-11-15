# SalonMind workspace rules (Antigravity)

- Read `docs/ANTIGRAVITY_PROMPT.md` and `docs/ARCHITECTURE.md` before planning any change.
- Free tier only. Never add a paid service, a paid model, or a dependency that needs a credit card.
- Every LLM call goes through `src/lib/ai/llm.ts` (`llm`, `llmJson`, `llmText`) with a rules fallback.
- Prices, slots, tax and payroll are computed by `src/lib/domain/*` — never by the model.
- New autonomous behaviour = a new agent in `src/lib/agents/*`, registered in `registry.ts`, that logs a run
  and communicates through `emit()` events. No direct agent-to-agent calls.
- Every new table: `tenant_id` + RLS `tenant_isolation` policy in a new migration under `supabase/migrations`.
- No seed/synthetic data. Users create data manually through the UI.
- All times IST (`src/lib/time.ts`), money via `inr()`, GST via `src/lib/domain/gst.ts`.
- Before committing: `npm run typecheck && npm test && npm run build`, then `npm run test:integration` (real DB) and verify in the browser.
- Every new agent/feature gets a row in `docs/RFP_COVERAGE.md` and an integration test in `tests/integration/`.
