import "server-only";
import type { AgentDef } from "./types";
import { buildReturns, computeInvoice, invoiceNumber, pseudoIrn, splitPayout, type TaxLine } from "../domain/gst";
import { inr, todayIst } from "../time";
import { llmText } from "../ai/llm";

/** Module 6 — Billing/POS: on completion → GST e-invoice, split payout, inventory consumption. */
export const billingAgent: AgentDef = {
  id: "billing",
  name: "Billing & POS Agent",
  module: "Billing, POS & GST",
  description: "On service completion: issues a GST e-invoice (CGST/SGST or IGST), computes split payouts (owner / booth renter / tax bucket) and consumes inventory per service recipe.",
  subscribes: ["booking.completed"],
  periodic: false,
  async run({ db, tenant }, ev) {
    const p = ev!.payload as { booking_id: string; payment_method?: string; products?: { product_id: string; qty: number }[] };
    const { data: b } = await db.from("bookings").select("*, services(name, sac), staff(id, name, employment_type, booth_rent_pct), clients(id, state_code)").eq("id", p.booking_id).single();
    if (!b) return { summary: "Booking not found" };
    const { data: existing } = await db.from("invoices").select("id").eq("booking_id", b.id).maybeSingle();
    if (existing) return { summary: "Invoice already issued.", skipLog: true };
    const gstRate = tenant.settings.gst_rate;
    const lines: TaxLine[] = [{ description: b.services?.name ?? "Salon service", kind: "service", code: b.services?.sac ?? "999721", qty: 1, rate: gstRate, unit_price: Number(b.price), staff_id: b.staff_id }];
    const actions = [];
    for (const it of p.products ?? []) {
      const { data: prod } = await db.from("products").select("*").eq("id", it.product_id).single();
      if (!prod) continue;
      lines.push({ description: prod.name, kind: "product", code: prod.hsn ?? "3305", qty: it.qty, rate: Number(prod.gst_rate), unit_price: Number(prod.retail_price || prod.unit_cost), staff_id: b.staff_id, product_id: prod.id });
      await db.from("products").update({ stock_qty: Number(prod.stock_qty) - it.qty }).eq("id", prod.id);
    }
    // Deduct back-bar consumption by recipe (expected usage) — smart-scale logs can later record actual usage
    const { data: recipe } = await db.from("service_products").select("product_id, qty_per_service, products(stock_qty, name)").eq("service_id", b.service_id);
    for (const r of recipe ?? []) {
      const prod = r.products as unknown as { stock_qty: number; name: string };
      await db.from("products").update({ stock_qty: Number(prod.stock_qty) - Number(r.qty_per_service) }).eq("id", r.product_id);
      await db.from("usage_logs").insert({ tenant_id: tenant.id, product_id: r.product_id, booking_id: b.id, staff_id: b.staff_id, expected_qty: r.qty_per_service, actual_qty: r.qty_per_service, source: "auto" });
    }
    if (recipe?.length) actions.push({ type: "inventory", label: `Consumed ${recipe.length} back-bar product(s) per recipe` });

    // Place of supply for in-salon services = salon's state (physical-presence rule) → CGST+SGST
    const pos = tenant.state_code ?? null;
    const inv = computeInvoice(lines, tenant.state_code, pos);
    const { count } = await db.from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id);
    const number = invoiceNumber((tenant.slug.replace(/[^a-z0-9]/gi, "").slice(0, 4) || "SM").toUpperCase(), new Date(), (count ?? 0) + 1);
    const method = p.payment_method ?? "upi";
    const renter = b.staff?.employment_type === "booth_renter" ? { name: b.staff.name, booth_rent_pct: Number(b.staff.booth_rent_pct) } : null;
    const splits = splitPayout(inv, method, renter);
    const balance = Math.max(0, inv.total - Number(b.deposit_paid));
    const irn = tenant.gstin ? await pseudoIrn(tenant.gstin, number, todayIst()) : null;
    const { data: invoice, error } = await db.from("invoices").insert({
      tenant_id: tenant.id, booking_id: b.id, client_id: b.client_id, number, place_of_supply: pos, items: inv.items,
      taxable_value: inv.taxable_value, cgst: inv.cgst, sgst: inv.sgst, igst: inv.igst, total: inv.total,
      payment_method: method, payment_status: "paid", splits: { ...splits, deposit_adjusted: Number(b.deposit_paid), collected_now: balance }, irn,
    }).select("id").single();
    if (error) throw new Error(error.message);
    actions.unshift({ type: "invoice", label: `Invoice ${number}: ${inr(inv.total)} (CGST ${inr(inv.cgst)} + SGST ${inr(inv.sgst)}${inv.igst ? " + IGST " + inr(inv.igst) : ""}) via ${method.toUpperCase()}`, ref: invoice.id });
    if (renter) actions.push({ type: "split", label: `Booth renter ${renter.name} payout ${inr(splits.booth_renter!.amount)}` });
    return { summary: `Issued ${number} for ${inr(inv.total)}; owner share ${inr(splits.salon_owner)}, tax bucket ${inr(splits.tax_bucket)}.`, actions, emits: [{ type: "stock.check", payload: {} }] };
  },
};

