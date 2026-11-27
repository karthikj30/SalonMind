/**
 * Multilingual concierge for rules-engine mode (no LLM key): native-script replies, script-based language
 * detection and keyword intent understanding for English + 12 Indian languages (Hindi, Bengali, Marathi,
 * Telugu, Tamil, Gujarati, Urdu, Kannada, Odia, Malayalam, Punjabi, Assamese).
 * With an LLM configured the model writes the reply instead; these keep every language working for free.
 */
import { T_MORE } from "./concierge-more.ts";

export type Lang = "en" | "hi" | "mr" | "ta" | "te" | "bn" | "gu" | "kn" | "ml" | "pa" | "or" | "ur" | "as";
export const REPLY_LANGS: Lang[] = ["en", "hi", "mr", "ta", "te", "bn", "gu", "kn", "ml", "pa", "or", "ur", "as"];

type Key = "greeting" | "proposal" | "confirmed" | "declined" | "handoff" | "slots" | "noSlots" | "price" | "cancelled" | "notAvailable" | "noBooking" | "askDetails";

const T: Record<Lang, Record<Key, string>> = {
  ...T_MORE,
  en: {
    greeting: "Namaste! Thanks for messaging {salon}. We offer: {list}. Tell me the service, date and time you'd like and I'll book it.",
    proposal: "I can book {service} on {when} with {stylist} — {price} + GST.\nReply YES to confirm or NO to change.",
    confirmed: "✅ Confirmed: {service} on {when} with {stylist}, {price} + GST. See you soon!",
    declined: "No problem — I haven't booked anything. Tell me another day or time that suits you.",
    handoff: "I'm sorry about this. A team member is taking over this chat and our manager will call you back within 2 hours.",
    slots: "Open slots for {service} on {date}: {list}. Reply with a time to book.",
    noSlots: "No open slots for {service} on {date}. Try another day?",
    price: "{service} costs {price} (+{gst}% GST), {mins} minutes.",
    cancelled: "✅ Cancelled your booking on {when}.",
    notAvailable: "{time} is not available for {service}.",
    noBooking: "I couldn't find an upcoming booking to cancel.",
    askDetails: "Which service, date and time would you like?",
  },
  hi: {
    greeting: "नमस्ते! {salon} को संदेश भेजने के लिए धन्यवाद। हमारी सेवाएँ: {list}। आपको कौन-सी सेवा, किस दिन और किस समय चाहिए, बताइए — बुकिंग हो जाएगी।",
    proposal: "{service} — {when}, {stylist} के साथ, {price} + GST उपलब्ध है।\nपुष्टि के लिए हाँ / YES लिखें, बदलने के लिए NO।",
    confirmed: "✅ बुकिंग पक्की: {service}, {when}, {stylist} के साथ, {price} + GST। जल्द मिलते हैं!",
    declined: "ठीक है — कुछ भी बुक नहीं किया गया। कोई दूसरा दिन या समय बताइए।",
    handoff: "असुविधा के लिए खेद है। हमारी टीम का एक सदस्य अब यह चैट संभालेगा और मैनेजर 2 घंटे में आपको कॉल करेंगे।",
    slots: "{date} को {service} के लिए खाली समय: {list}। बुक करने के लिए समय बताइए।",
    noSlots: "{date} को {service} के लिए कोई समय खाली नहीं है। कोई दूसरा दिन बताइए।",
    price: "{service}: {price} (+{gst}% GST), {mins} मिनट।",
    cancelled: "✅ आपकी {when} की बुकिंग रद्द कर दी गई है।",
    notAvailable: "{time} पर {service} उपलब्ध नहीं है।",
    noBooking: "रद्द करने के लिए कोई आने वाली बुकिंग नहीं मिली।",
    askDetails: "आपको कौन-सी सेवा, किस दिन और किस समय चाहिए?",
  },
  mr: {
    greeting: "नमस्कार! {salon} ला संदेश पाठवल्याबद्दल धन्यवाद. आमच्या सेवा: {list}. कोणती सेवा, कोणत्या दिवशी आणि किती वाजता हवी ते सांगा — बुकिंग होईल.",
    proposal: "{service} — {when}, {stylist} सोबत, {price} + GST उपलब्ध आहे.\nनिश्चित करण्यासाठी हो / YES लिहा, बदलण्यासाठी NO.",
    confirmed: "✅ बुकिंग निश्चित: {service}, {when}, {stylist} सोबत, {price} + GST. लवकरच भेटू!",
    declined: "ठीक आहे — काहीही बुक केलेले नाही. दुसरा दिवस किंवा वेळ सांगा.",
    handoff: "गैरसोयीबद्दल क्षमस्व. आमच्या टीमचा सदस्य आता ही चॅट हाताळेल आणि मॅनेजर 2 तासांत तुम्हाला कॉल करतील.",
    slots: "{date} रोजी {service} साठी उपलब्ध वेळा: {list}. बुक करण्यासाठी वेळ सांगा.",
    noSlots: "{date} रोजी {service} साठी वेळ उपलब्ध नाही. दुसरा दिवस सांगा.",
    price: "{service}: {price} (+{gst}% GST), {mins} मिनिटे.",
    cancelled: "✅ तुमचे {when} चे बुकिंग रद्द केले आहे.",
    notAvailable: "{time} ला {service} उपलब्ध नाही.",
    noBooking: "रद्द करण्यासाठी कोणतेही आगामी बुकिंग सापडले नाही.",
    askDetails: "तुम्हाला कोणती सेवा, कोणत्या दिवशी आणि किती वाजता हवी?",
  },
  ta: {
    greeting: "வணக்கம்! {salon}-க்கு செய்தி அனுப்பியதற்கு நன்றி. எங்கள் சேவைகள்: {list}. எந்த சேவை, எந்த நாள், எந்த நேரம் வேண்டும் என்று சொல்லுங்கள் — முன்பதிவு செய்து தருகிறோம்.",
    proposal: "{service} — {when}, {stylist} உடன், {price} + GST கிடைக்கிறது.\nஉறுதிப்படுத்த ஆம் / YES என அனுப்புங்கள், மாற்ற NO.",
    confirmed: "✅ முன்பதிவு உறுதி: {service}, {when}, {stylist} உடன், {price} + GST. விரைவில் சந்திப்போம்!",
    declined: "சரி — எதுவும் முன்பதிவு செய்யப்படவில்லை. வேறு நாள் அல்லது நேரத்தைச் சொல்லுங்கள்.",
    handoff: "சிரமத்திற்கு வருந்துகிறோம். எங்கள் குழு உறுப்பினர் இந்த உரையாடலைத் தொடர்வார்; மேலாளர் 2 மணி நேரத்திற்குள் உங்களை அழைப்பார்.",
    slots: "{date} அன்று {service}-க்கு காலியான நேரங்கள்: {list}. முன்பதிவு செய்ய நேரத்தைச் சொல்லுங்கள்.",
    noSlots: "{date} அன்று {service}-க்கு நேரம் காலியில்லை. வேறு நாளைச் சொல்லுங்கள்.",
    price: "{service}: {price} (+{gst}% GST), {mins} நிமிடங்கள்.",
    cancelled: "✅ உங்கள் {when} முன்பதிவு ரத்து செய்யப்பட்டது.",
    notAvailable: "{time}-க்கு {service} கிடைக்கவில்லை.",
    noBooking: "ரத்து செய்ய வரவிருக்கும் முன்பதிவு எதுவும் இல்லை.",
    askDetails: "எந்த சேவை, எந்த நாள், எந்த நேரம் வேண்டும்?",
  },
  te: {
    greeting: "నమస్కారం! {salon}కి సందేశం పంపినందుకు ధన్యవాదాలు. మా సేవలు: {list}. ఏ సేవ, ఏ రోజు, ఏ సమయం కావాలో చెప్పండి — బుకింగ్ చేస్తాము.",
    proposal: "{service} — {when}, {stylist}తో, {price} + GST అందుబాటులో ఉంది.\nనిర్ధారించడానికి అవును / YES అని పంపండి, మార్చడానికి NO.",
    confirmed: "✅ బుకింగ్ ఖరారైంది: {service}, {when}, {stylist}తో, {price} + GST. త్వరలో కలుద్దాం!",
    declined: "సరే — ఏదీ బుక్ చేయలేదు. మరో రోజు లేదా సమయం చెప్పండి.",
    handoff: "అసౌకర్యానికి క్షమించండి. మా బృంద సభ్యులు ఇప్పుడు ఈ చాట్‌ను చూసుకుంటారు; మేనేజర్ 2 గంటల్లో మీకు కాల్ చేస్తారు.",
    slots: "{date}న {service}కి ఖాళీ సమయాలు: {list}. బుక్ చేయడానికి సమయం చెప్పండి.",
    noSlots: "{date}న {service}కి ఖాళీ సమయం లేదు. మరో రోజు చెప్పండి.",
    price: "{service}: {price} (+{gst}% GST), {mins} నిమిషాలు.",
    cancelled: "✅ మీ {when} బుకింగ్ రద్దు చేయబడింది.",
    notAvailable: "{time}కి {service} అందుబాటులో లేదు.",
    noBooking: "రద్దు చేయడానికి రాబోయే బుకింగ్ ఏదీ కనిపించలేదు.",
    askDetails: "ఏ సేవ, ఏ రోజు, ఏ సమయం కావాలి?",
  },
  bn: {
    greeting: "নমস্কার! {salon}-এ বার্তা পাঠানোর জন্য ধন্যবাদ। আমাদের পরিষেবা: {list}। কোন পরিষেবা, কোন দিন এবং কোন সময় চান জানান — বুকিং করে দেব।",
    proposal: "{service} — {when}, {stylist}-এর সাথে, {price} + GST পাওয়া যাচ্ছে।\nনিশ্চিত করতে হ্যাঁ / YES লিখুন, বদলাতে NO।",
    confirmed: "✅ বুকিং নিশ্চিত: {service}, {when}, {stylist}-এর সাথে, {price} + GST। শীঘ্রই দেখা হবে!",
    declined: "ঠিক আছে — কিছুই বুক করা হয়নি। অন্য দিন বা সময় জানান।",
    handoff: "অসুবিধার জন্য দুঃখিত। আমাদের টিমের একজন সদস্য এখন এই চ্যাটটি দেখবেন এবং ম্যানেজার ২ ঘণ্টার মধ্যে আপনাকে ফোন করবেন।",
    slots: "{date} তারিখে {service}-এর জন্য খালি সময়: {list}। বুক করতে সময় জানান।",
    noSlots: "{date} তারিখে {service}-এর জন্য কোনো সময় খালি নেই। অন্য দিন জানান।",
    price: "{service}: {price} (+{gst}% GST), {mins} মিনিট।",
    cancelled: "✅ আপনার {when}-এর বুকিং বাতিল করা হয়েছে।",
    notAvailable: "{time}-এ {service} পাওয়া যাচ্ছে না।",
    noBooking: "বাতিল করার মতো কোনো আসন্ন বুকিং পাওয়া যায়নি।",
    askDetails: "কোন পরিষেবা, কোন দিন এবং কোন সময় চান?",
  },
};

