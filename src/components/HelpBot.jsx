import React, { useState, useRef, useEffect } from "react";
import { answerDataQuery } from "../lib/botData";
import { askGemini, getGeminiKey } from "../lib/gemini";
import { buildBusinessContext } from "../lib/aiContext";

// ── Knowledge base: covers every Minarva Biz feature, matched by keywords (en/ml/hi) ──
const KB = [
  {
    keys: ["login","password","user","signin","sign in","ലോഗിൻ","പാസ്","യൂസർ","लॉगिन","पासवर्ड","उपयोगकर्ता"],
    en: "To log in, open the app and enter your username and password on the login screen. The default admin is username 'admin'. New users are added by an Admin in Settings → User Management, where each user gets View/Edit permissions per page.",
    ml: "ലോഗിൻ ചെയ്യാൻ ആപ്പ് തുറന്ന് username, password നൽകുക. Default admin username 'admin' ആണ്. പുതിയ users-നെ Admin, Settings → User Management-ൽ add ചെയ്യാം. ഓരോ user-നും ഓരോ page-ന് View/Edit permission നൽകാം.",
    hi: "लॉगिन करने के लिए ऐप खोलें और username व password डालें। डिफ़ॉल्ट admin 'admin' है। नए users को Admin, Settings → User Management में जोड़ सकते हैं।"
  },
  {
    keys: ["bank","banking","account","transfer","balance","ബാങ്ക","അക്കൗണ്ട","ട്രാൻസ്ഫർ","ബാലൻസ","बैंक","खाता","ट्रांसफर"],
    en: "Banking page: add/edit bank accounts, transfer money between accounts, and view account-wise transactions. When adding an account you can toggle 'Include in Net Cash' — turn it OFF for personal accounts (like Deepu) so they are tracked but don't affect company Net Cash.",
    ml: "Banking page-ൽ: bank accounts add/edit ചെയ്യാം, accounts തമ്മിൽ money transfer ചെയ്യാം, account-wise transactions കാണാം. Account add ചെയ്യുമ്പോൾ 'Include in Net Cash' toggle ഉണ്ട് — personal accounts-ന് (Deepu പോലെ) OFF ആക്കിയാൽ track ചെയ്യും പക്ഷേ company Net Cash-നെ ബാധിക്കില്ല.",
    hi: "Banking पेज: बैंक खाते जोड़ें/संपादित करें, खातों के बीच पैसे ट्रांसफर करें। खाता जोड़ते समय 'Include in Net Cash' टॉगल है — व्यक्तिगत खातों के लिए इसे बंद करें।"
  },
  {
    keys: ["bill","payable","supplier","purchase","item","ബിൽ","സപ്ലയർ","പർച്ചേസ","സാധന","बिल","आपूर्तिकर्ता","खरीद"],
    en: "Bills & Payables: record supplier bills with multiple line items. For each item set description, qty, unit, rate, the project/site, and a VAT checkbox. Choose 'Credit' (add to pending) or 'Paid Now' (creates a ledger entry). You can Edit (✏️) or Delete (🗑) any bill from the bills table.",
    ml: "Bills & Payables: supplier bills multiple items ആയി record ചെയ്യാം. ഓരോ item-നും description, qty, unit, rate, project/site, VAT checkbox set ചെയ്യാം. 'Credit' (pending-ലേക്ക്) അല്ലെങ്കിൽ 'Paid Now' (ledger entry ഉണ്ടാക്കും) choose ചെയ്യാം. ഏത് bill-ഉം ✏️ Edit / 🗑 Delete ചെയ്യാം.",
    hi: "Bills & Payables: सप्लायर बिल कई items के साथ दर्ज करें। हर item के लिए विवरण, मात्रा, दर, प्रोजेक्ट और VAT सेट करें। बिल को ✏️ Edit या 🗑 Delete कर सकते हैं।"
  },
  {
    keys: ["payroll","salary","wage","employee","attendance","ശമ്പള","പേയ്റോൾ","ജീവനക്കാര","അറ്റൻഡൻസ","वेतन","कर्मचारी","हाजिरी"],
    en: "Payroll & Attendance: add employees with full details and work timing (Office 9am-9pm = 9 hrs after break; Site 7am-6pm = 10 hrs). Mark daily attendance in the calendar grid, then run payroll. Salary = working hours, with break time deducted automatically.",
    ml: "Payroll & Attendance: employees-നെ full details + work timing സഹിതം add ചെയ്യാം (Office 9am-9pm = break കഴിഞ്ഞ് 9 hrs; Site 7am-6pm = 10 hrs). Calendar grid-ൽ daily attendance mark ചെയ്ത് payroll run ചെയ്യാം. Salary = working hours, break time auto കുറയ്ക്കും.",
    hi: "Payroll & Attendance: कर्मचारियों को विवरण और कार्य समय के साथ जोड़ें। कैलेंडर ग्रिड में हाजिरी दर्ज करें, फिर payroll चलाएं। वेतन कार्य घंटों के आधार पर, ब्रेक समय घटाकर।"
  },
  {
    keys: ["ledger","cashbook","cash","income","expense","credit","debit","ലെഡ്ജർ","ക്യാഷ്","വരവ","ചെലവ","लेजर","नकद","आय","खर्च"],
    en: "Cashbook Ledger records every cash movement in double-entry format (Credits = income, Debits = payouts). Each entry can be tagged to a bank account. Use the Credit/Debit filters and date range. Net Balance = total credits minus debits (tracking-only accounts like Deepu are excluded).",
    ml: "Cashbook Ledger എല്ലാ cash movement-ഉം double-entry ആയി record ചെയ്യും (Credits = വരവ്, Debits = ചെലവ്). ഓരോ entry-ഉം ഒരു bank account-ലേക്ക് tag ചെയ്യാം. Credit/Debit filter, date range ഉപയോഗിക്കാം. Net Balance = credits − debits (Deepu പോലുള്ള tracking-only accounts ഒഴികെ).",
    hi: "Cashbook Ledger हर नकद लेन-देन को double-entry में दर्ज करता है (Credits = आय, Debits = खर्च)। Credit/Debit फ़िल्टर और दिनांक सीमा का उपयोग करें।"
  },
  {
    keys: ["report","vat","statement","audit","റിപ്പോർട്","വാറ്റ്","स्टेटमेंट","रिपोर्ट","वैट"],
    en: "Reports & Audits: Cashbook Statement (separate Credit/Debit columns with running balance), and Supplier Statement with sub-tabs — All, VAT Bills, Normal Bills, Rent, Utility, and a VAT Report formatted for VAT filing (Net + 5% VAT + Total with CR number).",
    ml: "Reports & Audits: Cashbook Statement (Credit/Debit വെവ്വേറെ columns + running balance), Supplier Statement sub-tabs സഹിതം — All, VAT Bills, Normal Bills, Rent, Utility, പിന്നെ VAT filing-ന് ready ആയ VAT Report (Net + 5% VAT + Total, CR number സഹിതം).",
    hi: "Reports & Audits: Cashbook Statement (अलग Credit/Debit कॉलम), और Supplier Statement उप-टैब के साथ — All, VAT Bills, Rent, Utility, और VAT फाइलिंग के लिए VAT Report।"
  },
  {
    keys: ["subcontractor","contractor","milestone","സബ്","കോൺട്രാക്ട","ഉപകരാർ","उपठेकेदार","ठेकेदार"],
    en: "Subcontractors: organised by Contractor → Specialty → Work, with payment milestones. To rename a contractor, click the ✏️ Edit on the contractor card, or use ✏️ Rename in the breadcrumb after selecting a contractor.",
    ml: "Subcontractors: Contractor → Specialty → Work ആയി organise ചെയ്തിരിക്കുന്നു, payment milestones സഹിതം. Contractor-ന്റെ പേര് മാറ്റാൻ card-ലെ ✏️ Edit click ചെയ്യുക, അല്ലെങ്കിൽ contractor select ചെയ്ത ശേഷം breadcrumb-ലെ ✏️ Rename ഉപയോഗിക്കുക.",
    hi: "Subcontractors: Contractor → Specialty → Work के रूप में व्यवस्थित। ठेकेदार का नाम बदलने के लिए कार्ड पर ✏️ Edit क्लिक करें।"
  },
  {
    keys: ["invoice","quotation","quote","ഇൻവോയ്സ","quotation","चालान","कोटेशन"],
    en: "Invoices & Quotations: create invoices and quotations for customers. Company details (CR number, VAT, IBAN, logo) from Settings appear automatically on invoices.",
    ml: "Invoices & Quotations: customers-ന് invoices, quotations ഉണ്ടാക്കാം. Settings-ലെ company details (CR number, VAT, IBAN, logo) invoices-ൽ auto വരും.",
    hi: "Invoices & Quotations: ग्राहकों के लिए चालान और कोटेशन बनाएं। Settings की कंपनी जानकारी चालान पर अपने आप दिखती है।"
  },
  {
    keys: ["project","work","site","പ്രോജക്ട","വർക്ക","സൈറ്റ","परियोजना","कार्य"],
    en: "Works & Projects: track contracts with payment milestone graphs and status (Active, Planning, Delayed, Completed). Total contract value and collected amounts are shown.",
    ml: "Works & Projects: contracts-നെ payment milestone graphs + status (Active, Planning, Delayed, Completed) സഹിതം track ചെയ്യാം. Total contract value, collected amount കാണിക്കും.",
    hi: "Works & Projects: भुगतान milestone ग्राफ़ और स्थिति के साथ अनुबंध ट्रैक करें।"
  },
  {
    keys: ["field","gps","selfie","mobile","ഫീൽഡ","ഫീൽഡ് ആപ്പ","सेल्फी","मोबाइल","फील्ड"],
    en: "Employee Field App: share the field link (Dashboard → Employee Field App → Copy Link) with workers. They open it on their phone, log in with their phone number, and mark GPS attendance with a selfie.",
    ml: "Employee Field App: field link (Dashboard → Employee Field App → Copy Link) workers-ന് share ചെയ്യുക. അവർ phone-ൽ തുറന്ന്, phone number കൊണ്ട് login ചെയ്ത്, selfie സഹിതം GPS attendance mark ചെയ്യും.",
    hi: "Employee Field App: फील्ड लिंक श्रमिकों के साथ साझा करें। वे फोन पर खोलकर, फोन नंबर से लॉगिन कर, सेल्फी के साथ GPS हाजिरी दर्ज करते हैं।"
  },
  {
    keys: ["settings","company","logo","cr","iban","സെറ്റിങ്","കമ്പനി","लोगो","सेटिंग्स","कंपनी"],
    en: "Settings & Backups: set company profile (name, CR number, VAT number, license, IBAN, logo) which populate invoices and receipts. Admins also manage users and permissions here.",
    ml: "Settings & Backups: company profile (name, CR number, VAT number, license, IBAN, logo) set ചെയ്യാം — ഇവ invoices, receipts-ൽ വരും. Admins ഇവിടെ users, permissions manage ചെയ്യും.",
    hi: "Settings & Backups: कंपनी प्रोफ़ाइल सेट करें जो चालान पर दिखती है। Admin यहाँ users और अनुमतियाँ प्रबंधित करते हैं।"
  },
  {
    keys: ["dashboard","overview","net cash","ഡാഷ്","ഹോം","डैशबोर्ड","अवलोकन"],
    en: "Dashboard shows your bank account balances, Net Cash, total payables, projected sales, active sites, crew wages, a cashflow chart, and project status — a complete live overview.",
    ml: "Dashboard-ൽ bank balances, Net Cash, total payables, projected sales, active sites, crew wages, cashflow chart, project status — എല്ലാം live ആയി കാണാം.",
    hi: "Dashboard बैंक बैलेंस, Net Cash, कुल देय, बिक्री, सक्रिय साइट, और प्रोजेक्ट स्थिति दिखाता है।"
  },
];

