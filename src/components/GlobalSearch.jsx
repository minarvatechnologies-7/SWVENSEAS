import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";

/* Each entry: { type, label, page, icon }
   type = which table/category this result belongs to
   page = the App.jsx page id to navigate to when clicked */
const SEARCH_TYPES = {
  project:       { label: "Project",       page: "projects",        icon: "🏗" },
  subcontractor: { label: "Subcontractor", page: "subcontractors",  icon: "🔧" },
  supplier:      { label: "Supplier",      page: "creditpurchases", icon: "🏪" },
  employee:      { label: "Employee",      page: "payroll",         icon: "👤" },
  invoice:       { label: "Invoice",       page: "invoices",        icon: "🗒" },
  equipment:     { label: "Equipment",     page: "equipment",       icon: "🚜" },
};

export default function GlobalSearch({ setPage }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const runSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    // Strip characters that have special meaning in PostgREST filter strings.
    // Comma separates OR conditions, % is the ILIKE wildcard, parentheses group,
    // and the dot/colon/quotes/backslash are used in operator syntax — removing
    // them all means user input can never break out of the literal search term.
    const safe = q.trim().replace(/[,%()."'`:\\*]/g, "");
    if (!safe) { setResults([]); setSearching(false); return; }
    const term = `%${safe}%`;
    try {
      const [proj, subs, supp, emp, inv, eq] = await Promise.all([
        supabase.from("projects").select("id,name,customer").is("deleted_at",null).or(`name.ilike.${term},customer.ilike.${term}`).limit(5),
        supabase.from("subcontractors").select("id,name,specialty,project").is("deleted_at",null).or(`name.ilike.${term},project.ilike.${term}`).limit(5),
        supabase.from("bp_suppliers").select("id,name,category").is("deleted_at",null).ilike("name", term).limit(5),
        supabase.from("employees").select("id,name,phone").is("deleted_at",null).ilike("name", term).limit(5),
        supabase.from("invoices").select("id,invoice_number,client_name,customer").is("deleted_at",null).or(`invoice_number.ilike.${term},client_name.ilike.${term},customer.ilike.${term}`).limit(5),
        supabase.from("equipment").select("id,name,current_site").is("deleted_at",null).ilike("name", term).limit(5),
      ]);

      const out = [];
      (proj.data||[]).forEach(r => out.push({ type:"project", id:r.id, title:r.name, subtitle:r.customer||"" }));
      (subs.data||[]).forEach(r => out.push({ type:"subcontractor", id:r.id, title:r.name, subtitle:[r.specialty,r.project].filter(Boolean).join(" — ") }));
      (supp.data||[]).forEach(r => out.push({ type:"supplier", id:r.id, title:r.name, subtitle:r.category||"" }));
      (emp.data||[]).forEach(r => out.push({ type:"employee", id:r.id, title:r.name, subtitle:r.phone||"" }));
      (inv.data||[]).forEach(r => out.push({ type:"invoice", id:r.id, title:r.invoice_number, subtitle:r.client_name||r.customer||"" }));
      (eq.data||[]).forEach(r => out.push({ type:"equipment", id:r.id, title:r.name, subtitle:r.current_site||"" }));

      setResults(out);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, []);

  const onChange = (v) => {
    setQuery(v);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(v), 300);
  };

  const handleSelect = (r) => {
    setPage(SEARCH_TYPES[r.type].page);
    setOpen(false);
    setQuery("");
    setResults([]);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: 280 }}>
      <div style={{ position:"relative" }}>
        <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:13, color:"#94a3b8" }}>🔍</span>
        <input
          value={query}
          onChange={e => onChange(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true); }}
          placeholder="Search projects, people, invoices..."
          style={{ width:"100%", border:"1px solid #e2e8f0", borderRadius:8, padding:"7px 12px 7px 30px", fontSize:12, outline:"none", boxSizing:"border-box", background:"#f8fafc" }}
        />
      </div>
      {open && (query.trim().length >= 2) && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, marginTop:4, maxHeight:360, overflowY:"auto", zIndex:200, boxShadow:"0 8px 24px rgba(0,0,0,0.12)" }}>
          {searching ? (
            <div style={{ padding:16, fontSize:12, color:"#94a3b8", textAlign:"center" }}>Searching...</div>
          ) : results.length === 0 ? (
            <div style={{ padding:16, fontSize:12, color:"#94a3b8", textAlign:"center" }}>No results found.</div>
          ) : (
            results.map(r => {
              const meta = SEARCH_TYPES[r.type];
              return (
                <div key={`${r.type}-${r.id}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleSelect(r)}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", cursor:"pointer", borderBottom:"1px solid #f1f5f9" }}
                  onMouseEnter={e => e.currentTarget.style.background="#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background="#fff"}>
                  <span style={{ fontSize:16 }}>{meta.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:"#1e293b", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.title}</div>
                    {r.subtitle && <div style={{ fontSize:10, color:"#94a3b8", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.subtitle}</div>}
                  </div>
                  <span style={{ fontSize:9, color:"#6366f1", background:"#eef2ff", borderRadius:10, padding:"2px 8px", fontWeight:600, flexShrink:0 }}>{meta.label}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
