import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../context/AdminContext";

const statusColors={Active:"#10b981",Planning:"#6366f1",Delayed:"#ef4444",Completed:"#64748b"};
const statusBg={Active:"#ecfdf5",Planning:"#eef2ff",Delayed:"#fef2f2",Completed:"#f8fafc"};

function MilestoneGraph({ schedules, type, title }) {
  const total = schedules.reduce((s,x)=>s+parseFloat(x.amount||0),0);
  const done = type==="payment"
    ? schedules.reduce((s,x)=>s+parseFloat(x.received||0),0)
    : schedules.filter(x=>x.work_completed).reduce((s,x)=>s+parseFloat(x.amount||0),0);
  const pct = total>0?Math.round((done/total)*100):0;
  const color = type==="payment"?"#10b981":"#6366f1";
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>{title}</div>
        <div style={{fontSize:12,color,fontWeight:700}}>{pct}%</div>
      </div>
      <div style={{background:"#f1f5f9",borderRadius:8,height:10,marginBottom:8,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,background:color,height:"100%",borderRadius:8,transition:"width 0.5s"}} />
      </div>
      <div style={{display:"flex",gap:2,alignItems:"flex-end",height:36}}>
        {schedules.map((s,i)=>{
          const sPct=total>0?(parseFloat(s.amount||0)/total)*100:0;
          const isDone=type==="payment"?parseFloat(s.received||0)>=parseFloat(s.amount||0):!!s.work_completed;
          return <div key={i} title={s.label} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <div style={{width:"100%",background:isDone?color:"#e2e8f0",borderRadius:"3px 3px 0 0",height:`${Math.max(sPct*0.3+4,5)}px`}} />
            <div style={{width:5,height:5,borderRadius:"50%",background:isDone?color:"#cbd5e1"}} />
          </div>;
        })}
      </div>
    </div>
  );
}

const Field = ({label,children,span}) => <div style={{gridColumn:span?`span ${span}`:"span 1"}}><div style={{fontSize:12,color:"#64748b",marginBottom:4,fontWeight:500}}>{label}</div>{children}</div>;

