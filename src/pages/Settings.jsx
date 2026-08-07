import { useState, useEffect, useRef } from "react";
import bcrypt from "bcryptjs";
import { getBankAccounts, setOpeningBalance } from "../lib/bankAccounts";
import { buildFullBackup, listBackupSnapshots, getBackupSnapshot } from "../lib/backup";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../context/AdminContext";
import { ALL_PAGES, ROLE_PRESETS, FULL_PERMS } from "../context/AdminContext";

const COMPANY_FIELDS = [
  { key:"company_name", label:"Company Name (English)", placeholder:"SEVENSEAS Modern Enterprises", col:2 },
  { key:"company_name_ar", label:"Company Name (Arabic)", placeholder:"سيفن سيز للمقاولات الحديثة", col:2 },
  { key:"company_address", label:"Full Address", placeholder:"Barka, Al Batinah South, Sultanate of Oman", col:2 },
  { key:"company_phone", label:"Primary Phone / WhatsApp", placeholder:"+968 XXXX XXXX" },
  { key:"company_phone2", label:"Secondary Phone", placeholder:"+968 XXXX XXXX" },
  { key:"company_email", label:"Email Address", placeholder:"info@company.om" },
  { key:"company_website", label:"Website", placeholder:"www.company.om" },
  { key:"company_cr", label:"Commercial Registration No. (CR)", placeholder:"1234567" },
  { key:"company_license", label:"Construction License No.", placeholder:"MOH/2024/XXXX" },
  { key:"company_tax_no", label:"Tax Registration No.", placeholder:"OM-TAX-XXXX" },
  { key:"company_vat_no", label:"VAT Registration No.", placeholder:"OM-VAT-XXXX" },
  { key:"company_iban", label:"Bank IBAN", placeholder:"OM00 0000 0000 0000 0000 0000" },
  { key:"company_bank", label:"Bank Name & Branch", placeholder:"Bank Muscat, Barka Branch" },
];

const NUMBERING_FIELDS = [
  { key:"invoice_prefix", label:"Invoice Number Prefix", placeholder:"INV-" },
  { key:"quotation_prefix", label:"Quotation Number Prefix", placeholder:"QTN-" },
  { key:"proforma_prefix", label:"Proforma Number Prefix", placeholder:"PRO-" },
];

const Card = ({title,children}) => (
  <div style={{background:"#fff",borderRadius:12,padding:22,border:"1px solid #e2e8f0",marginBottom:16}}>
    <div style={{fontWeight:700,color:"#0f172a",fontSize:13,letterSpacing:0.5,marginBottom:16,textTransform:"uppercase",borderBottom:"1px solid #f1f5f9",paddingBottom:10}}>{title}</div>
    {children}
  </div>
);
const SaveBtn = ({k,saving,onClick}) => (
  <button onClick={onClick} disabled={saving[k]}
    style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:600,cursor:"pointer",marginTop:8}}>
    {saving[k]?"Saving...":"💾 Save"}
  </button>
);

