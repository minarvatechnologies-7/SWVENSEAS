import React, { useState, useEffect, useCallback } from "react";
import { supabase, fetchAllRows } from "../lib/supabase";
import { getBankAccounts, getAccountBalance, getAccountsWithBalances } from "../lib/bankAccounts";
import { useAdmin } from "../context/AdminContext";

const emptyAccForm = () => ({ account_name:"", account_number:"", opening_balance:"0", is_active:true, include_in_balance:true });
const emptyTransfer = () => ({ from_account:"", to_account:"", amount:"", transfer_date: new Date().toISOString().split("T")[0], notes:"" });

export default function Banking() {
  const { isAdmin: realIsAdmin, canEdit, setShowLogin, confirmAction, logActivity } = useAdmin();
  const isAdmin = canEdit("banking");
  const [tab, setTab] = useState("accounts");
  const [accounts, setAccounts] = useState([]);
  const [balances, setBalances] = useState({});
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Forms
  const [showAccForm, setShowAccForm] = useState(false);
  const [accForm, setAccForm] = useState(emptyAccForm());
  const [editingAcc, setEditingAcc] = useState(null);

  const [showTransfer, setShowTransfer] = useState(false);
  const [transfer, setTransfer] = useState(emptyTransfer());

  // Filters
  const [selectedAcc, setSelectedAcc] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const showMsg = (m) => { setMsg(m); setTimeout(()=>setMsg(""),4000); };

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ accounts: accs, balances: bals }, ledgerData] = await Promise.all([
      getAccountsWithBalances(),
      fetchAllRows((from, to) =>
        supabase.from("ledger").select("*").is("deleted_at",null).order("entry_date",{ascending:false}).order("created_at",{ascending:false}).range(from, to)
      ),
    ]);
    setAccounts(accs);
    setBalances(bals);
    setLedger(ledgerData||[]);
    setLoading(false);
  }, []);

  useEffect(()=>{ loadAll(); },[loadAll]);

  // ── Save Account ──
  const saveAccount = async () => {
    if (!isAdmin) { setShowLogin(true); return; }
    if (!accForm.account_name.trim()) { showMsg("❌ Account name required"); return; }
    setSaving(true);
    const row = {
      account_name: accForm.account_name.trim(),
      account_number: accForm.account_number.trim(),
      opening_balance: parseFloat(accForm.opening_balance)||0,
      is_active: accForm.is_active,
      include_in_balance: accForm.include_in_balance,
    };
    let error;
    if (editingAcc) {
      ({ error } = await supabase.from("bank_accounts").update(row).eq("id", editingAcc));
    } else {
      ({ error } = await supabase.from("bank_accounts").insert(row));
    }
    if (error) showMsg("❌ "+error.message);
    else {
      logActivity(editingAcc?"Edited bank account":"Added bank account", `${row.account_name} — Opening OMR ${row.opening_balance.toFixed(3)}`, "Banking");
      showMsg("✅ Account saved!"); setShowAccForm(false); setAccForm(emptyAccForm()); setEditingAcc(null);
    }
    await loadAll(); setSaving(false);
  };

  const deleteAccount = (id, name) => {
    if (!isAdmin) { setShowLogin(true); return; }
    confirmAction(`Move account "${name}" to Trash? This will NOT affect ledger entries.`, async () => {
      await supabase.from("bank_accounts").update({deleted_at:new Date().toISOString()}).eq("id", id);
      logActivity("Moved bank account to Trash", name, "Banking");
      await loadAll();
    });
  };

  // ── Transfer ──
  const saveTransfer = async () => {
    if (!isAdmin) { setShowLogin(true); return; }
    if (!transfer.from_account || !transfer.to_account) { showMsg("❌ Select both accounts"); return; }
    if (transfer.from_account === transfer.to_account) { showMsg("❌ Cannot transfer to same account"); return; }
    if (!transfer.amount || parseFloat(transfer.amount)<=0) { showMsg("❌ Enter valid amount"); return; }
    setSaving(true);

    const fromAcc = accounts.find(a=>a.id===transfer.from_account);
    const toAcc   = accounts.find(a=>a.id===transfer.to_account);
    if (!fromAcc || !toAcc) { showMsg("❌ Account not found"); setSaving(false); return; }
    const amt     = parseFloat(transfer.amount);
    const transferRef = "TRF-" + Date.now();
    const realId = (id) => (typeof id === "string" && id.startsWith("account-")) ? null : id;
    if (transfer.editIds && transfer.editIds.length) {
      const now = new Date().toISOString();
      for (const id of transfer.editIds) await supabase.from("ledger").update({deleted_at: now}).eq("id", id);
    }
    // Always write BOTH legs with matching amount, payment_mode = account name,
    // and bank_account_id = real UUID (null for fallback ids). Same ref_voucher.
    const { error: e1 } = await supabase.from("ledger").insert({
      entry_date: transfer.transfer_date,
      description: `Transfer to ${toAcc.account_name}`,
      payee: toAcc.account_name,
      type: "Debits (Payouts)",
      category: "Account Transfer",
      amount: amt,
      payment_mode: fromAcc.account_name,
      bank_account_id: realId(transfer.from_account),
      ref_voucher: transferRef,
      remarks: transfer.notes || "",
    });
    if (e1) { showMsg("❌ Transfer debit failed: " + e1.message); setSaving(false); return; }
    const { error: e2 } = await supabase.from("ledger").insert({
      entry_date: transfer.transfer_date,
      description: `Transfer from ${fromAcc.account_name}`,
      payee: fromAcc.account_name,
      type: "Credits (Income)",
      category: "Account Transfer",
      amount: amt,
      payment_mode: toAcc.account_name,
      bank_account_id: realId(transfer.to_account),
      ref_voucher: transferRef,
      remarks: transfer.notes || "",
    });
    if (e2) {
      // Roll back debit leg so we never leave an unpaired transfer
      await supabase.from("ledger").update({ deleted_at: new Date().toISOString() }).eq("ref_voucher", transferRef);
      showMsg("❌ Transfer credit failed: " + e2.message);
      setSaving(false);
      return;
    }
    logActivity(transfer.editIds?"Edited transfer":"Added transfer", `OMR ${amt.toFixed(3)}: ${fromAcc?.account_name} → ${toAcc?.account_name}`, "Banking");
    showMsg(`✅ OMR ${amt.toFixed(3)} transferred`);
    setShowTransfer(false); setTransfer(emptyTransfer());
    await loadAll(); setSaving(false);
  };

  const findCreditLeg = (d) => { const c = ledger.filter(l => l.id!==d.id && l.category==="Account Transfer" && l.type==="Credits (Income)" && l.entry_date===d.entry_date && Math.abs(parseFloat(l.amount||0)-parseFloat(d.amount||0))<0.001); return c.find(l=>l.payment_mode===d.payee)||c[0]||null; };
  const editTransfer = (entry) => { if(!isAdmin){setShowLogin(true);return;} const d=entry.type==="Debits (Payouts)"?entry:ledger.find(l=>l.category==="Account Transfer"&&l.type==="Debits (Payouts)"&&l.entry_date===entry.entry_date&&Math.abs(parseFloat(l.amount||0)-parseFloat(entry.amount||0))<0.001)||entry; const fa=accounts.find(a=>a.id===d.bank_account_id)||accounts.find(a=>a.account_name===d.payment_mode); const ta=accounts.find(a=>a.account_name===d.payee); const cr=findCreditLeg(d); const ids=[d.id];if(cr)ids.push(cr.id); setTransfer({from_account:fa?.id||"",to_account:ta?.id||"",amount:String(d.amount),transfer_date:d.entry_date,notes:d.remarks||"",editIds:ids}); setShowTransfer(true);setTab("transfer"); };
  const deleteTransfer = (entry) => { if(!isAdmin){setShowLogin(true);return;} const d=entry.type==="Debits (Payouts)"?entry:ledger.find(l=>l.category==="Account Transfer"&&l.type==="Debits (Payouts)"&&l.entry_date===entry.entry_date&&Math.abs(parseFloat(l.amount||0)-parseFloat(entry.amount||0))<0.001)||entry; const cr=findCreditLeg(d); confirmAction("Move this transfer to Trash?",async()=>{const now=new Date().toISOString();await supabase.from("ledger").update({deleted_at:now}).eq("id",d.id);if(cr)await supabase.from("ledger").update({deleted_at:now}).eq("id",cr.id);logActivity("Moved transfer to Trash","OMR "+parseFloat(entry.amount||0).toFixed(3),"Banking");showMsg("✅ Moved to Trash");await loadAll();}); };

  // ── Filtered transactions ──
  const filteredLedger = ledger.filter(e => {
    const accMatch = !selectedAcc || e.payment_mode === accounts.find(a=>a.id===selectedAcc)?.account_name || e.bank_account_id === selectedAcc;
    const dateStart = !startDate || e.entry_date >= startDate;
    const dateEnd   = !endDate   || e.entry_date <= endDate;
    return accMatch && dateStart && dateEnd;
  });

  const totalNet = accounts.filter(a=>a.include_in_balance!==false).reduce((s,a)=>s+(balances[a.id]||0),0);
  const inp = { border:"1px solid #e2e8f0", borderRadius:8, padding:"9px 12px", fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", background:"#fff" };
  const tabBtn = (id, label) => (
    <button onClick={()=>setTab(id)} style={{ padding:"10px 20px", borderRadius:"10px 10px 0 0", border:"none", cursor:"pointer", fontSize:13, fontWeight:700,
      background: tab===id ? "#fff" : "transparent", color: tab===id ? "#6366f1" : "#64748b",
      borderBottom: tab===id ? "2px solid #6366f1" : "2px solid transparent"
    }}>{label}</button>
  );

  return (
    <div style={{padding:24, maxWidth:1300, margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:12}}>
        <div>
          <div style={{fontSize:22, fontWeight:800, color:"#0f172a", marginBottom:4}}>🏦 Banking</div>
          <div style={{fontSize:13, color:"#64748b"}}>Manage accounts, inter-account transfers, view account-wise transactions</div>
        </div>
        <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
          {msg && <span style={{fontSize:13, fontWeight:600, color:msg.startsWith("✅")?"#10b981":"#ef4444", padding:"6px 12px", background:msg.startsWith("✅")?"#ecfdf5":"#fef2f2", borderRadius:8}}>{msg}</span>}
        </div>
      </div>

      {/* Net Balance */}
      <div style={{display:"grid", gridTemplateColumns:`repeat(${accounts.length+1},1fr)`, gap:12, marginBottom:20}}>
        {accounts.map(a=>{
          const trackingOnly = a.include_in_balance === false;
          return (
          <div key={a.id} style={{background:"#fff", borderRadius:12, padding:"14px 18px", border:"1px solid #e2e8f0", borderTop:`3px solid ${trackingOnly?"#94a3b8":"#6366f1"}`}}>
            <div style={{fontSize:10, color:"#64748b", fontWeight:600, letterSpacing:0.8, marginBottom:6}}>🏦 {a.account_name.toUpperCase()}</div>
            <div style={{fontSize:20, fontWeight:800, color:(balances[a.id]||0)>=0?(trackingOnly?"#64748b":"#10b981"):"#ef4444"}}>OMR {(balances[a.id]||0).toFixed(3)}</div>
            {trackingOnly && <div style={{fontSize:9, color:"#94a3b8", marginTop:2, fontWeight:600}}>📋 Tracking only</div>}
            {a.account_number && <div style={{fontSize:10, color:"#94a3b8", marginTop:2}}>{a.account_number}</div>}
          </div>
          );
        })}
        <div style={{background:"#0f172a", borderRadius:12, padding:"14px 18px", color:"#fff"}}>
          <div style={{fontSize:10, color:"#94a3b8", fontWeight:600, letterSpacing:0.8, marginBottom:6}}>NET TOTAL</div>
          <div style={{fontSize:20, fontWeight:800, color:"#60a5fa"}}>OMR {totalNet.toFixed(3)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{borderBottom:"1px solid #e2e8f0", marginBottom:0, display:"flex", gap:4}}>
        {tabBtn("accounts","🏦 Accounts")}
        {tabBtn("transfer","🔄 Transfer")}
        {tabBtn("transactions","📑 Transactions")}
      </div>

      <div style={{background:"#fff", borderRadius:"0 12px 12px 12px", border:"1px solid #e2e8f0", borderTop:"none", padding:20}}>

        {/* ══════ ACCOUNTS TAB ══════ */}
        {tab==="accounts" && (
          <div>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
              <div style={{fontSize:14, fontWeight:700, color:"#0f172a"}}>Bank Accounts ({accounts.length})</div>
              {isAdmin && (
                <button onClick={()=>{setShowAccForm(true);setAccForm(emptyAccForm());setEditingAcc(null);}}
                  style={{background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:600, cursor:"pointer"}}>
                  + Add Account
                </button>
              )}
            </div>

            {showAccForm && isAdmin && (
              <div style={{background:"#f8fafc", borderRadius:12, padding:20, marginBottom:16, border:"2px solid #6366f1"}}>
                <div style={{fontWeight:700, fontSize:14, color:"#0f172a", marginBottom:14}}>
                  {editingAcc ? "✏️ Edit Account" : "➕ New Bank Account"}
                </div>
                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12}}>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500}}>Account Name *</div>
                    <input value={accForm.account_name} onChange={e=>setAccForm(p=>({...p,account_name:e.target.value}))} style={inp} placeholder="e.g. Petty Cash" />
                  </div>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500}}>Account Number</div>
                    <input value={accForm.account_number} onChange={e=>setAccForm(p=>({...p,account_number:e.target.value}))} style={inp} placeholder="Optional..." />
                  </div>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500}}>Opening Balance (OMR)</div>
                    <input type="number" value={accForm.opening_balance} onChange={e=>setAccForm(p=>({...p,opening_balance:e.target.value}))} step="0.001" style={inp} />
                  </div>
                </div>
                {/* Include in Net Cash toggle */}
                <div style={{marginTop:14, padding:"12px 16px", borderRadius:10, background: accForm.include_in_balance?"#ecfdf5":"#fffbeb", border:`1px solid ${accForm.include_in_balance?"#86efac":"#fcd34d"}`}}>
                  <label style={{display:"flex", alignItems:"center", gap:10, cursor:"pointer"}}>
                    <input type="checkbox" checked={accForm.include_in_balance} onChange={e=>setAccForm(p=>({...p,include_in_balance:e.target.checked}))} style={{width:18, height:18, cursor:"pointer", accentColor:"#10b981"}} />
                    <div>
                      <div style={{fontSize:13, fontWeight:700, color:"#0f172a"}}>Include in company Net Cash balance?</div>
                      <div style={{fontSize:11, color:"#64748b", marginTop:2}}>
                        {accForm.include_in_balance
                          ? "✅ ON — This account's credits/debits affect company Net Cash (use for Company, Sandeep accounts)"
                          : "⚠️ OFF — Tracking only. Transfers visible but does NOT affect Net Cash (use for personal accounts like Deepu)"}
                      </div>
                    </div>
                  </label>
                </div>
                <div style={{display:"flex", gap:10, marginTop:14}}>
                  <button onClick={saveAccount} disabled={saving} style={{background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontSize:13, fontWeight:600}}>{saving?"Saving...":"💾 Save"}</button>
                  <button onClick={()=>{setShowAccForm(false);setEditingAcc(null);}} style={{background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontSize:13}}>Cancel</button>
                </div>
                <div style={{marginTop:10, fontSize:12, color:"#f59e0b", background:"#fffbeb", borderRadius:8, padding:"6px 12px"}}>
                  ℹ️ New accounts will appear in all payment selectors across the app (Bills, Payroll, Ledger, Projects etc.)
                </div>
              </div>
            )}

            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:13}}>
                <thead><tr style={{background:"#f8fafc"}}>
                  {["Account Name","Account No","Opening Balance","Current Balance","Transactions","Status",""].map(h=>(
                    <th key={h} style={{padding:"10px 14px", textAlign:"left", color:"#64748b", fontWeight:600, fontSize:11, borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {accounts.map((a,i)=>{
                    const txnCount = ledger.filter(e=>e.payment_mode===a.account_name || e.bank_account_id===a.id).length;
                    return (
                      <tr key={a.id} style={{borderTop:"1px solid #f1f5f9", background:i%2===0?"#fff":"#fafbfc"}}>
                        <td style={{padding:"11px 14px", fontWeight:700, color:"#1e293b"}}>{a.account_name}</td>
                        <td style={{padding:"11px 14px", color:"#64748b", fontSize:12}}>{a.account_number||"—"}</td>
                        <td style={{padding:"11px 14px", color:"#6366f1", fontWeight:600}}>{parseFloat(a.opening_balance||0).toFixed(3)}</td>
                        <td style={{padding:"11px 14px", fontWeight:800, color:(balances[a.id]||0)>=0?"#10b981":"#ef4444", fontSize:15}}>OMR {(balances[a.id]||0).toFixed(3)}</td>
                        <td style={{padding:"11px 14px", color:"#64748b"}}>{txnCount} entries</td>
                        <td style={{padding:"11px 14px"}}><span style={{background:a.include_in_balance===false?"#f1f5f9":"#ecfdf5", color:a.include_in_balance===false?"#64748b":"#10b981", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600}}>{a.include_in_balance===false?"📋 Tracking only":"Active"}</span></td>
                        <td style={{padding:"11px 14px"}}>
                          {isAdmin && (
                            <div style={{display:"flex", gap:4}}>
                              <button onClick={()=>{setEditingAcc(a.id);setAccForm({account_name:a.account_name,account_number:a.account_number||"",opening_balance:a.opening_balance||0,is_active:true,include_in_balance:a.include_in_balance!==false});setShowAccForm(true);}}
                                style={{background:"#eef2ff", color:"#6366f1", border:"none", borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:11}}>✏️</button>
                              <button onClick={()=>{setSelectedAcc(a.id);setTab("transactions");}}
                                style={{background:"#f0fdf4", color:"#10b981", border:"none", borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:11}}>📑</button>
                              <button onClick={(e)=>{e.stopPropagation();deleteAccount(a.id, a.account_name);}}
                                style={{background:"#fef2f2", color:"#ef4444", border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", fontSize:11}}>🗑</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════ TRANSFER TAB ══════ */}
        {tab==="transfer" && (
          <div>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16}}>
              <div style={{fontSize:14, fontWeight:700, color:"#0f172a"}}>🔄 Inter-Account Transfer</div>
              {isAdmin && !showTransfer && (
                <button onClick={()=>setShowTransfer(true)}
                  style={{background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:600, cursor:"pointer"}}>
                  + New Transfer
                </button>
              )}
            </div>

            {showTransfer && isAdmin && (
              <div style={{background:"#eef2ff", borderRadius:12, padding:20, marginBottom:20, border:"2px solid #6366f1"}}>
                <div style={{fontWeight:700, fontSize:14, color:"#0f172a", marginBottom:14}}>{transfer.editIds ? "✏️ Edit Transfer" : "🔄 Transfer Between Accounts"}</div>
                <div style={{display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:12, alignItems:"flex-end", marginBottom:14}}>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:600}}>FROM ACCOUNT *</div>
                    <select value={transfer.from_account} onChange={e=>setTransfer(p=>({...p,from_account:e.target.value}))} style={inp}>
                      <option value="">Select...</option>
                      {accounts.map(a=><option key={a.id} value={a.id}>{a.account_name} (OMR {(balances[a.id]||0).toFixed(3)})</option>)}
                    </select>
                  </div>
                  <div style={{fontSize:22, color:"#6366f1", fontWeight:800, paddingBottom:8}}>→</div>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:600}}>TO ACCOUNT *</div>
                    <select value={transfer.to_account} onChange={e=>setTransfer(p=>({...p,to_account:e.target.value}))} style={inp}>
                      <option value="">Select...</option>
                      {accounts.filter(a=>a.id!==transfer.from_account).map(a=><option key={a.id} value={a.id}>{a.account_name} (OMR {(balances[a.id]||0).toFixed(3)})</option>)}
                    </select>
                  </div>
                </div>
                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12}}>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:600}}>AMOUNT (OMR) *</div>
                    <input type="number" value={transfer.amount} onChange={e=>setTransfer(p=>({...p,amount:e.target.value}))} step="0.001" style={{...inp, fontSize:18, fontWeight:700, color:"#6366f1"}} placeholder="0.000" />
                  </div>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:600}}>TRANSFER DATE</div>
                    <input type="date" value={transfer.transfer_date} onChange={e=>setTransfer(p=>({...p,transfer_date:e.target.value}))} style={inp} />
                  </div>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:600}}>NOTES</div>
                    <input value={transfer.notes} onChange={e=>setTransfer(p=>({...p,notes:e.target.value}))} style={inp} placeholder="Optional..." />
                  </div>
                </div>
                <div style={{display:"flex", gap:10, marginTop:14}}>
                  <button onClick={saveTransfer} disabled={saving} style={{background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"10px 22px", cursor:"pointer", fontSize:14, fontWeight:700}}>{saving?"Saving...":(transfer.editIds?"💾 Update":"🔄 Transfer")}</button>
                  <button onClick={()=>setShowTransfer(false)} style={{background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, padding:"10px 14px", cursor:"pointer", fontSize:13}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Transfer history */}
            <div style={{fontSize:13, color:"#64748b", marginBottom:10}}>Recent transfers between accounts:</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:13}}>
                <thead><tr style={{background:"#f8fafc"}}>
                  {["Date","From","To","Amount","Notes",""].map(h=>(
                    <th key={h} style={{padding:"10px 14px", textAlign:"left", color:"#64748b", fontWeight:600, fontSize:11, borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {ledger.filter(e=>e.category==="Account Transfer"&&e.type==="Debits (Payouts)").map((e,i)=>(
                    <tr key={e.id} style={{borderTop:"1px solid #f1f5f9", background:i%2===0?"#fff":"#fafbfc"}}>
                      <td style={{padding:"10px 14px", color:"#64748b"}}>{e.entry_date}</td>
                      <td style={{padding:"10px 14px", fontWeight:700, color:"#ef4444"}}>{e.payment_mode}</td>
                      <td style={{padding:"10px 14px", fontWeight:700, color:"#10b981"}}>{e.payee}</td>
                      <td style={{padding:"10px 14px", fontWeight:700, color:"#6366f1"}}>OMR {parseFloat(e.amount).toFixed(3)}</td>
                      <td style={{padding:"10px 14px", color:"#94a3b8", fontSize:12}}>{e.remarks||"—"}</td>
                    </tr>
                  ))}
                  {ledger.filter(e=>e.category==="Account Transfer"&&e.type==="Debits (Payouts)").length===0 && (
                    <tr><td colSpan={6} style={{padding:40, textAlign:"center", color:"#94a3b8"}}>No transfers yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════ TRANSACTIONS TAB ══════ */}
        {tab==="transactions" && (
          <div>
            <div className="no-print" style={{display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center"}}>
              <select value={selectedAcc} onChange={e=>setSelectedAcc(e.target.value)} style={{...inp, width:"auto", minWidth:200}}>
                <option value="">All Accounts</option>
                {accounts.map(a=><option key={a.id} value={a.id}>{a.account_name}</option>)}
              </select>
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={{...inp, width:"auto"}} />
              <span style={{color:"#94a3b8"}}>to</span>
              <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={{...inp, width:"auto"}} />
              <button onClick={()=>{setStartDate("");setEndDate("");setSelectedAcc("");}} style={{background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, padding:"8px 14px", cursor:"pointer", fontSize:12, fontWeight:600}}>Reset</button>
              {selectedAcc && <button onClick={()=>window.print()} style={{background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"8px 16px", cursor:"pointer", fontSize:12, fontWeight:700}}>🖨 Print Statement</button>}
              <span style={{fontSize:12, color:"#64748b", marginLeft:"auto"}}>{filteredLedger.length} entries</span>
            </div>

            {!selectedAcc ? (
              <div className="no-print" style={{background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:20, textAlign:"center", color:"#92400e", fontSize:14}}>
                📄 Select a bank account above to view its statement with a running balance (like a passbook), and to print it.
              </div>
            ) : (()=>{
              const acc = accounts.find(a=>a.id===selectedAcc);
              // Build the statement CHRONOLOGICALLY (oldest → newest) so the running
              // balance adds up correctly, starting from the account's opening balance.
              const chrono = [...filteredLedger].sort((a,b)=>{
                if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? -1 : 1;
                return (a.created_at||"") < (b.created_at||"") ? -1 : 1;
              });
              const opening = parseFloat(acc?.opening_balance || 0);
              let run = opening;
              const withBal = chrono.map(e=>{
                const isCredit = e.type==="Credits (Income)";
                const amt = parseFloat(e.amount||0);
                run += isCredit ? amt : -amt;
                return { ...e, isCredit, amt, balance: run };
              });
              const totalDeposit = withBal.filter(e=>e.isCredit).reduce((s,e)=>s+e.amt,0);
              const totalPayment = withBal.filter(e=>!e.isCredit).reduce((s,e)=>s+e.amt,0);
              const closing = run;
              return (
                <div className="statement-print">
                  {/* Print header (only shows on paper) */}
                  <div className="print-only" style={{marginBottom:12}}>
                    <div style={{fontSize:20, fontWeight:800}}>SEVENSEAS MODERN ENTERPRISES</div>
                    <div style={{fontSize:13, color:"#475569"}}>Bank Account Statement</div>
                    <div style={{fontSize:13, marginTop:6}}><b>Account:</b> {acc?.account_name} {acc?.account_number?`(${acc.account_number})`:""}</div>
                    <div style={{fontSize:12, color:"#64748b"}}>Period: {startDate||"Beginning"} to {endDate||"Today"} · Generated: {new Date().toLocaleDateString("en-GB")}</div>
                  </div>

                  {/* Summary boxes */}
                  <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16}}>
                    {[["Opening Balance",`OMR ${opening.toFixed(3)}`,"#6366f1"],["Total Deposits",`OMR ${totalDeposit.toFixed(3)}`,"#10b981"],["Total Payments",`OMR ${totalPayment.toFixed(3)}`,"#ef4444"],["Closing Balance",`OMR ${closing.toFixed(3)}`,closing<0?"#ef4444":"#0f172a"]].map(([l,v,c])=>(
                      <div key={l} style={{background:"#fff",borderRadius:10,padding:"12px 14px",border:"1px solid #e2e8f0"}}>
                        <div style={{fontSize:10,color:"#64748b",fontWeight:600}}>{l}</div>
                        <div style={{fontSize:16,fontWeight:800,color:c,marginTop:4}}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%", borderCollapse:"collapse", fontSize:12.5, minWidth:800}}>
                      <thead><tr style={{background:"#f8fafc"}}>
                        {["Date","No.","Type","Payee / Account","Memo","Payment","Deposit","Balance"].map((h,hi)=>(
                          <th key={h} style={{padding:"9px 12px", textAlign: hi>=5?"right":"left", color:"#64748b", fontWeight:700, fontSize:10.5, borderBottom:"2px solid #e2e8f0"}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {/* Opening balance row */}
                        <tr style={{background:"#f8fafc"}}>
                          <td colSpan={7} style={{padding:"8px 12px", fontWeight:700, color:"#475569", fontStyle:"italic"}}>Opening Balance</td>
                          <td style={{padding:"8px 12px", textAlign:"right", fontWeight:800, color:opening<0?"#ef4444":"#0f172a"}}>{opening.toFixed(2)}</td>
                        </tr>
                        {withBal.length===0
                          ? <tr><td colSpan={8} style={{padding:30, textAlign:"center", color:"#94a3b8"}}>No transactions in this period.</td></tr>
                          : withBal.map((e,i)=>(
                            <tr key={e.id} style={{borderTop:"1px solid #f1f5f9", background:i%2===0?"#fff":"#fafbfc"}}>
                              <td style={{padding:"8px 12px", color:"#475569", whiteSpace:"nowrap"}}>{e.entry_date}</td>
                              <td style={{padding:"8px 12px", color:"#64748b"}}>{e.ref_voucher||"—"}</td>
                              <td style={{padding:"8px 12px", color:"#64748b", fontSize:11}}>{e.category==="Account Transfer"?"TRANSFER":(e.payment_mode||e.category||"—")}</td>
                              <td style={{padding:"8px 12px", color:"#1e293b"}}>{e.payee||e.description||"—"}</td>
                              <td style={{padding:"8px 12px", color:"#64748b", fontSize:11.5}}>{e.description||e.remarks||"—"}</td>
                              <td style={{padding:"8px 12px", textAlign:"right", color:"#ef4444", fontWeight:600}}>{!e.isCredit?e.amt.toFixed(2):""}</td>
                              <td style={{padding:"8px 12px", textAlign:"right", color:"#10b981", fontWeight:600}}>{e.isCredit?e.amt.toFixed(2):""}</td>
                              <td style={{padding:"8px 12px", textAlign:"right", fontWeight:700, color:e.balance<0?"#ef4444":"#0f172a"}}>{e.balance.toFixed(2)}</td>
                            </tr>
                          ))
                        }
                        {/* Closing total row */}
                        {withBal.length>0 && (
                          <tr style={{background:"#f1f5f9", borderTop:"2px solid #cbd5e1"}}>
                            <td colSpan={5} style={{padding:"9px 12px", fontWeight:800, color:"#0f172a"}}>Totals</td>
                            <td style={{padding:"9px 12px", textAlign:"right", fontWeight:800, color:"#ef4444"}}>{totalPayment.toFixed(2)}</td>
                            <td style={{padding:"9px 12px", textAlign:"right", fontWeight:800, color:"#10b981"}}>{totalDeposit.toFixed(2)}</td>
                            <td style={{padding:"9px 12px", textAlign:"right", fontWeight:800, color:closing<0?"#ef4444":"#0f172a"}}>{closing.toFixed(2)}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <style>{`
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body * { visibility: hidden; }
          .statement-print, .statement-print * { visibility: visible; }
          .statement-print { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
