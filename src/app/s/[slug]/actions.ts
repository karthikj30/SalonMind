"use server";
import { redirect } from "next/navigation";
import { botClient } from "@/lib/supabase/bot";
import { createBooking, findOrCreateClient } from "@/lib/services/booking";
import { normalizeTenant, processEvents } from "@/lib/agents/runtime";
import type { Tenant } from "@/lib/agents/types";
import { headers } from "next/headers";
import { joinQueue } from "@/lib/services/queue";
import { rateLimited } from "@/lib/services/marketplace";

export async function marketplaceBook(fd: FormData) {
  const slug = String(fd.get("slug"));
  const back = `/s/${slug}`;
  const phone = String(fd.get("phone") ?? "").replace(/\s+/g, "");
  if (!/^\+?\d{10,13}$/.test(phone)) redirect(`${back}?error=${encodeURIComponent("Enter a valid mobile number")}`);
  let id = "";
  try {
    const db = await botClient();
    const { data: t } = await db.from("tenants").select("*").eq("slug", slug).eq("is_published", true).single();
    if (!t) throw new Error("Salon not found");
    const tenant = normalizeTenant(t as Tenant);
    const client = await findOrCreateClient(db, tenant.id, { name: String(fd.get("name")), phone, language: String(fd.get("language") || "en") });
    if (fd.get("consent") !== "on") await db.from("clients").update({ consent_marketing: false }).eq("id", client.id);
    const r = await createBooking(db, tenant, { client_id: client.id, service_id: String(fd.get("service_id")), date: String(fd.get("date")), time: String(fd.get("time")), source: "marketplace" });
    await processEvents(db, tenant, 5);
    id = r.booking.id;
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`${back}?booked=${id}`);
}

/** Customer joins today's walk-in queue from the QR page. */
export async function queueJoin(fd: FormData) {
  const slug = String(fd.get("slug"));
  const back = `/s/${slug}/queue`;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(`queue:${ip}`, 6)) redirect(`${back}?error=${encodeURIComponent("Too many requests — please ask at the reception.")}`);
  const phone = String(fd.get("phone") ?? "").replace(/\s+/g, "");
  if (!/^\+?\d{10,13}$/.test(phone)) redirect(`${back}?error=${encodeURIComponent("Enter a valid mobile number")}`);
  let id = "";
  try {
    const db = await botClient();
    const { data: t } = await db.from("tenants").select("*").eq("slug", slug).eq("is_published", true).single();
    if (!t) throw new Error("Salon not found");
    const tenant = normalizeTenant(t as Tenant);
    id = (await joinQueue(db, tenant, { name: String(fd.get("name") ?? ""), phone, service_id: String(fd.get("service_id") ?? "") || null, source: "qr" })).id;
    await processEvents(db, tenant, 5);
  } catch (e) {
    redirect(`${back}?error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`${back}?t=${id}`);
}
