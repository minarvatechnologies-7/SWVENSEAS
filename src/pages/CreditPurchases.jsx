import { useState, useEffect } from "react";
import BankAccountSelect from "../components/BankAccountSelect";
import { getBankAccounts, createLedgerEntry } from "../lib/bankAccounts";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../context/AdminContext";

const ENTRY_TYPES = [
  { value: "Materials / Supplies", icon: "🛒", color: "#6366f1", bg: "#eef2ff" },
  { value: "Rent", icon: "🏠", color: "#f59e0b", bg: "#fffbeb" },
  { value: "Equipment Hire", icon: "🚜", color: "#0ea5e9", bg: "#f0f9ff" },
  { value: "Services", icon: "🔧", color: "#8b5cf6", bg: "#f5f3ff" },
  { value: "Other", icon: "📦", color: "#64748b", bg: "#f8fafc" },
];

const MATERIAL_CATS = ["Cement","Sand","Steel","Tiles","Paint","Electrical","Plumbing","Wood","Blocks","Aggregate","Other Materials","Equipment","Labour","Other"];

const emptyForm = () => ({
  purchase_date: new Date().toISOString().split("T")[0],
  supplier_name: "",
  entry_type: "Materials / Supplies",
  material: "",
  site: "",
  total_amount: "",
  notes: "",
});

const statusStyle = {
  "Paid":    { bg: "#ecfdf5", c: "#10b981" },
  "Partial": { bg: "#fffbeb", c: "#f59e0b" },
  "Pending": { bg: "#fef2f2", c: "#ef4444" },
};

