import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../context/AdminContext";
const STATUSES=["Available","In Use","Maintenance","Retired"];
const DEFAULT_EQUIP=["Excavator","Loader","Crane","Truck","Mixer","Compactor","Generator","Welder","JCB","Dump Truck","Scaffolding","Roller","Bulldozer","Forklift","Water Tanker","Concrete Pump"];
const empty=()=>({name:"",customName:"",quantity:"1",status:"Available",current_site:"",customSite:"",daily_rate:"",notes:""});

const INP={border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:13,width:"100%",boxSizing:"border-box",outline:"none",background:"#fff"};

// Stable, top-level Site selector. Defining this OUTSIDE the page component is
// essential: a component defined inside the render gets a new identity on every
// keystroke, which unmounts/remounts the input and loses focus (the "only one
// letter" bug).
function SiteSelect({value,onChange,customValue,onCustomChange,sites=[]}){
  return(
    <div>
      <select value={value} onChange={e=>onChange(e.target.value)} style={INP}>
        <option value="">-- Select Site --</option>
        {sites.map(s=><option key={s} value={s}>{s}</option>)}
        <option value="__custom__">➕ Add Custom Site...</option>
      </select>
      {value==="__custom__"&&<input value={customValue} onChange={e=>onCustomChange(e.target.value)} placeholder="Type new site name..." style={{...INP,marginTop:6,border:"2px solid #6366f1"}}/>}
    </div>
  );
}

