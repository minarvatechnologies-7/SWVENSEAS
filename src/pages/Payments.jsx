import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../context/AdminContext";
import { getBankAccounts, createLedgerEntry } from "../lib/bankAccounts";
import Autocomplete from "../components/Autocomplete";

const TYPES = [
  { id: "project",   label: "Project Payment",       icon: "🏗", color: "#6366f1", bg: "#eef2ff", desc: "Money received against a project's payment milestone" },
  { id: "subcontractor", label: "Subcontractor Payment", icon: "🔧", color: "#8b5cf6", bg: "#f5f3ff", desc: "Payment to a subcontractor — work milestone or other (e.g. labour rental)" },
  { id: "bill",       label: "Bill Payment",          icon: "💳", color: "#0ea5e9", bg: "#f0f9ff", desc: "Payment against a supplier bill" },
  { id: "recurring",  label: "Recurring / EMI",        icon: "🔁", color: "#ef4444", bg: "#fef2f2", desc: "Vehicle EMI, office rent, and other fixed recurring expenses" },
  { id: "commission", label: "Commission Payment",     icon: "💼", color: "#f59e0b", bg: "#fffbeb", desc: "Commission paid to a referral agent" },
  { id: "general",    label: "General Entry",          icon: "📒", color: "#64748b", bg: "#f8fafc", desc: "Anything else — direct cashbook entry" },
];

