import "server-only";
import type { AgentDef } from "./types";
import { forecastProduct, tierDiscount } from "../domain/forecast";
import { round2 } from "../domain/gst";
import { llmJson, llmText } from "../ai/llm";
import { addDays, inr, istDate, todayIst } from "../time";

type Product = { id: string; name: string; brand: string | null; unit: string; stock_qty: number; reorder_level: number; unit_cost: number; gst_rate: number; lead_time_days: number; vendor_id: string | null };
type Vendor = { id: string; name: string; email: string | null; state_code: string | null; price_tiers: { min_qty: number; discount_pct: number }[]; flexibility: number; rating: number };

/** Module 1 — Predictive stock refilling → drafts purchase orders grouped by vendor. */
export const inventoryAgent: AgentDef = {
  id: "inventory",
  name: "Procurement Agent",
  module: "Procurement & Inventory",
  description: "Forecasts stock depletion from usage history, upcoming bookings and festival/wedding demand; drafts purchase orders automatically.",
  subscribes: ["stock.check"],
  periodic: true,
  async run({ db, tenant }) {
    const today = todayIst();
    const since = istDate(addDays(today, -30), "00:00").toISOString();
    const until = istDate(addDays(today, 14), "23:59").toISOString();
    const [{ data: products }, { data: usage }, { data: upcoming }, { data: sp }, { data: openPOs }, { data: vendors }] = await Promise.all([
      db.from("products").select("*").eq("tenant_id", tenant.id),
      db.from("usage_logs").select("product_id, actual_qty, created_at").eq("tenant_id", tenant.id).gte("created_at", since),
      db.from("bookings").select("service_id").eq("tenant_id", tenant.id).in("status", ["booked", "confirmed"]).gte("start_at", new Date().toISOString()).lte("start_at", until),
      db.from("service_products").select("*").eq("tenant_id", tenant.id),
      db.from("purchase_orders").select("items, status").eq("tenant_id", tenant.id).in("status", ["draft", "negotiating", "approved"]),
      db.from("vendors").select("*").eq("tenant_id", tenant.id),
    ]);
    if (!products?.length) return { summary: "No products in inventory yet — add products to enable forecasting.", skipLog: false };

    const onOrder = new Map<string, number>();
    (openPOs ?? []).forEach((po) => (po.items as { product_id: string; qty: number }[]).forEach((i) => onOrder.set(i.product_id, (onOrder.get(i.product_id) ?? 0) + i.qty)));
    const firstLog = (usage ?? []).reduce((m, u) => Math.min(m, new Date(u.created_at).getTime()), Date.now());
    const historyDays = Math.max(7, (Date.now() - firstLog) / 86_400_000); // ≥7d window avoids over-reacting to a single day of usage

    const forecasts = (products as Product[]).map((p) => {
      const used = (usage ?? []).filter((u) => u.product_id === p.id).reduce((s, u) => s + Number(u.actual_qty), 0);
      const upcomingQty = (upcoming ?? []).reduce((s, b) => s + Number((sp ?? []).find((x) => x.service_id === b.service_id && x.product_id === p.id)?.qty_per_service ?? 0), 0);
      const f = forecastProduct({ stock_qty: Number(p.stock_qty) + (onOrder.get(p.id) ?? 0), reorder_level: Number(p.reorder_level), lead_time_days: p.lead_time_days, usedLast30: used, historyDays, upcomingQty, upcomingDays: 14 }, tenant.settings.reorder_buffer_days, today);
      return { product: p, ...f, onOrder: onOrder.get(p.id) ?? 0 };
    });
    const toOrder = forecasts.filter((f) => f.needs && f.qty > 0);
    const actions = [];
    const emits = [];
    const byVendor = new Map<string, typeof toOrder>();
    toOrder.forEach((f) => { const k = f.product.vendor_id ?? "none"; byVendor.set(k, [...(byVendor.get(k) ?? []), f]); });
    for (const [vendorId, list] of byVendor) {
      const vendor = (vendors as Vendor[] | null)?.find((v) => v.id === vendorId);
      const interstate = !!vendor?.state_code && !!tenant.state_code && vendor.state_code !== tenant.state_code;
      const items = list.map((f) => ({ product_id: f.product.id, name: f.product.name, unit: f.product.unit, qty: f.qty, unit_cost: Number(f.product.unit_cost), gst_rate: Number(f.product.gst_rate) }));
      const subtotal = round2(items.reduce((s, i) => s + i.qty * i.unit_cost, 0));
      const gst = round2(items.reduce((s, i) => s + (i.qty * i.unit_cost * i.gst_rate) / 100, 0));
      const reasoning = list.map((f) => `${f.product.name}: ${f.daysLeft ?? "∞"} days of stock left at ${f.daily}/${f.product.unit} per day (seasonal ×${f.seasonal}), lead time ${f.product.lead_time_days}d → order ${f.qty}`).join("\n");
      const { data: po } = await db.from("purchase_orders").insert({
        tenant_id: tenant.id, vendor_id: vendor?.id ?? null, status: "draft", items, subtotal, gst_amount: gst, total: round2(subtotal + gst),
        is_interstate: interstate, ai_reasoning: reasoning, created_by: "agent:inventory",
      }).select("id").single();
      actions.push({ type: "po.drafted", label: `Drafted PO ${vendor ? "for " + vendor.name : "(no vendor)"} — ${items.length} item(s), ${inr(subtotal + gst)}`, ref: po?.id });
      if (po && vendor) emits.push({ type: "po.drafted", payload: { po_id: po.id } });
    }
    return {
      summary: toOrder.length ? `${toOrder.length} product(s) predicted to run out; drafted ${byVendor.size} purchase order(s).` : `All ${products.length} products have sufficient cover.`,
      actions, emits,
      output: forecasts.map((f) => ({ product: f.product.name, stock: f.product.stock_qty, on_order: f.onOrder, daily: f.daily, days_left: f.daysLeft, seasonal: f.seasonal, reorder: f.needs ? f.qty : 0 })),
    };
  },
};

