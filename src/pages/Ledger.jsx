import React, { useState, useEffect } from "react";
import BankAccountSelect from "../components/BankAccountSelect";
import { getBankAccounts } from "../lib/bankAccounts";
import { supabase, fetchAllRows } from "../lib/supabase";
import { useAdmin } from "../context/AdminContext";

const cats = ["Project Payment","Materials","Payroll","Equipment","Subcontractor","Commission","Transport","Fund Received","Supplier Payment","Miscellaneous"];
const defaultPayModes = ["Cash","Bank Transfer","Cheque","Online","Credit Purchase"];
const emptyForm = () => ({ entry_date: new Date().toISOString().split("T")[0], description: "", payee: "", type: "Debits (Payouts)", category: "Miscellaneous", amount: "", ref_voucher: "", site: "", project_id: "", remarks: "", payment_mode: "Cash", bank_account_id: "" });

// Entry Form Component (separate to avoid re-render focus loss)
function EntryForm({ onSave, onCancel }) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [customCats, setCustomCats] = useState([]);
  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    getBankAccounts().then(setBankAccounts);
    supabase.from("app_settings").select("value").eq("key","ledger_custom_categories").maybeSingle()
      .then(({data}) => { if(data?.value) setCustomCats(data.value.split(",").map(s=>s.trim()).filter(Boolean)); });
    supabase.from("projects").select("id,name,customer").is("deleted_at",null).order("name").then(({data}) => setProjects(data||[]));
  }, []);

  const allCats = [...cats, ...customCats.filter(c=>!cats.includes(c))];

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

  const payModes = [...defaultPayModes, ...bankAccounts.map(a => a.account_name).filter(n => !defaultPayModes.includes(n))];

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  // Auto-set payment_mode when bank account is selected
  const onBankAccountChange = (accId) => {
    const acc = bankAccounts.find(a => a.id === accId);
    setForm(prev => ({
      ...prev,
      bank_account_id: accId,
      payment_mode: acc ? acc.account_name : prev.payment_mode
    }));
  };

  const handleSave = async () => {
    if (!form.description || !form.amount) return;
    setSaving(true);
    await onSave(form);
    setForm(emptyForm());
    setSaving(false);
  };

  const inp = { border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, boxSizing: "border-box", outline: "none", width: "100%" };

  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 22, marginBottom: 16, border: "2px solid #6366f1" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15 }}>Record New Entry</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {[
          ["Date", <input key="d" type="date" value={form.entry_date} onChange={set("entry_date")} style={inp} />],
          ["Ledger Type", <select key="t" value={form.type} onChange={set("type")} style={inp}><option>Credits (Income)</option><option>Debits (Payouts)</option></select>],
          ["Payment Mode", <select key="m" value={form.payment_mode} onChange={set("payment_mode")} style={inp}>{payModes.map(m=><option key={m}>{m}</option>)}</select>],
          ["🏦 Bank Account", <select key="ba" value={form.bank_account_id||""} onChange={e=>onBankAccountChange(e.target.value)} style={{...inp,background:form.bank_account_id?"#f0fdf4":"#fef9c3"}}><option value="">— Select Account —</option>{bankAccounts.map(a=><option key={a.id} value={a.id}>{a.account_name}{a.account_number?` (${a.account_number})`:""}</option>)}</select>],
          ["Description — What was paid for?", <input key="desc" value={form.description} onChange={set("description")} placeholder="e.g. Cement purchase for Mussanah site" style={inp} />],
          ["Payee / Received From", <input key="p" value={form.payee} onChange={set("payee")} placeholder="e.g. SANDEEP or 94132280" style={inp} />],
          ["Amount (OMR)", <input key="a" type="number" value={form.amount} onChange={set("amount")} step="0.001" style={inp} />],
          ["Category", <div key="c">
            <select value={form.category} onChange={e=>{ if(e.target.value==="__add_new__"){ setAddingCat(true); } else { setForm(prev=>({...prev,category:e.target.value})); } }} style={inp}>
              {allCats.map(c=><option key={c}>{c}</option>)}
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
          </div>],
          ["Ref Voucher / Invoice No", <input key="r" value={form.ref_voucher} onChange={set("ref_voucher")} style={inp} />],
          ["Project (for Profit/Loss tracking)", <select key="pid" value={form.project_id} onChange={set("project_id")} style={inp}>
            <option value="">— Not linked to a project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name} {p.customer?`(${p.customer})`:""}</option>)}
          </select>],
          ["Associated Site (free text, optional)", <input key="s" value={form.site} onChange={set("site")} placeholder="e.g. Mussanah 132 sqm" style={inp} />],
        ].map(([label, field]) => (
          <div key={label}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>{label}</div>
            {field}
          </div>
        ))}
        <div style={{ gridColumn: "span 3" }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Remarks / Additional Notes</div>
          <input value={form.remarks} onChange={set("remarks")} placeholder="Any additional information..." style={inp} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={handleSave} disabled={saving} style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          {saving ? "Saving..." : "💾 Save Entry"}
        </button>
        <button onClick={onCancel} style={{ background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, padding: "10px 18px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
      </div>
    </div>
  );
}

export default function Ledger() {
  const { isAdmin: realIsAdmin, canEdit, setShowLogin, confirmAction, logActivity } = useAdmin();
  const isAdmin = canEdit("ledger");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All double entries");
  const [catFilter, setCatFilter] = useState("All Categories");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const payModes = [...defaultPayModes, ...bankAccounts.map(a => a.account_name).filter(n => !defaultPayModes.includes(n))];
  
  
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [editId, setEditId] = useState(null);
  const allCategories = [...cats, ...Array.from(new Set(entries.map(e=>e.category).filter(c=>c && !cats.includes(c))))];
  const [editForm, setEditForm] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => { loadEntries(); getBankAccounts().then(setBankAccounts); }, []);

  const loadEntries = async () => {
    setLoading(true);
    const data = await fetchAllRows((from, to) =>
      supabase.from("ledger").select("*").is("deleted_at",null).order("entry_date", { ascending: false }).order("created_at", { ascending: false }).range(from, to)
    );
    setEntries(data || []); setLoading(false);
  };

  const handleSave = async (form, forceInsert = false) => {
    if (!isAdmin) { setShowLogin(true); return; }

    // Duplicate detection
    if (!forceInsert) {
      const amt = parseFloat(form.amount);
      const duplicate = entries.find(e =>
        e.entry_date === form.entry_date &&
        Math.abs(parseFloat(e.amount) - amt) < 0.001 &&
        e.payee?.toLowerCase().trim() === (form.payee || "").toLowerCase().trim()
      );

      if (duplicate) {
        setDuplicateWarning({ existing: duplicate, newForm: form });
        return;
      }
    }

    await supabase.from("ledger").insert({
      entry_date: form.entry_date, description: form.description, payee: form.payee,
      type: form.type, category: form.category, amount: parseFloat(form.amount),
      ref_voucher: form.ref_voucher, site: form.site, project_id: form.project_id || null, remarks: form.remarks, payment_mode: form.payment_mode,
      bank_account_id: form.bank_account_id || null
    });
    logActivity("Added ledger entry", `${form.description} — OMR ${parseFloat(form.amount||0).toFixed(3)} (${form.type})`, "Cashbook Ledger");
    setShowForm(false); setDuplicateWarning(null);
    await loadEntries();
  };

  const saveEdit = (id) => {
    if (!isAdmin) { setShowLogin(true); return; }
    confirmAction("Save changes to this entry? Admin password required.", async () => {
      await supabase.from("ledger").update({
        entry_date: editForm.entry_date, description: editForm.description, payee: editForm.payee,
        type: editForm.type, category: editForm.category, amount: parseFloat(editForm.amount) || 0,
        ref_voucher: editForm.ref_voucher, site: editForm.site, project_id: editForm.project_id || null, remarks: editForm.remarks, payment_mode: editForm.payment_mode,
        bank_account_id: editForm.bank_account_id || null
      }).eq("id", id);
      logActivity("Edited ledger entry", `${editForm.description} — OMR ${parseFloat(editForm.amount||0).toFixed(3)}`, "Cashbook Ledger");
      setEditId(null); await loadEntries();
    });
  };

  const deleteEntry = (id) => {
    if (!isAdmin) { setShowLogin(true); return; }
    confirmAction("Move this ledger entry to Trash? You can restore it later from the Trash page.", async () => {
      await supabase.from("ledger").update({deleted_at:new Date().toISOString()}).eq("id", id);
      logActivity("Moved ledger entry to Trash", entries.find(e=>e.id===id)?.description||"", "Cashbook Ledger");
      await loadEntries();
    });
  };

  const applyPreset = (p) => {
    const now = new Date();
    if (p === "This Month") { setStartDate(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`); setEndDate(now.toISOString().split("T")[0]); }
    if (p === "Last 30 Days") { const d = new Date(now-30*86400000); setStartDate(d.toISOString().split("T")[0]); setEndDate(now.toISOString().split("T")[0]); }
    if (p === "This Year") { setStartDate(`${now.getFullYear()}-01-01`); setEndDate(now.toISOString().split("T")[0]); }
    if (p === "Reset") { setStartDate(""); setEndDate(""); }
  };

  // Tracking-only account names (e.g. Deepu) — their entries are hidden from cashbook + totals
  const trackingOnlyNames = bankAccounts.filter(a => a.include_in_balance === false).map(a => a.account_name);
  const visibleEntries = entries.filter(e => !trackingOnlyNames.includes(e.payment_mode));

  const filtered = visibleEntries.filter(e =>
    (filter === "All double entries" || e.type === filter) &&
    (catFilter === "All Categories" || e.category === catFilter) &&
    (e.description?.toLowerCase().includes(search.toLowerCase()) ||
     e.payee?.toLowerCase().includes(search.toLowerCase()) ||
     e.ref_voucher?.toLowerCase().includes(search.toLowerCase()) ||
     e.site?.toLowerCase().includes(search.toLowerCase()) ||
     e.remarks?.toLowerCase().includes(search.toLowerCase())) &&
    (!startDate || e.entry_date >= startDate) && (!endDate || e.entry_date <= endDate)
  );

  const totalIncome = visibleEntries.filter(e => e.type === "Credits (Income)").reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const totalExpense = visibleEntries.filter(e => e.type === "Debits (Payouts)").reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const openingBals = bankAccounts.filter(a => a.include_in_balance !== false).reduce((s, a) => s + parseFloat(a.opening_balance || 0), 0);
  const netBalance = openingBals + totalIncome - totalExpense;
  const filtIncome = filtered.filter(e => e.type === "Credits (Income)").reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const filtExpense = filtered.filter(e => e.type === "Debits (Payouts)").reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const isFiltered = !!(search || startDate || endDate || filter !== "All double entries" || catFilter !== "All Categories");

  const iStyle = { width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 8px", fontSize: 12, boxSizing: "border-box", outline: "none" };

  return (
    <div style={{ padding: 24 }}>

      {/* Duplicate Warning Modal */}
      {duplicateWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", textAlign: "center", marginBottom: 8 }}>Possible Duplicate Entry Detected!</div>
            <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 20 }}>
              A similar entry already exists in the ledger:
            </div>
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginBottom: 8 }}>EXISTING ENTRY:</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
                {[
                  ["Date", duplicateWarning.existing.entry_date],
                  ["Amount", `OMR ${parseFloat(duplicateWarning.existing.amount).toFixed(3)}`],
                  ["Payee", duplicateWarning.existing.payee || "—"],
                  ["Description", duplicateWarning.existing.description],
                ].map(([l, v]) => (
                  <div key={l}><span style={{ color: "#64748b", fontWeight: 600 }}>{l}: </span><span style={{ color: "#1e293b" }}>{v}</span></div>
                ))}
              </div>
            </div>
            <div style={{ background: "#ecfdf5", border: "1px solid #86efac", borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, marginBottom: 8 }}>NEW ENTRY YOU ARE SAVING:</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
                {[
                  ["Date", duplicateWarning.newForm.entry_date],
                  ["Amount", `OMR ${parseFloat(duplicateWarning.newForm.amount).toFixed(3)}`],
                  ["Payee", duplicateWarning.newForm.payee || "—"],
                  ["Description", duplicateWarning.newForm.description],
                ].map(([l, v]) => (
                  <div key={l}><span style={{ color: "#64748b", fontWeight: 600 }}>{l}: </span><span style={{ color: "#1e293b" }}>{v}</span></div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDuplicateWarning(null)}
                style={{ flex: 1, background: "#10b981", color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                ✕ Cancel — Don't Save
              </button>
              <button onClick={() => handleSave(duplicateWarning.newForm, true)}
                style={{ flex: 1, background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Save Anyway (Not a Duplicate)
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Omani Cashbook Ledger</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Track all cash flow movements in OMR double-entry format</div>
        </div>
        {isAdmin ? (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setShowForm(!showForm)}
              style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {showForm ? "✕ Cancel" : "+ Record Entry"}
            </button>
          </div>
        ) : (
          <button onClick={() => setShowLogin(true)} style={{ background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🔑 Login to Add</button>
        )}
      </div>

      {/* Entry Form */}
      {showForm && isAdmin && (
        <EntryForm
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Period Selector */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 18, marginBottom: 16, border: "1px solid #e2e8f0" }}>
        <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13, marginBottom: 12 }}>📅 PERIOD SELECTOR</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>START DATE</div>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12 }} /></div>
          <div><div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>END DATE</div>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12 }} /></div>
          {["This Month","Last 30 Days","This Year","Reset"].map(p => (
            <button key={p} onClick={() => applyPreset(p)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: p === "Reset" ? "#0f172a" : "#f1f5f9", color: p === "Reset" ? "#fff" : "#64748b" }}>{p}</button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 16 }}>
        {[
          { label: "TOTAL INCOME (ALL TIME)", value: totalIncome.toFixed(3), color: "#10b981", border: "#10b981" },
          { label: "TOTAL EXPENSES (ALL TIME)", value: totalExpense.toFixed(3), color: "#ef4444", border: "#ef4444" },
          { label: "NET BALANCE (ALL TIME)", value: netBalance.toFixed(3), color: netBalance >= 0 ? "#10b981" : "#ef4444", border: netBalance >= 0 ? "#10b981" : "#ef4444" },
          { label: "TOTAL ENTRIES", value: entries.length, color: "#f59e0b", border: "#f59e0b", unit: "entries" },
        ].map(c => (
          <div key={c.label} style={{ background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #e2e8f0", borderLeft: `4px solid ${c.border}` }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: 0.8, marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: c.color }}>{c.value} <span style={{ fontSize: 11, fontWeight: 400 }}>{c.unit || "OMR"}</span></div>
          </div>
        ))}
      </div>

      {/* Filtered Summary */}
      {isFiltered && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          <div style={{ gridColumn: "span 4", fontSize: 11, color: "#60a5fa", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
            📊 FILTERED RESULTS {startDate && endDate ? `— ${startDate} to ${endDate}` : ""}
          </div>
          {[
            { label: "FILTERED ENTRIES", value: filtered.length, unit: "entries", color: "#f59e0b" },
            { label: "CREDITS IN PERIOD", value: filtIncome.toFixed(3), unit: "OMR", color: "#10b981" },
            { label: "DEBITS IN PERIOD", value: filtExpense.toFixed(3), unit: "OMR", color: "#ef4444" },
            { label: "NET IN PERIOD", value: (filtIncome-filtExpense).toFixed(3), unit: "OMR", color: (filtIncome-filtExpense)>=0?"#60a5fa":"#f87171" },
          ].map(c => (
            <div key={c.label} style={{ background: "#0f172a", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: c.color }}>{c.value} <span style={{ fontSize: 11, fontWeight: 400 }}>{c.unit}</span></div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description, payee, site, remarks..."
            style={{ flex: 1, minWidth: 200, border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12, outline: "none" }} />
          {["All double entries","Credits (Income)","Debits (Payouts)"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: filter===f?"#0f172a":"#f1f5f9", color: filter===f?"#fff":"#64748b" }}>{f}</button>
          ))}
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", fontSize: 12 }}>
            <option>All Categories</option>{allCategories.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>

        {!isAdmin && <div style={{ padding: "8px 16px", background: "#fffbeb", fontSize: 12, color: "#92400e" }}>👁 View only — Login as admin to add, edit, or delete entries</div>}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["DATE","PAYEE","DESCRIPTION","CATEGORY","SITE","MODE","AMOUNT (OMR)", isAdmin?"ACTIONS":""].filter(Boolean).map(h => (
                  <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>⏳ Loading...</td></tr> :
               filtered.length === 0 ? <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontStyle: "italic" }}>No entries found.</td></tr> :
               filtered.map(e => (
                <React.Fragment key={e.id}>
                  <tr style={{ borderTop: "1px solid #f1f5f9", cursor: "pointer", background: expandedId===e.id?"#f8fafc":"#fff" }}
                    onClick={() => editId!==e.id && setExpandedId(expandedId===e.id?null:e.id)}>
                    {editId===e.id ? (
                      <>
                        <td style={{padding:"6px 8px"}}><input type="date" value={editForm.entry_date||""} onChange={ev=>setEditForm(p=>({...p,entry_date:ev.target.value}))} style={iStyle}/></td>
                        <td style={{padding:"6px 8px"}}><input value={editForm.payee||""} onChange={ev=>setEditForm(p=>({...p,payee:ev.target.value}))} style={iStyle}/></td>
                        <td style={{padding:"6px 8px"}}><input value={editForm.description||""} onChange={ev=>setEditForm(p=>({...p,description:ev.target.value}))} style={iStyle}/></td>
                        <td style={{padding:"6px 8px"}}><select value={editForm.category||""} onChange={ev=>setEditForm(p=>({...p,category:ev.target.value}))} style={iStyle}>{allCategories.map(c=><option key={c}>{c}</option>)}</select></td>
                        <td style={{padding:"6px 8px"}}><input value={editForm.site||""} onChange={ev=>setEditForm(p=>({...p,site:ev.target.value}))} style={iStyle}/></td>
                        <td style={{padding:"6px 8px"}}><select value={editForm.payment_mode||"Cash"} onChange={ev=>setEditForm(p=>({...p,payment_mode:ev.target.value}))} style={iStyle}>{payModes.map(m=><option key={m}>{m}</option>)}</select></td>
                        <td style={{padding:"6px 8px"}}><input type="number" value={editForm.amount||""} onChange={ev=>setEditForm(p=>({...p,amount:ev.target.value}))} style={{...iStyle,width:80,color:"#10b981",fontWeight:700}}/></td>
                        <td style={{padding:"6px 8px"}}>
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={ev=>{ev.stopPropagation();saveEdit(e.id);}} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:600}}>💾 Save</button>
                            <button onClick={ev=>{ev.stopPropagation();setEditId(null);}} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:11}}>✕</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{padding:"10px 12px",color:"#64748b",whiteSpace:"nowrap"}}>{e.entry_date}</td>
                        <td style={{padding:"10px 12px",color:"#1e293b",fontWeight:600}}>{e.payee||"—"}</td>
                        <td style={{padding:"10px 12px",color:"#475569",maxWidth:200}}>{e.description}</td>
                        <td style={{padding:"10px 12px"}}><span style={{background:"#f1f5f9",color:"#475569",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:600}}>{e.category}</span></td>
                        <td style={{padding:"10px 12px",color:"#64748b",fontSize:11}}>{e.site||"—"}</td>
                        <td style={{padding:"10px 12px"}}><span style={{background:"#eef2ff",color:"#6366f1",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:600}}>{e.payment_mode||"Cash"}</span></td>
                        <td style={{padding:"10px 12px",fontWeight:700,color:e.type==="Credits (Income)"?"#10b981":"#ef4444",whiteSpace:"nowrap"}}>
                          {e.type==="Credits (Income)"?"+":"-"}{parseFloat(e.amount).toFixed(3)}
                        </td>
                        {isAdmin&&(
                          <td style={{padding:"10px 12px"}}>
                            <div style={{display:"flex",gap:4}}>
                              <button onClick={ev=>{ev.stopPropagation();setEditId(e.id);setEditForm({...e});}} style={{background:"#eef2ff",color:"#6366f1",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11,fontWeight:600}}>Edit</button>
                              <button onClick={ev=>{ev.stopPropagation();deleteEntry(e.id);}} style={{background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:6,padding:"4px 6px",cursor:"pointer",fontSize:11}}>🗑</button>
                            </div>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                  {expandedId===e.id&&editId!==e.id&&(
                    <tr style={{background:"#f8fafc",borderBottom:"1px solid #e2e8f0"}}>
                      <td colSpan={isAdmin?8:7} style={{padding:"10px 16px"}}>
                        <div style={{display:"flex",gap:24,fontSize:12,flexWrap:"wrap"}}>
                          <div><span style={{color:"#64748b",fontWeight:600}}>Ref: </span><span>{e.ref_voucher||"—"}</span></div>
                          <div><span style={{color:"#64748b",fontWeight:600}}>Remarks: </span><span>{e.remarks||"—"}</span></div>
                          <div><span style={{color:"#64748b",fontWeight:600}}>Type: </span><span style={{color:e.type==="Credits (Income)"?"#10b981":"#ef4444",fontWeight:600}}>{e.type}</span></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{borderTop:"2px solid #e2e8f0",background:"#f8fafc"}}>
                  <td colSpan={isAdmin?5:4} style={{padding:"12px 12px",fontWeight:700,color:"#0f172a",fontSize:12}}>
                    {isFiltered?`Showing ${filtered.length} of ${entries.length} entries`:`Total ${entries.length} entries`}
                  </td>
                  <td colSpan={2} style={{padding:"12px 12px",textAlign:"right",fontSize:12}}>
                    <span style={{color:"#10b981",fontWeight:700}}>+{filtIncome.toFixed(3)}</span>
                    <span style={{color:"#94a3b8",margin:"0 8px"}}>/</span>
                    <span style={{color:"#ef4444",fontWeight:700}}>-{filtExpense.toFixed(3)}</span>
                  </td>
                  <td style={{padding:"12px 12px",fontWeight:800,color:(filtIncome-filtExpense)>=0?"#6366f1":"#ef4444",fontSize:13}}>
                    {(filtIncome-filtExpense).toFixed(3)} OMR
                  </td>
                  {isAdmin&&<td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
