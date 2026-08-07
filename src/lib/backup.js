import { supabase } from "./supabase";

/* Every table that should be included in a full backup.
   This MUST stay in sync with the actual database schema — if a new
   table is added to the app, add it here too, or it will silently be
   left out of every backup (this caused a previous version of the
   backup to miss bp_* tables, bank_accounts, inventory, and equipment). */
export const BACKUP_TABLES = [
  "projects", "schedules", "employees", "attendance", "payroll", "ledger",
  "invoices", "invoice_line_items", "invoice_saved_items",
  "subcontractors", "sub_milestones", "commissions", "app_settings",
  "salary_payments", "bp_suppliers", "bp_bills", "bp_bill_items",
  "bp_payments", "bp_recurring", "bp_recurring_payments",
  "bank_accounts", "app_users", "labour_supply_payments",
  "material_requests", "material_request_items",
  "inventory_items", "inventory_transactions",
  "equipment", "equipment_schedule",
];

/* Fetches every row (including soft-deleted ones, so a restore is a true
   point-in-time snapshot) from every backup table. */
export async function buildFullBackup(companyName = "Minarva Biz") {
  const backup = { backup_date: new Date().toISOString(), version: "1.3", company: companyName, data: {} };
  for (const table of BACKUP_TABLES) {
    try {
      const { data, error } = await supabase.from(table).select("*");
      backup.data[table] = error ? [] : (data || []);
    } catch {
      backup.data[table] = [];
    }
  }
  return backup;
}

const RETAIN_SNAPSHOTS = 30; // keep this many days of automatic backups

/* Called once when the app loads. Checks if today's automatic backup
   already exists; if not, builds one and saves it to backup_snapshots.
   Silent — does not show any UI, does not block the page, and never
   throws (a failed background backup should never break the app).
   Also prunes snapshots older than RETAIN_SNAPSHOTS days. */
export async function runAutoBackupIfNeeded(companyName = "Minarva Biz") {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data: existing } = await supabase
      .from("backup_snapshots")
      .select("id")
      .eq("backup_date", today)
      .maybeSingle();
    if (existing) return { skipped: true };

    const backup = await buildFullBackup(companyName);
    const rowCount = Object.values(backup.data).reduce((s, rows) => s + (rows?.length || 0), 0);
    const json = JSON.stringify(backup);

    const { error } = await supabase.from("backup_snapshots").insert({
      backup_date: today,
      table_count: Object.keys(backup.data).length,
      row_count: rowCount,
      size_bytes: json.length,
      data: backup,
    });
    if (error) return { skipped: false, error: error.message };

    // Prune old snapshots beyond the retention window (best-effort, non-blocking)
    const { data: old } = await supabase
      .from("backup_snapshots")
      .select("id, backup_date")
      .order("backup_date", { ascending: false });
    if (old && old.length > RETAIN_SNAPSHOTS) {
      const toDelete = old.slice(RETAIN_SNAPSHOTS).map(r => r.id);
      if (toDelete.length) await supabase.from("backup_snapshots").delete().in("id", toDelete);
    }

    return { skipped: false, rowCount, tableCount: Object.keys(backup.data).length };
  } catch (e) {
    return { skipped: false, error: e.message };
  }
}

/* List recent backup snapshots (metadata only, not the full data — keeps the list fast) */
export async function listBackupSnapshots() {
  const { data, error } = await supabase
    .from("backup_snapshots")
    .select("id, backup_date, created_at, table_count, row_count, size_bytes")
    .order("backup_date", { ascending: false })
    .limit(RETAIN_SNAPSHOTS);
  return error ? [] : (data || []);
}

/* Fetch the full JSON data for one specific snapshot, for download/restore */
export async function getBackupSnapshot(id) {
  const { data, error } = await supabase.from("backup_snapshots").select("data").eq("id", id).single();
  return error ? null : data?.data;
}