export function reply(lang: string | null | undefined, key: Key, vars: Record<string, string | number> = {}) {
  const l = (REPLY_LANGS as string[]).includes(lang ?? "") ? (lang as Lang) : "en";
  return T[l][key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/**
 * The "reply YES to confirm or NO to change" line of a booking proposal, for a reply that left it out:
 * in English when the reply is written in Latin letters (English, Hinglish), else in the reply's language.
 */
export function confirmLine(replyText: string, lang: string | null | undefined) {
  const latin = !/[^\u0000-\u024f\s\p{P}\p{S}\p{N}]/u.test(replyText);
  return reply(latin ? "en" : lang, "proposal").split("\n").pop()!;
}

/**
 * Canonical form for matching: NFC (so nukta letters like ਖ਼ ड़ য় compare equal however they were typed) and
 * Arabic-keyboard ك/ي folded to the Urdu ک/ی.
 */
export const norm = (s: string) => s.normalize("NFC").replace(/ك/g, "ک").replace(/ي/g, "ی");
/** Regex from a pattern source, normalised the same way as the text it will run on. */
const re = (src: string, flags = "iu") => new RegExp(norm(src), flags);
/** Whole-word match for short words that also occur inside others (कल ⊂ कलर, کل ⊂ کلر, কাল ⊂ কালার). */
const W = (alts: string) => `(?<![\\p{L}\\p{M}])(?:${alts})(?![\\p{L}\\p{M}])`;

/** Every Indian-script digit (and Arabic-Indic digits used with Urdu) → ASCII. */
const DIGIT_ZEROS = [0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0660, 0x06f0];
export function asciiDigits(s: string) {
  return s.replace(/[०-९০-৯੦-੯૦-૯୦-୯௦-௯౦-౯೦-೯൦-൯٠-٩۰-۹]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c - DIGIT_ZEROS.find((z) => c >= z && c <= z + 9)!);
  });
}

