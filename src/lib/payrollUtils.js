// ─── PAYROLL UTILITY FUNCTIONS ───────────────────────────────────────────────
// Single source of truth. Used by Payroll.jsx AND Reports.jsx.
// Changing a calculation here affects BOTH pages consistently.

export const WORK_HOURS = 10; // working hours per day

export function getPeriodDates(year, month) {
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const nm = month === 11 ? 0 : month + 1;
  const ny = month === 11 ? year + 1 : year;
  const start = `${year}-${String(month+1).padStart(2,"0")}-26`;
  const end = `${ny}-${String(nm+1).padStart(2,"0")}-25`;
  const label = `${M[month]}-${M[nm]} (${year})`;
  return { start, end, label, year, month };
}

export function getCurrentPeriod() {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (day <= 25) {
    let m = month - 1, y = year;
    if (m < 0) { m = 11; y--; }
    return getPeriodDates(y, m);
  } else {
    return getPeriodDates(year, month);
  }
}

export function getSalaryPeriods() {
  const now = new Date(); const out = [];
  for (let i = 0; i < 24; i++) {
    let m = now.getMonth() - i, y = now.getFullYear();
    while (m < 0) { m += 12; y--; }
    out.push(getPeriodDates(y, m));
  }
  return out;
}

// Carry-forward anchor: the FIRST period whose opening balance comes from
// emp.opening_balance. For every period AFTER this, the opening balance is
// auto-calculated as the previous period's closing balance. Periods BEFORE
// this anchor have an opening balance of 0 (no data).
export const OPENING_BALANCE_ANCHOR = "2026-04-26"; // April–May 2026 period start

// Return the period object immediately before the given one.
export function getPrevPeriod(period) {
  let m = period.month - 1, y = period.year;
  if (m < 0) { m = 11; y--; }
  return getPeriodDates(y, m);
}

// Recursively compute an employee's opening balance for a period by chaining
// previous periods' closing balances back to the anchor month.
// Guarded against runaway recursion with a hard depth limit.
function calcOpeningBalance(emp, period, allAttendance, allPayroll, allPayments, companyAccountId, depth = 0) {
  // Before the anchor month → no carried data.
  if (period.start < OPENING_BALANCE_ANCHOR) return 0;
  // At the anchor month → use the stored opening balance.
  if (period.start === OPENING_BALANCE_ANCHOR) {
    return emp.opening_balance !== null && emp.opening_balance !== undefined
      ? parseFloat(emp.opening_balance) : 0;
  }
  // Safety: never chain more than 36 months back.
  if (depth > 36) {
    return emp.opening_balance !== null && emp.opening_balance !== undefined
      ? parseFloat(emp.opening_balance) : 0;
  }
  // After the anchor → opening = previous period's CLOSING balance.
  const prev = getPrevPeriod(period);
  const prevRow = calcPayrollRow(emp, prev, allAttendance, allPayroll, allPayments, companyAccountId, depth + 1);
  return prevRow.balance;
}

