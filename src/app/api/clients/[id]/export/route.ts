import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptField } from "@/lib/security/crypto";

/** DPDP Act — right to access: export everything held about one client (RLS restricts to own tenant). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: client } = await db.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [b, m, c, i] = await Promise.all([
    db.from("bookings").select("start_at, status, price, rating, review").eq("client_id", id),
    db.from("messages").select("channel, direction, body, created_at").eq("client_id", id),
    db.from("campaigns").select("type, message, created_at").eq("client_id", id),
    db.from("invoices").select("number, invoice_date, total").eq("client_id", id),
  ]);
  return new NextResponse(JSON.stringify({ client: { ...client, notes: decryptField(client.notes) }, bookings: b.data, messages: m.data, campaigns: c.data, invoices: i.data, exported_at: new Date().toISOString() }, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="client-${id}.json"` },
  });
}
