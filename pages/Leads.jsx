// pages/leads.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";

/** ------------------------------
 *  Constants & Helpers
 *  ------------------------------ */
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

const SOURCES = [
  "Realtor",
  "Referral",
  "Direct Web",
  "Past Client",
  "Walk-in",
  "Other",
];

const LOAN_TYPES = ["Conventional", "FHA", "VA", "Jumbo", "USDA", "HELOC"];

const S = {
  wrap: { maxWidth: 1200, margin: "0 auto", padding: "24px" },
  bar: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: 12,
    padding: 16,
  },
  btn: {
    background: "#4f46e5",
    border: "none",
    color: "white",
    padding: "10px 14px",
    borderRadius: 8,
    cursor: "pointer",
  },
  btnGhost: {
    background: "transparent",
    border: "1px solid #374151",
    color: "white",
    padding: "10px 14px",
    borderRadius: 8,
    cursor: "pointer",
  },
  input: {
    background: "#0b1020",
    border: "1px solid #334155",
    color: "white",
    padding: "10px 12px",
    borderRadius: 8,
    width: "100%",
  },
  select: {
    background: "#0b1020",
    border: "1px solid #334155",
    color: "white",
    padding: "10px 12px",
    borderRadius: 8,
    width: "100%",
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 },
  tag: (color = "#4f46e5") => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    background: color,
    color: "white",
  }),
  statusColors: {
    New: "#334155",
    "Pre-Approved": "#0891b2",
    "In Process": "#6366f1",
    Conditional: "#f59e0b",
    "Clear to Close": "#16a34a",
    Won: "#22c55e",
    Lost: "#ef4444",
  },
};

/** localStorage helpers */
function useLocalStorage(key, initial) {
  const [state, setState] = useState(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setState(JSON.parse(raw));
    } catch {}
    // eslint-disable-next-line
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

const defaultLead = () => ({
  id: crypto.randomUUID(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
  name: "",
  phone: "",
  email: "",
  source: "Realtor",
  agent: "",
  loanType: "Conventional",
  loanAmount: "",
  propertyAddress: "",
  status: "New",
  notes: "",
  nextFollowUp: "", // yyyy-mm-dd
  closeDate: "", // yyyy-mm-dd when Won
});

/** Formatting */
const fmtMoney = (n) =>
  !n && n !== 0
    ? ""
    : Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });
const toISODate = (ts) => new Date(ts).toISOString().slice(0, 10);
const overdue = (d) => !!d && new Date(d) < new Date();

/** Sorting options */
const SORTS = {
  "Newest Created": (a, b) => b.createdAt - a.createdAt,
  "Oldest Created": (a, b) => a.createdAt - b.createdAt,
  "Amount High → Low": (a, b) => (Number(b.loanAmount) || 0) - (Number(a.loanAmount) || 0),
  "Amount Low → High": (a, b) => (Number(a.loanAmount) || 0) - (Number(b.loanAmount) || 0),
  "Next Follow-Up": (a, b) =>
    (a.nextFollowUp || "9999-12-31").localeCompare(b.nextFollowUp || "9999-12-31"),
  "Name A → Z": (a, b) => (a.name || "").localeCompare(b.name || ""),
};

/** ------------------------------
 *  Main Page
 *  ------------------------------ */
