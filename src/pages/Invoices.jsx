import React, { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../context/AdminContext";
import Autocomplete from "../components/Autocomplete";

const UNITS = ["nos","hrs","sqm","sqft","m","pcs","set","lot","trip","days","kg","ton","ltr","job"];
const STATUS = ["Draft","Pending","Paid","Cancelled"];
const stStyle = { Paid:{bg:"#ecfdf5",c:"#10b981"}, Pending:{bg:"#fffbeb",c:"#d97706"}, Draft:{bg:"#f1f5f9",c:"#64748b"}, Cancelled:{bg:"#fef2f2",c:"#ef4444"} };
const emptyItem = () => ({description:"",quantity:"1",unit:"nos",rate:"",has_vat:false,pct_complete:"100",pct_of_contract:""});
const emptyForm = () => ({
  type:"Invoice", invoice_number:"", client_name:"", client_business:"", client_address:"", client_phone:"", client_email:"",
  project:"", project_location:"", contract_value:"", invoice_date:new Date().toISOString().split("T")[0], due_date:"",
  payment_schedule:"", status:"Pending", discount_value:"", discount_type:"amount", roundoff:"",
  vat_pct:"5", retainage_pct:"", terms:"", warranty:"", notes:"",
  items:[emptyItem()]
});

async function loadCompany() { const{data}=await supabase.from("app_settings").select("*"); const m={}; (data||[]).forEach(r=>{m[r.key]=r.value;}); return m; }

/* ---------- Reusable autocomplete-with-history input is now in src/components/Autocomplete.jsx ---------- */


const docTh = { padding:"8px 10px", textAlign:"left", fontSize:10.5, fontWeight:700, letterSpacing:0.3, border:"1px solid #334155" };
const docTd = { padding:"7px 10px", border:"1px solid #cbd5e1" };

/* ---------- One printable invoice copy ---------- */
function InvoiceDocument({ inv, its, t, company, copyLabel }) {
  const heading = inv.type==="Invoice" ? "TAX INVOICE" : inv.type==="Quotation" ? "QUOTATION" : inv.type==="Proforma" ? "PROFORMA INVOICE" : (inv.type||"INVOICE").toUpperCase();
  const showPct = its.some(i => parseFloat(i.pct_of_contract) > 0);
  const hasBank = company.company_bank || company.company_iban;
  return (
    <div style={{ position:"relative", border:"1px solid #e2e8f0", borderRadius:12, padding:28, background:"#fff", color:"#0f172a", minHeight:"277mm", boxSizing:"border-box", display:"flex", flexDirection:"column" }}>
      {/* Copy label — small, top-right corner */}
      <div style={{ position:"absolute", top:10, right:14, fontSize:9, fontWeight:700, letterSpacing:0.5, color:"#94a3b8", border:"1px solid #e2e8f0", borderRadius:10, padding:"2px 10px", background:"#fff" }}>{copyLabel}</div>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", gap:16, marginBottom:16, borderBottom:"2px solid #0f172a", paddingBottom:16 }}>
        <div style={{ display:"flex", gap:12 }}>
          {company.company_logo && <img src={company.company_logo} alt="logo" style={{ width:64, height:64, objectFit:"contain" }} />}
          <div>
            <div style={{ fontWeight:800, fontSize:18 }}>{company.company_name || "SEVENSEAS MODERN ENTERPRISES"}</div>
            {company.company_name_ar && <div style={{ fontSize:12, direction:"rtl" }}>{company.company_name_ar}</div>}
            {company.company_address && <div style={{ fontSize:11, color:"#475569", maxWidth:300 }}>{company.company_address}</div>}
            {(company.company_phone || company.company_phone2) && <div style={{ fontSize:11, color:"#475569" }}>📞 {[company.company_phone, company.company_phone2].filter(Boolean).join(" / ")}</div>}
            {(company.company_email || company.company_website) && <div style={{ fontSize:11, color:"#475569" }}>✉ {[company.company_email, company.company_website].filter(Boolean).join(" · ")}</div>}
            {(company.company_vat_no || company.company_cr) && (
              <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>
                {company.company_vat_no && <>VAT Reg No: <strong>{company.company_vat_no}</strong>{company.company_cr ? "   " : ""}</>}
                {company.company_cr && <>CR No: <strong>{company.company_cr}</strong></>}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:22, fontWeight:800, color:"#6366f1" }}>{heading}</div>
          <div style={{ fontSize:13, fontWeight:700 }}>#{inv.invoice_number}</div>
          <div style={{ fontSize:12, color:"#64748b" }}>Date: {inv.invoice_date}</div>
          {inv.due_date && <div style={{ fontSize:12, color:"#64748b" }}>Due: {inv.due_date}</div>}
        </div>
      </div>

      {/* Bill To / Project */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:18, padding:14, background:"#f8fafc", borderRadius:10 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:"#6366f1", marginBottom:6 }}>BILL TO</div>
          <div style={{ fontWeight:700 }}>{inv.client_name || inv.customer}</div>
          {inv.client_business && <div style={{ fontSize:12, color:"#64748b" }}>{inv.client_business}</div>}
          {inv.client_address && <div style={{ fontSize:12, color:"#64748b" }}>{inv.client_address}</div>}
          {inv.client_phone && <div style={{ fontSize:12, color:"#64748b" }}>📞 {inv.client_phone}</div>}
          {inv.client_email && <div style={{ fontSize:12, color:"#64748b" }}>✉ {inv.client_email}</div>}
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:"#6366f1", marginBottom:6 }}>PROJECT</div>
          {inv.project && <div style={{ fontWeight:600 }}>{inv.project}</div>}
          {inv.project_location && <div style={{ fontSize:12, color:"#64748b" }}>{inv.project_location}</div>}
          {inv.contract_value > 0 && <div style={{ fontSize:12 }}>Contract Value: <strong>OMR {parseFloat(inv.contract_value).toFixed(3)}</strong></div>}
          {inv.payment_schedule && <div style={{ fontSize:12, color:"#64748b" }}>{inv.payment_schedule}</div>}
        </div>
      </div>

      {/* Items — this section grows to fill remaining page height */}
      <div style={{ display:"flex", flexDirection:"column", flex:1, marginBottom:18 }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, border:"1px solid #334155" }}>
        <thead>
          <tr style={{ background:"#0f172a", color:"#fff" }}>
            <th style={{ ...docTh, textAlign:"center", width:32 }}>#</th>
            <th style={docTh}>Description</th>
            <th style={{ ...docTh, textAlign:"center", width:50 }}>Qty</th>
            <th style={{ ...docTh, textAlign:"center", width:55 }}>Unit</th>
            <th style={{ ...docTh, textAlign:"right", width:80 }}>Rate (OMR)</th>
            {showPct && <th style={{ ...docTh, textAlign:"center", width:50 }}>%</th>}
            <th style={{ ...docTh, textAlign:"right", width:95 }}>Amount (OMR)</th>
          </tr>
        </thead>
        <tbody>
          {its.map((it, i) => (
            <tr key={it.id || i}>
              <td style={{ ...docTd, textAlign:"center", color:"#64748b" }}>{i+1}</td>
              <td style={{ ...docTd, fontWeight:600 }}>{it.description}</td>
              <td style={{ ...docTd, textAlign:"center" }}>{it.quantity}</td>
              <td style={{ ...docTd, textAlign:"center", color:"#64748b" }}>{it.unit}</td>
              <td style={{ ...docTd, textAlign:"right" }}>{parseFloat(it.rate).toFixed(3)}</td>
              {showPct && <td style={{ ...docTd, textAlign:"center", color:"#64748b" }}>{parseFloat(it.pct_of_contract) > 0 ? `${parseFloat(it.pct_of_contract)}%` : "—"}</td>}
              <td style={{ ...docTd, textAlign:"right", fontWeight:700 }}>{parseFloat(it.amount).toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Extends the table's borders to fill any leftover space on the page */}
      <div style={{ flex:1, border:"1px solid #cbd5e1", borderTop:"none", marginTop:-1 }} />
      </div>

      {/* Totals */}
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:18 }}>
        <div style={{ width:280 }}>
          {[["Subtotal", t.subtotal], t.disc > 0.001 && ["Discount", `-${t.disc.toFixed(3)}`], t.vat > 0.001 && [`VAT (${inv.vat_pct}%)`, t.vat], t.ro && ["Roundoff", t.ro]].filter(Boolean).map(([l, v]) => (
            <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"3px 0", fontSize:12 }}>
              <span style={{ color:"#64748b" }}>{l}</span><span>OMR {typeof v === "number" ? v.toFixed(3) : v}</span>
            </div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderTop:"2px solid #0f172a", fontSize:15, fontWeight:800, marginTop:4 }}>
            <span>Grand Total</span><span>OMR {t.grand.toFixed(3)}</span>
          </div>
          {t.ret > 0.001 && (<>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"3px 0", fontSize:12, color:"#f59e0b" }}>
              <span>Retainage ({inv.retainage_pct}%)</span><span>-OMR {t.ret.toFixed(3)}</span>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", padding:"3px 0", fontSize:13, fontWeight:700 }}>
              <span>Current Due</span><span>OMR {t.currentDue.toFixed(3)}</span>
            </div>
          </>)}
        </div>
      </div>

      {/* Terms + Warranty */}
      {(inv.terms || inv.warranty) && (
        <div style={{ marginBottom:18, padding:14, background:"#f8fafc", borderRadius:10, fontSize:11 }}>
          {inv.terms && <div style={{ marginBottom: inv.warranty ? 8 : 0 }}><div style={{ fontWeight:700, marginBottom:4 }}>Terms & Conditions</div><div style={{ color:"#475569", whiteSpace:"pre-wrap" }}>{inv.terms}</div></div>}
          {inv.warranty && <div><div style={{ fontWeight:700, marginBottom:4 }}>Warranty</div><div style={{ color:"#475569", whiteSpace:"pre-wrap" }}>{inv.warranty}</div></div>}
        </div>
      )}

      {/* Notes */}
      {inv.notes && (
        <div style={{ marginBottom:18, padding:14, border:"1px solid #e2e8f0", borderRadius:10, fontSize:11 }}>
          <div style={{ fontWeight:700, marginBottom:4, color:"#6366f1" }}>NOTES</div>
          <div style={{ color:"#475569", whiteSpace:"pre-wrap" }}>{inv.notes}</div>
        </div>
      )}

      {/* Bank details */}
      {hasBank && (
        <div style={{ marginBottom:18, padding:14, border:"1px solid #e2e8f0", borderRadius:10, fontSize:12 }}>
          <div style={{ fontWeight:700, marginBottom:4, color:"#6366f1" }}>BANK DETAILS FOR PAYMENT</div>
          {company.company_bank && <div>Bank: {company.company_bank}</div>}
          {company.company_iban && <div>IBAN: {company.company_iban}</div>}
          {company.company_name && <div>Account Name: {company.company_name}</div>}
        </div>
      )}

      {/* Signatures — Customer on the left, Authorized Signatory on the right */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:40, marginTop:50 }}>
        <div style={{ borderTop:"1px solid #0f172a", paddingTop:6, fontSize:11, color:"#475569" }}>Customer Signature & Date</div>
        <div style={{ borderTop:"1px solid #0f172a", paddingTop:6, fontSize:11, color:"#475569" }}>Authorized Signatory — {company.company_name || "Company"}</div>
      </div>
    </div>
  );
}

