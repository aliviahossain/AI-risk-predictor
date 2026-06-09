import { useState } from "react";
import { parseCSV } from "../utils/parseCSV";
import "./UploadPage.css";

export default function UploadPage({ onDataLoaded }) {
  const [dragging, setDragging] = useState(false);
  const [file,     setFile]     = useState(null);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const processFile = (f) => {
    if (!f) return;
    if (!f.name.endsWith(".csv") && !f.name.endsWith(".tsv")) {
      setError("Please upload a .csv or .tsv file."); return;
    }
    setFile(f); setError(""); setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const genes = parseCSV(e.target.result);
        if (genes.length === 0) throw new Error("No valid genes found. Check your file format.");
        setTimeout(() => { setLoading(false); onDataLoaded(genes, f.name); }, 600);
      } catch (err) { setError(err.message); setLoading(false); }
    };
    reader.readAsText(f);
  };

  return (
    <div className="up-root">
      <div className="up-bg-grid" />
      <div className="up-center">
        <div className="up-badge">GENE EXPRESSION ANALYSIS</div>
        <h1 className="up-title">DEG Analysis<br /><em>Viewer</em></h1>
        <p className="up-sub">Upload your limma · edgeR · DESeq2 results CSV for instant interactive visualization</p>

        <div
          className={`up-zone ${dragging ? "drag" : ""} ${file && !error ? "ready" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}
          onClick={() => document.getElementById("fi").click()}
        >
          <input id="fi" type="file" accept=".csv,.tsv" style={{display:"none"}} onChange={(e) => processFile(e.target.files[0])} />
          {loading ? (
            <div className="up-loading"><div className="up-spinner"/><span>Parsing genes…</span></div>
          ) : file && !error ? (
            <div className="up-done">
              <div className="up-check">✓</div>
              <p className="up-fname">{file.name}</p>
              <p className="up-change">Click to change</p>
            </div>
          ) : (
            <>
              <div className="up-icon">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <rect x="4" y="8" width="24" height="30" rx="3" stroke="#6366f1" strokeWidth="2" fill="none"/>
                  <path d="M12 4h12l8 8v26a3 3 0 01-3 3H7a3 3 0 01-3-3V7a3 3 0 013-3z" stroke="#a5b4fc" strokeWidth="1.5" fill="none"/>
                  <path d="M20 20v8M16 24l4-4 4 4" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="up-main">Drop your DEG results file here</p>
              <p className="up-hint">CSV or TSV · limma · edgeR · DESeq2</p>
              <div className="up-btn">Browse files</div>
            </>
          )}
        </div>

        {error && <div className="up-err">⚠ {error}</div>}

        <div className="up-cols">
          <p className="up-cols-label">Required columns</p>
          <div className="up-cols-list">
            {["GeneSymbol","logFC","P.Value","adj.P.Val","AveExpr","t","B"].map((c) => (
              <code key={c}>{c}</code>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}