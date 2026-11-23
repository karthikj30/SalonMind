/** Strings for the customer's "manage my booking" page (/b/<token>), in every supported language. */
const en = {
  manageLink: "Change or cancel this booking",
  title: "Your appointment",
  service: "Service", when: "When", stylist: "Stylist", price: "Price",
  status: { booked: "Booked", confirmed: "Confirmed", cancelled: "Cancelled", completed: "Completed", no_show: "Missed" } as Record<string, string>,
  change: "Change the time", pickDate: "Pick a date", showTimes: "Show free times",
  noTimes: "No free times that day — try another date.", moveHere: "Move to this time",
  cancel: "Cancel appointment", cancelSure: "Yes, cancel it",
  cancelled: "Your appointment is cancelled. We hope to see you again soon.",
  moved: "Done — your appointment is now on {when}.",
  tooLate: "Changes close {h} hours before the appointment — please call the salon.",
  closed: "This appointment can no longer be changed online.",
  call: "Call the salon", bookAgain: "Book again", plusGst: "+ GST",
};
export type ManageDict = typeof en;

const hi: ManageDict = {
  manageLink: "यह बुकिंग बदलें या रद्द करें",
  title: "आपकी अपॉइंटमेंट", service: "सेवा", when: "कब", stylist: "स्टाइलिस्ट", price: "कीमत",
  status: { booked: "बुक", confirmed: "कन्फ़र्म", cancelled: "रद्द", completed: "पूरी हुई", no_show: "छूट गई" },
  change: "समय बदलें", pickDate: "तारीख चुनें", showTimes: "खाली समय देखें",
  noTimes: "उस दिन कोई समय खाली नहीं — दूसरी तारीख आज़माएँ।", moveHere: "इस समय पर करें",
  cancel: "अपॉइंटमेंट रद्द करें", cancelSure: "हाँ, रद्द करें",
  cancelled: "आपकी अपॉइंटमेंट रद्द हो गई है। जल्द फिर मिलेंगे।",
  moved: "हो गया — आपकी अपॉइंटमेंट अब {when} को है।",
  tooLate: "अपॉइंटमेंट से {h} घंटे पहले तक ही बदलाव हो सकता है — कृपया सैलून को कॉल करें।",
  closed: "यह अपॉइंटमेंट अब ऑनलाइन नहीं बदली जा सकती।",
  call: "सैलून को कॉल करें", bookAgain: "फिर से बुक करें", plusGst: "+ जीएसटी",
};

const bn: ManageDict = {
  manageLink: "এই বুকিং বদলান বা বাতিল করুন",
  title: "আপনার অ্যাপয়েন্টমেন্ট", service: "পরিষেবা", when: "কখন", stylist: "স্টাইলিস্ট", price: "দাম",
  status: { booked: "বুক করা", confirmed: "নিশ্চিত", cancelled: "বাতিল", completed: "সম্পন্ন", no_show: "মিস হয়েছে" },
  change: "সময় বদলান", pickDate: "তারিখ বাছুন", showTimes: "খালি সময় দেখুন",
  noTimes: "সেদিন কোনো সময় খালি নেই — অন্য তারিখ দেখুন।", moveHere: "এই সময়ে সরান",
  cancel: "অ্যাপয়েন্টমেন্ট বাতিল করুন", cancelSure: "হ্যাঁ, বাতিল করুন",
  cancelled: "আপনার অ্যাপয়েন্টমেন্ট বাতিল হয়েছে। শীঘ্রই আবার দেখা হবে।",
  moved: "হয়ে গেছে — আপনার অ্যাপয়েন্টমেন্ট এখন {when}।",
  tooLate: "অ্যাপয়েন্টমেন্টের {h} ঘণ্টা আগে পর্যন্ত বদল করা যায় — দয়া করে সেলুনে ফোন করুন।",
  closed: "এই অ্যাপয়েন্টমেন্ট আর অনলাইনে বদলানো যাবে না।",
  call: "সেলুনে ফোন করুন", bookAgain: "আবার বুক করুন", plusGst: "+ জিএসটি",
};

