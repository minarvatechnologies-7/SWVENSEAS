import { supabase, fetchAllRows } from "./supabase";

// Hardcoded fallback accounts (used if DB table not yet created)
const FALLBACK_ACCOUNTS = [
  { id: "account-company-001", account_name: "Company Account", account_number: "0358064530530019", is_active: true, opening_balance: 0 },
  { id: "account-sandeep-002", account_name: "Sandeep Account", account_number: "", is_active: true, opening_balance: 0 },
];

const OPENING_KEY = "account_opening_balances"; // app_settings key: { accountName: balance }

// Read opening-balance overrides from app_settings (works even without bank_accounts table)
async function getOpeningOverrides() {
  try {
    const { data } = await supabase.from("app_settings").select("value").eq("key", OPENING_KEY).maybeSingle();
    if (data && data.value) {
      const parsed = JSON.parse(data.value);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {}
  return {};
}

// Save an opening balance for an account by NAME into app_settings
export async function setOpeningBalance(accountName, balance) {
  const overrides = await getOpeningOverrides();
  overrides[accountName] = parseFloat(balance) || 0;
  const value = JSON.stringify(overrides);
  // Check if the row exists first, then insert or update accordingly
  const { data: existing, error: selErr } = await supabase
    .from("app_settings").select("key").eq("key", OPENING_KEY).maybeSingle();
  if (selErr) {
    console.error("setOpeningBalance select error:", selErr);
    return { ok: false, error: selErr.message };
  }
  if (existing) {
    const { error } = await supabase.from("app_settings").update({ value }).eq("key", OPENING_KEY);
    if (error) { console.error("update error:", error); return { ok: false, error: error.message }; }
  } else {
    const { error } = await supabase.from("app_settings").insert({ key: OPENING_KEY, value });
    if (error) { console.error("insert error:", error); return { ok: false, error: error.message }; }
  }
  return { ok: true };
}

export async function getBankAccounts() {
  const overrides = await getOpeningOverrides();
  try {
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("account_name");
    if (error || !data || data.length === 0) {
      return FALLBACK_ACCOUNTS.map(a => ({ ...a, opening_balance: overrides[a.account_name] ?? a.opening_balance }));
    }
    // Deduplicate by account_name — keep only first occurrence of each name
    const seen = new Set();
    const unique = data.filter(a => {
      const key = (a.account_name || "").trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return unique.map(a => ({ ...a, opening_balance: overrides[a.account_name] ?? a.opening_balance }));
  } catch {
    return FALLBACK_ACCOUNTS.map(a => ({ ...a, opening_balance: overrides[a.account_name] ?? a.opening_balance }));
  }

}

export async function createLedgerEntry({
  bank_account_id,
  bank_accounts,
  type,
  category,
  description,
  payee,
  amount,
  entry_date,
  ref_voucher,
  site,
  project_id,
}) {
  if (!bank_account_id || !amount || !entry_date) return;
  const account = bank_accounts.find(a => a.id === bank_account_id);
  if (!account) return;

  try {
    await supabase.from("ledger").insert({
      entry_date,
      description,
      payee,
      type,
      category,
      amount: parseFloat(amount),
      payment_mode: account.account_name,
      bank_account_id: (typeof bank_account_id === "string" && bank_account_id.startsWith("account-")) ? null : bank_account_id,
      site: site || "",
      project_id: project_id || null,
      ref_voucher: ref_voucher || "",
      remarks: `Auto-entry from ${account.account_name}`,
    });
  } catch (e) {
    console.error("Ledger auto-entry failed:", e);
  }
}

export async function getAccountBalance(bank_account_id) {
  if (!bank_account_id) return 0;
  try {
    // Get account name + opening balance
    let accountName = "";
    let opening = 0;
    const overrides = await getOpeningOverrides();

    if (typeof bank_account_id === "string" && bank_account_id.startsWith("account-")) {
      const acc = FALLBACK_ACCOUNTS.find(a => a.id === bank_account_id);
      accountName = acc?.account_name || "";
      opening = parseFloat(overrides[accountName] ?? acc?.opening_balance ?? 0);
    } else {
      const { data: acc } = await supabase.from("bank_accounts").select("opening_balance, account_name").eq("id", bank_account_id).single();
      accountName = acc?.account_name || "";
      opening = parseFloat(overrides[accountName] ?? acc?.opening_balance ?? 0);
    }

    if (!accountName) return 0;

    const data = await fetchAllRows((from, to) =>
      supabase.from("ledger").select("type, amount, payment_mode, bank_account_id").is("deleted_at", null).range(from, to)
    );
    if (!data || data.length === 0) return opening;

    // EXACT MATCH: only entries where payment_mode matches this account name
    // (case/whitespace-insensitive, in case of duplicate accounts with slightly
    // different name casing/spacing) OR bank_account_id matches this account's DB id
    const norm = (s) => (s || "").trim().toLowerCase();
    const entries = data.filter(r =>
      norm(r.payment_mode) === norm(accountName) ||
      (bank_account_id && !bank_account_id.startsWith("account-") && r.bank_account_id === bank_account_id)
    );

    const credits = entries.filter(r => r.type === "Credits (Income)").reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const debits  = entries.filter(r => r.type === "Debits (Payouts)").reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    return parseFloat((opening + credits - debits).toFixed(3));
  } catch {
    return 0;
  }
}

// ── BATCHED: get all accounts + their balances in ONE pass ──
// Fetches accounts, overrides, and ledger ONCE (not per-account).
// Uses the SAME exact-match OR logic as getAccountBalance, in memory.
// Returns { accounts: [...], balances: { id: balance } }
export async function getAccountsWithBalances() {
  const norm = (s) => (s || "").trim().toLowerCase();
  const [overrides, accounts, ledger] = await Promise.all([
    getOpeningOverrides(),
    getBankAccounts(),
    fetchAllRows((from, to) =>
      supabase.from("ledger").select("type, amount, payment_mode, bank_account_id").is("deleted_at", null).range(from, to)
    ),
  ]);

  const balances = {};
  for (const acc of accounts) {
    const name = acc.account_name;
    const opening = parseFloat(overrides[name] ?? acc.opening_balance ?? 0);
    const isRealId = acc.id && !String(acc.id).startsWith("account-");
    // EXACT MATCH (same as getAccountBalance): payment_mode === name OR bank_account_id === id
    let credit = 0, debit = 0;
    for (const r of ledger) {
      const match = norm(r.payment_mode) === norm(name) || (isRealId && r.bank_account_id === acc.id);
      if (!match) continue;
      const amt = parseFloat(r.amount || 0);
      if (r.type === "Credits (Income)") credit += amt; else debit += amt;
    }
    balances[acc.id] = parseFloat((opening + credit - debit).toFixed(3));
  }
  return { accounts, balances };
}
