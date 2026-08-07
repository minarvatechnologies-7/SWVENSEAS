import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../context/AdminContext";
const URGENCY=["Low","Medium","High","Urgent"];const STATUS=["Pending","Approved","Fulfilled","Rejected"];const UNITS=["pcs","bag","ton","kg","m","m²","m³","ltr","roll","box","set","bundle"];
export default function MaterialRequests(){
  const{isAdmin:r,canEdit,confirmAction,logActivity}=useAdmin();const isAdmin=canEdit("material_requests");
  const[requests,setRequests]=useState([]);const[items,setItems]=useState([]);const[loading,setLoading]=useState(true);
  const[showForm,setShowForm]=useState(false);const[editId,setEditId]=useState(null);const[filterStatus,setFilterStatus]=useState("All");
  const[saving,setSaving]=useState(false);const[msg,setMsg]=useState("");
  const[form,setForm]=useState({project:"",site:"",requested_by:"",urgency:"Medium",notes:"",items:[{item_name:"",quantity:"1",unit:"pcs",estimated_cost:""}]});
  const load=async()=>{const[r,i]=await Promise.all([supabase.from("material_requests").select("*").is("deleted_at",null).order("created_at",{ascending:false}),supabase.from("material_request_items").select("*").is("deleted_at",null)]);setRequests(r.data||[]);setItems(i.data||[]);setLoading(false);};
  useEffect(()=>{load();},[]);
  const showMsg=(t)=>{setMsg(t);setTimeout(()=>setMsg(""),3000);};
  const inp={border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:13,width:"100%",boxSizing:"border-box",outline:"none",background:"#fff"};
  const saveRequest=async()=>{if(!form.site.trim()&&!form.project.trim()){showMsg("❌ Project or site required");return;}const validItems=form.items.filter(i=>i.item_name.trim());if(!validItems.length){showMsg("❌ Add at least one item");return;}setSaving(true);const totalVal=validItems.reduce((s,i)=>s+(parseFloat(i.quantity)||0)*(parseFloat(i.estimated_cost)||0),0);const row={request_number:editId?undefined:"MR-"+Date.now().toString().slice(-8),project:form.project,site:form.site,requested_by:form.requested_by,urgency:form.urgency,notes:form.notes,total_value:totalVal};let reqId=editId;if(editId){await supabase.from("material_requests").update(row).eq("id",editId);await supabase.from("material_request_items").delete().eq("request_id",editId);}else{const{data}=await supabase.from("material_requests").insert(row).select().single();reqId=data?.id;}if(reqId){await supabase.from("material_request_items").insert(validItems.map(i=>({request_id:reqId,item_name:i.item_name,quantity:parseFloat(i.quantity)||1,unit:i.unit,estimated_cost:parseFloat(i.estimated_cost)||0})));}logActivity(editId?"Edited MRN":"Created MRN",`${form.site||form.project}`,"Material Requests");showMsg("✅ Saved!");setShowForm(false);setEditId(null);setForm({project:"",site:"",requested_by:"",urgency:"Medium",notes:"",items:[{item_name:"",quantity:"1",unit:"pcs",estimated_cost:""}]});await load();setSaving(false);};
  const updateStatus=async(req,s)=>{await supabase.from("material_requests").update({status:s,fulfilled_date:s==="Fulfilled"?new Date().toISOString().split("T")[0]:null}).eq("id",req.id);logActivity(`MRN ${s}`,req.request_number,"Material Requests");showMsg(`✅ ${s}`);await load();};
  const filtered=requests.filter(r=>filterStatus==="All"||r.status===filterStatus);
  const counts={Pending:requests.filter(r=>r.status==="Pending").length,Approved:requests.filter(r=>r.status==="Approved").length,Fulfilled:requests.filter(r=>r.status==="Fulfilled").length};
  if(loading)return<div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>Loading...</div>;
  return(
    <div style={{padding:"24px 28px",maxWidth:1400}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div><h2 style={{margin:0,fontSize:22,color:"#0f172a"}}>📋 Material Requests</h2><div style={{fontSize:13,color:"#64748b"}}>Manage material requests from sites</div></div>
        {msg&&<span style={{fontSize:12,fontWeight:600,color:msg.startsWith("✅")?"#10b981":"#ef4444",padding:"6px 14px",borderRadius:20,background:msg.startsWith("✅")?"#ecfdf5":"#fef2f2"}}>{msg}</span>}
        {isAdmin&&<button onClick={()=>{setForm({project:"",site:"",requested_by:"",urgency:"Medium",notes:"",items:[{item_name:"",quantity:"1",unit:"pcs",estimated_cost:""}]});setEditId(null);setShowForm(true);}} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Create Request</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:20}}>
        {[["Pending",counts.Pending,"#f59e0b"],["Approved",counts.Approved,"#6366f1"],["Fulfilled",counts.Fulfilled,"#10b981"],["Total Value",`OMR ${requests.reduce((s,r)=>s+parseFloat(r.total_value||0),0).toFixed(3)}`,"#1e293b"]].map(([l,v,c])=>(<div key={l} style={{background:"#fff",borderRadius:12,padding:"16px 20px",border:"1px solid #e2e8f0"}}><div style={{fontSize:11,color:"#64748b",fontWeight:600}}>{l}</div><div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div></div>))}
      </div>
      <div style={{display:"flex",gap:6,marginBottom:16}}>{["All",...STATUS].map(s=>(<button key={s} onClick={()=>setFilterStatus(s)} style={{padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:filterStatus===s?"#6366f1":"#f1f5f9",color:filterStatus===s?"#fff":"#64748b"}}>{s}</button>))}</div>
      {filtered.map(req=>{const reqItems=items.filter(i=>i.request_id===req.id);const urgCol=req.urgency==="Urgent"?"#ef4444":req.urgency==="High"?"#f59e0b":"#6366f1";const stCol=req.status==="Pending"?"#f59e0b":req.status==="Approved"?"#6366f1":req.status==="Fulfilled"?"#10b981":"#ef4444";
      return(<div key={req.id} style={{background:"#fff",borderRadius:12,padding:18,border:"1px solid #e2e8f0",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:10}}>
          <div><span style={{fontWeight:700,color:"#1e293b",marginRight:10}}>{req.request_number}</span><span style={{background:`${urgCol}20`,color:urgCol,borderRadius:10,padding:"2px 10px",fontSize:11,fontWeight:600,marginRight:6}}>{req.urgency}</span><span style={{background:`${stCol}20`,color:stCol,borderRadius:10,padding:"2px 10px",fontSize:11,fontWeight:600}}>{req.status}</span></div>
          <div style={{fontSize:12,color:"#94a3b8"}}>{req.request_date} · {req.site||req.project} · {req.requested_by||"—"}</div>
        </div>
        <table style={{width:"100%",fontSize:12,borderCollapse:"collapse",marginBottom:10}}><thead><tr style={{background:"#f8fafc"}}>{["Item","Qty","Unit","Est. Cost"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:"#64748b",fontSize:11}}>{h}</th>)}</tr></thead><tbody>{reqItems.map(i=>(<tr key={i.id} style={{borderTop:"1px solid #f1f5f9"}}><td style={{padding:"6px 10px",fontWeight:600}}>{i.item_name}</td><td style={{padding:"6px 10px"}}>{i.quantity}</td><td style={{padding:"6px 10px",color:"#64748b"}}>{i.unit}</td><td style={{padding:"6px 10px"}}>OMR {parseFloat(i.estimated_cost||0).toFixed(3)}</td></tr>))}</tbody></table>
        {isAdmin&&req.status!=="Fulfilled"&&req.status!=="Rejected"&&(<div style={{display:"flex",gap:6}}>
          {req.status==="Pending"&&<button onClick={()=>updateStatus(req,"Approved")} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:6,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>✅ Approve</button>}
          {(req.status==="Pending"||req.status==="Approved")&&<button onClick={()=>updateStatus(req,"Fulfilled")} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:6,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>📦 Fulfilled</button>}
          {req.status==="Pending"&&<button onClick={()=>updateStatus(req,"Rejected")} style={{background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:6,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>✕ Reject</button>}
        </div>)}
      </div>);})}
      {filtered.length===0&&<div style={{padding:40,textAlign:"center",color:"#94a3b8",background:"#f8fafc",borderRadius:12}}>No requests found.</div>}
      {showForm&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowForm(false)}><div style={{background:"#fff",borderRadius:16,padding:28,width:"min(600px,90vw)",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <h3 style={{margin:"0 0 16px",fontSize:16}}>📋 {editId?"Edit":"New"} Material Request</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          <div><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Project</div><input value={form.project} onChange={e=>setForm(p=>({...p,project:e.target.value}))} style={inp}/></div>
          <div><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Site *</div><input value={form.site} onChange={e=>setForm(p=>({...p,site:e.target.value}))} style={inp}/></div>
          <div><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Requested By</div><input value={form.requested_by} onChange={e=>setForm(p=>({...p,requested_by:e.target.value}))} style={inp}/></div>
          <div><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Urgency</div><select value={form.urgency} onChange={e=>setForm(p=>({...p,urgency:e.target.value}))} style={inp}>{URGENCY.map(u=><option key={u}>{u}</option>)}</select></div>
        </div>
        <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Items</div>
        {form.items.map((it,idx)=>(<div key={idx} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr auto",gap:6,marginBottom:6}}>
          <input value={it.item_name} onChange={e=>{const ni=[...form.items];ni[idx].item_name=e.target.value;setForm(p=>({...p,items:ni}));}} placeholder="Item *" style={inp}/>
          <input type="number" value={it.quantity} onChange={e=>{const ni=[...form.items];ni[idx].quantity=e.target.value;setForm(p=>({...p,items:ni}));}} style={inp}/>
          <select value={it.unit} onChange={e=>{const ni=[...form.items];ni[idx].unit=e.target.value;setForm(p=>({...p,items:ni}));}} style={inp}>{UNITS.map(u=><option key={u}>{u}</option>)}</select>
          <input type="number" value={it.estimated_cost} onChange={e=>{const ni=[...form.items];ni[idx].estimated_cost=e.target.value;setForm(p=>({...p,items:ni}));}} placeholder="Cost" step="0.001" style={inp}/>
          {form.items.length>1&&<button onClick={()=>{const ni=[...form.items];ni.splice(idx,1);setForm(p=>({...p,items:ni}));}} style={{background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:6,padding:"6px",cursor:"pointer"}}>✕</button>}
        </div>))}
        <button onClick={()=>setForm(p=>({...p,items:[...p.items,{item_name:"",quantity:"1",unit:"pcs",estimated_cost:""}]}))} style={{background:"#f1f5f9",color:"#6366f1",border:"none",borderRadius:6,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",marginBottom:14}}>+ Add Item</button>
        <div style={{display:"flex",gap:10}}><button onClick={saveRequest} disabled={saving} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{saving?"Saving...":"💾 Save"}</button><button onClick={()=>setShowForm(false)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"10px 14px",fontSize:13,cursor:"pointer"}}>Cancel</button></div>
      </div></div>)}
    </div>);
}
