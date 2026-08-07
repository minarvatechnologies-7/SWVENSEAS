import React, { useState, useEffect, useRef } from "react";
import { supabase, fetchAllRows } from "../lib/supabase";
import bcrypt from "bcryptjs";
import { getSalaryPeriods, calcPayrollRow } from "../lib/payrollUtils";

const WORK_HOURS = 10;
const HOURLY_RATE_DIVISOR = 10; // daily_rate / 10 = hourly rate

// Top-level to prevent focus loss
const Field = ({ label, children }) => <div><div style={{ fontSize: 12, color: "#64748b", marginBottom: 4, fontWeight: 500 }}>{label}</div>{children}</div>;

function calcHours(checkIn, checkOut, breakStart, breakEnd) {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  let diffMins = (end - start) / 60000;

  // Deduct the break window overlap (only the portion of break that falls inside worked time)
  if (breakStart && breakEnd) {
    const [bsH, bsM] = breakStart.split(":").map(Number);
    const [beH, beM] = breakEnd.split(":").map(Number);
    const bStart = new Date(start); bStart.setHours(bsH, bsM, 0, 0);
    const bEnd   = new Date(start); bEnd.setHours(beH, beM, 0, 0);
    // Overlap between [start,end] and [bStart,bEnd]
    const overlapStart = Math.max(start.getTime(), bStart.getTime());
    const overlapEnd   = Math.min(end.getTime(), bEnd.getTime());
    const overlapMins  = Math.max(0, (overlapEnd - overlapStart) / 60000);
    diffMins -= overlapMins;
  } else {
    // Fallback: old behaviour — 60min lunch if worked across noon
    if (start.getHours() < 13 && end.getHours() >= 13) diffMins -= 60;
  }
  return Math.max(0, Math.round((diffMins / 60) * 100) / 100);
}

// Standard net working hours for an employee (work span minus break)
function netStandardHours(emp) {
  const toMin = t => { if(!t) return null; const [h,m]=t.split(":").map(Number); return h*60+m; };
  const ws = toMin(emp?.work_start), we = toMin(emp?.work_end);
  const bs = toMin(emp?.break_start), be = toMin(emp?.break_end);
  if (ws==null || we==null) return 10; // fallback
  let mins = we - ws;
  if (bs!=null && be!=null) mins -= (be - bs);
  const hrs = mins / 60;
  return hrs > 0 ? hrs : 10;
}

