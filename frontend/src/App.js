import { useState } from "react";

const API = "http://localhost:8000";

// Step tracker config
const STEPS = [
  { key: "validation",   label: "Data Validation" },
  { key: "dge_analysis", label: "DGE Analysis" },
  { key: "shared_genes", label: "Shared Genes" },
  { key: "enrichment",   label: "Pathway Enrichment" },
  { key: "ppi_network",  label: "PPI Network" },
  { key: "ai_risk",      label: "AI Risk Prediction" },
  { key: "report",       label: "Generate Report" },
];

function StatusBadge({ status }) {
  const map = {
    done:    { bg: "#d1fae5", color: "#065f46", label: "✅ Done" },
    running: { bg: "#fef3c7", color: "#92400e", label: "⏳ Running" },
    pending: { bg: "#f1f5f9", color: "#64748b", label: "⬜ Pending" },
    error:   { bg: "#fee2e2", color: "#991b1b", label: "❌ Error" },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 6, padding: "2px 10px", fontSize: 13, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function FileDropZone({ label, file, onFile }) {
  const [drag, setDrag] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => document.getElementById(`input-${label}`).click()}
      style={{
        border: `2px dashed ${drag ? "#6366f1" : "#cbd5e1"}`,
        borderRadius: 12,
        padding: "32px 20px",
        textAlign: "center",
        cursor: "pointer",
        background: drag ? "#eef2ff" : "#f8fafc",
        transition: "all 0.2s",
        flex: 1,
      }}
    >
      <input
        id={`input-${label}`}
        type="file"
        accept=".csv,.tsv"
        style={{ display: "none" }}
        onChange={(e) => onFile(e.target.files[0])}
      />
      <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
      <div style={{ fontWeight: 700, color: "#334155", marginBottom: 4 }}>{label}</div>
      {file
        ? <div style={{ color: "#6366f1", fontWeight: 600, fontSize: 14 }}>✅ {file.name}</div>
        : <div style={{ color: "#94a3b8", fontSize: 13 }}>Drag & drop or click to upload (.csv / .tsv)</div>
      }
    </div>
  );
}