/** Detect language from Unicode script. Devanagari is Hindi unless Marathi markers are present; Bengali script is Assamese when ৰ/ৱ or Assamese words appear. */
export function detectLang(text0: string, hint?: string | null): Lang {
  const text = norm(text0);
  if (/[஀-௿]/.test(text)) return "ta";
  if (/[ఀ-౿]/.test(text)) return "te";
  if (/[ಀ-೿]/.test(text)) return "kn";
  if (/[ഀ-ൿ]/.test(text)) return "ml";
  if (/[઀-૿]/.test(text)) return "gu";
  if (/[਀-੿]/.test(text)) return "pa";
  if (/[଀-୿]/.test(text)) return "or";
  if (/[؀-ۿ]/.test(text)) return "ur";
  if (/[ঀ-৿]/.test(text)) return hint === "as" || re("[ৰৱ]|কিমান|কাইলৈ|আজি|পুৱা|সন্ধিয়া|নমস্কাৰ").test(text) ? "as" : "bn";
  if (/[ऀ-ॿ]/.test(text)) return hint === "mr" || /(आहे|आहेत|उद्या|हवी|हवा|करायचे|किंमत|मला|तुम्ही)/.test(text) ? "mr" : "hi";
  return (REPLY_LANGS as string[]).includes(hint ?? "") ? (hint as Lang) : "en";
}

