import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../context/AdminContext";
const CATS=["General","Cement","Steel","Sand","Aggregate","Timber","Plumbing","Electrical","Paint","Hardware","Safety","Other"];
const UNITS=["pcs","bag","ton","kg","m","m²","m³","trip","load","ltr","roll","box","set","bundle"];
const emptyItem=()=>({name:"",description:"",category:"General",unit:"pcs",current_stock:"",min_stock:"",max_stock:"",cost_per_unit:"",supplier:"",site:"",notes:""});
export default function Inventory(){
  const{isAdmin:r,canEdit,confirmAction,logActivity}=useAdmin();const isAdmin=canEdit("inventory");
  const[items,setItems]=useState([]);const[txns,setTxns]=useState([]);const[loading,setLoading]=useState(true);
  const[tab,setTab]=useState("stock");const[showForm,setShowForm]=useState(false);const[form,setForm]=useState(emptyItem());
  const[editId,setEditId]=useState(null);const[search,setSearch]=useState("");const[filterCat,setFilterCat]=useState("All");
  const[saving,setSaving]=useState(false);const[msg,setMsg]=useState("");
  const[adjItem,setAdjItem]=useState(null);const[adjType,setAdjType]=useState("in");const[adjQty,setAdjQty]=useState("");const[adjNotes,setAdjNotes]=useState("");
  const load=async()=>{const[i,t]=await Promise.all([supabase.from("inventory_items").select("*").is("deleted_at",null).order("name"),supabase.from("inventory_transactions").select("*").is("deleted_at",null).order("created_at",{ascending:false}).limit(200)]);setItems(i.data||[]);setTxns(t.data||[]);setLoading(false);};
  useEffect(()=>{load();},[]);
  const showMsg=(t)=>{setMsg(t);setTimeout(()=>setMsg(""),3000);};
  const f=(n)=>parseFloat(n||0).toFixed(3);
  const inp={border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:13,width:"100%",boxSizing:"border-box",outline:"none",background:"#fff"};
  const saveItem=async()=>{if(!form.name.trim()){showMsg("❌ Name required");return;}setSaving(true);const row={...form,current_stock:parseFloat(form.current_stock)||0,min_stock:parseFloat(form.min_stock)||0,max_stock:parseFloat(form.max_stock)||0,cost_per_unit:parseFloat(form.cost_per_unit)||0};if(editId){await supabase.from("inventory_items").update(row).eq("id",editId);logActivity("Edited material",form.name,"Inventory");}else{await supabase.from("inventory_items").insert(row);logActivity("Added material",form.name,"Inventory");}showMsg("✅ Saved!");setShowForm(false);setForm(emptyItem());setEditId(null);await load();setSaving(false);};
  const deleteItem=(item)=>{confirmAction(`Move "${item.name}" to Trash?`,async()=>{await supabase.from("inventory_items").update({deleted_at:new Date().toISOString()}).eq("id",item.id);logActivity("Moved material to Trash",item.name,"Inventory");showMsg("✅ Moved to Trash");await load();});};
  const saveAdj=async()=>{if(!adjQty||parseFloat(adjQty)<=0){showMsg("❌ Enter quantity");return;}setSaving(true);const qty=parseFloat(adjQty);const item=items.find(i=>i.id===adjItem);const newStock=adjType==="in"?(parseFloat(item.current_stock||0)+qty):adjType==="out"?Math.max(0,parseFloat(item.current_stock||0)-qty):qty;await supabase.from("inventory_transactions").insert({item_id:adjItem,type:adjType,quantity:qty,date:new Date().toISOString().split("T")[0],notes:adjNotes||(adjType==="in"?"Stock received":"Stock issued")});await supabase.from("inventory_items").update({current_stock:newStock,last_delivery_date:adjType==="in"?new Date().toISOString().split("T")[0]:item.last_delivery_date}).eq("id",adjItem);logActivity(`Stock ${adjType}`,`${item.name}: ${qty} ${item.unit}`,"Inventory");showMsg("✅ Stock updated");setAdjItem(null);setAdjQty("");setAdjNotes("");await load();setSaving(false);};
  const filtered=items.filter(i=>{const catOk=filterCat==="All"||i.category===filterCat;const searchOk=!search||i.name.toLowerCase().includes(search.toLowerCase());return catOk&&searchOk;});
  const lowStock=items.filter(i=>parseFloat(i.min_stock)>0&&parseFloat(i.current_stock)<=parseFloat(i.min_stock));
  const totalValue=items.reduce((s,i)=>s+parseFloat(i.current_stock||0)*parseFloat(i.cost_per_unit||0),0);
  if(loading)return<div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>Loading...</div>;
  return(
    <div style={{padding:"24px 28px",maxWidth:1400}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div><h2 style={{margin:0,fontSize:22,color:"#0f172a"}}>📦 Inventory</h2><div style={{fontSize:13,color:"#64748b"}}>Track material stock and manage procurement</div></div>
        {msg&&<span style={{fontSize:12,fontWeight:600,color:msg.startsWith("✅")?"#10b981":"#ef4444",background:msg.startsWith("✅")?"#ecfdf5":"#fef2f2",padding:"6px 14px",borderRadius:20}}>{msg}</span>}
        {isAdmin&&<button onClick={()=>{setForm(emptyItem());setEditId(null);setShowForm(true);}} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ Add Material</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:20}}>
        {[["Total Items",items.length,"#6366f1"],["Low Stock ⚠",lowStock.length,lowStock.length>0?"#ef4444":"#10b981"],["Total Value",`OMR ${totalValue.toFixed(3)}`,"#10b981"],["Categories",new Set(items.map(i=>i.category)).size,"#8b5cf6"]].map(([l,v,c])=>(<div key={l} style={{background:"#fff",borderRadius:12,padding:"16px 20px",border:"1px solid #e2e8f0"}}><div style={{fontSize:11,color:"#64748b",fontWeight:600}}>{l}</div><div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div></div>))}
      </div>
      <div style={{display:"flex",gap:4,marginBottom:16}}>{[["stock","📦 Stock Levels"],["transactions","📋 Transactions"]].map(([id,label])=>(<button key={id} onClick={()=>setTab(id)} style={{padding:"10px 20px",borderRadius:"10px 10px 0 0",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,background:tab===id?"#6366f1":"#f1f5f9",color:tab===id?"#fff":"#64748b"}}>{label}</button>))}</div>
      {tab==="stock"&&(<div>
        <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{...inp,maxWidth:260}}/><select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{...inp,maxWidth:180}}><option value="All">All Categories</option>{CATS.map(c=><option key={c}>{c}</option>)}</select></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:14}}>
          {filtered.map(item=>{const stock=parseFloat(item.current_stock||0);const min=parseFloat(item.min_stock||0);const max=parseFloat(item.max_stock||1);const isLow=min>0&&stock<=min;const pct=max>0?Math.min(100,(stock/max)*100):0;
          return(<div key={item.id} style={{background:"#fff",borderRadius:12,padding:18,border:`1px solid ${isLow?"#fca5a5":"#e2e8f0"}`,position:"relative"}}>
            {isLow&&<span style={{position:"absolute",top:12,right:12,background:"#fef2f2",color:"#ef4444",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10}}>⚠ Low Stock</span>}
            <div style={{fontWeight:700,fontSize:15,color:"#0f172a",marginBottom:2}}>{item.name}</div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:10}}>{item.description||item.category}</div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:11,color:"#64748b"}}>Stock Level</span><span style={{fontWeight:700,color:isLow?"#ef4444":"#1e293b"}}>{stock} {item.unit}</span></div>
            <div style={{background:"#f1f5f9",borderRadius:6,height:8,marginBottom:8,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:isLow?"#ef4444":pct>60?"#10b981":"#f59e0b",borderRadius:6}}/></div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#94a3b8",marginBottom:8}}><span>Min: {item.min_stock||0}</span><span>Max: {item.max_stock||0}</span></div>
            <div style={{fontSize:11,color:"#64748b",display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:10}}><div>Supplier: <strong>{item.supplier||"—"}</strong></div><div>Cost: <strong>OMR {f(item.cost_per_unit)}</strong></div></div>
            {isAdmin&&(<div style={{display:"flex",gap:6}}>
              <button onClick={()=>{setAdjItem(item.id);setAdjType("in");}} style={{flex:1,background:"#ecfdf5",color:"#10b981",border:"1px solid #86efac",borderRadius:8,padding:"6px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📥 In</button>
              <button onClick={()=>{setAdjItem(item.id);setAdjType("out");}} style={{flex:1,background:"#fef2f2",color:"#ef4444",border:"1px solid #fca5a5",borderRadius:8,padding:"6px",fontSize:11,fontWeight:700,cursor:"pointer"}}>📤 Out</button>
              <button onClick={()=>{setForm({...item,current_stock:String(item.current_stock||0),min_stock:String(item.min_stock||0),max_stock:String(item.max_stock||0),cost_per_unit:String(item.cost_per_unit||0)});setEditId(item.id);setShowForm(true);}} style={{background:"#eef2ff",color:"#6366f1",border:"none",borderRadius:8,padding:"6px 10px",fontSize:12,cursor:"pointer"}}>✏️</button>
              <button onClick={()=>deleteItem(item)} style={{background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:8,padding:"6px 10px",fontSize:12,cursor:"pointer"}}>🗑</button>
            </div>)}
          </div>);})}
        </div>
        {filtered.length===0&&<div style={{padding:40,textAlign:"center",color:"#94a3b8",background:"#f8fafc",borderRadius:12}}>No materials found. Add using "+ Add Material".</div>}
      </div>)}
      {tab==="transactions"&&(<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr style={{background:"#f8fafc"}}>{["Date","Material","Type","Qty","Notes"].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",color:"#64748b",fontWeight:600,fontSize:11,borderBottom:"1px solid #e2e8f0"}}>{h}</th>)}</tr></thead><tbody>
        {txns.map((t,i)=>{const item=items.find(x=>x.id===t.item_id);return(<tr key={t.id} style={{borderTop:"1px solid #f1f5f9",background:i%2===0?"#fff":"#fafbfc"}}><td style={{padding:"10px 14px",color:"#64748b"}}>{t.date}</td><td style={{padding:"10px 14px",fontWeight:600}}>{item?.name||"?"}</td><td style={{padding:"10px 14px"}}><span style={{background:t.type==="in"?"#ecfdf5":"#fef2f2",color:t.type==="in"?"#10b981":"#ef4444",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:600}}>{t.type==="in"?"📥 In":"📤 Out"}</span></td><td style={{padding:"10px 14px",fontWeight:700}}>{t.quantity} {item?.unit||""}</td><td style={{padding:"10px 14px",color:"#94a3b8",fontSize:12}}>{t.notes||"—"}</td></tr>);})}{txns.length===0&&<tr><td colSpan={5} style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No transactions.</td></tr>}
      </tbody></table></div>)}
      {showForm&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowForm(false)}><div style={{background:"#fff",borderRadius:16,padding:28,width:"min(520px,90vw)",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <h3 style={{margin:"0 0 16px",fontSize:16}}>{editId?"✏️ Edit":"➕ Add"} Material</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[["Name *","name"],["Description","description"],["Category","category","select"],["Unit","unit","uselect"],["Current Stock","current_stock","num"],["Min Stock","min_stock","num"],["Max Stock","max_stock","num"],["Cost/Unit (OMR)","cost_per_unit","num"],["Supplier","supplier"],["Site","site"]].map(([label,key,type])=>(<div key={key} style={key==="name"||key==="description"?{gridColumn:"1/-1"}:{}}><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>{label}</div>
            {type==="select"?<select value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} style={inp}>{CATS.map(c=><option key={c}>{c}</option>)}</select>
            :type==="uselect"?<select value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} style={inp}>{UNITS.map(u=><option key={u}>{u}</option>)}</select>
            :<input type={type==="num"?"number":"text"} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} style={inp} step="0.001"/>}
            {key==="current_stock"&&editId&&<div style={{fontSize:9,color:"#b45309",marginTop:3}}>⚠ This sets the exact stock count. To add/remove stock from a delivery or usage, use "Adjust Stock" instead.</div>}
          </div>))}
        </div>
        <div style={{display:"flex",gap:10,marginTop:16}}><button onClick={saveItem} disabled={saving} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{saving?"Saving...":"💾 Save"}</button><button onClick={()=>setShowForm(false)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"10px 14px",fontSize:13,cursor:"pointer"}}>Cancel</button></div>
      </div></div>)}
      {adjItem&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setAdjItem(null)}><div style={{background:"#fff",borderRadius:16,padding:28,width:"min(400px,90vw)"}} onClick={e=>e.stopPropagation()}>
        <h3 style={{margin:"0 0 12px",fontSize:16}}>{adjType==="in"?"📥 Stock In":"📤 Stock Out"}: {items.find(i=>i.id===adjItem)?.name}</h3>
        <div style={{marginBottom:10}}><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Quantity *</div><input type="number" value={adjQty} onChange={e=>setAdjQty(e.target.value)} step="0.001" placeholder="0" style={{...inp,fontSize:18,fontWeight:700}}/></div>
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:4}}>Notes</div><input value={adjNotes} onChange={e=>setAdjNotes(e.target.value)} placeholder="Optional..." style={inp}/></div>
        <div style={{display:"flex",gap:10}}><button onClick={saveAdj} disabled={saving} style={{background:adjType==="in"?"#10b981":"#ef4444",color:"#fff",border:"none",borderRadius:8,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{saving?"Saving...":"💾 Save"}</button><button onClick={()=>setAdjItem(null)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"10px 14px",fontSize:13,cursor:"pointer"}}>Cancel</button></div>
      </div></div>)}
    </div>);
}