export default function CreditPurchases() {
  const { isAdmin, setShowLogin, confirmAction } = useAdmin();
  const [purchases, setPurchases]   = useState([]);
  const [payments, setPayments]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [showPayForm, setShowPayForm] = useState(null);
  const [form, setForm]             = useState(emptyForm());
  const [payForm, setPayForm]       = useState({ amount: "", payment_date: new Date().toISOString().split("T")[0], notes: "", bank_account_id: "" });
  const [saving, setSaving]         = useState(false);
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterType, setFilterType]     = useState("All");
  const [searchText, setSearchText]     = useState("");
  const [msg, setMsg]               = useState("");
  const [bankAccounts, setBankAccounts] = useState([]);
  const [expandedPayments, setExpandedPayments] = useState({});

  useEffect(() => {
    loadAll();
    getBankAccounts().then(setBankAccounts);
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const [p, py] = await Promise.all([
      supabase.from("credit_purchases").select("*").order("purchase_date", { ascending: false }),
      supabase.from("credit_payments").select("*").order("payment_date", { ascending: false }),
    ]);
    setPurchases(p.data || []);
    setPayments(py.data || []);
    setLoading(false);
  };

  const getPaidAmount = (id) => payments.filter(p => p.purchase_id === id).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const getBalance    = (p)  => parseFloat(p.total_amount || 0) - getPaidAmount(p.id);
  const getStatus     = (p)  => {
    const bal = getBalance(p);
    if (bal <= 0) return "Paid";
    if (getPaidAmount(p.id) > 0) return "Partial";
    return "Pending";
  };

  const getTypeInfo = (val) => ENTRY_TYPES.find(t => t.value === val) || ENTRY_TYPES[4];

  const savePurchase = async () => {
    if (!isAdmin) { setShowLogin(true); return; }
    if (!form.supplier_name || !form.total_amount) { setMsg("❌ Supplier name and amount required"); setTimeout(() => setMsg(""), 3000); return; }
    setSaving(true);
    const { error } = await supabase.from("credit_purchases").insert({
      purchase_date: form.purchase_date,
      supplier_name: form.supplier_name,
      entry_type: form.entry_type,
      material: form.material,
      site: form.site,
      total_amount: parseFloat(form.total_amount),
      notes: form.notes,
      status: "Pending",
    });
    if (error) { setMsg("❌ " + error.message); } else { setMsg("✅ Saved!"); setShowForm(false); setForm(emptyForm()); }
    await loadAll(); setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const savePayment = async (purchaseId) => {
    if (!isAdmin) { setShowLogin(true); return; }
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) { setMsg("❌ Enter a valid amount"); setTimeout(() => setMsg(""), 3000); return; }
    if (!payForm.bank_account_id) { setMsg("❌ Please select the account to pay from"); setTimeout(() => setMsg(""), 3000); return; }
    setSaving(true);
    const purchase = purchases.find(p => p.id === purchaseId);
    const paidSoFar = getPaidAmount(purchaseId);
    const newTotal = paidSoFar + parseFloat(payForm.amount);
    const isFullyPaid = newTotal >= parseFloat(purchase.total_amount) - 0.0001;

    const account = bankAccounts.find(a => a.id === payForm.bank_account_id);

    const { error } = await supabase.from("credit_payments").insert({
      purchase_id: purchaseId,
      amount: parseFloat(payForm.amount),
      payment_date: payForm.payment_date,
      payment_source: account?.account_name || "",
      notes: payForm.notes,
      bank_account_id: payForm.bank_account_id || null,
    });

    if (!error) {
      // Auto ledger entry
      const typeIcon = getTypeInfo(purchase?.entry_type).icon;
      await createLedgerEntry({
        bank_account_id: payForm.bank_account_id,
        bank_accounts: bankAccounts,
        type: "Debits (Payouts)",
        category: purchase?.entry_type || "Supplier Payment",
        description: `${typeIcon} ${purchase?.supplier_name || ""} — ${purchase?.material || purchase?.entry_type || ""}`,
        payee: purchase?.supplier_name || "",
        amount: payForm.amount,
        entry_date: payForm.payment_date,
        site: purchase?.site || "",
      });

      await supabase.from("credit_purchases").update({
        status: isFullyPaid ? "Paid" : "Partial"
      }).eq("id", purchaseId);

      setMsg("✅ Payment saved! Ledger updated.");
    } else {
      setMsg("❌ " + error.message);
    }

    setPayForm({ amount: "", payment_date: new Date().toISOString().split("T")[0], notes: "", bank_account_id: "" });
    setShowPayForm(null);
    await loadAll(); setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const deletePurchase = (id) => {
    if (!isAdmin) { setShowLogin(true); return; }
    confirmAction("Delete this entry and all its payments?", async () => {
      await supabase.from("credit_payments").delete().eq("purchase_id", id);
      await supabase.from("credit_purchases").delete().eq("id", id);
      await loadAll();
    });
  };

  const filtered = purchases.filter(p => {
    const statusMatch = filterStatus === "All" || getStatus(p) === filterStatus;
    const typeMatch   = filterType   === "All" || (p.entry_type || "Materials / Supplies") === filterType;
    const searchMatch = !searchText  || p.supplier_name.toLowerCase().includes(searchText.toLowerCase()) || (p.material||"").toLowerCase().includes(searchText.toLowerCase()) || (p.site||"").toLowerCase().includes(searchText.toLowerCase());
    return statusMatch && typeMatch && searchMatch;
  });

  // KPIs
  const totalAll     = purchases.reduce((s, p) => s + parseFloat(p.total_amount || 0), 0);
  const totalPaid    = purchases.reduce((s, p) => s + getPaidAmount(p.id), 0);
  const totalPending = totalAll - totalPaid;

  // KPI by type
  const kpiByType = ENTRY_TYPES.map(t => ({
    ...t,
    balance: purchases.filter(p => (p.entry_type || "Materials / Supplies") === t.value)
                      .reduce((s, p) => s + getBalance(p), 0)
  })).filter(t => t.balance > 0);

  const inp = { border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none", background: "#fff" };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>💳 Payables & Credits</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Track credit purchases, rent, equipment hire — partial or full payments with auto ledger</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {msg && <span style={{ fontSize: 13, fontWeight: 600, color: msg.startsWith("✅") ? "#10b981" : "#ef4444", padding: "6px 12px", background: msg.startsWith("✅") ? "#ecfdf5" : "#fef2f2", borderRadius: 8 }}>{msg}</span>}
          {isAdmin
            ? <button onClick={() => setShowForm(!showForm)} style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add Entry</button>
            : <button onClick={() => setShowLogin(true)} style={{ background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🔑 Login to Add</button>
          }
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
        {[
          ["TOTAL CREDIT", `OMR ${totalAll.toFixed(3)}`, "#6366f1", "#eef2ff"],
          ["TOTAL PAID",   `OMR ${totalPaid.toFixed(3)}`,    "#10b981", "#ecfdf5"],
          ["BALANCE DUE",  `OMR ${totalPending.toFixed(3)}`, "#ef4444", "#fef2f2"],
        ].map(([l, v, c, bg]) => (
          <div key={l} style={{ background: bg, borderRadius: 12, padding: "14px 18px", border: `1px solid ${c}30` }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: 0.8, marginBottom: 6 }}>{l}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c }}>{v}</div>
          </div>
        ))}
        {/* Category breakdown */}
        {kpiByType.map(t => (
          <div key={t.value} style={{ background: t.bg, borderRadius: 12, padding: "14px 18px", border: `1px solid ${t.color}30` }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: 0.8, marginBottom: 6 }}>{t.icon} {t.value.toUpperCase()}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.color }}>OMR {t.balance.toFixed(3)}</div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>due</div>
          </div>
        ))}
      </div>

      {/* Add Form */}
      {showForm && isAdmin && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 22, marginBottom: 16, border: "2px solid #6366f1", boxShadow: "0 4px 20px #6366f110" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 16 }}>➕ New Payable Entry</div>

          {/* Type selector */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, fontWeight: 600 }}>ENTRY TYPE</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ENTRY_TYPES.map(t => (
                <button key={t.value} onClick={() => setForm(p => ({ ...p, entry_type: t.value }))}
                  style={{ padding: "7px 14px", borderRadius: 20, border: `2px solid ${form.entry_type === t.value ? t.color : "#e2e8f0"}`, background: form.entry_type === t.value ? t.bg : "#fff", color: form.entry_type === t.value ? t.color : "#64748b", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                  {t.icon} {t.value}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Date</div>
              <input type="date" value={form.purchase_date} onChange={e => setForm(p => ({ ...p, purchase_date: e.target.value }))} style={inp} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>
                {form.entry_type === "Rent" ? "Landlord / Owner" : form.entry_type === "Equipment Hire" ? "Equipment Owner" : "Supplier / Party Name"} *
              </div>
              <input value={form.supplier_name} onChange={e => setForm(p => ({ ...p, supplier_name: e.target.value }))} style={inp} placeholder="Name..." />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Site / Project</div>
              <input value={form.site} onChange={e => setForm(p => ({ ...p, site: e.target.value }))} style={inp} placeholder="Site name..." />
            </div>
            {form.entry_type === "Materials / Supplies" && (
              <div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Material</div>
                <select value={form.material} onChange={e => setForm(p => ({ ...p, material: e.target.value }))} style={inp}>
                  <option value="">Select...</option>
                  {MATERIAL_CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            )}
            {form.entry_type === "Rent" && (
              <div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Rent Type</div>
                <select value={form.material} onChange={e => setForm(p => ({ ...p, material: e.target.value }))} style={inp}>
                  <option value="">Select...</option>
                  <option>Office Rent</option>
                  <option>Store Room Rent</option>
                  <option>Labour Camp Rent</option>
                  <option>Site Office Rent</option>
                  <option>Other Rent</option>
                </select>
              </div>
            )}
            {form.entry_type === "Equipment Hire" && (
              <div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Equipment</div>
                <select value={form.material} onChange={e => setForm(p => ({ ...p, material: e.target.value }))} style={inp}>
                  <option value="">Select...</option>
                  <option>Excavator</option>
                  <option>Crane</option>
                  <option>Compactor</option>
                  <option>Generator</option>
                  <option>Mixer</option>
                  <option>Truck / Lorry</option>
                  <option>Scaffolding</option>
                  <option>Other Equipment</option>
                </select>
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Total Amount (OMR) *</div>
              <input type="number" value={form.total_amount} onChange={e => setForm(p => ({ ...p, total_amount: e.target.value }))} step="0.001" style={inp} placeholder="0.000" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>Notes / Description</div>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={inp} placeholder="Optional..." />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button onClick={savePurchase} disabled={saving} style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{saving ? "Saving..." : "💾 Save Entry"}</button>
            <button onClick={() => { setShowForm(false); setForm(emptyForm()); }} style={{ background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, padding: "10px 18px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="🔍 Search party, material, site..."
          style={{ ...inp, width: 240, flex: "0 0 240px" }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["All","Pending","Partial","Paid"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: filterStatus === s ? "#6366f1" : "#f1f5f9", color: filterStatus === s ? "#fff" : "#64748b" }}>{s}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setFilterType("All")} style={{ padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: filterType === "All" ? "#0f172a" : "#f1f5f9", color: filterType === "All" ? "#fff" : "#64748b" }}>All Types</button>
          {ENTRY_TYPES.map(t => (
            <button key={t.value} onClick={() => setFilterType(t.value)} style={{ padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: filterType === t.value ? t.color : "#f1f5f9", color: filterType === t.value ? "#fff" : "#64748b" }}>{t.icon} {t.value}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Date","Type","Party / Supplier","Details","Site","Total (OMR)","Paid (OMR)","Balance (OMR)","Status","Actions"].map(h =>
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>⏳ Loading...</td></tr>
              : filtered.length === 0
              ? <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>No entries found. Add your first entry above.</td></tr>
              : filtered.map((p, i) => {
                  const paid    = getPaidAmount(p.id);
                  const bal     = getBalance(p);
                  const status  = getStatus(p);
                  const st      = statusStyle[status];
                  const ti      = getTypeInfo(p.entry_type);
                  const pyList  = payments.filter(py => py.purchase_id === p.id);
                  const showPy  = expandedPayments[p.id];
                  return (
                    <>
                      <tr key={p.id} style={{ borderTop: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                        <td style={{ padding: "11px 14px", color: "#64748b", whiteSpace: "nowrap" }}>{p.purchase_date}</td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{ background: ti.bg, color: ti.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{ti.icon} {p.entry_type || "Materials / Supplies"}</span>
                        </td>
                        <td style={{ padding: "11px 14px", fontWeight: 700, color: "#1e293b" }}>{p.supplier_name}</td>
                        <td style={{ padding: "11px 14px", color: "#475569", fontSize: 12 }}>{p.material || "—"}</td>
                        <td style={{ padding: "11px 14px", color: "#64748b", fontSize: 12 }}>{p.site || "—"}</td>
                        <td style={{ padding: "11px 14px", fontWeight: 700, color: "#6366f1" }}>{parseFloat(p.total_amount).toFixed(3)}</td>
                        <td style={{ padding: "11px 14px", color: "#10b981", fontWeight: 600 }}>
                          {paid.toFixed(3)}
                          {pyList.length > 0 && (
                            <button onClick={() => setExpandedPayments(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                              style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "#94a3b8" }}>
                              {showPy ? "▲" : `▼ ${pyList.length}`}
                            </button>
                          )}
                        </td>
                        <td style={{ padding: "11px 14px", fontWeight: 700, color: bal > 0.001 ? "#ef4444" : "#10b981" }}>{bal.toFixed(3)}</td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{ background: st.bg, color: st.c, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{status}</span>
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <div style={{ display: "flex", gap: 4 }}>
                            {isAdmin && status !== "Paid" && (
                              <button onClick={() => { setShowPayForm(showPayForm === p.id ? null : p.id); setPayForm({ amount: bal.toFixed(3), payment_date: new Date().toISOString().split("T")[0], notes: "", bank_account_id: "" }); }}
                                style={{ background: "#ecfdf5", color: "#10b981", border: "1px solid #86efac", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                                💳 Pay
                              </button>
                            )}
                            {isAdmin && (
                              <button onClick={() => deletePurchase(p.id)}
                                style={{ background: "#fef2f2", color: "#ef4444", border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: 12 }}>🗑</button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Payment history expanded */}
                      {showPy && pyList.length > 0 && (
                        <tr key={`hist-${p.id}`}>
                          <td colSpan={10} style={{ padding: "0 14px 10px 14px", background: "#f8fafc" }}>
                            <div style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff" }}>
                              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 8 }}>PAYMENT HISTORY</div>
                              {pyList.map(py => {
                                const acc = bankAccounts.find(a => a.id === py.bank_account_id);
                                return (
                                  <div key={py.id} style={{ display: "flex", gap: 14, fontSize: 12, color: "#475569", marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid #f1f5f9", alignItems: "center", flexWrap: "wrap" }}>
                                    <span style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>{py.payment_date}</span>
                                    <span style={{ fontWeight: 700, color: "#10b981", whiteSpace: "nowrap" }}>OMR {parseFloat(py.amount).toFixed(3)}</span>
                                    {acc && <span style={{ background: "#ecfdf5", color: "#10b981", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>🏦 {acc.account_name}</span>}
                                    {py.notes && <span style={{ color: "#94a3b8" }}>{py.notes}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Pay form */}
                      {showPayForm === p.id && isAdmin && (
                        <tr key={`pay-${p.id}`}>
                          <td colSpan={10} style={{ padding: "0 14px 14px" }}>
                            <div style={{ background: "#f0fdf4", borderRadius: 10, padding: 16, border: "1px solid #86efac" }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 12 }}>
                                💳 Record Payment — <span style={{ color: "#6366f1" }}>{p.supplier_name}</span>
                                <span style={{ marginLeft: 12, fontWeight: 400, fontSize: 12, color: "#64748b" }}>Balance: <span style={{ color: "#ef4444", fontWeight: 700 }}>OMR {bal.toFixed(3)}</span></span>
                              </div>
                              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                                <div>
                                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 }}>AMOUNT (OMR)</div>
                                  <input type="number" value={payForm.amount}
                                    onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                                    step="0.001"
                                    style={{ width: 140, border: "2px solid #10b981", borderRadius: 8, padding: "9px 12px", fontSize: 15, fontWeight: 700, outline: "none", color: "#10b981", background: "#fff" }} />
                                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                    <button onClick={() => setPayForm(p => ({ ...p, amount: bal.toFixed(3) }))}
                                      style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, border: "1px solid #10b981", background: "#ecfdf5", color: "#10b981", cursor: "pointer", fontWeight: 600 }}>
                                      Full ({bal.toFixed(3)})
                                    </button>
                                  </div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 }}>PAYMENT DATE</div>
                                  <input type="date" value={payForm.payment_date}
                                    onChange={e => setPayForm(p => ({ ...p, payment_date: e.target.value }))}
                                    style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", background: "#fff" }} />
                                </div>
                                <div style={{ minWidth: 200 }}>
                                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 }}>PAY FROM ACCOUNT *</div>
                                  <BankAccountSelect
                                    value={payForm.bank_account_id}
                                    onChange={v => setPayForm(p => ({ ...p, bank_account_id: v }))}
                                    bankAccounts={bankAccounts}
                                  />
                                </div>
                                <div style={{ flex: 1, minWidth: 160 }}>
                                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 }}>NOTES (OPTIONAL)</div>
                                  <input value={payForm.notes}
                                    onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))}
                                    style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" }}
                                    placeholder="e.g. Partial payment, cheque no..." />
                                </div>
                                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                                  <button onClick={() => savePayment(p.id)} disabled={saving}
                                    style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
                                    {saving ? "Saving..." : "💾 Save Payment"}
                                  </button>
                                  <button onClick={() => setShowPayForm(null)}
                                    style={{ background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, padding: "10px 14px", cursor: "pointer", fontSize: 13 }}>✕</button>
                                </div>
                              </div>
                              {/* Account warning */}
                              {payForm.bank_account_id && (() => {
                                const selectedAcc = bankAccounts.find(a => a.id === payForm.bank_account_id);
                                return selectedAcc ? (
                                  <div style={{ marginTop: 10, fontSize: 12, color: "#6366f1", background: "#eef2ff", borderRadius: 8, padding: "6px 12px" }}>
                                    ℹ️ Payment will be deducted from <strong>{selectedAcc.account_name}</strong> and auto-recorded in Ledger
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
            }
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc" }}>
                <td colSpan={5} style={{ padding: "10px 14px", fontWeight: 700, color: "#0f172a" }}>TOTAL ({filtered.length} entries)</td>
                <td style={{ padding: "10px 14px", fontWeight: 800, color: "#6366f1" }}>{filtered.reduce((s,p) => s + parseFloat(p.total_amount||0), 0).toFixed(3)}</td>
                <td style={{ padding: "10px 14px", fontWeight: 800, color: "#10b981" }}>{filtered.reduce((s,p) => s + getPaidAmount(p.id), 0).toFixed(3)}</td>
                <td style={{ padding: "10px 14px", fontWeight: 800, color: "#ef4444" }}>{filtered.reduce((s,p) => s + getBalance(p), 0).toFixed(3)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