const END = "(?=$|[\\s.!,।॥۔،])";
const KW = {
  yes: re(`^\\s*(yes|y|ok|okay|confirm|confirmed|1|haan|ha|han|ho|ji|हाँ|हां|हा|हो|ஆம்|சரி|అవును|సరే|হ্যাঁ|হ্যা|હા|હાં|ಹೌದು|ಸರಿ|അതെ|ശരി|ਹਾਂ|ਹਾਂਜੀ|ହଁ|ହଉ|ہاں|جی|হয়)${END}`),
  no: re(`^\\s*(no|n|nahi|nahin|2|नहीं|नको|இல்லை|వద్దు|లేదు|না|ના|નહીં|ಇಲ್ಲ|ಬೇಡ|ഇല്ല|വേണ്ട|ਨਹੀਂ|ନା|ନାହିଁ|نہیں|نہ|নহয়)${END}`),
  book: re("(book|booking|appointment|slot|reserve|बुक|बुकिंग|अपॉइंटमेंट|முன்பதிவு|புக்|బుక్|బుకింగ్|বুক|বুকিং|બુક|બુકિંગ|ಬುಕ್|ಬುಕಿಂಗ್|ബുക്ക|ബുക്കിംഗ്|ਬੁੱਕ|ਬੁਕਿੰਗ|ବୁକ|بک|بکنگ|اپوائنٹمنٹ)"),
  price: re("\\b(price|cost|rate|rates|charges?|how much|kitna|kitne)\\b|कितना|कितने|दाम|कीमत|किंमत|விலை|எவ்வளவு|ధర|ఎంత|দাম|কত|કિંમત|ભાવ|કેટલા|કેટલું|ಬೆಲೆ|ಎಷ್ಟು|വില|എത്ര|നിരക്ക്|ਕੀਮਤ|ਕਿੰਨਾ|ਕਿੰਨੇ|ਰੇਟ|ଦାମ|କେତେ|ମୂଲ୍ୟ|قیمت|کتنا|کتنے|ریٹ|কিমান"),
  avail: re("\\b(available|availability|free|open|timings?|slots?)\\b|खाली|उपलब्ध|காலி|நேரம்|ఖాళీ|సమయం|খালি|সময়|ખાલી|ઉપલબ્ધ|ಖಾಲಿ|ಲಭ್ಯ|ഒഴിവ്|ലഭ്യ|ਖ਼ਾਲੀ|ਖਾਲੀ|ਉਪਲਬਧ|ଖାଲି|ଉପଲବ୍ଧ|خالی|دستیاب|খালী"),
  cancel: re("\\b(cancel|radd)\\b|रद्द|ரத்து|రద్దు|বাতিল|રદ|ರದ್ದು|റദ്ദ|ਰੱਦ|ବାତିଲ|منسوخ|کینسل"),
  complaint: re("\\b(bad|worst|complain|complaint|rude|refund)\\b|शिकायत|खराब|बेकार|மோசம்|புகார்|చెడ్డ|ఫిర్యాదు|খারাপ|অভিযোগ|ફરિયાદ|ખરાબ|ದೂರು|ಕೆಟ್ಟ|പരാതി|മോശം|ਸ਼ਿਕਾਇਤ|ਮਾੜਾ|ਖ਼ਰਾਬ|ਖਰਾਬ|ଅଭିଯୋଗ|ଖରାପ|شکایت|خراب|বেয়া"),
  greet: re("\\b(hi|hello|namaste|hey|vanakkam|namaskar|salaam|sat sri akal)\\b|नमस्ते|नमस्कार|வணக்கம்|నమస్కారం|నమస్తే|নমস্কার|નમસ્તે|ನಮಸ್ಕಾರ|ನಮಸ್ತೆ|നമസ്കാരം|ਸਤ ਸ੍ਰੀ ਅਕਾਲ|ਨਮਸਤੇ|ନମସ୍କାର|السلام علیکم|سلام|آداب|নমস্কাৰ"),
  tomorrow: re(`\\b(tomorrow|kal)\\b|${W("कल|কাল|کل|ਕੱਲ੍ਹ|ਕੱਲ")}|उद्या|நாளை|రేపు|আগামীকাল|આવતીકાલે|કાલે|ನಾಳೆ|നാളെ|କାଲି|কাইলৈ`),
  today: re("\\b(today|aaj)\\b|आज|இன்று|ఈరోజు|ఈ రోజు|আজ|આજે|ಇಂದು|ಇವತ್ತು|ഇന്ന്|ਅੱਜ|ଆଜି|آج"),
};
const EVENING = re("shaam|शाम|संध्याकाळ|மாலை|సాయంత్రం|সন্ধ্যা|સાંજ|ಸಂಜೆ|വൈകുന്നേരം|വൈകിട്ട്|ਸ਼ਾਮ|ସନ୍ଧ୍ୟା|شام|সন্ধিয়া");

