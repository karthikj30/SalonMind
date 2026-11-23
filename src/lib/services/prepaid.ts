import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tenant } from "../agents/types";
import { emit } from "../agents/bus";
import { giftCardUsable, giftCode, normalizeGiftCode } from "../domain/prepaid";
import { issueInvoice } from "./invoicing";
import { addDays, todayIst } from "../time";

/** Public base URL for links we send customers (manage-booking, gift cards). */
export function appUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "";
}

export function manageLink(token: string) {
  return `${appUrl()}/b/${token}`;
}

/**
 * Sell a gift card. No GST invoice: a voucher is a payment instrument — GST is charged on the service it pays
 * for. The Prepaid Value Agent delivers the code over WhatsApp.
 */
export async function sellGiftCard(db: SupabaseClient, tenant: Tenant, p: {
  amount: number; validity_days?: number; buyer_name?: string | null; buyer_phone?: string | null;
  recipient_name?: string | null; recipient_phone?: string | null; message?: string | null; payment_method?: string;
}) {
  if (!(p.amount > 0) || p.amount > 200_000) throw new Error("Enter a gift card amount between ₹1 and ₹2,00,000");
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = giftCode();
    const { data, error } = await db.from("gift_cards").insert({
      tenant_id: tenant.id, code, amount: p.amount, balance: p.amount,
      buyer_name: p.buyer_name || null, buyer_phone: p.buyer_phone || null,
      recipient_name: p.recipient_name || null, recipient_phone: p.recipient_phone || null, message: p.message || null,
      payment_method: p.payment_method ?? "upi", expires_at: addDays(todayIst(), p.validity_days ?? 365),
    }).select("*").single();
    if (error?.code === "23505") continue; // code collision — draw another
    if (error) throw new Error(error.message);
    await emit(db, tenant.id, "giftcard.sold", { gift_card_id: data.id }, "pos");
    return data as { id: string; code: string; amount: number; expires_at: string };
  }
  throw new Error("Could not generate a unique gift card code — try again");
}

/** Look a card up by whatever the cashier typed. Throws a customer-friendly reason when it can't pay. */
export async function findUsableGiftCard(db: SupabaseClient, tenantId: string, typed: string) {
  const code = normalizeGiftCode(typed);
  if (!code) throw new Error(`"${typed}" is not a gift card code (format GC-XXXX-XXXX)`);
  const { data } = await db.from("gift_cards").select("*").eq("tenant_id", tenantId).eq("code", code).maybeSingle();
  if (!data) throw new Error(`Gift card ${code} not found`);
  const ok = giftCardUsable(data, todayIst());
  if (!ok.ok) throw new Error(`${code}: ${ok.reason}`);
  return data as { id: string; code: string; balance: number; amount: number; expires_at: string; status: string };
}

/** Sell a prepaid package (N sessions of one service). GST is invoiced now, in full. */
export async function sellPackage(db: SupabaseClient, tenant: Tenant, p: { client_id: string; plan_id: string; payment_method?: string }) {
  const { data: plan } = await db.from("package_plans").select("*, services(name)").eq("id", p.plan_id).eq("tenant_id", tenant.id).single();
  if (!plan) throw new Error("Package not found");
  if (!plan.active) throw new Error("This package is no longer on sale");
  const service = plan.services as { name: string } | null;
  const r = await issueInvoice(db, tenant, {
    client_id: p.client_id, method: p.payment_method ?? "upi",
    lines: [{ description: `Package: ${plan.name} (${plan.sessions} × ${service?.name ?? "service"}, ${plan.validity_days} days)`, kind: "service", code: "999721", qty: 1, rate: tenant.settings.gst_rate, unit_price: Number(plan.price) }],
  });
  const { data: cp, error } = await db.from("client_packages").insert({
    tenant_id: tenant.id, client_id: p.client_id, plan_id: plan.id, service_id: plan.service_id,
    sessions_total: plan.sessions, sessions_left: plan.sessions, expires_at: addDays(todayIst(), plan.validity_days), invoice_id: r.id,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await emit(db, tenant.id, "invoice.issued", { invoice_id: r.id, client_id: p.client_id, total: r.inv.total }, "pos");
  return { package_id: cp.id as string, invoice: r, plan };
}
