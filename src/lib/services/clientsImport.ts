import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapClientRows, parseCsv } from "../domain/csv";
import { encryptField } from "../security/crypto";

/** Bulk-import clients from a CSV export (Fresha, Vagaro, Booksy, Square, Excel). Existing phones are skipped. */
export async function importClients(db: SupabaseClient, tenantId: string, csvText: string, consent: boolean) {
  const { clients, skipped, columns } = mapClientRows(parseCsv(csvText));
  if (!("name" in columns) && !("first" in columns)) throw new Error("CSV needs a Name (or First Name) column");
  const phones = clients.map((c) => c.phone).filter(Boolean) as string[];
  const existing = new Set<string>();
  for (let i = 0; i < phones.length; i += 200) {
    const { data } = await db.from("clients").select("phone").eq("tenant_id", tenantId).in("phone", phones.slice(i, i + 200));
    (data ?? []).forEach((r) => existing.add(r.phone));
  }
  const fresh = clients.filter((c) => !c.phone || !existing.has(c.phone));
  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await db.from("clients").insert(fresh.slice(i, i + 500).map((c) => ({ tenant_id: tenantId, ...c, notes: encryptField(c.notes), consent_marketing: consent })));
    if (error) throw new Error(error.message);
  }
  return { imported: fresh.length, duplicates: clients.length - fresh.length, skipped };
}