/** Words for common service categories in Indian languages → English category/name keywords. */
const SERVICE_WORDS: [RegExp, string[]][] = [
  [re("balayage|बालायाज|பாலயாஜ்|బాలయాజ్|বালায়াজ|બાલાયાજ|ಬಾಲಯಾಜ್|ബാലയാജ്|ਬਾਲਾਯਾਜ|ବାଲାୟାଜ|بالیاژ"), ["balayage", "colour", "color"]],
  [re("haircut|hair cut|बाल(?!ा)|हेयर ?कट|हेअर ?कट|முடி|ஹேர்கட்|హెయిర్ ?కట్|హెయిర్|జుట్టు|চুল কাটা|চুল|হেয়ারকাট|હેરકટ|વાળ(?!ા)|ಹೇರ್\u200c?ಕಟ್|ಹೇರ್|ಕೂದಲು|ഹെയർകട്ട്|ഹെയർ|മുടി|ਹੇਅਰ ?ਕੱਟ|ਹੇਅਰ|ਵਾਲ(?![ਾੇੀ])|ହେୟାରକଟ୍?|ହେୟାର|ବାଳ|ہیئر ?کٹ|ہیئر|بال(?!ی)|হেয়াৰকাট|হেয়াৰ|চুলি"), ["haircut", "hair", "grooming"]],
  [re("facial|फेशियल|फेसियल|ஃபேஷியல்|ఫేషియల్|ফেসিয়াল|ফেশিয়াল|ફેશિયલ|ಫೇಶಿಯಲ್|ഫേഷ്യൽ|ഫേഷ്യ|ਫੇਸ਼ੀਅਲ|ଫେସିଆଲ୍?|فیشل|ফেচিয়েল"), ["facial", "skin"]],
  [re("colou?r|highlights|कलर|रंग|கலர்|కలర్|কালার|রং|કલર|રંગ|ಕಲರ್|ಬಣ್ಣ|കളർ|നിറം|ਕਲਰ|ਰੰਗ|କଲର୍?|ରଙ୍ଗ|کلر|رنگ|কলাৰ|ৰং"), ["colour", "balayage", "color"]],
  [re("manicure|pedicure|nail|नाखून|नेल|நகம்|గోళ్ళు|నెయిల్|নখ|নেইল|નખ|નેઇલ|ಉಗುರು|ನೇಲ್|നഖ|നെയിൽ|ਨਹੁੰ|ਨੇਲ|ନଖ|ନେଲ|ناخن|نیل"), ["nails", "manicure", "nail"]],
  [re("bridal|makeup|मेकअप|दुल्हन|மேக்கப்|மணப்பெண்|మేకప్|মেকআপ|কনে|મેકઅપ|દુલ્હન|બ્રાઇડલ|ಮೇಕಪ್|ವಧು|മേക്കപ്പ്|വധു|ബ്രൈഡൽ|ਮੇਕਅੱਪ|ਦੁਲਹਨ|ਬ੍ਰਾਈਡਲ|ମେକଅପ|କନିଆ|ବ୍ରାଇଡାଲ|میک اپ|دلہن|কইনা"), ["bridal", "makeup"]],
  [re("beard|shave|दाढ़ी|दाढी|தாடி|గడ్డం|দাড়ি|દાઢી|ಗಡ್ಡ|താടി|ਦਾੜ੍ਹੀ|ଦାଢ଼ି|داڑھی"), ["beard", "grooming"]],
  [re("spa|massage|मसाज|स्पा|மசாஜ்|మసాజ్|ম্যাসাজ|મસાજ|સ્પા|ಮಸಾಜ್|ಸ್ಪಾ|മസാജ്|സ്പാ|ਮਸਾਜ|ਸਪਾ|ମସାଜ|ସ୍ପା|مساج|سپا|মাছাজ|স্পা"), ["spa", "massage"]],
];

