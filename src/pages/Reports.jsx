import { useState, useEffect, useRef } from "react";
import { getBankAccounts } from "../lib/bankAccounts";
import { supabase, fetchAllRows } from "../lib/supabase";
import * as XLSX from "xlsx";
import { WORK_HOURS, getSalaryPeriods, calcPayrollRow } from "../lib/payrollUtils";

// Escape user-controlled text before putting it into print HTML (prevents XSS).
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const downloadExcel = (rows, filename) => {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  // Auto-width columns
  const colWidths = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length, ...rows.map(r => String(r[k] || "").length)) + 2 }));
  ws["!cols"] = colWidths;
  XLSX.writeFile(wb, filename + ".xlsx");
};

const tabs = [
  { id: "accounts", label: "🏦 Account Statement" },
  { id: "supplier_statement", label: "🏪 Supplier Statement" },
  { id: "vat_report", label: "🧾 VAT Report" },
  { id: "executive", label: "Executive Overview", icon: "⚖" },
  { id: "projects", label: "Contract Sites Progress", icon: "🏗" },
  { id: "profit_loss", label: "Profit & Loss by Project", icon: "📈" },
  { id: "invoices", label: "Invoices & Quotations", icon: "🗒" },
  { id: "payments", label: "Payment Collections", icon: "💰" },
  { id: "ledger", label: "Cashbook Statement", icon: "📒" },
  { id: "subcontractors", label: "Subcontractor Balances", icon: "🔧" },
  { id: "labour_supply", label: "Labour Supply (Lent/Borrowed)", icon: "👷" },
  { id: "commissions", label: "Commission Ledger", icon: "💼" },
  { id: "payroll", label: "Payroll Summary", icon: "👤" },
  { id: "reconcile", label: "Payroll ↔ Cashbook Check", icon: "🔍" },
  { id: "inventory", label: "Inventory Stock", icon: "📦" },
  { id: "material_requests", label: "Material Requests", icon: "📋" },
  { id: "equipment", label: "Equipment Register", icon: "🚜" },
];

