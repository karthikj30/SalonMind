import { NextResponse } from "next/server";
import { botClient } from "@/lib/supabase/bot";
import { buildIcs } from "@/lib/domain/ics";

export const dynamic = "force-dynamic";

/** Per-stylist calendar feed (subscribe in Google/Apple/Outlook). The unguessable token is the credential. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token.replace(/\.ics$/, ""))) return new NextResponse("not found", { status: 404 });
  const db = await botClient();
  const { data: st } = await db.from("staff").select("id, name, tenant_id, tenants(name)").eq("calendar_token", token.replace(/\.ics$/, "")).maybeSingle();
  if (!st) return new NextResponse("not found", { status: 404 });
  const { data: bookings } = await db.from("bookings").select("id, start_at, end_at, status, clients(name), services(name), rooms(name)")
    .eq("staff_id", st.id).in("status", ["booked", "confirmed", "cancelled"])
    .gte("start_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).lte("start_at", new Date(Date.now() + 60 * 86_400_000).toISOString());
  const { data: leave } = await db.from("staff_time_off").select("id, start_at, end_at, reason").eq("staff_id", st.id).gte("end_at", new Date().toISOString());
  const salon = (st.tenants as unknown as { name: string } | null)?.name ?? "Salon";
  const ics = buildIcs(`${st.name} · ${salon}`, [
    ...(bookings ?? []).map((b) => {
      const x = b as unknown as { id: string; start_at: string; end_at: string; status: string; clients: { name: string } | null; services: { name: string } | null; rooms: { name: string } | null };
      return { uid: x.id, start: x.start_at, end: x.end_at, summary: `${x.services?.name ?? "Appointment"} — ${x.clients?.name ?? "Guest"}`, location: x.rooms?.name ?? salon, cancelled: x.status === "cancelled" };
    }),
    ...(leave ?? []).map((l) => ({ uid: `leave-${l.id}`, start: l.start_at, end: l.end_at, summary: `Blocked: ${l.reason ?? "leave"}` })),
  ]);
  return new NextResponse(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" } });
}