/** Module 1 — Autonomous vendor negotiation (email-style thread; vendor reply simulated from its learned flexibility). */
export const negotiatorAgent: AgentDef = {
  id: "negotiator",
  name: "Vendor Negotiation Agent",
  module: "Procurement & Inventory",
  description: "Negotiates wholesale pricing on drafted POs using bulk tiers and each vendor's historical flexibility.",
  subscribes: ["po.drafted"],
  periodic: false,
  async run({ db, tenant }, ev) {
    const poId = ev?.payload.po_id as string;
    const { data: po } = await db.from("purchase_orders").select("*").eq("id", poId).single();
    if (!po?.vendor_id) return { summary: "PO has no vendor — skipped negotiation." };
    const { data: vendor } = await db.from("vendors").select("*").eq("id", po.vendor_id).single();
    const { data: history } = await db.from("negotiations").select("original_total, negotiated_total").eq("vendor_id", po.vendor_id).neq("po_id", poId).limit(10);
    const totalQty = (po.items as { qty: number }[]).reduce((s, i) => s + i.qty, 0);
    const tier = tierDiscount(vendor.price_tiers ?? [], totalQty);
    const histSaving = (history ?? []).filter((h) => h.original_total).map((h) => 1 - Number(h.negotiated_total) / Number(h.original_total));
    const avgHist = histSaving.length ? histSaving.reduce((a, b) => a + b, 0) / histSaving.length : null;
    const ask = Math.min(25, Math.round(tier + 4 + (avgHist ? avgHist * 100 * 0.5 : 3)));

    const itemsText = (po.items as { name: string; qty: number; unit: string; unit_cost: number }[]).map((i) => `- ${i.name}: ${i.qty} ${i.unit} @ ₹${i.unit_cost}`).join("\n");
    const opening = await llmText({
      system: "You are the procurement agent of an Indian salon. Write a short, polite, firm B2B negotiation email (max 120 words). No placeholders.",
      messages: [{ role: "user", content: `Salon: ${tenant.name}, ${tenant.city}. Vendor: ${vendor.name}. Order:\n${itemsText}\nSubtotal ₹${po.subtotal}. Their bulk tier gives ${tier}% for this quantity. Ask for ${ask}% total discount, mention repeat business and timely payment.` }],
    }, () => `Dear ${vendor.name} team,\n\nWe'd like to place the following order for ${tenant.name}:\n${itemsText}\n\nGiven the volume (${totalQty} units) and our regular repeat orders, we request a ${ask}% discount on the subtotal of ₹${po.subtotal} (your published bulk tier is ${tier}%). We pay on time and can confirm today.\n\nRegards,\nProcurement Agent, ${tenant.name}`);

    // Vendor reply simulation: flexibility (learned 0..1) decides how much of our ask they meet.
    const flex = Number(vendor.flexibility ?? 0.5);
    const granted = Math.max(tier, Math.round((tier + (ask - tier) * flex) * 10) / 10);
    const reply = `Thanks for the order. We can offer ${granted}% off on this PO${granted < ask ? ` (our best for ${totalQty} units)` : ""}. Delivery in standard lead time.`;
    const newSubtotal = round2(Number(po.subtotal) * (1 - granted / 100));
    const ratio = Number(po.subtotal) ? newSubtotal / Number(po.subtotal) : 1;
    const newGst = round2(Number(po.gst_amount) * ratio);
    const items = (po.items as { unit_cost: number }[]).map((i) => ({ ...i, unit_cost: round2(i.unit_cost * (1 - granted / 100)) }));

    await db.from("negotiations").insert({
      tenant_id: tenant.id, po_id: po.id, vendor_id: vendor.id, status: "closed",
      original_total: po.total, negotiated_total: round2(newSubtotal + newGst),
      messages: [
        { from: "agent", body: opening.text, at: new Date().toISOString() },
        { from: "vendor (simulated)", body: reply, at: new Date().toISOString() },
      ],
    });
    await db.from("purchase_orders").update({ items, subtotal: newSubtotal, gst_amount: newGst, total: round2(newSubtotal + newGst), status: "draft",
      ai_reasoning: `${po.ai_reasoning ?? ""}\nNegotiated ${granted}% off with ${vendor.name} (asked ${ask}%, tier ${tier}%). Saved ${inr(Number(po.total) - newSubtotal - newGst)}.` }).eq("id", po.id);
    // learn: vendors who give close to the ask become "more flexible" in our model
    const learned = Math.min(1, Math.max(0, flex * 0.8 + (ask > tier ? (granted - tier) / (ask - tier) : flex) * 0.2));
    await db.from("vendors").update({ flexibility: Math.round(learned * 100) / 100 }).eq("id", vendor.id);
    return {
      summary: `Negotiated ${granted}% off with ${vendor.name}; PO now ${inr(newSubtotal + newGst)} (saved ${inr(Number(po.total) - newSubtotal - newGst)}). Awaiting owner approval.`,
      actions: [{ type: "negotiation", label: `${vendor.name}: ${granted}% discount`, ref: po.id }],
      provider: opening.provider,
    };
  },
};