export function matchService<T extends { name: string; category: string }>(text0: string, services: T[]): T | undefined {
  const text = norm(text0);
  const s = text.toLowerCase();
  const direct = services.find((x) => s.includes(x.name.toLowerCase()) || s.includes(x.category.toLowerCase()));
  if (direct) return direct;
  for (const [rx, keys] of SERVICE_WORDS) {
    if (!rx.test(text)) continue;
    const hit = services.find((x) => keys.some((k) => x.name.toLowerCase().includes(k) || x.category.toLowerCase() === k));
    if (hit) return hit;
  }
  return undefined;
}

export type RuleIntent = { language: Lang; intent: "book" | "availability" | "price" | "cancel" | "complaint" | "greeting" | "other"; dayOffset: 0 | 1 | null; time: string | null };

const LOCAL_TIME = re("(\\d{1,2})(?::(\\d{2}))?\\s*(baje|बजे|वाजता|மணிக்கு|மணி|గంటలకు|గంటకు|টায়|টা|વાગ્યે|વાગે|ಗಂಟೆಗೆ|ಗಂಟೆ|മണിക്ക്|മണി|ਵਜੇ|ଟାରେ|ଟା|بجے|বজাত|বজা)");

/** Keyword + time parsing across scripts: "11am", "6 baje", "6 बजे", "6 மணிக்கு", "6 ಗಂಟೆಗೆ", "6 بجے", "৬টায়". */
export function ruleIntent(text0: string, langHint?: string | null): RuleIntent {
  const text = norm(text0);
  const s = text.toLowerCase();
  const language = detectLang(text, langHint);
  const intent: RuleIntent["intent"] = KW.cancel.test(s) ? "cancel" : KW.complaint.test(s) ? "complaint" : KW.book.test(s) ? "book"
    : KW.price.test(s) ? "price" : KW.avail.test(s) ? "availability" : KW.greet.test(s) ? "greeting" : "other";
  const dayOffset = KW.tomorrow.test(s) ? 1 : KW.today.test(s) ? 0 : null;
  const ascii = asciiDigits(text);
  let time: string | null = null;
  const ampm = ascii.toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  const local = ascii.match(LOCAL_TIME);
  if (ampm) {
    let h = Number(ampm[1]); if (ampm[3] === "pm" && h < 12) h += 12; if (ampm[3] === "am" && h === 12) h = 0;
    time = `${String(h).padStart(2, "0")}:${ampm[2] ?? "00"}`;
  } else if (local) {
    let h = Number(local[1]);
    if (h >= 1 && h <= 8) h += 12; // "6 baje" at a salon means 6 pm
    if (EVENING.test(text) && h < 12) h += 12;
    time = `${String(h).padStart(2, "0")}:${local[2] ?? "00"}`;
  }
  return { language, intent, dayOffset, time };
}

