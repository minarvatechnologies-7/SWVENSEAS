import ErrorBoundary from "./ErrorBoundary";
import { useState, useEffect, lazy, Suspense } from "react";
import "./index.css";
import { AdminProvider, useAdmin } from "./context/AdminContext";
import Dashboard from "./pages/Dashboard";
const Projects = lazy(() => import("./pages/Projects"));
const Payroll = lazy(() => import("./pages/Payroll"));
const Payments = lazy(() => import("./pages/Payments"));
const Ledger = lazy(() => import("./pages/Ledger"));
const Subcontractors = lazy(() => import("./pages/Subcontractors"));
const Commissions = lazy(() => import("./pages/Commissions"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Trash = lazy(() => import("./pages/Trash"));
const BillsPayables = lazy(() => import("./pages/BillsPayables"));
const Banking = lazy(() => import("./pages/Banking"));
const Inventory = lazy(() => import("./pages/Inventory"));
const MaterialRequests = lazy(() => import("./pages/MaterialRequests"));
const Equipment = lazy(() => import("./pages/Equipment"));
import EmployeeApp from "./pages/Attendance";
import HelpBot from "./components/HelpBot";
import GlobalSearch from "./components/GlobalSearch";

const nav = [
  { section: "MAIN OPERATIONS" },
  { id: "dashboard", label: "Dashboard Board", icon: "⊞" },
  { id: "invoices", label: "Invoices & Quotations", icon: "🗒" },
  { id: "projects", label: "Works & Projects", icon: "🏗" },
  { id: "payroll", label: "Payroll & Attendance", icon: "👤" },
  { id: "payments", label: "Record Payment", icon: "💵" },
  { id: "ledger", label: "Cashbook Ledger", icon: "📒" },
  { id: "banking", label: "Banking", icon: "🏦" },
  { section: "PARTNERS" },
  { id: "subcontractors", label: "Subcontractors", icon: "🔧" },
  { id: "creditpurchases", label: "Bills & Payables", icon: "💳" },
  { id: "commissions", label: "Commission Ledger", icon: "💼" },
  { section: "OPERATIONS" },
  { id: "inventory", label: "Inventory", icon: "📦" },
  { id: "material_requests", label: "Material Requests", icon: "📋" },
  { id: "equipment", label: "Equipment", icon: "🚜" },
  { section: "ANALYTICS" },
  { id: "reports", label: "Reports & Audits", icon: "📊" },
  { section: "SYSTEM SETTING" },
  { id: "settings", label: "Settings & Backups", icon: "⚙" },
  { id: "trash", label: "Trash", icon: "🗑" },
];

function AppContent() {
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAdmin, currentUser, loggedIn, initialLoading, setShowLogin, logout, canView } = useAdmin();

  // Check if this is the employee field app
  const [isFieldApp, setIsFieldApp] = useState(() => {
    const hash = window.location.hash;
    const empPhone = localStorage.getItem("emp_phone");
    return hash.includes("field") || !!empPhone;
  });

  useEffect(() => {
    const checkField = () => {
      const hash = window.location.hash;
      const empPhone = localStorage.getItem("emp_phone");
      if (hash.includes("field") || empPhone) setIsFieldApp(true);
    };
    window.addEventListener("hashchange", checkField);
    return () => window.removeEventListener("hashchange", checkField);
  }, []);

  // Silent automatic daily backup — runs once per day, the first time an
  // admin opens the app. No UI, no blocking, never throws. See lib/backup.js.
  useEffect(() => {
    if (!loggedIn || isAdmin !== true) return;
    import("./lib/backup").then(({ runAutoBackupIfNeeded }) => {
      runAutoBackupIfNeeded().catch(() => {});
    });
  }, [loggedIn, isAdmin]);

  // If employee field app mode → show employee app directly (no login needed)
  if (isFieldApp) {
    return <EmployeeApp onExitFieldMode={() => { setIsFieldApp(false); window.location.hash = ""; }} />;
  }

  // Loading
  if (initialLoading) {
    return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0f172a", color:"#60a5fa", fontSize:18, fontWeight:700 }}>Loading Minarva Biz...</div>;
  }

  // Login screen — show if not logged in
  if (!loggedIn) {
    return <LoginScreen />;
  }

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard setPage={setPage} />;
      case "projects": return <Projects />;
      case "invoices": return <Invoices />;
      case "payroll": return <Payroll />;
      case "payments": return <Payments />;
      case "ledger": return <Ledger />;
      case "banking": return <Banking />;
      case "subcontractors": return <Subcontractors />;
      case "creditpurchases": return <BillsPayables />;
      case "commissions": return <Commissions />;
      case "reports": return <Reports />;
      case "inventory": return <Inventory />;
      case "material_requests": return <MaterialRequests />;
      case "equipment": return <Equipment />;
      case "settings": return <Settings />;
      case "trash": return <Trash />;
      default: return <Dashboard setPage={setPage} />;
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Segoe UI', -apple-system, sans-serif", background: "#f1f5f9", position: "relative" }}>
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="mobile-overlay" />}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, background: "#3b82f6", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "#fff" }}>S</div>
            <div>
              <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: 14 }}>SEVENSEAS</div>
              <div style={{ fontSize: 10, color: "#06b6d4", fontWeight: 600, letterSpacing: 1 }}>MODERN ENTERPRISES</div>
            </div>
          </div>
          {/* Current user info */}
          <div style={{ background: "#1e293b", borderRadius: 8, padding: "8px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 12, color: "#f1f5f9", fontWeight: 600 }}>👤 {currentUser?.display_name || "User"}</div>
                <div style={{ fontSize: 10, color: "#94a3b8" }}>{currentUser?.role || "Viewer"}</div>
              </div>
              <span style={{ background: isAdmin ? "#064e3b" : "#1e3a5f", color: isAdmin ? "#34d399" : "#60a5fa", fontSize: 9, padding: "2px 8px", borderRadius: 4, border: `1px solid ${isAdmin ? "#34d399" : "#3b82f6"}`, fontWeight: 700 }}>{currentUser?.role === "Admin" ? "ADMIN" : currentUser?.role?.toUpperCase() || "USER"}</span>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "10px 10px", overflowY: "auto" }}>
          {nav.map((item, i) => {
            if (item.section) {
              // Check if any page in this section is visible
              const sectionPages = [];
              for (let j = i+1; j < nav.length && !nav[j].section; j++) sectionPages.push(nav[j]);
              const hasVisible = sectionPages.some(p => canView(p.id));
              if (!hasVisible) return null;
              return <div key={i} style={{ fontSize: 10, color: "#475569", fontWeight: 600, letterSpacing: 1.2, padding: "14px 8px 6px" }}>{item.section}</div>;
            }
            if (!canView(item.id)) return null;
            return (
              <button key={item.id} onClick={() => { setPage(item.id); setSidebarOpen(false); }} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
                  borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, textAlign: "left",
                  background: page === item.id ? "#1e3a5f" : "transparent",
                  color: page === item.id ? "#60a5fa" : "#94a3b8",
                  fontWeight: page === item.id ? 600 : 400, marginBottom: 1,
                  borderLeft: page === item.id ? "3px solid #3b82f6" : "3px solid transparent",
                }}>
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ padding: "10px 18px 14px", borderTop: "1px solid #1e293b" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: "#475569" }}>ENGINE PROVIDER</div>
            <div style={{ background: "#10b981", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4 }}>SYSTEM V1.2</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <div style={{ width: 18, height: 18, background: "#1e293b", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#60a5fa", fontWeight: 700 }}>M</div>
            <span style={{ fontSize: 11, color: "#64748b" }}>Powered by <span style={{ color: "#94a3b8", fontWeight: 600 }}>Minarva Biz</span></span>
          </div>
          <button onClick={logout} style={{ width: "100%", background: "#1e293b", color: "#f87171", border: "1px solid #f87171", borderRadius: 8, padding: "7px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>🔓 Logout</button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <div className="top-header" style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 24px", height: 48, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="hamburger"
              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6, color: "#64748b", fontSize: 20 }}>
              ☰
            </button>
            <div className="header-company" style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", letterSpacing: 0.5 }}>SEVENSEAS MODERN ENTERPRISES</div>
            <div className="header-search">
              <GlobalSearch setPage={setPage} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div className="header-meta" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}>
              <span style={{ fontSize: 13 }}>🌐</span> Sultanate of Oman Portal
            </div>
            <div className="header-meta" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#10b981" }}>
              <div style={{ width: 7, height: 7, background: "#10b981", borderRadius: "50%" }} /> Supabase Cloud (Live)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: isAdmin?"#10b981":"#6366f1", background: isAdmin?"#ecfdf5":"#eef2ff", borderRadius: 6, padding: "4px 10px", border: `1px solid ${isAdmin?"#86efac":"#c7d2fe"}`, whiteSpace: "nowrap" }}>
              👤 {currentUser?.display_name || "User"} · {currentUser?.role || ""}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <ErrorBoundary key={page}>
            <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>Loading...</div>}>
              {renderPage()}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
      <HelpBot />
    </div>
  );
}

