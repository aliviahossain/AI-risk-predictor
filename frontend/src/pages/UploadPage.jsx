import { useState, useEffect } from "react";
import { parseCSV } from "../utils/parseCSV";
import RawUploadForm from "../components/RawUploadForm";
import { API } from "../config";
import "./UploadPage.css";

/* Full-page rotating background — DNA / gene imagery only (Unsplash CDN) */
const HERO_IMAGES = [
  { url:"https://images.unsplash.com/photo-1643780668909-580822430155?q=80&w=1332&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D", caption:"DNA double helix" },
  { url:"https://images.unsplash.com/photo-1681911046064-e663d5192921?q=80&w=1121&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D", caption:"DNA helix strand" },
  { url:"https://images.unsplash.com/photo-1581594549595-35f6edc7b762?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D", caption:"Genomic sequencing" },
];

const GEO_SUGGESTIONS = [
  { id:"GSE280402", label:"T2D Blood",        desc:"Type 2 Diabetes · Blood · RNA-seq",             tag:"T2D"    },
  { id:"GSE41762",  label:"Pancreatic Islets", desc:"T2D · Pancreatic islets · Microarray",          tag:"T2D"    },
  { id:"GSE38642",  label:"Islets T2D",        desc:"Type 2 Diabetes · Islets · Microarray",         tag:"T2D"    },
  { id:"GSE50397",  label:"T2D Adipose",       desc:"Type 2 Diabetes · Adipose tissue",              tag:"T2D"    },
  { id:"GSE76895",  label:"T2D Muscle",        desc:"Type 2 Diabetes · Skeletal muscle",             tag:"T2D"    },
  { id:"GSE15471",  label:"Pancreatic Cancer", desc:"Pancreatic ductal adenocarcinoma vs normal",    tag:"Cancer" },
  { id:"GSE16515",  label:"PDAC vs Normal",    desc:"Pancreatic cancer vs normal · Microarray",      tag:"Cancer" },
  { id:"GSE32676",  label:"Cancer Markers",    desc:"Pancreatic cancer · Blood markers",             tag:"Cancer" },
];

const STEPS = [
  "Downloading GEO metadata","Downloading count data","Reading count matrix",
  "Cleaning matrix","Assigning groups","Running DGE (voom + limma)",
  "Building results","Generating heatmap","Finalizing","Complete",
];

