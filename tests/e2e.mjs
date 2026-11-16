// End-to-end smoke test that drives the real UI like a salon owner would.
// Usage: BASE_URL=http://localhost:3000 node --env-file=.env.local tests/e2e.mjs   (the env file lets a failed run clean up after itself)
// Creates a throw-away account + salon and deletes both at the end via Settings → Delete (set KEEP_TEST_DATA=1 to keep them).
import { createRequire } from "node:module";
// works with a local devDependency or a globally installed Playwright (NODE_PATH)
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const ts = Date.now().toString(36);
const email = `e2e-${ts}@salonmind.test`;
const shots = process.env.SHOTS_DIR;
const log = (...a) => console.log("✔", ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
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

const mobileProblems = [];
// Voice Agent: open the assistant and run a typed command (same path a spoken sentence takes after speech-to-text)
async function voice(cmd) {
  const root = page.locator("[data-voice-assistant]");
  if (!(await page.locator("[role=dialog][aria-label='Voice assistant']").isVisible().catch(() => false))) await page.getByRole("button", { name: "Voice assistant", exact: true }).click();
  const before = Number(await root.getAttribute("data-voice-count"));
  await page.getByLabel("Type a command").fill(cmd);
  await page.getByRole("button", { name: "Run command" }).click();
  await page.waitForFunction((n) => Number(document.querySelector("[data-voice-assistant]")?.getAttribute("data-voice-count")) > n, before, { timeout: 30_000 });
  return (await root.getAttribute("data-voice-reply")) ?? "";
}
try {
  // ── sign up & onboard
  await page.goto(`${BASE}/signup`);
  // the Voice Agent fills the sign-up form (never the password — that is typed)
  log("voice on sign-up:", await voice(`name E2E Owner email ${email}`));
  if ((await page.inputValue("input[name=name]")) !== "E2E Owner" || (await page.inputValue("input[name=email]")) !== email) throw new Error("voice agent did not fill the sign-up form");
  if (await page.inputValue("input[name=password]")) throw new Error("voice agent must not touch the password field");
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

  // ── Voice Agent: navigate + fill in one sentence, save on request, answer a question, switch theme
  await page.goto(`${BASE}/app`);
  await voice("add client name Meera Voice phone 98765 00011 language tamil");
  await page.waitForURL(/\/app\/clients/);
  await page.waitForFunction(() => document.querySelector("input[name=name]")?.value === "Meera Voice", null, { timeout: 30_000 });
  f = formWith("Add client");
  if ((await f.locator("input[name=phone]").inputValue()) !== "9876500011" || (await f.locator("select[name=language]").inputValue()) !== "ta") throw new Error("voice agent filled the client form incorrectly");
  if (await page.locator("text=Client added").count()) throw new Error("voice agent must not save before being told to");
  log("voice: opened Clients and filled name, phone, language");
  await voice("save");
  await page.waitForSelector("text=Meera Voice >> visible=true", { timeout: 60_000 });
  await expectOk("voice: client saved on “save”");
  log("voice Q&A:", await voice("how many bookings today?"));
  await voice("dark mode");
  if (!(await page.evaluate(() => document.documentElement.classList.contains("dark")))) throw new Error("voice 'dark mode' did not switch the theme");
  await voice("light mode");
  // spoken path: a stand-in for the browser's speech recogniser "hears" a sentence when the mic is pressed
  await page.evaluate(() => {
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: "open billing" }], { isFinal: true })] }); this.onend?.(); }, 150); }
      stop() {} abort() {}
    };
  });
  await page.getByRole("button", { name: "Start listening" }).first().click();
  await page.waitForURL(/\/app\/billing/, { timeout: 30_000 });
  log("voice: microphone → “open billing” → Billing page");

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

  // ── unified inbox (WhatsApp-style): Hinglish booking request
  await page.goto(`${BASE}/app/inbox`);
  await page.getByText("New test chat").click();
  f = page.getByRole("form", { name: "Test: incoming message" });
  await f.locator("select[name=channel]").selectOption("whatsapp");
  await f.locator("input[name=handle]").fill("+919800000002");
  await f.locator("input[name=name]").fill("Rahul");
  await f.locator("textarea[name=body]").fill("Hi, kal 11am men's haircut & beard book kar do please");
  await submit(f); await expectOk("inbox → concierge");
  const reply = await page.locator(".wa-out p.whitespace-pre-wrap").last().textContent();
  log("concierge reply (proposal):", reply?.slice(0, 160));
  if (!/YES/.test(reply ?? "")) throw new Error("concierge should ask for explicit YES before booking");
  // customer answers from the thread composer ("send as customer" test button)
  await page.locator("section[aria-label=Conversation] textarea[name=body]").fill("yes");
  await page.getByRole("button", { name: "Send as customer (test)" }).click();
  await page.waitForFunction(() => /Confirmed/.test([...document.querySelectorAll(".wa-out p.whitespace-pre-wrap")].pop()?.textContent ?? ""), null, { timeout: 120_000 }).catch(() => {});
  await expectOk("customer confirms → booked");
  const confirmed = await page.locator(".wa-out p.whitespace-pre-wrap").last().textContent();
  if (!/Confirmed/.test(confirmed ?? "")) throw new Error("expected a booking confirmation, got: " + confirmed);
  log("concierge confirmation:", confirmed?.slice(0, 120));
  await shot("inbox");

  // ── Indic translation: a Tamil message is shown in English on demand; the reply goes out in Tamil
  await page.getByText("New test chat").click();
  f = page.getByRole("form", { name: "Test: incoming message" });
  await f.locator("input[name=handle]").fill("+919800000003");
  await f.locator("textarea[name=body]").fill("நாளை மாலை ஹேர்கட் விலை என்ன?");
  await submit(f); await expectOk("Tamil message received");
  await page.getByRole("link", { name: /Translate/ }).click();
  const shown = await page.locator("[data-translation]").first().textContent({ timeout: 60_000 }).catch(() => null);
  if (shown) { if (!/[a-z]{3}/i.test(shown) || /[\u0B80-\u0BFF]/.test(shown)) throw new Error("translation is not English: " + shown); log("inbox translation (ta → en):", shown.slice(0, 100)); }
  else console.warn("⚠ no translation provider answered (free API quota?) — inbox translation not verified in this run");
  if (await page.locator("input[name=translate_to]").count()) {
    await page.locator("section[aria-label=Conversation] textarea[name=body]").fill("Our haircut is 600 rupees. See you tomorrow!");
    await page.getByRole("button", { name: "Send reply" }).click();
    await page.waitForSelector("text=/Reply (translated|sent)/", { timeout: 60_000 });
    const sentBody = await page.locator(".wa-out p.whitespace-pre-wrap").last().textContent();
    if (/translated to Tamil/.test((await flash()) ?? "") && !/[\u0B80-\u0BFF]/.test(sentBody ?? "")) throw new Error("reply was not sent in Tamil: " + sentBody);
    log("reply to Tamil customer:", (await flash()) ?? "", "→", sentBody?.slice(0, 80));
  }

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

  // ── growth features: leave, waitlist, reschedule, past visits, memberships & wallet
  await page.goto(`${BASE}/app/staff`);
  f = formWith("Leave & blocked time");
  await f.locator("select[name=staff_id]").selectOption({ label: "Ravi Barber" });
  await f.locator("input[name=reason]").fill("training");
  await submit(f); await expectOk("staff leave");
  await page.goto(`${BASE}/app/clients`);
  f = formWith("Import past visit (visit history)");
  await f.locator("select[name=client_id]").selectOption({ label: "Priya Sharma" });
  await f.locator("select[name=service_id]").selectOption({ label: "Men's haircut & beard" });
  await f.locator("input[name=date]").fill(new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10));
  await submit(f); await expectOk("past visit import");
  await page.goto(`${BASE}/app/loyalty`);
  f = formWith("Create plan");
  await f.locator("input[name=name]").fill("Gold");
  await f.locator("input[name=price]").fill("3000");
  await f.locator("input[name=wallet_credit]").fill("500");
  await submit(f); await expectOk("membership plan");
  await submit(formWith("Sell membership")); await expectOk("membership sold");
  f = formWith("Top up prepaid wallet");
  await f.locator("input[name=amount]").fill("1000");
  await submit(f); await expectOk("wallet top-up");
  await page.goto(`${BASE}/app/bookings?date=${tomorrow}`);
  f = formWith("Waitlist");
  await f.locator("select[name=service_id]").selectOption({ label: "Balayage" });
  await submit(f); await expectOk("waitlist entry");
  await page.locator("summary", { hasText: "Reschedule" }).first().click();
  const rf = page.locator("form", { has: page.locator("input[name=new_time]") }).first();
  await rf.locator("input[name=new_time]").fill("10:00");
  await submit(rf); await expectOk("reschedule");
  await shot("growth");

  // ── marketplace (public)
  await page.goto(`${BASE}/marketplace`);
  await page.fill("input[placeholder^='e.g.']", "balayage under ₹3500 in Mumbai available tomorrow evening");
  await page.click("button:has-text('Search')");
  await page.waitForSelector("text=How the AI understood this", { timeout: 60_000 });
  const found = await page.locator(`text=E2E Test Salon ${ts}`).count();
  log("marketplace search results include salon:", found > 0);
  await shot("marketplace");
  if (!found) throw new Error("marketplace search did not find the salon");

  // ── Translator Agent: catalogue stored in Indian languages → salon page in Hindi
  await page.goto(`${BASE}/app/settings`);
  await submit(page.locator("form", { has: page.getByRole("button", { name: /Translate now|Translating/ }) }));
  const trMsg = (await flash()) ?? "";
  log("translator agent:", trMsg);
  if (/Translated \d+/.test(trMsg)) {
    const salonHref = await page.evaluate(() => document.querySelector("a[href^='/s/']")?.getAttribute("href"));
    await ctx.addCookies([{ name: "sm_lang", value: "hi", url: BASE }]);
    await page.goto(`${BASE}${salonHref}`);
    const menu = await page.locator("main").textContent();
    await ctx.addCookies([{ name: "sm_lang", value: "en", url: BASE }]);
    if (!/[\u0900-\u097F]{3,}/.test(menu ?? "")) throw new Error("salon page is not shown in Hindi after translation");
    const hindiService = await page.locator("p[title='Balayage']").textContent().catch(() => null);
    log("salon page in Hindi — “Balayage” is shown as:", hindiService);
  } else console.warn("⚠ no translation provider answered — catalogue translation not verified in this run");

  // ── mobile audit: every page at phone width must not scroll sideways (owner app + consumer pages, incl. RTL Urdu)
  {
    const m = await page.context().newPage();
    await m.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/app`);
    const slug = await page.evaluate(() => document.querySelector("a[href^='/s/']")?.getAttribute("href")) ?? null;
    if (!slug) throw new Error("public salon page link not found for the mobile audit");
    const routes = ["/app", "/app/bookings", "/app/inbox", "/app/clients", "/app/staff", "/app/services", "/app/inventory", "/app/marketing",
      "/app/loyalty", "/app/billing", "/app/hr", "/app/agents", "/app/studio", "/app/settings", "/marketplace", ...(slug ? [slug] : [])];
    const bad = [];
    for (const lang of ["en", "ta", "ur"]) {
      await page.context().addCookies([{ name: "sm_lang", value: lang, url: BASE }]);
      for (const r of lang === "en" ? routes : routes.filter((x) => !x.startsWith("/app"))) {
        await m.goto(`${BASE}${r}`); await m.waitForLoadState("networkidle").catch(() => {});
        const o = await m.evaluate(() => {
          const w = document.documentElement.clientWidth;
          const wide = [...document.querySelectorAll("body *")].filter((el) => {
            const b = el.getBoundingClientRect(); if (!b.width || getComputedStyle(el).position === "fixed") return false;
            let p = el.parentElement; while (p) { const ov = getComputedStyle(p).overflowX; if (ov === "auto" || ov === "scroll" || ov === "hidden") return false; p = p.parentElement; }
            return b.right > w + 1 || b.left < -1;
          }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
          return { scroll: document.documentElement.scrollWidth - w, wide };
        });
        if (o.scroll > 1) bad.push(`${lang} ${r}: +${o.scroll}px ${o.wide.join(" | ")}`);
        if (shots) await m.screenshot({ path: `${shots}/m-${lang}-${r.replace(/\//g, "_") || "root"}.png`, fullPage: false });
      }
    }
    // WhatsApp inbox on a phone: list first, then the thread with a back button
    await m.goto(`${BASE}/app/inbox`);
    if (!(await m.locator("aside[aria-label=Conversations]").isVisible())) bad.push("mobile inbox: chat list hidden");
    await m.locator("aside[aria-label=Conversations] ul a").first().click();
    await m.waitForSelector("a[aria-label='Back to chats']");
    if (await m.locator("aside[aria-label=Conversations]").isVisible()) bad.push("mobile inbox: list should hide while a chat is open");
    if (shots) await m.screenshot({ path: `${shots}/m-inbox-thread.png` });
    await page.context().addCookies([{ name: "sm_lang", value: "en", url: BASE }]);
    await m.close();
    mobileProblems.push(...bad);
    if (!bad.length) log(`mobile audit: ${routes.length} pages × 3 languages fit a 390px screen; WhatsApp inbox switches list ↔ thread`);
  }

  // ── DPDP: owner deletes account + salon (also cleans up this test run)
  if (!process.env.KEEP_TEST_DATA) {
    await page.goto(`${BASE}/app/settings`);
    await page.fill("input[name=confirm]", "DELETE");
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/app"), { timeout: 60_000 }), page.click("button:has-text('Delete')")]);
    await page.goto(`${BASE}/marketplace`);
    if (await page.locator(`text=E2E Test Salon ${ts}`).count()) throw new Error("salon still listed after account deletion");
    log("account + salon deleted (DPDP erasure)");
  }

  if (mobileProblems.length) throw new Error("mobile layout overflow:\n  " + mobileProblems.join("\n  "));
  log("ALL E2E STEPS PASSED");
} catch (e) {
  console.error("✘ E2E FAILED:", e.message);
  await shot("failure");
  process.exitCode = 1;
  // never leave a half-created test account behind: delete it through the same DPDP function the UI uses
  if (!process.env.KEEP_TEST_DATA && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const { createClient } = createRequire(import.meta.url)("@supabase/supabase-js");
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      if (!(await sb.auth.signInWithPassword({ email, password: "Test12345!" })).error) { await sb.rpc("delete_my_account"); console.log("cleaned up test account after failure"); }
    } catch { /* best effort */ }
  }
} finally {
  await browser.close();
  console.log("test account:", email);
}