const mr: ManageDict = {
  manageLink: "ही बुकिंग बदला किंवा रद्द करा",
  title: "तुमची अपॉइंटमेंट", service: "सेवा", when: "केव्हा", stylist: "स्टायलिस्ट", price: "किंमत",
  status: { booked: "बुक", confirmed: "निश्चित", cancelled: "रद्द", completed: "पूर्ण", no_show: "चुकली" },
  change: "वेळ बदला", pickDate: "तारीख निवडा", showTimes: "मोकळ्या वेळा पाहा",
  noTimes: "त्या दिवशी वेळ मोकळी नाही — दुसरी तारीख पाहा.", moveHere: "या वेळेवर हलवा",
  cancel: "अपॉइंटमेंट रद्द करा", cancelSure: "होय, रद्द करा",
  cancelled: "तुमची अपॉइंटमेंट रद्द झाली आहे. लवकरच पुन्हा भेटू.",
  moved: "झाले — तुमची अपॉइंटमेंट आता {when} ला आहे.",
  tooLate: "अपॉइंटमेंटच्या {h} तास आधीपर्यंतच बदल करता येतो — कृपया सलूनला फोन करा.",
  closed: "ही अपॉइंटमेंट आता ऑनलाइन बदलता येणार नाही.",
  call: "सलूनला फोन करा", bookAgain: "पुन्हा बुक करा", plusGst: "+ जीएसटी",
};

const ta: ManageDict = {
  manageLink: "இந்த முன்பதிவை மாற்று அல்லது ரத்து செய்",
  title: "உங்கள் முன்பதிவு", service: "சேவை", when: "எப்போது", stylist: "ஸ்டைலிஸ்ட்", price: "விலை",
  status: { booked: "முன்பதிவு", confirmed: "உறுதி", cancelled: "ரத்து", completed: "முடிந்தது", no_show: "வரவில்லை" },
  change: "நேரத்தை மாற்று", pickDate: "தேதியைத் தேர்ந்தெடு", showTimes: "காலி நேரங்களைக் காட்டு",
  noTimes: "அன்று காலி நேரம் இல்லை — வேறு தேதியை முயற்சிக்கவும்.", moveHere: "இந்த நேரத்துக்கு மாற்று",
  cancel: "முன்பதிவை ரத்து செய்", cancelSure: "ஆம், ரத்து செய்",
  cancelled: "உங்கள் முன்பதிவு ரத்து செய்யப்பட்டது. விரைவில் மீண்டும் சந்திப்போம்.",
  moved: "முடிந்தது — உங்கள் முன்பதிவு இப்போது {when}.",
  tooLate: "முன்பதிவுக்கு {h} மணி நேரம் முன்பு வரை மட்டுமே மாற்றலாம் — சலூனை அழைக்கவும்.",
  closed: "இந்த முன்பதிவை இனி ஆன்லைனில் மாற்ற முடியாது.",
  call: "சலூனை அழைக்கவும்", bookAgain: "மீண்டும் முன்பதிவு", plusGst: "+ ஜிஎஸ்டி",
};

const te: ManageDict = {
  manageLink: "ఈ బుకింగ్ మార్చండి లేదా రద్దు చేయండి",
  title: "మీ అపాయింట్‌మెంట్", service: "సేవ", when: "ఎప్పుడు", stylist: "స్టైలిస్ట్", price: "ధర",
  status: { booked: "బుక్ అయింది", confirmed: "నిర్ధారించబడింది", cancelled: "రద్దు", completed: "పూర్తయింది", no_show: "మిస్ అయింది" },
  change: "సమయం మార్చండి", pickDate: "తేదీ ఎంచుకోండి", showTimes: "ఖాళీ సమయాలు చూపించు",
  noTimes: "ఆ రోజు ఖాళీ సమయం లేదు — వేరే తేదీ ప్రయత్నించండి.", moveHere: "ఈ సమయానికి మార్చు",
  cancel: "అపాయింట్‌మెంట్ రద్దు చేయండి", cancelSure: "అవును, రద్దు చేయండి",
  cancelled: "మీ అపాయింట్‌మెంట్ రద్దయింది. త్వరలో మళ్ళీ కలుద్దాం.",
  moved: "అయింది — మీ అపాయింట్‌మెంట్ ఇప్పుడు {when}.",
  tooLate: "అపాయింట్‌మెంట్‌కు {h} గంటల ముందు వరకే మార్చవచ్చు — దయచేసి సెలూన్‌కు కాల్ చేయండి.",
  closed: "ఈ అపాయింట్‌మెంట్‌ను ఇకపై ఆన్‌లైన్‌లో మార్చలేరు.",
  call: "సెలూన్‌కు కాల్ చేయండి", bookAgain: "మళ్ళీ బుక్ చేయండి", plusGst: "+ జీఎస్టీ",
};

