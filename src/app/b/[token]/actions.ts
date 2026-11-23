"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { botClient } from "@/lib/supabase/bot";
import { normalizeTenant, processEvents, emit } from "@/lib/agents/runtime";
import type { Tenant } from "@/lib/agents/types";
import { rescheduleBooking } from "@/lib/services/booking";
import { rateLimited } from "@/lib/services/marketplace";
import { MANAGE_CUTOFF_HOURS, manageWindow } from "@/lib/domain/prepaid";
import { istDate } from "@/lib/time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


/** Load the booking behind a manage token (the token is the only credential: 122 random bits, one booking). */
async function load(token: string) {
  if (!UUID.test(token)) throw new Error("Link not valid");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(`manage:${ip}`, 10)) throw new Error("Too many requests — please try again in a minute.");
  const db = await botClient();
  const { data: b } = await db.from("bookings").select("*").eq("manage_token", token).maybeSingle();
  if (!b) throw new Error("Link not valid");
  const { data: t } = await db.from("tenants").select("*").eq("id", b.tenant_id).single();
  const w = manageWindow(b, new Date(), MANAGE_CUTOFF_HOURS);
  if (!w.canChange) throw new Error(w.reason);
  return { db, tenant: normalizeTenant(t as Tenant), b };
}

export async function cancelByToken(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  let err = "";
  try {
    const { db, tenant, b } = await load(token);
    const { data: ok } = await db.from("bookings").update({ status: "cancelled" }).eq("id", b.id).in("status", ["booked", "confirmed"]).select("id").maybeSingle();
    if (ok) {
      // the waitlist and yield agents fill the freed slot
      await emit(db, tenant.id, "booking.cancelled", { booking_id: b.id, freed_start: b.start_at, freed_end: b.end_at, service_id: b.service_id, reason: "customer_self_service" }, "customer");
      await processEvents(db, tenant, 5);
    }
  } catch (e) { err = (e as Error).message; }
  redirect(`/b/${token}?${err ? `error=${encodeURIComponent(err)}` : "done=cancelled"}`);
}

export async function rescheduleByToken(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const date = String(fd.get("date") ?? ""), time = String(fd.get("time") ?? "");
  let err = "";
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error("Pick a time");
    if (istDate(date, time).getTime() < Date.now() + MANAGE_CUTOFF_HOURS * 3_600_000) throw new Error("too_late");
    const { db, tenant, b } = await load(token);
    await rescheduleBooking(db, tenant, b.id, date, time);
    await processEvents(db, tenant, 5);
  } catch (e) { err = (e as Error).message; }
  redirect(`/b/${token}?${err ? `error=${encodeURIComponent(err)}` : "done=moved"}`);
}
