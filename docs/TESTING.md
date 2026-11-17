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
14. **Inbox → New test chat** (top of the chat list): channel WhatsApp, from `+91…` (new number), body
    `kal 11am men's haircut book kar do`. The concierge detects intent/language and *proposes* a slot
    (green bubble). Type `yes` in the thread composer and press the **phone button** ("send as customer")
    → it books and confirms. The booking appears on tomorrow's schedule with source `whatsapp`.
    The green **send** button replies as the salon (human takeover); **Take over / Hand back to AI**
    pauses or resumes the AI for that chat; the WhatsApp button opens the number in WhatsApp.
15. Try Instagram/Google/call-transcript channels, a price question, a cancellation, a complaint —
    and other languages, e.g. `ನಾಳೆ 12 ಗಂಟೆಗೆ ಫೇಶಿಯಲ್ ಬುಕ್ ಮಾಡಿ` (Kannada), `کل 2 بجے فیشل بک کرنا ہے` (Urdu),
    `ਕੱਲ੍ਹ ਸ਼ਾਮ 6 ਵਜੇ ਹੇਅਰਕੱਟ ਬੁੱਕ ਕਰੋ` (Punjabi). Replies come back in the same script.
15a. **On a phone** (or DevTools at 390px): the inbox shows the chat list; tapping a chat opens it full
    screen with a ← back arrow, like WhatsApp. On `/marketplace` switch the language picker to اردو —
    the page flips right-to-left.

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

## 10. Growth features (from market research)
29. **Staff → Leave & blocked time**: block a stylist for a day → *Find best slots* never offers them.
30. **Clients → Import past visit**: give a client 3 haircuts 92, 64 and 36 days ago → *Run all agents* →
    the Campaign Agent sends the "week-5" offer (this is how to test RFP Module 2 without waiting weeks).
31. **Memberships & Loyalty**: create a plan (e.g. Gold 20% off, ₹500 wallet credit), sell it (GST invoice),
    top up a wallet. Complete a booking with *Redeem loyalty points* + *Pay from prepaid wallet* → the invoice
    shows the membership discount, points and wallet split; points are earned on every invoice.
32. Add a client with *Referred by* → complete their first visit → the referrer gets bonus points + a WhatsApp.
33. **Bookings → Waitlist**: add a client for a service/date; cancel or *Reschedule* a matching booking →
    the Waitlist Agent offers the freed slot; reply `YES` from that phone in the Inbox → it's booked.
34. Set a Google review link in Settings, complete with 5★ → review request + rebook date; complete with 2★
    → service-recovery apology + campaign entry.
35. Give a client a birthday within 7 days → *Run Campaign Agent* → birthday offer.
36. **Settings → Delete my account** (type DELETE) removes the account and its salons (DPDP).

## 11. Ported from open source
37. **Two-phase AI booking**: in the Inbox send `kal 11am men's haircut book kar do` → the concierge *proposes*
    (nothing on the schedule yet) → send `yes` from the same number → booked. `no` cancels the proposal.
38. **Human handoff**: send a complaint (`worst service, I want a refund`) → thread shows 👤 human handling and the
    AI stops replying; click *Hand back to AI* to resume. Two unintelligible messages in a row also escalate.
39. **UPI**: Settings → UPI ID (e.g. `yourname@okhdfcbank`). Risky bookings now get a `upi://pay` deposit link
    in the WhatsApp nudge, a *UPI link* on the Bookings page, and a scannable QR on the public booking confirmation.
40. **Statutory payroll**: Staff → set gender / PF / ESI → Run payroll → PF, ESI and state professional tax
    columns, net pay and employer cost.
41. **CSV import**: Clients → upload an export from Fresha/Vagaro/Booksy/Excel (Name/First+Last, Mobile, Email, DOB).
42. **Calendar feed**: Staff → copy a stylist's `.ics` URL → Google Calendar → *Other calendars → From URL*.
43. **Style advisor**: Marketplace → tick *Style advisor* → upload a selfie (needs a free Groq/Gemini key).

## 12. Translation, voice, walk-in queue, day close
44. **Translate the catalogue**: Settings → *Languages* → **Translate now**. Open your public page, switch the
    language picker to हिन्दी / தமிழ் — service names, description and deals are translated.
45. **Inbox translation**: Inbox → New test chat → send `நாளை மாலை ஹேர்கட் விலை என்ன?` → press **Translate** in the
    chat header (English appears under the message). Type a reply in English with *Send my reply in Tamil* ticked.
46. **Voice Agent**: press the round microphone button (bottom-right; Alt+V). Say or type `open bookings`,
    `add client name Meera phone 98765 43210 language tamil`, then `save`; ask `how many bookings today?`.
    Change the speech language in the panel to try `बुकिंग खोलो`. It also works on the sign-up page (not for the password).
47. **Ctrl/⌘ + K**: type `billing` + Enter, or any sentence to hand it to the Voice Agent.
48. **Walk-in queue**: Bookings → *Walk-in queue* → give a token. Open **QR & display** in another window
    (or scan the QR on a phone) and take a second token — you see your number, how many are ahead and the wait.
    Back on Bookings press **Call** on the first token: it is booked with the first free stylist.
49. **Day-end closing**: Billing → *Day-end closing* (after completing at least one booking today).
50. **Daily briefing**: add the salon phone in Settings → Agent Console → run *Daily Briefing Agent* → see the
    message in the Inbox.

## 13. Dashboard in your language
51. Sidebar footer → language picker → हिन्दी (or any of the 12). Navigation, buttons, forms and statuses switch at once;
    longer help texts follow a moment later (translated once, then cached). Choose اردو for right-to-left.
52. Open the voice assistant, pick हिन्दी as speech language and say `क्लाइंट दिखाओ` — it opens Clients and answers in Hindi.
53. Firefox (no built-in speech recognition): the first voice command downloads the on-device Whisper model (~75 MB, once).

## Automated checks
```bash
npm run typecheck && npm test && npm run build
npm run test:integration                            # every RFP bullet against the real DB (see RFP_COVERAGE.md)
BASE_URL=http://localhost:3000 node --env-file=.env.local tests/e2e.mjs   # drives steps 1–14, 18–22, 27, 29–31, 33, 36, 44–49 in a real browser
```