/** Module 1 — Smart waste tracking from smart-scale / manual usage logs. */
export const wasteAgent: AgentDef = {
  id: "waste",
  name: "Waste Tracking Agent",
  module: "Procurement & Inventory",
  description: "Compares actual product usage (smart-scale/manual logs) with the expected per-service recipe and flags anomalies per stylist.",
  subscribes: ["usage.logged"],
  periodic: true,
  async run({ db, tenant }, ev) {
    const q = db.from("usage_logs").select("*, products(name, unit), staff(name)").eq("tenant_id", tenant.id);
    const { data: logs } = ev ? await q.eq("id", ev.payload.usage_id as string) : await q.eq("flagged", false).neq("source", "auto").gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
    const flagged = [];
    const emits = [];
    for (const l of logs ?? []) {
      const exp = Number(l.expected_qty), act = Number(l.actual_qty);
      if (exp > 0 && act > exp * 1.2) {
        await db.from("usage_logs").update({ flagged: true }).eq("id", l.id);
        flagged.push({ type: "waste.flag", label: `${l.staff?.name ?? "Unknown"} used ${act}${l.products?.unit} of ${l.products?.name} (expected ${exp}) — +${Math.round((act / exp - 1) * 100)}%`, ref: l.id });
        if (l.staff_id) emits.push({ type: "staff.waste_flag", payload: { staff_id: l.staff_id, product: l.products?.name, excess_pct: Math.round((act / exp - 1) * 100) } });
      }
    }
    if (!ev && !flagged.length) return { summary: "No usage anomalies in the last 7 days.", skipLog: (logs ?? []).length === 0 };
    return { summary: flagged.length ? `Flagged ${flagged.length} excessive-usage event(s).` : "Usage within expected range.", actions: flagged, emits };
  },
};
