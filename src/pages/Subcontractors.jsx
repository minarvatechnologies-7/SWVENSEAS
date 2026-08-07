import { useState, useEffect } from "react";
import BankAccountSelect from "../components/BankAccountSelect";
import { getBankAccounts } from "../lib/bankAccounts";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../context/AdminContext";

const SPECIALTIES = ["Civil Works","Electrical Works","Plumbing Works","Plastering Works","Tiling Works","Painting Works","Interlock Works","Steel Works","Other"];
const statusColor = { "Completed":"#10b981","In Progress":"#f59e0b","Pending":"#94a3b8","Cancelled":"#ef4444" };
const statusBg = { "Completed":"#ecfdf5","In Progress":"#fffbeb","Pending":"#f8fafc","Cancelled":"#fef2f2" };

function MilestoneGraph({ milestones, type, title }) {
  const total = milestones.reduce((s,m) => s + parseFloat(m.amount||0), 0);
  const done = milestones.filter(m => m.status==="Completed").reduce((s,m) => s + parseFloat(m.amount||0), 0);
  const pct = total > 0 ? Math.round((done/total)*100) : 0;
  const color = type === "payment" ? "#10b981" : "#6366f1";

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 8 }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#0f172a" }}>{title}</div>
        <div style={{ fontSize:12, color, fontWeight:700 }}>{pct}% · OMR {done.toFixed(3)} / {total.toFixed(3)}</div>
      </div>
      {/* Progress bar */}
      <div style={{ background:"#f1f5f9", borderRadius:8, height:12, marginBottom:10, position:"relative", overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, background:`linear-gradient(90deg, ${color}, ${color}cc)`, height:"100%", borderRadius:8, transition:"width 0.5s" }} />
        <div style={{ position:"absolute", right:6, top:"50%", transform:"translateY(-50%)", fontSize:9, color:"#fff", fontWeight:700, textShadow:"0 1px 2px rgba(0,0,0,0.3)" }}>{pct}%</div>
      </div>
      {/* Step graph */}
      <div style={{ display:"flex", gap:2, alignItems:"flex-end", height:48 }}>
        {milestones.map((m, i) => {
          const mPct = total > 0 ? (parseFloat(m.amount||0)/total)*100 : 0;
          const isComplete = m.status === "Completed";
          return (
            <div key={i} title={`${m.label}: OMR ${parseFloat(m.amount||0).toFixed(3)}`}
              style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
              <div style={{ width:"100%", background: isComplete ? color : "#e2e8f0", borderRadius:"3px 3px 0 0",
                height:`${Math.max(mPct*0.4+4, 6)}px`, minHeight:6, transition:"all 0.3s",
                border: isComplete ? `1px solid ${color}` : "1px solid #e2e8f0" }} />
              <div style={{ width:6, height:6, borderRadius:"50%", background: isComplete ? color : "#cbd5e1",
                border:`1px solid ${isComplete ? color : "#94a3b8"}` }} />
            </div>
          );
        })}
      </div>
      <div style={{ display:"flex", gap:12, marginTop:6, fontSize:10, color:"#64748b" }}>
        <span style={{ display:"flex", alignItems:"center", gap:3 }}>
          <span style={{ width:8,height:8,background:color,borderRadius:"50%",display:"inline-block" }} />
          Completed ({milestones.filter(m=>m.status==="Completed").length})
        </span>
        <span style={{ display:"flex", alignItems:"center", gap:3 }}>
          <span style={{ width:8,height:8,background:"#e2e8f0",borderRadius:"50%",display:"inline-block" }} />
          Pending ({milestones.filter(m=>m.status!=="Completed").length})
        </span>
      </div>
    </div>
  );
}

const Field = ({label,children}) => <div><div style={{fontSize:12,color:"#64748b",marginBottom:4,fontWeight:500}}>{label}</div>{children}</div>;

