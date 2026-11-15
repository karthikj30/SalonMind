import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td, statusTone } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addToWaitlist, bookAction, bookWaitlistOffer, completeBooking, recordDeposit, rescheduleAction, setBookingStatus } from "../actions";
import { planBooking } from "@/lib/services/booking";
import { addDays, fmtDateTime, inr, istDate, todayIst, toIst } from "@/lib/time";

export default async function Bookings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const date = sp.date || todayIst();
  const [{ data: bookings }, { data: clients }, { data: services }, { data: staff }, { data: products }, { data: waitlist }] = await Promise.all([
    db.from("bookings").select("*, clients(name, phone), services(name), staff(name), rooms(name)").eq("tenant_id", tenant.id)
      .gte("start_at", istDate(date, "00:00").toISOString()).lte("start_at", istDate(date, "23:59").toISOString()).order("start_at"),
    db.from("clients").select("id, name, phone").eq("tenant_id", tenant.id).order("name"),
    db.from("services").select("id, name, base_price, duration_min").eq("tenant_id", tenant.id).eq("active", true).order("name"),
    db.from("staff").select("id, name").eq("tenant_id", tenant.id).eq("active", true).order("name"),
    db.from("products").select("id, name, retail_price").eq("tenant_id", tenant.id).order("name"),
    db.from("waitlist").select("*, clients(name), services(name)").eq("tenant_id", tenant.id).in("status", ["waiting", "offered"]).order("created_at"),
  ]);
  let plan: Awaited<ReturnType<typeof planBooking>> | null = null;
  let planError: string | null = null;
  if (sp.plan && sp.service_id) {
    try { plan = await planBooking(db, tenant, { service_id: sp.service_id, date: sp.pdate || date, from: sp.from || null, to: sp.to || null, staff_id: sp.staff_id || null }); }
    catch (e) { planError = (e as Error).message; }
  }
  return (
    <>
      <PageHeader title="Bookings" subtitle="Bookings go through the matrix scheduler (skill × room × equipment × margin) and yield pricing; the No-Show Agent scores each one instantly.">
        <form className="flex items-end gap-2">
          <a className="rounded-lg border px-2 py-1.5 text-sm" href={`?date=${addDays(date, -1)}`}>←</a>
          <Input type="date" name="date" defaultValue={date} />
          <button className="rounded-lg border px-2 py-1.5 text-sm">Go</button>
          <a className="rounded-lg border px-2 py-1.5 text-sm" href={`?date=${addDays(date, 1)}`}>→</a>
        </form>
      </PageHeader>
      <Flash msg={sp.msg} error={sp.error ?? planError ?? undefined} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={`Schedule · ${date}`} className="xl:col-span-2">
          <Table head={["Time", "Client", "Service", "Stylist / room", "Price", "No-show risk", "Status", "Actions"]} empty="No bookings on this day.">
            {(bookings ?? []).map((b) => (
              <tr key={b.id}>
                <Td className="whitespace-nowrap">{toIst(new Date(b.start_at)).time}–{toIst(new Date(b.end_at)).time}</Td>
                <Td><div className="font-medium">{b.clients?.name ?? "—"}</div><div className="text-xs text-slate-400">{b.source}</div></Td>
                <Td>{b.services?.name}</Td>
                <Td><div>{b.staff?.name ?? "—"}</div><div className="text-xs text-slate-500">{b.rooms?.name}</div>{b.schedule_reasoning && <div className="max-w-xs text-[11px] text-slate-400" title={b.schedule_reasoning}>{b.schedule_reasoning.slice(0, 80)}…</div>}</Td>
                <Td><div>{inr(b.price)}</div>{b.pricing_note && <div className="text-[11px] text-slate-500">{b.pricing_note}</div>}</Td>
                <Td>{b.no_show_risk === null ? "…" : <Badge tone={b.no_show_risk >= tenant.settings.deposit_threshold ? "red" : b.no_show_risk >= tenant.settings.nudge_threshold ? "amber" : "green"}>{Math.round(b.no_show_risk * 100)}%</Badge>}
                  {Number(b.deposit_required) > 0 && <div className="text-[11px] text-red-600">deposit {inr(b.deposit_required)}{Number(b.deposit_paid) > 0 && " ✔ paid"}</div>}</Td>
                <Td><Badge tone={statusTone(b.status)}>{b.status}</Badge>{b.rating && <div className="text-xs">{"★".repeat(b.rating)}</div>}</Td>
                <Td>
                  {["booked", "confirmed"].includes(b.status) ? (
                    <div className="flex flex-col gap-1 text-xs">
                      <details>
                        <summary className="cursor-pointer text-emerald-700">Complete & bill</summary>
                        <form action={completeBooking} className="mt-1 space-y-1 rounded border bg-slate-50 p-2">
                          <input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={date} />
                          <Select name="payment_method" defaultValue="upi"><option value="upi">UPI</option><option value="card">Card</option><option value="netbanking">NetBanking</option><option value="cash">Cash</option><option value="wallet">Wallet</option></Select>
                          <Select name="product_id" defaultValue=""><option value="">+ retail product (optional)</option>{(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} {inr(p.retail_price)}</option>)}</Select>
                          <Input name="product_qty" type="number" min={1} defaultValue={1} placeholder="qty" />
                          <Input name="tip" type="number" min={0} placeholder="Tip ₹" />
                          <Select name="rating" defaultValue=""><option value="">Rating</option>{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r}★</option>)}</Select>
                          <Input name="review" placeholder="Client review (any language)" />
                          <label className="flex items-center gap-1"><input type="checkbox" name="redeem_points" /> Redeem loyalty points</label>
                          <label className="flex items-center gap-1"><input type="checkbox" name="use_wallet" /> Pay from prepaid wallet</label>
                          <p className="text-[10px] text-slate-400">Active membership discount applies automatically.</p>
                          <SubmitButton className="w-full">Complete</SubmitButton>
                        </form>
                      </details>
                      <details>
                        <summary className="cursor-pointer text-amber-700">Reschedule</summary>
                        <form action={rescheduleAction} className="mt-1 space-y-1 rounded border bg-slate-50 p-2">
                          <input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={date} />
                          <Input type="date" name="new_date" defaultValue={date} required /><Input type="time" name="new_time" required />
                          <SubmitButton className="w-full">Move</SubmitButton>
                        </form>
                      </details>
                      {Number(b.deposit_required) > 0 && Number(b.deposit_paid) === 0 && (
                        <form action={recordDeposit} className="flex gap-1"><input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={date} /><input type="hidden" name="amount" value={b.deposit_required} /><button className="text-violet-700 hover:underline">Deposit paid</button></form>
                      )}
                      {[["confirmed", "Confirm", "text-sky-700"], ["no_show", "No-show", "text-red-600"], ["cancelled", "Cancel", "text-slate-500"]].filter(([st]) => st !== b.status).map(([st, label, cls]) => (
                        <form key={st} action={setBookingStatus}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={date} /><input type="hidden" name="status" value={st} /><button className={`${cls} hover:underline`}>{label}</button></form>
                      ))}
                    </div>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        <div className="space-y-4">
          <Card title="1 · Find best slots (AI scheduler)">
            <form className="grid grid-cols-2 gap-2">
              <input type="hidden" name="plan" value="1" /><input type="hidden" name="date" value={date} />
              <Field label="Service" className="col-span-2"><Select name="service_id" defaultValue={sp.service_id} required>{(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · {inr(s.base_price)} · {s.duration_min}m</option>)}</Select></Field>
              <Field label="Date" className="col-span-2"><Input type="date" name="pdate" defaultValue={sp.pdate || date} /></Field>
              <Field label="Preferred from"><Input type="time" name="from" defaultValue={sp.from} /></Field>
              <Field label="Preferred to"><Input type="time" name="to" defaultValue={sp.to} /></Field>
              <Field label="Stylist (optional)" className="col-span-2"><Select name="staff_id" defaultValue={sp.staff_id ?? ""}><option value="">Any — let AI choose</option>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <button className="col-span-2 rounded-lg border border-slate-300 py-1.5 text-sm hover:bg-slate-50">Suggest slots</button>
            </form>
            {plan && (
              <div className="mt-3 space-y-2">
                {plan.slots.length === 0 && <p className="text-sm text-amber-700">No feasible slot (check stylist skill levels, shifts, rooms with required equipment).</p>}
                {plan.slots.map((s, i) => (
                  <div key={i} className="rounded-lg border p-2 text-sm">
                    <div className="flex justify-between"><b>{fmtDateTime(s.start)}</b><span>{inr(s.quote.price)}</span></div>
                    <div className="text-xs text-slate-600">{s.staff.name}{s.room ? ` · ${s.room.name}` : ""} · score {s.score.toFixed(2)}</div>
                    <div className="text-[11px] text-slate-500">{s.reasons.join(" · ")} · {s.quote.note}</div>
                    <form action={bookAction} className="mt-1 flex gap-1">
                      <input type="hidden" name="service_id" value={plan!.service.id} /><input type="hidden" name="date" value={toIst(s.start).date} />
                      <input type="hidden" name="time" value={toIst(s.start).time} /><input type="hidden" name="staff_id" value={s.staff.id} />
                      <select name="client_id" className="min-w-0 flex-1 rounded border px-1 text-xs" required>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                      <SubmitButton className="!px-2 !py-0.5 text-xs">Book</SubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Waitlist">
            <ul className="mb-3 space-y-1 text-xs">
              {(waitlist ?? []).map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                  <span><b>{w.clients?.name}</b> · {w.services?.name} · {w.date ?? "any day"} {w.from_time ? `${w.from_time.slice(0, 5)}–${(w.to_time ?? "").slice(0, 5)}` : ""}</span>
                  {w.status === "offered" ? (
                    <form action={bookWaitlistOffer}><input type="hidden" name="id" value={w.id} /><button className="text-emerald-700 hover:underline">Book {fmtDateTime(w.offered_slot)}</button></form>
                  ) : <Badge>waiting</Badge>}
                </li>
              ))}
              {!(waitlist ?? []).length && <li className="text-slate-400">Nobody waiting. When a slot frees up, the Waitlist Agent offers it automatically.</li>}
            </ul>
            <form action={addToWaitlist} className="grid grid-cols-2 gap-2">
              <Field label="Client" className="col-span-2"><Select name="client_id" required>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Service" className="col-span-2"><Select name="service_id" required>{(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Date (blank = any)" className="col-span-2"><Input type="date" name="date" defaultValue={date} /></Field>
              <Field label="From"><Input type="time" name="from" /></Field>
              <Field label="To"><Input type="time" name="to" /></Field>
              <div className="col-span-2"><SubmitButton variant="secondary">Add to waitlist</SubmitButton></div>
            </form>
          </Card>
          <Card title="2 · Quick booking">
            <form action={bookAction} className="grid grid-cols-2 gap-2">
              <Field label="Existing client" className="col-span-2"><Select name="client_id" defaultValue=""><option value="">— new client below —</option>{(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone ?? ""}</option>)}</Select></Field>
              <Field label="New client name"><Input name="client_name" /></Field>
              <Field label="Phone"><Input name="client_phone" /></Field>
              <Field label="Service" className="col-span-2"><Select name="service_id" required>{(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Date"><Input type="date" name="date" defaultValue={date} required /></Field>
              <Field label="Exact time" hint="blank = best slot of day"><Input type="time" name="time" /></Field>
              <Field label="Stylist"><Select name="staff_id" defaultValue=""><option value="">AI chooses</option>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Source"><Select name="source"><option value="walkin">Walk-in</option><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option></Select></Field>
              <div className="col-span-2"><SubmitButton>Book</SubmitButton></div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
