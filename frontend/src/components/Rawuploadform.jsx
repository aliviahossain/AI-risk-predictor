import { useState } from "react";
import { parseCSV } from "../utils/parseCSV";
import { API } from "../config";
import "./RawUploadForm.css";
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PIPELINE_STEPS = [
  "Reading count matrix",
  "Cleaning matrix",
  "Assigning groups",
  "Running DGE (voom + limma)",
  "Building results",
  "Generating heatmap",
  "Finalizing",
  "Complete",
];

export default function RawUploadForm({ onAnalysisComplete }) {
  const [file,      setFile]      = useState(null);
  const [label,     setLabel]     = useState("");
  const [dragging,  setDragging]  = useState(false);
  const [status,    setStatus]    = useState("");
  const [step,      setStep]      = useState("");
  const [log,       setLog]       = useState([]);
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [jobStatus, setJobStatus] = useState("");

  const processFile = (f) => {
    if (!f) return;
    const allowed = [".csv", ".tsv", ".txt", ".gz"];
    const ok = allowed.some((ext) => f.name.toLowerCase().endsWith(ext));
    if (!ok) { setError(`Unsupported file. Allowed: ${allowed.join(", ")}`); return; }
    setFile(f); setError("");
  };

  const pollStatus = async (jobId) => {
    let attempts = 0;
    while (true) {
      if (attempts > 300) throw new Error("Pipeline timeout — please try again.");
      attempts++;
      await wait(2500);

      const res = await fetch(`${API}/geo/status/${jobId}`);
      if (!res.ok) throw new Error("Failed to poll status");

      const data = await res.json();
      setStep(data.step || "");
      setLog(data.log || []);
      setJobStatus(data.status);

      if (data.status === "done")   return data;
      if (data.status === "error") {
        throw new Error(data.errors?.[0] || data.step || "Pipeline failed");
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError("Please choose a file."); return; }

    setLoading(true); setError(""); setStatus("Uploading…");
    setLog([]); setStep(""); setJobStatus("running");

    try {
      const form = new FormData();
      form.append("file",  file);
      form.append("label", label.trim() || "UPLOAD");

      const res  = await fetch(`${API}/geo/upload-raw`, { method:"POST", body:form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");

      setStatus("Pipeline running…");
      await pollStatus(data.job_id);

      setStatus("Downloading results…");
      const csvRes = await fetch(`${API}/geo/download/${data.job_id}`);
      if (!csvRes.ok) throw new Error("Could not download results");

      const genes = parseCSV(await csvRes.text());
      if (genes.length === 0) throw new Error("No valid genes in output — check file format.");

      setStatus("Done!");
      onAnalysisComplete(genes, `${data.geo_id || "upload"}_DEGs.csv`, data.job_id);

    } catch (err) {
      setError(err.message || "Unknown error");
      setStatus(""); setJobStatus("error");
    } finally {
      setLoading(false);
    }
  };

  const stepIdx = PIPELINE_STEPS.indexOf(step);

  return (
    <div className="raw-form">
      {/* Drop zone */}
      <div
        className={`raw-dropzone ${dragging?"drag":""} ${file?"ready":""}`}
        onDragOver={(e)=>{ e.preventDefault(); setDragging(true); }}
        onDragLeave={()=>setDragging(false)}
        onDrop={(e)=>{ e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}
        onClick={()=>document.getElementById("raw-fi").click()}
      >
        <input id="raw-fi" type="file"
          accept=".csv,.tsv,.txt,.gz"
          style={{display:"none"}}
          onChange={(e)=>processFile(e.target.files[0])}
          disabled={loading}
        />
        {file ? (
          <div className="raw-file-ready">
            <span className="raw-check">✓</span>
            <p className="raw-fname">{file.name}</p>
            <p className="raw-fsize">{(file.size/1024/1024).toFixed(1)} MB · click to change</p>
          </div>
        ) : (
          <>
            <div className="raw-drop-icon">📄</div>
            <p className="raw-drop-main">Drop your raw GEO count file here</p>
            <p className="raw-drop-hint">.csv · .tsv · .txt · .gz supported</p>
            <div className="raw-browse-btn">Browse files</div>
          </>
        )}
      </div>

      {/* Label input */}
      <input
        value={label}
        onChange={(e)=>setLabel(e.target.value)}
        placeholder="Optional label (e.g. GSE280402)"
        className="raw-label-input"
        disabled={loading}
      />

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={loading || !file}
        className="raw-submit-btn"
      >
        {loading
          ? <><span className="raw-spin"/>Running pipeline…</>
          : "▶ Run DEG Analysis"}
      </button>

      {/* Progress */}
      {loading && PIPELINE_STEPS.length > 0 && (
        <div className="raw-progress">
          <div className="raw-progress-header">
            <span>Pipeline Progress</span>
            <span className={`raw-pill ${jobStatus}`}>
              {jobStatus==="done"?"✓ Done":jobStatus==="error"?"✗ Error":"⏳ Running"}
            </span>
          </div>
          <div className="raw-steps">
            {PIPELINE_STEPS.map((s,i)=>(
              <div key={s} className={`raw-step ${i<stepIdx?"done":i===stepIdx?"current":"pending"}`}>
                <span className="raw-step-dot">{i<stepIdx?"✓":i===stepIdx?"◉":"○"}</span>
                <span className="raw-step-lbl">{s}</span>
                {i===stepIdx&&<span className="raw-pulse"/>}
              </div>
            ))}
          </div>
          {log.length > 0 && (
            <div className="raw-log">
              {log.slice(-10).map((l,i)=>(
                <div key={i} className={`raw-log-line ${l.includes("ERROR")?"err":l.includes("STEP")?"step":""}`}>
                  {l}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {status && !error && (
        <div className="raw-status">🧬 {status}</div>
      )}
      {error && (
        <div className="raw-error">⚠ {error}</div>
      )}

      <div className="raw-hint-box">
        <p className="raw-hint-title">Supported file formats</p>
        <div className="raw-hint-list">
          {[
            ["RNA-seq counts", "ENST/gene IDs × samples (.tsv/.gz)"],
            ["Microarray", "Probe IDs × samples (.txt/.gz)"],
            ["With SYMBOL col", "ENSEMBL | SYMBOL | samples (.tsv)"],
            ["Pre-processed DEG", "GeneSymbol, logFC, adj.P.Val... (.csv)"],
          ].map(([t,d])=>(
            <div key={t} className="raw-hint-item">
              <span className="raw-hint-type">{t}</span>
              <span className="raw-hint-desc">{d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}