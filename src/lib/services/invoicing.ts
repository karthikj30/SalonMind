import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tenant } from "../agents/types";
import { computeInvoice, invoiceNumber, pseudoIrn, splitPayout, type TaxLine } from "../domain/gst";
import { todayIst } from "../time";

/** Issue a GST invoice (shared by POS checkout and membership sales). */
export async function issueInvoice(db: SupabaseClient, tenant: Tenant, p: {
  booking_id?: string | null; client_id: string | null; lines: TaxLine[]; method: string;
  renter?: { name: string; booth_rent_pct: number } | null; depositPaid?: number; walletUsed?: number; extra?: Record<string, unknown>;
}) {
  // Place of supply for in-salon services = salon's state (physical-presence rule) → CGST+SGST
  const pos = tenant.state_code ?? null;
  const inv = computeInvoice(p.lines, tenant.state_code, pos);
  const { count } = await db.from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id);
  const number = invoiceNumber((tenant.slug.replace(/[^a-z0-9]/gi, "").slice(0, 4) || "SM").toUpperCase(), new Date(), (count ?? 0) + 1);
  const deposit = p.depositPaid ?? 0, wallet = p.walletUsed ?? 0;
  const viaRail = Math.max(0, Math.round((inv.total - deposit - wallet) * 100) / 100);
  // gateway fee only applies to money moving over the chosen rail, not the prepaid wallet
  const s = splitPayout({ ...inv, total: viaRail }, p.method, p.renter ?? null);
  const splits = { ...s, deposit_adjusted: deposit, wallet_used: wallet, collected_now: viaRail, ...(p.extra ?? {}) };
  const irn = tenant.gstin ? await pseudoIrn(tenant.gstin, number, todayIst()) : null;
  const { data, error } = await db.from("invoices").insert({
    tenant_id: tenant.id, booking_id: p.booking_id ?? null, client_id: p.client_id, number, place_of_supply: pos, items: inv.items,
    taxable_value: inv.taxable_value, cgst: inv.cgst, sgst: inv.sgst, igst: inv.igst, total: inv.total,
    payment_method: wallet > 0 && viaRail === 0 ? "wallet" : p.method, payment_status: "paid", splits, irn,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, number, inv, splits };
}

export async function activeMembership(db: SupabaseClient, clientId: string) {
  const { data } = await db.from("client_memberships").select("id, ends_at, membership_plans(name, discount_pct)")
    .eq("client_id", clientId).gte("ends_at", todayIst()).order("ends_at", { ascending: false }).limit(1).maybeSingle();
  const plan = data?.membership_plans as unknown as { name: string; discount_pct: number } | null;
  return data && plan ? { name: plan.name, discount_pct: Number(plan.discount_pct), ends_at: data.ends_at as string } : null;
}