const gu: ManageDict = {
  manageLink: "આ બુકિંગ બદલો અથવા રદ કરો",
  title: "તમારી એપોઇન્ટમેન્ટ", service: "સેવા", when: "ક્યારે", stylist: "સ્ટાઇલિસ્ટ", price: "કિંમત",
  status: { booked: "બુક", confirmed: "પુષ્ટિ થઈ", cancelled: "રદ", completed: "પૂર્ણ", no_show: "ચૂકી ગયા" },
  change: "સમય બદલો", pickDate: "તારીખ પસંદ કરો", showTimes: "ખાલી સમય બતાવો",
  noTimes: "તે દિવસે કોઈ સમય ખાલી નથી — બીજી તારીખ અજમાવો.", moveHere: "આ સમયે ખસેડો",
  cancel: "એપોઇન્ટમેન્ટ રદ કરો", cancelSure: "હા, રદ કરો",
  cancelled: "તમારી એપોઇન્ટમેન્ટ રદ થઈ ગઈ છે. જલદી ફરી મળીશું.",
  moved: "થઈ ગયું — તમારી એપોઇન્ટમેન્ટ હવે {when} એ છે.",
  tooLate: "એપોઇન્ટમેન્ટના {h} કલાક પહેલાં સુધી જ ફેરફાર થઈ શકે — કૃપા કરીને સલૂનને ફોન કરો.",
  closed: "આ એપોઇન્ટમેન્ટ હવે ઓનલાઇન બદલી શકાતી નથી.",
  call: "સલૂનને ફોન કરો", bookAgain: "ફરી બુક કરો", plusGst: "+ જીએસટી",
};

const kn: ManageDict = {
  manageLink: "ಈ ಬುಕಿಂಗ್ ಬದಲಿಸಿ ಅಥವಾ ರದ್ದುಮಾಡಿ",
  title: "ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್", service: "ಸೇವೆ", when: "ಯಾವಾಗ", stylist: "ಸ್ಟೈಲಿಸ್ಟ್", price: "ಬೆಲೆ",
  status: { booked: "ಬುಕ್ ಆಗಿದೆ", confirmed: "ದೃಢಪಟ್ಟಿದೆ", cancelled: "ರದ್ದು", completed: "ಪೂರ್ಣ", no_show: "ತಪ್ಪಿದೆ" },
  change: "ಸಮಯ ಬದಲಿಸಿ", pickDate: "ದಿನಾಂಕ ಆಯ್ಕೆಮಾಡಿ", showTimes: "ಖಾಲಿ ಸಮಯ ತೋರಿಸಿ",
  noTimes: "ಆ ದಿನ ಖಾಲಿ ಸಮಯವಿಲ್ಲ — ಬೇರೆ ದಿನಾಂಕ ನೋಡಿ.", moveHere: "ಈ ಸಮಯಕ್ಕೆ ಬದಲಿಸಿ",
  cancel: "ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ರದ್ದುಮಾಡಿ", cancelSure: "ಹೌದು, ರದ್ದುಮಾಡಿ",
  cancelled: "ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ರದ್ದಾಗಿದೆ. ಶೀಘ್ರದಲ್ಲೇ ಮತ್ತೆ ಭೇಟಿಯಾಗೋಣ.",
  moved: "ಆಯಿತು — ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಈಗ {when}.",
  tooLate: "ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್‌ಗೆ {h} ಗಂಟೆ ಮೊದಲು ಮಾತ್ರ ಬದಲಾವಣೆ ಸಾಧ್ಯ — ದಯವಿಟ್ಟು ಸಲೂನ್‌ಗೆ ಕರೆ ಮಾಡಿ.",
  closed: "ಈ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಅನ್ನು ಇನ್ನು ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಬದಲಿಸಲಾಗದು.",
  call: "ಸಲೂನ್‌ಗೆ ಕರೆ ಮಾಡಿ", bookAgain: "ಮತ್ತೆ ಬುಕ್ ಮಾಡಿ", plusGst: "+ ಜಿಎಸ್‌ಟಿ",
};