/* Calculate one employee's payroll for a given period.
   This is the EXACT same logic as Payroll.jsx's calcPayroll function.

   @param emp           — employee record from the `employees` table
   @param period        — { start, end, label } period object
   @param allAttendance — all attendance rows (filtered by employee/period inside)
   @param allPayroll    — all payroll records (deductions saved for a period)
   @param allPayments   — all salary_payments records
   @returns             — all calculated fields matching what the Payroll page shows
*/
export function calcPayrollRow(emp, period, allAttendance, allPayroll, allPayments, companyAccountId = null, depth = 0) {
  // Attendance for this employee in this period — deduplicate by date (same as periodAtt)
  const empAtt = allAttendance.filter(a => {
    const d = a.att_date || a.work_date || "";
    return a.employee_id === emp.id && d >= period.start && d <= period.end;
  });
  // Deduplicate: if multiple records on the same date, keep the latest one
  const byDate = {};
  empAtt.forEach(a => { byDate[a.att_date || a.work_date] = a; });
  const att = Object.values(byDate);

  const totalHours = parseFloat(att.reduce((s, a) => s + parseFloat(a.hours_worked || 0), 0).toFixed(2));
  const totalDays  = parseFloat((totalHours / WORK_HOURS).toFixed(2));

  let totalOt = 0, totalLt = 0;
  att.forEach(a => {
    const h = parseFloat(a.hours_worked || 0);
    if (h > WORK_HOURS) totalOt += (h - WORK_HOURS);
    else if (h > 0 && h < WORK_HOURS) totalLt += (WORK_HOURS - h);
  });
  totalOt = parseFloat(totalOt.toFixed(2));
  totalLt = parseFloat(totalLt.toFixed(2));

  const dailyRate  = parseFloat(emp.daily_rate || 0);
  const grossSalary = parseFloat((dailyRate * totalDays).toFixed(3));

  // Find ALL payroll records for this employee+period (handles historical duplicates gracefully)
  const allPrForPeriod = allPayroll.filter(p => p.employee_id === emp.id && p.period_start === period.start);
  const pr = allPrForPeriod[0] || null; // primary record (most recently created = first in sort)
  const allPrIds = allPrForPeriod.map(p => p.id); // all record IDs including any duplicates

  const advance   = parseFloat(pr?.advance_deduction || 0);
  const food      = parseFloat(pr?.food_deduction    || 0);
  const other     = parseFloat(pr?.other_deduction   || 0);
  const incentive = parseFloat(pr?.incentive         || 0);

  // Opening balance (carried-forward arrears from previous periods).
  // Auto-calculated: chains back to the anchor month (April–May 2026), where
  // emp.opening_balance is the seed. Each later month opens with the prior
  // month's closing balance.
  const openingBal = parseFloat(
    calcOpeningBalance(emp, period, allAttendance, allPayroll, allPayments, companyAccountId, depth).toFixed(3)
  );

  // Net salary this period (= labour amount in the report)
  const netSalary = parseFloat((grossSalary - advance - food - other + incentive).toFixed(3));

  // Total amount due = net salary + opening balance
  const totalAmount = parseFloat((netSalary + openingBal).toFixed(3));

  // Payments: match by payroll_id (ANY payroll record for this period) OR unlinked within period
  const empPayments = allPayments.filter(p => p.employee_id === emp.id);
  const periodPayments = empPayments.filter(p => {
    if (allPrIds.length > 0 && p.payroll_id && allPrIds.includes(p.payroll_id)) return true; // linked to any record for this period
    if (!p.payroll_id && p.payment_date >= period.start && p.payment_date <= period.end) return true; // unlinked, within period dates
    return false;
  });
  // If nothing matched the period, fall back to ALL unlinked payments (same fallback as Payroll.jsx)
  const finalPayments = periodPayments.length > 0
    ? periodPayments
    : empPayments.filter(p => !p.payroll_id);

  const paidAmt    = parseFloat(finalPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0).toFixed(3));

  // Break the paid amount down by what each payment was FOR (its payment_type).
  // These are display columns only — they all already sit inside paidAmt, so the
  // balance is reduced ONCE (balance = totalAmount - paidAmt), never twice.
  const sumByType = (types) => parseFloat(
    finalPayments.filter(p => types.includes(p.payment_type || "Salary"))
      .reduce((s,p) => s + parseFloat(p.amount||0), 0).toFixed(3)
  );
  const advancePaid = sumByType(["Advance"]);
  const foodPaid    = sumByType(["Food Allowance", "Food"]);
  const otherPaid   = sumByType(["Other"]);
  const salaryPaid  = sumByType(["Salary", "Incentive"]);

  // Kept for Payroll.jsx UI compatibility (Advance vs everything-else split)
  const paidAdvance = advancePaid;
  const paidSalary  = parseFloat((paidAmt - advancePaid).toFixed(3));

  // COMP = "Paid through company account" — ONLY payments transferred FROM the
  // specific "Company Account" bank account. Payments from other accounts
  // (Sandeep, Deepu) or cash are NOT counted here.
  const comp = companyAccountId
    ? parseFloat(
        finalPayments.filter(p => p.bank_account_id === companyAccountId)
          .reduce((s,p) => s + parseFloat(p.amount||0), 0).toFixed(3)
      )
    : 0;

  const balance    = parseFloat((totalAmount - paidAmt).toFixed(3));

  return {
    totalHours, totalDays, totalOt, totalLt,
    grossSalary,    // = Month Payment
    advance, food, other, incentive,
    openingBal,     // = Old Balance
    netSalary,      // = Labour Amount
    totalAmount,    // = Total Amount
    comp,           // = Paid through company account (bank only)
    paidAmt,        // = Paid Amount (all payments)
    advancePaid,    // = Advance payments (display)
    foodPaid,       // = Food allowance payments (display)
    otherPaid,      // = Other payments (display)
    salaryPaid,     // = Salary/incentive payments (display)
    paidAdvance,    // = Payroll.jsx UI compatibility
    paidSalary,     // = Payroll.jsx UI compatibility
    balance,        // = Balance
    payrollRecord: pr,
    finalPayments,
  };
}