export default function Subcontractors() {
  const { isAdmin: realIsAdmin, canEdit, setShowLogin, confirmAction, logActivity } = useAdmin();
  const isAdmin = canEdit("subcontractors");
  const [subs, setSubs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [selectedSpecialty, setSelectedSpecialty] = useState(null);
  const [selectedWork, setSelectedWork] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [editingName, setEditingName] = useState(null); // old name being edited
  const [newName, setNewName] = useState("");

  const renameContractor = async (oldName) => {
    if (!isAdmin) { setShowLogin(true); return; }
    if (!newName.trim() || newName.trim() === oldName) { setEditingName(null); return; }
    setSaving(true);
    const { error } = await supabase.from("subcontractors").update({ name: newName.trim() }).eq("name", oldName);
    if (error) { alert("Error: " + error.message); }
    else { logActivity("Renamed subcontractor", `${oldName} → ${newName.trim()}`, "Subcontractors"); setEditingName(null); setNewName(""); await loadAll(); }
    setSaving(false);
  };

  const emptyForm = { name:"", isNew:true, specialty:"Civil Works", project:"", isNewProject:false, contract_amount:"", paid:"0" };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { 
    loadAll();
    getBankAccounts().then(setBankAccounts);
  }, []);
  useEffect(() => { if (selectedWork) { loadMilestones(selectedWork.id); } }, [selectedWork]);

  const loadAll = async () => {
    setLoading(true);
    const [s, p] = await Promise.all([
      supabase.from("subcontractors").select("*").is("deleted_at",null).order("name"),
      supabase.from("projects").select("id,name,customer").is("deleted_at",null).order("name"),
    ]);
    setSubs(s.data||[]); setProjects(p.data||[]); setLoading(false);
  };

  const loadMilestones = async (subId) => {
    const { data } = await supabase.from("sub_milestones").select("*").eq("subcontractor_id", subId).is("deleted_at",null).order("sort_order");
    setMilestones(data||[]);
  };

  const contractors = [...new Set(subs.map(s=>s.name))].sort();
  const specialtiesFor = [...new Set(subs.filter(s=>s.name===selectedContractor).map(s=>s.specialty))];
  const worksFor = subs.filter(s=>s.name===selectedContractor && s.specialty===selectedSpecialty);

  const stats = (name) => {
    const w = subs.filter(s=>s.name===name);
    return { total:w.reduce((t,x)=>t+parseFloat(x.contract_amount||0),0), paid:w.reduce((t,x)=>t+parseFloat(x.paid||0),0), count:w.length, specialties:[...new Set(w.map(x=>x.specialty))] };
  };
  const spStats = (name, sp) => {
    const w = subs.filter(s=>s.name===name&&s.specialty===sp);
    return { total:w.reduce((t,x)=>t+parseFloat(x.contract_amount||0),0), paid:w.reduce((t,x)=>t+parseFloat(x.paid||0),0), count:w.length };
  };

  const icon = sp => ({"Civil Works":"🏗","Electrical Works":"⚡","Plumbing Works":"🔧","Plastering Works":"🪣","Tiling Works":"🪟","Painting Works":"🎨","Interlock Works":"🧱","Steel Works":"⚙","Other":"📦"}[sp]||"📦");

  const addContract = async () => {
    if (!isAdmin) { setShowLogin(true); return; }
    if (!form.name || !form.project) return;
    setSaving(true);
    await supabase.from("subcontractors").insert({
      name: form.name, specialty: form.specialty, project: form.project,
      contract_amount: parseFloat(form.contract_amount)||0, paid: parseFloat(form.paid)||0
    });
    logActivity("Added subcontractor contract", `${form.name} — ${form.specialty} — ${form.project} — OMR ${parseFloat(form.contract_amount||0).toFixed(3)}`, "Subcontractors");
    await loadAll(); setForm(emptyForm); setShowForm(false); setSaving(false);
  };

  const addMilestone = async () => {
    if (!isAdmin) { setShowLogin(true); return; }
    const { data } = await supabase.from("sub_milestones").insert({
      subcontractor_id: selectedWork.id, label:"New Milestone", status:"Pending", amount:0, sort_order:milestones.length
    }).select().single();
    if (data) { setMilestones([...milestones, data]); logActivity("Added milestone", `${selectedWork?.name} — New Milestone`, "Subcontractors"); }
  };

  const updateMilestone = async (id, field, val) => {
    if (!isAdmin) { setShowLogin(true); return; }
    await supabase.from("sub_milestones").update({ [field]:val }).eq("id", id);
    setMilestones(milestones.map(m => m.id===id ? {...m,[field]:val} : m));
  };

  const updateLockedMilestone = (id, field, val) => {
    if (!isAdmin) { setShowLogin(true); return; }
    confirmAction("This milestone is already paid. Edit requires admin confirmation.", async () => {
      const before = milestones.find(m=>m.id===id)?.[field];
      await supabase.from("sub_milestones").update({ [field]:val }).eq("id", id);
      logActivity("Edited locked milestone", `${selectedWork?.name} — ${field}: ${before} → ${val}`, "Subcontractors");
      setMilestones(milestones.map(m => m.id===id ? {...m,[field]:val} : m));
    });
  };

  const deleteWork = (id) => {
    if (!isAdmin) { setShowLogin(true); return; }
    confirmAction("Move this work contract (and its milestones) to Trash? You can restore it later from the Trash page.", async () => {
      const now = new Date().toISOString();
      await supabase.from("sub_milestones").update({deleted_at:now}).eq("subcontractor_id", id);
      await supabase.from("subcontractors").update({deleted_at:now}).eq("id", id);
      logActivity("Moved subcontractor to Trash", subs.find(s=>s.id===id)?.name||"", "Subcontractors");
      setSelectedWork(null); await loadAll();
    });
  };

  const go = (lvl, val=null) => {
    if (lvl===0){setSelectedContractor(null);setSelectedSpecialty(null);setSelectedWork(null);}
    if (lvl===1){setSelectedContractor(val);setSelectedSpecialty(null);setSelectedWork(null);}
    if (lvl===2){setSelectedSpecialty(val);setSelectedWork(null);}
  };

  const inp = { border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:13,width:"100%",boxSizing:"border-box",outline:"none" };

  // Payment milestones (milestones where payment is tracked)
  const paymentMilestones = milestones;
  // Work milestones = same milestones but tracking completion
  const workMilestones = milestones;

  return (
    <div style={{ padding:24 }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:"#0f172a", marginBottom:4 }}>Subcontractors</div>
          <div style={{ fontSize:13, color:"#64748b" }}>{contractors.length} contractors · {subs.length} work contracts</div>
        </div>
        {isAdmin
          ? <button onClick={()=>setShowForm(!showForm)} style={{ background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer" }}>+ Add Work Contract</button>
          : <button onClick={()=>setShowLogin(true)} style={{ background:"#f1f5f9",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer" }}>🔑 Login to Add</button>
        }
      </div>

      {/* Breadcrumb */}
      <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16,fontSize:13,flexWrap:"wrap" }}>
        <button onClick={()=>go(0)} style={{ background:!selectedContractor?"#eef2ff":"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",color:"#6366f1",fontWeight:600 }}>All Contractors</button>
        {selectedContractor&&<><span style={{color:"#94a3b8"}}>›</span>
          <button onClick={()=>go(1,selectedContractor)} style={{ background:!selectedSpecialty?"#eef2ff":"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",color:"#6366f1",fontWeight:600 }}>{selectedContractor}</button>
          {isAdmin && editingName!==selectedContractor && <button onClick={()=>{setEditingName(selectedContractor);setNewName(selectedContractor);}} style={{background:"#eef2ff",color:"#6366f1",border:"1px solid #c7d2fe",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12,fontWeight:600}}>✏️ Rename</button>}
          {isAdmin && editingName===selectedContractor && <span style={{display:"inline-flex",gap:6,alignItems:"center"}}>
            <input value={newName} onChange={e=>setNewName(e.target.value)} autoFocus style={{border:"1px solid #6366f1",borderRadius:6,padding:"4px 8px",fontSize:13,fontWeight:600,width:160,outline:"none"}}
              onKeyDown={e=>{if(e.key==="Enter"){renameContractor(selectedContractor);setSelectedContractor(newName.trim());}if(e.key==="Escape")setEditingName(null);}} />
            <button onClick={()=>{const nn=newName.trim();renameContractor(selectedContractor).then(()=>setSelectedContractor(nn));}} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:4,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>✓</button>
            <button onClick={()=>setEditingName(null)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:4,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>✕</button>
          </span>}</>}
        {selectedSpecialty&&<><span style={{color:"#94a3b8"}}>›</span>
          <button onClick={()=>go(2,selectedSpecialty)} style={{ background:!selectedWork?"#eef2ff":"#f1f5f9",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",color:"#6366f1",fontWeight:600 }}>{icon(selectedSpecialty)} {selectedSpecialty}</button></>}
        {selectedWork&&<><span style={{color:"#94a3b8"}}>›</span>
          <span style={{ background:"#eef2ff",borderRadius:6,padding:"5px 12px",color:"#6366f1",fontWeight:600 }}>{selectedWork.project}</span></>}
      </div>

      {/* Add Form */}
      {showForm&&isAdmin&&(
        <div style={{ background:"#fff",borderRadius:12,padding:22,marginBottom:16,border:"2px solid #6366f1" }}>
          <div style={{ fontWeight:700,fontSize:15,color:"#0f172a",marginBottom:16 }}>New Work Contract</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            {/* Contractor Name */}
            <Field label="Contractor Name">
              <select value={form.isNew?"__new__":form.name} onChange={e=>{
                if(e.target.value==="__new__") setForm({...form,isNew:true,name:""});
                else setForm({...form,isNew:false,name:e.target.value});
              }} style={inp}>
                <option value="">Select Contractor</option>
                {contractors.map(c=><option key={c} value={c}>{c}</option>)}
                <option value="__new__">+ Add New Contractor</option>
              </select>
              {form.isNew&&<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Enter new contractor name" style={{...inp,marginTop:8}} />}
            </Field>

            {/* Specialty */}
            <Field label="Specialty / Category">
              <select value={form.specialty} onChange={e=>setForm({...form,specialty:e.target.value})} style={inp}>
                {SPECIALTIES.map(s=><option key={s}>{s}</option>)}
              </select>
            </Field>

            {/* Project */}
            <Field label="Project / Work Name">
              <select value={form.isNewProject?"__new__":form.project} onChange={e=>{
                if(e.target.value==="__new__") setForm({...form,isNewProject:true,project:""});
                else setForm({...form,isNewProject:false,project:e.target.value});
              }} style={inp}>
                <option value="">Select Project</option>
                {projects.map(p=><option key={p.id} value={p.name}>{p.name} — {p.customer}</option>)}
                <option value="__new__">+ Add Custom Work Name</option>
              </select>
              {form.isNewProject&&<input value={form.project} onChange={e=>setForm({...form,project:e.target.value})} placeholder="Enter work name" style={{...inp,marginTop:8}} />}
            </Field>

            <Field label="Contract Amount (OMR)">
              <input type="number" value={form.contract_amount} onChange={e=>setForm({...form,contract_amount:e.target.value})} step="0.001" style={inp} />
            </Field>
            <Field label="Amount Already Paid (OMR)">
              <input type="number" value={form.paid} onChange={e=>setForm({...form,paid:e.target.value})} step="0.001" style={inp} />
            </Field>
          </div>
          <div style={{ display:"flex",gap:10,marginTop:14 }}>
            <button onClick={addContract} disabled={saving} style={{ background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontSize:13,fontWeight:600 }}>{saving?"Saving...":"💾 Save Contract"}</button>
            <button onClick={()=>setShowForm(false)} style={{ background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontSize:13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* LEVEL 1: Contractors */}
      {!selectedContractor&&(
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16 }}>
          {loading?<div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>⏳ Loading...</div>:
           contractors.length===0?<div style={{background:"#fff",borderRadius:12,padding:60,textAlign:"center",border:"1px solid #e2e8f0",gridColumn:"span 3",color:"#94a3b8"}}>No subcontractors yet.</div>:
           contractors.map(name=>{
             const st=stats(name);
             const pct=st.total>0?Math.round((st.paid/st.total)*100):0;
             return (
               <div key={name} onClick={()=>go(1,name)} style={{ background:"#fff",borderRadius:12,padding:20,cursor:"pointer",border:"1px solid #e2e8f0",transition:"border 0.15s" }}
                 onMouseEnter={e=>e.currentTarget.style.border="1px solid #6366f1"}
                 onMouseLeave={e=>e.currentTarget.style.border="1px solid #e2e8f0"}>
                 <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10 }}>
                   <div style={{flex:1}}>
                     {editingName===name ? (
                       <div style={{display:"flex",gap:6,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
                         <input value={newName} onChange={e=>setNewName(e.target.value)} autoFocus
                           style={{border:"1px solid #6366f1",borderRadius:6,padding:"4px 8px",fontSize:14,fontWeight:700,width:160,outline:"none"}}
                           onKeyDown={e=>{if(e.key==="Enter")renameContractor(name);if(e.key==="Escape")setEditingName(null);}} />
                         <button onClick={(e)=>{e.stopPropagation();renameContractor(name);}} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:4,padding:"4px 10px",fontSize:11,cursor:"pointer"}}>✓</button>
                         <button onClick={(e)=>{e.stopPropagation();setEditingName(null);}} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:4,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>✕</button>
                       </div>
                     ) : (
                       <div style={{display:"flex",alignItems:"center",gap:6}}>
                         <div style={{ fontWeight:800,color:"#1e293b",fontSize:16 }}>{name}</div>
                         {isAdmin && <button onClick={(e)=>{e.stopPropagation();setEditingName(name);setNewName(name);}}
                           style={{background:"#eef2ff",color:"#6366f1",border:"1px solid #c7d2fe",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:12,fontWeight:600}}>✏️ Edit</button>}
                       </div>
                     )}
                     <div style={{ fontSize:12,color:"#64748b",marginTop:2 }}>{st.count} contracts</div>
                   </div>
                   <div style={{ width:40,height:40,background:"#eef2ff",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20 }}>👷</div>
                 </div>
                 <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:12 }}>
                   {st.specialties.map(sp=><span key={sp} style={{ background:"#f1f5f9",color:"#475569",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:600 }}>{icon(sp)} {sp}</span>)}
                 </div>
                 <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:8 }}>
                   <span style={{ color:"#10b981",fontWeight:600 }}>Paid: OMR {st.paid.toFixed(3)}</span>
                   <span style={{ color:"#f59e0b",fontWeight:600 }}>Pending: OMR {(st.total-st.paid).toFixed(3)}</span>
                 </div>
                 <div style={{ background:"#f1f5f9",borderRadius:4,height:6 }}>
                   <div style={{ width:`${Math.min(pct,100)}%`,background:"#6366f1",borderRadius:4,height:6 }} />
                 </div>
                 <div style={{ display:"flex",justifyContent:"space-between",marginTop:6,fontSize:11,color:"#94a3b8" }}>
                   <span>Total: OMR {st.total.toFixed(3)}</span>
                   <span>{pct}% paid →</span>
                 </div>
               </div>
             );
           })}
        </div>
      )}

      {/* LEVEL 2: Specialties */}
      {selectedContractor&&!selectedSpecialty&&(
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:16 }}>
          {specialtiesFor.map(sp=>{
            const st=spStats(selectedContractor,sp);
            const pct=st.total>0?Math.round((st.paid/st.total)*100):0;
            return (
              <div key={sp} onClick={()=>go(2,sp)} style={{ background:"#fff",borderRadius:12,padding:20,cursor:"pointer",border:"1px solid #e2e8f0" }}
                onMouseEnter={e=>e.currentTarget.style.border="1px solid #6366f1"}
                onMouseLeave={e=>e.currentTarget.style.border="1px solid #e2e8f0"}>
                <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:14 }}>
                  <div style={{ width:50,height:50,background:"#eef2ff",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26 }}>{icon(sp)}</div>
                  <div>
                    <div style={{ fontWeight:700,color:"#1e293b",fontSize:15 }}>{sp}</div>
                    <div style={{ fontSize:12,color:"#64748b" }}>{st.count} work{st.count!==1?"s":""}</div>
                  </div>
                </div>
                <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:8 }}>
                  <span style={{ color:"#10b981",fontWeight:600 }}>Paid: OMR {st.paid.toFixed(3)}</span>
                  <span style={{ color:"#f59e0b",fontWeight:600 }}>Pending: OMR {(st.total-st.paid).toFixed(3)}</span>
                </div>
                <div style={{ background:"#f1f5f9",borderRadius:4,height:6 }}>
                  <div style={{ width:`${Math.min(pct,100)}%`,background:sp==="Civil Works"?"#6366f1":"#f59e0b",borderRadius:4,height:6 }} />
                </div>
                <div style={{ fontSize:11,color:"#94a3b8",marginTop:6,display:"flex",justifyContent:"space-between" }}>
                  <span>Total: OMR {st.total.toFixed(3)}</span>
                  <span>{pct}% paid →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LEVEL 3: Works */}
      {selectedContractor&&selectedSpecialty&&!selectedWork&&(
        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          {worksFor.length===0?<div style={{ background:"#fff",borderRadius:12,padding:40,textAlign:"center",border:"1px solid #e2e8f0",color:"#94a3b8" }}>No works found.</div>:
           worksFor.map(w=>{
             const pct=w.contract_amount>0?Math.round((w.paid/w.contract_amount)*100):0;
             return (
               <div key={w.id} onClick={()=>setSelectedWork(w)} style={{ background:"#fff",borderRadius:12,padding:18,cursor:"pointer",border:"1px solid #e2e8f0",display:"flex",justifyContent:"space-between",alignItems:"center" }}
                 onMouseEnter={e=>e.currentTarget.style.border="1px solid #6366f1"}
                 onMouseLeave={e=>e.currentTarget.style.border="1px solid #e2e8f0"}>
                 <div style={{ flex:1 }}>
                   <div style={{ fontWeight:700,color:"#1e293b",fontSize:14,marginBottom:6 }}>{w.project}</div>
                   <div style={{ display:"flex",gap:16,fontSize:12,marginBottom:8 }}>
                     <span style={{ color:"#10b981",fontWeight:600 }}>Paid: OMR {parseFloat(w.paid).toFixed(3)}</span>
                     <span style={{ color:"#f59e0b",fontWeight:600 }}>Pending: OMR {(w.contract_amount-w.paid).toFixed(3)}</span>
                     <span style={{ color:"#6366f1",fontWeight:700 }}>{pct}% complete</span>
                   </div>
                   <div style={{ background:"#f1f5f9",borderRadius:4,height:5,maxWidth:400 }}>
                     <div style={{ width:`${Math.min(pct,100)}%`,background:"#6366f1",borderRadius:4,height:5 }} />
                   </div>
                 </div>
                 <div style={{ textAlign:"right",marginLeft:20 }}>
                   <div style={{ fontSize:18,fontWeight:800,color:"#6366f1" }}>OMR {parseFloat(w.contract_amount).toFixed(3)}</div>
                   <div style={{ fontSize:11,color:"#94a3b8" }}>View details →</div>
                 </div>
               </div>
             );
           })}
        </div>
      )}

      {/* LEVEL 4: Work Detail */}
      {selectedWork&&(
        <div style={{ background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden" }}>
          {/* Header */}
          <div style={{ padding:"16px 20px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc" }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
              <div>
                <div style={{ fontWeight:800,color:"#1e293b",fontSize:16 }}>{selectedWork.project}</div>
                <div style={{ color:"#64748b",fontSize:12,marginTop:2 }}>{selectedWork.name} · {selectedWork.specialty}</div>
              </div>
              <div style={{ display:"flex",gap:8 }}>
                {isAdmin&&<button onClick={addMilestone} style={{ background:"#eef2ff",color:"#6366f1",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600 }}>+ Milestone</button>}
                {isAdmin&&<button onClick={()=>deleteWork(selectedWork.id)} style={{ background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12 }}>🗑</button>}
              </div>
            </div>

            {/* Stats */}
            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:14 }}>
              {[
                ["Contract Value","OMR "+parseFloat(selectedWork.contract_amount).toFixed(3),"#6366f1"],
                ["Amount Paid","OMR "+parseFloat(selectedWork.paid).toFixed(3),"#10b981"],
                ["Pending","OMR "+(selectedWork.contract_amount-selectedWork.paid).toFixed(3),"#f59e0b"],
                ["Completion",`${selectedWork.contract_amount>0?Math.round((selectedWork.paid/selectedWork.contract_amount)*100):0}%`,"#6366f1"],
              ].map(([l,v,c])=>(
                <div key={l} style={{ background:"#fff",borderRadius:8,padding:"10px 12px",border:"1px solid #e2e8f0" }}>
                  <div style={{ fontSize:10,color:"#64748b",marginBottom:3 }}>{l}</div>
                  <div style={{ fontSize:14,fontWeight:800,color:c }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Payment hint */}
            {isAdmin&&(
              <div style={{ marginTop:14,padding:"10px 14px",background:"#eef2ff",borderRadius:8,fontSize:12,color:"#4338ca" }}>
                💵 To record a payment to this subcontractor, use the <strong>Record Payment</strong> page (sidebar).
              </div>
            )}
          </div>

          {!isAdmin&&<div style={{ padding:"8px 20px",background:"#fffbeb",fontSize:12,color:"#92400e" }}>👁 View only — Login as admin to edit</div>}

          <div style={{ padding:20 }}>
            {/* MILESTONE GRAPHS */}
            {milestones.length > 0 && (
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20 }}>
                <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e2e8f0" }}>
                  <MilestoneGraph milestones={milestones} type="payment" title="💰 Payment Milestone Progress" />
                </div>
                <div style={{ background:"#f8fafc",borderRadius:12,padding:16,border:"1px solid #e2e8f0" }}>
                  <MilestoneGraph milestones={milestones} type="work" title="🏗 Work Completion Progress" />
                </div>
              </div>
            )}

            {/* MILESTONE TABLE — Excel style */}
            <div style={{ fontSize:12,fontWeight:700,color:"#64748b",letterSpacing:0.5,marginBottom:12 }}>PAYMENT SCHEDULE</div>
            {milestones.length===0
              ?<div style={{ textAlign:"center",color:"#94a3b8",fontSize:13,padding:30 }}>No milestones yet. {isAdmin?"Click \"+ Milestone\" to add.":""}</div>
              :<div style={{ overflowX:"auto",borderRadius:10,border:"1px solid #e2e8f0" }}>
                <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
                  <thead>
                    <tr style={{ background:"#0f172a",color:"#fff" }}>
                      <th style={{ padding:"10px 14px",textAlign:"left",fontWeight:600,fontSize:11 }}>#</th>
                      <th style={{ padding:"10px 14px",textAlign:"left",fontWeight:600,fontSize:11 }}>Schedule / Milestone</th>
                      <th style={{ padding:"10px 14px",textAlign:"right",fontWeight:600,fontSize:11 }}>Amount (OMR)</th>
                      <th style={{ padding:"10px 14px",textAlign:"right",fontWeight:600,fontSize:11 }}>Paid (OMR)</th>
                      <th style={{ padding:"10px 14px",textAlign:"center",fontWeight:600,fontSize:11 }}>Date Paid</th>
                      <th style={{ padding:"10px 14px",textAlign:"right",fontWeight:600,fontSize:11 }}>Balance (OMR)</th>
                      <th style={{ padding:"10px 14px",textAlign:"center",fontWeight:600,fontSize:11 }}>Account</th>
                      <th style={{ padding:"10px 14px",textAlign:"center",fontWeight:600,fontSize:11 }}>Status</th>
                      {isAdmin&&<th style={{ padding:"10px 14px",textAlign:"center",fontWeight:600,fontSize:11 }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map((m,i)=>{
                      const isPaid = m.status==="Completed";
                      const paidAmt = parseFloat(m.paid_amount||0);
                      const contractAmt = parseFloat(m.amount||0);
                      const balance = contractAmt - paidAmt;
                      return (
                        <tr key={m.id} style={{ borderTop:"1px solid #f1f5f9",background:isPaid?"#f0fdf4":i%2===0?"#fff":"#f8fafc" }}>
                          <td style={{ padding:"10px 14px",color:"#94a3b8",fontWeight:700 }}>{i+1}</td>
                          <td style={{ padding:"10px 14px" }}>
                            {isAdmin&&!isPaid
                              ?<input value={m.label} onChange={e=>updateMilestone(m.id,"label",e.target.value)}
                                  style={{ width:"100%",background:"transparent",border:"none",color:"#1e293b",fontSize:13,fontWeight:600,outline:"none" }} />
                              :<span style={{ color:"#1e293b",fontWeight:600 }}>{m.label}</span>
                            }
                          </td>
                          <td style={{ padding:"10px 14px",textAlign:"right" }}>
                            {isAdmin&&!isPaid
                              ?<input type="number" value={m.amount} onChange={e=>updateMilestone(m.id,"amount",parseFloat(e.target.value)||0)}
                                  style={{ width:90,border:"1px solid #e2e8f0",borderRadius:6,padding:"4px 8px",fontSize:12,textAlign:"right",color:"#6366f1",fontWeight:700 }} />
                              :<span style={{ color:"#6366f1",fontWeight:700 }}>{contractAmt.toFixed(3)}</span>
                            }
                          </td>
                          <td style={{ padding:"10px 14px",textAlign:"right" }}>
                            <span style={{ color:"#10b981",fontWeight:700 }}>{paidAmt>0?paidAmt.toFixed(3):"—"}</span>
                          </td>
                          <td style={{ padding:"10px 14px",textAlign:"center" }}>
                            <span style={{ color:"#64748b",fontSize:12 }}>{m.payment_date||"—"}</span>
                          </td>
                          <td style={{ padding:"10px 14px",textAlign:"right",fontWeight:800,
                            color:balance>0?"#ef4444":balance===0?"#10b981":"#f59e0b" }}>
                            {balance!==0?balance.toFixed(3):"✓ Paid"}
                          </td>
                          <td style={{ padding:"10px 14px",textAlign:"center" }}>
                            <span style={{fontSize:10,color:"#10b981"}}>{bankAccounts.find(a=>a.id===m.bank_account_id)?.account_name||"—"}</span>
                          </td>
                          <td style={{ padding:"10px 14px",textAlign:"center" }}>
                            <span style={{ background:statusBg[m.status],color:statusColor[m.status],borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700 }}>
                              {m.status}
                            </span>
                          </td>
                          {isAdmin&&<td style={{ padding:"10px 14px",textAlign:"center" }}>
                            <button onClick={()=>confirmAction("Move this milestone to Trash?",async()=>{
                              await supabase.from("sub_milestones").update({deleted_at:new Date().toISOString()}).eq("id",m.id);
                              setMilestones(milestones.filter(x=>x.id!==m.id));
                            })} style={{ background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11 }}>🗑</button>
                          </td>}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop:"2px solid #e2e8f0",background:"#f8fafc" }}>
                      <td colSpan={2} style={{ padding:"10px 14px",fontWeight:800,color:"#0f172a" }}>TOTAL</td>
                      <td style={{ padding:"10px 14px",textAlign:"right",fontWeight:800,color:"#6366f1" }}>
                        {milestones.reduce((s,m)=>s+parseFloat(m.amount||0),0).toFixed(3)}
                      </td>
                      <td style={{ padding:"10px 14px",textAlign:"right",fontWeight:800,color:"#10b981" }}>
                        {milestones.reduce((s,m)=>s+parseFloat(m.paid_amount||0),0).toFixed(3)}
                      </td>
                      <td></td>
                      <td style={{ padding:"10px 14px",textAlign:"right",fontWeight:800,color:"#ef4444" }}>
                        {milestones.reduce((s,m)=>s+parseFloat(m.amount||0)-parseFloat(m.paid_amount||0),0).toFixed(3)}
                      </td>
                      <td colSpan={isAdmin?2:1}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            }
          </div>
        </div>
      )}
    </div>
  );
}
