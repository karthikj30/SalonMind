import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";

export async function GET(_: Request, { params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;
  const { db, tenant } = await getTenantContext();
  const { data } = await db.from("gst_returns").select("*").eq("tenant_id", tenant.id).eq("period", period).maybeSingle();
  if (!data) return NextResponse.json({ error: "not prepared" }, { status: 404 });
  return new NextResponse(JSON.stringify({ gstin: tenant.gstin, fp: period.split("-").reverse().join(""), ...data }, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="gst-${period}.json"` },
  });
}
