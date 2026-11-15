import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantSettings } from "../domain/types";

export type Tenant = {
  id: string; name: string; slug: string; city: string | null; state: string | null; state_code: string | null;
  gstin: string | null; address: string | null; phone: string | null; description: string | null;
  is_published: boolean; google_review_url?: string | null; upi_vpa?: string | null; open_time: string; close_time: string; settings: TenantSettings; ui_layout: unknown;
};

export type Ctx = { db: SupabaseClient; tenant: Tenant; trigger: string };
export type AgentEvent = { id: string; tenant_id: string; type: string; payload: Record<string, unknown>; source: string };
export type Action = { type: string; label: string; ref?: string };
export type Emit = { type: string; payload: Record<string, unknown> };
export type AgentOutput = { summary: string; actions?: Action[]; output?: unknown; provider?: string; emits?: Emit[]; skipLog?: boolean };

export type AgentDef = {
  id: string;
  name: string;
  module: string;
  description: string;
  subscribes: string[];
  periodic: boolean;
  run: (ctx: Ctx, event?: AgentEvent) => Promise<AgentOutput>;
};
