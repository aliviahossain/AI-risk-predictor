import { useState, useMemo } from "react";
import VolcanoPlot    from "../components/VolcanoPlot";
import GeneTable      from "../components/GeneTable";
import DownloadButton from "../components/DownloadButton";
import MAPlot         from "../components/MAPlot";
import TopGenesChart  from "../components/TopGenesChart";
import { getSummary, getDataRange } from "../utils/parseCSV";
import "./ResultsPage.css";

const TABS = [
  { id:"volcano",  label:"🌋 Volcano Plot" },
  { id:"ma",       label:"📈 MA Plot" },
  { id:"topgenes", label:"🏆 Top Genes" },
  { id:"table",    label:"🗂 Gene Table" },
  { id:"summary",  label:"📋 Summary" },
];

export default function ResultsPage({ genes, filename, onReset }) {
  const range = useMemo(() => {
    try { return getDataRange(genes); }
    catch { return { fcMin:0, fcMax:0, fcAbsMax:1, negLogMax:5, suggestedFC:0.1, suggestedP:0.05 }; }
  }, [genes]);

  const [tab,         setTab]         = useState("volcano");
  const [fcThreshold, setFcThreshold] = useState(() => range.suggestedFC || 0.1);
  const [pThreshold,  setPThreshold]  = useState(() => range.suggestedP  || 0.05);

  const summary = useMemo(() => {
    try { return getSummary(genes, fcThreshold, pThreshold); }
    catch { return { total: genes.length, up: 0, down: 0, ns: genes.length }; }
  }, [genes, fcThreshold, pThreshold]);

  const fcMax = range.fcAbsMax > 0 ? parseFloat((range.fcAbsMax * 0.95).toFixed(3)) : 2;

  return (
    <div className="rp-root">
      <header className="rp-header">
        <div className="rp-logo">
          <span className="rp-logo-icon">🧬</span>
          <div>
            <div className="rp-logo-title">DEG Analysis Viewer</div>
            <div className="rp-logo-file">{filename}</div>
          </div>
        </div>
        <button className="rp-reset" onClick={onReset}>↩ New file</button>
      </header>

      <main className="rp-main">
        {/* Summary cards */}
        <div className="rp-cards">
          {[
            { label:"Total Genes",      value:summary.total, accent:"#6366f1", bg:"#eef2ff" },
            { label:"↑ Upregulated",    value:summary.up,    accent:"#ef4444", bg:"#fef2f2" },
            { label:"↓ Downregulated",  value:summary.down,  accent:"#3b82f6", bg:"#eff6ff" },
            { label:"— Not Significant",value:summary.ns,    accent:"#6b7280", bg:"#f9fafb" },
          ].map((c) => (
            <div key={c.label} className="rp-card" style={{background:c.bg, borderColor:c.accent+"33"}}>
              <div className="rp-card-val" style={{color:c.accent}}>{c.value.toLocaleString()}</div>
              <div className="rp-card-lbl">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="rp-controls">
          <div className="rp-threshold">
            <label>
              FC Threshold <strong style={{color:"#6366f1"}}>±{fcThreshold}</strong>
              <span className="rp-range-hint"> max {fcMax}</span>
            </label>
            <input type="range" className="rp-slider"
              min={0.01} max={fcMax} step={0.01}
              value={fcThreshold}
              onChange={(e) => setFcThreshold(parseFloat(e.target.value))}
            />
          </div>
          <div className="rp-threshold">
            <label>
              adj.P Threshold <strong style={{color:"#6366f1"}}>{pThreshold}</strong>
            </label>
            <input type="range" className="rp-slider"
              min={0.001} max={0.99} step={0.001}
              value={pThreshold}
              onChange={(e) => setPThreshold(parseFloat(e.target.value))}
            />
          </div>
          <DownloadButton genes={genes} filename={filename.replace(".csv","")}
            fcThreshold={fcThreshold} pThreshold={pThreshold} />
        </div>

        {/* Tabs */}
        <div className="rp-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`rp-tab ${tab===t.id?"active":""}`}
              onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* Panel */}
        <div className="rp-panel">
          {tab === "volcano" && (
            <>
              <h2 className="rp-panel-title">Volcano Plot</h2>
              <p className="rp-panel-sub">Each dot is a gene. Hover for details. Top significant genes are labeled.</p>
              <VolcanoPlot genes={genes} fcThreshold={fcThreshold} pThreshold={pThreshold} />
            </>
          )}
          {tab === "ma" && (
            <>
              <h2 className="rp-panel-title">MA Plot</h2>
              <p className="rp-panel-sub">Mean expression (x) vs log fold change (y).</p>
              <MAPlot genes={genes} fcThreshold={fcThreshold} pThreshold={pThreshold} />
            </>
          )}
          {tab === "topgenes" && (
            <>
              <h2 className="rp-panel-title">Top Differentially Expressed Genes</h2>
              <p className="rp-panel-sub">Top 20 genes ranked by adjusted p-value.</p>
              <TopGenesChart genes={genes} fcThreshold={fcThreshold} pThreshold={pThreshold} />
            </>
          )}
          {tab === "table" && (
            <>
              <h2 className="rp-panel-title">Gene Expression Table</h2>
              <p className="rp-panel-sub">Search, filter, and sort all {genes.length.toLocaleString()} genes.</p>
              <GeneTable genes={genes} fcThreshold={fcThreshold} pThreshold={pThreshold} />
            </>
          )}
          {tab === "summary" && (
            <>
              <h2 className="rp-panel-title">Analysis Summary</h2>
              <div className="rp-summary">
                {[
                  ["File",             filename],
                  ["Total genes",      summary.total.toLocaleString()],
                  ["FC threshold",     `±${fcThreshold}`],
                  ["adj.P threshold",  pThreshold],
                  ["logFC range",      `${range.fcMin.toFixed(3)} to ${range.fcMax.toFixed(3)}`],
                  ["Upregulated",      summary.up.toLocaleString()],
                  ["Downregulated",    summary.down.toLocaleString()],
                  ["Not significant",  summary.ns.toLocaleString()],
                ].map(([k,v]) => (
                  <div key={k} className="rp-sum-row">
                    <span>{k}</span><strong>{v}</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}