// Login screen shown when not logged in
function LoginScreen() {
  const { login, error, setError } = useAdmin();
  const [username, setUsername] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !pwd) { setError("Enter username and password"); return; }
    setLoading(true);
    await login(username, pwd);
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#0f172a 100%)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:20, padding:40, width:420, maxWidth:"90vw", boxShadow:"0 30px 80px rgba(0,0,0,0.4)" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:56, height:56, background:"#3b82f6", borderRadius:14, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:28, fontWeight:900, color:"#fff", marginBottom:12 }}>S</div>
          <div style={{ fontSize:26, fontWeight:900, color:"#0f172a" }}>Minarva Biz</div>
          <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>SEVENSEAS Modern Enterprises — ERP</div>
        </div>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:6, fontWeight:500 }}>Username</div>
          <input value={username} onChange={e=>setUsername(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&document.getElementById("loginPwd")?.focus()}
            placeholder="admin" autoFocus
            style={{ width:"100%", border:"2px solid #e2e8f0", borderRadius:10, padding:"12px 16px", fontSize:15, boxSizing:"border-box", outline:"none" }} />
        </div>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:6, fontWeight:500 }}>Password</div>
          <input id="loginPwd" type="password" value={pwd} onChange={e=>setPwd(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()}
            placeholder="Enter password"
            style={{ width:"100%", border:"2px solid #e2e8f0", borderRadius:10, padding:"12px 16px", fontSize:15, boxSizing:"border-box", outline:"none" }} />
        </div>
        <button onClick={handleLogin} disabled={loading}
          style={{ width:"100%", background:"linear-gradient(135deg,#6366f1,#3b82f6)", color:"#fff", border:"none", borderRadius:12, padding:"14px", fontSize:16, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 20px rgba(99,102,241,0.4)" }}>
          {loading ? "Signing in..." : "🔑 Sign In"}
        </button>
        {error && <div style={{ marginTop:14, padding:"10px 14px", background:"#fef2f2", borderRadius:8, color:"#dc2626", fontSize:13, textAlign:"center" }}>⚠ {error}</div>}
        <div style={{ marginTop:20, textAlign:"center", fontSize:11, color:"#94a3b8" }}>Powered by Minarva Technologies</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AdminProvider>
      <AppContent />
    </AdminProvider>
  );
}
