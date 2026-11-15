/**
 * Checkout economics for memberships, loyalty points and prepaid wallet.
 * GST note: membership discounts and redeemed points are discounts known at the time of supply, so they
 * reduce the taxable value (s.15(3) CGST Act). Prepaid wallet money is an advance/payment instrument —
 * it is a payment method, not a discount, so it does NOT reduce taxable value.
 */
export function checkoutPricing(p: {
  servicePrice: number; membershipPct: number; pointsBalance: number; redeemPoints: boolean; maxRedeemPct: number;
}) {
  const membershipDiscount = Math.round((p.servicePrice * p.membershipPct) / 100 * 100) / 100;
  const afterMembership = p.servicePrice - membershipDiscount;
  const maxPoints = Math.floor((afterMembership * p.maxRedeemPct) / 100); // 1 point = ₹1
  const pointsUsed = p.redeemPoints ? Math.max(0, Math.min(p.pointsBalance, maxPoints)) : 0;
  return { membershipDiscount, pointsUsed, taxableService: Math.round((afterMembership - pointsUsed) * 100) / 100 };
}

export function pointsEarned(amountPaid: number, perHundred: number) {
  return Math.max(0, Math.floor((amountPaid / 100) * perHundred));
}

/** Split an invoice total between prepaid wallet balance and the chosen payment rail. */
export function walletSplit(total: number, walletBalance: number, useWallet: boolean) {
  const fromWallet = useWallet ? Math.min(Math.max(0, walletBalance), total) : 0;
  return { fromWallet: Math.round(fromWallet * 100) / 100, remaining: Math.round((total - fromWallet) * 100) / 100 };
}

export type WaitEntry = { id: string; service_id: string; date: string | null; from_time: string | null; to_time: string | null; status: string; created_at: string };

/** Which waitlisted clients fit a freed slot? Same service, date matches (or any date), start within window; FIFO. */
export function matchWaitlist(entries: WaitEntry[], slot: { service_id: string; date: string; time: string }) {
  return entries
    .filter((e) => e.status === "waiting" && e.service_id === slot.service_id)
    .filter((e) => !e.date || e.date === slot.date)
    .filter((e) => (!e.from_time || slot.time >= e.from_time.slice(0, 5)) && (!e.to_time || slot.time <= e.to_time.slice(0, 5)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Days until the next birthday (0 = today) for a YYYY-MM-DD birthday, relative to an IST date. */
export function daysToBirthday(birthday: string, today: string) {
  const [, m, d] = birthday.split("-").map(Number);
  const [ty] = today.split("-").map(Number);
  const t = Date.UTC(ty, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  let next = Date.UTC(ty, m - 1, d);
  if (next < t) next = Date.UTC(ty + 1, m - 1, d);
  return Math.round((next - t) / 86_400_000);
}