export default function Reports() {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selectedBankAccount, setSelectedBankAccount] = useState("");
  const [bankLedger, setBankLedger] = useState([]);
  const [activeTab, setActiveTab] = useState("executive");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const printRef = useRef(null);

  // Data states
  const [projects, setProjects] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [subs, setSubs] = useState([]);
  const [subMilestones, setSubMilestones] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [salaryPayments, setSalaryPayments] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [bpSuppliers, setBpSuppliers] = useState([]);
  const [bpBills, setBpBills] = useState([]);
  const [bpPayments, setBpPayments] = useState([]);
  const [labourSupply, setLabourSupply] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoiceLineItems, setInvoiceLineItems] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryTxns, setInventoryTxns] = useState([]);
  const [materialRequests, setMaterialRequests] = useState([]);
  const [materialRequestItems, setMaterialRequestItems] = useState([]);
  const [equipmentList, setEquipmentList] = useState([]);
  const [equipmentSchedule, setEquipmentSchedule] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [cbFilter, setCbFilter] = useState("All");
  const [suppSubTab, setSuppSubTab] = useState("all");
  const [selectedPayrollEmployee, setSelectedPayrollEmployee] = useState("");
  const [labourSubFilter, setLabourSubFilter] = useState("");

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    setLoading(true);
    const [p, s, l, sb, sm, c, e, py, att, sp, bps, bpb, bpp, lsp, inv, ili, invi, invt, mr, mri, eq, eqs, actlog] = await Promise.all([
      supabase.from("projects").select("*").is("deleted_at",null).order("created_at"),
      supabase.from("schedules").select("*").is("deleted_at",null),
      fetchAllRows((from, to) => supabase.from("ledger").select("*").is("deleted_at",null).order("entry_date").range(from, to)),
      supabase.from("subcontractors").select("*").is("deleted_at",null).order("name"),
      supabase.from("sub_milestones").select("*").is("deleted_at",null),
      supabase.from("commissions").select("*").is("deleted_at",null).order("commission_date"),
      supabase.from("employees").select("*").is("deleted_at",null).order("name"),
      supabase.from("payroll").select("*").is("deleted_at",null),
      fetchAllRows((from, to) => supabase.from("attendance").select("*").is("deleted_at",null).order("att_date",{ascending:false}).range(from, to)),
      supabase.from("salary_payments").select("*").is("deleted_at",null).order("payment_date",{ascending:false}),
      supabase.from("bp_suppliers").select("*").is("deleted_at",null).order("name"),
      supabase.from("bp_bills").select("*").is("deleted_at",null).order("bill_date"),
      supabase.from("bp_payments").select("*").is("deleted_at",null).order("payment_date"),
      supabase.from("labour_supply_payments").select("*").is("deleted_at",null).order("payment_date",{ascending:false}),
      supabase.from("invoices").select("*").is("deleted_at",null).order("invoice_date",{ascending:false}),
      supabase.from("invoice_line_items").select("*").is("deleted_at",null),
      supabase.from("inventory_items").select("*").is("deleted_at",null).order("name"),
      supabase.from("inventory_transactions").select("*").is("deleted_at",null).order("created_at",{ascending:false}),
      supabase.from("material_requests").select("*").is("deleted_at",null).order("created_at",{ascending:false}),
      supabase.from("material_request_items").select("*").is("deleted_at",null),
      supabase.from("equipment").select("*").is("deleted_at",null).order("name"),
      supabase.from("equipment_schedule").select("*").is("deleted_at",null).order("start_date",{ascending:false}),
      supabase.from("activity_log").select("action, detail, created_at").order("created_at",{ascending:false}).limit(2000),
    ]);
    setProjects(p.data || []);
    setSchedules(s.data || []);
    setLedger(l || []);
    setSubs(sb.data || []);
    setSubMilestones(sm.data || []);
    setCommissions(c.data || []);
    setEmployees(e.data || []);
    setPayroll(py.data || []);
    setAttendance(att || []);
    setSalaryPayments(sp.data || []);
    setActivityLog(actlog?.data || []);
    setBpSuppliers(bps.data || []);
    setBpBills(bpb.data || []);
    setBpPayments(bpp.data || []);
    setLabourSupply(lsp.data || []);
    setInvoices(inv.data || []);
    setInvoiceLineItems(ili.data || []);
    setInventoryItems(invi.data || []);
    setInventoryTxns(invt.data || []);
    setMaterialRequests(mr.data || []);
    setMaterialRequestItems(mri.data || []);
    setEquipmentList(eq.data || []);
    setEquipmentSchedule(eqs.data || []);
    getBankAccounts().then(setBankAccounts);
    setLoading(false);
  };

  const applyPreset = (pr) => {
    const now = new Date();
    if (pr === "This Month") { setStartDate(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`); setEndDate(now.toISOString().split("T")[0]); }
    if (pr === "Last 30 Days") { const d = new Date(now-30*86400000); setStartDate(d.toISOString().split("T")[0]); setEndDate(now.toISOString().split("T")[0]); }
    if (pr === "This Year") { setStartDate(`${now.getFullYear()}-01-01`); setEndDate(now.toISOString().split("T")[0]); }
    if (pr === "Reset") { setStartDate(""); setEndDate(""); }
  };

  const print = () => {
    const content = printRef.current?.innerHTML;
    const w = window.open("", "_blank");
    w.document.write(`
      <html><head><title>Minarva Biz Report — SEVENSEAS Modern Enterprises</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; color: #1e293b; margin: 0; padding: 20px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #0f172a; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
        td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
        tr:nth-child(even) { background: #f8fafc; }
        .header { background: linear-gradient(135deg,#0f172a,#1e3a5f); color: #fff; padding: 20px 24px; margin: -20px -20px 20px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 20px; }
        .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
        .kpi-label { font-size: 9px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
        .kpi-value { font-size: 18px; font-weight: 800; }
        .section { margin-bottom: 24px; }
        .section-title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
        .green { color: #10b981; } .red { color: #ef4444; } .blue { color: #6366f1; }
        .progress-bar { background: #e2e8f0; height: 6px; border-radius: 4px; }
        .progress-fill { background: #6366f1; height: 6px; border-radius: 4px; }
        @media print { body { margin: 0; } }
      </style></head><body>${content}</body></html>
    `);
    w.document.close();
    setTimeout(() => { w.print(); }, 500);
  };

  // Computed values
  const projWithSched = projects.map(p => {
    const scheds = schedules.filter(s => s.project_id === p.id);
    const received = scheds.reduce((t, s) => t + parseFloat(s.received || 0), 0);
    return { ...p, received, scheds };
  });

  const trackingOnlyNames = bankAccounts.filter(a => a.include_in_balance === false).map(a => a.account_name);
  const filtLedger = ledger.filter(e =>
    !trackingOnlyNames.includes(e.payment_mode) &&
    (!startDate || e.entry_date >= startDate) && (!endDate || e.entry_date <= endDate)
  );
  const totalIncome = filtLedger.filter(e => e.type === "Credits (Income)").reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const totalExpense = filtLedger.filter(e => e.type === "Debits (Payouts)").reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const totalContract = projWithSched.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const totalReceived = projWithSched.reduce((s, p) => s + p.received, 0);
  const activeProjects = projects.filter(p => p.status === "Active").length;
  const avgProgress = projects.length > 0 ? Math.round(projWithSched.reduce((s, p) => s + (p.amount > 0 ? (p.received / p.amount) * 100 : 0), 0) / projects.length) : 0;
  const totalSubContract = subs.reduce((s, s2) => s + parseFloat(s2.contract_amount || 0), 0);
  const totalSubPaid = subs.reduce((s, s2) => s + parseFloat(s2.paid || 0), 0);
  const totalCommission = commissions.reduce((s, c) => s + parseFloat(c.computed_payout || 0), 0);
  const paidCommission = commissions.filter(c => c.status === "Settled").reduce((s, c) => s + parseFloat(c.computed_payout || 0), 0);

  const Header = () => (
    <div className="header">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.5 }}>SEVENSEAS MODERN ENTERPRISES</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Barka, Oman | Civil Works & Construction</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Powered by Minarva Biz ERP v1.2</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#60a5fa" }}>{tabs.find(t => t.id === activeTab)?.label} Report</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
            {startDate && endDate ? `Period: ${startDate} to ${endDate}` : `Generated: ${new Date().toLocaleDateString("en-OM")}`}
          </div>
        </div>
      </div>
    </div>
  );

  const KPI = ({ label, value, unit = "OMR", color = "#6366f1" }) => (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{value} <span style={{ fontSize: 11, fontWeight: 400 }}>{unit}</span></div>
    </div>
  );

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#94a3b8" }}>⏳ Loading report data from database...</div>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>Omani Corporate Audit Desk</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>Live reports from Supabase database — all data is real-time</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => {
            let rows = []; let fname = "report";
            const suppName = (id) => (bpSuppliers.find(s=>s.id===id)||{}).name || "—";
            if (activeTab === "vat_report") {
              fname = "VAT_Report";
              const filtered = bpBills.filter(b => (!startDate || b.bill_date >= startDate) && (!endDate || b.bill_date <= endDate)).sort((a,b)=>(a.bill_date||"").localeCompare(b.bill_date||""));
              const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              rows = filtered.map((b,i) => ({ "AT": i+1, "Date": b.bill_date, "Month": months[new Date(b.bill_date).getMonth()]||"", "P/E": (bpSuppliers.find(s=>s.id===b.supplier_id)||{}).category||"Purchase", "Invoice": b.bill_number||"", "Supplier": suppName(b.supplier_id), "Value": parseFloat(b.net_amount||0).toFixed(3), "VAT": parseFloat(b.vat_amount||0).toFixed(3), "Roundoff": (parseFloat(b.total_amount||0)-parseFloat(b.net_amount||0)-parseFloat(b.vat_amount||0)).toFixed(3), "Total": parseFloat(b.total_amount||0).toFixed(3) }));
            } else if (activeTab === "projects") {
              fname = "Contract_Sites_Progress";
              const pws = projects.map(p => { const scheds = schedules.filter(s=>s.project_id===p.id); const received = scheds.reduce((t,s)=>t+parseFloat(s.received||0),0); return {...p, received}; });
              rows = pws.map(p => ({ "Project": p.name, "Customer": p.customer, "Location": p.location, "Area (m²)": p.sqm, "Contract (OMR)": parseFloat(p.amount||0).toFixed(3), "Received (OMR)": p.received.toFixed(3), "Pending (OMR)": (parseFloat(p.amount||0)-p.received).toFixed(3), "Status": p.status }));
            } else if (activeTab === "profit_loss") {
              fname = "Profit_Loss_By_Project";
              rows = projects.map(p => {
                const scheds = schedules.filter(s => s.project_id === p.id);
                const income = scheds.reduce((t,s)=>t+parseFloat(s.received||0),0);
                const linkedExpenses = ledger.filter(e => e.project_id === p.id && e.type === "Debits (Payouts)");
                const directCost = linkedExpenses.reduce((s,e)=>s+parseFloat(e.amount||0),0);
                const matchedSubs = subs.filter(s => s.project === p.name);
                const subCost = matchedSubs.reduce((t,s)=>t+parseFloat(s.paid||0),0);
                const totalCost = directCost + subCost;
                const profit = income - totalCost;
                return { "Project": p.name, "Income (OMR)": income.toFixed(3), "Direct Costs (OMR)": directCost.toFixed(3), "Subcontractor Costs (OMR)": subCost.toFixed(3), "Total Cost (OMR)": totalCost.toFixed(3), "Profit/Loss (OMR)": profit.toFixed(3), "Margin %": income>0?(profit/income*100).toFixed(1):"" };
              });
            } else if (activeTab === "ledger") {
              fname = "Cashbook_Statement";
              rows = ledger.filter(e => (!startDate || e.entry_date >= startDate) && (!endDate || e.entry_date <= endDate)).map(e => ({ "Date": e.entry_date, "Description": e.description, "Payee": e.payee, "Category": e.category, "Site": e.site||"", "Account": e.payment_mode, "Type": e.type==="Credits (Income)"?"Credit":"Debit", "Amount": parseFloat(e.amount||0).toFixed(3) }));
            } else if (activeTab === "accounts") {
              fname = "Account_Statement";
              const accId = document.querySelector("[data-acc-filter]")?.value;
              rows = ledger.filter(e => (!startDate || e.entry_date >= startDate) && (!endDate || e.entry_date <= endDate)).map(e => ({ "Date": e.entry_date, "Description": e.description, "Payee": e.payee, "Category": e.category, "Account": e.payment_mode, "Credit": e.type==="Credits (Income)"?parseFloat(e.amount||0).toFixed(3):"", "Debit": e.type==="Debits (Payouts)"?parseFloat(e.amount||0).toFixed(3):"" }));
            } else if (activeTab === "supplier_statement") {
              fname = "Supplier_Statement";
              rows = bpBills.filter(b => (!startDate || b.bill_date >= startDate) && (!endDate || b.bill_date <= endDate)).map(b => ({ "Date": b.bill_date, "Bill No": b.bill_number||"", "Supplier": suppName(b.supplier_id), "Description": b.description||"", "Net": parseFloat(b.net_amount||0).toFixed(3), "VAT": parseFloat(b.vat_amount||0).toFixed(3), "Total": parseFloat(b.total_amount||0).toFixed(3), "Status": b.status }));
            } else if (activeTab === "payroll") {
              fname = "Payroll_Summary";
              const selPK2 = selectedPayrollEmployee.includes("||") ? selectedPayrollEmployee.split("||")[1] : "";
              const selEmpId2 = selectedPayrollEmployee.includes("||") ? selectedPayrollEmployee.split("||")[0] : selectedPayrollEmployee;
              const exportPeriod = getSalaryPeriods().find(p=>p.start===selPK2) || getSalaryPeriods()[0];
              const empsToExport = selEmpId2 ? employees.filter(e=>e.id===selEmpId2) : employees.filter(e=>e.status==="Active");
              const companyAccIdExp = (bankAccounts.find(a => (a.account_name||"").trim().toLowerCase() === "company account") || {}).id || null;
              rows = empsToExport.map((emp, i) => {
                const r = calcPayrollRow(emp, exportPeriod, attendance, payroll, salaryPayments, companyAccIdExp);
                return { "Sl": i+1, "Employee Name": emp.name, "Advance": r.advancePaid.toFixed(3), "Food": r.foodPaid.toFixed(3), "Present Days": r.totalDays, "Month Payment": r.grossSalary.toFixed(3), "Old Balance": r.openingBal.toFixed(3), "Labour Amount": r.netSalary.toFixed(3), "Paid through company account": r.comp.toFixed(3), "Total Amount": r.totalAmount.toFixed(3), "Paid Amount": r.paidAmt.toFixed(3), "Balance": r.balance.toFixed(3) };
              });
            } else if (activeTab === "subcontractors") {
              fname = "Subcontractor_Balances";
              rows = subs.map(s => { const ms = subMilestones.filter(m=>m.subcontractor_id===s.id); const contracted = ms.reduce((t,m)=>t+parseFloat(m.amount||0),0); const paid = ms.filter(m=>m.status==="Paid").reduce((t,m)=>t+parseFloat(m.amount||0),0); return { "Subcontractor": s.name, "Trade": s.trade||"", "Contract Value": contracted.toFixed(3), "Paid": paid.toFixed(3), "Balance": (contracted-paid).toFixed(3) }; });
            } else if (activeTab === "labour_supply") {
              fname = "Labour_Supply";
              const WORK_HOURS_LS = 10;
              const empMapX = {}; employees.forEach(e => { empMapX[e.id] = e; });
              const supplyX = attendance.filter(a => {
                const wu = (a.worked_under || "").trim();
                if (!wu) return false;
                const d = a.att_date || a.work_date || "";
                if (startDate && d < startDate) return false;
                if (endDate && d > endDate) return false;
                if (labourSubFilter && wu !== labourSubFilter) return false;
                return true;
              });
              const aggX = {};
              supplyX.forEach(a => {
                const sub = a.worked_under.trim();
                const emp = empMapX[a.employee_id];
                if (!emp) return;
                const key = sub + "||" + a.employee_id;
                if (!aggX[key]) aggX[key] = { sub, name: emp.name, rate: parseFloat(emp.daily_rate||0), hours: 0, dates: [] };
                aggX[key].hours += parseFloat(a.hours_worked||0);
                aggX[key].dates.push(a.att_date || a.work_date || "");
              });
              rows = Object.values(aggX).map(x => {
                const days = parseFloat((x.hours / WORK_HOURS_LS).toFixed(2));
                return { "Subcontractor": x.sub, "Employee": x.name, "Daily Rate (OMR)": x.rate.toFixed(3), "Supply Days": days, "Dates": x.dates.sort().join(", "), "Amount to Collect (OMR)": (days * x.rate).toFixed(3) };
              }).sort((a,b) => a.Subcontractor.localeCompare(b.Subcontractor) || a.Employee.localeCompare(b.Employee));
            } else if (activeTab === "invoices") {
              fname = "Invoices_Quotations";
              rows = invoices.filter(i => (!startDate || i.invoice_date >= startDate) && (!endDate || i.invoice_date <= endDate)).map(i => ({ "Date": i.invoice_date, "Number": i.invoice_number, "Type": i.type, "Client": i.client_name||i.customer, "Project": i.project, "Subtotal": parseFloat(i.subtotal||0).toFixed(3), "VAT": parseFloat(i.vat_amount||0).toFixed(3), "Grand Total": parseFloat(i.grand_total||i.amount||0).toFixed(3), "Status": i.status }));
            } else if (activeTab === "inventory") {
              fname = "Inventory_Stock";
              rows = inventoryItems.map(it => ({ "Item": it.name, "Category": it.category||"", "Unit": it.unit||"", "Current Stock": parseFloat(it.current_stock||0), "Min Stock": parseFloat(it.min_stock||0), "Cost/Unit": parseFloat(it.cost_per_unit||0).toFixed(3), "Stock Value": (parseFloat(it.current_stock||0)*parseFloat(it.cost_per_unit||0)).toFixed(3), "Last Delivery": it.last_delivery_date||"" }));
            } else if (activeTab === "material_requests") {
              fname = "Material_Requests";
              rows = materialRequests.filter(r => (!startDate || (r.created_at||"").split("T")[0] >= startDate) && (!endDate || (r.created_at||"").split("T")[0] <= endDate)).map(r => ({ "Request No": r.request_number, "Date": (r.created_at||"").split("T")[0], "Project": r.project, "Site": r.site, "Requested By": r.requested_by, "Urgency": r.urgency, "Status": r.status, "Total Value": parseFloat(r.total_value||0).toFixed(3), "Fulfilled Date": r.fulfilled_date||"" }));
            } else if (activeTab === "equipment") {
              fname = "Equipment_Register";
              rows = equipmentList.map(eq => ({ "Equipment": eq.name, "Category": eq.category||"", "Status": eq.status, "Current Site": eq.current_site||"", "Quantity": eq.quantity||"", "Notes": eq.notes||"" }));
            } else if (activeTab === "commissions") {
              fname = "Commission_Ledger";
              rows = commissions.filter(c => (!startDate || c.commission_date >= startDate) && (!endDate || c.commission_date <= endDate)).map(c => ({ "Date": c.commission_date, "Agent": c.agent_name||"", "Project": c.project_name||"", "Amount": parseFloat(c.amount||0).toFixed(3), "Type": c.type||"", "Notes": c.notes||"" }));
            } else if (activeTab === "payments") {
              fname = "Payment_Collections";
              rows = ledger.filter(e => e.type==="Credits (Income)" && (!startDate || e.entry_date >= startDate) && (!endDate || e.entry_date <= endDate)).map(e => ({ "Date": e.entry_date, "Description": e.description, "Payee": e.payee, "Category": e.category, "Account": e.payment_mode, "Amount": parseFloat(e.amount||0).toFixed(3) }));
            }
            if (rows.length === 0) { alert("No data to export for the selected period/tab."); return; }
            downloadExcel(rows, fname + "_" + new Date().toISOString().split("T")[0]);
          }} style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>📥 Excel</button>
          <button onClick={loadAllData} style={{ background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, cursor: "pointer" }}>🔄 Refresh</button>
          <button onClick={print} style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🖨 Print / Save PDF</button>
        </div>
      </div>

      {/* Period Selector */}
      <div style={{ background: "#fff", borderRadius: 12, padding: 18, marginBottom: 16, border: "1px solid #e2e8f0" }}>
        <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13, marginBottom: 12 }}>📅 REPORT PERIOD</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>START DATE</div>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12 }} /></div>
          <div><div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>END DATE</div>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12 }} /></div>
          {["This Month","Last 30 Days","This Year","Reset"].map(p => (
            <button key={p} onClick={() => applyPreset(p)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: p === "Reset" ? "#0f172a" : "#f1f5f9", color: p === "Reset" ? "#fff" : "#64748b" }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Tab Selector */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", padding: "8px 8px 0", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "10px 16px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: "transparent", color: activeTab === t.id ? "#6366f1" : "#64748b", borderBottom: activeTab === t.id ? "2px solid #6366f1" : "2px solid transparent", marginBottom: -1, whiteSpace: "nowrap" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Print area */}
        <div ref={printRef} style={{ padding: 24 }}>
          <Header />

          {/* EXECUTIVE OVERVIEW */}
          {activeTab === "accounts" && (
            <div>
              <div style={{ display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center" }}>
                <div style={{ fontWeight:700,fontSize:15,color:"#0f172a" }}>🏦 Account Statement</div>
                <div style={{ display:"flex",gap:8 }}>
                  {bankAccounts.map(a=>(
                    <button key={a.id} onClick={async()=>{
                      setSelectedBankAccount(a.id);
                      const {supabase:sb}=await import("../lib/supabase");
                      const {data}=await sb.from("ledger").select("*").eq("bank_account_id",a.id).is("deleted_at",null).order("entry_date",{ascending:false});
                      setBankLedger(data||[]);
                    }} style={{ padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,
                      background:selectedBankAccount===a.id?"#0f172a":"#f1f5f9",color:selectedBankAccount===a.id?"#fff":"#64748b" }}>
                      {a.account_name}
                    </button>
                  ))}
                </div>
              </div>
              {(()=>{
                const creds=bankLedger.filter(e=>e.type==="Credits (Income)").reduce((s,e)=>s+parseFloat(e.amount||0),0);
                const debs=bankLedger.filter(e=>e.type==="Debits (Payouts)").reduce((s,e)=>s+parseFloat(e.amount||0),0);
                const acc=bankAccounts.find(a=>a.id===selectedBankAccount);
                const opening=parseFloat(acc?.opening_balance||0);
                const balance=opening+creds-debs;
                return (
                  <div>
                    <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16 }}>
                      {[["Opening Balance",`OMR ${opening.toFixed(3)}`,"#6366f1"],["Total Credits",`OMR ${creds.toFixed(3)}`,"#10b981"],["Total Debits",`OMR ${debs.toFixed(3)}`,"#ef4444"],["Current Balance",`OMR ${balance.toFixed(3)}`,balance>=0?"#0f172a":"#ef4444"]].map(([l,v,c])=>(
                        <div key={l} style={{ background:"#fff",borderRadius:10,padding:"14px 16px",border:"1px solid #e2e8f0" }}>
                          <div style={{ fontSize:10,color:"#64748b",fontWeight:600 }}>{l}</div>
                          <div style={{ fontSize:16,fontWeight:800,color:c,marginTop:4 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13,background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden" }}>
                      <thead><tr style={{ background:"#f8fafc" }}>
                        {["Date","Description","Payee","Category","Type","Amount (OMR)"].map(h=><th key={h} style={{ padding:"10px 14px",textAlign:"left",color:"#64748b",fontWeight:600,fontSize:11 }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {bankLedger.length===0
                          ?<tr><td colSpan={6} style={{ padding:40,textAlign:"center",color:"#94a3b8" }}>No transactions for this account yet.</td></tr>
                          :bankLedger.map((e,i)=>(
                            <tr key={e.id} style={{ borderTop:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc" }}>
                              <td style={{ padding:"10px 14px",color:"#64748b" }}>{e.entry_date}</td>
                              <td style={{ padding:"10px 14px",color:"#1e293b",fontWeight:500 }}>{e.description}</td>
                              <td style={{ padding:"10px 14px",color:"#64748b" }}>{e.payee||"—"}</td>
                              <td style={{ padding:"10px 14px" }}><span style={{ background:"#f1f5f9",color:"#475569",borderRadius:20,padding:"2px 8px",fontSize:11 }}>{e.category}</span></td>
                              <td style={{ padding:"10px 14px" }}><span style={{ background:e.type==="Credits (Income)"?"#ecfdf5":"#fef2f2",color:e.type==="Credits (Income)"?"#10b981":"#ef4444",borderRadius:20,padding:"2px 8px",fontSize:11,fontWeight:600 }}>{e.type==="Credits (Income)"?"Credit":"Debit"}</span></td>
                              <td style={{ padding:"10px 14px",fontWeight:700,color:e.type==="Credits (Income)"?"#10b981":"#ef4444" }}>{e.type==="Credits (Income)"?"+":"-"}OMR {parseFloat(e.amount||0).toFixed(3)}</td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
          {activeTab === "supplier_statement" && (
            <div>
              <div style={{ display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center" }}>
                <div style={{ fontWeight:700,fontSize:15,color:"#0f172a" }}>🏪 Supplier Statement</div>
                <select value={selectedSupplier} onChange={e=>{setSelectedSupplier(e.target.value);setSuppSubTab("all");}}
                  style={{ border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 12px",fontSize:13,minWidth:220,outline:"none" }}>
                  <option value="">— Select a supplier —</option>
                  {bpSuppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {selectedSupplier && (
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {[["all","📋 All"],["vat","🧾 VAT Bills"],["normal","📄 Normal Bills"],["rent","🏠 Rent"],["utility","💡 Utility"],["vat_report","📊 VAT Report"]].map(([k,l])=>(
                      <button key={k} onClick={()=>setSuppSubTab(k)} style={{padding:"5px 12px",borderRadius:16,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:suppSubTab===k?"#6366f1":"#f1f5f9",color:suppSubTab===k?"#fff":"#64748b"}}>{l}</button>
                    ))}
                  </div>
                )}
              </div>
              {!selectedSupplier ? (
                <div style={{ padding:40,textAlign:"center",color:"#94a3b8",background:"#f8fafc",borderRadius:12 }}>
                  Select a supplier above to view their complete statement (bills + payments + balance).
                </div>
              ) : (()=>{
                const supp = bpSuppliers.find(s=>s.id===selectedSupplier);
                const myBills = bpBills.filter(b=>b.supplier_id===selectedSupplier);
                const myPays = bpPayments.filter(p=>p.supplier_id===selectedSupplier);
                const opening = parseFloat(supp?.opening_balance||0);
                const billsTotal = myBills.reduce((s,b)=>s+parseFloat(b.total_amount||0),0);
                const paidTotal = myPays.reduce((s,p)=>s+parseFloat(p.amount||0),0);
                const balance = opening + billsTotal - paidTotal;
                // Filter bills by sub-tab
                const vatBills = myBills.filter(b=>parseFloat(b.vat_amount||0)>0.001);
                const normalBills = myBills.filter(b=>parseFloat(b.vat_amount||0)<=0.001 && (supp?.category==="Material Supplier"||supp?.category==="Subcontractor"||supp?.category==="Other"));
                const rentBills = myBills.filter(b=>supp?.category==="Rent / Hire" || (b.description||"").toLowerCase().includes("rent"));
                const utilityBills = myBills.filter(b=>supp?.category==="Utility");
                const displayBills = suppSubTab==="vat" ? vatBills : suppSubTab==="normal" ? normalBills : suppSubTab==="rent" ? rentBills : suppSubTab==="utility" ? utilityBills : myBills;
                // Transaction list
                const txns = [];
                if (opening>0) txns.push({ date: supp?.created_at?.split("T")[0]||"—", desc:"Opening balance", type:"bill", amount:opening, vat:0, net:opening });
                displayBills.forEach(b=>txns.push({ date:b.bill_date, desc:`Bill: ${b.description||b.bill_number||"—"}${b.site?" ("+b.site+")":""}`, type:"bill", amount:parseFloat(b.total_amount||0), vat:parseFloat(b.vat_amount||0), net:parseFloat(b.net_amount||0), site:b.site, billNo:b.bill_number }));
                if (suppSubTab==="all"||suppSubTab==="vat_report") myPays.forEach(p=>txns.push({ date:p.payment_date, desc:`Payment${p.notes?": "+p.notes:""}`, type:"payment", amount:parseFloat(p.amount||0), vat:0, net:0 }));
                txns.sort((a,b)=>(a.date<b.date?-1:1));
                let running=0;
                const totalVat = displayBills.reduce((s,b)=>s+parseFloat(b.vat_amount||0),0);
                const totalNet = displayBills.reduce((s,b)=>s+parseFloat(b.net_amount||0),0);

                // VAT Report special view
                if (suppSubTab==="vat_report") {
                  return (
                    <div>
                      <div style={{fontWeight:700,fontSize:14,color:"#0f172a",marginBottom:12}}>📊 VAT Filing Report — {supp?.name}</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                        {[["Total Bills",vatBills.length+" bills","#6366f1"],["Net Amount",`OMR ${totalNet.toFixed(3)}`,"#0ea5e9"],["VAT Amount (5%)",`OMR ${totalVat.toFixed(3)}`,"#f59e0b"],["Total (incl VAT)",`OMR ${(totalNet+totalVat).toFixed(3)}`,"#ef4444"]].map(([l,v,c])=>(
                          <div key={l} style={{background:"#fff",borderRadius:10,padding:"14px 16px",border:"1px solid #e2e8f0"}}>
                            <div style={{fontSize:10,color:"#64748b",fontWeight:600}}>{l}</div>
                            <div style={{fontSize:16,fontWeight:800,color:c,marginTop:4}}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {supp?.cr_number && <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>CR / Tax No: <strong>{supp.cr_number}</strong></div>}
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
                        <thead><tr style={{background:"#f59e0b20"}}>
                          {["#","Date","Bill No","Description","Site","Net Amount","VAT (5%)","Total Amount"].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",color:"#92400e",fontWeight:600,fontSize:11}}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {vatBills.length===0
                            ?<tr><td colSpan={8} style={{padding:40,textAlign:"center",color:"#94a3b8"}}>No VAT bills found for this supplier.</td></tr>
                            :vatBills.map((b,i)=>(
                              <tr key={b.id} style={{borderTop:"1px solid #f1f5f9",background:i%2===0?"#fff":"#fffbeb"}}>
                                <td style={{padding:"8px 14px",color:"#94a3b8"}}>{i+1}</td>
                                <td style={{padding:"8px 14px",color:"#64748b"}}>{b.bill_date}</td>
                                <td style={{padding:"8px 14px",color:"#1e293b",fontWeight:600}}>{b.bill_number||"—"}</td>
                                <td style={{padding:"8px 14px",color:"#475569"}}>{b.description||"—"}</td>
                                <td style={{padding:"8px 14px",color:"#64748b"}}>{b.site||"—"}</td>
                                <td style={{padding:"8px 14px",color:"#0ea5e9",fontWeight:600}}>{parseFloat(b.net_amount||0).toFixed(3)}</td>
                                <td style={{padding:"8px 14px",color:"#f59e0b",fontWeight:700}}>{parseFloat(b.vat_amount||0).toFixed(3)}</td>
                                <td style={{padding:"8px 14px",color:"#ef4444",fontWeight:700}}>{parseFloat(b.total_amount||0).toFixed(3)}</td>
                              </tr>
                            ))
                          }
                          {vatBills.length>0 && (
                            <tr style={{borderTop:"2px solid #f59e0b",background:"#fffbeb",fontWeight:800}}>
                              <td colSpan={5} style={{padding:"10px 14px"}}>TOTAL VAT ({vatBills.length} bills)</td>
                              <td style={{padding:"10px 14px",color:"#0ea5e9"}}>{totalNet.toFixed(3)}</td>
                              <td style={{padding:"10px 14px",color:"#f59e0b"}}>{totalVat.toFixed(3)}</td>
                              <td style={{padding:"10px 14px",color:"#ef4444"}}>{(totalNet+totalVat).toFixed(3)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                }

                return (
                  <div>
                    <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16 }}>
                      {[["Opening Balance",`OMR ${opening.toFixed(3)}`,"#6366f1"],["Total Bills",`OMR ${billsTotal.toFixed(3)}`,"#0ea5e9"],["Total Paid",`OMR ${paidTotal.toFixed(3)}`,"#10b981"],["Balance Due",`OMR ${balance.toFixed(3)}`,balance>0.001?"#ef4444":"#10b981"]].map(([l,v,c])=>(
                        <div key={l} style={{ background:"#fff",borderRadius:10,padding:"14px 16px",border:"1px solid #e2e8f0" }}>
                          <div style={{ fontSize:10,color:"#64748b",fontWeight:600 }}>{l}</div>
                          <div style={{ fontSize:16,fontWeight:800,color:c,marginTop:4 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize:12,color:"#64748b",marginBottom:8 }}>
                      {supp?.category}{supp?.phone?" · "+supp.phone:""}{supp?.cr_number?" · CR "+supp.cr_number:""}
                    </div>
                    {totalVat>0.001 && <div style={{fontSize:12,color:"#f59e0b",background:"#fffbeb",borderRadius:8,padding:"6px 12px",marginBottom:12}}>🧾 VAT in this view: OMR {totalVat.toFixed(3)} (Net: {totalNet.toFixed(3)})</div>}
                    <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13,background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden" }}>
                      <thead><tr style={{ background:"#f8fafc" }}>
                        {["Date","Description","Site","Net","VAT","Bill (+)","Payment (-)","Running Balance"].map(h=><th key={h} style={{ padding:"10px 14px",textAlign:"left",color:"#64748b",fontWeight:600,fontSize:11 }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {txns.length===0
                          ?<tr><td colSpan={8} style={{ padding:40,textAlign:"center",color:"#94a3b8" }}>No transactions in this category.</td></tr>
                          :txns.map((t,i)=>{
                            running += t.type==="bill"?t.amount:-t.amount;
                            return (
                              <tr key={i} style={{ borderTop:"1px solid #f1f5f9",background:i%2===0?"#fff":"#f8fafc" }}>
                                <td style={{ padding:"10px 14px",color:"#64748b" }}>{t.date}</td>
                                <td style={{ padding:"10px 14px",color:"#1e293b",fontWeight:500 }}>{t.desc}</td>
                                <td style={{ padding:"10px 14px",color:"#64748b",fontSize:11 }}>{t.site||"—"}</td>
                                <td style={{ padding:"10px 14px",color:"#0ea5e9",fontSize:12 }}>{t.net>0?t.net.toFixed(3):"—"}</td>
                                <td style={{ padding:"10px 14px",color:"#f59e0b",fontSize:12 }}>{t.vat>0?t.vat.toFixed(3):"—"}</td>
                                <td style={{ padding:"10px 14px",color:"#0ea5e9",fontWeight:600 }}>{t.type==="bill"?t.amount.toFixed(3):"—"}</td>
                                <td style={{ padding:"10px 14px",color:"#10b981",fontWeight:600 }}>{t.type==="payment"?t.amount.toFixed(3):"—"}</td>
                                <td style={{ padding:"10px 14px",fontWeight:700,color:running>0.001?"#ef4444":"#10b981" }}>{running.toFixed(3)}</td>
                              </tr>
                            );
                          })
                        }
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
          {activeTab === "vat_report" && (() => {
            const filteredBills = bpBills.filter(b => {
              const d = b.bill_date;
              return (!startDate || d >= startDate) && (!endDate || d <= endDate);
            }).sort((a, b) => (a.bill_date || "").localeCompare(b.bill_date || ""));
            const getSupp = (id) => bpSuppliers.find(s => s.id === id);
            const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const getMonth = (d) => { try { return months[new Date(d).getMonth()]; } catch { return ""; } };
            const totNet = filteredBills.reduce((s, b) => s + parseFloat(b.net_amount || 0), 0);
            const totVat = filteredBills.reduce((s, b) => s + parseFloat(b.vat_amount || 0), 0);
            const totAll = filteredBills.reduce((s, b) => s + parseFloat(b.total_amount || 0), 0);
            const totRound = filteredBills.reduce((s, b) => { const r = parseFloat(b.total_amount||0) - parseFloat(b.net_amount||0) - parseFloat(b.vat_amount||0); return s + r; }, 0);
            return (
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 4 }}>🧾 SEVEN SEAS MODERN ENTERPRISES</div>
                <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Purchase Bill Details — VAT Report {startDate && endDate ? `(${startDate} to ${endDate})` : "(All Time)"}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
                  <KPI label="Total Bills" value={filteredBills.length} color="#6366f1" />
                  <KPI label="Net Value (OMR)" value={totNet.toFixed(3)} color="#1e293b" />
                  <KPI label="Total VAT (OMR)" value={totVat.toFixed(3)} color="#f59e0b" />
                  <KPI label="Grand Total (OMR)" value={totAll.toFixed(3)} color="#10b981" />
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#fff" }}>
                    <thead>
                      <tr style={{ background: "#fef9c3", borderBottom: "2px solid #eab308" }}>
                        {["AT", "Date", "Month", "P/E", "Invoice", "Supplier", "Value", "VAT", "Roundoff", "Total"].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: h === "AT" ? "center" : "left", color: "#1e293b", fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBills.map((b, i) => {
                        const supp = getSupp(b.supplier_id);
                        const net = parseFloat(b.net_amount || 0);
                        const vat = parseFloat(b.vat_amount || 0);
                        const total = parseFloat(b.total_amount || 0);
                        const roundoff = parseFloat((total - net - vat).toFixed(3));
                        return (
                          <tr key={b.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                            <td style={{ padding: "7px 10px", textAlign: "center", color: "#64748b", fontWeight: 600 }}>{i + 1}</td>
                            <td style={{ padding: "7px 10px", color: "#1e293b", whiteSpace: "nowrap" }}>{b.bill_date}</td>
                            <td style={{ padding: "7px 10px", color: "#6366f1", fontWeight: 600 }}>{getMonth(b.bill_date)}</td>
                            <td style={{ padding: "7px 10px" }}><span style={{ background: "#f1f5f9", color: "#475569", borderRadius: 10, padding: "1px 8px", fontSize: 10 }}>{supp?.category || "Purchase"}</span></td>
                            <td style={{ padding: "7px 10px", color: "#1e293b", fontWeight: 600 }}>{b.bill_number || "—"}</td>
                            <td style={{ padding: "7px 10px", color: "#1e293b", fontWeight: 600 }}>{supp?.name || "—"}</td>
                            <td style={{ padding: "7px 10px", color: "#1e293b", textAlign: "right" }}>{net.toFixed(3)}</td>
                            <td style={{ padding: "7px 10px", color: "#f59e0b", fontWeight: 700, textAlign: "right" }}>{vat > 0 ? vat.toFixed(3) : "—"}</td>
                            <td style={{ padding: "7px 10px", color: "#94a3b8", textAlign: "right" }}>{Math.abs(roundoff) > 0.001 ? roundoff.toFixed(3) : "—"}</td>
                            <td style={{ padding: "7px 10px", color: "#10b981", fontWeight: 700, textAlign: "right" }}>{total.toFixed(3)}</td>
                          </tr>
                        );
                      })}
                      {filteredBills.length === 0 && (
                        <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>No bills found for the selected period.</td></tr>
                      )}
                    </tbody>
                    {filteredBills.length > 0 && (
                      <tfoot>
                        <tr style={{ background: "#fef9c3", borderTop: "2px solid #eab308", fontWeight: 800 }}>
                          <td colSpan={6} style={{ padding: "10px", textAlign: "right", fontSize: 12 }}>TOTAL</td>
                          <td style={{ padding: "10px", textAlign: "right", fontSize: 13 }}>{totNet.toFixed(3)}</td>
                          <td style={{ padding: "10px", textAlign: "right", color: "#f59e0b", fontSize: 13 }}>{totVat.toFixed(3)}</td>
                          <td style={{ padding: "10px", textAlign: "right", color: "#94a3b8", fontSize: 13 }}>{Math.abs(totRound) > 0.001 ? totRound.toFixed(3) : "—"}</td>
                          <td style={{ padding: "10px", textAlign: "right", color: "#10b981", fontSize: 13 }}>{totAll.toFixed(3)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            );
          })()}
          {activeTab === "executive" && (
            <div>
              <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
                <KPI label="Total Contract Value" value={totalContract.toFixed(3)} color="#6366f1" />
                <KPI label="Total Received" value={totalReceived.toFixed(3)} color="#10b981" />
                <KPI label="Total Pending" value={(totalContract-totalReceived).toFixed(3)} color="#f59e0b" />
                <KPI label="Overall Progress" value={`${avgProgress}%`} unit="" color="#0ea5e9" />
                <KPI label="Cash Income (Period)" value={totalIncome.toFixed(3)} color="#10b981" />
                <KPI label="Cash Expenses (Period)" value={totalExpense.toFixed(3)} color="#ef4444" />
                <KPI label="Net Cash Balance" value={(totalIncome-totalExpense).toFixed(3)} color="#6366f1" />
                <KPI label="Active Projects" value={activeProjects} unit="sites" color="#f59e0b" />
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12, borderBottom: "2px solid #e2e8f0", paddingBottom: 6 }}>Operational Summary</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "#0f172a", color: "#fff" }}>
                    <th style={{ padding: "10px 14px", textAlign: "left" }}>Category</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Amount (OMR)</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ["Total Contract Billing Sales", totalContract.toFixed(3), "#6366f1"],
                      ["Total Payment Receipts Collected", totalReceived.toFixed(3), "#10b981"],
                      ["Outstanding Client Billing Pending", (totalContract-totalReceived).toFixed(3), "#f59e0b"],
                      ["Subcontractor Total Commitments", totalSubContract.toFixed(3), "#8b5cf6"],
                      ["Subcontractor Payments Made", totalSubPaid.toFixed(3), "#10b981"],
                      ["Subcontractor Balance Pending", (totalSubContract-totalSubPaid).toFixed(3), "#ef4444"],
                      ["Total Commission Obligations", totalCommission.toFixed(3), "#8b5cf6"],
                      ["Commissions Paid", paidCommission.toFixed(3), "#10b981"],
                      ["Cash Ledger Net Balance", (totalIncome-totalExpense).toFixed(3), (totalIncome-totalExpense)>=0?"#10b981":"#ef4444"],
                    ].map(([l, v, c]) => (
                      <tr key={l} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 14px", color: "#1e293b" }}>{l}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: c }}>{v} OMR</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PROJECTS */}
          {activeTab === "projects" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
                <KPI label="Total Projects" value={projects.length} unit="sites" color="#6366f1" />
                <KPI label="Active" value={projects.filter(p=>p.status==="Active").length} unit="sites" color="#10b981" />
                <KPI label="Completed" value={projects.filter(p=>p.status==="Completed").length} unit="sites" color="#64748b" />
                <KPI label="Total Contract" value={totalContract.toFixed(3)} color="#0ea5e9" />
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ background: "#0f172a", color: "#fff" }}>
                  {["Project","Customer","Location","Area (m²)","Contract (OMR)","Received (OMR)","Pending (OMR)","Progress","Status"].map(h=>
                    <th key={h} style={{ padding: "9px 10px", textAlign: "left", fontSize: 10 }}>{h}</th>
                  )}
                </tr></thead>
                <tbody>
                  {projWithSched.map((p, i) => {
                    const pct = p.amount > 0 ? Math.round((p.received/p.amount)*100) : 0;
                    return (
                      <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9", background: i%2===0?"#fff":"#f8fafc" }}>
                        <td style={{ padding: "9px 10px", fontWeight: 600, color: "#1e293b" }}>{p.name}</td>
                        <td style={{ padding: "9px 10px", color: "#475569" }}>{p.customer}</td>
                        <td style={{ padding: "9px 10px", color: "#64748b" }}>{p.location}</td>
                        <td style={{ padding: "9px 10px", color: "#64748b" }}>{p.sqm}</td>
                        <td style={{ padding: "9px 10px", color: "#1e293b" }}>{parseFloat(p.amount).toFixed(3)}</td>
                        <td style={{ padding: "9px 10px", color: "#10b981", fontWeight: 700 }}>{p.received.toFixed(3)}</td>
                        <td style={{ padding: "9px 10px", color: "#f59e0b", fontWeight: 700 }}>{(p.amount-p.received).toFixed(3)}</td>
                        <td style={{ padding: "9px 10px", minWidth: 100 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ flex: 1, background: "#e2e8f0", borderRadius: 4, height: 5 }}>
                              <div style={{ width: `${Math.min(pct,100)}%`, background: "#6366f1", borderRadius: 4, height: 5 }} />
                            </div>
                            <span style={{ fontSize: 10 }}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding: "9px 10px" }}>
                          <span style={{ background: p.status==="Active"?"#ecfdf5":p.status==="Completed"?"#f1f5f9":"#fffbeb", color: p.status==="Active"?"#10b981":p.status==="Completed"?"#64748b":"#f59e0b", borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{p.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc", fontWeight: 700 }}>
                    <td colSpan={4} style={{ padding: "10px" }}>TOTAL ({projects.length} projects)</td>
                    <td style={{ padding: "10px", color: "#6366f1" }}>{totalContract.toFixed(3)}</td>
                    <td style={{ padding: "10px", color: "#10b981" }}>{totalReceived.toFixed(3)}</td>
                    <td style={{ padding: "10px", color: "#f59e0b" }}>{(totalContract-totalReceived).toFixed(3)}</td>
                    <td colSpan={2} style={{ padding: "10px", color: "#6366f1" }}>{avgProgress}% avg</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* PROFIT & LOSS BY PROJECT */}
          {activeTab === "profit_loss" && (() => {
            const rows = projects.map(p => {
              const scheds = schedules.filter(s => s.project_id === p.id);
              const income = scheds.reduce((t,s)=>t+parseFloat(s.received||0),0);

              // Direct expenses: ledger entries explicitly linked to this project (reliable)
              const linkedExpenses = ledger.filter(e => e.project_id === p.id && e.type === "Debits (Payouts)");
              const directCost = linkedExpenses.reduce((s,e)=>s+parseFloat(e.amount||0),0);

              // Subcontractor cost: best-effort match via subcontractors.project === projects.name
              const matchedSubs = subs.filter(s => s.project === p.name);
              const subCost = matchedSubs.reduce((t,s)=>t+parseFloat(s.paid||0),0);

              const totalCost = directCost + subCost;
              const profit = income - totalCost;
              const margin = income > 0 ? (profit/income*100) : 0;
              return { ...p, income, directCost, subCost, totalCost, profit, margin, linkedCount: linkedExpenses.length, subCount: matchedSubs.length };
            });
            const totalIncome2 = rows.reduce((s,r)=>s+r.income,0);
            const totalCost2 = rows.reduce((s,r)=>s+r.totalCost,0);
            const totalProfit2 = totalIncome2 - totalCost2;
            const unlinkedExpenseCount = ledger.filter(e=>e.type==="Debits (Payouts)" && !e.project_id).length;

            return (
              <div>
                <div style={{ background:"#eef2ff", border:"1px solid #c7d2fe", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#4338ca" }}>
                  <strong>Income</strong> = payments received against project milestones. <strong>Cost</strong> = cashbook expenses tagged to this project (via the Project dropdown in Record Payment / Cashbook Ledger) + subcontractor payments matched to this project name.
                  {unlinkedExpenseCount > 0 && <> There {unlinkedExpenseCount===1?"is":"are"} <strong>{unlinkedExpenseCount} expense{unlinkedExpenseCount===1?"":"s"}</strong> not tagged to any project — these are excluded from the figures below. Tag new expenses to a project for accurate Profit/Loss going forward.</>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                  <KPI label="Total Income (all projects)" value={totalIncome2.toFixed(3)} color="#10b981" />
                  <KPI label="Total Cost (all projects)" value={totalCost2.toFixed(3)} color="#ef4444" />
                  <KPI label="Net Profit (all projects)" value={totalProfit2.toFixed(3)} color={totalProfit2>=0?"#6366f1":"#ef4444"} />
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ background: "#0f172a", color: "#fff" }}>
                    {["Project","Income (OMR)","Direct Costs (OMR)","Subcontractor Costs (OMR)","Total Cost (OMR)","Profit/Loss (OMR)","Margin"].map(h=>
                      <th key={h} style={{ padding: "9px 10px", textAlign: "left", fontSize: 10 }}>{h}</th>
                    )}
                  </tr></thead>
                  <tbody>
                    {rows.map((r,i) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9", background: i%2===0?"#fff":"#f8fafc" }}>
                        <td style={{ padding: "9px 10px", fontWeight: 600, color: "#1e293b" }}>{r.name}</td>
                        <td style={{ padding: "9px 10px", color: "#10b981", fontWeight: 700 }}>{r.income.toFixed(3)}</td>
                        <td style={{ padding: "9px 10px", color: "#64748b" }}>{r.directCost.toFixed(3)} {r.linkedCount>0 && <span style={{fontSize:9,color:"#94a3b8"}}>({r.linkedCount} entries)</span>}</td>
                        <td style={{ padding: "9px 10px", color: "#64748b" }}>{r.subCost.toFixed(3)} {r.subCount>0 && <span style={{fontSize:9,color:"#94a3b8"}}>({r.subCount} contract{r.subCount===1?"":"s"})</span>}</td>
                        <td style={{ padding: "9px 10px", color: "#ef4444", fontWeight: 700 }}>{r.totalCost.toFixed(3)}</td>
                        <td style={{ padding: "9px 10px", color: r.profit>=0?"#10b981":"#ef4444", fontWeight: 800 }}>{r.profit.toFixed(3)}</td>
                        <td style={{ padding: "9px 10px", color: r.margin>=0?"#10b981":"#ef4444" }}>{r.income>0?`${r.margin.toFixed(1)}%`:"—"}</td>
                      </tr>
                    ))}
                    {rows.length===0 && <tr><td colSpan={7} style={{ padding:30, textAlign:"center", color:"#94a3b8" }}>No projects found.</td></tr>}
                    <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc", fontWeight: 700 }}>
                      <td style={{ padding: "10px" }}>TOTAL ({rows.length} projects)</td>
                      <td style={{ padding: "10px", color: "#10b981" }}>{totalIncome2.toFixed(3)}</td>
                      <td colSpan={2} style={{ padding: "10px" }}></td>
                      <td style={{ padding: "10px", color: "#ef4444" }}>{totalCost2.toFixed(3)}</td>
                      <td style={{ padding: "10px", color: totalProfit2>=0?"#10b981":"#ef4444" }}>{totalProfit2.toFixed(3)}</td>
                      <td style={{ padding: "10px", color: totalProfit2>=0?"#10b981":"#ef4444" }}>{totalIncome2>0?`${(totalProfit2/totalIncome2*100).toFixed(1)}%`:"—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* CASHBOOK */}
          {activeTab === "ledger" && (()=>{
            const cbEntries = filtLedger.filter(e => cbFilter==="All" || (cbFilter==="Credit" && e.type==="Credits (Income)") || (cbFilter==="Debit" && e.type==="Debits (Payouts)")).slice().reverse();
            const cbCredits = cbEntries.filter(e=>e.type==="Credits (Income)").reduce((s,e)=>s+parseFloat(e.amount||0),0);
            const cbDebits  = cbEntries.filter(e=>e.type==="Debits (Payouts)").reduce((s,e)=>s+parseFloat(e.amount||0),0);
            let running = 0;
            return (
            <div>
              <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
                {["All","Credit","Debit"].map(f=>(
                  <button key={f} onClick={()=>setCbFilter(f)} style={{padding:"6px 16px", borderRadius:20, border:"none", cursor:"pointer", fontSize:12, fontWeight:600, background:cbFilter===f?"#6366f1":"#f1f5f9", color:cbFilter===f?"#fff":"#64748b"}}>{f==="Credit"?"💚 Credits Only":f==="Debit"?"🔴 Debits Only":"All Entries"}</button>
                ))}
                <span style={{marginLeft:"auto", fontSize:12, color:"#64748b"}}>{cbEntries.length} entries</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                <KPI label="Credits (Income)" value={cbCredits.toFixed(3)} color="#10b981" />
                <KPI label="Debits (Expenses)" value={cbDebits.toFixed(3)} color="#ef4444" />
                <KPI label="Net Balance" value={(cbCredits-cbDebits).toFixed(3)} color="#6366f1" />
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr style={{ background: "#0f172a", color: "#fff" }}>
                  {["Date","Payee","Description","Category","Site","Mode","Credit (OMR)","Debit (OMR)","Balance"].map(h=>
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10 }}>{h}</th>
                  )}
                </tr></thead>
                <tbody>
                  {cbEntries.map((e, i) => {
                    const isCredit = e.type==="Credits (Income)";
                    running += isCredit ? parseFloat(e.amount||0) : -parseFloat(e.amount||0);
                    return (
                    <tr key={e.id} style={{ borderBottom: "1px solid #f1f5f9", background: i%2===0?"#fff":"#f8fafc" }}>
                      <td style={{ padding: "7px 10px", color: "#64748b", whiteSpace: "nowrap" }}>{e.entry_date}</td>
                      <td style={{ padding: "7px 10px", fontWeight: 600, color: "#1e293b" }}>{e.payee||"—"}</td>
                      <td style={{ padding: "7px 10px", color: "#475569" }}>{e.description}</td>
                      <td style={{ padding: "7px 10px", color: "#64748b" }}>{e.category}</td>
                      <td style={{ padding: "7px 10px", color: "#64748b" }}>{e.site||"—"}</td>
                      <td style={{ padding: "7px 10px", color: "#64748b" }}>{e.payment_mode||"Cash"}</td>
                      <td style={{ padding: "7px 10px", fontWeight: 700, color: "#10b981" }}>{isCredit ? parseFloat(e.amount).toFixed(3) : "—"}</td>
                      <td style={{ padding: "7px 10px", fontWeight: 700, color: "#ef4444" }}>{!isCredit ? parseFloat(e.amount).toFixed(3) : "—"}</td>
                      <td style={{ padding: "7px 10px", fontWeight: 700, color: running>=0?"#6366f1":"#ef4444" }}>{running.toFixed(3)}</td>
                    </tr>
                    );
                  })}
                  <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc", fontWeight: 700 }}>
                    <td colSpan={6} style={{ padding: "10px" }}>TOTAL ({cbEntries.length} entries)</td>
                    <td style={{ padding: "10px", color: "#10b981" }}>{cbCredits.toFixed(3)}</td>
                    <td style={{ padding: "10px", color: "#ef4444" }}>{cbDebits.toFixed(3)}</td>
                    <td style={{ padding: "10px", color: running>=0?"#6366f1":"#ef4444" }}>{running.toFixed(3)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            );
          })()}

          {/* SUBCONTRACTORS */}
          {activeTab === "subcontractors" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                <KPI label="Total Subcontractors" value={[...new Set(subs.map(s=>s.name))].length} unit="contractors" color="#6366f1" />
                <KPI label="Total Contract Value" value={totalSubContract.toFixed(3)} color="#8b5cf6" />
                <KPI label="Total Pending" value={(totalSubContract-totalSubPaid).toFixed(3)} color="#f59e0b" />
              </div>
              {[...new Set(subs.map(s=>s.name))].map(name => {
                const works = subs.filter(s=>s.name===name);
                const total = works.reduce((t,w)=>t+parseFloat(w.contract_amount||0),0);
                const paid = works.reduce((t,w)=>t+parseFloat(w.paid||0),0);
                return (
                  <div key={name} style={{ marginBottom: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 8, background: "#f8fafc", padding: "8px 12px", borderRadius: 8, borderLeft: "4px solid #6366f1" }}>
                      👷 {name} — Total: OMR {total.toFixed(3)} | Paid: OMR {paid.toFixed(3)} | Pending: OMR {(total-paid).toFixed(3)}
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead><tr style={{ background: "#334155", color: "#fff" }}>
                        {["Work / Project","Specialty","Contract (OMR)","Paid (OMR)","Pending (OMR)","%"].map(h=>
                          <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10 }}>{h}</th>
                        )}
                      </tr></thead>
                      <tbody>
                        {works.map((w,i) => {
                          const pct = w.contract_amount>0?Math.round((w.paid/w.contract_amount)*100):0;
                          return (
                            <tr key={w.id} style={{ borderBottom: "1px solid #f1f5f9", background: i%2===0?"#fff":"#f8fafc" }}>
                              <td style={{ padding: "7px 10px", color: "#1e293b" }}>{w.project}</td>
                              <td style={{ padding: "7px 10px", color: "#6366f1", fontWeight: 600 }}>{w.specialty}</td>
                              <td style={{ padding: "7px 10px", color: "#1e293b" }}>{parseFloat(w.contract_amount).toFixed(3)}</td>
                              <td style={{ padding: "7px 10px", color: "#10b981", fontWeight: 700 }}>{parseFloat(w.paid).toFixed(3)}</td>
                              <td style={{ padding: "7px 10px", color: "#f59e0b", fontWeight: 700 }}>{(w.contract_amount-w.paid).toFixed(3)}</td>
                              <td style={{ padding: "7px 10px", color: "#6366f1" }}>{pct}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}

          {/* LABOUR SUPPLY — employees lent to / borrowed from subcontractors, and money owed for it */}
          {activeTab === "labour_supply" && (() => {
            const WORK_HOURS_LS = 10;
            // Labour supply = attendance days where the employee worked UNDER a
            // subcontractor (attendance.worked_under set). Amount to collect from
            // the subcontractor = supply days x that employee's daily rate.
            const supplyAtt = attendance.filter(a => {
              const wu = (a.worked_under || "").trim();
              if (!wu) return false;
              const d = a.att_date || a.work_date || "";
              if (startDate && d < startDate) return false;
              if (endDate && d > endDate) return false;
              return true;
            });
            const allSubNames = [...new Set(supplyAtt.map(a => a.worked_under.trim()))].sort();
            const shown = labourSubFilter ? supplyAtt.filter(a => a.worked_under.trim() === labourSubFilter) : supplyAtt;

            // Group: subcontractor -> employee -> { days, dates[], rate }
            const empMap = {}; employees.forEach(e => { empMap[e.id] = e; });
            const bySub = {};
            shown.forEach(a => {
              const sub = a.worked_under.trim();
              const emp = empMap[a.employee_id];
              if (!emp) return;
              if (!bySub[sub]) bySub[sub] = {};
              if (!bySub[sub][a.employee_id]) bySub[sub][a.employee_id] = { name: emp.name, rate: parseFloat(emp.daily_rate||0), hours: 0, dates: [] };
              bySub[sub][a.employee_id].hours += parseFloat(a.hours_worked || 0);
              bySub[sub][a.employee_id].dates.push(a.att_date || a.work_date || "");
            });

            // Compute totals per sub
            const subSummaries = Object.entries(bySub).map(([sub, emps]) => {
              const empRows = Object.values(emps).map(e => {
                const days = parseFloat((e.hours / WORK_HOURS_LS).toFixed(2));
                const amount = parseFloat((days * e.rate).toFixed(3));
                return { ...e, days, amount, dates: e.dates.sort() };
              }).sort((a,b) => a.name.localeCompare(b.name));
              const subTotal = parseFloat(empRows.reduce((s,e) => s + e.amount, 0).toFixed(3));
              return { sub, empRows, subTotal };
            }).sort((a,b) => a.sub.localeCompare(b.sub));

            const grandTotal = parseFloat(subSummaries.reduce((s,x) => s + x.subTotal, 0).toFixed(3));
            const totalWorkers = new Set(shown.map(a => a.employee_id)).size;

            return (
              <div>
                <div style={{ background:"#eef2ff", border:"1px solid #c7d2fe", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:12, color:"#4338ca" }}>
                  This report shows labour our company <strong>supplied to subcontractors</strong>. Each day an employee is marked as working under a subcontractor (in the Attendance Grid), it is counted here. The amount to collect = supply days x that employee's daily salary rate.
                </div>
                <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
                  <select value={labourSubFilter} onChange={e=>setLabourSubFilter(e.target.value)}
                    style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", fontSize:13, minWidth:200 }}>
                    <option value="">All Subcontractors</option>
                    {allSubNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {labourSubFilter && <button onClick={()=>setLabourSubFilter("")} style={{ background:"#f1f5f9", border:"none", borderRadius:8, padding:"8px 12px", fontSize:12, cursor:"pointer", color:"#64748b" }}>x Clear filter</button>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                  <KPI label="Subcontractors" value={subSummaries.length} unit="contractors" color="#6366f1" />
                  <KPI label="Workers Supplied" value={totalWorkers} unit="employees" color="#8b5cf6" />
                  <KPI label="Total to Collect" value={grandTotal.toFixed(3)} color="#10b981" />
                </div>
                {subSummaries.length === 0 ? (
                  <div style={{ textAlign:"center", color:"#94a3b8", fontSize:13, padding:30, background:"#f8fafc", borderRadius:12, border:"1px solid #e2e8f0" }}>
                    <div style={{ fontSize:24, marginBottom:8 }}>&#128119;</div>
                    No labour supply recorded for this period.<br/>
                    <span style={{ fontSize:12 }}>In the <strong>Attendance Grid</strong>, mark a day's small dropdown to a subcontractor name (instead of the default "Co") to record that the worker was supplied to that subcontractor.</span>
                  </div>
                ) : (
                  subSummaries.map(({ sub, empRows, subTotal }) => (
                    <div key={sub} style={{ marginBottom: 22 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 8, background: "#f8fafc", padding: "10px 14px", borderRadius: 8, borderLeft: "4px solid #8b5cf6", display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
                        <span>&#128119; {sub}</span>
                        <span style={{ color:"#10b981" }}>To Collect: OMR {subTotal.toFixed(3)} ({empRows.length} {empRows.length===1?"worker":"workers"})</span>
                      </div>
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth:680 }}>
                          <thead><tr style={{ background: "#334155", color: "#fff" }}>
                            {["Employee","Daily Rate (OMR)","Supply Days","Dates Supplied","Amount to Collect (OMR)"].map(h=>
                              <th key={h} style={{ padding: "7px 10px", textAlign: h==="Employee"?"left":"right", fontSize: 10 }}>{h}</th>
                            )}
                          </tr></thead>
                          <tbody>
                            {empRows.map((e,i) => (
                              <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i%2===0?"#fff":"#f8fafc" }}>
                                <td style={{ padding: "7px 10px", color: "#1e293b", fontWeight:600 }}>{e.name}</td>
                                <td style={{ padding: "7px 10px", textAlign:"right", color: "#64748b" }}>{e.rate.toFixed(3)}</td>
                                <td style={{ padding: "7px 10px", textAlign:"right", color: "#6366f1", fontWeight:700 }}>{e.days}</td>
                                <td style={{ padding: "7px 10px", textAlign:"right", color: "#94a3b8", fontSize:10 }}>{e.dates.join(", ")}</td>
                                <td style={{ padding: "7px 10px", textAlign:"right", color: "#10b981", fontWeight: 700 }}>{e.amount.toFixed(3)}</td>
                              </tr>
                            ))}
                            <tr style={{ background:"#f1f5f9", fontWeight:800 }}>
                              <td colSpan={4} style={{ padding:"8px 10px", textAlign:"right" }}>Total to collect from {sub}</td>
                              <td style={{ padding:"8px 10px", textAlign:"right", color:"#10b981" }}>{subTotal.toFixed(3)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })()}

          {/* INVOICES & QUOTATIONS */}
          {activeTab === "invoices" && (() => {
            const filtered = invoices.filter(i => (!startDate || i.invoice_date >= startDate) && (!endDate || i.invoice_date <= endDate));
            const totalGrand = filtered.reduce((t,i)=>t+parseFloat(i.grand_total||i.amount||0),0);
            const totalPaidStatus = filtered.filter(i=>i.status==="Paid").reduce((t,i)=>t+parseFloat(i.grand_total||i.amount||0),0);
            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                  <KPI label="Total Invoices/Quotations" value={filtered.length} unit="docs" color="#6366f1" />
                  <KPI label="Total Value" value={totalGrand.toFixed(3)} color="#8b5cf6" />
                  <KPI label="Paid" value={totalPaidStatus.toFixed(3)} color="#10b981" />
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead><tr style={{ background: "#334155", color: "#fff" }}>
                    {["Date","Number","Type","Client","Project","Grand Total","Status"].map(h=>
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10 }}>{h}</th>
                    )}
                  </tr></thead>
                  <tbody>
                    {filtered.map((i,idx) => (
                      <tr key={i.id} style={{ borderBottom: "1px solid #f1f5f9", background: idx%2===0?"#fff":"#f8fafc" }}>
                        <td style={{ padding: "7px 10px", color: "#64748b" }}>{i.invoice_date}</td>
                        <td style={{ padding: "7px 10px", color: "#6366f1", fontWeight: 600 }}>{i.invoice_number}</td>
                        <td style={{ padding: "7px 10px", color: "#1e293b" }}>{i.type}</td>
                        <td style={{ padding: "7px 10px", color: "#1e293b" }}>{i.client_name||i.customer}</td>
                        <td style={{ padding: "7px 10px", color: "#64748b" }}>{i.project}</td>
                        <td style={{ padding: "7px 10px", color: "#10b981", fontWeight: 700 }}>{parseFloat(i.grand_total||i.amount||0).toFixed(3)}</td>
                        <td style={{ padding: "7px 10px", color: i.status==="Paid"?"#10b981":"#f59e0b" }}>{i.status}</td>
                      </tr>
                    ))}
                    {filtered.length===0 && <tr><td colSpan={7} style={{ padding:30, textAlign:"center", color:"#94a3b8" }}>No invoices found for this period.</td></tr>}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* INVENTORY STOCK */}
          {activeTab === "inventory" && (() => {
            const totalValue = inventoryItems.reduce((t,it)=>t+parseFloat(it.current_stock||0)*parseFloat(it.cost_per_unit||0),0);
            const lowStock = inventoryItems.filter(it=>parseFloat(it.current_stock||0) <= parseFloat(it.min_stock||0));
            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                  <KPI label="Total Items" value={inventoryItems.length} unit="items" color="#6366f1" />
                  <KPI label="Stock Value" value={totalValue.toFixed(3)} color="#8b5cf6" />
                  <KPI label="Low Stock Items" value={lowStock.length} unit="items" color="#ef4444" />
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead><tr style={{ background: "#334155", color: "#fff" }}>
                    {["Item","Category","Current Stock","Min Stock","Cost/Unit","Stock Value"].map(h=>
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10 }}>{h}</th>
                    )}
                  </tr></thead>
                  <tbody>
                    {inventoryItems.map((it,idx) => {
                      const low = parseFloat(it.current_stock||0) <= parseFloat(it.min_stock||0);
                      return (
                        <tr key={it.id} style={{ borderBottom: "1px solid #f1f5f9", background: low?"#fef2f2":idx%2===0?"#fff":"#f8fafc" }}>
                          <td style={{ padding: "7px 10px", color: "#1e293b", fontWeight:600 }}>{it.name}</td>
                          <td style={{ padding: "7px 10px", color: "#64748b" }}>{it.category}</td>
                          <td style={{ padding: "7px 10px", color: low?"#ef4444":"#1e293b", fontWeight: low?700:400 }}>{parseFloat(it.current_stock||0)} {it.unit}</td>
                          <td style={{ padding: "7px 10px", color: "#94a3b8" }}>{parseFloat(it.min_stock||0)} {it.unit}</td>
                          <td style={{ padding: "7px 10px", color: "#1e293b" }}>{parseFloat(it.cost_per_unit||0).toFixed(3)}</td>
                          <td style={{ padding: "7px 10px", color: "#10b981", fontWeight: 700 }}>{(parseFloat(it.current_stock||0)*parseFloat(it.cost_per_unit||0)).toFixed(3)}</td>
                        </tr>
                      );
                    })}
                    {inventoryItems.length===0 && <tr><td colSpan={6} style={{ padding:30, textAlign:"center", color:"#94a3b8" }}>No inventory items found.</td></tr>}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* MATERIAL REQUESTS */}
          {activeTab === "material_requests" && (() => {
            const filtered = materialRequests.filter(r => (!startDate || (r.created_at||"").split("T")[0] >= startDate) && (!endDate || (r.created_at||"").split("T")[0] <= endDate));
            const totalValue = filtered.reduce((t,r)=>t+parseFloat(r.total_value||0),0);
            const pending = filtered.filter(r=>r.status!=="Fulfilled");
            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                  <KPI label="Total Requests" value={filtered.length} unit="requests" color="#6366f1" />
                  <KPI label="Total Value" value={totalValue.toFixed(3)} color="#8b5cf6" />
                  <KPI label="Pending" value={pending.length} unit="requests" color="#f59e0b" />
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead><tr style={{ background: "#334155", color: "#fff" }}>
                    {["Date","Request No","Project / Site","Requested By","Urgency","Status","Total Value"].map(h=>
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10 }}>{h}</th>
                    )}
                  </tr></thead>
                  <tbody>
                    {filtered.map((r,idx) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9", background: idx%2===0?"#fff":"#f8fafc" }}>
                        <td style={{ padding: "7px 10px", color: "#64748b" }}>{(r.created_at||"").split("T")[0]}</td>
                        <td style={{ padding: "7px 10px", color: "#6366f1", fontWeight: 600 }}>{r.request_number}</td>
                        <td style={{ padding: "7px 10px", color: "#1e293b" }}>{r.site||r.project}</td>
                        <td style={{ padding: "7px 10px", color: "#64748b" }}>{r.requested_by}</td>
                        <td style={{ padding: "7px 10px", color: r.urgency==="High"?"#ef4444":"#64748b" }}>{r.urgency}</td>
                        <td style={{ padding: "7px 10px", color: r.status==="Fulfilled"?"#10b981":"#f59e0b" }}>{r.status}</td>
                        <td style={{ padding: "7px 10px", color: "#1e293b", fontWeight: 700 }}>{parseFloat(r.total_value||0).toFixed(3)}</td>
                      </tr>
                    ))}
                    {filtered.length===0 && <tr><td colSpan={7} style={{ padding:30, textAlign:"center", color:"#94a3b8" }}>No material requests found for this period.</td></tr>}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* EQUIPMENT REGISTER */}
          {activeTab === "equipment" && (() => {
            const inUse = equipmentList.filter(e=>e.status==="In Use");
            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                  <KPI label="Total Equipment" value={equipmentList.length} unit="items" color="#6366f1" />
                  <KPI label="In Use" value={inUse.length} unit="items" color="#f59e0b" />
                  <KPI label="Available" value={equipmentList.length-inUse.length} unit="items" color="#10b981" />
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead><tr style={{ background: "#334155", color: "#fff" }}>
                    {["Equipment","Category","Status","Current Site","Quantity"].map(h=>
                      <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontSize: 10 }}>{h}</th>
                    )}
                  </tr></thead>
                  <tbody>
                    {equipmentList.map((eq,idx) => (
                      <tr key={eq.id} style={{ borderBottom: "1px solid #f1f5f9", background: idx%2===0?"#fff":"#f8fafc" }}>
                        <td style={{ padding: "7px 10px", color: "#1e293b", fontWeight: 600 }}>{eq.name}</td>
                        <td style={{ padding: "7px 10px", color: "#64748b" }}>{eq.category}</td>
                        <td style={{ padding: "7px 10px", color: eq.status==="In Use"?"#f59e0b":"#10b981", fontWeight: 600 }}>{eq.status}</td>
                        <td style={{ padding: "7px 10px", color: "#1e293b" }}>{eq.current_site||"—"}</td>
                        <td style={{ padding: "7px 10px", color: "#64748b" }}>{eq.quantity||"—"}</td>
                      </tr>
                    ))}
                    {equipmentList.length===0 && <tr><td colSpan={5} style={{ padding:30, textAlign:"center", color:"#94a3b8" }}>No equipment found.</td></tr>}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* COMMISSIONS */}
          {activeTab === "commissions" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                <KPI label="Total Commissions" value={totalCommission.toFixed(3)} color="#8b5cf6" />
                <KPI label="Paid / Settled" value={paidCommission.toFixed(3)} color="#10b981" />
                <KPI label="Pending" value={(totalCommission-paidCommission).toFixed(3)} color="#f59e0b" />
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ background: "#0f172a", color: "#fff" }}>
                  {["Ref","Agent","Client","Site","Contract Value","Rate","Payout (OMR)","Status"].map(h=>
                    <th key={h} style={{ padding: "9px 10px", textAlign: "left", fontSize: 10 }}>{h}</th>
                  )}
                </tr></thead>
                <tbody>
                  {commissions.map((c,i) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9", background: i%2===0?"#fff":"#f8fafc" }}>
                      <td style={{ padding: "9px 10px", color: "#6366f1", fontFamily: "monospace" }}>{c.ref_number}</td>
                      <td style={{ padding: "9px 10px", fontWeight: 600, color: "#1e293b" }}>{c.agent_name}</td>
                      <td style={{ padding: "9px 10px", color: "#475569" }}>{c.client}</td>
                      <td style={{ padding: "9px 10px", color: "#64748b" }}>{c.site}</td>
                      <td style={{ padding: "9px 10px", color: "#1e293b" }}>{parseFloat(c.contract_value).toFixed(3)}</td>
                      <td style={{ padding: "9px 10px", color: "#6366f1" }}>{c.commission_rate}%</td>
                      <td style={{ padding: "9px 10px", color: "#8b5cf6", fontWeight: 700 }}>{parseFloat(c.computed_payout).toFixed(3)}</td>
                      <td style={{ padding: "9px 10px" }}>
                        <span style={{ background: c.status==="Settled"?"#ecfdf5":"#fffbeb", color: c.status==="Settled"?"#10b981":"#854d0e", borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{c.status}</span>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc", fontWeight: 700 }}>
                    <td colSpan={6} style={{ padding: "10px" }}>TOTAL ({commissions.length} commissions)</td>
                    <td style={{ padding: "10px", color: "#8b5cf6" }}>{totalCommission.toFixed(3)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* RECONCILE: Payroll payments vs Cashbook ledger */}
          {activeTab === "reconcile" && (() => {
            const empMap = {}; employees.forEach(e => { empMap[e.id] = e; });
            // Build a lookup of ledger entries by their payment voucher (PAY-xxxxxxxx).
            const ledgerByVoucher = {};
            ledger.forEach(l => {
              if (l.ref_voucher && l.ref_voucher.startsWith("PAY-")) {
                ledgerByVoucher[l.ref_voucher] = l;
              }
            });
            // Was this payment ever edited? (activity log heuristic)
            const editedNames = new Set(
              activityLog.filter(a => a.action === "Edited salary payment")
                .map(a => (a.detail || "").split("—")[0].trim())
            );

            const rows = salaryPayments.map(p => {
              const voucher = `PAY-${(p.id || "").substring(0, 8).toUpperCase()}`;
              const led = ledgerByVoucher[voucher];
              const payAmt = parseFloat(p.amount || 0);
              const ledAmt = led ? parseFloat(led.amount || 0) : null;
              const emp = empMap[p.employee_id];
              let status, diff = null;
              if (!p.bank_account_id) {
                status = "cash"; // no ledger expected (cash payment, not through a bank account)
              } else if (ledAmt === null) {
                status = "missing"; // bank payment but no ledger entry
              } else if (Math.abs(payAmt - ledAmt) > 0.001) {
                status = "mismatch"; diff = payAmt - ledAmt;
              } else {
                status = "ok";
              }
              return { p, led, payAmt, ledAmt, emp, status, diff, voucher,
                       edited: emp && editedNames.has(emp.name) };
            });

            const problems = rows.filter(r => r.status === "mismatch" || r.status === "missing");
            const fixableMismatches = rows.filter(r => r.status === "mismatch"); // have a ledger amount to copy
            const missingEntries = rows.filter(r => r.status === "missing"); // bank payment but no ledger
            const okCount = rows.filter(r => r.status === "ok").length;

            // Auto-fix: set each mismatched payment's amount to its Cashbook (ledger)
            // amount — used when the user confirms the ledger figures are correct.
            const autoFixToCashbook = async () => {
              if (fixableMismatches.length === 0) return;
              const lines = fixableMismatches.map(r =>
                `${r.emp?.name || "?"} (${r.p.payment_date}): OMR ${r.payAmt.toFixed(3)} → OMR ${r.ledAmt.toFixed(3)}`
              ).join("\n");
              if (!window.confirm(
                `Set these ${fixableMismatches.length} payment(s) to match the Cashbook amount?\n\n${lines}\n\nThis updates the Payroll payment amount AND keeps each linked payroll record in sync. "No ledger entry" rows are NOT touched.`
              )) return;
              try {
                for (const r of fixableMismatches) {
                  // 1. Correct the salary_payment amount to the ledger amount.
                  await supabase.from("salary_payments").update({ amount: r.ledAmt }).eq("id", r.p.id);
                  // 2. Keep the parent payroll record's paid_amount/balance/status in sync.
                  if (r.p.payroll_id) {
                    const pr = payroll.find(x => x.id === r.p.payroll_id);
                    if (pr) {
                      const otherPaid = salaryPayments
                        .filter(x => x.payroll_id === pr.id && x.id !== r.p.id)
                        .reduce((s, x) => s + parseFloat(x.amount || 0), 0);
                      const newPaid = otherPaid + r.ledAmt;
                      const net = parseFloat(pr.net_salary || 0);
                      await supabase.from("payroll").update({
                        paid_amount: newPaid,
                        balance: net - newPaid,
                        status: (net - newPaid) <= 0 ? "Paid" : "Partial",
                      }).eq("id", pr.id);
                    }
                  }
                }
                alert(`✅ Fixed ${fixableMismatches.length} payment(s) to match the Cashbook.`);
                await loadAllData();
              } catch (e) {
                console.error("Auto-fix failed:", e);
                alert("⚠ Something went wrong while fixing. Nothing else was changed. Please refresh and check.");
              }
            };

            // Delete the "No ledger entry" payments — used when the user confirms
            // these payments were never actually paid (entered by mistake).
            // Soft-delete only: they move to Trash and can be restored.
            const deleteMissing = async () => {
              if (missingEntries.length === 0) return;
              const lines = missingEntries.map(r =>
                `${r.emp?.name || "?"} (${r.p.payment_date}): ${r.p.payment_type} — OMR ${r.payAmt.toFixed(3)}`
              ).join("\n");
              if (!window.confirm(
                `Move these ${missingEntries.length} payment(s) to Trash?\n\n${lines}\n\nUse this only if these payments were NOT actually paid. They can be restored from Trash if needed. Each payment's payroll record will be re-synced.`
              )) return;
              try {
                const now = new Date().toISOString();
                for (const r of missingEntries) {
                  await supabase.from("salary_payments").update({ deleted_at: now }).eq("id", r.p.id);
                  // Re-sync the parent payroll record without this payment.
                  if (r.p.payroll_id) {
                    const pr = payroll.find(x => x.id === r.p.payroll_id);
                    if (pr) {
                      const otherPaid = salaryPayments
                        .filter(x => x.payroll_id === pr.id && x.id !== r.p.id)
                        .reduce((s, x) => s + parseFloat(x.amount || 0), 0);
                      const net = parseFloat(pr.net_salary || 0);
                      await supabase.from("payroll").update({
                        paid_amount: otherPaid,
                        balance: net - otherPaid,
                        status: (net - otherPaid) <= 0 ? "Paid" : "Partial",
                      }).eq("id", pr.id);
                    }
                  }
                }
                alert(`✅ Moved ${missingEntries.length} payment(s) to Trash.`);
                await loadAllData();
              } catch (e) {
                console.error("Delete failed:", e);
                alert("⚠ Something went wrong. Please refresh and check.");
              }
            };

            const cashCount = rows.filter(r => r.status === "cash").length;
            const totalDiff = problems.filter(r=>r.status==="mismatch").reduce((s,r)=>s+Math.abs(r.diff||0),0);

            const badge = (st) => {
              const m = { ok:["#16a34a","#f0fdf4","✓ Match"], mismatch:["#dc2626","#fef2f2","✗ Mismatch"],
                          missing:["#d97706","#fffbeb","⚠ No ledger entry"], cash:["#64748b","#f8fafc","💵 Cash (no bank)"] };
              const [c,bg,t] = m[st];
              return <span style={{ color:c, background:bg, padding:"3px 9px", borderRadius:6, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>{t}</span>;
            };

            return (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>🔍 Payroll ↔ Cashbook Reconciliation</div>
                  <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                    Every salary payment is matched to its Cashbook ledger entry. Only <b>Mismatch</b> and <b>No ledger entry</b> rows need your attention.
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
                  <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11, color:"#dc2626", fontWeight:700 }}>NEEDS FIXING</div>
                    <div style={{ fontSize:24, fontWeight:800, color:"#b91c1c" }}>{problems.length}</div>
                  </div>
                  <div style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11, color:"#d97706", fontWeight:700 }}>TOTAL DIFFERENCE</div>
                    <div style={{ fontSize:24, fontWeight:800, color:"#b45309" }}>OMR {totalDiff.toFixed(3)}</div>
                  </div>
                  <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11, color:"#16a34a", fontWeight:700 }}>MATCHED</div>
                    <div style={{ fontSize:24, fontWeight:800, color:"#15803d" }}>{okCount}</div>
                  </div>
                  <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11, color:"#64748b", fontWeight:700 }}>CASH (NO BANK)</div>
                    <div style={{ fontSize:24, fontWeight:800, color:"#475569" }}>{cashCount}</div>
                  </div>
                </div>

                {problems.length === 0 ? (
                  <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:40, textAlign:"center", color:"#15803d", fontSize:15, fontWeight:600 }}>
                    ✓ All bank payments match the Cashbook ledger. Nothing to fix.
                  </div>
                ) : (
                  <>
                    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10, flexWrap:"wrap" }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>⚠ Rows to review ({problems.length})</div>
                      {fixableMismatches.length > 0 && (
                        <button onClick={autoFixToCashbook} style={{ marginLeft:"auto", background:"#dc2626", color:"#fff", border:"none", borderRadius:8, padding:"9px 16px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                          ⚙ Fix {fixableMismatches.length} to Cashbook amount
                        </button>
                      )}
                      {missingEntries.length > 0 && (
                        <button onClick={deleteMissing} style={{ marginLeft: fixableMismatches.length>0?0:"auto", background:"#fff", color:"#d97706", border:"2px solid #d97706", borderRadius:8, padding:"9px 16px", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                          🗑 Trash {missingEntries.length} unpaid "no ledger" entries
                        </button>
                      )}
                    </div>
                    <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", overflow:"hidden", marginBottom: 24 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                        <thead><tr style={{ background:"#f8fafc" }}>
                          {["Employee","Date","Type","Payroll amount","Cashbook amount","Difference","Status","Edited?"].map(h=>
                            <th key={h} style={{ padding:"10px 12px", textAlign: h.includes("amount")||h==="Difference"?"right":"left", color:"#64748b", fontWeight:700, fontSize:10 }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {problems.map((r,i)=>(
                            <tr key={i} style={{ borderTop:"1px solid #f1f5f9" }}>
                              <td style={{ padding:"10px 12px", fontWeight:700, color:"#0f172a" }}>{r.emp?.name || "Unknown"}</td>
                              <td style={{ padding:"10px 12px", color:"#475569" }}>{r.p.payment_date}</td>
                              <td style={{ padding:"10px 12px", color:"#475569" }}>{r.p.payment_type}</td>
                              <td style={{ padding:"10px 12px", textAlign:"right", fontWeight:700, color:"#0f172a" }}>OMR {r.payAmt.toFixed(3)}</td>
                              <td style={{ padding:"10px 12px", textAlign:"right", fontWeight:700, color: r.ledAmt===null?"#d97706":"#0f172a" }}>{r.ledAmt===null ? "— none —" : "OMR "+r.ledAmt.toFixed(3)}</td>
                              <td style={{ padding:"10px 12px", textAlign:"right", fontWeight:800, color:"#dc2626" }}>{r.diff!==null ? (r.diff>0?"+":"")+"OMR "+r.diff.toFixed(3) : "—"}</td>
                              <td style={{ padding:"10px 12px" }}>{badge(r.status)}</td>
                              <td style={{ padding:"10px 12px", color: r.edited?"#d97706":"#94a3b8", fontWeight: r.edited?700:400 }}>{r.edited ? "✏ Edited" : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, padding:16, fontSize:13, color:"#1e40af", lineHeight:1.7 }}>
                      <b>എങ്ങനെ ശരിയാക്കും:</b><br/>
                      • <b>"✏ Edited" രേഖപ്പെടുത്തിയവ:</b> Payroll amount ആണ് നീ അവസാനം തിരുത്തിയത് — സാധാരണ അതാണ് ശരി. Bank statement / receipt ഉണ്ടെങ്കില്‍ ഒത്തുനോക്കൂ.<br/>
                      • <b>ഉറപ്പിച്ച ശേഷം:</b> ആ payment Payroll → Payments-ല്‍ ഒന്ന് edit ചെയ്ത് (ശരിയായ amount ഇട്ട്) save ചെയ്യൂ — ഇപ്പോള്‍ Cashbook auto-sync ആകും.<br/>
                      • <b>"No ledger entry":</b> Bank payment ആയിട്ടും Cashbook-ല്‍ ഇല്ല — ആ payment edit-save ചെയ്താല്‍ ledger entry പുതുതായി ഉണ്ടാകും.
                    </div>
                  </>
                )}

                <details style={{ marginTop: 20 }}>
                  <summary style={{ cursor:"pointer", fontSize:13, fontWeight:700, color:"#64748b" }}>എല്ലാ {rows.length} payment-ഉം കാണിക്കൂ (matched + cash ഉള്‍പ്പെടെ)</summary>
                  <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", overflow:"hidden", marginTop:10 }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                      <thead><tr style={{ background:"#f8fafc" }}>
                        {["Employee","Date","Type","Payroll","Cashbook","Status"].map(h=>
                          <th key={h} style={{ padding:"9px 12px", textAlign: ["Payroll","Cashbook"].includes(h)?"right":"left", color:"#64748b", fontWeight:700, fontSize:10 }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {rows.map((r,i)=>(
                          <tr key={i} style={{ borderTop:"1px solid #f1f5f9" }}>
                            <td style={{ padding:"8px 12px", color:"#0f172a" }}>{r.emp?.name || "Unknown"}</td>
                            <td style={{ padding:"8px 12px", color:"#475569" }}>{r.p.payment_date}</td>
                            <td style={{ padding:"8px 12px", color:"#475569" }}>{r.p.payment_type}</td>
                            <td style={{ padding:"8px 12px", textAlign:"right", color:"#0f172a" }}>{r.payAmt.toFixed(3)}</td>
                            <td style={{ padding:"8px 12px", textAlign:"right", color:"#475569" }}>{r.ledAmt===null?"—":r.ledAmt.toFixed(3)}</td>
                            <td style={{ padding:"8px 12px" }}>{badge(r.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            );
          })()}

          {/* PAYROLL */}
          {activeTab === "payroll" && (() => {
            // Use the same period list and calculation as the Payroll page
            const periods = getSalaryPeriods();
            const selPeriodKey = selectedPayrollEmployee.includes("||")
              ? selectedPayrollEmployee.split("||")[1] : "";
            const selEmpId = selectedPayrollEmployee.includes("||")
              ? selectedPayrollEmployee.split("||")[0] : selectedPayrollEmployee;
            const selPeriod = periods.find(p => p.start === selPeriodKey) || periods[0];

            // Single source-of-truth: same function as Payroll.jsx
            const companyAccId = (bankAccounts.find(a => (a.account_name||"").trim().toLowerCase() === "company account") || {}).id || null;
            const calcRow = (emp) => calcPayrollRow(emp, selPeriod, attendance, payroll, salaryPayments, companyAccId);
            const filteredEmps = selEmpId
              ? employees.filter(e => e.id === selEmpId)
              : employees.filter(e => e.status === "Active");

            const printEmpDetail = (emp) => {
              const r = calcRow(emp);
              const w = window.open("","_blank","width=820,height=680");
              w.document.write(`<!DOCTYPE html><html><head><title>Payroll — ${esc(emp.name)}</title>
              <style>body{font-family:Arial,sans-serif;padding:28px;font-size:13px;color:#1e293b}h2{margin:0 0 2px;font-size:18px}.sub{color:#64748b;font-size:12px;margin-bottom:4px}.period{color:#6366f1;font-weight:700;margin-bottom:16px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #d1d5db;padding:8px 12px;font-size:12px}th{background:#1e293b;color:#fff;font-size:11px}.num{text-align:right;font-weight:700}.red{color:#dc2626}.green{color:#16a34a}.total{background:#f8fafc;font-weight:700}.bigbal{font-size:15px;font-weight:800}@media print{button{display:none}}</style>
              </head><body>
              <h2>${esc(emp.name)}</h2>
              <div class="sub">${esc(emp.role||"")} ${emp.type?`· ${esc(emp.type)}`:""} · Daily Rate: OMR ${parseFloat(emp.daily_rate||0).toFixed(3)}</div>
              <div class="period">📅 ${selPeriod.label} (${selPeriod.start} – ${selPeriod.end})</div>
              <table>
                <tr><th colspan="2">Payroll Breakdown</th></tr>
                <tr><td>Total Hours Worked</td><td class="num">${r.totalHours} hrs</td></tr>
                <tr><td>Present Days (÷ ${WORK_HOURS} hrs/day)</td><td class="num">${r.totalDays}</td></tr>
                <tr><td>Daily Rate</td><td class="num">OMR ${parseFloat(emp.daily_rate||0).toFixed(3)}</td></tr>
                <tr class="total"><td>Month Payment</td><td class="num">OMR ${r.grossSalary.toFixed(3)}</td></tr>
                ${r.advance>0?`<tr><td class="red">(-) Advance Deduction</td><td class="num red">OMR ${r.advance.toFixed(3)}</td></tr>`:""}
                ${r.food>0?`<tr><td class="red">(-) Food Deduction</td><td class="num red">OMR ${r.food.toFixed(3)}</td></tr>`:""}
                ${r.other>0?`<tr><td class="red">(-) Other Deduction</td><td class="num red">OMR ${r.other.toFixed(3)}</td></tr>`:""}
                ${r.incentive>0?`<tr><td class="green">(+) Incentive</td><td class="num green">OMR ${r.incentive.toFixed(3)}</td></tr>`:""}
                <tr class="total"><td>Labour Amount</td><td class="num">OMR ${r.netSalary.toFixed(3)}</td></tr>
                <tr><td>Old Balance</td><td class="num ${r.openingBal>=0?"green":"red"}">OMR ${r.openingBal.toFixed(3)}</td></tr>
                <tr class="total"><td>Total Amount Due</td><td class="num">OMR ${r.totalAmount.toFixed(3)}</td></tr>
                <tr><th colspan="2" style="text-align:left">Payments Made</th></tr>
                ${r.advancePaid>0?`<tr><td>Advance Paid</td><td class="num">OMR ${r.advancePaid.toFixed(3)}</td></tr>`:""}
                ${r.foodPaid>0?`<tr><td>Food Allowance Paid</td><td class="num">OMR ${r.foodPaid.toFixed(3)}</td></tr>`:""}
                ${r.salaryPaid>0?`<tr><td>Salary Paid</td><td class="num">OMR ${r.salaryPaid.toFixed(3)}</td></tr>`:""}
                ${r.otherPaid>0?`<tr><td>Other Paid</td><td class="num">OMR ${r.otherPaid.toFixed(3)}</td></tr>`:""}
                <tr><td class="green">Paid through company account</td><td class="num green">OMR ${r.comp.toFixed(3)}</td></tr>
                <tr class="total"><td>Total Paid Amount</td><td class="num green">OMR ${r.paidAmt.toFixed(3)}</td></tr>
                <tr class="total bigbal"><td>Balance</td><td class="num ${r.balance<=0?"green":"red"}">OMR ${r.balance.toFixed(3)}</td></tr>
              </table>
              ${r.finalPayments.length>0?`<div style="margin-top:18px"><table><tr><th colspan="3">Payments this Period</th></tr><tr><th>Date</th><th>Type</th><th style="text-align:right">Amount</th></tr>${r.finalPayments.map(p=>`<tr><td>${p.payment_date||""}</td><td>${esc(p.payment_type||"Salary")}</td><td class="num">OMR ${parseFloat(p.amount||0).toFixed(3)}</td></tr>`).join("")}</table></div>`:""}
              <div style="margin-top:24px;border-top:1px solid #e5e7eb;padding-top:10px;display:flex;justify-content:space-between;font-size:10px;color:#9ca3af"><span>Minarva Biz ERP</span><span>${new Date().toLocaleString()}</span></div>
              <button onclick="window.print()" style="margin-top:10px;padding:8px 18px;background:#1e293b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨 Print</button>
              </body></html>`);
              w.document.close();
            };

            return (
              <div>
                <div style={{ display:"flex", gap:14, marginBottom:16, flexWrap:"wrap", alignItems:"flex-end" }}>
                  <div>
                    <div style={{ fontSize:11, color:"#64748b", marginBottom:4, fontWeight:600 }}>Period</div>
                    <select value={selPeriodKey} onChange={e => setSelectedPayrollEmployee(selEmpId + "||" + e.target.value)}
                      style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", fontSize:13, minWidth:240 }}>
                      {periods.map(p => <option key={p.start} value={p.start}>{p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"#64748b", marginBottom:4, fontWeight:600 }}>Employee</div>
                    <select value={selEmpId} onChange={e => setSelectedPayrollEmployee(e.target.value + "||" + selPeriodKey)}
                      style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", fontSize:13, minWidth:220 }}>
                      <option value="">All Active Employees</option>
                      {employees.filter(e => e.status==="Active").map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  {selEmpId && <button onClick={() => setSelectedPayrollEmployee("")} style={{ background:"#f1f5f9", border:"none", borderRadius:8, padding:"8px 12px", fontSize:12, cursor:"pointer", color:"#64748b" }}>✕ Clear</button>}
                </div>
                <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"8px 16px", marginBottom:16, fontSize:13, fontWeight:700, color:"#15803d" }}>
                  📅 {selPeriod.label} &nbsp;·&nbsp; <span style={{ fontWeight:400, fontSize:12, color:"#64748b" }}>{selPeriod.start} – {selPeriod.end}</span>
                </div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, minWidth:950 }}>
                    <thead>
                      <tr style={{ background:"#1e293b", color:"#fff" }}>
                        {["Sl","Employee Name","Advance","Food","Present Days","Month Payment","Old Balance","Labour Amount","Paid through company account","Total Amount","Paid Amount","Balance",""].map((h,i) =>
                          <th key={i} style={{ padding:"9px 8px", textAlign:i<=1?"left":"right", fontSize:9.5, whiteSpace:i===8?"normal":"nowrap", maxWidth:i===8?90:"none" }}>{h}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmps.map((emp, i) => {
                        const r = calcRow(emp);
                        return (
                          <tr key={emp.id} style={{ borderBottom:"1px solid #f1f5f9", background:i%2===0?"#fff":"#f8fafc" }}>
                            <td style={{ padding:"8px", color:"#94a3b8", fontSize:10 }}>{i+1}</td>
                            <td style={{ padding:"8px", fontWeight:700, color:"#1e293b" }}>{emp.name}</td>
                            <td style={{ padding:"8px", textAlign:"right", color:r.advancePaid>0?"#ef4444":"#94a3b8" }}>{r.advancePaid.toFixed(3)}</td>
                            <td style={{ padding:"8px", textAlign:"right", color:r.foodPaid>0?"#ef4444":"#94a3b8" }}>{r.foodPaid.toFixed(3)}</td>
                            <td style={{ padding:"8px", textAlign:"right", color:"#6366f1", fontWeight:600 }}>{r.totalDays}</td>
                            <td style={{ padding:"8px", textAlign:"right" }}>{r.grossSalary.toFixed(3)}</td>
                            <td style={{ padding:"8px", textAlign:"right", color:r.openingBal>=0?"#10b981":"#ef4444" }}>{r.openingBal.toFixed(3)}</td>
                            <td style={{ padding:"8px", textAlign:"right", fontWeight:700 }}>{r.netSalary.toFixed(3)}</td>
                            <td style={{ padding:"8px", textAlign:"right", color:"#6366f1", fontWeight:600 }}>{r.comp.toFixed(3)}</td>
                            <td style={{ padding:"8px", textAlign:"right", fontWeight:700 }}>{r.totalAmount.toFixed(3)}</td>
                            <td style={{ padding:"8px", textAlign:"right", color:"#10b981", fontWeight:700 }}>{r.paidAmt.toFixed(3)}</td>
                            <td style={{ padding:"8px", textAlign:"right", fontWeight:800, color:r.balance<=0?"#10b981":"#ef4444" }}>{r.balance.toFixed(3)}</td>
                            <td style={{ padding:"8px 4px", textAlign:"center" }}>
                              <button onClick={() => printEmpDetail(emp)} style={{ background:"#f1f5f9", border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", fontSize:10, color:"#475569" }}>🖨</button>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredEmps.length > 1 && (() => {
                        const tots = filteredEmps.map(calcRow);
                        const sum = fn => tots.reduce((s,r) => s + fn(r), 0);
                        return (
                          <tr style={{ background:"#1e293b", color:"#fff", fontWeight:800 }}>
                            <td colSpan={2} style={{ padding:"9px 8px" }}>TOTAL — {filteredEmps.length} employees</td>
                            <td style={{ padding:"9px 8px", textAlign:"right" }}>{sum(r=>r.advancePaid).toFixed(3)}</td>
                            <td style={{ padding:"9px 8px", textAlign:"right" }}>{sum(r=>r.foodPaid).toFixed(3)}</td>
                            <td style={{ padding:"9px 8px", textAlign:"right" }}>{sum(r=>r.totalDays).toFixed(2)}</td>
                            <td style={{ padding:"9px 8px", textAlign:"right" }}>{sum(r=>r.grossSalary).toFixed(3)}</td>
                            <td style={{ padding:"9px 8px", textAlign:"right" }}>{sum(r=>r.openingBal).toFixed(3)}</td>
                            <td style={{ padding:"9px 8px", textAlign:"right" }}>{sum(r=>r.netSalary).toFixed(3)}</td>
                            <td style={{ padding:"9px 8px", textAlign:"right" }}>{sum(r=>r.comp).toFixed(3)}</td>
                            <td style={{ padding:"9px 8px", textAlign:"right" }}>{sum(r=>r.totalAmount).toFixed(3)}</td>
                            <td style={{ padding:"9px 8px", textAlign:"right" }}>{sum(r=>r.paidAmt).toFixed(3)}</td>
                            <td style={{ padding:"9px 8px", textAlign:"right" }}>{sum(r=>r.balance).toFixed(3)}</td>
                            <td></td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
                {filteredEmps.length === 0 && <div style={{ textAlign:"center", color:"#94a3b8", fontSize:13, padding:30 }}>No employees found.</div>}
              </div>
            );
          })()}

          {/* PAYMENTS */}
          {activeTab === "payments" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                <KPI label="Total Billed" value={totalContract.toFixed(3)} color="#6366f1" />
                <KPI label="Collected" value={totalReceived.toFixed(3)} color="#10b981" />
                <KPI label="Outstanding" value={(totalContract-totalReceived).toFixed(3)} color="#f59e0b" />
              </div>
              {projWithSched.map((p, i) => {
                const pct = p.amount>0?Math.round((p.received/p.amount)*100):0;
                return (
                  <div key={p.id} style={{ marginBottom: 16, background: i%2===0?"#fff":"#f8fafc", borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <div><div style={{ fontWeight: 700, color: "#1e293b" }}>{p.name}</div><div style={{ fontSize: 12, color: "#64748b" }}>{p.customer}</div></div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#10b981", fontWeight: 700 }}>OMR {p.received.toFixed(3)}</div>
                        <div style={{ fontSize: 11, color: "#f59e0b" }}>OMR {(p.amount-p.received).toFixed(3)} pending</div>
                      </div>
                    </div>
                    <div style={{ background: "#e2e8f0", borderRadius: 4, height: 8 }}>
                      <div style={{ width: `${pct}%`, background: pct>=100?"#10b981":"#6366f1", borderRadius: 4, height: 8 }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{pct}% of OMR {parseFloat(p.amount).toFixed(3)} collected</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Report Footer */}
          <div style={{ marginTop: 28, paddingTop: 14, borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8" }}>
            <span>Minarva Biz ERP · SEVENSEAS Modern Enterprises · Barka, Oman</span>
            <span>Generated: {new Date().toLocaleString("en-OM")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
