import { useState } from "react";

export const ROLES = [
  "Project Manager","Site Engineer","Civil Engineer","Structural Engineer","MEP Engineer",
  "Quantity Surveyor","Site Supervisor","Foreman","Mason / Bricklayer","Carpenter",
  "Steel Fixer / Rebar Worker","Plasterer","Tiler","Painter","Welder",
  "Electrician","Plumber","HVAC Technician","Heavy Equipment Operator",
  "Crane Operator","Scaffolder","Surveyor","Safety Officer","Storekeeper",
  "Driver","Accountant","Admin / Office Staff","Cleaner","Security Guard",
  "Helper / Laborer","Other"
];

export const NATIONALITIES = [
  "Omani","Indian","Pakistani","Bangladeshi","Nepali","Sri Lankan",
  "Filipino","Egyptian","Jordanian","Yemeni","Ethiopian","Indonesian","Other"
];

export const OMAN_BANKS = [
  "Bank Muscat","National Bank of Oman (NBO)","Bank Dhofar","Sohar International",
  "HSBC Oman","Standard Chartered Oman","Ahli Bank","Bank Nizwa",
  "Alizz Islamic Bank","First Abu Dhabi Bank (FAB)","Habib Bank","Other"
];

export const BANK_BRANCHES = {
  "Bank Muscat": ["Main Branch Muscat","Ruwi","Barka","Sohar","Salalah","Nizwa","Sur","Ibri","Other"],
  "National Bank of Oman (NBO)": ["Main Branch","Ruwi","Barka","Sohar","Salalah","Other"],
  "Bank Dhofar": ["Main Branch","Ruwi","Barka","Salalah","Other"],
  "Sohar International": ["Main Branch","Sohar","Muscat","Other"],
  "default": ["Main Branch","City Branch","Other"]
};

export const emptyEmp = () => ({
  name:"", role:"Mason / Bricklayer", nationality:"Indian",
  phone_oman:"", phone_home:"", staff_type:"Own Staff",
  passport_no:"", ptaka_no:"", visa_no:"",
  bank_name:"", bank_branch:"", account_no:"", iban:"",
  daily_rate:"", status:"Active", join_date:"", emp_group:"Group 1", opening_balance:"0",
  work_start:"07:00", work_end:"18:00", break_start:"13:00", break_end:"14:00"
});

// Timing presets
export const TIMING_PRESETS = {
  "Site (7am–6pm, break 1–2)":   { work_start:"07:00", work_end:"18:00", break_start:"13:00", break_end:"14:00" },
  "Office (9am–9pm, break 1–4)": { work_start:"09:00", work_end:"21:00", break_start:"13:00", break_end:"16:00" },
};

