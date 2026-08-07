import { useState, useEffect } from "react";
import { getBankAccounts, getAccountBalance, getAccountsWithBalances } from "../lib/bankAccounts";
import { supabase } from "../lib/supabase";

export default function Dashboard({ setPage }) {
  const [projects, setProjects] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [accountBalances, setAccountBalances] = useState({});
  const [payablesDue, setPayablesDue] = useState(0);
  const [recurringPending, setRecurringPending] = useState([]);
  const [overdueBills, setOverdueBills] = useState([]);
  const [stalledProjects, setStalledProjects] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const installApp = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
    } else {
      alert("To install:\n• Chrome/Edge: Click ⋮ menu → Install app\n• iPhone Safari: Tap Share → Add to Home Screen\n• Android: Tap ⋮ menu → Add to Home Screen");
    }
  };

  useEffect(() => { 
    loadData();
    loadBankBalances();
  }, []);

  const loadBankBalances = async () => {
    const { accounts, balances } = await getAccountsWithBalances();
    setBankAccounts(accounts);
    setAccountBalances(balances);
  };

  const loadData = async () => {
    setLoading(true);
    const [{ data: projs }, { data: led }, { data: emps }] = await Promise.all([
      supabase.from("projects").select("id, name, customer, amount, status").is("deleted_at",null),
      supabase.from("ledger").select("type, amount, entry_date").is("deleted_at",null),
      supabase.from("employees").select("id, status").is("deleted_at",null),
    ]);

    // Load schedules for received amounts
    const projsWithSched = await Promise.all((projs || []).map(async p => {
      const { data: scheds } = await supabase.from("schedules").select("received").eq("project_id", p.id).is("deleted_at",null);
      const received = (scheds || []).reduce((s, x) => s + parseFloat(x.received || 0), 0);
      return { ...p, received };
    }));

    setProjects(projsWithSched);
    setLedger(led || []);
    setEmployees(emps || []);

    // Bills & Payables total outstanding
    try {
      const [{ data: bpSupp }, { data: bpBills }, { data: bpPays }] = await Promise.all([
        supabase.from("bp_suppliers").select("id, opening_balance").is("deleted_at",null),
        supabase.from("bp_bills").select("id, supplier_id, total_amount, due_date, status").is("deleted_at",null),
        supabase.from("bp_payments").select("bill_id, amount").is("deleted_at",null),
      ]);
      const opening = (bpSupp||[]).reduce((s,x)=>s+parseFloat(x.opening_balance||0),0);
      const billsT  = (bpBills||[]).reduce((s,x)=>s+parseFloat(x.total_amount||0),0);
      const paidT   = (bpPays||[]).reduce((s,x)=>s+parseFloat(x.amount||0),0);
      setPayablesDue(opening + billsT - paidT);

      // Overdue bills: due_date has passed and the bill isn't fully paid yet
      const today = new Date().toISOString().split("T")[0];
      const suppMap = {}; (bpSupp||[]).forEach(s=>{ suppMap[s.id]=s; });
      const overdue = (bpBills||[]).filter(b => {
        if (!b.due_date || b.due_date >= today) return false;
        const paidForBill = (bpPays||[]).filter(p=>p.bill_id===b.id).reduce((s,p)=>s+parseFloat(p.amount||0),0);
        return paidForBill < parseFloat(b.total_amount||0) - 0.001;
      });
      setOverdueBills(overdue);

      // Recurring expenses pending this month
      const [{ data: recs }, { data: recPays }] = await Promise.all([
        supabase.from("bp_recurring").select("id, name, amount, expense_type").eq("is_active", true).is("deleted_at",null),
        supabase.from("bp_recurring_payments").select("recurring_id, amount, period_month").is("deleted_at",null),
      ]);
      const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const now2 = new Date();
      const thisMonth = `${MONTHS[now2.getMonth()]} ${now2.getFullYear()}`;
      const pending = (recs||[]).filter(r=>{
        const paidThis = (recPays||[]).filter(p=>p.recurring_id===r.id && p.period_month===thisMonth).reduce((s,p)=>s+parseFloat(p.amount||0),0);
        return paidThis < parseFloat(r.amount)-0.001;
      });
      setRecurringPending(pending);
    } catch { setPayablesDue(0); }

    // Stalled projects: status is "Active" but no cashbook activity tagged
    // to this project in the last 30 days (only meaningful for projects that
    // have at least one tagged entry to begin with — otherwise it's likely a
    // project whose expenses simply aren't being tagged yet, not a real stall).
    try {
      const { data: linkedLedger } = await supabase.from("ledger").select("project_id, entry_date").is("deleted_at",null).not("project_id","is",null);
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30);
      const cutoffStr = cutoff.toISOString().split("T")[0];
      const activeProjs = (projsWithSched||[]).filter(p=>p.status==="Active");
      const stalled = activeProjs.filter(p => {
        const entries = (linkedLedger||[]).filter(e=>e.project_id===p.id);
        if (entries.length === 0) return false; // never tagged — not flagged as "stalled"
        const mostRecent = entries.reduce((max,e)=> e.entry_date > max ? e.entry_date : max, entries[0].entry_date);
        return mostRecent < cutoffStr;
      });
      setStalledProjects(stalled);
    } catch { setStalledProjects([]); }

    // Low stock inventory items
    try {
      const { data: inv } = await supabase.from("inventory_items").select("id, name, current_stock, min_stock, unit").is("deleted_at",null);
      const low = (inv||[]).filter(it => parseFloat(it.min_stock||0) > 0 && parseFloat(it.current_stock||0) <= parseFloat(it.min_stock||0));
      setLowStockItems(low);
    } catch { setLowStockItems([]); }

    setLoading(false);
  };

  const totalContract = projects.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const totalReceived = projects.reduce((s, p) => s + (p.received || 0), 0);
  const totalPending = totalContract - totalReceived;
  const activeProjects = projects.filter(p => p.status === "Active").length;
  const activeEmployees = employees.filter(e => e.status === "Active").length;
  // Exclude tracking-only account entries (e.g. Deepu) from cashflow
  const trackingOnlyNames = bankAccounts.filter(a => a.include_in_balance === false).map(a => a.account_name);
  const visibleLedger = ledger.filter(e => !trackingOnlyNames.includes(e.payment_mode));
  const totalIncome = visibleLedger.filter(e => e.type === "Credits (Income)").reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const totalExpense = visibleLedger.filter(e => e.type === "Debits (Payouts)").reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  // Net Cash = sum of balances ONLY for accounts marked include_in_balance (excludes tracking-only like Deepu)
  const accountsTotal = bankAccounts
    .filter(acc => acc.include_in_balance !== false)
    .reduce((s, acc) => s + parseFloat(accountBalances[acc.id] || 0), 0);
  const netBalance = bankAccounts.length > 0 ? accountsTotal : (totalIncome - totalExpense);
  const maxBar = Math.max(totalIncome, totalExpense, totalReceived, 1);
  const maxBarSafe = maxBar === 0 ? 1 : maxBar;

  // Monthly breakdown for chart — last 6 months
  const monthlyData = (() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      const key = `${y}-${String(m+1).padStart(2,"0")}`;
      const label = d.toLocaleString("en",{month:"short"});
      const inc = visibleLedger.filter(e => e.type==="Credits (Income)" && e.entry_date?.startsWith(key)).reduce((s,e)=>s+parseFloat(e.amount||0),0);
      const exp = visibleLedger.filter(e => e.type==="Debits (Payouts)" && e.entry_date?.startsWith(key)).reduce((s,e)=>s+parseFloat(e.amount||0),0);
      months.push({ label, inc, exp });
    }
    return months;
  })();
  const maxMonthly = Math.max(...monthlyData.flatMap(m => [m.inc, m.exp]), 1);

  return (
    <div style={{ padding: 24 }}>
      {/* Hero Banner */}
      <div style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 60%,#1e4080 100%)", borderRadius: 14, padding: "28px 32px", marginBottom: 24, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 300, height: "100%", background: "radial-gradient(circle at 80% 50%,rgba(59,130,246,0.15) 0%,transparent 70%)" }} />
        <div style={{ fontSize: 10, color: "#60a5fa", fontWeight: 700, letterSpacing: 2, marginBottom: 8 }}>SEVENSEAS MODERN ENTERPRISES OPERATIONS</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Comprehensive Frontboard Dashboard</div>
        <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 560, marginBottom: 20 }}>Real-time visual reports of civil contracts, Omani Rial (OMR) ledgers, subcontractor commitments, payroll registers, and referral commission accounts.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setPage("invoices")} style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New Invoice / Qtn</button>
          <button onClick={() => setPage("ledger")} style={{ background: "rgba(255,255,255,0.1)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Review Cashbook</button>
          {!installed && (
            <button onClick={installApp} style={{ background: "rgba(99,102,241,0.9)", color: "#fff", border: "1px solid #818cf8", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>⬇ Install App</button>
          )}
          {installed && (
            <div style={{ background: "rgba(16,185,129,0.2)", color: "#34d399", border: "1px solid #34d399", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600 }}>✅ App Installed</div>
          )}
        </div>
      </div>

      {/* Bank Account Balances */}
      {bankAccounts.length > 0 && (
        <div className="dash-grid-auto" style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(bankAccounts.length, 3)}, 1fr)`, gap: 16, marginBottom: 24 }}>
          {bankAccounts.map(acc => {
            const trackingOnly = acc.include_in_balance === false;
            return (
            <div key={acc.id} style={{ background: trackingOnly ? "linear-gradient(135deg, #334155, #475569)" : "linear-gradient(135deg, #0f172a, #1e3a5f)", borderRadius: 14, padding: "18px 22px", color: "#fff", border: trackingOnly ? "1px solid #64748b" : "1px solid #1e40af" }}>
              <div style={{ fontSize: 10, color: trackingOnly ? "#cbd5e1" : "#60a5fa", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>🏦 {acc.account_name.toUpperCase()}</div>
              {acc.account_number && <div style={{ fontSize: 11, color: "#475569", marginBottom: 8, fontFamily: "monospace" }}>{acc.account_number}</div>}
              <div style={{ fontSize: 22, fontWeight: 900, color: (accountBalances[acc.id] || 0) >= 0 ? (trackingOnly ? "#cbd5e1" : "#60a5fa") : "#f87171" }}>
                OMR {((accountBalances[acc.id]) || 0).toFixed(3)}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                {trackingOnly ? "📋 Tracking only — not in Net Cash" : "Current Balance"}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Smart Alerts — bills overdue, recurring pending, stalled projects, low stock, negative balance */}
      {!loading && (() => {
        const alerts = [];
        if (netBalance < 0) {
          alerts.push({
            key: "neg-balance", icon: "🚨", color: "#dc2626", bg: "#fef2f2", border: "#fca5a5",
            title: "Net cash balance is negative",
            detail: `OMR ${netBalance.toFixed(3)} — review the cashbook`,
            page: "ledger",
          });
        }
        if (overdueBills.length > 0) {
          const totalOverdue = overdueBills.reduce((s,b)=>s+parseFloat(b.total_amount||0),0);
          alerts.push({
            key: "overdue-bills", icon: "⏰", color: "#dc2626", bg: "#fef2f2", border: "#fca5a5",
            title: `${overdueBills.length} bill${overdueBills.length>1?"s":""} overdue`,
            detail: `OMR ${totalOverdue.toFixed(3)} past due date`,
            page: "creditpurchases",
          });
        }
        if (recurringPending.length > 0) {
          alerts.push({
            key: "recurring", icon: "🔔", color: "#92400e", bg: "#fffbeb", border: "#fcd34d",
            title: `${recurringPending.length} recurring payment${recurringPending.length>1?"s":""} pending this month`,
            detail: `${recurringPending.map(r=>r.name).join(", ")} — OMR ${recurringPending.reduce((s,r)=>s+parseFloat(r.amount||0),0).toFixed(3)}`,
            page: "creditpurchases",
          });
        }
        if (stalledProjects.length > 0) {
          alerts.push({
            key: "stalled", icon: "🐌", color: "#92400e", bg: "#fffbeb", border: "#fcd34d",
            title: `${stalledProjects.length} active project${stalledProjects.length>1?"s":""} with no activity in 30+ days`,
            detail: stalledProjects.map(p=>p.name).join(", "),
            page: "projects",
          });
        }
        if (lowStockItems.length > 0) {
          alerts.push({
            key: "low-stock", icon: "📦", color: "#92400e", bg: "#fffbeb", border: "#fcd34d",
            title: `${lowStockItems.length} inventory item${lowStockItems.length>1?"s":""} running low`,
            detail: lowStockItems.map(it=>`${it.name} (${parseFloat(it.current_stock||0)} ${it.unit||""})`).join(", "),
            page: "inventory",
          });
        }
        if (alerts.length === 0) return null;
        return (
          <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map(a => (
              <div key={a.key} onClick={() => setPage(a.page)}
                style={{ background: a.bg, border: `1px solid ${a.border}`, borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", cursor: "pointer" }}>
                <span style={{ fontSize: 18 }}>{a.icon}</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: a.color }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: a.color, opacity: 0.85, marginTop: 2 }}>{a.detail}</div>
                </div>
                <span style={{ fontSize: 10, color: a.color, opacity: 0.7 }}>View →</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 24 }}>
        {[
          { label: "NET CASH BALANCE", value: loading ? "..." : `${netBalance.toFixed(3)}`, unit: "OMR", sub: netBalance >= 0 ? "SURPLUS  Core reserves" : "DEFICIT  Check cashbook", color: "#10b981", icon: "🏦" },
          { label: "PROJECTED BILLING SALES", value: loading ? "..." : `${totalContract.toFixed(3)}`, unit: "OMR", sub: `Pending: ${totalPending.toFixed(2)} OMR`, color: "#6366f1", icon: "💲" },
          { label: "TOTAL PAYABLES", value: loading ? "..." : `${payablesDue.toFixed(3)}`, unit: "OMR", sub: payablesDue > 0.001 ? "Owed to suppliers" : "All cleared", color: "#ef4444", icon: "💳" },
          { label: "ACTIVE WORK SITES", value: loading ? "..." : activeProjects, unit: "", sub: `${projects.filter(p=>p.status==="Completed").length} Completed · ${projects.length} Total`, color: "#f59e0b", icon: "🏢" },
          { label: "CREW FORCE WAGES", value: loading ? "..." : activeEmployees, unit: "Members", sub: "Active on payroll register", color: "#ec4899", icon: "👤" },
        ].map(c => (
          <div key={c.label} style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0", borderTop: `3px solid ${c.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: 0.8, marginBottom: 8 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{c.value} <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b" }}>{c.unit}</span></div>
                <div style={{ fontSize: 11, color: c.color, marginTop: 4 }}>{c.sub}</div>
              </div>
              <div style={{ fontSize: 22, opacity: 0.5 }}>{c.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="dash-grid-2" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Cashflow Chart */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 16, marginBottom: 4 }}>Total Cashflows OMR Comparison</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>Graphical Presentation of total credit income versus debit expenses</div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, marginBottom: 16 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, background: "#10b981", borderRadius: "50%", display: "inline-block" }} /> Income / Credits: OMR {(totalIncome||totalReceived).toFixed(3)}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, background: "#ef4444", borderRadius: "50%", display: "inline-block" }} /> Expenses / Debits: OMR {totalExpense.toFixed(3)}</span>
          </div>
          <div style={{ position: "relative", height: 180 }}>
            {/* Grid lines */}
            {[0,25,50,75,100].map(pct => (
              <div key={pct} style={{ position:"absolute", bottom:`${pct/100*160}px`, left:0, right:0, display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:9, color:"#cbd5e1", width:36, textAlign:"right", flexShrink:0 }}>
                  {pct===0?"0":((maxMonthly*(pct/100))/1000)>1?(maxMonthly*(pct/100)/1000).toFixed(1)+"k":(maxMonthly*(pct/100)).toFixed(0)}
                </span>
                <div style={{ flex:1, height:1, background:"#f1f5f9" }} />
              </div>
            ))}
            {/* Bars */}
            <div style={{ position:"absolute", bottom:0, left:40, right:0, display:"flex", alignItems:"flex-end", gap:4, height:160 }}>
              {monthlyData.map((m,i) => (
                <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:0 }}>
                  <div style={{ width:"100%", display:"flex", gap:2, alignItems:"flex-end", height:160 }}>
                    <div title={`Income: OMR ${m.inc.toFixed(3)}`} style={{ flex:1, background:"#10b981", borderRadius:"3px 3px 0 0",
                      height:`${Math.max((m.inc/maxMonthly)*152,m.inc>0?3:0)}px`, transition:"height 0.5s", opacity:0.85 }} />
                    <div title={`Expense: OMR ${m.exp.toFixed(3)}`} style={{ flex:1, background:"#ef4444", borderRadius:"3px 3px 0 0",
                      height:`${Math.max((m.exp/maxMonthly)*152,m.exp>0?3:0)}px`, transition:"height 0.5s", opacity:0.85 }} />
                  </div>
                  <div style={{ fontSize:9, color:"#94a3b8", marginTop:4, fontWeight:600 }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
            <span style={{ width: 8, height: 8, background: "#6366f1", borderRadius: "50%", display: "inline-block", marginRight: 6 }} />
            Financial Ratio: <strong>{totalExpense > 0 ? (totalIncome / totalExpense).toFixed(2) + "x" : "No debit"}</strong> revenues against operational payouts
            <span onClick={() => setPage("ledger")} style={{ color: "#3b82f6", cursor: "pointer", marginLeft: 12 }}>Analyze double-entry ledgers →</span>
          </div>
        </div>

        {/* Project Status Breakdown */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 16, marginBottom: 4 }}>Project Status Breakdown</div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 20 }}>Live data from Supabase database</div>
          {loading ? (
            <div style={{ textAlign: "center", padding: 30, color: "#94a3b8" }}>⏳ Loading...</div>
          ) : (
            <div>
              {[
                { label: "Active", count: projects.filter(p => p.status === "Active").length, color: "#10b981", bg: "#ecfdf5" },
                { label: "Planning", count: projects.filter(p => p.status === "Planning").length, color: "#6366f1", bg: "#eef2ff" },
                { label: "Delayed", count: projects.filter(p => p.status === "Delayed").length, color: "#ef4444", bg: "#fef2f2" },
                { label: "Completed", count: projects.filter(p => p.status === "Completed").length, color: "#64748b", bg: "#f8fafc" },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
                    <span style={{ fontSize: 13, color: "#475569" }}>{s.label}</span>
                  </div>
                  <span style={{ background: s.bg, color: s.color, borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>{s.count} sites</span>
                </div>
              ))}
              <div style={{ marginTop: 16, padding: "12px", background: "#f8fafc", borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>TOTAL CONTRACT VALUE</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#6366f1" }}>OMR {totalContract.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: "#10b981", marginTop: 2 }}>Collected: OMR {totalReceived.toLocaleString()}</div>
              </div>
            </div>
          )}
          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 12, marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b" }}>
            <span>Total: <strong>{projects.length} projects</strong></span>
            <span onClick={() => setPage("subcontractors")} style={{ color: "#3b82f6", cursor: "pointer" }}>Subcontracts →</span>
          </div>
        </div>
      </div>

      {/* Projects Table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15 }}>Active Projects — Payment Status</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{projects.length} sites · Total contract value OMR {totalContract.toLocaleString()}</div>
          </div>
          <button onClick={() => setPage("projects")} style={{ background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer" }}>View All →</button>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>⏳ Loading projects from Supabase...</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Project", "Customer", "Contract (OMR)", "Received (OMR)", "Pending (OMR)", "Progress", "Status"].map(h => (
                  <th key={h} style={{ padding: "10px 20px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((p, i) => {
                const pct = p.amount > 0 ? Math.round((p.received / p.amount) * 100) : 0;
                const statusColor = { Active: "#10b981", Planning: "#6366f1", Delayed: "#ef4444", Completed: "#64748b" };
                const statusBg = { Active: "#ecfdf5", Planning: "#eef2ff", Delayed: "#fef2f2", Completed: "#f8fafc" };
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px 20px", color: "#1e293b", fontWeight: 600 }}>{p.name}</td>
                    <td style={{ padding: "12px 20px", color: "#475569" }}>{p.customer}</td>
                    <td style={{ padding: "12px 20px", color: "#1e293b" }}>{parseFloat(p.amount).toLocaleString()}</td>
                    <td style={{ padding: "12px 20px", color: "#10b981", fontWeight: 600 }}>{p.received.toLocaleString()}</td>
                    <td style={{ padding: "12px 20px", color: "#f59e0b", fontWeight: 600 }}>{(p.amount - p.received).toFixed(2)}</td>
                    <td style={{ padding: "12px 20px", minWidth: 140 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 4, height: 6 }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? "#10b981" : "#3b82f6", borderRadius: 4, height: 6 }} />
                        </div>
                        <span style={{ fontSize: 11, color: "#64748b", minWidth: 30 }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 20px" }}>
                      <span style={{ background: statusBg[p.status] || "#f8fafc", color: statusColor[p.status] || "#64748b", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{p.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