export default function Invoices() {
  const {isAdmin:r,canEdit,setShowLogin,confirmAction,logActivity}=useAdmin();
  const isAdmin=canEdit("invoices");
  const [invoices,setInvoices]=useState([]); const [lineItems,setLineItems]=useState([]);
  const [savedDescs,setSavedDescs]=useState([]); const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false); const [form,setForm]=useState(emptyForm());
  const [editId,setEditId]=useState(null); const [preview,setPreview]=useState(null);
  const [printMode,setPrintMode]=useState("both");
  const [saving,setSaving]=useState(false); const [msg,setMsg]=useState("");
  const [company,setCompany]=useState({}); const [search,setSearch]=useState(""); const [filterStatus,setFilterStatus]=useState("All");
  const inp={border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:13,width:"100%",boxSizing:"border-box",outline:"none",background:"#fff"};

  const load=async()=>{setLoading(true);
    const [inv,li,sd]=await Promise.all([supabase.from("invoices").select("*").is("deleted_at",null).order("created_at",{ascending:false}),supabase.from("invoice_line_items").select("*").is("deleted_at",null),supabase.from("invoice_saved_items").select("*").order("description")]);
    setInvoices(inv.data||[]); setLineItems(li.data||[]); setSavedDescs(sd.data||[]); setLoading(false);
  };
  useEffect(()=>{load();loadCompany().then(setCompany);},[]);
  const showMsg=(t)=>{setMsg(t);setTimeout(()=>setMsg(""),3000);};

  // Previously used customers (for autocomplete + auto-fill)
  const savedCustomers = useMemo(()=>{
    const seen=new Set(); const list=[];
    for(const inv of invoices){
      const name=(inv.client_name||inv.customer||"").trim();
      if(!name) continue;
      const key=name+"|"+(inv.client_business||"").trim();
      if(seen.has(key)) continue;
      seen.add(key);
      list.push({client_name:name,client_business:inv.client_business||"",client_address:inv.client_address||"",client_phone:inv.client_phone||"",client_email:inv.client_email||""});
    }
    return list;
  },[invoices]);

  // Calculations
  const calcTotals=(items,discVal,discType,roundoff,vatPct,retPct)=>{
    const subtotal=items.reduce((s,it)=>{const q=parseFloat(it.quantity)||0;const r=parseFloat(it.rate)||0;return s+q*r;},0);
    const dv=parseFloat(discVal)||0; let disc=discType==="percent"?subtotal*dv/100:dv; if(disc>subtotal)disc=subtotal;
    const afterDisc=subtotal-disc;
    const vat=afterDisc*(parseFloat(vatPct)||0)/100;
    const ro=parseFloat(roundoff)||0;
    const grand=afterDisc+vat+ro;
    const ret=grand*(parseFloat(retPct)||0)/100;
    const currentDue=grand-ret;
    return {subtotal,disc,afterDisc,vat,ro,grand,ret,currentDue};
  };

  // Recompute rate for any item billed as "% of Contract Value" when contract value or qty changes
  const recalcPctRate=(item,contractValue)=>{
    const pct=parseFloat(item.pct_of_contract)||0;
    const cv=parseFloat(contractValue)||0;
    if(pct>0&&cv>0){
      const qty=parseFloat(item.quantity)||1;
      return {...item, rate:(cv*pct/100/qty).toFixed(3)};
    }
    return item;
  };

  // Next sequential number for a given document type, using the prefix configured in Settings.
  // Ignores old timestamp-style numbers (8+ digits) so numbering starts fresh at 0001.
  const getNextNumber=(type)=>{
    const prefix = type==="Invoice" ? (company.invoice_prefix||"INV-") : type==="Quotation" ? (company.quotation_prefix||"QTN-") : (company.proforma_prefix||"PRO-");
    let maxNum=0;
    for(const inv of invoices){
      if(inv.type===type && inv.invoice_number && inv.invoice_number.startsWith(prefix)){
        const n=parseInt(inv.invoice_number.slice(prefix.length),10);
        if(!isNaN(n) && n<1000000 && n>maxNum) maxNum=n;
      }
    }
    return prefix+String(maxNum+1).padStart(4,"0");
  };

  const saveInvoice=async()=>{
    if(!form.client_name.trim()&&!form.client_business.trim()){showMsg("❌ Client name required");return;}
    const validItems=form.items.filter(i=>i.description.trim());
    if(!validItems.length){showMsg("❌ Add at least one line item");return;}
    setSaving(true);
    const t=calcTotals(validItems,form.discount_value,form.discount_type,form.roundoff,form.vat_pct,form.retainage_pct);
    const num=form.invoice_number.trim()||getNextNumber(form.type);
    const row={
      invoice_number:num, type:form.type, customer:form.client_name||form.client_business,
      client_name:form.client_name, client_business:form.client_business, client_address:form.client_address,
      client_phone:form.client_phone, client_email:form.client_email,
      project:form.project, project_location:form.project_location, contract_value:parseFloat(form.contract_value)||0,
      invoice_date:form.invoice_date, due_date:form.due_date||null, status:form.status,
      payment_schedule:form.payment_schedule, notes:form.notes, terms:form.terms, warranty:form.warranty,
      subtotal:t.subtotal, discount_amount:t.disc, discount_type:form.discount_type,
      roundoff:t.ro, vat_pct:parseFloat(form.vat_pct)||0, vat_amount:t.vat,
      grand_total:t.grand, retainage_pct:parseFloat(form.retainage_pct)||0, retainage_held:t.ret,
      current_due:t.currentDue, amount:t.grand,
    };
    let invId=editId;
    if(editId){
      await supabase.from("invoices").update(row).eq("id",editId);
      await supabase.from("invoice_line_items").delete().eq("invoice_id",editId);
    } else {
      const {data}=await supabase.from("invoices").insert(row).select().single();
      invId=data?.id;
    }
    if(invId){
      await supabase.from("invoice_line_items").insert(validItems.map((it,i)=>({
        invoice_id:invId, line_number:i+1, description:it.description,
        quantity:parseFloat(it.quantity)||1, unit:it.unit, rate:parseFloat(it.rate)||0,
        amount:(parseFloat(it.quantity)||0)*(parseFloat(it.rate)||0),
        pct_complete:parseFloat(it.pct_complete)||100, pct_of_contract:parseFloat(it.pct_of_contract)||0, has_vat:it.has_vat,
      })));
      // Save unique descriptions for future reuse
      for(const it of validItems){
        if(it.description.trim()&&!savedDescs.find(s=>s.description===it.description.trim())){
          await supabase.from("invoice_saved_items").insert({description:it.description.trim(),default_rate:parseFloat(it.rate)||0,unit:it.unit});
        }
      }
    }
    logActivity(editId?"Edited invoice":"Created invoice",`${form.client_name||form.client_business} — OMR ${t.grand.toFixed(3)}`,"Invoices");
    showMsg("✅ Saved!"); setShowForm(false); setForm(emptyForm()); setEditId(null);
    await load(); setSaving(false);
  };

  const startEdit=(inv)=>{
    const its=lineItems.filter(l=>l.invoice_id===inv.id).sort((a,b)=>a.line_number-b.line_number);
    setForm({
      type:inv.type||"Invoice", invoice_number:inv.invoice_number||"", client_name:inv.client_name||inv.customer||"", client_business:inv.client_business||"",
      client_address:inv.client_address||"", client_phone:inv.client_phone||"", client_email:inv.client_email||"",
      project:inv.project||"", project_location:inv.project_location||"", contract_value:String(inv.contract_value||""),
      invoice_date:inv.invoice_date||"", due_date:inv.due_date||"", payment_schedule:inv.payment_schedule||"",
      status:inv.status||"Pending", discount_value:inv.discount_amount?String(inv.discount_amount):"", discount_type:inv.discount_type||"amount",
      roundoff:inv.roundoff?String(inv.roundoff):"", vat_pct:String(inv.vat_pct||5), retainage_pct:inv.retainage_pct?String(inv.retainage_pct):"",
      terms:inv.terms||"", warranty:inv.warranty||"", notes:inv.notes||"",
      items:its.length?its.map(i=>({description:i.description,quantity:String(i.quantity),unit:i.unit||"nos",rate:String(i.rate),has_vat:i.has_vat||false,pct_complete:String(i.pct_complete||100),pct_of_contract:i.pct_of_contract?String(i.pct_of_contract):""})):[emptyItem()]
    });
    setEditId(inv.id); setShowForm(true);
  };

  const deleteInv=(inv)=>{confirmAction(`Move invoice ${inv.invoice_number} to Trash? You can restore it later from the Trash page.`,async()=>{await supabase.from("invoices").update({deleted_at:new Date().toISOString()}).eq("id",inv.id);logActivity("Moved invoice to Trash",inv.invoice_number,"Invoices");showMsg("✅ Moved to Trash");await load();});};

  const printInvoice=(inv)=>{setPreview(inv);setPrintMode("both");};
  const doPrint=(mode)=>{setPrintMode(mode);setTimeout(()=>{window.print();},100);};

  const filtered=invoices.filter(inv=>{
    const stOk=filterStatus==="All"||inv.status===filterStatus;
    const srOk=!search||(inv.customer||"").toLowerCase().includes(search.toLowerCase())||(inv.invoice_number||"").toLowerCase().includes(search.toLowerCase())||(inv.project||"").toLowerCase().includes(search.toLowerCase());
    return stOk&&srOk;
  });

  const totalAmt=invoices.reduce((s,i)=>s+parseFloat(i.grand_total||i.amount||0),0);
  const paidAmt=invoices.filter(i=>i.status==="Paid").reduce((s,i)=>s+parseFloat(i.grand_total||i.amount||0),0);
  const pendingAmt=invoices.filter(i=>i.status==="Pending").reduce((s,i)=>s+parseFloat(i.grand_total||i.amount||0),0);

  if(loading) return <div style={{padding:40,textAlign:"center",color:"#94a3b8"}}>Loading...</div>;

  // Preview/Print mode — shows A4-sized page previews; choose Original / Duplicate / Both to print
  if(preview){
    const inv=preview; const its=lineItems.filter(l=>l.invoice_id===inv.id).sort((a,b)=>a.line_number-b.line_number);
    const t=calcTotals(its.map(i=>({quantity:i.quantity,rate:i.rate})),inv.discount_amount,inv.discount_type,inv.roundoff,inv.vat_pct,inv.retainage_pct);
    const downloadWord=async()=>{
      const {generateInvoiceDocx}=await import("../lib/invoiceDocx.js");
      const blob=await generateInvoiceDocx(inv,its,t,company);
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url; a.download=`${inv.invoice_number||"invoice"}.docx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
    return(
      <div style={{padding:24,maxWidth:900,margin:"0 auto"}}>
        <div className="no-print" style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          <button onClick={()=>setPreview(null)} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:8,padding:"10px 16px",fontSize:13,cursor:"pointer"}}>← Back</button>
          <button onClick={()=>doPrint("original")} style={{background:"#fff",color:"#0f172a",border:"1px solid #cbd5e1",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>🖨 Print Original</button>
          <button onClick={()=>doPrint("duplicate")} style={{background:"#fff",color:"#0f172a",border:"1px solid #cbd5e1",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>🖨 Print Duplicate</button>
          <button onClick={()=>doPrint("both")} style={{background:"#0f172a",color:"#fff",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>🖨 Print Both</button>
          <button onClick={downloadWord} style={{background:"#fff",color:"#2563eb",border:"1px solid #93c5fd",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>⬇ Download Word</button>
        </div>
        <div className="print-area invoice-pages">
          {(printMode==="both"||printMode==="original")&&(
            <div className="print-copy"><InvoiceDocument inv={inv} its={its} t={t} company={company} copyLabel="ORIGINAL" /></div>
          )}
          {(printMode==="both"||printMode==="duplicate")&&(
            <div className="print-copy"><InvoiceDocument inv={inv} its={its} t={t} company={company} copyLabel="DUPLICATE" /></div>
          )}
        </div>
      </div>
    );
  }

  return(
    <div style={{padding:"24px 28px",maxWidth:1400}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div><h2 style={{margin:0,fontSize:22,color:"#0f172a"}}>📄 Invoices & Quotations</h2><div style={{fontSize:13,color:"#64748b"}}>Progress billing, quotations with terms & warranty</div></div>
        {msg&&<span style={{fontSize:12,fontWeight:600,color:msg.startsWith("✅")?"#10b981":"#ef4444",padding:"6px 14px",borderRadius:20,background:msg.startsWith("✅")?"#ecfdf5":"#fef2f2"}}>{msg}</span>}
        {isAdmin&&<button onClick={()=>{const f=emptyForm();f.invoice_number=getNextNumber(f.type);setForm(f);setEditId(null);setShowForm(true);}} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ New Invoice</button>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:20}}>
        {[["Total Invoiced",`OMR ${totalAmt.toFixed(3)}`,"#6366f1"],["Paid",`OMR ${paidAmt.toFixed(3)}`,"#10b981"],["Pending",`OMR ${pendingAmt.toFixed(3)}`,"#f59e0b"],["Count",invoices.length,"#8b5cf6"]].map(([l,v,c])=>(<div key={l} style={{background:"#fff",borderRadius:12,padding:"16px 20px",border:"1px solid #e2e8f0"}}><div style={{fontSize:11,color:"#64748b",fontWeight:600}}>{l}</div><div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div></div>))}
      </div>
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{...inp,maxWidth:260}}/>
        <div style={{display:"flex",gap:4}}>{["All",...STATUS].map(s=>(<button key={s} onClick={()=>setFilterStatus(s)} style={{padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:filterStatus===s?"#6366f1":"#f1f5f9",color:filterStatus===s?"#fff":"#64748b"}}>{s}</button>))}</div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{background:"#f8fafc"}}>{["#","Date","Client","Project","Amount","Status","Actions"].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",color:"#64748b",fontWeight:600,fontSize:11,borderBottom:"1px solid #e2e8f0"}}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map((inv,i)=>{const st=stStyle[inv.status]||stStyle.Draft;return(
            <tr key={inv.id} style={{borderTop:"1px solid #f1f5f9",background:i%2===0?"#fff":"#fafbfc"}}>
              <td style={{padding:"10px 14px",fontWeight:600,color:"#6366f1"}}>{inv.invoice_number}</td>
              <td style={{padding:"10px 14px",color:"#64748b"}}>{inv.invoice_date}</td>
              <td style={{padding:"10px 14px",fontWeight:600}}>{inv.client_name||inv.customer||"—"}</td>
              <td style={{padding:"10px 14px",color:"#64748b"}}>{inv.project||"—"}</td>
              <td style={{padding:"10px 14px",fontWeight:700,color:"#10b981"}}>OMR {parseFloat(inv.grand_total||inv.amount||0).toFixed(3)}</td>
              <td style={{padding:"10px 14px"}}><span style={{background:st.bg,color:st.c,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:600}}>{inv.status}</span></td>
              <td style={{padding:"10px 14px"}}><div style={{display:"flex",gap:6}}>
                <button onClick={()=>printInvoice(inv)} style={{background:"#f1f5f9",color:"#475569",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>🖨</button>
                {isAdmin&&<><button onClick={()=>startEdit(inv)} style={{background:"#eef2ff",color:"#6366f1",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>✏️</button>
                <button onClick={()=>deleteInv(inv)} style={{background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>🗑</button></>}
              </div></td>
            </tr>)})}{filtered.length===0&&<tr><td colSpan={7} style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No invoices found.</td></tr>}</tbody>
        </table>
      </div>

      {/* Create/Edit Form Modal */}
      {showForm&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:20,overflowY:"auto"}} onClick={()=>setShowForm(false)}>
        <div style={{background:"#fff",borderRadius:16,padding:28,width:"min(800px,95vw)",marginBottom:40}} onClick={e=>e.stopPropagation()}>
          <h3 style={{margin:"0 0 16px",fontSize:18}}>{editId?"✏️ Edit":"📄 New"} {form.type}</h3>
          {/* Type selector */}
          <div style={{display:"flex",gap:6,marginBottom:12}}>{["Invoice","Quotation","Proforma"].map(t=>(<button key={t} onClick={()=>setForm(p=>({...p,type:t,invoice_number:editId?p.invoice_number:getNextNumber(t)}))} style={{padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:form.type===t?"#6366f1":"#f1f5f9",color:form.type===t?"#fff":"#64748b"}}>{t}</button>))}</div>
          {/* Number (auto-suggested, editable) */}
          <div style={{marginBottom:16,maxWidth:240}}>
            <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>{form.type} Number</div>
            <input value={form.invoice_number} onChange={e=>setForm(p=>({...p,invoice_number:e.target.value}))} placeholder={getNextNumber(form.type)} style={inp}/>
          </div>
          {/* Client + Project */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <div style={{padding:16,background:"#f8fafc",borderRadius:10}}>
              <div style={{fontSize:12,fontWeight:700,color:"#6366f1",marginBottom:10}}>CLIENT INFORMATION</div>
              {[["Client Name *","client_name"],["Business Name","client_business"],["Address","client_address"],["Phone","client_phone"],["Email","client_email"]].map(([l,k])=>(
                <div key={k} style={{marginBottom:6}}>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>{l}</div>
                  {(k==="client_name"||k==="client_business")?(
                    <Autocomplete
                      value={form[k]}
                      onChange={v=>setForm(p=>({...p,[k]:v}))}
                      onSelect={c=>setForm(p=>({...p,client_name:c.client_name,client_business:c.client_business,client_address:c.client_address,client_phone:c.client_phone,client_email:c.client_email}))}
                      suggestions={savedCustomers}
                      getLabel={c=>c.client_business?`${c.client_name} (${c.client_business})`:c.client_name}
                      filterFn={(c,q)=>(c.client_name||"").toLowerCase().includes(q)||(c.client_business||"").toLowerCase().includes(q)}
                      placeholder="Type or select from history..."
                      style={inp}
                    />
                  ):(
                    <input value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} style={inp}/>
                  )}
                </div>
              ))}
            </div>
            <div style={{padding:16,background:"#f8fafc",borderRadius:10}}>
              <div style={{fontSize:12,fontWeight:700,color:"#6366f1",marginBottom:10}}>PROJECT SUMMARY</div>
              {[["Project Name","project"],["Location","project_location"],["Contract Value (OMR)","contract_value","number"],["Payment Schedule","payment_schedule"]].map(([l,k,ty])=>(
                <div key={k} style={{marginBottom:6}}>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>{l}</div>
                  <input type={ty||"text"} value={form[k]} onChange={e=>{
                    const v=e.target.value;
                    if(k==="contract_value"){
                      setForm(p=>({...p,contract_value:v,items:p.items.map(it=>recalcPctRate(it,v))}));
                    } else {
                      setForm(p=>({...p,[k]:v}));
                    }
                  }} style={inp} step="0.001"/>
                  {k==="contract_value"&&<div style={{fontSize:9,color:"#94a3b8",marginTop:2}}>Set this to auto-calculate line item amounts from "%" column below</div>}
                </div>
              ))}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                <div><div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>Invoice Date</div><input type="date" value={form.invoice_date} onChange={e=>setForm(p=>({...p,invoice_date:e.target.value}))} style={inp}/></div>
                <div><div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>Due Date</div><input type="date" value={form.due_date} onChange={e=>setForm(p=>({...p,due_date:e.target.value}))} style={inp}/></div>
              </div>
            </div>
          </div>
          {/* Line Items */}
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>📋 Line Items</div>
          <div style={{overflowX:"auto",marginBottom:12}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#f8fafc"}}>{["Description","Qty","Unit","Rate (OMR)","% of Contract","Amount","VAT",""].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"left",color:"#64748b",fontSize:10,fontWeight:600}}>{h}</th>)}</tr></thead>
              <tbody>{form.items.map((it,idx)=>{
                const amt=(parseFloat(it.quantity)||0)*(parseFloat(it.rate)||0);
                return(<tr key={idx}>
                  <td style={{padding:"4px 6px",minWidth:200}}>
                    <Autocomplete
                      value={it.description}
                      onChange={v=>{const ni=[...form.items];ni[idx]={...ni[idx],description:v};setForm(p=>({...p,items:ni}));}}
                      onSelect={s=>{const ni=[...form.items];ni[idx]={...ni[idx],description:s.description,rate:s.default_rate?String(s.default_rate):ni[idx].rate,unit:s.unit||ni[idx].unit};setForm(p=>({...p,items:ni}));}}
                      suggestions={savedDescs}
                      getLabel={s=>s.description}
                      placeholder="Type or select..."
                      style={inp}
                    />
                  </td>
                  <td style={{padding:"4px 6px",width:70}}>
                    <input type="number" value={it.quantity} onChange={e=>{
                      const ni=[...form.items]; ni[idx]={...ni[idx],quantity:e.target.value};
                      ni[idx]=recalcPctRate(ni[idx],form.contract_value);
                      setForm(p=>({...p,items:ni}));
                    }} style={inp} step="0.01"/>
                  </td>
                  <td style={{padding:"4px 6px",width:80}}><select value={it.unit} onChange={e=>{const ni=[...form.items];ni[idx]={...ni[idx],unit:e.target.value};setForm(p=>({...p,items:ni}));}} style={inp}>{UNITS.map(u=><option key={u}>{u}</option>)}</select></td>
                  <td style={{padding:"4px 6px",width:100}}><input type="number" value={it.rate} onChange={e=>{const ni=[...form.items];ni[idx]={...ni[idx],rate:e.target.value};setForm(p=>({...p,items:ni}));}} style={inp} step="0.001"/></td>
                  <td style={{padding:"4px 6px",width:80}}>
                    <input type="number" value={it.pct_of_contract} onChange={e=>{
                      const ni=[...form.items]; ni[idx]={...ni[idx],pct_of_contract:e.target.value};
                      ni[idx]=recalcPctRate(ni[idx],form.contract_value);
                      setForm(p=>({...p,items:ni}));
                    }} placeholder="%" style={inp} step="0.01" title="Enter % of total Contract Value — Rate/Amount auto-calculated"/>
                  </td>
                  <td style={{padding:"4px 6px",width:100,fontWeight:700,color:"#10b981"}}>{amt.toFixed(3)}</td>
                  <td style={{padding:"4px 6px",width:40}}><input type="checkbox" checked={it.has_vat} onChange={e=>{const ni=[...form.items];ni[idx]={...ni[idx],has_vat:e.target.checked};setForm(p=>({...p,items:ni}));}}/></td>
                  <td style={{padding:"4px 6px"}}>{form.items.length>1&&<button onClick={()=>{const ni=[...form.items];ni.splice(idx,1);setForm(p=>({...p,items:ni}));}} style={{background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:4,padding:"4px",cursor:"pointer",fontSize:10}}>✕</button>}</td>
                </tr>);})}</tbody>
            </table>
          </div>
          <button onClick={()=>setForm(p=>({...p,items:[...p.items,emptyItem()]}))} style={{background:"#f1f5f9",color:"#6366f1",border:"none",borderRadius:6,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",marginBottom:16}}>+ Add Line Item</button>
          {/* Totals: discount, roundoff, VAT, retainage */}
          {(()=>{const t=calcTotals(form.items,form.discount_value,form.discount_type,form.roundoff,form.vat_pct,form.retainage_pct);return(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div><div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>Discount</div><div style={{display:"flex",gap:4}}><input type="number" value={form.discount_value} onChange={e=>setForm(p=>({...p,discount_value:e.target.value}))} placeholder="0" step="0.001" style={{...inp,flex:1}}/><select value={form.discount_type} onChange={e=>setForm(p=>({...p,discount_type:e.target.value}))} style={{...inp,width:65}}><option value="amount">OMR</option><option value="percent">%</option></select></div></div>
                <div><div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>Roundoff</div><input type="number" value={form.roundoff} onChange={e=>setForm(p=>({...p,roundoff:e.target.value}))} placeholder="0" step="0.001" style={inp}/></div>
                <div><div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>VAT %</div><input type="number" value={form.vat_pct} onChange={e=>setForm(p=>({...p,vat_pct:e.target.value}))} placeholder="5" style={inp}/></div>
                <div><div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>Retainage %</div><input type="number" value={form.retainage_pct} onChange={e=>setForm(p=>({...p,retainage_pct:e.target.value}))} placeholder="0" style={inp}/></div>
              </div>
              <div style={{background:"#f8fafc",borderRadius:10,padding:14}}>
                {[["Subtotal",t.subtotal.toFixed(3)],t.disc>0.001&&["Discount",`-${t.disc.toFixed(3)}`],t.vat>0.001&&[`VAT (${form.vat_pct}%)`,t.vat.toFixed(3)],t.ro&&["Roundoff",t.ro.toFixed(3)]].filter(Boolean).map(([l,v])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",fontSize:12}}><span style={{color:"#64748b"}}>{l}</span><span>OMR {v}</span></div>))}
                <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderTop:"2px solid #0f172a",fontWeight:800,fontSize:16,marginTop:4}}><span>Grand Total</span><span style={{color:"#10b981"}}>OMR {t.grand.toFixed(3)}</span></div>
                {t.ret>0.001&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#f59e0b"}}><span>Retainage ({form.retainage_pct}%)</span><span>-OMR {t.ret.toFixed(3)}</span></div>}
                {t.ret>0.001&&<div style={{display:"flex",justifyContent:"space-between",fontSize:14,fontWeight:700}}><span>Current Due</span><span style={{color:"#6366f1"}}>OMR {t.currentDue.toFixed(3)}</span></div>}
              </div>
            </div>
          );})()}
          {/* Terms + Warranty + Status */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            <div><div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>Terms & Conditions</div><textarea value={form.terms} onChange={e=>setForm(p=>({...p,terms:e.target.value}))} rows={3} placeholder="Payment terms, delivery schedule..." style={{...inp,resize:"vertical"}}/></div>
            <div><div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>Warranty Conditions</div><textarea value={form.warranty} onChange={e=>setForm(p=>({...p,warranty:e.target.value}))} rows={3} placeholder="CCTV warranty period, service terms..." style={{...inp,resize:"vertical"}}/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:12,marginBottom:16}}>
            <div><div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>Status</div><select value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value}))} style={inp}>{STATUS.map(s=><option key={s}>{s}</option>)}</select></div>
            <div><div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>Due Date</div><input type="date" value={form.due_date} onChange={e=>setForm(p=>({...p,due_date:e.target.value}))} style={inp}/></div>
            <div><div style={{fontSize:10,color:"#64748b",fontWeight:600,marginBottom:2}}>Notes</div><input value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Internal notes..." style={inp}/></div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={saveInvoice} disabled={saving} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer"}}>{saving?"Saving...":"💾 Save"}</button>
            <button onClick={()=>setShowForm(false)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"10px 14px",fontSize:13,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      </div>)}
    </div>
  );
}
