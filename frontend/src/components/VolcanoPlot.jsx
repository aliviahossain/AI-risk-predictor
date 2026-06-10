import { useMemo } from "react";
import { classifyGene } from "../utils/parseCSV";

const W=700, H=440, PAD={top:30,right:30,bottom:54,left:60};
const PW=W-PAD.left-PAD.right, PH=H-PAD.top-PAD.bottom;
const C={ up:"#ef4444", down:"#3b82f6", ns:"#d1d5db" };

// Safe min/max — no spread operator
function arrMin(arr) {
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i];
  return m;
}
function arrMax(arr) {
  let m = arr[0];
  for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}

export default function VolcanoPlot({ genes, fcThreshold=0.1, pThreshold=0.05 }) {
  const data = useMemo(() => {
    if (!genes?.length) return null;
    const eps = 1e-300;

    const logFCs = [], negLogs = [];
    for (let i = 0; i < genes.length; i++) {
      const fc = genes[i].logFC;
      const p  = genes[i].adjPVal;
      if (isFinite(fc)) logFCs.push(fc);
      const nl = -Math.log10(p > 0 ? p : eps);
      if (isFinite(nl)) negLogs.push(nl);
    }
    if (!logFCs.length) return null;

    const xPad  = (arrMax(logFCs) - arrMin(logFCs)) * 0.1;
    const xMin  = arrMin(logFCs) - xPad;
    const xMax  = arrMax(logFCs) + xPad;
    const yMax  = arrMax(negLogs) * 1.1 || 5;

    const sx = (v) => ((v - xMin) / (xMax - xMin)) * PW;
    const sy = (v) => PH - (v / yMax) * PH;
    const pLine = -Math.log10(pThreshold);

    // Classify and compute positions
    const ns_pts = [], sig_pts = [];
    for (let i = 0; i < genes.length; i++) {
      const g    = genes[i];
      const type = classifyGene(g, fcThreshold, pThreshold);
      const nl   = -Math.log10(g.adjPVal > 0 ? g.adjPVal : eps);
      const pt   = { geneSymbol: g.geneSymbol, logFC: g.logFC, adjPVal: g.adjPVal,
                     cx: sx(g.logFC), cy: sy(nl), type, nl };
      if (type === "ns") ns_pts.push(pt);
      else               sig_pts.push(pt);
    }

    // For NS points: sample max 1500 to keep SVG fast
    const MAX_NS = 1500;
    const ns_display = ns_pts.length > MAX_NS
      ? ns_pts.filter((_, i) => i % Math.ceil(ns_pts.length / MAX_NS) === 0)
      : ns_pts;

    // Top labeled
    const labeled = [...sig_pts].sort((a, b) => b.nl - a.nl).slice(0, 8);

    const xStep  = (xMax - xMin) / 6;
    const xTicks = Array.from({length:7}, (_,i) => ({ v: xMin+i*xStep, x: sx(xMin+i*xStep) }));
    const yStep  = yMax / 5;
    const yTicks = Array.from({length:6}, (_,i) => ({ v: i*yStep, y: sy(i*yStep) }));

    return { ns_display, sig_pts, labeled, pLine, sx, sy, xTicks, yTicks };
  }, [genes, fcThreshold, pThreshold]);

  if (!data) return <p style={{color:"#9ca3af",textAlign:"center",padding:40}}>No data to display</p>;
  const { ns_display, sig_pts, labeled, pLine, sx, sy, xTicks, yTicks } = data;

  return (
    <div style={{width:"100%", overflowX:"auto"}}>
      <svg viewBox={`0 0 ${W} ${H}`}
        style={{width:"100%",maxWidth:W,display:"block",margin:"0 auto",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          <rect x={0} y={0} width={PW} height={PH} fill="#fafafa" rx={6} stroke="#e5e7eb"/>

          {yTicks.map((t) => (
            <line key={t.v} x1={0} y1={t.y} x2={PW} y2={t.y} stroke="#f3f4f6" strokeWidth={1}/>
          ))}

          {/* Threshold lines */}
          <line x1={0} y1={sy(pLine)} x2={PW} y2={sy(pLine)}
            stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6,4"/>
          <text x={PW-6} y={sy(pLine)-5} fill="#f59e0b" fontSize={9} textAnchor="end" fontWeight="600">
            p={pThreshold}
          </text>
          {[-fcThreshold, fcThreshold].map((fc) => (
            <line key={fc} x1={sx(fc)} y1={0} x2={sx(fc)} y2={PH}
              stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6,4"/>
          ))}

          {/* NS points (sampled) */}
          {ns_display.map((p, i) => (
            <circle key={i} cx={p.cx} cy={p.cy} r={2.5} fill={C.ns} opacity={0.4}>
              <title>{`${p.geneSymbol}\nlogFC: ${p.logFC.toFixed(3)}\nadj.P: ${p.adjPVal.toExponential(2)}`}</title>
            </circle>
          ))}

          {/* Significant points */}
          {sig_pts.map((p, i) => (
            <circle key={i} cx={p.cx} cy={p.cy} r={4.5}
              fill={C[p.type]} opacity={0.85} stroke="#fff" strokeWidth={0.5}>
              <title>{`${p.geneSymbol}\nlogFC: ${p.logFC.toFixed(3)}\nadj.P: ${p.adjPVal.toExponential(2)}`}</title>
            </circle>
          ))}

          {/* Labels */}
          {labeled.map((p, i) => (
            <g key={i}>
              <line x1={p.cx} y1={p.cy-5} x2={p.cx} y2={p.cy-15} stroke={C[p.type]} strokeWidth={1}/>
              <text x={p.cx} y={p.cy-17} fill={C[p.type]} fontSize={9} fontWeight="700"
                textAnchor="middle" fontFamily="'JetBrains Mono',monospace">
                {p.geneSymbol}
              </text>
            </g>
          ))}

          {/* X axis */}
          <line x1={0} y1={PH} x2={PW} y2={PH} stroke="#d1d5db"/>
          {xTicks.map((t) => (
            <g key={t.v}>
              <line x1={t.x} y1={PH} x2={t.x} y2={PH+4} stroke="#d1d5db"/>
              <text x={t.x} y={PH+14} fill="#9ca3af" fontSize={9} textAnchor="middle">
                {t.v.toFixed(2)}
              </text>
            </g>
          ))}
          <text x={PW/2} y={PH+36} fill="#6b7280" fontSize={11} textAnchor="middle" fontWeight="600">
            log₂ Fold Change
          </text>

          {/* Y axis */}
          <line x1={0} y1={0} x2={0} y2={PH} stroke="#d1d5db"/>
          {yTicks.map((t) => (
            <g key={t.v}>
              <line x1={-4} y1={t.y} x2={0} y2={t.y} stroke="#d1d5db"/>
              <text x={-8} y={t.y+3} fill="#9ca3af" fontSize={9} textAnchor="end">
                {t.v.toFixed(1)}
              </text>
            </g>
          ))}
          <text transform={`translate(-44,${PH/2}) rotate(-90)`}
            fill="#6b7280" fontSize={11} textAnchor="middle" fontWeight="600">
            -log₁₀(adj.P)
          </text>

          {/* Legend */}
          {[["up","#ef4444","Upregulated"],["down","#3b82f6","Downregulated"],["ns","#d1d5db","Not Significant"]].map(([,col,lbl],i)=>(
            <g key={lbl} transform={`translate(${PW-148},${10+i*18})`}>
              <circle cx={6} cy={6} r={5} fill={col}/>
              <text x={16} y={10} fill="#374151" fontSize={10}>{lbl}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}