export default function UploadPage({ onDataLoaded }) {
  const [mode,      setMode]      = useState("csv");
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
  const [heroIdx,   setHeroIdx]   = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setHeroIdx(i => (i + 1) % HERO_IMAGES.length), 4500);
    return () => clearInterval(iv);
  }, []);

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
    if (!gid.startsWith("GSE")) { setError("GEO ID must start with GSE"); return; }
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

  const pollJob = (jid, gid) => {
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API}/geo/status/${jid}`);
        if (!res.ok) throw new Error("Status poll failed — server returned " + res.status);
        const data = await res.json();
        setJobStep(data.step); setJobLog(data.log||[]); setJobStatus(data.status);
        if (data.status === "done") {
          clearInterval(iv); setLoading(false);
          const csvRes = await fetch(`${API}/geo/download/${jid}`);
          if (!csvRes.ok) throw new Error("Could not download pipeline results (HTTP " + csvRes.status + ")");
          const genes = parseCSV(await csvRes.text());
          if (genes.length === 0) throw new Error("Pipeline produced no valid genes — check the log above.");
          onDataLoaded(genes, `${gid}_DEGs_Full.csv`, jid);
        }
        if (data.status === "error") { clearInterval(iv); setLoading(false); setError("Pipeline error: "+(data.errors?.[0]||"Unknown")); }
      } catch (e) { clearInterval(iv); setLoading(false); setError(e.message || "Network error while polling pipeline."); }
    }, 2500);
  };

  const stepIdx     = STEPS.indexOf(jobStep);
  const filteredGEO = filterTag==="All" ? GEO_SUGGESTIONS : GEO_SUGGESTIONS.filter(g=>g.tag===filterTag);

  return (
    <div className="up-root">
      <div className="up-bg-grid"/>
      {/* Full-page rotating gene / cancer background */}
      <div className="up-bgshow">
        {HERO_IMAGES.map((img,i)=>(
          <div key={img.url}
            className={`up-bgshow-slide ${i===heroIdx?"active":""}`}
            style={{backgroundImage:`url(${img.url})`}}/>
        ))}
        <div className="up-bgshow-overlay"/>
      </div>

      <div className="up-center">
        <div className="up-hero-cap">🧬 {HERO_IMAGES[heroIdx].caption}</div>
        <div className="up-badge">GENE EXPRESSION ANALYSIS</div>
        <h1 className="up-title">DEG Analysis <em>Viewer</em></h1>
        <p className="up-sub">Visualize differentially expressed genes · Volcano plots · MA plots · Gene tables</p>

        {/* 3-way toggle */}
        <div className="up-toggle">
          <button className={`up-tog-btn ${mode==="csv"?"active":""}`}    onClick={()=>{setMode("csv");setError("");}}>📂 Upload CSV</button>
          <button className={`up-tog-btn ${mode==="raw"?"active":""}`}    onClick={()=>{setMode("raw");setError("");}}>📄 Upload Raw File</button>
          <button className={`up-tog-btn ${mode==="geo"?"active":""}`}    onClick={()=>{setMode("geo");setError("");}}>🌐 GEO Dataset ID</button>
        </div>

        {/* ── CSV mode ── */}
        {mode==="csv" && (
          <div className="up-csv-section">
            <div className={`up-zone ${dragging?"drag":""} ${file&&!error?"ready":""}`}
              onDragOver={(e)=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)}
              onDrop={(e)=>{e.preventDefault();setDragging(false);processFile(e.dataTransfer.files[0]);}}
              onClick={()=>document.getElementById("fi").click()}>
              <input id="fi" type="file" accept=".csv,.tsv" style={{display:"none"}} onChange={(e)=>processFile(e.target.files[0])}/>
              {loading ? (
                <div className="up-loading"><div className="up-spinner"/><span>Parsing genes…</span></div>
              ) : file && !error ? (
                <div className="up-done"><div className="up-check">✓</div><p className="up-fname">{file.name}</p><p className="up-change">Click to change</p></div>
              ) : (
                <><div className="up-drop-icon">📂</div><p className="up-main">Drop your DEG results CSV here</p><p className="up-hint">limma · edgeR · DESeq2 output · .csv or .tsv</p><div className="up-btn">Browse files</div></>
              )}
            </div>
            <div className="up-cols">
              <p className="up-cols-label">Required columns</p>
              <div className="up-cols-list">
                {["GeneSymbol","logFC","P.Value","adj.P.Val","AveExpr","t","B"].map(c=><code key={c}>{c}</code>)}
              </div>
            </div>
          </div>
        )}

        {/* ── Raw file mode ── */}
        {mode==="raw" && (
          <div className="up-raw-section">
            <p className="up-raw-desc">
              Upload any raw GEO expression file directly — counts matrix, microarray matrix, or .gz file.
              The pipeline runs DEG analysis automatically without needing to download from GEO.
            </p>
            <RawUploadForm onAnalysisComplete={onDataLoaded} />
          </div>
        )}

        {/* ── GEO ID mode ── */}
        {mode==="geo" && (
          <div className="up-geo-section">
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
              <p className="up-geo-hint">Downloads raw data from NCBI GEO → runs limma/voom → loads results</p>
            </div>

            <div className="up-divider"><span>or pick a curated dataset</span></div>

            <div className="up-tag-filter">
              {["All","T2D","Cancer"].map(t=>(
                <button key={t} className={`up-tag-btn ${filterTag===t?"active":""}`} onClick={()=>setFilterTag(t)}>
                  {t==="All"?"🔬 All":t==="T2D"?"🩸 T2D":"🔬 Cancer"}
                </button>
              ))}
            </div>

            <div className="up-geo-grid">
              {filteredGEO.map(g=>{
                const isSelected = geoId===g.id;
                const tc = g.tag==="T2D" ? {bg:"#ede9fe",color:"#6d28d9"} : {bg:"#fce7f3",color:"#9d174d"};
                return (
                  <div key={g.id} className={`up-geo-card ${isSelected?"selected":""} ${loading?"disabled":""}`}
                    onClick={()=>{ if(!loading){ setGeoId(g.id); setError(""); } }}>
                    <div className="up-card-top">
                      <span className="up-card-id">{g.id}</span>
                      <span className="up-card-tag" style={{background:tc.bg,color:tc.color}}>{g.tag}</span>
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

            {jobId && (
              <div className="up-progress">
                <div className="up-progress-header">
                  <span className="up-progress-title">Pipeline — {geoId}</span>
                  <span className={`up-status-pill ${jobStatus}`}>
                    {jobStatus==="done"?"✓ Complete":jobStatus==="error"?"✗ Error":"⏳ Running"}
                  </span>
                </div>
                <div className="up-steps">
                  {STEPS.map((s,i)=>(
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
          </div>
        )}

        {error && <div className="up-err">⚠ {error}</div>}
      </div>
    </div>
  );
}