const ml: ManageDict = {
  manageLink: "ഈ ബുക്കിംഗ് മാറ്റുക അല്ലെങ്കിൽ റദ്ദാക്കുക",
  title: "നിങ്ങളുടെ അപ്പോയിന്റ്മെന്റ്", service: "സേവനം", when: "എപ്പോൾ", stylist: "സ്റ്റൈലിസ്റ്റ്", price: "വില",
  status: { booked: "ബുക്ക് ചെയ്തു", confirmed: "സ്ഥിരീകരിച്ചു", cancelled: "റദ്ദാക്കി", completed: "പൂർത്തിയായി", no_show: "വന്നില്ല" },
  change: "സമയം മാറ്റുക", pickDate: "തീയതി തിരഞ്ഞെടുക്കുക", showTimes: "ഒഴിവുള്ള സമയം കാണിക്കുക",
  noTimes: "അന്ന് ഒഴിവുള്ള സമയമില്ല — മറ്റൊരു തീയതി നോക്കൂ.", moveHere: "ഈ സമയത്തേക്ക് മാറ്റുക",
  cancel: "അപ്പോയിന്റ്മെന്റ് റദ്ദാക്കുക", cancelSure: "അതെ, റദ്ദാക്കുക",
  cancelled: "നിങ്ങളുടെ അപ്പോയിന്റ്മെന്റ് റദ്ദാക്കി. ഉടൻ വീണ്ടും കാണാം.",
  moved: "ശരി — നിങ്ങളുടെ അപ്പോയിന്റ്മെന്റ് ഇപ്പോൾ {when}.",
  tooLate: "അപ്പോയിന്റ്മെന്റിന് {h} മണിക്കൂർ മുമ്പ് വരെ മാത്രമേ മാറ്റാനാകൂ — ദയവായി സലൂണിൽ വിളിക്കുക.",
  closed: "ഈ അപ്പോയിന്റ്മെന്റ് ഇനി ഓൺലൈനിൽ മാറ്റാനാകില്ല.",
  call: "സലൂണിൽ വിളിക്കുക", bookAgain: "വീണ്ടും ബുക്ക് ചെയ്യുക", plusGst: "+ ജിഎസ്ടി",
};

