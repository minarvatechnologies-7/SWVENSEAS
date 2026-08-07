import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../context/AdminContext";

const empty = { ref_number:"", agent_name:"", client:"", site:"", contract_value:"", commission_rate:"", computed_payout:"", commission_date: new Date().toISOString().split("T")[0], status:"Pending", notes:"" };

export default function Commissions() {
  const { isAdmin: realIsAdmin, canEdit, setShowLogin, confirmAction, logActivity } = useAdmin();
  const isAdmin = canEdit("commissions");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("commissions").select("*").is("deleted_at",null).order("commission_date", { ascending: false });
    setRecords(data || []); setLoading(false);
  };

  const calcPayout = (val, rate) => {
    const v = parseFloat(val) || 0;
    const r = parseFloat(rate) || 0;
    return ((v * r) / 100).toFixed(3);
  };

  const save = async () => {
    if (!isAdmin) { setShowLogin(true); return; }
    setSaving(true);
    const payout = calcPayout(form.contract_value, form.commission_rate);
    const data = { ...form, computed_payout: payout };
    if (editId) {
      await supabase.from("commissions").update(data).eq("id", editId);
      logActivity("Edited commission", `${form.agent_name} — OMR ${payout}`, "Commissions");
    } else {
      const ref = `COM-${String(records.length + 1).padStart(3, "0")}-${new Date().getFullYear()}`;
      await supabase.from("commissions").insert({ ...data, ref_number: ref });
      logActivity("Added commission", `${form.agent_name} — OMR ${payout}`, "Commissions");
    }
    await load(); setForm(empty); setShowForm(false); setEditId(null); setSaving(false);
  };

  const startEdit = (r) => {
    if (!isAdmin) { setShowLogin(true); return; }
    setForm({ ref_number:r.ref_number, agent_name:r.agent_name, client:r.client, site:r.site, contract_value:r.contract_value, commission_rate:r.commission_rate, computed_payout:r.computed_payout, commission_date:r.commission_date, status:r.status, notes:r.notes||"" });
    setEditId(r.id); setShowForm(true);
  };

  const del = (id) => {
    if (!isAdmin) { setShowLogin(true); return; }
    confirmAction("Move this commission record to Trash?", async () => {
      await supabase.from("commissions").update({deleted_at:new Date().toISOString()}).eq("id", id);
      logActivity("Moved commission to Trash", records.find(r=>r.id===id)?.agent_name||"", "Commissions");
      await load();
    });
  };

  const updateStatus = async (id, status) => {
    if (!isAdmin) { setShowLogin(true); return; }
    const name = records.find(r=>r.id===id)?.agent_name || "";
    await supabase.from("commissions").update({ status }).eq("id", id);
    logActivity("Changed commission status", `${name} → ${status}`, "Commissions");
    await load();
  };

  const total = records.reduce((s, r) => s + parseFloat(r.computed_payout || 0), 0);
  const paid = records.filter(r => r.status === "Settled").reduce((s, r) => s + parseFloat(r.computed_payout || 0), 0);
  const inp = { border:"1px solid #e2e8f0", borderRadius:8, padding:"9px 12px", fontSize:13, width:"100%", boxSizing:"border-box", outline:"none" };

  return (
    <div style={{ padding:24 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:"#0f172a", marginBottom:4 }}>Commission Ledger</div>
          <div style={{ fontSize:13, color:"#64748b" }}>Track referral and agent commissions for all civil contracts</div>
        </div>
        {isAdmin
          ? <button onClick={() => { setForm(empty); setEditId(null); setShowForm(!showForm); }} style={{ background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:600, cursor:"pointer" }}>+ Add Commission</button>
          : <button onClick={() => setShowLogin(true)} style={{ background:"#f1f5f9", color:"#64748b", border:"1px solid #e2e8f0", borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:600, cursor:"pointer" }}>🔑 Login to Add</button>
        }
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:20 }}>
        {[
          ["TOTAL COMMISSIONS",`OMR ${total.toFixed(3)}`,"#8b5cf6","#f5f3ff"],
          ["PAID / SETTLED",`OMR ${paid.toFixed(3)}`,"#10b981","#ecfdf5"],
          ["PENDING",`OMR ${(total-paid).toFixed(3)}`,"#f59e0b","#fffbeb"],
        ].map(([l,v,c,bg])=>(
          <div key={l} style={{ background:bg, borderRadius:12, padding:"16px 20px", border:`1px solid ${c}30` }}>
            <div style={{ fontSize:10, color:"#64748b", fontWeight:600, letterSpacing:0.8, marginBottom:6 }}>{l}</div>
            <div style={{ fontSize:20, fontWeight:800, color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Form */}
      {showForm && isAdmin && (
        <div style={{ background:"#fff", borderRadius:12, padding:22, marginBottom:16, border:"2px solid #6366f1" }}>
          <div style={{ fontWeight:700, fontSize:15, color:"#0f172a", marginBottom:16 }}>{editId ? "Edit" : "New"} Commission Record</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            {[["Agent / Referral Name","agent_name","text"],["Client Name","client","text"],["Site / Project","site","text"],["Contract Value (OMR)","contract_value","number"],["Commission Rate (%)","commission_rate","number"],["Commission Date","commission_date","date"]].map(([l,k,t])=>(
              <div key={k}>
                <div style={{ fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500 }}>{l}</div>
                <input type={t} value={form[k]} onChange={e => {
                  const updated = { ...form, [k]: e.target.value };
                  if (k === "contract_value" || k === "commission_rate") updated.computed_payout = calcPayout(updated.contract_value, updated.commission_rate);
                  setForm(updated);
                }} step={t==="number"?"0.001":undefined} style={inp} />
              </div>
            ))}
            <div>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500 }}>Status</div>
              <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={inp}>
                <option>Pending</option><option>Settled</option><option>Disputed</option>
              </select>
            </div>
            <div style={{ gridColumn:"span 2" }}>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500 }}>Notes</div>
              <input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={inp} />
            </div>
          </div>
          {form.contract_value && form.commission_rate && (
            <div style={{ marginTop:10, padding:"10px 14px", background:"#f5f3ff", borderRadius:8, fontSize:13, color:"#8b5cf6", fontWeight:600 }}>
              Commission Payout: OMR {form.computed_payout} ({form.commission_rate}% of OMR {form.contract_value})
            </div>
          )}
          <div style={{ display:"flex", gap:10, marginTop:14 }}>
            <button onClick={save} disabled={saving} style={{ background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontSize:13, fontWeight:600 }}>{saving?"Saving...":"💾 Save"}</button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} style={{ background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, padding:"9px 18px", cursor:"pointer", fontSize:13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, minWidth:760 }}>
          <thead><tr style={{ background:"#f8fafc" }}>
            {["Ref","Agent","Client","Site","Contract","Rate","Payout","Date","Status","Actions"].map(h=>
              <th key={h} style={{ padding:"10px 14px", textAlign:"left", color:"#64748b", fontWeight:600, fontSize:11, whiteSpace:"nowrap" }}>{h}</th>
            )}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={10} style={{ padding:40, textAlign:"center", color:"#94a3b8" }}>⏳ Loading...</td></tr> :
             records.length === 0 ? <tr><td colSpan={10} style={{ padding:40, textAlign:"center", color:"#94a3b8" }}>No commission records yet.</td></tr> :
             records.map((r, i) => (
              <tr key={r.id} style={{ borderTop:"1px solid #f1f5f9", background:i%2===0?"#fff":"#f8fafc" }}>
                <td style={{ padding:"10px 14px", color:"#6366f1", fontFamily:"monospace", fontSize:11 }}>{r.ref_number}</td>
                <td style={{ padding:"10px 14px", fontWeight:600, color:"#1e293b" }}>{r.agent_name}</td>
                <td style={{ padding:"10px 14px", color:"#475569" }}>{r.client}</td>
                <td style={{ padding:"10px 14px", color:"#64748b", fontSize:11 }}>{r.site}</td>
                <td style={{ padding:"10px 14px", color:"#1e293b" }}>{parseFloat(r.contract_value||0).toFixed(3)}</td>
                <td style={{ padding:"10px 14px", color:"#6366f1" }}>{r.commission_rate}%</td>
                <td style={{ padding:"10px 14px", fontWeight:700, color:"#8b5cf6" }}>{parseFloat(r.computed_payout||0).toFixed(3)}</td>
                <td style={{ padding:"10px 14px", color:"#64748b", fontSize:11 }}>{r.commission_date}</td>
                <td style={{ padding:"10px 14px" }}>
                  {isAdmin
                    ? <select value={r.status} onChange={e=>updateStatus(r.id,e.target.value)} style={{ background:r.status==="Settled"?"#ecfdf5":r.status==="Disputed"?"#fef2f2":"#fffbeb", color:r.status==="Settled"?"#10b981":r.status==="Disputed"?"#ef4444":"#d97706", border:"none", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                        <option>Pending</option><option>Settled</option><option>Disputed</option>
                      </select>
                    : <span style={{ background:r.status==="Settled"?"#ecfdf5":"#fffbeb", color:r.status==="Settled"?"#10b981":"#d97706", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600 }}>{r.status}</span>
                  }
                </td>
                <td style={{ padding:"10px 14px" }}>
                  {isAdmin && (
                    <div style={{ display:"flex", gap:4 }}>
                      <button onClick={()=>startEdit(r)} style={{ background:"#eef2ff", color:"#6366f1", border:"none", borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:11, fontWeight:600 }}>Edit</button>
                      <button onClick={()=>del(r.id)} style={{ background:"#fef2f2", color:"#ef4444", border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", fontSize:11 }}>🗑</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {records.length > 0 && (
            <tfoot>
              <tr style={{ borderTop:"2px solid #e2e8f0", background:"#f8fafc" }}>
                <td colSpan={6} style={{ padding:"10px 14px", fontWeight:700, color:"#0f172a" }}>TOTAL ({records.length} records)</td>
                <td style={{ padding:"10px 14px", fontWeight:800, color:"#8b5cf6" }}>{total.toFixed(3)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