const GREET = {
  en: "Hi! I'm the Minarva Biz assistant. Ask me about features OR live data — e.g. 'total expense of 4th June', 'net cash balance', 'how many employees', 'total payables'. Type or use the mic 🎤, in English, Malayalam, or Hindi.",
  ml: "ഹായ്! ഞാൻ Minarva Biz സഹായി ആണ്. Features-നെക്കുറിച്ചോ live data-യെക്കുറിച്ചോ ചോദിക്കാം — ഉദാ: 'total expense of 4th June', 'net cash balance', 'എത്ര ജീവനക്കാർ', 'total payables'. Type ചെയ്യാം അല്ലെങ്കിൽ mic 🎤 ഉപയോഗിക്കാം — English, Malayalam, Hindi ഏതിലും.",
  hi: "नमस्ते! मैं Minarva Biz सहायक हूँ। features या live data पूछें — जैसे 'total expense of 4th June', 'net cash balance', 'कितने कर्मचारी'। टाइप करें या mic 🎤 उपयोग करें।"
};

function detectLang(text) {
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml";   // Malayalam
  if (/[\u0900-\u097F]/.test(text)) return "hi";   // Hindi/Devanagari
  return "en";
}

function findAnswer(text, lang) {
  const t = text.toLowerCase();
  let best = null, bestScore = 0;
  for (const item of KB) {
    let score = 0;
    for (const k of item.keys) {
      if (t.includes(k.toLowerCase())) score += k.length; // longer match = better
    }
    if (score > bestScore) { bestScore = score; best = item; }
  }
  if (best && bestScore > 0) return best[lang] || best.en;
  // Fallback
  const fb = {
    en: "I can help with: Login & Users, Banking, Bills & Payables, Payroll & Attendance, Cashbook Ledger, Reports & VAT, Subcontractors, Invoices, Projects, Field App, Settings, and Dashboard. Please ask about one of these.",
    ml: "എനിക്ക് സഹായിക്കാൻ കഴിയുന്നവ: Login & Users, Banking, Bills & Payables, Payroll & Attendance, Cashbook Ledger, Reports & VAT, Subcontractors, Invoices, Projects, Field App, Settings, Dashboard. ഇവയിൽ ഏതെങ്കിലും ചോദിക്കൂ.",
    hi: "मैं इनमें मदद कर सकता हूँ: Login, Banking, Bills, Payroll, Ledger, Reports, Subcontractors, Invoices, Projects, Field App, Settings, Dashboard। कृपया इनमें से कुछ पूछें।"
  };
  return fb[lang] || fb.en;
}