export default function Settings() {
  const { isAdmin, setShowLogin, logActivity } = useAdmin();
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState({});
  const [msg, setMsg] = useState({ text:"", type:"" });
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const logoRef = useRef(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [editingBank, setEditingBank] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [downloadingSnapshot, setDownloadingSnapshot] = useState(null);

  useEffect(() => { if (isAdmin) { load(); getBankAccounts().then(setBankAccounts); loadSnapshots(); } }, [isAdmin]);

  const loadSnapshots = async () => {
    setSnapshotsLoading(true);
    const list = await listBackupSnapshots();
    setSnapshots(list);
    setSnapshotsLoading(false);
  };

  const load = async () => {
    const { data } = await supabase.from("app_settings").select("*");
    if (data) {
      const map = {};
      data.forEach(r => { map[r.key] = r.value; });
      setSettings(map);
      setAdminEmail(map.admin_emails || "anilkattakada@gmail.com");
      setDriveUrl(map.drive_url || "");
    }
  };

  const save = async (key, value) => {
    setSaving(p => ({...p,[key]:true}));
    const { error } = await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setSaving(p => ({...p,[key]:false}));
    if (error) { showMsg("❌ Save failed: " + error.message, "error"); return; }
    setSettings(p => ({...p,[key]:value}));
    logActivity("Updated setting", `${key}: ${value}`, "Settings");
    showMsg("✅ Saved!");
  };

  const showMsg = (text, type="success") => {
    setMsg({text,type}); setTimeout(()=>setMsg({text:"",type:""}),3000);
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setLogoUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result; // store as base64 data URL
      await save("company_logo", base64);
      setLogoUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const downloadBackup = async () => {
    setBackupLoading(true);
    try {
      const backup = await buildFullBackup();
      const blob = new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href=url; a.download=`minarva-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      logActivity("Downloaded manual backup", `${Object.keys(backup.data).length} tables`, "Settings");
      showMsg("✅ Backup downloaded!");
    } catch(e) { showMsg("❌ "+e.message,"error"); }
    setBackupLoading(false);
  };

  const downloadSnapshot = async (snap) => {
    setDownloadingSnapshot(snap.id);
    try {
      const data = await getBackupSnapshot(snap.id);
      if (!data) { showMsg("❌ Could not load that backup", "error"); return; }
      const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href=url; a.download=`minarva-auto-backup-${snap.backup_date}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      logActivity("Downloaded automatic backup", snap.backup_date, "Settings");
      showMsg("✅ Backup downloaded!");
    } catch(e) { showMsg("❌ "+e.message,"error"); }
    setDownloadingSnapshot(null);
  };

  const restoreBackup = async () => {
    if (!restoreFile) return;
    if (!confirm("⚠ This will OVERWRITE all existing data. Are you sure?")) return;
    setRestoring(true);
    logActivity("Started backup restore", `File: ${restoreFile.name}`, "Settings");
    try {
      const text = await restoreFile.text();
      const backup = JSON.parse(text);
      // IMPORTANT: parent tables must be restored BEFORE the child tables that
      // reference them via foreign keys (e.g. schedules.project_id -> projects.id).
      // Deleting + inserting in the wrong order causes every child insert to be
      // silently rejected by the foreign key constraint, leaving parent rows
      // restored but all their linked records permanently empty.
      const deleteOrder = ["schedules","attendance","payroll","salary_payments","sub_milestones","commissions","invoices","ledger","subcontractors","employees","projects","app_settings"];
      const insertOrder = ["projects","employees","subcontractors","app_settings","invoices","ledger","schedules","attendance","payroll","sub_milestones","commissions","salary_payments"];
      const errors = [];
      // Delete children first, then parents (reverse-dependency order)
      for (const table of deleteOrder) {
        if (backup.data[table]) {
          const { error } = await supabase.from(table).delete().neq("id","00000000-0000-0000-0000-000000000000");
          if (error) errors.push(`${table} (delete): ${error.message}`);
        }
      }
      // Insert parents first, then children (dependency order)
      for (const table of insertOrder) {
        if (backup.data[table]?.length>0) {
          for (let i=0;i<backup.data[table].length;i+=100) {
            const { error } = await supabase.from(table).insert(backup.data[table].slice(i,i+100));
            if (error) { errors.push(`${table} (insert rows ${i}-${i+100}): ${error.message}`); break; }
          }
        }
      }
      if (errors.length) {
        logActivity("Backup restore finished with errors", errors.join(" | ").slice(0,500), "Settings");
        showMsg("⚠ Restore finished with errors — some data may be missing: " + errors.join(" | "), "error");
      } else {
        logActivity("Backup restore completed successfully", `File: ${restoreFile.name}`, "Settings");
        showMsg("✅ Restore complete! Please refresh the page.");
      }
    } catch(e) { logActivity("Backup restore failed", e.message, "Settings"); showMsg("❌ "+e.message,"error"); }
    setRestoring(false);
  };

  if (!isAdmin) return (
    <div style={{padding:24}}>
      <div style={{background:"#fff",borderRadius:12,padding:60,textAlign:"center",border:"1px solid #e2e8f0"}}>
        <div style={{fontSize:48,marginBottom:16}}>🔒</div>
        <div style={{fontSize:20,fontWeight:800,color:"#0f172a",marginBottom:8}}>Admin Access Required</div>
        <div style={{fontSize:13,color:"#64748b",marginBottom:24}}>Settings are only accessible to admin users.</div>
        <button onClick={()=>setShowLogin(true)} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:10,padding:"12px 32px",fontSize:14,fontWeight:700,cursor:"pointer"}}>🔑 Admin Login</button>
      </div>
    </div>
  );

  const inp = {width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px 14px",fontSize:13,boxSizing:"border-box",outline:"none"};

  return (
    <div style={{padding:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>⚙ Settings & Backup</div>
          <div style={{fontSize:13,color:"#64748b"}}>Company profile, admin access, and data management</div>
        </div>
        {msg.text&&<div style={{background:msg.type==="error"?"#fef2f2":"#ecfdf5",color:msg.type==="error"?"#dc2626":"#10b981",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:600}}>{msg.text}</div>}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr",gap:20}}>
        <div>
          {/* Company Profile */}
          <Card title="🏢 Company Profile — Oman Civil Construction">
            {/* Logo */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:"#64748b",marginBottom:8,fontWeight:500}}>Company Logo (appears on invoices, receipts, quotations)</div>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                {settings.company_logo
                  ?<img src={settings.company_logo} alt="logo" style={{width:80,height:80,objectFit:"contain",border:"1px solid #e2e8f0",borderRadius:8,background:"#f8fafc",padding:4}} />
                  :<div style={{width:80,height:80,border:"2px dashed #e2e8f0",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"#94a3b8",fontSize:12,textAlign:"center",lineHeight:1.3}}>No<br/>Logo</div>
                }
                <div>
                  <input ref={logoRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>uploadLogo(e.target.files[0])} />
                  <button onClick={()=>logoRef.current?.click()} disabled={logoUploading}
                    style={{background:"#f1f5f9",color:"#475569",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 16px",fontSize:13,cursor:"pointer",display:"block",marginBottom:6}}>
                    {logoUploading?"Uploading...":"📁 Upload Logo"}
                  </button>
                  {settings.company_logo&&<button onClick={()=>save("company_logo","")}
                    style={{background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,cursor:"pointer"}}>Remove</button>}
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>PNG, JPG — max 2MB</div>
                </div>
              </div>
            </div>

            {/* Company fields */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {COMPANY_FIELDS.map(f=>(
                <div key={f.key} style={{gridColumn:f.col===2?"span 2":"span 1"}}>
                  <div style={{fontSize:12,color:"#64748b",marginBottom:4,fontWeight:500}}>{f.label}</div>
                  <div style={{display:"flex",gap:8}}>
                    <input value={settings[f.key]||""} onChange={e=>setSettings(p=>({...p,[f.key]:e.target.value}))}
                      placeholder={f.placeholder} style={{...inp,flex:1}} />
                    <button onClick={()=>save(f.key,settings[f.key]||"")} disabled={saving[f.key]}
                      style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"0 14px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
                      {saving[f.key]?"...":"💾"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Preview */}
            {(settings.company_name||settings.company_phone)&&(
              <div style={{marginTop:16,background:"#f8fafc",borderRadius:10,padding:16,border:"1px solid #e2e8f0"}}>
                <div style={{fontSize:11,color:"#64748b",fontWeight:600,marginBottom:10}}>PREVIEW — As it appears on invoices & receipts</div>
                <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                  {settings.company_logo&&<img src={settings.company_logo} alt="logo" style={{width:48,height:48,objectFit:"contain",borderRadius:6,background:"#fff",padding:2,border:"1px solid #e2e8f0"}} />}
                  <div>
                    <div style={{fontWeight:800,color:"#0f172a",fontSize:14}}>{settings.company_name||"Company Name"}</div>
                    {settings.company_name_ar&&<div style={{fontSize:12,color:"#475569",direction:"rtl"}}>{settings.company_name_ar}</div>}
                    <div style={{fontSize:11,color:"#64748b",marginTop:4}}>{settings.company_address}</div>
                    <div style={{fontSize:11,color:"#64748b"}}>📞 {settings.company_phone} {settings.company_phone2?`· ${settings.company_phone2}`:""}</div>
                    <div style={{fontSize:11,color:"#64748b"}}>✉ {settings.company_email} {settings.company_website?`· ${settings.company_website}`:""}</div>
                    {settings.company_cr&&<div style={{fontSize:11,color:"#64748b"}}>CR: {settings.company_cr} {settings.company_license?`· Lic: ${settings.company_license}`:""}</div>}
                    {settings.company_vat_no&&<div style={{fontSize:11,color:"#64748b"}}>VAT: {settings.company_vat_no} {settings.company_tax_no?`· Tax: ${settings.company_tax_no}`:""}</div>}
                    {settings.company_bank&&<div style={{fontSize:11,color:"#64748b"}}>Bank: {settings.company_bank} {settings.company_iban?`· IBAN: ${settings.company_iban}`:""}</div>}
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Invoice & Quotation Numbering */}
          <Card title="🔢 Invoice & Quotation Numbering">
            <div style={{fontSize:12,color:"#64748b",marginBottom:10}}>Set prefixes for auto-generated numbers (e.g. INV-0001, QTN-0001). Numbers continue automatically on each new invoice/quotation — you can also edit the number manually.</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
              {NUMBERING_FIELDS.map(f=>(
                <div key={f.key}>
                  <div style={{fontSize:12,color:"#64748b",marginBottom:4,fontWeight:500}}>{f.label}</div>
                  <div style={{display:"flex",gap:8}}>
                    <input value={settings[f.key]||""} onChange={e=>setSettings(p=>({...p,[f.key]:e.target.value}))}
                      placeholder={f.placeholder} style={{...inp,flex:1}} />
                    <button onClick={()=>save(f.key,settings[f.key]||"")} disabled={saving[f.key]}
                      style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"0 14px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
                      {saving[f.key]?"...":"💾"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Admin Email */}
          <Card title="✉ Admin Email — OTP Login Access">
            <div style={{fontSize:12,color:"#64748b",marginBottom:10}}>Authorized emails for OTP admin login (comma separated)</div>
            <input value={adminEmail} onChange={e=>setAdminEmail(e.target.value)} style={inp} />
            <SaveBtn k="admin_emails" saving={saving} onClick={()=>save("admin_emails",adminEmail)} />
          </Card>
        </div>

        <div>
          {/* Backup */}
          <div style={{background:"#0f172a",borderRadius:12,padding:24,color:"#f1f5f9",marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>🗄 MANUAL SYSTEM BACKUP</div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>Download complete backup of all business data — projects, invoices, employees, attendance, payroll, ledger, subcontractors.</div>
            <button onClick={downloadBackup} disabled={backupLoading}
              style={{width:"100%",background:backupLoading?"#1e293b":"#fff",color:backupLoading?"#64748b":"#0f172a",border:"none",borderRadius:8,padding:"12px",fontSize:13,fontWeight:700,cursor:backupLoading?"not-allowed":"pointer"}}>
              {backupLoading?"⏳ Preparing...":"⬇ Run Full Backup & Download"}
            </button>
          </div>

          {/* Restore */}
          <Card title="⬆ Restore From Backup">
            <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Upload a previously downloaded JSON backup file to restore all data.</div>
            <div style={{border:"2px dashed #e2e8f0",borderRadius:10,padding:20,textAlign:"center",cursor:"pointer",marginBottom:10}} onClick={()=>document.getElementById("restoreInput").click()}>
              <input id="restoreInput" type="file" accept=".json" style={{display:"none"}} onChange={e=>setRestoreFile(e.target.files[0])} />
              <div style={{fontSize:20,marginBottom:4}}>⬆</div>
              <div style={{color:"#6366f1",fontWeight:600,fontSize:13}}>{restoreFile?`📄 ${restoreFile.name}`:"CHOOSE BACKUP FILE"}</div>
              <div style={{fontSize:11,color:"#94a3b8"}}>Click to browse JSON backup file</div>
            </div>
            {restoreFile&&<button onClick={restoreBackup} disabled={restoring}
              style={{width:"100%",background:restoring?"#f1f5f9":"#ef4444",color:restoring?"#64748b":"#fff",border:"none",borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,cursor:restoring?"not-allowed":"pointer"}}>
              {restoring?"⏳ Restoring...":"⚠ Restore — Overwrites All Data"}
            </button>}
            <div style={{background:"#fffbeb",border:"1px solid #f59e0b",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#92400e",marginTop:10}}>⚠ Restoring overwrites all current data. Download fresh backup first.</div>
          </Card>

          {/* Automatic Backup History */}
          <Card title="🕐 Automatic Daily Backup History">
            <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>
              A full backup is taken automatically — silently, in the background — the first time an admin opens the app each day. No action needed. The last 30 days are kept here; older ones are removed automatically.
            </div>
            {snapshotsLoading ? (
              <div style={{fontSize:12,color:"#94a3b8",textAlign:"center",padding:16}}>Loading...</div>
            ) : snapshots.length === 0 ? (
              <div style={{fontSize:12,color:"#94a3b8",textAlign:"center",padding:16,background:"#f8fafc",borderRadius:8}}>No automatic backups yet — one will be created next time the app is opened.</div>
            ) : (
              <div style={{maxHeight:280,overflowY:"auto"}}>
                {snapshots.map(s => (
                  <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
                    <div>
                      <div style={{fontWeight:600,color:"#1e293b"}}>{s.backup_date}</div>
                      <div style={{fontSize:10,color:"#94a3b8"}}>{s.table_count} tables · {s.row_count} rows · {(s.size_bytes/1024).toFixed(0)} KB</div>
                    </div>
                    <button onClick={()=>downloadSnapshot(s)} disabled={downloadingSnapshot===s.id}
                      style={{background:"#eef2ff",color:"#6366f1",border:"none",borderRadius:6,padding:"5px 12px",fontSize:11,fontWeight:600,cursor:downloadingSnapshot===s.id?"not-allowed":"pointer"}}>
                      {downloadingSnapshot===s.id?"⏳":"⬇ Download"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Google Drive */}
          <Card title="☁ Google Drive Backup URL">
            <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>Save a Google Drive folder link here for your own reference (e.g. where you keep manually-downloaded backups).</div>
            <input value={driveUrl} onChange={e=>setDriveUrl(e.target.value)} placeholder="https://drive.google.com/..." style={inp} />
            <SaveBtn k="drive_url" saving={saving} onClick={()=>save("drive_url",driveUrl)} />
          </Card>

          {/* AI Assistant */}
          <Card title="🤖 AI Assistant (Gemini)">
            <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>
              Paste a free Google Gemini API key to turn the 💬 chat assistant into a real AI that answers questions from your live data, in English / Malayalam / Hindi.
            </div>
            <ol style={{fontSize:11,color:"#64748b",margin:"0 0 10px 0",paddingLeft:18,lineHeight:1.7}}>
              <li>Go to <span style={{color:"#6366f1",fontFamily:"monospace"}}>aistudio.google.com/apikey</span></li>
              <li>Sign in &amp; click "Create API key"</li>
              <li>Copy the key (starts with AIza...) and paste below</li>
            </ol>
            <input type="password" value={settings.gemini_api_key||""} onChange={e=>setSettings(p=>({...p,gemini_api_key:e.target.value}))}
              placeholder="AIza..." style={{...inp, fontFamily:"monospace"}} />
            <SaveBtn k="gemini_api_key" saving={saving} onClick={()=>save("gemini_api_key",(settings.gemini_api_key||"").trim())} />
            <div style={{background: settings.gemini_api_key ? "#ecfdf5":"#fffbeb", border:`1px solid ${settings.gemini_api_key?"#86efac":"#f59e0b"}`, borderRadius:8, padding:"8px 12px", fontSize:11, color: settings.gemini_api_key?"#065f46":"#92400e", marginTop:10}}>
              {settings.gemini_api_key ? "✅ AI assistant is active. Ask anything in the 💬 chat." : "⚠ No key set — the chat uses basic keyword answers. Add a key for full AI."}
            </div>
            <div style={{fontSize:10,color:"#94a3b8",marginTop:8}}>Note: Gemini free tier allows ~1500 questions/day. If the key is misused, just create a new one and replace it here.</div>
          </Card>

          {/* Field App */}
          <Card title="📱 Employee Field App">
            <div style={{fontSize:13,color:"#64748b",marginBottom:12}}>Share this link with employees for GPS attendance:</div>
            <div style={{background:"#f8fafc",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#6366f1",fontFamily:"monospace",marginBottom:10,wordBreak:"break-all"}}>
              {window.location.origin}/#field
            </div>
            <button onClick={()=>{navigator.clipboard.writeText(window.location.origin+"/#field");showMsg("✅ Link copied!");}}
              style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              📋 Copy Link
            </button>
          </Card>

          {/* System Info */}
          <ActivityLogCard />
          <Card title="ℹ System Information">
            {[["Software","Minarva Biz ERP v1.2"],["Company","SEVENSEAS Modern Enterprises"],["Database","Supabase · Singapore"],["Photo Storage","Cloudinary · 25GB"],["Hosting","Vercel"]].map(([l,v])=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f8fafc",fontSize:12}}>
                <span style={{color:"#64748b"}}>{l}</span>
                <span style={{color:"#1e293b",fontWeight:600}}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    
      {/* Bank Accounts */}
      <div style={{ background:"#fff",borderRadius:14,padding:24,border:"1px solid #e2e8f0",marginTop:8 }}>
        <div style={{ fontWeight:700,fontSize:15,color:"#0f172a",marginBottom:16 }}>🏦 Bank Accounts</div>
        {bankAccounts.map(acc=>(
          <div key={acc.id} style={{ background:"#f8fafc",borderRadius:10,padding:14,marginBottom:10,border:"1px solid #e2e8f0" }}>
            {editingBank===acc.id?(
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:10,alignItems:"flex-end" }}>
                <div><div style={{ fontSize:11,color:"#64748b",marginBottom:4 }}>Account Name</div>
                  <input value={acc.account_name} onChange={e=>setBankAccounts(p=>p.map(a=>a.id===acc.id?{...a,account_name:e.target.value}:a))}
                    style={{ width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:13,boxSizing:"border-box",outline:"none" }} /></div>
                <div><div style={{ fontSize:11,color:"#64748b",marginBottom:4 }}>Account Number</div>
                  <input value={acc.account_number||""} onChange={e=>setBankAccounts(p=>p.map(a=>a.id===acc.id?{...a,account_number:e.target.value}:a))}
                    style={{ width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:13,boxSizing:"border-box",outline:"none" }} /></div>
                <div><div style={{ fontSize:11,color:"#64748b",marginBottom:4 }}>Opening Balance (OMR)</div>
                  <input type="number" value={acc.opening_balance||0} step="0.001"
                    onChange={e=>setBankAccounts(p=>p.map(a=>a.id===acc.id?{...a,opening_balance:e.target.value}:a))}
                    style={{ width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:13,boxSizing:"border-box",outline:"none" }} /></div>
                <button onClick={async()=>{
                  const {supabase:sb}=await import("../lib/supabase");
                  const res = await setOpeningBalance(acc.account_name, acc.opening_balance);
                  const isFallback = typeof acc.id === "string" && acc.id.startsWith("account-");
                  if (!isFallback) {
                    try {
                      await sb.from("bank_accounts").update({
                        account_name:acc.account_name,
                        account_number:acc.account_number||"",
                        opening_balance:parseFloat(acc.opening_balance)||0
                      }).eq("id",acc.id);
                    } catch {}
                  }
                  if (!res || !res.ok) {
                    alert("Save failed: " + (res?.error || "unknown error") + "\n\nThe app_settings table may be missing. Tell Claude this exact message.");
                  } else {
                    setEditingBank(null);
                    const accts = await getBankAccounts();
                    setBankAccounts(accts);
                  }
                }} style={{ background:"#10b981",color:"#fff",border:"none",borderRadius:8,padding:"9px 14px",cursor:"pointer",fontWeight:600,fontSize:12,whiteSpace:"nowrap" }}>💾 Save</button>
              </div>
            ):(
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <div>
                  <div style={{ fontWeight:700,color:"#0f172a" }}>{acc.account_name}</div>
                  <div style={{ fontSize:12,color:"#64748b",marginTop:2 }}>{acc.account_number||"No account number set"}</div>
                  <div style={{ fontSize:11,color:"#10b981",marginTop:2 }}>Opening Balance: OMR {parseFloat(acc.opening_balance||0).toFixed(3)}</div>
                </div>
                {isAdmin&&<button onClick={()=>setEditingBank(acc.id)} style={{ background:"#eef2ff",color:"#6366f1",border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:12,fontWeight:600 }}>✏ Edit</button>}
              </div>
            )}
          </div>
        ))}

        {/* Assign old ledger entries to an account */}
        {isAdmin && (
          <div style={{ marginTop:16,padding:16,background:"#fffbeb",borderRadius:10,border:"1px solid #fde68a" }}>
            <div style={{ fontWeight:700,fontSize:13,color:"#92400e",marginBottom:6 }}>🔄 Assign Old Transactions to an Account</div>
            <div style={{ fontSize:12,color:"#78716c",marginBottom:12,lineHeight:1.5 }}>
              Move existing ledger entries into the correct bank account so they count toward its balance. First press "Check" to see how many entries use each payment mode, then choose which mode to move and the target account.
            </div>
            <button onClick={async()=>{
              const {supabase:sb}=await import("../lib/supabase");
              const { data, error } = await sb.from("ledger").select("payment_mode, type, amount").is("deleted_at",null);
              if(error){ alert("Could not read ledger: "+error.message); return; }
              const modes={};
              (data||[]).forEach(r=>{
                const m=r.payment_mode||"(blank)";
                if(!modes[m]) modes[m]={count:0,credit:0,debit:0};
                modes[m].count++;
                if(r.type==="Credits (Income)") modes[m].credit+=parseFloat(r.amount||0);
                else if(r.type==="Debits (Payouts)") modes[m].debit+=parseFloat(r.amount||0);
              });
              const lines=Object.entries(modes).map(([m,v])=>`${m}: ${v.count} entries | +${v.credit.toFixed(3)} / -${v.debit.toFixed(3)} = ${(v.credit-v.debit).toFixed(3)}`);
              alert("Ledger payment modes:\n\n"+lines.join("\n"));
            }} style={{ background:"#fff",color:"#92400e",border:"1px solid #fde68a",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600,marginBottom:12 }}>🔍 Check Payment Modes</button>
            <div style={{ display:"flex",gap:8,alignItems:"center",flexWrap:"wrap" }}>
              <input id="migrate-from" placeholder="From mode (e.g. Cash)" defaultValue="Cash" style={{ border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:13,outline:"none",width:160 }} />
              <span style={{ color:"#78716c",fontSize:13 }}>→</span>
              <select id="migrate-target" defaultValue="" style={{ border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:13,outline:"none" }}>
                <option value="">— Target account —</option>
                {bankAccounts.map(a=><option key={a.id} value={a.account_name}>{a.account_name}</option>)}
              </select>
              <button onClick={async()=>{
                const fromMode=document.getElementById("migrate-from")?.value?.trim();
                const target=document.getElementById("migrate-target")?.value;
                if(!fromMode){ alert("Enter the 'From mode' (e.g. Cash)."); return; }
                if(!target){ alert("Select the target account."); return; }
                if(fromMode===target){ alert("From and target are the same."); return; }
                const {supabase:sb}=await import("../lib/supabase");
                const { data: rows, error: cErr } = await sb.from("ledger").select("id").eq("payment_mode",fromMode).is("deleted_at",null);
                if(cErr){ alert("Could not read ledger: "+cErr.message); return; }
                const n=(rows||[]).length;
                if(n===0){ alert(`No entries found with payment mode "${fromMode}".\n\nPress "Check Payment Modes" to see the exact names.`); return; }
                if(!window.confirm(`Move ${n} entries from "${fromMode}" to "${target}"?\n\nThis can be reversed by running it the other way.`)) return;
                const { error: uErr } = await sb.from("ledger").update({ payment_mode: target }).eq("payment_mode",fromMode).is("deleted_at",null);
                if(uErr){ alert("Update failed: "+uErr.message); return; }
                alert(`✓ Done. ${n} entries moved to ${target}.\n\nOpen the Dashboard to see the updated balance.`);
              }} style={{ background:"#f59e0b",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:13,fontWeight:600 }}>Move Entries</button>
            </div>
            <div style={{ marginTop:12,paddingTop:12,borderTop:"1px solid #fde68a" }}>
              <button onClick={async()=>{
                const target=document.getElementById("migrate-target")?.value;
                if(!target){ alert("ആദ്യം Target account select ചെയ്യൂ (ഉദാ: Sandeep Account)"); return; }
                const {supabase:sb}=await import("../lib/supabase");
                const { data: rows } = await sb.from("ledger").select("id").neq("payment_mode",target).is("deleted_at",null);
                const n=(rows||[]).length;
                if(n===0){ alert("എല്ലാ entries ഇപ്പോൾ "+target+"-ൽ തന്നെയാണ്."); return; }
                if(!window.confirm(n+" entries "+target+"-ലേക്ക് move ചെയ്യണോ?\n\nഎല്ലാ cashbook entries-ഉം ഈ account-ലേക്ക് ചേരും.")) return;
                const { error } = await sb.from("ledger").update({ payment_mode: target }).neq("payment_mode",target).is("deleted_at",null);
                if(error){ alert("പ്രശ്നം: "+error.message); return; }
                alert("✓ "+n+" entries "+target+"-ലേക്ക് move ചെയ്തു.\n\nDashboard-ൽ ശരിയായ balance കാണാം.");
              }} style={{ background:"#8b5cf6",color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontSize:13,fontWeight:700 }}>⚡ എല്ലാ Entries ഒന്നിച്ച് Move ചെയ്യൂ</button>
              <div style={{ fontSize:11,color:"#78716c",marginTop:6 }}>മുകളിൽ target account select ചെയ്ത ശേഷം ഈ ബട്ടൺ ക്ലിക്ക് ചെയ്യൂ. എല്ലാ cashbook entries-ഉം ആ account-ലേക്ക് മാറും.</div>
            </div>
          </div>
        )}

        {/* ══════ USER MANAGEMENT ══════ */}
        <UserManagement />
      </div>
</div>
  );
}

function UserManagement() {
  const { isAdmin, currentUser, logActivity } = useAdmin();
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ username:"", display_name:"", password:"", role:"Viewer", permissions:{} });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { loadUsers(); }, []);
  const loadUsers = async () => {
    const { data } = await supabase.from("app_users").select("*").is("deleted_at",null).order("created_at");
    setUsers(data || []);
  };

  if (!isAdmin) return null;

  const startAdd = () => {
    const perms = {};
    ALL_PAGES.forEach(p => { perms[p.id] = { view: true, edit: false }; });
    setForm({ username:"", display_name:"", password:"", role:"Viewer", permissions: perms });
    setEditUser(null);
    setShowForm(true);
  };

  const startEdit = (u) => {
    setForm({ username: u.username, display_name: u.display_name, password: "", role: u.role, permissions: u.permissions || {} });
    setEditUser(u.id);
    setShowForm(true);
  };

  const applyPreset = (role) => {
    const preset = ROLE_PRESETS[role];
    if (preset) setForm(p => ({ ...p, role, permissions: JSON.parse(JSON.stringify(preset)) }));
    else setForm(p => ({ ...p, role }));
  };

  const togglePerm = (pageId, type) => {
    setForm(p => {
      const perms = { ...p.permissions };
      if (!perms[pageId]) perms[pageId] = { view: false, edit: false };
      perms[pageId] = { ...perms[pageId], [type]: !perms[pageId][type] };
      if (type === "edit" && perms[pageId].edit) perms[pageId].view = true;
      return { ...p, permissions: perms, role: "Custom" };
    });
  };

  const saveUser = async () => {
    if (!form.username.trim() || !form.display_name.trim()) { setMsg("❌ Username and name required"); return; }
    if (!editUser && !form.password) { setMsg("❌ Password required for new user"); return; }
    setSaving(true);
    const row = {
      username: form.username.trim().toLowerCase(),
      display_name: form.display_name.trim(),
      role: form.role,
      permissions: form.permissions,
      is_active: true,
    };
    if (form.password) row.password = bcrypt.hashSync(form.password, 10);
    let error;
    if (editUser) {
      ({ error } = await supabase.from("app_users").update(row).eq("id", editUser));
    } else {
      row.password = row.password || bcrypt.hashSync("changeme", 10);
      ({ error } = await supabase.from("app_users").insert(row));
    }
    if (error) setMsg("❌ " + error.message);
    else {
      logActivity(editUser?"Edited user":"Added user", `${row.display_name} (${row.username}) — Role: ${row.role}`, "Settings");
      setMsg("✅ User saved!"); setShowForm(false);
    }
    await loadUsers();
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const deleteUser = async (id, name) => {
    if (!confirm(`Move user "${name}" to Trash?`)) return;
    await supabase.from("app_users").update({deleted_at:new Date().toISOString()}).eq("id", id);
    logActivity("Moved user to Trash", name, "Settings");
    await loadUsers();
  };

  const inp = { border:"1px solid #e2e8f0", borderRadius:8, padding:"9px 12px", fontSize:13, width:"100%", boxSizing:"border-box", outline:"none" };

  return (
    <div style={{ marginTop:24 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:16, color:"#0f172a" }}>👥 User Management</div>
          <div style={{ fontSize:12, color:"#64748b" }}>Add users, set roles, control page-level permissions</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {msg && <span style={{ fontSize:12, fontWeight:600, color:msg.startsWith("✅")?"#10b981":"#ef4444", padding:"4px 10px", background:msg.startsWith("✅")?"#ecfdf5":"#fef2f2", borderRadius:6 }}>{msg}</span>}
          <button onClick={startAdd} style={{ background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"9px 16px", fontSize:13, fontWeight:600, cursor:"pointer" }}>+ Add User</button>
        </div>
      </div>

      {/* User Form */}
      {showForm && (
        <div style={{ background:"#f8fafc", borderRadius:12, padding:20, marginBottom:16, border:"2px solid #6366f1" }}>
          <div style={{ fontWeight:700, fontSize:14, color:"#0f172a", marginBottom:14 }}>{editUser ? "✏️ Edit User" : "➕ New User"}</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12, marginBottom:16 }}>
            <div>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500 }}>Username *</div>
              <input value={form.username} onChange={e=>setForm(p=>({...p,username:e.target.value}))} style={inp} placeholder="e.g. sandeep" disabled={!!editUser} />
            </div>
            <div>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500 }}>Display Name *</div>
              <input value={form.display_name} onChange={e=>setForm(p=>({...p,display_name:e.target.value}))} style={inp} placeholder="e.g. Sandeep Kumar" />
            </div>
            <div>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500 }}>{editUser ? "New Password (leave empty to keep)" : "Password *"}</div>
              <input type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} style={inp} placeholder="••••••" />
            </div>
            <div>
              <div style={{ fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500 }}>Role (quick preset)</div>
              <select value={form.role} onChange={e=>applyPreset(e.target.value)} style={inp}>
                <option>Admin</option>
                <option>Manager</option>
                <option>Accountant</option>
                <option>Viewer</option>
                <option>Custom</option>
              </select>
            </div>
          </div>

          {/* Permissions Table */}
          <div style={{ fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:10 }}>📋 Page Permissions</div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, background:"#fff", border:"1px solid #e2e8f0", borderRadius:8, overflow:"hidden" }}>
              <thead><tr style={{ background:"#f8fafc" }}>
                <th style={{ padding:"10px 14px", textAlign:"left", color:"#64748b", fontWeight:600, fontSize:11 }}>Page / Section</th>
                <th style={{ padding:"10px 14px", textAlign:"center", color:"#64748b", fontWeight:600, fontSize:11, width:80 }}>View</th>
                <th style={{ padding:"10px 14px", textAlign:"center", color:"#64748b", fontWeight:600, fontSize:11, width:80 }}>Edit</th>
              </tr></thead>
              <tbody>
                {ALL_PAGES.filter(pg => pg.id !== "settings").map((pg, i) => {
                  const perm = form.permissions?.[pg.id] || { view:false, edit:false };
                  const noEdit = pg.id === "dashboard" || pg.id === "reports";
                  return (
                    <tr key={pg.id} style={{ borderTop:"1px solid #f1f5f9", background:i%2===0?"#fff":"#fafbfc" }}>
                      <td style={{ padding:"8px 14px", fontWeight:500, color:"#1e293b" }}>{pg.label}</td>
                      <td style={{ padding:"8px 14px", textAlign:"center" }}>
                        <input type="checkbox" checked={!!perm.view} onChange={()=>togglePerm(pg.id,"view")}
                          style={{ width:18, height:18, cursor:"pointer", accentColor:"#10b981" }} />
                      </td>
                      <td style={{ padding:"8px 14px", textAlign:"center" }}>
                        {noEdit ? <span style={{ color:"#94a3b8", fontSize:11 }}>—</span> :
                          <input type="checkbox" checked={!!perm.edit} onChange={()=>togglePerm(pg.id,"edit")}
                            style={{ width:18, height:18, cursor:"pointer", accentColor:"#6366f1" }} />
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display:"flex", gap:10, marginTop:14 }}>
            <button onClick={saveUser} disabled={saving} style={{ background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontSize:13, fontWeight:600 }}>{saving?"Saving...":"💾 Save User"}</button>
            <button onClick={()=>setShowForm(false)} style={{ background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontSize:13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Users List */}
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden" }}>
          <thead><tr style={{ background:"#f8fafc" }}>
            {["Username","Display Name","Role","Last Login","Pages Access",""].map(h=>(
              <th key={h} style={{ padding:"10px 14px", textAlign:"left", color:"#64748b", fontWeight:600, fontSize:11, borderBottom:"1px solid #e2e8f0" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {users.length===0
              ? <tr><td colSpan={6} style={{ padding:40, textAlign:"center", color:"#94a3b8" }}>No users. Click "+ Add User" to create.</td></tr>
              : users.map((u, i) => {
                const viewCount = ALL_PAGES.filter(p=>u.permissions?.[p.id]?.view).length;
                const editCount = ALL_PAGES.filter(p=>u.permissions?.[p.id]?.edit).length;
                return (
                  <tr key={u.id} style={{ borderTop:"1px solid #f1f5f9", background:i%2===0?"#fff":"#fafbfc" }}>
                    <td style={{ padding:"10px 14px", fontWeight:700, color:"#1e293b" }}>{u.username}</td>
                    <td style={{ padding:"10px 14px", color:"#475569" }}>{u.display_name}</td>
                    <td style={{ padding:"10px 14px" }}>
                      <span style={{ background:u.role==="Admin"?"#ecfdf5":u.role==="Manager"?"#eef2ff":"#f8fafc", color:u.role==="Admin"?"#10b981":u.role==="Manager"?"#6366f1":"#64748b", borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600 }}>{u.role}</span>
                    </td>
                    <td style={{ padding:"10px 14px", color:"#94a3b8", fontSize:12 }}>{u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never"}</td>
                    <td style={{ padding:"10px 14px", fontSize:12, color:"#64748b" }}>View: {viewCount} · Edit: {editCount}</td>
                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={()=>startEdit(u)} style={{ background:"#eef2ff", color:"#6366f1", border:"none", borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:11 }}>✏️</button>
                        {u.id !== currentUser?.id && (
                          <button onClick={()=>deleteUser(u.id, u.username)} style={{ background:"#fef2f2", color:"#ef4444", border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", fontSize:11 }}>🗑</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActivityLogCard() {
  const [logs, setLogs] = useState([]);const [loading, setLoading] = useState(true);const [expanded, setExpanded] = useState(false);
  useEffect(() => { supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(200).then(({ data }) => { setLogs(data || []); setLoading(false); }); }, []);
  const shown = expanded ? logs : logs.slice(0, 12);
  const fmt = (ts) => { try { return new Date(ts).toLocaleString(); } catch { return ts; } };
  return (<div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:20, marginBottom:16 }}>
    <div style={{ fontWeight:700, fontSize:14, color:"#0f172a", marginBottom:4 }}>🕓 Activity Log</div>
    <div style={{ fontSize:11, color:"#64748b", marginBottom:12 }}>Who did what, when.</div>
    {loading ? <div style={{color:"#94a3b8",fontSize:12,padding:12}}>Loading...</div>
      : logs.length===0 ? <div style={{color:"#94a3b8",fontSize:12,padding:12}}>No activity yet.</div>
      : (<div style={{maxHeight:expanded?"none":360,overflowY:"auto"}}>
        {shown.map(l=>(<div key={l.id} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"8px 0",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
          <div><div style={{fontWeight:700,color:"#1e293b"}}>{l.action} {l.page?<span style={{color:"#94a3b8",fontWeight:400}}>· {l.page}</span>:null}</div>{l.detail?<div style={{color:"#64748b",fontSize:11}}>{l.detail}</div>:null}</div>
          <div style={{textAlign:"right",whiteSpace:"nowrap"}}><div style={{color:"#6366f1",fontWeight:600}}>{l.display_name||l.username}</div><div style={{color:"#94a3b8",fontSize:10}}>{fmt(l.created_at)}</div></div>
        </div>))}
        {logs.length>12&&(<button onClick={()=>setExpanded(e=>!e)} style={{marginTop:10,background:"#f1f5f9",color:"#475569",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>{expanded?"Show less":`Show all ${logs.length}`}</button>)}
      </div>)}
  </div>);
}
