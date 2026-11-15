---
description: Typecheck, unit test, build, then walk the manual test script in the browser
---
1. Run `npm run typecheck`.
2. Run `npm test` — all domain tests must pass.
3. Run `npm run build`.
4. Start `npm run start` and open http://localhost:3000 in the browser agent.
5. Follow `docs/TESTING.md` sections relevant to the change; capture screenshots as artifacts.
6. Optionally run `BASE_URL=http://localhost:3000 node tests/e2e.mjs`.