/** Module 6 — GST autonomous engine: monthly GSTR-1 / GSTR-3B drafts with ITC reconciliation. */
export const gstAgent: AgentDef = {
  id: "gst",
  name: "GST Compliance Agent",
  module: "Billing, POS & GST",
  description: "Prepares month-to-date GSTR-1 (B2CS, HSN/SAC, documents) and GSTR-3B drafts, reconciling input tax credit from received purchase orders.",
  subscribes: ["gst.prepare"],
  periodic: true,
  async run({ db, tenant }, ev) {
    const period = (ev?.payload.period as string) ?? todayIst().slice(0, 7);
    const from = `${period}-01`;
    const [y, m] = period.split("-").map(Number);
    const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const [{ data: invoices }, { data: pos }] = await Promise.all([
      db.from("invoices").select("*").eq("tenant_id", tenant.id).gte("invoice_date", from).lte("invoice_date", to),
      db.from("purchase_orders").select("subtotal, gst_amount, is_interstate").eq("tenant_id", tenant.id).eq("status", "received").gte("received_at", `${from}T00:00:00+05:30`).lte("received_at", `${to}T23:59:59+05:30`),
    ]);
    const ret = buildReturns((invoices ?? []) as never, (pos ?? []) as never);
    const g = ret.gstr3b;
    const notes = await llmText({
      system: "You are a GST assistant for an Indian salon. In ≤60 words, summarise this month's GST position and one compliance tip (due dates: GSTR-1 by 11th, GSTR-3B by 20th of next month). Plain text.",
      messages: [{ role: "user", content: JSON.stringify({ period, invoices: invoices?.length ?? 0, ...g }) }],
    }, () => `${period}: ${invoices?.length ?? 0} invoice(s), outward taxable ${inr(g.outward_taxable.taxable)}. Output tax ${inr(g.outward_taxable.cgst + g.outward_taxable.sgst + g.outward_taxable.igst)}, ITC ${inr(g.itc_available.cgst + g.itc_available.sgst + g.itc_available.igst)}, net cash payable ${inr(g.tax_payable_cash.cgst + g.tax_payable_cash.sgst + g.tax_payable_cash.igst)}. File GSTR-1 by the 11th and GSTR-3B by the 20th.`);
    await db.from("gst_returns").upsert({ tenant_id: tenant.id, period, gstr1: ret.gstr1, gstr3b: ret.gstr3b, itc: ret.itc, notes: notes.text }, { onConflict: "tenant_id,period" });
    return { summary: `GST drafts for ${period} updated: ${invoices?.length ?? 0} invoices, net payable ${inr(g.tax_payable_cash.cgst + g.tax_payable_cash.sgst + g.tax_payable_cash.igst)}.`, provider: notes.provider, skipLog: !ev && !(invoices ?? []).length };
  },
};