export default function Equipment(){
  const{isAdmin:r,canEdit,confirmAction,logActivity}=useAdmin();const isAdmin=canEdit("equipment");
  const[equip,setEquip]=useState([]);const[schedules,setSchedules]=useState([]);const[sites,setSites]=useState([]);
  const[loading,setLoading]=useState(true);const[tab,setTab]=useState("fleet");
  const[showForm,setShowForm]=useState(false);const[form,setForm]=useState(empty());const[editId,setEditId]=useState(null);
  const[filterStatus,setFilterStatus]=useState("All");const[saving,setSaving]=useState(false);const[msg,setMsg]=useState("");
  const[showSched,setShowSched]=useState(null);const[schedSite,setSchedSite]=useState("");const[schedCustom,setSchedCustom]=useState("");
  const[showTransfer,setShowTransfer]=useState(null);const[transferSite,setTransferSite]=useState("");const[transferCustom,setTransferCustom]=useState("");
  const[schedQty,setSchedQty]=useState("");const[transferQty,setTransferQty]=useState("");
  const[showRelease,setShowRelease]=useState(null);const[releaseQty,setReleaseQty]=useState("");

  const load=async()=>{
    const[e,s,p]=await Promise.all([supabase.from("equipment").select("*").is("deleted_at",null).order("name"),supabase.from("equipment_schedule").select("*").order("start_date",{ascending:false}),supabase.from("projects").select("name,site").order("name")]);
    setEquip(e.data||[]);setSchedules(s.data||[]);
    const allSites=new Set();(p.data||[]).forEach(pr=>{if(pr.name)allSites.add(pr.name);if(pr.site)allSites.add(pr.site);});(e.data||[]).forEach(eq=>{if(eq.current_site)allSites.add(eq.current_site);});(s.data||[]).forEach(sc=>{if(sc.site)allSites.add(sc.site);});
    setSites([...allSites].filter(Boolean).sort());setLoading(false);
  };
  useEffect(()=>{load();},[]);
  const showMsg=(t)=>{setMsg(t);setTimeout(()=>setMsg(""),3000);};
  const inp={border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:13,width:"100%",boxSizing:"border-box",outline:"none",background:"#fff"};

  // All known equipment names (defaults + previously added)
  const equipNames=[...new Set([...DEFAULT_EQUIP,...equip.map(e=>e.name).filter(Boolean)])].sort();

  // Get the final name/site value (handles custom)
  const getFinalName=()=>form.name==="__custom__"?form.customName.trim():form.name;
  const getFinalSite=()=>form.current_site==="__custom__"?form.customSite.trim():form.current_site;

  const saveEquip=async()=>{const finalName=getFinalName();if(!finalName){showMsg("❌ Equipment name required");return;}setSaving(true);
    const row={name:finalName,quantity:parseFloat(form.quantity)||1,status:form.status,current_site:getFinalSite(),daily_rate:parseFloat(form.daily_rate)||0,notes:form.notes};
    let error;
    if(editId){({error}=await supabase.from("equipment").update(row).eq("id",editId));if(!error)logActivity("Edited equipment",finalName,"Equipment");}
    else{({error}=await supabase.from("equipment").insert(row));if(!error)logActivity("Added equipment",finalName,"Equipment");}
    if(error){showMsg("❌ "+error.message);setSaving(false);return;}
    showMsg("✅ Saved!");setShowForm(false);setForm(empty());setEditId(null);await load();setSaving(false);};
  const deleteEquip=(item)=>{confirmAction(`Move "${item.name}" to Trash?`,async()=>{const{error}=await supabase.from("equipment").update({deleted_at:new Date().toISOString()}).eq("id",item.id);if(error){showMsg("❌ "+error.message);return;}logActivity("Moved equipment to Trash",item.name,"Equipment");showMsg("✅ Moved to Trash");await load();});};

  // Move `moveQty` units of `eq` into a new state/site. If moving the whole
  // quantity, just update the row. If partial, reduce the source row and create
  // a new row for the moved units. Returns an error message or null.
  const splitMove=async(eq,moveQty,updates,note,site)=>{
    const total=parseFloat(eq.quantity)||1;
    if(moveQty>=total){
      const{error}=await supabase.from("equipment").update(updates).eq("id",eq.id);
      if(error)return error.message;
    }else{
      const{error:e1}=await supabase.from("equipment").update({quantity:total-moveQty}).eq("id",eq.id);
      if(e1)return e1.message;
      const newRow={name:eq.name,type:eq.type,model:eq.model,registration:eq.registration,operator:eq.operator,daily_rate:eq.daily_rate,notes:eq.notes,quantity:moveQty,...updates};
      const{error:e2}=await supabase.from("equipment").insert(newRow);
      if(e2)return e2.message;
    }
    const{error:e3}=await supabase.from("equipment_schedule").insert({equipment_id:eq.id,site,start_date:new Date().toISOString().split("T")[0],notes:note});
    if(e3)return e3.message;
    return null;
  };

  const doAssign=async()=>{const site=schedSite==="__custom__"?schedCustom.trim():schedSite;if(!site){showMsg("❌ Select site");return;}
    const eq=equip.find(e=>e.id===showSched);if(!eq)return;const total=parseFloat(eq.quantity)||1;const n=parseFloat(schedQty)||total;
    if(n<1||n>total){showMsg(`❌ Quantity must be 1 to ${total}`);return;}setSaving(true);
    const note=n<total?`Assigned ${n} of ${total}`:"Assigned";
    const err=await splitMove(eq,n,{status:"In Use",current_site:site},note,site);
    if(err){showMsg("❌ "+err);setSaving(false);return;}
    logActivity("Assigned",`${eq.name} (${n}) → ${site}`,"Equipment");
    showMsg("✅ Assigned!");setShowSched(null);setSchedSite("");setSchedCustom("");setSchedQty("");await load();setSaving(false);};

  const doTransfer=async()=>{const site=transferSite==="__custom__"?transferCustom.trim():transferSite;if(!site){showMsg("❌ Select new site");return;}
    const eq=equip.find(e=>e.id===showTransfer);if(!eq)return;const total=parseFloat(eq.quantity)||1;const n=parseFloat(transferQty)||total;
    if(n<1||n>total){showMsg(`❌ Quantity must be 1 to ${total}`);return;}setSaving(true);
    const note=n<total?`From ${eq.current_site||"—"} (${n} of ${total})`:`From ${eq.current_site||"—"}`;
    const err=await splitMove(eq,n,{status:"In Use",current_site:site},note,site);
    if(err){showMsg("❌ "+err);setSaving(false);return;}
    logActivity("Transferred",`${eq.name} (${n}): ${eq.current_site} → ${site}`,"Equipment");
    showMsg("✅ Transferred!");setShowTransfer(null);setTransferSite("");setTransferCustom("");setTransferQty("");await load();setSaving(false);};

  const doRelease=async()=>{const eq=equip.find(e=>e.id===showRelease);if(!eq)return;const total=parseFloat(eq.quantity)||1;const n=parseFloat(releaseQty)||total;
    if(n<1||n>total){showMsg(`❌ Quantity must be 1 to ${total}`);return;}setSaving(true);
    const note=n<total?`Released ${n} of ${total}`:"Released";
    const err=await splitMove(eq,n,{status:"Available",current_site:""},note,eq.current_site);
    if(err){showMsg("❌ "+err);setSaving(false);return;}
    logActivity("Released",`${eq.name} (${n})`,"Equipment");
    showMsg("✅ Released!");setShowRelease(null);setReleaseQty("");await load();setSaving(false);};

  const filtered=equip.filter(e=>filterStatus==="All"||e.status===filterStatus);
  const stColor=(s)=>s==="Available"?"#10b981":s==="In Use"?"#6366f1":s==="Maintenance"?"#f59e0b":"#94a3b8";
  if(loading)return<div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>Loading...</div>;

  return(
    <div style={{padding:"24px 28px",maxWidth:1400}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div><h2 style={{margin:0,fontSize:22,color:"#0f172a"}}>🚜 Equipment</h2><div style={{fontSize:13,color:"#64748b"}}>Track machinery and site assignments</div></div>
        {msg&&<span style={{fontSize:12,fontWeight:600,color:msg.startsWith("✅")?"#10b981":"#ef4444",padding:"6px 14px",borderRadius:20,background:msg.startsWith("✅")?"#ecfdf5":"#fef2f2"}}>{msg}</span>}
        {isAdmin&&<button onClick={()=>{setForm(empty());setEditId(null);setShowForm(true);}} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Add Equipment</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:20}}>
        {[["Total",equip.length,"#6366f1"],["In Use",equip.filter(e=>e.status==="In Use").length,"#8b5cf6"],["Available",equip.filter(e=>e.status==="Available").length,"#10b981"],["Maintenance",equip.filter(e=>e.status==="Maintenance").length,"#f59e0b"]].map(([l,v,c])=>(<div key={l} style={{background:"#fff",borderRadius:12,padding:"16px 20px",border:"1px solid #e2e8f0"}}><div style={{fontSize:11,color:"#64748b",fontWeight:600}}>{l}</div><div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div></div>))}
      </div>
      <div style={{display:"flex",gap:4,marginBottom:16}}>{[["fleet","🚜 Fleet"],["schedule","📅 History"]].map(([id,label])=>(<button key={id} onClick={()=>setTab(id)} style={{padding:"10px 20px",borderRadius:"10px 10px 0 0",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,background:tab===id?"#6366f1":"#f1f5f9",color:tab===id?"#fff":"#64748b"}}>{label}</button>))}</div>

      {tab==="fleet"&&(<div>
        <div style={{display:"flex",gap:6,marginBottom:14}}>{["All",...STATUSES].map(s=>(<button key={s} onClick={()=>setFilterStatus(s)} style={{padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:filterStatus===s?"#6366f1":"#f1f5f9",color:filterStatus===s?"#fff":"#64748b"}}>{s}</button>))}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
          {filtered.map(eq=>{const sc=stColor(eq.status);return(
            <div key={eq.id} style={{background:"#fff",borderRadius:12,padding:18,border:"1px solid #e2e8f0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div style={{fontWeight:700,fontSize:16,color:"#0f172a"}}>{eq.name}</div><span style={{background:`${sc}20`,color:sc,borderRadius:10,padding:"2px 10px",fontSize:11,fontWeight:600}}>{eq.status}</span></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,fontSize:12,color:"#64748b",marginBottom:12}}>
                <div>Qty: <strong style={{color:"#6366f1"}}>{eq.quantity||1}</strong> · 📍 <strong style={{color:"#1e293b"}}>{eq.current_site||"—"}</strong></div>
                <div>💰 <strong style={{color:"#10b981"}}>OMR {parseFloat(eq.daily_rate||0).toFixed(3)}/day</strong></div>
              </div>
              {isAdmin&&(<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {eq.status==="Available"&&<button onClick={()=>{setShowSched(eq.id);setSchedSite("");setSchedCustom("");setSchedQty(String(eq.quantity||1));}} style={{flex:1,background:"#eef2ff",color:"#6366f1",border:"1px solid #c7d2fe",borderRadius:8,padding:"7px",fontSize:12,fontWeight:700,cursor:"pointer"}}>📌 Assign</button>}
                {eq.status==="In Use"&&<>
                  <button onClick={()=>{setShowTransfer(eq.id);setTransferSite("");setTransferCustom("");setTransferQty(String(eq.quantity||1));}} style={{flex:1,background:"#fffbeb",color:"#92400e",border:"1px solid #fcd34d",borderRadius:8,padding:"7px",fontSize:12,fontWeight:700,cursor:"pointer"}}>🔄 Transfer</button>
                  <button onClick={()=>{setShowRelease(eq.id);setReleaseQty("");}} style={{background:"#ecfdf5",color:"#10b981",border:"1px solid #86efac",borderRadius:8,padding:"7px",fontSize:12,fontWeight:700,cursor:"pointer"}}>✅ Release</button>
                </>}
                <button onClick={()=>{const isInList=equipNames.includes(eq.name);setForm({name:isInList?eq.name:"__custom__",customName:isInList?"":eq.name,quantity:String(eq.quantity||1),status:eq.status,current_site:sites.includes(eq.current_site)?eq.current_site:(eq.current_site?"__custom__":""),customSite:sites.includes(eq.current_site)?"":eq.current_site||"",daily_rate:String(eq.daily_rate||""),notes:eq.notes||""});setEditId(eq.id);setShowForm(true);}} style={{background:"#eef2ff",color:"#6366f1",border:"none",borderRadius:8,padding:"7px 10px",fontSize:12,cursor:"pointer"}}>✏️</button>
                <button onClick={()=>deleteEquip(eq)} style={{background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:8,padding:"7px 10px",fontSize:12,cursor:"pointer"}}>🗑</button>
              </div>)}
            </div>);})}
        </div>
        {filtered.length===0&&<div style={{padding:40,textAlign:"center",color:"#94a3b8",background:"#f8fafc",borderRadius:12}}>No equipment. Click "+ Add Equipment".</div>}
      </div>)}

      {tab==="schedule"&&(<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr style={{background:"#f8fafc"}}>{["Equipment","Site","Date","Notes"].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",color:"#64748b",fontWeight:600,fontSize:11,borderBottom:"1px solid #e2e8f0"}}>{h}</th>)}</tr></thead><tbody>
        {schedules.map((s,i)=>{const eq=equip.find(e=>e.id===s.equipment_id);return(<tr key={s.id} style={{borderTop:"1px solid #f1f5f9",background:i%2===0?"#fff":"#fafbfc"}}><td style={{padding:"10px 14px",fontWeight:600}}>{eq?.name||"?"}</td><td style={{padding:"10px 14px"}}>{s.site||"—"}</td><td style={{padding:"10px 14px",color:"#64748b"}}>{s.start_date||"—"}</td><td style={{padding:"10px 14px",color:"#94a3b8",fontSize:12}}>{s.notes||"—"}</td></tr>);})}
        {schedules.length===0&&<tr><td colSpan={4} style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No history.</td></tr>}
      </tbody></table></div>)}

      {/* Add/Edit form */}
      {showForm&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowForm(false)}><div style={{background:"#fff",borderRadius:16,padding:28,width:"min(440px,90vw)"}} onClick={e=>e.stopPropagation()}>
        <h3 style={{margin:"0 0 16px",fontSize:16}}>🚜 {editId?"Edit":"Add"} Equipment</h3>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Equipment Name *</div>
          <select value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value,customName:""}))} style={inp}>
            <option value="">-- Select Equipment --</option>
            {equipNames.map(n=><option key={n} value={n}>{n}</option>)}
            <option value="__custom__">➕ Add Custom Equipment...</option>
          </select>
          {form.name==="__custom__"&&<input value={form.customName} onChange={e=>setForm(p=>({...p,customName:e.target.value}))} placeholder="Type custom equipment name..." style={{...inp,marginTop:6,border:"2px solid #6366f1"}} autoFocus/>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
          <div><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Quantity</div><input type="number" value={form.quantity} onChange={e=>setForm(p=>({...p,quantity:e.target.value}))} min="1" style={inp}/></div>
          <div><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Status</div><select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))} style={inp}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Rate/Day (OMR)</div><input type="number" value={form.daily_rate} onChange={e=>setForm(p=>({...p,daily_rate:e.target.value}))} step="0.001" style={inp}/></div>
        </div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Current Site</div>
          <SiteSelect value={form.current_site} onChange={v=>setForm(p=>({...p,current_site:v,customSite:""}))} customValue={form.customSite} onCustomChange={v=>setForm(p=>({...p,customSite:v}))} sites={sites}/>
        </div>
        <div style={{marginBottom:12}}><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Notes</div><input value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} style={inp}/></div>
        <div style={{display:"flex",gap:10}}><button onClick={saveEquip} disabled={saving} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{saving?"Saving...":"💾 Save"}</button><button onClick={()=>setShowForm(false)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"10px 14px",fontSize:13,cursor:"pointer"}}>Cancel</button></div>
      </div></div>)}

      {/* Assign to site */}
      {showSched&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowSched(null)}><div style={{background:"#fff",borderRadius:16,padding:28,width:"min(400px,90vw)"}} onClick={e=>e.stopPropagation()}>
        <h3 style={{margin:"0 0 12px",fontSize:16}}>📌 Assign: {equip.find(e=>e.id===showSched)?.name}</h3>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Quantity * (available: {equip.find(e=>e.id===showSched)?.quantity||1})</div>
          <input type="number" min="1" max={equip.find(e=>e.id===showSched)?.quantity||1} value={schedQty} onChange={e=>setSchedQty(e.target.value)} style={inp}/>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Site *</div>
          <SiteSelect value={schedSite} onChange={setSchedSite} customValue={schedCustom} onCustomChange={setSchedCustom} sites={sites}/>
        </div>
        <div style={{display:"flex",gap:10}}><button onClick={doAssign} disabled={saving} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{saving?"...":"📌 Assign"}</button><button onClick={()=>setShowSched(null)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"10px 14px",fontSize:13,cursor:"pointer"}}>Cancel</button></div>
      </div></div>)}

      {/* Transfer site */}
      {showTransfer&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowTransfer(null)}><div style={{background:"#fff",borderRadius:16,padding:28,width:"min(400px,90vw)"}} onClick={e=>e.stopPropagation()}>
        <h3 style={{margin:"0 0 4px",fontSize:16}}>🔄 Transfer: {equip.find(e=>e.id===showTransfer)?.name}</h3>
        <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Current: <strong>{equip.find(e=>e.id===showTransfer)?.current_site||"—"}</strong></div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Quantity to transfer * (total: {equip.find(e=>e.id===showTransfer)?.quantity||1})</div>
          <input type="number" min="1" max={equip.find(e=>e.id===showTransfer)?.quantity||1} value={transferQty} onChange={e=>setTransferQty(e.target.value)} style={inp}/>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>New Site *</div>
          <SiteSelect value={transferSite} onChange={setTransferSite} customValue={transferCustom} onCustomChange={setTransferCustom} sites={sites}/>
        </div>
        <div style={{display:"flex",gap:10}}><button onClick={doTransfer} disabled={saving} style={{background:"#f59e0b",color:"#fff",border:"none",borderRadius:8,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{saving?"...":"🔄 Transfer"}</button><button onClick={()=>setShowTransfer(null)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"10px 14px",fontSize:13,cursor:"pointer"}}>Cancel</button></div>
      </div></div>)}

      {/* Release with quantity */}
      {showRelease&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowRelease(null)}><div style={{background:"#fff",borderRadius:16,padding:28,width:"min(400px,90vw)"}} onClick={e=>e.stopPropagation()}>
        <h3 style={{margin:"0 0 4px",fontSize:16}}>✅ Release: {equip.find(e=>e.id===showRelease)?.name}</h3>
        <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>From: <strong>{equip.find(e=>e.id===showRelease)?.current_site||"—"}</strong> · returns to Available</div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Quantity to release * (in use: {equip.find(e=>e.id===showRelease)?.quantity||1})</div>
          <input type="number" min="1" max={equip.find(e=>e.id===showRelease)?.quantity||1} value={releaseQty} onChange={e=>setReleaseQty(e.target.value)} style={inp}/>
        </div>
        <div style={{display:"flex",gap:10}}><button onClick={doRelease} disabled={saving} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:8,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{saving?"...":"✅ Release"}</button><button onClick={()=>setShowRelease(null)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"10px 14px",fontSize:13,cursor:"pointer"}}>Cancel</button></div>
      </div></div>)}
    </div>);
}
