import { supabase } from "./supabase";
import { getAccountsWithBalances } from "./bankAccounts";

// Build a comprehensive, factual snapshot of the ENTIRE business for the AI.
// SECURITY: never includes app_users (passwords) or app_settings (API keys).
export async function buildBusinessContext() {
  const q = (table, cols) => supabase.from(table).select(cols);
  const [
    accRes, suppRes, billsRes, itemsRes, paysRes, empRes, subRes, milesRes,
    projRes, schedRes, ledgerRes, invRes, commRes, recRes, recPayRes,
    attRes, payrollRes, salRes, cpRes, cpayRes
  ] = await Promise.all([
    getAccountsWithBalances(),
    q("bp_suppliers", "id, name, category, opening_balance, phone, cr_number"),
    q("bp_bills", "id, supplier_id, total_amount, net_amount, vat_amount, bill_date, description, site, status, due_date"),
    q("bp_bill_items", "bill_id, description, quantity, unit, rate, amount, site, has_vat, total_amount"),
    q("bp_payments", "bill_id, supplier_id, amount, payment_date, notes"),
    q("employees", "id, name, role, daily_rate, opening_balance, status, emp_group, nationality, phone_oman, work_start, work_end"),
    q("subcontractors", "id, name, specialty, project, contract_amount, paid"),
    q("sub_milestones", "subcontractor_id, title, amount, status, due_date"),
    q("projects", "id, name, customer, amount, status, start_date, location"),
    q("schedules", "project_id, milestone, amount, due_date, status"),
    q("ledger", "entry_date, type, amount, category, payment_mode, payee, description, site"),
    q("invoices", "invoice_no, customer, date, total, status, type"),
    q("commissions", "name, project, amount, paid, status, date"),
    q("bp_recurring", "id, name, expense_type, amount, frequency, due_day, site, is_active"),
    q("bp_recurring_payments", "recurring_id, amount, payment_date, period_month"),
    q("attendance", "employee_id, att_date, hours_worked, days_worked, status"),
    q("payroll", "employee_id, period, total_days, total_amount, status"),
    q("salary_payments", "employee_id, amount, payment_date, notes"),
    q("credit_purchases", "supplier, amount, date, description, status"),
    q("credit_payments", "supplier, amount, date"),
  ]);

  const f = (n) => parseFloat(n || 0).toFixed(3);
  const D = (r) => r.data || [];
  const accounts = accRes.accounts || [];
  const balances = accRes.balances || {};
  const trackingNames = accounts.filter(a => a.include_in_balance === false).map(a => a.account_name);

  const suppliers = D(suppRes), bills = D(billsRes), items = D(itemsRes), pays = D(paysRes);
  const employees = D(empRes), subs = D(subRes), miles = D(milesRes), projects = D(projRes), scheds = D(schedRes);
  const ledger = D(ledgerRes).filter(e => !trackingNames.includes(e.payment_mode));
  const invoices = D(invRes), comms = D(commRes), recs = D(recRes), recPays = D(recPayRes);
  const attendance = D(attRes), payroll = D(payrollRes), salaries = D(salRes);
  const creditPur = D(cpRes), creditPay = D(cpayRes);

  const today = new Date().toISOString().split("T")[0];
  const suppName = (id) => (suppliers.find(s => s.id === id)?.name) || "?";
  const empName = (id) => (employees.find(e => e.id === id)?.name) || "?";
  const projName = (id) => (projects.find(p => p.id === id)?.name) || "?";

  // ── Bank ──
  const netCash = accounts.filter(a => a.include_in_balance !== false).reduce((s, a) => s + (balances[a.id] || 0), 0);
  const accLines = accounts.map(a => `${a.account_name}: OMR ${f(balances[a.id])}${a.include_in_balance === false ? " (tracking-only, NOT in net cash)" : ""}`).join("; ");

  // ── Suppliers + balances ──
  const suppLines = suppliers.map(s => {
    const sb = bills.filter(b => b.supplier_id === s.id).reduce((x, b) => x + parseFloat(b.total_amount || 0), 0);
    const sp = pays.filter(p => p.supplier_id === s.id).reduce((x, p) => x + parseFloat(p.amount || 0), 0);
    const due = parseFloat(s.opening_balance || 0) + sb - sp;
    return `${s.name} (${s.category||"Supplier"})${s.cr_number?" CR:"+s.cr_number:""}: billed ${f(sb)}, paid ${f(sp)}, balance due OMR ${f(due)}`;
  }).join("\n");

  // ── Bills + items + status ──
  const billLines = bills.slice().sort((a,b)=>(b.bill_date<a.bill_date?-1:1)).slice(0,60).map(b => {
    const paid = pays.filter(p => p.bill_id === b.id).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    const bal = parseFloat(b.total_amount || 0) - paid;
    const st = bal <= 0.001 ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING";
    const its = items.filter(i => i.bill_id === b.id).map(i => `${i.description} ${i.quantity}${i.unit||""}@${f(i.rate)}`).join(", ");
    return `${b.bill_date} | ${suppName(b.supplier_id)} | ${b.description||"-"}${b.site?" @"+b.site:""} | total ${f(b.total_amount)} (net ${f(b.net_amount)}, vat ${f(b.vat_amount)}), paid ${f(paid)}, balance ${f(bal)} | ${st}${b.due_date?" | due "+b.due_date:""}${its?" | items: "+its:""}`;
  }).join("\n");

  // ── Subcontractors + milestones ──
  const subByName = {};
  subs.forEach(s => {
    subByName[s.name] = subByName[s.name] || { contract: 0, paid: 0, ids: [], works: [] };
    subByName[s.name].contract += parseFloat(s.contract_amount || 0);
    subByName[s.name].paid += parseFloat(s.paid || 0);
    subByName[s.name].ids.push(s.id);
    subByName[s.name].works.push(`${s.specialty||""}@${s.project||""}`);
  });
  const subLines = Object.entries(subByName).map(([n, v]) => {
    const ms = miles.filter(m => v.ids.includes(m.subcontractor_id));
    const msTxt = ms.length ? ` | milestones: ${ms.map(m=>`${m.title} ${f(m.amount)}(${m.status||"pending"})`).join(", ")}` : "";
    return `${n}: contract ${f(v.contract)}, paid ${f(v.paid)}, balance OMR ${f(v.contract - v.paid)} | works: ${v.works.join(", ")}${msTxt}`;
  }).join("\n");

  // ── Employees ──
  const empLines = employees.map(e => `${e.name} (${e.role||"-"}, ${e.nationality||"-"}): daily rate ${f(e.daily_rate)}, group ${e.emp_group||"-"}, ${e.status||"Active"}${e.work_start?`, hours ${e.work_start}-${e.work_end}`:""}`).join("\n");

  // ── Projects + schedules ──
  const projLines = projects.map(p => {
    const sc = scheds.filter(s => s.project_id === p.id);
    const scTxt = sc.length ? ` | milestones: ${sc.map(s=>`${s.milestone} ${f(s.amount)}(${s.status||"pending"})`).join(", ")}` : "";
    return `${p.name} (${p.customer||""})${p.location?" @"+p.location:""}: OMR ${f(p.amount)}, ${p.status||"Active"}${scTxt}`;
  }).join("\n");

  // ── Invoices ──
  const invLines = invoices.slice().sort((a,b)=>(b.date<a.date?-1:1)).slice(0,40)
    .map(i => `${i.date||"-"} | ${i.type||"Invoice"} ${i.invoice_no||""} | ${i.customer||"-"} | OMR ${f(i.total)} | ${i.status||"-"}`).join("\n");

  // ── Commissions ──
  const commLines = comms.map(c => `${c.name||"-"} (${c.project||"-"}): OMR ${f(c.amount)}, paid ${f(c.paid)}, ${c.status||"-"}`).join("\n");

  // ── Recurring expenses ──
  const recLines = recs.map(r => {
    const rp = recPays.filter(p => p.recurring_id === r.id);
    const lastPaid = rp.sort((a,b)=>(b.payment_date<a.payment_date?-1:1))[0];
    return `${r.name} (${r.expense_type||"-"}, ${r.frequency||"Monthly"}): OMR ${f(r.amount)}/period, due day ${r.due_day||"-"}${r.site?" @"+r.site:""}${r.is_active===false?" [INACTIVE]":""}${lastPaid?` | last paid ${lastPaid.payment_date} (${lastPaid.period_month||""})`:" | never paid"}`;
  }).join("\n");

  // ── Ledger: totals + daily map + recent entries ──
  const totalInc = ledger.filter(e => e.type === "Credits (Income)").reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const totalExp = ledger.filter(e => e.type === "Debits (Payouts)").reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const byDate = {};
  ledger.forEach(e => {
    byDate[e.entry_date] = byDate[e.entry_date] || { inc: 0, exp: 0 };
    if (e.type === "Credits (Income)") byDate[e.entry_date].inc += parseFloat(e.amount || 0);
    else byDate[e.entry_date].exp += parseFloat(e.amount || 0);
  });
  const dateLines = Object.entries(byDate).sort((a,b)=>b[0]<a[0]?-1:1).slice(0, 90)
    .map(([d, v]) => `${d}: income ${f(v.inc)}, expense ${f(v.exp)}`).join("\n");
  const recentEntries = ledger.slice().sort((a,b)=>(b.entry_date<a.entry_date?-1:1)).slice(0,50)
    .map(e => `${e.entry_date} | ${e.type==="Credits (Income)"?"IN":"OUT"} ${f(e.amount)} | ${e.category||"-"} | ${e.payee||"-"} | ${e.description||"-"}${e.site?" @"+e.site:""} | via ${e.payment_mode||"-"}`).join("\n");

  // ── Attendance summary (per employee, current totals) ──
  const attByEmp = {};
  attendance.forEach(a => {
    attByEmp[a.employee_id] = attByEmp[a.employee_id] || { days: 0, hours: 0, records: 0 };
    attByEmp[a.employee_id].days += parseFloat(a.days_worked || 0);
    attByEmp[a.employee_id].hours += parseFloat(a.hours_worked || 0);
    attByEmp[a.employee_id].records += 1;
  });
  const attLines = Object.entries(attByEmp).slice(0,40).map(([id, v]) => `${empName(id)}: ${v.records} days marked, total ${v.days.toFixed(1)} work-days, ${v.hours.toFixed(1)} hours`).join("\n");

  // ── Payroll + salary payments ──
  const payrollLines = payroll.slice(0,40).map(p => `${empName(p.employee_id)} | ${p.period||"-"} | ${f(p.total_days)} days | OMR ${f(p.total_amount)} | ${p.status||"-"}`).join("\n");
  const salByEmp = {};
  salaries.forEach(s => { salByEmp[s.employee_id] = (salByEmp[s.employee_id]||0) + parseFloat(s.amount||0); });
  const salLines = Object.entries(salByEmp).slice(0,40).map(([id,v]) => `${empName(id)}: total salary/advances paid OMR ${f(v)}`).join("\n");

  // ── Total payables ──
  const billTotal = bills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);
  const paidTotal = pays.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const openingTotal = suppliers.reduce((s, x) => s + parseFloat(x.opening_balance || 0), 0);
  const payables = openingTotal + billTotal - paidTotal;

  const FEATURES = `SOFTWARE FEATURE GUIDE (how Minarva Biz works — use for "how to" questions):
- LOGIN/USERS: Login on open. Admin adds users in Settings → User Management with per-page View/Edit permissions (roles: Admin, Manager, Accountant, Viewer, Custom).
- DASHBOARD: bank balances, Net Cash, total payables, projected sales, active sites, crew wages, cashflow chart, project status.
- INVOICES & QUOTATIONS: create customer invoices/quotations; company CR/VAT/IBAN/logo auto-fill from Settings.
- WORKS & PROJECTS: contracts with payment milestones and status (Active/Planning/Delayed/Completed).
- PAYROLL & ATTENDANCE: employees with work timing (Office 9am-9pm=9hrs after break; Site 7am-6pm=10hrs). Daily attendance in a calendar grid; salary = working hours minus break. EMPLOYEE FIELD APP (link from Dashboard) lets workers mark GPS attendance with a selfie via phone-number login.
- CASHBOOK LEDGER: double-entry (Credits=income, Debits=payouts), taggable to a bank account; Net Balance excludes tracking-only accounts.
- BANKING: add/edit accounts, transfer between accounts, account-wise transactions. 'Include in Net Cash' toggle OFF = personal/tracking account (e.g. Deepu) excluded from company Net Cash.
- BILLS & PAYABLES: supplier bills with multiple line items (qty, unit, rate, project/site, VAT per item); Credit or Paid Now; bills can be Edited/Deleted; recurring expenses tab.
- SUBCONTRACTORS: Contractor → Specialty → Work with milestones; rename via ✏️.
- REPORTS & AUDITS: Cashbook Statement (Credit/Debit + running balance) and Supplier Statement sub-tabs (All, VAT Bills, Normal, Rent, Utility, VAT Report for filing).
- SETTINGS: company profile, users/permissions, backups, AI key.`;

  return `BUSINESS DATA SNAPSHOT (as of ${today}) — SEVENSEAS Modern Enterprises. Currency OMR (Omani Rial), 3 decimals. The salary period runs 26th to 25th.

=== BANK ACCOUNTS ===
${accLines}
NET CASH (company, excludes tracking-only): OMR ${f(netCash)}

=== PAYABLES ===
TOTAL PAYABLES (owed to suppliers): OMR ${f(payables)} = opening ${f(openingTotal)} + bills ${f(billTotal)} - paid ${f(paidTotal)}

=== LEDGER TOTALS ===
All-time income OMR ${f(totalInc)}, expense OMR ${f(totalExp)}, net OMR ${f(totalInc - totalExp)}

=== SUPPLIERS (${suppliers.length}) ===
${suppLines || "none"}

=== RECENT BILLS (latest 60, with items + payment status) ===
${billLines || "none"}

=== SUBCONTRACTORS ===
${subLines || "none"}

=== EMPLOYEES (${employees.length}) ===
${empLines || "none"}

=== ATTENDANCE SUMMARY (per employee) ===
${attLines || "none"}

=== PAYROLL RECORDS ===
${payrollLines || "none"}

=== SALARY/ADVANCES PAID ===
${salLines || "none"}

=== PROJECTS (${projects.length}) ===
${projLines || "none"}

=== INVOICES & QUOTATIONS (latest 40) ===
${invLines || "none"}

=== COMMISSIONS ===
${commLines || "none"}

=== RECURRING EXPENSES ===
${recLines || "none"}

=== DAILY CASH (recent 90 days, income/expense per date) ===
${dateLines || "none"}

=== RECENT LEDGER ENTRIES (latest 50) ===
${recentEntries || "none"}

${FEATURES}`;
}
