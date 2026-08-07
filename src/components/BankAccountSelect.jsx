// Reusable bank account selector used across all payment forms
export default function BankAccountSelect({ value, onChange, bankAccounts, required = false, style = {} }) {
  const inp = {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 13,
    width: "100%",
    boxSizing: "border-box",
    outline: "none",
    background: value ? "#f0fdf4" : "#fef9c3",
    ...style,
  };

  return (
    <div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 }}>
        🏦 Account {required && <span style={{ color: "#ef4444" }}>*</span>}
      </div>
      <select value={value || ""} onChange={e => onChange(e.target.value)} style={inp}>
        <option value="">— Select Account —</option>
        {bankAccounts.map(a => (
          <option key={a.id} value={a.id}>
            {a.account_name}{a.account_number ? ` (${a.account_number})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
