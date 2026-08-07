import React, { useState, useEffect, useCallback } from "react";
import BankAccountSelect from "../components/BankAccountSelect";
import { getBankAccounts, createLedgerEntry } from "../lib/bankAccounts";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../context/AdminContext";

// ─── Constants ───────────────────────────────────────────────
const SUPPLIER_CATEGORIES = [
  { value: "Material Supplier", icon: "🛒", color: "#6366f1", bg: "#eef2ff" },
  { value: "Utility",           icon: "💡", color: "#f59e0b", bg: "#fffbeb" },
  { value: "Rent / Hire",       icon: "🚜", color: "#0ea5e9", bg: "#f0f9ff" },
  { value: "Subcontractor",     icon: "🔧", color: "#8b5cf6", bg: "#f5f3ff" },
  { value: "Other",             icon: "📦", color: "#64748b", bg: "#f8fafc" },
];

const RECURRING_TYPES = [
  { value: "Office Rent",     icon: "🏢", color: "#6366f1", bg: "#eef2ff" },
  { value: "Vehicle EMI",     icon: "🚗", color: "#ef4444", bg: "#fef2f2" },
  { value: "Equipment EMI",   icon: "🚜", color: "#f59e0b", bg: "#fffbeb" },
  { value: "Store Rent",      icon: "🏪", color: "#0ea5e9", bg: "#f0f9ff" },
  { value: "Camp Rent",       icon: "🏠", color: "#8b5cf6", bg: "#f5f3ff" },
  { value: "Loan / Finance",  icon: "🏦", color: "#10b981", bg: "#ecfdf5" },
  { value: "Other Fixed",     icon: "📌", color: "#64748b", bg: "#f8fafc" },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const VAT_RATE = 0.05;

// ─── Seed data from the Payment Pending Summary screenshot ───
const SEED_SUPPLIERS = [
  { name: "Shahid",                      category: "Subcontractor",    opening_balance: 90.44,   phone: "", cr_number: "", notes: "Sub-work pending payment" },
  { name: "Muhammad Naeem",              category: "Subcontractor",    opening_balance: 32.5,    phone: "", cr_number: "", notes: "Sub-work pending payment" },
  { name: "Praveen",                     category: "Subcontractor",    opening_balance: 170,      phone: "", cr_number: "", notes: "Sub-work pending payment" },
  { name: "Water Bill (Store)",          category: "Utility",          opening_balance: 6,        phone: "", cr_number: "", notes: "Water bill of Store" },
  { name: "Office Service",             category: "Other",             opening_balance: 12.5,    phone: "", cr_number: "", notes: "Cleaning payment on Office" },
  { name: "Water Bill (Amarath)",        category: "Utility",          opening_balance: 106,      phone: "", cr_number: "", notes: "Water Bill on Amarath site" },
  { name: "Water Bill (Sanaiya)",        category: "Utility",          opening_balance: 16,       phone: "", cr_number: "", notes: "Water bill for Sanaiya" },
  { name: "OMANTEL",                     category: "Utility",          opening_balance: 31.5,    phone: "", cr_number: "", notes: "WIFI payment" },
  { name: "ANTWROTE",                    category: "Material Supplier",opening_balance: 31.5,    phone: "", cr_number: "", notes: "Payment for Vat invoice" },
  { name: "Mussnah 2 Villa (Rent)",      category: "Rent / Hire",      opening_balance: 20,       phone: "", cr_number: "", notes: "Bhoom loader rent Mussanah" },
  { name: "326 Site",                    category: "Material Supplier",opening_balance: 83.6,    phone: "", cr_number: "", notes: "Bhoom loader, cement, wadi, aggregate materials" },
  { name: "Manumma Water",               category: "Utility",          opening_balance: 32,       phone: "", cr_number: "", notes: "Water payment for Manumma site" },
  { name: "Barka Site Water",            category: "Utility",          opening_balance: 45,       phone: "", cr_number: "", notes: "326 site water payment" },
  { name: "Water Bill (Office)",         category: "Utility",          opening_balance: 2.43,    phone: "", cr_number: "", notes: "Water payment for Office" },
  { name: "Mussanah (Electricity)",      category: "Utility",          opening_balance: 33,       phone: "", cr_number: "", notes: "Mussanah 2 villa electricity" },
  { name: "Generator Rent",              category: "Rent / Hire",      opening_balance: 93,       phone: "", cr_number: "", notes: "Payment to Generator rent" },
  { name: "IMRAN",                       category: "Subcontractor",    opening_balance: 230.4,   phone: "", cr_number: "", notes: "Payment of Plaster" },
  { name: "Mazood",                      category: "Subcontractor",    opening_balance: 929.8,   phone: "", cr_number: "", notes: "Cladding works (0092)" },
  { name: "DYNA ALATHAD ALRAYDT",        category: "Material Supplier",opening_balance: 128.5,   phone: "", cr_number: "", notes: "" },
  { name: "SPC",                         category: "Material Supplier",opening_balance: 809,      phone: "", cr_number: "", notes: "" },
  { name: "SERVICES INTERNATIONAL LLC",  category: "Material Supplier",opening_balance: 1055.9,  phone: "", cr_number: "OM1100478750", notes: "" },
  { name: "MUSCAT STAR",                 category: "Material Supplier",opening_balance: 3195.233,phone: "", cr_number: "OM1100049358", notes: "" },
  { name: "Global Stages International", category: "Material Supplier",opening_balance: 3920.5,  phone: "", cr_number: "OM1100410406", notes: "" },
  { name: "Ali Yousaf TRADING CO.LLC",   category: "Material Supplier",opening_balance: 14906.337,phone:"", cr_number: "", notes: "" },
  { name: "Tipper",                      category: "Rent / Hire",      opening_balance: 14.75,   phone: "", cr_number: "", notes: "" },
  { name: "AL SOMHAN NATIONAL ENTERPRISES", category: "Material Supplier", opening_balance: 80,  phone: "", cr_number: "", notes: "" },
  { name: "Najoom AL SAAH TRADING LLC",  category: "Material Supplier",opening_balance: 155,      phone: "", cr_number: "", notes: "" },
];

const SITES = ["Barka","Mussanah","Amarath","Sanaiya","Manumma","326 Site","Office","Store","Other"];

const emptySuppForm = () => ({ name:"", category:"Material Supplier", phone:"", cr_number:"", notes:"", opening_balance:"0" });
const emptyBillForm = () => ({
  supplier_id:"", bill_date: new Date().toISOString().split("T")[0], bill_number:"",
  payment_type:"credit", bank_account_id:"", notes:"", due_date:"", discount_value:"", discount_type:"amount",
  items: [{ description:"", quantity:"1", unit:"pcs", rate:"", site:"", has_vat:false }]
});
const UNITS = ["pcs","bag","ton","kg","m","m²","m³","trip","load","hr","day","lot","set"];
const emptyRecForm = () => ({ name:"", expense_type:"Office Rent", amount:"", frequency:"Monthly", due_day:"1", site:"", notes:"", start_date: new Date().toISOString().split("T")[0] });

const catInfo = (val) => SUPPLIER_CATEGORIES.find(c=>c.value===val) || SUPPLIER_CATEGORIES[SUPPLIER_CATEGORIES.length-1];
const recInfo = (val) => RECURRING_TYPES.find(c=>c.value===val) || RECURRING_TYPES[RECURRING_TYPES.length-1];
const fmtOMR  = (n) => `OMR ${parseFloat(n||0).toFixed(3)}`;

const STATUS_STYLE = {
  "Paid":    { bg:"#ecfdf5", c:"#10b981" },
  "Partial": { bg:"#fffbeb", c:"#f59e0b" },
  "Pending": { bg:"#fef2f2", c:"#ef4444" },
};

// ─── Main Component ──────────────────────────────────────────
export default function BillsPayables() {
  const { isAdmin: realIsAdmin, canEdit, setShowLogin, confirmAction, logActivity } = useAdmin();
  const isAdmin = canEdit("creditpurchases");

  const [tab, setTab]               = useState("suppliers");
  const [suppliers, setSuppliers]   = useState([]);
  const [bills, setBills]           = useState([]);
  const [billItems, setBillItems]   = useState([]);
  const [payments, setPayments]     = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [seeding, setSeeding]       = useState(false);

  // Forms
  const [showSuppForm, setShowSuppForm] = useState(false);
  const [suppForm, setSuppForm]     = useState(emptySuppForm());
  const [editingSupp, setEditingSupp] = useState(null);

  const [showBillForm, setShowBillForm] = useState(false);
  const [billForm, setBillForm]     = useState(emptyBillForm());
  const [editingBill, setEditingBill] = useState(null);

  // Recurring state
  const [recurring, setRecurring]   = useState([]);
  const [recPayments, setRecPayments] = useState([]);
  const [showRecForm, setShowRecForm] = useState(false);
  const [recForm, setRecForm]       = useState(emptyRecForm());
  const [editingRec, setEditingRec] = useState(null);

  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState("");

  // Filters
  const [filterCat, setFilterCat]   = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [search, setSearch]         = useState("");
  const [billFilter, setBillFilter] = useState("All"); // supplier filter on bills tab
  const [billSearch, setBillSearch] = useState("");
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  const showMsg = (m) => { setMsg(m); setTimeout(()=>setMsg(""),4000); };

  // ── Load ──
  const loadAll = useCallback(async () => {
    setLoading(true);
    const [s, b, p, ba, r, rp, bi] = await Promise.all([
      supabase.from("bp_suppliers").select("*").is("deleted_at",null).order("name"),
      supabase.from("bp_bills").select("*").is("deleted_at",null).order("bill_date",{ascending:false}),
      supabase.from("bp_payments").select("*").is("deleted_at",null).order("payment_date",{ascending:false}),
      getBankAccounts(),
      supabase.from("bp_recurring").select("*").is("deleted_at",null).order("name"),
      supabase.from("bp_recurring_payments").select("*").is("deleted_at",null).order("payment_date",{ascending:false}),
      supabase.from("bp_bill_items").select("*").is("deleted_at",null),
    ]);
    setSuppliers(s.data||[]);
    setBills(b.data||[]);
    setPayments(p.data||[]);
    setBankAccounts(ba);
    setRecurring(r.data||[]);
    setRecPayments(rp.data||[]);
    setBillItems(bi.data||[]);
    setLoading(false);
  }, []);

  useEffect(()=>{ loadAll(); },[loadAll]);

  // ── Seed initial data ──
  const handleSeed = async () => {
    if (!isAdmin) { setShowLogin(true); return; }
    setSeeding(true);
    // Check if already seeded
    const { data: existing } = await supabase.from("bp_suppliers").select("id").limit(1);
    if (existing && existing.length > 0) {
      showMsg("⚠️ Suppliers already exist. Add new ones manually.");
      setSeeding(false); return;
    }
    const rows = SEED_SUPPLIERS.map(s => ({
      name: s.name, category: s.category, phone: s.phone,
      cr_number: s.cr_number, notes: s.notes,
      opening_balance: parseFloat(s.opening_balance)||0,
    }));
    const { error } = await supabase.from("bp_suppliers").insert(rows);
    if (error) showMsg("❌ "+error.message);
    else showMsg("✅ "+rows.length+" suppliers seeded from opening data!");
    await loadAll(); setSeeding(false);
  };

  // ── Calculations ──
  const getBillsPaid   = (billId) => payments.filter(p=>p.bill_id===billId).reduce((s,p)=>s+parseFloat(p.amount||0),0);
  const getBillBalance = (bill)   => parseFloat(bill.total_amount||0) - getBillsPaid(bill.id);
  const getBillStatus  = (bill)   => {
    const bal = getBillBalance(bill);
    if (bal <= 0.001) return "Paid";
    if (getBillsPaid(bill.id) > 0) return "Partial";
    return "Pending";
  };

  const getSupplierBalance = (suppId) => {
    const supp = suppliers.find(s=>s.id===suppId);
    const opening = parseFloat(supp?.opening_balance||0);
    const billTotal = bills.filter(b=>b.supplier_id===suppId).reduce((s,b)=>s+parseFloat(b.total_amount||0),0);
    const paidTotal = payments.filter(p=>p.supplier_id===suppId)
                          .reduce((s,p)=>s+parseFloat(p.amount||0),0);
    return opening + billTotal - paidTotal;
  };

  // ── VAT calculation ──
  const calcAmounts = (amountStr, amountType) => {
    const base = parseFloat(amountStr)||0;
    if (amountType === "with_vat") {
      const net  = base / (1 + VAT_RATE);
      const vat  = base - net;
      return { net_amount: net, vat_amount: vat, total_amount: base };
    } else {
      const vat   = base * VAT_RATE;
      return { net_amount: base, vat_amount: vat, total_amount: base + vat };
    }
  };

  // ── Save Supplier ──
  const saveSupplier = async () => {
    if (!isAdmin) { setShowLogin(true); return; }
    if (!suppForm.name.trim()) { showMsg("❌ Supplier name required"); return; }
    setSaving(true);
    const row = { name: suppForm.name.trim(), category: suppForm.category, phone: suppForm.phone, cr_number: suppForm.cr_number, notes: suppForm.notes, opening_balance: parseFloat(suppForm.opening_balance)||0 };
    let error;
    if (editingSupp) {
      ({ error } = await supabase.from("bp_suppliers").update(row).eq("id", editingSupp));
    } else {
      ({ error } = await supabase.from("bp_suppliers").insert(row));
    }
    if (error) showMsg("❌ "+error.message);
    else {
      logActivity(editingSupp?"Edited supplier":"Added supplier", `${row.name} — Opening OMR ${row.opening_balance.toFixed(3)}`, "Bills & Payables");
      showMsg("✅ Supplier saved!"); setShowSuppForm(false); setSuppForm(emptySuppForm()); setEditingSupp(null);
    }
    await loadAll(); setSaving(false);
  };

  const deleteSupplier = (id) => {
    if (!isAdmin) { setShowLogin(true); return; }
    confirmAction("Move this supplier (and all their bills/payments) to Trash? You can restore it later from the Trash page.", async () => {
      const now = new Date().toISOString();
      const billIds = bills.filter(b=>b.supplier_id===id).map(b=>b.id);
      // Remove Cashbook ledger entries tied to this supplier's bill payments.
      if (billIds.length) {
        const { data: suppPays } = await supabase.from("bp_payments").select("id").in("bill_id", billIds).is("deleted_at",null);
        for (const bp of (suppPays||[])) {
          const voucher = `BILL-${(bp.id||"").substring(0,8).toUpperCase()}`;
          await supabase.from("ledger").update({deleted_at:now}).eq("ref_voucher", voucher).is("deleted_at", null);
        }
      }
      if (billIds.length) await supabase.from("bp_payments").update({deleted_at:now}).in("bill_id", billIds);
      await supabase.from("bp_bills").update({deleted_at:now}).eq("supplier_id", id);
      await supabase.from("bp_suppliers").update({deleted_at:now}).eq("id", id);
      logActivity("Moved supplier to Trash", suppliers.find(s=>s.id===id)?.name||"", "Bills & Payables");
      await loadAll();
    });
  };

  // ── Save Bill ──
  const saveBill = async () => {
    if (!isAdmin) { setShowLogin(true); return; }
    if (!billForm.supplier_id) { showMsg("❌ Select a supplier"); return; }
    const validItems = billForm.items.filter(it => it.description && parseFloat(it.rate)>0);
    if (validItems.length === 0) { showMsg("❌ Add at least one item"); return; }
    setSaving(true);

    // Calculate totals from items
    let totalNet = 0, totalVat = 0, totalAmount = 0;
    const itemRows = validItems.map(it => {
      const qty = parseFloat(it.quantity) || 1;
      const rate = parseFloat(it.rate) || 0;
      const lineNet = qty * rate;
      const lineVat = it.has_vat ? lineNet * VAT_RATE : 0;
      const lineTotal = lineNet + lineVat;
      totalNet += lineNet; totalVat += lineVat; totalAmount += lineTotal;
      return { description: it.description, quantity: qty, unit: it.unit || "pcs", rate, amount: lineNet, site: it.site || "", has_vat: !!it.has_vat, vat_amount: lineVat, total_amount: lineTotal };
    });

    const isPaid = billForm.payment_type === "cash";
    const sites = [...new Set(itemRows.map(r=>r.site).filter(Boolean))].join(", ");
    const desc  = itemRows.length===1 ? itemRows[0].description : `${itemRows.length} items`;
    const dVal = parseFloat(billForm.discount_value) || 0; let discAmt = 0;
    if (dVal > 0) discAmt = billForm.discount_type === "percent" ? (totalAmount * dVal / 100) : dVal;
    if (discAmt > totalAmount) discAmt = totalAmount; discAmt = parseFloat(discAmt.toFixed(3));
    const finalTotal = parseFloat((totalAmount - discAmt).toFixed(3));

    const row = {
      supplier_id: billForm.supplier_id,
      bill_date: billForm.bill_date,
      bill_number: billForm.bill_number,
      site: sites,
      description: desc,
      amount_type: totalVat > 0.001 ? "with_vat" : "without_vat",
      net_amount: totalNet, vat_amount: totalVat, discount_amount: discAmt, discount_type: billForm.discount_type, total_amount: finalTotal,
      payment_type: billForm.payment_type,
      notes: billForm.notes,
      due_date: billForm.due_date || null,
    };

    let billId;
    if (editingBill) {
      // EDIT mode: update header, replace items (keep existing payments/status)
      const existingPaid = payments.filter(p=>p.bill_id===editingBill).reduce((s,p)=>s+parseFloat(p.amount||0),0);
      row.status = existingPaid >= finalTotal - 0.001 ? "Paid" : existingPaid > 0 ? "Partial" : "Pending";
      const { error } = await supabase.from("bp_bills").update(row).eq("id", editingBill);
      if (error) { showMsg("❌ "+error.message); setSaving(false); return; }
      await supabase.from("bp_bill_items").delete().eq("bill_id", editingBill);
      const itemsWithBillId = itemRows.map(it => ({ ...it, bill_id: editingBill }));
      await supabase.from("bp_bill_items").insert(itemsWithBillId);
      logActivity("Edited bill", `${suppliers.find(s=>s.id===billForm.supplier_id)?.name||""} — OMR ${finalTotal.toFixed(3)}`, "Bills & Payables");
      showMsg("✅ Bill updated!");
      setShowBillForm(false); setBillForm(emptyBillForm()); setEditingBill(null);
      await loadAll(); setSaving(false);
      return;
    }

    row.status = isPaid ? "Paid" : "Pending";
    const { data: inserted, error } = await supabase.from("bp_bills").insert(row).select().single();
    if (error) { showMsg("❌ "+error.message); setSaving(false); return; }
    billId = inserted.id;

    // Insert line items
    const itemsWithBillId = itemRows.map(it => ({ ...it, bill_id: billId }));
    await supabase.from("bp_bill_items").insert(itemsWithBillId);

    // If cash payment → auto create payment record + ledger entry
    if (isPaid && billForm.bank_account_id) {
      const { data: bpPayData } = await supabase.from("bp_payments").insert({
        bill_id: billId, supplier_id: billForm.supplier_id,
        amount: finalTotal, payment_date: billForm.bill_date,
        bank_account_id: billForm.bank_account_id, notes: "Paid at time of bill entry",
      }).select().single();
      const supp = suppliers.find(s=>s.id===billForm.supplier_id);
      const ci = catInfo(supp?.category);
      await createLedgerEntry({
        bank_account_id: billForm.bank_account_id, bank_accounts: bankAccounts,
        type: "Debits (Payouts)", category: supp?.category || "Supplier Payment",
        description: `${ci.icon} ${supp?.name||""} — ${desc}`,
        payee: supp?.name||"", amount: finalTotal, entry_date: billForm.bill_date, site: sites,
        ref_voucher: `BILL-${(bpPayData?.id||"").substring(0,8).toUpperCase()}`,
      });
      await supabase.from("bp_bills").update({status:"Paid"}).eq("id",billId);
    }

    showMsg("✅ Bill saved!" + (isPaid ? " Ledger updated." : ` ${validItems.length} items added to credit.`));
    logActivity("Added bill", `${suppliers.find(s=>s.id===billForm.supplier_id)?.name||""} — OMR ${finalTotal.toFixed(3)}${isPaid?" (paid)":""}`, "Bills & Payables");
    setShowBillForm(false); setBillForm(emptyBillForm()); setEditingBill(null);
    await loadAll(); setSaving(false);
  };

  // ── Delete Bill ──
  const deleteBill = (billId) => {
    if (!isAdmin) { setShowLogin(true); return; }
    confirmAction("Move this bill (and its items/payments) to Trash? You can restore it later from the Trash page.", async () => {
      const now = new Date().toISOString();
      // Remove the Cashbook ledger entries tied to this bill's payments, so the
      // Cashbook doesn't keep a payout for a bill that no longer exists.
      const { data: billPays } = await supabase.from("bp_payments").select("id").eq("bill_id", billId).is("deleted_at",null);
      for (const bp of (billPays||[])) {
        const voucher = `BILL-${(bp.id||"").substring(0,8).toUpperCase()}`;
        await supabase.from("ledger").update({deleted_at:now}).eq("ref_voucher", voucher).is("deleted_at", null);
      }
      await supabase.from("bp_bill_items").update({deleted_at:now}).eq("bill_id", billId);
      await supabase.from("bp_payments").update({deleted_at:now}).eq("bill_id", billId);
      await supabase.from("bp_bills").update({deleted_at:now}).eq("id", billId);
      logActivity("Moved bill to Trash", bills.find(b=>b.id===billId)?.bill_number||"", "Bills & Payables");
      await loadAll();
      showMsg("✅ Moved to Trash");
    });
  };

  // ── Edit Bill — load bill + items into form ──
  const startEditBill = (bill) => {
    if (!isAdmin) { setShowLogin(true); return; }
    const items = billItems.filter(it => it.bill_id === bill.id);
    setBillForm({
      supplier_id: bill.supplier_id || "",
      bill_date: bill.bill_date || new Date().toISOString().split("T")[0],
      bill_number: bill.bill_number || "",
      payment_type: bill.payment_type || "credit",
      bank_account_id: "",
      notes: bill.notes || "",
      due_date: bill.due_date || "", discount_value: bill.discount_amount ? String(bill.discount_amount) : "", discount_type: "amount",
      items: items.length > 0
        ? items.map(it => ({ description: it.description||"", quantity: String(it.quantity||1), unit: it.unit||"pcs", rate: String(it.rate||""), site: it.site||"", has_vat: !!it.has_vat }))
        : [{ description: bill.description||"", quantity:"1", unit:"pcs", rate: String(bill.net_amount||""), site: bill.site||"", has_vat: parseFloat(bill.vat_amount||0)>0 }],
    });
    setEditingBill(bill.id);
    setShowBillForm(true);
  };

  // Payments are recorded via the dedicated "Record Payment" page now (not from here).

  // ── Recurring: Save ──
  const saveRecurring = async () => {
    if (!isAdmin) { setShowLogin(true); return; }
    if (!recForm.name.trim()) { showMsg("❌ Name required"); return; }
    if (!recForm.amount)      { showMsg("❌ Enter amount"); return; }
    setSaving(true);
    const row = {
      name: recForm.name.trim(),
      expense_type: recForm.expense_type,
      amount: parseFloat(recForm.amount)||0,
      frequency: recForm.frequency,
      due_day: parseInt(recForm.due_day)||1,
      site: recForm.site,
      notes: recForm.notes,
      start_date: recForm.start_date || null,
      is_active: true,
    };
    let error;
    if (editingRec) {
      ({ error } = await supabase.from("bp_recurring").update(row).eq("id", editingRec));
    } else {
      ({ error } = await supabase.from("bp_recurring").insert(row));
    }
    if (error) showMsg("❌ "+error.message);
    else {
      logActivity(editingRec?"Edited recurring expense":"Added recurring expense", `${row.name} — OMR ${row.amount.toFixed(3)}/${row.frequency}`, "Bills & Payables");
      showMsg("✅ Saved!"); setShowRecForm(false); setRecForm(emptyRecForm()); setEditingRec(null);
    }
    await loadAll(); setSaving(false);
  };

  const deleteRecurring = (id) => {
    if (!isAdmin) { setShowLogin(true); return; }
    confirmAction("Move this recurring expense (and its payment history) to Trash?", async () => {
      const now = new Date().toISOString();
      await supabase.from("bp_recurring_payments").update({deleted_at:now}).eq("recurring_id", id);
      await supabase.from("bp_recurring").update({deleted_at:now}).eq("id", id);
      logActivity("Moved recurring expense to Trash", recurring.find(r=>r.id===id)?.name||"", "Bills & Payables");
      await loadAll();
    });
  };

  // Recurring payments are now recorded via the dedicated "Record Payment" page.

  const getRecPaidThisMonth = (recId, monthLabel) =>
    recPayments.filter(p=>p.recurring_id===recId && p.period_month===monthLabel)
               .reduce((s,p)=>s+parseFloat(p.amount||0),0);

  const getRecTotalPaid = (recId) =>
    recPayments.filter(p=>p.recurring_id===recId).reduce((s,p)=>s+parseFloat(p.amount||0),0);

  // ── Derived data ──
  const filteredSuppliers = suppliers.filter(s => {
    const catMatch = filterCat==="All" || s.category===filterCat;
    const searchMatch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch;
  });

  const filteredBills = bills.filter(b => {
    const statusMatch = filterStatus==="All" || getBillStatus(b)===filterStatus;
    const suppMatch   = billFilter==="All" || b.supplier_id===billFilter;
    const supp = suppliers.find(s=>s.id===b.supplier_id);
    const searchMatch = !billSearch ||
      (supp?.name||"").toLowerCase().includes(billSearch.toLowerCase()) ||
      (b.description||"").toLowerCase().includes(billSearch.toLowerCase()) ||
      (b.bill_number||"").toLowerCase().includes(billSearch.toLowerCase()) ||
      (b.site||"").toLowerCase().includes(billSearch.toLowerCase());
    const today = new Date().toISOString().split("T")[0];
    const isOverdue = getBillStatus(b)!=="Paid" && b.due_date && b.due_date < today;
    const overdueMatch = !showOverdueOnly || isOverdue;
    return statusMatch && suppMatch && searchMatch && overdueMatch;
  });

  // Summary KPIs
  const totalOpening  = suppliers.reduce((s,sup)=>s+parseFloat(sup.opening_balance||0),0);
  const totalBills    = bills.reduce((s,b)=>s+parseFloat(b.total_amount||0),0);
  const totalPaid     = payments.reduce((s,p)=>s+parseFloat(p.amount||0),0);
  const totalDue      = totalOpening + totalBills - totalPaid;

  const inp = { border:"1px solid #e2e8f0", borderRadius:8, padding:"9px 12px", fontSize:13, width:"100%", boxSizing:"border-box", outline:"none", background:"#fff" };
  const tabBtn = (id, label) => (
    <button onClick={()=>setTab(id)} style={{ padding:"10px 20px", borderRadius:"10px 10px 0 0", border:"none", cursor:"pointer", fontSize:13, fontWeight:700,
      background: tab===id ? "#fff" : "transparent",
      color: tab===id ? "#6366f1" : "#64748b",
      borderBottom: tab===id ? "2px solid #6366f1" : "2px solid transparent"
    }}>{label}</button>
  );

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div style={{padding:24, maxWidth:1300, margin:"0 auto"}}>

      {/* Header */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:12}}>
        <div>
          <div style={{fontSize:22, fontWeight:800, color:"#0f172a", marginBottom:4}}>💳 Bills &amp; Payables</div>
          <div style={{fontSize:13, color:"#64748b"}}>Supplier credit, bills, payments — auto ledger on every payment</div>
        </div>
        <div style={{display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
          {msg && <span style={{fontSize:13, fontWeight:600, color:msg.startsWith("✅")?"#10b981":"#ef4444", padding:"6px 12px", background:msg.startsWith("✅")?"#ecfdf5":"#fef2f2", borderRadius:8}}>{msg}</span>}
          {suppliers.length===0 && isAdmin && (
            <button onClick={handleSeed} disabled={seeding} style={{background:"#f59e0b", color:"#fff", border:"none", borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:600, cursor:"pointer"}}>
              {seeding?"Loading...":"📥 Load Opening Balances"}
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:20}}>
        {[
          ["OPENING BALANCE", fmtOMR(totalOpening), "#6366f1","#eef2ff"],
          ["NEW BILLS",       fmtOMR(totalBills),   "#0ea5e9","#f0f9ff"],
          ["TOTAL PAID",      fmtOMR(totalPaid),    "#10b981","#ecfdf5"],
          ["TOTAL DUE",       fmtOMR(totalDue),     "#ef4444","#fef2f2"],
        ].map(([l,v,c,bg])=>(
          <div key={l} style={{background:bg, borderRadius:12, padding:"14px 18px", border:`1px solid ${c}30`}}>
            <div style={{fontSize:10, color:"#64748b", fontWeight:600, letterSpacing:0.8, marginBottom:6}}>{l}</div>
            <div style={{fontSize:18, fontWeight:800, color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{borderBottom:"1px solid #e2e8f0", marginBottom:0, display:"flex", gap:4}}>
        {tabBtn("suppliers","🏪 Suppliers")}
        {tabBtn("bills","📄 Bills")}
        {tabBtn("recurring","🔁 Recurring")}
        {tabBtn("payments","💰 Payments")}
        {tabBtn("summary","📊 Summary")}
      </div>

      <div style={{background:"#fff", borderRadius:"0 12px 12px 12px", border:"1px solid #e2e8f0", borderTop:"none", padding:20}}>

        {/* ══════════════ SUPPLIERS TAB ══════════════ */}
        {tab==="suppliers" && (
          <div>
            {/* Toolbar */}
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10}}>
              <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search supplier..."
                  style={{...inp, width:200, flex:"0 0 200px"}} />
                <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{...inp, width:"auto"}}>
                  <option value="All">All Categories</option>
                  {SUPPLIER_CATEGORIES.map(c=><option key={c.value}>{c.value}</option>)}
                </select>
              </div>
              {isAdmin && (
                <button onClick={()=>{setShowSuppForm(true);setSuppForm(emptySuppForm());setEditingSupp(null);}}
                  style={{background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:600, cursor:"pointer"}}>
                  + Add Supplier
                </button>
              )}
            </div>

            {/* Supplier Form */}
            {showSuppForm && isAdmin && (
              <div style={{background:"#f8fafc", borderRadius:12, padding:20, marginBottom:16, border:"2px solid #6366f1"}}>
                <div style={{fontWeight:700, fontSize:14, color:"#0f172a", marginBottom:14}}>
                  {editingSupp ? "✏️ Edit Supplier" : "➕ New Supplier"}
                </div>
                {/* Category chips */}
                <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:14}}>
                  {SUPPLIER_CATEGORIES.map(c=>(
                    <button key={c.value} onClick={()=>setSuppForm(p=>({...p, category:c.value}))}
                      style={{padding:"6px 14px", borderRadius:20, border:`2px solid ${suppForm.category===c.value?c.color:"#e2e8f0"}`, background:suppForm.category===c.value?c.bg:"#fff", color:suppForm.category===c.value?c.color:"#64748b", fontWeight:600, fontSize:12, cursor:"pointer"}}>
                      {c.icon} {c.value}
                    </button>
                  ))}
                </div>
                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12}}>
                  {[["Name *","name","text"],["Phone","phone","text"],["VATIN","cr_number","text"],["Opening Balance (OMR)","opening_balance","number"]].map(([l,k,t])=>(
                    <div key={k}>
                      <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500}}>{l}</div>
                      <input type={t} value={suppForm[k]} onChange={e=>setSuppForm(p=>({...p,[k]:e.target.value}))} style={inp}
                        placeholder={k==="opening_balance"?"Amount currently owed...":""} step={t==="number"?"0.001":undefined}/>
                    </div>
                  ))}
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500}}>Notes</div>
                    <input value={suppForm.notes} onChange={e=>setSuppForm(p=>({...p,notes:e.target.value}))} style={inp} placeholder="Optional..." />
                  </div>
                </div>
                <div style={{display:"flex", gap:10, marginTop:14}}>
                  <button onClick={saveSupplier} disabled={saving} style={{background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontSize:13, fontWeight:600}}>{saving?"Saving...":"💾 Save"}</button>
                  <button onClick={()=>{setShowSuppForm(false);setEditingSupp(null);}} style={{background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontSize:13}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Suppliers Table */}
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:13, minWidth:700}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    {["Supplier / Party","Category","Phone","VATIN","Opening Bal","Bills Total","Paid","Balance Due",""].map(h=>(
                      <th key={h} style={{padding:"10px 14px", textAlign:"left", color:"#64748b", fontWeight:600, fontSize:11, whiteSpace:"nowrap", borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={9} style={{padding:40, textAlign:"center", color:"#94a3b8"}}>⏳ Loading...</td></tr>
                  : filteredSuppliers.length===0 ? (
                    <tr><td colSpan={9} style={{padding:40, textAlign:"center", color:"#94a3b8"}}>
                      {suppliers.length===0 ? <>No suppliers yet. Click <strong>"Load Opening Balances"</strong> to import from your records.</> : "No results."}
                    </td></tr>
                  ) : (
                    // Group by category
                    SUPPLIER_CATEGORIES
                      .map(cat => ({ cat, list: filteredSuppliers.filter(s => (s.category||"Other") === cat.value) }))
                      .filter(g => g.list.length > 0)
                      .map(({ cat, list }) => {
                        const grpOpening = list.reduce((t,s)=>t+parseFloat(s.opening_balance||0),0);
                        const grpBills   = list.reduce((t,s)=>t+bills.filter(b=>b.supplier_id===s.id).reduce((x,b)=>x+parseFloat(b.total_amount||0),0),0);
                        const grpPaid    = list.reduce((t,s)=>t+bills.filter(b=>b.supplier_id===s.id).reduce((x,b)=>x+getBillsPaid(b.id),0),0);
                        const grpDue     = list.reduce((t,s)=>t+getSupplierBalance(s.id),0);
                        return (
                          <React.Fragment key={cat.value}>
                            {/* Category heading */}
                            <tr style={{background:cat.bg}}>
                              <td colSpan={9} style={{padding:"8px 14px", fontWeight:800, fontSize:12, color:cat.color, letterSpacing:0.3}}>
                                {cat.icon} {cat.value.toUpperCase()} <span style={{fontWeight:500, color:"#94a3b8"}}>({list.length})</span>
                              </td>
                            </tr>
                            {list.map((s,i)=>{
                              const ci  = catInfo(s.category);
                              const bal = getSupplierBalance(s.id);
                              const myBills = bills.filter(b=>b.supplier_id===s.id);
                              const billsTotal = myBills.reduce((t,b)=>t+parseFloat(b.total_amount||0),0);
                              const paidTotal  = myBills.reduce((t,b)=>t+getBillsPaid(b.id),0);
                              return (
                                <tr key={s.id} style={{borderTop:"1px solid #f1f5f9", background:i%2===0?"#fff":"#fafbfc"}}>
                                  <td style={{padding:"11px 14px 11px 28px", fontWeight:700, color:"#1e293b"}}>{s.name}</td>
                                  <td style={{padding:"11px 14px"}}>
                                    <span style={{background:ci.bg, color:ci.color, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600}}>{ci.icon} {s.category}</span>
                                  </td>
                                  <td style={{padding:"11px 14px", color:"#64748b", fontSize:12}}>{s.phone||"—"}</td>
                                  <td style={{padding:"11px 14px", color:"#64748b", fontSize:12}}>{s.cr_number||"—"}</td>
                                  <td style={{padding:"11px 14px", color:"#6366f1", fontWeight:700}}>{parseFloat(s.opening_balance||0).toFixed(3)}</td>
                                  <td style={{padding:"11px 14px", color:"#0ea5e9", fontWeight:600}}>{billsTotal.toFixed(3)}</td>
                                  <td style={{padding:"11px 14px", color:"#10b981", fontWeight:600}}>{paidTotal.toFixed(3)}</td>
                                  <td style={{padding:"11px 14px", fontWeight:800, color:bal>0.001?"#ef4444":"#10b981", fontSize:14}}>{bal.toFixed(3)}</td>
                                  <td style={{padding:"11px 14px"}}>
                                    {isAdmin && (
                                      <div style={{display:"flex", gap:4}}>
                                        <button onClick={()=>{setEditingSupp(s.id);setSuppForm({name:s.name,category:s.category,phone:s.phone||"",cr_number:s.cr_number||"",notes:s.notes||"",opening_balance:s.opening_balance||0});setShowSuppForm(true);}}
                                          style={{background:"#eef2ff", color:"#6366f1", border:"none", borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:11}}>✏️</button>
                                        <button onClick={()=>deleteSupplier(s.id)}
                                          style={{background:"#fef2f2", color:"#ef4444", border:"none", borderRadius:6, padding:"4px 8px", cursor:"pointer", fontSize:11}}>🗑</button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                            {/* Category subtotal */}
                            <tr style={{borderTop:`1px solid ${cat.color}40`, background:"#fcfcfd"}}>
                              <td colSpan={4} style={{padding:"7px 14px 7px 28px", fontWeight:600, fontSize:11, color:cat.color}}>Subtotal — {cat.value}</td>
                              <td style={{padding:"7px 14px", fontWeight:700, color:"#6366f1", fontSize:12}}>{grpOpening.toFixed(3)}</td>
                              <td style={{padding:"7px 14px", fontWeight:700, color:"#0ea5e9", fontSize:12}}>{grpBills.toFixed(3)}</td>
                              <td style={{padding:"7px 14px", fontWeight:700, color:"#10b981", fontSize:12}}>{grpPaid.toFixed(3)}</td>
                              <td style={{padding:"7px 14px", fontWeight:800, color:"#ef4444", fontSize:12}}>{grpDue.toFixed(3)}</td>
                              <td></td>
                            </tr>
                          </React.Fragment>
                        );
                      })
                  )}
                </tbody>
                {filteredSuppliers.length>0 && (
                  <tfoot>
                    <tr style={{borderTop:"2px solid #e2e8f0", background:"#f8fafc"}}>
                      <td colSpan={4} style={{padding:"10px 14px", fontWeight:700}}>GRAND TOTAL ({filteredSuppliers.length})</td>
                      <td style={{padding:"10px 14px", fontWeight:800, color:"#6366f1"}}>{filteredSuppliers.reduce((s,sup)=>s+parseFloat(sup.opening_balance||0),0).toFixed(3)}</td>
                      <td style={{padding:"10px 14px", fontWeight:800, color:"#0ea5e9"}}>{filteredSuppliers.reduce((s,sup)=>s+bills.filter(b=>b.supplier_id===sup.id).reduce((t,b)=>t+parseFloat(b.total_amount||0),0),0).toFixed(3)}</td>
                      <td style={{padding:"10px 14px", fontWeight:800, color:"#10b981"}}>{filteredSuppliers.reduce((s,sup)=>s+bills.filter(b=>b.supplier_id===sup.id).reduce((t,b)=>t+getBillsPaid(b.id),0),0).toFixed(3)}</td>
                      <td style={{padding:"10px 14px", fontWeight:800, color:"#ef4444"}}>{filteredSuppliers.reduce((s,sup)=>s+getSupplierBalance(sup.id),0).toFixed(3)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ══════════════ BILLS TAB ══════════════ */}
        {tab==="bills" && (
          <div>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10}}>
              <div style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
                <input value={billSearch} onChange={e=>setBillSearch(e.target.value)} placeholder="🔍 Search bills..."
                  style={{...inp, width:180, flex:"0 0 180px"}} />
                <select value={billFilter} onChange={e=>setBillFilter(e.target.value)} style={{...inp, width:"auto", minWidth:160}}>
                  <option value="All">All Suppliers</option>
                  {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {["All","Pending","Partial","Paid"].map(s=>(
                  <button key={s} onClick={()=>setFilterStatus(s)} style={{padding:"6px 14px", borderRadius:20, border:"none", cursor:"pointer", fontSize:12, fontWeight:600, background:filterStatus===s?"#6366f1":"#f1f5f9", color:filterStatus===s?"#fff":"#64748b"}}>{s}</button>
                ))}
                <button onClick={()=>setShowOverdueOnly(!showOverdueOnly)} style={{padding:"6px 14px", borderRadius:20, border:"none", cursor:"pointer", fontSize:12, fontWeight:600, background:showOverdueOnly?"#ef4444":"#fef2f2", color:showOverdueOnly?"#fff":"#ef4444"}}>⚠ Overdue</button>
              </div>
              {isAdmin && (
                <button onClick={()=>{setShowBillForm(!showBillForm);setBillForm(emptyBillForm());setEditingBill(null);}}
                  style={{background:"#10b981", color:"#fff", border:"none", borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:600, cursor:"pointer"}}>
                  + Add Bill
                </button>
              )}
            </div>

            {/* Bill Form — Line Items */}
            {showBillForm && isAdmin && (
              <div style={{background:"#f0fdf4", borderRadius:12, padding:20, marginBottom:16, border:"2px solid #10b981"}}>
                <div style={{fontWeight:700, fontSize:14, color:"#0f172a", marginBottom:14}}>{editingBill ? "✏️ Edit Bill" : "📄 New Bill Entry — Line Items"}</div>
                {/* Header */}
                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:16}}>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:600}}>SUPPLIER *</div>
                    <select value={billForm.supplier_id} onChange={e=>setBillForm(p=>({...p,supplier_id:e.target.value}))} style={inp}>
                      <option value="">Select supplier...</option>
                      {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {billForm.supplier_id && (()=>{
                      const bal = getSupplierBalance(billForm.supplier_id);
                      return bal>0.001 ? <div style={{fontSize:11, marginTop:4, color:"#ef4444", fontWeight:600}}>⚠️ Already owed: OMR {bal.toFixed(3)}</div> : null;
                    })()}
                  </div>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:600}}>BILL DATE</div>
                    <input type="date" value={billForm.bill_date} onChange={e=>setBillForm(p=>({...p,bill_date:e.target.value}))} style={inp} />
                  </div>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:600}}>BILL / REF NO</div>
                    <input value={billForm.bill_number} onChange={e=>setBillForm(p=>({...p,bill_number:e.target.value}))} style={inp} placeholder="Optional..." />
                  </div>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:600}}>DUE DATE</div>
                    <input type="date" value={billForm.due_date} onChange={e=>setBillForm(p=>({...p,due_date:e.target.value}))} style={inp} />
                  </div>
                </div>

                {/* Line Items Table */}
                <div style={{fontSize:13, fontWeight:700, color:"#0f172a", marginBottom:8}}>📦 Bill Items</div>
                <div style={{overflowX:"auto", marginBottom:12}}>
                  <table style={{width:"100%", borderCollapse:"collapse", fontSize:12, border:"1px solid #e2e8f0", borderRadius:8, overflow:"hidden"}}>
                    <thead><tr style={{background:"#f8fafc"}}>
                      {["#","Description *","Qty","Unit","Rate (OMR)","Amount","Site / Project","VAT","Line Total",""].map(h=>(
                        <th key={h} style={{padding:"8px 10px", textAlign:"left", color:"#64748b", fontWeight:600, fontSize:10, borderBottom:"1px solid #e2e8f0", whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {billForm.items.map((item, idx) => {
                        const qty = parseFloat(item.quantity) || 0;
                        const rate = parseFloat(item.rate) || 0;
                        const lineNet = qty * rate;
                        const lineVat = item.has_vat ? lineNet * VAT_RATE : 0;
                        const lineTotal = lineNet + lineVat;
                        const upItem = (field, val) => setBillForm(p => {
                          const items = [...p.items];
                          items[idx] = { ...items[idx], [field]: val };
                          return { ...p, items };
                        });
                        return (
                          <tr key={idx} style={{borderTop:"1px solid #f1f5f9"}}>
                            <td style={{padding:"6px 8px", color:"#94a3b8", textAlign:"center"}}>{idx+1}</td>
                            <td style={{padding:"6px 8px"}}><input value={item.description} onChange={e=>upItem("description",e.target.value)} style={{...inp, fontSize:12, minWidth:140}} placeholder="Item name..." /></td>
                            <td style={{padding:"6px 8px"}}><input type="number" value={item.quantity} onChange={e=>upItem("quantity",e.target.value)} style={{...inp, fontSize:12, width:60}} min="0" step="0.1" /></td>
                            <td style={{padding:"6px 8px"}}><select value={item.unit} onChange={e=>upItem("unit",e.target.value)} style={{...inp, fontSize:11, width:65}}>{UNITS.map(u=><option key={u}>{u}</option>)}</select></td>
                            <td style={{padding:"6px 8px"}}><input type="number" value={item.rate} onChange={e=>upItem("rate",e.target.value)} style={{...inp, fontSize:12, width:90}} step="0.001" placeholder="0.000" /></td>
                            <td style={{padding:"6px 8px", fontWeight:600, color:"#0ea5e9", whiteSpace:"nowrap"}}>{lineNet>0 ? lineNet.toFixed(3) : "—"}</td>
                            <td style={{padding:"6px 8px"}}><select value={item.site||""} onChange={e=>upItem("site",e.target.value)} style={{...inp, fontSize:11, minWidth:100}}><option value="">Select...</option>{SITES.map(s=><option key={s}>{s}</option>)}</select></td>
                            <td style={{padding:"6px 8px", textAlign:"center"}}><input type="checkbox" checked={!!item.has_vat} onChange={e=>upItem("has_vat",e.target.checked)} style={{width:16, height:16, cursor:"pointer", accentColor:"#f59e0b"}} /></td>
                            <td style={{padding:"6px 8px", fontWeight:700, color:"#10b981", whiteSpace:"nowrap"}}>{lineTotal>0 ? lineTotal.toFixed(3) : "—"}</td>
                            <td style={{padding:"6px 8px"}}>
                              {billForm.items.length > 1 && (
                                <button onClick={()=>setBillForm(p=>({...p, items: p.items.filter((_,i)=>i!==idx)}))}
                                  style={{background:"#fef2f2", color:"#ef4444", border:"none", borderRadius:4, padding:"3px 6px", cursor:"pointer", fontSize:11}}>✕</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{borderTop:"2px solid #10b981", background:"#f0fdf4"}}>
                        <td colSpan={5} style={{padding:"8px 10px"}}>
                          <button onClick={()=>setBillForm(p=>({...p, items:[...p.items, {description:"",quantity:"1",unit:"pcs",rate:"",site:"",has_vat:false}]}))}
                            style={{background:"#10b981", color:"#fff", border:"none", borderRadius:6, padding:"5px 14px", cursor:"pointer", fontSize:12, fontWeight:600}}>
                            + Add Item
                          </button>
                        </td>
                        <td style={{padding:"8px 10px", fontWeight:700, color:"#0ea5e9"}}>
                          {billForm.items.reduce((s,it)=>{const q=parseFloat(it.quantity)||0;const r=parseFloat(it.rate)||0;return s+q*r;},0).toFixed(3)}
                        </td>
                        <td></td>
                        <td style={{padding:"8px 10px", fontWeight:700, color:"#f59e0b", textAlign:"center"}}>
                          {billForm.items.reduce((s,it)=>{const q=parseFloat(it.quantity)||0;const r=parseFloat(it.rate)||0;return s+(it.has_vat?q*r*VAT_RATE:0);},0).toFixed(3)}
                        </td>
                        <td style={{padding:"8px 10px", fontWeight:800, color:"#10b981", fontSize:14}}>
                          {billForm.items.reduce((s,it)=>{const q=parseFloat(it.quantity)||0;const r=parseFloat(it.rate)||0;const n=q*r;return s+n+(it.has_vat?n*VAT_RATE:0);},0).toFixed(3)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Discount + Totals */}
                {(() => {
                  const grand = billForm.items.reduce((s,it) => { const q=parseFloat(it.quantity)||0; const r=parseFloat(it.rate)||0; const n=q*r; return s+n+(it.has_vat?n*0.05:0); }, 0);
                  const dVal = parseFloat(billForm.discount_value)||0;
                  let disc = 0;
                  if (dVal > 0) disc = billForm.discount_type === "percent" ? grand*dVal/100 : dVal;
                  if (disc > grand) disc = grand;
                  const finalT = grand - disc;
                  return (
                    <div style={{ background:"#f8fafc", borderRadius:10, padding:"12px 16px", marginBottom:14, border:"1px solid #e2e8f0" }}>
                      <div style={{ display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap" }}>
                        <div style={{ flex:"1 1 200px" }}>
                          <div style={{ fontSize:12, color:"#64748b", marginBottom:4, fontWeight:600 }}>💸 DISCOUNT</div>
                          <div style={{ display:"flex", gap:6 }}>
                            <input type="number" value={billForm.discount_value} onChange={e=>setBillForm(p=>({...p,discount_value:e.target.value}))} step="0.001" placeholder="0.000" style={{...inp, flex:1}} />
                            <select value={billForm.discount_type} onChange={e=>setBillForm(p=>({...p,discount_type:e.target.value}))} style={{...inp, width:80}}>
                              <option value="amount">OMR</option>
                              <option value="percent">%</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ flex:"1 1 280px", textAlign:"right" }}>
                          <div style={{ fontSize:12, color:"#64748b" }}>Subtotal: <strong>OMR {grand.toFixed(3)}</strong></div>
                          {disc > 0.001 && <div style={{ fontSize:12, color:"#ef4444" }}>Discount: − OMR {disc.toFixed(3)}</div>}
                          <div style={{ fontSize:18, fontWeight:800, color:"#10b981", marginTop:2 }}>Grand Total: OMR {finalT.toFixed(3)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Payment type + Save */}
                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:14}}>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:8, fontWeight:600}}>PAYMENT TYPE</div>
                    <div style={{display:"flex", gap:8}}>
                      {[["credit","💳 Credit"],["cash","💵 Paid Now"]].map(([v,l])=>(
                        <button key={v} onClick={()=>setBillForm(p=>({...p,payment_type:v}))}
                          style={{flex:1, padding:"8px", borderRadius:8, border:`2px solid ${billForm.payment_type===v?(v==="credit"?"#ef4444":"#10b981"):"#e2e8f0"}`, background:billForm.payment_type===v?(v==="credit"?"#fef2f2":"#ecfdf5"):"#fff", color:billForm.payment_type===v?(v==="credit"?"#ef4444":"#10b981"):"#64748b", fontWeight:600, fontSize:12, cursor:"pointer"}}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {billForm.payment_type==="cash" && (
                    <div>
                      <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:600}}>PAY FROM</div>
                      <BankAccountSelect value={billForm.bank_account_id} onChange={v=>setBillForm(p=>({...p,bank_account_id:v}))} bankAccounts={bankAccounts} />
                    </div>
                  )}
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:600}}>NOTES</div>
                    <input value={billForm.notes} onChange={e=>setBillForm(p=>({...p,notes:e.target.value}))} style={inp} placeholder="Optional..." />
                  </div>
                </div>
                <div style={{display:"flex", gap:10}}>
                  <button onClick={saveBill} disabled={saving} style={{background:"#10b981", color:"#fff", border:"none", borderRadius:8, padding:"10px 22px", cursor:"pointer", fontSize:13, fontWeight:600}}>{saving?"Saving...":"💾 Save Bill"}</button>
                  <button onClick={()=>{setShowBillForm(false);setEditingBill(null);setBillForm(emptyBillForm());}} style={{background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, padding:"10px 14px", cursor:"pointer", fontSize:13}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Bills Table */}
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:13, minWidth:900}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    {["Date","Supplier","Bill No","Site","Description","Net","VAT","Total","Paid","Balance","Status","Actions"].map(h=>(
                      <th key={h} style={{padding:"10px 14px", textAlign:"left", color:"#64748b", fontWeight:600, fontSize:11, whiteSpace:"nowrap", borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={12} style={{padding:40, textAlign:"center", color:"#94a3b8"}}>⏳ Loading...</td></tr>
                  : filteredBills.length===0 ? <tr><td colSpan={12} style={{padding:40, textAlign:"center", color:"#94a3b8"}}>No bills found. Add bills using "+ Add Bill".</td></tr>
                  : filteredBills.map((b,i)=>{
                    const supp   = suppliers.find(s=>s.id===b.supplier_id);
                    const paid   = getBillsPaid(b.id);
                    const bal    = getBillBalance(b);
                    const status = getBillStatus(b);
                    const st     = STATUS_STYLE[status];
                    const myPays = payments.filter(p=>p.bill_id===b.id);
                    const today  = new Date().toISOString().split("T")[0];
                    const isOverdue = status!=="Paid" && b.due_date && b.due_date < today;
                    const daysOverdue = isOverdue ? Math.floor((new Date(today)-new Date(b.due_date))/86400000) : 0;
                    return (
                      <>
                        <tr key={b.id} style={{borderTop:"1px solid #f1f5f9", background:isOverdue?"#fff5f5":(i%2===0?"#fff":"#fafbfc")}}>
                          <td style={{padding:"10px 14px", color:"#64748b", whiteSpace:"nowrap"}}>
                            {b.bill_date}
                            {b.due_date && (
                              <div style={{fontSize:10, marginTop:2, color:isOverdue?"#ef4444":"#94a3b8", fontWeight:isOverdue?700:400}}>
                                {isOverdue ? `⚠ ${daysOverdue}d overdue` : `Due ${b.due_date}`}
                              </div>
                            )}
                          </td>
                          <td style={{padding:"10px 14px", fontWeight:700, color:"#1e293b"}}>{supp?.name||"—"}</td>
                          <td style={{padding:"10px 14px", color:"#64748b", fontSize:12}}>{b.bill_number||"—"}</td>
                          <td style={{padding:"10px 14px", color:"#64748b", fontSize:12}}>{b.site||"—"}</td>
                          <td style={{padding:"10px 14px", color:"#475569", fontSize:12, maxWidth:200}}>{b.description||"—"}</td>
                          <td style={{padding:"10px 14px", color:"#64748b"}}>{parseFloat(b.net_amount||0).toFixed(3)}</td>
                          <td style={{padding:"10px 14px", color:"#f59e0b", fontSize:12}}>{parseFloat(b.vat_amount||0).toFixed(3)}</td>
                          <td style={{padding:"10px 14px", fontWeight:700, color:"#6366f1"}}>{parseFloat(b.total_amount||0).toFixed(3)}</td>
                          <td style={{padding:"10px 14px", color:"#10b981", fontWeight:600}}>{paid.toFixed(3)}</td>
                          <td style={{padding:"10px 14px", fontWeight:700, color:bal>0.001?"#ef4444":"#10b981"}}>{bal.toFixed(3)}</td>
                          <td style={{padding:"10px 14px"}}>
                            <span style={{background:st.bg, color:st.c, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600}}>{status}</span>
                          </td>
                          <td style={{padding:"10px 14px"}}>
                            <div style={{display:"flex", gap:4}}>
                              {isAdmin && (
                                <button onClick={()=>startEditBill(b)}
                                  style={{background:"#eef2ff", color:"#6366f1", border:"none", borderRadius:6, padding:"5px 8px", cursor:"pointer", fontSize:11}}>✏️</button>
                              )}
                              {isAdmin && (
                                <button onClick={()=>deleteBill(b.id)}
                                  style={{background:"#fef2f2", color:"#ef4444", border:"none", borderRadius:6, padding:"5px 8px", cursor:"pointer", fontSize:11}}>🗑</button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Payment history (read-only) — record new payments from the Record Payment page */}
                        {myPays.length>0 && (
                          <tr key={`pf-${b.id}`}>
                            <td colSpan={12} style={{padding:"0 14px 14px"}}>
                              <div style={{background:"#f8fafc", borderRadius:10, padding:14, border:"1px solid #e2e8f0"}}>
                                <div style={{fontSize:11, color:"#64748b", fontWeight:600, marginBottom:6}}>Payments received against this bill:</div>
                                {myPays.map(py=>{
                                  const acc=bankAccounts.find(a=>a.id===py.bank_account_id);
                                  return (
                                    <div key={py.id} style={{display:"flex", gap:12, fontSize:12, color:"#475569", marginBottom:4, flexWrap:"wrap"}}>
                                      <span style={{color:"#94a3b8"}}>{py.payment_date}</span>
                                      <span style={{fontWeight:700, color:"#10b981"}}>OMR {parseFloat(py.amount).toFixed(3)}</span>
                                      {acc && <span style={{background:"#ecfdf5", color:"#10b981", borderRadius:10, padding:"1px 8px", fontSize:11}}>🏦 {acc.account_name}</span>}
                                      {py.notes && <span style={{color:"#94a3b8"}}>{py.notes}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}


        {/* ══════════════ RECURRING TAB ══════════════ */}
        {tab==="recurring" && (
          <div>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10}}>
              <div style={{fontSize:13, color:"#64748b"}}>Fixed monthly payments — office rent, vehicle EMI, equipment hire. Each payment tracked by month.</div>
              {isAdmin && (
                <button onClick={()=>{setShowRecForm(true);setRecForm(emptyRecForm());setEditingRec(null);}}
                  style={{background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"10px 18px", fontSize:13, fontWeight:600, cursor:"pointer"}}>
                  + Add Recurring
                </button>
              )}
            </div>

            {/* Recurring Form */}
            {showRecForm && isAdmin && (
              <div style={{background:"#f8fafc", borderRadius:12, padding:20, marginBottom:16, border:"2px solid #6366f1"}}>
                <div style={{fontWeight:700, fontSize:14, color:"#0f172a", marginBottom:14}}>
                  {editingRec ? "✏️ Edit Recurring Expense" : "➕ New Recurring Expense"}
                </div>
                {/* Type chips */}
                <div style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:14}}>
                  {RECURRING_TYPES.map(t=>(
                    <button key={t.value} onClick={()=>setRecForm(p=>({...p, expense_type:t.value}))}
                      style={{padding:"6px 14px", borderRadius:20, border:`2px solid ${recForm.expense_type===t.value?t.color:"#e2e8f0"}`, background:recForm.expense_type===t.value?t.bg:"#fff", color:recForm.expense_type===t.value?t.color:"#64748b", fontWeight:600, fontSize:12, cursor:"pointer"}}>
                      {t.icon} {t.value}
                    </button>
                  ))}
                </div>
                <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12}}>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500}}>Name / Description *</div>
                    <input value={recForm.name} onChange={e=>setRecForm(p=>({...p,name:e.target.value}))} style={inp} placeholder="e.g. Office Rent - Barka" />
                  </div>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500}}>Monthly Amount (OMR) *</div>
                    <input type="number" value={recForm.amount} onChange={e=>setRecForm(p=>({...p,amount:e.target.value}))} step="0.001" style={inp} placeholder="0.000" />
                  </div>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500}}>Frequency</div>
                    <select value={recForm.frequency} onChange={e=>setRecForm(p=>({...p,frequency:e.target.value}))} style={inp}>
                      <option>Monthly</option>
                      <option>Quarterly</option>
                      <option>Yearly</option>
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500}}>Due Day (of month)</div>
                    <input type="number" min="1" max="31" value={recForm.due_day} onChange={e=>setRecForm(p=>({...p,due_day:e.target.value}))} style={inp} placeholder="1" />
                  </div>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500}}>Site / Project</div>
                    <select value={recForm.site} onChange={e=>setRecForm(p=>({...p,site:e.target.value}))} style={inp}>
                      <option value="">Select site...</option>
                      {SITES.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500}}>Start Date</div>
                    <input type="date" value={recForm.start_date} onChange={e=>setRecForm(p=>({...p,start_date:e.target.value}))} style={inp} />
                  </div>
                  <div style={{gridColumn:"span 2"}}>
                    <div style={{fontSize:12, color:"#64748b", marginBottom:4, fontWeight:500}}>Notes</div>
                    <input value={recForm.notes} onChange={e=>setRecForm(p=>({...p,notes:e.target.value}))} style={inp} placeholder="Optional..." />
                  </div>
                </div>
                <div style={{display:"flex", gap:10, marginTop:14}}>
                  <button onClick={saveRecurring} disabled={saving} style={{background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontSize:13, fontWeight:600}}>{saving?"Saving...":"💾 Save"}</button>
                  <button onClick={()=>{setShowRecForm(false);setEditingRec(null);}} style={{background:"#f1f5f9", color:"#64748b", border:"none", borderRadius:8, padding:"9px 14px", cursor:"pointer", fontSize:13}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Recurring Cards */}
            {recurring.length===0 ? (
              <div style={{padding:40, textAlign:"center", color:"#94a3b8", background:"#f8fafc", borderRadius:12}}>
                No recurring expenses yet. Add office rent, vehicle EMI, etc. using "+ Add Recurring".
              </div>
            ) : (
              <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:14}}>
                {recurring.map(rec=>{
                  const ri = recInfo(rec.expense_type);
                  const totalPaid = getRecTotalPaid(rec.id);
                  const myPays = recPayments.filter(p=>p.recurring_id===rec.id);
                  const now = new Date();
                  const thisMonthLabel = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
                  const paidThisMonth = getRecPaidThisMonth(rec.id, thisMonthLabel);
                  const monthDone = paidThisMonth >= parseFloat(rec.amount)-0.001;
                  return (
                    <div key={rec.id} style={{background:"#fff", borderRadius:12, border:`1px solid ${ri.color}30`, overflow:"hidden"}}>
                      <div style={{background:ri.bg, padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
                        <div>
                          <div style={{fontWeight:700, fontSize:15, color:"#0f172a"}}>{ri.icon} {rec.name}</div>
                          <div style={{fontSize:11, color:ri.color, fontWeight:600, marginTop:2}}>{rec.expense_type} · {rec.frequency}</div>
                          {rec.site && <div style={{fontSize:11, color:"#64748b", marginTop:2}}>📍 {rec.site}</div>}
                        </div>
                        {isAdmin && (
                          <div style={{display:"flex", gap:4}}>
                            <button onClick={()=>{setEditingRec(rec.id);setRecForm({name:rec.name,expense_type:rec.expense_type,amount:rec.amount,frequency:rec.frequency,due_day:rec.due_day,site:rec.site||"",notes:rec.notes||"",start_date:rec.start_date||new Date().toISOString().split("T")[0]});setShowRecForm(true);}}
                              style={{background:"#fff", color:"#6366f1", border:"none", borderRadius:6, padding:"3px 8px", cursor:"pointer", fontSize:11}}>✏️</button>
                            <button onClick={()=>deleteRecurring(rec.id)}
                              style={{background:"#fff", color:"#ef4444", border:"none", borderRadius:6, padding:"3px 8px", cursor:"pointer", fontSize:11}}>🗑</button>
                          </div>
                        )}
                      </div>
                      <div style={{padding:"14px 16px"}}>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10}}>
                          <span style={{fontSize:22, fontWeight:800, color:ri.color}}>OMR {parseFloat(rec.amount).toFixed(3)}</span>
                          <span style={{fontSize:11, color:"#94a3b8"}}>due day {rec.due_day}</span>
                        </div>
                        {/* This month status */}
                        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:12, padding:"8px 12px", borderRadius:8, background:monthDone?"#ecfdf5":"#fef2f2"}}>
                          <span style={{fontSize:12, fontWeight:600, color:monthDone?"#10b981":"#ef4444"}}>
                            {monthDone ? "✓" : "⚠"} {thisMonthLabel}: {monthDone ? "Paid" : "Pending"}
                          </span>
                        </div>
                        {isAdmin && (
                          <div style={{padding:"7px 10px", background:"#eef2ff", borderRadius:8, fontSize:11, color:"#4338ca", textAlign:"center"}}>
                            💵 Record payments from the Record Payment page
                          </div>
                        )}

                        {/* Payment history */}
                        {myPays.length>0 && (
                          <div style={{marginTop:12, borderTop:"1px solid #f1f5f9", paddingTop:10}}>
                            <div style={{fontSize:11, color:"#64748b", fontWeight:600, marginBottom:6}}>Payment History ({myPays.length})</div>
                            <div style={{maxHeight:120, overflowY:"auto"}}>
                              {myPays.map(py=>{
                                const acc=bankAccounts.find(a=>a.id===py.bank_account_id);
                                return (
                                  <div key={py.id} style={{display:"flex", gap:8, fontSize:11, color:"#475569", marginBottom:5, alignItems:"center", flexWrap:"wrap"}}>
                                    <span style={{background:"#eef2ff", color:"#6366f1", borderRadius:8, padding:"1px 7px", fontWeight:600}}>{py.period_month}</span>
                                    <span style={{fontWeight:700, color:"#10b981"}}>OMR {parseFloat(py.amount).toFixed(3)}</span>
                                    <span style={{color:"#94a3b8"}}>{py.payment_date}</span>
                                    {acc && <span style={{color:"#10b981", fontSize:10}}>🏦 {acc.account_name}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}


        {/* ══════════════ PAYMENTS TAB ══════════════ */}
        {tab==="payments" && (
          <div>
            <div style={{marginBottom:14, fontSize:13, color:"#64748b"}}>All payments made to suppliers — each payment auto-recorded in ledger.</div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:13, minWidth:700}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    {["Date","Supplier","Amount (OMR)","Account","Notes"].map(h=>(
                      <th key={h} style={{padding:"10px 14px", textAlign:"left", color:"#64748b", fontWeight:600, fontSize:11, borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.length===0
                    ? <tr><td colSpan={5} style={{padding:40, textAlign:"center", color:"#94a3b8"}}>No payments recorded yet.</td></tr>
                    : payments.map((p,i)=>{
                      const supp = suppliers.find(s=>s.id===p.supplier_id);
                      const acc  = bankAccounts.find(a=>a.id===p.bank_account_id);
                      return (
                        <tr key={p.id} style={{borderTop:"1px solid #f1f5f9", background:i%2===0?"#fff":"#fafbfc"}}>
                          <td style={{padding:"10px 14px", color:"#64748b"}}>{p.payment_date}</td>
                          <td style={{padding:"10px 14px", fontWeight:700, color:"#1e293b"}}>{supp?.name||"—"}</td>
                          <td style={{padding:"10px 14px", fontWeight:700, color:"#10b981"}}>{parseFloat(p.amount).toFixed(3)}</td>
                          <td style={{padding:"10px 14px"}}>
                            {acc ? <span style={{background:"#ecfdf5", color:"#10b981", borderRadius:10, padding:"2px 10px", fontSize:11, fontWeight:600}}>🏦 {acc.account_name}</span> : "—"}
                          </td>
                          <td style={{padding:"10px 14px", color:"#94a3b8", fontSize:12}}>{p.notes||"—"}</td>
                        </tr>
                      );
                    })
                  }
                </tbody>
                {payments.length>0 && (
                  <tfoot>
                    <tr style={{borderTop:"2px solid #e2e8f0", background:"#f8fafc"}}>
                      <td colSpan={2} style={{padding:"10px 14px", fontWeight:700}}>TOTAL PAID</td>
                      <td style={{padding:"10px 14px", fontWeight:800, color:"#10b981"}}>{payments.reduce((s,p)=>s+parseFloat(p.amount||0),0).toFixed(3)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ══════════════ SUMMARY TAB ══════════════ */}
        {tab==="summary" && (
          <div>
            <div style={{fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:16}}>📊 Outstanding Balance by Supplier</div>
            {/* Category breakdown */}
            <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12, marginBottom:20}}>
              {SUPPLIER_CATEGORIES.map(cat=>{
                const catSupps = suppliers.filter(s=>s.category===cat.value);
                const catDue   = catSupps.reduce((s,sup)=>s+getSupplierBalance(sup.id),0);
                if (catDue<=0.001 && catSupps.length===0) return null;
                return (
                  <div key={cat.value} style={{background:cat.bg, borderRadius:12, padding:"14px 18px", border:`1px solid ${cat.color}30`}}>
                    <div style={{fontSize:11, color:"#64748b", fontWeight:600, marginBottom:6}}>{cat.icon} {cat.value.toUpperCase()}</div>
                    <div style={{fontSize:20, fontWeight:800, color:cat.color}}>{fmtOMR(catDue)}</div>
                    <div style={{fontSize:11, color:"#94a3b8", marginTop:2}}>{catSupps.length} parties</div>
                  </div>
                );
              })}
            </div>

            {/* Supplier-wise outstanding */}
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:13}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    {["Supplier","Category","Opening Balance","Bills Added","Total Paid","Balance Due"].map(h=>(
                      <th key={h} style={{padding:"10px 14px", textAlign:"left", color:"#64748b", fontWeight:600, fontSize:11, borderBottom:"1px solid #e2e8f0"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suppliers
                    .map(s=>({...s, bal:getSupplierBalance(s.id)}))
                    .sort((a,b)=>b.bal-a.bal)
                    .map((s,i)=>{
                      const ci = catInfo(s.category);
                      const billsTotal = bills.filter(b=>b.supplier_id===s.id).reduce((t,b)=>t+parseFloat(b.total_amount||0),0);
                      const paidTotal  = bills.filter(b=>b.supplier_id===s.id).reduce((t,b)=>t+getBillsPaid(b.id),0);
                      return (
                        <tr key={s.id} style={{borderTop:"1px solid #f1f5f9", background:s.bal>0?(i%2===0?"#fff":"#fafbfc"):"#ecfdf5"}}>
                          <td style={{padding:"10px 14px", fontWeight:700, color:"#1e293b"}}>{s.name}</td>
                          <td style={{padding:"10px 14px"}}>
                            <span style={{background:ci.bg, color:ci.color, borderRadius:20, padding:"2px 8px", fontSize:11, fontWeight:600}}>{ci.icon} {s.category}</span>
                          </td>
                          <td style={{padding:"10px 14px", color:"#6366f1"}}>{parseFloat(s.opening_balance||0).toFixed(3)}</td>
                          <td style={{padding:"10px 14px", color:"#0ea5e9"}}>{billsTotal.toFixed(3)}</td>
                          <td style={{padding:"10px 14px", color:"#10b981"}}>{paidTotal.toFixed(3)}</td>
                          <td style={{padding:"10px 14px", fontWeight:800, color:s.bal>0.001?"#ef4444":"#10b981", fontSize:14}}>
                            <div style={{display:"flex", alignItems:"center", gap:10}}>
                              <span>{s.bal.toFixed(3)}</span>
                              {s.bal<=0.001
                                ? <span style={{fontSize:10, background:"#ecfdf5", color:"#10b981", borderRadius:10, padding:"1px 6px"}}>✓ Cleared</span>
                                : null
                              }
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:"2px solid #e2e8f0", background:"#fef2f2"}}>
                    <td colSpan={2} style={{padding:"12px 14px", fontWeight:800, fontSize:14}}>TOTAL OUTSTANDING</td>
                    <td style={{padding:"12px 14px", fontWeight:800, color:"#6366f1"}}>{suppliers.reduce((s,sup)=>s+parseFloat(sup.opening_balance||0),0).toFixed(3)}</td>
                    <td style={{padding:"12px 14px", fontWeight:800, color:"#0ea5e9"}}>{bills.reduce((s,b)=>s+parseFloat(b.total_amount||0),0).toFixed(3)}</td>
                    <td style={{padding:"12px 14px", fontWeight:800, color:"#10b981"}}>{payments.reduce((s,p)=>s+parseFloat(p.amount||0),0).toFixed(3)}</td>
                    <td style={{padding:"12px 14px", fontWeight:800, color:"#ef4444", fontSize:16}}>{suppliers.reduce((s,sup)=>s+getSupplierBalance(sup.id),0).toFixed(3)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
