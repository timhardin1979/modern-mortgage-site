// pages/leads.jsx
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "umm_leads_v2";

const STATUSES = [
  "New",
  "Pre-Approved",
  "In Process",
  "Conditional",
  "Clear to Close",
  "Won",
  "Lost",
];

const SORTS = {
  "Newest": (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
  "Oldest": (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
  "Amount: High → Low": (a, b) => (Number(b.loanAmount) || 0) - (Number(a.loanAmount) || 0),
  "Amount: Low → High": (a, b) => (Number(a.loanAmount) || 0) - (Number(b.loanAmount) || 0),
  "Name A → Z": (a, b) => (a.name||"").localeCompare(b.name||""),
  "Next Follow-up": (a, b) => (dateOrInfinity(a.nextFollowUp)) - (dateOrInfinity(b.nextFollowUp)),
};

const defaultLead = {
  name: "",
  contact: "",
  loanAmount: "",
  status: "New",
  source: "",
  tags: "",
  notes: "",
  nextFollowUp: "",
};

export default function Leads() {
  const fileInputRef = useRef(null);

  const [leads, setLeads] = useState([]);
  const [form, setForm] = useState(defaultLead);
  const [editingId, setEditingId] = useState(null);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState("Newest");
  const [selected, setSelected] = useState({}); // id: true

  // Load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setLeads(raw ? JSON.parse(raw) : []);
    } catch {}
  }, []);

  // Save
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
    } catch {}
  }, [leads]);

  // Derived
  const filteredLeads = useMemo(() => {
    let list = [...leads];

    // Search
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((l) => [
        l.name, l.contact, l.source, l.notes,
        (l.tags || []).join(", "),
      ].some((v) => String(v || "").toLowerCase().includes(needle)));
    }

    // Status filter
    if (statusFilter !== "All") {
      list = list.filter((l) => (l.status || "New") === statusFilter);
    }

    // Sort
    list.sort(SORTS[sortBy] || SORTS["Newest"]);
    return list;
  }, [leads, q, statusFilter, sortBy]);

  const totalVol = useMemo(
    () => filteredLeads.reduce((s, l) => s + (Number(l.loanAmount) || 0), 0),
    [filteredLeads]
  );

  // CRUD
  const resetForm = () => setForm(defaultLead);

  const addOrUpdate = () => {
    const clean = sanitizeLead(form);
    if (!clean.name) return alert("Name is required");
    if (editingId) {
      setLeads((prev) =>
        prev.map((l) => (l.id === editingId ? { ...l, ...clean, updatedAt: Date.now() } : l))
      );
      setEditingId(null);
    } else {
      setLeads((prev) => [
        { id: crypto.randomUUID(), ...clean, createdAt: Date.now(), updatedAt: Date.now() },
        ...prev,
      ]);
    }
    resetForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const edit = (id) => {
    const l = leads.find((x) => x.id === id);
    if (!l) return;
    setForm({
      name: l.name || "",
      contact: l.contact || "",
      loanAmount: l.loanAmount ?? "",
      status: l.status || "New",
      source: l.source || "",
      tags: (l.tags || []).join(", "),
      notes: l.notes || "",
      nextFollowUp: l.nextFollowUp ? l.nextFollowUp.slice(0, 10) : "",
    });
    setEditingId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = (id) => {
    if (!confirm("Delete this lead?")) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setSelected((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    if (editingId === id) {
      setEditingId(null);
      resetForm();
    }
  };

  const bulkDelete = () => {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!ids.length) return alert("No leads selected.");
    if (!confirm(`Delete ${ids.length} lead(s)?`)) return;
    setLeads((prev) => prev.filter((l) => !ids.includes(l.id)));
    setSelected({});
  };

  // Export / Import
  const exportJSON = () => {
    downloadBlob(JSON.stringify(leads, null, 2), `umm-leads-${dateStamp()}.json`, "application/json");
  };

  const exportCSV = () => {
    const rows = [
      ["id","name","contact","loanAmount","status","source","tags","notes","nextFollowUp","createdAt","updatedAt"],
      ...leads.map((l) => [
        l.id,
        esc(l.name),
        esc(l.contact),
        Number(l.loanAmount) || 0,
        l.status || "",
        esc(l.source),
        esc((l.tags || []).join("|")),
        esc(l.notes || ""),
        l.nextFollowUp || "",
        l.createdAt || "",
        l.updatedAt || "",
      ]),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    downloadBlob(csv, `umm-leads-${dateStamp()}.csv`, "text/csv");
  };

  const importJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(String(reader.result || "[]"));
        if (!Array.isArray(arr)) throw new Error("Not an array");
        const cleaned = arr.map(importSanitize);
        if (!confirm(`Import ${cleaned.length} lead(s)? This merges with what you have.`)) return;
        // Merge on id (if exists), otherwise append
        setLeads((prev) => {
          const map = new Map(prev.map((l) => [l.id, l]));
          cleaned.forEach((l) => {
            if (l.id && map.has(l.id)) {
              map.set(l.id, { ...map.get(l.id), ...l, updatedAt: Date.now() });
            } else {
              map.set(l.id || crypto.randomUUID(), { ...l, id: l.id || crypto.randomUUID(), createdAt: l.createdAt || Date.now(), updatedAt: Date.now() });
            }
          });
          return Array.from(map.values());
        });
      } catch (err) {
        alert("Invalid JSON file.");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const toggleSelect = (id) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));

  const overdue = (l) => {
    if (!l.nextFollowUp) return false;
    const d = new Date(l.nextFollowUp);
    if (isNaN(d)) return false;
    const endOfDay = new Date(d);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay.getTime() < Date.now() && l.status !== "Won" && l.status !== "Lost";
  };

  return (
    <>
      <Head><title>Leads • UMM</title></Head>
      <main style={ui.container}>
        <div style={ui.topbar}>
          <Link href="/" style={ui.back}>&larr; Back</Link>
          <h1 style={ui.title}>Lead Manager</h1>
        </div>

        {/* Form */}
        <section style={ui.card}>
          <h2 style={ui.h2}>{editingId ? "Edit Lead" : "Add New Lead"}</h2>
          <div style={ui.formGrid}>
            <input style={ui.input} placeholder="Name *"
                   value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})}/>
            <input style={ui.input} placeholder="Phone or Email"
                   value={form.contact} onChange={(e)=>setForm({...form, contact:e.target.value})}/>
            <input style={ui.input} placeholder="Loan Amount ($)" type="number"
                   value={form.loanAmount} onChange={(e)=>setForm({...form, loanAmount:e.target.value})}/>
            <select style={ui.input} value={form.status}
                    onChange={(e)=>setForm({...form, status:e.target.value})}>
              {STATUSES.map((s)=> <option key={s} value={s}>{s}</option>)}
            </select>
            <input style={ui.input} placeholder="Source (Agent, Zillow, Referral…)"
                   value={form.source} onChange={(e)=>setForm({...form, source:e.target.value})}/>
            <input style={ui.input} placeholder="Tags (comma separated)"
                   value={form.tags} onChange={(e)=>setForm({...form, tags:e.target.value})}/>
            <input style={ui.input} type="date" value={form.nextFollowUp}
                   onChange={(e)=>setForm({...form, nextFollowUp:e.target.value})}/>
            <textarea style={{...ui.input, gridColumn:"1 / -1", minHeight:90}} placeholder="Notes"
                      value={form.notes} onChange={(e)=>setForm({...form, notes:e.target.value})}/>
          </div>
          <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
            <button style={ui.primaryBtn} onClick={addOrUpdate}>{editingId? "Update Lead":"Add Lead"}</button>
            {editingId && <button style={ui.secondaryBtn} onClick={()=>{setEditingId(null); resetForm();}}>Cancel</button>}
            <button style={ui.secondaryBtn} onClick={()=>{resetForm(); setEditingId(null);}}>Clear</button>
          </div>
        </section>

        {/* Filters / Actions */}
        <section style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, margin:"12px 0"}}>
          <input style={ui.input} placeholder="Search (name, contact, notes, tags, source)" value={q} onChange={(e)=>setQ(e.target.value)}/>
          <select style={ui.input} value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
            <option>All</option>
            {STATUSES.map((s)=><option key={s}>{s}</option>)}
          </select>
          <select style={ui.input} value={sortBy} onChange={(e)=>setSortBy(e.target.value)}>
            {Object.keys(SORTS).map((k)=><option key={k}>{k}</option>)}
          </select>
        </section>

        {/* Summary + Export/Import */}
        <section style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:12}}>
          <div style={ui.kpi}><div style={ui.kpiLabel}>Leads</div><div style={ui.kpiValue}>{filteredLeads.length}</div></div>
          <div style={ui.kpi}><div style={ui.kpiLabel}>Volume (filtered)</div><div style={ui.kpiValue}>${totalVol.toLocaleString()}</div></div>
          <button style={ui.actionBtn} onClick={exportJSON}>Export JSON</button>
          <button style={ui.actionBtn} onClick={exportCSV}>Export CSV</button>
        </section>

        <section style={{display:"flex", gap:8, flexWrap:"wrap", marginBottom:12}}>
          <button style={ui.secondaryBtn} onClick={()=>fileInputRef.current?.click()}>Import JSON</button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{display:"none"}} onChange={importJSON}/>
          <button style={{...ui.secondaryBtn, background:"#ef4444"}} onClick={bulkDelete}>Delete Selected</button>
        </section>

        {/* Table */}
        <section style={ui.card}>
          <h2 style={ui.h2}>All Leads</h2>
          {filteredLeads.length === 0 ? (
            <p style={{opacity:.7}}>No leads match your filters.</p>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Tags</th>
                    <th>Next Follow-up</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((l)=>(
                    <tr key={l.id} style={overdue(l)? {background:"#3a1e1e"}:undefined}>
                      <td><input type="checkbox" checked={!!selected[l.id]} onChange={()=>toggleSelect(l.id)}/></td>
                      <td>{l.name}</td>
                      <td>
                        {l.contact}
                        {clickableContact(l.contact)}
                      </td>
                      <td>${(Number(l.loanAmount)||0).toLocaleString()}</td>
                      <td>{l.status}</td>
                      <td>{l.source}</td>
                      <td>{(l.tags||[]).join(", ")}</td>
                      <td>{l.nextFollowUp ? humanDate(l.nextFollowUp) : "-" } {overdue(l) && <span style={ui.badge}>Overdue</span>}</td>
                      <td style={{maxWidth:280, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}} title={l.notes || ""}>
                        {l.notes || "-"}
                      </td>
                      <td>
                        <button style={ui.linkBtn} onClick={()=>edit(l.id)}>Edit</button>
                        <button style={ui.dangerBtn} onClick={()=>remove(l.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <style jsx global>{`
        html, body { margin:0; background:#0f172a; color:#e5e7eb; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Inter,Roboto,Arial;}
        input, select, button, textarea { font: inherit; }
        a { color: inherit; text-decoration: none; }
      `}</style>
    </>
  );
}

/* ---------------- utils & styles ---------------- */

function sanitizeLead(f) {
  const amount = Number(f.loanAmount) || 0;
  const tags = (f.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const next = f.nextFollowUp ? new Date(f.nextFollowUp).toISOString().slice(0,10) : "";
  return {
    name: (f.name || "").trim(),
    contact: (f.contact || "").trim(),
    loanAmount: amount,
    status: f.status || "New",
    source: (f.source || "").trim(),
    tags,
    notes: (f.notes || "").trim(),
    nextFollowUp: next,
  };
}

function importSanitize(x) {
  const l = typeof x === "object" && x ? x : {};
  return {
    id: l.id || crypto.randomUUID(),
    name: String(l.name || ""),
    contact: String(l.contact || ""),
    loanAmount: Number(l.loanAmount) || 0,
    status: STATUSES.includes(l.status) ? l.status : "New",
    source: String(l.source || ""),
    tags: Array.isArray(l.tags) ? l.tags.map(String) : String(l.tags || "").split(",").map((t)=>t.trim()).filter(Boolean),
    notes: String(l.notes || ""),
    nextFollowUp: l.nextFollowUp ? String(l.nextFollowUp).slice(0,10) : "",
    createdAt: l.createdAt || Date.now(),
    updatedAt: l.updatedAt || Date.now(),
  };
}

function downloadBlob(data, filename, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(v) {
  const s = String(v ?? "");
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function esc(s){ return String(s ?? ""); }
function dateStamp(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function humanDate(iso){ try { const d = new Date(iso); return d.toLocaleDateString(); } catch { return iso; } }
function dateOrInfinity(iso){ if(!iso) return Number.POSITIVE_INFINITY; const t = +new Date(iso); return isNaN(t)? Number.POSITIVE_INFINITY : t; }

function clickableContact(contact){
  const v = String(contact || "");
  const tel = v.replace(/[^\d+]/g,"");
  if (tel.length >= 7) return (<> • <a href={`tel:${tel}`} style={{color:"#60a5fa"}}>Call</a> • <a href={`sms:${tel}`} style={{color:"#60a5fa"}}>SMS</a></>);
  if (v.includes("@")) return (<> • <a href={`mailto:${v}`} style={{color:"#60a5fa"}}>Email</a></>);
  return null;
}

const ui = {
  container:{maxWidth:1100, margin:"0 auto", padding:"1.5rem"},
  topbar:{display:"flex", alignItems:"center", gap:12, marginBottom:12},
  back:{opacity:.8},
  title:{margin:0, fontSize:"1.6rem", fontWeight:800},
  card:{background:"#0b1220", border:"1px solid #1f2937", borderRadius:12, padding:"1rem", marginBottom:"1rem"},
  h2:{margin:"0 0 .75rem 0"},
  formGrid:{display:"grid", gridTemplateColumns:"repeat(4, minmax(0,1fr))", gap:8, marginBottom:10},
  input:{background:"#111827", border:"1px solid #1f2937", color:"#e5e7eb", padding:"0.6rem 0.7rem", borderRadius:10, width:"100%"},
  primaryBtn:{background:"#4f46e5", border:"none", padding:"0.7rem 1rem", borderRadius:10, fontWeight:700},
  secondaryBtn:{background:"#374151", border:"none", padding:"0.7rem 1rem", borderRadius:10},
  actionBtn:{background:"#0b1220", border:"1px solid #1f2937", padding:"0.7rem 1rem", borderRadius:10, textAlign:"center"},
  kpi:{background:"#111827", border:"1px solid #1f2937", borderRadius:12, padding:"1rem"},
  kpiLabel:{opacity:.7, fontSize:12}, kpiValue:{fontSize:24, fontWeight:800},
  table:{width:"100%", borderCollapse:"collapse"},
  linkBtn:{background:"transparent", color:"#60a5fa", border:"none", marginRight:8, cursor:"pointer"},
  dangerBtn:{background:"#ef4444", border:"none", color:"#fff", padding:"0.4rem 0.6rem", borderRadius:8, cursor:"pointer"},
  badge:{marginLeft:8, background:"#ef4444", color:"#fff", borderRadius:8, padding:"2px 6px", fontSize:12},
};
