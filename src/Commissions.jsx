import { useState, useEffect } from "react";
import { useAdmin } from "../context/AdminContext";
import { supabase } from "../lib/supabase";

const empty={agent_name:"",agent_contact:"",client:"",site:"",contract_value:"",commission_rate:"",computed_payout:"",status:"Awaiting",commission_date:new Date().toISOString().split("T")[0],notes:""};

export default function Commissions() {
  const { isAdmin, setShowLogin } = useAdmin();
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState(empty);
  const [filter,setFilter]=useState("All Referral Leads");
  const [search,setSearch]=useState("");
  const [saving,setSaving]=useState(false);

  useEffect(()=>{ loadItems(); },[]);

  const loadItems=async()=>{
    setLoading(true);
    const {data}=await supabase.from("commissions").select("*").order("created_at",{ascending:false});
    setItems(data||[]);setLoading(false);
  };

  const calc=(val,rate)=>(parseFloat(val)||0)*(parseFloat(rate)||0)/100;

  const addItem=async()=>{
    if(!form.agent_name||!form.contract_value)return;
    setSaving(true);
    const payout=calc(form.contract_value,form.commission_rate);
    const ref=`REF-${String(items.length+1).padStart(3,"0")}`;
    await supabase.from("commissions").insert({
      ref_number:ref,agent_name:form.agent_name,agent_contact:form.agent_contact,
      client:form.client,site:form.site,contract_value:parseFloat(form.contract_value),
      commission_rate:parseFloat(form.commission_rate),computed_payout:payout,
      status:form.status,commission_date:form.commission_date,notes:form.notes
    });
    await loadItems();setForm(empty);setShowForm(false);setSaving(false);
  };

  const toggleStatus=async(id,current)=>{
    const newStatus=current==="Settled"?"Awaiting":"Settled";
    await supabase.from("commissions").update({status:newStatus}).eq("id",id);
    await loadItems();
  };

  const totalDisbursed=items.filter(i=>i.status==="Settled").reduce((s,i)=>s+parseFloat(i.computed_payout||0),0);
  const totalOutstanding=items.filter(i=>i.status==="Awaiting").reduce((s,i)=>s+parseFloat(i.computed_payout||0),0);

  const filtered=items.filter(i=>
    (filter==="All Referral Leads"||(filter==="Disbursed and Settled"&&i.status==="Settled")||(filter==="Awaiting Client milestone"&&i.status==="Awaiting"))&&
    (i.agent_name?.toLowerCase().includes(search.toLowerCase())||i.site?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>Referrals & Work Source Commission Ledger</div>
          <div style={{fontSize:13,color:"#64748b"}}>Log introduction leads, compute percentage-based commissions on contract value, and manage payouts</div>
        </div>
        <button onClick={()=>setShowForm(true)} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}}>+ Register Sourcing Commission Lead</button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
        {[
          {label:"TOTAL COMMISSIONS DISBURSED",value:totalDisbursed.toFixed(3),sub:"Lead payouts registered in cashbook ledger",color:"#10b981"},
          {label:"OUTSTANDING COMMISSION OBLIGATIONS",value:totalOutstanding.toFixed(3),sub:"Pending milestone client collections",color:"#f59e0b"},
        ].map(c=>(
          <div key={c.label} style={{background:"#fff",borderRadius:12,padding:20,border:"1px solid #e2e8f0",borderLeft:`4px solid ${c.color}`}}>
            <div style={{fontSize:10,color:"#64748b",fontWeight:600,letterSpacing:0.8,marginBottom:6}}>{c.label}</div>
            <div style={{fontSize:24,fontWeight:800,color:c.color}}>{c.value} <span style={{fontSize:12}}>OMR</span></div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{c.sub}</div>
          </div>
        ))}
      </div>

      {showForm&&(
        <div style={{background:"#fff",borderRadius:12,padding:20,marginBottom:16,border:"1px solid #e2e8f0"}}>
          <div style={{fontWeight:700,fontSize:15,color:"#0f172a",marginBottom:16}}>Register New Commission Lead</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[["Agent Name","agent_name","text"],["Agent Contact","agent_contact","text"],["Client / Customer","client","text"],["Site / Project","site","text"],["Contract Value (OMR)","contract_value","number"],["Commission Rate (%)","commission_rate","number"],["Date","commission_date","date"]].map(([l,k,t])=>(
              <div key={k}>
                <div style={{fontSize:12,color:"#64748b",marginBottom:4,fontWeight:500}}>{l}</div>
                <input type={t} value={form[k]} onChange={e=>{
                  const upd={...form,[k]:e.target.value};
                  if(k==="contract_value"||k==="commission_rate") upd.computed_payout=calc(k==="contract_value"?e.target.value:form.contract_value,k==="commission_rate"?e.target.value:form.commission_rate).toFixed(3);
                  setForm(upd);
                }} style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:13,boxSizing:"border-box",outline:"none"}} />
              </div>
            ))}
            <div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:4,fontWeight:500}}>Computed Payout (OMR)</div>
              <input value={form.computed_payout} readOnly style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:13,background:"#f8fafc",color:"#10b981",fontWeight:700,boxSizing:"border-box"}} />
            </div>
            <div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:4,fontWeight:500}}>Status</div>
              <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:13}}>
                <option>Awaiting</option><option>Settled</option>
              </select>
            </div>
          </div>
          <div style={{marginTop:12}}>
            <div style={{fontSize:12,color:"#64748b",marginBottom:4,fontWeight:500}}>Notes</div>
            <input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} style={{width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:13,boxSizing:"border-box",outline:"none"}} />
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button onClick={addItem} disabled={saving} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontSize:13,fontWeight:600}}>{saving?"Saving...":"Register Lead"}</button>
            <button onClick={()=>setShowForm(false)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontSize:13}}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid #f1f5f9",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Agent name or associated site..." style={{flex:1,minWidth:200,border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:12,outline:"none"}} />
          {["All Referral Leads","Disbursed and Settled","Awaiting Client milestone"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:filter===f?"#0f172a":"#f1f5f9",color:filter===f?"#fff":"#64748b"}}>{f}</button>
          ))}
        </div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead>
            <tr style={{background:"#f8fafc"}}>
              {["REF","AGENT","CLIENT & SITE","CONTRACT VALUE","RATE %","PAYOUT (OMR)","STATUS","ACTION"].map(h=>(
                <th key={h} style={{padding:"10px 14px",textAlign:"left",color:"#64748b",fontWeight:600,fontSize:11}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading?(<tr><td colSpan={8} style={{padding:40,textAlign:"center",color:"#94a3b8"}}>⏳ Loading...</td></tr>):
            filtered.length===0?(<tr><td colSpan={8} style={{padding:40,textAlign:"center",color:"#94a3b8",fontStyle:"italic"}}>No commission records found.</td></tr>):
            filtered.map(i=>(
              <tr key={i.id} style={{borderTop:"1px solid #f1f5f9"}}>
                <td style={{padding:"12px 14px",color:"#6366f1",fontWeight:700,fontFamily:"monospace"}}>{i.ref_number}</td>
                <td style={{padding:"12px 14px"}}>
                  <div style={{fontWeight:600,color:"#1e293b"}}>{i.agent_name}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{i.agent_contact}</div>
                </td>
                <td style={{padding:"12px 14px"}}>
                  <div style={{fontWeight:600,color:"#1e293b"}}>{i.client}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{i.site}</div>
                </td>
                <td style={{padding:"12px 14px",color:"#1e293b",fontWeight:600}}>OMR {parseFloat(i.contract_value).toLocaleString()}</td>
                <td style={{padding:"12px 14px",color:"#6366f1",fontWeight:600}}>{i.commission_rate}%</td>
                <td style={{padding:"12px 14px",color:"#10b981",fontWeight:700}}>{parseFloat(i.computed_payout).toFixed(3)}</td>
                <td style={{padding:"12px 14px"}}>
                  <span style={{background:i.status==="Settled"?"#ecfdf5":"#fffbeb",color:i.status==="Settled"?"#10b981":"#854d0e",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600}}>
                    {i.status==="Settled"?"Disbursed & Settled":"Awaiting Milestone"}
                  </span>
                </td>
                <td style={{padding:"12px 14px"}}>
                  <button onClick={()=>toggleStatus(i.id,i.status)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11}}>
                    {i.status==="Settled"?"Mark Pending":"Mark Settled"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
