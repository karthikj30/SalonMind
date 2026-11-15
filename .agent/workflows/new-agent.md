---
description: Add a new autonomous agent to the mesh
---
1. Define the business rule as a pure function in `src/lib/domain/` and add node:test cases.
2. Create the agent in `src/lib/agents/<module>.ts`: `{ id, name, module, description, subscribes, periodic, run }`.
3. `run` loads data with `ctx.db` (RLS-scoped), calls the domain function, uses `llmJson/llmText` only for
   language tasks with a rules fallback, writes results, returns `{ summary, actions, emits, provider }`.
4. Register it in `src/lib/agents/registry.ts`.
5. Emit its trigger event from the relevant server action (`src/app/app/actions.ts`) and call `processEvents`.
6. Verify in the Agent Console (run log + event bus) — follow the `verify` workflow.