const pa: ManageDict = {
  manageLink: "ਇਹ ਬੁਕਿੰਗ ਬਦਲੋ ਜਾਂ ਰੱਦ ਕਰੋ",
  title: "ਤੁਹਾਡੀ ਅਪਾਇੰਟਮੈਂਟ", service: "ਸੇਵਾ", when: "ਕਦੋਂ", stylist: "ਸਟਾਈਲਿਸਟ", price: "ਕੀਮਤ",
  status: { booked: "ਬੁੱਕ", confirmed: "ਪੱਕੀ", cancelled: "ਰੱਦ", completed: "ਪੂਰੀ", no_show: "ਖੁੰਝ ਗਈ" },
  change: "ਸਮਾਂ ਬਦਲੋ", pickDate: "ਤਾਰੀਖ਼ ਚੁਣੋ", showTimes: "ਖਾਲੀ ਸਮਾਂ ਵੇਖੋ",
  noTimes: "ਉਸ ਦਿਨ ਕੋਈ ਸਮਾਂ ਖਾਲੀ ਨਹੀਂ — ਹੋਰ ਤਾਰੀਖ਼ ਵੇਖੋ।", moveHere: "ਇਸ ਸਮੇਂ ਤੇ ਕਰੋ",
  cancel: "ਅਪਾਇੰਟਮੈਂਟ ਰੱਦ ਕਰੋ", cancelSure: "ਹਾਂ, ਰੱਦ ਕਰੋ",
  cancelled: "ਤੁਹਾਡੀ ਅਪਾਇੰਟਮੈਂਟ ਰੱਦ ਹੋ ਗਈ ਹੈ। ਜਲਦੀ ਫਿਰ ਮਿਲਾਂਗੇ।",
  moved: "ਹੋ ਗਿਆ — ਤੁਹਾਡੀ ਅਪਾਇੰਟਮੈਂਟ ਹੁਣ {when} ਨੂੰ ਹੈ।",
  tooLate: "ਅਪਾਇੰਟਮੈਂਟ ਤੋਂ {h} ਘੰਟੇ ਪਹਿਲਾਂ ਤੱਕ ਹੀ ਬਦਲਾਅ ਹੋ ਸਕਦਾ ਹੈ — ਕਿਰਪਾ ਕਰਕੇ ਸੈਲੂਨ ਨੂੰ ਫ਼ੋਨ ਕਰੋ।",
  closed: "ਇਹ ਅਪਾਇੰਟਮੈਂਟ ਹੁਣ ਆਨਲਾਈਨ ਨਹੀਂ ਬਦਲੀ ਜਾ ਸਕਦੀ।",
  call: "ਸੈਲੂਨ ਨੂੰ ਫ਼ੋਨ ਕਰੋ", bookAgain: "ਫਿਰ ਬੁੱਕ ਕਰੋ", plusGst: "+ ਜੀਐਸਟੀ",
};

const or: ManageDict = {
  manageLink: "ଏହି ବୁକିଂ ବଦଳାନ୍ତୁ ବା ବାତିଲ କରନ୍ତୁ",
  title: "ଆପଣଙ୍କ ଆପଏଣ୍ଟମେଣ୍ଟ", service: "ସେବା", when: "କେବେ", stylist: "ଷ୍ଟାଇଲିଷ୍ଟ", price: "ମୂଲ୍ୟ",
  status: { booked: "ବୁକ୍ ହୋଇଛି", confirmed: "ନିଶ୍ଚିତ", cancelled: "ବାତିଲ", completed: "ସମ୍ପୂର୍ଣ୍ଣ", no_show: "ଆସିଲେ ନାହିଁ" },
  change: "ସମୟ ବଦଳାନ୍ତୁ", pickDate: "ତାରିଖ ବାଛନ୍ତୁ", showTimes: "ଖାଲି ସମୟ ଦେଖାନ୍ତୁ",
  noTimes: "ସେଦିନ କୌଣସି ସମୟ ଖାଲି ନାହିଁ — ଅନ୍ୟ ତାରିଖ ଦେଖନ୍ତୁ।", moveHere: "ଏହି ସମୟକୁ ଘୁଞ୍ଚାନ୍ତୁ",
  cancel: "ଆପଏଣ୍ଟମେଣ୍ଟ ବାତିଲ କରନ୍ତୁ", cancelSure: "ହଁ, ବାତିଲ କରନ୍ତୁ",
  cancelled: "ଆପଣଙ୍କ ଆପଏଣ୍ଟମେଣ୍ଟ ବାତିଲ ହୋଇଛି। ଶୀଘ୍ର ପୁଣି ଦେଖା ହେବ।",
  moved: "ହୋଇଗଲା — ଆପଣଙ୍କ ଆପଏଣ୍ଟମେଣ୍ଟ ଏବେ {when}।",
  tooLate: "ଆପଏଣ୍ଟମେଣ୍ଟର {h} ଘଣ୍ଟା ପୂର୍ବରୁ ହିଁ ବଦଳ କରାଯାଇପାରିବ — ଦୟାକରି ସାଲୁନକୁ ଫୋନ କରନ୍ତୁ।",
  closed: "ଏହି ଆପଏଣ୍ଟମେଣ୍ଟ ଆଉ ଅନଲାଇନରେ ବଦଳାଯାଇପାରିବ ନାହିଁ।",
  call: "ସାଲୁନକୁ ଫୋନ କରନ୍ତୁ", bookAgain: "ପୁଣି ବୁକ୍ କରନ୍ତୁ", plusGst: "+ ଜିଏସଟି",
};