export default function App() {
  const [t2dFile, setT2dFile]       = useState(null);
  const [cancerFile, setCancerFile] = useState(null);
  const [jobId, setJobId]           = useState(null);
  const [steps, setSteps]           = useState(null);
  const [results, setResults]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [page, setPage]             = useState("upload"); // upload | progress | results

  // Upload files and get job ID
  const handleUpload = async () => {
    if (!t2dFile || !cancerFile) { setError("Please upload both files."); return; }
    setLoading(true); setError("");
    try {
      const form = new FormData();
      form.append("t2d_file", t2dFile);
      form.append("cancer_file", cancerFile);

      const res = await fetch(`${API}/upload`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");

      setJobId(data.job_id);
      setPage("progress");

      // Trigger pipeline
      await fetch(`${API}/run/${data.job_id}`, { method: "POST" });

      // Poll status every 2 seconds (simulate for now)
      pollStatus(data.job_id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = async (id) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/status/${id}`);
        const data = await res.json();
        setSteps(data.steps);

        if (data.status === "done" || data.status === "uploaded") {
          clearInterval(interval);
          // Fetch results
          const rRes = await fetch(`${API}/results/${id}`);
          const rData = await rRes.json();
          setResults(rData);
          setPage("results");
        }
      } catch { clearInterval(interval); }
    }, 2000);

    // For demo: auto-complete after 4s since pipeline is mocked
    setTimeout(async () => {
      clearInterval(interval);
      const rRes = await fetch(`${API}/results/${id}`);
      const rData = await rRes.json();
      setResults(rData);
      setPage("results");
    }, 4000);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0f4ff 0%,#faf5ff 100%)", fontFamily: "'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#1e1b4b", color: "#fff", padding: "18px 40px", display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: 28 }}>🧬</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: 0.5 }}>CancerRiskAI</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>T2D × Pancreatic Cancer Risk Platform</div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px" }}>

        {/* ── UPLOAD PAGE ── */}
        {page === "upload" && (
          <div>
            <h2 style={{ color: "#1e1b4b", fontWeight: 800, fontSize: 26, marginBottom: 6 }}>Upload Your Datasets</h2>
            <p style={{ color: "#64748b", marginBottom: 32 }}>
              Upload gene expression files for both cohorts. The pipeline will run automatically.
            </p>

            <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
              <FileDropZone label="T2D Dataset"              file={t2dFile}    onFile={setT2dFile} />
              <FileDropZone label="Pancreatic Cancer Dataset" file={cancerFile} onFile={setCancerFile} />
            </div>

            {error && <div style={{ color: "#dc2626", marginBottom: 16, fontWeight: 600 }}>⚠️ {error}</div>}

            <button
              onClick={handleUpload}
              disabled={loading || !t2dFile || !cancerFile}
              style={{
                width: "100%", padding: "16px", borderRadius: 12, border: "none",
                background: (!t2dFile || !cancerFile) ? "#cbd5e1" : "linear-gradient(90deg,#6366f1,#8b5cf6)",
                color: "#fff", fontWeight: 800, fontSize: 18, cursor: (!t2dFile || !cancerFile) ? "not-allowed" : "pointer",
                boxShadow: "0 4px 20px rgba(99,102,241,0.3)", transition: "all 0.2s"
              }}
            >
              {loading ? "Uploading..." : "🚀 Run Analysis"}
            </button>
          </div>
        )}

        {/* ── PROGRESS PAGE ── */}
        {page === "progress" && (
          <div>
            <h2 style={{ color: "#1e1b4b", fontWeight: 800, fontSize: 26, marginBottom: 6 }}>Running Pipeline</h2>
            <p style={{ color: "#64748b", marginBottom: 8 }}>Job ID: <code style={{ background: "#e0e7ff", padding: "2px 8px", borderRadius: 6 }}>{jobId}</code></p>
            <p style={{ color: "#64748b", marginBottom: 32 }}>Please wait while the analysis runs...</p>

            <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
              {STEPS.map((s) => (
                <div key={s.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ fontWeight: 600, color: "#334155" }}>{s.label}</span>
                  <StatusBadge status={steps?.[s.key] || "pending"} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RESULTS PAGE ── */}
        {page === "results" && results && (
          <div>
            <h2 style={{ color: "#1e1b4b", fontWeight: 800, fontSize: 26, marginBottom: 6 }}>Analysis Results</h2>
            <p style={{ color: "#64748b", marginBottom: 32 }}>Job ID: <code style={{ background: "#e0e7ff", padding: "2px 8px", borderRadius: 6 }}>{jobId}</code></p>

            {/* Hub Genes */}
            <div style={{ background: "#fff", borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
              <h3 style={{ color: "#1e1b4b", fontWeight: 700, marginBottom: 16 }}>🧬 Hub Genes Identified</h3>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {results.hub_genes.map((g) => (
                  <span key={g} style={{ background: "#e0e7ff", color: "#4338ca", padding: "6px 16px", borderRadius: 20, fontWeight: 700, fontSize: 14 }}>{g}</span>
                ))}
              </div>
            </div>

            {/* Patient Risk */}
            <div style={{ background: "#fff", borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
              <h3 style={{ color: "#1e1b4b", fontWeight: 700, marginBottom: 16 }}>🎯 Patient Risk Scores</h3>
              {results.patient_risks.map((p) => {
                const colors = { High: "#fee2e2", Medium: "#fef3c7", Low: "#d1fae5" };
                const text   = { High: "#991b1b", Medium: "#92400e", Low: "#065f46" };
                return (
                  <div key={p.patient_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ fontWeight: 600, color: "#334155" }}>{p.patient_id}</span>
                    <span style={{ background: colors[p.risk], color: text[p.risk], padding: "4px 16px", borderRadius: 20, fontWeight: 700, fontSize: 14 }}>{p.risk} Risk</span>
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => { setPage("upload"); setJobId(null); setResults(null); setT2dFile(null); setCancerFile(null); }}
                style={{ flex: 1, padding: 14, borderRadius: 12, border: "2px solid #6366f1", background: "#fff", color: "#6366f1", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
              >
                🔄 Run New Analysis
              </button>
              <button
                onClick={() => alert("PDF report download will be added in Phase 4!")}
                style={{ flex: 1, padding: 14, borderRadius: 12, border: "none", background: "linear-gradient(90deg,#6366f1,#8b5cf6)", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
              >
                📄 Download Report
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}