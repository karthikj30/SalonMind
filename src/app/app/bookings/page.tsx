import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td, statusTone } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addToWaitlist, addWalkin, bookAction, bookWaitlistOffer, callWalkinAction, completeBooking, recordDeposit, rescheduleAction, setBookingStatus, walkinLeft } from "../actions";
import { queueState } from "@/lib/services/queue";
import { waitLabel } from "@/lib/domain/queue";
import { planBooking } from "@/lib/services/booking";
import { addDays, fmtDateTime, inr, istDate, todayIst, toIst } from "@/lib/time";
import { upiLink } from "@/lib/domain/upi";
import { needsPatchTest, patchTestStatus, type PatchTest } from "@/lib/domain/consultation";
import { DayCalendar, CategoryLegend } from "@/components/DayCalendar";
import { CalendarDays, ListChecks, Wand2, Hourglass, Ticket, Zap } from "lucide-react";

export default async function Bookings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const date = sp.date || todayIst();
  const [{ data: bookings }, { data: clients }, { data: services }, { data: staff }, { data: products }, { data: waitlist }] = await Promise.all([
    db.from("bookings").select("*, clients(name, phone), services(name, category), staff(name), rooms(name)").eq("tenant_id", tenant.id)
      .gte("start_at", istDate(date, "00:00").toISOString()).lte("start_at", istDate(date, "23:59").toISOString()).order("start_at"),
    db.from("clients").select("id, name, phone").eq("tenant_id", tenant.id).order("name"),
    db.from("services").select("id, name, base_price, duration_min").eq("tenant_id", tenant.id).eq("active", true).order("name"),
    db.from("staff").select("id, name, skill_level, work_start, work_end").eq("tenant_id", tenant.id).eq("active", true).order("name"),
    db.from("products").select("id, name, retail_price").eq("tenant_id", tenant.id).order("name"),
    db.from("waitlist").select("*, clients(name), services(name)").eq("tenant_id", tenant.id).in("status", ["waiting", "offered"]).order("created_at"),
  ]);
  const { data: timeOff } = await db.from("staff_time_off").select("staff_id, start_at, end_at, reason").eq("tenant_id", tenant.id)
    .lte("start_at", istDate(date, "23:59").toISOString()).gte("end_at", istDate(date, "00:00").toISOString());
  // allergy-alert (patch) test status for colour services on this day
  const colourClients = [...new Set((bookings ?? []).filter((b) => b.client_id && needsPatchTest(b.services ?? {})).map((b) => b.client_id as string))];
  const { data: ptests } = colourClients.length ? await db.from("patch_tests").select("client_id, tested_on, result").eq("tenant_id", tenant.id).in("client_id", colourClients) : { data: [] };
  const patchOf = (b: { client_id: string | null; start_at: string; services?: { name?: string; category?: string } | null }) =>
    b.client_id && needsPatchTest(b.services ?? {}) ? patchTestStatus(((ptests ?? []) as (PatchTest & { client_id: string })[]).filter((p) => p.client_id === b.client_id), new Date(b.start_at)).status : null;
  const queue = await queueState(db, tenant).catch(() => null); // null until migration 0009 is applied
  let plan: Awaited<ReturnType<typeof planBooking>> | null = null;
  let planError: string | null = null;
  if (sp.plan && sp.service_id) {
    try { plan = await planBooking(db, tenant, { service_id: sp.service_id, date: sp.pdate || date, from: sp.from || null, to: sp.to || null, staff_id: sp.staff_id || null }); }
    catch (e) { planError = (e as Error).message; }
  }
  return (
    <>
      <PageHeader eyebrow="Front desk" title="Bookings" subtitle="Bookings go through the matrix scheduler (skill × room × equipment × margin) and yield pricing; the No-Show Agent scores each one instantly.">
        <form className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <a className="rounded-xl border border-brand-200 bg-surface px-3 py-2 text-sm hover:bg-brand-50" href={`?date=${addDays(date, -1)}`} aria-label="Previous day">←</a>
          <a className="rounded-xl border border-brand-200 bg-surface px-3 py-2 text-sm hover:bg-brand-50" href={`?date=${todayIst()}`}>Today</a>
          <div className="min-w-[8.5rem] flex-1 sm:w-40 sm:flex-none"><Input type="date" name="date" defaultValue={date} aria-label="Date" /></div>
          <button className="rounded-xl border border-brand-200 bg-surface px-3 py-2 text-sm hover:bg-brand-50">Go</button>
          <a className="rounded-xl border border-brand-200 bg-surface px-3 py-2 text-sm hover:bg-brand-50" href={`?date=${addDays(date, 1)}`} aria-label="Next day">→</a>
        </form>
      </PageHeader>
      <Flash msg={sp.msg} error={sp.error ?? planError ?? undefined} />
      <Card title={`Day calendar · ${new Date(date + "T12:00:00+05:30").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}`} icon={<CalendarDays className="h-4 w-4" />} className="mb-4"
        actions={<CategoryLegend categories={(bookings ?? []).map((b) => b.services?.category ?? "")} />}>
        <DayCalendar date={date} open={tenant.open_time} close={tenant.close_time} staff={staff ?? []} bookings={bookings ?? []} timeOff={timeOff ?? []} isToday={date === todayIst()} />
      </Card>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title={`Schedule · ${date}`} icon={<ListChecks className="h-4 w-4" />} className="xl:col-span-2">
          <Table head={["Time", "Client", "Service", "Stylist / room", "Price", "No-show risk", "Status", "Actions"]} empty="No bookings on this day.">
            {(bookings ?? []).map((b) => (
              <tr key={b.id} id={`b-${b.id}`} className="scroll-mt-24 target:bg-gold-50">
                <Td className="whitespace-nowrap font-medium text-brand-900">{toIst(new Date(b.start_at)).time}–{toIst(new Date(b.end_at)).time}</Td>
                <Td><div className="font-medium">{b.clients?.name ?? "—"}</div><div className="text-xs text-brand-900/40">{b.source}</div></Td>
                <Td>{b.services?.name}{(() => { const ps = patchOf(b); return ps && (
                  <a href={`/app/clients/${b.client_id}`} data-patch={ps} className={`mt-0.5 block text-[11px] ${ps === "ok" ? "text-emerald-700" : ps === "failed" ? "font-semibold text-red-700" : "text-amber-700"}`}>
                    {ps === "ok" ? "Patch test ✔" : ps === "failed" ? "⚠ Patch test reacted" : ps === "too_soon" ? "Patch test pending" : "Patch test needed"}
                  </a>); })()}</Td>
                <Td><div>{b.staff?.name ?? "—"}</div><div className="text-xs text-brand-900/55">{b.rooms?.name}</div>{b.schedule_reasoning && <div className="max-w-xs text-[11px] text-brand-900/40" title={b.schedule_reasoning}>{b.schedule_reasoning.slice(0, 80)}…</div>}</Td>
                <Td><div>{inr(b.price)}</div>{b.pricing_note && <div className="text-[11px] text-brand-900/55">{b.pricing_note}</div>}</Td>
                <Td>{b.no_show_risk === null ? "…" : <Badge tone={b.no_show_risk >= tenant.settings.deposit_threshold ? "red" : b.no_show_risk >= tenant.settings.nudge_threshold ? "amber" : "green"}>{Math.round(b.no_show_risk * 100)}%</Badge>}
                  {Number(b.deposit_required) > 0 && <div className="text-[11px] text-red-600">deposit {inr(b.deposit_required)}{Number(b.deposit_paid) > 0 ? " ✔ paid" : tenant.upi_vpa ? <> · <a className="underline" href={(() => { try { return upiLink({ vpa: tenant.upi_vpa!, name: tenant.name, amount: Number(b.deposit_required), note: "Deposit", ref: b.id.slice(0, 12) }); } catch { return "#"; } })()}>UPI link</a></> : null}</div>}</Td>
                <Td><Badge tone={statusTone(b.status)}>{b.status}</Badge>{b.rating && <div className="text-xs">{"★".repeat(b.rating)}</div>}</Td>
                <Td>
                  {["booked", "confirmed"].includes(b.status) ? (
                    <div className="flex flex-col gap-1 text-xs">
                      <details>
                        <summary className="cursor-pointer text-emerald-700">Complete & bill</summary>
                        <form action={completeBooking} className="mt-1 space-y-1 rounded border bg-ivory-100 p-2">
                          <input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={date} />
                          <Select name="payment_method" defaultValue="upi"><option value="upi">UPI</option><option value="card">Card</option><option value="netbanking">NetBanking</option><option value="cash">Cash</option><option value="wallet">Wallet</option></Select>
                          <Select name="product_id" defaultValue=""><option value="">+ retail product (optional)</option>{(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} {inr(p.retail_price)}</option>)}</Select>
                          <Input name="product_qty" type="number" min={1} defaultValue={1} placeholder="qty" />
                          <Input name="tip" type="number" min={0} placeholder="Tip ₹" />
                          <Select name="rating" defaultValue=""><option value="">Rating</option>{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r}★</option>)}</Select>
                          <Input name="review" placeholder="Client review (any language)" />
                          <label className="flex items-center gap-1"><input type="checkbox" name="redeem_points" /> Redeem loyalty points</label>
                          <label className="flex items-center gap-1"><input type="checkbox" name="use_wallet" /> Pay from prepaid wallet</label>
                          <label className="flex items-center gap-1"><input type="checkbox" name="use_package" defaultChecked /> Use a prepaid package session</label>
                          <Input name="gift_card_code" placeholder="Gift card code GC-XXXX-XXXX" autoComplete="off" />
                          <p className="text-[10px] text-brand-900/40">Active membership discount applies automatically.</p>
                          <SubmitButton className="w-full">Complete</SubmitButton>
                        </form>
                      </details>
                      <details>
                        <summary className="cursor-pointer text-amber-700">Reschedule</summary>
                        <form action={rescheduleAction} className="mt-1 space-y-1 rounded border bg-ivory-100 p-2">
                          <input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={date} />
                          <Input type="date" name="new_date" defaultValue={date} required /><Input type="time" name="new_time" required />
                          <SubmitButton className="w-full">Move</SubmitButton>
                        </form>
                      </details>
                      {Number(b.deposit_required) > 0 && Number(b.deposit_paid) === 0 && (
                        <form action={recordDeposit} className="flex gap-1"><input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={date} /><input type="hidden" name="amount" value={b.deposit_required} /><button className="text-violet-700 hover:underline">Deposit paid</button></form>
                      )}
                      {[["confirmed", "Confirm", "text-sky-700"], ["no_show", "No-show", "text-red-600"], ["cancelled", "Cancel", "text-brand-900/55"]].filter(([st]) => st !== b.status).map(([st, label, cls]) => (
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
          <Card title="1 · Find best slots (AI scheduler)" icon={<Wand2 className="h-4 w-4" />}>
            <form className="grid grid-cols-2 gap-2">
              <input type="hidden" name="plan" value="1" /><input type="hidden" name="date" value={date} />
              <Field label="Service" className="col-span-2"><Select name="service_id" defaultValue={sp.service_id} required>{(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · {inr(s.base_price)} · {s.duration_min}m</option>)}</Select></Field>
              <Field label="Date" className="col-span-2"><Input type="date" name="pdate" defaultValue={sp.pdate || date} /></Field>
              <Field label="Preferred from"><Input type="time" name="from" defaultValue={sp.from} /></Field>
              <Field label="Preferred to"><Input type="time" name="to" defaultValue={sp.to} /></Field>
              <Field label="Stylist (optional)" className="col-span-2"><Select name="staff_id" defaultValue={sp.staff_id ?? ""}><option value="">Any — let AI choose</option>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <button className="col-span-2 rounded-lg border border-brand-200 py-1.5 text-sm hover:bg-ivory-100">Suggest slots</button>
            </form>
            {plan && (
              <div className="mt-3 space-y-2">
                {plan.slots.length === 0 && <p className="text-sm text-amber-700">No feasible slot (check stylist skill levels, shifts, rooms with required equipment).</p>}
                {plan.slots.map((s, i) => (
                  <div key={i} className="rounded-lg border p-2 text-sm">
                    <div className="flex justify-between"><b>{fmtDateTime(s.start)}</b><span>{inr(s.quote.price)}</span></div>
                    <div className="text-xs text-brand-900/65">{s.staff.name}{s.room ? ` · ${s.room.name}` : ""} · score {s.score.toFixed(2)}</div>
                    <div className="text-[11px] text-brand-900/55">{s.reasons.join(" · ")} · {s.quote.note}</div>
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
          {queue && (
            <Card title={`Walk-in queue · today${queue.nowServing ? ` · now serving #${queue.nowServing}` : ""}`} icon={<Ticket className="h-4 w-4" />}
              actions={<a href={`/s/${tenant.slug}/queue`} target="_blank" className="text-xs text-brand-600 hover:underline" title="Customers can scan the QR on this page to join the queue themselves">QR & display ↗</a>}>
              <ul className="mb-3 space-y-1.5 text-xs" data-queue>
                {queue.serving.map((w) => (
                  <li key={w.id} className="flex items-center gap-2 rounded-lg bg-emerald-100/70 px-2.5 py-1.5"><b className="grid h-7 w-9 place-items-center rounded-md bg-surface font-mono text-sm">#{w.token_no}</b><span className="min-w-0 flex-1 truncate">{w.name} · {w.services?.name ?? "service"}</span><Badge tone="green">being served</Badge></li>
                ))}
                {queue.waiting.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-ivory-100 px-2.5 py-1.5">
                    <b className="grid h-7 w-9 place-items-center rounded-md bg-surface font-mono text-sm">#{w.token_no}</b>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium text-brand-900">{w.name}{w.source === "qr" && " · via QR"}</span><span className="block truncate text-brand-900/55">{w.services?.name ?? "no service chosen"} · wait {waitLabel(w.eta.waitMin)}</span></span>
                    <form action={callWalkinAction}><input type="hidden" name="id" value={w.id} /><SubmitButton className="!px-2.5 !py-1 !text-xs" pendingText="Seating…">Call</SubmitButton></form>
                    <form action={walkinLeft}><input type="hidden" name="id" value={w.id} /><button className="text-brand-900/45 hover:text-red-600" title="Customer left">Left</button></form>
                  </li>
                ))}
                {!queue.waiting.length && !queue.serving.length && <li className="text-brand-900/40">Nobody is waiting. Walk-ins get a token and a live wait estimate; “Call” seats them with the first free stylist.</li>}
              </ul>
              <form action={addWalkin} className="grid grid-cols-2 gap-2" aria-label="Add walk-in">
                <Field label="Walk-in name"><Input name="name" required /></Field>
                <Field label="Phone"><Input name="phone" type="tel" inputMode="tel" placeholder="for the “your turn” message" /></Field>
                <Field label="Service" className="col-span-2"><Select name="service_id" required>{(services ?? []).map((sv) => <option key={sv.id} value={sv.id}>{sv.name} · {sv.duration_min} min</option>)}</Select></Field>
                <div className="col-span-2"><SubmitButton variant="secondary">Give token</SubmitButton></div>
              </form>
            </Card>
          )}
          <Card title="Waitlist" icon={<Hourglass className="h-4 w-4" />}>
            <ul className="mb-3 space-y-1 text-xs">
              {(waitlist ?? []).map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                  <span><b>{w.clients?.name}</b> · {w.services?.name} · {w.date ?? "any day"} {w.from_time ? `${w.from_time.slice(0, 5)}–${(w.to_time ?? "").slice(0, 5)}` : ""}</span>
                  {w.status === "offered" ? (
                    <form action={bookWaitlistOffer}><input type="hidden" name="id" value={w.id} /><button className="text-emerald-700 hover:underline">Book {fmtDateTime(w.offered_slot)}</button></form>
                  ) : <Badge>waiting</Badge>}
                </li>
              ))}
              {!(waitlist ?? []).length && <li className="text-brand-900/40">Nobody waiting. When a slot frees up, the Waitlist Agent offers it automatically.</li>}
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
          <Card title="2 · Quick booking" icon={<Zap className="h-4 w-4" />}>
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