export default function HelpBot() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState("en");
  const [messages, setMessages] = useState([{ role: "bot", text: GREET.en }]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const recogRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  // Update greeting when language changes
  const changeLang = (l) => {
    setLang(l);
    setMessages(m => [...m, { role: "bot", text: GREET[l] }]);
  };

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q) return;
    const detected = detectLang(q);
    const useLang = detected !== "en" ? detected : lang;
    setMessages(m => [...m, { role: "user", text: q }]);
    setInput("");
    setMessages(m => [...m, { role: "bot", text: "…", thinking: true }]);

    let answer = null;
    let usedAI = false;
    try {
      const key = await getGeminiKey();
      if (key) {
        // AI path: build live business context, let Gemini reason over it
        const ctx = await buildBusinessContext();
        answer = await askGemini(q, ctx, useLang);
        usedAI = true;
      }
    } catch (e) {
      // AI failed — fall back gracefully
      if (e.message === "BAD_KEY") {
        answer = useLang==="ml" ? "AI key തെറ്റാണ്. Settings-ൽ ശരിയായ Gemini API key നൽകൂ." : "The AI key is invalid. Please set a correct Gemini API key in Settings.";
      } else if (e.message === "RATE_LIMIT") {
        answer = useLang==="ml" ? "AI-ന്റെ ഇന്നത്തെ free limit കഴിഞ്ഞു. കുറച്ച് കഴിഞ്ഞ് try ചെയ്യൂ." : "AI free limit reached for now. Please try again later.";
      } else if (e.message && e.message.startsWith("DETAIL:")) {
        answer = "⚠️ AI error — " + e.message.replace("DETAIL:", "").trim();
      } else if (e.message && e.message.startsWith("FORBIDDEN:")) {
        answer = "⚠️ AI access blocked — " + e.message.replace("FORBIDDEN:", "").trim() + "\n\nTip: In Google AI Studio, make sure the 'Generative Language API' is enabled for this key's project.";
      }
      // else: leave answer null → use offline fallback below
    }

    // Fallback chain when AI not used / errored
    if (!answer) {
      try { answer = await answerDataQuery(q, useLang); } catch { answer = null; }
      if (!answer) answer = findAnswer(q, useLang);
    }

    setMessages(m => {
      const without = m.filter(x => !x.thinking);
      return [...without, { role: "bot", text: answer, ai: usedAI }];
    });
    speak(answer, useLang);
  };

  // Text-to-speech
  const speak = (text, l) => {
    try {
      if (!window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = l === "ml" ? "ml-IN" : l === "hi" ? "hi-IN" : "en-US";
      u.rate = 0.95;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  };

  // Voice-to-text
  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      const msg = lang==="ml"
        ? "ഈ browser-ൽ voice input support ഇല്ല. ദയവായി Chrome browser ഉപയോഗിക്കൂ. (Brave-ൽ: Settings → Privacy → 'Use Google services for push messaging' ON ആക്കുക, അല്ലെങ്കിൽ Chrome ഉപയോഗിക്കുക)"
        : lang==="hi"
        ? "इस browser में voice input नहीं है। कृपया Chrome उपयोग करें।"
        : "Voice input isn't supported in this browser. Please use Chrome. (In Brave: Settings → Privacy → enable 'Use Google services for push messaging', or just use Chrome.)";
      setMessages(m => [...m, { role: "bot", text: msg }]);
      return;
    }
    const recog = new SR();
    recog.lang = lang === "ml" ? "ml-IN" : lang === "hi" ? "hi-IN" : "en-US";
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setListening(false);
      send(transcript);
    };
    recog.onerror = (e) => {
      setListening(false);
      let msg;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        msg = lang==="ml"
          ? "🎤 Microphone permission വേണം. Browser-ന്റെ address bar-ലെ 🔒 icon click ചെയ്ത് Microphone 'Allow' ആക്കുക. Brave browser ആണെങ്കിൽ Chrome ഉപയോഗിക്കുന്നതാണ് നല്ലത്."
          : lang==="hi"
          ? "🎤 Microphone की अनुमति दें। Address bar के 🔒 icon पर क्लिक करें।"
          : "🎤 Microphone permission needed. Click the 🔒 icon in the address bar and Allow Microphone. If using Brave, Chrome works best.";
      } else if (e.error === "no-speech") {
        msg = lang==="ml" ? "ഒന്നും കേട്ടില്ല. വീണ്ടും try ചെയ്യൂ." : lang==="hi" ? "कुछ सुनाई नहीं दिया। फिर से प्रयास करें।" : "Didn't catch that. Please try again.";
      } else {
        msg = lang==="ml" ? "Voice error. Chrome browser ഉപയോഗിക്കൂ." : "Voice error. Please try Chrome browser.";
      }
      setMessages(m => [...m, { role: "bot", text: msg }]);
    };
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    setListening(true);
    try { recog.start(); } catch { setListening(false); }
  };
  const stopListening = () => { recogRef.current?.stop(); setListening(false); };

  const langBtn = (l, label) => (
    <button onClick={()=>changeLang(l)} style={{ padding:"3px 10px", borderRadius:14, border:"none", cursor:"pointer", fontSize:11, fontWeight:700,
      background: lang===l ? "#6366f1" : "#e2e8f0", color: lang===l ? "#fff" : "#64748b" }}>{label}</button>
  );

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button onClick={()=>setOpen(true)} title="Help Assistant"
          style={{ position:"fixed", bottom:24, right:24, width:60, height:60, borderRadius:"50%", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", border:"none", fontSize:26, cursor:"pointer", boxShadow:"0 6px 20px rgba(99,102,241,0.5)", zIndex:9999 }}>
          💬
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{ position:"fixed", bottom:24, right:24, width:"min(380px, calc(100vw - 32px))", height:"min(560px, calc(100vh - 100px))", background:"#fff", borderRadius:16, boxShadow:"0 12px 40px rgba(0,0,0,0.25)", display:"flex", flexDirection:"column", zIndex:9999, overflow:"hidden", border:"1px solid #e2e8f0" }}>
          {/* Header */}
          <div style={{ background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontWeight:800, fontSize:15 }}>💬 Minarva Assistant</div>
              <div style={{ fontSize:11, opacity:0.9 }}>Ask about any feature</div>
            </div>
            <button onClick={()=>{setOpen(false); window.speechSynthesis?.cancel();}} style={{ background:"rgba(255,255,255,0.2)", color:"#fff", border:"none", borderRadius:8, width:30, height:30, cursor:"pointer", fontSize:16 }}>✕</button>
          </div>

          {/* Language selector */}
          <div style={{ display:"flex", gap:6, padding:"8px 12px", borderBottom:"1px solid #f1f5f9", alignItems:"center" }}>
            <span style={{ fontSize:11, color:"#94a3b8", marginRight:2 }}>Language:</span>
            {langBtn("en","English")}
            {langBtn("ml","മലയാളം")}
            {langBtn("hi","हिन्दी")}
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:"auto", padding:"12px", display:"flex", flexDirection:"column", gap:10, background:"#f8fafc" }}>
            {messages.map((m,i)=>(
              <div key={i} style={{ alignSelf: m.role==="user" ? "flex-end" : "flex-start", maxWidth:"85%" }}>
                <div style={{ background: m.role==="user" ? "#6366f1" : "#fff", color: m.role==="user" ? "#fff" : "#1e293b", padding:"10px 14px", borderRadius: m.role==="user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", fontSize:13, lineHeight:1.5, border: m.role==="user" ? "none" : "1px solid #e2e8f0", whiteSpace:"pre-wrap" }}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{ padding:"10px 12px", borderTop:"1px solid #f1f5f9", display:"flex", gap:8, alignItems:"center" }}>
            <button onClick={listening ? stopListening : startListening} title="Voice input"
              style={{ width:42, height:42, borderRadius:"50%", border:"none", cursor:"pointer", flexShrink:0, fontSize:18,
                background: listening ? "#ef4444" : "#eef2ff", color: listening ? "#fff" : "#6366f1", animation: listening ? "pulse 1s infinite" : "none" }}>
              {listening ? "⏹" : "🎤"}
            </button>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send();}}
              placeholder={lang==="ml"?"ചോദ്യം ടൈപ്പ് ചെയ്യൂ...":lang==="hi"?"प्रश्न टाइप करें...":"Type your question..."}
              style={{ flex:1, border:"1px solid #e2e8f0", borderRadius:20, padding:"10px 16px", fontSize:13, outline:"none" }} />
            <button onClick={()=>send()} style={{ width:42, height:42, borderRadius:"50%", border:"none", cursor:"pointer", flexShrink:0, fontSize:16, background:"#6366f1", color:"#fff" }}>➤</button>
          </div>
          {listening && <div style={{ textAlign:"center", fontSize:11, color:"#ef4444", paddingBottom:6 }}>🎙️ Listening... speak now</div>}
        </div>
      )}
      <style>{`@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}`}</style>
    </>
  );
}