// Fully self-contained form — manages its OWN state
// No parent state interaction during typing = no focus loss
export default function EmployeeForm({ initial, onSave, onCancel, saving, title, groups = ["Group 1","Group 2","Group 3","Group 4","Group 5","Group 6"] }) {
  const [f, setF] = useState(() => initial ? { ...initial } : emptyEmp());
  const upd = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const branches = BANK_BRANCHES[f.bank_name] || BANK_BRANCHES.default;

  const s = {
    inp: {
      width:"100%", border:"1px solid #e2e8f0", borderRadius:8,
      padding:"10px 12px", fontSize:13, boxSizing:"border-box",
      outline:"none", fontFamily:"inherit", background:"#fff"
    },
    label: { fontSize:12, color:"#64748b", marginBottom:5, fontWeight:500, display:"block" },
    section: {
      gridColumn:"span 3", fontSize:11, color:"#6366f1", fontWeight:700,
      letterSpacing:1, borderBottom:"2px solid #eef2ff",
      paddingBottom:6, marginTop:16, marginBottom:4
    }
  };

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.55)",
      zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center",
      padding:16
    }}>
      <div style={{
        background:"#fff", borderRadius:16, width:"100%", maxWidth:780,
        maxHeight:"92vh", overflowY:"auto",
        boxShadow:"0 24px 80px rgba(0,0,0,0.35)"
      }}>
        {/* Header */}
        <div style={{
          padding:"18px 24px", borderBottom:"1px solid #f1f5f9",
          display:"flex", justifyContent:"space-between", alignItems:"center",
          position:"sticky", top:0, background:"#fff", zIndex:10
        }}>
          <div style={{fontWeight:800, fontSize:16, color:"#0f172a"}}>
            {title || "Employee Details"}
          </div>
          <button onClick={onCancel} style={{
            background:"#f1f5f9", border:"none", borderRadius:8,
            padding:"6px 14px", cursor:"pointer", fontSize:13, color:"#64748b"
          }}>✕ Close</button>
        </div>

        {/* Form body */}
        <div style={{padding:"20px 24px"}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14}}>

            <div style={s.section}>BASIC INFORMATION</div>

            <div style={{gridColumn:"span 2"}}>
              <label style={s.label}>Full Name *</label>
              <input
                value={f.name}
                onChange={e => upd("name", e.target.value)}
                placeholder="Employee full name"
                style={s.inp}
              />
            </div>
            <div>
              <label style={s.label}>Join Date</label>
              <input type="date" value={f.join_date} onChange={e => upd("join_date", e.target.value)} style={s.inp} />
            </div>

            <div>
              <label style={s.label}>Designation / Role</label>
              <select value={f.role} onChange={e => upd("role", e.target.value)} style={s.inp}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Nationality</label>
              <select value={f.nationality} onChange={e => upd("nationality", e.target.value)} style={s.inp}>
                {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Staff Type</label>
              <select value={f.staff_type} onChange={e => upd("staff_type", e.target.value)} style={s.inp}>
                <option>Own Staff</option>
                <option>Outsourced</option>
                <option>Contract</option>
                <option>Daily Wage</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Group</label>
              <select value={f.emp_group || "Group 1"} onChange={e => upd("emp_group", e.target.value)} style={s.inp}>
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div style={s.section}>WORK TIMING — used to calculate working hours (break time is deducted)</div>

            <div>
              <label style={s.label}>Quick Preset</label>
              <select
                value={
                  (f.work_start==="09:00" && f.work_end==="21:00" && f.break_start==="13:00" && f.break_end==="16:00") ? "Office (9am–9pm, break 1–4)"
                  : (f.work_start==="07:00" && f.work_end==="18:00" && f.break_start==="13:00" && f.break_end==="14:00") ? "Site (7am–6pm, break 1–2)"
                  : "Custom"
                }
                onChange={e => {
                  const preset = TIMING_PRESETS[e.target.value];
                  if (preset) { upd("work_start", preset.work_start); upd("work_end", preset.work_end); upd("break_start", preset.break_start); upd("break_end", preset.break_end); }
                }}
                style={s.inp}>
                <option>Site (7am–6pm, break 1–2)</option>
                <option>Office (9am–9pm, break 1–4)</option>
                <option>Custom</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Work Start</label>
              <input type="time" value={f.work_start || "07:00"} onChange={e => upd("work_start", e.target.value)} style={s.inp} />
            </div>
            <div>
              <label style={s.label}>Work End</label>
              <input type="time" value={f.work_end || "18:00"} onChange={e => upd("work_end", e.target.value)} style={s.inp} />
            </div>
            <div>
              <label style={s.label}>Break Start</label>
              <input type="time" value={f.break_start || "13:00"} onChange={e => upd("break_start", e.target.value)} style={s.inp} />
            </div>
            <div>
              <label style={s.label}>Break End</label>
              <input type="time" value={f.break_end || "14:00"} onChange={e => upd("break_end", e.target.value)} style={s.inp} />
            </div>
            <div>
              <label style={s.label}>Net Working Hours</label>
              <div style={{ ...s.inp, background:"#f0fdf4", color:"#10b981", fontWeight:700, display:"flex", alignItems:"center" }}>
                {(() => {
                  const toMin = t => { const [h,m]=(t||"0:0").split(":").map(Number); return h*60+m; };
                  const work = toMin(f.work_end) - toMin(f.work_start);
                  const brk  = toMin(f.break_end) - toMin(f.break_start);
                  const net  = (work - brk) / 60;
                  return net > 0 ? `${net.toFixed(1)} hours/day` : "Check timing";
                })()}
              </div>
            </div>

            <div style={s.section}>CONTACT — Oman phone used for attendance app login</div>

            <div>
              <label style={s.label}>Oman Phone (App Login)</label>
              <input
                value={f.phone_oman}
                onChange={e => upd("phone_oman", e.target.value)}
                placeholder="e.g. 94132280"
                type="tel"
                style={s.inp}
              />
            </div>
            <div style={{gridColumn:"span 2"}}>
              <label style={s.label}>Home Country Phone</label>
              <input
                value={f.phone_home}
                onChange={e => upd("phone_home", e.target.value)}
                placeholder="e.g. +91 XXXXXXXXXX"
                style={s.inp}
              />
            </div>

            <div style={s.section}>DOCUMENTS</div>

            <div>
              <label style={s.label}>Passport Number</label>
              <input value={f.passport_no} onChange={e => upd("passport_no", e.target.value)} placeholder="Passport No." style={s.inp} />
            </div>
            <div>
              <label style={s.label}>PTAKA / Work Permit No.</label>
              <input value={f.ptaka_no} onChange={e => upd("ptaka_no", e.target.value)} placeholder="PTAKA No." style={s.inp} />
            </div>
            <div>
              <label style={s.label}>Visa / Residence No.</label>
              <input value={f.visa_no} onChange={e => upd("visa_no", e.target.value)} placeholder="Visa No." style={s.inp} />
            </div>

            <div style={s.section}>SALARY</div>

            <div>
              <label style={s.label}>Daily Rate (OMR per day) *</label>
              <input type="number" value={f.daily_rate} onChange={e => upd("daily_rate", e.target.value)} step="0.001" placeholder="e.g. 8.000" style={s.inp} />
            </div>
            <div>
              <label style={s.label}>Status</label>
              <select value={f.status} onChange={e => upd("status", e.target.value)} style={s.inp}>
                <option>Active</option>
                <option>Inactive</option>
                <option>On Leave</option>
              </select>
            </div>
            <div style={{ gridColumn: "span 3" }}>
              <label style={{ ...s.label, color: "#8b5cf6", fontWeight: 700 }}>Previous Balance (OMR) — (+) കൊടുക്കാനുള്ളത് / (-) അധികം നൽകിയത്</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input type="number" value={f.opening_balance !== undefined && f.opening_balance !== null ? f.opening_balance : "0"} onChange={e => upd("opening_balance", e.target.value)}
                  step="0.001" placeholder="0.000"
                  style={{ ...s.inp, flex: 1, color: parseFloat(f.opening_balance) < 0 ? "#ef4444" : "#8b5cf6", fontWeight: 700, border: `2px solid ${parseFloat(f.opening_balance) < 0 ? "#ef4444" : "#8b5cf6"}`, fontSize: 15 }} />
                <div style={{ fontSize: 12, color: "#64748b" }}>💡 Software start ആകുന്നതിന് മുൻപ് (May 25 വരെ) കൊടുക്കാനുള്ള amount</div>
              </div>
            </div>

            <div style={s.section}>BANK ACCOUNT DETAILS</div>

            <div>
              <label style={s.label}>Bank Name</label>
              <select value={f.bank_name} onChange={e => { upd("bank_name", e.target.value); upd("bank_branch", ""); }} style={s.inp}>
                <option value="">Select Bank</option>
                {OMAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Branch</label>
              <select value={f.bank_branch} onChange={e => upd("bank_branch", e.target.value)} style={s.inp}>
                <option value="">Select Branch</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Account Number</label>
              <input value={f.account_no} onChange={e => upd("account_no", e.target.value)} placeholder="Account No." style={s.inp} />
            </div>
            <div style={{gridColumn:"span 3"}}>
              <label style={s.label}>IBAN</label>
              <input value={f.iban} onChange={e => upd("iban", e.target.value)} placeholder="OM00 0000 0000 0000 0000 0000" style={s.inp} />
            </div>

          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding:"16px 24px", borderTop:"1px solid #f1f5f9",
          display:"flex", gap:12,
          position:"sticky", bottom:0, background:"#fff"
        }}>
          <button
            onClick={() => onSave(f)}
            disabled={saving || !f.name}
            style={{
              background: (!f.name || saving) ? "#94a3b8" : "#6366f1",
              color:"#fff", border:"none", borderRadius:10,
              padding:"12px 28px", fontSize:14, fontWeight:700,
              cursor: (!f.name || saving) ? "not-allowed" : "pointer"
            }}
          >
            {saving ? "⏳ Saving..." : "💾 Save Employee"}
          </button>
          <button onClick={onCancel} style={{
            background:"#f1f5f9", color:"#64748b", border:"none",
            borderRadius:10, padding:"12px 20px", fontSize:13, cursor:"pointer"
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
