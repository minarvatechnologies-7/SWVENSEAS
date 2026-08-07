import { supabase } from "./supabase";
import { getAccountsWithBalances } from "./bankAccounts";

// Month names (English + Malayalam + Hindi-ish) → month index
const MONTHS = {
  jan:0,january:0,february:1,feb:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,
  jul:6,july:6,aug:7,august:7,sep:8,sept:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11,
  "ജനുവരി":0,"ഫെബ്രുവരി":1,"മാർച്ച":2,"ഏപ്രിൽ":3,"മേയ":4,"ജൂൺ":5,"ജൂലൈ":6,"ഓഗസ്റ്റ":7,"സെപ്റ്റംബർ":8,"ഒക്ടോബർ":9,"നവംബർ":10,"ഡിസംബർ":11,
};

// Parse a date or month from free text. Returns { date } or { monthStart, monthEnd } or null.
function parseDate(text) {
  const t = text.toLowerCase();
  const now = new Date();

  // Explicit yyyy-mm-dd
  const iso = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = `${iso[1]}-${String(iso[2]).padStart(2,"0")}-${String(iso[3]).padStart(2,"0")}`;
    return { date: d, label: d };
  }

  // "4th june" / "june 4" / "4 june 2026"
  let day = null, mon = null, year = now.getFullYear();
  const dayMatch = t.match(/(\d{1,2})\s*(st|nd|rd|th)?/);
  for (const [name, idx] of Object.entries(MONTHS)) {
    if (t.includes(name)) { mon = idx; break; }
  }
  const yearMatch = t.match(/\b(20\d{2})\b/);
  if (yearMatch) year = parseInt(yearMatch[1]);

  if (mon !== null && dayMatch && /\d/.test(t.replace(/20\d{2}/,""))) {
    // get the day number that is NOT the year
    const nums = (t.match(/\d{1,2}/g) || []).map(Number).filter(n=>n>=1 && n<=31);
    if (nums.length) day = nums[0];
  }

  if (mon !== null && day !== null) {
    const d = `${year}-${String(mon+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    return { date: d, label: d };
  }
  if (mon !== null) {
    const ms = `${year}-${String(mon+1).padStart(2,"0")}-01`;
    const lastDay = new Date(year, mon+1, 0).getDate();
    const me = `${year}-${String(mon+1).padStart(2,"0")}-${lastDay}`;
    return { monthStart: ms, monthEnd: me, label: `${Object.keys(MONTHS).find(k=>MONTHS[k]===mon)} ${year}` };
  }

  // "today" / "ഇന്ന്" / "आज"
  if (t.includes("today") || t.includes("ഇന്ന") || t.includes("आज")) {
    const d = now.toISOString().split("T")[0];
    return { date: d, label: "today" };
  }
  // "this month" / "ഈ മാസം" / "इस महीने"
  if (t.includes("this month") || t.includes("ഈ മാസ") || t.includes("इस महीने") || t.includes("month")) {
    const ms = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
    const me = now.toISOString().split("T")[0];
    return { monthStart: ms, monthEnd: me, label: "this month" };
  }
  return null;
}

// Tracking-only account names (excluded from totals)
async function getTrackingOnlyNames() {
  try {
    const { data } = await supabase.from("bank_accounts").select("account_name, include_in_balance").is("deleted_at",null);
    return (data||[]).filter(a=>a.include_in_balance===false).map(a=>a.account_name);
  } catch { return []; }
}

// Detect a data-intent and answer with live numbers. Returns string or null (no data intent).
export async function answerDataQuery(text, lang) {
  const t = text.toLowerCase();
  const fmt = (n) => `OMR ${parseFloat(n||0).toFixed(3)}`;
  const L = (en,ml,hi) => lang==="ml"?ml : lang==="hi"?hi : en;

  const isExpense = /(expense|expenses|spent|debit|payout|ചെലവ|खर्च|व्यय)/.test(t);
  const isIncome  = /(income|revenue|credit|received|വരവ|വരുമാന|आय|आमदनी)/.test(t);
  const isBalance = /(balance|net cash|cash balance|ബാലൻസ|ക്യാഷ|बैलेंस|शेष|नकद)/.test(t);
  const isPayable = /(payable|owe|owed|pending|due|supplier|കൊടുക്കാന|പെൻഡിങ|बकाया|देय)/.test(t);
  const isEmpCount= /(how many employee|employee count|number of employee|total employee|എത്ര ജീവനക്കാർ|ജീവനക്കാരുടെ എണ്ണ|कितने कर्मचारी|कर्मचारियों की संख्या)/.test(t);
  const isProjects= /(how many project|project count|number of project|എത്ര പ്രോജക്ട|कितनी परियोजना)/.test(t);

  // ── Named person/supplier/contractor lookup (takes priority over generic balance) ──
  // Only attempt if the question is about a balance/payment/due AND mentions something beyond keywords
  const wantsPersonInfo = /(balance|payment|paid|pay|due|owe|owed|pending|account|ബാലൻസ|കൊടുക്കാന|പേയ്മെന്റ|बकाया|भुगतान|देय)/.test(t);
  if (wantsPersonInfo) {
    const [suppRes, empRes, subRes] = await Promise.all([
      supabase.from("bp_suppliers").select("id, name, category, opening_balance, phone, cr_number").is("deleted_at",null),
      supabase.from("employees").select("id, name, daily_rate, opening_balance").is("deleted_at",null),
      supabase.from("subcontractors").select("id, name, contract_amount, paid").is("deleted_at",null),
    ]);
    const suppliers = suppRes.data || [];
    const employees = empRes.data || [];
    const subs = subRes.data || [];

    // Build list of all known names, find any that appears in the question
    const norm = s => (s||"").toLowerCase().trim();
    const matchName = (name) => {
      const n = norm(name);
      if (n.length < 3) return false;
      // match full name or any word of the name (>=3 chars)
      if (t.includes(n)) return true;
      return n.split(/\s+/).some(w => w.length >= 3 && t.includes(w));
    };

    // ── Supplier match ──
    const supp = suppliers.find(s => matchName(s.name));
    if (supp) {
      const [billsRes, paysRes] = await Promise.all([
        supabase.from("bp_bills").select("total_amount").eq("supplier_id", supp.id).is("deleted_at",null),
        supabase.from("bp_payments").select("amount").eq("supplier_id", supp.id).is("deleted_at",null),
      ]);
      const billTotal = (billsRes.data||[]).reduce((s,b)=>s+parseFloat(b.total_amount||0),0);
      const paidTotal = (paysRes.data||[]).reduce((s,p)=>s+parseFloat(p.amount||0),0);
      const opening = parseFloat(supp.opening_balance||0);
      const due = opening + billTotal - paidTotal;
      return L(
        `${supp.name} (${supp.category||"Supplier"}):\n• Opening: ${fmt(opening)}\n• Total bills: ${fmt(billTotal)}\n• Total paid: ${fmt(paidTotal)}\n• Balance due: ${fmt(due)}`,
        `${supp.name} (${supp.category||"Supplier"}):\n• Opening: ${fmt(opening)}\n• ആകെ bills: ${fmt(billTotal)}\n• ആകെ കൊടുത്തത്: ${fmt(paidTotal)}\n• കൊടുക്കാനുള്ളത്: ${fmt(due)}`,
        `${supp.name} (${supp.category||"Supplier"}):\n• Opening: ${fmt(opening)}\n• कुल बिल: ${fmt(billTotal)}\n• भुगतान: ${fmt(paidTotal)}\n• शेष देय: ${fmt(due)}`
      );
    }

    // ── Subcontractor match ──
    const subMatches = subs.filter(s => matchName(s.name));
    if (subMatches.length) {
      const contract = subMatches.reduce((s,x)=>s+parseFloat(x.contract_amount||0),0);
      const paid = subMatches.reduce((s,x)=>s+parseFloat(x.paid||0),0);
      const name = subMatches[0].name;
      return L(
        `${name} (Subcontractor):\n• Contract total: ${fmt(contract)}\n• Paid: ${fmt(paid)}\n• Balance: ${fmt(contract-paid)} (${subMatches.length} work item${subMatches.length>1?"s":""})`,
        `${name} (Subcontractor):\n• ആകെ contract: ${fmt(contract)}\n• കൊടുത്തത്: ${fmt(paid)}\n• ബാക്കി: ${fmt(contract-paid)} (${subMatches.length} works)`,
        `${name} (उपठेकेदार):\n• कुल अनुबंध: ${fmt(contract)}\n• भुगतान: ${fmt(paid)}\n• शेष: ${fmt(contract-paid)}`
      );
    }

    // ── Employee match ──
    const emp = employees.find(e => matchName(e.name));
    if (emp) {
      return L(
        `${emp.name} (Employee):\n• Daily rate: ${fmt(emp.daily_rate)}\n• Opening balance: ${fmt(emp.opening_balance)}\nFor full salary/advance details, open Payroll & Attendance.`,
        `${emp.name} (ജീവനക്കാരൻ):\n• Daily rate: ${fmt(emp.daily_rate)}\n• Opening balance: ${fmt(emp.opening_balance)}\nFull salary/advance details-ന് Payroll & Attendance തുറക്കൂ.`,
        `${emp.name} (कर्मचारी):\n• दैनिक दर: ${fmt(emp.daily_rate)}\n• Opening: ${fmt(emp.opening_balance)}`
      );
    }
    // If they clearly named someone we couldn't find, say so (only when not a generic balance question)
    const genericBalanceOnly = isBalance && /(net cash|all account|total balance|company balance)/.test(t);
    if (!genericBalanceOnly && !isPayable && !isEmpCount && !isProjects) {
      // Did the question contain a proper-noun-ish word not matched? Offer guidance.
      const looksLikeName = /\b[a-z]{3,}\b/.test(t.replace(/balance|payment|paid|pay|due|owe|owed|pending|account|of|the|for|what|is|how|much|show|me/g,"").trim());
      if (looksLikeName) {
        return L(
          `I couldn't find that name in suppliers, subcontractors, or employees. Please check the spelling, or ask for 'net cash balance' for account balances.`,
          `ആ പേര് suppliers, subcontractors, employees-ൽ കണ്ടെത്താനായില്ല. spelling നോക്കൂ, അല്ലെങ്കിൽ account balance-ന് 'net cash balance' എന്ന് ചോദിക്കൂ.`,
          `वह नाम नहीं मिला। वर्तनी जांचें, या 'net cash balance' पूछें।`
        );
      }
    }
  }

  // ── Net cash / account balances ──
  if (isBalance && !isExpense && !isIncome) {
    const { accounts, balances } = await getAccountsWithBalances();
    const net = accounts.filter(a=>a.include_in_balance!==false).reduce((s,a)=>s+(balances[a.id]||0),0);
    const lines = accounts.map(a=>`• ${a.account_name}: ${fmt(balances[a.id])}${a.include_in_balance===false?" (tracking only)":""}`).join("\n");
    return L(
      `Current balances:\n${lines}\n\nNet Cash (company): ${fmt(net)}`,
      `നിലവിലെ balances:\n${lines}\n\nNet Cash (company): ${fmt(net)}`,
      `वर्तमान शेष:\n${lines}\n\nNet Cash: ${fmt(net)}`
    );
  }

  // ── Expense / Income for a date or month ──
  if (isExpense || isIncome) {
    const dq = parseDate(text);
    const tracking = await getTrackingOnlyNames();
    let q = supabase.from("ledger").select("type, amount, entry_date, payment_mode").is("deleted_at",null);
    const { data } = await q;
    let rows = (data||[]).filter(r => !tracking.includes(r.payment_mode));
    let label = "all time";
    if (dq?.date) { rows = rows.filter(r=>r.entry_date===dq.date); label = dq.label; }
    else if (dq?.monthStart) { rows = rows.filter(r=>r.entry_date>=dq.monthStart && r.entry_date<=dq.monthEnd); label = dq.label; }

    const exp = rows.filter(r=>r.type==="Debits (Payouts)").reduce((s,r)=>s+parseFloat(r.amount||0),0);
    const inc = rows.filter(r=>r.type==="Credits (Income)").reduce((s,r)=>s+parseFloat(r.amount||0),0);

    if (isExpense && !isIncome) {
      return L(
        `Total expense for ${label}: ${fmt(exp)} (${rows.filter(r=>r.type==="Debits (Payouts)").length} entries).`,
        `${label}-ലെ ആകെ ചെലവ്: ${fmt(exp)} (${rows.filter(r=>r.type==="Debits (Payouts)").length} entries).`,
        `${label} का कुल खर्च: ${fmt(exp)}।`
      );
    }
    if (isIncome && !isExpense) {
      return L(
        `Total income for ${label}: ${fmt(inc)} (${rows.filter(r=>r.type==="Credits (Income)").length} entries).`,
        `${label}-ലെ ആകെ വരവ്: ${fmt(inc)} (${rows.filter(r=>r.type==="Credits (Income)").length} entries).`,
        `${label} की कुल आय: ${fmt(inc)}।`
      );
    }
    return L(
      `For ${label} — Income: ${fmt(inc)}, Expense: ${fmt(exp)}, Net: ${fmt(inc-exp)}.`,
      `${label} — വരവ്: ${fmt(inc)}, ചെലവ്: ${fmt(exp)}, Net: ${fmt(inc-exp)}.`,
      `${label} — आय: ${fmt(inc)}, खर्च: ${fmt(exp)}, Net: ${fmt(inc-exp)}.`
    );
  }

  // ── Total payables ──
  if (isPayable) {
    const [{ data: bills }, { data: pays }, { data: supps }] = await Promise.all([
      supabase.from("bp_bills").select("total_amount, supplier_id").is("deleted_at",null),
      supabase.from("bp_payments").select("amount").is("deleted_at",null),
      supabase.from("bp_suppliers").select("opening_balance").is("deleted_at",null),
    ]);
    const billTotal = (bills||[]).reduce((s,b)=>s+parseFloat(b.total_amount||0),0);
    const paidTotal = (pays||[]).reduce((s,p)=>s+parseFloat(p.amount||0),0);
    const opening = (supps||[]).reduce((s,x)=>s+parseFloat(x.opening_balance||0),0);
    const due = opening + billTotal - paidTotal;
    return L(
      `Total payables (owed to suppliers): ${fmt(due)}. [Opening ${fmt(opening)} + Bills ${fmt(billTotal)} − Paid ${fmt(paidTotal)}]`,
      `ആകെ payables (suppliers-ന് കൊടുക്കാനുള്ളത്): ${fmt(due)}. [Opening ${fmt(opening)} + Bills ${fmt(billTotal)} − Paid ${fmt(paidTotal)}]`,
      `कुल देय (आपूर्तिकर्ताओं को): ${fmt(due)}।`
    );
  }

  // ── Employee count ──
  if (isEmpCount) {
    const { data } = await supabase.from("employees").select("id, status").is("deleted_at",null);
    const active = (data||[]).filter(e=>(e.status||"Active")==="Active").length;
    return L(
      `You have ${active} active employees (${(data||[]).length} total).`,
      `${active} active ജീവനക്കാർ ഉണ്ട് (ആകെ ${(data||[]).length}).`,
      `${active} सक्रिय कर्मचारी हैं (कुल ${(data||[]).length})।`
    );
  }

  // ── Project count ──
  if (isProjects) {
    const { data } = await supabase.from("projects").select("id, status").is("deleted_at",null);
    const byStatus = {};
    (data||[]).forEach(p=>{ const s=p.status||"Active"; byStatus[s]=(byStatus[s]||0)+1; });
    const parts = Object.entries(byStatus).map(([k,v])=>`${k}: ${v}`).join(", ");
    return L(
      `You have ${(data||[]).length} projects (${parts}).`,
      `${(data||[]).length} projects ഉണ്ട് (${parts}).`,
      `${(data||[]).length} परियोजनाएं हैं (${parts})।`
    );
  }

  return null; // no data intent detected
}
