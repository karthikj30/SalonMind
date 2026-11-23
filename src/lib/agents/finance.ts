import "server-only";
import type { AgentDef } from "./types";
import { buildReturns, computeInvoice, type TaxLine } from "../domain/gst";
import { checkoutPricing } from "../domain/loyalty";
import { pickPackage, prepaidSplit } from "../domain/prepaid";
import { findUsableGiftCard } from "../services/prepaid";
import { activeMembership, issueInvoice } from "../services/invoicing";
import { inr, todayIst } from "../time";
import { llmText } from "../ai/llm";

/** Module 6 — Billing/POS: on completion → membership/points/wallet → GST e-invoice, split payout, inventory consumption. */
export const billingAgent: AgentDef = {
  id: "billing",
  name: "Billing & POS Agent",
  module: "Billing, POS & GST",
  description: "On service completion: uses a prepaid package session if the client has one, applies membership discount & loyalty points, takes gift-card and prepaid-wallet payment, issues a GST e-invoice (CGST/SGST or IGST), computes split payouts (owner / booth renter / tax bucket) and consumes inventory per service recipe.",
  subscribes: ["booking.completed"],
  periodic: false,
  async run({ db, tenant }, ev) {
    const p = ev!.payload as { booking_id: string; payment_method?: string; products?: { product_id: string; qty: number }[]; redeem_points?: boolean; use_wallet?: boolean; use_package?: boolean; gift_card_code?: string };
    const { data: b } = await db.from("bookings").select("*, services(name, sac), staff(id, name, employment_type, booth_rent_pct), clients(id, name, wallet_balance, loyalty_points)").eq("id", p.booking_id).single();
    if (!b) return { summary: "Booking not found" };
    const { data: existing } = await db.from("invoices").select("id").eq("booking_id", b.id).maybeSingle();
    if (existing) return { summary: "Invoice already issued.", skipLog: true };
    const actions = [];
    const client = b.clients as { id: string; name: string; wallet_balance: number; loyalty_points: number } | null;
    const membership = client ? await activeMembership(db, client.id) : null;
    // A prepaid package already paid (and was GST-invoiced) for this service: the visit is billed at ₹0.
    let pkgLabel: string | null = null;
    if (client && p.use_package !== false && b.service_id) {
      const { data: pkgs } = await db.from("client_packages").select("id, service_id, sessions_left, sessions_total, expires_at, package_plans(name)")
        .eq("tenant_id", tenant.id).eq("client_id", client.id).eq("service_id", b.service_id).gt("sessions_left", 0);
      const pkg = pickPackage(pkgs ?? [], b.service_id, todayIst());
      if (pkg) {
        // conditional update so two tills can never consume the same last session
        const { data: used } = await db.from("client_packages").update({ sessions_left: pkg.sessions_left - 1 })
          .eq("id", pkg.id).eq("sessions_left", pkg.sessions_left).select("id").maybeSingle();
        if (used) {
          const name = (pkg.package_plans as unknown as { name: string } | null)?.name ?? "package";
          pkgLabel = `${name} ${pkg.sessions_total - pkg.sessions_left + 1}/${pkg.sessions_total}`;
          actions.push({ type: "package", label: `Used package session ${pkgLabel} (${pkg.sessions_left - 1} left)`, ref: pkg.id });
        }
      }
    }
    const pricing = checkoutPricing({
      servicePrice: pkgLabel ? 0 : Number(b.price), membershipPct: membership?.discount_pct ?? 0, pointsBalance: Number(client?.loyalty_points ?? 0),
      redeemPoints: !!p.redeem_points, maxRedeemPct: tenant.settings.loyalty_max_redeem_pct,
    });
    if (membership) actions.push({ type: "membership", label: `${membership.name}: −${inr(pricing.membershipDiscount)} (${membership.discount_pct}%)` });
    if (pricing.pointsUsed && client) {
      await db.from("clients").update({ loyalty_points: Number(client.loyalty_points) - pricing.pointsUsed }).eq("id", client.id);
      await db.from("wallet_transactions").insert({ tenant_id: tenant.id, client_id: client.id, kind: "loyalty_redeem", points: -pricing.pointsUsed, amount: -pricing.pointsUsed, ref: b.id, note: "redeemed at checkout" });
      actions.push({ type: "points", label: `Redeemed ${pricing.pointsUsed} points (−${inr(pricing.pointsUsed)})` });
    }
    const gstRate = tenant.settings.gst_rate;
    const lines: TaxLine[] = [{ description: `${b.services?.name ?? "Salon service"}${pkgLabel ? ` (prepaid package session ${pkgLabel})` : ""}`, kind: "service", code: b.services?.sac ?? "999721", qty: 1, rate: gstRate, unit_price: pricing.taxableService, staff_id: b.staff_id }];
    for (const it of p.products ?? []) {
      const { data: prod } = await db.from("products").select("*").eq("id", it.product_id).single();
      if (!prod) continue;
      const unit = Number(prod.retail_price || prod.unit_cost) * (1 - (membership?.discount_pct ?? 0) / 100);
      lines.push({ description: prod.name, kind: "product", code: prod.hsn ?? "3305", qty: it.qty, rate: Number(prod.gst_rate), unit_price: Math.round(unit * 100) / 100, staff_id: b.staff_id, product_id: prod.id });
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

    // gift card pays first, then the prepaid wallet, the rest goes over the chosen rail (all after tax)
    const preview = computeInvoice(lines, tenant.state_code, tenant.state_code);
    let gift: Awaited<ReturnType<typeof findUsableGiftCard>> | null = null;
    if (p.gift_card_code) {
      try { gift = await findUsableGiftCard(db, tenant.id, p.gift_card_code); }
      catch (e) { actions.push({ type: "gift_card", label: `Gift card not applied — ${(e as Error).message}` }); }
    }
    const ps = prepaidSplit(Math.max(0, preview.total - Number(b.deposit_paid)), { giftBalance: Number(gift?.balance ?? 0), walletBalance: Number(client?.wallet_balance ?? 0), useWallet: !!p.use_wallet });
    if (gift && ps.fromGift > 0) {
      const left = Math.round((Number(gift.balance) - ps.fromGift) * 100) / 100;
      const { data: ok } = await db.from("gift_cards").update({ balance: left, status: left <= 0 ? "redeemed" : "active" })
        .eq("id", gift.id).eq("balance", gift.balance).select("id").maybeSingle();
      if (ok) actions.push({ type: "gift_card", label: `Gift card ${gift.code}: −${inr(ps.fromGift)} (${inr(left)} left)`, ref: gift.id });
      else { ps.remaining += ps.fromGift; ps.fromGift = 0; actions.push({ type: "gift_card", label: `Gift card ${gift.code} changed during checkout — not applied` }); }
    }
    if (ps.fromWallet > 0 && client) {
      await db.from("clients").update({ wallet_balance: Math.round((Number(client.wallet_balance) - ps.fromWallet) * 100) / 100 }).eq("id", client.id);
      await db.from("wallet_transactions").insert({ tenant_id: tenant.id, client_id: client.id, kind: "spend", amount: -ps.fromWallet, ref: b.id, note: "service checkout" });
      actions.push({ type: "wallet", label: `Paid ${inr(ps.fromWallet)} from prepaid wallet` });
    }
    const method = p.payment_method ?? "upi";
    const renter = b.staff?.employment_type === "booth_renter" ? { name: b.staff.name, booth_rent_pct: Number(b.staff.booth_rent_pct) } : null;
    const r = await issueInvoice(db, tenant, {
      booking_id: b.id, client_id: b.client_id, lines, method, renter, depositPaid: Number(b.deposit_paid), walletUsed: ps.fromWallet, giftCardUsed: ps.fromGift,
      extra: { membership_discount: pricing.membershipDiscount, points_redeemed: pricing.pointsUsed, ...(ps.fromGift ? { gift_card_code: gift?.code } : {}), ...(pkgLabel ? { package_session: pkgLabel } : {}) },
    });
    actions.unshift({ type: "invoice", label: `Invoice ${r.number}: ${inr(r.inv.total)} (CGST ${inr(r.inv.cgst)} + SGST ${inr(r.inv.sgst)}${r.inv.igst ? " + IGST " + inr(r.inv.igst) : ""}) via ${ps.remaining > 0 ? method.toUpperCase() : ps.fromGift ? "GIFT CARD" : ps.fromWallet ? "WALLET" : "PREPAID"}`, ref: r.id });
    if (renter) actions.push({ type: "split", label: `Booth renter ${renter.name} payout ${inr(r.splits.booth_renter!.amount)}` });
    return {
      summary: `Issued ${r.number} for ${inr(r.inv.total)}; owner share ${inr(r.splits.salon_owner)}, tax bucket ${inr(r.splits.tax_bucket)}.`, actions,
      emits: [{ type: "stock.check", payload: {} }, { type: "invoice.issued", payload: { invoice_id: r.id, booking_id: b.id, client_id: b.client_id, total: r.inv.total } }],
    };
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
