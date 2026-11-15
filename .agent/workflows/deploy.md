---
description: Deploy to Vercel (free Hobby plan)
---
1. Push to `main` on GitHub — the Vercel project is connected to the repo and auto-deploys.
2. Env vars in Vercel: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, AGENT_BOT_EMAIL,
   AGENT_BOT_PASSWORD, CRON_SECRET, plus optional GROQ_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY.
3. Apply new migrations in `supabase/migrations` to the Supabase project.
4. Smoke test production with `BASE_URL=https://<project>.vercel.app node tests/e2e.mjs` and clean up the test salon.