export default function LeadsPage() {
  const [leads, setLeads] = useLocalStorage(STORAGE_KEY, []);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [sortKey, setSortKey] = useState("Newest Created");
  const [view, setView] = useState("table"); // "table" | "kanban"
  const [editing, setEditing] = useState(null);
  const fileRef = useRef();

  /** CRUD */
  const saveLead = (lead) => {
    setLeads((prev) => {
      const idx = prev.findIndex((x) => x.id === lead.id);
      if (idx === -1) return [lead, ...prev];
      const next = [...prev];
      next[idx] = { ...lead, updatedAt: Date.now() };
      return next;
    });
    setEditing(null);
  };
  const removeLead = (id) => setLeads((prev) => prev.filter((l) => l.id !== id));
  const moveStatus = (id, dir) => {
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const i = STATUSES.indexOf(l.status);
        const next = STATUSES[Math.max(0, Math.min(STATUSES.length - 1, i + dir))];
        return { ...l, status: next, updatedAt: Date.now() };
      })
    );
  };

  /** Derived data */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads
      .filter((l) =>
        statusFilter === "All" ? true : (l.status || "New") === statusFilter
      )
      .filter((l) => (sourceFilter === "All" ? true : l.source === sourceFilter))
      .filter((l) => {
        if (!q) return true;
        return [
          l.name,
          l.email,
          l.phone,
          l.agent,
          l.propertyAddress,
          l.notes,
          l.loanType,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort(SORTS[sortKey]);
  }, [leads, query, statusFilter, sourceFilter, sortKey]);

  const metrics = useMemo(() => {
    const active = leads.filter((l) => !["Won", "Lost"].includes(l.status));
    const won = leads.filter((l) => l.status === "Won");
    const lost = leads.filter((l) => l.status === "Lost");
    const vol = won.reduce((t, l) => t + (Number(l.loanAmount) || 0), 0);
    const closeRate = leads.length ? Math.round((won.length / leads.length) * 100) : 0;
    const overdueCount = leads.filter((l) => overdue(l.nextFollowUp)).length;
    return { active: active.length, won: won.length, lost: lost.length, vol, closeRate, overdueCount };
  }, [leads]);

  /** Import/Export */
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(leads, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `umm-leads-${toISODate(Date.now())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("Invalid JSON");
        // normalize
        const normalized = data.map((d) => ({
          ...defaultLead(),
          ...d,
          id: d.id || crypto.randomUUID(),
          createdAt: d.createdAt || Date.now(),
          updatedAt: Date.now(),
        }));
        setLeads(normalized);
        alert("Import successful!");
      } catch (err) {
        alert("Import failed: " + err.message);
      } finally {
        fileRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      <Head>
        <title>Ultimate Mortgage CRM</title>
      </Head>

      <div style={S.wrap}>
        <header style={{ ...S.bar, justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>
            Ultimate Mortgage CRM
          </h1>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/" style={S.btnGhost}>Home</Link>
            <button style={S.btnGhost} onClick={() => setView(view === "table" ? "kanban" : "table")}>
              View: {view === "table" ? "Kanban" : "Table"}
            </button>
            <button style={S.btnGhost} onClick={exportJSON}>Export JSON</button>
            <input
              type="file"
              accept="application/json"
              ref={fileRef}
              onChange={importJSON}
              style={{ display: "none" }}
            />
            <button style={S.btn} onClick={() => fileRef.current.click()}>
              Import JSON
            </button>
            <button style={S.btn} onClick={() => setEditing(defaultLead())}>
              + New Lead
            </button>
          </div>
        </header>

        {/* KPIs */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
          <Kpi label="Active Pipeline" value={metrics.active} />
          <Kpi label="Won" value={metrics.won} />
          <Kpi label="Lost" value={metrics.lost} />
          <Kpi label="Won Volume" value={fmtMoney(metrics.vol)} />
          <Kpi label="Close Rate" value={`${metrics.closeRate}%`} />
        </section>

        {/* Filters */}
        <section style={{ ...S.card, marginBottom: 16 }}>
          <div style={S.grid3}>
            <div>
              <label>Search</label>
              <input
                style={S.input}
                placeholder="Name, email, phone, notes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div>
              <label>Status</label>
              <select
                style={S.select}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option>All</option>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Source</label>
              <select
                style={S.select}
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option>All</option>
                {SOURCES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label>Sort</label>
            <select
              style={S.select}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
            >
              {Object.keys(SORTS).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </div>
          {metrics.overdueCount > 0 && (
            <p style={{ marginTop: 8, color: "#f59e0b" }}>
              ⚠️ {metrics.overdueCount} lead(s) have overdue follow-ups.
            </p>
          )}
        </section>

        {/* Content */}
        {view === "table" ? (
          <TableView
            rows={filtered}
            onEdit={(l) => setEditing(l)}
            onRemove={removeLead}
            moveStatus={moveStatus}
          />
        ) : (
          <KanbanView
            leads={filtered}
            onEdit={(l) => setEditing(l)}
            onRemove={removeLead}
            moveStatus={moveStatus}
          />
        )}

        {/* Drawer / Modal-ish editor */}
        {editing && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.6)",
              display: "grid",
              placeItems: "center",
              padding: 16,
              zIndex: 50,
            }}
            onClick={() => setEditing(null)}
          >
            <div
              style={{ ...S.card, width: "min(720px, 95vw)", maxHeight: "90vh", overflow: "auto" }}
              onClick={(e) => e.stopPropagation()}
            >
              <LeadForm
                initial={editing}
                onCancel={() => setEditing(null)}
                onSave={saveLead}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** ------------------------------
 *  Components
 *  ------------------------------ */
function Kpi({ label, value }) {
  return (
    <div style={{ ...S.card, textAlign: "center" }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function TableView({ rows, onEdit, onRemove, moveStatus }) {
  return (
    <div style={S.card}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.7 }}>
              <th>Name</th>
              <th>Contact</th>
              <th>Source</th>
              <th>Agent</th>
              <th>Loan</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Next Follow-Up</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} style={{ borderTop: "1px solid #1f2937" }}>
                <td>
                  <div style={{ fontWeight: 600 }}>{l.name || "—"}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {l.propertyAddress || "—"}
                  </div>
                </td>
                <td style={{ fontSize: 14 }}>
                  <div>{l.phone || "—"}</div>
                  <div style={{ opacity: 0.7 }}>{l.email || "—"}</div>
                </td>
                <td>{l.source}</td>
                <td>{l.agent || "—"}</td>
                <td>{l.loanType}</td>
                <td>{fmtMoney(l.loanAmount)}</td>
                <td>
                  <span style={S.tag(S.statusColors[l.status])}>{l.status}</span>
                </td>
                <td style={{ color: overdue(l.nextFollowUp) ? "#f59e0b" : "inherit" }}>
                  {l.nextFollowUp || "—"}
                </td>
                <td style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button style={S.btnGhost} onClick={() => moveStatus(l.id, -1)}>◀</button>
                  <button style={S.btnGhost} onClick={() => onEdit(l)}>Edit</button>
                  <button style={{ ...S.btnGhost, borderColor: "#ef4444", color: "#ef4444" }}
                    onClick={() => onRemove(l.id)}>
                    Delete
                  </button>
                  <button style={S.btnGhost} onClick={() => moveStatus(l.id, +1)}>▶</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 24, opacity: 0.7 }}>
                  No leads match your filters yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KanbanView({ leads, onEdit, onRemove, moveStatus }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
      {STATUSES.filter((s) => s !== "Won" && s !== "Lost").map((status) => {
        const col = leads.filter((l) => l.status === status);
        return (
          <div key={status} style={S.card}>
            <div style={{ marginBottom: 8, fontWeight: 700 }}>
              <span style={S.tag(S.statusColors[status])}>{status}</span>
              <span style={{ marginLeft: 8, opacity: 0.7 }}>{col.length}</span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {col.map((l) => (
                <div key={l.id} style={{ ...S.card, background: "#0b1020" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{l.name || "—"}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {l.phone || "—"} · {l.email || "—"}
                      </div>
                    </div>
                    <div style={{ fontSize: 12 }}>{fmtMoney(l.loanAmount)}</div>
                  </div>
                  {!!l.nextFollowUp && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: overdue(l.nextFollowUp) ? "#f59e0b" : "inherit",
                      }}
                    >
                      Next: {l.nextFollowUp}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button style={S.btnGhost} onClick={() => moveStatus(l.id, -1)}>◀</button>
                    <button style={S.btnGhost} onClick={() => onEdit(l)}>Edit</button>
                    <button style={{ ...S.btnGhost, borderColor: "#ef4444", color: "#ef4444" }}
                      onClick={() => onRemove(l.id)}>
                      Delete
                    </button>
                    <button style={S.btnGhost} onClick={() => moveStatus(l.id, +1)}>▶</button>
                  </div>
                </div>
              ))}
              {col.length === 0 && (
                <div style={{ opacity: 0.5, fontSize: 12 }}>No cards</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeadForm({ initial, onCancel, onSave }) {
  const [lead, setLead] = useState(initial || defaultLead());
  useEffect(() => setLead(initial || defaultLead()), [initial]);

  const isWon = lead.status === "Won";

  const update = (k, v) => setLead((p) => ({ ...p, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (!lead.name) return alert("Please enter a name.");
    if (isWon && !lead.closeDate) update("closeDate", toISODate(Date.now()));
    onSave({ ...lead, updatedAt: Date.now() });
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}>
          {initial?.id ? "Edit Lead" : "New Lead"}
        </h3>
        <button type="button" onClick={onCancel} style={S.btnGhost}>Close</button>
      </div>

      <div style={S.grid2}>
        <Field label="Name">
          <input style={S.input} value={lead.name} onChange={(e) => update("name", e.target.value)} />
        </Field>
        <Field label="Phone">
          <input style={S.input} value={lead.phone} onChange={(e) => update("phone", e.target.value)} />
        </Field>
        <Field label="Email">
          <input style={S.input} value={lead.email} onChange={(e) => update("email", e.target.value)} />
        </Field>
        <Field label="Source">
          <select style={S.select} value={lead.source} onChange={(e) => update("source", e.target.value)}>
            {SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Partner / Realtor">
          <input style={S.input} value={lead.agent} onChange={(e) => update("agent", e.target.value)} />
        </Field>
        <Field label="Loan Type">
          <select style={S.select} value={lead.loanType} onChange={(e) => update("loanType", e.target.value)}>
            {LOAN_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Loan Amount">
          <input
            style={S.input}
            inputMode="decimal"
            value={lead.loanAmount}
            onChange={(e) => update("loanAmount", e.target.value)}
            placeholder="400000"
          />
        </Field>
        <Field label="Status">
          <select style={S.select} value={lead.status} onChange={(e) => update("status", e.target.value)}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Property Address" full>
          <input style={S.input} value={lead.propertyAddress} onChange={(e) => update("propertyAddress", e.target.value)} />
        </Field>
        <Field label="Next Follow-Up">
          <input type="date" style={S.input} value={lead.nextFollowUp || ""} onChange={(e) => update("nextFollowUp", e.target.value)} />
        </Field>
        {isWon && (
          <Field label="Close Date">
            <input type="date" style={S.input} value={lead.closeDate || ""} onChange={(e) => update("closeDate", e.target.value)} />
          </Field>
        )}
        <Field label="Notes" full>
          <textarea style={{ ...S.input, minHeight: 100 }} value={lead.notes} onChange={(e) => update("notes", e.target.value)} />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" style={S.btnGhost} onClick={onCancel}>Cancel</button>
        <button type="submit" style={S.btn}>Save Lead</button>
      </div>
    </form>
  );
}

function Field({ label, children, full = false }) {
  return (
    <label style={{ display: "grid", gap: 6, gridColumn: full ? "1 / -1" : "auto" }}>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{label}</span>
      {children}
    </label>
  );
}
