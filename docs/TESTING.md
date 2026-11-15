# Manual test script (no synthetic data)

Everything below is entered by hand in the UI so you can watch each agent react. Open the
**Agent Console** in a second tab — every step should add runs/events there.

> Tip: without any LLM key the app runs in **rules-engine mode** (deterministic replies/templates).
> Add a free `GROQ_API_KEY` or `GEMINI_API_KEY` in Vercel → redeploy → repeat the inbox and
> marketplace steps to see multilingual LLM behaviour. The engine used is shown on every run.

## 1. Account & salon
1. `/signup` → name, email, password (≥8). You land on `/onboarding`.
2. Create the salon: name, city (e.g. Mumbai), state (GST code 27), GSTIN (optional, enables IRN reference).

## 2. Set up (Services & Rooms, Staff, Inventory)
3. **Staff**: add a level-5 colourist (skills `colour, balayage`) and a level-3 barber; make one a
   *booth renter* with 30% booth rent to test split payouts.
4. **Rooms**: "Colour bay" with equipment `wash basin`, and "Chair 1".
5. **Services**: Balayage (colour, 120 min, ₹2800, min skill 4, equipment `wash basin`) and
   Men's haircut (grooming, 45 min, ₹600). Note the "AI index" badge — the service is embedded for search.
6. **Inventory**: add a vendor (flexibility 0.7), then a product (e.g. Lightener powder, 120 g, reorder 100,
   ₹4/g) linked to that vendor. Back on Services, add a **recipe**: Balayage uses 40 g.
7. **Clients**: add a client with phone + preferred language Hindi.

## 3. Scheduling, pricing, no-show
8. **Bookings → Find best slots**: pick Balayage + a date → you get ranked options with reasons
   (only the L5 stylist + the colour bay qualify) and a dynamic price note (festival/weekend/off-peak).
9. Book one. Check the *No-show risk* badge (first-time clients score higher); above the deposit
   threshold a deposit is demanded and a WhatsApp nudge appears in the **Inbox**.

## 4. POS, GST, inventory, churn
10. **Complete & bill**: choose UPI, add a tip and a review such as "Bahut badhiya, loved it".
11. **Billing**: an invoice with CGST 9% + SGST 9%, FY number and IRN reference; open it → split payout.
12. **Agent Console**: billing → stock.check → inventory (PO drafted) → negotiator (discount) → churn
    (review sentiment). **Inventory**: the PO with AI reasoning and the negotiation thread; *Approve*
    then *Mark received* (adds stock + ITC).
13. **Billing → GST returns → Prepare**: GSTR-3B shows output tax, ITC (IGST first if vendor is
    out-of-state) and cash payable; GSTR-1 shows B2CS + HSN/SAC + document summary.

## 5. Unified inbox (AI concierge)
14. **Inbox → Test: incoming message**: channel WhatsApp, from `+91…` (new number), body
    `kal 11am men's haircut book kar do`. The concierge detects intent/language, books through the
    scheduler and replies. The booking appears on tomorrow's schedule with source `whatsapp`.
15. Try Instagram/Google/call-transcript channels, a price question, a cancellation, a complaint.

## 6. CRM automation
16. To see the 4-week → week-5 campaign, create a client with past visits: book + complete
    bookings on past dates (use the date picker on Bookings) e.g. 9, 6 and 3 weeks ago... then
    **Campaigns & Deals → Run Campaign Agent** (after Churn has scored them via *Run all agents*).
    The AI-written WhatsApp offer appears in the Campaign log and the Inbox.
17. Mark a booking **No-show** / leave a negative review → churn risk rises → recovery offer.

## 7. Recruitment & HR
18. **Recruitment → Post a role** → AI ads for Naukri/Apna/Instagram/WhatsApp + search strings.
19. Paste a resume → score + summary + status; open *Interview* and answer the questions.
20. **Staff → tips/penalties**, then **Run payroll** → progressive slab breakdown, booth-renter share.
21. Log excessive product usage on **Inventory → Smart-scale log** (actual > 1.2× recipe) → Waste
    Agent flags it → Performance Coach assigns "Product dosage & waste control".

## 8. Marketplace (consumer side, logged out / incognito)
22. `/marketplace` → search "balayage under ₹3500 in Mumbai available tomorrow evening".
    Expand *How the AI understood this* to see intent, vector search and availability checks.
23. Upload a hairstyle photo (needs a Groq/Gemini key for vision).
24. Click a slot → salon page → book with name/phone → confirmation (deposit if risky).
25. Use the **💬 Chat & book** widget on the salon page — it is the same concierge agent.
26. Cancel a future booking in the owner app → the Yield Agent publishes a **last-minute deal** on the marketplace.

## 9. Platform
27. **AI Studio**: "Show revenue and GST first, then low stock and at-risk clients, titles in Hindi"
    → a new dashboard layout generated from a typed widget registry.
28. **Settings**: tweak agent parameters (deposit threshold, surge cap…), toggle marketplace listing,
    export/erase a client's data (DPDP).

## Automated checks
```bash
npm run typecheck && npm test && npm run build
BASE_URL=http://localhost:3000 node tests/e2e.mjs   # drives steps 1–14, 18–22, 27 in a real browser
```
