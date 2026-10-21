import { useState } from "react";
import { parseCSV } from "../utils/parseCSV";
import RawUploadForm from "../components/RawUploadForm";
import { API } from "../config";
import { ROUTES } from "../components/SiteChrome";
import HeroBackdrop from "../components/HeroBackdrop";
import "./UploadPage.css";

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

const MODES = [
  { id:"csv", label:"DEG results", hint:"limma / edgeR / DESeq2 table",
    icon:<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" /> },
  { id:"raw", label:"Raw expression file", hint:"Counts or microarray matrix",
    icon:<path d="M12 16V4M7 9l5-5 5 5M5 20h14" /> },
  { id:"geo", label:"GEO accession", hint:"Fetch and analyse from NCBI",
    icon:<path d="M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /> },
];

const FEATURES = [
  { title:"Volcano & MA plots",    body:"Interactive plots that update as you tune fold-change and FDR thresholds." },
  { title:"limma · voom pipeline", body:"TMM normalization, precision weights, empirical Bayes, BH-adjusted p-values." },
  { title:"Direct GEO access",     body:"Enter a GSE accession and the pipeline downloads and groups samples for you." },
  { title:"Export-ready output",   body:"Filtered gene tables as CSV and heatmaps as PNG, ready for your manuscript." },
];

const HOW_STEPS = [
  ["Choose your input",   "A finished DEG table, a raw expression matrix, or a public GEO series."],
  ["Run the pipeline",    "Filtering, normalization and linear modelling run in R on the server, with live progress."],
  ["Explore the results", "Filter, sort and visualize significant genes, then export what you need."],
];

const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

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
      if (data.cached) {
        // Server already has results for this accession: skip polling entirely.
        setJobStep("Complete"); setJobStatus("done"); setLoading(false);
        await loadGeoResults(data.job_id, gid);
      } else {
        pollJob(data.job_id, gid);
      }
    } catch (e) { setError(e.message); setLoading(false); setJobStatus(""); }
  };

  const loadGeoResults = async (jid, gid) => {
    const csvRes = await fetch(`${API}/geo/download/${jid}`);
    if (!csvRes.ok) throw new Error("Could not download pipeline results (HTTP " + csvRes.status + ")");
    const genes = parseCSV(await csvRes.text());
    if (genes.length === 0) throw new Error("Pipeline produced no valid genes — check the log above.");
    onDataLoaded(genes, `${gid}_DEGs_Full.csv`, jid);
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
          await loadGeoResults(jid, gid);
        }
        if (data.status === "error") { clearInterval(iv); setLoading(false); setError("Pipeline error: "+(data.errors?.[0]||"Unknown")); }
      } catch (e) { clearInterval(iv); setLoading(false); setError(e.message || "Network error while polling pipeline."); }
    }, 2500);
  };

  const stepIdx     = STEPS.indexOf(jobStep);
  const filteredGEO = filterTag==="All" ? GEO_SUGGESTIONS : GEO_SUGGESTIONS.filter(g=>g.tag===filterTag);

  return (
    <main className="up-root">
      {/* ── Hero ── */}
      <section className="up-hero">
        <HeroBackdrop />
        <div className="up-hero-inner">
          <p className="up-eyebrow">Gene expression analysis</p>
          <h1 className="up-title">Differential expression analysis for public and in-house transcriptomic data</h1>
          <p className="up-sub">
            Run a limma / voom pipeline on public GEO series or your own data,
            then explore results with interactive volcano plots, MA plots and gene tables.
          </p>
          <div className="up-hero-meta">
            <span>limma · voom</span><span>NCBI GEO</span><span>No account required</span>
          </div>
        </div>
      </section>

      {/* ── Analysis workspace ── */}
      <section className="up-workspace" id="analyze">
        <div className="up-panel">
          <div className="up-panel-head">
            <h2 className="up-panel-title">Start an analysis</h2>
            <p className="up-panel-sub">Choose how you want to provide your data.</p>
          </div>

          <div className="up-modes" role="tablist">
            {MODES.map(m => (
              <button key={m.id} role="tab" aria-selected={mode===m.id}
                className={`up-mode ${mode===m.id?"active":""}`}
                onClick={()=>{setMode(m.id);setError("");}}>
                <span className="up-mode-icon"><Icon>{m.icon}</Icon></span>
                <span className="up-mode-text">
                  <span className="up-mode-label">{m.label}</span>
                  <span className="up-mode-hint">{m.hint}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="up-panel-body">
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
                    <>
                      <div className="up-drop-icon"><Icon><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></Icon></div>
                      <p className="up-main">Drop your DEG results file here</p>
                      <p className="up-hint">.csv or .tsv · limma, edgeR or DESeq2 output</p>
                      <span className="sc-btn sc-btn-outline">Browse files</span>
                    </>
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
                  Upload a raw expression file directly: a counts matrix, a microarray matrix, or a compressed archive.
                  The pipeline runs the DEG analysis on it without downloading anything from GEO.
                </p>
                <RawUploadForm onAnalysisComplete={onDataLoaded} />
              </div>
            )}

            {/* ── GEO ID mode ── */}
            {mode==="geo" && (
              <div className="up-geo-section">
                <div className="up-geo-input-box">
                  <label className="up-geo-label" htmlFor="geo-id">GEO series accession</label>
                  <div className="up-geo-row">
                    <input id="geo-id" value={geoId} onChange={e=>setGeoId(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&!loading&&runGeoPipeline()}
                      placeholder="e.g. GSE280402" className="up-geo-input" disabled={loading}/>
                    <button onClick={()=>runGeoPipeline()} disabled={loading||!geoId.trim()} className="sc-btn sc-btn-primary up-geo-run">
                      {loading?<><span className="up-btn-spin"/>Running…</>:"Run pipeline"}
                    </button>
                  </div>
                  <p className="up-geo-hint">Downloads raw data from NCBI GEO → runs limma / voom → loads results</p>
                </div>

                <div className="up-divider"><span>or start from a curated dataset</span></div>

                <div className="up-tag-filter">
                  {["All","T2D","Cancer"].map(t=>(
                    <button key={t} className={`up-tag-btn ${filterTag===t?"active":""}`} onClick={()=>setFilterTag(t)}>
                      {t==="All"?"All datasets":t==="T2D"?"Type 2 diabetes":"Cancer"}
                    </button>
                  ))}
                </div>

                <div className="up-geo-grid">
                  {filteredGEO.map(g=>{
                    const isSelected = geoId===g.id;
                    return (
                      <div key={g.id} className={`up-geo-card ${isSelected?"selected":""} ${loading?"disabled":""}`}
                        onClick={()=>{ if(!loading){ setGeoId(g.id); setError(""); } }}>
                        <div className="up-card-top">
                          <span className="up-card-id">{g.id}</span>
                          <span className={`up-card-tag ${g.tag==="T2D"?"t2d":"cancer"}`}>{g.tag}</span>
                        </div>
                        <div className="up-card-label">{g.label}</div>
                        <div className="up-card-desc">{g.desc}</div>
                        {isSelected && (
                          <button className="sc-btn sc-btn-primary sc-btn-block up-card-run-btn"
                            onClick={e=>{e.stopPropagation();runGeoPipeline(g.id);}} disabled={loading}>
                            Run this dataset
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {jobId && (
                  <div className="up-progress">
                    <div className="up-progress-header">
                      <span className="up-progress-title">Pipeline: {geoId}</span>
                      <span className={`up-status-pill ${jobStatus}`}>
                        {jobStatus==="done"?"Complete":jobStatus==="error"?"Error":"Running"}
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

            {error && <div className="up-err" role="alert">{error}</div>}
          </div>
        </div>
      </section>

      {/* ── Capabilities ── */}
      <section className="up-section">
        <div className="up-container">
                    <h2 className="up-h2">Features</h2>
          <div className="up-features">
            {FEATURES.map(f=>(
              <article key={f.title} className="up-feature">
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="up-section up-section-alt">
        <div className="up-container">
                    <h2 className="up-h2">Workflow</h2>
          <ol className="up-how">
            {HOW_STEPS.map(([title, body], i)=>(
              <li key={title}>
                <span className="up-how-num">{i+1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Newsletter band ── */}
      <section className="up-band">
        <div className="up-container up-band-inner">
          <div>
            <h2>Updates at your fingertips, soon</h2>
            <p>Our newsletter for researchers working with expression data is on its way.</p>
          </div>
          <div className="up-band-actions">
            <a href={ROUTES.newsletter} className="sc-btn sc-btn-primary">Newsletter (coming soon)</a>
            <a href={ROUTES.about} className="sc-btn sc-btn-ghost">Learn more</a>
          </div>
        </div>
      </section>
    </main>
  );
}

