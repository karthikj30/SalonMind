/** NPCI UPI deep link (upi://pay) — works with GPay, PhonePe, Paytm, BHIM. No gateway, no fees. */
export function upiLink(p: { vpa: string; name: string; amount: number; note?: string; ref?: string }) {
  if (!/^[\w.\-]{2,256}@[a-zA-Z][\w]{2,64}$/.test(p.vpa)) throw new Error(`Invalid UPI ID: ${p.vpa}`);
  const q = new URLSearchParams({ pa: p.vpa, pn: p.name.slice(0, 50), am: p.amount.toFixed(2), cu: "INR" });
  if (p.note) q.set("tn", p.note.slice(0, 80));
  if (p.ref) q.set("tr", p.ref.slice(0, 35));
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}
