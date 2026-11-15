# Market & open-source research (Nov 2026)

What comparable salon products ship, what we took from them, and what we deliberately left out.

## Commercial salon software

Sources: MioSalon's 2026 hands-on comparison of 10 tools (MioSalon, GlossGenius, Vagaro, Fresha, Zenoti,
Mindbody, Boulevard, Phorest, Square, Booker); India-focused listings for SalonBoost, Zylu, Dingg, SalonX;
Zenoti's 2026 comparison pages.

| Capability seen in the market | Who has it | SalonMind |
|---|---|---|
| Memberships & service packages | MioSalon, GlossGenius, Vagaro, Fresha, Zenoti, Zylu, SalonBoost | ✅ added — plans with auto-discount + wallet credit, GST-invoiced sale |
| Prepaid wallet | SalonBoost, MioSalon | ✅ added — top-up, pay-at-checkout, ledger (GST at redemption) |
| Loyalty points / referrals | MioSalon, Fresha, Square, Phorest | ✅ added — Loyalty & Referral Agent |
| Automated waitlist filling | MioSalon, Fresha, Boulevard, GlossGenius | ✅ added — Waitlist Agent + "reply YES" booking via concierge |
| Staff attendance / blocked time | MioSalon, Fresha, OpenSalon | ✅ added — leave & blocked time respected by the scheduler |
| Google review requests / reputation | Fresha, GlossGenius, Square, Zenoti | ✅ added — Reputation & Rebooking Agent (+ service recovery for ≤3★) |
| Rebooking suggestions | MioSalon | ✅ added — next-visit date from the client's own cycle |
| Birthday / win-back campaigns | most platforms | ✅ birthday added; win-back already existed (Campaign + Churn agents) |
| WhatsApp reminders / invoices | Dingg, SalonBoost, SalonX (WhatsApp Business API) | ✅ via WhatsApp Cloud API when keys are set; simulated otherwise |
| AI receptionist / concierge | Zenoti (HyperConnect), Boulevard (beta), Mindbody | ✅ AI Concierge across WhatsApp/IG/Google/call/web |
| Consumer marketplace | Fresha (main differentiator) | ✅ with NL + photo search, live slots and AI deals |
| Consultation / consent forms, patch-test notes | GlossGenius, Vagaro, Fresha | ⏭ roadmap (client notes cover allergies today) |
| Gift cards | MioSalon, Vagaro, Mindbody | ⏭ roadmap (wallet top-up covers prepaid value) |
| Multi-location chains | Zenoti, Zylu | partial — one user can own many salons; chain-level reports on roadmap |

## Open-source projects on GitHub

Found via GitHub search (`salon management`, `appointment booking open source`):

| Repo | What it does | Ideas taken |
|---|---|---|
| clawnify/OpenSalon (Preact + Hono + SQLite) | Open-source Fresha/Salonist alternative: day calendar, blocked time slots, status workflow, CSV day sheet, REST API, "agent mode" UI | blocked time / leave ✅, reschedule ✅ |
| AbdullahBakir97/Barber-Salon (Django + HTMX) | appointments with working-hour validation, reviews moderation, gallery, multi-language | past-date validation on history import ✅, reviews → reputation agent ✅ |
| Abhisheksingh0303/Salon-Management-System (PHP) | classic CRUD for appointments, staff, services, billing | — (SalonMind already covers) |
| KarmaComputing/salon-booking-guru (Go) | online client booking | — |
| calcom/cal.diy (50k★) | scheduling infrastructure | design reference for buffer/limits (future) |

None of the open-source projects are AI-native or multi-tenant, none handle Indian GST, and none have an
agent mesh — those remain SalonMind's differentiators.

## Source links

* https://blog.miosalon.com/10-best-salon-software-hands-on-comparison-for-salons-in-2026/
* https://www.softwaresuggest.com/salonboost · https://www.capterra.in/software/1026558/zylu
* https://dingg.app/blogs/how-to-increase-salon-revenue-with-membership-plans-in-2026
* https://www.zenoti.com/thecheckin/best-salon-management-software-2026
* https://github.com/clawnify/OpenSalon · https://github.com/AbdullahBakir97/Barber-Salon