// Format "HH:MM" 24h string to 12h display
function fmt12(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,"0")} ${ap}`;
}

function formatTime(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleTimeString("en-OM", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-OM", { day: "2-digit", month: "short", year: "numeric" });
}

// =====================
// EMPLOYEE FIELD APP
// =====================
function EmployeeApp({ onExit }) {
  const [phone, setPhone] = useState("");
  const [employee, setEmployee] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [logging, setLogging] = useState(false);
  const [tab, setTab] = useState("attendance");
  const [todayAtt, setTodayAtt] = useState(null);
  const [myAttendance, setMyAttendance] = useState([]);
  const [myPayments, setMyPayments] = useState([]);
  const [myPayroll, setMyPayroll] = useState([]);
  const [myRows, setMyRows] = useState([]); // computed payroll per period (same logic as admin)
  const [capturing, setCapturing] = useState(false);
  const [location, setLocation] = useState(null);
  const [selfieUrl, setSelfieUrl] = useState(null);
  const [cameraStream, setCameraStream] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [subcontractors, setSubcontractors] = useState([]);
  const [workedUnder, setWorkedUnder] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  // PIN auth state (field app)
  const [pinStage, setPinStage] = useState("phone"); // "phone" | "setup" | "enter"
  const [pendingEmp, setPendingEmp] = useState(null);  // employee found by phone, awaiting PIN
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  // Change-PIN modal state
  const [showChangePin, setShowChangePin] = useState(false);
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [changePinMsg, setChangePinMsg] = useState("");
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone
  );
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") setIsInstalled(true);
      setInstallPrompt(null);
    } else if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      setShowIOSGuide(true);
    }
    // Android: button only shows when installPrompt is ready
  };

  useEffect(() => {
    const saved = localStorage.getItem("emp_phone");
    if (saved) { setPhone(saved); findEmployee(saved); }
  }, []);

  // Look up the employee by phone, then route to PIN setup (first time) or PIN entry.
  const findEmployee = async (ph) => {
    const cleanPhone = ph.replace(/\s/g, "");
    setLoginError("");
    if (!cleanPhone) { setLoginError("Enter your phone number."); return; }
    const { data } = await supabase.from("employees").select("*").eq("phone", cleanPhone).eq("status", "Active").is("deleted_at", null).single();
    if (!data) {
      setLoginError("Phone number not found. Please contact your manager.");
      localStorage.removeItem("emp_phone");
      setPendingEmp(null);
      setPinStage("phone");
      return;
    }
    localStorage.setItem("emp_phone", cleanPhone);
    setPendingEmp(data);
    setPin(""); setPinConfirm("");
    // If a bcrypt PIN is already set -> ask for it; otherwise let them create one.
    setPinStage(data.field_pin && String(data.field_pin).startsWith("$2") ? "enter" : "setup");
  };

  const completeLogin = (emp) => {
    setEmployee(emp);
    setLoginError(""); setPin(""); setPinConfirm("");
    setPinStage("phone"); setPendingEmp(null);
    loadMyData(emp.id);
  };

  // First-time: create and save a 4-digit PIN (hashed).
  const submitSetupPin = async () => {
    if (!/^\d{4}$/.test(pin)) { setLoginError("PIN 4 അക്കം ആകണം."); return; }
    if (pin !== pinConfirm) { setLoginError("രണ്ട് PIN-ഉം ഒരേപോലെ ആകണം."); return; }
    if (!pendingEmp) { setLoginError("വീണ്ടും ശ്രമിക്കൂ."); return; }
    setPinBusy(true);
    try {
      const hash = bcrypt.hashSync(pin, 10);
      const { error } = await supabase.from("employees").update({ field_pin: hash }).eq("id", pendingEmp.id);
      if (error) { setLoginError("PIN save ആയില്ല. വീണ്ടും ശ്രമിക്കൂ."); setPinBusy(false); return; }
      completeLogin({ ...pendingEmp, field_pin: hash });
    } finally { setPinBusy(false); }
  };

  // Returning: verify entered PIN against stored hash.
  const submitEnterPin = () => {
    if (!pendingEmp?.field_pin) { setLoginError("വീണ്ടും ശ്രമിക്കൂ."); return; }
    if (!/^\d{4}$/.test(pin)) { setLoginError("PIN 4 അക്കം ആകണം."); return; }
    if (bcrypt.compareSync(pin, pendingEmp.field_pin)) {
      completeLogin(pendingEmp);
    } else {
      setLoginError("PIN തെറ്റാണ്.");
      setPin("");
    }
  };

  // Logged-in employee changes their own PIN.
  const changePin = async () => {
    setChangePinMsg("");
    if (!employee?.field_pin || !bcrypt.compareSync(oldPin, employee.field_pin)) { setChangePinMsg("❌ പഴയ PIN തെറ്റാണ്."); return; }
    if (!/^\d{4}$/.test(newPin)) { setChangePinMsg("❌ പുതിയ PIN 4 അക്കം ആകണം."); return; }
    if (newPin !== newPinConfirm) { setChangePinMsg("❌ പുതിയ PIN രണ്ടും ഒരേപോലെ ആകണം."); return; }
    const hash = bcrypt.hashSync(newPin, 10);
    const { error } = await supabase.from("employees").update({ field_pin: hash }).eq("id", employee.id);
    if (error) { setChangePinMsg("❌ Save ആയില്ല. വീണ്ടും ശ്രമിക്കൂ."); return; }
    setEmployee({ ...employee, field_pin: hash });
    setChangePinMsg("✅ PIN മാറ്റി!");
    setOldPin(""); setNewPin(""); setNewPinConfirm("");
    setTimeout(() => { setShowChangePin(false); setChangePinMsg(""); }, 1200);
  };

  const loadMyData = async (empId) => {
    const today = new Date().toISOString().split("T")[0];
    const [att, pays, pr, empRes] = await Promise.all([
      supabase.from("attendance").select("*").eq("employee_id", empId).is("deleted_at",null).order("work_date", { ascending: false }).limit(400),
      supabase.from("salary_payments").select("*").eq("employee_id", empId).is("deleted_at",null).order("payment_date", { ascending: false }).limit(200),
      supabase.from("payroll").select("*").eq("employee_id", empId).is("deleted_at",null).order("period_start", { ascending: false }).limit(24),
      supabase.from("employees").select("*").eq("id", empId).single(),
    ]);
    const attData = att.data || [];
    const payData = pays.data || [];
    const prData = pr.data || [];
    const emp = empRes.data || employee;

    // Auto punch-out: if any check-in has no check-out and 10 working hours have
    // already passed, close it automatically as one full day. This covers people
    // who forget to punch out. The auto check-out time = check-in + 10 hours.
    const WORK_MS = WORK_HOURS * 60 * 60 * 1000;
    const nowMs = Date.now();
    const staleOpen = attData.filter(a => a.check_in && !a.check_out && (nowMs - new Date(a.check_in).getTime()) >= WORK_MS);
    if (staleOpen.length) {
      for (const a of staleOpen) {
        const autoOut = new Date(new Date(a.check_in).getTime() + WORK_MS).toISOString();
        await supabase.from("attendance").update({
          check_out: autoOut,
          hours_worked: WORK_HOURS,
          days_worked: 1,
          notes: (a.notes ? a.notes + " " : "") + "Auto punch-out after 10h."
        }).eq("id", a.id);
        a.check_out = autoOut; a.hours_worked = WORK_HOURS; a.days_worked = 1; // reflect locally
      }
    }

    setMyAttendance(attData);
    setMyPayments(payData);
    setMyPayroll(prData);

    // Compute payroll per period using the SAME function the admin Payroll/Reports
    // pages use, so the numbers match exactly. Only show periods that actually
    // have work, payments, or a balance.
    const periods = getSalaryPeriods();
    const rows = periods.map(p => {
      // Use the FULL period object (includes year + month) so carry-forward
      // chaining in calcPayrollRow works — getPrevPeriod needs period.month/year.
      const r = calcPayrollRow(emp, p, attData, prData, payData, null);
      return { period: p, ...r };
    }).filter(r => r.totalDays > 0 || r.paidAmt > 0 || Math.abs(r.balance) > 0.001 || Math.abs(r.openingBal) > 0.001);
    setMyRows(rows);

    const todayRecord = attData.find(a => (a.att_date || a.work_date) === today);
    setTodayAtt(todayRecord || null);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      setCameraStream(stream);
      // NOTE: videoRef.current is null here because the <video> element only
      // renders AFTER cameraStream is set. The useEffect below attaches the
      // stream once the video element actually mounts.
    } catch (e) {
      console.error("Camera error:", e);
      alert("Camera permission required for attendance. Please allow camera access and try again.");
    }
  };

  // Attach camera stream to <video> AFTER it renders (fixes blank selfie / videoWidth=0)
  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play?.().catch(() => {});
    }
  }, [cameraStream]);

  const stopCamera = () => {
    cameraStream?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
  };

  const captureAndSubmit = async (isCheckOut = false) => {
    setCapturing(true);
    // Get location
    let lat = null, lng = null;
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 }));
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch { /* location optional */ }

    // Capture selfie — wait for video to be ready
    let photoUrl = null;
    let selfieFailReason = "";
    if (videoRef.current && canvasRef.current) {
      // Wait until video has actual dimensions
      let attempts = 0;
      while ((videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) && attempts < 20) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
        selfieFailReason = "Camera did not start. Selfie not captured.";
      } else {
        const canvas = canvasRef.current;
        const w = videoRef.current.videoWidth || 640;
        const h = videoRef.current.videoHeight || 480;
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(videoRef.current, 0, 0, w, h);
        const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.8));
        if (blob && blob.size > 1000) { // ensure valid image
          const fd = new FormData();
          fd.append("file", blob);
          fd.append("upload_preset", "sevenseas_attendance");
          try {
            const res = await fetch("https://api.cloudinary.com/v1_1/dbcjyi5ae/image/upload", { method: "POST", body: fd });
            if (res.ok) {
              const data = await res.json();
              photoUrl = data.secure_url || null;
              if (!photoUrl) selfieFailReason = "Selfie upload returned no URL.";
            } else {
              selfieFailReason = "Selfie upload failed (server " + res.status + ").";
            }
          } catch (e) { console.error("Selfie upload failed:", e); selfieFailReason = "Selfie upload failed (network)."; }
        } else {
          selfieFailReason = "Captured image was empty.";
        }
      }
    } else {
      selfieFailReason = "Camera not available.";
    }
    if (selfieFailReason) {
      console.warn("Selfie issue:", selfieFailReason);
      alert("⚠ " + selfieFailReason + " Attendance will still be saved, but please retry if your photo is required.");
    }

    stopCamera();
    const now = new Date().toISOString();
    const today = new Date().toISOString().split("T")[0];

    if (!isCheckOut) {
      // Check IN
      const { data: att } = await supabase.from("attendance").insert({
        employee_id: employee.id,
        att_date: today,
        work_date: today,
        check_in: now,
        selfie_url: photoUrl,
        latitude: lat,
        longitude: lng,
        hours_worked: 0,
        days_worked: 0,
        site: "Field",
        notes: "Self check-in via app"
      }).select().single();
      setTodayAtt(att);
    } else {
      // Check OUT — record exactly ONE standard working day (no OT / no lower-time).
      // Any overtime or short-time is entered manually by admin in the office app.
      const stdHours = WORK_HOURS; // 10h standard day
      await supabase.from("attendance").update({
        check_out: now,
        hours_worked: stdHours,
        days_worked: 1,
        selfie_url: photoUrl || todayAtt.selfie_url,
        latitude: lat || todayAtt.latitude,
        longitude: lng || todayAtt.longitude,
        notes: `Self check-out via app. Counted as 1 full day.`
      }).eq("id", todayAtt.id);
      await loadMyData(employee.id);
    }

    await loadMyData(employee.id);
    setCapturing(false);
    setCheckingOut(false);
  };

  const logout = () => {
    localStorage.removeItem("emp_phone");
    setEmployee(null);
    setTodayAtt(null);
    setPendingEmp(null); setPin(""); setPinConfirm(""); setPinStage("phone");
    setPhone(""); setLoginError("");
  };

  // LOGIN SCREEN
  if (!employee) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>

        {/* iOS Install Guide Overlay */}
        {showIOSGuide && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: 20 }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 380, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 16 }}>📱 iPhone-ൽ Install ചെയ്യൂ</div>
              <div style={{ fontSize: 14, color: "#475569", marginBottom: 8 }}>1. Bottom-ൽ <strong>Share</strong> button tap ചെയ്യൂ</div>
              <div style={{ fontSize: 30, marginBottom: 8 }}>□↑</div>
              <div style={{ fontSize: 14, color: "#475569", marginBottom: 8 }}>2. <strong>"Add to Home Screen"</strong> select ചെയ്യൂ</div>
              <div style={{ fontSize: 14, color: "#475569", marginBottom: 20 }}>3. <strong>"Add"</strong> tap ചെയ്യൂ</div>
              <button onClick={() => setShowIOSGuide(false)} style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 10, padding: "12px 32px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>OK, Got it</button>
            </div>
          </div>
        )}

        {/* Install button */}
        {!isInstalled && (installPrompt || /iPad|iPhone|iPod/.test(navigator.userAgent)) && (
          <button onClick={handleInstall}
            style={{ position: "absolute", top: 16, right: 16, background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(99,102,241,0.5)" }}>
            ⬇ Install App
          </button>
        )}
        {isInstalled && (
          <div style={{ position: "absolute", top: 16, right: 16, background: "rgba(16,185,129,0.2)", color: "#34d399", border: "1px solid #34d399", borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 600 }}>
            ✅ App Installed
          </div>
        )}

        <div style={{ width: 72, height: 72, background: "#3b82f6", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 900, color: "#fff", marginBottom: 16, boxShadow: "0 8px 24px rgba(59,130,246,0.4)" }}>S</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>SEVENSEAS</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 32 }}>Employee Attendance App</div>

        <div style={{ background: "#fff", borderRadius: 20, padding: 32, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          {pinStage === "phone" && (<>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Sign In</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>Enter your Oman phone number</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 500 }}>Phone Number</div>
            <input value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 94132280"
              type="tel"
              style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "13px 16px", fontSize: 16, boxSizing: "border-box", outline: "none", marginBottom: 16 }}
              onKeyDown={e => e.key === "Enter" && findEmployee(phone)} />
            {loginError && <div style={{ background: "#fef2f2", color: "#dc2626", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>{loginError}</div>}
            <button onClick={() => findEmployee(phone)}
              style={{ width: "100%", background: "#0f172a", color: "#fff", border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Continue →</button>
          </>)}

          {pinStage === "setup" && (<>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Create your PIN 🔒</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>{pendingEmp?.name}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>4 അക്കം ഉള്ള ഒരു PIN ഉണ്ടാക്കൂ. ഇത് ഓർത്തുവെക്കൂ — ഓരോ login-നും വേണം.</div>
            <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="New PIN (4 digits)" type="tel" inputMode="numeric" maxLength={4}
              style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "13px 16px", fontSize: 22, letterSpacing: 8, textAlign: "center", boxSizing: "border-box", outline: "none", marginBottom: 12 }} />
            <input value={pinConfirm} onChange={e => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Confirm PIN" type="tel" inputMode="numeric" maxLength={4}
              style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "13px 16px", fontSize: 22, letterSpacing: 8, textAlign: "center", boxSizing: "border-box", outline: "none", marginBottom: 16 }}
              onKeyDown={e => e.key === "Enter" && submitSetupPin()} />
            {loginError && <div style={{ background: "#fef2f2", color: "#dc2626", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>{loginError}</div>}
            <button onClick={submitSetupPin} disabled={pinBusy}
              style={{ width: "100%", background: "#0f172a", color: "#fff", border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: pinBusy ? 0.6 : 1 }}>{pinBusy ? "Saving…" : "Set PIN & Sign In →"}</button>
            <button onClick={() => { setPinStage("phone"); setLoginError(""); }}
              style={{ width: "100%", background: "none", color: "#64748b", border: "none", padding: "12px", fontSize: 13, cursor: "pointer", marginTop: 4 }}>← Back</button>
          </>)}

          {pinStage === "enter" && (<>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Enter your PIN 🔒</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>{pendingEmp?.name}</div>
            <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="PIN" type="tel" inputMode="numeric" maxLength={4} autoFocus
              style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "13px 16px", fontSize: 22, letterSpacing: 8, textAlign: "center", boxSizing: "border-box", outline: "none", marginBottom: 16 }}
              onKeyDown={e => e.key === "Enter" && submitEnterPin()} />
            {loginError && <div style={{ background: "#fef2f2", color: "#dc2626", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>{loginError}</div>}
            <button onClick={submitEnterPin}
              style={{ width: "100%", background: "#0f172a", color: "#fff", border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Sign In →</button>
            <button onClick={() => { setPinStage("phone"); setPin(""); setLoginError(""); }}
              style={{ width: "100%", background: "none", color: "#64748b", border: "none", padding: "12px", fontSize: 13, cursor: "pointer", marginTop: 4 }}>← Use a different phone</button>
          </>)}
        </div>
      </div>
    );
  }

  // MAIN APP
  const today = new Date().toISOString().split("T")[0];
  const isCheckedIn = !!todayAtt?.check_in;
  const isCheckedOut = !!todayAtt?.check_out;
  const currentHours = todayAtt?.check_in && !todayAtt?.check_out
    ? calcHours(todayAtt.check_in, new Date().toISOString(), employee.break_start, employee.break_end) : todayAtt?.hours_worked || 0;
  const stdHours = netStandardHours(employee);
  const overtime = Math.max(0, currentHours - stdHours);
  const dailyRate = parseFloat(employee.daily_rate || 0);
  const hourlyRate = dailyRate / stdHours;
  const estimatedPay = Math.round(currentHours * hourlyRate * 1000) / 1000;

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0f172a,#1e3a5f)", padding: "20px 20px 60px", position: "relative" }}>
        {!isInstalled && (
          <button onClick={handleInstall}
            style={{ position: "absolute", top: 16, right: 16, background: "rgba(99,102,241,0.9)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 13px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            ⬇ Install App
          </button>
        )}
        <div style={{ fontSize: 12, color: "#60a5fa", marginBottom: 4 }}>SEVENSEAS Modern Enterprises</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{employee.name}</div>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>{employee.role} · OMR {parseFloat(employee.daily_rate).toFixed(3)}/day</div>
      </div>

      {/* Attendance card */}
      <div style={{ margin: "-40px 16px 0", background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.1)", marginBottom: 16 }}>
        {!isCheckedIn && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Today — {formatDate(new Date().toISOString())}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>You have not checked in yet. Working hours: {fmt12(employee.work_start) || "7:00 AM"} – {fmt12(employee.work_end) || "6:00 PM"}{employee.break_start && employee.break_end ? ` · Break ${fmt12(employee.break_start)}–${fmt12(employee.break_end)}` : ""}</div>
            {!cameraStream ? (
              <button onClick={startCamera}
                style={{ width: "100%", background: "#10b981", color: "#fff", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
                📍 Mark Attendance IN
              </button>
            ) : (
              <div>
                <video ref={videoRef} autoPlay playsInline style={{ width: "100%", borderRadius: 10, marginBottom: 10 }} />
                <canvas ref={canvasRef} style={{ display: "none" }} />
                <button onClick={() => captureAndSubmit(false)} disabled={capturing}
                  style={{ width: "100%", background: capturing ? "#94a3b8" : "#10b981", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
                  {capturing ? "⏳ Recording..." : "✅ Confirm Check IN"}
                </button>
                <button onClick={stopCamera} style={{ width: "100%", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {isCheckedIn && !isCheckedOut && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 10, height: 10, background: "#10b981", borderRadius: "50%", animation: "pulse 2s infinite" }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>You are currently at work</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                ["Check In", formatTime(todayAtt.check_in), "#10b981"],
                ["Hours Worked", `${currentHours.toFixed(1)} hrs`, "#6366f1"],
                ["Overtime", `${overtime.toFixed(1)} hrs`, overtime > 0 ? "#f59e0b" : "#94a3b8"],
                ["Est. Pay Today", `OMR ${estimatedPay.toFixed(3)}`, "#0ea5e9"],
              ].map(([l, v, c]) => (
                <div key={l} style={{ background: "#f8fafc", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{l}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: c }}>{v}</div>
                </div>
              ))}
            </div>
            {!cameraStream ? (
              <button onClick={() => { setCheckingOut(true); startCamera(); }}
                style={{ width: "100%", background: "#ef4444", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                🏁 Mark Attendance OUT
              </button>
            ) : (
              <div>
                <video ref={videoRef} autoPlay playsInline style={{ width: "100%", borderRadius: 10, marginBottom: 10 }} />
                <canvas ref={canvasRef} style={{ display: "none" }} />
                <button onClick={() => captureAndSubmit(true)} disabled={capturing}
                  style={{ width: "100%", background: capturing ? "#94a3b8" : "#ef4444", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
                  {capturing ? "⏳ Recording..." : "🏁 Confirm Check OUT"}
                </button>
                <button onClick={stopCamera} style={{ width: "100%", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {isCheckedOut && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 16 }}>Work Complete for Today!</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
              {formatTime(todayAtt.check_in)} → {formatTime(todayAtt.check_out)} · {parseFloat(todayAtt.hours_worked).toFixed(1)} hrs · OMR {(parseFloat(todayAtt.hours_worked) * hourlyRate).toFixed(3)}
            </div>
          </div>
        )}
      </div>

      {/* Tab content */}
      {tab === "history" && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15, marginBottom: 12 }}>Attendance History</div>
          {myAttendance.map(a => (
            <div key={a.id} style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 10, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, color: "#1e293b" }}>{a.att_date || a.work_date}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{formatTime(a.check_in)} → {formatTime(a.check_out)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, color: "#6366f1" }}>{parseFloat(a.hours_worked).toFixed(1)} hrs</div>
                  <div style={{ fontSize: 12, color: "#10b981" }}>OMR {(parseFloat(a.hours_worked || 0) / WORK_HOURS * dailyRate).toFixed(3)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "salary" && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15, marginBottom: 12 }}>Salary & Payments</div>
          {myRows.map(r => (
            <div key={r.period.label} style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, border: "1px solid #e2e8f0" }}>
              <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>Period: {r.period.label} ({r.period.start} → {r.period.end})</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["Days Worked", `${r.totalDays} days`],
                  ["Gross Salary", `OMR ${r.grossSalary.toFixed(3)}`],
                  ["Advance Deducted", `OMR ${r.advance.toFixed(3)}`],
                  ["Net Payable", `OMR ${r.netSalary.toFixed(3)}`],
                  ["Old Balance", `OMR ${r.openingBal.toFixed(3)}`],
                  ["Total Amount", `OMR ${r.totalAmount.toFixed(3)}`],
                  ["Total Received", `OMR ${r.paidAmt.toFixed(3)}`],
                  ["Balance Due", `OMR ${r.balance.toFixed(3)}`],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{v}</div>
                  </div>
                ))}
              </div>
              {/* Payments in this period */}
              {(r.finalPayments || []).map(p => (
                <div key={p.id} style={{ marginTop: 8, padding: "8px 10px", background: "#ecfdf5", borderRadius: 8, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#065f46" }}>{p.payment_type || "Salary"} · {p.payment_date}</span>
                  <span style={{ fontWeight: 700, color: "#10b981" }}>OMR {parseFloat(p.amount).toFixed(3)}</span>
                </div>
              ))}
            </div>
          ))}
          {myRows.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>No salary records yet.</div>}
        </div>
      )}

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e2e8f0", display: "flex", padding: "8px 0" }}>
        {[["attendance","📍","Attendance"],["history","📅","History"],["salary","💰","Salary"]].map(([id, icon, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", padding: "6px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ fontSize: 11, color: tab === id ? "#6366f1" : "#94a3b8", fontWeight: tab === id ? 700 : 400 }}>{label}</span>
          </button>
        ))}
        <button onClick={() => { setShowChangePin(true); setOldPin(""); setNewPin(""); setNewPinConfirm(""); setChangePinMsg(""); }} style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", padding: "6px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 20 }}>🔒</span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>PIN</span>
        </button>
        <button onClick={logout} style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", padding: "6px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 20 }}>🚪</span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Logout</span>
        </button>
      </div>

      {/* Change PIN modal */}
      {showChangePin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 18, padding: 26, width: "100%", maxWidth: 360 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 18 }}>Change PIN 🔒</div>
            <input value={oldPin} onChange={e => setOldPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Current PIN" type="tel" inputMode="numeric" maxLength={4}
              style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px", fontSize: 20, letterSpacing: 6, textAlign: "center", boxSizing: "border-box", outline: "none", marginBottom: 10 }} />
            <input value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="New PIN" type="tel" inputMode="numeric" maxLength={4}
              style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px", fontSize: 20, letterSpacing: 6, textAlign: "center", boxSizing: "border-box", outline: "none", marginBottom: 10 }} />
            <input value={newPinConfirm} onChange={e => setNewPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Confirm New PIN" type="tel" inputMode="numeric" maxLength={4}
              style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px", fontSize: 20, letterSpacing: 6, textAlign: "center", boxSizing: "border-box", outline: "none", marginBottom: 14 }}
              onKeyDown={e => e.key === "Enter" && changePin()} />
            {changePinMsg && <div style={{ fontSize: 13, color: changePinMsg.startsWith("✅") ? "#16a34a" : "#dc2626", marginBottom: 12, textAlign: "center" }}>{changePinMsg}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowChangePin(false)} style={{ flex: 1, background: "#f1f5f9", color: "#0f172a", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={changePin} style={{ flex: 1, background: "#0f172a", color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================
// ADMIN ATTENDANCE VIEW
// =====================
function AdminAttendance() {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldView, setFieldView] = useState(false);
  const [filterDate, setFilterDate] = useState(""); // "" = all days
  const [form, setForm] = useState({ employee_id: "", work_date: new Date().toISOString().split("T")[0], check_in: "07:00", check_out: "17:00", site: "", notes: "" });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [e, a] = await Promise.all([
      supabase.from("employees").select("*").eq("status", "Active").is("deleted_at",null).order("name"),
      fetchAllRows((from, to) =>
        supabase.from("attendance").select("*").is("deleted_at",null).order("att_date", { ascending: false }).order("created_at", { ascending: false }).range(from, to)
      ),
    ]);
    setEmployees(e.data || []);
    setAttendance(a || []);
    setLoading(false);
  };

  const calcH = (checkIn, checkOut) => {
    if (!checkIn || !checkOut) return 0;
    const [ih, im] = checkIn.split(":").map(Number);
    const [oh, om] = checkOut.split(":").map(Number);
    const startMins = ih * 60 + im;
    const endMins = oh * 60 + om;
    let totalMins = endMins - startMins;
    if (totalMins <= 0) return 0;
    if (ih < 13 && oh >= 13) totalMins -= 60;
    return Math.round((totalMins / 60) * 100) / 100;
  };

  const save = async () => {
    if (!form.employee_id) return;
    setSaving(true);
    const hours = calcH(form.check_in, form.check_out);
    const days = parseFloat((hours / WORK_HOURS).toFixed(2));
    const overtime = Math.max(0, hours - WORK_HOURS);
    await supabase.from("attendance").insert({
      employee_id: form.employee_id,
      att_date: form.work_date,
      work_date: form.work_date,
      check_in: `${form.work_date}T${form.check_in}:00`,
      check_out: `${form.work_date}T${form.check_out}:00`,
      hours_worked: hours,
      days_worked: days,
      site: form.site,
      notes: `Manual entry by admin. ${form.notes} OT: ${overtime.toFixed(1)}h`
    });
    await load();
    setForm({ employee_id: "", work_date: new Date().toISOString().split("T")[0], check_in: "07:00", check_out: "17:00", site: "", notes: "" });
    setShowForm(false);
    setSaving(false);
  };

  const inp = { border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, width: "100%", boxSizing: "border-box", outline: "none" };

  const previewH = calcH(form.check_in, form.check_out);
  const previewOT = Math.max(0, previewH - WORK_HOURS);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>Attendance Records</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>All employee attendance — GPS, selfie, and manual entries</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setFieldView(v => !v)} style={{ background: fieldView ? "#0ea5e9" : "#fff", color: fieldView ? "#fff" : "#0ea5e9", border: "2px solid #0ea5e9", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {fieldView ? "📋 Back to Records" : "📸 Field Log (Selfie + Location)"}
          </button>
          <button onClick={() => setShowForm(!showForm)} style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Manual Entry</button>
        </div>
      </div>

      {showForm && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 22, marginBottom: 16, border: "2px solid #6366f1" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 16 }}>Manual Attendance Entry (Admin)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="Employee">
              <select value={form.employee_id} onChange={e => setForm(p=>({...p,employee_id:e.target.value}))} style={inp}>
                <option value="">Select Employee</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Work Date"><input type="date" value={form.work_date} onChange={e => setForm(p=>({...p,work_date:e.target.value}))} style={inp} /></Field>
            <Field label="Check In Time"><input type="time" value={form.check_in} onChange={e => setForm(p=>({...p,check_in:e.target.value}))} style={inp} /></Field>
            <Field label="Check Out Time"><input type="time" value={form.check_out} onChange={e => setForm(p=>({...p,check_out:e.target.value}))} style={inp} /></Field>
            <Field label="Site / Location"><input value={form.site} onChange={e => setForm(p=>({...p,site:e.target.value}))} style={inp} /></Field>
            <Field label="Notes"><input value={form.notes} onChange={e => setForm(p=>({...p,notes:e.target.value}))} style={inp} /></Field>
          </div>
          {form.check_in && form.check_out && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: "#eef2ff", borderRadius: 8, fontSize: 13, color: "#6366f1", fontWeight: 600 }}>
              ⏱ Hours: {previewH} hrs = {(previewH/WORK_HOURS).toFixed(2)} days
              {previewOT > 0 && <span style={{ color: "#f59e0b", marginLeft: 12 }}>⚡ Overtime: {previewOT.toFixed(1)} hrs</span>}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={save} disabled={saving} style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{saving ? "Saving..." : "💾 Save Attendance"}</button>
            <button onClick={() => setShowForm(false)} style={{ background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, padding: "10px 18px", cursor: "pointer", fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {fieldView && (() => {
        // Field Log: only records with selfie OR GPS (self check-in/out via app)
        const fieldRecs = attendance.filter(a => a.selfie_url || (a.latitude && a.longitude));
        const days = [...new Set(fieldRecs.map(a => a.att_date || a.work_date))].sort().reverse();
        const shown = filterDate ? fieldRecs.filter(a => (a.att_date || a.work_date) === filterDate) : fieldRecs;
        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>📸 Field Attendance Log</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Selfie + location captured from the employee field app</div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Day:</span>
                <select value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", cursor: "pointer" }}>
                  <option value="">All days ({fieldRecs.length})</option>
                  {days.map(d => <option key={d} value={d}>{formatDate(d)} ({fieldRecs.filter(a => (a.att_date||a.work_date)===d).length})</option>)}
                </select>
              </div>
            </div>
            {shown.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 50, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
                {loading ? "⏳ Loading..." : "No field check-ins with selfie/location yet."}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
                {shown.map(a => {
                  const emp = employees.find(e => e.id === a.employee_id);
                  const hasGPS = a.latitude && a.longitude;
                  return (
                    <div key={a.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                      {a.selfie_url ? (
                        <img src={a.selfie_url} alt="selfie" onClick={() => window.open(a.selfie_url)} style={{ width: "100%", height: 220, objectFit: "cover", cursor: "pointer", display: "block", background: "#f1f5f9" }} />
                      ) : (
                        <div style={{ width: "100%", height: 220, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: 40 }}>📷</div>
                      )}
                      <div style={{ padding: 14 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 2 }}>{emp?.name || "Unknown"}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>{formatDate(a.att_date || a.work_date)}</div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          <div style={{ flex: 1, background: "#f0fdf4", borderRadius: 8, padding: "6px 8px" }}>
                            <div style={{ fontSize: 9, color: "#16a34a", fontWeight: 700 }}>CHECK IN</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>{a.check_in ? formatTime(a.check_in) : "—"}</div>
                          </div>
                          <div style={{ flex: 1, background: "#fef2f2", borderRadius: 8, padding: "6px 8px" }}>
                            <div style={{ fontSize: 9, color: "#dc2626", fontWeight: 700 }}>CHECK OUT</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>{a.check_out ? formatTime(a.check_out) : "In progress"}</div>
                          </div>
                        </div>
                        {hasGPS ? (
                          <a href={`https://maps.google.com?q=${a.latitude},${a.longitude}`} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center", background: "#eef2ff", color: "#6366f1", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>📍 View Location on Map</a>
                        ) : (
                          <div style={{ textAlign: "center", background: "#f8fafc", color: "#94a3b8", borderRadius: 8, padding: "8px", fontSize: 12 }}>No location recorded</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {!fieldView && (
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ background: "#f8fafc" }}>
            {["Employee","Date","Check In","Check Out","Hours","OT","Days","Site","Selfie","GPS","Notes"].map(h =>
              <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 10 }}>{h}</th>
            )}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={11} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>⏳ Loading...</td></tr> :
             attendance.length === 0 ? <tr><td colSpan={11} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>No attendance records yet.</td></tr> :
             attendance.map((a, i) => {
               const emp = employees.find(e => e.id === a.employee_id);
               const hours = parseFloat(a.hours_worked || 0);
               const overtime = Math.max(0, hours - WORK_HOURS);
               return (
                 <tr key={a.id} style={{ borderTop: "1px solid #f1f5f9", background: i%2===0?"#fff":"#f8fafc" }}>
                   <td style={{ padding: "9px 12px", fontWeight: 600, color: "#1e293b" }}>{emp?.name || "—"}</td>
                   <td style={{ padding: "9px 12px", color: "#64748b" }}>{a.att_date || a.work_date}</td>
                   <td style={{ padding: "9px 12px", color: "#10b981" }}>{a.check_in ? formatTime(a.check_in) : "—"}</td>
                   <td style={{ padding: "9px 12px", color: "#ef4444" }}>{a.check_out ? formatTime(a.check_out) : <span style={{ color: "#f59e0b" }}>In Progress</span>}</td>
                   <td style={{ padding: "9px 12px", fontWeight: 700, color: "#6366f1" }}>{hours.toFixed(1)}h</td>
                   <td style={{ padding: "9px 12px", color: overtime > 0 ? "#f59e0b" : "#94a3b8" }}>{overtime > 0 ? `+${overtime.toFixed(1)}h` : "—"}</td>
                   <td style={{ padding: "9px 12px" }}>{parseFloat(a.days_worked||0).toFixed(2)}d</td>
                   <td style={{ padding: "9px 12px", color: "#64748b" }}>{a.site || "—"}</td>
                   <td style={{ padding: "9px 12px" }}>
                     {a.selfie_url
                       ? <img src={a.selfie_url} alt="selfie" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "2px solid #10b981", cursor: "pointer" }} onClick={() => window.open(a.selfie_url)} />
                       : <span style={{ color: "#94a3b8" }}>—</span>}
                   </td>
                   <td style={{ padding: "9px 12px" }}>
                     {a.latitude && a.longitude
                       ? <a href={`https://maps.google.com?q=${a.latitude},${a.longitude}`} target="_blank" rel="noreferrer" style={{ color: "#6366f1", fontSize: 11, textDecoration: "none" }}>📍 View</a>
                       : <span style={{ color: "#94a3b8" }}>—</span>}
                   </td>
                   <td style={{ padding: "9px 12px", color: "#94a3b8", fontSize: 10, maxWidth: 120 }}>{a.notes || "—"}</td>
                 </tr>
               );
             })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

// Main export — detect if employee app or admin view
export default function AttendancePage({ onExitFieldMode }) {
  const path = window.location.hash;
  const isFieldApp = path.includes("field") || localStorage.getItem("emp_phone") || onExitFieldMode;
  const [mode, setMode] = useState(isFieldApp ? "field" : "admin");

  if (mode === "field") return <EmployeeApp onExit={() => { setMode("admin"); if (onExitFieldMode) onExitFieldMode(); }} />;

  return (
    <div>
      <div style={{ padding: "16px 24px 0", display: "flex", gap: 10 }}>
        <button onClick={() => setMode("admin")} style={{ background: mode==="admin"?"#0f172a":"#f1f5f9", color: mode==="admin"?"#fff":"#64748b", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🖥 Admin View</button>
        <button onClick={() => setMode("field")} style={{ background: mode==="field"?"#10b981":"#f1f5f9", color: mode==="field"?"#fff":"#64748b", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📱 Employee App Preview</button>
      </div>
      <AdminAttendance />
    </div>
  );
}