const GENERAL_CATEGORIES = ["Project Payment","Materials","Payroll","Equipment","Subcontractor","Commission","Transport","Fund Received","Supplier Payment","Miscellaneous"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const todayStr = () => new Date().toISOString().split("T")[0];

const inp = { border:"1px solid #e2e8f0", borderRadius:8, padding:"9px 12px", fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", background:"#fff" };
const label = { fontSize:11, color:"#64748b", fontWeight:600, marginBottom:4 };

export default function Payments() {
  const { canEdit, setShowLogin, logActivity } = useAdmin();
  const isAdmin = canEdit("payments");

  const [type, setType] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Source data for dropdowns
  const [projects, setProjects] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [subcontractors, setSubcontractors] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [bills, setBills] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [recentPayments, setRecentPayments] = useState([]);
  const [customCats, setCustomCats] = useState([]);
  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [payeeHistory, setPayeeHistory] = useState([]);

  // Form state — kept generic, only the relevant fields are used per type
  const emptyForm = () => ({
    project_id:"", schedule_id:"",
    contractor_name:"", contractor_specialty:"", subcontractor_id:"", sub_payment_kind:"milestone", milestone_id:"", other_description:"",
    supplier_id:"", bill_id:"",
    recurring_id:"", period_month:"",
    commission_id:"",
    category:GENERAL_CATEGORIES[0], description:"", payee:"", general_project_id:"",
    amount:"", bank_account_id:"", payment_date: todayStr(), notes:"",
  });
  const [form, setForm] = useState(emptyForm());

  useEffect(() => { loadAll(); getBankAccounts().then(setBankAccounts); }, []);

  const loadAll = async () => {
    const [proj, sched, subs, miles, supp, bls, rec, comm, ledgerRecent, catSetting, payeeRows] = await Promise.all([
      supabase.from("projects").select("*").is("deleted_at",null).order("name"),
      supabase.from("schedules").select("*").is("deleted_at",null),
      supabase.from("subcontractors").select("*").is("deleted_at",null).order("name"),
      supabase.from("sub_milestones").select("*").is("deleted_at",null),
      supabase.from("bp_suppliers").select("*").is("deleted_at",null).order("name"),
      supabase.from("bp_bills").select("*").is("deleted_at",null),
      supabase.from("bp_recurring").select("*").is("deleted_at",null).order("name"),
      supabase.from("commissions").select("*").is("deleted_at",null).order("commission_date",{ascending:false}),
      supabase.from("ledger").select("*").is("deleted_at",null).order("created_at",{ascending:false}).limit(8),
      supabase.from("app_settings").select("value").eq("key","ledger_custom_categories").maybeSingle(),
      supabase.from("ledger").select("payee").is("deleted_at",null).not("payee","is",null).order("created_at",{ascending:false}).limit(500),
    ]);
    setProjects(proj.data||[]); setSchedules(sched.data||[]);
    setSubcontractors(subs.data||[]); setMilestones(miles.data||[]);
    setSuppliers(supp.data||[]); setBills(bls.data||[]);
    setRecurring(rec.data||[]);
    setRecentPayments(ledgerRecent.data||[]);
    if (catSetting.data?.value) setCustomCats(catSetting.data.value.split(",").map(s=>s.trim()).filter(Boolean));
    const distinctPayees = [...new Set((payeeRows.data||[]).map(r=>r.payee).filter(p=>p && p.trim()))];
    setPayeeHistory(distinctPayees);
  };

  const allCats = [...GENERAL_CATEGORIES, ...customCats.filter(c=>!GENERAL_CATEGORIES.includes(c))];

  const saveNewCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    if (!allCats.includes(name)) {
      const updated = [...customCats, name];
      setCustomCats(updated);
      await supabase.from("app_settings").upsert(
        { key:"ledger_custom_categories", value: updated.join(","), updated_at: new Date().toISOString() },
        { onConflict:"key" }
      );
    }
    setForm(prev => ({ ...prev, category: name }));
    setNewCat(""); setAddingCat(false);
  };

  const showMsg = (t) => { setMsg(t); setTimeout(()=>setMsg(""), 3500); };

  const resetForm = () => { setForm(emptyForm()); };
  const startType = (t) => { setType(t); setForm(emptyForm()); };

  // ── Derived lists for selected entities ──
  const projectSchedules = schedules.filter(s => s.project_id === form.project_id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const selSchedule = projectSchedules.find(s => s.id === form.schedule_id);

  const subMilestones = milestones.filter(m => m.subcontractor_id === form.subcontractor_id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const selMilestone = subMilestones.find(m => m.id === form.milestone_id);

  const supplierBills = bills.filter(b => b.supplier_id === form.supplier_id && b.status !== "Paid");
  const selBill = supplierBills.find(b => b.id === form.bill_id);

  const selRecurring = recurring.find(r => r.id === form.recurring_id);
  const selProject = projects.find(p => p.id === form.project_id);
  const selSub = subcontractors.find(s => s.id === form.subcontractor_id);
  // Best-effort match: subcontractors.project is free text (usually set from the project
  // dropdown), so this links the ledger entry to the real project when the names match.
  const selSubProjectId = selSub ? projects.find(p => p.name === selSub.project)?.id || null : null;
  const selSupplier = suppliers.find(s => s.id === form.supplier_id);

  // ── Save handlers — one per payment type ──

  const saveProjectPayment = async () => {
    if (!form.schedule_id) return showMsg("❌ Select a milestone");
    if (!form.amount || parseFloat(form.amount)<=0) return showMsg("❌ Enter a valid amount");
    if (!form.bank_account_id) return showMsg("❌ Select a bank account");
    setSaving(true);
    const sched = schedules.find(s=>s.id===form.schedule_id);
    const newReceived = (parseFloat(sched?.received)||0) + parseFloat(form.amount);
    await supabase.from("schedules").update({
      received: newReceived, payment_date: form.payment_date, payment_locked: true, bank_account_id: form.bank_account_id,
    }).eq("id", form.schedule_id);
    await createLedgerEntry({
      bank_account_id: form.bank_account_id, bank_accounts: bankAccounts,
      type: "Credits (Income)", category: "Project Payment",
      description: `Project Payment - ${selProject?.name||""} - ${sched?.label||""}`,
      payee: selProject?.customer||"", amount: form.amount, entry_date: form.payment_date, project_id: form.project_id,
    });
    logActivity("Recorded project payment", `${selProject?.name} — ${sched?.label} — OMR ${form.amount}`, "Payments");
    showMsg("✅ Project payment recorded!"); resetForm(); await loadAll(); setSaving(false);
  };

  const saveSubcontractorPayment = async () => {
    if (!form.subcontractor_id) return showMsg("❌ Select a subcontractor");
    if (!form.amount || parseFloat(form.amount)<=0) return showMsg("❌ Enter a valid amount");
    if (!form.bank_account_id) return showMsg("❌ Select a bank account");
    if (form.sub_payment_kind === "milestone" && !form.milestone_id) return showMsg("❌ Select a milestone");
    if (form.sub_payment_kind === "other" && !form.other_description.trim()) return showMsg("❌ Describe this payment");
    setSaving(true);

    if (form.sub_payment_kind === "milestone") {
      const m = milestones.find(x=>x.id===form.milestone_id);
      const newPaid = (parseFloat(m?.paid_amount)||0) + parseFloat(form.amount);
      await supabase.from("sub_milestones").update({
        paid_amount: newPaid, payment_date: form.payment_date, bank_account_id: form.bank_account_id,
        status: newPaid > 0 ? "Completed" : "Pending",
      }).eq("id", form.milestone_id);
      const newTotal = milestones.filter(x=>x.subcontractor_id===form.subcontractor_id)
        .map(x => x.id===form.milestone_id ? newPaid : parseFloat(x.paid_amount||0)).reduce((s,v)=>s+v,0);
      await supabase.from("subcontractors").update({ paid: newTotal }).eq("id", form.subcontractor_id);
      await createLedgerEntry({
        bank_account_id: form.bank_account_id, bank_accounts: bankAccounts,
        type: "Debits (Payouts)", category: "Subcontractor",
        description: `Subcontractor Payment - ${selSub?.name||""} - ${m?.label||""}`,
        payee: selSub?.name||"", amount: form.amount, entry_date: form.payment_date, project_id: selSubProjectId,
      });
    } else {
      // "Other" — e.g. money paid TO us by the subcontractor for lending workers (or vice versa).
      // Tracked separately in labour_supply_payments so it never touches milestone totals.
      await supabase.from("labour_supply_payments").insert({
        subcontractor: selSub?.name || "", amount: parseFloat(form.amount),
        payment_date: form.payment_date, notes: form.other_description,
      });
      await createLedgerEntry({
        bank_account_id: form.bank_account_id, bank_accounts: bankAccounts,
        type: form.amount_direction === "in" ? "Credits (Income)" : "Debits (Payouts)",
        category: "Subcontractor",
        description: `${selSub?.name||""} — ${form.other_description}`,
        payee: selSub?.name||"", amount: form.amount, entry_date: form.payment_date, project_id: selSubProjectId,
      });
    }
    logActivity("Recorded subcontractor payment", `${selSub?.name} — OMR ${form.amount}`, "Payments");
    showMsg("✅ Subcontractor payment recorded!"); resetForm(); await loadAll(); setSaving(false);
  };

  const saveBillPayment = async () => {
    if (!form.supplier_id) return showMsg("❌ Select a supplier");
    if (!form.amount || parseFloat(form.amount)<=0) return showMsg("❌ Enter a valid amount");
    if (!form.bank_account_id) return showMsg("❌ Select a bank account");
    setSaving(true);
    const { data: bpPayData, error } = await supabase.from("bp_payments").insert({
      bill_id: form.bill_id || null, supplier_id: form.supplier_id, amount: parseFloat(form.amount),
      payment_date: form.payment_date, bank_account_id: form.bank_account_id, notes: form.notes,
    }).select().single();
    if (!error) {
      if (selBill) {
        const paidSoFar = (await supabase.from("bp_payments").select("amount").eq("bill_id", selBill.id).is("deleted_at",null)).data
          ?.reduce((s,p)=>s+parseFloat(p.amount||0),0) || 0;
        const isFullyPaid = paidSoFar >= parseFloat(selBill.total_amount||0) - 0.001;
        await supabase.from("bp_bills").update({ status: isFullyPaid?"Paid":"Partial" }).eq("id", selBill.id);
      }
      await createLedgerEntry({
        bank_account_id: form.bank_account_id, bank_accounts: bankAccounts,
        type: "Debits (Payouts)", category: selSupplier?.category || "Supplier Payment",
        description: `${selSupplier?.name||""} — Payment${form.notes?" ("+form.notes+")":""}`,
        payee: selSupplier?.name||"", amount: form.amount, entry_date: form.payment_date, project_id: form.general_project_id || null,
        ref_voucher: `BILL-${(bpPayData?.id||"").substring(0,8).toUpperCase()}`,
      });
      logActivity("Recorded bill payment", `${selSupplier?.name} — OMR ${form.amount}`, "Payments");
      showMsg("✅ Bill payment recorded!"); resetForm(); await loadAll();
    } else { showMsg("❌ "+error.message); }
    setSaving(false);
  };

  const saveRecurringPayment = async () => {
    if (!form.recurring_id) return showMsg("❌ Select a recurring item");
    if (!form.amount || parseFloat(form.amount)<=0) return showMsg("❌ Enter a valid amount");
    if (!form.bank_account_id) return showMsg("❌ Select a bank account");
    setSaving(true);
    const { error } = await supabase.from("bp_recurring_payments").insert({
      recurring_id: form.recurring_id, amount: parseFloat(form.amount), payment_date: form.payment_date,
      period_month: form.period_month, bank_account_id: form.bank_account_id, notes: form.notes,
    });
    if (!error) {
      await createLedgerEntry({
        bank_account_id: form.bank_account_id, bank_accounts: bankAccounts,
        type: "Debits (Payouts)", category: selRecurring?.category || "Recurring Expense",
        description: `${selRecurring?.name||""}${form.period_month?" — "+form.period_month:""}`,
        payee: selRecurring?.name||"", amount: form.amount, entry_date: form.payment_date,
      });
      logActivity("Recorded recurring payment", `${selRecurring?.name} — OMR ${form.amount}`, "Payments");
      showMsg("✅ Recurring payment recorded!"); resetForm(); await loadAll();
    } else { showMsg("❌ "+error.message); }
    setSaving(false);
  };

  const saveCommissionPayment = async () => {
    if (!form.amount || parseFloat(form.amount)<=0) return showMsg("❌ Enter a valid amount");
    if (!form.bank_account_id) return showMsg("❌ Select a bank account");
    if (!form.payee.trim()) return showMsg("❌ Enter agent name");
    setSaving(true);
    await supabase.from("commissions").insert({
      agent_name: form.payee, project_name: form.description, amount: parseFloat(form.amount),
      commission_date: form.payment_date, type: "Paid", notes: form.notes,
    });
    await createLedgerEntry({
      bank_account_id: form.bank_account_id, bank_accounts: bankAccounts,
      type: "Debits (Payouts)", category: "Commission",
      description: `Commission - ${form.payee}${form.description?" - "+form.description:""}`,
      payee: form.payee, amount: form.amount, entry_date: form.payment_date,
    });
    logActivity("Recorded commission payment", `${form.payee} — OMR ${form.amount}`, "Payments");
    showMsg("✅ Commission payment recorded!"); resetForm(); await loadAll(); setSaving(false);
  };

  const saveGeneralEntry = async () => {
    if (!form.amount || parseFloat(form.amount)<=0) return showMsg("❌ Enter a valid amount");
    if (!form.bank_account_id) return showMsg("❌ Select a bank account");
    if (!form.description.trim()) return showMsg("❌ Enter a description");
    setSaving(true);
    await createLedgerEntry({
      bank_account_id: form.bank_account_id, bank_accounts: bankAccounts,
      type: form.amount_direction === "in" ? "Credits (Income)" : "Debits (Payouts)",
      category: form.category, description: form.description, payee: form.payee,
      amount: form.amount, entry_date: form.payment_date, project_id: form.general_project_id || null,
    });
    logActivity("Recorded general entry", `${form.description} — OMR ${form.amount}`, "Payments");
    showMsg("✅ Entry recorded!"); resetForm(); await loadAll(); setSaving(false);
  };

  const handleSave = () => {
    if (!isAdmin) { setShowLogin(true); return; }
    if (type==="project") return saveProjectPayment();
    if (type==="subcontractor") return saveSubcontractorPayment();
    if (type==="bill") return saveBillPayment();
    if (type==="recurring") return saveRecurringPayment();
    if (type==="commission") return saveCommissionPayment();
    if (type==="general") return saveGeneralEntry();
  };

  const thisMonthLabel = (() => { const d=new Date(); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; })();

  return (
    <div style={{ padding:"24px 28px", maxWidth:1000 }}>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ margin:0, fontSize:22, color:"#0f172a" }}>💵 Record Payment</h2>
        <div style={{ fontSize:13, color:"#64748b" }}>One place for every payment — choose what this payment is for below.</div>
      </div>

      {msg && <div style={{ marginBottom:16, padding:"10px 16px", borderRadius:8, fontSize:13, fontWeight:600,
        background: msg.startsWith("✅") ? "#ecfdf5" : "#fef2f2", color: msg.startsWith("✅") ? "#10b981" : "#ef4444" }}>{msg}</div>}

      {!isAdmin && <div style={{ marginBottom:16, padding:"10px 16px", background:"#fffbeb", borderRadius:8, fontSize:13, color:"#92400e" }}>👁 View only — Login as admin to record payments</div>}

      {/* Step 1: choose payment type */}
      {!type ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:14 }}>
          {TYPES.map(t => (
            <button key={t.id} onClick={()=>startType(t.id)}
              style={{ textAlign:"left", background:t.bg, border:`1px solid ${t.color}33`, borderRadius:14, padding:18, cursor:"pointer" }}>
              <div style={{ fontSize:26, marginBottom:8 }}>{t.icon}</div>
              <div style={{ fontWeight:700, color:t.color, fontSize:14, marginBottom:4 }}>{t.label}</div>
              <div style={{ fontSize:12, color:"#64748b" }}>{t.desc}</div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:24, maxWidth:640 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:20 }}>{TYPES.find(t=>t.id===type)?.icon}</span>
              <span style={{ fontWeight:700, fontSize:16 }}>{TYPES.find(t=>t.id===type)?.label}</span>
            </div>
            <button onClick={()=>{setType(null);resetForm();}} style={{ background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, padding:"6px 12px", fontSize:12, cursor:"pointer" }}>← Change type</button>
          </div>

          {/* ── PROJECT PAYMENT ── */}
          {type==="project" && (<>
            <div style={{ marginBottom:14 }}>
              <div style={label}>Project *</div>
              <select value={form.project_id} onChange={e=>setForm(p=>({...p, project_id:e.target.value, schedule_id:""}))} style={inp}>
                <option value="">— Select project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name} {p.customer?`(${p.customer})`:""}</option>)}
              </select>
            </div>
            {form.project_id && (
              <div style={{ marginBottom:14 }}>
                <div style={label}>Milestone *</div>
                <select value={form.schedule_id} onChange={e=>setForm(p=>({...p, schedule_id:e.target.value}))} style={inp}>
                  <option value="">— Select milestone —</option>
                  {projectSchedules.map(s => {
                    const bal = parseFloat(s.amount||0) - parseFloat(s.received||0);
                    return <option key={s.id} value={s.id}>{s.label} — Balance OMR {bal.toFixed(3)}</option>;
                  })}
                </select>
                {selSchedule && (
                  <div style={{ marginTop:6, fontSize:11, color:"#64748b" }}>
                    Milestone total: OMR {parseFloat(selSchedule.amount||0).toFixed(3)} · Already received: OMR {parseFloat(selSchedule.received||0).toFixed(3)}
                  </div>
                )}
              </div>
            )}
          </>)}

          {/* ── SUBCONTRACTOR PAYMENT ── */}
          {type==="subcontractor" && (() => {
            const contractorNames = [...new Set(subcontractors.map(s=>s.name))].sort();
            const specialtiesFor = form.contractor_name
              ? [...new Set(subcontractors.filter(s=>s.name===form.contractor_name).map(s=>s.specialty).filter(Boolean))]
              : [];
            const sitesFor = (form.contractor_name && form.contractor_specialty)
              ? subcontractors.filter(s=>s.name===form.contractor_name && s.specialty===form.contractor_specialty)
              : [];
            return (<>
              {/* Step 1: Subcontractor Name */}
              <div style={{ marginBottom:14 }}>
                <div style={label}>Subcontractor *</div>
                <select value={form.contractor_name} onChange={e=>setForm(p=>({...p, contractor_name:e.target.value, contractor_specialty:"", subcontractor_id:"", milestone_id:""}))} style={inp}>
                  <option value="">— Select subcontractor —</option>
                  {contractorNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              {/* Step 2: Type of Work */}
              {form.contractor_name && (
                <div style={{ marginBottom:14 }}>
                  <div style={label}>Type of Work *</div>
                  <select value={form.contractor_specialty} onChange={e=>setForm(p=>({...p, contractor_specialty:e.target.value, subcontractor_id:"", milestone_id:""}))} style={inp}>
                    <option value="">— Select work type —</option>
                    {specialtiesFor.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                  </select>
                </div>
              )}

              {/* Step 3: Site / Project (the specific contract) */}
              {form.contractor_name && form.contractor_specialty && (
                <div style={{ marginBottom:14 }}>
                  <div style={label}>Site / Project *</div>
                  <select value={form.subcontractor_id} onChange={e=>setForm(p=>({...p, subcontractor_id:e.target.value, milestone_id:""}))} style={inp}>
                    <option value="">— Select site —</option>
                    {sitesFor.map(s => {
                      const bal = parseFloat(s.contract_amount||0) - parseFloat(s.paid||0);
                      return <option key={s.id} value={s.id}>{s.project || "(no site name)"} — Balance OMR {bal.toFixed(3)}</option>;
                    })}
                  </select>
                </div>
              )}
            </>);
          })()}
          {type==="subcontractor" && (<>
            {form.subcontractor_id && (<>
              <div style={{ marginBottom:14, display:"flex", gap:8 }}>
                {[["milestone","Work Milestone"],["other","Other (e.g. labour rental)"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setForm(p=>({...p, sub_payment_kind:v}))}
                    style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                      background: form.sub_payment_kind===v ? "#8b5cf6" : "#f1f5f9", color: form.sub_payment_kind===v ? "#fff" : "#64748b" }}>{l}</button>
                ))}
              </div>
              {form.sub_payment_kind === "milestone" ? (
                <div style={{ marginBottom:14 }}>
                  <div style={label}>Milestone *</div>
                  <select value={form.milestone_id} onChange={e=>setForm(p=>({...p, milestone_id:e.target.value}))} style={inp}>
                    <option value="">— Select milestone —</option>
                    {subMilestones.map(m => {
                      const bal = parseFloat(m.amount||0) - parseFloat(m.paid_amount||0);
                      return <option key={m.id} value={m.id}>{m.label} — Balance OMR {bal.toFixed(3)}</option>;
                    })}
                  </select>
                  {selMilestone && (
                    <div style={{ marginTop:6, fontSize:11, color:"#64748b" }}>
                      Milestone total: OMR {parseFloat(selMilestone.amount||0).toFixed(3)} · Already paid: OMR {parseFloat(selMilestone.paid_amount||0).toFixed(3)}
                    </div>
                  )}
                </div>
              ) : (<>
                <div style={{ marginBottom:14 }}>
                  <div style={label}>What is this payment for? *</div>
                  <input value={form.other_description} onChange={e=>setForm(p=>({...p, other_description:e.target.value}))}
                    placeholder="e.g. Lent 3 workers for Amerat site, 5 days" style={inp} />
                  <div style={{ fontSize:10, color:"#94a3b8", marginTop:4 }}>This is tracked separately and does not affect milestone amounts.</div>
                </div>
                <div style={{ marginBottom:14, display:"flex", gap:8 }}>
                  {[["out","We are paying them"],["in","They are paying us"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setForm(p=>({...p, amount_direction:v}))}
                      style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                        background: (form.amount_direction||"out")===v ? "#8b5cf6" : "#f1f5f9", color: (form.amount_direction||"out")===v ? "#fff" : "#64748b" }}>{l}</button>
                  ))}
                </div>
              </>)}
            </>)}
          </>)}

          {/* ── BILL PAYMENT ── */}
          {type==="bill" && (<>
            <div style={{ marginBottom:14 }}>
              <div style={label}>Supplier *</div>
              <select value={form.supplier_id} onChange={e=>setForm(p=>({...p, supplier_id:e.target.value, bill_id:""}))} style={inp}>
                <option value="">— Select supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {form.supplier_id && (
              <div style={{ marginBottom:14 }}>
                <div style={label}>Specific Bill (optional — leave blank for general balance payment)</div>
                <select value={form.bill_id} onChange={e=>setForm(p=>({...p, bill_id:e.target.value}))} style={inp}>
                  <option value="">— Against supplier balance —</option>
                  {supplierBills.map(b => <option key={b.id} value={b.id}>{b.bill_number || b.bill_date} — OMR {parseFloat(b.total_amount||0).toFixed(3)}</option>)}
                </select>
              </div>
            )}
            <div style={{ marginBottom:14 }}>
              <div style={label}>Project / Site (optional — for Profit/Loss tracking)</div>
              <select value={form.general_project_id} onChange={e=>setForm(p=>({...p, general_project_id:e.target.value}))} style={inp}>
                <option value="">— Not linked to a project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name} {p.customer?`(${p.customer})`:""}</option>)}
              </select>
            </div>
          </>)}

          {/* ── RECURRING / EMI ── */}
          {type==="recurring" && (<>
            <div style={{ marginBottom:14 }}>
              <div style={label}>Recurring Item *</div>
              <select value={form.recurring_id} onChange={e=>setForm(p=>({...p, recurring_id:e.target.value, amount: recurring.find(r=>r.id===e.target.value)?.amount||"", period_month: thisMonthLabel}))} style={inp}>
                <option value="">— Select —</option>
                {recurring.map(r => <option key={r.id} value={r.id}>{r.name} ({r.category}) — OMR {parseFloat(r.amount||0).toFixed(3)}/{r.frequency}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={label}>Period (month)</div>
              <input value={form.period_month} onChange={e=>setForm(p=>({...p, period_month:e.target.value}))} placeholder={thisMonthLabel} style={inp} />
            </div>
          </>)}

          {/* ── COMMISSION ── */}
          {type==="commission" && (<>
            <div style={{ marginBottom:14 }}>
              <div style={label}>Agent Name *</div>
              <input value={form.payee} onChange={e=>setForm(p=>({...p, payee:e.target.value}))} placeholder="Agent / referrer name" style={inp} />
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={label}>Project / Reference</div>
              <input value={form.description} onChange={e=>setForm(p=>({...p, description:e.target.value}))} placeholder="Which project/deal this commission is for" style={inp} />
            </div>
          </>)}

          {/* ── GENERAL ── */}
          {type==="general" && (<>
            <div style={{ marginBottom:14, display:"flex", gap:8 }}>
              {[["out","Money Out (Expense)"],["in","Money In (Income)"]].map(([v,l])=>(
                <button key={v} onClick={()=>setForm(p=>({...p, amount_direction:v}))}
                  style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
                    background: (form.amount_direction||"out")===v ? "#64748b" : "#f1f5f9", color: (form.amount_direction||"out")===v ? "#fff" : "#64748b" }}>{l}</button>
              ))}
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={label}>Category</div>
              <select value={form.category} onChange={e=>{ if(e.target.value==="__add_new__"){ setAddingCat(true); } else { setForm(p=>({...p, category:e.target.value})); } }} style={inp}>
                {allCats.map(c => <option key={c}>{c}</option>)}
                <option value="__add_new__">➕ Add new category...</option>
              </select>
              {addingCat && (
                <div style={{ display:"flex", gap:6, marginTop:6 }}>
                  <input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="New category name" autoFocus
                    onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); saveNewCategory(); } }}
                    style={{...inp, flex:1}} />
                  <button onClick={saveNewCategory} type="button" style={{ background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"0 14px", fontSize:12, fontWeight:600, cursor:"pointer" }}>Add</button>
                  <button onClick={()=>{setAddingCat(false);setNewCat("");}} type="button" style={{ background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, padding:"0 12px", fontSize:12, cursor:"pointer" }}>✕</button>
                </div>
              )}
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={label}>Project / Site (optional — for Profit/Loss tracking)</div>
              <select value={form.general_project_id} onChange={e=>setForm(p=>({...p, general_project_id:e.target.value}))} style={inp}>
                <option value="">— Not linked to a project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name} {p.customer?`(${p.customer})`:""}</option>)}
              </select>
              <div style={{ fontSize:10, color:"#94a3b8", marginTop:4 }}>Tag this expense to a project so it shows up correctly in the Profit/Loss report.</div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={label}>Description *</div>
              <input value={form.description} onChange={e=>setForm(p=>({...p, description:e.target.value}))} placeholder="What is this entry for?" style={inp} />
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={label}>Payee / Source</div>
              <Autocomplete
                value={form.payee}
                onChange={v=>setForm(p=>({...p, payee:v}))}
                onSelect={v=>setForm(p=>({...p, payee:v}))}
                suggestions={payeeHistory}
                getLabel={p=>p}
                placeholder="Who was paid / who paid us"
                style={inp}
              />
            </div>
          </>)}

          {/* ── COMMON FIELDS: amount, bank account, date ── */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
            <div>
              <div style={label}>Amount (OMR) *</div>
              <input type="number" value={form.amount} onChange={e=>setForm(p=>({...p, amount:e.target.value}))} step="0.001" placeholder="0.000" style={inp} />
            </div>
            <div>
              <div style={label}>Date</div>
              <input type="date" value={form.payment_date} onChange={e=>setForm(p=>({...p, payment_date:e.target.value}))} style={inp} />
            </div>
          </div>
          <div style={{ marginBottom:18 }}>
            <div style={label}>Bank Account *</div>
            <select value={form.bank_account_id} onChange={e=>setForm(p=>({...p, bank_account_id:e.target.value}))} style={inp}>
              <option value="">— Select account —</option>
              {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.account_name}</option>)}
            </select>
          </div>
          {(type==="bill" || type==="recurring") && (
            <div style={{ marginBottom:18 }}>
              <div style={label}>Notes</div>
              <input value={form.notes} onChange={e=>setForm(p=>({...p, notes:e.target.value}))} placeholder="Optional notes" style={inp} />
            </div>
          )}

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={handleSave} disabled={saving}
              style={{ background:"#10b981", color:"#fff", border:"none", borderRadius:8, padding:"10px 22px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              {saving?"Saving...":"💾 Save Payment"}
            </button>
            <button onClick={()=>{setType(null);resetForm();}} style={{ background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, padding:"10px 16px", fontSize:13, cursor:"pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Recent payments — quick visual confirmation */}
      {recentPayments.length > 0 && (
        <div style={{ marginTop:28 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#64748b", marginBottom:10 }}>RECENT ENTRIES</div>
          <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden" }}>
            {recentPayments.map((r,i) => (
              <div key={r.id} style={{ display:"flex", justifyContent:"space-between", padding:"10px 14px", borderTop: i>0?"1px solid #f1f5f9":"none", fontSize:12 }}>
                <div>
                  <div style={{ fontWeight:600, color:"#1e293b" }}>{r.description}</div>
                  <div style={{ color:"#94a3b8", fontSize:11 }}>{r.entry_date} · {r.category}</div>
                </div>
                <div style={{ fontWeight:700, color: r.type==="Credits (Income)" ? "#10b981" : "#ef4444" }}>
                  {r.type==="Credits (Income)"?"+":"-"}{parseFloat(r.amount||0).toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