const ur: ManageDict = {
  manageLink: "یہ بکنگ بدلیں یا منسوخ کریں",
  title: "آپ کی اپائنٹمنٹ", service: "سروس", when: "کب", stylist: "اسٹائلسٹ", price: "قیمت",
  status: { booked: "بک", confirmed: "تصدیق شدہ", cancelled: "منسوخ", completed: "مکمل", no_show: "چھوٹ گئی" },
  change: "وقت بدلیں", pickDate: "تاریخ چنیں", showTimes: "خالی اوقات دکھائیں",
  noTimes: "اس دن کوئی وقت خالی نہیں — کوئی اور تاریخ دیکھیں۔", moveHere: "اس وقت پر کریں",
  cancel: "اپائنٹمنٹ منسوخ کریں", cancelSure: "ہاں، منسوخ کریں",
  cancelled: "آپ کی اپائنٹمنٹ منسوخ ہو گئی ہے۔ جلد دوبارہ ملیں گے۔",
  moved: "ہو گیا — آپ کی اپائنٹمنٹ اب {when} کو ہے۔",
  tooLate: "اپائنٹمنٹ سے {h} گھنٹے پہلے تک ہی تبدیلی ہو سکتی ہے — براہ کرم سیلون کو فون کریں۔",
  closed: "یہ اپائنٹمنٹ اب آن لائن نہیں بدلی جا سکتی۔",
  call: "سیلون کو فون کریں", bookAgain: "دوبارہ بک کریں", plusGst: "+ جی ایس ٹی",
};

const asm: ManageDict = {
  manageLink: "এই বুকিং সলনি বা বাতিল কৰক",
  title: "আপোনাৰ এপইণ্টমেণ্ট", service: "সেৱা", when: "কেতিয়া", stylist: "ষ্টাইলিষ্ট", price: "দাম",
  status: { booked: "বুক কৰা হৈছে", confirmed: "নিশ্চিত", cancelled: "বাতিল", completed: "সম্পূৰ্ণ", no_show: "অহা নাছিল" },
  change: "সময় সলনি কৰক", pickDate: "তাৰিখ বাছক", showTimes: "খালী সময় দেখুৱাওক",
  noTimes: "সেইদিনা কোনো সময় খালী নাই — আন তাৰিখ চাওক।", moveHere: "এই সময়লৈ সলনি কৰক",
  cancel: "এপইণ্টমেণ্ট বাতিল কৰক", cancelSure: "হয়, বাতিল কৰক",
  cancelled: "আপোনাৰ এপইণ্টমেণ্ট বাতিল হৈছে। সোনকালে আকৌ লগ পাম।",
  moved: "হ'ল — আপোনাৰ এপইণ্টমেণ্ট এতিয়া {when}।",
  tooLate: "এপইণ্টমেণ্টৰ {h} ঘণ্টা আগলৈকেহে সলনি কৰিব পাৰি — অনুগ্ৰহ কৰি ছেলুনলৈ ফোন কৰক।",
  closed: "এই এপইণ্টমেণ্ট এতিয়া অনলাইনত সলনি কৰিব নোৱাৰি।",
  call: "ছেলুনলৈ ফোন কৰক", bookAgain: "আকৌ বুক কৰক", plusGst: "+ জিএছটি",
};

const ALL: Record<string, ManageDict> = { en, hi, bn, mr, ta, te, gu, kn, ml, pa, or, ur, as: asm };
export const manageDict = (lang: string | null | undefined) => ALL[lang ?? "en"] ?? en;
