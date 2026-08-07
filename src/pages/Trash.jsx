import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAdmin } from "../context/AdminContext";
import { SOFT_DELETE_TABLES, TABLE_LABELS, DISPLAY_FIELDS, restoreDeleted, permanentlyDelete } from "../lib/softDelete";

const RETENTION_DAYS = 30;

export default function Trash() {
  const { canEdit, setShowLogin, confirmAction, logActivity } = useAdmin();
  const isAdmin = canEdit("settings"); // Trash management is an admin/settings-level action
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTable, setFilterTable] = useState("All");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { loadTrash(); }, []);

  const loadTrash = async () => {
    setLoading(true);
    const results = await Promise.all(
      SOFT_DELETE_TABLES.map(async (table) => {
        const { data, error } = await supabase.from(table).select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });
        if (error) return [];
        return (data || []).map(row => ({ ...row, _table: table }));
      })
    );
    const all = results.flat().sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
    setItems(all);
    setLoading(false);
  };

  const showMsg = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };

  const handleRestore = (item) => {
    if (!isAdmin) { setShowLogin(true); return; }
    const label = item[DISPLAY_FIELDS[item._table]?.label] || item.id;
    confirmAction(`Restore "${label}" (${TABLE_LABELS[item._table]})? It will reappear in its original page.`, async () => {
      const { error } = await restoreDeleted(item._table, item.id);
      if (error) { showMsg("❌ " + error.message); return; }
      logActivity("Restored from Trash", `${TABLE_LABELS[item._table]}: ${label}`, "Trash");
      showMsg("✅ Restored!");
      await loadTrash();
    });
  };

  const handlePermanentDelete = (item) => {
    if (!isAdmin) { setShowLogin(true); return; }
    const label = item[DISPLAY_FIELDS[item._table]?.label] || item.id;
    confirmAction(`Permanently delete "${label}" (${TABLE_LABELS[item._table]})? This CANNOT be undone — admin password required.`, async () => {
      const { error } = await permanentlyDelete(item._table, item.id);
      if (error) { showMsg("❌ " + error.message); return; }
      logActivity("Permanently deleted", `${TABLE_LABELS[item._table]}: ${label}`, "Trash");
      showMsg("✅ Permanently deleted");
      await loadTrash();
    });
  };

  const daysLeft = (deletedAt) => {
    const deleted = new Date(deletedAt);
    const expiresAt = new Date(deleted.getTime() + RETENTION_DAYS * 86400000);
    const days = Math.ceil((expiresAt - new Date()) / 86400000);
    return days;
  };

  const tablesPresent = [...new Set(items.map(i => i._table))].sort();
  const filtered = items.filter(i => {
    if (filterTable !== "All" && i._table !== filterTable) return false;
    if (search) {
      const fields = DISPLAY_FIELDS[i._table] || {};
      const haystack = [i[fields.label], i[fields.sub], TABLE_LABELS[i._table]].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Loading Trash...</div>;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>🗑 Trash</h2>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          Deleted items from every page, in one place. Items are kept for {RETENTION_DAYS} days before permanent removal. Restore anything moved here by mistake.
        </div>
      </div>

      {msg && <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
        background: msg.startsWith("✅") ? "#ecfdf5" : "#fef2f2", color: msg.startsWith("✅") ? "#10b981" : "#ef4444" }}>{msg}</div>}

      {!isAdmin && <div style={{ marginBottom: 16, padding: "10px 16px", background: "#fffbeb", borderRadius: 8, fontSize: 13, color: "#92400e" }}>👁 View only — Login as admin to restore or permanently delete items</div>}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search trash..."
          style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, minWidth: 220 }} />
        <select value={filterTable} onChange={e => setFilterTable(e.target.value)}
          style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
          <option value="All">All types ({items.length})</option>
          {tablesPresent.map(t => (
            <option key={t} value={t}>{TABLE_LABELS[t]} ({items.filter(i => i._table === t).length})</option>
          ))}
        </select>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>{filtered.length} item{filtered.length !== 1 ? "s" : ""}</div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 60, background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          🗑 Trash is empty.
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Type", "Item", "Amount", "Deleted", "Expires", "Actions"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => {
                const fields = DISPLAY_FIELDS[item._table] || {};
                const label = item[fields.label] || "(no label)";
                const sub = fields.sub ? item[fields.sub] : null;
                const amount = fields.amount ? parseFloat(item[fields.amount] || 0) : null;
                const left = daysLeft(item.deleted_at);
                return (
                  <tr key={`${item._table}-${item.id}`} style={{ borderTop: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ background: "#f1f5f9", color: "#475569", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>{TABLE_LABELS[item._table]}</span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 600 }}>{label}</div>
                      {sub && <div style={{ fontSize: 11, color: "#94a3b8" }}>{sub}</div>}
                    </td>
                    <td style={{ padding: "10px 14px", color: "#10b981", fontWeight: 600 }}>{amount !== null ? `OMR ${amount.toFixed(3)}` : "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{new Date(item.deleted_at).toLocaleDateString()}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: left <= 7 ? "#ef4444" : "#94a3b8", fontWeight: left <= 7 ? 700 : 400 }}>
                      {left > 0 ? `${left} day${left !== 1 ? "s" : ""}` : "Today"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => handleRestore(item)} style={{ background: "#eef2ff", color: "#6366f1", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>↩ Restore</button>
                        <button onClick={() => handlePermanentDelete(item)} style={{ background: "#fef2f2", color: "#ef4444", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>🗑 Delete Forever</button>
                      </div>
                    </td>
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
