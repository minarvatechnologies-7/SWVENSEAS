import { supabase } from "./supabase";

/* List of every table that supports soft-delete (has a deleted_at column). */
export const SOFT_DELETE_TABLES = [
  "projects", "subcontractors", "invoices", "invoice_line_items",
  "bp_suppliers", "commissions", "ledger", "sub_milestones", "schedules",
  "salary_payments", "bp_bills", "bp_bill_items", "attendance", "payroll",
  "material_requests", "material_request_items", "inventory_items",
  "equipment", "employees", "bp_recurring", "bp_recurring_payments",
  "bp_payments", "bank_accounts", "app_users", "labour_supply_payments",
  "credit_purchases", "credit_payments",
];

/* Friendly display names for the Trash page */
export const TABLE_LABELS = {
  projects: "Project", subcontractors: "Subcontractor", invoices: "Invoice/Quotation",
  invoice_line_items: "Invoice Line Item", bp_suppliers: "Supplier", commissions: "Commission",
  ledger: "Cashbook Entry", sub_milestones: "Subcontractor Milestone", schedules: "Project Milestone",
  salary_payments: "Salary Payment", bp_bills: "Bill", bp_bill_items: "Bill Item",
  attendance: "Attendance Record", payroll: "Payroll Record", material_requests: "Material Request",
  material_request_items: "Material Request Item", inventory_items: "Inventory Item",
  equipment: "Equipment", employees: "Employee", bp_recurring: "Recurring Expense",
  bp_recurring_payments: "Recurring Payment", bp_payments: "Bill Payment", bank_accounts: "Bank Account",
  app_users: "User", labour_supply_payments: "Labour Supply Payment",
  credit_purchases: "Credit Purchase", credit_payments: "Credit Payment",
};

/* Soft-delete a row: marks it deleted_at = now() instead of removing it from the database.
   Use this everywhere instead of supabase.from(table).delete().eq("id", id). */
export async function softDelete(table, id) {
  return supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", id);
}

/* Restore a soft-deleted row */
export async function restoreDeleted(table, id) {
  return supabase.from(table).update({ deleted_at: null }).eq("id", id);
}

/* Permanently delete a row that's already in the trash (hard delete) */
export async function permanentlyDelete(table, id) {
  return supabase.from(table).delete().eq("id", id);
}

/* For each table: which field to show as the main label, and (optionally) an amount field */
export const DISPLAY_FIELDS = {
  projects: { label: "name", sub: "customer", amount: "amount", date: "created_at" },
  subcontractors: { label: "name", sub: "specialty", amount: "contract_amount", date: "created_at" },
  invoices: { label: "invoice_number", sub: "client_name", amount: "grand_total", date: "invoice_date" },
  invoice_line_items: { label: "description", sub: null, amount: "amount", date: null },
  bp_suppliers: { label: "name", sub: "category", amount: "opening_balance", date: "created_at" },
  commissions: { label: "agent_name", sub: "project_name", amount: "computed_payout", date: "commission_date" },
  ledger: { label: "description", sub: "payee", amount: "amount", date: "entry_date" },
  sub_milestones: { label: "label", sub: null, amount: "amount", date: "milestone_date" },
  schedules: { label: "label", sub: null, amount: "amount", date: "payment_date" },
  salary_payments: { label: "payment_type", sub: null, amount: "amount", date: "payment_date" },
  bp_bills: { label: "bill_number", sub: null, amount: "total_amount", date: "bill_date" },
  bp_bill_items: { label: "description", sub: null, amount: "amount", date: null },
  attendance: { label: "employee_name", sub: "status", amount: null, date: "att_date" },
  payroll: { label: "employee_name", sub: "period_label", amount: "net_salary", date: "period_start" },
  material_requests: { label: "request_number", sub: "site", amount: "total_value", date: "created_at" },
  material_request_items: { label: "item_name", sub: null, amount: "estimated_cost", date: null },
  inventory_items: { label: "name", sub: "category", amount: "cost_per_unit", date: null },
  equipment: { label: "name", sub: "current_site", amount: null, date: null },
  employees: { label: "name", sub: "phone", amount: "daily_rate", date: "created_at" },
  bp_recurring: { label: "name", sub: "expense_type", amount: "amount", date: "start_date" },
  bp_recurring_payments: { label: "period_month", sub: null, amount: "amount", date: "payment_date" },
  bp_payments: { label: "notes", sub: null, amount: "amount", date: "payment_date" },
  bank_accounts: { label: "account_name", sub: "account_number", amount: "opening_balance", date: null },
  app_users: { label: "display_name", sub: "username", amount: null, date: "created_at" },
  labour_supply_payments: { label: "subcontractor", sub: "notes", amount: "amount", date: "payment_date" },
  credit_purchases: { label: "supplier", sub: null, amount: "amount", date: "purchase_date" },
  credit_payments: { label: "notes", sub: null, amount: "amount", date: "payment_date" },
};
