// End-to-end smoke test that drives the real UI like a salon owner would.
// Usage: BASE_URL=http://localhost:3000 node tests/e2e.mjs
// Creates a throw-away account + salon ("E2E Test Salon <ts>") — delete it afterwards from Settings/DB.
import { createRequire } from "node:module";
// works with a local devDependency or a globally installed Playwright (NODE_PATH)
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ts = Date.now().toString(36);
const email = `e2e-${ts}@salonmind.test`;
const shots = process.env.SHOTS_DIR;
const log = (...a) => console.log("✔", ...a);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(90_000);
const shot = async (name) => shots && page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
const flash = async () => (await page.locator(".bg-emerald-50, .bg-red-50").first().textContent().catch(() => ""))?.trim();
// Server actions are soft navigations: wait for the pending (disabled) state to appear and clear.
const submit = async (form) => {
  await form.locator("button[type=submit]").click();
  await page.waitForSelector("button[type=submit][disabled]", { timeout: 3000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector("button[type=submit][disabled]"), null, { timeout: 120_000 });
  await page.waitForLoadState("networkidle");
};
const formWith = (title) => page.locator("section", { has: page.getByRole("heading", { name: title }) }).locator("form").first();

async function expectOk(step) {
  const err = await page.locator(".bg-red-50").first().textContent({ timeout: 1000 }).catch(() => null);
  if (err) throw new Error(`${step}: ${err}`);
  log(step, (await flash()) ?? "");
}

try {
  // ── sign up & onboard
  await page.goto(`${BASE}/signup`);
  await page.fill("input[name=name]", "E2E Owner");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Test12345!");
  await Promise.all([page.waitForURL(/onboarding/), page.click("button[type=submit]")]);
  log("signed up", email);
  await page.fill("input[name=name]", `E2E Test Salon ${ts}`);
  await page.fill("input[name=city]", "Mumbai");
  await page.fill("input[name=gstin]", "27ABCDE1234F1Z5");
  await page.fill("textarea[name=description]", "Balayage specialists, bridal makeup and men's grooming.");
  await Promise.all([page.waitForURL(/\/app/), page.click("button[type=submit]")]);
  log("salon created");

  // ── staff
  await page.goto(`${BASE}/app/staff`);
  let f = formWith("Add staff member");
  await f.locator("input[name=name]").fill("Asha Colourist");
  await f.locator("input[name=skill_level]").fill("5");
  await f.locator("input[name=skills]").fill("colour, balayage, bridal");
  await f.locator("input[name=hourly_cost]").fill("400");
  await submit(f); await expectOk("staff Asha");
  f = formWith("Add staff member");
  await f.locator("input[name=name]").fill("Ravi Barber");
  await f.locator("input[name=skill_level]").fill("3");
  await f.locator("input[name=skills]").fill("hair, grooming");
  await f.locator("select[name=employment_type]").selectOption("booth_renter");
  await f.locator("input[name=booth_rent_pct]").fill("30");
  await submit(f); await expectOk("staff Ravi (booth renter)");

  // ── rooms & services
  await page.goto(`${BASE}/app/services`);
  f = formWith("Add room / station");
  await f.locator("input[name=name]").fill("Colour bay"); await f.locator("input[name=equipment]").fill("wash basin");
  await submit(f); await expectOk("room");
  f = formWith("Add room / station");
  await f.locator("input[name=name]").fill("Chair 1");
  await submit(f); await expectOk("room 2");
  f = formWith("Add service");
  await f.locator("input[name=name]").fill("Balayage");
  await f.locator("select[name=category]").selectOption("colour");
  await f.locator("input[name=duration_min]").fill("120");
  await f.locator("input[name=base_price]").fill("2800");
  await f.locator("input[name=min_skill_level]").fill("4");
  await f.locator("input[name=required_equipment]").fill("wash basin");
  await f.locator("textarea[name=description]").fill("Hand-painted sun-kissed highlights");
  await submit(f); await expectOk("service Balayage");
  f = formWith("Add service");
  await f.locator("input[name=name]").fill("Men's haircut & beard");
  await f.locator("select[name=category]").selectOption("grooming");
  await f.locator("input[name=duration_min]").fill("45");
  await f.locator("input[name=base_price]").fill("600");
  await submit(f); await expectOk("service haircut");

  // ── inventory
  await page.goto(`${BASE}/app/inventory`);
  f = formWith("Add vendor");
  await f.locator("input[name=name]").fill("Mumbai Beauty Supplies");
  await f.locator("input[name=flexibility]").fill("0.7");
  await submit(f); await expectOk("vendor");
  f = formWith("Add product");
  await f.locator("input[name=name]").fill("Lightener powder");
  await f.locator("select[name=unit]").selectOption("g");
  await f.locator("select[name=vendor_id]").selectOption({ label: "Mumbai Beauty Supplies" });
  await f.locator("input[name=stock_qty]").fill("120");
  await f.locator("input[name=reorder_level]").fill("100");
  await f.locator("input[name=unit_cost]").fill("4");
  await f.locator("input[name=retail_price]").fill("0");
  await submit(f); await expectOk("product");
  await page.goto(`${BASE}/app/services`);
  f = formWith("Service recipe (product per service)");
  await f.locator("select[name=service_id]").selectOption({ label: "Balayage" });
  await f.locator("input[name=qty]").fill("40");
  await submit(f); await expectOk("recipe");

  // ── client & booking via scheduler
  await page.goto(`${BASE}/app/clients`);
  f = formWith("Add client");
  await f.locator("input[name=name]").fill("Priya Sharma");
  await f.locator("input[name=phone]").fill("+919800000001");
  await f.locator("select[name=language]").selectOption("hi");
  await submit(f); await expectOk("client");

  const tomorrow = new Date(Date.now() + 5.5 * 3600e3 + 86400e3).toISOString().slice(0, 10);
  await page.goto(`${BASE}/app/bookings?date=${tomorrow}`);
  f = formWith("2 · Quick booking");
  await f.locator("select[name=client_id]").selectOption({ label: "Priya Sharma +919800000001" });
  await f.locator("select[name=service_id]").selectOption({ label: "Balayage" });
  await f.locator("input[name=time]").fill("17:00");
  await submit(f); await expectOk("booking (scheduler + yield pricing + no-show agent)");
  await shot("bookings");

  // complete it → billing agent
  await page.locator("summary", { hasText: "Complete & bill" }).first().click();
  const cf = page.locator("form", { has: page.locator("select[name=payment_method]") }).first();
  await cf.locator("input[name=tip]").fill("200");
  await cf.locator("select[name=rating]").selectOption("5");
  await cf.locator("input[name=review]").fill("Bahut badhiya colour, loved it!");
  await submit(cf); await expectOk("completed → invoice");

  await page.goto(`${BASE}/app/billing`);
  const invCount = await page.locator("table tbody tr").count();
  if (!invCount) throw new Error("no invoice issued");
  log("invoice issued", (await page.locator("table tbody tr").first().textContent())?.replace(/\s+/g, " "));
  await shot("billing");

  // ── unified inbox: Hinglish booking request
  await page.goto(`${BASE}/app/inbox`);
  f = formWith("Test: incoming message");
  await f.locator("select[name=channel]").selectOption("whatsapp");
  await f.locator("input[name=handle]").fill("+919800000002");
  await f.locator("input[name=name]").fill("Rahul");
  await f.locator("textarea[name=body]").fill("Hi, kal 11am men's haircut & beard book kar do please");
  await submit(f); await expectOk("inbox → concierge");
  const reply = await page.locator(".bg-brand-50 p.whitespace-pre-wrap").last().textContent();
  log("concierge reply:", reply?.slice(0, 160));
  await shot("inbox");

  // ── procurement & all agents
  await page.goto(`${BASE}/app/inventory`);
  await submit(page.locator("form", { has: page.locator("input[name=agent][value=inventory]") })); await expectOk("procurement agent");
  await page.goto(`${BASE}/app/agents`);
  await submit(page.locator("form", { has: page.locator("input[name=agent][value=all]") }).first()); await expectOk("orchestrator");
  await shot("agents");

  // ── HR
  await page.goto(`${BASE}/app/hr`);
  f = formWith("Post a role");
  await f.locator("input[name=title]").fill("Senior Hair Colourist");
  await f.locator("input[name=salary_range]").fill("₹30,000–45,000 + commission");
  await f.locator("textarea[name=description]").fill("3+ years balayage, L'Oreal certified, weekends");
  await submit(f); await expectOk("job + AI ads");
  f = formWith("Add candidate (paste resume)");
  await f.locator("input[name=name]").fill("Meena K");
  await f.locator("textarea[name=resume_text]").fill("Hair colourist with 5 years experience at Lakme Salon Pune. L'Oreal Professionnel certified in balayage and global colour. Comfortable with weekend shifts.");
  await submit(f); await expectOk("candidate screened");

  // ── payroll
  await page.goto(`${BASE}/app/staff`);
  await submit(formWith("Run payroll")); await expectOk("payroll");

  // ── studio
  await page.goto(`${BASE}/app/studio`);
  await submit(formWith("Describe your dashboard")); await expectOk("AI studio layout");

  // ── marketplace (public)
  await page.goto(`${BASE}/marketplace`);
  await page.fill("input[placeholder^='e.g.']", "balayage under ₹3500 in Mumbai available tomorrow evening");
  await page.click("button:has-text('Search')");
  await page.waitForSelector("text=How the AI understood this", { timeout: 60_000 });
  const found = await page.locator(`text=E2E Test Salon ${ts}`).count();
  log("marketplace search results include salon:", found > 0);
  await shot("marketplace");
  if (!found) throw new Error("marketplace search did not find the salon");

  log("ALL E2E STEPS PASSED");
} catch (e) {
  console.error("✘ E2E FAILED:", e.message);
  await shot("failure");
  process.exitCode = 1;
} finally {
  await browser.close();
  console.log("test account:", email);
}
