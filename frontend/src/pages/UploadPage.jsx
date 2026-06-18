import { useState } from "react";
import { parseCSV } from "../utils/parseCSV";
import "./UploadPage.css";

const API = "http://localhost:8000";

const GEO_SUGGESTIONS = [
  { id:"GSE280402", label:"T2D Blood",        desc:"Type 2 Diabetes · Blood · RNA-seq counts",          tag:"T2D"    },
  { id:"GSE41762",  label:"Pancreatic Islets", desc:"T2D · Pancreatic islets · Microarray",              tag:"T2D"    },
  { id:"GSE38642",  label:"Islets T2D",        desc:"Type 2 Diabetes · Islets · Microarray",             tag:"T2D"    },
  { id:"GSE50397",  label:"T2D Adipose",       desc:"Type 2 Diabetes · Adipose tissue",                  tag:"T2D"    },
  { id:"GSE76895",  label:"T2D Muscle",        desc:"Type 2 Diabetes · Skeletal muscle",                 tag:"T2D"    },
  { id:"GSE15471",  label:"Pancreatic Cancer", desc:"Pancreatic ductal adenocarcinoma vs normal tissue", tag:"Cancer" },
  { id:"GSE16515",  label:"PDAC vs Normal",    desc:"Pancreatic cancer vs normal · Microarray",          tag:"Cancer" },
  { id:"GSE32676",  label:"Cancer Markers",    desc:"Pancreatic cancer · Blood markers",                 tag:"Cancer" },
];

const STEPS = [
  "Downloading GEO metadata","Downloading count data","Reading count matrix",
  "Assigning groups","Running DGE (voom + limma)","Exporting results",
  "Generating heatmap","Finalizing","Complete",
];

const RAW_STEPS = [
  "Inspecting uploaded file","Selecting expression file","Reading count matrix",
  "Assigning groups","Running DGE (voom + limma)","Exporting results",
  "Generating heatmap","Finalizing","Complete",
];

const RAW_ACCEPT = ".csv,.tsv,.txt,.gz,.tar,.tgz";