export default function Projects() {
  const { isAdmin: realIsAdmin, canEdit, setShowLogin, confirmAction, logActivity } = useAdmin();
  const isAdmin = canEdit("projects");
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [newP, setNewP] = useState({name:"",customer:"",location:"",sqm:"",amount:"",status:"Active"});
  const [editP, setEditP] = useState({});
  const [showAddSched, setShowAddSched] = useState(false);
  const [newSched, setNewSched] = useState({label:"",amount:"",sort_order:""});
  const [editProject, setEditProject] = useState(null);
  const [editProjForm, setEditProjForm] = useState({});
  const [showSchedForm, setShowSchedForm] = useState(false);

  useEffect(()=>{ loadProjects(); },[]);

  const loadProjects = async () => {
    setLoading(true);
    const {data:projs} = await supabase.from("projects").select("*").is("deleted_at",null).order("created_at");
    const full = await Promise.all((projs||[]).map(async p=>{
      const {data:scheds} = await supabase.from("schedules").select("*").eq("project_id",p.id).is("deleted_at",null).order("sort_order");
      return {...p, schedules:scheds||[]};
    }));
    setProjects(full); setLoading(false);
  };

  const selProj = projects.find(p=>p.id===selected?.id);

  const addProject = async () => {
    if(!isAdmin){setShowLogin(true);return;}
    if(!newP.name||!newP.customer) return;
    setSaving(true);
    await supabase.from("projects").insert({name:newP.name,customer:newP.customer,location:newP.location,sqm:parseFloat(newP.sqm)||0,amount:parseFloat(newP.amount)||0,status:newP.status});
    logActivity("Added project", `${newP.name} — ${newP.customer}`, "Projects");
    await loadProjects(); setNewP({name:"",customer:"",location:"",sqm:"",amount:"",status:"Active"}); setShowForm(false); setSaving(false);
  };

  const saveEditProject = async () => {
    if(!isAdmin){setShowLogin(true);return;}
    confirmAction("Save changes to this project?", async()=>{
      await supabase.from("projects").update({name:editP.name,customer:editP.customer,location:editP.location,sqm:parseFloat(editP.sqm)||0,amount:parseFloat(editP.amount)||0,status:editP.status}).eq("id",selProj.id);
      logActivity("Edited project", `${editP.name} — ${editP.customer}`, "Projects");
      await loadProjects(); setShowEditProject(false);
    });
  };

  const deleteProject = async (id) => {
    if(!isAdmin){setShowLogin(true);return;}
    confirmAction("Move this project (and its payment schedules) to Trash? You can restore it later from the Trash page.", async()=>{
      const now = new Date().toISOString();
      await supabase.from("schedules").update({deleted_at:now}).eq("project_id",id);
      await supabase.from("projects").update({deleted_at:now}).eq("id",id);
      logActivity("Moved project to Trash", projects.find(p=>p.id===id)?.name||"", "Projects");
      setSelected(null); await loadProjects();
    });
  };

  const addSchedule = async () => {
    if(!isAdmin){setShowLogin(true);return;}
    if(!newSched.label||!newSched.amount) return;
    setSaving(true);
    const maxOrder = (selProj?.schedules||[]).reduce((m,s)=>Math.max(m,s.sort_order||0),0);
    await supabase.from("schedules").insert({project_id:selProj.id,label:newSched.label,amount:parseFloat(newSched.amount)||0,received:0,sort_order:maxOrder+1});
    logActivity("Added payment schedule", `${selProj?.name} — ${newSched.label} — OMR ${parseFloat(newSched.amount||0).toFixed(3)}`, "Projects");
    await loadProjects(); setNewSched({label:"",amount:"",sort_order:""}); setShowAddSched(false); setSaving(false);
  };

  const deleteSchedule = (id) => {
    if(!isAdmin){setShowLogin(true);return;}
    confirmAction("Move this payment schedule to Trash?", async()=>{
      const label = selProj?.schedules?.find(s=>s.id===id)?.label || "";
      await supabase.from("schedules").update({deleted_at:new Date().toISOString()}).eq("id",id);
      logActivity("Moved payment schedule to Trash", `${selProj?.name} — ${label}`, "Projects");
      await loadProjects();
    });
  };

  const updateWorkCompleted = async (schedId, val) => {
    if(!isAdmin){setShowLogin(true);return;}
    const label = selProj?.schedules?.find(s=>s.id===schedId)?.label || "";
    await supabase.from("schedules").update({work_completed:val}).eq("id",schedId);
    logActivity(val ? "Marked work complete" : "Marked work pending", `${selProj?.name} — ${label}`, "Projects");
    await loadProjects();
  };

  const updateProjectStatus = async (id, status) => {
    if(!isAdmin){setShowLogin(true);return;}
    const name = projects.find(p=>p.id===id)?.name || "";
    await supabase.from("projects").update({status}).eq("id",id);
    logActivity("Changed project status", `${name} → ${status}`, "Projects");
    await loadProjects();
  };

  const filtered = projects.filter(p=>(filter==="All"||p.status===filter)&&(p.name.toLowerCase().includes(search.toLowerCase())||p.customer.toLowerCase().includes(search.toLowerCase())));

  const pendingPayments = projects.flatMap(p=>(p.schedules||[]).filter(s=>s.work_completed&&parseFloat(s.received||0)<parseFloat(s.amount||0)).map(s=>({...s,projectName:p.name})));

  const inp = {width:"100%",border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 12px",fontSize:13,boxSizing:"border-box",outline:"none"};

  return (
    <div style={{padding:24}}>
      {pendingPayments.length>0&&(
        <div style={{background:"#fffbeb",border:"1px solid #f59e0b",borderRadius:12,padding:"12px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:20}}>⚠️</span>
          <div>
            <div style={{fontWeight:700,color:"#92400e",fontSize:13}}>Work completed but payment pending — {pendingPayments.length} milestone{pendingPayments.length>1?"s":""}</div>
            <div style={{fontSize:12,color:"#b45309"}}>{pendingPayments.slice(0,3).map(s=>`${s.projectName} — ${s.label}`).join(" · ")}{pendingPayments.length>3?` +${pendingPayments.length-3} more`:""}</div>
          </div>
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:4}}>🏗 Works & Projects</div>
          <div style={{fontSize:13,color:"#64748b"}}>{projects.length} projects · Payment schedules & work completion tracker</div>
        </div>
        {isAdmin
          ?<button onClick={()=>setShowForm(true)} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}}>+ Add Project</button>
          :<button onClick={()=>setShowLogin(true)} style={{background:"#f1f5f9",color:"#64748b",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:600,cursor:"pointer"}}>🔑 Login to Add</button>
        }
      </div>

      <div style={{background:"#fff",borderRadius:10,padding:"12px 16px",marginBottom:14,border:"1px solid #e2e8f0",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search project or customer..."
          style={{flex:1,minWidth:200,border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:13,outline:"none"}} />
        {["All","Planning","Active","Delayed","Completed"].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} style={{padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:filter===f?"#6366f1":"#f1f5f9",color:filter===f?"#fff":"#64748b"}}>{f}</button>
        ))}
      </div>

      {showForm&&isAdmin&&(
        <div style={{background:"#fff",borderRadius:12,padding:20,marginBottom:14,border:"2px solid #6366f1"}}>
          <div style={{fontWeight:700,fontSize:15,color:"#0f172a",marginBottom:14}}>New Project</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Project Name" span={2}><input value={newP.name} onChange={e=>setNewP({...newP,name:e.target.value})} style={inp} /></Field>
            <Field label="Customer Name"><input value={newP.customer} onChange={e=>setNewP({...newP,customer:e.target.value})} style={inp} /></Field>
            <Field label="Location"><input value={newP.location} onChange={e=>setNewP({...newP,location:e.target.value})} style={inp} /></Field>
            <Field label="Area (Sq.m)"><input type="number" value={newP.sqm} onChange={e=>setNewP({...newP,sqm:e.target.value})} style={inp} /></Field>
            <Field label="Contract Amount (OMR)"><input type="number" value={newP.amount} onChange={e=>setNewP({...newP,amount:e.target.value})} style={inp} /></Field>
            <Field label="Status"><select value={newP.status} onChange={e=>setNewP({...newP,status:e.target.value})} style={inp}><option>Active</option><option>Planning</option><option>Delayed</option><option>Completed</option></select></Field>
          </div>
          <div style={{display:"flex",gap:10,marginTop:14}}>
            <button onClick={addProject} disabled={saving} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"9px 20px",cursor:"pointer",fontSize:13,fontWeight:600}}>{saving?"Saving...":"💾 Save Project"}</button>
            <button onClick={()=>setShowForm(false)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontSize:13}}>Cancel</button>
          </div>
        </div>
      )}

      {loading?<div style={{textAlign:"center",padding:60,color:"#94a3b8"}}>⏳ Loading...</div>:
      <div style={{display:"grid",gridTemplateColumns:selProj?"1fr 1.8fr":"repeat(auto-fill,minmax(300px,1fr))",gap:16}}>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {filtered.map(p=>{
            const rec=p.schedules.reduce((s,x)=>s+parseFloat(x.received||0),0);
            const pct=p.amount>0?Math.round((rec/p.amount)*100):0;
            const workDone=p.schedules.filter(s=>s.work_completed).length;
            const hasPending=p.schedules.some(s=>s.work_completed&&parseFloat(s.received||0)<parseFloat(s.amount||0));
            return (
              <div key={p.id} onClick={()=>setSelected(p)} style={{background:"#fff",borderRadius:12,padding:16,cursor:"pointer",border:selected?.id===p.id?"2px solid #6366f1":"1px solid #e2e8f0",position:"relative"}}>
                {hasPending&&<div style={{position:"absolute",top:10,right:10,width:10,height:10,background:"#f59e0b",borderRadius:"50%"}} />}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <div style={{fontWeight:700,color:"#1e293b",fontSize:13,flex:1,paddingRight:16}}>{p.name}</div>
                  <span style={{background:statusBg[p.status],color:statusColors[p.status],borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:600,flexShrink:0}}>{p.status}</span>
                </div>
                <div style={{color:"#64748b",fontSize:12,marginBottom:8}}>{p.customer} · {p.location}</div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:6}}>
                  <span style={{color:"#10b981",fontWeight:600}}>OMR {rec.toFixed(3)}</span>
                  <span style={{color:"#64748b"}}>{workDone}/{p.schedules.length} work done</span>
                </div>
                <div style={{background:"#f1f5f9",borderRadius:4,height:5}}>
                  <div style={{width:`${Math.min(pct,100)}%`,background:pct>=100?"#10b981":"#6366f1",borderRadius:4,height:5}} />
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:10,color:"#94a3b8"}}>
                  <span>OMR {parseFloat(p.amount).toFixed(3)}</span><span>{pct}%</span>
                </div>
              </div>
            );
          })}
          {filtered.length===0&&<div style={{background:"#fff",borderRadius:12,padding:60,textAlign:"center",border:"1px solid #e2e8f0",color:"#94a3b8"}}>No projects found.</div>}
        </div>

        {selProj&&(
          <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
            {/* Edit Project Modal */}
            {showEditProject&&isAdmin&&(
              <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div style={{background:"#fff",borderRadius:16,padding:28,width:560,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
                  <div style={{fontSize:18,fontWeight:800,color:"#0f172a",marginBottom:20}}>Edit Project</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <Field label="Project Name" span={2}><input value={editP.name||""} onChange={e=>setEditP({...editP,name:e.target.value})} style={inp} /></Field>
                    <Field label="Customer"><input value={editP.customer||""} onChange={e=>setEditP({...editP,customer:e.target.value})} style={inp} /></Field>
                    <Field label="Location"><input value={editP.location||""} onChange={e=>setEditP({...editP,location:e.target.value})} style={inp} /></Field>
                    <Field label="Area (Sq.m)"><input type="number" value={editP.sqm||""} onChange={e=>setEditP({...editP,sqm:e.target.value})} style={inp} /></Field>
                    <Field label="Contract Amount (OMR)"><input type="number" value={editP.amount||""} onChange={e=>setEditP({...editP,amount:e.target.value})} style={inp} /></Field>
                    <Field label="Status" span={2}><select value={editP.status||"Active"} onChange={e=>setEditP({...editP,status:e.target.value})} style={inp}><option>Active</option><option>Planning</option><option>Delayed</option><option>Completed</option></select></Field>
                  </div>
                  <div style={{display:"flex",gap:10,marginTop:20}}>
                    <button onClick={saveEditProject} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"10px 22px",cursor:"pointer",fontSize:13,fontWeight:700}}>💾 Save Changes</button>
                    <button onClick={()=>setShowEditProject(false)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"10px 18px",cursor:"pointer",fontSize:13}}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Project Header */}
            <div style={{padding:"14px 18px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                <div>
                  <div style={{fontWeight:800,color:"#1e293b",fontSize:15}}>{selProj.name}</div>
                  <div style={{color:"#64748b",fontSize:12}}>{selProj.customer} · {selProj.sqm} m² · OMR {parseFloat(selProj.amount).toFixed(3)}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {isAdmin&&<select value={selProj.status} onChange={e=>updateProjectStatus(selProj.id,e.target.value)}
                    style={{background:statusBg[selProj.status],color:statusColors[selProj.status],border:`1px solid ${statusColors[selProj.status]}`,borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    <option>Active</option><option>Planning</option><option>Delayed</option><option>Completed</option>
                  </select>}
                  {isAdmin&&<button onClick={()=>{setEditP({...selProj});setShowEditProject(true);}} style={{background:"#eef2ff",color:"#6366f1",border:"none",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>✏ Edit</button>}
                  {isAdmin&&<button onClick={()=>deleteProject(selProj.id)} style={{background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:11}}>🗑</button>}
                  <button onClick={()=>setSelected(null)} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",color:"#64748b"}}>✕</button>
                </div>
              </div>
              {selProj.schedules.length>0&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div style={{background:"#fff",borderRadius:10,padding:12,border:"1px solid #e2e8f0"}}><MilestoneGraph schedules={selProj.schedules} type="payment" title="💰 Payment Progress" /></div>
                  <div style={{background:"#fff",borderRadius:10,padding:12,border:"1px solid #e2e8f0"}}><MilestoneGraph schedules={selProj.schedules} type="work" title="🏗 Work Progress" /></div>
                </div>
              )}
            </div>

            {!isAdmin&&<div style={{padding:"8px 18px",background:"#fffbeb",fontSize:12,color:"#92400e"}}>👁 View only</div>}

            <div style={{padding:"8px 18px",background:"#eef2ff",fontSize:12,color:"#4338ca"}}>💵 To record a payment for any milestone, use the <strong>Record Payment</strong> page (sidebar).</div>

            {/* Add Schedule */}
            {isAdmin&&(
              <div style={{padding:"10px 18px",borderBottom:"1px solid #f1f5f9",background:"#f8fafc"}}>
                {!showAddSched
                  ?<button onClick={()=>setShowAddSched(true)} style={{background:"#eef2ff",color:"#6366f1",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>+ Add Payment Schedule</button>
                  :<div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
                    <div style={{flex:2,minWidth:200}}>
                      <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Milestone Label</div>
                      <input value={newSched.label} onChange={e=>setNewSched({...newSched,label:e.target.value})} placeholder="e.g. After Foundation" style={{...inp,padding:"7px 10px"}} />
                    </div>
                    <div style={{flex:1,minWidth:100}}>
                      <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Amount (OMR)</div>
                      <input type="number" value={newSched.amount} onChange={e=>setNewSched({...newSched,amount:e.target.value})} step="0.001" style={{...inp,padding:"7px 10px"}} />
                    </div>
                    <button onClick={addSchedule} disabled={saving} style={{background:"#6366f1",color:"#fff",border:"none",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:12,fontWeight:600}}>{saving?"...":"💾 Add"}</button>
                    <button onClick={()=>setShowAddSched(false)} style={{background:"#f1f5f9",color:"#64748b",border:"none",borderRadius:8,padding:"8px 12px",cursor:"pointer",fontSize:12}}>✕</button>
                  </div>
                }
              </div>
            )}

            {/* Schedule Table */}
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:"#f8fafc"}}>
                  {["Milestone","Amount","Work Done","Received","Last Payment Date","Balance","Actions"].map(h=>(
                    <th key={h} style={{padding:"9px 12px",textAlign:"left",color:"#64748b",fontWeight:600,fontSize:10,whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {selProj.schedules.map((s,i)=>{
                    const received=parseFloat(s.received||0);
                    const amount=parseFloat(s.amount||0);
                    const balance=amount-received;
                    return (
                      <tr key={s.id||i} style={{borderTop:"1px solid #f1f5f9",background:s.work_completed&&balance>0?"#fffbeb":s.work_completed&&balance<=0?"#f0fdf4":"#fff"}}>
                        <td style={{padding:"10px 12px",color:"#1e293b",fontWeight:500,maxWidth:180}}>{s.label}</td>
                        <td style={{padding:"10px 12px",color:"#475569"}}>{amount.toFixed(3)}</td>
                        <td style={{padding:"10px 12px"}}>
                          {isAdmin
                            ?<label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer"}}>
                                <input type="checkbox" checked={!!s.work_completed} onChange={e=>updateWorkCompleted(s.id,e.target.checked)} style={{width:15,height:15,accentColor:"#6366f1"}} />
                                <span style={{fontSize:11,color:s.work_completed?"#10b981":"#94a3b8",fontWeight:600}}>{s.work_completed?"✓ Done":"Pending"}</span>
                              </label>
                            :<span style={{color:s.work_completed?"#10b981":"#94a3b8",fontWeight:600,fontSize:11}}>{s.work_completed?"✓ Done":"Pending"}</span>
                          }
                        </td>
                        <td style={{padding:"10px 12px",color:"#10b981",fontWeight:700}}>{received.toFixed(3)}</td>
                        <td style={{padding:"10px 12px",color:"#94a3b8",fontSize:11}}>{s.payment_date||"—"}</td>
                        <td style={{padding:"10px 12px",color:balance>0?"#f59e0b":"#10b981",fontWeight:700}}>{balance.toFixed(3)}</td>
                        <td style={{padding:"10px 12px"}}>
                          {isAdmin&&(
                            <button onClick={()=>deleteSchedule(s.id)} style={{background:"#fef2f2",color:"#ef4444",border:"none",borderRadius:6,padding:"4px 7px",cursor:"pointer",fontSize:11}}>🗑</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {selProj.schedules.length===0&&<tr><td colSpan={7} style={{padding:30,textAlign:"center",color:"#94a3b8"}}>No schedules. {isAdmin?"Click \"+ Add Payment Schedule\".":""}</td></tr>}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:"2px solid #e2e8f0",background:"#f8fafc"}}>
                    <td style={{padding:"10px 12px",fontWeight:700,color:"#0f172a"}}>TOTAL</td>
                    <td style={{padding:"10px 12px",fontWeight:700,color:"#6366f1"}}>{parseFloat(selProj.amount).toFixed(3)}</td>
                    <td style={{padding:"10px 12px",fontSize:11,color:"#6366f1",fontWeight:600}}>{selProj.schedules.filter(s=>s.work_completed).length}/{selProj.schedules.length}</td>
                    <td style={{padding:"10px 12px",fontWeight:700,color:"#10b981"}}>{selProj.schedules.reduce((t,s)=>t+parseFloat(s.received||0),0).toFixed(3)}</td>
                    <td></td>
                    <td style={{padding:"10px 12px",fontWeight:700,color:"#f59e0b"}}>{selProj.schedules.reduce((t,s)=>t+(parseFloat(s.amount||0)-parseFloat(s.received||0)),0).toFixed(3)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}
