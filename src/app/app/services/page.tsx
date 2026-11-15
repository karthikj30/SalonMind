import { getTenantContext } from "@/lib/tenant";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { addRecipe, addRoom, addService } from "../actions";
import { inr } from "@/lib/time";

export default async function Services({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { db, tenant } = await getTenantContext();
  const [{ data: services }, { data: rooms }, { data: products }, { data: recipes }] = await Promise.all([
    db.from("services").select("id, name, category, duration_min, base_price, min_skill_level, required_equipment, embedding_model").eq("tenant_id", tenant.id).order("name"),
    db.from("rooms").select("*").eq("tenant_id", tenant.id).order("name"),
    db.from("products").select("id, name, unit").eq("tenant_id", tenant.id).order("name"),
    db.from("service_products").select("service_id, qty_per_service, products(name, unit)").eq("tenant_id", tenant.id),
  ]);
  return (
    <>
      <PageHeader eyebrow="Operations" title="Services & Rooms" subtitle="The scheduler matches each service's skill level and equipment against stylists and rooms. Recipes tell the inventory agents how much product each service consumes." />
      <Flash msg={sp.msg} error={sp.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Service menu" className="lg:col-span-2">
          <Table head={["Service", "Category", "Duration", "Price", "Min skill", "Equipment", "Recipe", "AI index"]} empty="No services yet — add your first one.">
            {(services ?? []).map((s) => (
              <tr key={s.id}>
                <Td className="font-medium">{s.name}</Td><Td>{s.category}</Td><Td>{s.duration_min}m</Td><Td>{inr(s.base_price)}</Td><Td>L{s.min_skill_level}</Td>
                <Td>{s.required_equipment.join(", ") || "—"}</Td>
                <Td className="text-xs">{(recipes ?? []).filter((r) => r.service_id === s.id).map((r) => `${(r.products as unknown as { name: string; unit: string })?.name} ${r.qty_per_service}${(r.products as unknown as { unit: string })?.unit}`).join(", ") || "—"}</Td>
                <Td>{s.embedding_model ? <Badge tone="green">{s.embedding_model}</Badge> : <Badge>none</Badge>}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Add service">
          <form action={addService} className="grid grid-cols-2 gap-2">
            <Field label="Name" className="col-span-2"><Input name="name" required placeholder="Balayage" /></Field>
            <Field label="Category"><Select name="category">{["hair", "colour", "skin", "nails", "makeup", "spa", "grooming", "bridal"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Duration (min)"><Input name="duration_min" type="number" defaultValue={45} min={10} step={5} /></Field>
            <Field label="Base price ₹ (pre-GST)"><Input name="base_price" type="number" required min={0} /></Field>
            <Field label="Min skill (1-5)"><Input name="min_skill_level" type="number" defaultValue={1} min={1} max={5} /></Field>
            <Field label="Required equipment" hint="comma-separated, e.g. wash basin, steamer" className="col-span-2"><Input name="required_equipment" /></Field>
            <Field label="Description (improves AI search)" className="col-span-2"><Textarea name="description" placeholder="Hand-painted highlights, sun-kissed natural look…" /></Field>
            <div className="col-span-2"><SubmitButton>Add service</SubmitButton></div>
          </form>
        </Card>
        <Card title="Rooms / stations" className="lg:col-span-2">
          <Table head={["Name", "Type", "Equipment"]} empty="No rooms — if you add none, the scheduler only matches stylists (services needing equipment can't be booked).">
            {(rooms ?? []).map((r) => <tr key={r.id}><Td className="font-medium">{r.name}</Td><Td>{r.type}</Td><Td>{r.equipment.join(", ") || "—"}</Td></tr>)}
          </Table>
        </Card>
        <div className="space-y-4">
          <Card title="Add room / station">
            <form action={addRoom} className="space-y-2">
              <Field label="Name"><Input name="name" required placeholder="Chair 1 / Colour bay / Facial room" /></Field>
              <Field label="Type"><Select name="type">{["chair", "colour bay", "wash station", "treatment room", "nail station", "bridal suite"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Equipment" hint="comma-separated"><Input name="equipment" placeholder="wash basin, hair steamer" /></Field>
              <SubmitButton>Add room</SubmitButton>
            </form>
          </Card>
          <Card title="Service recipe (product per service)">
            <form action={addRecipe} className="space-y-2">
              <Field label="Service"><Select name="service_id" required>{(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Product"><Select name="product_id" required>{(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</Select></Field>
              <Field label="Quantity per service"><Input name="qty" type="number" step="0.1" required /></Field>
              <SubmitButton>Save recipe</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