export const isYes = (t: string) => KW.yes.test(norm(t));
export const isNo = (t: string) => KW.no.test(norm(t));

const QUERY_MAP: [RegExp, string][] = [
  [re(`आगामीकाल|आगामी काल|আগামীকাল|उद्या|நாளை|రేపు|આવતીકાલે|કાલે|ನಾಳೆ|നാളെ|କାଲି|কাইলৈ|\\bkal\\b|${W("कल|কাল|کل|ਕੱਲ੍ਹ|ਕੱਲ")}`, "giu"), " tomorrow "],
  [re("आज|இன்று|ఈరోజు|ఈ రోజు|আজি|আজ|આજે|ಇಂದು|ಇವತ್ತು|ഇന്ന്|ਅੱਜ|ଆଜି|آج|\\baaj\\b", "giu"), " today "],
  [re("शाम|संध्याकाळी|संध्याकाळ|மாலை|సాయంత్రం|সন্ধ্যায়|সন্ধ্যা|সন্ধিয়া|સાંજે|સાંજ|ಸಂಜೆ|വൈകുന്നേരം|വൈകിട്ട്|ਸ਼ਾਮ|ସନ୍ଧ୍ୟାରେ|ସନ୍ଧ୍ୟା|شام|\\bshaam\\b", "giu"), " evening "],
  [re("सुबह|सकाळी|காலை|ఉదయం|সকালে|সকাল|পুৱা|સવારે|ಬೆಳಿಗ್ಗೆ|ಬೆಳಗ್ಗೆ|രാവിലെ|ਸਵੇਰੇ|ਸਵੇਰ|ସକାଳେ|ସକାଳ|صبح|\\bsubah\\b", "giu"), " morning "],
  [re("दोपहर|दुपारी|மதியம்|మధ్యాహ్నం|দুপুরে|দুপুর|দুপৰীয়া|બપોરે|ಮಧ್ಯಾಹ್ನ|ഉച്ചയ്ക്ക്|ഉച്ച|ਦੁਪਹਿਰ|ମଧ୍ୟାହ୍ନ|ଦ୍ୱିପ୍ରହର|دوپہر", "giu"), " afternoon "],
];
const UNDER = re("(\\d[\\d,]*)\\s*(?:-|\\s)?(?:से कम|से नीचे|के अंदर|के भीतर|पर्यंत|पेक्षा कमी|க்குள்|லோபு|లోపు|এর মধ্যে|এর কমে|থেকে কমে|થી ઓછામાં|થી ઓછા|ની અંદર|સુધી|ಒಳಗೆ|ಕ್ಕಿಂತ ಕಡಿಮೆ|ന് താഴെ|ൽ താഴെ|ഉള്ളിൽ|ਤੋਂ ਘੱਟ|ਦੇ ਅੰਦਰ|ਤੱਕ|ଭିତରେ|ରୁ କମ୍|سے کم|کے اندر|تک|ৰ ভিতৰত|ৰ তলত|\\bse kam\\b|\\bke andar\\b|\\btak\\b)", "giu");

/** Postpositions meaning "in" that carry no search meaning. */
const FILLER = re(W("में|میں|ਵਿੱਚ|માં"), "giu");

/**
 * Turn an Indian-language marketplace query into English search keywords for the rules-engine parser
 * ("कल शाम 1500 से कम में फेशियल" → "tomorrow evening under 1500 facial"). The LLM path reads the raw text.
 * Services are mapped first so words like कलर (colour) are not mistaken for कल (tomorrow).
 */
export function toEnglishQuery(q: string): string {
  let s = asciiDigits(norm(q));
  s = s.replace(UNDER, " under $1 ");
  for (const [rx, keys] of SERVICE_WORDS) s = s.replace(new RegExp(rx.source, "giu"), ` ${keys[0]} `);
  for (const [rx, en] of QUERY_MAP) s = s.replace(rx, en);
  s = s.replace(FILLER, " ");
  return s.replace(/\s+/g, " ").trim();
}
