import { useState, useEffect, useRef } from "react";

/* Reusable type-ahead input with a click-to-select suggestions dropdown.
   Used for description/customer history in Invoices, and payee/source history in Payments. */
export default function Autocomplete({ value, onChange, onSelect, suggestions, getLabel, filterFn, placeholder, style }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = (value || "").trim().toLowerCase();
  const filtered = q
    ? suggestions.filter(s => (filterFn ? filterFn(s, q) : getLabel(s).toLowerCase().includes(q))).slice(0, 8)
    : [];

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        style={style}
      />
      {open && filtered.length > 0 && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#fff", border:"1px solid #e2e8f0", borderRadius:8, marginTop:2, maxHeight:170, overflowY:"auto", zIndex:60, boxShadow:"0 6px 16px rgba(0,0,0,0.10)" }}>
          {filtered.map((s, i) => (
            <div key={i}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(s); setOpen(false); }}
              style={{ padding:"7px 12px", fontSize:12, cursor:"pointer", borderBottom: i < filtered.length-1 ? "1px solid #f1f5f9" : "none" }}>
              {getLabel(s)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
