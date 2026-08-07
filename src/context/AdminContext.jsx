import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import bcrypt from "bcryptjs";

// Compare a typed password against a stored value.
// If the stored value is a bcrypt hash ($2...), use bcrypt; otherwise fall back
// to a plaintext compare so existing (un-migrated) passwords still work. This
// lets passwords migrate to hashed form gradually with zero lock-out risk.
function passwordMatches(typed, stored) {
  if (!stored) return false;
  if (typeof stored === "string" && stored.startsWith("$2")) {
    try { return bcrypt.compareSync(typed, stored); } catch { return false; }
  }
  return stored === typed;
}

const ALL_PAGES = [
  { id:"dashboard", label:"Dashboard" },
  { id:"invoices", label:"Invoices & Quotations" },
  { id:"projects", label:"Works & Projects" },
  { id:"payroll", label:"Payroll & Attendance" },
  { id:"payments", label:"Record Payment" },
  { id:"ledger", label:"Cashbook Ledger" },
  { id:"banking", label:"Banking" },
  { id:"subcontractors", label:"Subcontractors" },
  { id:"creditpurchases", label:"Bills & Payables" },
  { id:"commissions", label:"Commission Ledger" },
  { id:"reports", label:"Reports & Audits" },
  { id:"inventory", label:"Inventory" },
  { id:"material_requests", label:"Material Requests" },
  { id:"equipment", label:"Equipment" },
  { id:"settings", label:"Settings & Backups" },
  { id:"trash", label:"Trash" },
];

const FULL_PERMS = {};
ALL_PAGES.forEach(p => { FULL_PERMS[p.id] = { view:true, edit:true }; });

const ROLE_PRESETS = {
  "Admin": FULL_PERMS,
  "Manager": (()=>{ const p={...FULL_PERMS}; p.settings={view:true,edit:false}; return p; })(),
  "Accountant": (()=>{ const p={}; ALL_PAGES.forEach(pg=>{ p[pg.id]={view:true,edit:["ledger","banking","creditpurchases","invoices","commissions","reports","payments"].includes(pg.id)}; }); p.settings={view:false,edit:false}; return p; })(),
  "Viewer": (()=>{ const p={}; ALL_PAGES.forEach(pg=>{ p[pg.id]={view:true,edit:false}; }); p.settings={view:false,edit:false}; return p; })(),
  "Custom": {},
};

const AdminContext = createContext(null);

export { ALL_PAGES, FULL_PERMS, ROLE_PRESETS };

export function AdminProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null); // { id, username, display_name, role, permissions }
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Check session on load
  useEffect(() => {
    const saved = sessionStorage.getItem("minarva_user");
    if (saved) {
      try {
        const user = JSON.parse(saved);
        setCurrentUser(user);
        setIsAdmin(user.role === "Admin");
        setLoggedIn(true);
      } catch {}
    }
    setInitialLoading(false);
  }, []);

  const login = async (username, password) => {
    setError("");
    // Try app_users table first
    try {
      const { data, error: dbErr } = await supabase
        .from("app_users")
        .select("*")
        .eq("username", username.trim().toLowerCase())
        .eq("is_active", true)
        .single();

      if (data && passwordMatches(password, data.password)) {
        const user = {
          id: data.id,
          username: data.username,
          display_name: data.display_name,
          role: data.role,
          permissions: data.permissions || FULL_PERMS,
        };
        setCurrentUser(user);
        setIsAdmin(data.role === "Admin");
        setLoggedIn(true);
        setShowLogin(false);
        sessionStorage.setItem("minarva_user", JSON.stringify(user));
        // Update last_login
        supabase.from("app_users").update({ last_login: new Date().toISOString() }).eq("id", data.id).then(()=>{});
        return true;
      }
    } catch {}

    setError("Incorrect username or password");
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    setIsAdmin(false);
    setLoggedIn(false);
    sessionStorage.removeItem("minarva_user");
  };

  const canView = (pageId) => {
    if (!currentUser) return false;
    if (currentUser.role === "Admin") return true;
    return currentUser.permissions?.[pageId]?.view === true;
  };

  const canEdit = (pageId) => {
    if (!currentUser) return false;
    if (currentUser.role === "Admin") return true;
    return currentUser.permissions?.[pageId]?.edit === true;
  };

  const confirmAction = (message, onConfirm) => {
    setConfirmDialog({ message, onConfirm });
  };
  const logActivity = async (action, detail, page) => {
    try { await supabase.from("activity_log").insert({ username: currentUser?.username || "unknown", display_name: currentUser?.display_name || currentUser?.role || "Unknown", action, detail, page }); } catch {}
  };

  return (
    <AdminContext.Provider value={{
      currentUser, isAdmin, loggedIn, showLogin, setShowLogin,
      login, logout, canView, canEdit, error, setError,
      confirmAction, logActivity, initialLoading, ALL_PAGES, ROLE_PRESETS, FULL_PERMS,
    }}>
      {children}
      {showLogin && <LoginModal />}
      {confirmDialog && <ConfirmModal dialog={confirmDialog} setDialog={setConfirmDialog} currentUser={currentUser} />}
    </AdminContext.Provider>
  );
}

