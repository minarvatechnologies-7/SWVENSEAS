import { supabase, fetchAllRows } from "./supabase";

// Hardcoded fallback accounts (used if DB table not yet created)
const FALLBACK_ACCOUNTS = [
  { id: "account-company-001", account_name: "Company Account", account_number: "0358064530530019", is_active: true, opening_balance: 0 },
  { id: "account-sandeep-002", account_name: "Sandeep Account", account_number: "", is_active: true, opening_balance: 0 },
];

const OPENING_KEY = "account_opening_balances"; // app_settings key: { accountName: balance }

const norm = (s) => (s || "").trim().toLowerCase();
const isFallbackId = (id) => typeof id === "string" && id.startsWith("account-");

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
      return FALLBACK_ACCOUNTS.map(a => ({
        ...a,
        opening_balance: overrides[a.account_name] ?? a.opening_balance,
      }));
    }
    // Deduplicate by account_name — keep only first occurrence of each name
    const seen = new Set();
    const unique = data.filter(a => {
      const key = norm(a.account_name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Prefer the DB opening_balance for real accounts. app_settings overrides
    // were a fallback when the bank_accounts table did not exist; applying them
    // on top of real rows (especially with value 0) was wiping legitimate openings.
    return unique.map(a => ({
      ...a,
      opening_balance: a.opening_balance != null && a.opening_balance !== ""
        ? parseFloat(a.opening_balance)
        : parseFloat(overrides[a.account_name] ?? 0),
    }));
  } catch {
    return FALLBACK_ACCOUNTS.map(a => ({
      ...a,
      opening_balance: overrides[a.account_name] ?? a.opening_balance,
    }));
  }
}

/**
 * Attribute a ledger row to exactly one account:
 * 1. If bank_account_id is set and matches this account → match
 * 2. Else if bank_account_id is set but points at a *different* known account → no match
 * 3. Else (no bank_account_id) → match by payment_mode name
 *
 * Using OR(payment_mode, bank_id) double-counted rows where payment_mode said
 * "Deepu A/c" but bank_account_id pointed at "Deepu(Company A/c)".
 */
function rowMatchesAccount(r, acc, knownIds) {
  const bid = r.bank_account_id;
  if (bid && !isFallbackId(bid)) {
    if (bid === acc.id) return true;
    // Points at some other real account — do not also match by name
    if (knownIds.has(bid)) return false;
  }
  return norm(r.payment_mode) === norm(acc.account_name);
}

function applyLedgerToBalance(opening, ledger, acc, knownIds) {
  let credit = 0, debit = 0;
  for (const r of ledger) {
    if (!rowMatchesAccount(r, acc, knownIds)) continue;
    const amt = parseFloat(r.amount || 0);
    if (r.type === "Credits (Income)") credit += amt;
    else if (r.type === "Debits (Payouts)") debit += amt;
    // ignore unknown types
  }
  return parseFloat((opening + credit - debit).toFixed(3));
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
      bank_account_id: isFallbackId(bank_account_id) ? null : bank_account_id,
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
    const { accounts, balances } = await getAccountsWithBalances();
    if (balances[bank_account_id] != null) return balances[bank_account_id];
    // Fallback path if id not in active list
    const acc = accounts.find(a => a.id === bank_account_id);
    if (!acc) return 0;
    return balances[acc.id] ?? 0;
  } catch {
    return 0;
  }
}

// ── BATCHED: get all accounts + their balances in ONE pass ──
export async function getAccountsWithBalances() {
  const [accounts, ledger] = await Promise.all([
    getBankAccounts(),
    fetchAllRows((from, to) =>
      supabase.from("ledger").select("type, amount, payment_mode, bank_account_id").is("deleted_at", null).range(from, to)
    ),
  ]);

  const knownIds = new Set(
    accounts.filter(a => a.id && !isFallbackId(a.id)).map(a => a.id)
  );

  const balances = {};
  for (const acc of accounts) {
    const opening = parseFloat(acc.opening_balance ?? 0);
    balances[acc.id] = applyLedgerToBalance(opening, ledger || [], acc, knownIds);
  }
  return { accounts, balances };
}
