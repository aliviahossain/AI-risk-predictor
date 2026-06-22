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
  { id:"ma",       label:"📈 MA Plot"      },
  { id:"topgenes", label:"🏆 Top Genes"    },
  { id:"table",    label:"🗂 Gene Table"   },
  { id:"summary",  label:"📋 Summary"      },
];

// Standard scientific P thresholds only
const P_OPTIONS = [0.001, 0.01, 0.05];

export default function ResultsPage({ genes, filename, onReset }) {
  const range = useMemo(() => {
    try { return getDataRange(genes); }
    catch { return { fcMin:-1, fcMax:1, fcAbsMax:1, negLogMax:5, suggestedFC:0, suggestedP:0.05 }; }
  }, [genes]);

  const [tab,         setTab]         = useState("volcano");
  const [fcThreshold, setFcThreshold] = useState(0);      // 0 = no FC filter
  const [pThreshold,  setPThreshold]  = useState(0.05);
  const [pValueType,  setPValueType]  = useState("adj");  // "adj" = FDR, "raw" = P.Value

  const summary = useMemo(() => {
    try { return getSummary(genes, fcThreshold, pThreshold, pValueType); }
    catch { return { total: genes.length, up:0, down:0, ns: genes.length }; }
  }, [genes, fcThreshold, pThreshold, pValueType]);

  const fcMax = range.fcAbsMax > 0
    ? parseFloat((range.fcAbsMax).toFixed(2))
    : 2;

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
            { label:"Total Genes",       value:summary.total, accent:"#6366f1", bg:"#eef2ff" },
            { label:"↑ Upregulated",     value:summary.up,    accent:"#ef4444", bg:"#fef2f2" },
            { label:"↓ Downregulated",   value:summary.down,  accent:"#3b82f6", bg:"#eff6ff" },
            { label:"— Not Significant", value:summary.ns,    accent:"#6b7280", bg:"#f9fafb" },
          ].map((c) => (
            <div key={c.label} className="rp-card"
              style={{background:c.bg, borderColor:c.accent+"33"}}>
              <div className="rp-card-val" style={{color:c.accent}}>
                {c.value.toLocaleString()}
              </div>
              <div className="rp-card-lbl">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="rp-controls">

          {/* FC threshold slider — starts at 0 */}
          <div className="rp-threshold">
            <label>
              FC Threshold
              <strong style={{color:"#6366f1"}}>
                {fcThreshold === 0 ? " None (show all)" : ` ±${fcThreshold}`}
              </strong>
              <span className="rp-range-hint"> logFC range: {range.fcMin.toFixed(2)} to {range.fcMax.toFixed(2)}</span>
            </label>
            <input type="range" className="rp-slider"
              min={0} max={fcMax} step={0.01}
              value={fcThreshold}
              onChange={(e) => setFcThreshold(parseFloat(e.target.value))}
            />
            <div className="rp-slider-labels">
              <span>None</span>
              <span>{(fcMax/2).toFixed(1)}</span>
              <span>{fcMax}</span>
            </div>
          </div>

          {/* P threshold — type toggle + fixed scientific buttons */}
          <div className="rp-threshold">
            <label>
              {pValueType === "adj" ? "adj.P.Val (FDR)" : "P.Value (raw)"}
              <strong style={{color:"#6366f1"}}> {pThreshold}</strong>
            </label>
            {/* raw vs adj toggle */}
            <div className="rp-p-btns" style={{marginBottom:8}}>
              {[["adj","adj.P.Val (FDR)"],["raw","P.Value (raw)"]].map(([v,lbl]) => (
                <button key={v}
                  className={`rp-p-btn ${pValueType===v?"active":""}`}
                  onClick={() => setPValueType(v)}>
                  {lbl}
                </button>
              ))}
            </div>
            <div className="rp-p-btns">
              {P_OPTIONS.map((p) => (
                <button key={p}
                  className={`rp-p-btn ${pThreshold===p?"active":""}`}
                  onClick={() => setPThreshold(p)}>
                  {p}
                </button>
              ))}
            </div>
            <p className="rp-p-note">
              {pValueType === "adj"
                ? "FDR-corrected · 0.05 = 5% · 0.01 = 1% · 0.001 = 0.1%"
                : "Raw p-value · use adj.P.Val for publication-quality results"}
            </p>
          </div>

          <DownloadButton genes={genes}
            filename={filename.replace(".csv","")}
            fcThreshold={fcThreshold}
            pThreshold={pThreshold}
            pValueType={pValueType} />
        </div>

        {/* Sig count banner */}
        <div className="rp-sig-banner">
          <span className="rp-sig-total">
            {(summary.up + summary.down).toLocaleString()} significant genes
          </span>
          <span className="rp-sig-up">↑ {summary.up.toLocaleString()} up</span>
          <span className="rp-sig-dn">↓ {summary.down.toLocaleString()} down</span>
          <span className="rp-sig-p">
            {pValueType === "adj" ? "adj.P" : "P.Value"} &lt; {pThreshold}
          </span>
          {fcThreshold > 0 && (
            <span className="rp-sig-fc">|logFC| &gt; {fcThreshold}</span>
          )}
        </div>

        {/* Tabs */}
        <div className="rp-tabs">
          {TABS.map((t) => (
            <button key={t.id}
              className={`rp-tab ${tab===t.id?"active":""}`}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div className="rp-panel">
          {tab === "volcano" && (
            <>
              <h2 className="rp-panel-title">Volcano Plot</h2>
              <p className="rp-panel-sub">
                Each dot = one gene. Colored dots = significant at{" "}
                {pValueType === "adj" ? "adj.P" : "P.Value"} &lt; {pThreshold}
                {fcThreshold > 0 ? ` and |logFC| > ${fcThreshold}` : ""}.
                Hover for details.
              </p>
              <VolcanoPlot genes={genes} fcThreshold={fcThreshold} pThreshold={pThreshold} pValueType={pValueType} />
            </>
          )}
          {tab === "ma" && (
            <>
              <h2 className="rp-panel-title">MA Plot</h2>
              <p className="rp-panel-sub">Mean expression (x) vs log₂ fold change (y).</p>
              <MAPlot genes={genes} fcThreshold={fcThreshold} pThreshold={pThreshold} pValueType={pValueType} />
            </>
          )}
          {tab === "topgenes" && (
            <>
              <h2 className="rp-panel-title">Top Differentially Expressed Genes</h2>
              <p className="rp-panel-sub">
                Ranked by {pValueType === "adj" ? "adjusted p-value" : "raw p-value"}. Red = up, blue = down.
              </p>
              <TopGenesChart genes={genes} fcThreshold={fcThreshold} pThreshold={pThreshold} pValueType={pValueType} />
            </>
          )}
          {tab === "table" && (
            <>
              <h2 className="rp-panel-title">Gene Expression Table</h2>
              <p className="rp-panel-sub">All {genes.length.toLocaleString()} genes · search, filter and sort.</p>
              <GeneTable genes={genes} fcThreshold={fcThreshold} pThreshold={pThreshold} pValueType={pValueType} />
            </>
          )}
          {tab === "summary" && (
            <>
              <h2 className="rp-panel-title">Analysis Summary</h2>
              <div className="rp-summary">
                {[
                  ["File",             filename],
                  ["Total genes",      summary.total.toLocaleString()],
                  ["FC threshold",   fcThreshold===0 ? "None" : `±${fcThreshold}`],
                  ["P-value type",   pValueType === "adj" ? "adj.P.Val (FDR)" : "P.Value (raw)"],
                  ["P threshold",    pThreshold],
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
              {summary.up === 0 && summary.down === 0 && (
                <div className="rp-no-sig">
                  <div className="rp-no-sig-icon">ℹ️</div>
                  <div>
                    <strong>No significant genes at current thresholds</strong>
                    <p>
                      No genes pass {pValueType === "adj" ? "adj.P.Val" : "P.Value"} &lt; {pThreshold}
                      {fcThreshold > 0 ? ` and |logFC| > ${fcThreshold}` : ""}.
                      Try: set FC threshold to <b>None</b>, p-value to <b>0.05</b>,
                      or switch to <b>P.Value (raw)</b>.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}