export default function UploadPage({ onDataLoaded }) {
  const [mode,      setMode]      = useState("csv"); // "csv" | "geo" | "raw"
  const [dragging,  setDragging]  = useState(false);
  const [file,      setFile]      = useState(null);
  const [geoId,     setGeoId]     = useState("");
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [jobId,     setJobId]     = useState(null);
  const [jobStep,   setJobStep]   = useState("");
  const [jobLog,    setJobLog]    = useState([]);
  const [jobStatus, setJobStatus] = useState("");
  const [filterTag, setFilterTag] = useState("All");

  // Raw-upload mode state
  const [rawFile,    setRawFile]    = useState(null);
  const [rawDragging, setRawDragging] = useState(false);

  const resetJobState = () => {
    setJobId(null); setJobStep(""); setJobLog([]); setJobStatus("");
  };

  const processFile = (f) => {
    if (!f) return;
    if (!f.name.endsWith(".csv") && !f.name.endsWith(".tsv")) { setError("Please upload a .csv or .tsv file."); return; }
    setFile(f); setError(""); setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const genes = parseCSV(e.target.result);
        if (genes.length === 0) throw new Error("No valid genes found. Check your file format.");
        setTimeout(() => { setLoading(false); onDataLoaded(genes, f.name); }, 500);
      } catch (err) { setError(err.message); setLoading(false); }
    };
    reader.readAsText(f);
  };

  const runGeoPipeline = async (id) => {
    const gid = (id || geoId).trim().toUpperCase();
    if (!gid.startsWith("GSE")) { setError("GEO ID must start with GSE, e.g. GSE280402"); return; }
    setGeoId(gid); setError(""); setLoading(true);
    setJobStep("Starting…"); setJobLog([]); setJobStatus("running"); setJobId(null);
    try {
      const res  = await fetch(`${API}/geo/run`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({geo_id:gid}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to start pipeline");
      setJobId(data.job_id);
      pollJob(data.job_id, gid);
    } catch (e) { setError(e.message); setLoading(false); setJobStatus(""); }
  };

  // Validate raw file extension client-side (mirrors backend ALLOWED_RAW_EXTENSIONS)
  const isRawFileAllowed = (f) => {
    const name = f.name.toLowerCase();
    return [".csv",".tsv",".txt",".csv.gz",".tsv.gz",".txt.gz",".tar",".tar.gz",".tgz"]
      .some(ext => name.endsWith(ext));
  };

  const processRawFile = (f) => {
    if (!f) return;
    if (!isRawFileAllowed(f)) {
      setError("Unsupported file type. Accepted: .csv, .tsv, .txt (optionally .gz), or .tar/.tar.gz/.tgz");
      return;
    }
    setRawFile(f);
    setError("");
  };

  const runRawUploadPipeline = async () => {
    if (!rawFile) { setError("Choose a file to upload first."); return; }
    setError(""); setLoading(true);
    setJobStep("Starting…"); setJobLog([]); setJobStatus("running"); setJobId(null);

    try {
      const formData = new FormData();
      formData.append("file", rawFile);

      const res  = await fetch(`${API}/geo/upload-raw`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to start pipeline");

      setGeoId(data.geo_id);
      setJobId(data.job_id);
      pollJob(data.job_id, data.geo_id);
    } catch (e) {
      setError(e.message); setLoading(false); setJobStatus("");
    }
  };

  const pollJob = (jid, gid) => {
    const iv = setInterval(async () => {
      try {
        const res  = await fetch(`${API}/geo/status/${jid}`);
        const data = await res.json();
        setJobStep(data.step); setJobLog(data.log||[]); setJobStatus(data.status);
        if (data.status === "done") {
          clearInterval(iv); setLoading(false);
          const csvRes = await fetch(`${API}/geo/download/${jid}`);
          const genes  = parseCSV(await csvRes.text());
          onDataLoaded(genes, `${gid}_DEGs_Full.csv`, jid);
        }
        if (data.status === "error") { clearInterval(iv); setLoading(false); setError("Pipeline error: "+(data.errors?.[0]||"Unknown error")); }
      } catch { clearInterval(iv); setLoading(false); }
    }, 2500);
  };

  const activeSteps = mode === "raw" ? RAW_STEPS : STEPS;
  const stepIdx     = activeSteps.indexOf(jobStep);
  const filteredGEO = filterTag === "All" ? GEO_SUGGESTIONS : GEO_SUGGESTIONS.filter(g => g.tag === filterTag);

  const switchMode = (m) => {
    setMode(m); setError("");
    if (!loading) resetJobState();
  };

  return (
    <div className="up-root">
      <div className="up-bg-grid"/>
      <div className="up-center">

        {/* Hero */}
        <div className="up-badge">GENE EXPRESSION ANALYSIS</div>
        <h1 className="up-title">DEG Analysis <em>Viewer</em></h1>
        <p className="up-sub">Visualize differentially expressed genes · Volcano plots · MA plots · Gene tables</p>

        {/* Mode toggle */}
        <div className="up-toggle">
          <button className={`up-tog-btn ${mode==="csv"?"active":""}`} onClick={()=>switchMode("csv")}>
            📂 Upload CSV file
          </button>
          <button className={`up-tog-btn ${mode==="geo"?"active":""}`} onClick={()=>switchMode("geo")}>
            🌐 Fetch from GEO
          </button>
          <button className={`up-tog-btn ${mode==="raw"?"active":""}`} onClick={()=>switchMode("raw")}>
            🧬 Upload raw GEO file
          </button>
        </div>

        {/* ── CSV mode ── */}
        {mode === "csv" && (
          <div className="up-csv-section">
            <div
              className={`up-zone ${dragging?"drag":""} ${file&&!error?"ready":""}`}
              onDragOver={(e)=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)}
              onDrop={(e)=>{e.preventDefault();setDragging(false);processFile(e.dataTransfer.files[0]);}}
              onClick={()=>document.getElementById("fi").click()}
            >
              <input id="fi" type="file" accept=".csv,.tsv" style={{display:"none"}} onChange={(e)=>processFile(e.target.files[0])}/>
              {loading ? (
                <div className="up-loading"><div className="up-spinner"/><span>Parsing genes…</span></div>
              ) : file && !error ? (
                <div className="up-done"><div className="up-check">✓</div><p className="up-fname">{file.name}</p><p className="up-change">Click to change file</p></div>
              ) : (
                <><div className="up-drop-icon">📂</div><p className="up-main">Drop your DEG results file here</p><p className="up-hint">CSV or TSV · limma · edgeR · DESeq2 output</p><div className="up-btn">Browse files</div></>
              )}
            </div>
            <div className="up-cols">
              <p className="up-cols-label">Required columns in your file</p>
              <div className="up-cols-list">
                {["GeneSymbol","logFC","P.Value","adj.P.Val","AveExpr","t","B"].map(c=><code key={c}>{c}</code>)}
              </div>
            </div>
          </div>
        )}

        {/* ── GEO mode ── */}
        {mode === "geo" && (
          <div className="up-geo-section">

            {/* Manual input */}
            <div className="up-geo-input-box">
              <label className="up-geo-label">Enter any GEO Dataset ID</label>
              <div className="up-geo-row">
                <input value={geoId} onChange={e=>setGeoId(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&!loading&&runGeoPipeline()}
                  placeholder="e.g. GSE280402" className="up-geo-input" disabled={loading}/>
                <button onClick={()=>runGeoPipeline()} disabled={loading||!geoId.trim()} className="up-geo-run">
                  {loading?<><span className="up-btn-spin"/>Running…</>:"▶ Run Pipeline"}
                </button>
              </div>
              <p className="up-geo-hint">Downloads raw data from NCBI GEO → runs limma/voom pipeline → loads results automatically</p>
            </div>

            {/* Divider */}
            <div className="up-divider"><span>or pick from curated datasets below</span></div>

            {/* Filter */}
            <div className="up-tag-filter">
              {["All","T2D","Cancer"].map(t=>(
                <button key={t} className={`up-tag-btn ${filterTag===t?"active":""}`} onClick={()=>setFilterTag(t)}>
                  {t==="All"?"🔬 All":t==="T2D"?"🩸 T2D":"🔬 Cancer"}
                </button>
              ))}
            </div>

            {/* Cards grid */}
            <div className="up-geo-grid">
              {filteredGEO.map(g=>{
                const isSelected = geoId === g.id;
                const tagStyle   = g.tag==="T2D"
                  ? {bg:"#ede9fe",color:"#6d28d9"}
                  : {bg:"#fce7f3",color:"#9d174d"};
                return (
                  <div key={g.id}
                    className={`up-geo-card ${isSelected?"selected":""} ${loading?"disabled":""}`}
                    onClick={()=>{ if(!loading){ setGeoId(g.id); setError(""); } }}
                  >
                    <div className="up-card-top">
                      <span className="up-card-id">{g.id}</span>
                      <span className="up-card-tag" style={{background:tagStyle.bg,color:tagStyle.color}}>{g.tag}</span>
                    </div>
                    <div className="up-card-label">{g.label}</div>
                    <div className="up-card-desc">{g.desc}</div>
                    {isSelected && (
                      <button className="up-card-run-btn"
                        onClick={e=>{e.stopPropagation();runGeoPipeline(g.id);}} disabled={loading}>
                        ▶ Run this dataset
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Raw GEO file upload mode ── */}
        {mode === "raw" && (
          <div className="up-csv-section">
            <div
              className={`up-zone ${rawDragging?"drag":""} ${rawFile&&!error?"ready":""}`}
              onDragOver={(e)=>{e.preventDefault();setRawDragging(true);}}
              onDragLeave={()=>setRawDragging(false)}
              onDrop={(e)=>{e.preventDefault();setRawDragging(false);processRawFile(e.dataTransfer.files[0]);}}
              onClick={()=>!loading && document.getElementById("fi-raw").click()}
            >
              <input id="fi-raw" type="file" accept={RAW_ACCEPT} style={{display:"none"}}
                onChange={(e)=>processRawFile(e.target.files[0])} disabled={loading}/>
              {rawFile && !error ? (
                <div className="up-done">
                  <div className="up-check">✓</div>
                  <p className="up-fname">{rawFile.name}</p>
                  <p className="up-change">{loading ? "Pipeline running…" : "Click to change file"}</p>
                </div>
              ) : (
                <>
                  <div className="up-drop-icon">🧬</div>
                  <p className="up-main">Drop a raw GEO file here</p>
                  <p className="up-hint">Counts matrix, series matrix, or a GEO supplementary archive (.tar/.tar.gz/.tgz)</p>
                  <div className="up-btn">Browse files</div>
                </>
              )}
            </div>

            <div className="up-cols">
              <p className="up-cols-label">Supported file types</p>
              <div className="up-cols-list">
                {[".csv",".tsv",".txt",".csv.gz",".tsv.gz",".txt.gz",".tar",".tar.gz",".tgz"].map(c=><code key={c}>{c}</code>)}
              </div>
              <p className="up-geo-hint" style={{marginTop:"8px"}}>
                The same limma/voom DGE pipeline runs automatically on whatever expression
                data is detected inside your file — no need to know the GEO accession ID.
              </p>
            </div>

            {rawFile && !loading && (
              <button onClick={runRawUploadPipeline} disabled={loading} className="up-geo-run" style={{marginTop:"16px"}}>
                ▶ Run DGE Analysis
              </button>
            )}
          </div>
        )}

        {/* Progress (shared by GEO and raw-upload modes) */}
        {(mode === "geo" || mode === "raw") && jobId && (
          <div className="up-progress">
            <div className="up-progress-header">
              <span className="up-progress-title">Pipeline — {geoId}</span>
              <span className={`up-status-pill ${jobStatus}`}>
                {jobStatus==="done"?"✓ Complete":jobStatus==="error"?"✗ Error":"⏳ Running"}
              </span>
            </div>
            <div className="up-steps">
              {activeSteps.map((s,i)=>(
                <div key={s} className={`up-step ${i<stepIdx?"done":i===stepIdx?"current":"pending"}`}>
                  <span className="up-step-dot">{i<stepIdx?"✓":i===stepIdx?"◉":"○"}</span>
                  <span className="up-step-lbl">{s}</span>
                  {i===stepIdx&&<div className="up-step-pulse"/>}
                </div>
              ))}
            </div>
            {jobLog.length>0&&(
              <div className="up-log">
                {jobLog.slice(-12).map((line,i)=>(
                  <div key={i} className={`up-log-line ${line.includes("ERROR")?"err":line.includes("STEP")?"step":""}`}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {error&&<div className="up-err">⚠ {error}</div>}
      </div>
    </div>
  );
}