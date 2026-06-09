import { useState, useMemo } from "react";
import VolcanoPlot    from "../components/VolcanoPlot";
import GeneTable      from "../components/GeneTable";
import DownloadButton from "../components/DownloadButton";
import MAPlot         from "../components/MAPlot";
import TopGenesChart  from "../components/TopGenesChart";
import { getSummary, getDataRange } from "../utils/parseCSV";
import "./ResultsPage.css";

const TABS = [
  { id: "volcano",  label: "🌋 Volcano Plot" },
  { id: "ma",       label: "📈 MA Plot" },
  { id: "topgenes", label: "🏆 Top Genes" },
  { id: "table",    label: "🗂 Gene Table" },
  { id: "summary",  label: "📋 Summary" },
];

export default function ResultsPage({ genes, filename, onReset }) {
  const range = useMemo(() => getDataRange(genes), [genes]);

  const [tab,         setTab]         = useState("volcano");
  const [fcThreshold, setFcThreshold] = useState(range.suggestedFC);
  const [pThreshold,  setPThreshold]  = useState(0.05);

  const summary = useMemo(
    () => getSummary(genes, fcThreshold, pThreshold),
    [genes, fcThreshold, pThreshold]
  );

  return (
    <div className="rp-root">
      {/* Header */}
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
            { label: "Total Genes",     value: summary.total, accent: "#6366f1", bg: "#eef2ff" },
            { label: "↑ Upregulated",   value: summary.up,    accent: "#ef4444", bg: "#fef2f2" },
            { label: "↓ Downregulated", value: summary.down,  accent: "#3b82f6", bg: "#eff6ff" },
            { label: "— Not Significant",value: summary.ns,   accent: "#6b7280", bg: "#f9fafb" },
          ].map((c) => (
            <div key={c.label} className="rp-card" style={{ background: c.bg, borderColor: c.accent + "33" }}>
              <div className="rp-card-val" style={{ color: c.accent }}>{c.value.toLocaleString()}</div>
              <div className="rp-card-lbl">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="rp-controls">
          <div className="rp-threshold">
            <label>
              FC Threshold
              <strong style={{ color: "#6366f1" }}> ±{fcThreshold}</strong>
              <span className="rp-range-hint">range: 0.01 – {(range.fcAbsMax * 0.9).toFixed(2)}</span>
            </label>
            <input type="range"
              min={0.01} max={(range.fcAbsMax * 0.9).toFixed(2)} step={0.01}
              value={fcThreshold}
              onChange={(e) => setFcThreshold(parseFloat(e.target.value))}
              className="rp-slider"
            />
          </div>
          <div className="rp-threshold">
            <label>
              adj. P Threshold
              <strong style={{ color: "#6366f1" }}> {pThreshold}</strong>
            </label>
            <input type="range"
              min={0.001} max={0.1} step={0.001}
              value={pThreshold}
              onChange={(e) => setPThreshold(parseFloat(e.target.value))}
              className="rp-slider"
            />
          </div>
          <DownloadButton genes={genes} filename={filename.replace(".csv","")} fcThreshold={fcThreshold} pThreshold={pThreshold} />
        </div>

        {/* Tabs */}
        <div className="rp-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`rp-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >{t.label}</button>
          ))}
        </div>

        {/* Tab panels */}
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
              <p className="rp-panel-sub">Mean expression (x) vs log fold change (y). Highlights differential expression across expression levels.</p>
              <MAPlot genes={genes} fcThreshold={fcThreshold} pThreshold={pThreshold} />
            </>
          )}
          {tab === "topgenes" && (
            <>
              <h2 className="rp-panel-title">Top Differentially Expressed Genes</h2>
              <p className="rp-panel-sub">Top 20 genes ranked by adjusted p-value, colored by direction of change.</p>
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
                  ["File analyzed",       filename],
                  ["Total genes",         summary.total.toLocaleString()],
                  ["FC threshold",        `±${fcThreshold}`],
                  ["adj. P threshold",    pThreshold],
                  ["logFC range",         `${range.fcMin.toFixed(3)} to ${range.fcMax.toFixed(3)}`],
                  ["Upregulated genes",   summary.up],
                  ["Downregulated genes", summary.down],
                  ["Not significant",     summary.ns.toLocaleString()],
                ].map(([k, v]) => (
                  <div key={k} className="rp-sum-row">
                    <span>{k}</span>
                    <strong>{v}</strong>
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