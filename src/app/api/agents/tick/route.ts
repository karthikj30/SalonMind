import { NextResponse, type NextRequest } from "next/server";
import { botClient } from "@/lib/supabase/bot";
import { normalizeTenant, tick } from "@/lib/agents/runtime";
import type { Tenant } from "@/lib/agents/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Orchestrator heartbeat. Called by Supabase pg_cron (every 30 min, via pg_net) and Vercel Cron (daily).
 * Auth: `Authorization: Bearer $CRON_SECRET`. Runs every tenant's periodic agents and drains their event bus.
 */
async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await botClient();
  const { data: tenants } = await db.from("tenants").select("*");
  const t0 = Date.now();
  const report: { tenant: string; agents: number; events: number }[] = [];
  for (const t of (tenants ?? []) as Tenant[]) {
    if (Date.now() - t0 > 50_000) break;
    const r = await tick(db, normalizeTenant(t));
    report.push({ tenant: t.slug, agents: r.results.length, events: r.events });
  }
  return NextResponse.json({ ok: true, ran: report.length, of: tenants?.length ?? 0, report, ms: Date.now() - t0 });
}

export const GET = handle;
export const POST = handle;
