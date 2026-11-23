/**
 * Prepaid value: gift cards, service packages and the customer's self-service booking window.
 *
 * GST treatment (India):
 *  - A gift card is a voucher — an instrument of payment, not a supply. No GST when it is sold; the service it
 *    later pays for is taxed in full at redemption, so a gift card is applied like the prepaid wallet
 *    (after tax, as a payment method), never as a discount.
 *  - A service package is a prepaid supply of services: GST is invoiced in full when it is sold, and each visit
 *    then consumes one session at ₹0 so the same service is never taxed twice.
 */

// No 0/O, 1/I/L: codes are read out over the phone and typed in at the till.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A gift-card code like "GC-7KQM-X2PA" (≈ 40 bits of randomness). */
export function giftCode(rand: () => number = secureRandom) {
  const pick = () => ALPHABET[Math.floor(rand() * ALPHABET.length) % ALPHABET.length];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `GC-${block()}-${block()}`;
}

function secureRandom() {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

/** Normalise what a cashier types ("gc 7kqm x2pa", "GC7KQMX2PA") into the stored form. */
export function normalizeGiftCode(input: string) {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^GC/, "");
  if (raw.length !== 8) return null;
  return `GC-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export type GiftCardState = { balance: number; expires_at: string; status: string };

/** Whether a card can pay today, and why not if it can't. */
export function giftCardUsable(card: GiftCardState, today: string): { ok: true } | { ok: false; reason: string } {
  if (card.status === "void") return { ok: false, reason: "This gift card was cancelled" };
  if (card.expires_at < today || card.status === "expired") return { ok: false, reason: `This gift card expired on ${card.expires_at}` };
  if (Number(card.balance) <= 0 || card.status === "redeemed") return { ok: false, reason: "This gift card has no balance left" };
  return { ok: true };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Split an amount due between a gift card, then the prepaid wallet, then the chosen payment rail.
 * Both are payment instruments, so they never change the taxable value.
 */
export function prepaidSplit(due: number, p: { giftBalance?: number; walletBalance?: number; useWallet?: boolean }) {
  const amount = Math.max(0, r2(due));
  const fromGift = r2(Math.min(Math.max(0, p.giftBalance ?? 0), amount));
  const fromWallet = p.useWallet ? r2(Math.min(Math.max(0, p.walletBalance ?? 0), amount - fromGift)) : 0;
  return { fromGift, fromWallet, remaining: r2(amount - fromGift - fromWallet) };
}

export type PackageState = { id: string; service_id: string; sessions_left: number; expires_at: string };

/** The package session to consume for this service: the one that expires first, so nothing is wasted. */
export function pickPackage<T extends PackageState>(packages: T[], serviceId: string, today: string): T | null {
  return packages
    .filter((p) => p.service_id === serviceId && p.sessions_left > 0 && p.expires_at >= today)
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at))[0] ?? null;
}

/** Per-session value of a package (for reports and the "you save" line). */
export function packageSaving(p: { sessions: number; price: number; servicePrice: number }) {
  const full = p.sessions * p.servicePrice;
  return { full: r2(full), saving: r2(Math.max(0, full - p.price)), perSession: r2(p.price / Math.max(1, p.sessions)) };
}

/** Days from `today` to `date` (both YYYY-MM-DD, IST). Negative = in the past. */
export function daysUntil(date: string, today: string) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/**
 * Which prepaid balances deserve an "use it before it expires" reminder today. Reminds once at
 * `firstAt` days before expiry and once more in the final `lastAt` days.
 */
export function expiryReminderStage(expiresAt: string, today: string, firstAt = 14, lastAt = 3): "first" | "last" | null {
  const d = daysUntil(expiresAt, today);
  if (d < 0) return null;
  if (d <= lastAt) return "last";
  if (d <= firstAt) return "first";
  return null;
}

/** Customers can change a booking online until this many hours before it. */
export const MANAGE_CUTOFF_HOURS = 2;

/**
 * Customer self-service window: changes are allowed until `cutoffHours` before the appointment, and only for
 * bookings that are still upcoming.
 */
export function manageWindow(b: { status: string; start_at: string }, now: Date, cutoffHours = MANAGE_CUTOFF_HOURS):
  { canChange: true } | { canChange: false; reason: "past" | "closed" | "too_late" } {
  if (!["booked", "confirmed"].includes(b.status)) return { canChange: false, reason: "closed" };
  const ms = new Date(b.start_at).getTime() - now.getTime();
  if (ms <= 0) return { canChange: false, reason: "past" };
  if (ms < cutoffHours * 3_600_000) return { canChange: false, reason: "too_late" };
  return { canChange: true };
}