function LoginModal() {
  const { login, error, setError, setShowLogin, loggedIn } = useContext(AdminContext);
  const [username, setUsername] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !pwd) { setError("Enter username and password"); return; }
    setLoading(true);
    await login(username, pwd);
    setLoading(false);
  };

  // Full screen login if not logged in, modal if already logged in
  const isFullScreen = !loggedIn;

  const form = (
    <div style={{ background:"#fff", borderRadius:16, padding:36, width:400, maxWidth:"90vw", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
      <div style={{ textAlign:"center", marginBottom:24 }}>
        <div style={{ fontSize:28, fontWeight:900, color:"#0f172a", marginBottom:4 }}>Minarva Biz</div>
        <div style={{ fontSize:12, color:"#64748b" }}>SEVENSEAS Modern Enterprises — ERP Login</div>
      </div>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:12, color:"#64748b", marginBottom:6, fontWeight:500 }}>Username</div>
        <input value={username} onChange={e=>setUsername(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&handleLogin()}
          placeholder="admin" autoFocus
          style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:8, padding:"11px 14px", fontSize:14, boxSizing:"border-box", outline:"none" }} />
      </div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:12, color:"#64748b", marginBottom:6, fontWeight:500 }}>Password</div>
        <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&handleLogin()}
          placeholder="Enter password"
          style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:8, padding:"11px 14px", fontSize:14, boxSizing:"border-box", outline:"none" }} />
      </div>
      <button onClick={handleLogin} disabled={loading}
        style={{ width:"100%", background:"#6366f1", color:"#fff", border:"none", borderRadius:10, padding:"12px", fontSize:14, fontWeight:700, cursor:"pointer" }}>
        {loading ? "Signing in..." : "🔑 Sign In"}
      </button>
      {error && <div style={{ marginTop:12, padding:"10px 14px", background:"#fef2f2", borderRadius:8, color:"#dc2626", fontSize:13 }}>⚠ {error}</div>}
      {loggedIn && <button onClick={()=>setShowLogin(false)} style={{ width:"100%", marginTop:12, background:"transparent", color:"#94a3b8", border:"none", cursor:"pointer", fontSize:13, padding:"8px" }}>Cancel</button>}
    </div>
  );

  if (isFullScreen) {
    return (
      <div style={{ position:"fixed", inset:0, background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column" }}>
        {form}
      </div>
    );
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
      {form}
    </div>
  );
}

function ConfirmModal({ dialog, setDialog, currentUser }) {
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState("");

  const confirm = async () => {
    // Verify the password against the logged-in user's stored (hashed) password
    try {
      if (currentUser?.id) {
        const { data } = await supabase.from("app_users").select("password").eq("id", currentUser.id).single();
        if (data && passwordMatches(pwd, data.password)) { dialog.onConfirm(); setDialog(null); return; }
      }
    } catch {}
    setError("Incorrect password");
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:1001, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:16, padding:32, width:380, boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize:18, fontWeight:800, color:"#0f172a", marginBottom:8 }}>⚠ Confirm Action</div>
        <div style={{ fontSize:13, color:"#64748b", marginBottom:20 }}>{dialog.message}</div>
        <div style={{ fontSize:12, color:"#64748b", marginBottom:6, fontWeight:500 }}>Enter your password to confirm</div>
        <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&confirm()} autoFocus
          style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:8, padding:"10px 14px", fontSize:14, boxSizing:"border-box", outline:"none", marginBottom:16 }} />
        {error && <div style={{ marginBottom:12, color:"#dc2626", fontSize:13 }}>⚠ {error}</div>}
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={confirm} style={{ flex:1, background:"#ef4444", color:"#fff", border:"none", borderRadius:8, padding:"11px", fontSize:14, fontWeight:700, cursor:"pointer" }}>Confirm</button>
          <button onClick={()=>setDialog(null)} style={{ flex:1, background:"#f1f5f9", color:"#475569", border:"none", borderRadius:8, padding:"11px", fontSize:14, cursor:"pointer" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export const useAdmin = () => useContext(AdminContext);
